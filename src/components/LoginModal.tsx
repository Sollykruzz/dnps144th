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
    <main className="grid min-h-full w-full overflow-y-auto bg-[#f5f7f8] text-slate-900 selection:bg-cyan-200 selection:text-slate-950 lg:min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative flex min-h-[155px] flex-col justify-between overflow-hidden bg-[#102d40] px-5 py-4 text-white sm:min-h-[220px] sm:px-10 sm:py-8 lg:min-h-screen lg:px-14 lg:py-12">
        <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-28 size-80 rounded-full border border-white/10" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-8 -top-16 size-56 rounded-full border border-white/10" />
        <div className="relative z-10 flex items-center gap-3">
          <DGOSLogo size="md" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold tracking-wide">{currentSchool.name}</p>
            <p className="mt-0.5 text-xs text-slate-300">School finance office</p>
          </div>
        </div>
        <div className="relative z-10 mt-4 max-w-xl sm:mt-8 lg:mb-12 lg:mt-auto">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-200">Staff portal</p>
          <h1 className="max-w-lg text-xl font-semibold leading-tight tracking-tight sm:text-3xl lg:text-5xl">
            Your school&apos;s finances, in good order.
          </h1>
          <p className="mt-3 hidden max-w-md text-sm leading-6 text-slate-300 sm:block lg:mt-5 lg:text-base">
            A clear, secure place to manage school fees, record payments, and support every student.
          </p>
          {currentSchool.motto && (
            <p className="mt-4 hidden border-l border-cyan-300/60 pl-3 text-sm italic text-slate-300 lg:block">
              {currentSchool.motto}
            </p>
          )}
        </div>
        <p className="relative z-10 mt-5 hidden text-xs text-slate-400 lg:block">Financial Management System</p>
      </section>

      <section className="flex min-h-[calc(100dvh-155px)] items-start justify-center px-5 py-5 sm:min-h-[calc(100dvh-220px)] sm:px-8 sm:py-10 lg:min-h-screen lg:items-center lg:px-12 lg:py-12">
        <div className="w-full max-w-md">
          <div className="mb-6 lg:mb-8">
            <p className="text-sm font-medium text-slate-500">Welcome back</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">Sign in to your account</h2>
            <p className="mt-2 text-sm leading-5 text-slate-500">Use your staff username and password to continue.</p>
          </div>

          {schools.length > 1 && (
            <div className="mb-5">
              <label htmlFor="system-login-school-select" className="mb-2 block text-sm font-medium text-slate-700">School branch</label>
              <div className="relative">
                <Building2 aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <select
                  id="system-login-school-select"
                  value={selectedSchoolId}
                  onChange={(e) => handleSchoolChange(e.target.value)}
                  className="h-12 w-full appearance-none rounded-xl border border-slate-300 bg-white pl-10 pr-4 text-sm font-medium text-slate-800 outline-none transition focus:border-cyan-700 focus:ring-4 focus:ring-cyan-700/10"
                >
                  {schools.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.currencySymbol || '₦'})</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-5">
            <div>
              <label htmlFor="system-login-username-input" className="mb-2 block text-sm font-medium text-slate-700">Username</label>
              <div className="relative">
                <User aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  required
                  autoFocus
                  autoComplete="username"
                  id="system-login-username-input"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  aria-invalid={Boolean(error)}
                  className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-4 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-cyan-700 focus:ring-4 focus:ring-cyan-700/10"
                />
              </div>
            </div>

            <div>
              <label htmlFor="system-login-password-input" className="mb-2 block text-sm font-medium text-slate-700">Password</label>
              <div className="relative">
                <Lock aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  id="system-login-password-input"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  aria-invalid={Boolean(error)}
                  className="h-12 w-full rounded-xl border border-slate-300 bg-white pl-10 pr-12 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-cyan-700 focus:ring-4 focus:ring-cyan-700/10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 inline-flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700"
                >
                  {showPassword ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">
                <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-rose-600" />
                <span className="leading-5">{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isAuthenticating}
              id="system-login-submit-btn"
              className="mt-1 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#12364b] px-5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#194b64] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-700/20 disabled:cursor-wait disabled:opacity-60"
            >
              <span>{isAuthenticating ? 'Signing in…' : 'Sign in'}</span>
              <ArrowRight aria-hidden="true" className="size-4" />
            </button>
          </form>

          <p className="mt-5 border-t border-slate-200 pt-4 text-center text-xs leading-5 text-slate-500 lg:mt-7 lg:pt-5">
            Staff access only. Contact your school administrator if you need help signing in.
          </p>
        </div>
      </section>
    </main>
  );
};
