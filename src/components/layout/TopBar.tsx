import { useEFBStore } from '../../store/efbStore';
import { Clock, Sun, Moon } from 'lucide-react';
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

export default function TopBar() {
  const { ofp, theme, setTheme } = useEFBStore();

  const flightInfo = ofp
    ? `${ofp.atc?.callsign || ''} · ${ofp.origin?.icao_code} → ${ofp.destination?.icao_code}`
    : null;

  return (
    <header style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      className="h-10 bg-[var(--c-depth)] border-b border-[var(--c-border)] flex items-center justify-between pl-20 pr-4 shrink-0">
      <div className="flex items-center gap-3">
        <span className="text-xs font-bold tracking-widest text-blue-400 uppercase">OpenEFB</span>
        {flightInfo && (
          <>
            <span className="text-gray-600">·</span>
            <span className="text-xs text-gray-400 font-mono">{flightInfo}</span>
          </>
        )}
      </div>
      <div className="flex items-center gap-3" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="flex items-center justify-center w-7 h-7 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-[var(--c-border)] transition-colors"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
        </button>
        <UTCClock />
      </div>
    </header>
  );
}
