import { MapPin, ArrowRight } from 'lucide-react';
import { useAppStore, getTrainsAtStation } from '../../store/useAppStore';
import { formatClock } from '../../utils/time/time';
import { TrainMarkerIcon } from '../graph/TrainMarkerIcon';
import './StationSearchResult.css';

/** Shown above the train list when the search text matches a known station. */
export function StationSearchResult({ station }) {
  const trains = useAppStore((s) => s.trains);
  const setFocusedTrain = useAppStore((s) => s.setFocusedTrain);
  const rows = getTrainsAtStation(trains, station.stationCode);

  return (
    <div className="station-result">
      <div className="station-result-head">
        <MapPin size={13} />
        <div>
          <div className="station-result-code">{station.stationCode}</div>
          <div className="station-result-name">{station.stationName} · {station.distance} km from origin</div>
        </div>
      </div>
      <div className="station-result-count">{rows.length} train{rows.length !== 1 ? 's' : ''} stop here</div>
      <div className="station-result-list">
        {rows.map(({ train, stop }) => (
          <button key={train.trainNumber} className="station-result-row" onClick={() => setFocusedTrain(train.trainNumber)}>
            <TrainMarkerIcon color={train.color} marker={train.marker} size={10} />
            <span className="sr-train-number">{train.trainNumber}</span>
            <span className="sr-times">
              {stop.arrivalClock ? formatClock(stop.arrivalClock) : '—'}
              <ArrowRight size={10} />
              {stop.departureClock ? formatClock(stop.departureClock) : '—'}
            </span>
            {(stop.arrivalDay ?? 0) > 0 && <span className="sr-day">Day {(stop.arrivalDay ?? 0) + 1}</span>}
          </button>
        ))}
        {rows.length === 0 && <div className="station-result-empty">No trains currently stop here.</div>}
      </div>
    </div>
  );
}
