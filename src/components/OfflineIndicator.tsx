/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { WifiOff, Zap } from 'lucide-react';

export const OfflineIndicator: React.FC = () => {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div className="fixed bottom-[calc(4.75rem+env(safe-area-inset-bottom))] sm:bottom-4 left-4 right-4 sm:right-auto z-50 flex items-center justify-between sm:justify-start gap-2.5 rounded-2xl bg-slate-900/95 border border-amber-500/40 px-3.5 py-2 text-xs font-bold text-amber-300 shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom duration-200">
      <div className="flex items-center gap-2 min-w-0">
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400 animate-pulse shrink-0" />
        <WifiOff className="w-4 h-4 text-amber-400 shrink-0" />
        <span className="truncate">Offline Mode — Cached data & local storage active.</span>
      </div>
    </div>
  );
};
