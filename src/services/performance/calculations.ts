/**
 * V-speed calculations and atmospheric helpers.
 * For simulator use only — not certified performance data.
 */

/**
 * Autobrake deceleration rates in ft/s².
 * Standard values — not aircraft-specific.
 */
export const AUTOBRAKE_DECEL: Record<string, number> = {
  'MAX':      14.0,
  'MAX AUTO': 14.0,
  'HIGH':     11.0,
  '4':        12.0,
  '3':        10.0,
  'MED':       8.0,
  '2':         8.0,
  'LOW':       6.0,
  '1':         6.0,
};

/** ICAO/EASA Runway Condition codes with distance multipliers */
export interface RunwayCondition {
  label: string;
  description: string;
  multiplier: number;
  color: string; // tailwind text color class
}

export const RUNWAY_CONDITIONS: RunwayCondition[] = [
  { label: 'DRY',   description: 'Dry',                   multiplier: 1.00, color: 'text-green-400'  },
  { label: 'DAMP',  description: 'Damp / Frost',          multiplier: 1.03, color: 'text-green-300'  },
  { label: 'WET',   description: 'Wet (≤3 mm water)',     multiplier: 1.15, color: 'text-yellow-400' },
  { label: 'SLIP',  description: 'Slippery when wet',     multiplier: 1.25, color: 'text-amber-400'  },
  { label: 'SNOW',  description: 'Compacted snow / Slush',multiplier: 1.40, color: 'text-blue-300'   },
  { label: 'ICE',   description: 'Ice / Wet ice',         multiplier: 1.80, color: 'text-red-400'    },
];

export interface LandingDistanceResult {
  groundRollFt: number;
  totalFt: number;
  condition: RunwayCondition;
}

/**
 * Simplified landing distance estimate.
 * groundRoll = Vtd_gs² / (2 * decel) × runway multiplier
 * Vtd_gs = (Vapp - 5kt) as TAS corrected for density altitude, minus headwind
 */
export function calcLandingDistance(
  vappKt: number,
  autobrakeLabel: string,
  densityAltFt: number,
  headwindKt: number,
  condition: RunwayCondition
): LandingDistanceResult {
  const decel = AUTOBRAKE_DECEL[autobrakeLabel] ?? 8;

  // Density ratio (sigma) for TAS correction
  const sigma = Math.min(1, Math.max(0.3, Math.pow(1 - densityAltFt / 145366, 4.255)));

  // Touchdown CAS ≈ Vapp - 5 kt, convert to ground speed
  const vtdCas = vappKt - 5;
  const vtdTas = vtdCas / Math.sqrt(sigma);
  const vtdGs = Math.max(vtdTas - headwindKt, vtdCas * 0.5);
  const vtdFps = vtdGs * 1.6878;

  const groundRollBase = vtdFps * vtdFps / (2 * decel);
  const airDist = 1000; // ~50 ft threshold crossing to touchdown
  const groundRoll = Math.round(groundRollBase * condition.multiplier);
  const total = Math.round((airDist + groundRollBase) * condition.multiplier);

  return { groundRollFt: groundRoll, totalFt: total, condition };
}

export interface TakeoffResult {
  v1: number;
  vr: number;
  v2: number;
  pressureAlt: number;
  densityAlt: number;
  isaDeviation: number;
  headwindComponent: number;
  /** Estimated takeoff roll (ft) */
  toRollFt: number | null;
  /** Estimated accelerate-stop distance (ft) */
  asdFt: number | null;
  /** Runway length used for V1 calc (ft), null if not provided */
  runwayFt: number | null;
  /** True if runway is sufficient for estimated TODA */
  runwayOk: boolean | null;
}

export interface LandingResult {
  vref: number;
  vapp: number;
  pressureAlt: number;
  densityAlt: number;
  headwindComponent: number;
  overMLW: boolean;
  overMLWBy: number;
}

export interface Conditions {
  elevationFt: number;
  oatC: number;
  qnhHpa: number;
  windDirectionDeg: number;
  windSpeedKt: number;
  runwayHeadingDeg: number;
}

