import { useState, useEffect, useCallback } from 'react';
import api from '../api/client';

const emptyModel = { model_code: '', name: '', description: '' };
const emptyVersion = { version_code: '', description: '' };

export default function useMachineModels() {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [versions, setVersions] = useState([]);
  const [modelForm, setModelForm] = useState(emptyModel);
  const [editingModelId, setEditingModelId] = useState(null);
  const [versionForm, setVersionForm] = useState(emptyVersion);
  const [editingVersionId, setEditingVersionId] = useState(null);

  const loadModels = useCallback(async () => {
    try {
      const res = await api.get('/machine-models');
      setModels(res.data.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load machine models');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadVersions = useCallback(async (modelId) => {
    try {
      const res = await api.get(`/machine-models/${modelId}/versions`);
      setVersions(res.data.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load versions');
    }
  }, []);

  useEffect(() => { loadModels(); }, [loadModels]);

  const toggleExpand = useCallback(async (modelId) => {
    if (expandedId === modelId) {
      setExpandedId(null);
      setVersions([]);
      setEditingVersionId(null);
      setVersionForm(emptyVersion);
    } else {
      setExpandedId(modelId);
      setEditingVersionId(null);
      setVersionForm(emptyVersion);
      await loadVersions(modelId);
    }
  }, [expandedId, loadVersions]);

  const handleSaveModel = useCallback(async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editingModelId) {
        await api.put(`/machine-models/${editingModelId}`, modelForm);
      } else {
        await api.post('/machine-models', modelForm);
      }
      setModelForm(emptyModel);
      setEditingModelId(null);
      await loadModels();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save model');
    }
  }, [editingModelId, modelForm, loadModels]);

  const handleDeleteModel = useCallback(async (id) => {
    if (!window.confirm('Deactivate this machine model?')) return;
    setError('');
    try {
      await api.delete(`/machine-models/${id}`);
      if (expandedId === id) { setExpandedId(null); setVersions([]); }
      await loadModels();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to deactivate model');
    }
  }, [expandedId, loadModels]);

  const handleEditModel = useCallback((model) => {
    setEditingModelId(model.id);
    setModelForm({ model_code: model.model_code, name: model.name, description: model.description || '' });
  }, []);

  const handleCancelEditModel = useCallback(() => {
    setEditingModelId(null);
    setModelForm(emptyModel);
  }, []);

  const handleSaveVersion = useCallback(async (e) => {
    e.preventDefault();
    setError('');
    try {
      if (editingVersionId) {
        await api.put(`/machine-models/versions/${editingVersionId}`, versionForm);
      } else {
        await api.post(`/machine-models/${expandedId}/versions`, versionForm);
      }
      setVersionForm(emptyVersion);
      setEditingVersionId(null);
      await loadVersions(expandedId);
      await loadModels();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save version');
    }
  }, [editingVersionId, versionForm, expandedId, loadVersions, loadModels]);

  const handleDeleteVersion = useCallback(async (id) => {
    if (!window.confirm('Deactivate this version?')) return;
    setError('');
    try {
      await api.delete(`/machine-models/versions/${id}`);
      await loadVersions(expandedId);
      await loadModels();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to deactivate version');
    }
  }, [expandedId, loadVersions, loadModels]);

  const handleEditVersion = useCallback((version) => {
    setEditingVersionId(version.id);
    setVersionForm({ version_code: version.version_code, description: version.description || '' });
  }, []);

  const handleCancelEditVersion = useCallback(() => {
    setEditingVersionId(null);
    setVersionForm(emptyVersion);
  }, []);

  return {
    models,
    loading,
    error,
    expandedId,
    versions,
    modelForm,
    editingModelId,
    versionForm,
    editingVersionId,
    setModelForm,
    setVersionForm,
    toggleExpand,
    handleSaveModel,
    handleDeleteModel,
    handleEditModel,
    handleCancelEditModel,
    handleSaveVersion,
    handleDeleteVersion,
    handleEditVersion,
    handleCancelEditVersion,
  };
}
