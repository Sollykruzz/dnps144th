/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AcademicTermSchedule } from '../types';
import { safeStorage } from './storage';
import { formatMonthLabel } from './payrollService';
import { getCurrentAcademicSession, getTodayDateString } from './calculations';

const STORAGE_TERM_SCHEDULE_PREFIX = 'bursar_academic_term_schedule';

export const DEFAULT_TERM_SCHEDULES: Record<string, AcademicTermSchedule> = {
  'First Term': {
    term: 'First Term',
    session: '2026/2027',
    termStartDate: '2026-09-01',
    termEndDate: '2026-12-15',
    salaryDueDay: 25,
    feeCollectionStartDate: '2026-09-01',
    feeDueDate: '2026-10-20',
    monthsInTerm: ['2026-09', '2026-10', '2026-11', '2026-12'],
  },
  'Second Term': {
    term: 'Second Term',
    session: '2026/2027',
    termStartDate: '2027-01-05',
    termEndDate: '2027-04-10',
    salaryDueDay: 25,
    feeCollectionStartDate: '2027-01-05',
    feeDueDate: '2027-02-15',
    monthsInTerm: ['2027-01', '2027-02', '2027-03', '2027-04'],
  },
  'Third Term': {
    term: 'Third Term',
    session: '2026/2027',
    termStartDate: '2027-04-26',
    termEndDate: '2027-07-20',
    salaryDueDay: 25,
    feeCollectionStartDate: '2027-04-26',
    feeDueDate: '2027-05-25',
    monthsInTerm: ['2027-05', '2027-06', '2027-07'],
  },
};

/**
 * Calculates array of YYYY-MM between two dates inclusive
 */
export function deriveMonthsBetweenDates(startDateStr: string, endDateStr: string): string[] {
  if (!startDateStr || !endDateStr) return [];
  const start = new Date(startDateStr);
  const end = new Date(endDateStr);

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
    return [];
  }

  const months: string[] = [];
  const current = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);

  while (current <= last) {
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    months.push(`${y}-${m}`);
    current.setMonth(current.getMonth() + 1);
  }

  return months;
}

/**
 * Get term schedule from storage or fallback
 */
export function getStoredTermSchedule(
  term: string = 'First Term',
  session: string = getCurrentAcademicSession(),
  schoolId: string = 'dominion-group'
): AcademicTermSchedule {
  try {
    const key = `${STORAGE_TERM_SCHEDULE_PREFIX}_${schoolId}_${term.replace(/\s+/g, '_')}`;
    const raw = safeStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.termStartDate && parsed.termEndDate) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn(`[Schedule Storage Note] Error loading schedule for '${term}':`, e);
  }

  const fallback = DEFAULT_TERM_SCHEDULES[term] || {
    term,
    session,
    termStartDate: '2026-09-01',
    termEndDate: '2026-12-15',
    salaryDueDay: 25,
    feeCollectionStartDate: '2026-09-01',
    feeDueDate: '2026-10-20',
    monthsInTerm: ['2026-09', '2026-10', '2026-11', '2026-12'],
  };

  return fallback;
}

/**
 * Save term schedule to storage
 */
export function saveStoredTermSchedule(
  schedule: AcademicTermSchedule,
  schoolId: string = 'dominion-group'
): void {
  try {
    const key = `${STORAGE_TERM_SCHEDULE_PREFIX}_${schoolId}_${schedule.term.replace(/\s+/g, '_')}`;
    safeStorage.setItem(key, JSON.stringify(schedule));
  } catch (e) {
    console.warn(`[Schedule Storage Note] Error saving schedule:`, e);
  }
}

/**
 * Computes payment due date status for a specific month
 */
export function getMonthlyPaymentDueStatus(
  monthStr: string,
  salaryDueDay: number = 25
): {
  dueDate: string; // YYYY-MM-DD
  isOverdue: boolean;
  isDueSoon: boolean;
  isDueToday: boolean;
  daysRemaining: number;
  statusLabel: string;
} {
  const [yearStr, monthNumStr] = monthStr.split('-');
  const y = parseInt(yearStr, 10);
  const m = parseInt(monthNumStr, 10);

  // Due date e.g. 2026-09-25
  const dueDay = Math.min(salaryDueDay, 28);
  const due = new Date(y, m - 1, dueDay, 23, 59, 59);
  const dueDateStr = `${y}-${String(m).padStart(2, '0')}-${String(dueDay).padStart(2, '0')}`;

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const diffTime = due.getTime() - now.getTime();
  const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  const isDueToday = daysRemaining === 0;
  const isOverdue = daysRemaining < 0;
  const isDueSoon = daysRemaining > 0 && daysRemaining <= 5;

  let statusLabel = `Due on ${dueDay}th`;
  if (isDueToday) {
    statusLabel = 'Payment Due Today!';
  } else if (isOverdue) {
    statusLabel = `Overdue by ${Math.abs(daysRemaining)} day${Math.abs(daysRemaining) === 1 ? '' : 's'}`;
  } else if (isDueSoon) {
    statusLabel = `Due in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`;
  }

  return {
    dueDate: dueDateStr,
    isOverdue,
    isDueSoon,
    isDueToday,
    daysRemaining,
    statusLabel,
  };
}

/**
 * Computes fee collection status based on term start and due dates
 */
export function getFeeCollectionTimelineStatus(schedule: AcademicTermSchedule): {
  hasStarted: boolean;
  isPastDue: boolean;
  statusText: string;
} {
  const now = new Date();
  const start = new Date(schedule.feeCollectionStartDate);
  const due = new Date(schedule.feeDueDate);

  const hasStarted = now >= start;
  const isPastDue = now > due;

  let statusText = `Collection starts on ${schedule.feeCollectionStartDate}`;
  if (hasStarted && !isPastDue) {
    statusText = `Collection active • Due by ${schedule.feeDueDate}`;
  } else if (isPastDue) {
    statusText = `Past fee due date (${schedule.feeDueDate})`;
  }

  return {
    hasStarted,
    isPastDue,
    statusText,
  };
}

/**
 * The term the school is in today, from the saved term schedules (Lagos date).
 * Between terms it returns the term that ended last, or First Term before the session starts.
 */
export function getCurrentTermName(schoolId: string = 'dominion-group'): string {
  const today = getTodayDateString();
  const names = ['First Term', 'Second Term', 'Third Term'];
  let lastStarted = '';
  for (const name of names) {
    const sch = getStoredTermSchedule(name, getCurrentAcademicSession(), schoolId);
    if (today >= sch.termStartDate && today <= sch.termEndDate) return name;
    if (today >= sch.termStartDate) lastStarted = name;
  }
  return lastStarted || 'First Term';
}
