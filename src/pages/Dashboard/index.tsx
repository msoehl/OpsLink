import { useEFBStore } from '../../store/efbStore';
import { fetchOFP } from '../../services/simbrief/api';
import { formatTime, formatFuel } from '../../services/simbrief/api';
import { Loader2, RefreshCw, AlertCircle, Plane, Clock, Fuel, Route } from 'lucide-react';

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-[#111827] border border-[#1f2937] rounded-lg p-4">
      <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</div>
      <div className="text-xl font-mono font-semibold text-white">{value}</div>
      {sub && <div className="text-xs text-gray-500 mt-0.5">{sub}</div>}
    </div>
  );
}

export default function Dashboard() {
  const {
    ofp, setOFP, isLoadingOFP, setIsLoadingOFP,
    ofpError, setOFPError, simbriefUsername, setActivePage
  } = useEFBStore();

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

  const { general, origin, destination, times, fuel, aircraft, weights, atc } = ofp;
  const units = general.units;

  return (
    <div className="p-5 overflow-auto h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
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
        <button
          onClick={loadOFP}
          disabled={isLoadingOFP}
          className="flex items-center gap-2 text-sm text-gray-400 hover:text-white border border-[#1f2937] hover:border-gray-600 px-3 py-1.5 rounded-lg transition-colors"
        >
          {isLoadingOFP ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          Refresh
        </button>
      </div>

      {/* Route */}
      <div className="bg-[#111827] border border-[#1f2937] rounded-lg p-3 mb-4 font-mono text-xs text-gray-300 leading-relaxed">
        <div className="text-gray-500 text-[10px] uppercase tracking-wider mb-1 flex items-center gap-1">
          <Route size={10} /> Route
        </div>
        {general.route}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-4 gap-3 mb-4">
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
          label="Est ZFW"
          value={`${(parseInt(weights.est_zfw) / 1000).toFixed(1)}T`}
          sub={`Max: ${(parseInt(weights.max_zfw) / 1000).toFixed(1)}T`}
        />
        <StatCard
          label="Init FL"
          value={`FL${(parseInt(general.initial_altitude) / 100).toFixed(0)}`}
          sub={`Plan: FL${(parseInt(general.planned_altitude) / 100).toFixed(0)}`}
        />
      </div>

      {/* Airports */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'ORIGIN', airport: origin },
          { label: 'DESTINATION', airport: destination },
        ].map(({ label, airport }) => (
          <div key={label} className="bg-[#111827] border border-[#1f2937] rounded-lg p-4">
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">{label}</div>
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-2xl font-bold font-mono text-white">{airport.icao_code}</span>
              <span className="text-sm text-gray-400">{airport.iata_code}</span>
            </div>
            <div className="text-sm text-gray-300 mb-3">{airport.name}</div>
            {airport.metar && (
              <div className="font-mono text-xs text-gray-400 bg-[#0d1117] rounded p-2 leading-relaxed">
                {airport.metar}
              </div>
            )}
            <div className="flex gap-4 mt-2 text-xs text-gray-500">
              <span>RWY {airport.runway || '—'}</span>
              <span>ELEV {airport.elevation}ft</span>
              <span className="flex items-center gap-1">
                <Clock size={10} />
                {airport.est_time_utc ? airport.est_time_utc.slice(-4).replace(/(\d{2})(\d{2})/, '$1:$2') + 'Z' : '—'}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Fuel breakdown */}
      <div className="mt-4 bg-[#111827] border border-[#1f2937] rounded-lg p-4">
        <div className="text-xs text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-1">
          <Fuel size={10} /> Fuel Breakdown
        </div>
        <div className="grid grid-cols-5 gap-4 text-sm">
          {[
            { label: 'Taxi', value: fuel.taxi },
            { label: 'Trip', value: fuel.enroute_burn },
            { label: 'Reserve', value: fuel.reserve },
            { label: 'Alternate', value: fuel.alternate_burn },
            { label: 'Extra', value: fuel.extra },
          ].map(({ label, value }) => (
            <div key={label} className="text-center">
              <div className="text-gray-500 text-xs mb-1">{label}</div>
              <div className="font-mono text-white">{formatFuel(value, units)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
