const core = require('./workOrders/core');
const groups = require('./workOrders/groups');
const items = require('./workOrders/items');
const lifecycle = require('./workOrders/lifecycle');
const access = require('./workOrders/access');
const { reviewItem } = require('./reviewService');

module.exports = {
  listWorkOrders: core.listWorkOrders,
  listCoderReviewQueue: core.listCoderReviewQueue,
  reviewItem,
  getWorkOrder: core.getWorkOrder,
  createWorkOrder: core.createWorkOrder,
  updateWorkOrder: core.updateWorkOrder,
  updateWorkOrderNotes: core.updateWorkOrderNotes,
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
  completeProductionTask: lifecycle.completeProductionTask,
  // uploadDocuments,
  // listDocuments,
  // deleteDocument,
  listWorkOrderAccess: access.listWorkOrderAccess,
  grantWorkOrderAccess: access.grantWorkOrderAccess,
  revokeWorkOrderAccess: access.revokeWorkOrderAccess,
};