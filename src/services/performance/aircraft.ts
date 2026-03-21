/**
 * Simplified performance database for simulator use only.
 * V-speeds use the formula: speed = k * sqrt(weight_kg)
 * k values derived from published FCOM/QRH summaries.
 * NOT for real-world use.
 */

export interface FlapsConfig {
  label: string;
  k: number; // speed = k * sqrt(weight_kg)
}

export interface AircraftPerfProfile {
  name: string;
  /** SimBrief ICAO codes this profile covers */
  icaoCodes: string[];
  mtow: number; // kg
  mlw: number;  // kg
  /** V2 configs (takeoff) */
  takeoffFlaps: FlapsConfig[];
  /** VR = V2 + vrOffset (0 for Airbus, -4 for Boeing) */
  vrOffset: number;
  /** Vref configs (landing) */
  landingFlaps: FlapsConfig[];
  /** VAPP = Vref + vappBase (kt, calm wind) */
  vappBase: number;
  /** Default thrust reduction alt AAL (ft) */
  thrRedAlt: number;
  /** Default acceleration alt AAL (ft) */
  accAlt: number;
  /** Typical autbrake recommendations */
  autobrakeLanding: string[];
  autobrakeRTO: string;
  /** Max flex/assumed temperature (°C). Engine-type specific. */
  maxFlexC: number;
  /** Boeing uses "Assumed Temperature" instead of "Flex" */
  isBoeing: boolean;
  /** Thrust reduction per °C of flex above OAT (%, engine-specific) */
  thrustPctPerDegC: number;
  /** OEI 2nd segment gross climb gradient at MTOW, ISA+0, SL (%) */
  oeiClimbGradPct: number;
}

