import './EmptyState.css';

export function EmptyState({ icon, title, message, action }) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-state-icon">{icon}</div>}
      <div className="empty-state-title">{title}</div>
      {message && <div className="empty-state-message">{message}</div>}
      {action}
    </div>
  );
}
