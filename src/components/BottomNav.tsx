/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { HandCoins, MoreHorizontal, TrendingUp, UserPlus, Users, WalletCards } from 'lucide-react';
import { TabType } from '../types';

export type { TabType };

interface BottomNavProps {
  activeTab: TabType;
  onTabChange: (tab: TabType) => void;
  studentCount: number;
  pendingRemittanceCount?: number;
}

const secondaryTabs: { id: TabType; label: string; icon: typeof UserPlus }[] = [
  { id: 'payroll', label: 'Payroll', icon: WalletCards },
  { id: 'analytics', label: 'Analytics', icon: TrendingUp },
];

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onTabChange,
  studentCount,
  pendingRemittanceCount = 0,
}) => {
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const primaryTabs: { id: TabType; label: string; icon: typeof Users }[] = [
    { id: 'students', label: 'Students', icon: Users },
    { id: 'record_payment', label: 'Payments', icon: TrendingUp },
    { id: 'collection', label: 'Collection', icon: HandCoins },
  ];
  const isSecondaryTab = secondaryTabs.some((tab) => tab.id === activeTab);

  useEffect(() => {
    setIsMoreOpen(false);
  }, [activeTab]);

  const selectTab = (tab: TabType) => {
    onTabChange(tab);
    setIsMoreOpen(false);
  };

  return (
    <nav
      aria-label="Main navigation"
      className="relative z-50 shrink-0 border-t border-slate-200 bg-white px-3 pt-1.5 pb-[max(0.6rem,env(safe-area-inset-bottom))] shadow-[0_-4px_20px_rgba(0,0,0,0.06)]"
      onKeyDown={(event) => {
        if (event.key === 'Escape') setIsMoreOpen(false);
      }}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsMoreOpen(false);
      }}
    >
      <div id="more-sections" hidden={!isMoreOpen} className="absolute bottom-[calc(100%+0.5rem)] right-2 z-50 w-52 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl" aria-label="More sections">
          {secondaryTabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => selectTab(id)}
              aria-current={activeTab === id ? 'page' : undefined}
              className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors ${activeTab === id ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {label}
            </button>
          ))}
      </div>
      <div className="flex items-center justify-around gap-1">
        {primaryTabs.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => selectTab(id)}
              aria-current={active ? 'page' : undefined}
              className={`flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl py-1 text-[11px] font-bold transition-colors ${active ? 'text-slate-950' : 'text-slate-500 hover:text-slate-900'}`}
            >
              <span className={`relative rounded-xl p-1.5 ${active ? 'bg-slate-900 text-white' : ''}`}>
                <Icon className="h-5 w-5" aria-hidden="true" />
                {id === 'students' && studentCount > 0 && <span className="absolute -right-2 -top-1 rounded-full border border-white bg-slate-100 px-1 text-[9px] leading-4 text-slate-700">{studentCount}</span>}
                {id === 'collection' && pendingRemittanceCount > 0 && <span className="absolute -right-2 -top-1 rounded-full border border-white bg-amber-500 px-1.5 text-[9px] leading-4 text-white" aria-label={`${pendingRemittanceCount} pending remittances`}>{pendingRemittanceCount}</span>}
              </span>
              <span className="truncate">{label}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setIsMoreOpen((open) => !open)}
          aria-expanded={isMoreOpen}
          aria-controls="more-sections"
          aria-label={isMoreOpen ? 'Close more sections' : 'More sections'}
          className={`flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl py-1 text-[11px] font-bold transition-colors ${isMoreOpen || isSecondaryTab ? 'text-slate-950' : 'text-slate-500 hover:text-slate-900'}`}
        >
          <span className={`rounded-xl p-1.5 ${isMoreOpen || isSecondaryTab ? 'bg-slate-900 text-white' : ''}`}><MoreHorizontal className="h-5 w-5" aria-hidden="true" /></span>
          <span>{isSecondaryTab ? secondaryTabs.find((tab) => tab.id === activeTab)?.label : 'More'}</span>
        </button>
      </div>
    </nav>
  );
};
