const adminDashboardRepository = require('../repositories/adminDashboardRepository');

function pickGranularity(from, to) {
  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();
  const spanDays = (toMs - fromMs) / 86400000;
  if (spanDays <= 42) return 'day';
  if (spanDays <= 200) return 'week';
  return 'month';
}

const getAdminDashboard = async ({ from, to } = {}) => {
  const granularity = pickGranularity(from, to);
  const [kpis, health, roleRows, inactive, classification, config, trend] = await Promise.all([
    adminDashboardRepository.findKpis(),
    adminDashboardRepository.findHealth(),
    adminDashboardRepository.findUserRoleOverview(),
    adminDashboardRepository.findInactiveUsers(),
    adminDashboardRepository.findClassificationOverview(),
    adminDashboardRepository.findConfigurationCounts(),
    adminDashboardRepository.findActivityTrend(from, to, granularity),
  ]);

  const totalUsers = Number(kpis.total_users) || 0;

  return {
    kpis: {
      total_users: totalUsers,
      active_users: Number(kpis.active_users) || 0,
      total_work_orders: Number(kpis.total_work_orders) || 0,
      total_custom_items: Number(kpis.total_custom_items) || 0,
      fw_related_items: Number(kpis.fw_related_items) || 0,
      pending_coder_reviews: Number(kpis.pending_coder_reviews) || 0,
      kb_entries: Number(kpis.kb_entries) || 0,
      classification_rules: Number(kpis.classification_rules) || 0,
    },
    health: {
      api: 'online',
      database: 'online',
      classification_service: Number(health.active_rules) > 0 ? 'online' : 'warning',
      knowledge_base: Number(health.active_kb_items) > 0 ? 'online' : 'warning',
    },
    users: {
      pm: (roleRows.find((r) => r.code === 'PM') || {}).count || 0,
      coder: (roleRows.find((r) => r.code === 'CODER') || {}).count || 0,
      admin: (roleRows.find((r) => r.code === 'ADMIN') || {}).count || 0,
      inactive: Number(inactive.count) || 0,
      total: totalUsers,
    },
    classification: {
      total_kb_entries: Number(classification.total_kb_entries) || 0,
      coder_confirmed: Number(classification.coder_confirmed) || 0,
      high_confidence: Number(classification.high_confidence) || 0,
      review_cases: Number(classification.review_cases) || 0,
    },
    config: {
      complexity_levels: Number(config.complexity_levels) || 0,
      classification_rules: Number(config.classification_rules) || 0,
      confidence_thresholds: Number(config.confidence_thresholds) || 0,
      fw_modules: Number(config.fw_modules) || 0,
      machine_models: Number(config.machine_models) || 0,
      machine_model_versions: Number(config.machine_model_versions) || 0,
    },
    trend: {
      from,
      to,
      granularity,
      buckets: trend.map((r) => ({
        date: r.date,
        work_orders: r.work_orders,
        kb_added: r.kb_added,
        items_classified: r.items_classified,
        coder_resolved: r.coder_resolved,
      })),
    },
  };
};

module.exports = { getAdminDashboard };