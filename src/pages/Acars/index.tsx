import { useEffect, useRef, useState } from 'react';
import { useMessageActions } from './hooks/useMessageActions';
import { useEFBStore } from '../../store/efbStore';
import {
  hoppieSend, hoppieStationOnline, hoppieOnlineStations,
  parseCpdlc, buildCpdlcPacket, cpdlcNeedsResponse,
  type HoppieMessage,
} from '../../services/hoppie';
import { fetchAllVatsimATIS, type ATISResult } from '../../services/atis/vatsim';
import { fetchAllIvaoATIS } from '../../services/atis/ivao';
import {
  MessageSquare, Send, Loader2, CheckCircle, AlertCircle, Radio, Wifi, Globe,
  MapPin, Plane, Building2, ClipboardList, Search, Volume2, VolumeX, BookmarkPlus, X,
} from 'lucide-react';
import clsx from 'clsx';

type ComposeMode = 'telex' | 'pdc' | 'datis' | 'oceanic' | 'cpdlc' | 'position' | 'ops' | 'loadsheet';

const COMPOSE_MODES: { id: ComposeMode; label: string; icon: React.ElementType }[] = [
  { id: 'cpdlc',      label: 'CPDLC',      icon: Radio },
  { id: 'pdc',        label: 'PDC',        icon: MessageSquare },
  { id: 'datis',      label: 'D-ATIS',     icon: Wifi },
  { id: 'loadsheet',  label: 'Loadsheet',  icon: ClipboardList },
  { id: 'position',   label: 'Position',   icon: MapPin },
  { id: 'oceanic',    label: 'Oceanic',    icon: Globe },
  { id: 'ops',        label: 'OPS',        icon: Building2 },
  { id: 'telex',      label: 'Telex',      icon: Send },
];

function utcNow(): string {
  return new Date().toUTCString().slice(17, 22) + 'Z';
}

function msgAccent(packet: string): 'clearance' | 'unable' | 'wilco' | 'none' {
  const up = packet.toUpperCase();
  if (up.includes('UNABLE') || up.includes('NEGATIVE')) return 'unable';
  if (up.includes('WILCO') || up.includes('ROGER'))     return 'wilco';
  if (up.includes('CLEARED') || up.includes('CLEARANCE') || up.includes('APPROVED')) return 'clearance';
  return 'none';
}

const ACCENT: Record<string, string> = {
  clearance: 'border-green-500/40 bg-green-500/5',
  unable:    'border-red-500/40 bg-red-500/5',
  wilco:     'border-amber-500/40 bg-amber-500/5',
  none:      'border-[var(--c-border)] bg-[var(--c-surface)]',
};

function parsePDCMessage(packet: string): { squawk?: string; sid?: string; initialClimb?: string } | null {
  const up = packet.toUpperCase();
  if (!up.includes('PREDEP') && !up.includes('CLEARANCE') && !up.includes('SQUAWK')) return null;
  const squawk    = up.match(/SQUAWK\s+(\d{4})/)?.[1];
  const sid       = up.match(/(?:SID|DEPARTURE)\s+([A-Z]{2,6}\d[A-Z]?)/)?.[1];
  const initClimb = up.match(/(?:CLIMB TO|INITIAL CLIMB|CLB TO|CLIMB)\s+(FL\d+|\d{4,5})/)?.[1];
  return (squawk || sid || initClimb) ? { squawk, sid, initialClimb: initClimb } : null;
}

// ── small shared input ─────────────────────────────────────────────────────────

function Inp({ value, onChange, placeholder, className = '', maxLength }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string; maxLength?: number;
}) {
  return (
    <input
      type="text"
      value={value}
      maxLength={maxLength}
      onChange={e => onChange(e.target.value.toUpperCase())}
      placeholder={placeholder}
      className={clsx(
        'bg-[var(--c-depth)] border border-[var(--c-border)] focus:border-blue-500 text-white rounded-lg px-3 py-2 text-xs font-mono focus:outline-none uppercase',
        className,
      )}
    />
  );
}

// ── compose forms ──────────────────────────────────────────────────────────────

function TelexForm({ onSend, defaultTo = '' }: {
  onSend: (to: string, pkt: string) => Promise<void>;
  defaultTo?: string;
}) {
  const { acarsTemplates, addAcarsTemplate, removeAcarsTemplate } = useEFBStore();
  const [to, setTo] = useState(defaultTo);
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState('');
  const [saveName, setSaveName] = useState('');
  const [showSave, setShowSave] = useState(false);

  useEffect(() => { if (defaultTo) setTo(defaultTo); }, [defaultTo]);

  async function submit() {
    if (!to || !msg) return;
    setSending(true);
    setErr('');
    try {
      await onSend(to, msg);
      setMsg('');
      setOk(true);
      setTimeout(() => setOk(false), 2000);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setSending(false);
    }
  }

  function saveTemplate() {
    if (!saveName.trim() || !msg.trim()) return;
    addAcarsTemplate({ name: saveName.trim(), text: msg });
    setSaveName('');
    setShowSave(false);
  }

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <Inp value={to} onChange={setTo} placeholder="TO  e.g. EDDF_APP" className="w-40 shrink-0" />
        <Inp value={msg} onChange={setMsg} placeholder="Message…" className="flex-1" />
        <button
          onClick={() => setShowSave(s => !s)}
          title="Save as template"
          className="p-2 text-gray-500 hover:text-blue-400 border border-[var(--c-border)] hover:border-blue-500/50 rounded-lg transition-colors shrink-0"
        >
          <BookmarkPlus size={12} />
        </button>
        <button
          onClick={submit}
          disabled={sending || !to || !msg}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors shrink-0"
        >
          {sending ? <Loader2 size={12} className="animate-spin" /> : ok ? <CheckCircle size={12} /> : <Send size={12} />}
          Send
        </button>
      </div>
      {showSave && (
        <div className="flex gap-2">
          <input
            value={saveName}
            onChange={e => setSaveName(e.target.value)}
            placeholder="Template name…"
            className="flex-1 bg-[var(--c-depth)] border border-[var(--c-border)] focus:border-blue-500 text-white rounded-lg px-3 py-1.5 text-xs font-mono focus:outline-none"
          />
          <button onClick={saveTemplate} disabled={!saveName.trim() || !msg.trim()}
            className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors">
            Save
          </button>
          <button onClick={() => setShowSave(false)}
            className="px-2 py-1.5 border border-[var(--c-border)] text-gray-500 hover:text-gray-300 rounded-lg text-xs transition-colors">
            <X size={11} />
          </button>
        </div>
      )}
      {acarsTemplates.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-0.5">
          {acarsTemplates.map(t => (
            <div key={t.id} className="flex items-center gap-0 rounded border border-[var(--c-border)] overflow-hidden">
              <button
                onClick={() => setMsg(t.text)}
                className="px-2 py-0.5 text-[10px] font-mono text-gray-400 hover:text-white hover:bg-[var(--c-border)] transition-colors"
                title={t.text}
              >
                {t.name}
              </button>
              <button
                onClick={() => removeAcarsTemplate(t.id)}
                className="px-1 py-0.5 text-gray-700 hover:text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <X size={9} />
              </button>
            </div>
          ))}
        </div>
      )}
      {err && <p className="text-[10px] text-red-400 font-mono">{err}</p>}
    </div>
  );
}

