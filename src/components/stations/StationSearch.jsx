import { useMemo, useState } from 'react';
import { Search, X, MapPin } from 'lucide-react';
import { useAppStore, findMatchingStations } from '../../store/useAppStore';
import { StationSearchResult } from '../trains/StationSearchResult';
import './StationSearch.css';

export function StationSearch() {
  const stations = useAppStore((s) => s.stations);
  const selectedStationCode = useAppStore((s) => s.selectedStationCode);
  const setSelectedStation = useAppStore((s) => s.setSelectedStation);
  const stationFilter = useAppStore((s) => s.stationFilter);
  const setStationFilter = useAppStore((s) => s.setStationFilter);
  const clearStationFilter = useAppStore((s) => s.clearStationFilter);
  const [query, setQuery] = useState('');

  const matches = useMemo(() => findMatchingStations(stations, query).slice(0, 8), [stations, query]);
  const selected = stations.find((s) => s.stationCode === selectedStationCode) || null;

  if (stations.length === 0) {
    return <div className="ss-empty">Load a route file to search stations.</div>;
  }

  function pick(code) {
    setSelectedStation(code);
    setQuery('');
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && matches[0]) pick(matches[0].stationCode);
    if (e.key === 'Escape') setQuery('');
  }

  return (
    <div className="station-search">
      <div className="ss-input">
        <Search size={13} />
        <input
          placeholder="Station name or code…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {query && (
          <button className="ss-clear" onClick={() => setQuery('')} title="Clear search"><X size={12} /></button>
        )}
      </div>

      {query.trim() && (
        <div className="ss-results">
          {matches.map((s) => (
            <button key={s.stationCode} className="ss-result" onClick={() => pick(s.stationCode)}>
              <span className="ss-code">{s.stationCode}</span>
              <span className="ss-name">{s.stationName}</span>
              <span className="ss-km">{s.distance} km</span>
            </button>
          ))}
          {matches.length === 0 && <div className="ss-none">No station matches “{query}”.</div>}
        </div>
      )}

      {selected && (
        <div className="ss-selected">
          <div className="ss-selected-head">
            <MapPin size={13} />
            <span className="ss-selected-title">{selected.stationCode} · {selected.stationName}</span>
            <button className="ss-clear" onClick={() => setSelectedStation(null)} title="Deselect station"><X size={12} /></button>
          </div>
          <label className="ss-filter">
            <input
              type="checkbox"
              checked={stationFilter === selected.stationCode}
              onChange={(e) => (e.target.checked ? setStationFilter(selected.stationCode) : clearStationFilter())}
            />
            Show only trains stopping here
          </label>
          <StationSearchResult station={selected} />
        </div>
      )}
    </div>
  );
}