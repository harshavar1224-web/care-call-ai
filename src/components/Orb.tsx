import React from 'react';

export type OrbState = 'idle' | 'listening' | 'speaking';

interface OrbProps {
  state: OrbState;
  size?: number;
}

export const Orb: React.FC<OrbProps> = ({ state, size = 160 }) => {
  return (
    <div
      className="relative flex items-center justify-center select-none"
      style={{ width: size, height: size }}
      aria-label={`Voice Agent Status: ${state}`}
    >
      {/* Outer ambient glow ripple */}
      <div
        className={`absolute inset-0 rounded-full blur-2xl transition-all duration-700 ${
          state === 'speaking'
            ? 'bg-teal-400/40 scale-125 animate-pulse'
            : state === 'listening'
            ? 'bg-indigo-400/35 scale-110 animate-ping opacity-60'
            : 'bg-teal-500/20 scale-95'
        }`}
      />

      {/* Secondary ripple wave for speaking / listening */}
      {(state === 'speaking' || state === 'listening') && (
        <div
          className={`absolute rounded-full border border-teal-300/40 transition-all duration-1000 ${
            state === 'speaking' ? 'inset-[-12px] animate-ping opacity-30' : 'inset-[-6px] opacity-40'
          }`}
        />
      )}

      {/* Main Orb Body with subtle fluid gradients */}
      <div
        className={`relative rounded-full shadow-lg flex items-center justify-center transition-all duration-500 overflow-hidden ${
          state === 'speaking'
            ? 'w-32 h-32 bg-gradient-to-tr from-teal-600 via-teal-500 to-indigo-500 scale-105 shadow-teal-500/30'
            : state === 'listening'
            ? 'w-28 h-28 bg-gradient-to-tr from-indigo-600 via-teal-500 to-sky-400 scale-100 shadow-indigo-500/30'
            : 'w-24 h-24 bg-gradient-to-tr from-slate-700 via-teal-700 to-teal-800 scale-95 opacity-90 shadow-slate-900/20'
        }`}
      >
        {/* Core highlight light */}
        <div className="absolute top-2 left-3 w-8 h-8 rounded-full bg-white/30 blur-sm pointer-events-none" />

        {/* Dynamic Wave bars inside the orb when active */}
        {state === 'speaking' && (
          <div className="flex items-center gap-1.5 h-10">
            <span className="w-1.5 bg-white/90 rounded-full animate-bounce [animation-delay:-0.3s] h-8" />
            <span className="w-1.5 bg-white/90 rounded-full animate-bounce [animation-delay:-0.15s] h-10" />
            <span className="w-1.5 bg-white/90 rounded-full animate-bounce [animation-delay:0s] h-6" />
            <span className="w-1.5 bg-white/90 rounded-full animate-bounce [animation-delay:-0.2s] h-9" />
          </div>
        )}

        {state === 'listening' && (
          <div className="flex items-center gap-1 h-6">
            <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping [animation-delay:0s]" />
            <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping [animation-delay:0.2s]" />
            <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping [animation-delay:0.4s]" />
          </div>
        )}

        {state === 'idle' && (
          <div className="w-2.5 h-2.5 rounded-full bg-teal-200/60" />
        )}
      </div>
    </div>
  );
};