const PROFILES: AircraftPerfProfile[] = [
  // ── Airbus A318 ──────────────────────────────────────────────────────────
  {
    name: 'Airbus A318',
    icaoCodes: ['A318'],
    mtow: 68000, mlw: 57500,
    takeoffFlaps: [
      { label: 'CONF 1+F', k: 0.6050 },
      { label: 'CONF 2',   k: 0.5820 },
      { label: 'CONF 3',   k: 0.5620 },
    ],
    vrOffset: -2,
    landingFlaps: [
      { label: 'CONF 3',    k: 0.5820 },
      { label: 'CONF FULL', k: 0.5400 },
    ],
    vappBase: 5, thrRedAlt: 1500, accAlt: 1500,
    autobrakeLanding: ['LOW', 'MED', 'MAX'], autobrakeRTO: 'MAX',
    maxFlexC: 62, isBoeing: false,
    thrustPctPerDegC: 0.68, oeiClimbGradPct: 4.8,
  },
  // ── Airbus A319ceo ────────────────────────────────────────────────────────
  {
    name: 'Airbus A319',
    icaoCodes: ['A319'],
    mtow: 75500, mlw: 62500,
    takeoffFlaps: [
      { label: 'CONF 1+F', k: 0.5980 },
      { label: 'CONF 2',   k: 0.5760 },
      { label: 'CONF 3',   k: 0.5560 },
    ],
    vrOffset: -2,
    landingFlaps: [
      { label: 'CONF 3',    k: 0.5740 },
      { label: 'CONF FULL', k: 0.5340 },
    ],
    vappBase: 5, thrRedAlt: 1500, accAlt: 1500,
    autobrakeLanding: ['LOW', 'MED', 'MAX'], autobrakeRTO: 'MAX',
    maxFlexC: 62, isBoeing: false,
    thrustPctPerDegC: 0.68, oeiClimbGradPct: 4.5,
  },
  // ── Airbus A319neo ────────────────────────────────────────────────────────
  {
    name: 'Airbus A319neo',
    icaoCodes: ['A19N'],
    mtow: 75500, mlw: 62500,
    takeoffFlaps: [
      { label: 'CONF 1+F', k: 0.5965 },
      { label: 'CONF 2',   k: 0.5745 },
      { label: 'CONF 3',   k: 0.5545 },
    ],
    vrOffset: -2,
    landingFlaps: [
      { label: 'CONF 3',    k: 0.5720 },
      { label: 'CONF FULL', k: 0.5320 },
    ],
    vappBase: 5, thrRedAlt: 1500, accAlt: 1500,
    autobrakeLanding: ['LOW', 'MED', 'MAX'], autobrakeRTO: 'MAX',
    maxFlexC: 60, isBoeing: false,
    thrustPctPerDegC: 0.65, oeiClimbGradPct: 4.6,
  },
  // ── Airbus A320ceo ────────────────────────────────────────────────────────
  {
    name: 'Airbus A320',
    icaoCodes: ['A320'],
    mtow: 77000, mlw: 64500,
    takeoffFlaps: [
      { label: 'CONF 1+F', k: 0.5934 },
      { label: 'CONF 2',   k: 0.5708 },
      { label: 'CONF 3',   k: 0.5521 },
    ],
    vrOffset: -2,
    landingFlaps: [
      { label: 'CONF 3',    k: 0.5650 },
      { label: 'CONF FULL', k: 0.5256 },
    ],
    vappBase: 5, thrRedAlt: 1500, accAlt: 1500,
    autobrakeLanding: ['LOW', 'MED', 'MAX'], autobrakeRTO: 'MAX',
    maxFlexC: 62, isBoeing: false,
    thrustPctPerDegC: 0.68, oeiClimbGradPct: 4.4,
  },
  // ── Airbus A320neo ────────────────────────────────────────────────────────
  {
    name: 'Airbus A320neo',
    icaoCodes: ['A20N'],
    mtow: 79000, mlw: 67400,
    takeoffFlaps: [
      { label: 'CONF 1+F', k: 0.5910 },
      { label: 'CONF 2',   k: 0.5685 },
      { label: 'CONF 3',   k: 0.5498 },
    ],
    vrOffset: -2,
    landingFlaps: [
      { label: 'CONF 3',    k: 0.5620 },
      { label: 'CONF FULL', k: 0.5230 },
    ],
    vappBase: 5, thrRedAlt: 1500, accAlt: 1500,
    autobrakeLanding: ['LOW', 'MED', 'MAX'], autobrakeRTO: 'MAX',
    maxFlexC: 60, isBoeing: false,
    thrustPctPerDegC: 0.65, oeiClimbGradPct: 4.5,
  },
  // ── Airbus A321ceo ────────────────────────────────────────────────────────
  {
    name: 'Airbus A321',
    icaoCodes: ['A321'],
    mtow: 93500, mlw: 77800,
    takeoffFlaps: [
      { label: 'CONF 1+F', k: 0.5869 },
      { label: 'CONF 2',   k: 0.5629 },
      { label: 'CONF 3',   k: 0.5423 },
    ],
    vrOffset: -2,
    landingFlaps: [
      { label: 'CONF 3',    k: 0.5479 },
      { label: 'CONF FULL', k: 0.5148 },
    ],
    vappBase: 5, thrRedAlt: 1500, accAlt: 1500,
    autobrakeLanding: ['LOW', 'MED', 'MAX'], autobrakeRTO: 'MAX',
    maxFlexC: 62, isBoeing: false,
    thrustPctPerDegC: 0.68, oeiClimbGradPct: 3.8,
  },
  // ── Airbus A321neo ────────────────────────────────────────────────────────
  {
    name: 'Airbus A321neo',
    icaoCodes: ['A21N'],
    mtow: 97000, mlw: 80400,
    takeoffFlaps: [
      { label: 'CONF 1+F', k: 0.5845 },
      { label: 'CONF 2',   k: 0.5605 },
      { label: 'CONF 3',   k: 0.5400 },
    ],
    vrOffset: -2,
    landingFlaps: [
      { label: 'CONF 3',    k: 0.5450 },
      { label: 'CONF FULL', k: 0.5120 },
    ],
    vappBase: 5, thrRedAlt: 1500, accAlt: 1500,
    autobrakeLanding: ['LOW', 'MED', 'MAX'], autobrakeRTO: 'MAX',
    maxFlexC: 58, isBoeing: false,
    thrustPctPerDegC: 0.65, oeiClimbGradPct: 3.9,
  },
  // ── Airbus A321XLR ────────────────────────────────────────────────────────
  {
    name: 'Airbus A321XLR',
    icaoCodes: ['A21X', 'A321X'],
    mtow: 101000, mlw: 82000,
    takeoffFlaps: [
      { label: 'CONF 1+F', k: 0.5820 },
      { label: 'CONF 2',   k: 0.5582 },
      { label: 'CONF 3',   k: 0.5378 },
    ],
    vrOffset: -2,
    landingFlaps: [
      { label: 'CONF 3',    k: 0.5420 },
      { label: 'CONF FULL', k: 0.5090 },
    ],
    vappBase: 5, thrRedAlt: 1500, accAlt: 1500,
    autobrakeLanding: ['LOW', 'MED', 'MAX'], autobrakeRTO: 'MAX',
    maxFlexC: 58, isBoeing: false,
    thrustPctPerDegC: 0.65, oeiClimbGradPct: 3.6,
  },
  // ── Airbus A220-100 (BCS1) ───────────────────────────────────────────────
  {
    name: 'Airbus A220-100',
    icaoCodes: ['BCS1', 'CS100'],
    mtow: 63100, mlw: 52200,
    takeoffFlaps: [
      { label: 'Flaps 10', k: 0.6010 },
      { label: 'Flaps 20', k: 0.5750 },
    ],
    vrOffset: -3,
    landingFlaps: [
      { label: 'Flaps 25', k: 0.5720 },
      { label: 'Flaps 35', k: 0.5350 },
    ],
    vappBase: 5, thrRedAlt: 1500, accAlt: 1500,
    autobrakeLanding: ['LOW', 'MED', 'HIGH'], autobrakeRTO: 'MAX',
    maxFlexC: 55, isBoeing: false,
    thrustPctPerDegC: 0.62, oeiClimbGradPct: 4.2,
  },
  // ── Airbus A220-300 (BCS3) ───────────────────────────────────────────────
  {
    name: 'Airbus A220-300',
    icaoCodes: ['BCS3', 'CS300'],
    mtow: 70900, mlw: 58300,
    takeoffFlaps: [
      { label: 'Flaps 10', k: 0.5950 },
      { label: 'Flaps 20', k: 0.5690 },
    ],
    vrOffset: -3,
    landingFlaps: [
      { label: 'Flaps 25', k: 0.5660 },
      { label: 'Flaps 35', k: 0.5290 },
    ],
    vappBase: 5, thrRedAlt: 1500, accAlt: 1500,
    autobrakeLanding: ['LOW', 'MED', 'HIGH'], autobrakeRTO: 'MAX',
    maxFlexC: 55, isBoeing: false,
    thrustPctPerDegC: 0.62, oeiClimbGradPct: 4.0,
  },
  // ── Airbus A330-200 ───────────────────────────────────────────────────────
  {
    name: 'Airbus A330-200',
    icaoCodes: ['A332'],
    mtow: 242000, mlw: 182000,
    takeoffFlaps: [
      { label: 'CONF 1+F', k: 0.3464 },
      { label: 'CONF 2',   k: 0.3330 },
      { label: 'CONF 3',   k: 0.3200 },
    ],
    vrOffset: -2,
    landingFlaps: [
      { label: 'CONF 3',    k: 0.3460 },
      { label: 'CONF FULL', k: 0.3220 },
    ],
    vappBase: 5, thrRedAlt: 1500, accAlt: 1500,
    autobrakeLanding: ['LOW', 'MED', 'MAX'], autobrakeRTO: 'MAX',
    maxFlexC: 60, isBoeing: false,
    thrustPctPerDegC: 0.72, oeiClimbGradPct: 3.0,
  },
  // ── Airbus A330-300ceo ────────────────────────────────────────────────────
  {
    name: 'Airbus A330-300',
    icaoCodes: ['A333'],
    mtow: 242000, mlw: 187000,
    takeoffFlaps: [
      { label: 'CONF 1+F', k: 0.3443 },
      { label: 'CONF 2',   k: 0.3309 },
      { label: 'CONF 3',   k: 0.3175 },
    ],
    vrOffset: -2,
    landingFlaps: [
      { label: 'CONF 3',    k: 0.3420 },
      { label: 'CONF FULL', k: 0.3180 },
    ],
    vappBase: 5, thrRedAlt: 1500, accAlt: 1500,
    autobrakeLanding: ['LOW', 'MED', 'MAX'], autobrakeRTO: 'MAX',
    maxFlexC: 60, isBoeing: false,
    thrustPctPerDegC: 0.72, oeiClimbGradPct: 2.9,
  },
  // ── Airbus A330-800neo ────────────────────────────────────────────────────
  {
    name: 'Airbus A330-800neo',
    icaoCodes: ['A338'],
    mtow: 242000, mlw: 172000,
    takeoffFlaps: [
      { label: 'CONF 1+F', k: 0.3430 },
      { label: 'CONF 2',   k: 0.3296 },
      { label: 'CONF 3',   k: 0.3162 },
    ],
    vrOffset: -2,
    landingFlaps: [
      { label: 'CONF 3',    k: 0.3400 },
      { label: 'CONF FULL', k: 0.3160 },
    ],
    vappBase: 5, thrRedAlt: 1500, accAlt: 1500,
    autobrakeLanding: ['LOW', 'MED', 'MAX'], autobrakeRTO: 'MAX',
    maxFlexC: 60, isBoeing: false,
    thrustPctPerDegC: 0.68, oeiClimbGradPct: 3.1,
  },
  // ── Airbus A330-900neo ────────────────────────────────────────────────────
  {
    name: 'Airbus A330-900neo',
    icaoCodes: ['A339'],
    mtow: 251000, mlw: 188000,
    takeoffFlaps: [
      { label: 'CONF 1+F', k: 0.3418 },
      { label: 'CONF 2',   k: 0.3285 },
      { label: 'CONF 3',   k: 0.3152 },
    ],
    vrOffset: -2,
    landingFlaps: [
      { label: 'CONF 3',    k: 0.3385 },
      { label: 'CONF FULL', k: 0.3148 },
    ],
    vappBase: 5, thrRedAlt: 1500, accAlt: 1500,
    autobrakeLanding: ['LOW', 'MED', 'MAX'], autobrakeRTO: 'MAX',
    maxFlexC: 60, isBoeing: false,
    thrustPctPerDegC: 0.68, oeiClimbGradPct: 3.0,
  },
  // ── Airbus A350-900 ───────────────────────────────────────────────────────
  {
    name: 'Airbus A350-900',
    icaoCodes: ['A359'],
    mtow: 280000, mlw: 205000,
    takeoffFlaps: [
      { label: 'CONF 1+F', k: 0.3308 },
      { label: 'CONF 2',   k: 0.3164 },
      { label: 'CONF 3',   k: 0.3041 },
    ],
    vrOffset: -2,
    landingFlaps: [
      { label: 'CONF 3',    k: 0.3258 },
      { label: 'CONF FULL', k: 0.3052 },
    ],
    vappBase: 5, thrRedAlt: 1500, accAlt: 1500,
    autobrakeLanding: ['LOW', 'MED', 'MAX'], autobrakeRTO: 'MAX',
    maxFlexC: 60, isBoeing: false,
    thrustPctPerDegC: 0.70, oeiClimbGradPct: 3.2,
  },
  // ── Airbus A350-1000 ──────────────────────────────────────────────────────
  {
    name: 'Airbus A350-1000',
    icaoCodes: ['A35K'],
    mtow: 316000, mlw: 236000,
    takeoffFlaps: [
      { label: 'CONF 1+F', k: 0.3190 },
      { label: 'CONF 2',   k: 0.3060 },
      { label: 'CONF 3',   k: 0.2940 },
    ],
    vrOffset: -2,
    landingFlaps: [
      { label: 'CONF 3',    k: 0.3120 },
      { label: 'CONF FULL', k: 0.2920 },
    ],
    vappBase: 5, thrRedAlt: 1500, accAlt: 1500,
    autobrakeLanding: ['LOW', 'MED', 'MAX'], autobrakeRTO: 'MAX',
    maxFlexC: 60, isBoeing: false,
    thrustPctPerDegC: 0.70, oeiClimbGradPct: 3.0,
  },
  // ── Boeing 737-700 ────────────────────────────────────────────────────────
  {
    name: 'Boeing 737-700',
    icaoCodes: ['B737'],
    mtow: 70080, mlw: 58059,
    takeoffFlaps: [
      { label: 'Flaps 1',  k: 0.5990 },
      { label: 'Flaps 5',  k: 0.5730 },
      { label: 'Flaps 10', k: 0.5510 },
      { label: 'Flaps 15', k: 0.5360 },
    ],
    vrOffset: -4,
    landingFlaps: [
      { label: 'Flaps 15', k: 0.6010 },
      { label: 'Flaps 30', k: 0.5400 },
      { label: 'Flaps 40', k: 0.5060 },
    ],
    vappBase: 5, thrRedAlt: 1000, accAlt: 3000,
    autobrakeLanding: ['1', '2', '3', '4', 'MAX AUTO'], autobrakeRTO: 'RTO',
    maxFlexC: 60, isBoeing: true,
    thrustPctPerDegC: 0.68, oeiClimbGradPct: 4.8,
  },
  // ── Boeing 737-800 ────────────────────────────────────────────────────────
  {
    name: 'Boeing 737-800',
    icaoCodes: ['B738', 'B738S'],
    mtow: 79016, mlw: 66361,
    takeoffFlaps: [
      { label: 'Flaps 1',  k: 0.5963 },
      { label: 'Flaps 5',  k: 0.5689 },
      { label: 'Flaps 10', k: 0.5480 },
      { label: 'Flaps 15', k: 0.5335 },
    ],
    vrOffset: -4,
    landingFlaps: [
      { label: 'Flaps 15', k: 0.5941 },
      { label: 'Flaps 30', k: 0.5309 },
      { label: 'Flaps 40', k: 0.4980 },
    ],
    vappBase: 5, thrRedAlt: 1000, accAlt: 3000,
    autobrakeLanding: ['1', '2', '3', '4', 'MAX AUTO'], autobrakeRTO: 'RTO',
    maxFlexC: 60, isBoeing: true,
    thrustPctPerDegC: 0.68, oeiClimbGradPct: 4.3,
  },
  // ── Boeing 737-900 ────────────────────────────────────────────────────────
  {
    name: 'Boeing 737-900',
    icaoCodes: ['B739'],
    mtow: 85139, mlw: 71122,
    takeoffFlaps: [
      { label: 'Flaps 1',  k: 0.5880 },
      { label: 'Flaps 5',  k: 0.5620 },
      { label: 'Flaps 10', k: 0.5420 },
      { label: 'Flaps 15', k: 0.5270 },
    ],
    vrOffset: -4,
    landingFlaps: [
      { label: 'Flaps 15', k: 0.5870 },
      { label: 'Flaps 30', k: 0.5250 },
      { label: 'Flaps 40', k: 0.4920 },
    ],
    vappBase: 5, thrRedAlt: 1000, accAlt: 3000,
    autobrakeLanding: ['1', '2', '3', '4', 'MAX AUTO'], autobrakeRTO: 'RTO',
    maxFlexC: 60, isBoeing: true,
    thrustPctPerDegC: 0.68, oeiClimbGradPct: 3.9,
  },
  // ── Boeing 737 MAX 8 ──────────────────────────────────────────────────────
  {
    name: 'Boeing 737 MAX 8',
    icaoCodes: ['B38M'],
    mtow: 82191, mlw: 69300,
    takeoffFlaps: [
      { label: 'Flaps 1',  k: 0.5859 },
      { label: 'Flaps 5',  k: 0.5595 },
      { label: 'Flaps 10', k: 0.5380 },
      { label: 'Flaps 15', k: 0.5210 },
    ],
    vrOffset: -4,
    landingFlaps: [
      { label: 'Flaps 15', k: 0.5840 },
      { label: 'Flaps 30', k: 0.5218 },
      { label: 'Flaps 40', k: 0.4865 },
    ],
    vappBase: 5, thrRedAlt: 1000, accAlt: 3000,
    autobrakeLanding: ['1', '2', '3', '4', 'MAX AUTO'], autobrakeRTO: 'RTO',
    maxFlexC: 65, isBoeing: true,
    thrustPctPerDegC: 0.63, oeiClimbGradPct: 4.5,
  },
  // ── Boeing 737 MAX 9 ──────────────────────────────────────────────────────
  {
    name: 'Boeing 737 MAX 9',
    icaoCodes: ['B39M'],
    mtow: 88314, mlw: 74389,
    takeoffFlaps: [
      { label: 'Flaps 1',  k: 0.5810 },
      { label: 'Flaps 5',  k: 0.5550 },
      { label: 'Flaps 10', k: 0.5340 },
      { label: 'Flaps 15', k: 0.5170 },
    ],
    vrOffset: -4,
    landingFlaps: [
      { label: 'Flaps 15', k: 0.5790 },
      { label: 'Flaps 30', k: 0.5180 },
      { label: 'Flaps 40', k: 0.4840 },
    ],
    vappBase: 5, thrRedAlt: 1000, accAlt: 3000,
    autobrakeLanding: ['1', '2', '3', '4', 'MAX AUTO'], autobrakeRTO: 'RTO',
    maxFlexC: 65, isBoeing: true,
    thrustPctPerDegC: 0.63, oeiClimbGradPct: 4.2,
  },
  // ── Boeing 757-200 ────────────────────────────────────────────────────────
  {
    name: 'Boeing 757-200',
    icaoCodes: ['B752'],
    mtow: 115680, mlw: 89900,
    takeoffFlaps: [
      { label: 'Flaps 5',  k: 0.5050 },
      { label: 'Flaps 15', k: 0.4810 },
      { label: 'Flaps 20', k: 0.4640 },
    ],
    vrOffset: -5,
    landingFlaps: [
      { label: 'Flaps 20', k: 0.4990 },
      { label: 'Flaps 30', k: 0.4680 },
    ],
    vappBase: 5, thrRedAlt: 1000, accAlt: 3000,
    autobrakeLanding: ['1', '2', '3', '4', 'MAX AUTO'], autobrakeRTO: 'RTO',
    maxFlexC: 52, isBoeing: true,
    thrustPctPerDegC: 0.72, oeiClimbGradPct: 3.5,
  },
  // ── Boeing 777-200ER ──────────────────────────────────────────────────────
  {
    name: 'Boeing 777-200ER',
    icaoCodes: ['B772', 'B77L'],
    mtow: 297560, mlw: 213200,
    takeoffFlaps: [
      { label: 'Flaps 5',  k: 0.3280 },
      { label: 'Flaps 15', k: 0.3040 },
      { label: 'Flaps 20', k: 0.2920 },
    ],
    vrOffset: -5,
    landingFlaps: [
      { label: 'Flaps 25', k: 0.3199 },
      { label: 'Flaps 30', k: 0.2975 },
    ],
    vappBase: 5, thrRedAlt: 1000, accAlt: 3000,
    autobrakeLanding: ['1', '2', '3', 'MAX AUTO'], autobrakeRTO: 'RTO',
    maxFlexC: 55, isBoeing: true,
    thrustPctPerDegC: 0.74, oeiClimbGradPct: 3.2,
  },
  // ── Boeing 777-300ER ──────────────────────────────────────────────────────
  {
    name: 'Boeing 777-300ER',
    icaoCodes: ['B773', 'B77W'],
    mtow: 352400, mlw: 251290,
    takeoffFlaps: [
      { label: 'Flaps 5',  k: 0.3196 },
      { label: 'Flaps 15', k: 0.2959 },
      { label: 'Flaps 20', k: 0.2849 },
    ],
    vrOffset: -5,
    landingFlaps: [
      { label: 'Flaps 25', k: 0.3065 },
      { label: 'Flaps 30', k: 0.2856 },
    ],
    vappBase: 5, thrRedAlt: 1000, accAlt: 3000,
    autobrakeLanding: ['1', '2', '3', 'MAX AUTO'], autobrakeRTO: 'RTO',
    maxFlexC: 55, isBoeing: true,
    thrustPctPerDegC: 0.74, oeiClimbGradPct: 3.0,
  },
  // ── Boeing 787-8 ──────────────────────────────────────────────────────────
  {
    name: 'Boeing 787-8',
    icaoCodes: ['B788'],
    mtow: 227930, mlw: 172365,
    takeoffFlaps: [
      { label: 'Flaps 5',  k: 0.3420 },
      { label: 'Flaps 15', k: 0.3200 },
      { label: 'Flaps 20', k: 0.3070 },
    ],
    vrOffset: -4,
    landingFlaps: [
      { label: 'Flaps 25', k: 0.3350 },
      { label: 'Flaps 30', k: 0.3140 },
    ],
    vappBase: 5, thrRedAlt: 1000, accAlt: 3000,
    autobrakeLanding: ['1', '2', '3', 'MAX AUTO'], autobrakeRTO: 'RTO',
    maxFlexC: 52, isBoeing: true,
    thrustPctPerDegC: 0.70, oeiClimbGradPct: 3.5,
  },
  // ── Boeing 787-9 ──────────────────────────────────────────────────────────
  {
    name: 'Boeing 787-9',
    icaoCodes: ['B789'],
    mtow: 254011, mlw: 192778,
    takeoffFlaps: [
      { label: 'Flaps 5',  k: 0.3369 },
      { label: 'Flaps 15', k: 0.3156 },
      { label: 'Flaps 20', k: 0.3028 },
    ],
    vrOffset: -4,
    landingFlaps: [
      { label: 'Flaps 25', k: 0.3274 },
      { label: 'Flaps 30', k: 0.3083 },
    ],
    vappBase: 5, thrRedAlt: 1000, accAlt: 3000,
    autobrakeLanding: ['1', '2', '3', 'MAX AUTO'], autobrakeRTO: 'RTO',
    maxFlexC: 52, isBoeing: true,
    thrustPctPerDegC: 0.70, oeiClimbGradPct: 3.3,
  },
  // ── Boeing 787-10 ─────────────────────────────────────────────────────────
  {
    name: 'Boeing 787-10',
    icaoCodes: ['B78X'],
    mtow: 254011, mlw: 201849,
    takeoffFlaps: [
      { label: 'Flaps 5',  k: 0.3320 },
      { label: 'Flaps 15', k: 0.3110 },
      { label: 'Flaps 20', k: 0.2990 },
    ],
    vrOffset: -4,
    landingFlaps: [
      { label: 'Flaps 25', k: 0.3220 },
      { label: 'Flaps 30', k: 0.3030 },
    ],
    vappBase: 5, thrRedAlt: 1000, accAlt: 3000,
    autobrakeLanding: ['1', '2', '3', 'MAX AUTO'], autobrakeRTO: 'RTO',
    maxFlexC: 52, isBoeing: true,
    thrustPctPerDegC: 0.70, oeiClimbGradPct: 3.1,
  },
];

/** Index by all ICAO codes for fast lookup */
const INDEX = new Map<string, AircraftPerfProfile>();
for (const p of PROFILES) {
  for (const code of p.icaoCodes) {
    INDEX.set(code.toUpperCase(), p);
  }
}

export function getProfile(icaoCode: string): AircraftPerfProfile | null {
  return INDEX.get(icaoCode.toUpperCase()) ?? null;
}

export function getAllProfiles(): AircraftPerfProfile[] {
  return PROFILES;
}
