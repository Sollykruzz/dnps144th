/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Download, Smartphone, CheckCircle, X, ExternalLink, HelpCircle } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  variant?: 'header' | 'banner' | 'settings' | 'compact';
  className?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  variant = 'compact',
  className = '',
}) => {
  const { isInstallable, isInstalled, isIOS, isAndroid, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);
  const [installSuccess, setInstallSuccess] = useState(false);

  const handleInstallClick = async () => {
    if (isInstallable) {
      const res = await install();
      if (res) {
        setInstallSuccess(true);
        setTimeout(() => setInstallSuccess(false), 4000);
      }
    } else {
      setShowGuide(true);
    }
  };

  // If already running as installed app
  if (isInstalled) {
    if (variant === 'settings') {
      return (
        <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-800 text-xs font-bold">
          <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>Application is already installed & running in Standalone Android/App Mode</span>
        </div>
      );
    }
    return null;
  }

  return (
    <>
      {variant === 'header' && (
        <button
          type="button"
          onClick={handleInstallClick}
          id="header-pwa-install-btn"
          title="Install as Android / Mobile App"
          className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold text-[11px] sm:text-xs shadow-sm active:scale-95 transition-all cursor-pointer ${className}`}
        >
          <Smartphone className="w-3.5 h-3.5" />
          <span className="hidden xs:inline">Install App</span>
        </button>
      )}

      {variant === 'compact' && (
        <button
          type="button"
          onClick={handleInstallClick}
          id="compact-pwa-install-btn"
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-bold transition-all cursor-pointer ${className}`}
        >
          <Download className="w-3.5 h-3.5 text-blue-600" />
          <span>{isAndroid ? 'Install on Android' : 'Install App'}</span>
        </button>
      )}

      {variant === 'banner' && (
        <div className={`p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-blue-900 via-indigo-900 to-slate-900 text-white shadow-md flex items-center justify-between gap-3 border border-blue-800/40 ${className}`}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-300 flex items-center justify-center shrink-0 border border-blue-400/30">
              <Smartphone className="w-5 h-5 text-blue-400" />
            </div>
            <div className="min-w-0">
              <h4 className="text-xs sm:text-sm font-black text-white truncate">Install DGOS School App</h4>
              <p className="text-[11px] text-blue-200/80 font-medium line-clamp-1">
                Fast 1-tap launcher, full-screen offline mode & instant push sync
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleInstallClick}
            id="banner-pwa-install-action-btn"
            className="shrink-0 px-3.5 py-2 rounded-xl bg-white hover:bg-blue-50 text-blue-900 font-extrabold text-xs shadow-sm active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5 text-blue-600" />
            <span>Install</span>
          </button>
        </div>
      )}

      {variant === 'settings' && (
        <div className={`bg-gradient-to-br from-slate-900 to-blue-950 text-white p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-blue-900/40 space-y-3 ${className}`}>
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-500/20 text-blue-300 flex items-center justify-center border border-blue-400/30 shrink-0">
                <Smartphone className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-black text-white">Android & Mobile App (PWA)</h4>
                <p className="text-xs text-blue-200/80 font-medium">
                  Run as a standalone native app on Android, tablets, and mobile devices with zero app store download needed.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1 flex-wrap">
            <button
              type="button"
              onClick={handleInstallClick}
              id="settings-install-app-btn"
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-sm flex items-center gap-2 transition-all cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>{isInstallable ? 'Install App on this Device' : 'How to Install on Android / Phone'}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowGuide(true)}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs border border-slate-700 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
              <span>Installation Guide</span>
            </button>
          </div>
        </div>
      )}

      {/* Installation Instructions Modal Dialog */}
      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 shadow-2xl border border-slate-200 space-y-4 max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">Install as Mobile App</h3>
                  <p className="text-xs text-slate-500 font-medium">Android & iOS Home Screen Setup</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Android Guide */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center gap-2 text-slate-900 font-black text-xs">
                <span className="w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px]">1</span>
                <span>Android (Chrome / Samsung Internet / Edge)</span>
              </div>
              <ol className="text-xs text-slate-600 font-medium space-y-1.5 list-decimal list-inside pl-1">
                <li>Tap the browser menu (<strong>⋮</strong> 3 vertical dots at top-right).</li>
                <li>Select <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>.</li>
                <li>Confirm <strong>"Install"</strong> — the app icon will appear instantly on your Android phone launcher.</li>
              </ol>
            </div>

            {/* iOS Guide */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center gap-2 text-slate-900 font-black text-xs">
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px]">2</span>
                <span>iPhone / iPad (Safari)</span>
              </div>
              <ol className="text-xs text-slate-600 font-medium space-y-1.5 list-decimal list-inside pl-1">
                <li>Tap the <strong>Share</strong> button (box with upward arrow at bottom).</li>
                <li>Scroll down and tap <strong>"Add to Home Screen"</strong>.</li>
                <li>Tap <strong>"Add"</strong> at top-right to finalize.</li>
              </ol>
            </div>

            {/* Key Benefits */}
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-2xl text-[11px] text-blue-900 font-semibold space-y-1">
              <div className="flex items-center gap-1 font-bold">
                <CheckCircle className="w-3.5 h-3.5 text-blue-600" />
                <span>Runs full-screen with offline caching & instant launch</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowGuide(false)}
              className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors cursor-pointer"
            >
              Got it, Close
            </button>
          </div>
        </div>
      )}
    </>
  );
};
