import { useEFBStore } from '../../store/efbStore';
import { formatTime } from '../../services/simbrief/api';
import type { NavlogFix } from '../../types/simbrief';
import { FileText } from 'lucide-react';

export default function FlightPlan() {
  const { ofp } = useEFBStore();

  if (!ofp) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500">
        <FileText size={40} className="mb-3" />
        <p>No flight plan loaded. Go to Dashboard to load SimBrief OFP.</p>
      </div>
    );
  }

  const fixes: NavlogFix[] = Array.isArray(ofp.navlog?.fix)
    ? ofp.navlog.fix
    : ofp.navlog?.fix
    ? [ofp.navlog.fix as unknown as NavlogFix]
    : [];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-3 border-b border-[#1f2937] shrink-0">
        <div className="text-sm font-mono text-gray-300">
          <span className="text-blue-400 font-bold">{ofp.origin.icao_code}</span>
          <span className="text-gray-600 mx-2">→</span>
          <span className="text-blue-400 font-bold">{ofp.destination.icao_code}</span>
          <span className="text-gray-500 ml-4">{ofp.general.route_distance} NM</span>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-auto flex-1">
        <table className="w-full text-xs font-mono">
          <thead className="sticky top-0 bg-[#0d1117] z-10">
            <tr className="text-gray-500 uppercase text-[10px] tracking-wider">
              <th className="text-left px-4 py-2 w-8">#</th>
              <th className="text-left px-2 py-2">Ident</th>
              <th className="text-left px-2 py-2">Type</th>
              <th className="text-right px-2 py-2">Freq</th>
              <th className="text-right px-2 py-2">Alt (ft)</th>
              <th className="text-right px-2 py-2">TAS</th>
              <th className="text-right px-2 py-2">Wind</th>
              <th className="text-right px-2 py-2">OAT</th>
              <th className="text-right px-2 py-2">Dist</th>
              <th className="text-right px-2 py-2">Rem</th>
              <th className="text-right px-2 py-2">ETE</th>
              <th className="text-right px-2 py-2 pr-4">ETO</th>
            </tr>
          </thead>
          <tbody>
            {fixes.map((fix, i) => (
              <tr
                key={`${fix.ident}-${i}`}
                className={`border-t border-[#1a2030] ${
                  i % 2 === 0 ? 'bg-[#0a0e1a]' : 'bg-[#0d1117]'
                } hover:bg-[#111827]`}
              >
                <td className="px-4 py-1.5 text-gray-600">{i + 1}</td>
                <td className="px-2 py-1.5">
                  <span
                    className={
                      fix.type === 'apt'
                        ? 'text-green-400 font-bold'
                        : fix.type === 'vor' || fix.type === 'ndb'
                        ? 'text-yellow-400'
                        : 'text-gray-300'
                    }
                  >
                    {fix.ident}
                  </span>
                </td>
                <td className="px-2 py-1.5 text-gray-500 uppercase">{fix.type}</td>
                <td className="px-2 py-1.5 text-right text-gray-400">
                  {fix.frequency !== '0.000' ? fix.frequency : '—'}
                </td>
                <td className="px-2 py-1.5 text-right text-gray-300">
                  {parseInt(fix.altitude_feet).toLocaleString()}
                </td>
                <td className="px-2 py-1.5 text-right text-gray-300">{fix.true_airspeed}kt</td>
                <td className="px-2 py-1.5 text-right text-gray-400">
                  {fix.wind_dir}/{fix.wind_spd}
                </td>
                <td className="px-2 py-1.5 text-right text-gray-400">{fix.oat}°</td>
                <td className="px-2 py-1.5 text-right text-gray-300">{fix.distance}</td>
                <td className="px-2 py-1.5 text-right text-gray-400">{fix.distanceto}</td>
                <td className="px-2 py-1.5 text-right text-gray-400">{formatTime(fix.time_leg)}</td>
                <td className="px-2 py-1.5 pr-4 text-right text-gray-300">{formatTime(fix.time_total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
