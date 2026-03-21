import { useState, useEffect } from 'react';
import { useEFBStore } from '../../store/efbStore';
import { formatFuel, formatWeight } from '../../services/simbrief/api';
import { getProfile } from '../../services/performance/aircraft';
import {
  calcTakeoff, calcLanding, calcLandingDistance, parseMetar,
  RUNWAY_CONDITIONS,
  type Conditions, type TakeoffResult, type LandingResult, type LandingDistanceResult, type RunwayCondition,
} from '../../services/performance/calculations';
import { fetchRunways, runwayEnds, type RunwayEnd } from '../../services/runways';
import { Gauge, AlertTriangle, CheckCircle, Info, Loader2 } from 'lucide-react';

// ── Weights Tab ──────────────────────────────────────────────────────────────

function WeightBar({ label, shortLabel, valueKg, limitKg, units }: {
  label: string;
  shortLabel: string;
  valueKg: number;
  limitKg: number;
  units: string;
}) {
  const pct = Math.min(100, Math.round((valueKg / limitKg) * 100));
  const over = valueKg > limitKg;
  const warn = pct > 95;
  const barColor = over ? 'bg-red-500' : warn ? 'bg-amber-500' : 'bg-green-500';
  const pctColor = over ? 'text-red-400' : warn ? 'text-amber-400' : 'text-green-400';

  return (
    <div className="grid grid-cols-[5rem_1fr_auto] items-center gap-3">
      <div>
        <div className="text-[10px] text-gray-500 uppercase tracking-wider">{shortLabel}</div>
        <div className="text-xs text-gray-300 font-medium">{label}</div>
      </div>
      <div className="space-y-1">
        <div className="w-full bg-[var(--c-depth)] rounded-full h-2">
          <div className={`${barColor} h-2 rounded-full transition-all`} style={{ width: `${pct}%` }} />
        </div>
        <div className="flex justify-between text-[10px] text-gray-600">
          <span className="font-mono">{formatWeight(String(valueKg), units)}</span>
          <span>max {formatWeight(String(limitKg), units)}</span>
        </div>
      </div>
      <div className={`text-sm font-bold font-mono w-12 text-right ${pctColor}`}>
        {over ? '!' : `${pct}%`}
      </div>
    </div>
  );
}

