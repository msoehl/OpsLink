import type { VatsimController } from './vatsimAtc';

export class RateLimitError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`GitHub API rate limited (HTTP ${status})`);
    this.name = 'RateLimitError';
    this.status = status;
  }
}

async function fetchWithTimeout(url: string, timeoutMs = 10_000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const VATSPY_URL =
  'https://raw.githubusercontent.com/vatsimnetwork/vatspy-data-project/master/Boundaries.geojson';
const TRACON_BASE =
  'https://raw.githubusercontent.com/vatsimnetwork/simaware-tracon-project/main/Boundaries';

interface FirFeature {
  properties: { id: string };
  geometry: {
    type: 'Polygon' | 'MultiPolygon';
    coordinates: number[][][] | number[][][][];
  };
}


export interface ControllerSector {
  callsign: string;
  facility: number;
  rings: [number, number][][];
}

const TYPE_SUFFIXES = new Set(['CTR', 'FSS', 'FIR', 'UIR', 'OCEANIC']);

let firFeatures: FirFeature[] | null = null;
// Maps VATSIM callsign prefixes to SimAware TRACON identifiers where they differ.
// VATSIM controllers typically use 3-letter or FAA codes, not 4-letter ICAO.
const TRACON_ALIAS: Record<string, string> = {
  // New York TRACON (N90)
  'JFK': 'N90', 'EWR': 'N90', 'LGA': 'N90',
  'KJFK': 'N90', 'KEWR': 'N90', 'KLGA': 'N90',
  // Los Angeles TRACON (LAX)
  'SNA': 'LAX', 'BUR': 'LAX', 'LGB': 'LAX',
  'KSNA': 'LAX', 'KBUR': 'LAX', 'KLGB': 'LAX',
  // Chicago TRACON (C90)
  'ORD': 'C90', 'MDW': 'C90',
  'KORD': 'C90', 'KMDW': 'C90',
  // Atlanta TRACON (A80)
  'ATL': 'A80', 'KATL': 'A80',
  // Boston TRACON (A90)
  'BOS': 'A90', 'KBOS': 'A90',
  // Potomac TRACON (PCT)
  'IAD': 'PCT', 'DCA': 'PCT', 'BWI': 'PCT',
  'KIAD': 'PCT', 'KDCA': 'PCT', 'KBWI': 'PCT',
  // Dallas/Fort Worth TRACON (D10)
  'DFW': 'D10', 'DAL': 'D10',
  'KDFW': 'D10', 'KDAL': 'D10',
  // Denver TRACON (D01)
  'DEN': 'D01', 'KDEN': 'D01',
  // Miami TRACON (MIA)
  'FLL': 'MIA', 'KFLL': 'MIA',
  'KMIA': 'MIA',
  // Seattle TRACON (S46)
  'SEA': 'S46', 'KSEA': 'S46',
  // NorCal TRACON (NCT)
  'SFO': 'NCT', 'OAK': 'NCT', 'SJC': 'NCT',
  'KSFO': 'NCT', 'KOAK': 'NCT', 'KSJC': 'NCT',
  // Phoenix TRACON (P50)
  'PHX': 'P50', 'KPHX': 'P50',
  // Las Vegas TRACON (LAS)
  'KLAS': 'LAS',
  // Minneapolis TRACON (MSP)
  'MSP': 'MSP', 'KMSP': 'MSP',
  // Detroit TRACON (DTW)
  'DTW': 'DTW', 'KDTW': 'DTW',
  // Anchorage TRACON (A11)
  'ANC': 'A11', 'PANC': 'A11',
};

const traconCache = new Map<string, [number, number][][] | null>();

// Route TRACON fetches through Electron IPC (Node.js, no CORS/CSP constraints).
// Falls back to direct fetch when running outside Electron (e.g. unit tests).
async function fetchJsonProxy(url: string): Promise<unknown> {
  if (typeof window !== 'undefined' && window.electronAPI?.fetchGeojson) {
    return window.electronAPI.fetchGeojson(url);
  }
  const res = await fetchWithTimeout(url);
  if (res.status === 403 || res.status === 429) throw new RateLimitError(res.status);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function loadFirBoundaries(): Promise<FirFeature[]> {
  if (firFeatures) return firFeatures;
  try {
    const res = await fetchWithTimeout(VATSPY_URL);
    if (!res.ok) return [];
    const geojson = await res.json();
    firFeatures = geojson.features ?? [];
    return firFeatures!;
  } catch {
    return [];
  }
}

async function fetchRingsFromUrl(url: string): Promise<[number, number][][] | null> {
  try {
    const json = await fetchJsonProxy(url);
    if (!json) return null;
    return featureToRings(json as FirFeature);
  } catch {
    return null;
  }
}

async function loadTraconRings(prefix: string): Promise<[number, number][][] | null> {
  if (traconCache.has(prefix)) return traconCache.get(prefix)!;
  const folder = TRACON_ALIAS[prefix] ?? prefix;

  // Try 1: folder/prefix.json  (e.g. N90/JFK.json, EKBI/EKBI.json)
  const rings1 = await fetchRingsFromUrl(`${TRACON_BASE}/${folder}/${prefix}.json`);
  if (rings1?.length) { traconCache.set(prefix, rings1); return rings1; }

  // Try 2: folder/folder.json  (e.g. P50/P50.json — single-file TRACONs)
  if (folder !== prefix) {
    const rings2 = await fetchRingsFromUrl(`${TRACON_BASE}/${folder}/${folder}.json`);
    if (rings2?.length) { traconCache.set(prefix, rings2); return rings2; }
  }

  // Try 3: list folder via GitHub API and load ALL sub-files (e.g. N90 → JFK+EWR+LGA+...)
  try {
    const apiUrl = `https://api.github.com/repos/vatsimnetwork/simaware-tracon-project/contents/Boundaries/${folder}`;
    const apiRes = await fetchWithTimeout(apiUrl);
    if (apiRes.status === 403 || apiRes.status === 429) throw new RateLimitError(apiRes.status);
    if (!apiRes.ok) { traconCache.set(prefix, null); return null; }
    const files = await apiRes.json() as { name: string; download_url: string }[];
    if (Array.isArray(files)) {
      const allRings: [number, number][][] = [];
      await Promise.all(
        files
          .filter(f => f.name.endsWith('.json'))
          .map(async f => {
            const r = await fetchRingsFromUrl(f.download_url);
            if (r) allRings.push(...r);
          })
      );
      if (allRings.length > 0) { traconCache.set(prefix, allRings); return allRings; }
    }
  } catch (e) {
    if (e instanceof RateLimitError) throw e; // propagate — caller decides how to surface
    // ignore other errors
  }

  traconCache.set(prefix, null);
  return null;
}

function pointInRing(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}

function pointInFeature(lon: number, lat: number, f: FirFeature): boolean {
  const { type, coordinates } = f.geometry;
  if (type === 'Polygon')
    return pointInRing(lon, lat, (coordinates as number[][][])[0]);
  return (coordinates as number[][][][]).some(poly => pointInRing(lon, lat, poly[0]));
}

function featureToRings(f: FirFeature): [number, number][][] {
  const { type, coordinates } = f.geometry;
  const toLatLon = (ring: number[][]): [number, number][] =>
    ring.map(([lon, lat]) => [lat, lon]);
  if (type === 'Polygon')
    return [(coordinates as number[][][])[0]].map(toLatLon);
  return (coordinates as number[][][][]).map(poly => toLatLon(poly[0]));
}

function circleRings(lat: number, lon: number, radiusNm: number, points = 36): [number, number][][] {
  const ring: [number, number][] = [];
  for (let i = 0; i <= points; i++) {
    const angle = (2 * Math.PI * i) / points;
    const dlat = (radiusNm / 60) * Math.cos(angle);
    const dlon = (radiusNm / (60 * Math.cos((lat * Math.PI) / 180))) * Math.sin(angle);
    ring.push([lat + dlat, lon + dlon]);
  }
  return [ring];
}

export async function fetchControllerSectors(
  controllers: VatsimController[],
): Promise<ControllerSector[]> {
  const ctrCtrl = controllers.filter(c => c.facility === 6 || c.facility === 7);
  const appCtrl = controllers.filter(c => c.facility === 5);
  if (ctrCtrl.length === 0 && appCtrl.length === 0) return [];

  const firs = ctrCtrl.length > 0 ? await loadFirBoundaries() : [] as FirFeature[];
  const results: ControllerSector[] = [];

  for (const c of ctrCtrl) {
    const parts = c.callsign.split('_');
    const prefix = parts[0].toUpperCase();

    // Build candidate IDs, most-specific first:
    // "EDMM_HOF_CTR" → try "EDMM-HOF" then "EDMM"
    // "EGTT_CTR"     → try "EGTT" only (no subsector)
    const candidateIds: string[] = [];
    if (parts.length >= 3 && !TYPE_SUFFIXES.has(parts[1].toUpperCase()))
      candidateIds.push(`${prefix}-${parts[1].toUpperCase()}`);
    candidateIds.push(prefix);

    let feature: FirFeature | undefined;
    for (const id of candidateIds) {
      feature = firs.find((f: FirFeature) => f.properties.id === id);
      if (feature) break;
    }
    if (!feature)
      feature = firs.find((f: FirFeature) => pointInFeature(c.longitude, c.latitude, f));
    if (feature)
      results.push({ callsign: c.callsign, facility: 6, rings: featureToRings(feature) });
  }

  await Promise.all(appCtrl.map(async c => {
    const prefix = c.callsign.split('_')[0].toUpperCase();
    const rings = await loadTraconRings(prefix);
    if (rings) {
      results.push({ callsign: c.callsign, facility: 5, rings });
    } else if (
      isFinite(c.latitude) && isFinite(c.longitude) &&
      !(c.latitude === 0 && c.longitude === 0) &&
      c.visualRange > 0
    ) {
      results.push({ callsign: c.callsign, facility: 5, rings: circleRings(c.latitude, c.longitude, c.visualRange) });
    }
  }));

  return results;
}
