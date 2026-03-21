import { useRef, useState } from 'react';
import { useEFBStore } from '../../store/efbStore';
import { formatFuel } from '../../services/simbrief/api';
import type { NavlogFix } from '../../types/simbrief';
import { FileText, TrendingUp, TrendingDown, Navigation, Info, X } from 'lucide-react';
import clsx from 'clsx';

function s(val: unknown): string {
  if (val === null || val === undefined) return '—';
  if (typeof val === 'object') return '—';
  return String(val);
}

/** Safe fuel value — SimBrief returns {} for empty XML fields */
function fuelVal(val: unknown): string {
  if (val === null || val === undefined || typeof val === 'object') return '0';
  return String(val);
}

function fuelNum(str: unknown): number {
  const n = parseInt(fuelVal(str), 10);
  return isNaN(n) ? 0 : n;
}

/** Plan FOB at a fix: prefer fuel_onboard, fall back to plan_takeoff − fuel_totalused */
function fixFob(fix: NavlogFix, planTof: number): number {
  const direct = fuelNum(fix.fuel_onboard);
  if (direct > 0) return direct;
  const burned = fuelNum(fix.fuel_totalused);
  if (burned > 0) return Math.max(0, planTof - burned);
  return 0;
}

/** UTC HH:MM from unix epoch + elapsed seconds */
function etoUtc(estOffUnix: string, timeTotalSecs: string): string {
  const base = parseInt(estOffUnix, 10);
  const offset = parseInt(timeTotalSecs, 10);
  if (isNaN(base) || isNaN(offset)) return '--:--';
  const d = new Date((base + offset) * 1000);
  return `${d.getUTCHours().toString().padStart(2, '0')}:${d.getUTCMinutes().toString().padStart(2, '0')}`;
}

