import { useEffect } from 'react';
import { type EFBPage, useEFBStore } from '../../store/efbStore';
import {
  LayoutDashboard,
  Globe,
  FileText,
  MessageSquare,
  Settings,
  Plane,
  BookOpen,
} from 'lucide-react';
import clsx from 'clsx';

const navItems: { id: EFBPage; label: string; short: string; icon: React.ElementType }[] = [
  { id: 'dashboard',   label: 'Dashboard',   short: 'Dash',  icon: LayoutDashboard },
  { id: 'acars',       label: 'ACARS',       short: 'ACARS', icon: MessageSquare },
  { id: 'map',         label: 'Map',         short: 'Map',   icon: Globe },
  { id: 'flightplan',  label: 'Flight Plan', short: 'F-PLN', icon: FileText },
  { id: 'logbook',     label: 'Logbook',     short: 'Log',   icon: BookOpen },
  { id: 'settings',    label: 'Settings',    short: 'Setup', icon: Settings },
];

export default function Sidebar() {
  const { activePage, setActivePage, ofp, acarsUnread, resetAcarsUnread } = useEFBStore();

  useEffect(() => {
    if (activePage === 'acars') resetAcarsUnread();
  }, [activePage, resetAcarsUnread]);

  return (
    <aside className="w-16 bg-[var(--c-depth)] border-r border-[var(--c-border)] flex flex-col items-center py-3 gap-1 shrink-0">
      <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
        <Plane size={20} className="text-white" />
      </div>
      <div className="mb-2 h-4 flex items-center">
        {ofp && (
          <span className="text-[8px] text-blue-300 font-mono truncate w-14 text-center px-1">
            {ofp.atc.callsign}
          </span>
        )}
      </div>

      {navItems.map(({ id, label, short, icon: Icon }) => (
        <button
          key={id}
          onClick={() => setActivePage(id)}
          title={label}
          className={clsx(
            'w-12 h-12 rounded-lg flex flex-col items-center justify-center gap-0.5 transition-colors',
            activePage === id
              ? 'bg-blue-600 text-white'
              : 'text-gray-500 hover:text-gray-300 hover:bg-[var(--c-border)]'
          )}
        >
          <div className="relative">
            <Icon size={20} />
            {id === 'acars' && acarsUnread > 0 && (
              <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />
            )}
          </div>
          <span className="text-[9px] leading-none font-medium">{short}</span>
        </button>
      ))}
    </aside>
  );
}
