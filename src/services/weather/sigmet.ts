export interface SigmetFeature {
  id: string;
  type: 'SIGMET' | 'AIRMET';
  hazard: string;
  coords: [number, number][];
  rawText: string;
}

interface GeoJSONFeature {
  type: string;
  geometry: {
    type: string;
    coordinates: [number, number][][] | [number, number][][][];
  };
  properties: {
    airSigmetType: string;
    hazard: string;
    rawAirSigmet: string;
    [key: string]: unknown;
  };
}

interface GeoJSONCollection {
  type: string;
  features: GeoJSONFeature[];
}

function toLatLon(ring: [number, number][]): [number, number][] {
  return ring
    .filter(([lon, lat]) => lon != null && lat != null && isFinite(lon) && isFinite(lat))
    .map(([lon, lat]) => [lat, lon]);
}

export async function fetchSigmets(): Promise<SigmetFeature[]> {
  const res = await fetch('https://aviationweather.gov/api/data/airsigmet?format=geojson');
  if (!res.ok) throw new Error('SigMET data unavailable');
  const data: GeoJSONCollection = await res.json();

  const results: SigmetFeature[] = [];

  data.features.forEach((f, i) => {
    if (!f.geometry) return;
    const sigType = (f.properties.airSigmetType === 'AIRMET' ? 'AIRMET' : 'SIGMET') as 'SIGMET' | 'AIRMET';
    const hazard = f.properties.hazard ?? '';
    const rawText = f.properties.rawAirSigmet ?? '';

    if (f.geometry.type === 'Polygon') {
      const ring = (f.geometry.coordinates as [number, number][][])[0] ?? [];
      results.push({ id: `sig-${i}`, type: sigType, hazard, coords: toLatLon(ring), rawText });
    } else if (f.geometry.type === 'MultiPolygon') {
      (f.geometry.coordinates as [number, number][][][]).forEach((poly, j) => {
        const ring = poly[0] ?? [];
        results.push({ id: `sig-${i}-${j}`, type: sigType, hazard, coords: toLatLon(ring), rawText });
      });
    }
  });

  return results;
}
