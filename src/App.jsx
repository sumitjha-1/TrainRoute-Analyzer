import { useEffect, useRef } from 'react';
import { useAppStore } from './store/useAppStore';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { DetailsPanel } from './components/layout/DetailsPanel';
import { Toolbar } from './components/toolbar/Toolbar';
import { TimeDistanceGraph } from './components/graph/TimeDistanceGraph';
import { Legend } from './components/graph/Legend';
import { ConfirmDialog } from './components/dialogs/ConfirmDialog';
import { SaveErrorBox } from './components/dialogs/SaveErrorBox';
import { Button } from './components/common/Button';
import './App.css';

// Lives inside the fullscreen wrapper so Save/Cancel stay reachable in full-screen mode.
function EditModeBar() {
  const isEditMode = useAppStore((s) => s.isEditMode);
  const pending = useAppStore((s) => s.editHistory.length);
  const lockedTrain = useAppStore((s) =>
    s.editedTrainNumbers.size > 0 ? Array.from(s.editedTrainNumbers)[0] : null
  );
  const singleSideMode = useAppStore((s) => s.singleSideMode);
  const setSingleSideMode = useAppStore((s) => s.setSingleSideMode);
  const saveEdits = useAppStore((s) => s.saveEdits);
  const requestCancelEdit = useAppStore((s) => s.requestCancelEdit);

  if (!isEditMode) return null;

  return (
    <div className="edit-bar">
      <span className="edit-bar-text">
        <strong>Edit mode</strong>
        <span className="edit-bar-sep">·</span>
        {lockedTrain ? `Train ${lockedTrain} — save or cancel to edit another` : 'One train at a time'}
        {pending > 0 && <span className="edit-bar-count">{pending} pending</span>}
      </span>
      <label className="edit-bar-toggle" title="Or hold Shift while dragging">
        <input type="checkbox" checked={singleSideMode} onChange={(e) => setSingleSideMode(e.target.checked)} />
        Move one side only (halt)
      </label>
      <div className="edit-bar-actions">
        <Button variant="ghost" size="sm" onClick={() => requestCancelEdit()}>Cancel</Button>
        <Button variant="primary" size="sm" onClick={() => saveEdits()}>Save</Button>
      </div>
    </div>
  );
}

export default function App() {
  const theme = useAppStore((s) => s.theme);
  const isEditMode = useAppStore((s) => s.isEditMode);
  const isDetailsPanelOpen = useAppStore((s) => s.isDetailsPanelOpen);
  const isSidebarOpen = useAppStore((s) => s.isSidebarOpen);
  const scrollAreaRef = useRef(null);
  const fullscreenRef = useRef(null);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    scrollAreaRef.current = document.querySelector('.graph-scroll-area');
  });

  return (
    <div className={`app-shell ${isEditMode ? 'is-editing' : ''}`}>
      <Header />
      <div className="app-body">
        {isSidebarOpen && <Sidebar />}
        <main className="app-main">
          <div className="app-fullscreen-wrap" ref={fullscreenRef}>
            <EditModeBar />
            <Toolbar scrollAreaRef={scrollAreaRef} fullscreenRef={fullscreenRef} />
            <div className="app-graph-wrap">
              <TimeDistanceGraph />
            </div>
            <Legend />
            <SaveErrorBox />
          </div>
        </main>
        {isDetailsPanelOpen && <DetailsPanel />}
      </div>
      <ConfirmDialog />
    </div>
  );
}