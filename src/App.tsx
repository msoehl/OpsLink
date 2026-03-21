import { useEFBStore } from './store/efbStore';
import Sidebar from './components/layout/Sidebar';
import TopBar from './components/layout/TopBar';
import Dashboard from './pages/Dashboard';
import FlightPlan from './pages/FlightPlan';
import Charts from './pages/Charts';
import Weather from './pages/Weather';
import Performance from './pages/Performance';
import SettingsPage from './pages/Settings';

function PageContent() {
  const { activePage } = useEFBStore();
  switch (activePage) {
    case 'dashboard': return <Dashboard />;
    case 'flightplan': return <FlightPlan />;
    case 'charts': return <Charts />;
    case 'weather': return <Weather />;
    case 'performance': return <Performance />;
    case 'settings': return <SettingsPage />;
    default: return <Dashboard />;
  }
}

export default function App() {
  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-[#0a0e1a]">
      <TopBar />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-hidden">
          <PageContent />
        </main>
      </div>
    </div>
  );
}
