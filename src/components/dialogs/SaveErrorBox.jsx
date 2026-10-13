import { AlertTriangle, X, Crosshair } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import './SaveErrorBox.css';

export function SaveErrorBox() {
  const saveError = useAppStore((s) => s.saveError);
  const dismiss = useAppStore((s) => s.dismissSaveError);
  const locateIssue = useAppStore((s) => s.locateIssue);
  if (!saveError) return null;
  const { issues } = saveError;

  return (
    <div className="save-error-box" role="alert">
      <div className="seb-head">
        <AlertTriangle size={16} />
        <div className="seb-title">Schedule validation failed</div>
        <button className="seb-close" onClick={dismiss} title="Close (highlights stay)">
          <X size={14} />
        </button>
      </div>

      <div className="seb-body">
        {issues.map((issue, i) => (
          <div className="seb-issue" key={i}>
            <div className="seb-meta">
              <div><span>Train</span><strong>{issue.trainNumber}</strong>{issue.trainName && <em>{issue.trainName}</em>}</div>
              <div><span>Station</span><strong>{issue.stationCode}</strong></div>
              <div><span>Field</span><strong>{issue.fieldLabel}</strong></div>
            </div>
            <div className="seb-message">{issue.message}</div>
            <button className="seb-locate" onClick={() => locateIssue(issue)}>
              <Crosshair size={12} /> Show in graph
            </button>
          </div>
        ))}
      </div>

      <div className="seb-foot">
        Nothing was saved. Please correct the highlighted value{issues.length > 1 ? 's' : ''} and click Save again.
      </div>
    </div>
  );
}