export default function FlightPlan() {
  const { ofp, waypointActuals, setWaypointActual } = useEFBStore();

  const [activeFix, setActiveFix] = useState<number | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const activeRowRef = useRef<HTMLTableRowElement>(null);

  const actFobInput = activeFix !== null ? (waypointActuals[activeFix]?.fob ?? '') : '';
  const atoInput    = activeFix !== null ? (waypointActuals[activeFix]?.ato ?? '') : '';

  function setActFobInput(v: string) { if (activeFix !== null) setWaypointActual(activeFix, { fob: v }); }
  function setAtoInput(v: string)    { if (activeFix !== null) setWaypointActual(activeFix, { ato: v }); }

  if (!ofp) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500">
        <FileText size={40} className="mb-3" />
        <p className="text-sm">No flight plan loaded.</p>
      </div>
    );
  }

  const fixes: NavlogFix[] = Array.isArray(ofp.navlog?.fix)
    ? ofp.navlog.fix
    : ofp.navlog?.fix
    ? [ofp.navlog.fix as unknown as NavlogFix]
    : [];

  if (fixes.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500">
        <FileText size={40} className="mb-3" />
        <p className="text-sm">No navlog data in this flight plan.</p>
      </div>
    );
  }

  const units = ofp.general.units;
  const estOff = ofp.times.est_off;
  // Planned fuel figures from OFP
  const planTof   = fuelNum(ofp.fuel.plan_takeoff);
  const planLand  = fuelNum(ofp.fuel.plan_land);
  const planRes   = fuelNum(ofp.fuel.reserve);
  const planExtra = planTof - fuelNum(ofp.fuel.min_takeoff);

  // Last fix = destination
  const destFixIdx    = fixes.length - 1;
  const planFobAtDest = fixFob(fixes[destFixIdx], planTof);

  // True if any fix has per-waypoint fuel data (direct or derived)
  const fuelPerFix = fixes.some(f => fixFob(f, planTof) > 0);

  // Live fuel check
  const activeFobPlan = activeFix !== null ? fixFob(fixes[activeFix], planTof) : null;
  const actFobNum = actFobInput.trim() ? parseInt(actFobInput, 10) : null;
  const delta = actFobNum !== null && activeFobPlan !== null ? actFobNum - activeFobPlan : null;
  const estFobAtDest = actFobNum !== null && activeFobPlan !== null
    ? actFobNum - (activeFobPlan - planFobAtDest)
    : null;

  // ATO vs ETO delta (minutes)
  let atoEtoDeltaMin: number | null = null;
  if (activeFix !== null && atoInput.length === 4) {
    const etoStr = etoUtc(estOff, fixes[activeFix].time_total);
    const [eh, em] = etoStr.split(':').map(Number);
    const [ah, am] = [parseInt(atoInput.slice(0, 2)), parseInt(atoInput.slice(2, 4))];
    if (!isNaN(eh) && !isNaN(em) && !isNaN(ah) && !isNaN(am)) {
      atoEtoDeltaMin = (ah * 60 + am) - (eh * 60 + em);
    }
  }

  function selectFix(idx: number) {
    if (activeFix === idx) {
      setActiveFix(null);
    } else {
      setActiveFix(idx);
      setTimeout(() => activeRowRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ───────────────────────────────────────────── */}
      <div className="px-5 py-3 border-b border-[var(--c-border)] shrink-0 flex items-center gap-4">
        <span className="text-sm font-mono">
          <span className="text-blue-400 font-bold">{ofp.origin.icao_code}</span>
          <span className="text-gray-600 mx-2">→</span>
          <span className="text-blue-400 font-bold">{ofp.destination.icao_code}</span>
        </span>
        <span className="text-xs text-gray-500">{ofp.general.route_distance} NM</span>
        <span className="text-xs text-gray-600">{fixes.length} fixes</span>
        <span className="text-xs text-gray-500 ml-auto font-mono">
          ETD {etoUtc(estOff, '0')}Z · ETA {etoUtc(estOff, fixes[destFixIdx].time_total)}Z
        </span>
      </div>

      {/* ── Fuel Monitor Panel ───────────────────────────────── */}
      <div className="px-5 py-3 border-b border-[var(--c-border)] shrink-0 bg-[var(--c-depth)] space-y-3">

        {/* Help overlay */}
        {showHelp && (
          <div className="bg-[var(--c-surface)] border border-blue-500/30 rounded-lg p-4 text-xs text-gray-300 space-y-2">
            <div className="flex items-center justify-between mb-1">
              <span className="text-white font-semibold text-sm">Fuel Check — How to use</span>
              <button onClick={() => setShowHelp(false)}><X size={14} className="text-gray-500 hover:text-white" /></button>
            </div>
            <p><span className="text-blue-400 font-mono">Plan row</span> — Planned figures from SimBrief: Takeoff fuel, Landing fuel, Reserve, and Extra (=TOF − Min TOF).</p>
            <p><span className="text-blue-400 font-mono">Live check</span> — Click any waypoint in the table below to select it as your current position, then:</p>
            <ul className="list-disc list-inside space-y-1 ml-2 text-gray-400">
              <li><span className="text-white">Act. FOB</span> — Enter your actual Fuel On Board (from ECAM/FMS) at this waypoint.</li>
              <li><span className="text-white">Δ (delta)</span> — Difference between actual and planned FOB. Green = ahead of plan, red = below plan.</li>
              <li><span className="text-white">→ DEST</span> — Estimated landing fuel, assuming the planned burn rate from here to destination. Amber = below reserve, red = negative.</li>
              <li><span className="text-white">ATO</span> — Actual Time Over the fix (HHMM UTC). Shows time delta vs. planned ETO.</li>
            </ul>
            <p><span className="text-blue-400 font-mono">Plan FOB column</span> — Planned fuel on board at each waypoint.{!fuelPerFix && <span className="text-amber-400"> Requires <b>Detailed Navlog</b> enabled in SimBrief (Dispatch Options → Navlog → Detailed).</span>}</p>
          </div>
        )}

        {/* Planned fuel summary */}
        <div className="flex items-center gap-6 text-xs font-mono">
          <span className="text-[10px] text-gray-600 uppercase tracking-wider mr-1">Plan</span>
          <span className="text-gray-400">T/O <span className="text-white">{formatFuel(String(planTof), units)}</span></span>
          <span className="text-gray-400">LDG <span className="text-white">{formatFuel(String(planLand), units)}</span></span>
          <span className="text-gray-400">RES <span className="text-white">{formatFuel(String(planRes), units)}</span></span>
          <span className={clsx('font-medium', planExtra >= 0 ? 'text-green-400' : 'text-red-400')}>
            EXTRA {planExtra >= 0 ? '+' : ''}{formatFuel(String(planExtra), units)}
          </span>
          <button onClick={() => setShowHelp(v => !v)} className="ml-auto text-gray-600 hover:text-gray-400 transition-colors">
            <Info size={13} />
          </button>
        </div>

        {/* SimBrief detailed navlog notice */}
        {!fuelPerFix && (
          <div className="flex items-center gap-2 text-[10px] text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded px-3 py-1.5">
            <Info size={11} />
            Plan FOB per waypoint unavailable — enable <b className="mx-0.5">Detailed Navlog</b> in SimBrief (Dispatch Options → Navlog) and reload the OFP.
          </div>
        )}

        {/* Live fuel check */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[10px] text-gray-600 uppercase tracking-wider shrink-0">Live</span>

          {activeFix !== null ? (
            <span className="flex items-center gap-1.5 text-xs font-mono text-blue-400">
              <Navigation size={11} />
              {s(fixes[activeFix].ident)}
              {fuelPerFix && <span className="text-gray-600">· Plan {formatFuel(String(activeFobPlan ?? 0), units)}</span>}
            </span>
          ) : (
            <span className="text-xs text-gray-600 italic">Click a waypoint to start fuel check</span>
          )}

          {activeFix !== null && (
            <>
              {/* Actual FOB */}
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] text-gray-500 shrink-0">Act. FOB</span>
                <input
                  type="number"
                  value={actFobInput}
                  onChange={e => setActFobInput(e.target.value)}
                  placeholder="0"
                  className="w-24 bg-[var(--c-surface)] border border-[var(--c-border)] focus:border-blue-500 text-white rounded px-2 py-1 text-xs font-mono focus:outline-none"
                />
                <span className="text-[10px] text-gray-600">{units === 'lbs' ? 'LBS' : 'KG'}</span>
              </div>

              {/* Delta — only when fuel per fix is available */}
              {fuelPerFix && delta !== null && (
                <div className={clsx('flex items-center gap-1 text-xs font-mono font-semibold px-2.5 py-1 rounded-lg border', {
                  'text-green-400 border-green-500/30 bg-green-500/10': delta >= 0,
                  'text-red-400 border-red-500/30 bg-red-500/10': delta < 0,
                })}>
                  {delta >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                  {delta >= 0 ? '+' : ''}{delta.toLocaleString()} {units === 'lbs' ? 'LBS' : 'KG'}
                </div>
              )}

              {/* Est. dest FOB */}
              {fuelPerFix && estFobAtDest !== null && (
                <div className={clsx('text-xs font-mono px-2.5 py-1 rounded-lg border', {
                  'text-green-400 border-green-500/30 bg-green-500/10': estFobAtDest >= planRes,
                  'text-amber-400 border-amber-500/30 bg-amber-500/10': estFobAtDest >= 0 && estFobAtDest < planRes,
                  'text-red-400 border-red-500/30 bg-red-500/10': estFobAtDest < 0,
                })}>
                  → DEST ~{estFobAtDest.toLocaleString()} {units === 'lbs' ? 'LBS' : 'KG'}
                  {estFobAtDest < planRes && <span className="ml-1 text-[10px]">⚠ below reserve</span>}
                </div>
              )}

              {/* ATO */}
              <div className="flex items-center gap-1.5 ml-auto">
                <span className="text-[10px] text-gray-500 shrink-0">ATO</span>
                <input
                  type="text"
                  value={atoInput}
                  onChange={e => setAtoInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                  placeholder={etoUtc(estOff, fixes[activeFix].time_total).replace(':', '')}
                  className="w-16 bg-[var(--c-surface)] border border-[var(--c-border)] focus:border-blue-500 text-white rounded px-2 py-1 text-xs font-mono focus:outline-none"
                />
                {atoEtoDeltaMin !== null && (
                  <span className={clsx('flex items-center gap-0.5 text-xs font-mono', {
                    'text-green-400': atoEtoDeltaMin <= 0,
                    'text-amber-400': atoEtoDeltaMin > 0 && atoEtoDeltaMin <= 5,
                    'text-red-400': atoEtoDeltaMin > 5,
                  })}>
                    {atoEtoDeltaMin <= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                    {atoEtoDeltaMin > 0 ? '+' : ''}{atoEtoDeltaMin}m
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Navlog Table ─────────────────────────────────────── */}
      <div className="overflow-auto flex-1" ref={undefined}>
        <table className="w-full text-xs font-mono">
          <thead className="sticky top-0 bg-[var(--c-depth)] z-10">
            <tr className="text-gray-500 uppercase text-[10px] tracking-wider">
              <th className="text-left px-4 py-2 w-6">#</th>
              <th className="text-left px-2 py-2">Ident</th>
              <th className="text-left px-2 py-2 hidden sm:table-cell">Type</th>
              <th className="text-right px-2 py-2">Alt</th>
              <th className="text-right px-2 py-2 hidden md:table-cell">TAS</th>
              <th className="text-right px-2 py-2 hidden md:table-cell">Wind</th>
              <th className="text-right px-2 py-2 hidden lg:table-cell">OAT</th>
              <th className="text-right px-2 py-2">Dist</th>
              <th className="text-right px-2 py-2">Rem</th>
              <th className="text-right px-2 py-2">ETO</th>
              <th className="text-right px-2 py-2">ATO</th>
              {fuelPerFix && <th className="text-right px-2 py-2">Plan FOB</th>}
              <th className="text-right px-2 py-2 pr-4">Act. FOB</th>
            </tr>
          </thead>
          <tbody>
            {fixes.map((fix, i) => {
              const isActive = activeFix === i;
              const isPassed = activeFix !== null && i < activeFix;
              const saved = waypointActuals[i];
              const hasSaved = saved && (saved.fob || saved.ato);
              const planFob = fixFob(fix, planTof);
              const savedFobNum = saved?.fob ? parseInt(saved.fob, 10) : null;
              const fobDelta = savedFobNum !== null && planFob > 0 ? savedFobNum - planFob : null;

              return (
                <tr
                  key={`${fix.ident}-${i}`}
                  ref={isActive ? activeRowRef : undefined}
                  onClick={() => selectFix(i)}
                  className={clsx(
                    'border-t border-[#1a2030] cursor-pointer transition-colors',
                    isActive
                      ? 'bg-blue-600/15 hover:bg-blue-600/20'
                      : isPassed
                      ? hasSaved ? 'opacity-70 hover:opacity-90 bg-[var(--c-base)]' : 'opacity-40 hover:opacity-60 bg-[var(--c-base)]'
                      : i % 2 === 0
                      ? 'bg-[var(--c-base)] hover:bg-[var(--c-surface)]'
                      : 'bg-[var(--c-depth)] hover:bg-[var(--c-surface)]'
                  )}
                >
                  <td className="px-4 py-1.5 text-gray-600">{i + 1}</td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-1.5">
                      {isActive && <Navigation size={10} className="text-blue-400 shrink-0" />}
                      <span className={clsx(
                        fix.type === 'apt' ? 'text-green-400 font-bold'
                          : fix.type === 'vor' || fix.type === 'ndb' ? 'text-yellow-400'
                          : isActive ? 'text-blue-300'
                          : 'text-gray-300'
                      )}>
                        {s(fix.ident)}
                      </span>
                    </div>
                  </td>
                  <td className="px-2 py-1.5 text-gray-500 uppercase hidden sm:table-cell">{s(fix.type)}</td>
                  <td className="px-2 py-1.5 text-right text-gray-300">
                    {(() => { const a = parseInt(s(fix.altitude_feet)); return isNaN(a) ? '—' : `FL${Math.round(a / 100)}`; })()}
                  </td>
                  <td className="px-2 py-1.5 text-right text-gray-400 hidden md:table-cell">{s(fix.true_airspeed)}kt</td>
                  <td className="px-2 py-1.5 text-right text-gray-400 hidden md:table-cell">{s(fix.wind_dir)}/{s(fix.wind_spd)}</td>
                  <td className="px-2 py-1.5 text-right text-gray-400 hidden lg:table-cell">{s(fix.oat)}°</td>
                  <td className="px-2 py-1.5 text-right text-gray-300">{s(fix.distance)}</td>
                  <td className="px-2 py-1.5 text-right text-gray-400">{s(fix.distanceto)}</td>
                  <td className="px-2 py-1.5 text-right text-gray-400">
                    {etoUtc(estOff, fix.time_total)}
                  </td>
                  {/* ATO */}
                  <td className="px-2 py-1.5 text-right" onClick={e => e.stopPropagation()}>
                    {isActive ? (
                      <input
                        type="text"
                        value={atoInput}
                        onChange={e => setAtoInput(e.target.value.replace(/\D/g, '').slice(0, 4))}
                        placeholder={etoUtc(estOff, fix.time_total).replace(':', '')}
                        className="w-14 bg-[var(--c-base)] border border-blue-500/50 text-white rounded px-1.5 py-0.5 text-xs font-mono focus:outline-none text-right"
                      />
                    ) : saved?.ato ? (
                      <span className={clsx('text-xs font-mono', {
                        'text-green-400': (() => { const e = etoUtc(estOff, fix.time_total); const [eh,em] = e.split(':').map(Number); const ah = parseInt(saved.ato.slice(0,2)); const am = parseInt(saved.ato.slice(2,4)); return (ah*60+am)-(eh*60+em) <= 0; })(),
                        'text-red-400': (() => { const e = etoUtc(estOff, fix.time_total); const [eh,em] = e.split(':').map(Number); const ah = parseInt(saved.ato.slice(0,2)); const am = parseInt(saved.ato.slice(2,4)); return (ah*60+am)-(eh*60+em) > 5; })(),
                        'text-amber-400': (() => { const e = etoUtc(estOff, fix.time_total); const [eh,em] = e.split(':').map(Number); const ah = parseInt(saved.ato.slice(0,2)); const am = parseInt(saved.ato.slice(2,4)); const d = (ah*60+am)-(eh*60+em); return d > 0 && d <= 5; })(),
                      })}>
                        {saved.ato.slice(0,2)}:{saved.ato.slice(2,4)}
                      </span>
                    ) : (
                      <span className="text-gray-700">—</span>
                    )}
                  </td>
                  {/* Plan FOB */}
                  {fuelPerFix && (
                    <td className={clsx('px-2 py-1.5 text-right font-medium', isActive ? 'text-blue-300' : 'text-gray-500')}>
                      {formatFuel(String(planFob), units)}
                    </td>
                  )}
                  {/* Act. FOB */}
                  <td className="px-2 py-1.5 pr-4 text-right" onClick={e => e.stopPropagation()}>
                    {isActive ? (
                      <input
                        type="number"
                        value={actFobInput}
                        onChange={e => setActFobInput(e.target.value)}
                        placeholder="0"
                        className="w-20 bg-[var(--c-base)] border border-blue-500/50 text-white rounded px-1.5 py-0.5 text-xs font-mono focus:outline-none text-right"
                      />
                    ) : saved?.fob ? (
                      <span className={clsx('text-xs font-mono font-medium', {
                        'text-green-400': fobDelta !== null && fobDelta >= 0,
                        'text-red-400':   fobDelta !== null && fobDelta < 0,
                        'text-gray-300':  fobDelta === null,
                      })}>
                        {formatFuel(saved.fob, units)}
                        {fobDelta !== null && (
                          <span className="ml-1 text-[10px] opacity-70">
                            {fobDelta >= 0 ? '+' : ''}{fobDelta.toLocaleString()}
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-gray-700">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
