import { useEffect, useRef, useState } from 'react';
import { useEFBStore } from '../../store/efbStore';
import {
  hoppiePoll, hoppieSend, hoppieStationOnline,
  parseCpdlc, buildCpdlcPacket, cpdlcNeedsResponse,
  type HoppieMessage,
} from '../../services/hoppie';
import { fetchVatsimATIS } from '../../services/atis/vatsim';
import { fetchIvaoATIS } from '../../services/atis/ivao';
import { MessageSquare, Send, Loader2, CheckCircle, AlertCircle, Radio, Wifi, Globe, MapPin, Plane } from 'lucide-react';
import clsx from 'clsx';

type ComposeMode = 'telex' | 'pdc' | 'datis' | 'oceanic' | 'cpdlc' | 'position';

const COMPOSE_MODES: { id: ComposeMode; label: string; icon: React.ElementType }[] = [
  { id: 'cpdlc',    label: 'CPDLC',    icon: Radio },
  { id: 'pdc',      label: 'PDC',      icon: MessageSquare },
  { id: 'datis',    label: 'D-ATIS',   icon: Wifi },
  { id: 'position', label: 'Position', icon: MapPin },
  { id: 'oceanic',  label: 'Oceanic',  icon: Globe },
  { id: 'telex',    label: 'Telex',    icon: Send },
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
  const [to, setTo] = useState(defaultTo);
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [ok, setOk] = useState(false);
  const [err, setErr] = useState('');

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

  return (
    <div className="space-y-1.5">
      <div className="flex gap-2">
        <Inp value={to} onChange={setTo} placeholder="TO  e.g. EDDF_APP" className="w-40 shrink-0" />
        <Inp value={msg} onChange={setMsg} placeholder="Message…" className="flex-1" />
        <button
          onClick={submit}
          disabled={sending || !to || !msg}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors shrink-0"
        >
          {sending ? <Loader2 size={12} className="animate-spin" /> : ok ? <CheckCircle size={12} /> : <Send size={12} />}
          Send
        </button>
      </div>
      {err && <p className="text-[10px] text-red-400 font-mono">{err}</p>}
    </div>
  );
}

