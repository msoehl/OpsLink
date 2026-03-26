import type { VatsimController } from './vatsimAtc';
import type { NavlogFix } from '../../types/simbrief';

const R_NM = 3440.065;

function haversineNm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return 2 * R_NM * Math.asin(Math.sqrt(a));
}

function distToSegmentNm(
  pLat: number, pLon: number,
  aLat: number, aLon: number,
  bLat: number, bLon: number,
): number {
  const dx = bLon - aLon;
  const dy = bLat - aLat;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return haversineNm(pLat, pLon, aLat, aLon);
  const t = Math.max(0, Math.min(1, ((pLon - aLon) * dx + (pLat - aLat) * dy) / lenSq));
  return haversineNm(pLat, pLon, aLat + t * dy, aLon + t * dx);
}

const CTR_CORRIDOR_NM = 100;

export type EnrouteSection = 'origin' | 'enroute' | 'destination' | 'alternate';

export interface EnrouteController extends VatsimController {
  section: EnrouteSection;
  matchedFixIdent: string;
  matchedFixIndex: number;
}

function validCoords(c: VatsimController): boolean {
  return isFinite(c.latitude) && isFinite(c.longitude) &&
    !(c.latitude === 0 && c.longitude === 0);
}

function airportControllers(
  controllers: VatsimController[],
  icao: string,
  section: EnrouteSection,
  includeApp = true,
): EnrouteController[] {
  if (!icao) return [];
  return controllers
    .filter(c =>
      c.icao?.toUpperCase() === icao.toUpperCase() &&
      (includeApp || c.facility !== 5),
    )
    .sort((a, b) => a.facility - b.facility)
    .map(c => ({ ...c, section, matchedFixIdent: icao, matchedFixIndex: 0 }));
}

export function filterEnrouteControllers(
  controllers: VatsimController[],
  fixes: NavlogFix[],
  originIcao: string,
  destIcao: string,
  alternateIcao?: string,
): EnrouteController[] {
  const airportIcaos = new Set(
    [originIcao, destIcao, alternateIcao].filter(Boolean).map(s => s!.toUpperCase()),
  );

  const validFixes = fixes
    .map((f, i) => ({ idx: i, ident: f.ident, lat: parseFloat(f.pos_lat), lon: parseFloat(f.pos_long) }))
    .filter(f => !isNaN(f.lat) && !isNaN(f.lon) && !(f.lat === 0 && f.lon === 0));

  // ── Airport sections ─────────────────────────────────────────────────────
  const originCtrl   = airportControllers(controllers, originIcao,       'origin');
  const destCtrl     = airportControllers(controllers, destIcao,         'destination');
  const alternateCtrl = alternateIcao
    ? airportControllers(controllers, alternateIcao, 'alternate')
    : [];

  const airportCallsigns = new Set([
    ...originCtrl, ...destCtrl, ...alternateCtrl,
  ].map(c => c.callsign));

  // ── Enroute: CTR (6) + FSS/Oceanic (7) along route corridor (APP only at airport sections) ──
  const enrouteCandidates = controllers.filter(c =>
    (c.facility === 6 || c.facility === 7) &&
    validCoords(c) &&
    !airportCallsigns.has(c.callsign) &&
    !airportIcaos.has(c.icao?.toUpperCase() ?? ''),
  );

  const seen = new Set<string>();
  const enroute: EnrouteController[] = [];

  for (let i = 0; i < validFixes.length; i++) {
    const fix = validFixes[i];
    const next = validFixes[i + 1];

    for (const c of enrouteCandidates) {
      if (seen.has(c.callsign)) continue;
      const corridor = CTR_CORRIDOR_NM;
      const dist = next
        ? distToSegmentNm(c.latitude, c.longitude, fix.lat, fix.lon, next.lat, next.lon)
        : haversineNm(c.latitude, c.longitude, fix.lat, fix.lon);
      if (dist <= corridor) {
        seen.add(c.callsign);
        enroute.push({ ...c, section: 'enroute', matchedFixIdent: fix.ident, matchedFixIndex: fix.idx });
      }
    }
  }

  // Sort enroute by route order, CTR before APP at same fix
  enroute.sort((a, b) =>
    a.matchedFixIndex !== b.matchedFixIndex
      ? a.matchedFixIndex - b.matchedFixIndex
      : b.facility - a.facility,
  );

  return [...originCtrl, ...enroute, ...destCtrl, ...alternateCtrl];
}
