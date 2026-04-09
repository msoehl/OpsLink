import { useState, useEffect } from 'react';
import { useEFBStore } from '../../store/efbStore';
import { fetchOFP } from '../../services/simbrief/api';
import { formatTime, formatFuel, formatWeight } from '../../services/simbrief/api';
import { fetchAllVatsimATIS, type ATISResult } from '../../services/atis/vatsim';
import { fetchAllIvaoATIS } from '../../services/atis/ivao';
import { Loader2, RefreshCw, AlertCircle, Plane, Clock, Route, ScrollText, Cloud, Radio, WifiOff, MonitorCheck, FileText, RotateCcw } from 'lucide-react';
import type { LogbookEntry } from '../../types/logbook';
import clsx from 'clsx';

// ── OFP tab ───────────────────────────────────────────────────────────────────

function cleanHtml(html: string): string {
  return html
    .replace(/<html[^>]*>/gi, '').replace(/<\/html>/gi, '')
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
    .replace(/<body[^>]*>/gi, '').replace(/<\/body>/gi, '');
}

function OFPTab() {
  const { ofp } = useEFBStore();
  if (!ofp) return null;
  const html = ofp.text?.plan_html ? cleanHtml(ofp.text.plan_html) : null;
  if (!html) return (
    <div className="flex flex-col items-center justify-center h-full text-gray-500">
      <ScrollText size={36} className="mb-3" />
      <p className="text-sm">No OFP available in this flight plan.</p>
    </div>
  );
  return (
    <div className="overflow-auto flex-1 p-5">
      <div className="ofp-html" dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

// ── Weather tab ───────────────────────────────────────────────────────────────

function formatTaf(taf: string): { tag: string; tagColor: string; content: string }[] {
  if (!taf || typeof taf !== 'string') return [];
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

function WeatherCard({ icao, label, metar, taf }: { icao: string; label: string; metar: string; taf: string }) {
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

function AtisCard({ icao, result, loading, network }: { icao: string; result: ATISResult | null; loading: boolean; network: 'vatsim' | 'ivao' }) {
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
            {result.code && <span className="font-mono font-bold text-xl text-amber-400">{result.code}</span>}
            <span className="text-xs text-green-400 bg-green-400/10 border border-green-400/20 px-2 py-0.5 rounded">ONLINE</span>
            <span className="text-xs text-gray-500 font-mono">{result.frequency} MHz</span>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-xs text-gray-500">
            <WifiOff size={12} /> Not online
          </div>
        )}
      </div>
      {result && result.lines.length > 0 && (
        <div className="font-mono text-xs text-gray-300 bg-[var(--c-depth)] rounded p-2.5 leading-relaxed">
          {result.lines.join(' ')}
        </div>
      )}
      {!loading && !result && (
        <div className="text-xs text-gray-600 italic">No ATIS found on {networkLabel} for {icao}.</div>
      )}
    </div>
  );
}

function WeatherTab() {
  const { ofp, atisNetwork } = useEFBStore();
  const [atisData, setAtisData] = useState<Record<string, ATISResult[]>>({});
  const [atisLoading, setAtisLoading] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [countdown, setCountdown] = useState(300);

  const airports = ofp ? [
    { icao: ofp.origin.icao_code,      label: 'Origin',      metar: ofp.weather?.orig_metar ?? '', taf: ofp.weather?.orig_taf ?? '' },
    { icao: ofp.destination.icao_code, label: 'Destination', metar: ofp.weather?.dest_metar ?? '', taf: ofp.weather?.dest_taf ?? '' },
    ...(ofp.alternate?.icao_code
      ? [{ icao: ofp.alternate.icao_code, label: 'Alternate', metar: ofp.weather?.altn_metar ?? '', taf: ofp.weather?.altn_taf ?? '' }]
      : []),
  ] : [];

  useEffect(() => {
    if (airports.length === 0) return;
    setCountdown(300);
    setAtisLoading(true);
    const fetchFn = atisNetwork === 'ivao' ? fetchAllIvaoATIS : fetchAllVatsimATIS;
    Promise.all(
      airports.map(async ({ icao }) => {
        const results = await fetchFn(icao).catch(() => []);
        return [icao, results] as [string, ATISResult[]];
      })
    ).then((results) => {
      setAtisData(Object.fromEntries(results));
    }).finally(() => setAtisLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ofp?.params?.request_id, atisNetwork, refreshTick]);

  useEffect(() => {
    const id = setInterval(() => {
      setCountdown(c => {
        if (c <= 1) {
          setRefreshTick(t => t + 1);
          return 300;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  function manualRefresh() { setRefreshTick(t => t + 1); setCountdown(300); }

  if (!ofp) return (
    <div className="flex flex-col items-center justify-center h-full text-gray-500">
      <Cloud size={40} className="mb-3" />
      <p className="text-sm">No flight plan loaded.</p>
    </div>
  );

  return (
    <div className="p-5 overflow-auto flex-1 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-white">Weather</h2>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">SimBrief METAR/TAF · {atisNetwork === 'ivao' ? 'IVAO' : 'VATSIM'} ATIS</span>
          <button
            onClick={manualRefresh}
            disabled={atisLoading}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white border border-[var(--c-border)] hover:border-[var(--c-border2)] px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50"
          >
            {atisLoading
              ? <Loader2 size={11} className="animate-spin" />
              : <RefreshCw size={11} />}
            <span className="font-mono text-[10px] text-gray-500">{atisLoading ? '…' : `${countdown}s`}</span>
          </button>
        </div>
      </div>
      {airports.map(({ icao, label, metar, taf }) => (
        <div key={icao} className="space-y-2">
          <WeatherCard icao={icao} label={label} metar={metar} taf={taf} />
          {atisLoading || (atisData[icao] ?? []).length === 0 ? (
            <AtisCard icao={icao} result={null} loading={atisLoading} network={atisNetwork} />
          ) : (
            (atisData[icao] ?? []).map(result => (
              <AtisCard key={result.callsign} icao={result.callsign} result={result} loading={false} network={atisNetwork} />
            ))
          )}
        </div>
      ))}
    </div>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-lg p-4">
      <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</div>
      <div className="text-xl font-mono font-semibold text-white">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const {
    ofp, setOFP, isLoadingOFP, setIsLoadingOFP,
    ofpError, setOFPError, simbriefUsername, setActivePage, clearAcarsMessages, setCpdlcStation,
    hoppieConnected, simConnected, simSource, openLogbookEntry, resetAcarsPhaseTracking,
  } = useEFBStore();
  const [tab, setTab] = useState<'overview' | 'ofp' | 'weather'>('overview');

  // First-run onboarding: no username set yet
  if (!simbriefUsername) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-5">
        <div className="text-center">
          <Plane size={48} className="text-blue-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">Welcome to OpsLink</h2>
          <p className="text-gray-400 text-sm max-w-sm">
            To get started, enter your SimBrief username in Settings.
            Your flight plans will then be available here.
          </p>
        </div>
        <button
          onClick={() => setActivePage('settings')}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors text-sm"
        >
          Open Settings
        </button>
      </div>
    );
  }

  async function loadOFP() {
    if (!simbriefUsername) {
      setActivePage('settings');
      return;
    }
    setIsLoadingOFP(true);
    setOFPError(null);
    try {
      const data = await fetchOFP(simbriefUsername);
      setOFP(data);
      clearAcarsMessages();
      setCpdlcStation('');
      // Create logbook entry for this flight
      const entry: LogbookEntry = {
        id: `${data.params.request_id}-${Date.now()}`,
        date: new Date().toISOString().slice(0, 10),
        callsign: data.atc.callsign,
        dep: data.origin.icao_code,
        arr: data.destination.icao_code,
        offBlockUtc: '',
        onBlockUtc: '',
        flightTimeMin: 0,
        simulator: null,
        notes: '',
        phaseHistory: [],
        acarsMessages: [],
        acType: data.aircraft.icaocode,
        acReg: data.aircraft.reg ?? '',
        ofpRequestId: data.params.request_id,
      };
      openLogbookEntry(entry);
    } catch (e) {
      setOFPError(e instanceof Error ? e.message : 'Failed to load flight plan.');
    } finally {
      setIsLoadingOFP(false);
    }
  }

  if (!ofp) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-6">
        <div className="text-center">
          <Plane size={48} className="text-blue-600 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">No Flight Plan Loaded</h2>
          <p className="text-gray-400 text-sm max-w-xs">
            Load your SimBrief OFP to get started. Make sure your username is set in Settings.
          </p>
        </div>

        {ofpError && (
          <div className="flex items-center gap-2 text-red-400 text-sm bg-red-400/10 px-4 py-2 rounded-lg border border-red-400/20">
            <AlertCircle size={16} />
            {ofpError}
          </div>
        )}

        <button
          onClick={loadOFP}
          disabled={isLoadingOFP}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-lg font-medium transition-colors"
        >
          {isLoadingOFP ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
          {isLoadingOFP ? 'Loading...' : 'Load SimBrief OFP'}
        </button>
      </div>
    );
  }

  const { general, origin, destination, alternate, times, fuel, aircraft, weights, atc, params } = ofp;

  function fmtUtc(unix: string): string {
    const ts = parseInt(unix);
    if (isNaN(ts) || ts === 0) return '—';
    const d = new Date(ts * 1000);
    return d.getUTCHours().toString().padStart(2, '0') + ':' +
           d.getUTCMinutes().toString().padStart(2, '0') + 'Z';
  }
  const units = typeof general.units === 'string' ? general.units : 'kgs';

  function parseWind(metar: string): { dir: number | null; spd: number; gust: number | null; vrb: boolean } | null {
    if (!metar || typeof metar !== 'string') return null;
    const m = metar.match(/\b(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?KT\b/);
    if (!m) return null;
    return { vrb: m[1] === 'VRB', dir: m[1] === 'VRB' ? null : parseInt(m[1]), spd: parseInt(m[2]), gust: m[3] ? parseInt(m[3]) : null };
  }

  const ofpAgeHours = (() => {
    const ts = parseInt(params.time_generated);
    if (isNaN(ts) || ts === 0) return 0;
    return (Date.now() / 1000 - ts) / 3600;
  })();

  return (
    <div className="flex flex-col h-full">
      {/* Sub-page views */}
      {tab === 'ofp' && (
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--c-border)] shrink-0">
            <button onClick={() => setTab('overview')} className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors">← Back</button>
            <span className="text-xs text-gray-400">OFP Text</span>
          </div>
          <OFPTab />
        </div>
      )}
      {tab === 'weather' && (
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--c-border)] shrink-0">
            <button onClick={() => setTab('overview')} className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors">← Back</button>
            <span className="text-xs text-gray-400">Weather & ATIS</span>
          </div>
          <WeatherTab />
        </div>
      )}

      {/* Overview */}
      {tab === 'overview' && <div className="p-4 overflow-auto flex-1">
      {/* Connection status row */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className={clsx('flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] border font-mono',
          hoppieConnected === true ? 'border-green-500/40 bg-green-500/5 text-green-400'
          : hoppieConnected === false ? 'border-red-500/40 bg-red-500/5 text-red-400'
          : 'border-[var(--c-border)] text-gray-500')}>
          <Radio size={9} />
          {hoppieConnected === true ? 'Hoppie OK' : hoppieConnected === false ? 'Hoppie Offline' : 'Hoppie —'}
        </div>
        <div className={clsx('flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] border font-mono',
          simConnected ? 'border-blue-500/40 bg-blue-500/5 text-blue-400' : 'border-[var(--c-border)] text-gray-500')}>
          <MonitorCheck size={9} />
          {simConnected ? `Sim: ${{ msfs: 'MSFS', p3d: 'P3D', xplane: 'X-Plane' }[simSource!] ?? 'OK'}` : 'Sim: —'}
        </div>
        {ofpAgeHours > 2 && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] border border-amber-500/40 bg-amber-500/5 text-amber-400 font-mono">
            <AlertCircle size={9} />
            OFP {Math.floor(ofpAgeHours)}h old
          </div>
        )}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <span className="text-2xl font-bold text-white font-mono">
              {origin.icao_code} → {destination.icao_code}
            </span>
            <span className="text-sm text-gray-400">{destination.name}</span>
          </div>
          <div className="flex items-center gap-4 text-sm text-gray-400">
            <span className="font-mono text-blue-400">{atc.callsign}</span>
            <span>{aircraft.icaocode} · {aircraft.reg}</span>
            <span>FLT {general.flight_number}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setTab('weather')}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white border border-[var(--c-border)] hover:border-[var(--c-border2)] px-2.5 py-1.5 rounded-lg transition-colors">
            <Cloud size={13} /> Weather
          </button>
          <button onClick={() => setTab('ofp')}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white border border-[var(--c-border)] hover:border-[var(--c-border2)] px-2.5 py-1.5 rounded-lg transition-colors">
            <FileText size={13} /> OFP
          </button>
          <button
            onClick={() => {
              resetAcarsPhaseTracking();
              if (ofp) {
                const entry: LogbookEntry = {
                  id: `${ofp.params.request_id}-${Date.now()}`,
                  date: new Date().toISOString().slice(0, 10),
                  callsign: ofp.atc.callsign,
                  dep: ofp.origin.icao_code,
                  arr: ofp.destination.icao_code,
                  offBlockUtc: '',
                  onBlockUtc: '',
                  flightTimeMin: 0,
                  simulator: null,
                  notes: '',
                  phaseHistory: [],
                  acarsMessages: [],
                  acType: ofp.aircraft.icaocode,
                  acReg: ofp.aircraft.reg ?? '',
                  ofpRequestId: ofp.params.request_id,
                };
                openLogbookEntry(entry);
              }
            }}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white border border-[var(--c-border)] hover:border-[var(--c-border2)] px-2.5 py-1.5 rounded-lg transition-colors"
            title="Reset phase tracking for a new flight on the same OFP"
          >
            <RotateCcw size={13} /> New Flight
          </button>
          <button
            onClick={loadOFP}
            disabled={isLoadingOFP}
            className={`flex items-center gap-1.5 text-xs border px-2.5 py-1.5 rounded-lg transition-colors ${
              ofpAgeHours > 2
                ? 'text-amber-400 border-amber-400/30 hover:border-amber-400/60'
                : 'text-gray-400 hover:text-white border-[var(--c-border)] hover:border-[var(--c-border2)]'
            }`}
          >
            {isLoadingOFP ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            {ofpAgeHours > 2 ? `${Math.floor(ofpAgeHours)}h old` : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Route */}
      <div className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-lg p-3 mb-3 font-mono text-xs text-gray-300 leading-relaxed">
        <div className="text-gray-500 text-[10px] uppercase tracking-wider mb-1 flex items-center gap-1">
          <Route size={10} /> Route
        </div>
        {typeof general.route === 'string' ? general.route : '—'}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        <StatCard
          label="Block Fuel"
          value={formatFuel(fuel.plan_ramp, units)}
          sub={`Burn: ${formatFuel(fuel.enroute_burn, units)}`}
        />
        <StatCard
          label="Flight Time"
          value={formatTime(times.est_time_enroute)}
          sub={`Block: ${formatTime(times.est_block)}`}
        />
        <StatCard
          label="Init FL"
          value={`FL${(parseInt(general.initial_altitude) / 100).toFixed(0)}`}
          sub={(() => {
            const pa = parseInt(general.planned_altitude);
            return isNaN(pa) ? '—' : `Plan: FL${(pa / 100).toFixed(0)}`;
          })()}
        />
        <StatCard
          label="Est TOW"
          value={formatWeight(weights.est_tow, units)}
          sub={`ZFW: ${formatWeight(weights.est_zfw, units)}`}
        />
      </div>

      {/* Weights sub-row */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        {[
          { label: 'Taxi', value: fuel.taxi },
          { label: 'Reserve', value: fuel.reserve },
          { label: 'Extra', value: fuel.extra },
        ].map(({ label, value }) => (
          <div key={label} className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-lg px-3 py-2 flex items-center justify-between">
            <span className="text-xs text-gray-500">{label}</span>
            <span className="font-mono text-sm text-white">{formatFuel(value, units)}</span>
          </div>
        ))}
      </div>

      {/* Airports */}
      {/* METAR/TAF detail → Weather tab */}
      {(() => {
        const entries = [
          { label: 'ORIGIN', airport: origin, time: fmtUtc(times.est_off), timeLabel: 'ETD' },
          { label: 'DESTINATION', airport: destination, time: fmtUtc(times.est_on), timeLabel: 'ETA' },
          ...(alternate?.icao_code && typeof alternate.icao_code === 'string'
            ? [{ label: 'ALTERNATE', airport: alternate, time: fmtUtc(alternate.est_time_utc), timeLabel: 'ETA' }]
            : []),
        ];
        return (
          <div className={`grid gap-2 ${entries.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
            {entries.map(({ label, airport, time, timeLabel }) => {
              const wind = parseWind(airport.metar);
              return (
                <div key={label} className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-lg p-3">
                  <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">{label}</div>
                  <div className="flex items-baseline gap-2 mb-0.5">
                    <span className="text-xl font-bold font-mono text-white">{airport.icao_code}</span>
                    <span className="text-xs text-gray-400">{airport.iata_code}</span>
                  </div>
                  <div className="text-xs text-gray-400 mb-2 truncate">{airport.name}</div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Clock size={10} />
                      <span className="text-gray-600">{timeLabel}</span>
                      <span className="text-gray-300">{time}</span>
                    </span>
                    <span>RWY {(typeof airport.plan_rwy === 'string' && airport.plan_rwy) ? airport.plan_rwy : '—'}</span>
                    {wind && (
                      <span className="font-mono">
                        {wind.vrb ? 'VRB' : `${String(wind.dir).padStart(3, '0')}°`}{' '}{wind.spd}kt
                        {wind.gust ? <span className="text-amber-400"> G{wind.gust}</span> : null}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* SID / STAR */}
      {(() => {
        const fixes = ofp.navlog?.fix ?? [];
        // Procedure name heuristic: letters followed by digit + optional letter (e.g. DEGES2N, TENLO3A)
        const isProcedure = (t: string) => /^[A-Z]{2,6}\d[A-Z]?$/.test(t);
        const routeTokens = typeof general.route === 'string' ? general.route.trim().split(/\s+/) : [];
        const sid  = routeTokens.length > 0 && isProcedure(routeTokens[0])  ? routeTokens[0]  : null;
        const star = routeTokens.length > 1 && isProcedure(routeTokens[routeTokens.length - 1]) ? routeTokens[routeTokens.length - 1] : null;
        if (!sid && !star) return null;

        // Find navlog waypoints belonging to SID (first fixes until type changes) and STAR (last fixes)
        const nonApt = fixes.filter(f => f.type !== 'apt' && f.type !== 'airport');
        const sidFixes  = nonApt.slice(0, 6).map(f => f.ident);
        const starFixes = nonApt.slice(-6).map(f => f.ident);

        return (
          <div className="mt-3 grid grid-cols-2 gap-2">
            {sid && (
              <div className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-lg p-3">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">
                  SID · RWY {origin.plan_rwy || '—'}
                </div>
                <div className="font-mono text-sm font-bold text-blue-400 mb-1.5">{sid}</div>
                <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                  {sidFixes.map((id, i) => (
                    <span key={i} className="text-[10px] font-mono text-gray-400">
                      {id}{i < sidFixes.length - 1 ? ' →' : ''}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {star && (
              <div className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-lg p-3">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">
                  STAR · RWY {destination.plan_rwy || '—'}
                </div>
                <div className="font-mono text-sm font-bold text-green-400 mb-1.5">{star}</div>
                <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                  {starFixes.map((id, i) => (
                    <span key={i} className="text-[10px] font-mono text-gray-400">
                      {i === 0 ? '' : '→ '}{id}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      </div>}
    </div>
  );
}
