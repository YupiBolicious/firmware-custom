import { useState } from 'react';
import api from '../../api/client';

export default function useWOProductionNotes(id, initialNotes, setMessage, setError) {
  const [savingTaskId, setSavingTaskId] = useState(null);
  const [notes, setNotes] = useState(initialNotes || '');
  const [savingNotes, setSavingNotes] = useState(false);
  const [editing, setEditing] = useState(false);

  const handleCompleteTask = async (taskId, completed, load) => {
    setError('');
    setMessage('');
    setSavingTaskId(taskId);
    try {
      await api.put(`/work-orders/${id}/production/tasks/${taskId}`, { completed });
      setMessage(completed ? 'Production item completed' : 'Production item reopened');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update production item');
      if (err.response?.status === 409) { await load(); }
    } finally {
      setSavingTaskId(null);
    }
  };

  const handleSaveNotes = async () => {
    setError('');
    setMessage('');
    setSavingNotes(true);
    try {
      await api.put(`/work-orders/${id}/notes`, { notes });
      setMessage('Note saved');
      setEditing(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save note');
    } finally {
      setSavingNotes(false);
    }
  };

  return {
    savingTaskId,
    notes,
    setNotes,
    savingNotes,
    editing,
    setEditing,
    handleCompleteTask,
    handleSaveNotes
  };
}
