import type { HoppieMessage } from '../services/hoppie';

export interface LogbookEntry {
  id: string;
  date: string;
  callsign: string;
  dep: string;
  arr: string;
  offBlockUtc: string;
  onBlockUtc: string;
  flightTimeMin: number;
  simulator: 'msfs' | 'p3d' | 'xplane' | 'manual' | null;
  notes: string;
  phaseHistory: { phase: string; time: string }[];
  acarsMessages: HoppieMessage[];
  acType: string;
  acReg: string;
  ofpRequestId: string;
}
