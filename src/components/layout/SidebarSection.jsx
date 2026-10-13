import { useState } from 'react';
import { ChevronDown } from 'lucide-react';

export function SidebarSection({ title, children, defaultOpen = false, badge }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="sidebar-section">
      <button className="sidebar-section-head" onClick={() => setOpen((o) => !o)}>
        <span>{title}</span>
        <span className="sidebar-section-head-right">
          {badge != null && <span className="sidebar-section-badge">{badge}</span>}
          <ChevronDown size={14} className={open ? 'chevron-open' : ''} />
        </span>
      </button>
      {open && <div className="sidebar-section-body">{children}</div>}
    </div>
  );
}
