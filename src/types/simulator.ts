export interface SimPosition {
  lat: number;
  lon: number;
  altFt: number;
  headingTrue: number;
  groundspeedKts: number;
  verticalSpeedFpm: number;
  source: 'msfs' | 'p3d' | 'xplane';
  timestamp: number;
}
