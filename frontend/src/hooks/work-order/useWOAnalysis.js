import { useState } from 'react';
import api from '../../api/client';

export default function useWOAnalysis(id, load, setMessage, setError) {
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null);

  const handleAnalyze = async () => {
    setError('');
    setMessage('');
    setAnalyzing(true);
    try {
      const res = await api.post(`/work-orders/${id}/analyze`);
      setAnalysis(res.data.data);
      setMessage('Analysis complete');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Analysis failed');
    } finally {
      setAnalyzing(false);
    }
  };

  return { analyzing, analysis, setAnalysis, handleAnalyze };
}
