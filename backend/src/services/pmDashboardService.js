const pmDashboardRepository = require('../repositories/pmDashboardRepository');

const getPMDashboard = async () => {
  const [kpis, workQueue, attention, statusDistribution, workload, trend] = await Promise.all([
    pmDashboardRepository.findKpis(),
    pmDashboardRepository.findWorkQueue(),
    pmDashboardRepository.findAttentionItems(),
    pmDashboardRepository.findStatusDistribution(),
    pmDashboardRepository.findWorkloadByStatus(),
    pmDashboardRepository.findWeeklyTrend(8),
  ]);

  return {
    kpis: {
      active_wos: Number(kpis.active_wos) || 0,
      pending_review: Number(kpis.pending_review) || 0,
      in_progress: Number(kpis.in_progress) || 0,
      completed: Number(kpis.completed) || 0,
      total_estimated_hours: Number(kpis.total_estimated_hours) || 0,
      overdue: Number(kpis.overdue) || 0,
    },
    work_queue: workQueue.map((r) => ({
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
    })),
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
      queued: workload
        .filter((r) => r.status === 'DRAFT')
        .reduce((sum, r) => sum + (Number(r.total_hours) || 0), 0),
      in_progress: workload
        .filter((r) => ['ANALYZED', 'FINALIZED', 'PRODUCTION'].includes(r.status))
        .reduce((sum, r) => sum + (Number(r.total_hours) || 0), 0),
      completed: workload
        .filter((r) => r.status === 'COMPLETED')
        .reduce((sum, r) => sum + (Number(r.total_hours) || 0), 0),
    },
    trend: trend.map((r) => ({
      week: r.week_start,
      hours_queued: Number(r.hours_queued) || 0,
      hours_in_progress: Number(r.hours_in_progress) || 0,
      hours_completed: Number(r.hours_completed) || 0,
      items_queued: r.items_queued,
      items_in_progress: r.items_in_progress,
      items_completed: r.items_completed,
    })),
  };
};

module.exports = { getPMDashboard };
