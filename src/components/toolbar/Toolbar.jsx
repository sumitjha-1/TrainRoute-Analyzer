import { useEffect, useState } from 'react';
import {
  ZoomIn, ZoomOut, Maximize2, Minimize2, Printer, RotateCcw,
  PanelLeft, PanelRight, History, Pencil, X,
} from 'lucide-react';
import { useAppStore, AUTO_VISIBLE_TRAIN_LIMIT, getScheduleDayCount } from '../../store/useAppStore';
import { IconButton } from '../common/Button';
import { DownloadMenu } from './DownloadMenu';
import './Toolbar.css';

export function Toolbar({ scrollAreaRef, fullscreenRef }) {
  const zoom = useAppStore((s) => s.zoom);
  const zoomIn = useAppStore((s) => s.zoomIn);
  const zoomOut = useAppStore((s) => s.zoomOut);
  const resetZoom = useAppStore((s) => s.resetZoom);
  const stations = useAppStore((s) => s.stations);
  const undoLastEdit = useAppStore((s) => s.undoLastEdit);
  const editHistory = useAppStore((s) => s.editHistory);
  const isEditMode = useAppStore((s) => s.isEditMode);
  const enterEditMode = useAppStore((s) => s.enterEditMode);
  const toggleDetailsPanel = useAppStore((s) => s.toggleDetailsPanel);
  const isDetailsPanelOpen = useAppStore((s) => s.isDetailsPanelOpen);
  const isSidebarOpen = useAppStore((s) => s.isSidebarOpen);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const viewMode = useAppStore((s) => s.viewMode);
  const setViewMode = useAppStore((s) => s.setViewMode);
  const stationFilter = useAppStore((s) => s.stationFilter);
  const clearStationFilter = useAppStore((s) => s.clearStationFilter);
  const showPreviousPaths = useAppStore((s) => s.showPreviousPaths);
  const togglePreviousPaths = useAppStore((s) => s.togglePreviousPaths);
  const autoLimitedTrainCount = useAppStore((s) => s.autoLimitedTrainCount);
  const showAllTrains = useAppStore((s) => s.showAllTrains);
  const trains = useAppStore((s) => s.trains);
  const dayCount = useAppStore(getScheduleDayCount);

  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === fullscreenRef?.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, [fullscreenRef]);

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else fullscreenRef?.current?.requestFullscreen?.();
  }

  const disabled = stations.length === 0;

  return (
    <div className="toolbar">
      <div className="toolbar-group">
        <IconButton active={isSidebarOpen} onClick={toggleSidebar} title="Toggle left panel">
          <PanelLeft size={16} />
        </IconButton>
        <IconButton disabled={disabled} onClick={zoomOut} title="Zoom out"><ZoomOut size={16} /></IconButton>
        <button className="toolbar-zoom-value" disabled={disabled} onClick={resetZoom} title="Reset zoom">
          {Math.round(zoom * 100)}%
        </button>
        <IconButton disabled={disabled} onClick={zoomIn} title="Zoom in"><ZoomIn size={16} /></IconButton>
      </div>

      {dayCount > 1 && (
        <div className="toolbar-group">
          <select
            className="toolbar-select"
            disabled={disabled}
            value={viewMode}
            onChange={(e) => setViewMode(e.target.value)}
            title="View mode"
          >
            <option value="day-wise">Day-wise</option>
            <option value="weekly">Weekly</option>
            <option value="layered">Layered</option>
          </select>
        </div>
      )}

      <div className="toolbar-group">
        {!isEditMode && (
          <button className="toolbar-btn toolbar-btn-edit" disabled={trains.length === 0}
                  onClick={() => enterEditMode()} title="Enable editing">
            <Pencil size={14} /> Edit
          </button>
        )}
        <IconButton active={showPreviousPaths} onClick={togglePreviousPaths}
                    title={showPreviousPaths ? 'Hide previous path' : 'Show previous path'}>
          <History size={16} />
        </IconButton>
        {isEditMode && (
          <IconButton disabled={editHistory.length === 0} onClick={undoLastEdit} title="Undo last edit">
            <RotateCcw size={16} />
          </IconButton>
        )}
      </div>

      {stationFilter && (
        <div className="toolbar-group">
          <button className="toolbar-chip" onClick={clearStationFilter} title="Remove station filter">
            Station {stationFilter} <X size={12} />
          </button>
        </div>
      )}

      {autoLimitedTrainCount != null && (
        <div className="toolbar-group">
          <button className="toolbar-btn toolbar-btn-limit" onClick={showAllTrains}>
            {trains.length > 0 ? AUTO_VISIBLE_TRAIN_LIMIT : 0} of {autoLimitedTrainCount} — Show all
          </button>
        </div>
      )}

      <div className="toolbar-spacer" />

      <div className="toolbar-group">
        <IconButton disabled={disabled} onClick={() => window.print()} title="Print"><Printer size={16} /></IconButton>
        <DownloadMenu scrollAreaRef={scrollAreaRef} />
        <IconButton onClick={toggleFullscreen} title={isFullscreen ? 'Exit full screen' : 'Full screen'}>
          {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </IconButton>
        <IconButton active={isDetailsPanelOpen} onClick={toggleDetailsPanel} title="Toggle right panel">
          <PanelRight size={16} />
        </IconButton>
      </div>
    </div>
  );
}