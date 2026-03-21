import { useState } from 'react';
import { useEFBStore } from '../../store/efbStore';
import { fetchOFP } from '../../services/simbrief/api';
import { Loader2, CheckCircle, AlertCircle, Settings } from 'lucide-react';

export default function SettingsPage() {
  const {
    simbriefUsername, setSimbriefUsername,
    setOFP, setIsLoadingOFP, isLoadingOFP, ofpError, setOFPError,
    setActivePage,
  } = useEFBStore();

  const [inputVal, setInputVal] = useState(simbriefUsername);
  const [saved, setSaved] = useState(false);

  async function handleSaveAndLoad() {
    const trimmed = inputVal.trim();
    setSimbriefUsername(trimmed);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);

    if (trimmed) {
      setIsLoadingOFP(true);
      setOFPError(null);
      try {
        const data = await fetchOFP(trimmed);
        setOFP(data);
        setActivePage('dashboard');
      } catch (e) {
        setOFPError(e instanceof Error ? e.message : 'Failed to load OFP.');
      } finally {
        setIsLoadingOFP(false);
      }
    }
  }

  return (
    <div className="p-5 overflow-auto h-full">
      <div className="flex items-center gap-2 mb-6">
        <Settings size={18} className="text-gray-400" />
        <h2 className="text-base font-semibold text-white">Settings</h2>
      </div>

      <div className="max-w-lg space-y-6">
        {/* SimBrief */}
        <div className="bg-[#111827] border border-[#1f2937] rounded-lg p-5">
          <h3 className="text-sm font-semibold text-white mb-1">SimBrief Integration</h3>
          <p className="text-xs text-gray-500 mb-4">
            Enter your SimBrief username or Pilot ID to load your flight plans.
          </p>

          <div className="space-y-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1.5">SimBrief Username</label>
              <input
                type="text"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                placeholder="e.g. JohnDoe123"
                className="w-full bg-[#0d1117] border border-[#1f2937] focus:border-blue-500 text-white rounded-lg px-3 py-2 text-sm focus:outline-none"
              />
              <p className="text-xs text-gray-600 mt-1">
                Find your username at simbrief.com → My Briefings
              </p>
            </div>

            {ofpError && (
              <div className="flex items-center gap-2 text-red-400 text-xs bg-red-400/10 px-3 py-2 rounded-lg border border-red-400/20">
                <AlertCircle size={14} />
                {ofpError}
              </div>
            )}

            <button
              onClick={handleSaveAndLoad}
              disabled={isLoadingOFP || !inputVal.trim()}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              {isLoadingOFP ? (
                <Loader2 size={14} className="animate-spin" />
              ) : saved ? (
                <CheckCircle size={14} />
              ) : null}
              {isLoadingOFP ? 'Loading OFP...' : saved ? 'Saved!' : 'Save & Load OFP'}
            </button>
          </div>
        </div>

        {/* About */}
        <div className="bg-[#111827] border border-[#1f2937] rounded-lg p-5">
          <h3 className="text-sm font-semibold text-white mb-1">About OpenEFB</h3>
          <p className="text-xs text-gray-500 leading-relaxed">
            OpenEFB is an open-source Electronic Flight Bag designed for flight simulators,
            inspired by Lufthansa Systems LIDO. It integrates with SimBrief for flight planning
            and provides charts, weather, and performance data.
          </p>
          <div className="mt-3 text-xs text-gray-600">
            Version 0.1.0 · For simulator use only
          </div>
        </div>
      </div>
    </div>
  );
}