function PDCForm({ depIcao, destIcao, atcCallsign, acType, route, hoppieLogon, callsign, onSend }: {
  depIcao: string; destIcao: string; atcCallsign: string; acType: string; route: string;
  hoppieLogon: string; callsign: string;
  onSend: (to: string, pkt: string) => Promise<void>;
}) {
  const [atis, setAtis] = useState('');
  const [stand, setStand] = useState('');
  const [suffix, setSuffix] = useState('');
  const [online, setOnline] = useState<string[] | null>(null);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    setOnline(null);
    setSuffix('');
    const suffixes = ['DEL', 'GND', 'TWR', 'APP', 'CTR'];
    Promise.all(suffixes.map(s => hoppieStationOnline(hoppieLogon, callsign, `${depIcao}_${s}`))).then(res => {
      const found = suffixes.filter((_, i) => res[i]);
      setOnline(found);
      if (found.length > 0) setSuffix(found[0]);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depIcao, hoppieLogon, callsign]);

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
      await onSend(`${depIcao}_${suffix}`, lines.join('\n'));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-2">
      {/* Station */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] text-gray-500 shrink-0">Station:</span>
        {online === null ? (
          <span className="flex items-center gap-1 text-[10px] text-gray-600"><Loader2 size={9} className="animate-spin" /> Checking…</span>
        ) : online.length === 0 ? (
          <span className="text-[10px] text-amber-500">No stations online</span>
        ) : (
          online.map(s => (
            <button key={s} onClick={() => setSuffix(s)}
              className={clsx('px-2.5 py-1 rounded text-[10px] font-mono border transition-colors',
                suffix === s ? 'bg-blue-600 border-blue-500 text-white' : 'bg-[var(--c-depth)] border-[var(--c-border)] text-gray-400 hover:border-[var(--c-border2)] hover:text-gray-300'
              )}>
              {depIcao}_{s}
            </button>
          ))
        )}
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

function DAtisForm({ airports, hoppieLogon, callsign, atisNetwork, onSend, onInject }: {
  airports: string[];
  hoppieLogon: string;
  callsign: string;
  atisNetwork: 'vatsim' | 'ivao';
  onSend: (to: string, pkt: string) => Promise<void>;
  onInject: (msg: HoppieMessage) => void;
}) {
  type AtisSource = 'hoppie' | 'network' | null; // null = offline everywhere
  const [sources, setSources] = useState<Record<string, AtisSource> | null>(null);
  const [sending, setSending] = useState<string | null>(null);

  useEffect(() => {
    setSources(null);
    const fetchFn = atisNetwork === 'ivao' ? fetchIvaoATIS : fetchVatsimATIS;
    Promise.all(
      airports.map(async icao => {
        const [onHoppie, networkResult] = await Promise.all([
          hoppieStationOnline(hoppieLogon, callsign, `${icao}_ATIS`),
          fetchFn(icao).then(r => !!(r && r.lines.length > 0)).catch(() => false),
        ]);
        const source: AtisSource = onHoppie ? 'hoppie' : networkResult ? 'network' : null;
        return [icao, source] as [string, AtisSource];
      })
    ).then(results => setSources(Object.fromEntries(results)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [airports.join(','), hoppieLogon, callsign, atisNetwork]);

  async function request(icao: string) {
    setSending(icao);
    if (sources?.[icao] === 'hoppie') {
      // Station active on Hoppie — send real request, response comes via poll
      await onSend(`${icao}_ATIS`, 'REQUEST ATIS');
    } else {
      // Fallback: fetch from VATSIM/IVAO API and inject as received message
      try {
        const fetchFn = atisNetwork === 'ivao' ? fetchIvaoATIS : fetchVatsimATIS;
        const result = await fetchFn(icao);
        if (result && result.lines.length > 0) {
          const infoLine = result.code ? `INFORMATION ${result.code}\n` : '';
          onInject({
            from: `${icao}_ATIS`,
            type: 'telex',
            packet: infoLine + result.lines.join('\n'),
            receivedAt: new Date(),
          });
        } else {
          onInject({
            from: `${icao}_ATIS`,
            type: 'telex',
            packet: `No ATIS available for ${icao} on ${atisNetwork.toUpperCase()}`,
            receivedAt: new Date(),
          });
        }
      } catch {
        onInject({
          from: `${icao}_ATIS`,
          type: 'telex',
          packet: `Failed to fetch ATIS for ${icao}`,
          receivedAt: new Date(),
        });
      }
    }
    setSending(null);
  }

  const networkLabel = atisNetwork.toUpperCase();

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[10px] text-gray-500 shrink-0">D-ATIS:</span>
      {sources === null ? (
        <span className="flex items-center gap-1 text-[10px] text-gray-600">
          <Loader2 size={9} className="animate-spin" /> Checking…
        </span>
      ) : (
        <>
          {airports.filter(icao => sources![icao] !== null).map(icao => {
            const src = sources![icao]!;
            return (
              <button key={icao} onClick={() => request(icao)} disabled={sending === icao}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[var(--c-depth)] border border-[var(--c-border)] hover:border-blue-500/50 hover:text-white text-gray-400 rounded-lg text-xs font-mono transition-colors disabled:opacity-50"
                title={src === 'hoppie' ? 'Via Hoppie' : `Via ${networkLabel} API`}>
                {sending === icao
                  ? <Loader2 size={11} className="animate-spin" />
                  : <Wifi size={11} className={src === 'hoppie' ? 'text-green-400' : 'text-gray-500'} />}
                {icao}
                <span className="text-[9px] text-gray-600">{src === 'hoppie' ? 'HPP' : networkLabel}</span>
              </button>
            );
          })}
          {airports.every(icao => sources![icao] === null) && (
            <span className="text-[10px] text-amber-500">No ATIS available</span>
          )}
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
    Promise.all(
      OCEANIC_CENTERS.map(c => hoppieStationOnline(hoppieLogon, callsign, c.id))
    ).then(results => {
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
          <span className="flex items-center gap-1 text-[10px] text-gray-600">
            <Loader2 size={9} className="animate-spin" /> Checking…
          </span>
        ) : (
          OCEANIC_CENTERS.map(c => {
            const online = onlineCenters.includes(c.id);
            return (
              <button key={c.id} onClick={() => online && setCenter(c.id)} disabled={!online}
                title={online ? c.id : `${c.id} — not online`}
                className={clsx('px-2 py-1 rounded text-[10px] font-mono border transition-colors',
                  !online
                    ? 'bg-[var(--c-depth)] border-[var(--c-border)] text-gray-700 cursor-not-allowed'
                    : center === c.id
                      ? 'bg-blue-600 border-blue-500 text-white'
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
        <Inp value={entry}   onChange={setEntry}   placeholder="Entry fix *"   className="w-32 shrink-0" />
        <Inp value={time}    onChange={setTime}     placeholder={utcNow()}      className="w-24 shrink-0" />
        <Inp value={level}   onChange={setLevel}    placeholder={cruiseFl}      className="w-20 shrink-0" />
        <Inp value={mach}    onChange={setMach}     placeholder={defaultMach}   className="w-20 shrink-0" />
        <Inp value={ocRoute} onChange={setOcRoute}  placeholder="Track / Route (opt.)" className="flex-1 min-w-32" />
        <button
          onClick={submit}
          disabled={sending || !center || !entry}
          className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors shrink-0"
        >
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
  const [fix, setFix] = useState('');
  const [alt, setAlt] = useState('');
  const [to, setTo] = useState('');
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState('');

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

  return (
    <div className="flex gap-2 flex-wrap">
      <Inp value={fix} onChange={setFix} placeholder="Fix / Waypoint *"  className="w-32 shrink-0" />
      <Inp value={alt} onChange={setAlt} placeholder={cruiseFl + ' *'}   className="w-24 shrink-0" />
      <Inp value={to}  onChange={setTo}  placeholder="ATC unit e.g. EDGG_CTR *" className="flex-1 min-w-36" />
      <button
        onClick={submit}
        disabled={sending || !fix || !alt || !to}
        className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors shrink-0"
      >
        {sending ? <Loader2 size={12} className="animate-spin" /> : <Plane size={12} />}
        Send
      </button>
      {err && <p className="text-[10px] text-red-400 font-mono w-full">{err}</p>}
    </div>
  );
}

function CpdlcForm({ callsign, onSend }: {
  callsign: string;
  onSend: (to: string, type: string, pkt: string) => Promise<void>;
}) {
  const { cpdlcStation, setCpdlcStation, nextCpdlcMsgId, acarsMessages } = useEFBStore();
  const [stationInput, setStationInput] = useState('');
  const [pendingStation, setPendingStation] = useState('');
  const [pendingMsgId, setPendingMsgId] = useState('');
  const [logonError, setLogonError] = useState('');
  const [requestType, setRequestType] = useState<'climb' | 'descent' | 'direct' | 'custom'>('custom');
  const [alt, setAlt] = useState('');
  const [fix, setFix] = useState('');
  const [custom, setCustom] = useState('');
  const [sending, setSending] = useState(false);

  // Watch for logon response
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
      setPendingStation('');
      setPendingMsgId('');
      setLogonError('');
    } else if (negative) {
      setLogonError(`Logon rejected: ${reply.cpdlc.content}`);
      setPendingStation('');
      setPendingMsgId('');
    }
  }, [acarsMessages, pendingMsgId, pendingStation, setCpdlcStation]);

  async function logon() {
    if (!stationInput) return;
    setLogonError('');
    const id = nextCpdlcMsgId();
    await onSend(stationInput, 'cpdlc', buildCpdlcPacket(id, '', `LOGON ${callsign}`));
    setPendingStation(stationInput);
    setPendingMsgId(String(id));
    setStationInput('');
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
    if (requestType === 'climb') content = `REQUEST CLIMB TO ${alt.replace(/^FL?/, 'FL')}`;
    else if (requestType === 'descent') content = `REQUEST DESCENT TO ${alt.replace(/^FL?/, 'FL')}`;
    else if (requestType === 'direct') content = `REQUEST DIRECT TO ${fix}`;
    else content = custom;
    if (!content) { setSending(false); return; }
    await onSend(cpdlcStation, 'cpdlc', buildCpdlcPacket(id, '', content));
    setAlt(''); setFix(''); setCustom('');
    setSending(false);
  }

  return (
    <div className="space-y-2">
      {/* Logon status */}
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
      {logonError && (
        <p className="text-[10px] text-red-400">{logonError}</p>
      )}
      {/* Request form (only when logged on) */}
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
    ofp, hoppieLogon, atisNetwork, setActivePage,
    acarsMessages, addAcarsMessage, cpdlcStation, nextCpdlcMsgId,
    hoppieConnected, hoppiePolling, hoppieError,
  } = useEFBStore();
  const callsign = ofp?.atc?.callsign ?? '';

  const [mode, setMode] = useState<ComposeMode>('cpdlc');
  const [replyTo, setReplyTo] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [acarsMessages]);

  async function sendMsg(to: string, type: string, packet: string) {
    await hoppieSend(hoppieLogon, callsign, to, type, packet);
    addAcarsMessage({ from: callsign, to, type, packet, isSent: true, receivedAt: new Date() });
  }

  async function respondCpdlc(refMsgId: string, response: string) {
    const id = nextCpdlcMsgId();
    await sendMsg(cpdlcStation, 'cpdlc', buildCpdlcPacket(id, refMsgId, response));
  }

  async function poll() {
    const s = useEFBStore.getState();
    const cs = s.ofp?.atc?.callsign ?? '';
    if (!s.hoppieLogon || !cs) return;
    s.setHoppiePolling(true);
    try {
      const msgs = await hoppiePoll(s.hoppieLogon, cs);
      if (msgs.length > 0) msgs.forEach(m => s.addAcarsMessage(m));
      s.setHoppieError(null);
    } catch {
      s.setHoppieError('Poll failed');
    } finally {
      useEFBStore.getState().setHoppiePolling(false);
    }
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
      </div>
    );
  }

  const depIcao   = ofp.origin.icao_code;
  const destIcao  = ofp.destination.icao_code;
  const altnIcao  = ofp.alternate?.icao_code ?? '';
  const atcCs     = ofp.atc.callsign;
  const acType    = ofp.aircraft.icaocode;
  const route     = ofp.general.route;
  const cruiseFl  = `FL${Math.round(parseInt(ofp.general.initial_altitude || '0') / 100)}`;
  const defMach   = ofp.aircraft.cruise_tas ? `M${(parseInt(ofp.aircraft.cruise_tas) / 480).toFixed(2)}` : 'M0.82';
  const airports  = [depIcao, destIcao, ...(altnIcao ? [altnIcao] : [])];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-2.5 border-b border-[var(--c-border)] shrink-0 flex items-center gap-3">
        <MessageSquare size={14} className="text-gray-500" />
        <span className="text-xs font-mono text-white">{callsign}</span>
        <span className="text-[10px] text-gray-600 font-mono">{depIcao}→{destIcao}</span>
        <div className="flex items-center gap-1.5 text-xs">
          {hoppieConnected === null ? <Loader2 size={11} className="animate-spin text-gray-500" />
            : hoppieConnected ? <><Radio size={11} className="text-green-400" /><span className="text-green-400">Connected</span></>
            : <><AlertCircle size={11} className="text-red-400" /><span className="text-red-400">Offline</span></>}
          {hoppiePolling && <Loader2 size={11} className="animate-spin text-gray-500 ml-1" />}
        </div>
        {hoppieError && <span className="text-xs text-red-400">{hoppieError}</span>}
        <button onClick={poll} disabled={hoppiePolling}
          className="ml-auto text-[10px] text-gray-500 hover:text-gray-300 border border-[var(--c-border)] hover:border-[var(--c-border2)] px-2 py-0.5 rounded transition-colors disabled:opacity-40">
          Refresh
        </button>
      </div>

      {/* Message log */}
      <div className="flex-1 overflow-auto p-4 space-y-2 min-h-0">
        {acarsMessages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-gray-600 text-xs">
            No messages yet — polling every 30s
          </div>
        ) : acarsMessages.map((msg, i) => {
          const cpdlc = msg.cpdlc ?? (msg.type === 'cpdlc' ? parseCpdlc(msg.packet) ?? undefined : undefined);
          const displayText = (msg.type === 'cpdlc' && cpdlc) ? cpdlc.content : msg.packet;
          const accent = msg.isSent ? 'none' : msgAccent(displayText);
          const receivedAt = new Date(msg.receivedAt);
          return (
            <div key={i} className={clsx(
              'rounded-lg p-3 text-xs font-mono border',
              msg.isSent ? 'bg-blue-600/10 border-blue-500/20 ml-8' : `${ACCENT[accent]} mr-8`
            )}>
              <div className="flex items-center justify-between mb-1">
                <span className={clsx('font-semibold text-[10px] uppercase', msg.isSent ? 'text-blue-400' : 'text-green-400')}>
                  {msg.isSent ? `▲ TO ${msg.to}` : `▼ ${msg.from}`}
                  <span className="text-gray-600"> · {msg.type.toUpperCase()}</span>
                  {!msg.isSent && (
                    <button onClick={() => { setReplyTo(msg.from ?? null); setMode('telex'); }}
                      className="text-[10px] text-gray-600 hover:text-blue-400 transition-colors ml-1" title="Reply">
                      ↩
                    </button>
                  )}
                </span>
                <span className="text-gray-600 text-[10px]">{receivedAt.toUTCString().slice(17, 22)}Z</span>
              </div>
              <div className="text-gray-300 leading-relaxed whitespace-pre-wrap break-words">{displayText}</div>
              {!msg.isSent && accent !== 'none' && (
                <div className={clsx('mt-1.5 text-[10px] font-medium uppercase', {
                  'text-green-400': accent === 'clearance',
                  'text-red-400':   accent === 'unable',
                  'text-amber-400': accent === 'wilco',
                })}>
                  {accent === 'clearance' ? '✓ Clearance received' : accent === 'unable' ? '✗ Unable' : '✓ Acknowledged'}
                </div>
              )}
              {/* Response buttons for ATC uplinks */}
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
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Compose panel */}
      <div className="border-t border-[var(--c-border)] shrink-0">
        {/* Mode selector */}
        <div className="flex border-b border-[var(--c-border)]">
          {COMPOSE_MODES.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setMode(id)}
              className={clsx(
                'flex items-center gap-1.5 px-4 py-2 text-xs font-medium transition-colors border-b-2 -mb-px',
                mode === id ? 'text-white border-blue-500' : 'text-gray-500 border-transparent hover:text-gray-300'
              )}>
              <Icon size={11} />
              {label}
            </button>
          ))}
        </div>
        {/* Active form */}
        <div className="px-4 py-3">
          {mode === 'telex' && (
            <TelexForm defaultTo={replyTo ?? ''} onSend={async (to, pkt) => { await sendMsg(to, 'telex', pkt); setReplyTo(null); }} />
          )}
          {mode === 'pdc' && (
            <PDCForm
              depIcao={depIcao} destIcao={destIcao} atcCallsign={atcCs}
              acType={acType} route={route} hoppieLogon={hoppieLogon} callsign={callsign}
              onSend={async (to, pkt) => { await sendMsg(to, 'telex', pkt); }}
            />
          )}
          {mode === 'datis' && (
            <DAtisForm airports={airports} hoppieLogon={hoppieLogon} callsign={callsign} atisNetwork={atisNetwork}
              onSend={async (to, pkt) => { await sendMsg(to, 'telex', pkt); }}
              onInject={addAcarsMessage} />
          )}
          {mode === 'oceanic' && (
            <OceanicForm
              atcCallsign={atcCs} acType={acType} destIcao={destIcao}
              cruiseFl={cruiseFl} defaultMach={defMach}
              hoppieLogon={hoppieLogon} callsign={callsign}
              onSend={async (to, pkt) => { await sendMsg(to, 'telex', pkt); }}
            />
          )}
          {mode === 'cpdlc' && (
            <CpdlcForm
              callsign={callsign}
              onSend={async (to, type, pkt) => { await sendMsg(to, type, pkt); }}
            />
          )}
          {mode === 'position' && (
            <PositionForm
              callsign={callsign} destIcao={destIcao} cruiseFl={cruiseFl}
              onSend={async (to, pkt) => { await sendMsg(to, 'telex', pkt); }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
