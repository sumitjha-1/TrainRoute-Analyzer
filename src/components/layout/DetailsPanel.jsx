import { useMemo } from 'react';
import { useAppStore, isStopEdited, getPreviousTrain } from '../../store/useAppStore';
import { formatClock } from '../../utils/time/time';
import { diffTrains } from '../../utils/graph/pathDiff';
import { TrainMarkerIcon } from '../graph/TrainMarkerIcon';
import { errorMarkKey } from '../../utils/graph/saveEngine';
import './DetailsPanel.css';

export function DetailsPanel() {
  const stations = useAppStore((s) => s.stations);
  const trains = useAppStore((s) => s.trains);
  const focusedTrainNumber = useAppStore((s) => s.focusedTrainNumber);
  const setFocusedTrain = useAppStore((s) => s.setFocusedTrain);
  const requestConfirm = useAppStore((s) => s.requestConfirm);
  const editStopTime = useAppStore((s) => s.editStopTime);
  const editedStopKeys = useAppStore((s) => s.editedStopKeys);
  const editedTrainNumbers = useAppStore((s) => s.editedTrainNumbers);
  const isEditMode = useAppStore((s) => s.isEditMode);
  const saveErrorKeys = useAppStore((s) => s.saveErrorKeys);
  const baselineTrains = useAppStore((s) => s.baselineTrains);
  const pathHistory = useAppStore((s) => s.pathHistory);
  const selectedStationCode = useAppStore((s) => s.selectedStationCode);
  const setSelectedStation = useAppStore((s) => s.setSelectedStation);

  const focusedTrain = trains.find((t) => t.trainNumber === focusedTrainNumber);
  const totalDistance = stations.length > 0 ? stations[stations.length - 1].distance - stations[0].distance : 0;

  const prevTrain = useMemo(
    () => (focusedTrain
      ? getPreviousTrain({ isEditMode, editedTrainNumbers, baselineTrains, pathHistory }, focusedTrain.trainNumber)
      : null),
    [focusedTrain, isEditMode, editedTrainNumbers, baselineTrains, pathHistory]
  );
  const changes = useMemo(
    () => (prevTrain && focusedTrain ? diffTrains(prevTrain, focusedTrain) : []),
    [prevTrain, focusedTrain]
  );
  const savedVersions = focusedTrain ? (pathHistory[focusedTrain.trainNumber]?.length || 0) : 0;

  function handleEditTime(stop, field) {
    if (!isEditMode) return;
    requestConfirm({
      title: `Edit ${field === 'arrivalRaw' ? 'arrival' : 'departure'} time`,
      message: `${focusedTrain.trainNumber} at ${stop.stationCode}. This recalculates that train's path.`,
      confirmLabel: 'Apply',
      input: { label: 'Time (HH:MM)', defaultValue: stop[field] || '' },
      onConfirm: (value) => {
        const result = editStopTime(focusedTrain.trainNumber, stop.stationCode, field, value, { single: true });
        if (!result.ok) {
          requestConfirm({
            title: 'Cannot edit',
            message: result.error,
            confirmLabel: 'OK',
            onConfirm: () => {},
          });
        }
      },
    });
  }

  return (
    <aside className="details-panel">
      <div className="dp-stats">
        <StatBox label="Stations" value={stations.length} />
        <StatBox label="Trains" value={trains.length} />
        <StatBox label="Route km" value={totalDistance} />
      </div>

      {focusedTrain ? (
        <div className="dp-train-detail">
          <div className="dp-train-head">
            <TrainMarkerIcon color={focusedTrain.color} marker={focusedTrain.marker} size={14} />
            <div>
              <div className="dp-train-number">{focusedTrain.trainNumber}</div>
              {focusedTrain.trainName && <div className="dp-train-name">{focusedTrain.trainName}</div>}
            </div>
            <button className="dp-close" onClick={() => setFocusedTrain(null)} title="Clear selection">✕</button>
          </div>

          <div className="dp-section-title">Stops · {focusedTrain.stops.length}</div>
          <div className="dp-stop-list">
            {focusedTrain.stops.map((stop) => {
              const edited = isStopEdited({ editedStopKeys }, focusedTrain.trainNumber, stop.stationCode);
              const arrErr = saveErrorKeys.has(errorMarkKey(focusedTrain.trainNumber, stop.stationCode, 'arrival'));
              const depErr = saveErrorKeys.has(errorMarkKey(focusedTrain.trainNumber, stop.stationCode, 'departure'));
              const isSel = selectedStationCode === stop.stationCode;
              return (
                <div
                  key={stop.stationCode}
                  className={`dp-stop-row ${edited ? 'dp-stop-edited' : ''} ${arrErr || depErr ? 'dp-stop-error' : ''} ${isSel ? 'is-selected' : ''}`}
                  onClick={() => setSelectedStation(isSel ? null : stop.stationCode)}
                  title="Highlight this station on the graph"
                >
                  <div className="dp-stop-station">
                    <span>{stop.stationCode}</span>
                    <span className="dp-stop-dist">{stop.distance} km</span>
                  </div>
                  <div className="dp-stop-times">
                    <span
                      className={`dp-time-arrival ${isEditMode ? 'dp-time-editable' : ''} ${arrErr ? 'dp-time-error' : ''}`}
                      onClick={(e) => { e.stopPropagation(); handleEditTime(stop, 'arrivalRaw'); }}
                    >
                      {stop.arrivalClock ? formatClock(stop.arrivalClock) : '—'}
                    </span>
                    <span className="dp-arrow">→</span>
                    <span
                      className={`dp-time-departure ${isEditMode ? 'dp-time-editable' : ''} ${depErr ? 'dp-time-error' : ''}`}
                      onClick={(e) => { e.stopPropagation(); handleEditTime(stop, 'departureRaw'); }}
                    >
                      {stop.departureClock ? formatClock(stop.departureClock) : '—'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="dp-section-title">
            Path history{savedVersions > 0 ? ` · ${savedVersions} saved` : ''}
          </div>
          {!prevTrain && <div className="dp-hint">No earlier version of this path yet. Edits you save are kept here.</div>}
          {prevTrain && changes.length === 0 && <div className="dp-hint">Current path matches the previous version.</div>}
          {prevTrain && changes.length > 0 && (
            <>
              <div className="dp-compare-note">
                {isEditMode && editedTrainNumbers.has(focusedTrain.trainNumber)
                  ? 'Compared with before this edit. '
                  : 'Compared with the previous saved version. '}
                The previous path is dashed on the graph.
              </div>
              <div className="dp-change-list">
                {changes.map((c) => (
                  <div key={`${c.type}-${c.stationCode}`} className={`dp-change dp-change-${c.type}`}>
                    <div className="dp-change-head">
                      <span className="dp-change-station">{c.stationCode}</span>
                      <span className="dp-change-tag">{c.type}</span>
                    </div>
                    {c.was && <div className="dp-change-was">{c.was}</div>}
                    {c.now && <div className="dp-change-now">{c.now}</div>}
                    {c.type === 'changed' && c.haltWas !== c.haltNow && (
                      <div className="dp-change-halt">
                        Halt {c.haltWas ?? '—'} → {c.haltNow ?? '—'} min
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="dp-hint">Select a train on the graph or in the list to see its stops, highlighted stations and path history.</div>
      )}
    </aside>
  );
}

function StatBox({ label, value }) {
  return (
    <div className="stat-box">
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}