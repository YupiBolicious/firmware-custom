const coderDashboardRepository = require('../repositories/coderDashboardRepository');

const getCoderDashboard = async (userId, { activityPage = 1, newWoPage = 1, limit = 15, workOrderPage = 1, workOrderSearch = '', workOrderStatus = 'ALL' } = {}) => {
  const WORK_ORDER_LIMIT = 10;
  const [kpis, reviewQueue, workQueue, workOrderQueue, workOrderQueueTotal, coderActivity, coderActivityTotal, newWorkOrders, newWorkOrdersTotal, trend] = await Promise.all([
    coderDashboardRepository.findKpis(userId),
    coderDashboardRepository.findReviewQueue(),
    coderDashboardRepository.findWorkQueue(),
    coderDashboardRepository.findWorkOrderQueue({ page: workOrderPage, limit: WORK_ORDER_LIMIT, search: workOrderSearch, woStatus: workOrderStatus }),
    coderDashboardRepository.countWorkOrderQueue({ search: workOrderSearch, woStatus: workOrderStatus }),
    coderDashboardRepository.findCoderActivity(activityPage, limit),
    coderDashboardRepository.countCoderActivity(),
    coderDashboardRepository.findNewWorkOrders(newWoPage, limit),
    coderDashboardRepository.countNewWorkOrders(),
    coderDashboardRepository.findWeeklyTrend(8),
  ]);

  return {
    kpis: {
      pending_review: Number(kpis.pending_count) || 0,
      pending_hours: Number(kpis.pending_hours) || 0,
      completed: Number(kpis.completed_count) || 0,
      completed_hours: Number(kpis.completed_hours) || 0,
      overdue: Number(kpis.overdue_count) || 0,
    },
    review_queue: reviewQueue.map((r) => ({
      item_id: r.item_id,
      work_order_id: r.work_order_id,
      item_number: r.item_number,
      title: r.title,
      description: r.description,
      quantity: r.quantity,
      wo_number: r.wo_number,
      work_order_title: r.work_order_title,
      classification_reason: r.classification_reason,
      machine_model_code: r.machine_model_code || null,
      machine_model_version: r.machine_model_version || null,
      serial_number: r.serial_number || null, 
      // confidence_score: r.confidence_score != null ? Number(r.confidence_score) : null,
      complexity_code: r.complexity_code || null,
      complexity_name: r.complexity_name || null,
      estimated_hours: Number(r.estimated_hours) || 0,
      status: r.status,
      created_at: r.created_at,
    })),
    work_queue: workQueue.map((r) => ({
      item_id: r.item_id,
      work_order_id: r.work_order_id,
      item_number: r.item_number,
      title: r.title,
      description: r.description || '',
      quantity: r.quantity,
      wo_number: r.wo_number,
      work_order_title: r.work_order_title || '',
      work_order_status: r.work_order_status,
      work_order_created_at: r.work_order_created_at,
      complexity_code: r.complexity_code || null,
      complexity_name: r.complexity_name || null,
      classification_status: r.classification_status,
      machine_model_code: r.machine_model_code || null,
      machine_model_version: r.machine_model_version || null,
      serial_number: r.serial_number || null,
      // confidence_score: r.confidence_score != null ? Number(r.confidence_score) : null,
      estimated_hours: Number(r.estimated_hours) || 0,
      created_at: r.classification_created_at,
    })),
    work_order_queue: {
      items: workOrderQueue.map((r) => ({
        id: r.id,
        wo_number: r.wo_number,
        title: r.title || '',
        customer: r.customer || '',
        status: r.status,
        item_count: Number(r.item_count) || 0,
        open_count: Number(r.open_count) || 0,
        done_count: Number(r.done_count) || 0,
        total_hours: Number(r.total_hours) || 0,
        last_activity: r.last_activity,
      })),
      page: workOrderPage,
      limit: WORK_ORDER_LIMIT,
      total: Number(workOrderQueueTotal) || 0,
    },
    workload: {
      queued_hours: Number(kpis.pending_hours) || 0,
      in_progress_hours: workQueue
        .filter((r) => r.work_order_status !== 'FINALIZED')
        .reduce((sum, r) => sum + (Number(r.estimated_hours) || 0), 0),
      completed_hours: Number(kpis.completed_hours) || 0,
    },
    coder_activity: {
      items: coderActivity.map((r) => ({
        id: r.id,
        action: r.action,
        entity_type: r.entity_type,
        entity_id: r.entity_id,
        details: r.details,
        user_name: r.user_name || 'System',
        created_at: r.created_at,
      })),
      page: activityPage,
      limit,
      total: Number(coderActivityTotal) || 0,
    },
    new_work_orders: {
      items: newWorkOrders.map((r) => ({
        id: r.id,
        details: r.details,
        user_name: r.user_name || 'System',
        created_at: r.created_at,
      })),
      page: newWoPage,
      limit,
      total: Number(newWorkOrdersTotal) || 0,
    },
    trend: trend.map((r) => ({
      week: r.week_start,
      items_queued: r.items_queued,
      items_completed: r.items_completed,
      hours_queued: Number(r.hours_queued) || 0,
      hours_completed: Number(r.hours_completed) || 0,
    })),
  };
};

module.exports = { getCoderDashboard };
