import { useAppStore } from '../../store/useAppStore';
import { FileUploadCard } from '../upload/FileUploadCard';
import { ValidationPanel } from '../common/ValidationPanel';
import { TrainFilterPanel } from '../trains/TrainFilterPanel';
import { StationSearch } from '../stations/StationSearch';
import { SidebarSection } from './SidebarSection';
import './Sidebar.css';

export function Sidebar() {
  const routeFileState = useAppStore((s) => s.routeFileState);
  const scheduleFileState = useAppStore((s) => s.scheduleFileState);
  const loadRouteFile = useAppStore((s) => s.loadRouteFile);
  const loadScheduleFile = useAppStore((s) => s.loadScheduleFile);
  const clearAll = useAppStore((s) => s.clearAll);
  const issues = useAppStore((s) => s.issues);
  const trains = useAppStore((s) => s.trains);
  const stations = useAppStore((s) => s.stations);

  return (
    <aside className="sidebar">
      <SidebarSection title="Data files" defaultOpen>
        <div className="sidebar-upload-stack">
          <FileUploadCard
            title="Route file"
            description="Stations with cumulative distance"
            fileState={routeFileState}
            onFile={(f) => f && loadRouteFile(f)}
            onClear={clearAll}
          />
          <FileUploadCard
            title="Schedule file"
            description="Train stops with arrival / departure times"
            fileState={scheduleFileState}
            onFile={(f) => f && loadScheduleFile(f)}
            onClear={clearAll}
          />
        </div>
      </SidebarSection>

      <SidebarSection title="Stations" badge={stations.length || null} defaultOpen>
        <StationSearch />
      </SidebarSection>

      <SidebarSection title="Trains" badge={trains.length || null} defaultOpen>
        <TrainFilterPanel />
      </SidebarSection>

      <SidebarSection title="Validation" badge={issues.filter((i) => i.level === 'error').length || null}>
        <ValidationPanel issues={issues} />
      </SidebarSection>
    </aside>
  );
}