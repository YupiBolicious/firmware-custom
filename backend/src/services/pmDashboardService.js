const pmDashboardRepository = require('../repositories/pmDashboardRepository');
const { validatePagination, paginatedPayload } = require('../utils/pagination');
const { assertOptionalDate } = require('../utils/validation');

// Rolling ~3-month operational window: applied as the default created_at floor
// for every filtered PM panel (KPIs, queue, attention, status, options, trend)
// when the user sets neither From nor To. Older records stay queryable via an
// explicit date range; setting either bound disables the floor.
const DEFAULT_TREND_DAYS = 90;

const rollingDefaultFrom = () => {
  const d = new Date();
  d.setDate(d.getDate() - DEFAULT_TREND_DAYS);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};

const parseFilters = (q) => ({
  search: q.search || '',
  status: q.status || '',
  model: q.model || '',
  version: q.version || '',
  complexity: q.complexity || '',
  fw_related: q.fw_related || '',
  date_from: q.date_from || (q.date_to ? '' : rollingDefaultFrom()),
  date_to: q.date_to || '',
});

const formatLocalDate = (d) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const weekStart = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - x.getDay());
  return x;
};

const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

// Chart 1: buckets over the global From/To window (rolling 90 days when the
// filter is empty). Daily when the window spans <= 45 days, otherwise
// Sunday-start weeks (the SQL convention). Missing buckets stay zeroed.
const buildTrend = (rows, filters) => {
  const byDay = new Map(rows.map((r) => [formatLocalDate(new Date(r.week_start)), r]));
  const pick = (r) => ({
    hours_queued: r ? Number(r.hours_queued) || 0 : 0,
    hours_in_progress: r ? Number(r.hours_in_progress) || 0 : 0,
    hours_completed: r ? Number(r.hours_completed) || 0 : 0,
  });
  const sorted = rows.map((r) => new Date(r.week_start)).sort((a, b) => a - b);
  if (sorted.length === 0 && !filters.date_from) return { buckets: [], unit: 'day' };

  const fromRaw = filters.date_from ? new Date(`${filters.date_from}T00:00:00`) : (sorted[0] || new Date());
  const toRaw = filters.date_to ? new Date(`${filters.date_to}T00:00:00`) : new Date();
  if (fromRaw > toRaw) return { buckets: [], unit: 'day' };

  const spanDays = Math.round((toRaw - fromRaw) / 86400000);
  const unit = spanDays > 45 ? 'week' : 'day';
  let cur = unit === 'week' ? weekStart(fromRaw) : new Date(fromRaw);

  const buckets = [];
  while (cur <= toRaw) {
    const key = formatLocalDate(cur);
    let agg = { hours_queued: 0, hours_in_progress: 0, hours_completed: 0 };
    if (unit === 'day') {
      agg = pick(byDay.get(key));
    } else {
      for (let i = 0; i < 7; i++) {
        const day = pick(byDay.get(formatLocalDate(addDays(cur, i))));
        agg.hours_queued += day.hours_queued;
        agg.hours_in_progress += day.hours_in_progress;
        agg.hours_completed += day.hours_completed;
      }
    }
    buckets.push({ week: key, ...agg });
    cur = addDays(cur, unit === 'week' ? 7 : 1);
  }
  return {
    buckets,
    unit,
    window: { from: formatLocalDate(fromRaw), to: formatLocalDate(toRaw) },
  };
};

const getPMDashboard = async (query = {}) => {
  const filters = parseFilters(query);
  assertOptionalDate('date_from', filters.date_from);
  assertOptionalDate('date_to', filters.date_to);
  const { page, limit } = validatePagination(query.page, query.limit ?? 10);

  const [kpis, workQueue, attention, statusDistribution, dailyTrend, options] = await Promise.all([
    pmDashboardRepository.findKpis(filters),
    pmDashboardRepository.findWorkQueue({ page, limit, filters }),
    pmDashboardRepository.findAttentionItems(filters),
    pmDashboardRepository.findStatusDistribution(filters),
    pmDashboardRepository.findWeeklyTrend(filters, 'day'),
    pmDashboardRepository.findOptions(filters),
  ]);

  const workQueueItems = workQueue.rows.map((r) => ({
    id: r.id,
    wo_number: r.wo_number,
    title: r.title,
    status: r.status,
    customer: r.customer,
    created_at: r.created_at,
    item_count: r.item_count,
    total_estimated_hours: Number(r.total_estimated_hours) || 0,
    items_classified: r.items_classified,
    progress: r.item_count > 0 ? Math.round((r.items_classified / r.item_count) * 100) : 0,
    group_summary: r.group_summary || '',
    groups: r.groups || [],
    complexity_code: r.complexity_code,
    all_fw_related: r.all_fw_related,
    has_pending_review: r.has_pending_review,
    has_overdue: r.has_overdue,
    item_titles: r.item_titles || [],
    last_activity: r.last_activity,
    updated_at: r.updated_at,
  }));

  const trendData = buildTrend(dailyTrend, filters);

  return {
    kpis: {
      active_wos: Number(kpis.active_wos) || 0,
      pending_review: Number(kpis.pending_review) || 0,
      in_progress: Number(kpis.in_progress) || 0,
      production: Number(kpis.production) || 0,
      completed: Number(kpis.completed) || 0,
      total_estimated_hours: Number(kpis.total_estimated_hours) || 0,
      overdue: Number(kpis.overdue) || 0,
    },
    work_queue: paginatedPayload(workQueueItems, workQueue.total, page, limit),
    attention: attention.map((r) => ({
      wo_number: r.wo_number,
      title: r.title,
      work_order_id: r.work_order_id,
      kind: r.kind,
      priority: r.priority,
      message: r.message,
      age_hours: r.age_hours != null ? Math.round(Number(r.age_hours)) : null,
    })),
    status_distribution: statusDistribution.map((r) => ({
      status: r.status,
      count: r.count,
    })),
    workload: {
      queued: Number(kpis.queued_hours) || 0,
      in_progress: Number(kpis.in_progress_hours) || 0,
      completed: Number(kpis.completed_hours) || 0,
    },
    trend: trendData.buckets,
    trend_unit: trendData.unit,
    trend_window: trendData.window,
    options: {
      models: options.models || [],
      versions: options.versions || [],
      complexities: options.complexities || [],
    },
  };
};

module.exports = { getPMDashboard };