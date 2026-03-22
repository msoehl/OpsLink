import { useState } from 'react';
import { useEFBStore } from '../../store/efbStore';
import { Map, ExternalLink } from 'lucide-react';

function openUrl(url: string) {
  if (typeof window !== 'undefined' && window.electronAPI?.openExternal) {
    window.electronAPI.openExternal(url);
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

interface Provider {
  name: string;
  description: string;
  cost: string;
  costColor: string;
  coverage: string;
  url: (icao: string) => string;
}

const PROVIDERS: Provider[] = [
  {
    name: 'ChartFox',
    description: 'Community-driven chart portal. Covers most major airports worldwide. VATSIM-integrated.',
    cost: 'Free',
    costColor: 'text-green-400',
    coverage: 'Global',
    url: (icao) => `https://chartfox.org/${icao}`,
  },
  {
    name: 'Navigraph Charts',
    description: 'Professional Jeppesen charts for every airport. Requires Navigraph Charts or Ultimate subscription.',
    cost: 'Subscription',
    costColor: 'text-amber-400',
    coverage: 'Global',
    url: (icao) => `https://charts.navigraph.com/airport/${icao}?section=Charts`,
  },
];

export default function Charts() {
  const { ofp } = useEFBStore();
  const [icaoInput, setIcaoInput] = useState('');
  const [selectedIcao, setSelectedIcao] = useState(
    ofp?.origin?.icao_code ?? ''
  );

  const airports = ofp
    ? [
        { icao: ofp.origin.icao_code, label: 'Origin' },
        { icao: ofp.destination.icao_code, label: 'Dest' },
        ...(ofp.alternate?.icao_code ? [{ icao: ofp.alternate.icao_code, label: 'Altn' }] : []),
      ]
    : [];

  function handleSearch(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const icao = icaoInput.trim().toUpperCase();
    if (icao.length >= 3) setSelectedIcao(icao);
  }

  return (
    <div className="p-5 overflow-auto h-full space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Map size={16} className="text-gray-400" />
          <h2 className="text-base font-semibold text-white">Charts</h2>
        </div>
        <span className="text-xs text-gray-600">Opens in external browser</span>
      </div>

      {/* Airport selector */}
      <div className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-lg p-4 space-y-3">
        <div className="text-xs text-gray-500 uppercase tracking-wider">Airport</div>
        <form onSubmit={handleSearch} className="flex gap-2">
          <input
            type="text"
            value={icaoInput}
            onChange={(e) => setIcaoInput(e.target.value.toUpperCase())}
            placeholder="Enter ICAO…"
            maxLength={4}
            className="flex-1 bg-[var(--c-depth)] border border-[var(--c-border)] focus:border-blue-500 text-white rounded-lg px-3 py-2 text-sm font-mono focus:outline-none"
          />
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Set
          </button>
        </form>

        {airports.length > 0 && (
          <div className="flex gap-2 flex-wrap">
            {airports.map(({ icao, label }) => (
              <button
                key={icao}
                onClick={() => setSelectedIcao(icao)}
                className={`px-3 py-1 rounded text-xs font-mono transition-colors ${
                  selectedIcao === icao
                    ? 'bg-blue-600 text-white'
                    : 'bg-[var(--c-depth)] border border-[var(--c-border)] text-gray-400 hover:border-[var(--c-border2)]'
                }`}
              >
                {icao}
                <span className="ml-1 opacity-50">{label}</span>
              </button>
            ))}
          </div>
        )}

        {selectedIcao && (
          <div className="text-xs text-gray-500">
            Showing charts for: <span className="font-mono text-white">{selectedIcao}</span>
          </div>
        )}
      </div>

      {/* Provider cards */}
      <div className="grid grid-cols-2 gap-3">
        {PROVIDERS.map((p) => (
          <div
            key={p.name}
            className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-lg p-4 flex flex-col gap-3 hover:border-[#2a3a55] transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-white">{p.name}</div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className={`text-xs font-medium ${p.costColor}`}>{p.cost}</span>
                  <span className="text-gray-600 text-xs">·</span>
                  <span className="text-xs text-gray-500">{p.coverage}</span>
                </div>
              </div>
            </div>

            <p className="text-xs text-gray-400 leading-relaxed flex-1">{p.description}</p>

            <button
              onClick={() => openUrl(p.url(selectedIcao || 'EDDF'))}
              className="flex items-center justify-center gap-1.5 w-full py-2 bg-[var(--c-depth)] hover:bg-[#1a2535] border border-[var(--c-border)] hover:border-blue-500/50 text-gray-300 hover:text-white rounded-lg text-xs font-medium transition-colors"
            >
              <ExternalLink size={11} />
              {selectedIcao ? `${p.name} · ${selectedIcao}` : `Open ${p.name}`}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
