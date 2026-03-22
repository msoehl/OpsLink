export interface LogbookEntry {
  id: string;
  date: string;
  callsign: string;
  dep: string;
  arr: string;
  offBlockUtc: string;
  onBlockUtc: string;
  flightTimeMin: number;
  simulator: 'msfs' | 'p3d' | 'xplane' | 'manual';
  notes: string;
}