function PDCForm({ depIcao, destIcao, atcCallsign, acType, route, onSend }: {
  depIcao: string; destIcao: string; atcCallsign: string; acType: string; route: string;
  onSend: (to: string, pkt: string) => Promise<void>;
}) {
  const [atis, setAtis] = useState('');
  const [stand, setStand] = useState('');
  const [suffix, setSuffix] = useState(depIcao);
  const [online, setOnline] = useState<string[]>([]);

  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    setSuffix(depIcao);
    setOnline([]);
    hoppieOnlineStations(depIcao).then(found => {
      setOnline(found);
      if (found.length > 0) setSuffix(found[0]);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depIcao]);

  async function submit() {
    if (!atis || !suffix) return;
    setSending(true);
    const lines = [
      'REQUEST PREDEP CLEARANCE',
      `${atcCallsign} TYPE ${acType} TO ${destIcao}`,
      `ATIS ${atis}`,
      ...(stand ? [`STAND ${stand}`] : []),
      `ROUTE ${route}`,
      'REQUEST SQUAWK AND STARTUP',
    ];
    setErr('');
    try {
      await onSend(suffix, lines.join('\n'));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        {(online.length > 0 ? online : [depIcao]).map(s => (
          <button key={s} onClick={() => setSuffix(s)}
            className={clsx('px-2.5 py-1 rounded text-[10px] font-mono border transition-colors',
              suffix === s
                ? 'bg-blue-600 border-blue-500 text-white'
                : 'bg-green-500/10 border-green-500/40 text-green-400 hover:bg-green-500/20'
            )}>
            {s}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Inp value={atis} onChange={setAtis} placeholder="ATIS e.g. A" className="w-28 shrink-0" maxLength={1} />
        <Inp value={stand} onChange={setStand} placeholder="Stand (opt.)" className="w-32 shrink-0" />
        <button
          onClick={submit}
          disabled={sending || !atis || !suffix}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors ml-auto shrink-0"
        >
          {sending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
          Request PDC
        </button>
      </div>
      {err && <p className="text-[10px] text-red-400 font-mono">{err}</p>}
    </div>
  );
}

function DAtisForm({ airports, hoppieLogon, callsign, onSend, onInject }: {
  airports: string[];
  hoppieLogon: string;
  callsign: string;
  onSend: (to: string, pkt: string) => Promise<void>;
  onInject: (msg: HoppieMessage) => void;
}) {
  const atisNetwork = useEFBStore(s => s.atisNetwork);
  // hoppieStations: all Hoppie ATIS stations found per airport
  // networkAvail: airports available via VATSIM/IVAO API
  const [hoppieStations, setHoppieStations] = useState<Record<string, string[]> | null>(null);
  const [networkStations, setNetworkStations] = useState<Record<string, ATISResult[]>>({});
  const [sending, setSending] = useState<string | null>(null);

  useEffect(() => {
    setHoppieStations(null);
    Promise.all(
      airports.map(async icao => {
        const [hoppie, network] = await Promise.all([
          hoppieOnlineStations(icao).then(s => s.filter(x => x.includes('ATIS'))),
          (atisNetwork === 'ivao' ? fetchAllIvaoATIS : fetchAllVatsimATIS)(icao).catch(() => [] as ATISResult[]),
        ]);
        return { icao, hoppie, network };
      })
    ).then(results => {
      setHoppieStations(Object.fromEntries(results.map(r => [r.icao, r.hoppie])));
      setNetworkStations(Object.fromEntries(results.map(r => [r.icao, r.network])));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [airports.join(','), hoppieLogon, callsign, atisNetwork]);

  async function requestHoppie(station: string) {
    setSending(station);
    await onSend(station, 'REQUEST ATIS');
    setSending(null);
  }

  async function requestNetwork(icao: string) {
    setSending(icao);
    try {
      const fetchFn = atisNetwork === 'ivao' ? fetchAllIvaoATIS : fetchAllVatsimATIS;
      const results = await fetchFn(icao);
      if (results.length > 0) {
        results.forEach(result => {
          const infoLine = result.code ? `INFORMATION ${result.code}\n` : '';
          onInject({ from: result.callsign, type: 'telex', packet: infoLine + result.lines.join('\n'), receivedAt: new Date() });
        });
      } else {
        onInject({ from: `${icao}_ATIS`, type: 'telex', packet: `No ATIS available for ${icao} on ${atisNetwork.toUpperCase()}`, receivedAt: new Date() });
      }
    } catch {
      onInject({ from: `${icao}_ATIS`, type: 'telex', packet: `Failed to fetch ATIS for ${icao}`, receivedAt: new Date() });
    }
    setSending(null);
  }

  const networkLabel = atisNetwork.toUpperCase();
  const hasAny = hoppieStations && airports.some(icao =>
    (hoppieStations[icao]?.length ?? 0) > 0 || (networkStations[icao]?.length ?? 0) > 0
  );

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[10px] text-gray-500 shrink-0">D-ATIS:</span>
      {hoppieStations === null ? (
        <span className="flex items-center gap-1 text-[10px] text-gray-600">
          <Loader2 size={9} className="animate-spin" /> Checking…
        </span>
      ) : (
        <>
          {airports.flatMap(icao => {
            const hpp = hoppieStations[icao] ?? [];
            // Network stations not already covered by a Hoppie station
            const net = (networkStations[icao] ?? []).filter(r =>
              !hpp.some(h => h.toUpperCase() === r.callsign.toUpperCase())
            );
            return [
              ...hpp.map(station => (
                <button key={station} onClick={() => requestHoppie(station)} disabled={sending === station}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--c-depth)] border border-[var(--c-border)] hover:border-blue-500/50 hover:text-white text-gray-400 rounded-lg text-xs font-mono transition-colors disabled:opacity-50"
                  title="Via Hoppie">
                  {sending === station ? <Loader2 size={11} className="animate-spin" /> : <Wifi size={11} className="text-green-400" />}
                  {station}
                  <span className="text-[9px] text-gray-600">HPP</span>
                </button>
              )),
              ...net.map(result => (
                <button key={result.callsign} onClick={() => requestNetwork(icao)} disabled={sending === result.callsign}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--c-depth)] border border-[var(--c-border)] hover:border-blue-500/50 hover:text-white text-gray-400 rounded-lg text-xs font-mono transition-colors disabled:opacity-50"
                  title={`Via ${networkLabel}`}>
                  {sending === result.callsign ? <Loader2 size={11} className="animate-spin" /> : <Wifi size={11} className="text-gray-500" />}
                  {result.callsign}
                  <span className="text-[9px] text-gray-600">{networkLabel}</span>
                </button>
              )),
            ];
          })}
          {!hasAny && <span className="text-[10px] text-amber-500">No ATIS available</span>}
        </>
      )}
    </div>
  );
}

const OCEANIC_CENTERS = [
  { label: 'Shanwick', id: 'EGGX_FSS' },
  { label: 'Gander',   id: 'CZQX_FSS' },
  { label: 'NY OCA',   id: 'KZWY_FSS' },
  { label: 'Oakland',  id: 'KZAK_FSS' },
  { label: 'Fukuoka',  id: 'RJJJ_FSS' },
];

function OceanicForm({ atcCallsign, acType, destIcao, cruiseFl, defaultMach, hoppieLogon, callsign, onSend }: {
  atcCallsign: string; acType: string; destIcao: string; cruiseFl: string; defaultMach: string;
  hoppieLogon: string; callsign: string;
  onSend: (to: string, pkt: string) => Promise<void>;
}) {
  const [center, setCenter] = useState('');
  const [entry, setEntry] = useState('');
  const [time, setTime] = useState('');
  const [level, setLevel] = useState('');
  const [mach, setMach] = useState('');
  const [ocRoute, setOcRoute] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');
  const [onlineCenters, setOnlineCenters] = useState<string[] | null>(null);

  useEffect(() => {
    setOnlineCenters(null);
    Promise.all(OCEANIC_CENTERS.map(c => hoppieStationOnline(hoppieLogon, callsign, c.id))).then(results => {
      setOnlineCenters(OCEANIC_CENTERS.filter((_, i) => results[i]).map(c => c.id));
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hoppieLogon, callsign]);

  async function submit() {
    if (!center || !entry) return;
    setSending(true);
    const lines = [
      'REQUEST OCEANIC CLEARANCE',
      `${atcCallsign} TYPE ${acType}`,
      `ENTRY ${entry} AT ${time || utcNow()}`,
      `LEVEL ${(level || cruiseFl).replace(/^FL?/, 'FL')}`,
      `MACH ${mach || defaultMach}`,
      ...(ocRoute ? [`ROUTE ${ocRoute}`] : []),
      `DESTINATION ${destIcao}`,
    ];
    setErr('');
    try {
      await onSend(center, lines.join('\n'));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] text-gray-500 shrink-0">Center:</span>
        {onlineCenters === null ? (
          <span className="flex items-center gap-1 text-[10px] text-gray-600"><Loader2 size={9} className="animate-spin" /> Checking…</span>
        ) : (
          OCEANIC_CENTERS.map(c => {
            const online = onlineCenters.includes(c.id);
            return (
              <button key={c.id} onClick={() => online && setCenter(c.id)} disabled={!online}
                title={online ? c.id : `${c.id} — not online`}
                className={clsx('px-2 py-1 rounded text-[10px] font-mono border transition-colors',
                  !online ? 'bg-[var(--c-depth)] border-[var(--c-border)] text-gray-700 cursor-not-allowed'
                    : center === c.id ? 'bg-blue-600 border-blue-500 text-white'
                    : 'bg-[var(--c-depth)] border-[var(--c-border)] text-gray-400 hover:border-[var(--c-border2)] hover:text-gray-300'
                )}>
                {c.label}
                {online && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />}
              </button>
            );
          })
        )}
        <Inp value={center} onChange={setCenter} placeholder="Custom e.g. EGGX_FSS" className="flex-1 min-w-36" />
      </div>
      <div className="flex gap-2 flex-wrap">
        <Inp value={entry}   onChange={setEntry}   placeholder="Entry fix *"        className="w-32 shrink-0" />
        <Inp value={time}    onChange={setTime}     placeholder={utcNow()}           className="w-24 shrink-0" />
        <Inp value={level}   onChange={setLevel}    placeholder={cruiseFl}           className="w-20 shrink-0" />
        <Inp value={mach}    onChange={setMach}     placeholder={defaultMach}        className="w-20 shrink-0" />
        <Inp value={ocRoute} onChange={setOcRoute}  placeholder="Track / Route (opt.)" className="flex-1 min-w-32" />
        <button onClick={submit} disabled={sending || !center || !entry}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors shrink-0">
          {sending ? <Loader2 size={12} className="animate-spin" /> : <Globe size={12} />}
          Request
        </button>
      </div>
      {err && <p className="text-[10px] text-red-400 font-mono">{err}</p>}
    </div>
  );
}

function PositionForm({ callsign, destIcao, cruiseFl, onSend }: {
  callsign: string; destIcao: string; cruiseFl: string;
  onSend: (to: string, pkt: string) => Promise<void>;
}) {
  const { cpdlcStation, enrouteAtc, simPosition, ofp } = useEFBStore();
  const [fix, setFix] = useState('');
  const [alt, setAlt] = useState('');
  const [to, setTo] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!to) {
      if (cpdlcStation) setTo(cpdlcStation);
      else {
        const ctr = enrouteAtc.find(c => c.facility === 6);
        if (ctr) setTo(ctr.callsign);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cpdlcStation, enrouteAtc]);

  // Auto-fill FL from sim
  useEffect(() => {
    if (simPosition && !alt) {
      setAlt(`FL${Math.round(simPosition.altFt / 100)}`);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [simPosition]);

  // Auto-fill ETA from sim groundspeed + distance to destination
  function getAutoEta(): string {
    if (!simPosition || !ofp) return '';
    const destLat = parseFloat(ofp.destination.pos_lat);
    const destLon = parseFloat(ofp.destination.pos_long);
    if (!isFinite(destLat) || !isFinite(destLon) || simPosition.groundspeedKts < 10) return '';
    const dLat = (destLat - simPosition.lat) * Math.PI / 180;
    const dLon = (destLon - simPosition.lon) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(simPosition.lat * Math.PI / 180) * Math.cos(destLat * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    const distNm = 2 * 3440.065 * Math.asin(Math.sqrt(a));
    const etaMin = Math.round(distNm / simPosition.groundspeedKts * 60);
    const eta = new Date(Date.now() + etaMin * 60000);
    return eta.getUTCHours().toString().padStart(2, '0') + eta.getUTCMinutes().toString().padStart(2, '0') + 'Z';
  }

  async function submit() {
    if (!fix || !alt || !to) return;
    setSending(true);
    setErr('');
    const lines = [
      'POSITION REPORT',
      `${callsign} POSITION ${fix} AT ${utcNow()}`,
      `LEVEL ${alt.replace(/^FL?/, 'FL')}`,
      `DESTINATION ${destIcao}`,
    ];
    try {
      await onSend(to, lines.join('\n'));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setSending(false);
    }
  }

  const autoEta = getAutoEta();

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2 flex-wrap">
        <Inp value={fix} onChange={setFix} placeholder="Fix / Waypoint *"          className="w-32 shrink-0" />
        <Inp value={alt} onChange={setAlt} placeholder={cruiseFl + ' *'}           className="w-24 shrink-0" />
        <Inp value={to}  onChange={setTo}  placeholder="ATC unit e.g. EDGG_CTR *" className="flex-1 min-w-36" />
        <button onClick={submit} disabled={sending || !fix || !alt || !to}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors shrink-0">
          {sending ? <Loader2 size={12} className="animate-spin" /> : <Plane size={12} />}
          Send
        </button>
      </div>
      {autoEta && (
        <p className="text-[10px] text-blue-400 font-mono">Auto ETA {destIcao}: {autoEta} · FL auto-filled from sim</p>
      )}
      {err && <p className="text-[10px] text-red-400 font-mono w-full">{err}</p>}
    </div>
  );
}

function LoadsheetForm({ callsign, depIcao, destIcao, acReg, acType, units,
  estZfw, maxZfw, estTow, maxTow, estLdw, maxLdw,
  paxCount, bagCount, planRamp, planTakeoff,
  onSend, onInject,
}: {
  callsign: string; depIcao: string; destIcao: string; acReg: string; acType: string; units: string;
  estZfw: string; maxZfw: string; estTow: string; maxTow: string; estLdw: string; maxLdw: string;
  paxCount: string; bagCount: string; planRamp: string; planTakeoff: string;
  onSend: (to: string, pkt: string) => Promise<void>;
  onInject: (msg: HoppieMessage) => void;
}) {
  const totalPax = parseInt(paxCount) || 0;
  const halfPax  = Math.round(totalPax / 2);

  const [to,      setTo]      = useState('OPSLINK');
  const [zfw,     setZfw]     = useState(estZfw);
  const [tow,     setTow]     = useState(estTow);
  const [ldw,     setLdw]     = useState(estLdw);
  const [fuel,    setFuel]    = useState(planTakeoff || planRamp);
  const [paxFwd,  setPaxFwd]  = useState(String(halfPax));
  const [paxAft,  setPaxAft]  = useState(String(totalPax - halfPax));
  const [cgMac,   setCgMac]   = useState('');
  const [stab,    setStab]    = useState('');
  const [sending, setSending] = useState(false);
  const [err,     setErr]     = useState('');

  const u = units.toUpperCase() === 'LBS' ? 'LBS' : 'KG';

  function stabFromCg(cgStr: string): string {
    const cg = parseFloat(cgStr);
    if (!isFinite(cg)) return '';
    const trim = Math.max(0, Math.min(5, 4 - (cg - 25) * 0.15));
    return `${trim.toFixed(1)} UP`;
  }

  function handleCgChange(v: string) {
    setCgMac(v);
    if (!stab) setStab(stabFromCg(v));
  }

  function diff(actual: string, max: string): string {
    const a = parseInt(actual); const m = parseInt(max);
    if (!isFinite(a) || !isFinite(m)) return '';
    const d = m - a;
    return d >= 0 ? `  MARGIN +${d}` : `  *** OVERWEIGHT ${Math.abs(d)} ***`;
  }

  async function request() {
    setSending(true); setErr('');
    const req = [
      'LOADSHEET REQUEST',
      `FLIGHT ${callsign}  ${depIcao}-${destIcao}`,
      `AIRCRAFT ${acReg}  ${acType}`,
      `EST ZFW   ${zfw} ${u}   EST TOW  ${tow} ${u}`,
      `PAX FWD   ${paxFwd}   PAX AFT ${paxAft}   BAGS ${bagCount}`,
      ...(cgMac ? [`CG/MAC    ${cgMac}%`] : []),
      'REQUEST FINAL LOADSHEET',
    ].join('\n');
    try { await onSend(to, req); } catch (e) { setErr(e instanceof Error ? e.message : 'Send failed'); setSending(false); return; }

    setTimeout(() => {
      const cgVal   = cgMac || '28.5';
      const stabVal = stab || stabFromCg(cgVal) || '3.0 UP';
      const underload = (() => {
        const mt = parseInt(maxTow); const et = parseInt(tow);
        return isFinite(mt) && isFinite(et) ? `${mt - et} ${u}` : '—';
      })();
      onInject({
        from: to,
        type: 'telex',
        packet: [
          '─── FINAL LOADSHEET ───────────────',
          `FLIGHT  ${callsign}  ${depIcao}-${destIcao}`,
          `ACFT    ${acReg}  ${acType}    TIME ${utcNow()}`,
          `UNIT    ${u}`,
          '',
          '── WEIGHTS ────────────────────────',
          `EST ZFW   ${zfw.padEnd(7)}  MAX ${maxZfw}${diff(zfw, maxZfw)}`,
          `EST TOW   ${tow.padEnd(7)}  MAX ${maxTow}${diff(tow, maxTow)}`,
          `EST LDW   ${ldw.padEnd(7)}  MAX ${maxLdw}${diff(ldw, maxLdw)}`,
          `FUEL T/O  ${fuel}`,
          '',
          '── PAX / LOAD ─────────────────────',
          `FWD CABIN  ${paxFwd} PAX`,
          `AFT CABIN  ${paxAft} PAX`,
          `TOTAL      ${totalPax || (parseInt(paxFwd) + parseInt(paxAft))} PAX   BAGS ${bagCount}`,
          '',
          '── BALANCE ────────────────────────',
          `ZFW CG     ${cgVal}% MAC`,
          `STAB TRIM  ${stabVal}`,
          `UNDERLOAD  ${underload}`,
          '',
          'LMC ACCEPTED UNTIL DOOR CLOSURE',
          '─── LOADSHEET FINAL ───────────────',
          'PLEASE ACKNOWLEDGE — REPLY ACPT',
        ].join('\n'),
        receivedAt: new Date(),
      });
      setSending(false);
    }, 5000);
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2 flex-wrap">
        <div className="flex flex-col gap-1 shrink-0">
          <span className="text-[9px] text-gray-600 uppercase tracking-wide">Weights ({u})</span>
          <div className="flex gap-1.5">
            <Inp value={zfw}  onChange={setZfw}  placeholder="ZFW"       className="w-24" />
            <Inp value={tow}  onChange={setTow}  placeholder="TOW"       className="w-24" />
            <Inp value={ldw}  onChange={setLdw}  placeholder="LDW"       className="w-24" />
            <Inp value={fuel} onChange={setFuel} placeholder="T/O Fuel"  className="w-24" />
          </div>
        </div>
      </div>
      <div className="flex gap-2 flex-wrap">
        <div className="flex flex-col gap-1 shrink-0">
          <span className="text-[9px] text-gray-600 uppercase tracking-wide">PAX distribution</span>
          <div className="flex gap-1.5 items-center">
            <Inp value={paxFwd} onChange={setPaxFwd} placeholder="FWD" className="w-20" />
            <span className="text-gray-600 text-[10px]">fwd</span>
            <Inp value={paxAft} onChange={setPaxAft} placeholder="AFT" className="w-20" />
            <span className="text-gray-600 text-[10px]">aft</span>
          </div>
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          <span className="text-[9px] text-gray-600 uppercase tracking-wide">Balance</span>
          <div className="flex gap-1.5">
            <Inp value={cgMac} onChange={handleCgChange} placeholder="CG % MAC"  className="w-24" />
            <Inp value={stab}  onChange={setStab}        placeholder="STAB TRIM" className="w-28" />
          </div>
        </div>
      </div>
      <div className="flex gap-2 items-center">
        <Inp value={to} onChange={setTo} placeholder="Load control station" className="flex-1" />
        <button onClick={request} disabled={sending || !to}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors shrink-0">
          {sending ? <><Loader2 size={12} className="animate-spin" /> Awaiting…</> : <><ClipboardList size={12} /> Request Loadsheet</>}
        </button>
      </div>
      {err && <p className="text-[10px] text-red-400 font-mono">{err}</p>}
      {sending && <p className="text-[10px] text-blue-400">Final loadsheet expected in ~5s…</p>}
    </div>
  );
}

function utcPlus(offsetMin: number): string {
  const d = new Date(Date.now() + offsetMin * 60000);
  return d.toUTCString().slice(17, 22) + 'Z';
}

function OpsForm({ callsign, depIcao, destIcao, acReg, acType, units, fuelOnboard, onSend, onInject }: {
  callsign: string; depIcao: string; destIcao: string;
  acReg: string; acType: string; units: string; fuelOnboard: string;
  onSend: (to: string, pkt: string) => Promise<void>;
  onInject: (msg: HoppieMessage) => void;
}) {
  type SubMode = 'slot' | 'diff' | 'acchange' | 'torpt';
  const [sub, setSub] = useState<SubMode>('slot');
  const defaultOps = 'OPSLINK';

  const [slotTo, setSlotTo]         = useState(defaultOps);
  const [slotReason, setSlotReason] = useState('');
  const [slotBusy, setSlotBusy]     = useState(false);
  const [slotOk, setSlotOk]         = useState(false);

  async function sendSlotRequest() {
    setSlotBusy(true);
    const lines = [
      'SLOT / CTOT REQUEST',
      `FLIGHT ${callsign}  ${depIcao}-${destIcao}`,
      `AIRCRAFT ${acReg}  ${acType}`,
      `EST DEP TIME ${utcNow()}`,
      ...(slotReason ? [`REASON ${slotReason}`] : []),
      'REQUEST CTOT CONFIRMATION',
    ];
    try { await onSend(slotTo, lines.join('\n')); } catch { /* ignore */ }
    setTimeout(() => {
      const ctot = utcPlus(18); const from = utcPlus(12); const to = utcPlus(23);
      onInject({
        from: slotTo, type: 'telex',
        packet: ['SLOT NOTIFICATION', `FLIGHT ${callsign}  ${depIcao}-${destIcao}`,
          `CTOT ${ctot}`, `VALID ${from}-${to}`, 'REASON ATFM FLOW RESTRICTION',
          `ATM REF ${depIcao.slice(0,2)}${Math.floor(Math.random() * 9000 + 1000)}`,
          'ACKNOWLEDGE WHEN READY'].join('\n'),
        receivedAt: new Date(),
      });
    }, 4000);
    setSlotOk(true); setTimeout(() => setSlotOk(false), 2000);
    setSlotBusy(false);
  }

  const [diffTo, setDiffTo]         = useState(defaultOps);
  const [diffType, setDiffType]     = useState('');
  const [diffMel, setDiffMel]       = useState('');
  const [diffStatus, setDiffStatus] = useState('AIRWORTHY WITH RESTRICTION');
  const [diffBusy, setDiffBusy]     = useState(false);
  const [diffOk, setDiffOk]         = useState(false);
  const [diffErr, setDiffErr]       = useState('');

  async function sendDiff() {
    if (!diffType) return;
    setDiffBusy(true); setDiffErr('');
    const lines = ['COMP RLTD DIFFICULTIES', `FLIGHT ${callsign}  ${depIcao}-${destIcao}`,
      `AIRCRAFT ${acReg}  ${acType}`, `DIFFICULTY  ${diffType}`, `STATUS      ${diffStatus}`,
      ...(diffMel ? [`MEL REF     ${diffMel}`] : []), 'ADVISE IF FURTHER ACTION REQUIRED'];
    try {
      await onSend(diffTo, lines.join('\n'));
      setDiffOk(true); setTimeout(() => setDiffOk(false), 2000);
    } catch (e) { setDiffErr(e instanceof Error ? e.message : 'Send failed'); }
    finally { setDiffBusy(false); }
  }

  const [acTo, setAcTo]         = useState(defaultOps);
  const [acReason, setAcReason] = useState('');
  const [acNewReg, setAcNewReg] = useState('');
  const [acBusy, setAcBusy]     = useState(false);
  const [acOk, setAcOk]         = useState(false);
  const [acErr, setAcErr]       = useState('');

  async function sendAcChange() {
    if (!acReason) return;
    setAcBusy(true); setAcErr('');
    const lines = ['POSSIBLE AC CHANGE', `FLIGHT ${callsign}  ${depIcao}-${destIcao}`,
      `CURRENT AC  ${acReg}  ${acType}`, `REASON      ${acReason}`,
      ...(acNewReg ? [`PROPOSED    ${acNewReg}  ${acType}`] : []),
      'PLEASE ADVISE AVAILABILITY AND READY TIME'];
    try {
      await onSend(acTo, lines.join('\n'));
      setAcOk(true); setTimeout(() => setAcOk(false), 2000);
    } catch (e) { setAcErr(e instanceof Error ? e.message : 'Send failed'); }
    finally { setAcBusy(false); }
  }

  const [toTo, setToTo]   = useState(defaultOps);
  const [toRwy, setToRwy] = useState('');
  const [toFob, setToFob] = useState(fuelOnboard);
  const [toEta, setToEta] = useState('');
  const [toPax, setToPax] = useState('');
  const [toBusy, setToBusy] = useState(false);
  const [toOk, setToOk]   = useState(false);
  const [toErr, setToErr] = useState('');

  async function sendToReport() {
    if (!toRwy) return;
    setToBusy(true); setToErr('');
    const u = units.toUpperCase() === 'LBS' ? 'LBS' : 'KG';
    const lines = ['TAKEOFF REPORT', `FLIGHT ${callsign}  ${depIcao}-${destIcao}`,
      `AIRCRAFT ${acReg}  ${acType}`, `DEP RUNWAY  ${toRwy}`, `T/O TIME    ${utcNow()}`,
      ...(toFob ? [`FOB         ${toFob} ${u}`] : []),
      ...(toEta ? [`ETA DEST    ${toEta}`] : []),
      ...(toPax ? [`PAX         ${toPax}`] : [])];
    try {
      await onSend(toTo, lines.join('\n'));
      setToOk(true); setTimeout(() => setToOk(false), 2000);
    } catch (e) { setToErr(e instanceof Error ? e.message : 'Send failed'); }
    finally { setToBusy(false); }
  }

  const SUB_TABS: { id: SubMode; label: string }[] = [
    { id: 'slot', label: 'Slot/CTOT' }, { id: 'diff', label: 'COMP Diff' },
    { id: 'acchange', label: 'AC Change' }, { id: 'torpt', label: 'T/O Report' },
  ];

  return (
    <div className="space-y-2">
      <div className="flex gap-1 flex-wrap">
        {SUB_TABS.map(t => (
          <button key={t.id} onClick={() => setSub(t.id)}
            className={clsx('px-2.5 py-1 rounded text-[10px] font-mono border transition-colors',
              sub === t.id ? 'bg-blue-600 border-blue-500 text-white' : 'bg-[var(--c-depth)] border-[var(--c-border)] text-gray-400 hover:border-[var(--c-border2)] hover:text-gray-300'
            )}>
            {t.label}
          </button>
        ))}
      </div>

      {sub === 'slot' && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-gray-500">Request CTOT from ops — simulated slot notification returned automatically.</p>
          <div className="flex gap-2 flex-wrap">
            <Inp value={slotReason} onChange={setSlotReason} placeholder="Reason (opt.)" className="flex-1 min-w-32" />
            <Inp value={slotTo}     onChange={setSlotTo}     placeholder="Ops station"   className="w-36 shrink-0" />
            <button onClick={sendSlotRequest} disabled={slotBusy || !slotTo}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors shrink-0">
              {slotBusy ? <Loader2 size={12} className="animate-spin" /> : slotOk ? <CheckCircle size={12} /> : <Send size={12} />}
              Request Slot
            </button>
          </div>
        </div>
      )}
      {sub === 'diff' && (
        <div className="space-y-1.5">
          <div className="flex gap-2 flex-wrap">
            <Inp value={diffType}   onChange={setDiffType}   placeholder="Difficulty *"   className="flex-1 min-w-48" />
            <Inp value={diffMel}    onChange={setDiffMel}    placeholder="MEL ref (opt.)" className="w-28 shrink-0" />
            <Inp value={diffStatus} onChange={setDiffStatus} placeholder="Status"         className="w-48 shrink-0" />
          </div>
          <div className="flex gap-2">
            <Inp value={diffTo} onChange={setDiffTo} placeholder="Ops station" className="flex-1" />
            <button onClick={sendDiff} disabled={diffBusy || !diffType}
              className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors shrink-0">
              {diffBusy ? <Loader2 size={12} className="animate-spin" /> : diffOk ? <CheckCircle size={12} /> : <Send size={12} />}
              Send COMP DIFF
            </button>
          </div>
          {diffErr && <p className="text-[10px] text-red-400 font-mono">{diffErr}</p>}
        </div>
      )}
      {sub === 'acchange' && (
        <div className="space-y-1.5">
          <div className="flex gap-2 flex-wrap">
            <Inp value={acReason} onChange={setAcReason} placeholder="Reason * e.g. MEL AOG"  className="flex-1 min-w-40" />
            <Inp value={acNewReg} onChange={setAcNewReg} placeholder="Proposed reg (opt.)"     className="w-36 shrink-0" />
          </div>
          <div className="flex gap-2">
            <Inp value={acTo} onChange={setAcTo} placeholder="Ops station" className="flex-1" />
            <button onClick={sendAcChange} disabled={acBusy || !acReason}
              className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors shrink-0">
              {acBusy ? <Loader2 size={12} className="animate-spin" /> : acOk ? <CheckCircle size={12} /> : <Send size={12} />}
              Send AC Change
            </button>
          </div>
          {acErr && <p className="text-[10px] text-red-400 font-mono">{acErr}</p>}
        </div>
      )}
      {sub === 'torpt' && (
        <div className="space-y-1.5">
          <div className="flex gap-2 flex-wrap">
            <Inp value={toRwy} onChange={setToRwy} placeholder="Runway * e.g. 25R"   className="w-28 shrink-0" />
            <Inp value={toFob} onChange={setToFob} placeholder={`FOB (${units})`}    className="w-32 shrink-0" />
            <Inp value={toEta} onChange={setToEta} placeholder="ETA dest e.g. 1534Z" className="w-32 shrink-0" />
            <Inp value={toPax} onChange={setToPax} placeholder="PAX (opt.)"           className="w-24 shrink-0" />
          </div>
          <div className="flex gap-2">
            <Inp value={toTo} onChange={setToTo} placeholder="Ops station" className="flex-1" />
            <button onClick={sendToReport} disabled={toBusy || !toRwy}
              className="flex items-center gap-1.5 px-4 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors shrink-0">
              {toBusy ? <Loader2 size={12} className="animate-spin" /> : toOk ? <CheckCircle size={12} /> : <Plane size={12} />}
              Send T/O Report
            </button>
          </div>
          {toErr && <p className="text-[10px] text-red-400 font-mono">{toErr}</p>}
        </div>
      )}
    </div>
  );
}

function CpdlcForm({ callsign, onSend }: {
  callsign: string;
  onSend: (to: string, type: string, pkt: string) => Promise<void>;
}) {
  const { cpdlcStation, setCpdlcStation, nextCpdlcMsgId, acarsMessages, enrouteAtc, pendingCpdlcLogon, setPendingCpdlcLogon } = useEFBStore();
  const [stationInput, setStationInput] = useState('');
  const [pendingStation, setPendingStation] = useState('');
  const [pendingMsgId, setPendingMsgId] = useState('');
  const [logonError, setLogonError] = useState('');

  useEffect(() => {
    if (pendingCpdlcLogon) {
      setStationInput(pendingCpdlcLogon);
      setPendingCpdlcLogon(null);
    }
  }, [pendingCpdlcLogon, setPendingCpdlcLogon]);

  const [requestType, setRequestType] = useState<'climb' | 'descent' | 'direct' | 'custom'>('custom');
  const [alt, setAlt] = useState('');
  const [fix, setFix] = useState('');
  const [custom, setCustom] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!pendingMsgId) return;
    const reply = acarsMessages.find(m =>
      !m.isSent && m.type === 'cpdlc' && m.cpdlc?.refId === pendingMsgId
    );
    if (!reply || !reply.cpdlc) return;
    const content = reply.cpdlc.content.toUpperCase();
    const positive = ['WILCO', 'ROGER', 'LOGON ACCEPTED', 'CONNECT', 'ACCEPTED'].some(k => content.includes(k));
    const negative = ['UNABLE', 'REJECTED', 'DENIED'].some(k => content.includes(k));
    if (positive) {
      setCpdlcStation(pendingStation);
      setPendingStation(''); setPendingMsgId(''); setLogonError('');
    } else if (negative) {
      setLogonError(`Logon rejected: ${reply.cpdlc.content}`);
      setPendingStation(''); setPendingMsgId('');
    }
  }, [acarsMessages, pendingMsgId, pendingStation, setCpdlcStation]);

  async function logon() {
    if (!stationInput) return;
    setLogonError('');
    const id = nextCpdlcMsgId();
    await onSend(stationInput, 'cpdlc', buildCpdlcPacket(id, '', `LOGON ${callsign}`));
    setPendingStation(stationInput); setPendingMsgId(String(id)); setStationInput('');
  }

  async function logoff() {
    if (!cpdlcStation) return;
    const id = nextCpdlcMsgId();
    await onSend(cpdlcStation, 'cpdlc', buildCpdlcPacket(id, '', 'LOGOFF'));
    setCpdlcStation('');
  }

  async function sendRequest() {
    if (!cpdlcStation) return;
    setSending(true);
    const id = nextCpdlcMsgId();
    let content = '';
    if (requestType === 'climb')   content = `REQUEST CLIMB TO ${alt.replace(/^FL?/, 'FL')}`;
    else if (requestType === 'descent') content = `REQUEST DESCENT TO ${alt.replace(/^FL?/, 'FL')}`;
    else if (requestType === 'direct')  content = `REQUEST DIRECT TO ${fix}`;
    else content = custom;
    if (!content) { setSending(false); return; }
    await onSend(cpdlcStation, 'cpdlc', buildCpdlcPacket(id, '', content));
    setAlt(''); setFix(''); setCustom('');
    setSending(false);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        {cpdlcStation ? (
          <>
            <span className="text-[10px] text-gray-500">Logged on:</span>
            <span className="font-mono text-xs text-green-400 font-semibold">{cpdlcStation}</span>
            <button onClick={logoff} className="ml-auto text-[10px] text-red-400 hover:text-red-300 border border-red-400/30 px-2 py-0.5 rounded transition-colors">
              LOGOFF
            </button>
          </>
        ) : pendingStation ? (
          <>
            <Loader2 size={11} className="animate-spin text-blue-400 shrink-0" />
            <span className="text-[10px] text-blue-400">Awaiting logon confirmation from {pendingStation}…</span>
            <button onClick={() => { setPendingStation(''); setPendingMsgId(''); }}
              className="ml-auto text-[10px] text-gray-500 hover:text-gray-300 border border-[var(--c-border)] px-2 py-0.5 rounded transition-colors">
              Cancel
            </button>
          </>
        ) : (
          <>
            <Inp value={stationInput} onChange={setStationInput} placeholder="ATC station e.g. EDGG_CTR" className="flex-1" />
            <button onClick={logon} disabled={!stationInput}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors shrink-0">
              <Radio size={11} />
              LOGON
            </button>
          </>
        )}
      </div>
      {!cpdlcStation && !pendingStation && enrouteAtc.filter(c => c.facility === 6).length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-gray-500 shrink-0">Enroute:</span>
          {enrouteAtc.filter(c => c.facility === 6).map(c => (
            <button key={c.callsign} onClick={() => setStationInput(c.callsign)}
              className={clsx('flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-mono border transition-colors',
                stationInput === c.callsign
                  ? 'bg-purple-600/20 border-purple-500/40 text-purple-200'
                  : 'bg-[var(--c-depth)] border-[var(--c-border)] text-purple-300 hover:border-purple-500/40 hover:bg-purple-500/10',
              )}
              title={`${c.frequency} MHz · near ${c.matchedFixIdent}`}>
              {c.callsign}
              <span className="text-gray-500">{c.frequency}</span>
            </button>
          ))}
        </div>
      )}
      {logonError && <p className="text-[10px] text-red-400">{logonError}</p>}
      {cpdlcStation && (
        <>
          <div className="flex gap-1.5 flex-wrap">
            {(['climb', 'descent', 'direct', 'custom'] as const).map(t => (
              <button key={t} onClick={() => setRequestType(t)}
                className={clsx('px-2.5 py-1 rounded text-[10px] font-mono border transition-colors capitalize',
                  requestType === t ? 'bg-blue-600 border-blue-500 text-white' : 'bg-[var(--c-depth)] border-[var(--c-border)] text-gray-400 hover:border-[var(--c-border2)]'
                )}>
                {t === 'climb' ? '↑ Climb' : t === 'descent' ? '↓ Descent' : t === 'direct' ? '→ Direct' : 'Custom'}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            {(requestType === 'climb' || requestType === 'descent') && (
              <Inp value={alt} onChange={setAlt} placeholder="e.g. FL360" className="flex-1" />
            )}
            {requestType === 'direct' && (
              <Inp value={fix} onChange={setFix} placeholder="Waypoint / Fix" className="flex-1" />
            )}
            {requestType === 'custom' && (
              <Inp value={custom} onChange={setCustom} placeholder="Free text…" className="flex-1" />
            )}
            <button onClick={sendRequest} disabled={sending}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors shrink-0">
              {sending ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              Send
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────

export default function AcarsPage() {
  const {
    ofp, hoppieLogon, setActivePage,
    acarsMessages, addAcarsMessage, cpdlcStation, nextCpdlcMsgId,
    hoppieConnected, hoppiePolling, hoppieError,
    simPosition,
    soundEnabled, setSoundEnabled,
    pendingCpdlcLogon,
    acarsUnread, resetAcarsUnread,
  } = useEFBStore();
  const callsign = ofp?.atc?.callsign ?? '';

  const {
    sendMsg, replyToMsg, poll,
    isResponded,
    inlineReply, setInlineReply,
  } = useMessageActions();

  const [mode, setMode] = useState<ComposeMode>('cpdlc');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  function handleScrollMessages(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    setIsAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 50);
  }

  useEffect(() => {
    if (isAtBottom) messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [acarsMessages]);

  useEffect(() => {
    if (acarsUnread > 0 && isAtBottom) resetAcarsUnread();
  }, [acarsUnread, isAtBottom, resetAcarsUnread]);

  // Auto-switch to CPDLC mode when triggered from Map page
  useEffect(() => {
    if (pendingCpdlcLogon) setMode('cpdlc');
  }, [pendingCpdlcLogon]);

  async function respondCpdlc(refMsgId: string, response: string) {
    const id = nextCpdlcMsgId();
    await sendMsg(cpdlcStation, 'cpdlc', buildCpdlcPacket(id, refMsgId, response));
  }

  if (!hoppieLogon) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-500">
        <MessageSquare size={40} />
        <div className="text-center">
          <p className="text-sm font-medium text-white mb-1">Hoppie Logon Code required</p>
          <p className="text-xs text-gray-500">Register at hoppie.nl and enter your logon code in Settings.</p>
        </div>
        <button onClick={() => setActivePage('settings')}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg transition-colors">
          Go to Settings
        </button>
      </div>
    );
  }

  if (!callsign || !ofp) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-500">
        <MessageSquare size={40} />
        <p className="text-sm">No flight plan loaded — callsign required for ACARS.</p>
        <button onClick={() => setActivePage('dashboard')} className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
          Load OFP on Dashboard →
        </button>
      </div>
    );
  }

  const depIcao  = ofp.origin.icao_code;
  const destIcao = ofp.destination.icao_code;
  const altnIcao = ofp.alternate?.icao_code ?? '';
  const atcCs    = ofp.atc.callsign;
  const acType   = ofp.aircraft.icaocode;
  const route    = ofp.general.route;
  const cruiseFl = `FL${Math.round(parseInt(ofp.general.initial_altitude || '0') / 100)}`;
  const defMach  = ofp.aircraft.cruise_tas ? `M${(parseInt(ofp.aircraft.cruise_tas) / 480).toFixed(2)}` : 'M0.82';
  const airports = [depIcao, destIcao, ...(altnIcao ? [altnIcao] : [])];
  const fuelUnits = ofp.general.units?.toUpperCase() === 'LBS' ? 'LBS' : 'KG';

  // Filter messages by search
  const filteredMessages = searchQuery.trim()
    ? acarsMessages
        .map((m, i) => ({ m, i }))
        .filter(({ m }) =>
          m.packet.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (m.from ?? '').toLowerCase().includes(searchQuery.toLowerCase()) ||
          (m.to ?? '').toLowerCase().includes(searchQuery.toLowerCase())
        )
    : acarsMessages.map((m, i) => ({ m, i }));

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-2 border-b border-[var(--c-border)] shrink-0 flex items-center gap-2">
        <MessageSquare size={14} className="text-gray-500 shrink-0" />
        <span className="text-xs font-mono text-white">{callsign}</span>
        <span className="text-[10px] text-gray-600 font-mono">{depIcao}→{destIcao}</span>
        <div className="flex items-center gap-1.5 text-xs">
          {hoppieConnected === null ? <Loader2 size={11} className="animate-spin text-gray-500" />
            : hoppieConnected ? <><Radio size={11} className="text-green-400" /><span className="text-green-400">Connected</span></>
            : <><AlertCircle size={11} className="text-red-400" /><span className="text-red-400">Offline</span></>}
          {hoppiePolling && <Loader2 size={11} className="animate-spin text-gray-500 ml-1" />}
        </div>
        {hoppieError && <span className="text-xs text-red-400">{hoppieError}</span>}

        {/* Search */}
        <div className="ml-auto flex items-center gap-1 bg-[var(--c-depth)] border border-[var(--c-border)] rounded-lg px-2 py-1">
          <Search size={10} className="text-gray-600 shrink-0" />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search…"
            className="bg-transparent text-[10px] font-mono text-gray-300 placeholder-gray-600 outline-none w-24"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="text-gray-600 hover:text-gray-400">
              <X size={9} />
            </button>
          )}
        </div>

        {/* Mute toggle */}
        <button
          onClick={() => setSoundEnabled(!soundEnabled)}
          title={soundEnabled ? 'Mute sounds' : 'Unmute sounds'}
          className="p-1.5 text-gray-500 hover:text-gray-300 border border-[var(--c-border)] hover:border-[var(--c-border2)] rounded-lg transition-colors"
        >
          {soundEnabled ? <Volume2 size={11} /> : <VolumeX size={11} />}
        </button>

        <div className="flex gap-1.5">
          <button onClick={poll} disabled={hoppiePolling}
            className="text-[10px] text-gray-500 hover:text-gray-300 border border-[var(--c-border)] hover:border-[var(--c-border2)] px-2 py-0.5 rounded transition-colors disabled:opacity-40">
            Refresh
          </button>
        </div>
      </div>

      {/* Search result count */}
      {searchQuery && (
        <div className="px-4 py-1 text-[10px] text-gray-500 border-b border-[var(--c-border)] shrink-0">
          {filteredMessages.length} of {acarsMessages.length} messages
        </div>
      )}

      {/* Message thread */}
      <div className="flex-1 overflow-auto p-4 space-y-2 min-h-0" onScroll={handleScrollMessages}>
        {acarsMessages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-600 text-xs">
            No messages yet — polling every 30s
          </div>
        ) : filteredMessages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-600 text-xs">
            No messages match "{searchQuery}"
          </div>
        ) : filteredMessages.map(({ m: msg, i }) => {
          const cpdlc = msg.cpdlc ?? (msg.type === 'cpdlc' ? parseCpdlc(msg.packet) ?? undefined : undefined);
          const displayText = (msg.type === 'cpdlc' && cpdlc) ? cpdlc.content : msg.packet;
          const isOpsMsg = msg.from === 'OPSLINK';
          const isIncoming = !msg.isSent || isOpsMsg;
          const accent = isIncoming ? msgAccent(displayText) : 'none';
          const receivedAt = new Date(msg.receivedAt);
          const pdcParsed = isIncoming ? parsePDCMessage(msg.packet) : null;
          return (
            <div key={i} className={clsx('flex', isIncoming ? 'justify-start' : 'justify-end')}>
            <div className={clsx(
              'max-w-[92%] rounded-xl p-2.5 text-xs font-mono border',
              isIncoming
                ? `${ACCENT[accent]} rounded-bl-sm`
                : 'bg-blue-600/10 border-blue-500/20 rounded-br-sm'
            )}>
              <div className="flex items-center justify-between gap-3 mb-1">
                <span className={clsx('font-semibold text-[10px] uppercase', isIncoming ? 'text-green-400' : 'text-blue-400')}>
                  {isIncoming ? `▼ ${msg.from}` : `▲ ${msg.to}`}
                  <span className="text-gray-600"> · {msg.type.toUpperCase()}</span>
                  {isIncoming && !isOpsMsg && (
                    <button onClick={() => { setReplyTo(msg.from ?? null); setMode('telex'); }}
                      className="text-[10px] text-gray-600 hover:text-blue-400 transition-colors ml-1" title="Reply">
                      ↩
                    </button>
                  )}
                </span>
                <span className="text-gray-600 text-[10px] shrink-0">{receivedAt.toUTCString().slice(17, 22)}Z</span>
              </div>
              <div className="text-gray-300 leading-relaxed whitespace-pre-wrap break-words">{displayText}</div>

              {/* PDC parsed card */}
              {pdcParsed && (pdcParsed.squawk || pdcParsed.sid || pdcParsed.initialClimb) && (
                <div className="mt-2 border border-blue-500/30 bg-blue-500/5 rounded p-2">
                  <div className="text-[9px] text-blue-400 uppercase tracking-wider mb-1">PDC Parsed</div>
                  <div className="flex gap-4 font-mono text-[10px]">
                    {pdcParsed.squawk    && <span><span className="text-gray-500">SQK </span><span className="text-white">{pdcParsed.squawk}</span></span>}
                    {pdcParsed.sid       && <span><span className="text-gray-500">SID </span><span className="text-white">{pdcParsed.sid}</span></span>}
                    {pdcParsed.initialClimb && <span><span className="text-gray-500">CLB </span><span className="text-white">{pdcParsed.initialClimb}</span></span>}
                  </div>
                </div>
              )}

              {!msg.isSent && accent !== 'none' && (
                <div className={clsx('mt-1.5 text-[10px] font-medium uppercase', {
                  'text-green-400': accent === 'clearance',
                  'text-red-400':   accent === 'unable',
                  'text-amber-400': accent === 'wilco',
                })}>
                  {accent === 'clearance' ? '✓ Clearance received' : accent === 'unable' ? '✗ Unable' : '✓ Acknowledged'}
                </div>
              )}
              {/* CPDLC response buttons */}
              {!msg.isSent && msg.type === 'cpdlc' && cpdlc && cpdlcNeedsResponse(cpdlc) && (
                <div className="flex gap-1.5 mt-2 flex-wrap">
                  {['WILCO', 'UNABLE', 'ROGER', 'STANDBY'].map(resp => (
                    <button key={resp} onClick={() => respondCpdlc(cpdlc.msgId, resp)}
                      className={clsx('px-2.5 py-1 rounded text-[10px] font-mono border transition-colors',
                        resp === 'WILCO' ? 'border-green-500/40 text-green-400 hover:bg-green-500/10' :
                        resp === 'UNABLE' ? 'border-red-500/40 text-red-400 hover:bg-red-500/10' :
                        'border-[var(--c-border)] text-gray-400 hover:border-[var(--c-border2)]'
                      )}>
                      {resp}
                    </button>
                  ))}
                </div>
              )}
              {/* Loadsheet ACPT/REJECT */}
              {isIncoming && msg.packet.includes('REPLY ACPT') && !isResponded(msg) && (
                <div className="flex gap-1.5 mt-2">
                  <button onClick={() => replyToMsg(i, msg.from ?? 'OPSLINK',
                    `ACPT\nFLIGHT ${callsign}\nLOADSHEET ACKNOWLEDGED ${utcNow()}`,
                    `LOADSHEET ACKNOWLEDGED\nFLIGHT ${callsign}\nBOARDING COMPLETE — HAVE A SAFE FLIGHT`)}
                    className="px-3 py-1 rounded text-[10px] font-mono border border-green-500/40 text-green-400 hover:bg-green-500/10 transition-colors">
                    ✓ ACPT
                  </button>
                  <button onClick={() => replyToMsg(i, msg.from ?? 'OPSLINK',
                    `REJECT\nFLIGHT ${callsign}\nLOADSHEET REJECTED — PLEASE REVISE`,
                    `LOADSHEET REJECTED\nFLIGHT ${callsign}\nREVISED LOADSHEET WILL FOLLOW — STAND BY`)}
                    className="px-3 py-1 rounded text-[10px] font-mono border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors">
                    ✗ REJECT
                  </button>
                </div>
              )}
              {/* REPORT WHEN LEVEL */}
              {isIncoming && msg.packet.includes('REPORT WHEN LEVEL') && !isResponded(msg) && (
                <div className="flex gap-1.5 mt-2">
                  <button onClick={() => replyToMsg(i, msg.from ?? 'OPSLINK',
                    `WILCO\nFLIGHT ${callsign}\nWILL REPORT WHEN LEVEL`,
                    `WILCO ACKNOWLEDGED\nFLIGHT ${callsign}\nCRUISE REPORT REQUESTED WHEN LEVEL`)}
                    className="px-3 py-1 rounded text-[10px] font-mono border border-green-500/40 text-green-400 hover:bg-green-500/10 transition-colors">
                    ✓ WILCO
                  </button>
                  <button onClick={() => replyToMsg(i, msg.from ?? 'OPSLINK',
                    `UNABLE\nFLIGHT ${callsign}`,
                    `UNABLE NOTED\nFLIGHT ${callsign}\nADVISE OPS WHEN POSSIBLE`)}
                    className="px-3 py-1 rounded text-[10px] font-mono border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors">
                    ✗ UNABLE
                  </button>
                </div>
              )}
              {/* Cruise check inline form */}
              {isIncoming && msg.packet.includes('PLEASE REPORT:') && msg.packet.includes('FOB') && !isResponded(msg) && (
                inlineReply?.idx === i ? (
                  <div className="mt-2 space-y-1.5">
                    <div className="flex gap-1.5 flex-wrap">
                      <input value={inlineReply.fob} onChange={e => setInlineReply(r => r && ({ ...r, fob: e.target.value }))}
                        placeholder={`FOB (${fuelUnits})`}
                        className="flex-1 min-w-[80px] bg-[var(--c-base)] border border-[var(--c-border)] rounded px-2 py-1 text-[10px] font-mono text-gray-200 placeholder-gray-600 outline-none focus:border-[var(--c-border2)]" />
                      <input value={inlineReply.fl} onChange={e => setInlineReply(r => r && ({ ...r, fl: e.target.value }))}
                        placeholder="FL e.g. 350"
                        className="flex-1 min-w-[80px] bg-[var(--c-base)] border border-[var(--c-border)] rounded px-2 py-1 text-[10px] font-mono text-gray-200 placeholder-gray-600 outline-none focus:border-[var(--c-border2)]" />
                      <input value={inlineReply.eta} onChange={e => setInlineReply(r => r && ({ ...r, eta: e.target.value }))}
                        placeholder="ETA e.g. 1430Z"
                        className="flex-1 min-w-[80px] bg-[var(--c-base)] border border-[var(--c-border)] rounded px-2 py-1 text-[10px] font-mono text-gray-200 placeholder-gray-600 outline-none focus:border-[var(--c-border2)]" />
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => replyToMsg(i, msg.from ?? 'OPSLINK',
                          `CRUISE REPORT\nFLIGHT ${callsign}\nFOB         ${inlineReply.fob || '—'} ${fuelUnits}\nCURRENT FL  ${inlineReply.fl || '—'}\nETA         ${inlineReply.eta || '—'}`,
                          `CRUISE REPORT RECEIVED\nFLIGHT ${callsign}\nCONTINUE AS PLANNED — NEXT CHECK ON DESCENT`)}
                        className="px-3 py-1 rounded text-[10px] font-mono border border-blue-500/40 text-blue-400 hover:bg-blue-500/10 transition-colors">
                        ▲ SEND REPORT
                      </button>
                      <button onClick={() => setInlineReply(null)}
                        className="px-2 py-1 rounded text-[10px] font-mono border border-[var(--c-border)] text-gray-500 hover:text-gray-300 transition-colors">
                        ✕
                      </button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setInlineReply({ idx: i, fob: '', fl: simPosition ? `${Math.round(simPosition.altFt / 100)}` : '', eta: '' })}
                    className="mt-2 px-3 py-1 rounded text-[10px] font-mono border border-blue-500/40 text-blue-400 hover:bg-blue-500/10 transition-colors">
                    ↩ SEND CRUISE REPORT
                  </button>
                )
              )}
              {/* BLOCK IN */}
              {isIncoming && msg.packet.includes('PLEASE REPORT BLOCK IN TIME') && !isResponded(msg) && (
                <button onClick={() => replyToMsg(i, msg.from ?? 'OPSLINK',
                  `BLOCK IN\nFLIGHT ${callsign}\nBLOCK IN TIME  ${utcNow()}`,
                  `BLOCK IN CONFIRMED\nFLIGHT ${callsign}\nGROUND HANDLING PROCEEDING — THANK YOU`)}
                  className="mt-2 px-3 py-1 rounded text-[10px] font-mono border border-amber-500/40 text-amber-400 hover:bg-amber-500/10 transition-colors">
                  ⏱ BLOCK IN NOW
                </button>
              )}
              {/* Fuel uplift confirm */}
              {isIncoming && msg.packet.includes('CONFIRM ACTUAL FOB AND DEFECTS') && !isResponded(msg) && (
                <div className="flex gap-1.5 mt-2">
                  <button onClick={() => replyToMsg(i, msg.from ?? 'OPSLINK',
                    `CONFIRMED\nFLIGHT ${callsign}\nFOB AS PLANNED — NO DEFECTS`,
                    `FOB AND DEFECTS NOTED\nFLIGHT ${callsign}\nFUEL UPLIFT ARRANGED — THANK YOU`)}
                    className="px-3 py-1 rounded text-[10px] font-mono border border-green-500/40 text-green-400 hover:bg-green-500/10 transition-colors">
                    ✓ CONFIRM
                  </button>
                  <button onClick={() => replyToMsg(i, msg.from ?? 'OPSLINK',
                    `DEFECTS NOTED\nFLIGHT ${callsign}\nDEFECTS TO FOLLOW — STAND BY`,
                    `TECHNICAL ISSUE NOTED\nFLIGHT ${callsign}\nMAINTENANCE TEAM INFORMED — STAND BY`)}
                    className="px-3 py-1 rounded text-[10px] font-mono border border-amber-500/40 text-amber-400 hover:bg-amber-500/10 transition-colors">
                    ⚠ ADVISE DEFECTS
                  </button>
                </div>
              )}
              {/* Catering confirm */}
              {isIncoming && msg.packet.includes('PLEASE CONFIRM CATERING UPLIFT') && !isResponded(msg) && (
                <div className="flex gap-1.5 mt-2">
                  <button onClick={() => replyToMsg(i, msg.from ?? 'OPSLINK',
                    `CONFIRMED\nFLIGHT ${callsign}\nCATERING UPLIFT CONFIRMED`,
                    `CATERING CONFIRMED\nFLIGHT ${callsign}\nCREW MEALS READY — HAVE A GREAT FLIGHT`)}
                    className="px-3 py-1 rounded text-[10px] font-mono border border-green-500/40 text-green-400 hover:bg-green-500/10 transition-colors">
                    ✓ CONFIRMED
                  </button>
                  <button onClick={() => replyToMsg(i, msg.from ?? 'OPSLINK',
                    `UNABLE\nFLIGHT ${callsign}\nCATERING ISSUE — PLEASE ADVISE`,
                    `CATERING ISSUE ACKNOWLEDGED\nFLIGHT ${callsign}\nGROUND SUPERVISOR INFORMED — STANDBY FOR UPDATE`)}
                    className="px-3 py-1 rounded text-[10px] font-mono border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-colors">
                    ✗ UNABLE
                  </button>
                </div>
              )}
              {/* Acknowledge (gate assignment, long haul briefing, short turnaround, night departure) */}
              {isIncoming && msg.packet.includes('ACKNOWLEDGE WHEN READY') && !isResponded(msg) && (
                <button onClick={() => replyToMsg(i, msg.from ?? 'OPSLINK',
                  `ACKNOWLEDGED\nFLIGHT ${callsign}\n${utcNow()}`)}
                  className="mt-2 px-3 py-1 rounded text-[10px] font-mono border border-green-500/40 text-green-400 hover:bg-green-500/10 transition-colors">
                  ✓ ACKNOWLEDGED
                </button>
              )}
            </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Compose panel */}
      <div className="border-t border-[var(--c-border)] shrink-0">
        {/* Mode pills */}
        <div className="flex gap-1 px-3 py-2 overflow-x-auto border-b border-[var(--c-border)] scrollbar-none">
          {COMPOSE_MODES.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setMode(id)}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors shrink-0',
                mode === id
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-500 hover:text-gray-200 bg-[var(--c-surface)] border border-[var(--c-border)] hover:border-[var(--c-border2)]'
              )}>
              <Icon size={11} />
              {label}
            </button>
          ))}
        </div>
        {/* Form area */}
        <div className="px-4 py-3">
          {mode === 'telex' && (
            <TelexForm defaultTo={replyTo ?? ''} onSend={async (to, pkt) => { await sendMsg(to, 'telex', pkt); setReplyTo(null); }} />
          )}
          {mode === 'pdc' && (
            <PDCForm depIcao={depIcao} destIcao={destIcao} atcCallsign={atcCs}
              acType={acType} route={route}
              onSend={async (to, pkt) => { await sendMsg(to, 'telex', pkt); }} />
          )}
          {mode === 'datis' && (
            <DAtisForm airports={airports} hoppieLogon={hoppieLogon} callsign={callsign}
              onSend={async (to, pkt) => { await sendMsg(to, 'telex', pkt); }}
              onInject={(msg) => {
                addAcarsMessage(msg);
                if (hoppieLogon && callsign && msg.from) {
                  hoppieSend(hoppieLogon, msg.from, callsign, msg.type, msg.packet).catch(() => {});
                }
              }} />
          )}
          {mode === 'oceanic' && (
            <OceanicForm atcCallsign={atcCs} acType={acType} destIcao={destIcao}
              cruiseFl={cruiseFl} defaultMach={defMach}
              hoppieLogon={hoppieLogon} callsign={callsign}
              onSend={async (to, pkt) => { await sendMsg(to, 'telex', pkt); }} />
          )}
          {mode === 'cpdlc' && (
            <CpdlcForm callsign={callsign} onSend={async (to, type, pkt) => { await sendMsg(to, type, pkt); }} />
          )}
          {mode === 'position' && (
            <PositionForm callsign={callsign} destIcao={destIcao} cruiseFl={cruiseFl}
              onSend={async (to, pkt) => { await sendMsg(to, 'telex', pkt); }} />
          )}
          {mode === 'loadsheet' && (
            <LoadsheetForm callsign={callsign} depIcao={depIcao} destIcao={destIcao}
              acReg={ofp.aircraft.reg ?? ''} acType={acType} units={fuelUnits}
              estZfw={ofp.weights.est_zfw ?? ''} maxZfw={ofp.weights.max_zfw ?? ''}
              estTow={ofp.weights.est_tow ?? ''} maxTow={ofp.weights.max_tow ?? ''}
              estLdw={ofp.weights.est_ldw ?? ''} maxLdw={ofp.weights.max_ldw ?? ''}
              paxCount={ofp.weights.pax_count ?? ''} bagCount={ofp.weights.bag_count ?? ''}
              planRamp={ofp.fuel.plan_ramp ?? ''} planTakeoff={ofp.fuel.plan_takeoff ?? ''}
              onSend={async (to, pkt) => { await sendMsg(to, 'telex', pkt); }}
              onInject={(msg) => {
                addAcarsMessage(msg);
                if (hoppieLogon && callsign) {
                  hoppieSend(hoppieLogon, msg.from, callsign, msg.type, msg.packet).catch(() => {});
                }
              }} />
          )}
          {mode === 'ops' && (
            <OpsForm callsign={callsign} depIcao={depIcao} destIcao={destIcao}
              acReg={ofp.aircraft.reg ?? ''} acType={acType}
              units={fuelUnits} fuelOnboard={ofp.fuel.plan_ramp ?? ''}
              onSend={async (to, pkt) => { await sendMsg(to, 'telex', pkt); }}
              onInject={(msg) => {
                addAcarsMessage(msg);
                if (hoppieLogon && callsign) {
                  hoppieSend(hoppieLogon, msg.from, callsign, msg.type, msg.packet).catch(() => {});
                }
              }} />
          )}
        </div>
      </div>
    </div>
  );
}
