export interface SimPosition {
  lat: number;
  lon: number;
  altFt: number;
  headingTrue: number;
  groundspeedKts: number;
  verticalSpeedFpm: number;
  enginesRunning: boolean;
  fuelKg: number | null;
  source: 'msfs' | 'p3d' | 'xplane';
  timestamp: number;
}
