import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SimbriefOFP } from '../types/simbrief';
import type { HoppieMessage } from '../services/hoppie';
import type { SimPosition } from '../types/simulator';
import type { EnrouteController } from '../services/livetraffic/enrouteAtc';
import type { LogbookEntry } from '../types/logbook';

export type EFBPage = 'dashboard' | 'map' | 'flightplan' | 'acars' | 'settings' | 'logbook';

export interface AcarsTemplate {
  id: string;
  name: string;
  text: string;
}

interface EFBStore {
  activePage: EFBPage;
  setActivePage: (page: EFBPage) => void;

  simbriefUsername: string;
  setSimbriefUsername: (username: string) => void;
  ofp: SimbriefOFP | null;
  setOFP: (ofp: SimbriefOFP | null) => void;
  isLoadingOFP: boolean;
  setIsLoadingOFP: (loading: boolean) => void;
  ofpError: string | null;
  setOFPError: (error: string | null) => void;

  atisNetwork: 'vatsim' | 'ivao';
  setAtisNetwork: (network: 'vatsim' | 'ivao') => void;

  hoppieLogon: string;
  setHoppieLogon: (logon: string) => void;

  // Per-waypoint actuals (session only, not persisted)
  waypointActuals: Record<number, { fob: string; ato: string }>;
  setWaypointActual: (idx: number, data: Partial<{ fob: string; ato: string }>) => void;

  // ACARS messages (persisted, capped at 500)
  acarsMessages: HoppieMessage[];
  addAcarsMessage: (msg: HoppieMessage) => void;
  clearAcarsMessages: () => void;

  // CPDLC session (session only)
  cpdlcStation: string;
  setCpdlcStation: (station: string) => void;
  cpdlcMsgCounter: number;
  nextCpdlcMsgId: () => number;

  acarsUnread: number;
  incrementAcarsUnread: () => void;
  resetAcarsUnread: () => void;

  // Hoppie connection status (session only)
  hoppieConnected: boolean | null;
  setHoppieConnected: (v: boolean | null) => void;
  hoppiePolling: boolean;
  setHoppiePolling: (v: boolean) => void;
  hoppieError: string | null;
  setHoppieError: (v: string | null) => void;

  // Sound toggle (persisted)
  soundEnabled: boolean;
  setSoundEnabled: (v: boolean) => void;

  // Message templates (persisted)
  acarsTemplates: AcarsTemplate[];
  addAcarsTemplate: (t: Omit<AcarsTemplate, 'id'>) => void;
  removeAcarsTemplate: (id: string) => void;

  theme: 'dark' | 'light';
  setTheme: (theme: 'dark' | 'light') => void;

  // Simulator position (session only — never cleared on reconnect)
  simPosition: SimPosition | null;
  setSimPosition: (pos: SimPosition) => void;
  simConnected: boolean;
  simSource: 'msfs' | 'p3d' | 'xplane' | null;
  setSimStatus: (connected: boolean, source: 'msfs' | 'p3d' | 'xplane' | null) => void;

  // Breadcrumb trail (session only, not persisted)
  simTrail: { lat: number; lon: number }[];
  appendSimTrail: (point: { lat: number; lon: number }) => void;
  clearSimTrail: () => void;

  // Enroute ATC (session only)
  enrouteAtc: EnrouteController[];
  setEnrouteAtc: (controllers: EnrouteController[]) => void;

  // CPDLC logon intent from Map page (session only)
  pendingCpdlcLogon: string | null;
  setPendingCpdlcLogon: (callsign: string | null) => void;

  // Update channel (persisted)
  updateChannel: 'stable' | 'dev';
  setUpdateChannel: (ch: 'stable' | 'dev') => void;

  // Map layer toggles (persisted)
  mapTrafficEnabled: boolean;
  mapAtcEnabled: boolean;
  mapTrailEnabled: boolean;
  setMapTrafficEnabled: (v: boolean) => void;
  setMapAtcEnabled: (v: boolean) => void;
  setMapTrailEnabled: (v: boolean) => void;

  // Logbook (persisted)
  logbookEntries: LogbookEntry[];
  activeLogbookEntryId: string | null;
  openLogbookEntry: (entry: LogbookEntry) => void;
  closeLogbookEntry: () => void;
  updateLogbookEntry: (id: string, patch: Partial<LogbookEntry>) => void;
  deleteLogbookEntry: (id: string) => void;
}

