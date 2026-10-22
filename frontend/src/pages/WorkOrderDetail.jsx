import { useValueToast } from '../components/Toast';
import { useAuth } from '../context/AuthContext';
import useWorkOrderDetail from './useWorkOrderDetail';
import WOStatusAccess from '../components/work-order/WOStatusAccess';
import WOModelSerial from '../components/work-order/WOModelSerial';
import WOEstimationPreview from '../components/work-order/WOEstimationPreview';
import WOProductionNotes from '../components/work-order/WOProductionNotes';
import WOComments from '../components/work-order/WOComments';
import ConfirmModal from '../components/ConfirmModal';

export default function WorkOrderDetail() {
  const { hasRole, user } = useAuth();
  const isCoder = hasRole('CODER');
  const {
    wo, error, loading, analyzing, finalizing, startingProduction, completing, savingTaskId, message,
    correctionLevels, correctionForm, correctingItemId, correctionConfirmOpen, correctionConfirmMessage,
    beginCorrection, cancelCorrection, updateCorrectionForm, saveCorrection, confirmCorrection,
    handleItemChange, handleEditItem, handleUpdateItem, cancelEdit,
    showAddItemForm, openAddItem, handleAddItem, handleDeleteItem, handleAnalyze, handleFinalize,
    finalizeConfirm, startConfirm, completeConfirm,
    openFinalizeConfirm, closeFinalizeConfirm, openStartConfirm, closeStartConfirm,
    openCompleteConfirm, closeCompleteConfirm,
    
    itemForm, editingItemId,
    handleStartProduction, handleCompleteProduction, handleCompleteTask,
    groupForm, editingGroupId, showAddGroup, handleGroupFormChange, openAddGroup, openEditGroup,
    cancelGroupForm, handleSubmitGroup, handleDeleteGroup,
    deleteGroupConfirm, deletingGroup, openDeleteGroupConfirm, closeDeleteGroupConfirm,
    access, accessBusy, users, canEdit, canManageAccess,
    notes, setNotes, savingNotes, editing, setEditing, handleSaveNotes,
    handleGrantAccess, handleRevokeAccess,
    deleteItemConfirm, openDeleteItemConfirm, closeDeleteItemConfirm,
  } = useWorkOrderDetail();

  useValueToast(error);
  useValueToast(message, 'success');

  if (loading) return <div>Loading...</div>;
  if (error && !wo) return <div className="text-muted">Work order unavailable.</div>;
  if (!wo) return <div className="text-muted">Work order not found</div>;

  const items = wo.items || [];
  const countOpenItem = items.filter((t) => t.classification_status === 'CODER_REVIEW' || t.fw_related === null).length;
  const allNonFirmware = items.length > 0 && items.every((item) => item.fw_related === false
    && ['CLASSIFIED', 'NON_FIRMWARE'].includes(item.classification_status));
  const reviewedItems = countOpenItem > 0
    ? `Waiting for (${countOpenItem} left)`
    : allNonFirmware ? 'Complete Work Order' : 'Finalize Work Order';
  
  const productionTasks = wo.production_tasks || [];
  const openTaskCount = productionTasks.filter((t) => !t.completed).length;
  const completeAllLabel = openTaskCount > 0
    ? `Complete (${openTaskCount} item${openTaskCount === 1 ? '' : 's'} left)`
    : 'Complete Production';

  const groups = wo.groups || [];
  const groupsEditable = wo.status === 'DRAFT' || wo.status === 'ANALYZED';
  const itemsEditable = groupsEditable;
  const staleVerdicts = wo.status === 'DRAFT' && items.some((i) => i.verdict_stale === true);
  const isOwner = Number(wo.created_by) === Number((useAuth().user?.id));
  const isGranted = access.some((a) => Number(a.user_id) === Number((useAuth().user?.id)));
  const canComment = hasRole('ADMIN') || hasRole('CODER') || (hasRole('PM') && (isOwner || isGranted));
  const assignedCoderId = wo.assigned_coder_id;
  const isAssignedToMe = hasRole('CODER') && assignedCoderId != null && user && Number(assignedCoderId) === Number(user.id);
  const blockedByAssignment = hasRole('CODER') && !hasRole('ADMIN') && assignedCoderId != null && !isAssignedToMe;
  
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
        openFinalizeConfirm={openFinalizeConfirm}
        openStartConfirm={openStartConfirm}
        openCompleteConfirm={openCompleteConfirm}
        reviewedItems={reviewedItems}
        allNonFirmware={allNonFirmware}
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
        openDeleteGroupConfirm={openDeleteGroupConfirm}
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
        canCorrectDecisions={isCoder && !blockedByAssignment && !['PRODUCTION', 'COMPLETED'].includes(wo.status)}
        correctionLevels={correctionLevels}
        correctionForm={correctionForm}
        correctingItemId={correctingItemId}
        beginCorrection={beginCorrection}
        cancelCorrection={cancelCorrection}
        updateCorrectionForm={updateCorrectionForm}
        saveCorrection={saveCorrection}
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
        openDeleteItemConfirm={openDeleteItemConfirm}
      />

      <WOComments woId={wo.id} canComment={canComment} />
      {blockedByAssignment && (
        <div className="panel" style={{ marginTop: 12 }}>
          <div className="text-muted">Read-only: this work order is assigned to another coder.</div>
        </div>
      )}

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

      <ConfirmModal
        isOpen={finalizeConfirm}
        onClose={closeFinalizeConfirm}
        onConfirm={handleFinalize}
        title={allNonFirmware ? 'Complete Work Order?' : 'Finalize Work Order?'}
        message={allNonFirmware
          ? 'This work order has no firmware-related items. Confirming will complete it directly without starting production. This action cannot be undone.'
          : 'Are you sure you want to finalize this work order? This action cannot be undone.'}
        confirmLabel={allNonFirmware ? 'Complete Work Order' : 'Finalize'}
        loading={finalizing}
        confirmVariant="primary"
      />
      <ConfirmModal
        isOpen={startConfirm}
        onClose={closeStartConfirm}
        onConfirm={handleStartProduction}
        title="Move to Production?"
        message="Are you sure you want to move this work order to production?"
        confirmLabel="Start Production"
        loading={startingProduction}
      />
      <ConfirmModal
        isOpen={completeConfirm}
        onClose={closeCompleteConfirm}
        onConfirm={handleCompleteProduction}
        title="Complete Work Order?"
        message="Are you sure you want to complete this work order?"
        confirmLabel="Complete"
        loading={completing}
      />
      <ConfirmModal
        isOpen={correctionConfirmOpen}
        onClose={cancelCorrection}
        onConfirm={confirmCorrection}
        title="Correct classification?"
        message={correctionConfirmMessage}
        confirmLabel="Save"
        loading={correctingItemId != null}
      />
      <ConfirmModal
        isOpen={!!(deleteItemConfirm && deleteItemConfirm.open)}
        onClose={closeDeleteItemConfirm}
        onConfirm={() => handleDeleteItem(deleteItemConfirm.itemId)}
        title="Delete item"
        message="Are you sure you want to delete this item?"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        confirmVariant="danger"
      />
      <ConfirmModal
        isOpen={deleteGroupConfirm.open}
        onClose={closeDeleteGroupConfirm}
        onConfirm={handleDeleteGroup}
        title="Delete serial number?"
        message="Are you sure you want to delete this serial number?"
        confirmLabel="Delete"
        cancelLabel="Cancel"
        confirmVariant="danger"
        loading={deletingGroup}
      />
    </div>
  );
}

