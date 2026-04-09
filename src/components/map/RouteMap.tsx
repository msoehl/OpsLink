import { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Circle, Tooltip, Marker, Popup, Polygon, useMap } from 'react-leaflet';
import type { LatLngTuple } from 'leaflet';
import L from 'leaflet';
import type { NavlogFix } from '../../types/simbrief';
import type { VatsimPilot } from '../../services/livetraffic/vatsim';
import type { VatsimController } from '../../services/livetraffic/vatsimAtc';
import type { ControllerSector } from '../../services/livetraffic/vatglasses';
import { fetchAllVatsimATIS } from '../../services/atis/vatsim';
import type { ATISResult } from '../../services/atis/vatsim';
import { fetchAllIvaoATIS } from '../../services/atis/ivao';
import type { SimPosition } from '../../types/simulator';
import { useEFBStore } from '../../store/efbStore';

interface Props {
  fixes: NavlogFix[];
  originIcao: string;
  destIcao: string;
  alternateLat?: number;
  alternateLon?: number;
  alternateIcao?: string;
  traffic?: VatsimPilot[];
  simPosition?: SimPosition;
  showTrail?: boolean;
  controllers?: VatsimController[];
  sectorPolygons?: ControllerSector[];
  routeKey?: string;
  onMapReady?: (map: L.Map) => void;
}

function FitBounds({ positions, routeKey }: { positions: LatLngTuple[]; routeKey: string }) {
  const map = useMap();
  const firedRef = useRef(false);
  const lastKeyRef = useRef('');

  useEffect(() => {
    if (routeKey !== lastKeyRef.current) {
      lastKeyRef.current = routeKey;
      firedRef.current = false;
    }
    if (!firedRef.current && positions.length > 1) {
      map.fitBounds(positions, { padding: [40, 40] });
      firedRef.current = true;
    }
  }, [map, positions, routeKey]);
  return null;
}

function MapReadyEmitter({ onReady }: { onReady: (map: L.Map) => void }) {
  const map = useMap();
  useEffect(() => { onReady(map); }, [map, onReady]);
  return null;
}

