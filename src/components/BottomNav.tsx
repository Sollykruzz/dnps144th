/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Users, CreditCard, UserPlus, TrendingUp, HandCoins, WalletCards } from 'lucide-react';
import { TabType } from '../types';

export type { TabType };

interface BottomNavProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  studentCount: number;
  pendingRemittanceCount?: number;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onTabChange,
  studentCount,
  pendingRemittanceCount = 0,
}) => {
  return (
    <nav className="shrink-0 z-50 border-t border-slate-200 flex items-center justify-around px-1 sm:px-4 md:px-8 bg-white pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-1.5 md:py-2.5 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] touch-manipulation select-none">
      {/* Tab 1: Students */}
      <button
        onClick={() => onTabChange('students')}
        id="nav-tab-students"
        className="flex flex-col items-center justify-center gap-0.5 md:gap-1 group cursor-pointer active:scale-95 transition-transform flex-1 min-w-0 py-1 min-h-[48px]"
      >
        <div
          className={`p-1.5 sm:p-2 md:p-2.5 rounded-xl transition-all relative ${
            activeTab === 'students'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-transparent text-slate-400 hover:text-slate-800'
          }`}
        >
          <Users className="w-4 h-4 md:w-5 md:h-5 shrink-0" />
          {studentCount > 0 && (
            <span
              className={`absolute -top-1 -right-1 text-[8px] md:text-[9px] font-bold px-1 py-0.2 rounded-full border border-white ${
                activeTab === 'students'
                  ? 'bg-slate-700 text-white'
                  : 'bg-slate-100 text-slate-600 border-slate-200'
              }`}
            >
              {studentCount}
            </span>
          )}
        </div>
        <span
          className={`text-[8px] sm:text-[9px] md:text-[11px] font-bold uppercase md:capitalize tracking-tight transition-colors truncate max-w-full leading-none ${
            activeTab === 'students' ? 'text-slate-900' : 'text-slate-400 group-hover:text-slate-800'
          }`}
        >
          Students
        </span>
      </button>

      {/* Tab 2: Record Payment */}
      <button
        onClick={() => onTabChange('record_payment')}
        id="nav-tab-record-payment"
        className="flex flex-col items-center justify-center gap-0.5 md:gap-1 group cursor-pointer active:scale-95 transition-transform flex-1 min-w-0 py-1 min-h-[48px]"
      >
        <div
          className={`p-1.5 sm:p-2 md:p-2.5 rounded-xl transition-all ${
            activeTab === 'record_payment'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-transparent text-slate-400 hover:text-slate-800'
          }`}
        >
          <CreditCard className="w-4 h-4 md:w-5 md:h-5 shrink-0" />
        </div>
        <span
          className={`text-[8px] sm:text-[9px] md:text-[11px] font-bold uppercase md:capitalize tracking-tight transition-colors truncate max-w-full leading-none ${
            activeTab === 'record_payment' ? 'text-slate-900' : 'text-slate-400 group-hover:text-slate-800'
          }`}
        >
          Record
        </span>
      </button>

      {/* Tab 3: New Admission */}
      <button
        onClick={() => onTabChange('admission')}
        id="nav-tab-admission"
        className="flex flex-col items-center justify-center gap-0.5 md:gap-1 group cursor-pointer active:scale-95 transition-transform flex-1 min-w-0 py-1 min-h-[48px]"
      >
        <div
          className={`p-1.5 sm:p-2 md:p-2.5 rounded-xl transition-all ${
            activeTab === 'admission'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-transparent text-slate-400 hover:text-slate-800'
          }`}
        >
          <UserPlus className="w-4 h-4 md:w-5 md:h-5 shrink-0" />
        </div>
        <span
          className={`text-[8px] sm:text-[9px] md:text-[11px] font-bold uppercase md:capitalize tracking-tight transition-colors truncate max-w-full leading-none ${
            activeTab === 'admission' ? 'text-slate-900' : 'text-slate-400 group-hover:text-slate-800'
          }`}
        >
          Admission
        </span>
      </button>

      {/* Tab 4: Staff Payroll */}
      <button
        onClick={() => onTabChange('payroll')}
        id="nav-tab-payroll"
        className="flex flex-col items-center justify-center gap-0.5 md:gap-1 group cursor-pointer active:scale-95 transition-transform flex-1 min-w-0 py-1 min-h-[48px]"
      >
        <div
          className={`p-1.5 sm:p-2 md:p-2.5 rounded-xl transition-all ${
            activeTab === 'payroll'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-transparent text-slate-400 hover:text-slate-800'
          }`}
        >
          <WalletCards className="w-4 h-4 md:w-5 md:h-5 shrink-0" />
        </div>
        <span
          className={`text-[8px] sm:text-[9px] md:text-[11px] font-bold uppercase md:capitalize tracking-tight transition-colors truncate max-w-full leading-none ${
            activeTab === 'payroll' ? 'text-slate-900' : 'text-slate-400 group-hover:text-slate-800'
          }`}
        >
          Payroll
        </span>
      </button>

      {/* Tab 5: Analytics */}
      <button
        onClick={() => onTabChange('analytics')}
        id="nav-tab-analytics"
        className="flex flex-col items-center justify-center gap-0.5 md:gap-1 group cursor-pointer active:scale-95 transition-transform flex-1 min-w-0 py-1 min-h-[48px]"
      >
        <div
          className={`p-1.5 sm:p-2 md:p-2.5 rounded-xl transition-all ${
            activeTab === 'analytics'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-transparent text-slate-400 hover:text-slate-800'
          }`}
        >
          <TrendingUp className="w-4 h-4 md:w-5 md:h-5 shrink-0" />
        </div>
        <span
          className={`text-[8px] sm:text-[9px] md:text-[11px] font-bold uppercase md:capitalize tracking-tight transition-colors truncate max-w-full leading-none ${
            activeTab === 'analytics' ? 'text-slate-900' : 'text-slate-400 group-hover:text-slate-800'
          }`}
        >
          Analytics
        </span>
      </button>

      {/* Tab 6: Collection & Remittance */}
      <button
        onClick={() => onTabChange('collection')}
        id="nav-tab-collection"
        className="flex flex-col items-center justify-center gap-0.5 md:gap-1 group cursor-pointer active:scale-95 transition-transform flex-1 min-w-0 py-1 min-h-[48px]"
      >
        <div
          className={`p-1.5 sm:p-2 md:p-2.5 rounded-xl transition-all relative ${
            activeTab === 'collection'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-transparent text-slate-400 hover:text-slate-800'
          }`}
        >
          <HandCoins className="w-4 h-4 md:w-5 md:h-5 shrink-0" />
          {pendingRemittanceCount > 0 && (
            <span
              className="absolute -top-1 -right-1 text-[8px] md:text-[9px] font-black px-1.5 py-0.2 rounded-full border border-white bg-amber-500 text-white shadow-xs animate-pulse"
              title={`${pendingRemittanceCount} pending remittance(s) awaiting approval`}
            >
              {pendingRemittanceCount}
            </span>
          )}
        </div>
        <span
          className={`text-[8px] sm:text-[9px] md:text-[11px] font-bold uppercase md:capitalize tracking-tight transition-colors truncate max-w-full leading-none ${
            activeTab === 'collection' ? 'text-slate-900' : 'text-slate-400 group-hover:text-slate-800'
          }`}
        >
          Collection
        </span>
      </button>
    </nav>
  );
};
