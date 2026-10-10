/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { 
  TrendingUp, 
  DollarSign, 
  Filter, 
  Download, 
  Printer, 
  Calendar, 
  WalletCards, 
  PieChart as PieChartIcon, 
  BarChart3, 
  Layers, 
  ArrowUpRight, 
  ArrowDownRight, 
  CheckCircle2, 
  Percent, 
  Coins, 
  Receipt,
  Sparkles,
  FileText,
  Building,
  ShieldCheck,
  Search,
  Landmark,
  FileSpreadsheet
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  ComposedChart,
  Line
} from 'recharts';
import { StudentPaymentRecord, BursarSession, SchoolProfile, ExpenseItem, ExtraIncomeItem, PayrollRecord, StaffMember } from '../types';
import { 
  formatCurrency, 
  calculateClassSummaries, 
  calculateOverallAnalytics,
  deriveFeeBreakdown,
  getTodayDateString
} from '../services/calculations';
import { downloadCsvBackup } from '../services/backupService';
import { getStoredPayrollRecords, saveStoredPayrollRecords, getStoredStaff, saveStoredStaff, applyCloudStaff, applyCloudPayroll } from '../services/payrollService';
import {
  getStoredExpenses,
  saveStoredExpenses,
  getStoredExtraIncomes,
  saveStoredExtraIncomes,
  calculateNetFinancials,
  buildBankTransactionHistory,
  exportBankTransactionHistory,
  EXPENSE_CATEGORIES,
  normalizeExpenseTerm
} from '../services/expenseService';
import { getStoredTermSchedule, getFeeCollectionTimelineStatus } from '../services/termScheduleService';
import {
  loadExpensesFromFirestore,
  loadExtraIncomesFromFirestore,
  loadPayrollFromFirestore,
  loadStaffFromFirestore,
  subscribeExpensesFromFirestore,
  subscribeExtraIncomesFromFirestore,
  subscribePayrollFromFirestore,
  subscribeStaffFromFirestore,
} from '../services/firebase';
import { ExpenseTrackerCard } from './ExpenseTrackerCard';
import { PrintableFinancialReportModal } from './PrintableFinancialReportModal';

interface AnalyticsViewProps {
  students: StudentPaymentRecord[];
  session: BursarSession;
  activeSchool?: SchoolProfile;
  onSelectStudent?: (student: StudentPaymentRecord) => void;
  onFilterByClassInList?: (className: string) => void;
  onOpenRollover?: () => void;
  onOpenPayroll?: () => void;
}

