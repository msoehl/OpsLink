import { useEFBStore } from '../../store/efbStore';
import { formatFuel } from '../../services/simbrief/api';
import { Gauge } from 'lucide-react';

function ProgressBar({ value, max, color = 'bg-blue-500' }: { value: number; max: number; color?: string }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="w-full bg-[#0d1117] rounded-full h-1.5">
      <div
        className={`${color} h-1.5 rounded-full transition-all`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function WeightRow({ label, value, max, units }: { label: string; value: string; max: string; units: string }) {
  const v = parseInt(value);
  const m = parseInt(max);
  const pct = Math.round((v / m) * 100);
  const color = pct > 95 ? 'bg-red-500' : pct > 85 ? 'bg-amber-500' : 'bg-green-500';

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span className="text-gray-400">{label}</span>
        <div className="flex items-center gap-3">
          <span className="font-mono text-white">{formatFuel(value, units)}</span>
          <span className="text-gray-500 text-xs">/ {formatFuel(max, units)}</span>
          <span className={`text-xs font-mono w-10 text-right ${pct > 95 ? 'text-red-400' : pct > 85 ? 'text-amber-400' : 'text-green-400'}`}>
            {pct}%
          </span>
        </div>
      </div>
      <ProgressBar value={v} max={m} color={color} />
    </div>
  );
}

export default function Performance() {
  const { ofp } = useEFBStore();

  if (!ofp) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500">
        <Gauge size={40} className="mb-3" />
        <p>No flight plan loaded. Go to Dashboard to load SimBrief OFP.</p>
      </div>
    );
  }

  const { weights, aircraft, general, fuel } = ofp;
  const units = general.units;

  return (
    <div className="p-5 overflow-auto h-full space-y-5">
      <h2 className="text-base font-semibold text-white">Performance & Weights</h2>

      {/* Aircraft info */}
      <div className="bg-[#111827] border border-[#1f2937] rounded-lg p-4">
        <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">Aircraft</div>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-gray-500 text-xs mb-0.5">Type</div>
            <div className="font-mono text-white">{aircraft.icaocode}</div>
          </div>
          <div>
            <div className="text-gray-500 text-xs mb-0.5">Registration</div>
            <div className="font-mono text-white">{aircraft.reg}</div>
          </div>
          <div>
            <div className="text-gray-500 text-xs mb-0.5">Name</div>
            <div className="text-white">{aircraft.name}</div>
          </div>
          <div>
            <div className="text-gray-500 text-xs mb-0.5">Wake Cat</div>
            <div className="font-mono text-white">{aircraft.wake}</div>
          </div>
          <div>
            <div className="text-gray-500 text-xs mb-0.5">Cruise TAS</div>
            <div className="font-mono text-white">{aircraft.cruise_tas}kt</div>
          </div>
          <div>
            <div className="text-gray-500 text-xs mb-0.5">Cost Index</div>
            <div className="font-mono text-white">{general.cost_index}</div>
          </div>
        </div>
      </div>

      {/* Weight limits */}
      <div className="bg-[#111827] border border-[#1f2937] rounded-lg p-4 space-y-4">
        <div className="text-xs text-gray-500 uppercase tracking-wider">Weights</div>
        <WeightRow label="Est. ZFW" value={weights.est_zfw} max={weights.max_zfw} units={units} />
        <WeightRow label="Est. TOW" value={weights.est_tow} max={weights.max_tow} units={units} />
        <WeightRow label="Est. LDW" value={weights.est_ldw} max={weights.max_ldw} units={units} />
        <WeightRow label="Est. Ramp" value={weights.est_ramp} max={aircraft.mtow} units={units} />
      </div>

      {/* Payload */}
      <div className="bg-[#111827] border border-[#1f2937] rounded-lg p-4">
        <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">Payload</div>
        <div className="grid grid-cols-4 gap-4 text-sm text-center">
          {[
            { label: 'Passengers', value: `${weights.pax_count} pax` },
            { label: 'Bags', value: `${weights.bag_count} bags` },
            { label: 'Cargo', value: formatFuel(weights.cargo, units) },
            { label: 'Total Payload', value: formatFuel(weights.payload, units) },
          ].map(({ label, value }) => (
            <div key={label}>
              <div className="text-gray-500 text-xs mb-1">{label}</div>
              <div className="font-mono text-white">{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Fuel policy */}
      <div className="bg-[#111827] border border-[#1f2937] rounded-lg p-4">
        <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">Fuel Policy</div>
        <div className="grid grid-cols-3 gap-4 text-sm text-center">
          {[
            { label: 'Policy', value: general.fuelpolicy || '—' },
            { label: 'Avg Flow', value: `${fuel.avg_fuel_flow} kg/hr` },
            { label: 'Max Tanks', value: formatFuel(fuel.max_tanks, units) },
          ].map(({ label, value }) => (
            <div key={label}>
              <div className="text-gray-500 text-xs mb-1">{label}</div>
              <div className="font-mono text-white">{value}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
