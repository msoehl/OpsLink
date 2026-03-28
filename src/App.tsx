import { useEffect, useState } from 'react';
import { useEFBStore } from './store/efbStore';
import { useAcarsPolling } from './hooks/useAcarsPolling';
import { useSimPosition } from './hooks/useSimPosition';
import { useFlightTracking } from './hooks/useFlightTracking';
import { ErrorBoundary } from './components/ErrorBoundary';
import Sidebar from './components/layout/Sidebar';
import TopBar from './components/layout/TopBar';
import { Zap } from 'lucide-react';
import Dashboard from './pages/Dashboard';
import MapPage from './pages/Map';
import FlightPlan from './pages/FlightPlan';
import AcarsPage from './pages/Acars';
import SettingsPage from './pages/Settings';
import LogbookPage from './pages/Logbook';

function PageContent() {
  const { activePage } = useEFBStore();
  switch (activePage) {
    case 'dashboard':   return <Dashboard />;
    case 'map':         return <MapPage />;
    case 'flightplan':  return <FlightPlan />;
    case 'acars':       return <AcarsPage />;
    case 'settings':    return <SettingsPage />;
    case 'logbook':     return <LogbookPage />;
    default:            return <AcarsPage />;
  }
}

export default function App() {
  const { theme, updateChannel } = useEFBStore();
  const [offline, setOffline] = useState(!navigator.onLine);
  const [updateReady, setUpdateReady] = useState(false);
  const [forceModal, setForceModal] = useState(false);

  useEffect(() => {
    const startTime = Date.now();
    const cleanup = window.electronAPI?.onUpdateStatus?.(({ status }) => {
      if (status === 'downloaded') {
        setUpdateReady(true);
        setForceModal(Date.now() - startTime < 2 * 60 * 1000);
      } else if (status === 'info') {
        // macOS: browser was opened for manual install — dismiss force modal
        setForceModal(false);
      }
    });
    return () => { cleanup?.(); };
  }, []);

  useAcarsPolling();
  useSimPosition();
  useFlightTracking();

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Derive update channel from app version on first launch, then sync to main process
  const { setUpdateChannel } = useEFBStore();
  useEffect(() => {
    window.electronAPI?.appVersion?.().then(v => {
      const isDev = v?.includes('-dev') || v?.includes('-alpha') || v?.includes('-beta');
      const derived = isDev ? 'dev' : 'stable';
      setUpdateChannel(derived);
      window.electronAPI?.setUpdateChannel?.(derived);
    }).catch(() => {
      window.electronAPI?.setUpdateChannel?.(updateChannel);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const on  = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener('online',  on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[var(--c-base)]">
      {updateReady && forceModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center">
          <div className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-xl p-8 max-w-sm w-full mx-4 text-center space-y-4">
            <div className="w-12 h-12 bg-green-600 rounded-full flex items-center justify-center mx-auto">
              <Zap size={24} className="text-white" />
            </div>
            <h2 className="text-white font-semibold text-lg">Update verfügbar</h2>
            <p className="text-gray-400 text-sm">Eine neue Version von OpsLink wurde heruntergeladen und ist bereit zur Installation.</p>
            <button
              onClick={() => window.electronAPI?.installUpdate?.()}
              className="w-full bg-green-600 hover:bg-green-700 text-white px-4 py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              <Zap size={16} /> Jetzt neu starten & installieren
            </button>
          </div>
        </div>
      )}
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
