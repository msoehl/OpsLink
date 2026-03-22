import { useEFBStore } from '../../store/efbStore';
import { Clock, Sun, Moon, Minus, Square, X } from 'lucide-react';
import { useEffect, useState } from 'react';

function UTCClock() {
  const [time, setTime] = useState('');

  useEffect(() => {
    const update = () => {
      const now = new Date();
      const hh = now.getUTCHours().toString().padStart(2, '0');
      const mm = now.getUTCMinutes().toString().padStart(2, '0');
      const ss = now.getUTCSeconds().toString().padStart(2, '0');
      setTime(`${hh}:${mm}:${ss}Z`);
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="flex items-center gap-1.5 text-sm font-mono text-gray-300">
      <Clock size={14} className="text-gray-500" />
      {time}
    </div>
  );
}

function WindowControls({ isMaximized }: { isMaximized: boolean }) {
  const api = window.electronAPI;
  if (!api) return null;
  return (
    <div className="flex items-stretch h-full ml-2 -mr-4">
      <button
        onClick={() => api.windowMinimize()}
        className="w-11 flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
        title="Minimieren">
        <Minus size={12} />
      </button>
      <button
        onClick={() => api.windowMaximize()}
        className="w-11 flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/10 transition-colors"
        title={isMaximized ? 'Wiederherstellen' : 'Maximieren'}>
        {isMaximized
          ? <svg width="11" height="11" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.2"><rect x="2" y="0" width="8" height="8" rx="0.5"/><rect x="0" y="2" width="8" height="8" rx="0.5" fill="var(--c-depth)"/></svg>
          : <Square size={11} />}
      </button>
      <button
        onClick={() => api.windowClose()}
        className="w-11 flex items-center justify-center text-gray-500 hover:text-white hover:bg-red-600 transition-colors"
        title="Schließen">
        <X size={12} />
      </button>
    </div>
  );
}

export default function TopBar() {
  const { ofp, theme, setTheme } = useEFBStore();
  const [isWindows, setIsWindows] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api) return;
    api.platform().then(p => setIsWindows(p === 'win32'));
    api.windowIsMaximized().then(setIsMaximized);
    const onResize = () => api.windowIsMaximized().then(setIsMaximized);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const flightInfo = ofp
    ? `${ofp.atc?.callsign || ''} · ${ofp.origin?.icao_code} → ${ofp.destination?.icao_code}`
    : null;

  return (
    <header style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      className={`h-10 bg-[var(--c-depth)] border-b border-[var(--c-border)] flex items-center justify-between shrink-0 ${isWindows ? 'pl-4' : 'pl-20'} ${isWindows ? 'pr-0' : 'pr-4'}`}>
      <div className="flex items-center gap-3">
        <span className="text-xs font-bold tracking-widest text-blue-400 uppercase">OpenEFB</span>
        {flightInfo && (
          <>
            <span className="text-gray-600">·</span>
            <span className="text-xs text-gray-400 font-mono">{flightInfo}</span>
          </>
        )}
      </div>
      <div className="flex items-center gap-3 h-full" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="flex items-center justify-center w-7 h-7 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-[var(--c-border)] transition-colors"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </button>
        <UTCClock />
        {isWindows && <WindowControls isMaximized={isMaximized} />}
      </div>
    </header>
  );
}
