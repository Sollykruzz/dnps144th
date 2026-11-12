/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  RotateCw,
  Settings,
  WifiOff,
  UserCheck,
  Zap,
  FileSpreadsheet,
  LogOut,
  Shield,
  User,
  MoreHorizontal,
  ChevronDown,
} from 'lucide-react';
import { BursarSession, SchoolProfile } from '../types';
import { DGOSLogo } from './DGOSLogo';
import { SyncStatus } from '../services/firebase';
import { getStoredBranding, subscribeBranding, AppBrandingConfig } from '../services/brandingService';
import { PWAInstallButton } from './PWAInstallButton';

interface HeaderProps {
  session: BursarSession;
  isOnline: boolean;
  isLoading: boolean;
  onRefresh: () => void;
  onOpenSettings: () => void;
  onOpenAddStudent: () => void;
  onOpenSheetUpload?: () => void;
  onLogout?: () => void;
  studentCount: number;
  activeSchool?: SchoolProfile;
  syncStatus?: SyncStatus;
}

export const Header: React.FC<HeaderProps> = ({
  session,
  isOnline,
  isLoading,
  onRefresh,
  onOpenSettings,
  onOpenAddStudent,
  onOpenSheetUpload,
  onLogout,
  studentCount,
  activeSchool,
  syncStatus,
}) => {
  const schoolId = activeSchool?.id || session.schoolId || 'dominion-group';
  const [branding, setBranding] = useState<AppBrandingConfig>(() => getStoredBranding(schoolId));

  useEffect(() => {
    setBranding(getStoredBranding(schoolId));
  }, [schoolId]);

  useEffect(() => {
    const unsub = subscribeBranding((updated) => setBranding(updated));
    return unsub;
  }, []);

  const syncLabel = !isOnline
    ? 'Offline'
    : syncStatus?.syncError
      ? 'Sync needs attention'
      : syncStatus?.lastFirebaseSyncTime
        ? `Synced ${syncStatus.lastFirebaseSyncTime}`
        : 'Connecting to cloud';
  const syncTitle = !isOnline
    ? 'Device is offline; cloud sync will resume when the connection returns.'
    : syncStatus?.syncError
      ? `Sync issue: ${syncStatus.syncError}`
      : syncStatus?.lastFirebaseSyncTime
        ? `Last successful sync: ${syncStatus.lastFirebaseSyncTime}`
        : 'Waiting for the first successful cloud sync';
  const isSyncHealthy = isOnline && !syncStatus?.syncError && Boolean(syncStatus?.lastFirebaseSyncTime);

  const isAdmin = session.role === 'admin';
  const roleLabel = isAdmin 
    ? (session.userTitle?.toLowerCase().includes('proprietor') || session.bursarName?.toLowerCase().includes('proprietor') ? 'Proprietor' : 'Admin')
    : 'Bursar';

  return (
    <header className="relative z-30 shrink-0 border-b border-slate-200 bg-white">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-3 py-2 sm:px-6 sm:py-2.5 lg:flex-row lg:items-center lg:justify-between lg:gap-5">
        <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between lg:flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <DGOSLogo size="sm" />
            <div className="min-w-0">
              <h1 className="truncate text-base font-extrabold leading-tight tracking-tight text-slate-950 sm:text-lg">
                {branding.shortName || branding.appName.substring(0, 15)}
              </h1>
              <p className="truncate text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 sm:text-[11px]">
                {branding.appName || session.schoolName}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-semibold sm:gap-2">
            <span className={`inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 ${
              isAdmin ? 'border-violet-200 bg-violet-50 text-violet-800' : 'border-blue-200 bg-blue-50 text-blue-800'
            }`}>
              {isAdmin ? <Shield className="size-3.5" aria-hidden="true" /> : <User className="size-3.5" aria-hidden="true" />}
              <span>{roleLabel}</span>
            </span>

            <span className={`inline-flex min-h-7 items-center gap-1.5 rounded-full border px-2.5 ${
              isOnline ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-rose-200 bg-rose-50 text-rose-800'
            }`}>
              {isOnline ? <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden="true" /> : <WifiOff className="size-3.5" aria-hidden="true" />}
              {isOnline ? 'Online' : 'Offline'}
            </span>

            <button
              type="button"
              onClick={onOpenSettings}
              id="firebase-cloud-indicator"
              title={syncTitle}
              aria-label={`${syncLabel}. Open sync settings.`}
              className={`inline-flex min-h-7 max-w-full items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 transition-colors hover:bg-slate-100 ${
                isSyncHealthy ? 'text-emerald-800' : 'text-amber-800'
              }`}
            >
              <Zap className={`size-3.5 shrink-0 ${isSyncHealthy ? 'fill-emerald-500 text-emerald-600' : 'fill-amber-500 text-amber-600'}`} aria-hidden="true" />
              <span className="truncate">{syncLabel}</span>
            </button>

            <span className="inline-flex min-h-7 items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 text-slate-700">
              {studentCount} students
            </span>
          </div>
        </div>

        <div className="flex items-center justify-end">
          <details className="group relative">
            <summary
              aria-label="Open workspace tools"
              className="inline-flex min-h-9 cursor-pointer list-none items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 [&::-webkit-details-marker]:hidden"
            >
              <MoreHorizontal className="size-4" aria-hidden="true" />
              <span>Tools</span>
              <ChevronDown className="size-3.5 text-slate-400 transition-transform group-open:rotate-180" aria-hidden="true" />
            </summary>

            <div
              onClick={(event) => {
                const menu = event.currentTarget.closest('details');
                if (menu) menu.open = false;
              }}
              className="absolute right-0 top-full z-50 mt-2 flex w-60 max-w-[calc(100vw-2rem)] flex-col gap-1 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl"
            >
              <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Workspace tools</p>
              <PWAInstallButton variant="compact" className="w-full justify-start" />

              {onOpenSheetUpload && (
                <button
                  type="button"
                  onClick={onOpenSheetUpload}
                  id="header-sheet-upload-btn"
                  className="inline-flex min-h-10 w-full items-center gap-2 rounded-xl px-2.5 text-left text-xs font-semibold text-slate-700 transition-colors hover:bg-emerald-50 hover:text-emerald-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                >
                  <FileSpreadsheet className="size-4 text-emerald-700" aria-hidden="true" />
                  Import student roster
                </button>
              )}

              <button
                type="button"
                onClick={onOpenAddStudent}
                id="quick-add-student-btn"
                className="inline-flex min-h-10 w-full items-center gap-2 rounded-xl px-2.5 text-left text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
              >
                <UserCheck className="size-4" aria-hidden="true" />
                Enroll student
              </button>

              <button
                type="button"
                onClick={onRefresh}
                disabled={isLoading}
                id="sync-refresh-btn"
                className="inline-flex min-h-10 w-full items-center gap-2 rounded-xl px-2.5 text-left text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 disabled:opacity-50"
              >
                <RotateCw className={`size-4 ${isLoading ? 'animate-spin text-blue-600' : ''}`} aria-hidden="true" />
                Refresh and sync
              </button>

              <button
                type="button"
                onClick={onOpenSettings}
                id="open-settings-btn"
                className="inline-flex min-h-10 w-full items-center gap-2 rounded-xl px-2.5 text-left text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
              >
                <Settings className="size-4" aria-hidden="true" />
                Settings and database
              </button>

              {onLogout && (
                <button
                  type="button"
                  onClick={onLogout}
                  id="header-lock-logout-btn"
                  className="inline-flex min-h-10 w-full items-center gap-2 rounded-xl px-2.5 text-left text-xs font-semibold text-rose-700 transition-colors hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                >
                  <LogOut className="size-4" aria-hidden="true" />
                  Log out
                </button>
              )}
            </div>
          </details>
        </div>
      </div>
    </header>
  );
};
