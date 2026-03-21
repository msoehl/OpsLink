import { useState } from 'react';
import { useEFBStore } from '../../store/efbStore';
import { Map, ExternalLink, Info } from 'lucide-react';

const CHART_SOURCES = [
  {
    id: 'navigraph',
    name: 'Navigraph Charts',
    url: 'https://charts.navigraph.com',
    description: 'Professional aviation charts (subscription required)',
    external: true,
  },
  {
    id: 'openaip',
    name: 'OpenAIP',
    url: (icao: string) => `https://www.openaip.net/airports/${icao}`,
    description: 'Free community-maintained charts',
    external: true,
  },
  {
    id: 'skyvector',
    name: 'SkyVector',
    url: (icao: string) => `https://skyvector.com/airport/${icao}`,
    description: 'Free aeronautical charts',
    external: true,
  },
];

export default function Charts() {
  const { ofp } = useEFBStore();
  const [icaoInput, setIcaoInput] = useState('');
  const [selectedIcao, setSelectedIcao] = useState('');

  const suggestedAirports = ofp
    ? [
        { icao: ofp.origin.icao_code, label: 'Origin' },
        { icao: ofp.destination.icao_code, label: 'Destination' },
        ...(ofp.alternate?.icao_code
          ? [{ icao: ofp.alternate.icao_code, label: 'Alternate' }]
          : []),
      ]
    : [];

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (icaoInput.trim().length >= 3) {
      setSelectedIcao(icaoInput.trim().toUpperCase());
    }
  }

  return (
    <div className="flex flex-col h-full p-5 gap-5 overflow-auto">
      {/* Search */}
      <div>
        <h2 className="text-base font-semibold text-white mb-3">Airport Charts</h2>
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={icaoInput}
            onChange={(e) => setIcaoInput(e.target.value.toUpperCase())}
            placeholder="ICAO Code (e.g. EDDF)"
            maxLength={4}
            className="bg-[#111827] border border-[#1f2937] text-white rounded-lg px-3 py-2 text-sm font-mono w-40 focus:outline-none focus:border-blue-500"
          />
          <button
            type="submit"
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
          >
            Search
          </button>
        </form>
      </div>

      {/* Flight plan airports */}
      {suggestedAirports.length > 0 && (
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">From Flight Plan</div>
          <div className="flex gap-2">
            {suggestedAirports.map(({ icao, label }) => (
              <button
                key={icao}
                onClick={() => { setSelectedIcao(icao); setIcaoInput(icao); }}
                className={`px-3 py-2 rounded-lg border text-sm transition-colors ${
                  selectedIcao === icao
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-[#111827] border-[#1f2937] text-gray-300 hover:border-gray-600'
                }`}
              >
                <span className="font-mono font-bold">{icao}</span>
                <span className="text-xs text-gray-400 ml-2">{label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Chart sources */}
      {selectedIcao ? (
        <div>
          <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">
            Charts for <span className="text-white font-mono">{selectedIcao}</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {CHART_SOURCES.map((source) => {
              const url = typeof source.url === 'function' ? source.url(selectedIcao) : source.url;
              return (
                <a
                  key={source.id}
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-[#111827] border border-[#1f2937] hover:border-blue-500 rounded-lg p-4 flex flex-col gap-2 transition-colors group"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-white text-sm">{source.name}</span>
                    <ExternalLink size={14} className="text-gray-500 group-hover:text-blue-400" />
                  </div>
                  <p className="text-xs text-gray-500">{source.description}</p>
                </a>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center flex-1 text-gray-600">
          <Map size={40} className="mb-3" />
          <p className="text-sm">Enter an ICAO code or select an airport from your flight plan</p>
          <div className="flex items-center gap-1.5 mt-4 text-xs text-gray-600 bg-[#111827] border border-[#1f2937] rounded-lg px-3 py-2 max-w-sm text-center">
            <Info size={12} className="shrink-0" />
            Full chart integration (Navigraph/Jeppesen) coming soon. External links available now.
          </div>
        </div>
      )}
    </div>
  );
}
