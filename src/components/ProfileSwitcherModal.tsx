import React, { useState } from 'react';
import {
  Users,
  X,
  Crown,
  Smile,
  User,
  Shield,
  Check,
  Lock,
} from 'lucide-react';
import { UserProfile } from '../types/xtream';
import { parentalControlService } from '../services/parentalControlService';
import { PinModal } from './PinModal';

interface ProfileSwitcherModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeProfile: UserProfile;
  profiles: UserProfile[];
  onSelectProfile: (profile: UserProfile) => void;
  onOpenParentalControls: () => void;
}

export const ProfileSwitcherModal: React.FC<ProfileSwitcherModalProps> = ({
  isOpen,
  onClose,
  activeProfile,
  profiles,
  onSelectProfile,
  onOpenParentalControls,
}) => {
  const [targetProfileForPin, setTargetProfileForPin] = useState<UserProfile | null>(null);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pinPurpose, setPinPurpose] = useState<'switch_profile' | 'open_controls'>('switch_profile');

  if (!isOpen) return null;

  const handleProfileClick = (profile: UserProfile) => {
    // If switching to Master Admin from non-admin, require PIN!
    if (profile.role === 'master_admin' && activeProfile.role !== 'master_admin') {
      setTargetProfileForPin(profile);
      setPinPurpose('switch_profile');
      setShowPinModal(true);
      return;
    }

    onSelectProfile(profile);
    onClose();
  };

  const handleParentalControlsClick = () => {
    // Opening parental controls requires PIN if not session unlocked
    if (!parentalControlService.isSessionUnlocked()) {
      setPinPurpose('open_controls');
      setShowPinModal(true);
      return;
    }
    onOpenParentalControls();
    onClose();
  };

  const handlePinSuccess = () => {
    setShowPinModal(false);
    if (pinPurpose === 'switch_profile' && targetProfileForPin) {
      onSelectProfile(targetProfileForPin);
      setTargetProfileForPin(null);
      onClose();
    } else if (pinPurpose === 'open_controls') {
      onOpenParentalControls();
      onClose();
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-xl p-4 animate-in fade-in duration-200">
        <div className="w-full max-w-xl rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl p-6 sm:p-8 flex flex-col items-center text-center relative">
          <button
            onClick={onClose}
            className="absolute top-5 right-5 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mb-3">
            <Users className="w-6 h-6" />
          </div>

          <h2 className="text-xl font-bold text-white tracking-tight">Who's Watching?</h2>
          <p className="text-xs text-slate-400 mt-1 max-w-sm">
            Select your profile to load customized content privileges and personalized favorites.
          </p>

          {/* Profile Cards Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 my-8 w-full max-w-md">
            {profiles.map((p) => {
              const isActive = activeProfile.id === p.id;
              const isLockedForCurrent = p.role === 'master_admin' && activeProfile.role !== 'master_admin';

              return (
                <button
                  key={p.id}
                  onClick={() => handleProfileClick(p)}
                  className={`group relative flex flex-col items-center p-4 rounded-2xl border transition-all duration-200 active:scale-95 ${
                    isActive
                      ? 'bg-slate-800/90 border-cyan-500 shadow-xl shadow-cyan-950/40 ring-2 ring-cyan-500/30'
                      : 'bg-slate-950/70 border-slate-800 hover:border-slate-700 hover:bg-slate-850'
                  }`}
                >
                  {/* Avatar Circle */}
                  <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center text-white mb-3 shadow-lg transform group-hover:scale-105 transition-transform relative"
                    style={{ backgroundColor: p.avatarColor }}
                  >
                    {p.role === 'master_admin' ? (
                      <Crown className="w-8 h-8" />
                    ) : p.isKids ? (
                      <Smile className="w-8 h-8" />
                    ) : (
                      <User className="w-8 h-8" />
                    )}

                    {isLockedForCurrent && (
                      <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center text-amber-400 shadow">
                        <Lock className="w-3.5 h-3.5" />
                      </div>
                    )}
                  </div>

                  <span className="text-xs font-bold text-white group-hover:text-cyan-400 transition truncate max-w-[110px]">
                    {p.name}
                  </span>

                  <span className="text-[10px] text-slate-400 mt-0.5 capitalize">
                    {p.role === 'master_admin' ? 'Master Admin' : p.isKids ? 'Kids (Safe)' : 'Family'}
                  </span>

                  {isActive && (
                    <span className="text-[9px] font-bold text-cyan-400 mt-1 flex items-center gap-1">
                      <Check className="w-3 h-3" />
                      <span>Active</span>
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Parental Controls Access Link */}
          <div className="w-full pt-4 border-t border-slate-800 flex items-center justify-center">
            <button
              onClick={handleParentalControlsClick}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-750 text-xs font-semibold text-slate-200 transition"
            >
              <Shield className="w-4 h-4 text-cyan-400" />
              <span>Parental Controls & Privileges</span>
              <Lock className="w-3 h-3 text-slate-400 ml-0.5" />
            </button>
          </div>
        </div>
      </div>

      {/* PIN Verification Modal */}
      <PinModal
        isOpen={showPinModal}
        title={pinPurpose === 'switch_profile' ? 'Master Admin PIN Required' : 'Parental Controls Locked'}
        description={
          pinPurpose === 'switch_profile'
            ? `Enter the 4-digit Master PIN to switch to ${targetProfileForPin?.name || 'Master Admin'}.`
            : 'Enter Master PIN to access parental control settings.'
        }
        onSuccess={handlePinSuccess}
        onCancel={() => {
          setShowPinModal(false);
          setTargetProfileForPin(null);
        }}
      />
    </>
  );
};
