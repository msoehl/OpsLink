import { useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, CircleMarker, Tooltip, Marker, useMap } from 'react-leaflet';
import type { LatLngTuple } from 'leaflet';
import L from 'leaflet';
import type { NavlogFix } from '../../types/simbrief';
import type { VatsimPilot } from '../../services/livetraffic/vatsim';
import { useEFBStore } from '../../store/efbStore';

interface Props {
  fixes: NavlogFix[];
  originIcao: string;
  destIcao: string;
  traffic?: VatsimPilot[];
  ownCallsign?: string;
}

function FitBounds({ positions }: { positions: LatLngTuple[] }) {
  const map = useMap();
  useEffect(() => {
    if (positions.length > 1) {
      map.fitBounds(positions, { padding: [40, 40] });
    }
  }, [map, positions]);
  return null;
}

function planeIcon(heading: number, isOwn: boolean) {
  const color = isOwn ? '#4ade80' : '#93c5fd';
  const size = isOwn ? 36 : 28;
  return L.divIcon({
    html: `<div style="transform:rotate(${heading}deg);font-size:${size}px;line-height:1;color:${color};text-shadow:0 0 6px #000,0 0 3px #000;filter:drop-shadow(0 0 4px rgba(0,0,0,0.9))">✈</div>`,
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export default function RouteMap({ fixes, originIcao, destIcao, traffic = [], ownCallsign }: Props) {
  const { theme } = useEFBStore();
  const positions: LatLngTuple[] = fixes
    .filter((f) => f.pos_lat !== '0.000000' && f.pos_long !== '0.000000')
    .map((f) => [parseFloat(f.pos_lat), parseFloat(f.pos_long)]);

  const midLat = positions.length > 0 ? positions[Math.floor(positions.length / 2)][0] : 50;
  const midLon = positions.length > 0 ? positions[Math.floor(positions.length / 2)][1] : 10;

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

      {/* Live traffic */}
      {traffic.map((pilot) => {
        const isOwn = !!ownCallsign && pilot.callsign === ownCallsign;
        return (
          <Marker
            key={pilot.callsign}
            position={[pilot.latitude, pilot.longitude]}
            icon={planeIcon(pilot.heading, isOwn)}
            zIndexOffset={isOwn ? 1000 : 0}
          >
            <Tooltip direction="top" offset={[0, -8]}>
              <div style={{ fontFamily: 'monospace', fontSize: '11px', lineHeight: '1.5' }}>
                <div style={{ fontWeight: 'bold', color: isOwn ? '#4ade80' : '#60a5fa' }}>{pilot.callsign}</div>
                {pilot.aircraft && <div style={{ color: '#9ca3af' }}>{pilot.aircraft}</div>}
                {(pilot.dep || pilot.dest) && (
                  <div style={{ color: '#d1d5db' }}>{pilot.dep || '????'} → {pilot.dest || '????'}</div>
                )}
                <div style={{ color: '#6b7280' }}>FL{Math.round(pilot.altitude / 100)} · {pilot.groundspeed} kt · {pilot.heading}°</div>
              </div>
            </Tooltip>
          </Marker>
        );
      })}

      <FitBounds positions={positions} />
    </MapContainer>
  );
}
