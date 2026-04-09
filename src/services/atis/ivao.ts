import type { ATISResult } from './vatsim';
import { fetchIvaoWhazzup } from '../livetraffic/ivaoWhazzup';

interface IvaoATC {
  callsign: string;
  atisMessage: string | null;
  lastTrack?: { frequency?: number };
}

interface IvaoData {
  clients?: { atcs?: IvaoATC[] };
}

function parseAtc(a: IvaoATC): ATISResult {
  const text = a.atisMessage ?? '';
  const codeMatch = text.match(/\bINFO(?:RMATION)?\s+([A-Z])\b/i);
  return {
    callsign: a.callsign,
    frequency: a.lastTrack?.frequency?.toFixed(3) ?? '—',
    code: codeMatch ? codeMatch[1].toUpperCase() : null,
    lines: text ? [text] : [],
  };
}

export async function fetchIvaoATIS(icao: string): Promise<ATISResult | null> {
  const results = await fetchAllIvaoATIS(icao);
  return results[0] ?? null;
}

export async function fetchAllIvaoATIS(icao: string): Promise<ATISResult[]> {
  const data = await fetchIvaoWhazzup() as IvaoData;
  const re = new RegExp(`^${icao.toUpperCase()}_[A-Z_]*ATIS`, 'i');
  return (data.clients?.atcs ?? []).filter((a: IvaoATC) => re.test(a.callsign)).map(parseAtc);
}
