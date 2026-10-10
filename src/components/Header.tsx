/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  RotateCw, 
  Settings, 
  WifiOff, 
  CheckCircle2, 
  AlertTriangle,
  UserCheck,
  Zap,
  Cloud,
  FileSpreadsheet,
  Database,
  LogOut,
  Shield,
  User
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

  const isAdmin = session.role === 'admin';
  const roleLabel = isAdmin 
    ? (session.userTitle?.toLowerCase().includes('proprietor') || session.bursarName?.toLowerCase().includes('proprietor') ? 'Proprietor' : 'Admin')
    : 'Bursar';

  return (
    <header className="shrink-0 bg-white border-b border-[#f0f0f0] px-3.5 sm:px-5 py-2.5 sm:py-3.5 z-30">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2">
        
        {/* Branding & Status */}
        <div className="min-w-0 w-full sm:w-auto sm:flex-1">
          <div className="flex items-center gap-2 sm:gap-2.5">
            <DGOSLogo size="sm" />
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <h1 className="text-sm sm:text-lg font-black tracking-tight text-[#0f172a] uppercase leading-tight truncate max-w-full sm:max-w-xs md:max-w-md">
                  {branding.shortName || branding.appName.substring(0, 15)}
                </h1>
              </div>
              <span className="text-[9px] sm:text-[10px] font-bold text-slate-500 tracking-wider uppercase truncate max-w-full sm:max-w-sm md:max-w-lg">
                {branding.appName || session.schoolName}
              </span>
            </div>
          </div>

          {/* Status Indicators Bar - Clean, well-structured */}
          <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-[11px] text-slate-500 mt-1 font-medium flex-wrap">
            {/* User Role Badge */}
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-black text-[9px] sm:text-[10px] uppercase tracking-wider ${
              isAdmin ? 'bg-purple-100 text-purple-900 border border-purple-200' : 'bg-blue-100 text-blue-900 border border-blue-200'
            }`}>
              {isAdmin ? <Shield className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-purple-700" /> : <User className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-blue-700" />}
              <span>{roleLabel}</span>
            </span>

            <span className="text-slate-300">•</span>

            {/* Online / Offline status */}
            <span className="inline-flex items-center gap-1">
              {isOnline ? (
                <span className="inline-flex items-center gap-1 text-emerald-600 font-bold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  Online
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-rose-500 font-bold">
                  <WifiOff className="w-3 h-3" />
                  Offline
                </span>
              )}
            </span>

            <span className="text-slate-300">•</span>

            {/* Cloud Live & Student Count Unified Pill Group */}
            <div className="inline-flex items-center gap-1 bg-slate-50 border border-slate-200/80 rounded-full px-1.5 py-0.5 text-[10px]">
              <button
                onClick={onOpenSettings}
                id="firebase-cloud-indicator"
                title={
                  syncStatus?.syncError
                    ? `Sync notice: ${syncStatus.syncError}`
                    : syncStatus?.lastFirebaseSyncTime
                    ? `Last synced with Firestore at: ${syncStatus.lastFirebaseSyncTime}`
                    : 'Cloud Database: Real-time Firestore synchronization active'
                }
                className={`inline-flex items-center gap-1 font-semibold transition-colors cursor-pointer ${
                  syncStatus?.syncError?.toLowerCase().includes('quota')
                    ? 'text-amber-700 hover:text-amber-800'
                    : 'text-emerald-700 hover:text-emerald-800'
                }`}
              >
                <Zap
                  className={`w-3 h-3 ${
                    syncStatus?.syncError?.toLowerCase().includes('quota')
                      ? 'text-amber-600 fill-amber-500'
                      : 'text-emerald-600 fill-emerald-500'
                  }`}
                />
                <span>
                  {syncStatus?.syncError?.toLowerCase().includes('quota')
                    ? 'Quota Paused (Local Active)'
                    : 'Cloud Live'}
                </span>
              </button>
              <span className="text-slate-300">|</span>
              <span className="text-slate-700 font-bold">{studentCount} Students</span>
            </div>
          </div>
        </div>

        {/* Circular Action Controls */}
        <div className="flex items-center gap-1.5 w-full sm:w-auto justify-between sm:justify-end sm:shrink-0">
          {/* PWA 1-Tap App Install Button */}
          <PWAInstallButton variant="header" />

          {/* Upload Excel / CSV File */}
          {onOpenSheetUpload && (
            <button
              onClick={onOpenSheetUpload}
              id="header-sheet-upload-btn"
              title="Import Student Roster from Excel / CSV"
              className="w-10 h-10 rounded-full bg-emerald-50 text-emerald-700 hover:bg-emerald-100 active:scale-95 flex items-center justify-center transition-all border border-emerald-200 cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            </button>
          )}

          {/* Quick Add Existing Student */}
          <button
            onClick={onOpenAddStudent}
            id="quick-add-student-btn"
            title="Add Existing Student"
            className="w-10 h-10 rounded-full bg-[#1a1a1a] text-white flex items-center justify-center hover:bg-black active:scale-95 transition-all shadow-xs cursor-pointer"
          >
            <UserCheck className="w-4 h-4 text-emerald-400" />
          </button>

          {/* Sync / Refresh */}
          <button
            onClick={onRefresh}
            disabled={isLoading}
            id="sync-refresh-btn"
            title="Refresh & Synchronize with Firebase Firestore"
            className="w-10 h-10 rounded-full bg-[#f4f4f7] text-[#1a1a1a] flex items-center justify-center hover:bg-slate-200 active:scale-95 disabled:opacity-50 transition-all border border-[#eee] cursor-pointer"
          >
            <RotateCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-[#2563eb]' : ''}`} />
          </button>

          {/* Settings */}
          <button
            onClick={onOpenSettings}
            id="open-settings-btn"
            title="Settings & Cloud Database"
            className="w-10 h-10 rounded-full bg-[#f4f4f7] text-[#1a1a1a] flex items-center justify-center hover:bg-slate-200 active:scale-95 transition-all border border-[#eee] relative cursor-pointer"
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* Logout / Lock System */}
          {onLogout && (
            <button
              onClick={onLogout}
              id="header-lock-logout-btn"
              title="Lock System / Log Out"
              className="w-10 h-10 rounded-full bg-rose-50 text-rose-700 flex items-center justify-center hover:bg-rose-100 active:scale-95 transition-all border border-rose-200 cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
