export interface SimbriefOFP {
  fetch: {
    status: string;
    time: string;
  };
  params: {
    request_id: string;
    user_id: string;
    time_generated: string;
  };
  general: {
    icao_airline: string;
    flight_number: string;
    is_etops: string;
    dx_rmk: string;
    sys_rmk: string;
    is_detailed_profile: string;
    cruise_profile: string;
    wind_favored: string;
    fuelpolicy: string;
    units: string;
    stepclimb_string: string;
    avg_temp_dev: string;
    avg_wind_comp: string;
    avg_wind_dir: string;
    avg_wind_spd: string;
    gc_distance: string;
    route_distance: string;
    air_distance: string;
    total_burn: string;
    cost_index: string;
    initial_altitude: string;
    planned_altitude: string;
    route: string;
    route_ifps: string;
  };
  origin: Airport;
  destination: Airport;
  alternate: Airport;
  times: {
    est_time_enroute: string;
    sched_time_enroute: string;
    est_out: string;
    est_off: string;
    est_on: string;
    est_in: string;
    sched_out: string;
    sched_off: string;
    sched_on: string;
    sched_in: string;
    est_block: string;
    taxi_out: string;
    taxi_in: string;
  };
  fuel: {
    plan_ramp: string;
    plan_takeoff: string;
    plan_land: string;
    plan_altn: string;
    min_takeoff: string;
    reserve: string;
    alternate_burn: string;
    contingency: string;
    enroute_burn: string;
    taxi: string;
    etops_burn: string;
    extra: string;
    avg_fuel_flow: string;
    max_tanks: string;
  };
  aircraft: {
    icaocode: string;
    iatacode: string;
    base_type: string;
    reg: string;
    selcal: string;
    name: string;
    engines: string;
    wake: string;
    equip: string;
    transponder: string;
    pbn: string;
    oew: string;
    mzfw: string;
    mtow: string;
    mlw: string;
    max_passengers: string;
    cruise_tas: string;
    fueltabs: string;
  };
  weights: {
    oew: string;
    pax_count: string;
    bag_count: string;
    pax_weight: string;
    bag_weight: string;
    freight_added: string;
    cargo: string;
    payload: string;
    est_zfw: string;
    max_zfw: string;
    est_tow: string;
    max_tow: string;
    est_ldw: string;
    max_ldw: string;
    est_ramp: string;
  };
  atc: {
    callsign: string;
    fir_orig: string;
    fir_dest: string;
    fir_altn: string;
    fir_etops: string;
    flight_rules: string;
    flight_type: string;
  };
  navlog: {
    fix: NavlogFix[];
  };
  weather: {
    orig_metar: string;
    orig_taf: string;
    dest_metar: string;
    dest_taf: string;
    altn_metar: string;
    altn_taf: string;
  };
  text: {
    plan_html: string;
  };
}

export interface Airport {
  icao_code: string;
  iata_code: string;
  name: string;
  elevation: string;
  pos_lat: string;
  pos_long: string;
  metar: string;
  taf: string;
  atis: string;
  transalt: string;
  translvl: string;
  est_time_utc: string;
  sched_time_utc: string;
  runway: string;
}

export interface NavlogFix {
  ident: string;
  name: string;
  type: string;
  frequency: string;
  pos_lat: string;
  pos_long: string;
  altitude_feet: string;
  ind_airspeed: string;
  true_airspeed: string;
  mach: string;
  wind_component: string;
  wind_dir: string;
  wind_spd: string;
  oat: string;
  fuel_flow: string;
  fuel_totalused: string;
  fuel_onboard: string;
  stage: string;
  act_stage: string;
  distance: string;
  distanceto: string;
  track_true: string;
  track_mag: string;
  heading_true: string;
  heading_mag: string;
  time_leg: string;
  time_total: string;
  mora: string;
}
