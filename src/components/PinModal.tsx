import React, { useState, useEffect } from 'react';
import { Lock, X, Delete, ShieldAlert, KeyRound } from 'lucide-react';
import { parentalControlService } from '../services/parentalControlService';

interface PinModalProps {
  isOpen: boolean;
  title?: string;
  description?: string;
  onSuccess: () => void;
  onCancel: () => void;
}

export const PinModal: React.FC<PinModalProps> = ({
  isOpen,
  title = 'Enter Master PIN',
  description = 'Parental controls are active. Enter your 4-digit PIN to unlock.',
  onSuccess,
  onCancel,
}) => {
  const [pin, setPin] = useState('');
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (isOpen) {
      setPin('');
      setHasError(false);
      setErrorMessage('');
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        handleDigit(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleBackspace();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, pin]);

  if (!isOpen) return null;

  const handleDigit = (digit: string) => {
    if (pin.length >= 6) return;
    const nextPin = pin + digit;
    setPin(nextPin);
    setHasError(false);
    setErrorMessage('');

    // If reaches 4 digits, attempt verification automatically
    if (nextPin.length === 4) {
      setTimeout(() => {
        const isValid = parentalControlService.verifyMasterPin(nextPin);
        if (isValid) {
          onSuccess();
        } else {
          setHasError(true);
          setErrorMessage('Incorrect PIN. Please try again.');
          setPin('');
        }
      }, 100);
    }
  };

  const handleBackspace = () => {
    setPin((prev) => prev.slice(0, -1));
    setHasError(false);
    setErrorMessage('');
  };

  const handleClear = () => {
    setPin('');
    setHasError(false);
    setErrorMessage('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-sm rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl p-6 flex flex-col items-center text-center relative">
        {/* Close Button */}
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Lock Icon */}
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-3 transition-colors ${
          hasError
            ? 'bg-rose-500/10 border border-rose-500/30 text-rose-400 animate-bounce'
            : 'bg-cyan-500/10 border border-cyan-500/30 text-cyan-400'
        }`}>
          {hasError ? <ShieldAlert className="w-7 h-7" /> : <Lock className="w-7 h-7" />}
        </div>

        <h3 className="text-base font-bold text-white tracking-tight">{title}</h3>
        <p className="text-xs text-slate-400 mt-1 max-w-xs">{description}</p>

        {/* PIN Indicators Dots */}
        <div className="flex items-center gap-3 my-6">
          {[0, 1, 2, 3].map((idx) => {
            const isFilled = pin.length > idx;
            return (
              <div
                key={idx}
                className={`w-4 h-4 rounded-full border-2 transition-all duration-200 ${
                  isFilled
                    ? 'bg-cyan-400 border-cyan-400 scale-110 shadow-lg shadow-cyan-500/50'
                    : hasError
                    ? 'border-rose-500/80 bg-rose-500/20'
                    : 'border-slate-700 bg-slate-800'
                }`}
              />
            );
          })}
        </div>

        {/* Error message */}
        {errorMessage ? (
          <p className="text-xs font-semibold text-rose-400 mb-4 animate-pulse">
            {errorMessage}
          </p>
        ) : (
          <p className="text-[11px] text-slate-500 mb-4">
            Default master PIN is <span className="font-mono text-cyan-400 font-semibold">0000</span>
          </p>
        )}

        {/* Numeric On-Screen Keypad for TV & Mobile */}
        <div className="grid grid-cols-3 gap-2.5 w-full max-w-[260px]">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleDigit(digit)}
              className="h-12 rounded-2xl bg-slate-800/80 hover:bg-slate-750 text-white font-mono font-bold text-lg active:scale-95 transition border border-slate-700/60 shadow-sm flex items-center justify-center"
            >
              {digit}
            </button>
          ))}
          <button
            type="button"
            onClick={handleClear}
            className="h-12 rounded-2xl bg-slate-800/40 hover:bg-slate-800 text-slate-400 text-xs font-semibold active:scale-95 transition flex items-center justify-center"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => handleDigit('0')}
            className="h-12 rounded-2xl bg-slate-800/80 hover:bg-slate-750 text-white font-mono font-bold text-lg active:scale-95 transition border border-slate-700/60 shadow-sm flex items-center justify-center"
          >
            0
          </button>
          <button
            type="button"
            onClick={handleBackspace}
            className="h-12 rounded-2xl bg-slate-800/40 hover:bg-slate-800 text-slate-400 active:scale-95 transition flex items-center justify-center"
          >
            <Delete className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
