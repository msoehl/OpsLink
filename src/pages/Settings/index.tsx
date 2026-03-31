import { useEffect, useState } from 'react';
import { useEFBStore, OPS_MESSAGES } from '../../store/efbStore';
import { fetchOFP } from '../../services/simbrief/api';
import { Loader2, CheckCircle, AlertCircle, Settings, RefreshCw, Zap } from 'lucide-react';

type UpdateStatus = 'idle' | 'checking' | 'available' | 'not-available' | 'error' | 'progress' | 'downloaded' | 'info';

function UpdateSection() {
  const { updateChannel, setUpdateChannel } = useEFBStore();
  const [status, setStatus]       = useState<UpdateStatus>('idle');
  const [info, setInfo]           = useState<string>('');
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  useEffect(() => {
    const cleanup = window.electronAPI?.onUpdateStatus?.(({ status: s, info: i }) => {
      setStatus(prev => {
        if (prev === 'downloaded' && s !== 'downloaded' && s !== 'info') return prev;
        if (s === 'available')       setInfo(`v${(i as { version: string })?.version ?? ''} verfügbar`);
        else if (s === 'progress')   setInfo(`${i}%`);
        else if (s === 'error')      setInfo(String(i));
        else if (s === 'downloaded') setInfo('Bereit zur Installation');
        else if (s === 'info')       setInfo(String(i));
        else                         setInfo('');
        if (s === 'not-available' || s === 'available' || s === 'error') setLastChecked(new Date());
        return s as UpdateStatus;
      });
    });
    return () => { cleanup?.(); };
  }, []);

  function switchChannel(ch: 'dev' | 'stable') {
    if (ch === updateChannel) return;
    setUpdateChannel(ch);
    window.electronAPI?.setUpdateChannel?.(ch);
    setStatus('idle');
    setInfo('');
    setLastChecked(null);
  }

  const lastCheckedLabel = lastChecked
    ? `Last checked: ${lastChecked.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`
    : null;

  return (
    <div className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-lg p-5">
      <h3 className="text-sm font-semibold text-white mb-1">Updates</h3>
      <p className="text-xs text-gray-500 mb-3">Check for new versions of OpsLink.</p>
      <div className="flex items-start gap-2 mb-4">
        <span className="text-xs text-gray-400 w-28 shrink-0 pt-1.5">Update Channel</span>
        <div className="flex flex-col gap-1.5">
          <div className="flex gap-2">
            {(['dev', 'stable'] as const).map(ch => (
              <button
                key={ch}
                onClick={() => switchChannel(ch)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  updateChannel === ch
                    ? ch === 'dev' ? 'bg-amber-600 text-white' : 'bg-blue-600 text-white'
                    : 'bg-[var(--c-depth)] border border-[var(--c-border)] text-gray-400 hover:border-[var(--c-border2)]'
                }`}>
                {ch === 'dev' ? 'Dev (Pre-release)' : 'Stable'}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-gray-600">
            Ein Kanalwechsel erfordert eine Neuinstallation aus dem neuen Kanal.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        {status !== 'downloaded' ? (
          <button
            onClick={() => window.electronAPI?.checkForUpdates?.()}
            disabled={status === 'checking' || status === 'progress'}
            className="flex items-center gap-2 bg-[var(--c-depth)] border border-[var(--c-border)] hover:border-[var(--c-border2)] disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            {status === 'checking' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            {status === 'checking' ? 'Checking…' : 'Check for Updates'}
          </button>
        ) : (
          <button
            onClick={() => window.electronAPI?.installUpdate?.()}
            className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <Zap size={14} /> Restart & Install
          </button>
        )}

        {status === 'not-available' && (
          <span className="flex items-center gap-1.5 text-xs text-gray-400">
            <CheckCircle size={13} className="text-green-500" /> You're up to date
          </span>
        )}
        {status === 'available' && info && (
          <span className="text-xs text-blue-400">{info}</span>
        )}
        {status === 'progress' && info && (
          <span className="text-xs text-blue-400 font-mono">Downloading {info}</span>
        )}
        {status === 'error' && info && (
          <span className="text-xs text-red-400">{info}</span>
        )}
        {status === 'downloaded' && (
          <span className="text-xs text-green-400">Update downloaded</span>
        )}
        {status === 'info' && info && (
          <span className="text-xs text-blue-400">{info}</span>
        )}
      </div>

      {lastCheckedLabel && (
        <p className="text-xs text-gray-600 mt-3">{lastCheckedLabel}</p>
      )}
    </div>
  );
}

const PHASE_COLORS: Record<string, string> = {
  Preflight:  'text-amber-400  bg-amber-400/10  border-amber-400/20',
  'Taxi Out': 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  Climb:      'text-sky-400    bg-sky-400/10    border-sky-400/20',
  Cruise:     'text-blue-400   bg-blue-400/10   border-blue-400/20',
  Descent:    'text-violet-400 bg-violet-400/10 border-violet-400/20',
  Approach:   'text-purple-400 bg-purple-400/10 border-purple-400/20',
  Landed:     'text-green-400  bg-green-400/10  border-green-400/20',
  'On Block': 'text-teal-400   bg-teal-400/10   border-teal-400/20',
};

function OpsMessageToggle({ label, phase, enabled, onToggle }: {
  label: string; phase: string; enabled: boolean; onToggle: () => void;
}) {
  const badgeColor = PHASE_COLORS[phase] ?? 'text-gray-400 bg-gray-400/10 border-gray-400/20';
  return (
    <div
      className="flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors hover:bg-white/[0.03] cursor-pointer group"
      onClick={onToggle}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <span className={`text-xs font-medium transition-colors ${enabled ? 'text-white' : 'text-gray-500'} truncate`}>{label}</span>
        <span className={`text-[10px] font-medium border px-1.5 py-0.5 rounded-md shrink-0 ${badgeColor}`}>{phase}</span>
      </div>
      <div
        className={`relative w-10 h-[22px] rounded-full transition-all duration-200 shrink-0 ml-4 ${enabled ? 'bg-blue-600' : 'bg-[var(--c-border2)]'}`}
      >
        <span className={`absolute top-[3px] w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${enabled ? 'translate-x-[22px]' : 'translate-x-[3px]'}`} />
      </div>
    </div>
  );
}

function OpsMessagesSection() {
  const { enabledOpsMessages, setOpsMessageEnabled } = useEFBStore();
  const regular = OPS_MESSAGES.filter(m => !m.special);
  const special = OPS_MESSAGES.filter(m => m.special);

  return (
    <div className="space-y-4">
      <div className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-lg overflow-hidden">
        <div className="px-5 pt-5 pb-3">
          <h3 className="text-sm font-semibold text-white mb-1">OPS Auto-Messages</h3>
          <p className="text-xs text-gray-500">Choose which automatic OPS messages are generated during each flight phase.</p>
        </div>
        <div className="px-2 pb-2">
          {regular.map(({ key, label, phase }) => (
            <OpsMessageToggle key={key} label={label} phase={phase}
              enabled={enabledOpsMessages.includes(key)}
              onToggle={() => setOpsMessageEnabled(key, !enabledOpsMessages.includes(key))} />
          ))}
        </div>
      </div>

      <div className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-lg overflow-hidden">
        <div className="px-5 pt-5 pb-3">
          <h3 className="text-sm font-semibold text-white mb-1">Special Events</h3>
          <p className="text-xs text-gray-500">Conditional messages — only fire when specific criteria are met (route distance, time of day, turnaround time).</p>
        </div>
        <div className="px-2 pb-2">
          {special.map(({ key, label, phase }) => (
            <OpsMessageToggle key={key} label={label} phase={phase}
              enabled={enabledOpsMessages.includes(key)}
              onToggle={() => setOpsMessageEnabled(key, !enabledOpsMessages.includes(key))} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const {
    simbriefUsername, setSimbriefUsername,
    setOFP, setIsLoadingOFP, isLoadingOFP, ofpError, setOFPError, setActivePage, clearAcarsMessages, setCpdlcStation,
    atisNetwork, setAtisNetwork,
    hoppieLogon, setHoppieLogon,
  } = useEFBStore();

  const [simbriefInput, setSimbriefInput] = useState(simbriefUsername);
  const [simbriefSaved, setSimbriefSaved] = useState(false);
  const [hoppieInput, setHoppieInput] = useState(hoppieLogon);
  const [appVersion, setAppVersion] = useState('');
  useEffect(() => { window.electronAPI?.appVersion?.().then(v => setAppVersion(v)).catch(() => {}); }, []);
  const [hoppieSaved, setHoppieSaved] = useState(false);

  async function handleSimbriefSave() {
    const trimmed = simbriefInput.trim();
    setSimbriefUsername(trimmed);
    setSimbriefSaved(true);
    setTimeout(() => setSimbriefSaved(false), 2000);
    if (!trimmed) return;
    setIsLoadingOFP(true);
    setOFPError(null);
    try {
      const data = await fetchOFP(trimmed);
      setOFP(data);
      clearAcarsMessages();
      setCpdlcStation('');
      setActivePage('dashboard');
    } catch (e) {
      setOFPError(e instanceof Error ? e.message : 'Failed to load OFP.');
    } finally {
      setIsLoadingOFP(false);
    }
  }

  return (
    <div className="p-5 overflow-auto h-full">
      <div className="flex items-center gap-2 mb-6">
        <Settings size={18} className="text-gray-400" />
        <h2 className="text-base font-semibold text-white">Settings</h2>
      </div>

      <div className="max-w-lg space-y-5">
        {/* SimBrief */}
        <div className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-lg p-5">
          <h3 className="text-sm font-semibold text-white mb-1">SimBrief</h3>
          <p className="text-xs text-gray-500 mb-4">Enter your SimBrief username to load flight plans.</p>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Username</label>
              <input
                type="text"
                value={simbriefInput}
                onChange={(e) => setSimbriefInput(e.target.value)}
                placeholder="e.g. JohnDoe123"
                className="w-full bg-[var(--c-depth)] border border-[var(--c-border)] focus:border-blue-500 text-white rounded-lg px-3 py-2 text-sm focus:outline-none"
              />
            </div>
            {ofpError && (
              <div className="flex items-center gap-2 text-red-400 text-xs bg-red-400/10 px-3 py-2 rounded-lg border border-red-400/20">
                <AlertCircle size={14} /> {ofpError}
              </div>
            )}
            <button
              onClick={handleSimbriefSave}
              disabled={isLoadingOFP || !simbriefInput.trim()}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {isLoadingOFP ? <Loader2 size={14} className="animate-spin" /> : simbriefSaved ? <CheckCircle size={14} /> : null}
              {isLoadingOFP ? 'Loading OFP...' : simbriefSaved ? 'Saved!' : 'Save & Load OFP'}
            </button>
          </div>
        </div>

        {/* Hoppie ACARS */}
        <div className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-lg p-5">
          <h3 className="text-sm font-semibold text-white mb-1">Hoppie ACARS</h3>
          <p className="text-xs text-gray-500 mb-4">
            Enter your Hoppie logon code to enable datalink messaging. Register at{' '}
            <a href="https://www.hoppie.nl/acars/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">hoppie.nl</a>.
          </p>
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">Logon Code</label>
              <input
                type="text"
                value={hoppieInput}
                onChange={(e) => setHoppieInput(e.target.value)}
                placeholder="Your Hoppie logon code"
                className="w-full bg-[var(--c-depth)] border border-[var(--c-border)] focus:border-blue-500 text-white rounded-lg px-3 py-2 text-sm font-mono focus:outline-none"
              />
            </div>
            <button
              onClick={() => {
                setHoppieLogon(hoppieInput.trim());
                setHoppieSaved(true);
                setTimeout(() => setHoppieSaved(false), 2000);
              }}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {hoppieSaved ? <CheckCircle size={14} /> : null}
              {hoppieSaved ? 'Saved!' : 'Save'}
            </button>
          </div>
        </div>

        {/* ATIS Network */}
        <div className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-lg p-5">
          <h3 className="text-sm font-semibold text-white mb-1">ATIS Network</h3>
          <p className="text-xs text-gray-500 mb-4">Select which network to fetch live ATIS from on the Weather page.</p>
          <div className="flex gap-2">
            {(['vatsim', 'ivao'] as const).map((net) => (
              <button
                key={net}
                onClick={() => setAtisNetwork(net)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  atisNetwork === net
                    ? 'bg-blue-600 text-white'
                    : 'bg-[var(--c-depth)] border border-[var(--c-border)] text-gray-400 hover:border-[var(--c-border2)]'
                }`}
              >
                {net.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {/* OPS Auto-Messages */}
        <OpsMessagesSection />

        {/* Updates */}
        <UpdateSection />

        {/* About */}
        <div className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-lg p-5">
          <h3 className="text-sm font-semibold text-white mb-1">About OpsLink</h3>
          <p className="text-xs text-gray-500 leading-relaxed">
            A free, open-source ACARS datalink & flight operations tool for flight simulator enthusiasts.
            Integrates SimBrief, Hoppie ACARS, CPDLC, and live VATSIM/IVAO data.
          </p>
          <div className="mt-3 text-xs text-gray-600">{appVersion ? `Version ${appVersion}` : 'OpsLink'} · For simulator use only</div>
          <div className="mt-4 pt-4 border-t border-[var(--c-border)] flex items-center gap-3">
            <button
              onClick={() => window.electronAPI?.openExternal('https://buymeacoffee.com/YOUR_USERNAME')}
              className="flex items-center gap-2 bg-[#FFDD00] hover:bg-[#f0ce00] text-black px-4 py-2 rounded-lg text-xs font-bold transition-colors"
            >
              ☕ Buy me a coffee
            </button>
            <span className="text-xs text-gray-600">If you find OpsLink useful</span>
          </div>
        </div>
      </div>
    </div>
  );
}
