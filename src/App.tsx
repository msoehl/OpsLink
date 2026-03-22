import { useEffect, useState } from 'react';
import { useEFBStore } from './store/efbStore';
import { useAcarsPolling } from './hooks/useAcarsPolling';
import { useSimPosition } from './hooks/useSimPosition';
import { useFlightTracking } from './hooks/useFlightTracking';
import { ErrorBoundary } from './components/ErrorBoundary';
import Sidebar from './components/layout/Sidebar';
import TopBar from './components/layout/TopBar';
import Dashboard from './pages/Dashboard';
import MapPage from './pages/Map';
import FlightPlan from './pages/FlightPlan';
import Charts from './pages/Charts';
import Performance from './pages/Performance';
import AcarsPage from './pages/Acars';
import SettingsPage from './pages/Settings';
import LogbookPage from './pages/Logbook';

function PageContent() {
  const { activePage } = useEFBStore();
  switch (activePage) {
    case 'dashboard':   return <Dashboard />;
    case 'map':         return <MapPage />;
    case 'flightplan':  return <FlightPlan />;
    case 'charts':      return <Charts />;
    case 'performance': return <Performance />;
    case 'acars':       return <AcarsPage />;
    case 'settings':    return <SettingsPage />;
    case 'logbook':     return <LogbookPage />;
    default:            return <Dashboard />;
  }
}

export default function App() {
  const { theme } = useEFBStore();
  const [offline, setOffline] = useState(!navigator.onLine);

  useAcarsPolling();
  useSimPosition();
  useFlightTracking();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    const on  = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online',  on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[var(--c-base)]">
      {offline && (
        <div className="shrink-0 bg-amber-500/10 border-b border-amber-500/30 px-4 py-1.5 text-center text-xs text-amber-400">
          No internet connection — live data unavailable
        </div>
      )}
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-hidden">
          <ErrorBoundary>
            <PageContent />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}
