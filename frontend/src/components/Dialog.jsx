export default function Dialog({ title, body, onConfirm, onCancel, loading }) {
  return (
    <div className="overlay" onClick={onCancel}>
      <div className="dialog" onClick={e => e.stopPropagation()}>
        <div className="dialog-title">{title}</div>
        <div className="dialog-body">{body}</div>
        <div className="dialog-actions">
          <button className="btn btn-ghost" onClick={onCancel} disabled={loading}>
            Cancel
          </button>
          <button className="btn btn-danger-ghost" onClick={onConfirm} disabled={loading}>
            {loading ? 'Revoking…' : 'Revoke'}
          </button>
        </div>
      </div>
    </div>
  );
}
