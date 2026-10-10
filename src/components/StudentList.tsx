/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState, useDeferredValue, useCallback, useEffect } from 'react';
import { 
  Search, 
  Filter, 
  X, 
  UserPlus, 
  UserCheck,
  AlertCircle, 
  RotateCw, 
  GraduationCap, 
  Layers, 
  CalendarRange,
  ChevronDown,
  BookOpen,
  Award,
  Wallet,
  ShieldCheck,
  ChevronRight,
  CopyCheck,
  Sparkles,
  Plus,
  PauseCircle,
  Shield,
  Laptop,
  Compass,
} from 'lucide-react';
import { StudentPaymentRecord, PaymentStatus, FilterState, SchoolFeeSchedule, SchoolProfile } from '../types';
import { StudentCard } from './StudentCard';
import { formatCurrency, sortClassesInAcademicOrder, deriveFeeBreakdown, getClassFeeSchedule, parseFinancialAmount } from '../services/calculations';
import { detectDuplicateGroups } from '../services/duplicateService';
import { isAdditionalFeeApplicable } from '../services/schoolService';

interface StudentListProps {
  students: StudentPaymentRecord[];
  isLoading: boolean;
  error: string | null;
  currencySymbol: string;
  feeSchedule?: SchoolFeeSchedule;
  activeSchool?: SchoolProfile;
  onRefresh: () => void;
  onSelectStudent: (student: StudentPaymentRecord) => void;
  onOpenAddStudent: () => void;
  onOpenScholarships?: () => void;
  onOpenSheetUpload?: () => void;
  onOpenBackup?: () => void;
  onOpenSettings: () => void;
  onOpenDuplicateCleaner?: () => void;
  onOpenAdditionalFees?: () => void;
  onDeleteStudent?: (id: string, student: StudentPaymentRecord) => Promise<void>;
  isConfigured: boolean;
}

