import { useState } from 'react';
import api from '../../api/client';

const emptyGroupForm = { machine_model_id: '', serial_number: '' };

export default function useWOModelSerial(id, load, setMessage, setError) {
  const [groupForm, setGroupForm] = useState(emptyGroupForm);
  const [editingGroupId, setEditingGroupId] = useState(null);
  const [showAddGroup, setShowAddGroup] = useState(false);

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

  const handleDeleteGroup = async (groupId) => {
    if (!window.confirm('Delete this group?')) return;
    setError('');
    setMessage('');
    try {
      await api.delete(`/work-orders/${id}/groups/${groupId}`);
      setMessage('Group deleted');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete group');
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
    handleDeleteGroup
  };
}
