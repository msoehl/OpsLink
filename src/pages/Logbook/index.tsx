import { useState } from 'react';
import { useEFBStore } from '../../store/efbStore';
import { parseCpdlc } from '../../services/hoppie';
import { BookOpen, Trash2, Plane, MonitorCheck } from 'lucide-react';
import clsx from 'clsx';
import type { LogbookEntry } from '../../types/logbook';

function StatsPanel({ entries }: { entries: LogbookEntry[] }) {
  if (entries.length === 0) return null;
  const completed = entries.filter(e => e.onBlockUtc && e.flightTimeMin > 0);
  const totalHours = completed.reduce((sum, e) => sum + e.flightTimeMin, 0) / 60;
  const routeCounts: Record<string, number> = {};
  entries.forEach(e => {
    if (e.dep && e.arr) {
      const r = `${e.dep}–${e.arr}`;
      routeCounts[r] = (routeCounts[r] || 0) + 1;
    }
  });
  const topRoutes = Object.entries(routeCounts).sort(([, a], [, b]) => b - a).slice(0, 3);
  return (
    <div className="border-b border-[var(--c-border)] px-4 py-3 shrink-0 space-y-1.5">
      <div className="flex justify-between text-[10px]">
        <span className="text-gray-500">Total Hours</span>
        <span className="font-mono text-white">{totalHours.toFixed(1)}</span>
      </div>
      <div className="flex justify-between text-[10px]">
        <span className="text-gray-500">Flights</span>
        <span className="font-mono text-white">{completed.length}</span>
      </div>
      {topRoutes.length > 0 && (
        <div className="pt-1.5 border-t border-[var(--c-border)] space-y-1">
          <div className="text-[9px] text-gray-600 uppercase tracking-wider">Top Routes</div>
          {topRoutes.map(([route, count]) => (
            <div key={route} className="flex justify-between text-[10px]">
              <span className="font-mono text-gray-400">{route}</span>
              <span className="text-gray-600">×{count}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatFlightTime(min: number): string {
  if (!min) return '—';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

function SimIcon({ source }: { source: string | null }) {
  if (!source) return <span className="text-gray-600">—</span>;
  return <span className="text-blue-400 font-mono text-[10px]">{source.toUpperCase()}</span>;
}

export default function LogbookPage() {
  const { logbookEntries, deleteLogbookEntry, updateLogbookEntry, activeLogbookEntryId } = useEFBStore();
  const [selectedId, setSelectedId] = useState<string | null>(logbookEntries[0]?.id ?? null);

  const selected = logbookEntries.find(e => e.id === selectedId) ?? null;

  function computeFlightTime(entry: LogbookEntry): string {
    if (entry.offBlockUtc && entry.onBlockUtc) {
      return formatFlightTime(entry.flightTimeMin);
    }
    return '—';
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: entry list */}
      <div className="w-64 shrink-0 border-r border-[var(--c-border)] flex flex-col overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--c-border)] flex items-center gap-2 shrink-0">
          <BookOpen size={14} className="text-gray-500" />
          <span className="text-xs font-medium text-white">Logbook</span>
          <span className="ml-auto text-[10px] text-gray-600">{logbookEntries.length} flights</span>
        </div>
        <StatsPanel entries={logbookEntries} />
        {logbookEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center flex-1 text-gray-600 text-xs text-center px-4 gap-2">
            <BookOpen size={32} />
            <p>No flights yet.<br />Load an OFP to start recording.</p>
          </div>
        ) : (
          <div className="overflow-auto flex-1">
            {logbookEntries.map(entry => {
              const isActive = entry.id === activeLogbookEntryId;
              const isSelected = entry.id === selectedId;
              return (
                <button
                  key={entry.id}
                  onClick={() => setSelectedId(entry.id)}
                  className={clsx(
                    'w-full text-left px-4 py-3 border-b border-[var(--c-border)] transition-colors',
                    isSelected ? 'bg-blue-600/15 border-l-2 border-l-blue-500' : 'hover:bg-[var(--c-surface)]'
                  )}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="font-mono text-xs font-semibold text-white">{entry.callsign}</span>
                    {isActive && (
                      <span className="text-[9px] text-green-400 border border-green-500/30 px-1.5 py-0.5 rounded-full">ACTIVE</span>
                    )}
                  </div>
                  <div className="font-mono text-[10px] text-gray-400">
                    {entry.dep} → {entry.arr}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[9px] text-gray-600">{entry.date}</span>
                    <SimIcon source={entry.simulator} />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Right: detail panel */}
      {!selected ? (
        <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
          Select a flight to view details
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-5 space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-1">
                <span className="text-2xl font-bold font-mono text-white">{selected.callsign}</span>
                {selected.id === activeLogbookEntryId && (
                  <span className="text-xs text-green-400 border border-green-500/30 px-2 py-0.5 rounded-full">IN PROGRESS</span>
                )}
              </div>
              <div className="flex items-center gap-3 text-sm text-gray-400">
                <span className="font-mono">{selected.dep} → {selected.arr}</span>
                <span>{selected.acType} {selected.acReg && `· ${selected.acReg}`}</span>
                <div className="flex items-center gap-1">
                  <MonitorCheck size={12} />
                  <SimIcon source={selected.simulator} />
                </div>
              </div>
            </div>
            <button
              onClick={() => { deleteLogbookEntry(selected.id); setSelectedId(logbookEntries.find(e => e.id !== selected.id)?.id ?? null); }}
              className="p-2 text-gray-600 hover:text-red-400 border border-[var(--c-border)] hover:border-red-500/40 rounded-lg transition-colors"
              title="Delete entry"
            >
              <Trash2 size={13} />
            </button>
          </div>

          {/* Times row */}
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'Date', value: selected.date },
              { label: 'Off Block', value: selected.offBlockUtc || '—' },
              { label: 'On Block', value: selected.onBlockUtc || '—' },
              { label: 'Block Time', value: computeFlightTime(selected) },
            ].map(({ label, value }) => (
              <div key={label} className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-lg p-3">
                <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">{label}</div>
                <div className="font-mono text-sm text-white">{value}</div>
              </div>
            ))}
          </div>

          {/* Phase timeline */}
          {selected.phaseHistory.length > 0 && (
            <div className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-lg p-4">
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-3">Flight Phase Timeline</div>
              <div className="flex flex-wrap gap-2">
                {selected.phaseHistory.map((p, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-[10px] font-mono">
                    <span className="text-blue-400 capitalize">{p.phase.replace('_', ' ')}</span>
                    <span className="text-gray-600">{p.time}</span>
                    {i < selected.phaseHistory.length - 1 && <span className="text-gray-700">→</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-lg p-4">
            <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Notes</div>
            <textarea
              value={selected.notes}
              onChange={e => updateLogbookEntry(selected.id, { notes: e.target.value })}
              placeholder="Add notes about this flight…"
              rows={3}
              className="w-full bg-[var(--c-depth)] border border-[var(--c-border)] focus:border-blue-500 text-gray-300 text-xs font-mono rounded-lg px-3 py-2 resize-none focus:outline-none placeholder-gray-600"
            />
          </div>

          {/* ACARS transcript */}
          {selected.acarsMessages.length > 0 && (
            <div className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-lg p-4">
              <div className="text-[10px] text-gray-500 uppercase tracking-wider mb-3">
                ACARS Transcript · {selected.acarsMessages.length} messages
              </div>
              <div className="space-y-2 max-h-96 overflow-auto">
                {selected.acarsMessages.map((msg, i) => {
                  const cpdlc = msg.cpdlc ?? (msg.type === 'cpdlc' ? parseCpdlc(msg.packet) ?? undefined : undefined);
                  const displayText = (msg.type === 'cpdlc' && cpdlc) ? cpdlc.content : msg.packet;
                  const receivedAt = new Date(msg.receivedAt);
                  return (
                    <div key={i} className={clsx(
                      'rounded p-2.5 text-[10px] font-mono border',
                      msg.isSent
                        ? 'bg-blue-600/10 border-blue-500/20 ml-6'
                        : 'bg-[var(--c-depth)] border-[var(--c-border)] mr-6'
                    )}>
                      <div className="flex items-center justify-between mb-1">
                        <span className={msg.isSent ? 'text-blue-400' : 'text-green-400'}>
                          {msg.isSent ? `▲ TO ${msg.to}` : `▼ ${msg.from}`}
                          <span className="text-gray-600"> · {msg.type.toUpperCase()}</span>
                        </span>
                        <span className="text-gray-600">{receivedAt.toUTCString().slice(17, 22)}Z</span>
                      </div>
                      <div className="text-gray-300 whitespace-pre-wrap break-words leading-relaxed">{displayText}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {selected.id === activeLogbookEntryId && selected.acarsMessages.length === 0 && (
            <div className="text-xs text-gray-600 flex items-center gap-2">
              <Plane size={12} />
              Flight in progress — ACARS messages will be saved when the flight ends (on-block).
            </div>
          )}
        </div>
      )}
    </div>
  );
}