/** Pressure altitude (ft) */
export function pressureAltitude(elevFt: number, qnhHpa: number): number {
  return elevFt + (1013.25 - qnhHpa) * 27;
}

/** ISA temperature at a given pressure altitude */
export function isaTemp(pressAltFt: number): number {
  return 15 - 0.001981 * pressAltFt;
}

/** Density altitude (ft) */
export function densityAltitude(pressAltFt: number, oatC: number): number {
  const isa = isaTemp(pressAltFt);
  return pressAltFt + 120 * (oatC - isa);
}

/** Headwind component (positive = headwind, negative = tailwind) */
export function headwindComponent(
  windDir: number, windSpd: number, rwyHdg: number
): number {
  const angle = ((windDir - rwyHdg + 540) % 360) - 180; // angle between wind and runway in degrees
  return Math.round(windSpd * Math.cos((angle * Math.PI) / 180));
}

/** Crosswind component (absolute value) */
export function crosswindComponent(
  windDir: number, windSpd: number, rwyHdg: number
): number {
  const angle = ((windDir - rwyHdg + 540) % 360) - 180;
  return Math.round(Math.abs(windSpd * Math.sin((angle * Math.PI) / 180)));
}

/**
 * Calculate base V-speed from aircraft k-factor and weight.
 * V = k * sqrt(weight_kg)
 */
export function calcVspeed(k: number, weightKg: number): number {
  return Math.round(k * Math.sqrt(weightKg));
}

/**
 * Average jet acceleration during takeoff roll (ft/s²).
 * Typical narrow-body: ~4.5–5.5 ft/s²; wide-body: ~3.5–4.5 ft/s²
 */
const ACCEL_FTSS = 5.0;
/** Brake deceleration for ASD calculation (ft/s², equiv. to max braking) */
const BRAKE_DECEL_FTSS = 13.0;
/** Pilot reaction time after V1 decision (s) */
const REACTION_S = 2.0;

export function calcTakeoff(
  k_v2: number,
  vrOffset: number,
  v1ReductionKt: number,
  towKg: number,
  conditions: Conditions,
  runwayFt: number | null = null
): TakeoffResult {
  const pa = pressureAltitude(conditions.elevationFt, conditions.qnhHpa);
  const da = densityAltitude(pa, conditions.oatC);
  const isadev = conditions.oatC - isaTemp(pa);
  const hw = headwindComponent(conditions.windDirectionDeg, conditions.windSpeedKt, conditions.runwayHeadingDeg);

  // Density correction: effective groundspeed at rotation is higher at high DA
  const sigma = Math.min(1, Math.max(0.3, Math.pow(1 - da / 145366, 4.255)));

  const v2 = calcVspeed(k_v2, towKg);
  const vr = v2 + vrOffset;

  let v1: number;
  let toRollFt: number | null = null;
  let asdFt: number | null = null;
  let runwayOk: boolean | null = null;

  if (runwayFt !== null && runwayFt > 0) {
    // Convert VR to ground speed for distance calc (TAS - headwind)
    const vrTas = vr / Math.sqrt(sigma);
    const vrGs  = Math.max(vrTas - hw, vr * 0.5);
    const vrFps = vrGs * 1.6878;

    // Estimated takeoff roll to VR: s = v² / (2a)
    toRollFt = Math.round(vrFps * vrFps / (2 * ACCEL_FTSS));

    // Balanced V1: largest V1 where ASD ≤ TODA
    // ASD(V1) = V1_fps²/(2*a) + V1_fps*t_react + V1_fps²/(2*brake)
    //         = V1_fps² * (1/(2a) + 1/(2b)) + V1_fps * t_react  ≤ TODA
    // Solve for V1_fps using quadratic: A*x² + B*x - TODA = 0
    const A = 1 / (2 * ACCEL_FTSS) + 1 / (2 * BRAKE_DECEL_FTSS);
    const B = REACTION_S;
    const C = -runwayFt;
    const disc = B * B - 4 * A * C;
    const v1BalancedFps = disc >= 0 ? (-B + Math.sqrt(disc)) / (2 * A) : vrFps;
    const v1BalancedKt  = Math.round(v1BalancedFps / 1.6878 * Math.sqrt(sigma)); // back to CAS

    // Apply both the user reduction and the runway limit
    const v1FromReduction = vr - v1ReductionKt;
    v1 = Math.min(vr, v1FromReduction, v1BalancedKt);

    // ASD at chosen V1
    const v1Fps = v1 * 1.6878 / Math.sqrt(sigma);
    asdFt = Math.round(v1Fps * v1Fps / (2 * ACCEL_FTSS)
      + v1Fps * REACTION_S
      + v1Fps * v1Fps / (2 * BRAKE_DECEL_FTSS));

    runwayOk = toRollFt <= runwayFt && asdFt <= runwayFt;
  } else {
    v1 = Math.min(vr, vr - v1ReductionKt);
  }

  return {
    v1, vr, v2,
    pressureAlt: Math.round(pa),
    densityAlt: Math.round(da),
    isaDeviation: Math.round(isadev),
    headwindComponent: hw,
    toRollFt, asdFt, runwayFt, runwayOk,
  };
}

