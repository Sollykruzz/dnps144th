/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  Printer,
  X,
  Download,
  Calendar,
  Building,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Layers,
  Filter,
  FileSpreadsheet,
  ShieldCheck,
  Award,
  Users,
  ChevronDown,
} from 'lucide-react';
import {
  StudentPaymentRecord,
  BursarSession,
  SchoolProfile,
  ExpenseItem,
  ExtraIncomeItem,
  PayrollRecord,
} from '../types';
import {
  formatCurrency,
  deriveFeeBreakdown,
  calculateClassSummaries,
  getTodayDateString,
} from '../services/calculations';
import {
  calculateNetFinancials,
  normalizeExpenseTerm,
  EXPENSE_CATEGORIES,
} from '../services/expenseService';
import { downloadCsvBackup } from '../services/backupService';

interface PrintableFinancialReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: StudentPaymentRecord[];
  session: BursarSession;
  activeSchool?: SchoolProfile;
  initialTerm?: string;
  allExpenses: ExpenseItem[];
  allExtraIncomes?: ExtraIncomeItem[];
  payrollRecords: PayrollRecord[];
}

export const PrintableFinancialReportModal: React.FC<PrintableFinancialReportModalProps> = ({
  isOpen,
  onClose,
  students,
  session,
  activeSchool,
  initialTerm = 'all',
  allExpenses,
  allExtraIncomes = [],
  payrollRecords,
}) => {
  const [selectedTerm, setSelectedTerm] = useState<string>(initialTerm);
  const [reportType, setReportType] = useState<'comprehensive' | 'income_expenditure' | 'class_ledger'>('comprehensive');
  
  // Section visibility controls for customized report generation
  const [showExecutiveSummary, setShowExecutiveSummary] = useState(true);
  const [showIncomeStatement, setShowIncomeStatement] = useState(true);
  const [showClassLedger, setShowClassLedger] = useState(true);
  const [showExpensesBreakdown, setShowExpensesBreakdown] = useState(true);
  const [showSignatures, setShowSignatures] = useState(true);

  const schoolName = activeSchool?.name || session.schoolName || 'DOMINION GROUP OF SCHOOLS';
  const currencySymbol = activeSchool?.currencySymbol || session.currencySymbol || '₦';
  const bursarName = session.bursarName || 'Bursar & Financial Controller';
  const schoolAddress = activeSchool?.motto || 'Excellence in Academics and Character • Education District';

  // Extract unique terms
  const availableTerms = useMemo(() => {
    const terms = new Set<string>();
    students.forEach((s) => {
      if (s?.term && s.term.trim()) terms.add(s.term.trim());
    });
    return Array.from(terms).sort();
  }, [students]);

  // Filter students based on selected term
  const scopedStudents = useMemo(() => {
    if (selectedTerm === 'all') return students;
    return students.filter((s) => (s?.term || '').trim().toLowerCase() === selectedTerm.toLowerCase().trim());
  }, [students, selectedTerm]);

  // Fee income totals
  const feeIncomeTotals = useMemo(() => {
    let tuitionCollected = 0;
    let tuitionTotal = 0;
    let admissionCollected = 0;
    let admissionTotal = 0;
    let lessonCollected = 0;
    let lessonTotal = 0;
    let examCollected = 0;
    let examTotal = 0;

    scopedStudents.forEach((s) => {
      const bd = deriveFeeBreakdown(s, activeSchool);
      tuitionTotal += bd.tuitionFee;
      tuitionCollected += bd.tuitionPaid;
      admissionTotal += bd.admissionFee;
      admissionCollected += bd.admissionPaid;
      lessonTotal += bd.lessonFee;
      lessonCollected += bd.lessonPaid;
      examTotal += bd.examFee;
      examCollected += bd.examPaid;
    });

    return {
      schoolFeeCollected: tuitionCollected,
      schoolFeeTotal: tuitionTotal,
      admissionFeeCollected: admissionCollected,
      admissionFeeTotal: admissionTotal,
      lessonFeeCollected: lessonCollected,
      lessonFeeTotal: lessonTotal,
      examFeeCollected: examCollected,
      examFeeTotal: examTotal,
    };
  }, [scopedStudents, activeSchool]);

  // Scoped expenses for selected term
  const scopedExpenses = useMemo(() => {
    if (selectedTerm === 'all') return allExpenses;
    const targetNorm = normalizeExpenseTerm(selectedTerm);
    return allExpenses.filter((e) => {
      if (!e.term || e.term.toLowerCase().trim() === 'all terms') return true;
      return normalizeExpenseTerm(e.term) === targetNorm;
    });
  }, [allExpenses, selectedTerm]);

  // Scoped extra incomes for selected term
  const scopedExtraIncomes = useMemo(() => {
    if (selectedTerm === 'all') return allExtraIncomes;
    const targetNorm = normalizeExpenseTerm(selectedTerm);
    return allExtraIncomes.filter((inc) => {
      if (!inc.term || inc.term.toLowerCase().trim() === 'all terms') return true;
      return normalizeExpenseTerm(inc.term) === targetNorm;
    });
  }, [allExtraIncomes, selectedTerm]);

  // Scoped payroll for selected term
  const scopedPayrollDisbursed = useMemo(() => {
    if (selectedTerm === 'all') {
      return payrollRecords.reduce((acc, r) => acc + (r.amountPaid || 0), 0);
    }
    const termRecords = payrollRecords.filter(
      (r) => (r.term || '').toLowerCase().trim() === selectedTerm.toLowerCase().trim()
    );
    return termRecords.reduce((acc, r) => acc + (r.amountPaid || 0), 0);
  }, [payrollRecords, selectedTerm]);

  // Net financials
  const netFinancials = useMemo(() => {
    return calculateNetFinancials(feeIncomeTotals, scopedPayrollDisbursed, scopedExpenses, scopedExtraIncomes);
  }, [feeIncomeTotals, scopedPayrollDisbursed, scopedExpenses, scopedExtraIncomes]);

  // Class summaries
  const classSummaries = useMemo(() => {
    const raw = calculateClassSummaries(scopedStudents, activeSchool);
    return [...raw].sort((a, b) => b.totalPaid - a.totalPaid);
  }, [scopedStudents, activeSchool]);

  // Sectional grouping (Nursery/Primary vs College)
  const classGroups = useMemo(() => {
    const primarySection: typeof classSummaries = [];
    const secondarySection: typeof classSummaries = [];

    classSummaries.forEach((c) => {
      const lower = c.className.toLowerCase();
      if (lower.includes('jss') || lower.includes('sss') || lower.includes('college') || lower.includes('high')) {
        secondarySection.push(c);
      } else {
        primarySection.push(c);
      }
    });

    const sumSection = (list: typeof classSummaries) => {
      return list.reduce(
        (acc, curr) => ({
          studentCount: acc.studentCount + curr.studentCount,
          totalFees: acc.totalFees + curr.totalFees,
          totalPaid: acc.totalPaid + curr.totalPaid,
          totalBalance: acc.totalBalance + curr.totalBalance,
        }),
        { studentCount: 0, totalFees: 0, totalPaid: 0, totalBalance: 0 }
      );
    };

    return {
      primary: primarySection,
      primaryTotals: sumSection(primarySection),
      secondary: secondarySection,
      secondaryTotals: sumSection(secondarySection),
    };
  }, [classSummaries]);

  // Operating Expenses by Category breakdown
  const expensesByCategory = useMemo(() => {
    const map = new Map<string, { label: string; amount: number; count: number }>();
    scopedExpenses.forEach((exp) => {
      const catId = exp.category || 'other';
      const label = exp.categoryLabel || catId;
      const numAmt = Number(exp.amount) || 0;
      const existing = map.get(catId) || { label, amount: 0, count: 0 };
      existing.amount += numAmt;
      existing.count += 1;
      map.set(catId, existing);
    });

    const list = Array.from(map.values()).sort((a, b) => b.amount - a.amount);
    return list;
  }, [scopedExpenses]);

  // Student Payment Status distribution
  const paymentDistribution = useMemo(() => {
    let fullyPaid = 0;
    let partPayment = 0;
    let unpaid = 0;

    scopedStudents.forEach((s) => {
      const bal = Number(s.balance) || 0;
      const paid = Number(s.amount_paid) || 0;
      if (bal <= 0 && paid > 0) {
        fullyPaid++;
      } else if (paid > 0 && bal > 0) {
        partPayment++;
      } else {
        unpaid++;
      }
    });

    const total = scopedStudents.length;
    return {
      fullyPaid,
      partPayment,
      unpaid,
      fullyPaidPercent: total > 0 ? Math.round((fullyPaid / total) * 100) : 0,
      partPaymentPercent: total > 0 ? Math.round((partPayment / total) * 100) : 0,
      unpaidPercent: total > 0 ? Math.round((unpaid / total) * 100) : 0,
    };
  }, [scopedStudents]);

  // Report Reference Code
  const reportRefCode = useMemo(() => {
    const termCode = selectedTerm.replace(/\s+/g, '').toUpperCase().slice(0, 4) || 'ALL';
    const dateNum = getTodayDateString().replace(/-/g, '');
    return `DOM-AUD-${termCode}-${dateNum}`;
  }, [selectedTerm]);

  // Audit Date formatted
  const formattedAuditDate = useMemo(() => {
    return new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }, []);

  const handlePrint = () => {
    if (typeof window !== 'undefined' && typeof window.print === 'function') {
      window.print();
    }
  };

  const handleExportCsv = () => {
    downloadCsvBackup(scopedStudents, session, {
      term: selectedTerm !== 'all' ? selectedTerm : undefined,
    });
  };

  if (!isOpen) return null;

  return (
    <div
      id="financial-report-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-xs p-2 sm:p-4 overflow-y-auto"
    >
      <div className="relative w-full max-w-5xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[96dvh]">
        {/* ========================================================================= */}
        {/* TOP CONTROLS & REPORT CUSTOMIZER TOOLBAR (Screen Only, Hidden on Print)   */}
        {/* ========================================================================= */}
        <div className="no-print bg-slate-900 text-white px-5 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-wide">
                Official Financial Statement & Bursary Audit Report
              </h2>
              <p className="text-[11px] text-slate-400">
                Print-ready, institutional accounting statement for board and management
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Term Filter */}
            <div className="flex items-center gap-1.5 bg-slate-800 border border-slate-700 px-2.5 py-1.5 rounded-xl text-xs">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <select
                id="financial-report-term-select"
                value={selectedTerm}
                onChange={(e) => setSelectedTerm(e.target.value)}
                className="bg-transparent text-white font-medium focus:outline-none cursor-pointer pr-1"
              >
                <option value="all" className="bg-slate-800 text-white">
                  All Terms Combined
                </option>
                {availableTerms.map((t) => (
                  <option key={t} value={t} className="bg-slate-800 text-white">
                    {t}
                  </option>
                ))}
              </select>
            </div>

            {/* Export CSV Button */}
            <button
              onClick={handleExportCsv}
              id="report-export-csv-btn"
              title="Download Raw Ledger Data"
              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-all border border-slate-700 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-slate-400" />
              <span className="hidden sm:inline">Export CSV</span>
            </button>

            {/* Print Statement Button */}
            <button
              onClick={handlePrint}
              id="report-print-btn"
              className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-md shadow-emerald-950/40 cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              <span>Print / Save PDF</span>
            </button>

            {/* Close Button */}
            <button
              onClick={onClose}
              id="report-modal-close-btn"
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Customization Options Bar (Screen Only) */}
        <div className="no-print bg-slate-100 px-5 py-2.5 border-b border-slate-200 text-xs flex flex-wrap items-center justify-between gap-3 text-slate-700">
          <div className="flex items-center gap-1.5 text-slate-500 font-semibold">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span>Include in Report:</span>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs">
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showExecutiveSummary}
                onChange={(e) => setShowExecutiveSummary(e.target.checked)}
                className="rounded text-emerald-600 focus:ring-0 cursor-pointer"
              />
              <span className="text-slate-700 font-medium">Key Indicators</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showIncomeStatement}
                onChange={(e) => setShowIncomeStatement(e.target.checked)}
                className="rounded text-emerald-600 focus:ring-0 cursor-pointer"
              />
              <span className="text-slate-700 font-medium">Income Statement (P&L)</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showClassLedger}
                onChange={(e) => setShowClassLedger(e.target.checked)}
                className="rounded text-emerald-600 focus:ring-0 cursor-pointer"
              />
              <span className="text-slate-700 font-medium">Class Arrears Schedule</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showExpensesBreakdown}
                onChange={(e) => setShowExpensesBreakdown(e.target.checked)}
                className="rounded text-emerald-600 focus:ring-0 cursor-pointer"
              />
              <span className="text-slate-700 font-medium">Overheads Itemization</span>
            </label>

            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showSignatures}
                onChange={(e) => setShowSignatures(e.target.checked)}
                className="rounded text-emerald-600 focus:ring-0 cursor-pointer"
              />
              <span className="text-slate-700 font-medium">Auditor Endorsements</span>
            </label>
          </div>
        </div>

        {/* ========================================================================= */}
        {/* PRINTABLE DOCUMENT BODY (Target of print stylesheet)                     */}
        {/* ========================================================================= */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 bg-slate-50">
          <div
            id="printable-financial-report"
            className="max-w-4xl mx-auto bg-white p-6 sm:p-10 rounded-2xl shadow-xs border border-slate-200 print:border-none print:shadow-none print:p-0 text-slate-900"
          >
            {/* 1. OFFICIAL INSTITUTIONAL HEADER & CREST */}
            <div className="border-b-2 border-slate-900 pb-5 mb-6 text-center print-avoid-break">
              <div className="flex items-center justify-between gap-4 mb-2">
                <div className="w-16 h-16 rounded-2xl bg-slate-900 text-white flex flex-col items-center justify-center font-serif border border-slate-800 shadow-xs">
                  <span className="text-xl font-bold tracking-tighter">DGS</span>
                  <span className="text-[9px] uppercase tracking-widest text-emerald-400">EST. 2005</span>
                </div>

                <div className="flex-1 text-center">
                  <h1 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-slate-950 font-serif">
                    {schoolName}
                  </h1>
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-600 mt-0.5">
                    Nursery, Primary & College Departments • Bursary Division
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {schoolAddress} • Official Financial Ledger & Bursar Audit Record
                  </p>
                </div>

                <div className="hidden sm:flex flex-col items-end text-right">
                  <div className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-800 border border-emerald-300 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
                    <ShieldCheck className="w-3 h-3 text-emerald-600" />
                    <span>Audited Statement</span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-mono mt-1">
                    Ref: {reportRefCode}
                  </span>
                </div>
              </div>

              {/* Header Metadata Banner */}
              <div className="mt-4 pt-3 border-t border-slate-200 grid grid-cols-2 sm:grid-cols-4 gap-2 text-left text-xs bg-slate-50 p-2.5 rounded-xl">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Academic Session
                  </span>
                  <span className="font-bold text-slate-800">2026/2027 Academic Year</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Report Period
                  </span>
                  <span className="font-bold text-slate-800">
                    {selectedTerm === 'all' ? 'Full Academic Session (All Terms)' : selectedTerm}
                  </span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Date of Statement
                  </span>
                  <span className="font-bold text-slate-800">{formattedAuditDate}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Prepared By
                  </span>
                  <span className="font-bold text-slate-800">{bursarName}</span>
                </div>
              </div>
            </div>

            {/* 2. EXECUTIVE FINANCIAL SUMMARY (KEY PERFORMANCE INDICATORS) */}
            {showExecutiveSummary && (
              <div className="mb-6 print-avoid-break">
                <div className="flex items-center justify-between mb-3 border-b border-slate-200 pb-1.5">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                    <DollarSign className="w-4 h-4 text-emerald-600" />
                    <span>Section 1: Executive Financial Summary</span>
                  </h3>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                    Enrolled Population: {scopedStudents.length} Students
                  </span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                  <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
                    <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block mb-1">
                      Gross Revenue Billed
                    </span>
                    <div className="text-base sm:text-lg font-black text-slate-900 font-mono">
                      {formatCurrency(netFinancials.totalIncomeExpected, currencySymbol)}
                    </div>
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      100% total billing across {scopedStudents.length} students
                    </span>
                  </div>

                  <div className="bg-emerald-50/70 border border-emerald-200 p-3 rounded-xl">
                    <span className="text-[10px] uppercase font-bold text-emerald-800 tracking-wider block mb-1">
                      Cash Inflow Collected
                    </span>
                    <div className="text-base sm:text-lg font-black text-emerald-700 font-mono">
                      {formatCurrency(netFinancials.totalIncomeCollected, currencySymbol)}
                    </div>
                    <span className="text-[10px] text-emerald-700 mt-1 block font-semibold">
                      Efficiency: {netFinancials.totalIncomeExpected > 0 ? Math.round((netFinancials.totalIncomeCollected / netFinancials.totalIncomeExpected) * 100) : 0}% recovery rate
                    </span>
                  </div>

                  <div className="bg-amber-50/70 border border-amber-200 p-3 rounded-xl">
                    <span className="text-[10px] uppercase font-bold text-amber-800 tracking-wider block mb-1">
                      Uncollected Arrears
                    </span>
                    <div className="text-base sm:text-lg font-black text-amber-700 font-mono">
                      {formatCurrency(netFinancials.totalIncomeOutstanding, currencySymbol)}
                    </div>
                    <span className="text-[10px] text-amber-700 mt-1 block">
                      Outstanding student fee debts
                    </span>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
                    <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block mb-1">
                      Total Expenditures
                    </span>
                    <div className="text-base sm:text-lg font-black text-rose-700 font-mono">
                      {formatCurrency(netFinancials.totalExpenses, currencySymbol)}
                    </div>
                    <span className="text-[10px] text-slate-500 mt-1 block">
                      Payroll + Operating overheads
                    </span>
                  </div>
                </div>

                {/* Net Operating Position Banner */}
                <div
                  className={`p-3.5 rounded-xl border flex flex-wrap items-center justify-between gap-3 ${
                    netFinancials.netOperatingSurplus >= 0
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                      : 'bg-rose-50 border-rose-200 text-rose-950'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold ${
                        netFinancials.netOperatingSurplus >= 0
                          ? 'bg-emerald-600 text-white'
                          : 'bg-rose-600 text-white'
                      }`}
                    >
                      {netFinancials.netOperatingSurplus >= 0 ? (
                        <TrendingUp className="w-5 h-5" />
                      ) : (
                        <TrendingDown className="w-5 h-5" />
                      )}
                    </div>
                    <div>
                      <div className="text-xs font-black uppercase tracking-wider">
                        {netFinancials.netOperatingSurplus >= 0
                          ? 'Net School Operating Surplus (Retained Earnings)'
                          : 'Net School Operating Deficit'}
                      </div>
                      <div className="text-[11px] opacity-80">
                        Total Fee Inflow ({formatCurrency(netFinancials.totalIncomeCollected, currencySymbol)}) MINUS Total School Outflows ({formatCurrency(netFinancials.totalExpenses, currencySymbol)})
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-lg sm:text-xl font-black font-mono">
                      {netFinancials.netOperatingSurplus >= 0 ? '+' : ''}
                      {formatCurrency(netFinancials.netOperatingSurplus, currencySymbol)}
                    </div>
                    <div className="text-[11px] font-bold opacity-80">
                      Operating Margin: {netFinancials.netMarginPercentage}%
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* 3. STATEMENT OF COMPREHENSIVE OPERATING INCOME (P&L LEDGER) */}
            {showIncomeStatement && (
              <div className="mb-6 print-avoid-break">
                <div className="flex items-center justify-between mb-3 border-b border-slate-200 pb-1.5">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                    <FileSpreadsheet className="w-4 h-4 text-slate-700" />
                    <span>Section 2: Statement of Comprehensive Operating Income</span>
                  </h3>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                    Accrual & Cash Basis
                  </span>
                </div>

                <div className="border border-slate-300 rounded-xl overflow-x-auto text-xs">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-slate-100 text-slate-800 border-b border-slate-300 font-bold">
                        <th className="p-2 text-left">Accounting Head & Description</th>
                        <th className="p-2 text-right">Gross Expected</th>
                        <th className="p-2 text-right">Amount Received</th>
                        <th className="p-2 text-right">Outstanding (Debts)</th>
                        <th className="p-2 text-center">Collection %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {/* PART A: OPERATING REVENUES */}
                      <tr className="bg-slate-50/70 font-bold text-slate-900">
                        <td colSpan={5} className="p-2 uppercase tracking-wider text-[11px] bg-slate-100/70">
                          A. Operating Educational Inflows (Tuition & Fees)
                        </td>
                      </tr>
                      <tr>
                        <td className="p-2 font-medium text-slate-800 pl-4">
                          1. School Tuition Fees
                        </td>
                        <td className="p-2 text-right font-mono text-slate-600">
                          {formatCurrency(feeIncomeTotals.schoolFeeTotal, currencySymbol)}
                        </td>
                        <td className="p-2 text-right font-mono font-bold text-slate-900">
                          {formatCurrency(feeIncomeTotals.schoolFeeCollected, currencySymbol)}
                        </td>
                        <td className="p-2 text-right font-mono text-amber-700 font-semibold">
                          {formatCurrency(Math.max(0, feeIncomeTotals.schoolFeeTotal - feeIncomeTotals.schoolFeeCollected), currencySymbol)}
                        </td>
                        <td className="p-2 text-center font-bold text-slate-700">
                          {feeIncomeTotals.schoolFeeTotal > 0
                            ? `${Math.round((feeIncomeTotals.schoolFeeCollected / feeIncomeTotals.schoolFeeTotal) * 100)}%`
                            : 'N/A'}
                        </td>
                      </tr>
                      <tr>
                        <td className="p-2 font-medium text-slate-800 pl-4">
                          2. New Admission & Registration Fees
                        </td>
                        <td className="p-2 text-right font-mono text-slate-600">
                          {formatCurrency(feeIncomeTotals.admissionFeeTotal, currencySymbol)}
                        </td>
                        <td className="p-2 text-right font-mono font-bold text-slate-900">
                          {formatCurrency(feeIncomeTotals.admissionFeeCollected, currencySymbol)}
                        </td>
                        <td className="p-2 text-right font-mono text-amber-700 font-semibold">
                          {formatCurrency(Math.max(0, feeIncomeTotals.admissionFeeTotal - feeIncomeTotals.admissionFeeCollected), currencySymbol)}
                        </td>
                        <td className="p-2 text-center font-bold text-slate-700">
                          {feeIncomeTotals.admissionFeeTotal > 0
                            ? `${Math.round((feeIncomeTotals.admissionFeeCollected / feeIncomeTotals.admissionFeeTotal) * 100)}%`
                            : 'N/A'}
                        </td>
                      </tr>
                      <tr>
                        <td className="p-2 font-medium text-slate-800 pl-4">
                          3. After-School Lesson & Coaching Fees
                        </td>
                        <td className="p-2 text-right font-mono text-slate-600">
                          {formatCurrency(feeIncomeTotals.lessonFeeTotal, currencySymbol)}
                        </td>
                        <td className="p-2 text-right font-mono font-bold text-slate-900">
                          {formatCurrency(feeIncomeTotals.lessonFeeCollected, currencySymbol)}
                        </td>
                        <td className="p-2 text-right font-mono text-amber-700 font-semibold">
                          {formatCurrency(Math.max(0, feeIncomeTotals.lessonFeeTotal - feeIncomeTotals.lessonFeeCollected), currencySymbol)}
                        </td>
                        <td className="p-2 text-center font-bold text-slate-700">
                          {feeIncomeTotals.lessonFeeTotal > 0
                            ? `${Math.round((feeIncomeTotals.lessonFeeCollected / feeIncomeTotals.lessonFeeTotal) * 100)}%`
                            : 'N/A'}
                        </td>
                      </tr>
                      <tr>
                        <td className="p-2 font-medium text-slate-800 pl-4">
                          4. Terminal Examination & Assessment Fees
                        </td>
                        <td className="p-2 text-right font-mono text-slate-600">
                          {formatCurrency(feeIncomeTotals.examFeeTotal, currencySymbol)}
                        </td>
                        <td className="p-2 text-right font-mono font-bold text-slate-900">
                          {formatCurrency(feeIncomeTotals.examFeeCollected, currencySymbol)}
                        </td>
                        <td className="p-2 text-right font-mono text-amber-700 font-semibold">
                          {formatCurrency(Math.max(0, feeIncomeTotals.examFeeTotal - feeIncomeTotals.examFeeCollected), currencySymbol)}
                        </td>
                        <td className="p-2 text-center font-bold text-slate-700">
                          {feeIncomeTotals.examFeeTotal > 0
                            ? `${Math.round((feeIncomeTotals.examFeeCollected / feeIncomeTotals.examFeeTotal) * 100)}%`
                            : 'N/A'}
                        </td>
                      </tr>
                      {netFinancials.extraIncomeTotal > 0 && (
                        <tr>
                          <td className="p-2 font-medium text-slate-800 pl-4">
                            5. Extra Income from Other Sources (PTA, Uniforms, Grants, etc.)
                          </td>
                          <td className="p-2 text-right font-mono text-slate-600">
                            {formatCurrency(netFinancials.extraIncomeTotal, currencySymbol)}
                          </td>
                          <td className="p-2 text-right font-mono font-bold text-emerald-700">
                            {formatCurrency(netFinancials.extraIncomeTotal, currencySymbol)}
                          </td>
                          <td className="p-2 text-right font-mono text-slate-400">
                            —
                          </td>
                          <td className="p-2 text-center font-bold text-emerald-700">
                            100%
                          </td>
                        </tr>
                      )}
                      <tr className="bg-emerald-50/50 font-bold border-t-2 border-slate-300">
                        <td className="p-2 text-emerald-950 uppercase">
                          Total Gross Operating Cash Inflow (A)
                        </td>
                        <td className="p-2 text-right font-mono text-emerald-900">
                          {formatCurrency(netFinancials.totalIncomeExpected, currencySymbol)}
                        </td>
                        <td className="p-2 text-right font-mono text-emerald-900 text-sm">
                          {formatCurrency(netFinancials.totalIncomeCollected, currencySymbol)}
                        </td>
                        <td className="p-2 text-right font-mono text-amber-800">
                          {formatCurrency(netFinancials.totalIncomeOutstanding, currencySymbol)}
                        </td>
                        <td className="p-2 text-center font-mono text-emerald-900">
                          {netFinancials.totalIncomeExpected > 0
                            ? `${Math.round((netFinancials.totalIncomeCollected / netFinancials.totalIncomeExpected) * 100)}%`
                            : '0%'}
                        </td>
                      </tr>

                      {/* PART B: OPERATING EXPENDITURES */}
                      <tr className="bg-slate-50/70 font-bold text-slate-900">
                        <td colSpan={5} className="p-2 uppercase tracking-wider text-[11px] bg-slate-100/70">
                          B. Operating Expenditures & Overheads
                        </td>
                      </tr>
                      <tr>
                        <td className="p-2 font-medium text-slate-800 pl-4">
                          1. Teaching & Non-Teaching Staff Salary (Payroll Disbursed)
                        </td>
                        <td className="p-2 text-right font-mono text-slate-400">—</td>
                        <td className="p-2 text-right font-mono font-bold text-rose-700">
                          {formatCurrency(netFinancials.payrollDisbursed, currencySymbol)}
                        </td>
                        <td className="p-2 text-right font-mono text-slate-400">—</td>
                        <td className="p-2 text-center text-slate-500 font-mono">
                          {netFinancials.totalExpenses > 0
                            ? `${Math.round((netFinancials.payrollDisbursed / netFinancials.totalExpenses) * 100)}% exp`
                            : '0%'}
                        </td>
                      </tr>
                      <tr>
                        <td className="p-2 font-medium text-slate-800 pl-4">
                          2. Institutional Operating Overheads (Fuel, Repairs, Exams, etc.)
                        </td>
                        <td className="p-2 text-right font-mono text-slate-400">—</td>
                        <td className="p-2 text-right font-mono font-bold text-rose-700">
                          {formatCurrency(netFinancials.otherExpensesTotal, currencySymbol)}
                        </td>
                        <td className="p-2 text-right font-mono text-slate-400">—</td>
                        <td className="p-2 text-center text-slate-500 font-mono">
                          {netFinancials.totalExpenses > 0
                            ? `${Math.round((netFinancials.otherExpensesTotal / netFinancials.totalExpenses) * 100)}% exp`
                            : '0%'}
                        </td>
                      </tr>
                      <tr className="bg-rose-50/50 font-bold border-t-2 border-slate-300">
                        <td className="p-2 text-rose-950 uppercase">
                          Total Operating Expenditures (B)
                        </td>
                        <td className="p-2 text-right font-mono text-slate-400">—</td>
                        <td className="p-2 text-right font-mono text-rose-800 text-sm">
                          {formatCurrency(netFinancials.totalExpenses, currencySymbol)}
                        </td>
                        <td className="p-2 text-right font-mono text-slate-400">—</td>
                        <td className="p-2 text-center font-mono text-rose-800">100%</td>
                      </tr>

                      {/* PART C: NET AUDITED POSITION */}
                      <tr className="bg-slate-900 text-white font-bold border-t-2 border-slate-900">
                        <td className="p-2.5 uppercase tracking-wider text-xs">
                          Net Operating Surplus / (Deficit) [A - B]
                        </td>
                        <td className="p-2.5 text-right font-mono text-slate-300">—</td>
                        <td className="p-2.5 text-right font-mono text-sm sm:text-base text-emerald-400">
                          {netFinancials.netOperatingSurplus >= 0 ? '+' : ''}
                          {formatCurrency(netFinancials.netOperatingSurplus, currencySymbol)}
                        </td>
                        <td className="p-2.5 text-right font-mono text-slate-300">—</td>
                        <td className="p-2.5 text-center font-mono text-emerald-400 text-xs">
                          Margin: {netFinancials.netMarginPercentage}%
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 4. CLASS-BY-CLASS REVENUE & ARREARS SCHEDULE */}
            {showClassLedger && (
              <div className="mb-6 print-avoid-break">
                <div className="flex items-center justify-between mb-3 border-b border-slate-200 pb-1.5">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                    <Building className="w-4 h-4 text-slate-700" />
                    <span>Section 3: Class-by-Class Revenue & Arrears Schedule</span>
                  </h3>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                    {classSummaries.length} Classes Audited
                  </span>
                </div>

                <div className="border border-slate-300 rounded-xl overflow-x-auto text-xs">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-slate-100 text-slate-800 border-b border-slate-300 font-bold">
                        <th className="p-2 text-left">Class Name</th>
                        <th className="p-2 text-center">Enrolled</th>
                        <th className="p-2 text-right">Gross Expected</th>
                        <th className="p-2 text-right">Paid (Inflow)</th>
                        <th className="p-2 text-right">Outstanding (Arrears)</th>
                        <th className="p-2 text-center">Rate</th>
                        <th className="p-2 text-center">Cleared / Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {classSummaries.map((c) => (
                        <tr key={c.className} className="hover:bg-slate-50">
                          <td className="p-2 font-bold text-slate-900">{c.className}</td>
                          <td className="p-2 text-center text-slate-600 font-mono">{c.studentCount}</td>
                          <td className="p-2 text-right font-mono text-slate-600">
                            {formatCurrency(c.totalFees, currencySymbol)}
                          </td>
                          <td className="p-2 text-right font-mono font-bold text-slate-900">
                            {formatCurrency(c.totalPaid, currencySymbol)}
                          </td>
                          <td className="p-2 text-right font-mono text-amber-700 font-semibold">
                            {formatCurrency(c.totalBalance, currencySymbol)}
                          </td>
                          <td className="p-2 text-center">
                            <span
                              className={`px-1.5 py-0.5 rounded text-[10px] font-bold font-mono ${
                                c.collectionRate >= 80
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : c.collectionRate >= 50
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-rose-100 text-rose-800'
                              }`}
                            >
                              {c.collectionRate}%
                            </span>
                          </td>
                          <td className="p-2 text-center text-slate-600 text-[11px] font-mono">
                            {c.fullyPaidCount} / {c.studentCount}
                          </td>
                        </tr>
                      ))}

                      {/* Grand Total Row */}
                      <tr className="bg-slate-900 text-white font-bold border-t-2 border-slate-900">
                        <td className="p-2.5 uppercase">Grand Total (All Classes)</td>
                        <td className="p-2.5 text-center font-mono">{scopedStudents.length}</td>
                        <td className="p-2.5 text-right font-mono text-slate-300">
                          {formatCurrency(netFinancials.totalIncomeExpected, currencySymbol)}
                        </td>
                        <td className="p-2.5 text-right font-mono text-emerald-400">
                          {formatCurrency(netFinancials.totalIncomeCollected, currencySymbol)}
                        </td>
                        <td className="p-2.5 text-right font-mono text-amber-300">
                          {formatCurrency(netFinancials.totalIncomeOutstanding, currencySymbol)}
                        </td>
                        <td className="p-2.5 text-center font-mono text-emerald-400">
                          {netFinancials.totalIncomeExpected > 0
                            ? `${Math.round((netFinancials.totalIncomeCollected / netFinancials.totalIncomeExpected) * 100)}%`
                            : '0%'}
                        </td>
                        <td className="p-2.5 text-center font-mono text-slate-300 text-[11px]">
                          {paymentDistribution.fullyPaid} / {scopedStudents.length} ({paymentDistribution.fullyPaidPercent}%)
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 5. ITEMIZATION OF OPERATING OVERHEADS & EXPENSE HEADS */}
            {showExpensesBreakdown && expensesByCategory.length > 0 && (
              <div className="mb-6 print-avoid-break">
                <div className="flex items-center justify-between mb-3 border-b border-slate-200 pb-1.5">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-slate-700" />
                    <span>Section 4: Operating Expenditures Itemization by Budget Head</span>
                  </h3>
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">
                    Total: {formatCurrency(netFinancials.otherExpensesTotal, currencySymbol)} ({scopedExpenses.length} Records)
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  {expensesByCategory.map((cat) => {
                    const percentOfOverheads =
                      netFinancials.otherExpensesTotal > 0
                        ? Math.round((cat.amount / netFinancials.otherExpensesTotal) * 1000) / 10
                        : 0;

                    return (
                      <div
                        key={cat.label}
                        className="bg-slate-50 border border-slate-200 p-2.5 rounded-xl flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <span className="font-bold text-slate-900 truncate block">
                            {cat.label}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {cat.count} recorded transaction{cat.count === 1 ? '' : 's'}
                          </span>
                        </div>

                        <div className="text-right shrink-0 font-mono">
                          <span className="font-bold text-slate-900 block">
                            {formatCurrency(cat.amount, currencySymbol)}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {percentOfOverheads}% of overheads
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 6. STATUTORY BURSARY CERTIFICATION & AUDIT SIGN-OFFS */}
            {showSignatures && (
              <div className="mt-8 pt-6 border-t-2 border-slate-900 print-avoid-break">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-[11px] text-slate-600 mb-6 italic">
                  <strong>Certification of Accuracy:</strong> I hereby certify that the above Statement of
                  Comprehensive Financial Performance, revenue billing, fee inflows, staff payroll
                  disbursals, and operating overheads presents a true, fair, and audited position of the
                  accounts of <strong>{schoolName}</strong> for the specified academic period.
                </div>

                <div className="grid grid-cols-3 gap-6 pt-4 text-xs">
                  {/* Bursar Sign */}
                  <div>
                    <div className="h-12 flex items-end">
                      <span className="font-serif italic font-bold text-slate-700 text-sm">
                        {bursarName}
                      </span>
                    </div>
                    <div className="border-b-2 border-slate-900 mb-1.5"></div>
                    <p className="font-bold text-slate-900">Bursar & Financial Controller</p>
                    <p className="text-[10px] text-slate-500">Name: {bursarName}</p>
                    <p className="text-[10px] text-slate-500">Date: {getTodayDateString()}</p>
                  </div>

                  {/* Principal / Director Sign */}
                  <div>
                    <div className="h-12 flex items-end">
                      <span className="font-serif italic text-slate-400 text-xs">
                        [Official Signature]
                      </span>
                    </div>
                    <div className="border-b-2 border-slate-900 mb-1.5"></div>
                    <p className="font-bold text-slate-900">Principal / Head of School</p>
                    <p className="text-[10px] text-slate-500">Verified & Approved</p>
                    <p className="text-[10px] text-slate-500">Official Stamp / Seal</p>
                  </div>

                  {/* Auditor / Governing Board Sign */}
                  <div>
                    <div className="h-12 flex items-end">
                      <span className="font-serif italic text-slate-400 text-xs">
                        [Audit Seal / Board Sign]
                      </span>
                    </div>
                    <div className="border-b-2 border-slate-900 mb-1.5"></div>
                    <p className="font-bold text-slate-900">Internal Audit / Governing Council</p>
                    <p className="text-[10px] text-slate-500">Financial Audit Clearance</p>
                    <p className="text-[10px] text-slate-500">Stamp ID: {reportRefCode}</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
