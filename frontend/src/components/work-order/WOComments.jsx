import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import useWOComments from '../../pages/useWOComments';

export default function WOComments({ woId, canComment }) {
  const { user, hasRole } = useAuth();
  const { comments, loading, posting, error, addComment, deleteComment } = useWOComments(woId);
  const [content, setContent] = useState('');

  const isAdmin = hasRole('ADMIN');
  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await addComment(content);
      setContent('');
    } catch (_) {}
  };

  return (
    <div className="panel mb-16">
      <div className="panel-header">
        <h2>Discussion</h2>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {loading ? (
          <div>Loading...</div>
        ) : comments.length === 0 ? (
          <div className="text-muted">No discussion yet</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {comments.map((c) => {
              const isAuthor = user.username;
              const author = c.full_name || c.username || `User ${c.user_id}`;
              return (
                <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.9rem' }}>
                  <div style={{ flex: 1 }}>
                    <span style={{ whiteSpace: 'pre-wrap' }}>{c.content}</span>
                    <span className="text-muted"> - by {author}</span>
                  </div>
                  {(isAdmin || isAuthor) && (
                    <button
                      type="button"
                      className="btn btn-secondary"
                      style={{ color: '#dc2626', background: 'transparent', border: 'none', padding: '0 0.25rem', marginLeft: 'auto' }}
                      onClick={() => deleteComment(c.id)}
                    >
                      Delete
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {canComment && (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            <textarea
              rows={3}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Add a comment for user discussion..."
              maxLength={2000}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="submit" className="btn btn-secondary" disabled={posting || !content.trim()}>
                {posting ? 'Posting...' : 'Post'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
