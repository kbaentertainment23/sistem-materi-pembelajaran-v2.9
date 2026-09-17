import React from 'react';
import { ThemeConfig } from '../types/theme';

interface ThemeOrnamentsProps {
  theme?: ThemeConfig;
}

export const ThemeOrnaments: React.FC<ThemeOrnamentsProps> = ({ theme }) => {
  if (!theme || !theme.isEventActive || !theme.showOrnaments) {
    return null;
  }

  const { ornamentStyle = 'ribbon', accentColor = 'indigo' } = theme;

  if (ornamentStyle === 'ribbon') {
    // Red-White patriotic ribbons for HUT RI or celebratory banners
    return (
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        {/* Top-right corner ribbon */}
        <div className="absolute -top-12 -right-12 w-32 h-32 bg-gradient-to-br from-red-600 via-rose-500 to-white/90 transform rotate-45 opacity-25 blur-xs" />
        <div className="absolute top-2 right-3 flex items-center gap-1.5 opacity-60">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          <span className="w-2 h-2 rounded-full bg-white border border-slate-300" />
        </div>
        {/* Bottom-left corner accent */}
        <div className="absolute -bottom-10 -left-10 w-28 h-28 bg-gradient-to-tr from-red-600/20 to-transparent rounded-full blur-xl" />
      </div>
    );
  }

  if (ornamentStyle === 'confetti') {
    // Joyful celebration / Dies Natalis
    return (
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-3 left-4 w-2 h-2 rounded-full bg-amber-400 opacity-60 animate-bounce" />
        <div className="absolute top-6 right-8 w-2.5 h-2.5 rounded-sm bg-yellow-300 transform rotate-45 opacity-50" />
        <div className="absolute bottom-4 left-1/4 w-2 h-2 rounded-full bg-amber-500 opacity-50" />
        <div className="absolute -top-10 right-1/4 w-40 h-40 bg-amber-400/15 rounded-full blur-2xl" />
      </div>
    );
  }

  if (ornamentStyle === 'sparkle') {
    // Focus / Integrity / Exam
    return (
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-4 right-6 w-1.5 h-1.5 rounded-full bg-cyan-300 opacity-70 animate-ping" />
        <div className="absolute bottom-6 left-8 w-2 h-2 rounded-full bg-blue-300 opacity-60" />
        <div className="absolute -bottom-8 -right-8 w-36 h-36 bg-cyan-500/15 rounded-full blur-2xl" />
      </div>
    );
  }

  if (ornamentStyle === 'leaves') {
    // Teacher's Day / Hardiknas inspiration
    return (
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-2 left-6 w-2 h-2 rounded-full bg-emerald-400 opacity-60" />
        <div className="absolute bottom-3 right-10 w-2 h-2 rounded-full bg-teal-300 opacity-60" />
        <div className="absolute -top-10 -left-10 w-36 h-36 bg-emerald-500/15 rounded-full blur-2xl" />
      </div>
    );
  }

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden z-0">
      <div className="absolute -top-12 -right-12 w-36 h-36 bg-indigo-500/15 rounded-full blur-2xl" />
    </div>
  );
};