export const StudentList: React.FC<StudentListProps> = ({
  students,
  isLoading,
  error,
  currencySymbol,
  feeSchedule,
  activeSchool,
  onRefresh,
  onSelectStudent,
  onOpenAddStudent,
  onOpenScholarships,
  onOpenSheetUpload,
  onOpenBackup,
  onOpenSettings,
  onOpenDuplicateCleaner,
  onOpenAdditionalFees,
  onDeleteStudent,
  isConfigured,
}) => {
  const [filters, setFilters] = useState<FilterState>({
    classFilter: 'all',
    termFilter: 'all',
    statusFilter: 'all',
    searchQuery: '',
  });

  const [visibleCount, setVisibleCount] = useState<number>(30);

  // Effective fee schedule resolver context
  const effectiveSchedule = activeSchool || feeSchedule;

  // Count scholarship beneficiaries
  const scholarshipCount = useMemo(() => {
    return students.filter(
      (s) => s.is_exempt_from_school_fee === true
    ).length;
  }, [students]);

  // Check for duplicate records in the roster
  const duplicateStats = useMemo(() => {
    if (!students || students.length === 0) return { groupCount: 0, redundantCount: 0 };
    const groups = detectDuplicateGroups(students, 'all');
    const redundantCount = groups.reduce((acc, g) => acc + (g.records.length - 1), 0);
    return { groupCount: groups.length, redundantCount };
  }, [students]);

  // Defer search input filtering so keystrokes never drop a single frame
  const deferredSearchQuery = useDeferredValue(filters.searchQuery);

  // Reset visible count when filters change
  useEffect(() => {
    setVisibleCount(30);
  }, [filters.classFilter, filters.termFilter, filters.statusFilter, deferredSearchQuery]);

  // Extract unique classes and terms from existing data
  const availableClasses = useMemo(() => {
    if (!students || !Array.isArray(students)) return [];
    const set = new Set<string>();
    students.forEach((s) => {
      if (s?.class && s.class.trim()) set.add(s.class.trim());
    });
    return sortClassesInAcademicOrder(Array.from(set));
  }, [students]);

  const availableTerms = useMemo(() => {
    if (!students || !Array.isArray(students)) return [];
    const set = new Set<string>();
    students.forEach((s) => {
      if (s?.term && s.term.trim()) set.add(s.term.trim());
    });
    return Array.from(set).sort();
  }, [students]);

  // Filter students
  const filteredStudents = useMemo(() => {
    if (!students || !Array.isArray(students)) return [];
    return students.filter((s) => {
      if (!s) return false;
      // Search match with deferred value
      if (deferredSearchQuery.trim()) {
        const q = deferredSearchQuery.toLowerCase().trim();
        const matchesName = (s.full_name || '').toLowerCase().includes(q);
        const matchesId = (s.id || '').toLowerCase().includes(q);
        const matchesClass = (s.class || '').toLowerCase().includes(q);
        const matchesReceipt = (s.receipt_no || '').toLowerCase().includes(q);
        if (!matchesName && !matchesId && !matchesClass && !matchesReceipt) return false;
      }

      // Class match
      if (filters.classFilter !== 'all') {
        const studentNormClass = (s.class || '').toLowerCase().replace(/[\s_-]+/g, '');
        const filterNormClass = filters.classFilter.toLowerCase().replace(/[\s_-]+/g, '');
        if (s.class !== filters.classFilter && studentNormClass !== filterNormClass) {
          return false;
        }
      }

      // Term match
      if (filters.termFilter !== 'all' && s.term !== filters.termFilter) {
        return false;
      }

      // Status match
      if (filters.statusFilter !== 'all' && s.status !== filters.statusFilter) {
        return false;
      }

      return true;
    });
  }, [students, deferredSearchQuery, filters.classFilter, filters.termFilter, filters.statusFilter]);

  // Financial aggregates for visible filtered list
  const metrics = useMemo(() => {
    let schoolFeeCollected = 0;
    let admissionFeeCollected = 0;
    let lessonFeeCollected = 0;
    let examFeeCollected = 0;
    let additionalFeesCollected = 0;

    let schoolFeeExpected = 0;
    let admissionFeeExpected = 0;
    let lessonFeeExpected = 0;
    let examFeeExpected = 0;
    let additionalFeesExpected = 0;

    let schoolFeeBalance = 0;
    let admissionFeeBalance = 0;
    let lessonFeeBalance = 0;
    let examFeeBalance = 0;
    let additionalFeesBalance = 0;

    if (Array.isArray(filteredStudents)) {
      filteredStudents.forEach((s) => {
        if (!s) return;
        const bd = deriveFeeBreakdown(s, effectiveSchedule, { forceScheduleRates: true });

        schoolFeeExpected += bd.tuitionFee;
        schoolFeeCollected += bd.tuitionPaid;
        schoolFeeBalance += Math.max(0, bd.tuitionFee - bd.tuitionPaid);

        admissionFeeExpected += bd.admissionFee;
        admissionFeeCollected += bd.admissionPaid;
        admissionFeeBalance += Math.max(0, bd.admissionFee - bd.admissionPaid);

        lessonFeeExpected += bd.lessonFee;
        lessonFeeCollected += bd.lessonPaid;
        lessonFeeBalance += Math.max(0, bd.lessonFee - bd.lessonPaid);

        examFeeExpected += bd.examFee;
        examFeeCollected += bd.examPaid;
        examFeeBalance += Math.max(0, bd.examFee - bd.examPaid);

        additionalFeesExpected += bd.additionalFeesTotal;
        additionalFeesCollected += bd.additionalFeesPaid;
        additionalFeesBalance += Math.max(0, bd.additionalFeesTotal - bd.additionalFeesPaid);
      });
    }

    const overallCollected = schoolFeeCollected + admissionFeeCollected + lessonFeeCollected + examFeeCollected + additionalFeesCollected;
    const overallBalance = schoolFeeBalance + admissionFeeBalance + lessonFeeBalance + examFeeBalance + additionalFeesBalance;
    const overallExpected = Math.max(
      schoolFeeExpected + admissionFeeExpected + lessonFeeExpected + examFeeExpected + additionalFeesExpected,
      overallCollected + overallBalance
    );

    const overallRate = overallExpected > 0 ? Math.min(100, (overallCollected / overallExpected) * 100) : (overallCollected > 0 ? 100 : 0);
    const schoolFeeRate = schoolFeeExpected > 0 ? Math.min(100, (schoolFeeCollected / schoolFeeExpected) * 100) : (schoolFeeCollected > 0 ? 100 : 0);
    const admissionFeeRate = admissionFeeExpected > 0 ? Math.min(100, (admissionFeeCollected / admissionFeeExpected) * 100) : (admissionFeeCollected > 0 ? 100 : 0);
    const lessonFeeRate = lessonFeeExpected > 0 ? Math.min(100, (lessonFeeCollected / lessonFeeExpected) * 100) : (lessonFeeCollected > 0 ? 100 : 0);
    const examFeeRate = examFeeExpected > 0 ? Math.min(100, (examFeeCollected / examFeeExpected) * 100) : (examFeeCollected > 0 ? 100 : 0);
    const additionalFeesRate = additionalFeesExpected > 0 ? Math.min(100, (additionalFeesCollected / additionalFeesExpected) * 100) : (additionalFeesCollected > 0 ? 100 : 0);

    return {
      schoolFeeCollected,
      admissionFeeCollected,
      lessonFeeCollected,
      examFeeCollected,
      additionalFeesCollected,
      overallCollected,
      schoolFeeExpected,
      admissionFeeExpected,
      lessonFeeExpected,
      examFeeExpected,
      additionalFeesExpected,
      overallExpected,
      overallBalance,
      schoolFeeBalance,
      admissionFeeBalance,
      lessonFeeBalance,
      examFeeBalance,
      additionalFeesBalance,
      overallRate,
      schoolFeeRate,
      admissionFeeRate,
      lessonFeeRate,
      examFeeRate,
      additionalFeesRate,
      totalFees: overallExpected,
      totalPaid: overallCollected,
      totalBalance: overallBalance,
      count: filteredStudents?.length || 0,
    };
  }, [filteredStudents, effectiveSchedule]);

  // Current fee amounts / rates for the active view / filter
  const currentViewRates = useMemo(() => {
    const targetClass = filters.classFilter !== 'all' ? filters.classFilter : undefined;
    const sched = getClassFeeSchedule(effectiveSchedule, targetClass);
    return {
      tuition: sched.tuitionFee,
      admission: sched.admissionFee,
      exam: sched.examFee,
      lesson: sched.lessonFeeTermly,
    };
  }, [effectiveSchedule, filters.classFilter]);

  // Itemized metrics for each configured additional fee (e.g. PTA Levy, Uniform, Graduation)
  const itemizedAdditionalFees = useMemo(() => {
    const fees = Array.isArray(activeSchool?.additionalFees) ? activeSchool.additionalFees : [];
    
    return fees.map((fee) => {
      const isEnabled = fee.enabled !== false;
      const feeRate = Math.max(0, parseFinancialAmount(fee.amount, 0));
      let collected = 0;
      let eligibleCount = 0;

      if (Array.isArray(filteredStudents)) {
        filteredStudents.forEach((st) => {
          if (!st) return;
          const applies = isAdditionalFeeApplicable(
            { ...fee, enabled: true },
            st.class,
            st.term
          );
          if (applies) {
            eligibleCount++;
            const studentFees = Array.isArray(st.additional_fees) ? st.additional_fees : [];
            const matches = studentFees.filter(
              (f) => f.feeId === fee.id || f.name.trim().toLowerCase() === fee.name.trim().toLowerCase()
            );
            const paid = matches.reduce((sum, f) => sum + parseFinancialAmount(f.amountPaid, 0), 0);
            collected += paid;
          }
        });
      }

      // Mathematical guarantee:
      // Active fee target is strictly: eligible student count * official fee rate, but at least collected
      const baseExpected = isEnabled ? eligibleCount * feeRate : collected;
      const expected = Math.max(baseExpected, collected);
      const balance = Math.max(0, expected - collected);
      const rate = expected > 0 ? Math.min(100, (collected / expected) * 100) : (collected > 0 ? 100 : 0);

      return {
        ...fee,
        isEnabled,
        expected,
        collected,
        balance,
        rate,
        eligibleCount,
      };
    });
  }, [activeSchool?.additionalFees, filteredStudents]);

  const activeAdditionalFees = useMemo(
    () => itemizedAdditionalFees.filter((f) => f.isEnabled),
    [itemizedAdditionalFees]
  );
  const disabledAdditionalFees = useMemo(
    () => itemizedAdditionalFees.filter((f) => !f.isEnabled),
    [itemizedAdditionalFees]
  );

  const hasActiveFilters =
    filters.classFilter !== 'all' ||
    filters.termFilter !== 'all' ||
    filters.statusFilter !== 'all' ||
    Boolean(filters.searchQuery.trim());

  const resetFilters = () => {
    setFilters({
      classFilter: 'all',
      termFilter: 'all',
      statusFilter: 'all',
      searchQuery: '',
    });
  };

  return (
    <div className="flex-1 pb-28 px-5 pt-4 space-y-4">
      {/* 1. Quick Operations Ribbon */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
        <button
          onClick={onOpenAddStudent}
          id="quick-enroll-student-btn"
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-[#0f172a] hover:bg-black text-white text-xs font-bold shadow-xs active:scale-95 transition-all shrink-0 cursor-pointer"
        >
          <UserPlus className="w-3.5 h-3.5 text-emerald-400" />
          <span>Enroll Student</span>
        </button>

        {onOpenSheetUpload && (
          <button
            onClick={onOpenSheetUpload}
            id="quick-sheet-upload-btn"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold active:scale-95 transition-all shrink-0 cursor-pointer"
          >
            <Layers className="w-3.5 h-3.5 text-emerald-600" />
            <span>Upload via Sheet / CSV</span>
          </button>
        )}

        {onOpenBackup && (
          <button
            onClick={onOpenBackup}
            id="quick-sheet-backup-btn"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 text-xs font-bold active:scale-95 transition-all shrink-0 cursor-pointer"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
            <span>Backup / Export</span>
          </button>
        )}

        {onOpenScholarships && (
          <button
            onClick={onOpenScholarships}
            id="quick-scholarships-btn"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-bold active:scale-95 transition-all shrink-0 cursor-pointer"
          >
            <GraduationCap className="w-3.5 h-3.5 text-amber-600" />
            <span>Scholarships ({scholarshipCount})</span>
          </button>
        )}

        {onOpenAdditionalFees && (
          <button
            onClick={onOpenAdditionalFees}
            id="quick-additional-fees-btn"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-purple-50 hover:bg-purple-100 text-purple-900 border border-purple-200 text-xs font-bold active:scale-95 transition-all shrink-0 cursor-pointer"
          >
            <Layers className="w-3.5 h-3.5 text-purple-600" />
            <span>Manage Fees</span>
            {activeAdditionalFees.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-purple-200 text-purple-900 text-[10px] font-black">
                {activeAdditionalFees.length} Active
              </span>
            )}
          </button>
        )}
      </div>

      {/* 2. Error State */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-3xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1 text-xs text-rose-900">
            <p className="font-bold text-rose-950 mb-0.5">Sync Error</p>
            <p className="leading-relaxed mb-2 font-mono text-[11px] break-words">{error}</p>
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={onRefresh}
                id="retry-fetch-btn"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#1a1a1a] text-white font-semibold text-xs hover:bg-black transition-all cursor-pointer"
              >
                <RotateCw className="w-3.5 h-3.5" />
                Retry Connection
              </button>
              <button
                onClick={onOpenSettings}
                id="fix-url-settings-btn"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-white text-slate-800 font-semibold text-xs border border-rose-300 hover:bg-rose-100/50 transition-all cursor-pointer"
              >
                Open Settings & Fix URL
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2.5 Duplicate Records Alert Pill */}
      {duplicateStats.redundantCount > 0 && onOpenDuplicateCleaner && (
        <div className="bg-rose-50 border border-rose-200/90 rounded-3xl p-3.5 flex items-center justify-between gap-3 shadow-xs animate-in fade-in duration-200">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <CopyCheck className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-black text-rose-950 truncate">
                {duplicateStats.redundantCount} Duplicate {duplicateStats.redundantCount === 1 ? 'Record' : 'Records'} Detected
              </p>
              <p className="text-[10.5px] text-rose-700 font-medium truncate">
                Found across {duplicateStats.groupCount} student {duplicateStats.groupCount === 1 ? 'group' : 'groups'}.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenDuplicateCleaner}
            id="open-duplicate-cleaner-banner-btn"
            className="shrink-0 px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black shadow-xs active:scale-95 transition-all cursor-pointer flex items-center gap-1"
          >
            <Sparkles className="w-3 h-3 text-rose-200" />
            <span>Verify & Clean</span>
          </button>
        </div>
      )}

      {/* 3. Search & Add Existing Student Bar */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          {/* Search Input */}
          <div className="relative flex-1">
            <input
              type="text"
              id="student-search-input"
              value={filters.searchQuery}
              onChange={(e) => setFilters((prev) => ({ ...prev, searchQuery: e.target.value }))}
              placeholder="Filter by ID (e.g. #1001), Name, Class..."
              className="w-full bg-[#f4f4f7] border-none rounded-2xl py-3 pl-11 pr-9 text-sm text-[#1a1a1a] placeholder:text-[#a0a0a0] focus:ring-2 focus:ring-[#2563eb] focus:outline-none transition-all"
            />
            <Search className="w-4 h-4 text-[#a0a0a0] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
            {filters.searchQuery && (
              <button
                onClick={() => setFilters((prev) => ({ ...prev, searchQuery: '' }))}
                id="clear-search-query-btn"
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#a0a0a0] hover:text-[#1a1a1a] p-0.5"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Dedicated "Scholarship Students" button beside the search bar */}
          <button
            onClick={onOpenScholarships || onOpenAddStudent}
            id="students-tab-scholarships-btn"
            title="View Scholarship Students & Grants"
            className="shrink-0 px-3.5 py-3 rounded-2xl bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer border border-amber-400"
          >
            <GraduationCap className="w-4 h-4 text-white" />
            <span className="hidden sm:inline">Scholarships</span>
            <span className="sm:hidden">Scholar</span>
            {scholarshipCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-white text-amber-900 text-[10px] font-black">
                {scholarshipCount}
              </span>
            )}
          </button>
        </div>

        {/* Dropdown Filters (Class & Term) */}
        <div className="grid grid-cols-2 gap-2">
          <div className="relative">
            <select
              id="class-filter-select"
              value={filters.classFilter}
              onChange={(e) => setFilters((prev) => ({ ...prev, classFilter: e.target.value }))}
              aria-label="Filter students by class"
              className="w-full appearance-none bg-[#f4f4f7] border border-[#eee] rounded-2xl px-4 py-2.5 text-xs font-semibold text-[#1a1a1a] focus:ring-2 focus:ring-[#2563eb] focus:outline-none pr-8 truncate"
            >
              <option value="all">All Classes ({availableClasses.length || 0})</option>
              {availableClasses.map((cls) => (
                <option key={cls} value={cls}>
                  Class: {cls}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-[#a0a0a0] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>

          <div className="relative">
            <select
              id="term-filter-select"
              value={filters.termFilter}
              onChange={(e) => setFilters((prev) => ({ ...prev, termFilter: e.target.value }))}
              aria-label="Filter students by term"
              className="w-full appearance-none bg-[#f4f4f7] border border-[#eee] rounded-2xl px-4 py-2.5 text-xs font-semibold text-[#1a1a1a] focus:ring-2 focus:ring-[#2563eb] focus:outline-none pr-8 truncate"
            >
              <option value="all">All Terms ({availableTerms.length || 0})</option>
              {availableTerms.map((term) => (
                <option key={term} value={term}>
                  Term: {term}
                </option>
              ))}
            </select>
            <ChevronDown className="w-3.5 h-3.5 text-[#a0a0a0] absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        </div>

        {/* Status Pill Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
          <button
            onClick={() => setFilters((prev) => ({ ...prev, statusFilter: 'all' }))}
            id="status-filter-all"
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap ${
              filters.statusFilter === 'all'
                ? 'bg-[#1a1a1a] text-white shadow-xs'
                : 'bg-[#f4f4f7] text-[#666] border border-[#eee] hover:bg-slate-200/60'
            }`}
          >
            All Classes ({students.length})
          </button>
          <button
            onClick={() => setFilters((prev) => ({ ...prev, statusFilter: 'fully_paid' }))}
            id="status-filter-fully-paid"
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap ${
              filters.statusFilter === 'fully_paid'
                ? 'bg-[#166534] text-white shadow-xs'
                : 'bg-[#f4f4f7] text-[#166534] border border-[#eee] hover:bg-slate-200/60'
            }`}
          >
            Fully Paid ({students.filter((s) => s.status === 'fully_paid').length})
          </button>
          <button
            onClick={() => setFilters((prev) => ({ ...prev, statusFilter: 'part_payment' }))}
            id="status-filter-part-payment"
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap ${
              filters.statusFilter === 'part_payment'
                ? 'bg-[#92400e] text-white shadow-xs'
                : 'bg-[#f4f4f7] text-[#92400e] border border-[#eee] hover:bg-slate-200/60'
            }`}
          >
            Part Payment ({students.filter((s) => s.status === 'part_payment').length})
          </button>
          <button
            onClick={() => setFilters((prev) => ({ ...prev, statusFilter: 'unpaid' }))}
            id="status-filter-unpaid"
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap ${
              filters.statusFilter === 'unpaid'
                ? 'bg-[#991b1b] text-white shadow-xs'
                : 'bg-[#f4f4f7] text-[#991b1b] border border-[#eee] hover:bg-slate-200/60'
            }`}
          >
            Unpaid ({students.filter((s) => s.status === 'unpaid').length})
          </button>

          {hasActiveFilters && (
            <button
              onClick={resetFilters}
              id="reset-all-filters-btn"
              title="Reset all filters"
              className="p-1.5 rounded-full text-[#a0a0a0] hover:text-[#1a1a1a] hover:bg-slate-200 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 4. Multi-Category Collection Breakdown Summary Card with Dedicated Fee Sections */}
      {students.length > 0 && (
        <div 
          id="students-collection-summary-card"
          className="p-5 bg-gradient-to-br from-[#1e3a8a] via-[#1d4ed8] to-[#1e40af] rounded-[28px] text-white shadow-xl shadow-blue-500/15 space-y-4 border border-blue-400/20"
        >
          {/* Top Section: Overall Total Collection (Tuition + Admission + Lesson + Exam) */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-1.5 text-blue-200">
                <Wallet className="w-4 h-4 text-blue-300" />
                <p className="text-[11px] uppercase font-black tracking-wider">
                  Total Fees Collection Dashboard
                </p>
              </div>
              <div className="flex items-baseline gap-2 mt-1">
                <h3 className="text-2xl sm:text-3xl font-black tracking-tight font-mono text-white">
                  {formatCurrency(metrics.overallCollected, currencySymbol)}
                </h3>
                <span className="text-xs text-blue-200/90 font-medium">
                  collected
                </span>
              </div>
              <div className="flex items-center gap-2.5 text-xs text-blue-200/90 font-medium mt-1 flex-wrap">
                <span className="px-2 py-0.5 rounded-lg bg-white/10 border border-white/15 text-cyan-200 font-mono text-[11px] flex items-center gap-1">
                  <span className="text-blue-200/90">Amount:</span>
                  <span className="font-bold text-white">{formatCurrency(currentViewRates.tuition, currencySymbol)}</span>
                  <span className="text-[10px] text-blue-300">
                    {filters.classFilter !== 'all' ? `(${filters.classFilter})` : '(Base Fee)'}
                  </span>
                </span>
                <span>
                  Target: <span className="font-bold text-white font-mono">{formatCurrency(metrics.overallExpected, currencySymbol)}</span> ({metrics.count} students)
                </span>
                <span className="text-amber-300 font-semibold font-mono">
                  Due: <span>{formatCurrency(metrics.overallBalance, currencySymbol)}</span>
                </span>
              </div>
            </div>

            <div className="sm:text-right flex flex-row sm:flex-col justify-between sm:justify-center items-center sm:items-end gap-1 bg-white/10 sm:bg-transparent p-3 sm:p-0 rounded-2xl border sm:border-0 border-white/10">
              <span className="text-[10px] font-black text-blue-200 uppercase tracking-wider">
                Total Balance Due
              </span>
              <span className="text-lg sm:text-xl font-black text-amber-300 font-mono">
                {formatCurrency(metrics.overallBalance, currencySymbol)}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-900/60 text-blue-200 font-bold border border-blue-400/30">
                {metrics.overallRate.toFixed(1)}% Collected
              </span>
            </div>
          </div>

          {/* Overall Progress Bar */}
          <div className="w-full bg-black/20 rounded-full h-2 overflow-hidden">
            <div 
              className="bg-gradient-to-r from-cyan-400 to-emerald-400 h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, metrics.overallRate))}%` }}
            />
          </div>

          {/* Bottom Grid: 5 Dedicated Fee Collection Cards (School Fee, Exam Fee, Lesson Fee, Admission Fee, Additional/PTA Fees) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 pt-1">
            {/* 1. School Fee (Tuition) */}
            <div className="bg-white/10 hover:bg-white/15 transition-colors rounded-2xl p-3 flex flex-col justify-between border border-white/15">
              <div className="flex items-center justify-between gap-1 text-blue-200 mb-1.5">
                <div className="flex items-center gap-1.5">
                  <GraduationCap className="w-3.5 h-3.5 text-blue-300 shrink-0" />
                  <span className="text-[10px] font-black uppercase tracking-wider truncate">
                    Tuition Fee
                  </span>
                </div>
                <span className="text-[9px] font-bold text-blue-300 font-mono">
                  {metrics.schoolFeeRate.toFixed(0)}%
                </span>
              </div>
              <div className="space-y-1">
                <p className="text-sm sm:text-base font-black tracking-tight font-mono text-white truncate">
                  {formatCurrency(metrics.schoolFeeCollected, currencySymbol)}
                </p>
                <div className="flex items-center justify-between text-[9px] text-cyan-200 font-semibold pt-0.5 border-t border-white/10">
                  <span className="text-blue-200/90 font-medium">Amount:</span>
                  <span className="font-mono">{formatCurrency(currentViewRates.tuition, currencySymbol)}</span>
                </div>
                <div className="flex items-center justify-between text-[9px] text-blue-200/90 font-medium">
                  <span>Target:</span>
                  <span className="font-mono">{formatCurrency(metrics.schoolFeeExpected, currencySymbol)}</span>
                </div>
                <div className="flex items-center justify-between text-[9px] text-amber-300/90 font-semibold font-mono">
                  <span>Due:</span>
                  <span>{formatCurrency(metrics.schoolFeeBalance, currencySymbol)}</span>
                </div>
              </div>
            </div>

            {/* 2. Exam Fee */}
            <div className="bg-white/10 hover:bg-white/15 transition-colors rounded-2xl p-3 flex flex-col justify-between border border-white/15">
              <div className="flex items-center justify-between gap-1 text-amber-200 mb-1.5">
                <div className="flex items-center gap-1.5">
                  <Award className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                  <span className="text-[10px] font-black uppercase tracking-wider truncate">
                    Exam Fee
                  </span>
                </div>
                <span className="text-[9px] font-bold text-amber-300 font-mono">
                  {metrics.examFeeRate.toFixed(0)}%
                </span>
              </div>
              <div className="space-y-1">
                <p className="text-sm sm:text-base font-black tracking-tight font-mono text-white truncate">
                  {formatCurrency(metrics.examFeeCollected, currencySymbol)}
                </p>
                <div className="flex items-center justify-between text-[9px] text-amber-100 font-semibold pt-0.5 border-t border-white/10">
                  <span className="text-amber-200/90 font-medium">Amount:</span>
                  <span className="font-mono">{formatCurrency(currentViewRates.exam, currencySymbol)}</span>
                </div>
                <div className="flex items-center justify-between text-[9px] text-amber-200/90 font-medium">
                  <span>Target:</span>
                  <span className="font-mono">{formatCurrency(metrics.examFeeExpected, currencySymbol)}</span>
                </div>
                <div className="flex items-center justify-between text-[9px] text-amber-300/90 font-semibold font-mono">
                  <span>Due:</span>
                  <span>{formatCurrency(metrics.examFeeBalance, currencySymbol)}</span>
                </div>
              </div>
            </div>

            {/* 3. Lesson Fee */}
            <div className="bg-white/10 hover:bg-white/15 transition-colors rounded-2xl p-3 flex flex-col justify-between border border-white/15">
              <div className="flex items-center justify-between gap-1 text-emerald-200 mb-1.5">
                <div className="flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-emerald-300 shrink-0" />
                  <span className="text-[10px] font-black uppercase tracking-wider truncate">
                    Lesson Fee
                  </span>
                </div>
                <span className="text-[9px] font-bold text-emerald-300 font-mono">
                  {metrics.lessonFeeRate.toFixed(0)}%
                </span>
              </div>
              <div className="space-y-1">
                <p className="text-sm sm:text-base font-black tracking-tight font-mono text-white truncate">
                  {formatCurrency(metrics.lessonFeeCollected, currencySymbol)}
                </p>
                <div className="flex items-center justify-between text-[9px] text-emerald-100 font-semibold pt-0.5 border-t border-white/10">
                  <span className="text-emerald-200/90 font-medium">Amount:</span>
                  <span className="font-mono">{formatCurrency(currentViewRates.lesson, currencySymbol)}</span>
                </div>
                <div className="flex items-center justify-between text-[9px] text-emerald-200/90 font-medium">
                  <span>Target:</span>
                  <span className="font-mono">{formatCurrency(metrics.lessonFeeExpected, currencySymbol)}</span>
                </div>
                <div className="flex items-center justify-between text-[9px] text-amber-300/90 font-semibold font-mono">
                  <span>Due:</span>
                  <span>{formatCurrency(metrics.lessonFeeBalance, currencySymbol)}</span>
                </div>
              </div>
            </div>

            {/* 4. Admission Fee */}
            <div className="bg-white/10 hover:bg-white/15 transition-colors rounded-2xl p-3 flex flex-col justify-between border border-cyan-300/30">
              <div className="flex items-center justify-between gap-1 text-cyan-200 mb-1.5">
                <div className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-cyan-300 shrink-0" />
                  <span className="text-[10px] font-black uppercase tracking-wider truncate">
                    Admission Fee
                  </span>
                </div>
                <span className="text-[9px] font-bold text-cyan-300 font-mono">
                  {metrics.admissionFeeRate.toFixed(0)}%
                </span>
              </div>
              <div className="space-y-1">
                <p className="text-sm sm:text-base font-black tracking-tight font-mono text-cyan-100 truncate">
                  {formatCurrency(metrics.admissionFeeCollected, currencySymbol)}
                </p>
                <div className="flex items-center justify-between text-[9px] text-cyan-100 font-semibold pt-0.5 border-t border-white/10">
                  <span className="text-cyan-200/90 font-medium">Amount:</span>
                  <span className="font-mono">{formatCurrency(currentViewRates.admission, currencySymbol)}</span>
                </div>
                <div className="flex items-center justify-between text-[9px] text-cyan-100/90 font-medium">
                  <span>Target:</span>
                  <span className="font-mono">{formatCurrency(metrics.admissionFeeExpected, currencySymbol)}</span>
                </div>
                <div className="flex items-center justify-between text-[9px] text-cyan-200/90 font-semibold font-mono">
                  <span>Due:</span>
                  <span>{formatCurrency(metrics.admissionFeeBalance, currencySymbol)}</span>
                </div>
              </div>
            </div>

            {/* 5+. DYNAMIC CARDS FOR EACH ACTIVE ADDITIONAL FEE */}
            {activeAdditionalFees.map((fee) => (
              <div
                key={fee.id}
                onClick={onOpenAdditionalFees}
                className="bg-white/10 hover:bg-white/15 transition-all rounded-2xl p-3 flex flex-col justify-between border border-purple-300/30 cursor-pointer group"
                title="Click to manage or edit this fee"
              >
                <div className="flex items-center justify-between gap-1 text-purple-200 mb-1.5">
                  <div className="flex items-center gap-1.5 truncate">
                    <Layers className="w-3.5 h-3.5 text-purple-300 shrink-0 group-hover:scale-110 transition-transform" />
                    <span className="text-[10px] font-black uppercase tracking-wider truncate">
                      {fee.name}
                    </span>
                  </div>
                  <span className="text-[9px] font-bold text-purple-300 font-mono">
                    {fee.rate.toFixed(0)}%
                  </span>
                </div>
                <div className="space-y-1">
                  <p className="text-sm sm:text-base font-black tracking-tight font-mono text-purple-100 truncate">
                    {formatCurrency(fee.collected, currencySymbol)}
                  </p>
                  <div className="flex items-center justify-between text-[9px] text-purple-100 font-semibold pt-0.5 border-t border-white/10">
                    <span className="text-purple-200/90 font-medium">Amount:</span>
                    <span className="font-mono">
                      {formatCurrency(fee.amount, currencySymbol)}
                      <span className="text-[8px] text-purple-300/80 ml-0.5">
                        {!fee.targetClass || fee.targetClass === 'all' || fee.targetClass === 'all classes' ? '(All)' : `(${fee.targetClass})`}
                      </span>
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[9px] text-purple-200/90 font-medium">
                    <span>Target:</span>
                    <span className="font-mono">{formatCurrency(fee.expected, currencySymbol)}</span>
                  </div>
                  <div className="flex items-center justify-between text-[9px] text-amber-300/90 font-semibold font-mono">
                    <span>Due:</span>
                    <span>{formatCurrency(fee.balance, currencySymbol)}</span>
                  </div>
                </div>
              </div>
            ))}

            {/* Quick Add Fee Card */}
            {onOpenAdditionalFees && (
              <button
                type="button"
                onClick={onOpenAdditionalFees}
                id="mini-dashboard-add-fee-btn"
                className="bg-white/5 hover:bg-white/10 transition-all rounded-2xl p-3 flex flex-col items-center justify-center border border-dashed border-white/20 text-blue-200 hover:text-white group cursor-pointer min-h-[96px] text-center"
              >
                <div className="w-6 h-6 rounded-full bg-white/10 group-hover:bg-white/20 flex items-center justify-center mb-1 transition-colors">
                  <Plus className="w-3.5 h-3.5 text-cyan-300" />
                </div>
                <span className="text-[10.5px] font-bold">
                  + Add Fee
                </span>
                <span className="text-[8.5px] text-blue-200/70">
                  PTA, Uniform, etc.
                </span>
              </button>
            )}
          </div>

          {/* Paused Fees Notice Bar */}
          {disabledAdditionalFees.length > 0 && (
            <div className="mt-2.5 px-3 py-1.5 rounded-xl bg-black/25 border border-amber-300/20 flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5 text-amber-200 text-[11px] font-medium truncate">
                <PauseCircle className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                <span className="truncate">
                  {disabledAdditionalFees.length} Fee Paused: {disabledAdditionalFees.map((f) => f.name).join(', ')} (Disabled — not charging students)
                </span>
              </div>
              {onOpenAdditionalFees && (
                <button
                  type="button"
                  onClick={onOpenAdditionalFees}
                  className="text-[10.5px] font-bold text-cyan-300 hover:text-cyan-200 underline shrink-0 cursor-pointer"
                >
                  Manage / Enable
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* 6. Empty State: No students yet */}
      {students.length === 0 && !error && (
        <div className="bg-white rounded-3xl p-8 border border-[#f0f0f0] text-center space-y-4 shadow-sm my-4">
          <div className="w-14 h-14 rounded-2xl bg-[#f4f4f7] text-[#1a1a1a] flex items-center justify-center mx-auto">
            <GraduationCap className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-base font-bold text-[#1a1a1a]">No Student Records Found</h3>
            <p className="text-xs text-[#666] mt-1 max-w-sm mx-auto leading-relaxed">
              Upload your student roster directly via Excel or CSV, or add individual students to sync with Firestore.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 flex-wrap pt-1">
            {onOpenSheetUpload && (
              <button
                onClick={onOpenSheetUpload}
                id="empty-state-upload-btn"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 active:scale-95 transition-all shadow-sm cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-emerald-200" />
                <span>Upload Roster (Excel / CSV)</span>
              </button>
            )}
            <button
              onClick={onOpenAddStudent}
              id="empty-state-add-existing-btn"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#1a1a1a] text-white text-xs font-semibold hover:bg-black active:scale-95 transition-all shadow-sm cursor-pointer"
            >
              <UserCheck className="w-4 h-4 text-emerald-400" />
              <span>Add Existing Student</span>
            </button>
          </div>
        </div>
      )}

      {/* 7. Empty State: Filters yielded 0 matches */}
      {students.length > 0 && filteredStudents.length === 0 && (
        <div className="bg-white rounded-3xl p-6 border border-[#f0f0f0] text-center space-y-3 shadow-xs">
          <div className="w-10 h-10 rounded-full bg-[#f4f4f7] text-[#a0a0a0] flex items-center justify-center mx-auto">
            <Search className="w-5 h-5" />
          </div>
          <h4 className="text-sm font-bold text-[#1a1a1a]">No matching students found</h4>
          <p className="text-xs text-[#666] max-w-xs mx-auto">
            Try adjusting your search query, class, term, or status filters.
          </p>
          <button
            onClick={resetFilters}
            id="clear-all-filter-tags-btn"
            className="text-xs font-bold text-[#2563eb] underline hover:text-blue-700"
          >
            Clear all filters
          </button>
        </div>
      )}

      {/* 8. Student Records List with Progressive Fast Slicing */}
      {filteredStudents.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 pt-1">
          {filteredStudents.slice(0, visibleCount).map((student) => (
            <StudentCard
              key={student.id}
              student={student}
              currencySymbol={currencySymbol}
              feeSchedule={effectiveSchedule}
              onClick={onSelectStudent}
            />
          ))}

          {/* Show More Students if list exceeds visible batch size */}
          {filteredStudents.length > visibleCount && (
            <div className="pt-2 pb-4 text-center">
              <button
                type="button"
                id="load-more-students-btn"
                onClick={() => setVisibleCount((prev) => prev + 30)}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl bg-white border border-[#e5e5e5] text-xs font-bold text-[#1a1a1a] hover:bg-neutral-50 shadow-xs active:scale-98 transition-all cursor-pointer"
              >
                <span>Show More Students ({filteredStudents.length - visibleCount} remaining)</span>
                <ChevronRight className="w-4 h-4 text-[#a0a0a0]" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
