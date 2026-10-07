import React, { useState } from 'react';
import {
  Shield,
  Lock,
  Unlock,
  KeyRound,
  Users,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Check,
  CheckCircle,
  AlertCircle,
  X,
  Tv,
  Film,
  Layers,
  Smile,
  Crown,
  User,
  Settings,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import {
  parentalControlService,
} from '../services/parentalControlService';
import {
  UserProfile,
  UserRole,
  XtreamCategory,
  XtreamLiveStream,
  ParentalControlsSettings,
} from '../types/xtream';

interface ParentalControlsModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: XtreamCategory[];
  streams: XtreamLiveStream[];
  onConfigChanged: () => void;
}

export const ParentalControlsModal: React.FC<ParentalControlsModalProps> = ({
  isOpen,
  onClose,
  categories,
  streams,
  onConfigChanged,
}) => {
  const [activeTab, setActiveTab] = useState<'profiles' | 'content_locks' | 'pin'>('profiles');
  const [settings, setSettings] = useState<ParentalControlsSettings>(() => parentalControlService.getSettings());
  const [profiles, setProfiles] = useState<UserProfile[]>(() => parentalControlService.getProfiles());

  // Editing profile state
  const [selectedProfileId, setSelectedProfileId] = useState<string>(() => profiles[0]?.id || 'profile_admin');
  const [isCreatingProfile, setIsCreatingProfile] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [newProfileRole, setNewProfileRole] = useState<UserRole>('kids');
  const [newProfileColor, setNewProfileColor] = useState('#10b981');

  // Change PIN states
  const [currentPinInput, setCurrentPinInput] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [confirmPinInput, setConfirmPinInput] = useState('');
  const [pinFeedback, setPinFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  const selectedProfile = profiles.find((p) => p.id === selectedProfileId) || profiles[0];

  const handleToggleHideContent = () => {
    const updated = !settings.hideLockedContentCompletely;
    parentalControlService.saveSettings({ hideLockedContentCompletely: updated });
    setSettings(parentalControlService.getSettings());
    onConfigChanged();
  };

  const handleToggleRestrictServers = () => {
    const updated = !settings.restrictServerSettings;
    parentalControlService.saveSettings({ restrictServerSettings: updated });
    setSettings(parentalControlService.getSettings());
    onConfigChanged();
  };

  const handleToggleCategoryLock = (catId: string, type: 'live' | 'vod' = 'live') => {
    parentalControlService.toggleCategoryLock(catId, type);
    setSettings(parentalControlService.getSettings());
    onConfigChanged();
  };

  const handleToggleChannelLock = (streamId: string | number) => {
    parentalControlService.toggleChannelLock(streamId);
    setSettings(parentalControlService.getSettings());
    onConfigChanged();
  };

  // Update profile privileges
  const handleUpdatePrivilege = (key: keyof UserProfile['privileges'], value: any) => {
    if (selectedProfile.role === 'master_admin' && key !== 'maxContentRating') {
      return; // Master admin always has full privileges
    }
    const updatedPrivileges = {
      ...selectedProfile.privileges,
      [key]: value,
    };
    parentalControlService.updateUserProfile(selectedProfile.id, { privileges: updatedPrivileges });
    setProfiles(parentalControlService.getProfiles());
    onConfigChanged();
  };

  const handleToggleUserBlockedCategory = (catId: string) => {
    const currentList = selectedProfile.privileges.blockedCategories || [];
    let nextList: string[];
    if (currentList.includes(catId)) {
      nextList = currentList.filter((c) => c !== catId);
    } else {
      nextList = [...currentList, catId];
    }
    handleUpdatePrivilege('blockedCategories', nextList);
  };

  const handleCreateProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProfileName.trim()) return;

    const isKids = newProfileRole === 'kids';
    const newProf = parentalControlService.addUserProfile({
      name: newProfileName.trim(),
      role: newProfileRole,
      isKids,
      avatarColor: newProfileColor,
      avatarIcon: isKids ? 'smile' : 'user',
      privileges: {
        canAccessLiveTV: true,
        canAccessMovies: true,
        canAccessSeries: true,
        canManageServers: false,
        canModifyParentalControls: false,
        maxContentRating: isKids ? 'PG' : 'PG-13',
        blockedCategories: isKids ? ['news', 'action', 'scifi', 'crime'] : [],
        blockedChannelIds: [],
      },
    });

    setProfiles(parentalControlService.getProfiles());
    setSelectedProfileId(newProf.id);
    setIsCreatingProfile(false);
    setNewProfileName('');
    onConfigChanged();
  };

  const handleDeleteProfile = (id: string) => {
    parentalControlService.deleteUserProfile(id);
    const updated = parentalControlService.getProfiles();
    setProfiles(updated);
    setSelectedProfileId(updated[0]?.id || 'profile_admin');
    onConfigChanged();
  };

  const handleChangePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPinInput !== confirmPinInput) {
      setPinFeedback({ type: 'error', text: 'New PINs do not match.' });
      return;
    }
    if (newPinInput.length < 4) {
      setPinFeedback({ type: 'error', text: 'PIN must be at least 4 digits.' });
      return;
    }
    const success = parentalControlService.updateMasterPin(currentPinInput, newPinInput);
    if (success) {
      setPinFeedback({ type: 'success', text: 'Master PIN successfully updated!' });
      setCurrentPinInput('');
      setNewPinInput('');
      setConfirmPinInput('');
      setSettings(parentalControlService.getSettings());
      setTimeout(() => setPinFeedback(null), 3000);
    } else {
      setPinFeedback({ type: 'error', text: 'Incorrect current Master PIN.' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-4xl max-h-[92vh] rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white">Parental Controls & User Profiles</h2>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800/40">
                  Master Admin Protected
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Manage user privileges, lock adult/violent categories, restrict ratings & channels
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

        {/* Tab Selector */}
        <div className="px-6 py-3 border-b border-slate-800 bg-slate-950/40 flex items-center gap-2">
          <button
            onClick={() => setActiveTab('profiles')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === 'profiles'
                ? 'bg-cyan-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Users className="w-4 h-4" />
            <span>Profiles & Privileges ({profiles.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('content_locks')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === 'content_locks'
                ? 'bg-cyan-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <Lock className="w-4 h-4" />
            <span>Category & Channel Locks ({settings.lockedCategoryIds.length + settings.lockedChannelIds.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('pin')}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition ${
              activeTab === 'pin'
                ? 'bg-cyan-600 text-white shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
            }`}
          >
            <KeyRound className="w-4 h-4" />
            <span>Master PIN Settings</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {/* TAB 1: User Profiles & Privileges */}
          {activeTab === 'profiles' && (
            <div className="space-y-6">
              {/* Profiles Row & Add Button */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                  {profiles.map((p) => {
                    const isSelected = selectedProfileId === p.id;
                    return (
                      <button
                        key={p.id}
                        onClick={() => setSelectedProfileId(p.id)}
                        className={`flex items-center gap-2.5 px-3.5 py-2 rounded-2xl border text-xs font-bold transition-all ${
                          isSelected
                            ? 'bg-slate-800 border-cyan-500 text-white shadow-lg'
                            : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[11px]"
                          style={{ backgroundColor: p.avatarColor }}
                        >
                          {p.role === 'master_admin' ? (
                            <Crown className="w-3.5 h-3.5" />
                          ) : p.isKids ? (
                            <Smile className="w-3.5 h-3.5" />
                          ) : (
                            <User className="w-3.5 h-3.5" />
                          )}
                        </div>
                        <span className="truncate max-w-[120px]">{p.name}</span>
                        {p.role === 'master_admin' && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800/40">
                            Admin
                          </span>
                        )}
                        {p.isKids && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800/40">
                            Kids
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={() => setIsCreatingProfile(true)}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-400 text-xs font-semibold border border-cyan-500/30 shrink-0 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>New Profile</span>
                </button>
              </div>

              {/* Create Profile Drawer */}
              {isCreatingProfile && (
                <form onSubmit={handleCreateProfileSubmit} className="p-5 rounded-2xl bg-slate-950 border border-cyan-500/40 space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-2">
                      <Plus className="w-4 h-4" />
                      <span>Create New User Profile</span>
                    </h4>
                    <button
                      type="button"
                      onClick={() => setIsCreatingProfile(false)}
                      className="text-xs text-slate-400 hover:text-white"
                    >
                      Cancel
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                    <div>
                      <label className="block text-slate-300 mb-1 font-medium">Profile Name</label>
                      <input
                        type="text"
                        placeholder="e.g. Maya (Teen) or Lucas (Kids)"
                        value={newProfileName}
                        onChange={(e) => setNewProfileName(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-slate-300 mb-1 font-medium">Profile Type</label>
                      <select
                        value={newProfileRole}
                        onChange={(e) => setNewProfileRole(e.target.value as UserRole)}
                        className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-white focus:outline-none focus:border-cyan-500"
                      >
                        <option value="kids">👶 Kids (Safe Mode Auto-Lock)</option>
                        <option value="standard">🧑 Standard / Family (Custom Privileges)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-slate-300 mb-1 font-medium">Avatar Color</label>
                      <div className="flex items-center gap-2 pt-1">
                        {['#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#3b82f6', '#ef4444'].map((color) => (
                          <button
                            key={color}
                            type="button"
                            onClick={() => setNewProfileColor(color)}
                            className={`w-7 h-7 rounded-full border-2 transition ${
                              newProfileColor === color ? 'border-white scale-110' : 'border-transparent opacity-70'
                            }`}
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsCreatingProfile(false)}
                      className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold shadow-md"
                    >
                      Save Profile
                    </button>
                  </div>
                </form>
              )}

              {/* Selected Profile Privileges Card */}
              {selectedProfile && (
                <div className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-5">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-10 h-10 rounded-2xl flex items-center justify-center text-white"
                        style={{ backgroundColor: selectedProfile.avatarColor }}
                      >
                        {selectedProfile.role === 'master_admin' ? (
                          <Crown className="w-5 h-5" />
                        ) : selectedProfile.isKids ? (
                          <Smile className="w-5 h-5" />
                        ) : (
                          <User className="w-5 h-5" />
                        )}
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                          <span>{selectedProfile.name}</span>
                          {selectedProfile.role === 'master_admin' && (
                            <span className="text-[10px] text-cyan-400 bg-cyan-950 border border-cyan-800/40 px-2 py-0.5 rounded-full">
                              Master Administrator
                            </span>
                          )}
                        </h3>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {selectedProfile.role === 'master_admin'
                            ? 'Has complete unrestricted access to all content and settings.'
                            : 'Configure custom privileges, rating limits, and blocked categories for this user.'}
                        </p>
                      </div>
                    </div>

                    {selectedProfile.role !== 'master_admin' && (
                      <button
                        onClick={() => handleDeleteProfile(selectedProfile.id)}
                        className="p-2 rounded-xl text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition"
                        title="Delete Profile"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Privileges Toggles */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Module Access Privileges
                    </h4>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      {/* Live TV Access */}
                      <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <Tv className="w-4 h-4 text-cyan-400" />
                          <div>
                            <p className="font-semibold text-white">Live TV Channels</p>
                            <p className="text-[11px] text-slate-400">Access live satellite feeds</p>
                          </div>
                        </div>
                        <button
                          disabled={selectedProfile.role === 'master_admin'}
                          onClick={() => handleUpdatePrivilege('canAccessLiveTV', !selectedProfile.privileges.canAccessLiveTV)}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                            selectedProfile.privileges.canAccessLiveTV
                              ? 'bg-emerald-600/30 text-emerald-400 border border-emerald-500/40'
                              : 'bg-slate-800 text-slate-500'
                          }`}
                        >
                          {selectedProfile.privileges.canAccessLiveTV ? 'Allowed' : 'Blocked'}
                        </button>
                      </div>

                      {/* Movies Access */}
                      <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <Film className="w-4 h-4 text-amber-400" />
                          <div>
                            <p className="font-semibold text-white">VOD Cinema & Movies</p>
                            <p className="text-[11px] text-slate-400">Access movie on-demand catalog</p>
                          </div>
                        </div>
                        <button
                          disabled={selectedProfile.role === 'master_admin'}
                          onClick={() => handleUpdatePrivilege('canAccessMovies', !selectedProfile.privileges.canAccessMovies)}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                            selectedProfile.privileges.canAccessMovies
                              ? 'bg-emerald-600/30 text-emerald-400 border border-emerald-500/40'
                              : 'bg-slate-800 text-slate-500'
                          }`}
                        >
                          {selectedProfile.privileges.canAccessMovies ? 'Allowed' : 'Blocked'}
                        </button>
                      </div>

                      {/* Series Access */}
                      <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <Layers className="w-4 h-4 text-purple-400" />
                          <div>
                            <p className="font-semibold text-white">TV Series & Shows</p>
                            <p className="text-[11px] text-slate-400">Access multi-season shows</p>
                          </div>
                        </div>
                        <button
                          disabled={selectedProfile.role === 'master_admin'}
                          onClick={() => handleUpdatePrivilege('canAccessSeries', !selectedProfile.privileges.canAccessSeries)}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                            selectedProfile.privileges.canAccessSeries
                              ? 'bg-emerald-600/30 text-emerald-400 border border-emerald-500/40'
                              : 'bg-slate-800 text-slate-500'
                          }`}
                        >
                          {selectedProfile.privileges.canAccessSeries ? 'Allowed' : 'Blocked'}
                        </button>
                      </div>

                      {/* Server Settings Access */}
                      <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <Settings className="w-4 h-4 text-slate-400" />
                          <div>
                            <p className="font-semibold text-white">IPTV Server Management</p>
                            <p className="text-[11px] text-slate-400">Add or edit streaming lines</p>
                          </div>
                        </div>
                        <button
                          disabled={selectedProfile.role === 'master_admin'}
                          onClick={() => handleUpdatePrivilege('canManageServers', !selectedProfile.privileges.canManageServers)}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                            selectedProfile.privileges.canManageServers
                              ? 'bg-emerald-600/30 text-emerald-400 border border-emerald-500/40'
                              : 'bg-slate-800 text-slate-500'
                          }`}
                        >
                          {selectedProfile.privileges.canManageServers ? 'Allowed' : 'Locked'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Content Rating Cap */}
                  {selectedProfile.role !== 'master_admin' && (
                    <div className="space-y-2 pt-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Maximum Allowed Content Rating
                      </h4>
                      <div className="flex items-center gap-2">
                        {['all', 'PG-13', 'PG'].map((rating) => {
                          const isSel = (selectedProfile.privileges.maxContentRating || 'all') === rating;
                          return (
                            <button
                              key={rating}
                              onClick={() => handleUpdatePrivilege('maxContentRating', rating)}
                              className={`px-4 py-1.5 rounded-xl text-xs font-bold transition ${
                                isSel
                                  ? 'bg-cyan-600 text-white shadow'
                                  : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
                              }`}
                            >
                              {rating === 'all' ? 'All Ratings' : rating}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Blocked Categories for this user */}
                  {selectedProfile.role !== 'master_admin' && (
                    <div className="space-y-2 pt-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                        Categories Blocked Specifically for {selectedProfile.name}
                      </h4>
                      <div className="flex flex-wrap gap-1.5">
                        {categories.filter((c) => c.category_id !== 'all').map((cat) => {
                          const isBlocked = selectedProfile.privileges.blockedCategories?.includes(cat.category_id);
                          return (
                            <button
                              key={cat.category_id}
                              onClick={() => handleToggleUserBlockedCategory(cat.category_id)}
                              className={`px-3 py-1 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition ${
                                isBlocked
                                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                  : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
                              }`}
                            >
                              {isBlocked && <Lock className="w-3 h-3 text-rose-400" />}
                              <span>{cat.category_name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Global Category & Channel Locks */}
          {activeTab === 'content_locks' && (
            <div className="space-y-6">
              {/* Display Policy Toggle: Hide vs Lock badge */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center text-cyan-400 shrink-0">
                    {settings.hideLockedContentCompletely ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white">Hide Restricted Content Completely</h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {settings.hideLockedContentCompletely
                        ? 'Locked channels and categories are completely invisible to non-admin profiles.'
                        : 'Locked channels appear with a lock badge and prompt for the Master PIN to unlock.'}
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleToggleHideContent}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition shrink-0 ${
                    settings.hideLockedContentCompletely
                      ? 'bg-cyan-600 text-white shadow'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {settings.hideLockedContentCompletely ? 'Vanish / Hidden' : 'Show with Lock'}
                </button>
              </div>

              {/* Restrict Server Manager */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center text-cyan-400 shrink-0">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-white">Require Master PIN to Access Server Manager</h4>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Prevents children or guests from adding, modifying, or deleting your IPTV streaming lines.
                    </p>
                  </div>
                </div>

                <button
                  onClick={handleToggleRestrictServers}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition shrink-0 ${
                    settings.restrictServerSettings
                      ? 'bg-emerald-600/30 text-emerald-400 border border-emerald-500/40'
                      : 'bg-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  {settings.restrictServerSettings ? 'PIN Protected' : 'Open'}
                </button>
              </div>

              {/* Global Category Locks */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Live TV Category Locks
                  </h4>
                  <span className="text-[11px] text-slate-500">
                    Tap to lock/unlock category across all non-admin profiles
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {categories.filter((c) => c.category_id !== 'all').map((cat) => {
                    const isLocked = settings.lockedCategoryIds.includes(cat.category_id);
                    return (
                      <button
                        key={cat.category_id}
                        onClick={() => handleToggleCategoryLock(cat.category_id, 'live')}
                        className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition ${
                          isLocked
                            ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-sm'
                            : 'bg-slate-950 text-slate-300 border border-slate-800 hover:border-slate-700'
                        }`}
                      >
                        {isLocked ? <Lock className="w-3.5 h-3.5 text-rose-400" /> : <Unlock className="w-3.5 h-3.5 text-slate-500" />}
                        <span>{cat.category_name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Individual Channel Locks */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Individual Channel Locks
                  </h4>
                  <span className="text-[11px] text-slate-500">
                    {settings.lockedChannelIds.length} Channels Specifically Locked
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-60 overflow-y-auto custom-scrollbar p-1">
                  {streams.slice(0, 18).map((stream) => {
                    const isLocked = settings.lockedChannelIds.includes(String(stream.stream_id));
                    return (
                      <div
                        key={stream.stream_id}
                        onClick={() => handleToggleChannelLock(stream.stream_id)}
                        className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition ${
                          isLocked
                            ? 'bg-rose-500/10 border-rose-500/40 text-white'
                            : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate min-w-0">
                          <span className="text-[10px] font-mono font-bold text-cyan-400 w-6">
                            {stream.num || stream.stream_id}
                          </span>
                          <span className="text-xs font-semibold truncate">{stream.name}</span>
                        </div>
                        <div className="shrink-0 ml-2">
                          {isLocked ? (
                            <Lock className="w-3.5 h-3.5 text-rose-400" />
                          ) : (
                            <Unlock className="w-3.5 h-3.5 text-slate-600" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Change Master PIN */}
          {activeTab === 'pin' && (
            <div className="max-w-md mx-auto space-y-6 py-4">
              <div className="p-4 rounded-2xl bg-cyan-950/30 border border-cyan-500/20 text-center">
                <KeyRound className="w-8 h-8 text-cyan-400 mx-auto mb-2" />
                <h4 className="text-sm font-bold text-white">Master Admin PIN Security</h4>
                <p className="text-xs text-slate-400 mt-1">
                  The Master PIN grants instant override of all parental restrictions and profile settings.
                </p>
              </div>

              <form onSubmit={handleChangePinSubmit} className="space-y-4">
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block text-slate-300 mb-1 font-medium">Current Master PIN</label>
                    <input
                      type="password"
                      maxLength={6}
                      placeholder="••••"
                      value={currentPinInput}
                      onChange={(e) => setCurrentPinInput(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-white font-mono text-center tracking-widest text-base focus:outline-none focus:border-cyan-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 mb-1 font-medium">New Master PIN (4 to 6 Digits)</label>
                    <input
                      type="password"
                      maxLength={6}
                      placeholder="••••"
                      value={newPinInput}
                      onChange={(e) => setNewPinInput(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-white font-mono text-center tracking-widest text-base focus:outline-none focus:border-cyan-500"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-slate-300 mb-1 font-medium">Confirm New PIN</label>
                    <input
                      type="password"
                      maxLength={6}
                      placeholder="••••"
                      value={confirmPinInput}
                      onChange={(e) => setConfirmPinInput(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-white font-mono text-center tracking-widest text-base focus:outline-none focus:border-cyan-500"
                      required
                    />
                  </div>
                </div>

                {pinFeedback && (
                  <div
                    className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                      pinFeedback.type === 'success'
                        ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                        : 'bg-rose-950 text-rose-300 border border-rose-800'
                    }`}
                  >
                    {pinFeedback.type === 'success' ? (
                      <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    )}
                    <span>{pinFeedback.text}</span>
                  </div>
                )}

                <button
                  type="submit"
                  className="w-full py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition shadow-lg shadow-cyan-950/50"
                >
                  Update Master PIN
                </button>
              </form>

              {/* Relock Button */}
              <div className="pt-4 border-t border-slate-800 text-center">
                <button
                  type="button"
                  onClick={() => {
                    parentalControlService.relockSession();
                    onConfigChanged();
                    onClose();
                  }}
                  className="text-xs text-rose-400 hover:text-rose-300 font-semibold flex items-center gap-1.5 mx-auto"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Lock Session Now (Require PIN Immediately)</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
