/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Shield,
  Key,
  User,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  Save,
  Lock,
  RefreshCw,
  Sparkles,
  Users,
  ShieldCheck,
  Building2,
  Clock,
  ArrowRight,
} from 'lucide-react';
import { SystemUserAccount, UserRole, getStoredSystemUsers, updateSystemAccount, fetchSystemUsersFromFirestore } from '../services/userAccountService';
import { BursarSession } from '../types';

interface UserCredentialManagerProps {
  session: BursarSession;
  onSessionUpdated?: (updatedSession: BursarSession) => void;
}

export const UserCredentialManager: React.FC<UserCredentialManagerProps> = ({
  session,
  onSessionUpdated,
}) => {
  const schoolId = session.schoolId || 'dominion-group';
  const isAdmin = session.role === 'admin';

  const [users, setUsers] = useState<Record<UserRole, SystemUserAccount>>(() => getStoredSystemUsers(schoolId));
  const [activeEditingRole, setActiveEditingRole] = useState<UserRole>('admin');

  // Form states for Admin
  const [adminUsername, setAdminUsername] = useState(users.admin.username);
  const [adminPassword, setAdminPassword] = useState(users.admin.password);
  const [adminFullName, setAdminFullName] = useState(users.admin.fullName);
  const [adminTitle, setAdminTitle] = useState(users.admin.title);
  const [showAdminPassword, setShowAdminPassword] = useState(false);

  // Form states for Bursar
  const [bursarUsername, setBursarUsername] = useState(users.bursar.username);
  const [bursarPassword, setBursarPassword] = useState(users.bursar.password);
  const [bursarFullName, setBursarFullName] = useState(users.bursar.fullName);
  const [bursarTitle, setBursarTitle] = useState(users.bursar.title);
  const [showBursarPassword, setShowBursarPassword] = useState(false);

  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Fetch from Firestore on mount
  useEffect(() => {
    if (!isAdmin) return;
    fetchSystemUsersFromFirestore(schoolId).then((cloudUsers) => {
      setUsers(cloudUsers);
      setAdminUsername(cloudUsers.admin.username);
      setAdminPassword(cloudUsers.admin.password);
      setAdminFullName(cloudUsers.admin.fullName);
      setAdminTitle(cloudUsers.admin.title);

      setBursarUsername(cloudUsers.bursar.username);
      setBursarPassword(cloudUsers.bursar.password);
      setBursarFullName(cloudUsers.bursar.fullName);
      setBursarTitle(cloudUsers.bursar.title);
    });
  }, [schoolId, isAdmin]);

  if (!isAdmin) {
    return (
      <div className="p-8 rounded-3xl bg-white border border-slate-200 text-center space-y-4 max-w-lg mx-auto shadow-xs my-6">
        <div className="w-12 h-12 rounded-2xl bg-purple-50 text-purple-700 flex items-center justify-center mx-auto border border-purple-200">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <div className="space-y-2">
          <span className="inline-block px-3 py-1 rounded-full bg-purple-100 text-purple-800 text-[10px] font-black uppercase tracking-wider">
            Administrator Power Required
          </span>
          <h3 className="text-base font-bold text-slate-900">User Credentials & Security</h3>
          <p className="text-xs text-slate-600 leading-relaxed max-w-md mx-auto">
            Only the <strong>School Administrator (Proprietor)</strong> has authorization to view login details, manage user accounts, or change passwords. Bursars do not have access to credential details or password management.
          </p>
        </div>
      </div>
    );
  }

  const handleRefresh = async () => {
    setIsSyncing(true);
    try {
      const cloudUsers = await fetchSystemUsersFromFirestore(schoolId);
      setUsers(cloudUsers);
      setAdminUsername(cloudUsers.admin.username);
      setAdminPassword(cloudUsers.admin.password);
      setAdminFullName(cloudUsers.admin.fullName);
      setAdminTitle(cloudUsers.admin.title);

      setBursarUsername(cloudUsers.bursar.username);
      setBursarPassword(cloudUsers.bursar.password);
      setBursarFullName(cloudUsers.bursar.fullName);
      setBursarTitle(cloudUsers.bursar.title);

      setSuccessMessage('Synced accounts with cloud database!');
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch {
      setErrorMessage('Failed to sync from cloud.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleSaveAdminCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!isAdmin) {
      setErrorMessage('Only School Administrator can change system account credentials.');
      return;
    }

    setIsSaving(true);
    try {
      const res = await updateSystemAccount(
        'admin',
        {
          username: adminUsername,
          password: adminPassword,
          fullName: adminFullName,
          title: adminTitle,
        },
        session.bursarName || 'Admin',
        schoolId
      );

      if (!res.success) {
        setErrorMessage(res.message || 'Failed to update admin account.');
        return;
      }

      setUsers(res.updatedUsers);
      setSuccessMessage('Admin credentials updated & synced successfully!');

      if (session.role === 'admin' && onSessionUpdated) {
        onSessionUpdated({
          ...session,
          bursarName: adminFullName,
          username: adminUsername,
          userTitle: adminTitle,
        });
      }

      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error updating credentials.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveBursarCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!isAdmin) {
      setErrorMessage('Only School Administrator can change Bursar credentials.');
      return;
    }

    setIsSaving(true);
    try {
      const res = await updateSystemAccount(
        'bursar',
        {
          username: bursarUsername,
          password: bursarPassword,
          fullName: bursarFullName,
          title: bursarTitle,
        },
        session.bursarName || 'Admin',
        schoolId
      );

      if (!res.success) {
        setErrorMessage(res.message || 'Failed to update bursar account.');
        return;
      }

      setUsers(res.updatedUsers);
      setSuccessMessage('Bursar credentials updated & synced successfully!');

      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error updating credentials.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="p-5 rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white border border-slate-800 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 text-[10px] font-black uppercase tracking-wider border border-indigo-400/30">
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Role-Based Access Control (RBAC)</span>
            </div>
            <h2 className="text-base sm:text-lg font-black text-white tracking-tight">
              User Credential & Security Management
            </h2>
            <p className="text-xs text-slate-300 leading-relaxed max-w-xl">
              Manage login usernames, passwords, and officer titles for the two authorized system roles: <strong>School Administrator</strong> and <strong>School Bursar</strong>.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center">
            <button
              type="button"
              onClick={handleRefresh}
              disabled={isSyncing}
              className="px-3.5 py-2 rounded-2xl bg-white/10 hover:bg-white/20 active:scale-95 text-white text-xs font-bold flex items-center gap-2 transition-all border border-white/10 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Syncing...' : 'Sync Cloud Accounts'}</span>
            </button>
          </div>
        </div>

        {/* User Role Overview Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5 pt-4 border-t border-slate-800">
          <div 
            onClick={() => setActiveEditingRole('admin')}
            className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
              activeEditingRole === 'admin'
                ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-md'
                : 'bg-slate-800/60 border-slate-700/80 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-purple-500/20 text-purple-300 flex items-center justify-center font-black text-xs border border-purple-400/30">
                  👑
                </div>
                <div>
                  <div className="text-xs font-black text-white">Administrator (Proprietor)</div>
                  <div className="text-[10px] text-slate-400 font-mono">@{users.admin.username}</div>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-400/30">
                Full Control
              </span>
            </div>
          </div>

          <div 
            onClick={() => setActiveEditingRole('bursar')}
            className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${
              activeEditingRole === 'bursar'
                ? 'bg-blue-600/20 border-blue-500 text-white shadow-md'
                : 'bg-slate-800/60 border-slate-700/80 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-300 flex items-center justify-center font-black text-xs border border-blue-400/30">
                  💼
                </div>
                <div>
                  <div className="text-xs font-black text-white">School Bursar</div>
                  <div className="text-[10px] text-slate-400 font-mono">@{users.bursar.username}</div>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-blue-500/20 text-blue-300 border border-blue-400/30">
                Approval Required
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Security notice if non-admin */}
      {!isAdmin && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs space-y-1">
            <h4 className="font-bold">Restricted View (Bursar Session)</h4>
            <p className="text-amber-800 font-medium">
              You are currently logged in as Bursar. System credentials and security configurations can only be modified by the School Administrator.
            </p>
          </div>
        </div>
      )}

      {/* Toast Messages */}
      {successMessage && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold flex items-center gap-2.5 shadow-sm animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold flex items-center gap-2.5 shadow-sm animate-in fade-in">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Role Editor Forms Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/* 1. Admin Account Card */}
        <div className={`bg-white border rounded-3xl p-5 sm:p-6 shadow-sm space-y-5 transition-all ${
          activeEditingRole === 'admin' ? 'border-purple-300 ring-2 ring-purple-500/10' : 'border-slate-200'
        }`}>
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold text-base border border-purple-200">
                👑
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">
                  Admin Credentials
                </h3>
                <p className="text-[11px] text-slate-500 font-medium">
                  Proprietor / Principal Master Account
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-xl bg-purple-100 text-purple-800 text-[10px] font-black uppercase">
              Role: Admin
            </span>
          </div>

          <form onSubmit={handleSaveAdminCredentials} className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                Admin Full Name
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  disabled={!isAdmin || isSaving}
                  value={adminFullName}
                  onChange={(e) => setAdminFullName(e.target.value)}
                  placeholder="e.g. School Administrator (Proprietor)"
                  className="w-full pl-10 pr-3.5 py-2.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-2xl text-slate-900 focus:bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 focus:outline-none disabled:opacity-60"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                Admin Username (Login ID)
              </label>
              <div className="relative">
                <span className="text-slate-400 font-mono text-xs absolute left-3.5 top-1/2 -translate-y-1/2 font-bold">@</span>
                <input
                  type="text"
                  required
                  disabled={!isAdmin || isSaving}
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                  placeholder="admin"
                  className="w-full pl-9 pr-3.5 py-2.5 text-xs font-mono font-bold bg-slate-50 border border-slate-200 rounded-2xl text-slate-900 focus:bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 focus:outline-none disabled:opacity-60"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                Admin Password / Passcode
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showAdminPassword ? 'text' : 'password'}
                  required
                  disabled={!isAdmin || isSaving}
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-2.5 text-xs font-mono font-bold bg-slate-50 border border-slate-200 rounded-2xl text-slate-900 focus:bg-white focus:border-purple-500 focus:ring-2 focus:ring-purple-500/20 focus:outline-none disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => setShowAdminPassword(!showAdminPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                >
                  {showAdminPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Minimum 3 characters</p>
            </div>

            {isAdmin && (
              <button
                type="submit"
                disabled={isSaving}
                className="w-full py-2.5 px-4 rounded-2xl bg-purple-700 hover:bg-purple-800 active:scale-[0.99] text-white font-bold text-xs tracking-wide transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{isSaving ? 'Saving Changes...' : 'Update Admin Credentials'}</span>
              </button>
            )}
          </form>
        </div>

        {/* 2. Bursar Account Card */}
        <div className={`bg-white border rounded-3xl p-5 sm:p-6 shadow-sm space-y-5 transition-all ${
          activeEditingRole === 'bursar' ? 'border-blue-300 ring-2 ring-blue-500/10' : 'border-slate-200'
        }`}>
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-base border border-blue-200">
                💼
              </div>
              <div>
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">
                  Bursar Credentials
                </h3>
                <p className="text-[11px] text-slate-500 font-medium">
                  Officer Data Entry & Collections Account
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-xl bg-blue-100 text-blue-800 text-[10px] font-black uppercase">
              Role: Bursar
            </span>
          </div>

          <form onSubmit={handleSaveBursarCredentials} className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                Bursar Full Name
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  disabled={!isAdmin || isSaving}
                  value={bursarFullName}
                  onChange={(e) => setBursarFullName(e.target.value)}
                  placeholder="e.g. Chief School Bursar"
                  className="w-full pl-10 pr-3.5 py-2.5 text-xs font-semibold bg-slate-50 border border-slate-200 rounded-2xl text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none disabled:opacity-60"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                Bursar Username (Login ID)
              </label>
              <div className="relative">
                <span className="text-slate-400 font-mono text-xs absolute left-3.5 top-1/2 -translate-y-1/2 font-bold">@</span>
                <input
                  type="text"
                  required
                  disabled={!isAdmin || isSaving}
                  value={bursarUsername}
                  onChange={(e) => setBursarUsername(e.target.value.toLowerCase().replace(/\s+/g, ''))}
                  placeholder="bursar"
                  className="w-full pl-9 pr-3.5 py-2.5 text-xs font-mono font-bold bg-slate-50 border border-slate-200 rounded-2xl text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none disabled:opacity-60"
                />
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                Bursar Password / Passcode
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type={showBursarPassword ? 'text' : 'password'}
                  required
                  disabled={!isAdmin || isSaving}
                  value={bursarPassword}
                  onChange={(e) => setBursarPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-10 py-2.5 text-xs font-mono font-bold bg-slate-50 border border-slate-200 rounded-2xl text-slate-900 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 focus:outline-none disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => setShowBursarPassword(!showBursarPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
                >
                  {showBursarPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Managed & updated directly by Admin</p>
            </div>

            {isAdmin && (
              <button
                type="submit"
                disabled={isSaving}
                className="w-full py-2.5 px-4 rounded-2xl bg-blue-600 hover:bg-blue-700 active:scale-[0.99] text-white font-bold text-xs tracking-wide transition-all flex items-center justify-center gap-2 shadow-sm cursor-pointer disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{isSaving ? 'Saving Changes...' : 'Update Bursar Credentials'}</span>
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
};
