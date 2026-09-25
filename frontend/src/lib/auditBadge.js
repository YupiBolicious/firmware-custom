const CATEGORY_CLASS = {
  LOGIN: 'badge-action-login',
  CREATED: 'badge-action-created',
  UPDATED: 'badge-action-updated',
  DELETED: 'badge-action-deleted',
};

export default function actionBadgeClass(action) {
  if (!action) return 'badge-muted';
  const name = String(action).toUpperCase();
  if (name.includes('LOGIN')) return CATEGORY_CLASS.LOGIN;
  if (/(CREATED|ADDED|UPLOADED)$/.test(name)) return CATEGORY_CLASS.CREATED;
  if (name.includes('DELETED') || name.endsWith('_REMOVED')) return CATEGORY_CLASS.DELETED;
  if (/(REVIEWED|ANALYZED|FINALIZED|PRODUCTION|COMPLETED|RESET_TO_DRAFT|UPDATED)$/.test(name)) return CATEGORY_CLASS.UPDATED;
  return 'badge-muted';
}