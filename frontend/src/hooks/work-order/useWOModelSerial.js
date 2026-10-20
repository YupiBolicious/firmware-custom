import { useState } from 'react';
import api from '../../api/client';

const emptyGroupForm = { machine_model_id: '', serial_number: '' };

export default function useWOModelSerial(id, load, setMessage, setError) {
  const [groupForm, setGroupForm] = useState(emptyGroupForm);
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [showAddGroup, setShowAddGroup] = useState(false);
  const [deleteGroupConfirm, setDeleteGroupConfirm] = useState({ open: false, groupId: null });
  const [deletingGroup, setDeletingGroup] = useState(false);

  const handleGroupFormChange = (event) => {
    const { name, value } = event.target;
    setGroupForm((prev) => ({ ...prev, [name]: value }));
  };

  const openAddGroup = (modelCode) => {
    setEditingGroupId(null);
    setGroupForm({ machine_model_id: modelCode, serial_number: '' });
    setShowAddGroup(true);
  };

  const openEditGroup = (group) => {
    setEditingGroupId(group.id);
    setGroupForm({
      machine_model_id: group.machine_model_code || '',
      serial_number: group.serial_number || '',
    });
    setShowAddGroup(true);
  };

  const cancelGroupForm = () => {
    setEditingGroupId(null);
    setShowAddGroup(false);
    setGroupForm(emptyGroupForm);
  };

  const handleSubmitGroup = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    const payload = {
      machine_model_id: groupForm.machine_model_id.trim().toUpperCase(),
      serial_number: groupForm.serial_number && groupForm.serial_number.trim() ? groupForm.serial_number.trim() : undefined,
    };
    try {
      if (editingGroupId) {
        await api.put(`/work-orders/${id}/groups/${editingGroupId}`, payload);
        setMessage('Group updated');
      } else {
        await api.post(`/work-orders/${id}/groups`, payload);
        setMessage('Group added');
      }
      cancelGroupForm();
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save group');
    }
  };

  const openDeleteGroupConfirm = (groupId) => setDeleteGroupConfirm({ open: true, groupId });
  const closeDeleteGroupConfirm = () => {
    if (deletingGroup) return;
    setDeleteGroupConfirm({ open: false, groupId: null });
  };

  const handleDeleteGroup = async () => {
    const groupId = deleteGroupConfirm.groupId;
    if (groupId == null) { closeDeleteGroupConfirm(); return; }
    setError('');
    setMessage('');
    setDeletingGroup(true);
    try {
      await api.delete(`/work-orders/${id}/groups/${groupId}`);
      setMessage('Group deleted');
      setDeleteGroupConfirm({ open: false, groupId: null });
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete group');
      setDeleteGroupConfirm({ open: false, groupId: null });
    } finally {
      setDeletingGroup(false);
    }
  };

  return {
    groupForm,
    editingGroupId,
    showAddGroup,
    handleGroupFormChange,
    openAddGroup,
    openEditGroup,
    cancelGroupForm,
    handleSubmitGroup,
    handleDeleteGroup,
    deleteGroupConfirm,
    deletingGroup,
    openDeleteGroupConfirm,
    closeDeleteGroupConfirm,
  };
}
