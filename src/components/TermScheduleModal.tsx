/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Calendar,
  Clock,
  CheckCircle2,
  X,
  AlertCircle,
  Save,
  DollarSign,
  Users,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import { AcademicTermSchedule, SchoolProfile, BursarSession } from '../types';
import {
  getStoredTermSchedule,
  saveStoredTermSchedule,
  deriveMonthsBetweenDates,
  getMonthlyPaymentDueStatus,
  getFeeCollectionTimelineStatus,
  DEFAULT_TERM_SCHEDULES,
} from '../services/termScheduleService';
import { formatMonthLabel } from '../services/payrollService';
import { getCurrentAcademicSession } from '../services/calculations';

interface TermScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: BursarSession;
  activeSchool?: SchoolProfile;
  selectedTerm: string;
  onSelectTerm?: (term: string) => void;
  onScheduleUpdated?: (schedule: AcademicTermSchedule) => void;
}

export const TermScheduleModal: React.FC<TermScheduleModalProps> = ({
  isOpen,
  onClose,
  session,
  activeSchool,
  selectedTerm: initialTerm,
  onSelectTerm,
  onScheduleUpdated,
}) => {
  const schoolId = activeSchool?.id || session.schoolId || 'dominion-group';
  const [currentTerm, setCurrentTerm] = useState<string>(initialTerm || 'First Term');
  const [sessionName, setSessionName] = useState<string>(session.schoolName || getCurrentAcademicSession());

  const [schedule, setSchedule] = useState<AcademicTermSchedule>(() =>
    getStoredTermSchedule(initialTerm || 'First Term', session.schoolName, schoolId)
  );

  const [termStartDate, setTermStartDate] = useState(schedule.termStartDate);
  const [termEndDate, setTermEndDate] = useState(schedule.termEndDate);
  const [salaryDueDay, setSalaryDueDay] = useState(schedule.salaryDueDay || 25);
  const [feeCollectionStartDate, setFeeCollectionStartDate] = useState(schedule.feeCollectionStartDate);
  const [feeDueDate, setFeeDueDate] = useState(schedule.feeDueDate);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync state when term changes or modal opens
  useEffect(() => {
    if (isOpen) {
      const sch = getStoredTermSchedule(currentTerm, session.schoolName, schoolId);
      setSchedule(sch);
      setTermStartDate(sch.termStartDate);
      setTermEndDate(sch.termEndDate);
      setSalaryDueDay(sch.salaryDueDay || 25);
      setFeeCollectionStartDate(sch.feeCollectionStartDate);
      setFeeDueDate(sch.feeDueDate);
      setSaveSuccess(false);
      setErrorMessage(null);
    }
  }, [isOpen, currentTerm, session.schoolName, schoolId]);

  // Derived months from start and end dates
  const derivedMonths = useMemo(() => {
    return deriveMonthsBetweenDates(termStartDate, termEndDate);
  }, [termStartDate, termEndDate]);

  // Collection and payment timeline preview
  const timelinePreview = useMemo(() => {
    const tempSchedule: AcademicTermSchedule = {
      term: currentTerm,
      session: sessionName,
      termStartDate,
      termEndDate,
      salaryDueDay: Number(salaryDueDay) || 25,
      feeCollectionStartDate,
      feeDueDate,
      monthsInTerm: derivedMonths,
    };
    return getFeeCollectionTimelineStatus(tempSchedule);
  }, [currentTerm, sessionName, termStartDate, termEndDate, salaryDueDay, feeCollectionStartDate, feeDueDate, derivedMonths]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!termStartDate || !termEndDate) {
      setErrorMessage('Please provide both Term Start Date and Term End Date.');
      return;
    }

    if (new Date(termStartDate) > new Date(termEndDate)) {
      setErrorMessage('Term Start Date cannot be later than Term End Date.');
      return;
    }

    if (!feeCollectionStartDate || !feeDueDate) {
      setErrorMessage('Please provide Fee Collection Start Date and Due Date.');
      return;
    }

    const updatedSchedule: AcademicTermSchedule = {
      term: currentTerm,
      session: sessionName,
      termStartDate,
      termEndDate,
      salaryDueDay: Math.min(28, Math.max(1, Number(salaryDueDay) || 25)),
      feeCollectionStartDate,
      feeDueDate,
      monthsInTerm: derivedMonths.length > 0 ? derivedMonths : ['2026-09', '2026-10', '2026-11'],
      updatedAt: new Date().toISOString(),
    };

    saveStoredTermSchedule(updatedSchedule, schoolId);
    setSchedule(updatedSchedule);
    setSaveSuccess(true);

    if (onScheduleUpdated) {
      onScheduleUpdated(updatedSchedule);
    }
    if (onSelectTerm) {
      onSelectTerm(currentTerm);
    }

    setTimeout(() => {
      setSaveSuccess(false);
      onClose();
    }, 900);
  };

  const handleTermTabChange = (t: string) => {
    setCurrentTerm(t);
    const sch = getStoredTermSchedule(t, session.schoolName, schoolId);
    setSchedule(sch);
    setTermStartDate(sch.termStartDate);
    setTermEndDate(sch.termEndDate);
    setSalaryDueDay(sch.salaryDueDay || 25);
    setFeeCollectionStartDate(sch.feeCollectionStartDate);
    setFeeDueDate(sch.feeDueDate);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl w-full max-w-xl max-h-[92dvh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-auto">
        {/* Modal Top Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-white">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center">
              <Calendar className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Term Duration & Payment Schedule
              </h3>
              <p className="text-[11px] text-slate-500 font-medium">
                Set term duration, salary due dates, and fee collection timeline
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content Form */}
        <form onSubmit={handleSave} className="p-5 overflow-y-auto space-y-4">
          {/* Term Switcher Pills */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl">
            {['First Term', 'Second Term', 'Third Term'].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => handleTermTabChange(t)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  currentTerm === t
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {saveSuccess && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-700 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>Term schedule and payment duration updated successfully!</span>
            </div>
          )}

          {/* Section 1: Academic Term Duration */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
            <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-indigo-600" />
              <span>1. Term Academic Duration</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                  Term Begins (Start Date) *
                </label>
                <input
                  type="date"
                  required
                  id="term-start-date-input"
                  value={termStartDate}
                  onChange={(e) => setTermStartDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                  Term Ends (End Date) *
                </label>
                <input
                  type="date"
                  required
                  id="term-end-date-input"
                  value={termEndDate}
                  onChange={(e) => setTermEndDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Derived Months Display */}
            <div>
              <span className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                Active Months for this Term ({derivedMonths.length} Months):
              </span>
              <div className="flex flex-wrap gap-1.5">
                {derivedMonths.map((m) => (
                  <span
                    key={m}
                    className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] font-bold font-mono"
                  >
                    {formatMonthLabel(m)}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Section 2: Staff Salary Monthly Payment Due Date */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
            <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
              <span>2. Staff Salary Payment Due Day</span>
            </h4>

            <div>
              <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                Monthly Salary Payment Due Day of Month *
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="1"
                  max="28"
                  required
                  id="salary-due-day-input"
                  value={salaryDueDay}
                  onChange={(e) => setSalaryDueDay(Number(e.target.value))}
                  className="w-24 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-black text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none text-center"
                />
                <span className="text-xs text-slate-600 font-medium">
                  e.g. <strong>{salaryDueDay}th</strong> of every month (Salaries will be flagged due on this date)
                </span>
              </div>
            </div>
          </div>

          {/* Section 3: Student Fee Collection Timeline */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
            <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-blue-600" />
              <span>3. Student Fee Collection Timeline</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                  Collection Starts On *
                </label>
                <input
                  type="date"
                  required
                  id="fee-collection-start-date-input"
                  value={feeCollectionStartDate}
                  onChange={(e) => setFeeCollectionStartDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                  School Fee Due Date *
                </label>
                <input
                  type="date"
                  required
                  id="fee-due-date-input"
                  value={feeDueDate}
                  onChange={(e) => setFeeDueDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Live Collection Status Pill */}
            <div className="p-2.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between text-xs">
              <span className="text-slate-600 font-medium">Status Preview:</span>
              <span className="font-semibold text-slate-900">
                {timelinePreview.statusText}
              </span>
            </div>
          </div>

          {/* Action Footer */}
          <div className="pt-2 border-t border-slate-200 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              id="save-term-schedule-btn"
              className="px-5 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl shadow-xs transition-all cursor-pointer flex items-center gap-1.5"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Save Term Schedule</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
