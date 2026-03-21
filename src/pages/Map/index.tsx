import { useEffect, useRef, useState } from 'react';
import { useEFBStore } from '../../store/efbStore';
import RouteMap from '../../components/map/RouteMap';
import type { NavlogFix } from '../../types/simbrief';
import { fetchVatsimTraffic, filterByBounds, type VatsimPilot } from '../../services/livetraffic/vatsim';
import { fetchIvaoTraffic } from '../../services/livetraffic/ivao';
import { Globe, Radio, Loader2, WifiOff } from 'lucide-react';

const REFRESH_INTERVAL = 30_000;
const BOUNDS_PAD = 4; // degrees

export default function MapPage() {
  const { ofp, atisNetwork } = useEFBStore();
  const [trafficEnabled, setTrafficEnabled] = useState(false);
  const [traffic, setTraffic] = useState<VatsimPilot[]>([]);
  const [trafficLoading, setTrafficLoading] = useState(false);
  const [trafficError, setTrafficError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fixes: NavlogFix[] = ofp
    ? Array.isArray(ofp.navlog?.fix)
      ? ofp.navlog.fix
      : ofp.navlog?.fix
      ? [ofp.navlog.fix as unknown as NavlogFix]
      : []
    : [];

  // Compute bounding box from route
  const bounds = fixes.reduce(
    (acc, f) => {
      const lat = parseFloat(f.pos_lat);
      const lon = parseFloat(f.pos_long);
      if (isNaN(lat) || isNaN(lon) || (lat === 0 && lon === 0)) return acc;
      return {
        minLat: Math.min(acc.minLat, lat),
        maxLat: Math.max(acc.maxLat, lat),
        minLon: Math.min(acc.minLon, lon),
        maxLon: Math.max(acc.maxLon, lon),
      };
    },
    { minLat: 90, maxLat: -90, minLon: 180, maxLon: -180 },
  );

  async function loadTraffic() {
    if (!trafficEnabled) return;
    setTrafficLoading(true);
    setTrafficError(null);
    try {
      const fetchFn = atisNetwork === 'ivao' ? fetchIvaoTraffic : fetchVatsimTraffic;
      const all = await fetchFn();
      const filtered = filterByBounds(
        all,
        bounds.minLat - BOUNDS_PAD, bounds.maxLat + BOUNDS_PAD,
        bounds.minLon - BOUNDS_PAD, bounds.maxLon + BOUNDS_PAD,
      );
      setTraffic(filtered);
      setLastUpdate(new Date());
    } catch {
      setTrafficError(`${atisNetwork.toUpperCase()} data unavailable`);
      setTraffic([]);
    } finally {
      setTrafficLoading(false);
    }
  }

  useEffect(() => {
    if (trafficEnabled) {
      loadTraffic();
      intervalRef.current = setInterval(loadTraffic, REFRESH_INTERVAL);
    } else {
      setTraffic([]);
      setTrafficError(null);
      setLastUpdate(null);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trafficEnabled, atisNetwork]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ofp) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500">
        <Globe size={40} className="mb-3" />
        <p>No flight plan loaded. Go to Dashboard to load SimBrief OFP.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-5 py-2 border-b border-[var(--c-border)] shrink-0 flex items-center gap-3">
        <Globe size={14} className="text-gray-500" />
        <span className="text-xs text-gray-400 font-mono">
          {ofp.origin.icao_code} → {ofp.destination.icao_code}
        </span>
        <span className="text-xs text-gray-600">
          {ofp.general.route_distance} NM · {fixes.length} fixes
        </span>

        <div className="ml-auto flex items-center gap-3">
          {trafficEnabled && (
            <div className="flex items-center gap-1.5 text-xs">
              {trafficLoading ? (
                <Loader2 size={12} className="animate-spin text-gray-500" />
              ) : trafficError ? (
                <WifiOff size={12} className="text-red-400" />
              ) : (
                <Radio size={12} className="text-green-400" />
              )}
              {trafficError ? (
                <span className="text-red-400">{trafficError}</span>
              ) : lastUpdate ? (
                <span className="text-gray-500">
                  {traffic.length} aircraft · {lastUpdate.toUTCString().slice(17, 22)}Z
                </span>
              ) : null}
            </div>
          )}

          <button
            onClick={() => setTrafficEnabled(v => !v)}
            className={`flex items-center gap-1.5 text-xs px-3 py-1 rounded-lg border transition-colors ${
              trafficEnabled
                ? 'bg-blue-600/20 border-blue-500/40 text-blue-300'
                : 'border-[var(--c-border)] text-gray-500 hover:text-gray-300 hover:border-[var(--c-border2)]'
            }`}
          >
            <Radio size={12} />
            {atisNetwork.toUpperCase()} Live
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {fixes.length > 0 ? (
          <RouteMap
            fixes={fixes}
            originIcao={ofp.origin.icao_code}
            destIcao={ofp.destination.icao_code}
            traffic={traffic}
            ownCallsign={ofp.atc.callsign}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500 text-sm">
            No waypoint data available for this route.
          </div>
        )}
      </div>
    </div>
  );
}
