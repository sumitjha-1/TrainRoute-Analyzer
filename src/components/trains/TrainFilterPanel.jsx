import { useMemo } from 'react';
import { Search, Eye, EyeOff } from 'lucide-react';
import { useAppStore, getVisibleTrains } from '../../store/useAppStore';
import { TrainMarkerIcon } from '../graph/TrainMarkerIcon';
import './TrainFilterPanel.css';

export function TrainFilterPanel() {
  const trains = useAppStore((s) => s.trains);
  const selectedTrainNumbers = useAppStore((s) => s.selectedTrainNumbers);
  const searchQuery = useAppStore((s) => s.searchQuery);
  const setSearchQuery = useAppStore((s) => s.setSearchQuery);
  const toggleTrainSelected = useAppStore((s) => s.toggleTrainSelected);
  const showAllTrains = useAppStore((s) => s.showAllTrains);
  const hideAllTrains = useAppStore((s) => s.hideAllTrains);
  const hoveredTrainNumber = useAppStore((s) => s.hoveredTrainNumber);
  const setHoveredTrain = useAppStore((s) => s.setHoveredTrain);
  const focusedTrainNumber = useAppStore((s) => s.focusedTrainNumber);
  const setFocusedTrain = useAppStore((s) => s.setFocusedTrain);

  const visible = useMemo(
    () => getVisibleTrains({ trains, selectedTrainNumbers, searchQuery }),
    [trains, selectedTrainNumbers, searchQuery]
  );
  const activeSet = selectedTrainNumbers != null ? new Set(selectedTrainNumbers) : null;

  if (trains.length === 0) return null;

  return (
    <div className="train-filter-panel">
      <div className="tf-search">
        <Search size={13} />
        <input
          placeholder="Train number or name…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>
      <div className="tf-actions">
        <button onClick={showAllTrains}>Show all</button>
        <button onClick={hideAllTrains}>Hide all</button>
        {focusedTrainNumber && <button onClick={() => setFocusedTrain(null)}>Clear selection</button>}
      </div>

      <div className="tf-list">
        {visible.map((train) => {
          const isOn = activeSet == null || activeSet.has(train.trainNumber);
          const isFocused = focusedTrainNumber === train.trainNumber;
          return (
            <div
              key={train.trainNumber}
              className={`tf-row ${isFocused ? 'is-focused' : ''} ${hoveredTrainNumber === train.trainNumber ? 'is-hovered' : ''}`}
              onMouseEnter={() => setHoveredTrain(train.trainNumber)}
              onMouseLeave={() => setHoveredTrain(null)}
              onClick={() => setFocusedTrain(isFocused ? null : train.trainNumber)}
            >
              <TrainMarkerIcon color={train.color} marker={train.marker} size={12} />
              <div className="tf-row-text">
                <div className="tf-row-number">{train.trainNumber}</div>
                {train.trainName && <div className="tf-row-name">{train.trainName}</div>}
              </div>
              <button
                className="tf-visibility"
                onClick={(e) => { e.stopPropagation(); toggleTrainSelected(train.trainNumber); }}
                title={isOn ? 'Hide train' : 'Show train'}
              >
                {isOn ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
            </div>
          );
        })}
        {visible.length === 0 && <div className="tf-empty">No trains match your search.</div>}
      </div>
    </div>
  );
}