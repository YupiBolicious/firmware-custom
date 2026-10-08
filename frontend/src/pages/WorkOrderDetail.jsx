import { useValueToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import useWorkOrderDetail from './useWorkOrderDetail';
import WOStatusAccess from '../components/work-order/WOStatusAccess';
import WOModelSerial from '../components/work-order/WOModelSerial';
import WOEstimationPreview from '../components/work-order/WOEstimationPreview';
import WOProductionNotes from '../components/work-order/WOProductionNotes';
// import ConfirmModal from '../components/ConfirmModal';

export default function WorkOrderDetail() {
  const { hasRole } = useAuth();
  const isCoder = hasRole('CODER');
  const { 
    wo, error, loading, analyzing, finalizing, startingProduction, completing, savingTaskId, message, 
    handleItemChange, handleEditItem, handleUpdateItem, cancelEdit,
    showAddItemForm, openAddItem, handleAddItem, handleDeleteItem, handleAnalyze, handleFinalize,
    
    itemForm, editingItemId,
    handleStartProduction, handleCompleteProduction, handleCompleteTask,
    groupForm, editingGroupId, showAddGroup,woModelCode, handleGroupFormChange, openAddGroup, openEditGroup,
    cancelGroupForm, handleSubmitGroup, handleDeleteGroup,
    access, accessBusy, users, canEdit, canManageAccess, isOwner, isAdmin,
    notes, setNotes, savingNotes, editing, setEditing, handleSaveNotes,
    handleGrantAccess, handleRevokeAccess 
  } = useWorkOrderDetail();

  useValueToast(error);
  useValueToast(message, 'success');

  if (loading) return <div>Loading...</div>;
  if (error && !wo) return <div className="text-muted">Work order unavailable.</div>;
  if (!wo) return <div className="text-muted">Work order not found</div>;

  const items = wo.items || [];
  const countOpenItem = items.filter((t) => t.classification_status === 'CODER_REVIEW' || t.fw_related === null).length;
  const reviewedItems = countOpenItem > 0 ? `Waiting for (${countOpenItem} left)` : `Finalize Work Order`;
  
  const productionTasks = wo.production_tasks || [];
  const openTaskCount = productionTasks.filter((t) => !t.completed).length;
  const completeAllLabel = openTaskCount > 0
    ? `Complete (${openTaskCount} item${openTaskCount === 1 ? '' : 's'} left)`
    : 'Complete Production';

  const groups = wo.groups || [];
  const groupsEditable = wo.status === 'DRAFT' || wo.status === 'ANALYZED';
  const itemsEditable = groupsEditable;
  const staleVerdicts = wo.status === 'DRAFT' && items.some((i) => i.verdict_stale === true);

  return (
    <div className="glass-page">
      <WOStatusAccess 
        wo={wo}
        canEdit={canEdit}
        canManageAccess={canManageAccess}
        isCoder={isCoder}
        finalizing={finalizing}
        startingProduction={startingProduction}
        completing={completing}
        handleFinalize={handleFinalize}
        handleStartProduction={handleStartProduction}
        handleCompleteProduction={handleCompleteProduction}
        reviewedItems={reviewedItems}
        completeAllLabel={completeAllLabel}
        countOpenItem={countOpenItem}
        openTaskCount={openTaskCount}
        staleVerdicts={staleVerdicts}
        handleAnalyze={handleAnalyze}
        analyzing={analyzing}
        users={users}
        access={access}
        accessBusy={accessBusy}
        handleGrantAccess={handleGrantAccess}
        handleRevokeAccess={handleRevokeAccess}
      />

      <WOModelSerial 
        wo={wo}
        canEdit={canEdit}
        groups={groups}
        groupsEditable={groupsEditable}
        handleAnalyze={handleAnalyze}
        analyzing={analyzing}
        finalizing={finalizing}
        items={items}
        openAddGroup={openAddGroup}
        openEditGroup={openEditGroup}
        handleDeleteGroup={handleDeleteGroup}
        showAddGroup={showAddGroup}
        editingGroupId={editingGroupId}
        handleSubmitGroup={handleSubmitGroup}
        groupForm={groupForm}
        handleGroupFormChange={handleGroupFormChange}
        cancelGroupForm={cancelGroupForm}
      />

      <WOEstimationPreview
        items={items}
        totalEstimatedHours={wo.total_estimated_hours}
        groups={groups}
        canEdit={canEdit}
        itemsEditable={itemsEditable}
        showAddItemForm={showAddItemForm}
        openAddItem={openAddItem}
        handleAddItem={handleAddItem}
        itemForm={itemForm}
        handleItemChange={handleItemChange}
        editingItemId={editingItemId}
        handleEditItem={handleEditItem}
        handleUpdateItem={handleUpdateItem}
        cancelEdit={cancelEdit}
        handleDeleteItem={handleDeleteItem}
      />

      <WOProductionNotes 
        wo={wo}
        isCoder={isCoder}
        productionTasks={productionTasks}
        handleCompleteTask={handleCompleteTask}
        savingTaskId={savingTaskId}
        notes={notes}
        setNotes={setNotes}
        editing={editing}
        setEditing={setEditing}
        handleSaveNotes={handleSaveNotes}
        savingNotes={savingNotes}
      />

      {/* <ConfirmModal
        isOpen={finalizeConfirm}
        onClose={closeFinalizeConfirm}
        onConfirm={handleFinalize}
        title="Finalize Work Order?"
        message="Are you sure you want to finalize this work order? This action cannot be undone."
        confirmLabel="Finalize"
        loading={finalizing}
        confirmVariant="primary"
      /> */}
    </div>
  );
}

