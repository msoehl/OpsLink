import { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { useEFBStore } from '../../store/efbStore';
import RouteMap from '../../components/map/RouteMap';
import type { NavlogFix } from '../../types/simbrief';
import { fetchVatsimTraffic, filterByBounds, type VatsimPilot } from '../../services/livetraffic/vatsim';
import { fetchIvaoTraffic } from '../../services/livetraffic/ivao';
import { fetchVatsimControllers, type VatsimController } from '../../services/livetraffic/vatsimAtc';
import { fetchIvaoControllers } from '../../services/livetraffic/ivaoAtc';
import { filterEnrouteControllers } from '../../services/livetraffic/enrouteAtc';
import { fetchControllerSectors, type ControllerSector, RateLimitError } from '../../services/livetraffic/vatglasses';
import type { EnrouteController } from '../../services/livetraffic/enrouteAtc';
import { Globe, Radio, Loader2, WifiOff, Joystick, Navigation, Trash2, Headphones, Copy, Check, LogIn, Crosshair } from 'lucide-react';

const REFRESH_INTERVAL = 30_000;
const BOUNDS_PAD = 4;

function fixDist(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dlat = lat1 - lat2;
  const dlon = lon1 - lon2;
  return Math.sqrt(dlat * dlat + dlon * dlon);
}

const FACILITY_COLOR: Record<number, string> = {
  2: '#60a5fa', 3: '#4ade80', 4: '#f87171', 5: '#bef264', 6: '#2dd4bf', 8: '#f59e0b',
};
const FACILITY_LABEL: Record<number, string> = {
  2: 'DEL', 3: 'GND', 4: 'TWR', 5: 'APP', 6: 'CTR', 8: 'ATIS',
};
const SECTION_LABEL: Record<string, string> = {
  origin: 'Origin', enroute: 'Enroute', destination: 'Destination', alternate: 'Alternate',
};

function EnrouteFreqPanel({ controllers, onLogon }: {
  controllers: EnrouteController[];
  onLogon: (callsign: string) => void;
}) {
  const [copied, setCopied] = useState<string | null>(null);

  function copyFreq(callsign: string, freq: string) {
    navigator.clipboard.writeText(freq).catch(() => {});
    setCopied(callsign);
    setTimeout(() => setCopied(null), 1200);
  }

  // Group by section, preserving order
  const sections: { key: string; items: EnrouteController[] }[] = [];
  for (const c of controllers) {
    const last = sections[sections.length - 1];
    if (last && last.key === c.section) {
      last.items.push(c);
    } else {
      sections.push({ key: c.section, items: [c] });
    }
  }

  return (
    <div className="w-48 shrink-0 flex flex-col border-l border-[var(--c-border)] bg-[var(--c-depth)] overflow-y-auto">
      <div className="px-3 py-2 border-b border-[var(--c-border)] shrink-0 flex items-center gap-2">
        <span className="text-[10px] text-gray-500 font-mono uppercase tracking-wider">ATC</span>
        <span className="text-[10px] text-gray-600">{controllers.length} online</span>
      </div>

      {sections.map(({ key, items }) => (
        <div key={key}>
          <div className="px-3 py-1 bg-[var(--c-base)] border-y border-[var(--c-border)]">
            <span className="text-[9px] font-mono uppercase tracking-widest text-gray-500">
              {SECTION_LABEL[key] ?? key}
            </span>
          </div>
          <div className="flex flex-col divide-y divide-[var(--c-border)]">
            {items.map((c) => {
              const color = FACILITY_COLOR[c.facility] ?? '#9ca3af';
              const label = FACILITY_LABEL[c.facility] ?? `F${c.facility}`;
              const isCopied = copied === c.callsign;
              return (
                <div key={c.callsign} className="px-3 py-2 space-y-1.5">
                  <div className="flex items-center gap-1 justify-between">
                    <span className="text-[10px] font-mono font-bold truncate" style={{ color }}>
                      {c.callsign}
                    </span>
                    <span className="text-[9px] font-mono shrink-0 px-1 rounded"
                      style={{ color, background: `${color}18` }}>
                      {label}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => copyFreq(c.callsign, c.frequency)}
                      className="flex items-center gap-1 text-[10px] font-mono text-gray-300 hover:text-white transition-colors"
                      title="Copy frequency"
                    >
                      {isCopied
                        ? <Check size={9} className="text-green-400" />
                        : <Copy size={9} className="text-gray-600" />}
                      {c.frequency}
                    </button>
                    {c.facility === 6 && (
                      <button
                        onClick={() => onLogon(c.callsign)}
                        className="ml-auto flex items-center gap-0.5 text-[9px] font-mono px-1.5 py-0.5 rounded border border-purple-500/30 text-purple-300 hover:bg-purple-500/10 transition-colors"
                        title="CPDLC Logon"
                      >
                        <LogIn size={9} />
                        CPDLC
                      </button>
                    )}
                  </div>
                  {c.section === 'enroute' && (
                    <div className="text-[9px] text-gray-600 font-mono truncate">
                      near {c.matchedFixIdent}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {controllers.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-[10px] text-gray-600 font-mono p-4 text-center">
          No ATC online along route
        </div>
      )}
    </div>
  );
}

function formatETE(minutes: number): string {
  if (!isFinite(minutes) || minutes < 0) return '--:--';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export default function MapPage() {
  const {
    ofp, atisNetwork, simPosition, simConnected, simSource, simTrail, clearSimTrail,
    mapTrafficEnabled: trafficEnabled, setMapTrafficEnabled: setTrafficEnabled,
    mapAtcEnabled: atcEnabled, setMapAtcEnabled: setAtcEnabled,
    mapTrailEnabled: trailEnabled, setMapTrailEnabled: setTrailEnabled,
    enrouteAtc, setEnrouteAtc,
    setPendingCpdlcLogon, setActivePage,
  } = useEFBStore();
  const [traffic, setTraffic] = useState<VatsimPilot[]>([]);
  const [trafficLoading, setTrafficLoading] = useState(false);
  const [trafficError, setTrafficError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [atc, setAtc] = useState<VatsimController[]>([]);
  const [atcRaw, setAtcRaw] = useState(0);
  const [sectorPolygons, setSectorPolygons] = useState<ControllerSector[]>([]);
  const [sectorError, setSectorError] = useState<string | null>(null);
  const atcIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const handleMapReady = useCallback((map: L.Map) => { mapRef.current = map; }, []);

  const fixes: NavlogFix[] = ofp
    ? Array.isArray(ofp.navlog?.fix)
      ? ofp.navlog.fix
      : ofp.navlog?.fix
      ? [ofp.navlog.fix as unknown as NavlogFix]
      : []
    : [];

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

  const routeKey = ofp ? `${ofp.origin.icao_code}-${ofp.destination.icao_code}` : '';

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

  async function loadAtc() {
    try {
      const fetchFn = atisNetwork === 'ivao' ? fetchIvaoControllers : fetchVatsimControllers;
      const controllers = await fetchFn();
      setAtcRaw(controllers.length);
      setAtc(controllers);
      setEnrouteAtc(filterEnrouteControllers(
        controllers, fixes,
        ofp?.origin.icao_code ?? '',
        ofp?.destination.icao_code ?? '',
        ofp?.alternate?.icao_code,
      ));
      // Only fetch sector polygons for VATSIM (not IVAO)
      // Use only controllers with valid coordinates (= visible on map) to avoid phantom sectors
      if (atisNetwork !== 'ivao') {
        const visible = controllers.filter(c =>
          isFinite(c.latitude) && isFinite(c.longitude) && !(c.latitude === 0 && c.longitude === 0)
        );
        fetchControllerSectors(visible)
          .then(sectors => { setSectorPolygons(sectors); setSectorError(null); })
          .catch(e => {
            if (e instanceof RateLimitError) {
              setSectorError('GitHub rate limit — sector polygons unavailable');
            }
            setSectorPolygons([]);
          });
      }
    } catch {
      setAtcRaw(0);
      setAtc([]);
      setEnrouteAtc([]);
      setSectorPolygons([]);
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
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trafficEnabled, atisNetwork]);

  useEffect(() => {
    if (atcEnabled) {
      loadAtc();
      atcIntervalRef.current = setInterval(loadAtc, REFRESH_INTERVAL);
    } else {
      setAtc([]);
      setAtcRaw(0);
      setEnrouteAtc([]);
    }
    return () => { if (atcIntervalRef.current) clearInterval(atcIntervalRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atcEnabled, atisNetwork]);

  // Progress strip
  let dtg: number | null = null;
  let ete: string | null = null;
  let nextFix: string | null = null;

  if (simPosition && fixes.length > 0) {
    const validFixes = fixes.filter(f => f.pos_lat !== '0.000000' && f.pos_long !== '0.000000');
    if (validFixes.length > 0) {
      let closestIdx = 0;
      let closestDist = Infinity;
      for (let i = 0; i < validFixes.length; i++) {
        const d = fixDist(simPosition.lat, simPosition.lon, parseFloat(validFixes[i].pos_lat), parseFloat(validFixes[i].pos_long));
        if (d < closestDist) { closestDist = d; closestIdx = i; }
      }
      const closest = validFixes[closestIdx];
      const dtgNm = parseFloat(closest.distanceto);
      if (!isNaN(dtgNm)) {
        dtg = Math.round(dtgNm);
        if (simPosition.groundspeedKts > 0) ete = formatETE((dtgNm / simPosition.groundspeedKts) * 60);
      }
      const nextIdx = closestIdx + 1;
      if (nextIdx < validFixes.length) nextFix = validFixes[nextIdx].ident;
    }
  }

  if (!ofp) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500">
        <Globe size={40} className="mb-3" />
        <p>No flight plan loaded. Go to Dashboard to load SimBrief OFP.</p>
      </div>
    );
  }

  // ATC with valid coords
  const atcVisible = atc.filter(c =>
    typeof c.latitude === 'number' && typeof c.longitude === 'number' &&
    isFinite(c.latitude) && isFinite(c.longitude) &&
    !(c.latitude === 0 && c.longitude === 0)
  );

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

          {atcEnabled && (
            <span className="text-xs text-gray-500">
              {atcVisible.length}/{atcRaw} ATC
            </span>
          )}

          {sectorError && (
            <span className="text-xs text-amber-500 font-mono" title={sectorError}>
              ⚠ Sectors
            </span>
          )}

          {(simConnected || simPosition) && (
            <div className="flex items-center gap-1.5 text-xs">
              <Joystick size={12} className={simConnected ? 'text-green-400' : 'text-gray-600'} />
              <span className={simConnected ? 'text-green-400' : 'text-gray-600'}>
                {simSource?.toUpperCase() ?? 'SIM'}
                {!simConnected && ' (last known)'}
              </span>
            </div>
          )}

          <button
            onClick={() => {
              if (!mapRef.current || fixes.length === 0) return;
              const validFixes = fixes.filter(f => f.pos_lat !== '0.000000' && f.pos_long !== '0.000000');
              if (validFixes.length < 2) return;
              const latLngs = validFixes.map(f => [parseFloat(f.pos_lat), parseFloat(f.pos_long)] as [number, number]);
              mapRef.current.fitBounds(latLngs, { padding: [40, 40] });
            }}
            title="Center on route"
            className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg border border-[var(--c-border)] text-gray-500 hover:text-white hover:border-[var(--c-border2)] transition-colors"
          >
            <Crosshair size={12} />
          </button>

          {simPosition && simTrail.length > 0 && (
            <button
              onClick={clearSimTrail}
              title="Clear trail"
              className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg border border-[var(--c-border)] text-gray-500 hover:text-red-400 hover:border-red-500/40 transition-colors"
            >
              <Trash2 size={12} />
            </button>
          )}

          {simPosition && (
            <button
              onClick={() => setTrailEnabled(!trailEnabled)}
              className={`flex items-center gap-1.5 text-xs px-3 py-1 rounded-lg border transition-colors ${
                trailEnabled
                  ? 'bg-amber-600/20 border-amber-500/40 text-amber-300'
                  : 'border-[var(--c-border)] text-gray-500 hover:text-gray-300 hover:border-[var(--c-border2)]'
              }`}
            >
              <Navigation size={12} />
              Trail
            </button>
          )}

          <button
            onClick={() => setAtcEnabled(!atcEnabled)}
            className={`flex items-center gap-1.5 text-xs px-3 py-1 rounded-lg border transition-colors ${
              atcEnabled
                ? 'bg-purple-600/20 border-purple-500/40 text-purple-300'
                : 'border-[var(--c-border)] text-gray-500 hover:text-gray-300 hover:border-[var(--c-border2)]'
            }`}
          >
            <Headphones size={12} />
            ATC
          </button>

          <button
            onClick={() => setTrafficEnabled(!trafficEnabled)}
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

      {simPosition && dtg !== null && (
        <div className="px-5 py-1.5 bg-[var(--c-depth)] border-b border-[var(--c-border)] shrink-0 flex items-center gap-5 text-xs font-mono">
          <span className="text-gray-500">PROGRESS</span>
          <span>DTG <span className="text-white">{dtg} NM</span></span>
          {ete && <span>ETE <span className="text-white">{ete}</span></span>}
          <span>GS <span className="text-white">{Math.round(simPosition.groundspeedKts)} kt</span></span>
          <span>FL<span className="text-white">{Math.round(simPosition.altFt / 100)}</span></span>
          {nextFix && <span className="text-gray-500">→ {nextFix}</span>}
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-hidden">
          {fixes.length > 0 ? (
            <RouteMap
              fixes={fixes}
              originIcao={ofp.origin.icao_code}
              destIcao={ofp.destination.icao_code}
              alternateLat={ofp.alternate?.pos_lat ? parseFloat(ofp.alternate.pos_lat) : undefined}
              alternateLon={ofp.alternate?.pos_long ? parseFloat(ofp.alternate.pos_long) : undefined}
              alternateIcao={ofp.alternate?.icao_code}
              traffic={traffic}
              simPosition={simPosition ?? undefined}
              showTrail={trailEnabled}
              controllers={atcVisible}
              sectorPolygons={atcEnabled ? sectorPolygons : []}
              routeKey={routeKey}
              onMapReady={handleMapReady}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-500 text-sm">
              No waypoint data available for this route.
            </div>
          )}
        </div>
        {atcEnabled && enrouteAtc.length > 0 && (
          <EnrouteFreqPanel
            controllers={enrouteAtc}
            onLogon={(callsign) => {
              setPendingCpdlcLogon(callsign);
              setActivePage('acars');
            }}
          />
        )}
      </div>
    </div>
  );
}
