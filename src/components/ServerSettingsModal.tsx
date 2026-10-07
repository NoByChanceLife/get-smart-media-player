import React, { useState } from 'react';
import {
  Server,
  User,
  Key,
  Globe,
  CheckCircle,
  AlertCircle,
  Plus,
  Trash2,
  X,
  Radio,
  FileText,
  Sliders,
  Tv,
  Dice5,
  Layers,
  Power,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Activity,
} from 'lucide-react';
import {
  xtreamService,
  SERVER_COLORS,
} from '../services/xtreamClient';
import {
  SavedProfile,
  ServerType,
  StbPortalConfig,
  M3uConfig,
  SingleStreamConfig,
} from '../types/xtream';
import {
  generateRandomMac,
  generateSerialNumber,
  generateDeviceId,
  testStalkerPortal,
} from '../services/stalkerClient';
import {
  diagnoseXtreamConnection,
  diagnosePortalConnection,
  diagnoseM3uConnection,
  diagnoseDirectStreamConnection,
  ConnectionDiagnosticReport,
} from '../services/connectionDiagnostics';

interface ServerSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onProfileChanged: () => void;
}

export const ServerSettingsModal: React.FC<ServerSettingsModalProps> = ({
  isOpen,
  onClose,
  onProfileChanged,
}) => {
  const [profiles, setProfiles] = useState<SavedProfile[]>(() => xtreamService.getProfiles());
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newServerType, setNewServerType] = useState<ServerType>('xtream');

  // Xtream Form Fields
  const [xtreamUrl, setXtreamUrl] = useState('');
  const [xtreamUsername, setXtreamUsername] = useState('');
  const [xtreamPassword, setXtreamPassword] = useState('');
  const [xtreamName, setXtreamName] = useState('');

  // Portal / STB Form Fields
  const [stbPortalUrl, setStbPortalUrl] = useState('');
  const [stbMacAddress, setStbMacAddress] = useState(() => generateRandomMac());
  const [stbModel, setStbModel] = useState<StbPortalConfig['stbModel']>('MAG254');
  const [stbSerial, setStbSerial] = useState(() => generateSerialNumber());
  const [stbDeviceId, setStbDeviceId] = useState(() => generateDeviceId());
  const [stbName, setStbName] = useState('');
  const [showStbAdvanced, setShowStbAdvanced] = useState(false);

  // M3U Playlist Form Fields
  const [m3uMode, setM3uMode] = useState<'url' | 'raw'>('url');
  const [m3uUrl, setM3uUrl] = useState('');
  const [m3uRawText, setM3uRawText] = useState('');
  const [m3uName, setM3uName] = useState('');

  // Single Direct Stream Form Fields
  const [singleName, setSingleName] = useState('');
  const [singleUrl, setSingleUrl] = useState('');
  const [singleCategory, setSingleCategory] = useState('Sports');
  const [singleLogo, setSingleLogo] = useState('');

  const [diagReport, setDiagReport] = useState<ConnectionDiagnosticReport | null>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const activeCount = profiles.filter((p) => p.isActive).length;

  const handleToggleActive = (id: string) => {
    xtreamService.toggleProfileActive(id);
    const updated = xtreamService.getProfiles();
    setProfiles([...updated]);
    onProfileChanged();
  };

  const handleDeleteProfile = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (profiles.length <= 1) return;
    const remaining = profiles.filter((p) => p.id !== id);
    xtreamService.saveProfiles(remaining);
    setProfiles(remaining);
    onProfileChanged();
  };

  const runDiagnostics = async (andSave: boolean) => {
    setIsTesting(true);
    setSaveSuccessMsg(null);

    const colorIndex = profiles.length % SERVER_COLORS.length;
    const colorBadge = SERVER_COLORS[colorIndex];

    try {
      let report: ConnectionDiagnosticReport;

      if (newServerType === 'xtream') {
        if (!xtreamUrl || !xtreamUsername || !xtreamPassword) {
          throw new Error('Please fill in Server URL, Username, and Password.');
        }
        report = await diagnoseXtreamConnection(
          {
            serverUrl: xtreamUrl.trim(),
            username: xtreamUsername.trim(),
            password: xtreamPassword.trim(),
          },
          (r) => setDiagReport({ ...r })
        );

        if (report.success && andSave) {
          const newProfile: SavedProfile = {
            id: `xtream_${Date.now()}`,
            name: xtreamName.trim() || xtreamUsername.trim() || 'Xtream Server',
            type: 'xtream',
            isActive: true,
            colorBadge,
            serverUrl: xtreamUrl.trim(),
            username: xtreamUsername.trim(),
            password: xtreamPassword.trim(),
            lastConnected: new Date().toISOString(),
            userInfo: {
              username: xtreamUsername.trim(),
              auth: 1,
              status: (report.meta?.accountStatus as any) || 'Active',
              exp_date: report.meta?.expiryDate || 'Unlimited',
              is_trial: '0',
              active_cons: '0',
              max_connections: report.meta?.maxConnections || '1',
            },
          };
          const updated = [...profiles, newProfile];
          xtreamService.saveProfiles(updated);
          setProfiles(updated);
          setSaveSuccessMsg('Xtream Codes server verified and added successfully!');
          setTimeout(() => {
            setIsAddingNew(false);
            setDiagReport(null);
            setSaveSuccessMsg(null);
            onProfileChanged();
          }, 1400);
        }
      } else if (newServerType === 'stalker') {
        if (!stbPortalUrl || !stbMacAddress) {
          throw new Error('Please enter Portal URL and MAC Address.');
        }
        const stbConfig: StbPortalConfig = {
          portalUrl: stbPortalUrl.trim(),
          macAddress: stbMacAddress.trim(),
          stbModel,
          serialNumber: stbSerial,
          deviceId: stbDeviceId,
        };

        report = await diagnosePortalConnection(stbConfig, (r) => setDiagReport({ ...r }));

        if (report.success && andSave) {
          const newProfile: SavedProfile = {
            id: `stalker_${Date.now()}`,
            name: stbName.trim() || `Portal / STB (${stbModel})`,
            type: 'stalker',
            isActive: true,
            colorBadge,
            lastConnected: new Date().toISOString(),
            stbConfig,
          };
          const updated = [...profiles, newProfile];
          xtreamService.saveProfiles(updated);
          setProfiles(updated);
          setSaveSuccessMsg('Portal / STB emulation verified and added successfully!');
          setTimeout(() => {
            setIsAddingNew(false);
            setDiagReport(null);
            setSaveSuccessMsg(null);
            onProfileChanged();
          }, 1400);
        }
      } else if (newServerType === 'm3u') {
        if (m3uMode === 'url' && !m3uUrl) {
          throw new Error('Please enter M3U Playlist URL.');
        }
        if (m3uMode === 'raw' && !m3uRawText) {
          throw new Error('Please paste M3U playlist text.');
        }

        const m3uConfig: M3uConfig = {
          playlistUrl: m3uMode === 'url' ? m3uUrl.trim() : undefined,
          rawM3uContent: m3uMode === 'raw' ? m3uRawText.trim() : undefined,
        };

        report = await diagnoseM3uConnection(m3uConfig, (r) => setDiagReport({ ...r }));

        if (report.success && andSave) {
          const newProfile: SavedProfile = {
            id: `m3u_${Date.now()}`,
            name: m3uName.trim() || 'M3U Playlist',
            type: 'm3u',
            isActive: true,
            colorBadge,
            lastConnected: new Date().toISOString(),
            m3uConfig,
          };
          const updated = [...profiles, newProfile];
          xtreamService.saveProfiles(updated);
          setProfiles(updated);
          setSaveSuccessMsg('M3U playlist verified and added successfully!');
          setTimeout(() => {
            setIsAddingNew(false);
            setDiagReport(null);
            setSaveSuccessMsg(null);
            onProfileChanged();
          }, 1400);
        }
      } else {
        if (!singleUrl || !singleName) {
          throw new Error('Please enter Stream URL and Channel Name.');
        }

        const singleStream: SingleStreamConfig = {
          name: singleName.trim(),
          streamUrl: singleUrl.trim(),
          category: singleCategory.trim(),
          logo: singleLogo.trim() || undefined,
        };

        report = await diagnoseDirectStreamConnection(singleStream, (r) => setDiagReport({ ...r }));

        if (report.success && andSave) {
          const newProfile: SavedProfile = {
            id: `single_${Date.now()}`,
            name: singleName.trim(),
            type: 'single_stream',
            isActive: true,
            colorBadge,
            lastConnected: new Date().toISOString(),
            singleStream,
          };
          const updated = [...profiles, newProfile];
          xtreamService.saveProfiles(updated);
          setProfiles(updated);
          setSaveSuccessMsg('Direct stream line verified and added successfully!');
          setTimeout(() => {
            setIsAddingNew(false);
            setDiagReport(null);
            setSaveSuccessMsg(null);
            onProfileChanged();
          }, 1400);
        }
      }

      setDiagReport({ ...report });
    } catch (err: unknown) {
      const error = err as Error;
      setDiagReport({
        success: false,
        serverType: newServerType,
        summaryMessage: error.message || 'Validation failed. Please verify credentials and URL.',
        steps: [
          {
            stage: 'connecting',
            label: 'Validation',
            status: 'failed',
            message: error.message || 'Validation error',
          },
        ],
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleAddServerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await runDiagnostics(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-3xl max-h-[92vh] rounded-3xl bg-[#0c121e] border border-slate-800 shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-[#080d17]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white font-heading">
                  Connections & Streaming Sources
                </h2>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800/50">
                  {activeCount} Active Simultaneously
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Xtream Codes · Portal / STB Emulation · M3U Playlists · Direct Streaming Lines
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {/* Multi-Server Status Banner */}
          <div className="p-4 rounded-2xl bg-cyan-950/40 border border-cyan-500/30 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Layers className="w-5 h-5 text-cyan-400 shrink-0" />
              <div className="text-xs">
                <p className="font-bold text-white">Multi-Source Aggregation Active</p>
                <p className="text-slate-300">
                  Toggle any number of servers on below. Get Smart Media Player seamlessly aggregates channels from all active sources!
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsAddingNew(!isAddingNew)}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold shrink-0 transition shadow-lg shadow-cyan-500/25 active:scale-95 tv-focus-target"
            >
              <Plus className="w-4 h-4" />
              <span>Add Connection</span>
            </button>
          </div>

          {/* Add New Connection Form */}
          {isAddingNew && (
            <div className="p-5 rounded-2xl bg-[#070b14] border border-cyan-500/40 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <h3 className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-2 font-heading">
                  <Plus className="w-4 h-4" />
                  <span>Choose Connection Method</span>
                </h3>
                <button
                  onClick={() => setIsAddingNew(false)}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
              </div>

              {/* 4 Neutral Connection Type Buttons */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <button
                  type="button"
                  onClick={() => setNewServerType('xtream')}
                  className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                    newServerType === 'xtream'
                      ? 'bg-cyan-950/80 border-cyan-400 text-white shadow-md'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Server className="w-4 h-4 text-cyan-400 mb-2" />
                  <div>
                    <p className="text-xs font-bold text-white">Xtream Codes</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Portal + User + Pass</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setNewServerType('stalker')}
                  className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                    newServerType === 'stalker'
                      ? 'bg-amber-950/80 border-amber-400 text-white shadow-md'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Tv className="w-4 h-4 text-amber-400 mb-2" />
                  <div>
                    <p className="text-xs font-bold text-white">Portal / STB Emulation</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Portal URL + MAC</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setNewServerType('m3u')}
                  className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                    newServerType === 'm3u'
                      ? 'bg-emerald-950/80 border-emerald-400 text-white shadow-md'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <FileText className="w-4 h-4 text-emerald-400 mb-2" />
                  <div>
                    <p className="text-xs font-bold text-white">M3U Playlist</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">URL or Raw Content</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setNewServerType('single_stream')}
                  className={`p-3 rounded-xl border text-left transition flex flex-col justify-between ${
                    newServerType === 'single_stream'
                      ? 'bg-purple-950/80 border-purple-400 text-white shadow-md'
                      : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Radio className="w-4 h-4 text-purple-400 mb-2" />
                  <div>
                    <p className="text-xs font-bold text-white">Direct Stream</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Single Stream URL</p>
                  </div>
                </button>
              </div>

              {/* Form by Connection Type */}
              <form onSubmit={handleAddServerSubmit} className="space-y-4 pt-2">
                {/* Method 1: Xtream Codes */}
                {newServerType === 'xtream' && (
                  <div className="space-y-3 text-xs">
                    <div>
                      <label className="block text-slate-300 mb-1 font-medium">Connection Name</label>
                      <input
                        type="text"
                        placeholder="e.g. Home, Sports, or Backup"
                        value={xtreamName}
                        onChange={(e) => setXtreamName(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-cyan-500"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 mb-1 font-medium">Server / Portal URL</label>
                      <div className="relative">
                        <Globe className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                          type="text"
                          placeholder="http://iptv-provider.com:8080"
                          value={xtreamUrl}
                          onChange={(e) => setXtreamUrl(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700/80 rounded-xl pl-8 pr-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-cyan-500"
                          required
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-300 mb-1 font-medium">Username</label>
                        <div className="relative">
                          <User className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                          <input
                            type="text"
                            placeholder="username"
                            value={xtreamUsername}
                            onChange={(e) => setXtreamUsername(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700/80 rounded-xl pl-8 pr-3 py-2 text-white text-xs focus:outline-none focus:border-cyan-500"
                            required
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-slate-300 mb-1 font-medium">Password</label>
                        <div className="relative">
                          <Key className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                          <input
                            type="password"
                            placeholder="••••••••"
                            value={xtreamPassword}
                            onChange={(e) => setXtreamPassword(e.target.value)}
                            className="w-full bg-slate-900 border border-slate-700/80 rounded-xl pl-8 pr-3 py-2 text-white text-xs focus:outline-none focus:border-cyan-500"
                            required
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Method 2: Portal / STB Emulation */}
                {newServerType === 'stalker' && (
                  <div className="space-y-3 text-xs">
                    <div>
                      <label className="block text-slate-300 mb-1 font-medium">Connection Name</label>
                      <input
                        type="text"
                        placeholder="e.g. Home Portal, Living Room, or Backup"
                        value={stbName}
                        onChange={(e) => setStbName(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 mb-1 font-medium">Portal URL (MAG / Stalker)</label>
                      <div className="relative">
                        <Globe className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                          type="text"
                          placeholder="http://portal.domain.com/c/"
                          value={stbPortalUrl}
                          onChange={(e) => setStbPortalUrl(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700/80 rounded-xl pl-8 pr-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-amber-500"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-slate-300 font-medium">Device MAC Address</label>
                        <button
                          type="button"
                          onClick={() => setStbMacAddress(generateRandomMac())}
                          className="text-[11px] text-amber-400 hover:underline flex items-center gap-1"
                        >
                          <Dice5 className="w-3 h-3" />
                          <span>Generate MAC</span>
                        </button>
                      </div>
                      <input
                        type="text"
                        placeholder="00:1A:79:XX:XX:XX"
                        value={stbMacAddress}
                        onChange={(e) => setStbMacAddress(e.target.value.toUpperCase())}
                        className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-amber-500"
                        required
                      />
                    </div>

                    {/* Collapsible Advanced Device Settings */}
                    <div className="pt-1">
                      <button
                        type="button"
                        onClick={() => setShowStbAdvanced(!showStbAdvanced)}
                        className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white"
                      >
                        <Sliders className="w-3 h-3 text-cyan-400" />
                        <span>Advanced Device Settings</span>
                        {showStbAdvanced ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      </button>

                      {showStbAdvanced && (
                        <div className="mt-3 p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3">
                          <div>
                            <label className="block text-slate-300 mb-1 font-medium">STB Model</label>
                            <select
                              value={stbModel}
                              onChange={(e) => setStbModel(e.target.value as any)}
                              className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-amber-500"
                            >
                              <option value="MAG254">MAG 254 (Recommended)</option>
                              <option value="MAG250">MAG 250 (Classic)</option>
                              <option value="MAG322">MAG 322 (HEVC)</option>
                              <option value="MAG424">MAG 424 (4K)</option>
                              <option value="MAG520">MAG 520 (Linux 4K)</option>
                              <option value="AuraHD">AuraHD</option>
                            </select>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                              <label className="block text-slate-300 mb-1 font-medium">Serial Number (SN)</label>
                              <input
                                type="text"
                                value={stbSerial}
                                onChange={(e) => setStbSerial(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-amber-500"
                              />
                            </div>
                            <div>
                              <label className="block text-slate-300 mb-1 font-medium">Device ID</label>
                              <input
                                type="text"
                                value={stbDeviceId}
                                onChange={(e) => setStbDeviceId(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-amber-500"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Method 3: M3U Playlist */}
                {newServerType === 'm3u' && (
                  <div className="space-y-3 text-xs">
                    <div>
                      <label className="block text-slate-300 mb-1 font-medium">Connection Name</label>
                      <input
                        type="text"
                        placeholder="e.g. Home Playlist, Sports Line, or Backup"
                        value={m3uName}
                        onChange={(e) => setM3uName(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div className="flex items-center gap-2 p-1 bg-slate-900 rounded-xl border border-slate-800">
                      <button
                        type="button"
                        onClick={() => setM3uMode('url')}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-semibold ${
                          m3uMode === 'url' ? 'bg-emerald-600 text-white' : 'text-slate-400'
                        }`}
                      >
                        Playlist URL
                      </button>
                      <button
                        type="button"
                        onClick={() => setM3uMode('raw')}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-semibold ${
                          m3uMode === 'raw' ? 'bg-emerald-600 text-white' : 'text-slate-400'
                        }`}
                      >
                        Paste M3U Lines
                      </button>
                    </div>

                    {m3uMode === 'url' ? (
                      <div>
                        <label className="block text-slate-300 mb-1 font-medium">
                          M3U / M3U8 Playlist URL
                        </label>
                        <input
                          type="text"
                          placeholder="http://iptv.com/get.php?username=...&type=m3u_plus"
                          value={m3uUrl}
                          onChange={(e) => setM3uUrl(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-emerald-500"
                          required
                        />
                      </div>
                    ) : (
                      <div>
                        <label className="block text-slate-300 mb-1 font-medium">
                          M3U Content / Streaming Lines
                        </label>
                        <textarea
                          rows={4}
                          placeholder="#EXTM3U&#10;#EXTINF:-1 tvg-id='NASA' tvg-logo='...' group-title='Docs',NASA HD&#10;https://.../stream.m3u8"
                          value={m3uRawText}
                          onChange={(e) => setM3uRawText(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-white font-mono text-[11px] focus:outline-none focus:border-emerald-500"
                          required
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Method 4: Single Direct Stream */}
                {newServerType === 'single_stream' && (
                  <div className="space-y-3 text-xs">
                    <div>
                      <label className="block text-slate-300 mb-1 font-medium">Channel / Stream Name</label>
                      <input
                        type="text"
                        placeholder="e.g. 24/7 Action Cinema HD"
                        value={singleName}
                        onChange={(e) => setSingleName(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-purple-500"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 mb-1 font-medium">Direct Stream URL (HLS / MP4)</label>
                      <input
                        type="text"
                        placeholder="https://domain.com/live/ch1/master.m3u8"
                        value={singleUrl}
                        onChange={(e) => setSingleUrl(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-white font-mono text-xs focus:outline-none focus:border-purple-500"
                        required
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-slate-300 mb-1 font-medium">Category</label>
                        <input
                          type="text"
                          placeholder="e.g. Sports, News, Movies"
                          value={singleCategory}
                          onChange={(e) => setSingleCategory(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-purple-500"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-300 mb-1 font-medium">Logo URL (Optional)</label>
                        <input
                          type="text"
                          placeholder="https://.../logo.png"
                          value={singleLogo}
                          onChange={(e) => setSingleLogo(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-purple-500"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Save Success Banner */}
                {saveSuccessMsg && (
                  <div className="p-3 rounded-2xl text-xs flex items-center gap-2.5 bg-emerald-950/80 text-emerald-300 border border-emerald-800 animate-in fade-in">
                    <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span className="font-semibold">{saveSuccessMsg}</span>
                  </div>
                )}

                {/* Real Connection Diagnostics Breakdown Panel */}
                {diagReport && (
                  <div className="bg-[#080d18] border border-slate-800 rounded-2xl p-4 space-y-3 animate-in fade-in duration-200">
                    <div className="flex items-center justify-between pb-2 border-b border-slate-800/80">
                      <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-cyan-400" />
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-200 font-heading">
                          Connection Diagnostics
                        </span>
                      </div>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                          diagReport.success
                            ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                            : isTesting
                            ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                            : 'bg-rose-950 text-rose-300 border border-rose-800'
                        }`}
                      >
                        {isTesting ? 'Testing...' : diagReport.success ? 'Verified' : 'Failed'}
                      </span>
                    </div>

                    {/* Step-by-Step Stage Progression */}
                    <div className="space-y-1.5">
                      {diagReport.steps.map((s) => (
                        <div
                          key={s.stage}
                          className="flex items-center justify-between text-xs p-2 rounded-xl bg-slate-900/60 border border-slate-800/60 transition-all"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 pr-2">
                            {s.status === 'success' && (
                              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                            )}
                            {s.status === 'running' && (
                              <RefreshCw className="w-4 h-4 text-cyan-400 animate-spin shrink-0" />
                            )}
                            {s.status === 'failed' && (
                              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                            )}
                            {s.status === 'pending' && (
                              <span className="w-3.5 h-3.5 rounded-full border border-slate-700 shrink-0" />
                            )}
                            {s.status === 'skipped' && (
                              <span className="w-3.5 h-3.5 rounded-full border border-slate-800 opacity-40 shrink-0" />
                            )}
                            <span
                              className={`font-semibold truncate ${
                                s.status === 'failed'
                                  ? 'text-rose-300 font-bold'
                                  : s.status === 'success'
                                  ? 'text-slate-200'
                                  : s.status === 'running'
                                  ? 'text-cyan-300'
                                  : 'text-slate-500'
                              }`}
                            >
                              {s.label}
                            </span>
                          </div>

                          {s.message && (
                            <span
                              className={`text-[11px] font-mono truncate max-w-[320px] text-right ${
                                s.status === 'failed'
                                  ? 'text-rose-400 font-bold'
                                  : s.status === 'success'
                                  ? 'text-slate-400'
                                  : 'text-cyan-400'
                              }`}
                            >
                              {s.message}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Summary Message & Error Cause Badge */}
                    {diagReport.summaryMessage && (
                      <div
                        className={`p-3 rounded-xl text-xs font-medium flex items-start gap-2.5 ${
                          diagReport.success
                            ? 'bg-emerald-950/60 text-emerald-200 border border-emerald-900/50'
                            : 'bg-rose-950/60 text-rose-200 border border-rose-900/50'
                        }`}
                      >
                        {diagReport.success ? (
                          <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="leading-relaxed">{diagReport.summaryMessage}</p>
                          {diagReport.errorCategory && (
                            <span className="inline-block mt-1 text-[10px] uppercase font-mono font-bold px-2 py-0.5 rounded bg-rose-900/60 text-rose-200 border border-rose-700/50">
                              Failure Cause: {diagReport.errorCategory.replace(/_/g, ' ')}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex items-center justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingNew(false);
                      setDiagReport(null);
                    }}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 text-slate-300 hover:text-white text-xs font-semibold transition active:scale-95"
                  >
                    Cancel
                  </button>

                  <button
                    type="button"
                    onClick={() => runDiagnostics(false)}
                    disabled={isTesting}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-800/60 text-xs font-bold transition flex items-center gap-2 active:scale-95 tv-focus-target"
                  >
                    <Activity className="w-3.5 h-3.5" />
                    <span>{isTesting ? 'Testing...' : 'Test Connection'}</span>
                  </button>

                  <button
                    type="submit"
                    disabled={isTesting}
                    className="px-6 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition shadow-lg shadow-cyan-500/25 active:scale-95 tv-focus-target flex items-center gap-2"
                  >
                    {isTesting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                    <span>{isTesting ? 'Verifying...' : 'Verify & Add Source'}</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Configured Connections List */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 font-heading">
              Active & Saved Streaming Sources ({profiles.length})
            </h3>

            <div className="space-y-2.5">
              {profiles.map((p) => {
                const isActive = p.isActive;
                return (
                  <div
                    key={p.id}
                    onClick={() => handleToggleActive(p.id)}
                    className={`flex items-center justify-between p-4 rounded-2xl border transition-all cursor-pointer tv-focus-target ${
                      isActive
                        ? 'bg-[#090f1d] border-cyan-500/60 shadow-md shadow-cyan-950/30'
                        : 'bg-[#06090f] border-slate-800 opacity-60 hover:opacity-100'
                    }`}
                  >
                    <div className="flex items-center gap-3.5 min-w-0 flex-1 pr-3">
                      <div
                        className="w-3.5 h-3.5 rounded-full shrink-0"
                        style={{ backgroundColor: p.colorBadge || '#06b6d4' }}
                      />

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-bold text-white truncate font-heading">{p.name}</h4>
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 font-mono">
                            {p.type === 'xtream'
                              ? 'Xtream Codes'
                              : p.type === 'stalker'
                              ? `Portal / STB (${p.stbConfig?.stbModel})`
                              : p.type === 'm3u'
                              ? 'M3U Playlist'
                              : 'Direct Stream'}
                          </span>
                        </div>

                        <p className="text-xs text-slate-400 truncate mt-0.5 font-mono">
                          {p.type === 'xtream' && `${p.serverUrl} · User: ${p.username}`}
                          {p.type === 'stalker' && `MAC: ${p.stbConfig?.macAddress} · Portal: ${p.stbConfig?.portalUrl}`}
                          {p.type === 'm3u' && (p.m3uConfig?.playlistUrl || 'Raw M3U Lines')}
                          {p.type === 'single_stream' && p.singleStream?.streamUrl}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0" onClick={(e) => e.stopPropagation()}>
                      {/* Active Toggle Switch */}
                      <button
                        onClick={() => handleToggleActive(p.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition ${
                          isActive
                            ? 'bg-emerald-500 text-slate-950 shadow-md'
                            : 'bg-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        <Power className="w-3.5 h-3.5" />
                        <span>{isActive ? 'Active' : 'Disabled'}</span>
                      </button>

                      {profiles.length > 1 && (
                        <button
                          onClick={(e) => handleDeleteProfile(p.id, e)}
                          className="p-2 rounded-xl text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition"
                          title="Remove Source"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
