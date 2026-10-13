import { AlertTriangle, AlertCircle, ShieldCheck } from 'lucide-react';
import './ValidationPanel.css';

export function ValidationPanel({ issues }) {
  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warning');

  if (issues.length === 0) {
    return (
      <div className="validation-panel validation-clean">
        <ShieldCheck size={14} />
        <span>No validation issues found.</span>
      </div>
    );
  }

  return (
    <div className="validation-panel">
      <div className="validation-summary">
        {errors.length > 0 && <span className="badge badge-danger">{errors.length} error{errors.length > 1 ? 's' : ''}</span>}
        {warnings.length > 0 && <span className="badge badge-warning">{warnings.length} warning{warnings.length > 1 ? 's' : ''}</span>}
      </div>
      <div className="validation-list">
        {[...errors, ...warnings].map((issue, i) => (
          <div key={i} className={`validation-row validation-${issue.level}`}>
            {issue.level === 'error' ? <AlertCircle size={13} /> : <AlertTriangle size={13} />}
            <div>
              <div className="validation-msg">{issue.message}</div>
              <div className="validation-meta">
                {issue.source && <span>{issue.source}</span>}
                {issue.trainNumber && <span>· Train {issue.trainNumber}</span>}
                {issue.rowNumber && <span>· Row {issue.rowNumber}</span>}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