// Chart color palette
const COLORS = [
  '#0f172a', // Slate 900
  '#059669', // Emerald 600
  '#2563eb', // Blue 600
  '#d97706', // Amber 600
  '#7c3aed', // Violet 600
  '#db2777', // Pink 600
  '#0891b2', // Cyan 600
  '#ea580c', // Orange 600
  '#4f46e5', // Indigo 600
  '#16a34a', // Green 600
  '#9333ea', // Purple 600
];

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  students,
  session,
  activeSchool,
  onOpenPayroll,
}) => {
  const [selectedTerm, setSelectedTerm] = useState<string>('all');
  const [chartTab, setChartTab] = useState<'overview' | 'classes' | 'breakdowns'>('overview');
  const [isFinancialReportModalOpen, setIsFinancialReportModalOpen] = useState<boolean>(false);

  const schoolId = activeSchool?.id || session.schoolId || 'dominion-group';
  const currencySymbol = activeSchool?.currencySymbol || session.currencySymbol || '₦';

  const [allExpenses, setAllExpenses] = useState<ExpenseItem[]>(() => getStoredExpenses(schoolId));
  const [allExtraIncomes, setAllExtraIncomes] = useState<ExtraIncomeItem[]>(() => getStoredExtraIncomes(schoolId));
  const [payrollRecords, setPayrollRecords] = useState<PayrollRecord[]>(() => getStoredPayrollRecords(schoolId));
  const [staffList, setStaffList] = useState<StaffMember[]>(() => getStoredStaff(schoolId));

  // Bank-style Transaction History filters
  const [txTypeFilter, setTxTypeFilter] = useState<'ALL' | 'CREDIT' | 'DEBIT'>('ALL');
  const [txSourceFilter, setTxSourceFilter] = useState<'all' | 'student_fee' | 'extra_income' | 'expense' | 'payroll'>('all');
  const [txSearchQuery, setTxSearchQuery] = useState<string>('');
  const [txStartDate, setTxStartDate] = useState<string>('');
  const [txEndDate, setTxEndDate] = useState<string>('');

  // Real-time synchronization from real Cloud Database (Firestore)
  useEffect(() => {
    // Initial fetch to ensure up-to-date data
    loadExpensesFromFirestore(schoolId)
      .then((cloudExpenses) => {
        if (Array.isArray(cloudExpenses) && cloudExpenses.length > 0) {
          setAllExpenses(cloudExpenses);
          saveStoredExpenses(cloudExpenses, schoolId);
        }
      })
      .catch((err) => console.warn('[Analytics Firestore Note] Expenses load error:', err));

    loadExtraIncomesFromFirestore(schoolId)
      .then((cloudIncomes) => {
        if (Array.isArray(cloudIncomes) && cloudIncomes.length > 0) {
          setAllExtraIncomes(cloudIncomes);
          saveStoredExtraIncomes(cloudIncomes, schoolId);
        }
      })
      .catch((err) => console.warn('[Analytics Firestore Note] Extra incomes load error:', err));

    loadPayrollFromFirestore(schoolId)
      .then((cloudPayroll) => {
        if (Array.isArray(cloudPayroll) && cloudPayroll.length > 0) {
          setPayrollRecords(applyCloudPayroll(cloudPayroll, schoolId));
        }
      })
      .catch((err) => console.warn('[Analytics Firestore Note] Payroll load error:', err));

    loadStaffFromFirestore(schoolId)
      .then((cloudStaff) => {
        if (Array.isArray(cloudStaff) && cloudStaff.length > 0) {
          setStaffList(applyCloudStaff(cloudStaff, schoolId));
        }
      })
      .catch((err) => console.warn('[Analytics Firestore Note] Staff load error:', err));

    // Live subscription to Firestore changes
    const unsubExpenses = subscribeExpensesFromFirestore(schoolId, (liveExpenses) => {
      if (Array.isArray(liveExpenses)) {
        setAllExpenses(liveExpenses);
        saveStoredExpenses(liveExpenses, schoolId);
      }
    });

    const unsubExtraIncomes = subscribeExtraIncomesFromFirestore(schoolId, (liveIncomes) => {
      if (Array.isArray(liveIncomes)) {
        setAllExtraIncomes(liveIncomes);
        saveStoredExtraIncomes(liveIncomes, schoolId);
      }
    });

    const unsubPayroll = subscribePayrollFromFirestore(schoolId, (livePayroll) => {
      if (Array.isArray(livePayroll)) {
        setPayrollRecords(applyCloudPayroll(livePayroll, schoolId));
      }
    });

    const unsubStaff = subscribeStaffFromFirestore(schoolId, (liveStaff) => {
      if (Array.isArray(liveStaff)) {
        setStaffList(applyCloudStaff(liveStaff, schoolId));
      }
    });

    return () => {
      if (typeof unsubExpenses === 'function') unsubExpenses();
      if (typeof unsubExtraIncomes === 'function') unsubExtraIncomes();
      if (typeof unsubPayroll === 'function') unsubPayroll();
      if (typeof unsubStaff === 'function') unsubStaff();
    };
  }, [schoolId]);

  // Extract available unique terms
  const availableTerms = useMemo(() => {
    const set = new Set<string>();
    students.forEach((s) => {
      if (s?.term && s.term.trim()) set.add(s.term.trim());
    });
    return Array.from(set).sort();
  }, [students]);

  // Filtered student records according to term selection
  const scopedStudents = useMemo(() => {
    if (selectedTerm === 'all') return students;
    return students.filter((s) => (s?.term || '').trim().toLowerCase() === selectedTerm.toLowerCase());
  }, [students, selectedTerm]);

  // High-level analytics
  const analytics = useMemo(() => {
    return calculateOverallAnalytics(scopedStudents, activeSchool);
  }, [scopedStudents, activeSchool]);

  // Specific Fee category totals for expense calculation
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

  // Stored expenses normalized by term
  const storedExpenses = useMemo(() => {
    if (selectedTerm === 'all') return allExpenses;
    const targetNorm = normalizeExpenseTerm(selectedTerm);
    return allExpenses.filter((e) => {
      if (!e.term || e.term.toLowerCase().trim() === 'all terms') return true;
      return normalizeExpenseTerm(e.term) === targetNorm;
    });
  }, [allExpenses, selectedTerm]);

  // Stored extra incomes normalized by term
  const storedExtraIncomes = useMemo(() => {
    if (selectedTerm === 'all') return allExtraIncomes;
    const targetNorm = normalizeExpenseTerm(selectedTerm);
    return allExtraIncomes.filter((inc) => {
      if (!inc.term || inc.term.toLowerCase().trim() === 'all terms') return true;
      return normalizeExpenseTerm(inc.term) === targetNorm;
    });
  }, [allExtraIncomes, selectedTerm]);

  // Scoped payroll records for transaction history & disbursed calculation
  const scopedPayrollRecords = useMemo(() => {
    const validStaffIds = new Set(staffList.map((s) => s.id));
    const liveRecords = payrollRecords.filter((r) => validStaffIds.has(r.staffId));
    if (selectedTerm === 'all') return liveRecords;
    return liveRecords.filter(
      (r) => (r.term || '').toLowerCase().trim() === selectedTerm.toLowerCase().trim()
    );
  }, [payrollRecords, staffList, selectedTerm]);

  // Payroll disbursed calculation (using real-time Firestore-backed records, defended against orphaned records)
  const payrollDisbursed = useMemo(() => {
    return scopedPayrollRecords.reduce((acc, r) => acc + (r.amountPaid || 0), 0);
  }, [scopedPayrollRecords]);

  // Complete Net Financials: Income vs Expenses vs Net Income (Income - Expenses)
  const netFinancials = useMemo(() => {
    return calculateNetFinancials(feeIncomeTotals, payrollDisbursed, storedExpenses, storedExtraIncomes);
  }, [feeIncomeTotals, payrollDisbursed, storedExpenses, storedExtraIncomes]);

  // Bank-Style Transaction History Statement
  const bankTransactions = useMemo(() => {
    return buildBankTransactionHistory({
      students: scopedStudents,
      extraIncomes: storedExtraIncomes,
      expenses: storedExpenses,
      payrollRecords: scopedPayrollRecords,
      activeSchool,
    });
  }, [scopedStudents, storedExtraIncomes, storedExpenses, scopedPayrollRecords, activeSchool]);

  const filteredTransactions = useMemo(() => {
    return bankTransactions.filter((tx) => {
      if (txTypeFilter !== 'ALL' && tx.type !== txTypeFilter) return false;
      if (txSourceFilter !== 'all' && tx.sourceType !== txSourceFilter) return false;
      if (txStartDate && tx.date < txStartDate) return false;
      if (txEndDate && tx.date > txEndDate) return false;
      if (txSearchQuery.trim()) {
        const q = txSearchQuery.toLowerCase().trim();
        const match =
          tx.description.toLowerCase().includes(q) ||
          tx.counterparty.toLowerCase().includes(q) ||
          tx.reference.toLowerCase().includes(q) ||
          tx.category.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [bankTransactions, txTypeFilter, txSourceFilter, txStartDate, txEndDate, txSearchQuery]);

  const txTotals = useMemo(() => {
    let totalCredit = 0;
    let totalDebit = 0;
    filteredTransactions.forEach((tx) => {
      if (tx.type === 'CREDIT') totalCredit += tx.amount;
      else totalDebit += tx.amount;
    });
    return {
      totalCredit,
      totalDebit,
      netBalance: totalCredit - totalDebit,
    };
  }, [filteredTransactions]);

  // Term schedule & fee collection timeline status
  const currentSchedule = useMemo(() => {
    const termKey = selectedTerm === 'all' ? (availableTerms[0] || 'First Term') : selectedTerm;
    return getStoredTermSchedule(termKey, session.schoolName, schoolId);
  }, [selectedTerm, availableTerms, session.schoolName, schoolId]);

  const collectionStatus = useMemo(() => {
    return getFeeCollectionTimelineStatus(currentSchedule);
  }, [currentSchedule]);

  // Class summaries for class charts
  const classSummaries = useMemo(() => {
    const raw = calculateClassSummaries(scopedStudents, activeSchool);
    return [...raw].sort((a, b) => b.totalPaid - a.totalPaid);
  }, [scopedStudents, activeSchool]);

  // Data for Cashflow Comparison Chart: Income, Expenses, Net Income
  const cashflowComparisonData = useMemo(() => {
    return [
      {
        name: 'Total Income',
        amount: netFinancials.totalIncomeCollected,
        fill: '#059669', // Emerald
      },
      {
        name: 'Total Expenses',
        amount: netFinancials.totalExpenses,
        fill: '#e11d48', // Rose
      },
      {
        name: 'Net Income (Profit)',
        amount: netFinancials.netOperatingSurplus,
        fill: netFinancials.netOperatingSurplus >= 0 ? '#0f172a' : '#dc2626', // Slate or Red
      },
    ];
  }, [netFinancials]);

  // Data for School Fee Payment Per Class Chart
  const classFeeChartData = useMemo(() => {
    return classSummaries.map((c) => ({
      className: c.className,
      paid: c.totalPaid,
      balance: c.totalBalance,
      expected: c.totalFees,
      collectionRate: c.collectionRate,
      students: c.studentCount,
    }));
  }, [classSummaries]);

  // Data for Income Streams Distribution
  const incomeBreakdownData = useMemo(() => {
    const items = [
      { name: 'Tuition / School Fees', value: netFinancials.schoolFeeIncome },
      { name: 'Admission Fees', value: netFinancials.admissionFeeIncome },
      { name: 'Lesson Fees', value: netFinancials.lessonFeeIncome },
      { name: 'Exam Fees', value: netFinancials.examFeeIncome },
      { name: 'Extra / Other Income', value: netFinancials.extraIncomeTotal },
    ].filter((item) => item.value > 0);

    return items.length > 0 ? items : [{ name: 'Tuition Fees', value: 1 }];
  }, [netFinancials]);

  // Data for Operating Expense Categories Distribution
  const expenseBreakdownData = useMemo(() => {
    const map = new Map<string, number>();

    if (payrollDisbursed > 0) {
      map.set('Staff Salaries & Payroll', payrollDisbursed);
    }

    storedExpenses.forEach((exp) => {
      const catLabel = exp.categoryLabel || exp.category || 'Other Operating Expense';
      const prev = map.get(catLabel) || 0;
      map.set(catLabel, prev + (Number(exp.amount) || 0));
    });

    const list: { name: string; value: number }[] = [];
    map.forEach((value, name) => {
      if (value > 0) list.push({ name, value });
    });

    return list.sort((a, b) => b.value - a.value);
  }, [storedExpenses, payrollDisbursed]);

  const handlePrintAuditReport = () => {
    try {
      if (typeof window !== 'undefined' && typeof window.print === 'function') {
        window.print();
      }
    } catch (e) {
      console.warn('Print error:', e);
    }
  };

  const handleDownloadCsv = () => {
    downloadCsvBackup(scopedStudents, session, { term: selectedTerm !== 'all' ? selectedTerm : undefined });
  };

  // Custom Chart Tooltip
  const CustomCurrencyTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-slate-900 text-white p-3 rounded-xl shadow-xl text-xs border border-slate-700">
          <p className="font-bold text-slate-200 mb-1">{label || payload[0]?.name}</p>
          {payload.map((entry: any, index: number) => (
            <div key={`item-${index}`} className="flex items-center justify-between gap-4 font-mono">
              <span style={{ color: entry.color || entry.fill }}>{entry.name}:</span>
              <span className="font-bold">{formatCurrency(entry.value, currencySymbol)}</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="px-4 py-4 space-y-6 pb-28">
      {/* Top Controls & Filter Bar */}
      <div className="flex items-center justify-between gap-2 flex-wrap no-print">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-white p-1 rounded-2xl border border-slate-200 shadow-xs">
            <Filter className="w-3.5 h-3.5 text-slate-400 ml-2" />
            <select
              id="analytics-term-filter"
              value={selectedTerm}
              onChange={(e) => setSelectedTerm(e.target.value)}
              className="text-xs font-bold text-slate-800 bg-transparent pr-3 py-1 focus:outline-none cursor-pointer"
            >
              <option value="all">All Terms Combined</option>
              {availableTerms.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div className="hidden sm:flex items-center bg-white p-1 rounded-2xl border border-slate-200 shadow-xs">
            <button
              onClick={() => setChartTab('overview')}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                chartTab === 'overview'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Income vs Expenses
            </button>
            <button
              onClick={() => setChartTab('classes')}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                chartTab === 'classes'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Class Payments
            </button>
            <button
              onClick={() => setChartTab('breakdowns')}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                chartTab === 'breakdowns'
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Category Shares
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadCsv}
            id="analytics-export-csv-btn"
            title="Download CSV Backup"
            className="p-2 bg-white hover:bg-slate-100 text-slate-700 rounded-xl border border-slate-200 text-xs font-semibold flex items-center gap-1.5 active:scale-95 transition-all shadow-xs cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>
          
          <button
            onClick={() => setIsFinancialReportModalOpen(true)}
            id="analytics-financial-report-btn"
            title="Open Official Printable Financial Statement"
            className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 active:scale-95 transition-all shadow-sm shadow-emerald-950/20 cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Print Financial Report</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 1. EXPENSE TRACKER CARD (Retained as requested)                           */}
      {/* ========================================================================= */}
      <ExpenseTrackerCard
        session={session}
        activeSchool={activeSchool}
        selectedTerm={selectedTerm}
        incomeTotals={feeIncomeTotals}
        payrollDisbursed={payrollDisbursed}
        onOpenPayroll={onOpenPayroll}
        onExpensesChange={setAllExpenses}
        onExtraIncomesChange={setAllExtraIncomes}
      />

      {/* ========================================================================= */}
      {/* 2. MAIN CASHFLOW DASHBOARD: Total Expenses, Total Income & Net Income     */}
      {/* ========================================================================= */}
      <section className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              Financial Cashflow Dashboard
            </span>
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <span>Total Income, Total Expenses & Net Operating Income</span>
            </h2>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 font-semibold">
              {selectedTerm === 'all' ? 'All Academic Terms' : selectedTerm}
            </span>
          </div>
        </div>

        {/* 3 Prominent Cashflow Metric Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {/* 1. Total Income */}
          <div className="bg-emerald-50/60 border border-emerald-200/80 rounded-2xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase text-emerald-800 tracking-wider">
                Total Income Collected
              </span>
              <div className="w-7 h-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center">
                <ArrowUpRight className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-2xl font-black text-emerald-950 font-mono tracking-tight">
                {formatCurrency(netFinancials.totalIncomeCollected, currencySymbol)}
              </div>
              <p className="text-[11px] text-emerald-700 mt-1 font-medium">
                Tuition, lessons, admissions, exams{netFinancials.extraIncomeTotal > 0 ? ` + ${formatCurrency(netFinancials.extraIncomeTotal, currencySymbol)} extra income` : ' & extra income'}
              </p>
            </div>
          </div>

          {/* 2. Total Expenses */}
          <div className="bg-rose-50/60 border border-rose-200/80 rounded-2xl p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase text-rose-800 tracking-wider">
                Total Expenses
              </span>
              <div className="w-7 h-7 rounded-lg bg-rose-600 text-white flex items-center justify-center">
                <ArrowDownRight className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-2xl font-black text-rose-950 font-mono tracking-tight">
                {formatCurrency(netFinancials.totalExpenses, currencySymbol)}
              </div>
              <p className="text-[11px] text-rose-700 mt-1 font-medium">
                Operating expenses + Staff salaries paid
              </p>
            </div>
          </div>

          {/* 3. Net Income (Expenses minus Income / Net Operating Surplus) */}
          <div className={`border rounded-2xl p-4 flex flex-col justify-between ${
            netFinancials.netOperatingSurplus >= 0
              ? 'bg-slate-900 text-white border-slate-800'
              : 'bg-rose-900 text-white border-rose-800'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Net Operating Income (Income - Expenses)
              </span>
              <div className="w-7 h-7 rounded-lg bg-white/10 text-white flex items-center justify-center">
                <Coins className="w-4 h-4" />
              </div>
            </div>
            <div>
              <div className="text-2xl font-black font-mono tracking-tight">
                {formatCurrency(netFinancials.netOperatingSurplus, currencySymbol)}
              </div>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  netFinancials.netOperatingSurplus >= 0
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                }`}>
                  {netFinancials.netOperatingSurplus >= 0 ? 'Surplus / Profit' : 'Operating Deficit'}
                </span>
                <span className="text-[11px] text-slate-300 font-mono">
                  {netFinancials.netMarginPercentage}% margin
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Printable Official Financial Report Banner Callout */}
        <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-900">
                Official School Financial Statement & Bursary Audit Report
              </h4>
              <p className="text-[11px] text-slate-600">
                Generate an accredited, formal institutional performance statement with P&L, class arrears ledger & auditor certification.
              </p>
            </div>
          </div>

          <button
            onClick={() => setIsFinancialReportModalOpen(true)}
            id="analytics-open-statement-modal-btn"
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-2 active:scale-95 transition-all shadow-xs cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 text-emerald-400" />
            <span>Generate Official Report</span>
          </button>
        </div>

        {/* Visual Chart: Income vs Expenses vs Net Income */}
        <div className="pt-2">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <BarChart3 className="w-4 h-4 text-slate-500" />
            <span>Cashflow Comparison Visual Chart</span>
          </h3>

          <div className="h-72 w-full bg-slate-50/70 border border-slate-100 rounded-2xl p-3">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cashflowComparisonData} margin={{ top: 20, right: 30, left: 20, bottom: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis 
                  dataKey="name" 
                  tick={{ fill: '#475569', fontSize: 12, fontWeight: 700 }}
                  axisLine={{ stroke: '#cbd5e1' }}
                />
                <YAxis 
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  tickFormatter={(val) => `${currencySymbol}${Number(val).toLocaleString()}`}
                  axisLine={{ stroke: '#cbd5e1' }}
                />
                <Tooltip content={<CustomCurrencyTooltip />} />
                <Bar 
                  dataKey="amount" 
                  radius={[8, 8, 0, 0]}
                  barSize={64}
                >
                  {cashflowComparisonData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 3. SCHOOL FEE PAYMENT PER CLASS (CHARTS)                                  */}
      {/* ========================================================================= */}
      <section className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
              Class Breakdown & Collections
            </span>
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <span>School Fee Payment Per Class</span>
            </h2>
            <p className="text-xs text-slate-500">
              Visual comparisons of fee payments, collected revenue, and balances across {classSummaries.length} classes
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <span className="w-3 h-3 rounded-full bg-emerald-600 inline-block" />
              <span>Collected</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <span className="w-3 h-3 rounded-full bg-rose-500 inline-block" />
              <span>Balance</span>
            </div>
          </div>
        </div>

        {/* Main Class Fee Payment Bar Chart */}
        <div className="h-80 w-full bg-slate-50/70 border border-slate-100 rounded-2xl p-3">
          {classFeeChartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs text-slate-400">
              No class payment data available
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={classFeeChartData} margin={{ top: 20, right: 30, left: 20, bottom: 40 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis 
                  dataKey="className" 
                  angle={-25}
                  textAnchor="end"
                  interval={0}
                  tick={{ fill: '#334155', fontSize: 11, fontWeight: 700 }}
                  axisLine={{ stroke: '#cbd5e1' }}
                />
                <YAxis 
                  tick={{ fill: '#64748b', fontSize: 11 }}
                  tickFormatter={(val) => `${currencySymbol}${Number(val).toLocaleString()}`}
                  axisLine={{ stroke: '#cbd5e1' }}
                />
                <Tooltip content={<CustomCurrencyTooltip />} />
                <Legend 
                  verticalAlign="top" 
                  align="right" 
                  wrapperStyle={{ paddingBottom: '10px' }}
                />
                <Bar 
                  dataKey="paid" 
                  name="Fee Collected" 
                  fill="#059669" 
                  radius={[4, 4, 0, 0]} 
                  barSize={24}
                />
                <Bar 
                  dataKey="balance" 
                  name="Outstanding Balance" 
                  fill="#f43f5e" 
                  radius={[4, 4, 0, 0]} 
                  barSize={24}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Class Collection Efficiency Rate (%) Chart */}
        <div className="pt-2">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-slate-500" />
              <span>Collection Efficiency Rate Per Class (%)</span>
            </h3>
            <span className="text-[11px] text-slate-400 font-medium">100% Target</span>
          </div>

          <div className="h-64 w-full bg-slate-50/70 border border-slate-100 rounded-2xl p-3">
            {classFeeChartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                No class data
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={classFeeChartData} margin={{ top: 10, right: 30, left: 10, bottom: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis 
                    dataKey="className" 
                    angle={-20}
                    textAnchor="end"
                    interval={0}
                    tick={{ fill: '#334155', fontSize: 11, fontWeight: 700 }}
                  />
                  <YAxis 
                    domain={[0, 100]}
                    tick={{ fill: '#64748b', fontSize: 11 }}
                    tickFormatter={(val) => `${val}%`}
                  />
                  <Tooltip 
                    formatter={(value: any) => [`${value}% Cleared`, 'Collection Rate']}
                    contentStyle={{ backgroundColor: '#0f172a', borderRadius: '0.75rem', color: '#fff', border: 'none' }}
                  />
                  <Bar 
                    dataKey="collectionRate" 
                    name="Collection Rate (%)" 
                    fill="#2563eb"
                    radius={[6, 6, 0, 0]}
                    barSize={28}
                  >
                    {classFeeChartData.map((entry, index) => (
                      <Cell 
                        key={`rate-cell-${index}`} 
                        fill={entry.collectionRate >= 80 ? '#059669' : entry.collectionRate >= 50 ? '#2563eb' : '#e11d48'} 
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* 4. COMPOSITION & CATEGORY SHARES (PIE & DONUT CHARTS)                     */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Income Sources Distribution */}
        <section className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                Revenue Streams
              </span>
              <h3 className="text-sm font-extrabold text-slate-900">
                Income Sources Breakdown
              </h3>
            </div>
            <div className="p-1.5 rounded-xl bg-emerald-50 text-emerald-700">
              <PieChartIcon className="w-4 h-4" />
            </div>
          </div>

          <div className="h-64 w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={incomeBreakdownData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={85}
                  paddingAngle={4}
                  dataKey="value"
                >
                  {incomeBreakdownData.map((entry, index) => (
                    <Cell key={`income-cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip content={<CustomCurrencyTooltip />} />
                <Legend 
                  verticalAlign="bottom" 
                  layout="horizontal"
                  formatter={(value) => <span className="text-[11px] font-bold text-slate-700">{value}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* Operating Expense Distribution */}
        <section className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                Cost Allocation
              </span>
              <h3 className="text-sm font-extrabold text-slate-900">
                Expenses by Category
              </h3>
            </div>
            <div className="p-1.5 rounded-xl bg-rose-50 text-rose-700">
              <Layers className="w-4 h-4" />
            </div>
          </div>

          <div className="h-64 w-full flex items-center justify-center">
            {expenseBreakdownData.length === 0 ? (
              <div className="text-xs text-slate-400 text-center">
                No recorded expense categories yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={expenseBreakdownData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={85}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {expenseBreakdownData.map((entry, index) => (
                      <Cell key={`expense-cell-${index}`} fill={COLORS[(index + 3) % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomCurrencyTooltip />} />
                  <Legend 
                    verticalAlign="bottom" 
                    layout="horizontal"
                    formatter={(value) => <span className="text-[11px] font-bold text-slate-700">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>
      </div>

      {/* ========================================================================= */}
      {/* 5. BANK-STYLE TRANSACTION HISTORY STATEMENT & EXPORT                      */}
      {/* ========================================================================= */}
      <section className="bg-white rounded-3xl p-5 border border-slate-200 shadow-xs space-y-4 no-print">
        <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-slate-900 text-white flex items-center justify-center shrink-0">
              <Landmark className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                Institutional Account Ledger
              </span>
              <h2 className="text-base font-extrabold text-slate-900">
                Bank-Style Transaction History &amp; Statement
              </h2>
              <p className="text-xs text-slate-500">
                Complete chronological Credit (Inflow) &amp; Debit (Outflow) statement with live running balance
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() =>
                exportBankTransactionHistory(
                  filteredTransactions,
                  session,
                  'csv',
                  selectedTerm === 'all' ? 'All Terms' : selectedTerm
                )
              }
              id="export-bank-history-csv-btn"
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl border border-slate-200 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 text-slate-600" />
              <span>Export CSV</span>
            </button>
            <button
              type="button"
              onClick={() =>
                exportBankTransactionHistory(
                  filteredTransactions,
                  session,
                  'xlsx',
                  selectedTerm === 'all' ? 'All Terms' : selectedTerm
                )
              }
              id="export-bank-history-xlsx-btn"
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Export Excel (.xlsx)</span>
            </button>
          </div>
        </div>

        {/* Summary Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-3.5 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase text-emerald-800 tracking-wider block">
                Total Credit (Money In)
              </span>
              <span className="text-lg font-black font-mono text-emerald-900">
                +{formatCurrency(txTotals.totalCredit, currencySymbol)}
              </span>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800">
              CREDIT (CR)
            </span>
          </div>

          <div className="bg-rose-50/70 border border-rose-200/80 rounded-2xl p-3.5 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase text-rose-800 tracking-wider block">
                Total Debit (Money Out)
              </span>
              <span className="text-lg font-black font-mono text-rose-900">
                -{formatCurrency(txTotals.totalDebit, currencySymbol)}
              </span>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-100 text-rose-800">
              DEBIT (DR)
            </span>
          </div>

          <div className="bg-slate-900 text-white rounded-2xl p-3.5 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider block">
                Closing Book Balance
              </span>
              <span className={`text-lg font-black font-mono ${txTotals.netBalance >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                {formatCurrency(txTotals.netBalance, currencySymbol)}
              </span>
            </div>
            <span className="text-[10px] font-mono text-slate-300 bg-white/10 px-2 py-0.5 rounded-md">
              {filteredTransactions.length} {filteredTransactions.length === 1 ? 'Entry' : 'Entries'}
            </span>
          </div>
        </div>

        {/* Filters Toolbar */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {/* Type Pills */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            {(['ALL', 'CREDIT', 'DEBIT'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTxTypeFilter(t)}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  txTypeFilter === t
                    ? t === 'CREDIT'
                      ? 'bg-emerald-600 text-white'
                      : t === 'DEBIT'
                      ? 'bg-rose-600 text-white'
                      : 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t === 'ALL' ? 'All Entries' : t === 'CREDIT' ? 'Credits (In)' : 'Debits (Out)'}
              </button>
            ))}
          </div>

          {/* Source Filter */}
          <select
            value={txSourceFilter}
            onChange={(e) => setTxSourceFilter(e.target.value as any)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none cursor-pointer"
          >
            <option value="all">All Sources</option>
            <option value="student_fee">Student Fee Payments</option>
            <option value="extra_income">Extra Income Sources</option>
            <option value="expense">Operating Expenses</option>
            <option value="payroll">Staff Payroll</option>
          </select>

          {/* Date Range */}
          <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 text-xs">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="date"
              value={txStartDate}
              onChange={(e) => setTxStartDate(e.target.value)}
              title="Start Date"
              className="bg-transparent text-xs font-semibold text-slate-700 focus:outline-none"
            />
            <span className="text-slate-400">to</span>
            <input
              type="date"
              value={txEndDate}
              onChange={(e) => setTxEndDate(e.target.value)}
              title="End Date"
              className="bg-transparent text-xs font-semibold text-slate-700 focus:outline-none"
            />
          </div>

          {/* Search */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={txSearchQuery}
              onChange={(e) => setTxSearchQuery(e.target.value)}
              placeholder="Search narration, student, payer, reference..."
              className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-slate-900 focus:outline-none"
            />
          </div>
        </div>

        {/* Statement Table */}
        <div className="border border-slate-200 rounded-2xl overflow-hidden">
          {filteredTransactions.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 bg-slate-50">
              No transactions match your current filter criteria.
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-900 text-white sticky top-0 z-10">
                  <tr>
                    <th className="py-3 px-3.5 font-bold uppercase tracking-wider text-[10px]">Date</th>
                    <th className="py-3 px-3.5 font-bold uppercase tracking-wider text-[10px]">Reference</th>
                    <th className="py-3 px-3.5 font-bold uppercase tracking-wider text-[10px]">Type</th>
                    <th className="py-3 px-3.5 font-bold uppercase tracking-wider text-[10px]">Narration / Description</th>
                    <th className="py-3 px-3.5 font-bold uppercase tracking-wider text-[10px]">Payer / Recipient</th>
                    <th className="py-3 px-3.5 font-bold uppercase tracking-wider text-[10px] text-right">Credit (+)</th>
                    <th className="py-3 px-3.5 font-bold uppercase tracking-wider text-[10px] text-right">Debit (-)</th>
                    <th className="py-3 px-3.5 font-bold uppercase tracking-wider text-[10px] text-right">Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredTransactions.map((tx) => {
                    const isCredit = tx.type === 'CREDIT';
                    return (
                      <tr key={tx.id} className="hover:bg-slate-50/90 transition-colors">
                        <td className="py-2.5 px-3.5 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                          {tx.date}
                        </td>
                        <td className="py-2.5 px-3.5 font-mono text-[11px] font-bold text-slate-800 whitespace-nowrap">
                          {tx.reference}
                        </td>
                        <td className="py-2.5 px-3.5 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black tracking-wide ${
                              isCredit
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {isCredit ? 'CR' : 'DR'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3.5 max-w-[280px]">
                          <div className="font-bold text-slate-900 truncate" title={tx.description}>
                            {tx.description}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {tx.category} • {tx.paymentMethod}
                          </div>
                        </td>
                        <td className="py-2.5 px-3.5 text-slate-700 font-medium whitespace-nowrap">
                          {tx.counterparty}
                        </td>
                        <td className="py-2.5 px-3.5 text-right font-mono font-bold text-emerald-700 whitespace-nowrap">
                          {isCredit ? `+${formatCurrency(tx.amount, currencySymbol)}` : '—'}
                        </td>
                        <td className="py-2.5 px-3.5 text-right font-mono font-bold text-rose-700 whitespace-nowrap">
                          {!isCredit ? `-${formatCurrency(tx.amount, currencySymbol)}` : '—'}
                        </td>
                        <td className="py-2.5 px-3.5 text-right font-mono font-black text-slate-900 bg-slate-50/60 whitespace-nowrap">
                          {formatCurrency(tx.runningBalance, currencySymbol)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Printable Audit Sheet (Only visible when printing or in print preview) */}
      <div id="printable-financial-report" className="hidden print:block text-black bg-white p-6 space-y-4">
        <div className="border-b-2 border-black pb-3 text-center">
          <h1 className="text-2xl font-black uppercase tracking-tight">{activeSchool?.name || session.schoolName || 'DOMINION GROUP OF SCHOOLS'}</h1>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-700">OFFICIAL STATEMENT OF COMPREHENSIVE FINANCIAL PERFORMANCE & AUDIT REPORT</p>
          <p className="text-[11px] text-gray-600 mt-1">
            Term: {selectedTerm === 'all' ? 'All Academic Terms Combined' : selectedTerm} • Session: 2026/2027 • Date: {new Date().toLocaleDateString()} • Ref: FIN-AUD-{getTodayDateString().replace(/-/g, '')}
          </p>
        </div>

        {/* Financial Highlights */}
        <div className="grid grid-cols-4 gap-2 border border-slate-300 p-3 text-xs font-mono bg-slate-50">
          <div>
            <span className="block text-[10px] text-slate-500 font-sans uppercase">Gross Billed</span>
            <span className="font-bold">{formatCurrency(netFinancials.totalIncomeExpected, currencySymbol)}</span>
          </div>
          <div>
            <span className="block text-[10px] text-slate-500 font-sans uppercase">Total Collected</span>
            <span className="font-bold text-emerald-800">{formatCurrency(netFinancials.totalIncomeCollected, currencySymbol)}</span>
          </div>
          <div>
            <span className="block text-[10px] text-slate-500 font-sans uppercase">Total Outflows</span>
            <span className="font-bold text-rose-800">{formatCurrency(netFinancials.totalExpenses, currencySymbol)}</span>
          </div>
          <div>
            <span className="block text-[10px] text-slate-500 font-sans uppercase">Net Operating Position</span>
            <span className={`font-bold ${netFinancials.netOperatingSurplus >= 0 ? 'text-emerald-800' : 'text-rose-800'}`}>
              {netFinancials.netOperatingSurplus >= 0 ? '+' : ''}{formatCurrency(netFinancials.netOperatingSurplus, currencySymbol)}
            </span>
          </div>
        </div>

        {/* Operating Income & Expenditures Ledger */}
        <div className="text-xs overflow-x-auto">
          <h3 className="text-xs font-bold uppercase tracking-wider mb-1.5">1. Operating Income & Expenditures Breakdown</h3>
          <table className="w-full border-collapse border border-slate-300 text-xs">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 p-1.5 text-left">Accounting Category</th>
                <th className="border border-slate-300 p-1.5 text-right">Expected</th>
                <th className="border border-slate-300 p-1.5 text-right">Collected / Disbursed</th>
                <th className="border border-slate-300 p-1.5 text-right">Outstanding</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-slate-300 p-1.5 font-medium">Tuition / School Fees</td>
                <td className="border border-slate-300 p-1.5 text-right font-mono">{formatCurrency(feeIncomeTotals.schoolFeeTotal, currencySymbol)}</td>
                <td className="border border-slate-300 p-1.5 text-right font-mono font-bold">{formatCurrency(feeIncomeTotals.schoolFeeCollected, currencySymbol)}</td>
                <td className="border border-slate-300 p-1.5 text-right font-mono text-amber-700">{formatCurrency(Math.max(0, feeIncomeTotals.schoolFeeTotal - feeIncomeTotals.schoolFeeCollected), currencySymbol)}</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1.5 font-medium">New Admission & Registration Fees</td>
                <td className="border border-slate-300 p-1.5 text-right font-mono">{formatCurrency(feeIncomeTotals.admissionFeeTotal, currencySymbol)}</td>
                <td className="border border-slate-300 p-1.5 text-right font-mono font-bold">{formatCurrency(feeIncomeTotals.admissionFeeCollected, currencySymbol)}</td>
                <td className="border border-slate-300 p-1.5 text-right font-mono text-amber-700">{formatCurrency(Math.max(0, feeIncomeTotals.admissionFeeTotal - feeIncomeTotals.admissionFeeCollected), currencySymbol)}</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1.5 font-medium">Lesson & After-School Coaching Fees</td>
                <td className="border border-slate-300 p-1.5 text-right font-mono">{formatCurrency(feeIncomeTotals.lessonFeeTotal, currencySymbol)}</td>
                <td className="border border-slate-300 p-1.5 text-right font-mono font-bold">{formatCurrency(feeIncomeTotals.lessonFeeCollected, currencySymbol)}</td>
                <td className="border border-slate-300 p-1.5 text-right font-mono text-amber-700">{formatCurrency(Math.max(0, feeIncomeTotals.lessonFeeTotal - feeIncomeTotals.lessonFeeCollected), currencySymbol)}</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1.5 font-medium">Terminal Examination & Assessment Fees</td>
                <td className="border border-slate-300 p-1.5 text-right font-mono">{formatCurrency(feeIncomeTotals.examFeeTotal, currencySymbol)}</td>
                <td className="border border-slate-300 p-1.5 text-right font-mono font-bold">{formatCurrency(feeIncomeTotals.examFeeCollected, currencySymbol)}</td>
                <td className="border border-slate-300 p-1.5 text-right font-mono text-amber-700">{formatCurrency(Math.max(0, feeIncomeTotals.examFeeTotal - feeIncomeTotals.examFeeCollected), currencySymbol)}</td>
              </tr>
              <tr className="bg-emerald-50/70 font-bold">
                <td className="border border-slate-300 p-1.5 uppercase">Total Educational Inflow</td>
                <td className="border border-slate-300 p-1.5 text-right font-mono">{formatCurrency(netFinancials.totalIncomeExpected, currencySymbol)}</td>
                <td className="border border-slate-300 p-1.5 text-right font-mono">{formatCurrency(netFinancials.totalIncomeCollected, currencySymbol)}</td>
                <td className="border border-slate-300 p-1.5 text-right font-mono text-amber-800">{formatCurrency(netFinancials.totalIncomeOutstanding, currencySymbol)}</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1.5 font-medium text-rose-900">Teaching & Non-Teaching Staff Payroll Disbursed</td>
                <td className="border border-slate-300 p-1.5 text-right font-mono text-slate-400">—</td>
                <td className="border border-slate-300 p-1.5 text-right font-mono font-bold text-rose-800">{formatCurrency(netFinancials.payrollDisbursed, currencySymbol)}</td>
                <td className="border border-slate-300 p-1.5 text-right font-mono text-slate-400">—</td>
              </tr>
              <tr>
                <td className="border border-slate-300 p-1.5 font-medium text-rose-900">Recorded Operating Overheads (Fuel, Maintenance, Supplies)</td>
                <td className="border border-slate-300 p-1.5 text-right font-mono text-slate-400">—</td>
                <td className="border border-slate-300 p-1.5 text-right font-mono font-bold text-rose-800">{formatCurrency(netFinancials.otherExpensesTotal, currencySymbol)}</td>
                <td className="border border-slate-300 p-1.5 text-right font-mono text-slate-400">—</td>
              </tr>
              <tr className="bg-rose-50/70 font-bold">
                <td className="border border-slate-300 p-1.5 uppercase">Total School Expenditures</td>
                <td className="border border-slate-300 p-1.5 text-right font-mono text-slate-400">—</td>
                <td className="border border-slate-300 p-1.5 text-right font-mono text-rose-900">{formatCurrency(netFinancials.totalExpenses, currencySymbol)}</td>
                <td className="border border-slate-300 p-1.5 text-right font-mono text-slate-400">—</td>
              </tr>
              <tr className="bg-slate-900 text-white font-bold">
                <td className="border border-slate-900 p-1.5 uppercase">Net Operating Surplus / (Deficit)</td>
                <td className="border border-slate-900 p-1.5 text-right font-mono">—</td>
                <td className="border border-slate-900 p-1.5 text-right font-mono text-emerald-400">{netFinancials.netOperatingSurplus >= 0 ? '+' : ''}{formatCurrency(netFinancials.netOperatingSurplus, currencySymbol)}</td>
                <td className="border border-slate-900 p-1.5 text-right font-mono text-slate-300">Margin: {netFinancials.netMarginPercentage}%</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Class-by-Class Table */}
        <div className="text-xs overflow-x-auto">
          <h3 className="text-xs font-bold uppercase tracking-wider mb-1.5">2. Class-by-Class Fee Collection & Arrears Schedule</h3>
          <table className="w-full text-xs border-collapse border border-slate-300">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 p-1.5 text-left">Class Name</th>
                <th className="border border-slate-300 p-1.5 text-center">Students</th>
                <th className="border border-slate-300 p-1.5 text-right">Expected</th>
                <th className="border border-slate-300 p-1.5 text-right">Collected</th>
                <th className="border border-slate-300 p-1.5 text-right">Outstanding (Arrears)</th>
                <th className="border border-slate-300 p-1.5 text-center">Rate</th>
              </tr>
            </thead>
            <tbody>
              {classSummaries.map((c) => (
                <tr key={c.className}>
                  <td className="border border-slate-300 p-1.5 font-bold">{c.className}</td>
                  <td className="border border-slate-300 p-1.5 text-center font-mono">{c.studentCount}</td>
                  <td className="border border-slate-300 p-1.5 text-right font-mono">{formatCurrency(c.totalFees, currencySymbol)}</td>
                  <td className="border border-slate-300 p-1.5 text-right font-mono font-bold">{formatCurrency(c.totalPaid, currencySymbol)}</td>
                  <td className="border border-slate-300 p-1.5 text-right font-mono text-amber-700 font-semibold">{formatCurrency(c.totalBalance, currencySymbol)}</td>
                  <td className="border border-slate-300 p-1.5 text-center font-bold font-mono">{c.collectionRate}%</td>
                </tr>
              ))}
              <tr className="bg-slate-100 font-bold">
                <td className="border border-slate-300 p-1.5 uppercase">Grand Total</td>
                <td className="border border-slate-300 p-1.5 text-center font-mono">{scopedStudents.length}</td>
                <td className="border border-slate-300 p-1.5 text-right font-mono">{formatCurrency(netFinancials.totalIncomeExpected, currencySymbol)}</td>
                <td className="border border-slate-300 p-1.5 text-right font-mono">{formatCurrency(netFinancials.totalIncomeCollected, currencySymbol)}</td>
                <td className="border border-slate-300 p-1.5 text-right font-mono text-amber-700">{formatCurrency(netFinancials.totalIncomeOutstanding, currencySymbol)}</td>
                <td className="border border-slate-300 p-1.5 text-center font-mono">
                  {netFinancials.totalIncomeExpected > 0
                    ? `${Math.round((netFinancials.totalIncomeCollected / netFinancials.totalIncomeExpected) * 100)}%`
                    : '0%'}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Endorsements */}
        <div className="pt-8 flex justify-between text-xs">
          <div>
            <div className="w-56 border-b-2 border-slate-900 mb-1"></div>
            <p className="font-bold">Bursar: {session.bursarName || 'Bursar / Financial Controller'}</p>
            <p className="text-[10px] text-slate-500">Official Stamp & Date</p>
          </div>
          <div>
            <div className="w-56 border-b-2 border-slate-900 mb-1"></div>
            <p className="font-bold">Principal / Executive Director</p>
            <p className="text-[10px] text-slate-500">Approved & Verified</p>
          </div>
        </div>
      </div>

      {/* Modal Dialog for Interactive Financial Statement Customization & Printing */}
      <PrintableFinancialReportModal
        isOpen={isFinancialReportModalOpen}
        onClose={() => setIsFinancialReportModalOpen(false)}
        students={students}
        session={session}
        activeSchool={activeSchool}
        initialTerm={selectedTerm}
        allExpenses={allExpenses}
        allExtraIncomes={allExtraIncomes}
        payrollRecords={payrollRecords}
      />
    </div>
  );
};
