import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SimbriefOFP } from '../types/simbrief';
import type { HoppieMessage } from '../services/hoppie';

export type EFBPage = 'dashboard' | 'map' | 'flightplan' | 'charts' | 'performance' | 'acars' | 'settings';

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

  selectedAirport: string;
  setSelectedAirport: (icao: string) => void;

  atisNetwork: 'vatsim' | 'ivao';
  setAtisNetwork: (network: 'vatsim' | 'ivao') => void;

  hoppieLogon: string;
  setHoppieLogon: (logon: string) => void;

  // Per-waypoint actuals (session only, not persisted)
  waypointActuals: Record<number, { fob: string; ato: string }>;
  setWaypointActual: (idx: number, data: Partial<{ fob: string; ato: string }>) => void;
  clearWaypointActuals: () => void;

  // ACARS messages (session only)
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

  theme: 'dark' | 'light';
  setTheme: (theme: 'dark' | 'light') => void;
}

export const useEFBStore = create<EFBStore>()(
  persist(
    (set) => ({
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

      selectedAirport: '',
      setSelectedAirport: (icao) => set({ selectedAirport: icao }),

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
      clearWaypointActuals: () => set({ waypointActuals: {} }),

      acarsMessages: [],
      addAcarsMessage: (msg) => set(s => ({ acarsMessages: [...s.acarsMessages, msg] })),
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

      theme: 'dark',
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'openefb-storage',
      partialize: (state) => ({
        activePage: state.activePage,
        simbriefUsername: state.simbriefUsername,
        ofp: state.ofp,
        atisNetwork: state.atisNetwork,
        hoppieLogon: state.hoppieLogon,
        theme: state.theme,
      }),
    }
  )
);
