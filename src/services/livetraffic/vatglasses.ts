import type { VatsimController } from './vatsimAtc';

const VATSPY_URL =
  'https://raw.githubusercontent.com/vatsimnetwork/vatspy-data-project/master/Boundaries.geojson';

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

let firFeatures: FirFeature[] | null = null;

async function loadFirBoundaries(): Promise<FirFeature[]> {
  if (firFeatures) return firFeatures;
  try {
    const res = await fetch(VATSPY_URL);
    if (!res.ok) return [];
    const geojson = await res.json();
    firFeatures = geojson.features ?? [];
    return firFeatures!;
  } catch {
    return [];
  }
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

export async function fetchControllerSectors(
  controllers: VatsimController[],
): Promise<ControllerSector[]> {
  const ctrCtrl = controllers.filter(c => c.facility === 6);
  if (ctrCtrl.length === 0) return [];

  const firs = await loadFirBoundaries();
  const results: ControllerSector[] = [];

  for (const c of ctrCtrl) {
    const prefix = c.callsign.split('_')[0].toUpperCase();
    let feature = firs.find(f => f.properties.id === prefix);
    if (!feature)
      feature = firs.find(f => pointInFeature(c.longitude, c.latitude, f));
    if (feature)
      results.push({ callsign: c.callsign, facility: 6, rings: featureToRings(feature) });
  }

  return results;
}
