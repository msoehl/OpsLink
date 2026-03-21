import { useEFBStore } from '../../store/efbStore';
import { Cloud } from 'lucide-react';

function WeatherCard({ icao, label, metar, taf }: {
  icao: string;
  label: string;
  metar: string;
  taf: string;
}) {
  return (
    <div className="bg-[#111827] border border-[#1f2937] rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="font-mono font-bold text-white text-lg">{icao}</span>
        <span className="text-xs text-gray-500 uppercase tracking-wider bg-[#0d1117] px-2 py-0.5 rounded">{label}</span>
      </div>

      <div className="mb-3">
        <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">METAR</div>
        <div className="font-mono text-xs text-green-300 bg-[#0d1117] rounded p-2.5 leading-relaxed">
          {metar || 'Not available'}
        </div>
      </div>

      {taf && (
        <div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">TAF</div>
          <div className="font-mono text-xs text-blue-200 bg-[#0d1117] rounded p-2.5 leading-relaxed whitespace-pre-wrap">
            {taf}
          </div>
        </div>
      )}
    </div>
  );
}

export default function Weather() {
  const { ofp } = useEFBStore();

  if (!ofp) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500">
        <Cloud size={40} className="mb-3" />
        <p>No flight plan loaded. Go to Dashboard to load SimBrief OFP.</p>
      </div>
    );
  }

  const { origin, destination, alternate, weather } = ofp;

  const airports = [
    { icao: origin.icao_code, label: 'Origin', metar: weather.orig_metar, taf: weather.orig_taf },
    { icao: destination.icao_code, label: 'Destination', metar: weather.dest_metar, taf: weather.dest_taf },
    ...(alternate?.icao_code
      ? [{ icao: alternate.icao_code, label: 'Alternate', metar: weather.altn_metar, taf: weather.altn_taf }]
      : []),
  ];

  return (
    <div className="p-5 overflow-auto h-full">
      <h2 className="text-base font-semibold text-white mb-4">Weather</h2>
      <div className="grid grid-cols-1 gap-4">
        {airports.map(({ icao, label, metar, taf }) => (
          <WeatherCard key={icao} icao={icao} label={label} metar={metar} taf={taf} />
        ))}
      </div>
    </div>
  );
}
