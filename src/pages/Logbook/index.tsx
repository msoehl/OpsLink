import { useState } from 'react';
import { useEFBStore } from '../../store/efbStore';
import type { LogbookEntry } from '../../types/logbook';
import { BookOpen, Plus, Trash2, X } from 'lucide-react';

function formatFlightTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, '0')}`;
}

const SIM_OPTIONS: { value: LogbookEntry['simulator']; label: string }[] = [
  { value: 'msfs', label: 'MSFS' },
  { value: 'p3d', label: 'P3D' },
  { value: 'xplane', label: 'X-Plane' },
  { value: 'manual', label: 'Manual' },
];

const emptyForm = {
  date: new Date().toISOString().slice(0, 10),
  callsign: '',
  dep: '',
  arr: '',
  offBlockUtc: '',
  onBlockUtc: '',
  simulator: 'manual' as LogbookEntry['simulator'],
  notes: '',
};

export default function LogbookPage() {
  const { logbook, addLogbookEntry, deleteLogbookEntry } = useEFBStore();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);

  function computeFlightMin(off: string, on: string): number {
    if (!off || !on) return 0;
    const [oh, om] = off.split(':').map(Number);
    const [nh, nm] = on.split(':').map(Number);
    let mins = (nh * 60 + nm) - (oh * 60 + om);
    if (mins < 0) mins += 24 * 60;
    return mins;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const entry: LogbookEntry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      date: form.date,
      callsign: form.callsign.toUpperCase(),
      dep: form.dep.toUpperCase(),
      arr: form.arr.toUpperCase(),
      offBlockUtc: form.offBlockUtc,
      onBlockUtc: form.onBlockUtc,
      flightTimeMin: computeFlightMin(form.offBlockUtc, form.onBlockUtc),
      simulator: form.simulator,
      notes: form.notes,
    };
    addLogbookEntry(entry);
    setForm(emptyForm);
    setShowForm(false);
  }

  const totalHours = logbook.reduce((s, e) => s + e.flightTimeMin, 0);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="px-5 py-3 border-b border-[var(--c-border)] shrink-0 flex items-center gap-3">
        <BookOpen size={14} className="text-gray-500" />
        <span className="text-xs text-gray-400 font-mono">LOGBOOK</span>
        <span className="text-xs text-gray-600">
          {logbook.length} entries · {formatFlightTime(totalHours)} total
        </span>
        <button
          onClick={() => setShowForm(v => !v)}
          className="ml-auto flex items-center gap-1.5 text-xs px-3 py-1 rounded-lg border border-[var(--c-border)] text-gray-400 hover:text-white hover:border-[var(--c-border2)] transition-colors"
        >
          {showForm ? <X size={12} /> : <Plus size={12} />}
          {showForm ? 'Cancel' : 'Add Manual Entry'}
        </button>
      </div>

      {showForm && (
        <div className="px-5 py-3 border-b border-[var(--c-border)] bg-[var(--c-depth)] shrink-0">
          <form onSubmit={handleSubmit} className="grid grid-cols-4 gap-3 text-xs">
            <div className="flex flex-col gap-1">
              <label className="text-gray-500">Date</label>
              <input
                type="date"
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                required
                className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded px-2 py-1 text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-gray-500">Callsign</label>
              <input
                type="text"
                value={form.callsign}
                onChange={e => setForm(f => ({ ...f, callsign: e.target.value }))}
                placeholder="BAW123"
                className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded px-2 py-1 text-white uppercase font-mono focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-gray-500">DEP</label>
              <input
                type="text"
                value={form.dep}
                onChange={e => setForm(f => ({ ...f, dep: e.target.value }))}
                placeholder="EGLL"
                maxLength={4}
                className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded px-2 py-1 text-white uppercase font-mono focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-gray-500">ARR</label>
              <input
                type="text"
                value={form.arr}
                onChange={e => setForm(f => ({ ...f, arr: e.target.value }))}
                placeholder="KJFK"
                maxLength={4}
                className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded px-2 py-1 text-white uppercase font-mono focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-gray-500">Off Block (UTC)</label>
              <input
                type="time"
                value={form.offBlockUtc}
                onChange={e => setForm(f => ({ ...f, offBlockUtc: e.target.value }))}
                className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded px-2 py-1 text-white font-mono focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-gray-500">On Block (UTC)</label>
              <input
                type="time"
                value={form.onBlockUtc}
                onChange={e => setForm(f => ({ ...f, onBlockUtc: e.target.value }))}
                className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded px-2 py-1 text-white font-mono focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-gray-500">Simulator</label>
              <select
                value={form.simulator}
                onChange={e => setForm(f => ({ ...f, simulator: e.target.value as LogbookEntry['simulator'] }))}
                className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded px-2 py-1 text-white focus:outline-none focus:border-blue-500"
              >
                {SIM_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-gray-500">Notes</label>
              <input
                type="text"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Optional notes"
                className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded px-2 py-1 text-white focus:outline-none focus:border-blue-500"
              />
            </div>
            <div className="col-span-4 flex justify-end">
              <button
                type="submit"
                className="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs rounded-lg transition-colors"
              >
                Add Entry
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {logbook.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-3">
            <BookOpen size={36} />
            <p className="text-sm">No flights logged yet. Fly with a connected simulator to log automatically.</p>
          </div>
        ) : (
          <table className="w-full text-xs font-mono">
            <thead className="sticky top-0 bg-[var(--c-depth)] border-b border-[var(--c-border)]">
              <tr className="text-gray-500 text-left">
                <th className="px-4 py-2 font-normal">Date</th>
                <th className="px-4 py-2 font-normal">Callsign</th>
                <th className="px-4 py-2 font-normal">Route</th>
                <th className="px-4 py-2 font-normal">Off Block</th>
                <th className="px-4 py-2 font-normal">On Block</th>
                <th className="px-4 py-2 font-normal">Flight Time</th>
                <th className="px-4 py-2 font-normal">Sim</th>
                <th className="px-4 py-2 font-normal">Notes</th>
                <th className="px-4 py-2 font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {[...logbook].reverse().map((entry) => (
                <tr
                  key={entry.id}
                  className="border-b border-[var(--c-border)] hover:bg-[var(--c-surface)] transition-colors"
                >
                  <td className="px-4 py-2 text-gray-400">{entry.date}</td>
                  <td className="px-4 py-2 text-white">{entry.callsign || '—'}</td>
                  <td className="px-4 py-2 text-blue-300">{entry.dep || '????'} → {entry.arr || '????'}</td>
                  <td className="px-4 py-2 text-gray-300">{entry.offBlockUtc || '—'}</td>
                  <td className="px-4 py-2 text-gray-300">{entry.onBlockUtc || '—'}</td>
                  <td className="px-4 py-2 text-green-400">{formatFlightTime(entry.flightTimeMin)}</td>
                  <td className="px-4 py-2 text-gray-500 uppercase">{entry.simulator}</td>
                  <td className="px-4 py-2 text-gray-500">{entry.notes || '—'}</td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => deleteLogbookEntry(entry.id)}
                      className="text-gray-600 hover:text-red-400 transition-colors"
                      title="Delete entry"
                    >
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
