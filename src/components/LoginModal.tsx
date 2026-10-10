/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  ArrowRight, 
  Lock, 
  User, 
  Eye, 
  EyeOff, 
  Building2,
  AlertCircle
} from 'lucide-react';
import { BursarSession, SchoolProfile } from '../types';
import { DGOSLogo } from './DGOSLogo';
import { getCurrentFirebaseUser, subscribeAuthState } from '../services/firebase';
import { getStoredBranding, subscribeBranding, syncBrandingFromCloud, AppBrandingConfig } from '../services/brandingService';
import { 
  authenticateCredentials, 
  getStoredSystemUsers, 
  fetchSystemUsersFromFirestore, 
  UserRole, 
  SystemUserAccount 
} from '../services/userAccountService';

interface LoginModalProps {
  session: BursarSession;
  schools?: SchoolProfile[];
  activeSchool?: SchoolProfile;
  onSelectSchool?: (schoolId: string) => void;
  onLogin: (sessionUpdates: { bursarName: string; username?: string; role: 'admin' | 'bursar'; userTitle?: string }) => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ 
  session, 
  schools = [], 
  activeSchool, 
  onSelectSchool, 
  onLogin 
}) => {
  const [branding, setBranding] = useState<AppBrandingConfig>(() =>
    getStoredBranding(activeSchool?.id || session.schoolId || 'dominion-group')
  );
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [selectedSchoolId, setSelectedSchoolId] = useState(activeSchool?.id || session.schoolId || 'dominion-group');
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [, setFirebaseUser] = useState(getCurrentFirebaseUser());
  const [, setSystemUsers] = useState<Record<UserRole, SystemUserAccount>>(() => getStoredSystemUsers(selectedSchoolId));

  useEffect(() => {
    setBranding(getStoredBranding(selectedSchoolId));

    const unsubBranding = subscribeBranding((updated) => setBranding(updated));
    const unsubAuth = subscribeAuthState((u) => {
      setFirebaseUser(u);
    });

    fetchSystemUsersFromFirestore(selectedSchoolId).then((users) => {
      setSystemUsers(users);
    });

    syncBrandingFromCloud(selectedSchoolId).catch((err) => {
      console.warn('[LoginModal] Branding cloud sync note:', err);
    });

    return () => {
      unsubBranding();
      unsubAuth();
    };
  }, [selectedSchoolId]);

  const currentSchool = schools.find((s) => s.id === selectedSchoolId) || activeSchool || {
    id: 'dominion-group',
    name: branding.appName || session.schoolName || 'Dominion Group Of Schools',
    currencySymbol: branding.currencySymbol || session.currencySymbol || '₦',
    motto: branding.tagline || 'Knowledge and achievements',
  };

  const handleSchoolChange = (schoolId: string) => {
    setSelectedSchoolId(schoolId);
    if (onSelectSchool) {
      onSelectSchool(schoolId);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedUser = username.trim();
    const trimmedPass = password.trim();

    if (!trimmedUser || !trimmedPass) {
      setError('Please enter both your username and password.');
      return;
    }

    setIsAuthenticating(true);
    try {
      const result = await authenticateCredentials(trimmedUser, trimmedPass, selectedSchoolId);
      if (!result.success || !result.user) {
        setError(result.error || 'Invalid username or password. Please contact the administrator.');
        setIsAuthenticating(false);
        return;
      }

      const user = result.user;
      onLogin({
        bursarName: user.fullName,
        username: user.username,
        role: user.role,
        userTitle: user.title,
      });
    } catch (err: any) {
      setError(err?.message || 'Login error occurred. Please try again.');
    } finally {
      setIsAuthenticating(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-slate-100 text-slate-800 flex flex-col justify-center items-center p-4 sm:p-6 selection:bg-slate-900 selection:text-white">
      <div className="w-full max-w-sm my-auto space-y-4">
        
        {/* Main Clean Card */}
        <div className="bg-white border border-slate-200/90 rounded-2xl p-6 sm:p-8 shadow-xs space-y-5">
          
          {/* Logo & School Header */}
          <div className="flex flex-col items-center text-center space-y-2.5">
            <DGOSLogo size="lg" />
            <div className="space-y-1">
              <span className="text-[11px] font-semibold text-slate-500 tracking-wide uppercase">
                Financial Management System
              </span>
              <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                {currentSchool.name}
              </h1>
              {currentSchool.motto && (
                <p className="text-xs text-slate-500 font-normal">
                  {currentSchool.motto}
                </p>
              )}
            </div>
          </div>

          {/* School Switcher (if multiple schools exist) */}
          {schools.length > 1 && (
            <div className="p-2 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <Building2 className="w-3 h-3 text-slate-600" />
                <span>School Branch</span>
              </label>
              <select
                value={selectedSchoolId}
                onChange={(e) => handleSchoolChange(e.target.value)}
                className="w-full bg-white text-slate-800 text-xs font-medium rounded-lg px-2.5 py-1.5 border border-slate-200 focus:outline-none focus:ring-1 focus:ring-slate-400 cursor-pointer"
              >
                {schools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.currencySymbol || '₦'})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Clean Login Form */}
          <form onSubmit={handleSubmit} className="space-y-4 pt-1">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Username
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  required
                  autoFocus
                  id="system-login-username-input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter username"
                  className="w-full pl-9 pr-3 py-2.5 text-xs text-slate-900 bg-white rounded-xl border border-slate-200 focus:border-slate-400 focus:outline-none transition-colors placeholder:text-slate-400"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-700">
                  Password
                </label>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  id="system-login-password-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="w-full pl-9 pr-9 py-2.5 text-xs text-slate-900 bg-white rounded-xl border border-slate-200 focus:border-slate-400 focus:outline-none transition-colors placeholder:text-slate-400"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                <span className="leading-snug">{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isAuthenticating}
              id="system-login-submit-btn"
              className="w-full py-2.5 px-4 rounded-xl bg-slate-900 hover:bg-slate-800 active:bg-black text-white font-semibold text-xs tracking-wide transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-2"
            >
              <span>{isAuthenticating ? 'Signing in...' : 'Sign In'}</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </form>

          {/* Minimal subtle footer note */}
          <div className="pt-3 border-t border-slate-100 text-center">
            <p className="text-[11px] text-slate-500">
              Staff access only. Contact your administrator for credentials.
            </p>
          </div>

        </div>

      </div>
    </div>
  );
};
