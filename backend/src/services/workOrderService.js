const core = require('./workOrders/core');
const groups = require('./workOrders/groups');
const items = require('./workOrders/items');
const lifecycle = require('./workOrders/lifecycle');
const access = require('./workOrders/access');
const { reviewItem, correctReviewedItem } = require('./reviewService');
const comments = require('./workOrders/comments');

module.exports = {
  listWorkOrders: core.listWorkOrders,
  listCoderReviewQueue: core.listCoderReviewQueue,
  listPendingReviewQueue: core.listPendingReviewQueue,
  reviewItem,
  correctReviewedItem,
  getWorkOrder: core.getWorkOrder,
  createWorkOrder: core.createWorkOrder,
  updateWorkOrder: core.updateWorkOrder,
  updateWorkOrderNotes: core.updateWorkOrderNotes,
  assignWorkOrderCoder: core.assignWorkOrderCoder,
  addGroup: groups.addGroup,
  updateGroup: groups.updateGroup,
  deleteGroup: groups.deleteGroup,
  addItem: items.addItem,
  updateItem: items.updateItem,
  deleteItem: items.deleteItem,
  analyzeWorkOrder: lifecycle.analyzeWorkOrder,
  finalizeWorkOrder: lifecycle.finalizeWorkOrder,
  startProduction: lifecycle.startProduction,
  completeProduction: lifecycle.completeProduction,
  closeWO: lifecycle.closeWorkOrder,
  reopenWO: lifecycle.reopenWorkOrder,
  adminChangeWorkOrderStatus: lifecycle.adminChangeWorkOrderStatus,
  completeProductionTask: lifecycle.completeProductionTask,
  listWorkOrderAccess: access.listWorkOrderAccess,
  grantWorkOrderAccess: access.grantWorkOrderAccess,
  revokeWorkOrderAccess: access.revokeWorkOrderAccess,
  listWorkOrderComments: comments.listWorkOrderComments,
  addWorkOrderComment: comments.addWorkOrderComment,
  deleteWorkOrderComment: comments.deleteWorkOrderComment,
};