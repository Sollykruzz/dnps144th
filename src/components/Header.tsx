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
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:gap-5">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between lg:flex-1">
          <div className="flex min-w-0 items-center gap-3">
            <DGOSLogo size="md" />
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
            <span className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 ${
              isAdmin ? 'border-violet-200 bg-violet-50 text-violet-800' : 'border-blue-200 bg-blue-50 text-blue-800'
            }`}>
              {isAdmin ? <Shield className="size-3.5" aria-hidden="true" /> : <User className="size-3.5" aria-hidden="true" />}
              <span>{roleLabel}</span>
            </span>

            <span className={`inline-flex min-h-8 items-center gap-1.5 rounded-full border px-2.5 ${
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
              className={`inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 transition-colors hover:bg-slate-100 ${
                isSyncHealthy ? 'text-emerald-800' : 'text-amber-800'
              }`}
            >
              <Zap className={`size-3.5 shrink-0 ${isSyncHealthy ? 'fill-emerald-500 text-emerald-600' : 'fill-amber-500 text-amber-600'}`} aria-hidden="true" />
              <span className="truncate">{syncLabel}</span>
            </button>

            <span className="inline-flex min-h-8 items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 text-slate-700">
              {studentCount} students
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 sm:justify-end">
          <span className="hidden text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 sm:block lg:hidden">Workspace</span>
          <div aria-label="Workspace actions" className="flex items-center gap-1 rounded-2xl border border-slate-200 bg-slate-50 p-1">
            <PWAInstallButton variant="header" />

            {onOpenSheetUpload && (
              <button
                type="button"
                onClick={onOpenSheetUpload}
                id="header-sheet-upload-btn"
                title="Import student roster from Excel or CSV"
                aria-label="Import student roster from Excel or CSV"
                className="flex size-10 items-center justify-center rounded-xl text-emerald-700 transition-colors hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
              >
                <FileSpreadsheet className="size-4" aria-hidden="true" />
              </button>
            )}

            <button
              type="button"
              onClick={onOpenAddStudent}
              id="quick-add-student-btn"
              title="Add student"
              aria-label="Add student"
              className="flex size-10 items-center justify-center rounded-xl text-slate-700 transition-colors hover:bg-white hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
            >
              <UserCheck className="size-4" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={onRefresh}
              disabled={isLoading}
              id="sync-refresh-btn"
              title="Refresh and synchronize"
              aria-label="Refresh and synchronize"
              className="flex size-10 items-center justify-center rounded-xl text-slate-700 transition-colors hover:bg-white hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 disabled:opacity-50"
            >
              <RotateCw className={`size-4 ${isLoading ? 'animate-spin text-blue-600' : ''}`} aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={onOpenSettings}
              id="open-settings-btn"
              title="Settings and cloud database"
              aria-label="Settings and cloud database"
              className="flex size-10 items-center justify-center rounded-xl text-slate-700 transition-colors hover:bg-white hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
            >
              <Settings className="size-4" aria-hidden="true" />
            </button>

            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                id="header-lock-logout-btn"
                title="Log out"
                aria-label="Log out"
                className="flex size-10 items-center justify-center rounded-xl text-rose-700 transition-colors hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
              >
                <LogOut className="size-4" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
