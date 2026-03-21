import { type EFBPage, useEFBStore } from '../../store/efbStore';
import {
  LayoutDashboard,
  FileText,
  Map,
  Cloud,
  Gauge,
  Settings,
  Plane,
} from 'lucide-react';
import clsx from 'clsx';

const navItems: { id: EFBPage; label: string; icon: React.ElementType }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'flightplan', label: 'Flight Plan', icon: FileText },
  { id: 'charts', label: 'Charts', icon: Map },
  { id: 'weather', label: 'Weather', icon: Cloud },
  { id: 'performance', label: 'Performance', icon: Gauge },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export default function Sidebar() {
  const { activePage, setActivePage } = useEFBStore();

  return (
    <aside className="w-16 bg-[#0d1117] border-r border-[#1f2937] flex flex-col items-center py-3 gap-1 shrink-0">
      {/* Logo */}
      <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center mb-4">
        <Plane size={20} className="text-white" />
      </div>

      {navItems.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => setActivePage(id)}
          title={label}
          className={clsx(
            'w-12 h-12 rounded-lg flex flex-col items-center justify-center gap-0.5 transition-colors',
            activePage === id
              ? 'bg-blue-600 text-white'
              : 'text-gray-500 hover:text-gray-300 hover:bg-[#1f2937]'
          )}
        >
          <Icon size={20} />
          <span className="text-[9px] leading-none font-medium">{label.split(' ')[0]}</span>
        </button>
      ))}
    </aside>
  );
}
