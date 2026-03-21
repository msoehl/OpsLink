import { useEFBStore } from '../../store/efbStore';
import { Clock } from 'lucide-react';
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
  const { ofp } = useEFBStore();

  const flightInfo = ofp
    ? `${ofp.atc?.callsign || ''} · ${ofp.origin?.icao_code} → ${ofp.destination?.icao_code}`
    : null;

  return (
    <header className="h-10 bg-[#0d1117] border-b border-[#1f2937] flex items-center justify-between px-4 shrink-0">
      <div className="flex items-center gap-3">
        <span className="text-xs font-bold tracking-widest text-blue-400 uppercase">OpenEFB</span>
        {flightInfo && (
          <>
            <span className="text-gray-600">·</span>
            <span className="text-xs text-gray-400 font-mono">{flightInfo}</span>
          </>
        )}
      </div>
      <UTCClock />
    </header>
  );
}
