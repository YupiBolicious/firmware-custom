const linkify = (text) =>
  text.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
    /^https?:\/\/[^\s]+$/.test(part)
      ? <a key={i} href={part} target="_blank" rel="noreferrer">{part}</a>
      : part
  );

export default function WOProductionNotes({
  wo,
  isCoder,
  productionTasks,
  handleCompleteTask,
  savingTaskId,
  notes,
  setNotes,
  editing,
  setEditing,
  handleSaveNotes,
  savingNotes
}) {
  return (
    <>
      {productionTasks.length > 0 && ['FINALIZED', 'PRODUCTION', 'COMPLETED'].includes(wo.status) && (
        <div className="panel table-scroll mb-16">
          <h3 className="mb-16">
            Production Tasks
            <span style={{ fontSize: 13, fontWeight: 400, color: 'var(--text-muted)', marginLeft: 8 }}>
              {productionTasks.filter((t) => t.completed).length} of {productionTasks.length} completed
            </span>
          </h3>
          <table>
            <thead>
              <tr>
                <th>Task Code</th>
                <th>Title</th>
                <th>Status</th>
                {isCoder && wo.status === 'PRODUCTION' && <th></th>}
              </tr>
            </thead>
            <tbody>
              {productionTasks.map((task) => (
                <tr key={task.id}>
                  <td>{task.task_code}</td>
                  <td>{task.title}</td>
                  <td>
                    {task.completed
                      ? <span className="badge badge-success">Done</span>
                      : <span className="badge badge-muted">Open</span>}
                  </td>
                  {isCoder && wo.status === 'PRODUCTION' && (
                    <td>
                      <button
                        className={`btn btn-sm ${task.completed ? 'btn-secondary' : ''}`}
                        onClick={() => handleCompleteTask(task.id, !task.completed)}
                        disabled={savingTaskId === task.id}
                      >
                        {savingTaskId === task.id ? 'Saving...' : task.completed ? 'Reopen' : 'Mark Done'}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(wo.status === 'PRODUCTION' || wo.status === 'COMPLETED') && (
        <div className="panel table-scroll">
          <h3 className="mb-16">Notes (Optional)</h3>
          {isCoder ? (
            editing ? (
              <>
                <textarea
                  className="custom-item-text"
                  rows={4}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Note for this work order — e.g. progress notes or a GitHub link..."
                />
                <div className="flex justify-end gap-8 mt-8">
                  <button className="btn btn-sm" onClick={handleSaveNotes} disabled={savingNotes}>
                    {savingNotes ? 'Saving...' : 'Save Note'}
                  </button>
                  <button className="btn btn-sm btn-secondary" onClick={() => setEditing(false)} disabled={savingNotes}>
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <div className="flex justify-between items-center gap-16">
                <p className="text-muted mb-0">
                  {notes ? linkify(notes) : 'No notes yet.'}
                </p>
                <button className="btn btn-sm whitespace-nowrap" onClick={() => setEditing(true)}>
                  {notes ? 'Edit' : 'Add Note'}
                </button>
              </div>
            )
          ) : (
            <p className="text-muted">
              {notes ? linkify(notes) : 'No notes yet.'}
            </p>
          )}
        </div>
      )}
    </>
  );
}