function FuelBar({ label, valueRaw, totalRaw, units }: {
  label: string;
  valueRaw: string;
  totalRaw: string;
  units: string;
}) {
  const v = parseInt(valueRaw) || 0;
  const t = parseInt(totalRaw) || 1;
  const pct = Math.min(100, Math.round((v / t) * 100));
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs">
        <span className="text-gray-400">{label}</span>
        <span className="font-mono text-white">{formatFuel(valueRaw, units)}</span>
      </div>
      <div className="w-full bg-[var(--c-depth)] rounded-full h-1.5">
        <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function WeightsTab() {
  const { ofp } = useEFBStore();
  if (!ofp) return null;
  const { weights, aircraft, general, fuel } = ofp;
  const s = (v: unknown) => (typeof v === 'string' && v ? v : null);
  const units = s(general.units) ?? 'kgs';
  const ci = s(general.cost_index);
  const costIndex = (ci && ci !== '0') ? ci : (s(general.cruise_profile) ?? '—');
  const initAlt = (() => { const a = parseInt(general.initial_altitude as string); return isNaN(a) ? '—' : `FL${Math.round(a / 100)}`; })();

  const zfw  = parseInt(weights.est_zfw)  || 0;
  const tow  = parseInt(weights.est_tow)  || 0;
  const ldw  = parseInt(weights.est_ldw)  || 0;
  const ramp = parseInt(weights.est_ramp) || 0;
  const mzfw = parseInt(weights.max_zfw)  || parseInt(aircraft.mzfw) || 1;
  const mtow = parseInt(weights.max_tow)  || parseInt(aircraft.mtow) || 1;
  const mldw = parseInt(weights.max_ldw)  || parseInt(aircraft.mlw)  || 1;

  const tripBurn = parseInt(fuel.enroute_burn) || 0;
  const blockFuel = parseInt(fuel.plan_ramp) || 1;

  return (
    <div className="space-y-4">

      {/* Aircraft identity */}
      <div className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-lg font-bold font-mono text-white">{aircraft.icaocode}</span>
              <span className="text-sm text-gray-400">{aircraft.reg}</span>
              <span className="text-xs text-gray-600 bg-[var(--c-depth)] px-2 py-0.5 rounded">{aircraft.wake}</span>
            </div>
            <div className="text-xs text-gray-500 mt-0.5">{aircraft.name}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-500">CI / Init FL</div>
            <div className="font-mono text-sm text-white">{costIndex} / {initAlt}</div>
          </div>
        </div>
      </div>

      {/* Weight envelope */}
      <div className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-lg p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-500 uppercase tracking-wider">Weight Envelope</div>
          <div className="text-[10px] text-gray-600">All weights in {units === 'kgs' ? 'kg' : 'lbs'}</div>
        </div>
        <WeightBar label="Zero Fuel"  shortLabel="ZFW"  valueKg={zfw}  limitKg={mzfw} units={units} />
        <WeightBar label="Ramp"       shortLabel="RW"   valueKg={ramp} limitKg={mtow} units={units} />
        <WeightBar label="Take-Off"   shortLabel="TOW"  valueKg={tow}  limitKg={mtow} units={units} />
        <WeightBar label="Landing"    shortLabel="LDW"  valueKg={ldw}  limitKg={mldw} units={units} />
      </div>

      {/* Payload breakdown */}
      <div className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-lg p-4">
        <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">Payload</div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">Passengers</span>
            <span className="font-mono text-white">{s(weights.pax_count) ?? '—'} pax</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Bags</span>
            <span className="font-mono text-white">{s(weights.bag_count) ?? '—'} bags</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Cargo</span>
            <span className="font-mono text-white">{formatWeight(weights.cargo, units)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-400">Total Payload</span>
            <span className="font-mono text-white font-semibold">{formatWeight(weights.payload, units)}</span>
          </div>
        </div>
      </div>

      {/* Fuel */}
      <div className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs text-gray-500 uppercase tracking-wider">Fuel</div>
          <div className="text-xs text-gray-500">
            Burn {Math.round((tripBurn / blockFuel) * 100)}% of block
          </div>
        </div>
        <FuelBar label="Block (Ramp)"  valueRaw={fuel.plan_ramp}      totalRaw={fuel.max_tanks} units={units} />
        <FuelBar label="Trip (Burn)"   valueRaw={fuel.enroute_burn}   totalRaw={fuel.plan_ramp} units={units} />
        <FuelBar label="Reserve"       valueRaw={fuel.reserve}        totalRaw={fuel.plan_ramp} units={units} />
        <FuelBar label="Alternate"     valueRaw={fuel.alternate_burn} totalRaw={fuel.plan_ramp} units={units} />
        <FuelBar label="Extra"         valueRaw={fuel.extra}          totalRaw={fuel.plan_ramp} units={units} />
        <div className="border-t border-[var(--c-border)] pt-2 flex justify-between text-xs text-gray-500">
          <span>Max tanks: {formatFuel(fuel.max_tanks, units)}</span>
          <span>Avg flow: {fuel.avg_fuel_flow} kg/hr</span>
          <span>Policy: {general.fuelpolicy || '—'}</span>
        </div>
      </div>

    </div>
  );
}

// ── Conditions inputs (shared) ───────────────────────────────────────────────

interface ConditionsProps {
  conditions: Conditions;
  onChange: (c: Conditions) => void;
  metar?: string;
  runwayLabel?: string;
}

function ConditionsPanel({ conditions, onChange, metar, runwayLabel }: ConditionsProps) {
  function set(key: keyof Conditions, raw: string) {
    const val = raw === '' ? 0 : parseFloat(raw);
    if (!isNaN(val)) onChange({ ...conditions, [key]: val });
  }

  function importFromMetar() {
    if (!metar) return;
    const parsed = parseMetar(metar);
    onChange({
      ...conditions,
      oatC: parsed.oatC ?? conditions.oatC,
      qnhHpa: parsed.qnhHpa ?? conditions.qnhHpa,
      windDirectionDeg: parsed.windDir ?? conditions.windDirectionDeg,
      windSpeedKt: parsed.windSpd ?? conditions.windSpeedKt,
    });
  }

  return (
    <div className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-500 uppercase tracking-wider">Conditions</div>
        {metar && typeof metar === 'string' && (
          <button
            onClick={importFromMetar}
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            Import from METAR
          </button>
        )}
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Field label={`Elev (ft)${runwayLabel ? ` — ${runwayLabel}` : ''}`} value={String(conditions.elevationFt)} onChange={v => set('elevationFt', v)} />
        <Field label="OAT (°C)" value={String(conditions.oatC)} onChange={v => set('oatC', v)} />
        <Field label="QNH (hPa)" value={String(conditions.qnhHpa)} onChange={v => set('qnhHpa', v)} />
        <Field label="Wind Dir (°)" value={String(conditions.windDirectionDeg)} onChange={v => set('windDirectionDeg', v)} />
        <Field label="Wind Speed (kt)" value={String(conditions.windSpeedKt)} onChange={v => set('windSpeedKt', v)} />
        <Field label="Runway Heading (°)" value={String(conditions.runwayHeadingDeg)} onChange={v => set('runwayHeadingDeg', v)} />
      </div>
      {conditions.windSpeedKt > 0 && conditions.runwayHeadingDeg >= 0 && (
        <div className="flex gap-4 text-xs pt-1">
          <WindInfo label="Headwind"
            extra={`${(() => { const cos = Math.round(conditions.windSpeedKt * Math.cos(((conditions.windDirectionDeg - conditions.runwayHeadingDeg + 540) % 360 - 180) * Math.PI / 180)); return cos > 0 ? `+${cos}` : cos; })()} kt`}
          />
          <WindInfo label="Crosswind"
            extra={`${Math.abs(Math.round(conditions.windSpeedKt * Math.sin(((conditions.windDirectionDeg - conditions.runwayHeadingDeg + 540) % 360 - 180) * Math.PI / 180)))} kt`}
          />
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-[10px] text-gray-500 mb-1 uppercase tracking-wider">{label}</label>
      <input
        type="number"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-[var(--c-depth)] border border-[var(--c-border)] focus:border-blue-500 text-white rounded px-2 py-1.5 text-sm font-mono focus:outline-none"
      />
    </div>
  );
}

function WindInfo({ label, extra }: { label: string; extra: string }) {
  return (
    <span className="text-gray-500">{label}: <span className="text-gray-300 font-mono">{extra}</span></span>
  );
}

// ── V-speed result display ────────────────────────────────────────────────────

function VSpeed({ label, value, sub, highlight }: { label: string; value: number; sub?: string; highlight?: boolean }) {
  return (
    <div className={`text-center p-3 rounded-lg border ${highlight ? 'bg-blue-600/20 border-blue-500/40' : 'bg-[var(--c-depth)] border-[var(--c-border)]'}`}>
      <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</div>
      <div className={`text-2xl font-bold font-mono ${highlight ? 'text-blue-300' : 'text-white'}`}>{value}</div>
      <div className="text-xs text-gray-600 mt-0.5">kt{sub ? ` · ${sub}` : ''}</div>
    </div>
  );
}

// ── Runway selector ───────────────────────────────────────────────────────────

function RunwaySelector({ icao, onSelect }: {
  icao: string;
  onSelect: (end: RunwayEnd | null) => void;
}) {
  const [ends, setEnds] = useState<RunwayEnd[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<string>('');

  useEffect(() => {
    if (!icao) return;
    setLoading(true);
    fetchRunways(icao)
      .then((rws) => setEnds(runwayEnds(rws)))
      .catch(() => setEnds([]))
      .finally(() => setLoading(false));
  }, [icao]);

  function handleChange(ident: string) {
    setSelected(ident);
    const end = ends.find((e) => e.ident === ident) ?? null;
    onSelect(end);
  }

  if (loading) return (
    <div className="flex items-center gap-2 text-xs text-gray-500">
      <Loader2 size={12} className="animate-spin" /> Loading runways…
    </div>
  );
  if (ends.length === 0) return (
    <div className="text-xs text-gray-600">No runway data for {icao}</div>
  );

  return (
    <div className="flex flex-wrap gap-2">
      {ends.map((e) => (
        <button
          key={e.ident}
          onClick={() => handleChange(e.ident)}
          className={`px-3 py-1.5 rounded text-sm font-mono transition-colors ${
            selected === e.ident
              ? 'bg-blue-600 text-white'
              : 'bg-[var(--c-depth)] border border-[var(--c-border)] text-gray-400 hover:border-[var(--c-border2)]'
          }`}
        >
          {e.ident}
          <span className="text-[10px] ml-1 opacity-60">{Math.round(e.headingTrue)}°</span>
        </button>
      ))}
    </div>
  );
}

// ── Takeoff Tab ───────────────────────────────────────────────────────────────

function TakeoffTab() {
  const { ofp } = useEFBStore();
  if (!ofp) return null;

  const profile = getProfile(ofp.aircraft?.icaocode ?? '');
  const towKg = parseInt(ofp.weights?.est_tow ?? '0');
  const towLabel = `${(towKg / 1000).toFixed(1)}T`;
  const originMetar = ofp.weather?.orig_metar ?? '';
  const originElev = parseInt(ofp.origin?.elevation ?? '0');
  const originIcao = ofp.origin?.icao_code ?? '';

  const defaultConditions: Conditions = {
    elevationFt: isNaN(originElev) ? 0 : originElev,
    oatC: 15,
    qnhHpa: 1013,
    windDirectionDeg: 0,
    windSpeedKt: 0,
    runwayHeadingDeg: 0,
  };

  const [conditions, setConditions] = useState<Conditions>(defaultConditions);
  const [flapIdx, setFlapIdx] = useState(0);
  const [v1Reduction, setV1Reduction] = useState(5);
  const [selectedRunway, setSelectedRunway] = useState<RunwayEnd | null>(null);
  const [result, setResult] = useState<TakeoffResult | null>(null);

  useEffect(() => {
    if (originMetar && typeof originMetar === 'string') {
      const m = parseMetar(originMetar);
      setConditions(prev => ({
        ...prev,
        oatC: m.oatC ?? prev.oatC,
        qnhHpa: m.qnhHpa ?? prev.qnhHpa,
        windDirectionDeg: m.windDir ?? prev.windDirectionDeg,
        windSpeedKt: m.windSpd ?? prev.windSpeedKt,
      }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When runway selected: auto-fill heading & elevation
  useEffect(() => {
    if (!selectedRunway) return;
    setConditions(prev => ({
      ...prev,
      runwayHeadingDeg: selectedRunway.headingTrue,
      elevationFt: selectedRunway.elevFt || prev.elevationFt,
    }));
  }, [selectedRunway]);

  useEffect(() => {
    if (!profile || !towKg) { setResult(null); return; }
    const flap = profile.takeoffFlaps[flapIdx];
    if (!flap) return;
    setResult(calcTakeoff(flap.k, profile.vrOffset, v1Reduction, towKg, conditions, selectedRunway?.lengthFt ?? null));
  }, [profile, flapIdx, v1Reduction, towKg, conditions, selectedRunway]);

  if (!profile) {
    return (
      <div className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-lg p-5 flex items-center gap-3 text-sm text-amber-400">
        <Info size={16} />
        No performance profile for <span className="font-mono font-bold">{ofp.aircraft?.icaocode}</span>.
        Supported: A318–A321neo/XLR, A330–A350, B737NG/MAX, B757, B777, B787.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-white">{profile.name}</span>
        <span className="text-xs text-gray-500 font-mono">TOW: {towLabel}</span>
      </div>

      {/* Runway */}
      <div className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-500 uppercase tracking-wider">Runway — {originIcao}</div>
          {selectedRunway && (
            <span className="text-xs text-gray-500 font-mono">
              {selectedRunway.lengthFt.toLocaleString()} ft · {selectedRunway.widthFt} ft wide · {selectedRunway.surface}
            </span>
          )}
        </div>
        <RunwaySelector icao={originIcao} onSelect={setSelectedRunway} />
      </div>

      {/* Config */}
      <div className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-lg p-4 space-y-3">
        <div className="text-xs text-gray-500 uppercase tracking-wider">Configuration</div>
        <div className="flex gap-2 flex-wrap">
          {profile.takeoffFlaps.map((f, i) => (
            <button
              key={f.label}
              onClick={() => setFlapIdx(i)}
              className={`px-3 py-1.5 rounded text-sm font-mono transition-colors ${flapIdx === i ? 'bg-blue-600 text-white' : 'bg-[var(--c-depth)] border border-[var(--c-border)] text-gray-400 hover:border-[var(--c-border2)]'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-4">
          <div>
            <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">V1 reduction from VR (kt)</label>
            <input
              type="number" min={0} max={20}
              value={v1Reduction}
              onChange={e => setV1Reduction(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-24 bg-[var(--c-depth)] border border-[var(--c-border)] focus:border-blue-500 text-white rounded px-2 py-1.5 text-sm font-mono focus:outline-none"
            />
          </div>
          <div className="text-xs text-gray-600 mt-4">
            THR RED: {profile.thrRedAlt} ft · ACC: {profile.accAlt} ft
          </div>
        </div>
      </div>

      <ConditionsPanel
        conditions={conditions}
        onChange={setConditions}
        metar={typeof originMetar === 'string' ? originMetar : undefined}
        runwayLabel={selectedRunway ? `RWY ${selectedRunway.ident}` : originIcao}
      />

      {result && (
        <>
          {/* Flex / Assumed Temperature */}
          {(() => {
            const termLabel = profile.isBoeing ? 'Assumed Temp' : 'Flex';
            const oat = conditions.oatC;

            // Density ratio at actual conditions (simplified)
            const densityAlt = result.densityAlt;
            const sigma = Math.exp(-densityAlt / 27000);

            // ── Climb-limited ─────────────────────────────────────────────
            // OEI gradient scales with TOW/MTOW and density
            const gradActual = profile.oeiClimbGradPct * (profile.mtow / towKg) * Math.sqrt(sigma);
            const minGrad = 2.4;
            const maxThrustReductionClimb = Math.max(0, (gradActual - minGrad) / gradActual) * 100;
            const deltaFlexClimb = maxThrustReductionClimb / profile.thrustPctPerDegC;
            const flexClimb = Math.min(profile.maxFlexC, Math.round(oat + deltaFlexClimb));

            // ── Runway-limited ────────────────────────────────────────────
            let flexRunway: number | null = null;
            let runwayToga = false;
            if (result.runwayFt && result.asdFt && result.asdFt > 0) {
              const asdMarginFactor = result.runwayFt / result.asdFt - 1;
              const raw = Math.round(oat + (asdMarginFactor * 100) / (profile.thrustPctPerDegC * 1.5));
              if (raw <= oat + 2) {
                runwayToga = true;
              } else {
                flexRunway = Math.min(profile.maxFlexC, raw);
              }
            }

            // ── Recommended ───────────────────────────────────────────────
            const candidates = [flexClimb, ...(flexRunway !== null ? [flexRunway] : [])];
            const recommended = Math.min(...candidates);
            const hasAnyFlex = recommended > oat + 2;
            // Only hide completely if no runway selected and climb flex is also tiny
            if (!hasAnyFlex && !runwayToga) return null;

            type FlexRow = { label: string; valueStr: string; color: string; note: string };
            const rows: FlexRow[] = [
              {
                label: 'Climb-limited',
                valueStr: flexClimb > oat + 2 ? `+${flexClimb}°C` : 'TOGA',
                color: flexClimb <= oat + 2 ? 'text-red-400' : (flexClimb === recommended ? 'text-amber-400' : 'text-gray-300'),
                note: `OEI grad ${gradActual.toFixed(1)}% vs min 2.4%`,
              },
              ...(result.runwayFt ? [{
                label: 'Runway-limited',
                valueStr: runwayToga ? 'TOGA' : `+${flexRunway}°C`,
                color: runwayToga ? 'text-red-400' : (flexRunway === recommended ? 'text-amber-400' : 'text-gray-300'),
                note: runwayToga
                  ? 'ASD ≥ runway'
                  : `ASD margin ${((result.runwayFt! / result.asdFt! - 1) * 100).toFixed(0)}%`,
              }] : []),
            ];

            const borderColor = runwayToga || !hasAnyFlex ? 'border-red-500/30' : 'border-amber-500/30';
            const bgColor = runwayToga || !hasAnyFlex ? 'bg-red-500/10' : 'bg-amber-500/10';

            return (
              <div className={`${bgColor} ${borderColor} border rounded-lg p-4 space-y-3`}>
                <div className="flex items-center justify-between">
                  <div className="text-xs text-gray-500 uppercase tracking-wider">{termLabel} Temperature (est.)</div>
                  <div className="text-[10px] text-gray-600 italic">Simplified · not certified</div>
                </div>
                <div className={`flex items-baseline gap-3 pb-1 border-b ${hasAnyFlex ? 'border-amber-500/20' : 'border-red-500/20'}`}>
                  {hasAnyFlex ? (
                    <>
                      <span className="text-2xl font-bold font-mono text-amber-400">+{recommended}°C</span>
                      <span className="text-xs text-gray-400">Recommended · max {profile.maxFlexC}°C · ΔT +{recommended - oat}°C</span>
                    </>
                  ) : (
                    <>
                      <span className="text-2xl font-bold font-mono text-red-400">TOGA</span>
                      <span className="text-xs text-gray-500">No flex available for this config / runway</span>
                    </>
                  )}
                </div>
                <div className="space-y-1.5">
                  {rows.map(row => (
                    <div key={row.label} className="flex items-center justify-between text-xs">
                      <span className="text-gray-500">{row.label}</span>
                      <span className="text-gray-600 text-[10px]">{row.note}</span>
                      <span className={`font-mono font-semibold w-14 text-right ${row.color}`}>{row.valueStr}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          <div className="grid grid-cols-3 gap-3">
            <VSpeed label="V1" value={result.v1} sub={result.runwayFt ? 'runway-limited' : undefined} />
            <VSpeed label="VR" value={result.vr} />
            <VSpeed label="V2" value={result.v2} highlight />
          </div>

          {/* Runway analysis */}
          {result.runwayFt && (
            <div className={`rounded-lg border p-4 ${result.runwayOk ? 'bg-green-500/5 border-green-500/30' : 'bg-red-500/10 border-red-500/40'}`}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  {result.runwayOk
                    ? <><CheckCircle size={14} className="text-green-400" /><span className="text-green-400">Runway OK</span></>
                    : <><AlertTriangle size={14} className="text-red-400" /><span className="text-red-400">Runway LIMITED</span></>}
                </div>
                <span className="text-xs text-gray-500 font-mono">TORA {result.runwayFt.toLocaleString()} ft</span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center text-xs">
                <div>
                  <div className="text-gray-500 mb-0.5">TO Roll</div>
                  <div className={`font-mono font-semibold ${result.toRollFt! > result.runwayFt ? 'text-red-400' : 'text-white'}`}>
                    {result.toRollFt!.toLocaleString()} ft
                  </div>
                </div>
                <div>
                  <div className="text-gray-500 mb-0.5">ASD</div>
                  <div className={`font-mono font-semibold ${result.asdFt! > result.runwayFt ? 'text-red-400' : 'text-white'}`}>
                    {result.asdFt!.toLocaleString()} ft
                  </div>
                </div>
                <div>
                  <div className="text-gray-500 mb-0.5">Margin</div>
                  <div className={`font-mono font-semibold ${result.runwayOk ? 'text-green-400' : 'text-red-400'}`}>
                    {result.runwayOk
                      ? `+${(result.runwayFt - Math.max(result.toRollFt!, result.asdFt!)).toLocaleString()} ft`
                      : `−${(Math.max(result.toRollFt!, result.asdFt!) - result.runwayFt).toLocaleString()} ft`}
                  </div>
                </div>
              </div>
            </div>
          )}

          <AtmCard pa={result.pressureAlt} da={result.densityAlt} isa={result.isaDeviation} hw={result.headwindComponent} />
          <div className="text-[10px] text-gray-600 text-center">
            For simulator use only · Not certified performance data
          </div>
        </>
      )}
    </div>
  );
}

// ── Landing Tab ───────────────────────────────────────────────────────────────

function LandingTab() {
  const { ofp } = useEFBStore();
  if (!ofp) return null;

  const profile = getProfile(ofp.aircraft?.icaocode ?? '');
  const ldwKg = parseInt(ofp.weights?.est_ldw ?? '0');
  const mlwKg = parseInt(ofp.aircraft?.mlw ?? ofp.weights?.max_ldw ?? '0');
  const ldwLabel = `${(ldwKg / 1000).toFixed(1)}T`;
  const destMetar = ofp.weather?.dest_metar ?? '';
  const destElev = parseInt(ofp.destination?.elevation ?? '0');
  const destIcao = ofp.destination?.icao_code ?? '';

  const defaultConditions: Conditions = {
    elevationFt: isNaN(destElev) ? 0 : destElev,
    oatC: 15,
    qnhHpa: 1013,
    windDirectionDeg: 0,
    windSpeedKt: 0,
    runwayHeadingDeg: 0,
  };

  const [conditions, setConditions] = useState<Conditions>(defaultConditions);
  const [flapIdx, setFlapIdx] = useState(0);
  const [windAdditive, setWindAdditive] = useState(0);
  const [selectedAutobrake, setSelectedAutobrake] = useState<string | null>(null);
  const [runwayCond, setRunwayCond] = useState<RunwayCondition>(RUNWAY_CONDITIONS[0]);
  const [selectedRunway, setSelectedRunway] = useState<RunwayEnd | null>(null);
  const [result, setResult] = useState<LandingResult | null>(null);
  const [distResult, setDistResult] = useState<LandingDistanceResult | null>(null);

  useEffect(() => {
    if (destMetar && typeof destMetar === 'string') {
      const m = parseMetar(destMetar);
      const gustAddition = m.windGust ? Math.min(15, Math.round((m.windGust - (m.windSpd ?? 0)) / 3)) : 0;
      setWindAdditive(gustAddition);
      setConditions(prev => ({
        ...prev,
        oatC: m.oatC ?? prev.oatC,
        qnhHpa: m.qnhHpa ?? prev.qnhHpa,
        windDirectionDeg: m.windDir ?? prev.windDirectionDeg,
        windSpeedKt: m.windSpd ?? prev.windSpeedKt,
      }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedRunway) return;
    setConditions(prev => ({
      ...prev,
      runwayHeadingDeg: selectedRunway.headingTrue,
      elevationFt: selectedRunway.elevFt || prev.elevationFt,
    }));
  }, [selectedRunway]);

  useEffect(() => {
    if (!profile || !ldwKg) { setResult(null); setDistResult(null); return; }
    const flap = profile.landingFlaps[flapIdx];
    if (!flap) return;
    const r = calcLanding(flap.k, profile.vappBase, windAdditive, ldwKg, mlwKg, conditions);
    setResult(r);
    if (selectedAutobrake) {
      setDistResult(calcLandingDistance(r.vapp, selectedAutobrake, r.densityAlt, r.headwindComponent, runwayCond));
    } else {
      setDistResult(null);
    }
  }, [profile, flapIdx, windAdditive, ldwKg, mlwKg, conditions, selectedAutobrake, runwayCond]);

  if (!profile) {
    return (
      <div className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-lg p-5 flex items-center gap-3 text-sm text-amber-400">
        <Info size={16} />
        No performance profile for <span className="font-mono font-bold">{ofp.aircraft?.icaocode}</span>.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-white">{profile.name}</span>
        <span className="text-xs text-gray-500 font-mono">LDW: {ldwLabel}</span>
        {result?.overMLW && (
          <span className="flex items-center gap-1 text-xs text-red-400 bg-red-400/10 border border-red-400/20 px-2 py-0.5 rounded">
            <AlertTriangle size={10} /> Over MLW by {(result.overMLWBy / 1000).toFixed(1)}T
          </span>
        )}
        {result && !result.overMLW && (
          <span className="flex items-center gap-1 text-xs text-green-400">
            <CheckCircle size={10} /> Within MLW
          </span>
        )}
      </div>

      {/* Runway */}
      <div className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs text-gray-500 uppercase tracking-wider">Runway — {destIcao}</div>
          {selectedRunway && (
            <span className="text-xs text-gray-500 font-mono">
              {selectedRunway.lengthFt.toLocaleString()} ft · {selectedRunway.surface}
            </span>
          )}
        </div>
        <RunwaySelector icao={destIcao} onSelect={setSelectedRunway} />
      </div>

      {/* Landing config */}
      <div className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-lg p-4 space-y-3">
        <div className="text-xs text-gray-500 uppercase tracking-wider">Configuration</div>
        <div className="flex gap-2 flex-wrap">
          {profile.landingFlaps.map((f, i) => (
            <button
              key={f.label}
              onClick={() => setFlapIdx(i)}
              className={`px-3 py-1.5 rounded text-sm font-mono transition-colors ${flapIdx === i ? 'bg-blue-600 text-white' : 'bg-[var(--c-depth)] border border-[var(--c-border)] text-gray-400 hover:border-[var(--c-border2)]'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <div>
          <label className="block text-[10px] text-gray-500 uppercase tracking-wider mb-1">Wind additive (kt)</label>
          <input
            type="number"
            min={0} max={20}
            value={windAdditive}
            onChange={e => setWindAdditive(Math.max(0, parseInt(e.target.value) || 0))}
            className="w-24 bg-[var(--c-depth)] border border-[var(--c-border)] focus:border-blue-500 text-white rounded px-2 py-1.5 text-sm font-mono focus:outline-none"
          />
          <span className="text-xs text-gray-600 ml-2">VAPP = Vref + {profile.vappBase} + additive</span>
        </div>

        {/* Autobrake */}
        <div className="space-y-2">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">Autobrake</div>
          <div className="flex gap-1.5 flex-wrap">
            {profile.autobrakeLanding.map(ab => (
              <button
                key={ab}
                onClick={() => setSelectedAutobrake(prev => prev === ab ? null : ab)}
                className={`px-3 py-1.5 rounded text-xs font-mono font-semibold transition-colors ${
                  selectedAutobrake === ab
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/40'
                    : 'bg-[var(--c-depth)] border border-[var(--c-border)] text-gray-400 hover:border-gray-500 hover:text-gray-200'
                }`}
              >
                {ab}
              </button>
            ))}
          </div>
        </div>

        {/* Runway condition */}
        <div className="space-y-2">
          <div className="text-[10px] text-gray-500 uppercase tracking-wider">Runway Condition</div>
          <div className="grid grid-cols-3 gap-1.5">
            {RUNWAY_CONDITIONS.map(cond => (
              <button
                key={cond.label}
                onClick={() => setRunwayCond(cond)}
                title={cond.description}
                className={`px-2 py-2 rounded text-xs font-mono font-semibold transition-colors flex flex-col items-center gap-0.5 ${
                  runwayCond.label === cond.label
                    ? `bg-[#1a2236] border-2 border-current ${cond.color}`
                    : 'bg-[var(--c-depth)] border border-[var(--c-border)] text-gray-500 hover:border-gray-500 hover:text-gray-300'
                }`}
              >
                <span>{cond.label}</span>
                <span className="text-[9px] font-normal opacity-70 truncate w-full text-center">{cond.description.split('/')[0].trim()}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <ConditionsPanel
        conditions={conditions}
        onChange={setConditions}
        metar={typeof destMetar === 'string' ? destMetar : undefined}
        runwayLabel={ofp.destination.icao_code}
      />

      {result && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <VSpeed label="VREF" value={result.vref} />
            <VSpeed label="VAPP" value={result.vapp} highlight />
          </div>
          <AtmCard pa={result.pressureAlt} da={result.densityAlt} isa={0} hw={result.headwindComponent} />

          {distResult && (
            <div className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs text-gray-500 uppercase tracking-wider">
                  Landing Distance — AB {selectedAutobrake}
                </div>
                <span className={`text-xs font-mono font-semibold ${distResult.condition.color}`}>
                  {distResult.condition.label} ×{distResult.condition.multiplier.toFixed(2)}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-xs text-gray-500 mb-1">Ground Roll</div>
                  <div className="text-2xl font-bold font-mono text-white">
                    {distResult.groundRollFt.toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-600">ft</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">Total Dist</div>
                  <div className="text-2xl font-bold font-mono text-amber-300">
                    {distResult.totalFt.toLocaleString()}
                  </div>
                  <div className="text-xs text-gray-600">ft · incl. air dist</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 mb-1">Runway Margin</div>
                  {selectedRunway ? (() => {
                    const margin = selectedRunway.lengthFt - distResult.totalFt;
                    return (
                      <>
                        <div className={`text-2xl font-bold font-mono ${margin >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {margin >= 0 ? '+' : ''}{margin.toLocaleString()}
                        </div>
                        <div className="text-xs text-gray-600">ft vs {selectedRunway.lengthFt.toLocaleString()} ft LDA</div>
                      </>
                    );
                  })() : (
                    <div className="text-xs text-gray-600 pt-2">Select runway</div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="text-[10px] text-gray-600 text-center">
            For simulator use only · Not certified performance data
          </div>
        </>
      )}
    </div>
  );
}

// ── Atmosphere card ───────────────────────────────────────────────────────────

function AtmCard({ pa, da, isa, hw }: { pa: number; da: number; isa: number; hw: number }) {
  return (
    <div className="bg-[var(--c-surface)] border border-[var(--c-border)] rounded-lg p-3 grid grid-cols-4 gap-3 text-center text-xs">
      <div>
        <div className="text-gray-500 mb-0.5">Press Alt</div>
        <div className="font-mono text-white">{pa.toLocaleString()} ft</div>
      </div>
      <div>
        <div className="text-gray-500 mb-0.5">Density Alt</div>
        <div className="font-mono text-white">{da.toLocaleString()} ft</div>
      </div>
      <div>
        <div className="text-gray-500 mb-0.5">ISA Dev</div>
        <div className={`font-mono ${isa > 10 ? 'text-amber-400' : isa < -10 ? 'text-blue-300' : 'text-white'}`}>
          {isa > 0 ? '+' : ''}{isa}°C
        </div>
      </div>
      <div>
        <div className="text-gray-500 mb-0.5">Headwind</div>
        <div className={`font-mono ${hw >= 0 ? 'text-green-400' : 'text-red-400'}`}>
          {hw >= 0 ? '+' : ''}{hw} kt
        </div>
      </div>
    </div>
  );
}

// ── Main Performance Page ────────────────────────────────────────────────────

type Tab = 'weights' | 'takeoff' | 'landing';

export default function Performance() {
  const { ofp } = useEFBStore();
  const [activeTab, setActiveTab] = useState<Tab>('weights');

  if (!ofp) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500">
        <Gauge size={40} className="mb-3" />
        <p>No flight plan loaded. Go to Dashboard to load SimBrief OFP.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex gap-1 px-5 pt-4 shrink-0 border-b border-[var(--c-border)]">
        {(['weights', 'takeoff', 'landing'] as Tab[]).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium rounded-t transition-colors capitalize -mb-px ${
              activeTab === tab
                ? 'bg-[var(--c-surface)] border border-b-[var(--c-surface)] border-[var(--c-border)] text-white'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab === 'takeoff' ? 'Takeoff TOLD' : tab === 'landing' ? 'Landing TOLD' : 'Weights'}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto p-5">
        {activeTab === 'weights'  && <WeightsTab />}
        {activeTab === 'takeoff'  && <TakeoffTab />}
        {activeTab === 'landing'  && <LandingTab />}
      </div>
    </div>
  );
}