export const useEFBStore = create<EFBStore>()(
  persist(
    (set, get) => ({
      activePage: 'dashboard',
      setActivePage: (page) => set({ activePage: page }),

      simbriefUsername: '',
      setSimbriefUsername: (username) => set({ simbriefUsername: username }),
      ofp: null,
      setOFP: (ofp) => set({ ofp }),
      isLoadingOFP: false,
      setIsLoadingOFP: (loading) => set({ isLoadingOFP: loading }),
      ofpError: null,
      setOFPError: (error) => set({ ofpError: error }),

      atisNetwork: 'vatsim',
      setAtisNetwork: (network) => set({ atisNetwork: network }),

      hoppieLogon: '',
      setHoppieLogon: (logon) => set({ hoppieLogon: logon }),

      waypointActuals: {},
      setWaypointActual: (idx, data) => set((state) => ({
        waypointActuals: {
          ...state.waypointActuals,
          [idx]: { ...{ fob: '', ato: '' }, ...state.waypointActuals[idx], ...data },
        },
      })),
      acarsMessages: [],
      addAcarsMessage: (msg) => set(s => {
        const updated = [...s.acarsMessages, { ...msg, receivedAt: new Date(msg.receivedAt) }];
        return { acarsMessages: updated.length > 500 ? updated.slice(updated.length - 500) : updated };
      }),
      clearAcarsMessages: () => set({ acarsMessages: [] }),

      cpdlcStation: '',
      setCpdlcStation: (station) => set({ cpdlcStation: station }),
      cpdlcMsgCounter: 1,
      nextCpdlcMsgId: () => {
        let id = 0;
        set(s => { id = s.cpdlcMsgCounter; return { cpdlcMsgCounter: s.cpdlcMsgCounter + 1 }; });
        return id;
      },

      acarsUnread: 0,
      incrementAcarsUnread: () => set(s => ({ acarsUnread: s.acarsUnread + 1 })),
      resetAcarsUnread: () => set({ acarsUnread: 0 }),

      hoppieConnected: null,
      setHoppieConnected: (v) => set({ hoppieConnected: v }),
      hoppiePolling: false,
      setHoppiePolling: (v) => set({ hoppiePolling: v }),
      hoppieError: null,
      setHoppieError: (v) => set({ hoppieError: v }),

      soundEnabled: true,
      setSoundEnabled: (v) => set({ soundEnabled: v }),

      acarsTemplates: [],
      addAcarsTemplate: (t) => set(s => ({
        acarsTemplates: [...s.acarsTemplates, { ...t, id: Date.now().toString(36) }],
      })),
      removeAcarsTemplate: (id) => set(s => ({
        acarsTemplates: s.acarsTemplates.filter(t => t.id !== id),
      })),

      theme: 'dark',
      setTheme: (theme) => set({ theme }),

      simPosition: null,
      setSimPosition: (pos) => set({ simPosition: pos }),
      simConnected: false,
      simSource: null,
      setSimStatus: (connected, source) => set({ simConnected: connected, simSource: source }),

      simTrail: [],
      appendSimTrail: (point) => set((state) => {
        const trail = state.simTrail;
        if (trail.length > 0) {
          const last = trail[trail.length - 1];
          const dlat = point.lat - last.lat;
          const dlon = point.lon - last.lon;
          if (Math.sqrt(dlat * dlat + dlon * dlon) < 0.05) return state;
        }
        const updated = [...trail, point];
        return { simTrail: updated.length > 3000 ? updated.slice(updated.length - 3000) : updated };
      }),
      clearSimTrail: () => set({ simTrail: [] }),

      enrouteAtc: [],
      setEnrouteAtc: (controllers) => set({ enrouteAtc: controllers }),

      pendingCpdlcLogon: null,
      setPendingCpdlcLogon: (callsign) => set({ pendingCpdlcLogon: callsign }),

      updateChannel: 'stable',
      setUpdateChannel: (ch) => set({ updateChannel: ch }),

      mapTrafficEnabled: false,
      mapAtcEnabled: false,
      mapTrailEnabled: false,
      setMapTrafficEnabled: (v) => set({ mapTrafficEnabled: v }),
      setMapAtcEnabled: (v) => set({ mapAtcEnabled: v }),
      setMapTrailEnabled: (v) => set({ mapTrailEnabled: v }),

      logbookEntries: [],
      activeLogbookEntryId: null,
      openLogbookEntry: (entry) => set(s => ({
        logbookEntries: [entry, ...s.logbookEntries],
        activeLogbookEntryId: entry.id,
      })),
      closeLogbookEntry: () => set(s => {
        if (!s.activeLogbookEntryId) return s;
        const messages = get().acarsMessages;
        const updatedEntries = s.logbookEntries.map(e =>
          e.id === s.activeLogbookEntryId ? { ...e, acarsMessages: messages } : e
        );
        return { logbookEntries: updatedEntries, activeLogbookEntryId: null };
      }),
      updateLogbookEntry: (id, patch) => set(s => ({
        logbookEntries: s.logbookEntries.map(e => e.id === id ? { ...e, ...patch } : e),
      })),
      deleteLogbookEntry: (id) => set(s => ({
        logbookEntries: s.logbookEntries.filter(e => e.id !== id),
      })),
    }),
    {
      name: 'opslink-storage',
      partialize: (state) => ({
        simbriefUsername: state.simbriefUsername,
        ofp: state.ofp,
        atisNetwork: state.atisNetwork,
        hoppieLogon: state.hoppieLogon,
        theme: state.theme,
        soundEnabled: state.soundEnabled,
        acarsTemplates: state.acarsTemplates,
        acarsMessages: state.acarsMessages,
        updateChannel: state.updateChannel,
        mapTrafficEnabled: state.mapTrafficEnabled,
        mapAtcEnabled: state.mapAtcEnabled,
        mapTrailEnabled: state.mapTrailEnabled,
        logbookEntries: state.logbookEntries,
      }),
    }
  )
);
