/**
 * Runway data from OurAirports (open-source).
 * https://github.com/davidmegginson/ourairports-data
 * Headings are TRUE (not magnetic). Acceptable for simulator use.
 * For simulator use only — not certified data.
 */

const CSV_URL =
  'https://raw.githubusercontent.com/davidmegginson/ourairports-data/main/runways.csv';

export interface Runway {
  leIdent: string;       // e.g. "09L"
  heIdent: string;       // e.g. "27R"
  lengthFt: number;
  widthFt: number;
  surface: string;
  leHeadingTrue: number; // true heading of low-end threshold
  heHeadingTrue: number;
  leElevFt: number;
  heElevFt: number;
}

export interface RunwayEnd {
  ident: string;         // e.g. "27R"
  headingTrue: number;
  elevFt: number;
  lengthFt: number;
  widthFt: number;
  surface: string;
}

// Module-level cache — fetched once per session
let csvText: string | null = null;
let csvLoading: Promise<string> | null = null;
const airportCache = new Map<string, Runway[]>();

async function getCsv(): Promise<string> {
  if (csvText) return csvText;
  if (!csvLoading) {
    csvLoading = fetch(CSV_URL).then((r) => r.text()).then((t) => {
      csvText = t;
      return t;
    });
  }
  return csvLoading;
}

function parseRow(line: string): string[] {
  const cols: string[] = [];
  let current = '';
  let inQuote = false;
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === ',' && !inQuote) { cols.push(current); current = ''; continue; }
    current += ch;
  }
  cols.push(current);
  return cols;
}

function parseRunwaysFromCsv(csv: string, icao: string): Runway[] {
  const target = icao.toUpperCase();
  const runways: Runway[] = [];
  const lines = csv.split('\n');
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const c = parseRow(line);
    if (c.length < 19) continue;
    if (c[2].toUpperCase() !== target) continue;
    if (c[7] === '1') continue; // closed runway
    const lengthFt = parseInt(c[3]) || 0;
    if (lengthFt === 0) continue;
    runways.push({
      leIdent:        c[8],
      heIdent:        c[14],
      lengthFt,
      widthFt:        parseInt(c[4]) || 0,
      surface:        c[5],
      leHeadingTrue:  parseFloat(c[12]) || 0,
      heHeadingTrue:  parseFloat(c[18]) || 0,
      leElevFt:       parseInt(c[11]) || 0,
      heElevFt:       parseInt(c[17]) || 0,
    });
  }
  return runways;
}

export async function fetchRunways(icao: string): Promise<Runway[]> {
  const key = icao.toUpperCase();
  if (airportCache.has(key)) return airportCache.get(key)!;
  const csv = await getCsv();
  const runways = parseRunwaysFromCsv(csv, icao);
  airportCache.set(key, runways);
  return runways;
}

/** Expand runway pairs into individual runway ends */
export function runwayEnds(runways: Runway[]): RunwayEnd[] {
  const ends: RunwayEnd[] = [];
  for (const rwy of runways) {
    ends.push({
      ident: rwy.leIdent, headingTrue: rwy.leHeadingTrue,
      elevFt: rwy.leElevFt, lengthFt: rwy.lengthFt,
      widthFt: rwy.widthFt, surface: rwy.surface,
    });
    ends.push({
      ident: rwy.heIdent, headingTrue: rwy.heHeadingTrue,
      elevFt: rwy.heElevFt, lengthFt: rwy.lengthFt,
      widthFt: rwy.widthFt, surface: rwy.surface,
    });
  }
  return ends.sort((a, b) => a.ident.localeCompare(b.ident));
}
