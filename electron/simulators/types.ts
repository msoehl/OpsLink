export interface SimPosition {
  lat: number;
  lon: number;
  altFt: number;
  headingTrue: number;
  groundspeedKts: number;
  verticalSpeedFpm: number;
  enginesRunning: boolean;
  source: 'msfs' | 'p3d' | 'xplane';
  timestamp: number;
}

export type PositionCallback = (pos: SimPosition) => void;
export type StatusCallback = (connected: boolean, source: 'msfs' | 'p3d' | 'xplane' | null) => void;