export function calcLanding(
  k_vref: number,
  vappBase: number,
  windAdditiveKt: number,
  ldwKg: number,
  mlwKg: number,
  conditions: Conditions
): LandingResult {
  const vref = calcVspeed(k_vref, ldwKg);
  const vapp = vref + vappBase + windAdditiveKt;

  const pa = pressureAltitude(conditions.elevationFt, conditions.qnhHpa);
  const da = densityAltitude(pa, conditions.oatC);
  const hw = headwindComponent(conditions.windDirectionDeg, conditions.windSpeedKt, conditions.runwayHeadingDeg);

  const overMLW = ldwKg > mlwKg;
  const overMLWBy = Math.max(0, ldwKg - mlwKg);

  return { vref, vapp, pressureAlt: Math.round(pa), densityAlt: Math.round(da), headwindComponent: hw, overMLW, overMLWBy };
}

// ── METAR parser ─────────────────────────────────────────────────────────────

export interface MetarData {
  oatC: number | null;
  qnhHpa: number | null;
  windDir: number | null;
  windSpd: number | null;
  windGust: number | null;
}

export function parseMetar(metar: string): MetarData {
  const result: MetarData = { oatC: null, qnhHpa: null, windDir: null, windSpd: null, windGust: null };
  if (!metar || typeof metar !== 'string') return result;

  // Temperature: "M02/M05" or "20/18"
  const tempMatch = metar.match(/\b(M?\d{2})\/(M?\d{2})\b/);
  if (tempMatch) {
    const raw = tempMatch[1];
    result.oatC = raw.startsWith('M') ? -parseInt(raw.slice(1)) : parseInt(raw);
  }

  // QNH: "Q1013" or "A2992" (convert altimeter to hPa)
  const qMatch = metar.match(/Q(\d{4})/);
  if (qMatch) {
    result.qnhHpa = parseInt(qMatch[1]);
  } else {
    const aMatch = metar.match(/A(\d{4})/);
    if (aMatch) {
      result.qnhHpa = Math.round(parseInt(aMatch[1]) * 0.338639);
    }
  }

  // Wind: "27015KT" or "27015G25KT" or "VRB05KT"
  const windMatch = metar.match(/\b(\d{3}|VRB)(\d{2,3})(?:G(\d{2,3}))?KT\b/);
  if (windMatch && windMatch[1] !== 'VRB') {
    result.windDir = parseInt(windMatch[1]);
    result.windSpd = parseInt(windMatch[2]);
    if (windMatch[3]) result.windGust = parseInt(windMatch[3]);
  } else if (windMatch && windMatch[1] === 'VRB') {
    result.windDir = null; // variable direction — don't override runway heading
    result.windSpd = parseInt(windMatch[2]);
  }

  return result;
}