function planeIcon(heading: number, isOwn: boolean, isSim = false) {
  const color = isSim ? '#f59e0b' : isOwn ? '#4ade80' : '#93c5fd';
  const size  = isSim ? 38 : isOwn ? 36 : 28;
  // SVG plane points up (north) by default → rotate by heading directly
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" style="transform:rotate(${heading}deg);filter:drop-shadow(0 0 3px rgba(0,0,0,0.9))"><path fill="${color}" d="M12 2 L8 14 L12 11 L16 14 Z M8 14 L7 20 L12 17 L17 20 L16 14"/></svg>`;
  return L.divIcon({
    html: svg,
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

const FACILITY_SHORT: Record<number, string> = { 2: 'D', 3: 'G', 4: 'T', 5: 'A', 6: 'C', 8: 'I' };
const FACILITY_LABEL: Record<number, string> = { 2: 'DEL', 3: 'GND', 4: 'TWR', 5: 'APP', 6: 'CTR', 8: 'ATIS' };

function facilityColor(facility: number): string {
  if (facility === 2) return '#60a5fa'; // DEL — blue
  if (facility === 3) return '#4ade80'; // GND — green
  if (facility === 4) return '#f87171'; // TWR — red
  if (facility === 5) return '#bef264'; // APP — citrus
  if (facility === 6) return '#2dd4bf'; // CTR — teal
  return '#9ca3af';
}

function atcGroupIcon(icao: string, facilities: number[]): L.DivIcon {
  const seen = new Set<number>();
  const unique: number[] = [];
  for (const f of facilities) {
    const n = Number(f);
    if (!seen.has(n) && FACILITY_SHORT[n]) { seen.add(n); unique.push(n); }
  }
  unique.sort((a, b) => a - b);

  const chips = unique.map(f => {
    const color = facilityColor(f);
    const letter = FACILITY_SHORT[f];
    return `<span style="color:${color};font-weight:700;font-size:9px;line-height:1">${letter}</span>`;
  }).join('<span style="color:#374151;font-size:8px;margin:0 1px">|</span>');

  const html = `<div style="display:inline-flex;flex-direction:column;align-items:center;gap:1px;background:rgba(10,10,15,0.88);border:1px solid rgba(255,255,255,0.12);border-radius:4px;padding:2px 5px;white-space:nowrap;font-family:monospace;box-shadow:0 1px 4px rgba(0,0,0,0.6);transform:translate(-50%,-50%)">
    <span style="color:#e5e7eb;font-size:9px;font-weight:700;line-height:1;letter-spacing:0.5px">${icao}</span>
    <div style="display:inline-flex;align-items:center;gap:1px">${chips}</div>
  </div>`;

  return L.divIcon({ html, className: '', iconSize: [0, 0], iconAnchor: [0, 0] });
}

interface AtcGroup {
  key: string;
  label: string;
  lat: number;
  lon: number;
  controllers: VatsimController[];
  topFacility: number;
  maxVisualRange: number;
}

const CTR_TYPE_SUFFIXES = new Set(['CTR', 'FSS', 'FIR', 'UIR', 'OCEANIC']);



function ctrLabel(callsign: string): string {
  const parts = callsign.split('_');
  const prefix = parts[0].toUpperCase();
  if (parts.length >= 3 && !CTR_TYPE_SUFFIXES.has(parts[1].toUpperCase()))
    return `${prefix}-${parts[1].toUpperCase()}`;
  return prefix;
}

function groupControllers(controllers: VatsimController[]): AtcGroup[] {
  const map = new Map<string, AtcGroup>();
  for (const c of controllers) {
    // CTR: each callsign gets its own marker keyed by its label (sub-sectors like EDMM-HOF stay separate)
    // Airport facilities: group by ICAO so DEL/GND/TWR stack under one pin
    const label = c.facility === 6
      ? ctrLabel(c.callsign)
      : (c.icao ?? c.callsign.split('_')[0]);
    const key = c.facility === 6 ? `ctr:${label}` : label;
    if (!map.has(key)) {
      map.set(key, { key, label, lat: c.latitude, lon: c.longitude, controllers: [], topFacility: 0, maxVisualRange: 0 });
    }
    const g = map.get(key)!;
    g.controllers.push(c);
    if (c.facility > g.topFacility) g.topFacility = c.facility;
    if (c.visualRange > g.maxVisualRange) g.maxVisualRange = c.visualRange;
  }
  // For airport groups (non-CTR): anchor at lowest-facility controller's position.
  // DEL/GND/TWR are at the airport; APP may be at the radar approach centre.
  for (const g of map.values()) {
    if (g.topFacility < 6) {
      const anchor = g.controllers.reduce((best, c) => c.facility < best.facility ? c : best);
      g.lat = anchor.latitude;
      g.lon = anchor.longitude;
    }
  }
  return [...map.values()];
}

const TAB_STYLE = (active: boolean): React.CSSProperties => ({
  padding: '2px 8px',
  fontSize: '10px',
  fontFamily: 'monospace',
  cursor: 'pointer',
  color: active ? '#e5e7eb' : '#6b7280',
  background: 'none',
  border: 'none',
  borderBottom: active ? '2px solid #60a5fa' : '2px solid transparent',
  marginBottom: '-1px',
});

function AtcTooltipContent({ group }: { group: AtcGroup }) {
  const [tab, setTab] = useState<'info' | 'wx'>('info');
  const [metar, setMetar] = useState<string | null>(null);
  const [metarLoading, setMetarLoading] = useState(false);
  const [atisList, setAtisList] = useState<ATISResult[] | 'loading' | 'none'>('loading');
  const sorted = [...group.controllers].sort((a, b) => b.facility - a.facility);
  const topColor = facilityColor(group.topFacility);
  const atisNetwork = useEFBStore(s => s.atisNetwork);

  useEffect(() => {
    if (tab === 'wx' && group.topFacility !== 6 && group.key.length >= 3) {
      if (atisList === 'loading') {
        (atisNetwork === 'ivao' ? fetchAllIvaoATIS : fetchAllVatsimATIS)(group.key)
          .then(results => setAtisList(results.length > 0 ? results : 'none'))
          .catch(() => setAtisList('none'));
      }
      if (metar === null) {
        setMetarLoading(true);
        fetch(`https://aviationweather.gov/api/data/metar?ids=${encodeURIComponent(group.key)}&format=json`)
          .then(r => r.json())
          .then((data: { rawOb?: string }[]) => setMetar(data?.[0]?.rawOb ?? 'No METAR available'))
          .catch(() => setMetar('METAR unavailable'))
          .finally(() => setMetarLoading(false));
      }
    }
  }, [tab, group.key, metar, atisList, atisNetwork]);

  useEffect(() => {
    setAtisList('loading');
  }, [atisNetwork]);

  return (
    <div style={{ fontFamily: 'monospace', fontSize: '11px', lineHeight: '1.6', minWidth: '220px' }}>
      {/* Header */}
      <div style={{ fontWeight: 'bold', color: topColor, fontSize: '12px', marginBottom: '4px' }}>
        {group.label}
        {sorted.length > 1 && (
          <span style={{ color: '#6b7280', fontWeight: 'normal', fontSize: '10px' }}> · {sorted.length} online</span>
        )}
      </div>

      {/* Tabs — ATIS/METAR irrelevant for CTR */}
      {group.topFacility !== 6 && (
        <div style={{ display: 'flex', borderBottom: '1px solid #374151', marginBottom: '6px' }}>
          <button style={TAB_STYLE(tab === 'info')} onClick={() => setTab('info')}>Stations</button>
          <button style={TAB_STYLE(tab === 'wx')} onClick={() => setTab('wx')}>ATIS / METAR</button>
        </div>
      )}

      {tab === 'info' && (
        <div>
          {sorted.map((ctrl) => {
            const fc = facilityColor(ctrl.facility);
            const label = FACILITY_LABEL[ctrl.facility] ?? `F${ctrl.facility}`;
            return (
              <div key={ctrl.callsign} style={{ display: 'grid', gridTemplateColumns: '32px 1fr auto', gap: '6px', alignItems: 'baseline', marginBottom: '3px' }}>
                <span style={{ color: fc, fontWeight: 'bold', fontSize: '10px' }}>{label}</span>
                <span style={{ color: '#e5e7eb' }}>{ctrl.callsign}</span>
                <span style={{ color: '#60a5fa' }}>{ctrl.frequency}</span>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'wx' && (
        <div style={{ maxWidth: '300px' }}>
          <div style={{ marginBottom: '8px' }}>
            <div style={{ color: '#60a5fa', fontWeight: 'bold', fontSize: '10px', marginBottom: '3px' }}>ATIS</div>
            {atisList === 'loading' && <div style={{ color: '#6b7280', fontSize: '10px' }}>Loading…</div>}
            {atisList === 'none' && <div style={{ color: '#4b5563', fontSize: '10px' }}>No ATIS online</div>}
            {Array.isArray(atisList) && atisList.map((atis, ai) => (
              <div key={ai} style={{ marginBottom: ai < atisList.length - 1 ? '6px' : 0 }}>
                <div style={{ color: '#6b7280', fontSize: '10px', marginBottom: '2px' }}>
                  {atis.callsign} · {atis.frequency}
                  {atis.code && <span style={{ color: '#f59e0b' }}> · Info {atis.code}</span>}
                </div>
                {atis.lines.map((line: string, i: number) => (
                  <div key={i} style={{ color: '#d1d5db', fontSize: '10px', whiteSpace: 'normal', lineHeight: '1.5' }}>{line}</div>
                ))}
              </div>
            ))}
          </div>
          <div>
            <div style={{ color: '#4ade80', fontWeight: 'bold', fontSize: '10px', marginBottom: '3px' }}>METAR</div>
            {metarLoading
              ? <div style={{ color: '#6b7280', fontSize: '10px' }}>Loading…</div>
              : <div style={{ color: '#d1d5db', fontSize: '10px', whiteSpace: 'normal', lineHeight: '1.5' }}>{metar}</div>
            }
          </div>
        </div>
      )}
    </div>
  );
}

export default function RouteMap({ fixes, originIcao, destIcao, alternateLat, alternateLon, alternateIcao, traffic = [], simPosition, showTrail, controllers = [], sectorPolygons = [], routeKey, onMapReady }: Props) {
  const { theme, simTrail } = useEFBStore();
  const simMarkerRef = useRef<L.Marker>(null);

  useEffect(() => {
    if (simMarkerRef.current && simPosition) {
      simMarkerRef.current.setIcon(planeIcon(simPosition.headingTrue, false, true));
    }
  }, [simPosition?.headingTrue]);
  const positions: LatLngTuple[] = fixes
    .filter((f) => f.pos_lat !== '0.000000' && f.pos_long !== '0.000000')
    .map((f) => [parseFloat(f.pos_lat), parseFloat(f.pos_long)]);

  const midLat = positions.length > 0 ? positions[Math.floor(positions.length / 2)][0] : 50;
  const midLon = positions.length > 0 ? positions[Math.floor(positions.length / 2)][1] : 10;

  const trailPositions: LatLngTuple[] = simTrail.map((p) => [p.lat, p.lon]);
  const controllerGroups = groupControllers(controllers);

  return (
    <MapContainer
      center={[midLat, midLon]}
      zoom={5}
      className="h-full w-full"
      zoomControl={true}
    >
      <TileLayer
        url={theme === 'light'
          ? 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'
          : 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>'
        maxZoom={19}
      />

      {positions.length > 1 && (
        <Polyline
          positions={positions}
          pathOptions={{ color: '#3b82f6', weight: 2, opacity: 0.8 }}
        />
      )}

      {showTrail && trailPositions.length > 1 && (
        <Polyline
          positions={trailPositions}
          pathOptions={{ color: '#f59e0b', weight: 1.5, opacity: 0.6 }}
        />
      )}

      {/* Alternate — dashed line from destination */}
      {alternateLat != null && alternateLon != null && positions.length > 0 && (() => {
        const dest = positions[positions.length - 1];
        const altnPos: LatLngTuple = [alternateLat, alternateLon];
        return (
          <>
            <Polyline
              positions={[dest, altnPos]}
              pathOptions={{ color: '#f97316', weight: 1.5, opacity: 0.7, dashArray: '6 6' }}
            />
            <CircleMarker
              center={altnPos}
              radius={6}
              pathOptions={{ color: '#f97316', fillColor: '#f97316', fillOpacity: 0.8, weight: 2 }}
            >
              <Tooltip permanent direction="top" offset={[0, -10]}>
                <span style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: 'bold', color: '#f97316' }}>
                  {alternateIcao ?? 'ALTN'}
                </span>
              </Tooltip>
            </CircleMarker>
          </>
        );
      })()}

      {fixes
        .filter((f) => f.pos_lat !== '0.000000' && f.pos_long !== '0.000000')
        .map((fix, i) => {
          const pos: LatLngTuple = [parseFloat(fix.pos_lat), parseFloat(fix.pos_long)];
          const isOrigin = i === 0;
          const isDest = i === fixes.length - 1;
          const isAirport = fix.type === 'apt';

          if (isOrigin || isDest) {
            return (
              <CircleMarker
                key={`${fix.ident}-${i}`}
                center={pos}
                radius={8}
                pathOptions={{
                  color: isOrigin ? '#22c55e' : '#ef4444',
                  fillColor: isOrigin ? '#22c55e' : '#ef4444',
                  fillOpacity: 1,
                  weight: 2,
                }}
              >
                <Tooltip permanent direction="top" offset={[0, -10]}>
                  <span style={{ fontFamily: 'monospace', fontSize: '11px', fontWeight: 'bold' }}>
                    {fix.ident}
                    {isOrigin ? ` (${originIcao})` : ` (${destIcao})`}
                  </span>
                </Tooltip>
              </CircleMarker>
            );
          }

          return (
            <CircleMarker
              key={`${fix.ident}-${i}`}
              center={pos}
              radius={isAirport ? 5 : 3}
              pathOptions={{
                color: isAirport ? '#f59e0b' : '#3b82f6',
                fillColor: isAirport ? '#f59e0b' : '#3b82f6',
                fillOpacity: 0.8,
                weight: 1,
              }}
            >
              <Tooltip direction="top" offset={[0, -5]}>
                <span style={{ fontFamily: 'monospace', fontSize: '11px' }}>
                  {fix.ident}
                  {(() => { const a = parseInt(String(fix.altitude_feet)); return !isNaN(a) && a > 0 ? ` FL${Math.round(a / 100)}` : ''; })()}
                </span>
              </Tooltip>
            </CircleMarker>
          );
        })}

      {/* Live traffic — low z-index so ATC labels render on top */}
      {traffic.map((pilot) => (
        <Marker
          key={pilot.callsign}
          position={[pilot.latitude, pilot.longitude]}
          icon={planeIcon(pilot.heading, false)}
          zIndexOffset={-100}
        >
          <Tooltip direction="top" offset={[0, -8]}>
            <div style={{ fontFamily: 'monospace', fontSize: '11px', lineHeight: '1.5' }}>
              <div style={{ fontWeight: 'bold', color: '#60a5fa' }}>{pilot.callsign}</div>
              {pilot.aircraft && <div style={{ color: '#9ca3af' }}>{pilot.aircraft}</div>}
              {(pilot.dep || pilot.dest) && (
                <div style={{ color: '#d1d5db' }}>{pilot.dep || '????'} → {pilot.dest || '????'}</div>
              )}
              <div style={{ color: '#6b7280' }}>FL{Math.round(pilot.altitude / 100)} · {pilot.groundspeed} kt · {pilot.heading}°</div>
            </div>
          </Tooltip>
        </Marker>
      ))}

      {/* Sector polygons — CTR/FSS (teal, vatspy) and APP (lime, simaware-tracon) */}
      {(sectorPolygons ?? []).flatMap((sector, i) => {
        const isApp = sector.facility === 5;
        const color = isApp ? '#bef264' : '#2dd4bf';
        const pathOptions = { color, fillOpacity: 0, weight: isApp ? 1.5 : 1, opacity: isApp ? 0.7 : 0.5 };

        if (!isApp) {
          return sector.rings.map((ring, j) => (
            <Polygon key={`sector-${i}-${j}`} positions={ring} pathOptions={pathOptions} />
          ));
        }

        return sector.rings.map((ring, j) => (
          <Polygon key={`sector-${i}-${j}`} positions={ring} pathOptions={pathOptions} />
        ));
      })}

      {/* APP radius circles — fallback where no TRACON polygon available */}
      {(() => {
        const polygonCallsigns = new Set(
          (sectorPolygons ?? []).filter(s => s.facility === 5).map(s => s.callsign)
        );
        return controllerGroups
          .filter(g =>
            g.controllers.some(c => c.facility === 5 && !polygonCallsigns.has(c.callsign))
            && g.maxVisualRange > 0
          )
          .map(g => (
            <Circle
              key={`app-${g.key}`}
              center={[g.lat, g.lon]}
              radius={Math.min(g.maxVisualRange, 20) * 1852}
              pathOptions={{ color: '#bef264', fillColor: '#bef264', fillOpacity: 0.04, weight: 1, opacity: 0.5 }}
            />
          ));
      })()}

      {/* VATSIM ATC stations — above traffic */}
      {(() => {
        const ctrCallsignsWithPolygon = new Set(
          sectorPolygons.filter(s => s.facility === 6).map(s => s.callsign)
        );
        return controllerGroups
          .filter(group =>
            // CTR groups whose sector is already labelled on its polygon don't need a separate pin
            !(group.topFacility === 6 && group.controllers.some(c => ctrCallsignsWithPolygon.has(c.callsign)))
          )
          .map((group) => (
            <Marker
              key={group.key}
              position={[group.lat, group.lon]}
              icon={atcGroupIcon(group.label, group.controllers.map(c => c.facility))}
              zIndexOffset={500}
            >
              <Popup offset={[0, -8]} closeButton={false} className="atc-popup">
                <AtcTooltipContent group={group} />
              </Popup>
            </Marker>
          ));
      })()}


      {/* Simulator own aircraft — shown in amber, always on top */}
      {simPosition && (
        <Marker
          ref={simMarkerRef}
          position={[simPosition.lat, simPosition.lon]}
          icon={planeIcon(simPosition.headingTrue, false, true)}
          zIndexOffset={2000}
        >
          <Tooltip direction="top" offset={[0, -10]}>
            <div style={{ fontFamily: 'monospace', fontSize: '11px', lineHeight: '1.5' }}>
              <div style={{ fontWeight: 'bold', color: '#f59e0b' }}>
                SIM · {simPosition.source.toUpperCase()}
              </div>
              <div style={{ color: '#d1d5db' }}>
                FL{Math.round(simPosition.altFt / 100)} · {Math.round(simPosition.groundspeedKts)} kt · {Math.round(simPosition.headingTrue)}°
              </div>
              {simPosition.verticalSpeedFpm !== 0 && (
                <div style={{ color: '#9ca3af' }}>
                  {simPosition.verticalSpeedFpm > 0 ? '+' : ''}{Math.round(simPosition.verticalSpeedFpm)} fpm
                </div>
              )}
            </div>
          </Tooltip>
        </Marker>
      )}

      <FitBounds positions={positions} routeKey={routeKey ?? ''} />
      {onMapReady && <MapReadyEmitter onReady={onMapReady} />}
    </MapContainer>
  );
}
