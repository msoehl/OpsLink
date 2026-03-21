import { useEffect, useState } from 'react';
import { useEFBStore } from '../../store/efbStore';
import { fetchVatsimATIS, type ATISResult } from '../../services/atis/vatsim';
import { fetchIvaoATIS } from '../../services/atis/ivao';
import { Cloud, Radio, Loader2, WifiOff } from 'lucide-react';

function formatTaf(taf: string): { tag: string; tagColor: string; content: string }[] {
  if (!taf || typeof taf !== 'string') return [];
  // Split on FM/TEMPO/BECMG/PROB keeping the delimiter
  const parts = taf.split(/(?=\b(?:FM|TEMPO|BECMG|PROB\d{2})\b)/);
  return parts.map((part) => {
    const trimmed = part.trim();
    const tagMatch = trimmed.match(/^(FM\d{6}|TEMPO|BECMG|PROB\d{2})/);
    if (!tagMatch) return { tag: 'BASE', tagColor: 'text-gray-400', content: trimmed };
    const tag = tagMatch[1];
    const content = trimmed.slice(tag.length).trim();
    const tagColor = tag.startsWith('FM') ? 'text-blue-400'
      : tag === 'TEMPO' ? 'text-amber-400'
      : tag === 'BECMG' ? 'text-green-400'
      : 'text-purple-400';
    return { tag, tagColor, content };
  }).filter(p => p.content.length > 0);
}

function WeatherCard({ icao, label, metar, taf }: {
  icao: string;
  label: string;
  metar: string;
  taf: string;
}) {
  const tafBlocks = formatTaf(taf);

  return (
    <div className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="font-mono font-bold text-white text-lg">{icao}</span>
        <span className="text-xs text-gray-500 uppercase tracking-wider bg-[var(--c-depth)] px-2 py-0.5 rounded">{label}</span>
      </div>

      <div className="mb-3">
        <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">METAR</div>
        <div className="font-mono text-xs text-green-300 bg-[var(--c-depth)] rounded p-2.5 leading-relaxed">
          {typeof metar === 'string' && metar ? metar : 'Not available'}
        </div>
      </div>

      {tafBlocks.length > 0 && (
        <div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">TAF</div>
          <div className="bg-[var(--c-depth)] rounded p-2.5 space-y-1.5">
            {tafBlocks.map((block, i) => (
              <div key={i} className="flex gap-2 font-mono text-xs leading-relaxed">
                <span className={`shrink-0 font-semibold ${block.tagColor} w-16`}>{block.tag}</span>
                <span className="text-blue-100 opacity-80">{block.content}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function AtisCard({ icao, result, loading, network }: {
  icao: string;
  result: ATISResult | null;
  loading: boolean;
  network: 'vatsim' | 'ivao';
}) {
  const networkLabel = network === 'ivao' ? 'IVAO' : 'VATSIM';
  return (
    <div className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Radio size={14} className="text-gray-500" />
          <span className="text-sm font-medium text-white">{icao} — {networkLabel} ATIS</span>
        </div>
        {loading ? (
          <Loader2 size={14} className="animate-spin text-gray-500" />
        ) : result ? (
          <div className="flex items-center gap-2">
            {result.code && (
              <span className="font-mono font-bold text-xl text-amber-400">{result.code}</span>
            )}
            <span className="text-xs text-green-400 bg-green-400/10 border border-green-400/20 px-2 py-0.5 rounded">
              ONLINE
            </span>
            <span className="text-xs text-gray-500 font-mono">{result.frequency} MHz</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <WifiOff size={12} />
            Not online
          </div>
        )}
      </div>

      {result && result.lines.length > 0 && (
        <div className="font-mono text-xs text-gray-300 bg-[var(--c-depth)] rounded p-2.5 leading-relaxed">
          {result.lines.join(' ')}
        </div>
      )}

      {!loading && !result && (
        <div className="text-xs text-gray-600 italic">
          No ATIS found on {networkLabel} for {icao}.
        </div>
      )}
    </div>
  );
}

export default function Weather() {
  const { ofp, atisNetwork } = useEFBStore();
  const [atisData, setAtisData] = useState<Record<string, ATISResult | null>>({});
  const [atisLoading, setAtisLoading] = useState(false);

  const airports = ofp
    ? [
        { icao: ofp.origin.icao_code, label: 'Origin', metar: ofp.weather.orig_metar, taf: ofp.weather.orig_taf },
        { icao: ofp.destination.icao_code, label: 'Destination', metar: ofp.weather.dest_metar, taf: ofp.weather.dest_taf },
        ...(ofp.alternate?.icao_code
          ? [{ icao: ofp.alternate.icao_code, label: 'Alternate', metar: ofp.weather.altn_metar, taf: ofp.weather.altn_taf }]
          : []),
      ]
    : [];

  useEffect(() => {
    if (airports.length === 0) return;
    setAtisLoading(true);
    const fetchFn = atisNetwork === 'ivao' ? fetchIvaoATIS : fetchVatsimATIS;
    Promise.all(
      airports.map(async ({ icao }) => {
        const result = await fetchFn(icao).catch(() => null);
        return [icao, result] as [string, ATISResult | null];
      })
    ).then((results) => {
      setAtisData(Object.fromEntries(results));
    }).finally(() => setAtisLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ofp?.params?.request_id, atisNetwork]);

  if (!ofp) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500">
        <Cloud size={40} className="mb-3" />
        <p>No flight plan loaded. Go to Dashboard to load SimBrief OFP.</p>
      </div>
    );
  }

  return (
    <div className="p-5 overflow-auto h-full space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-white">Weather</h2>
        <span className="text-xs text-gray-500">
          SimBrief METAR/TAF · {atisNetwork === 'ivao' ? 'IVAO' : 'VATSIM'} ATIS
        </span>
      </div>

      {airports.map(({ icao, label, metar, taf }) => (
        <div key={icao} className="space-y-2">
          <WeatherCard icao={icao} label={label} metar={metar} taf={taf} />
          <AtisCard icao={icao} result={atisData[icao] ?? null} loading={atisLoading} network={atisNetwork} />
        </div>
      ))}
    </div>
  );
}
