import { useState, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { Button } from '../common/Button';
import './ConfirmDialog.css';

export function ConfirmDialog() {
  const confirmDialog = useAppStore((s) => s.confirmDialog);
  const cancelConfirm = useAppStore((s) => s.cancelConfirm);
  const confirmAndRun = useAppStore((s) => s.confirmAndRun);
  const [value, setValue] = useState('');

  useEffect(() => {
    if (confirmDialog?.input) {
      setValue(confirmDialog.input.defaultValue ?? '');
    }
  }, [confirmDialog]);

  if (!confirmDialog) return null;

  return (
    <div className="dialog-overlay" onClick={cancelConfirm}>
      <div className="dialog-box" onClick={(e) => e.stopPropagation()}>
        <div className="dialog-icon">
          <AlertTriangle size={18} />
        </div>
        <div className="dialog-title">{confirmDialog.title}</div>
        {confirmDialog.rows ? (
          <div className="dialog-rows">
            {confirmDialog.rows.map((row, i) => (
              <div className="dialog-row" key={i}>
                <span>{row.label}</span>
                <strong>{row.value}</strong>
              </div>
            ))}
          </div>
        ) : null}
        <div className="dialog-message">{confirmDialog.message}</div>
        {confirmDialog.input && (
          <div className="dialog-input-group">
            <label>{confirmDialog.input.label}</label>
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
            />
          </div>
        )}
        <div className="dialog-actions">
          <Button variant="ghost" onClick={cancelConfirm}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => confirmAndRun(value)}>
            {confirmDialog.confirmLabel || 'Confirm'}
          </Button>
        </div>
      </div>
    </div>
  );
}
