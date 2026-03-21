import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SimbriefOFP } from '../types/simbrief';

export type EFBPage = 'dashboard' | 'flightplan' | 'charts' | 'weather' | 'performance' | 'settings';

interface EFBStore {
  // Navigation
  activePage: EFBPage;
  setActivePage: (page: EFBPage) => void;

  // SimBrief
  simbriefUsername: string;
  setSimbriefUsername: (username: string) => void;
  ofp: SimbriefOFP | null;
  setOFP: (ofp: SimbriefOFP | null) => void;
  isLoadingOFP: boolean;
  setIsLoadingOFP: (loading: boolean) => void;
  ofpError: string | null;
  setOFPError: (error: string | null) => void;

  // Charts
  selectedAirport: string;
  setSelectedAirport: (icao: string) => void;
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
    }),
    {
      name: 'openefb-storage',
      partialize: (state) => ({
        simbriefUsername: state.simbriefUsername,
        ofp: state.ofp,
      }),
    }
  )
);
