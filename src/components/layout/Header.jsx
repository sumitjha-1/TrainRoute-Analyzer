import { TrainFront, Sun, Moon, CheckCircle2, Circle, Pencil } from 'lucide-react';
import { useAppStore } from '../../store/useAppStore';
import { Button, IconButton } from '../common/Button';
import './Header.css';

function EditControls() {
  const isEditMode = useAppStore((s) => s.isEditMode);
  const hasTrains = useAppStore((s) => s.trains.length > 0);
  const enterEditMode = useAppStore((s) => s.enterEditMode);

  // Save / Cancel live in the edit bar above the graph (also available in full screen).
  if (isEditMode) return <span className="edit-mode-pill">Editing</span>;
  return (
    <Button icon={<Pencil size={14} />} disabled={!hasTrains} onClick={() => enterEditMode()} title="Enable editing">
      Edit
    </Button>
  );
}

export function Header() {
  const theme = useAppStore((s) => s.theme);
  const toggleTheme = useAppStore((s) => s.toggleTheme);
  const routeFileState = useAppStore((s) => s.routeFileState);
  const scheduleFileState = useAppStore((s) => s.scheduleFileState);

  return (
    <header className="app-header">
      <div className="app-header-brand">
        <div className="app-header-logo"><TrainFront size={18} /></div>
        <div>
          <div className="app-header-title">CRIS Train Movement Chart</div>
          <div className="app-header-subtitle">Time–distance graph</div>
        </div>
      </div>

      <div className="app-header-status">
        <StatusPill label="Route" ok={routeFileState.status === 'success'} />
        <StatusPill label="Schedule" ok={scheduleFileState.status === 'success'} />
      </div>

      <div className="app-header-actions">
        <EditControls />
        <IconButton onClick={toggleTheme} title="Toggle theme">
          {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
        </IconButton>
      </div>
    </header>
  );
}

function StatusPill({ label, ok }) {
  return (
    <div className={`status-pill ${ok ? 'is-ok' : ''}`}>
      {ok ? <CheckCircle2 size={12} /> : <Circle size={12} />}
      {label}
    </div>
  );
}