/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  DollarSign,
  Plus,
  TrendingDown,
  TrendingUp,
  Receipt,
  Trash2,
  Search,
  Download,
  Calendar,
  WalletCards,
  Fuel,
  Zap,
  Wrench,
  BookOpen,
  Printer,
  Award,
  Shield,
  Building,
  FileSpreadsheet,
  Layers,
  ArrowUpRight,
  CheckCircle2,
  X,
  RefreshCw,
  Check,
  AlertCircle,
} from 'lucide-react';
import {
  ExpenseItem,
  ExpenseCategory,
  ExtraIncomeItem,
  ExtraIncomeCategory,
  BursarSession,
  SchoolProfile,
  OverallSchoolFinancials,
} from '../types';
import {
  getStoredExpenses,
  addExpenseItem,
  deleteExpenseItem,
  saveStoredExpenses,
  getStoredExtraIncomes,
  addExtraIncomeItem,
  deleteExtraIncomeItem,
  saveStoredExtraIncomes,
  EXTRA_INCOME_CATEGORIES,
  getExtraIncomeCategoryLabel,
  calculateNetFinancials,
  EXPENSE_CATEGORIES,
  getExpenseCategoryLabel,
  parseExpenseAmount,
  normalizeExpenseTerm,
  getPendingSyncIds,
  markPendingSync,
  clearPendingSync,
  mergeCloudWithPending,
} from '../services/expenseService';
import {
  loadExpensesFromFirestore,
  saveExpenseToFirestore,
  deleteExpenseFromFirestore,
  loadExtraIncomesFromFirestore,
  saveExtraIncomeToFirestore,
  deleteExtraIncomeFromFirestore,
} from '../services/firebase';
import { formatCurrency, getTodayDateString, getCurrentAcademicSession } from '../services/calculations';
import { getCurrentTermName } from '../services/termScheduleService';

interface ExpenseTrackerCardProps {
  session: BursarSession;
  activeSchool?: SchoolProfile;
  selectedTerm: string;
  incomeTotals: {
    schoolFeeCollected: number;
    admissionFeeCollected: number;
    lessonFeeCollected: number;
    examFeeCollected: number;
    schoolFeeTotal: number;
    admissionFeeTotal: number;
    lessonFeeTotal: number;
    examFeeTotal: number;
  };
  payrollDisbursed: number;
  apiConfig?: any;
  onOpenPayroll?: () => void;
  onOpenFormulasModal?: () => void;
  onExpensesChange?: (expenses: ExpenseItem[]) => void;
  onExtraIncomesChange?: (incomes: ExtraIncomeItem[]) => void;
}

const csvCell = (value: unknown): string => {
  let text = String(value ?? '');
  // Stop spreadsheet formulas from running when the file is opened
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

export const ExpenseTrackerCard: React.FC<ExpenseTrackerCardProps> = ({
  session,
  activeSchool,
  selectedTerm,
  incomeTotals,
  payrollDisbursed,
  apiConfig: propApiConfig,
  onOpenPayroll,
  onOpenFormulasModal,
  onExpensesChange,
  onExtraIncomesChange,
}) => {
  const schoolId = activeSchool?.id || session.schoolId || 'dominion-group';
  const currencySymbol = activeSchool?.currencySymbol || session.currencySymbol || '₦';

  const [expenses, setExpenses] = useState<ExpenseItem[]>(() => getStoredExpenses(schoolId));
  const [extraIncomes, setExtraIncomes] = useState<ExtraIncomeItem[]>(() => getStoredExtraIncomes(schoolId));
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isAddIncomeModalOpen, setIsAddIncomeModalOpen] = useState(false);
  const [expenseToDelete, setExpenseToDelete] = useState<ExpenseItem | null>(null);

  // Auto-Sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSavingExpense, setIsSavingExpense] = useState(false);
  const [isSavingIncome, setIsSavingIncome] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Filter & Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');

  // New Expense Form State
  const [category, setCategory] = useState<ExpenseCategory>('generator_fuel');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(getTodayDateString());
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // New Extra Income Form State
  const [incCategory, setIncCategory] = useState<ExtraIncomeCategory>('pta_levy');
  const [incAmount, setIncAmount] = useState('');
  const [incDate, setIncDate] = useState(getTodayDateString());
  const [incPayer, setIncPayer] = useState('');
  const [incPaymentMethod, setIncPaymentMethod] = useState<'cash' | 'bank_transfer' | 'pos' | 'cheque' | 'other'>('cash');
  const [incNotes, setIncNotes] = useState('');
  const [incFormError, setIncFormError] = useState<string | null>(null);

  // Manual sync handler for pulling expenses directly from Firestore
  const handleManualSyncExpenses = async () => {
    setIsSyncing(true);
    setSyncStatus({
      type: 'success',
      message: 'Connecting to Cloud Firestore to fetch operating expenses...',
    });

    try {
      const fetched = await loadExpensesFromFirestore(schoolId);
      if (Array.isArray(fetched) && fetched.length > 0) {
        const { merged, localOnly } = mergeCloudWithPending(fetched, getStoredExpenses(schoolId), getPendingSyncIds('expense', schoolId));
        saveStoredExpenses(merged, schoolId);
        setExpenses(merged);
        onExpensesChange?.(merged);
        localOnly.forEach((rec) => { saveExpenseToFirestore(rec, schoolId).then((ok) => { if (ok) clearPendingSync('expense', rec.id, schoolId); }).catch(() => {}); });
        setSyncStatus({
          type: 'success',
          message: `Synced with Firestore: ${merged.length} operating expense record${merged.length === 1 ? '' : 's'} loaded.`,
        });
      } else {
        const local = getStoredExpenses(schoolId);
        setExpenses(local);
        setSyncStatus({
          type: 'success',
          message: `Loaded ${local.length} operating expense records.`,
        });
      }
    } catch (err: any) {
      console.warn('Manual expense sync error:', err);
      setSyncStatus({
        type: 'error',
        message: `Failed to fetch expenses: ${err?.message || 'Check network connection'}`,
      });
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncStatus(null), 4000);
    }
  };

  // Automatically pull the latest expenses & extra incomes from Firestore on mount and whenever school changes
  useEffect(() => {
    const local = getStoredExpenses(schoolId);
    setExpenses(local);
    onExpensesChange?.(local);

    const localInc = getStoredExtraIncomes(schoolId);
    setExtraIncomes(localInc);
    onExtraIncomesChange?.(localInc);

    let isMounted = true;
    setIsSyncing(true);
    Promise.all([
      loadExpensesFromFirestore(schoolId),
      loadExtraIncomesFromFirestore(schoolId),
    ])
      .then(([fetchedExp, fetchedInc]) => {
        if (!isMounted) return;
        if (Array.isArray(fetchedExp) && fetchedExp.length > 0) {
          const { merged, localOnly } = mergeCloudWithPending(fetchedExp, getStoredExpenses(schoolId), getPendingSyncIds('expense', schoolId));
          saveStoredExpenses(merged, schoolId);
          setExpenses(merged);
          onExpensesChange?.(merged);
          localOnly.forEach((rec) => { saveExpenseToFirestore(rec, schoolId).then((ok) => { if (ok) clearPendingSync('expense', rec.id, schoolId); }).catch(() => {}); });
        }
        if (Array.isArray(fetchedInc) && fetchedInc.length > 0) {
          const { merged, localOnly } = mergeCloudWithPending(fetchedInc, getStoredExtraIncomes(schoolId), getPendingSyncIds('income', schoolId));
          saveStoredExtraIncomes(merged, schoolId);
          setExtraIncomes(merged);
          onExtraIncomesChange?.(merged);
          localOnly.forEach((rec) => { saveExtraIncomeToFirestore(rec, schoolId).then((ok) => { if (ok) clearPendingSync('income', rec.id, schoolId); }).catch(() => {}); });
        }
      })
      .catch((err: any) => {
        console.warn('Auto-pull expenses/incomes from Firestore note:', err);
      })
      .finally(() => {
        if (isMounted) {
          setIsSyncing(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [schoolId]);

  // Scoped Expenses for current selected term (normalizing term names)
  const scopedExpenses = useMemo(() => {
    if (selectedTerm === 'all') return expenses;
    const targetNorm = normalizeExpenseTerm(selectedTerm);
    return expenses.filter((e) => {
      if (!e.term || e.term.toLowerCase().trim() === 'all terms') return true;
      return normalizeExpenseTerm(e.term) === targetNorm;
    });
  }, [expenses, selectedTerm]);

  // Scoped Extra Incomes for current selected term
  const scopedExtraIncomes = useMemo(() => {
    if (selectedTerm === 'all') return extraIncomes;
    const targetNorm = normalizeExpenseTerm(selectedTerm);
    return extraIncomes.filter((inc) => {
      if (!inc.term || inc.term.toLowerCase().trim() === 'all terms') return true;
      return normalizeExpenseTerm(inc.term) === targetNorm;
    });
  }, [extraIncomes, selectedTerm]);

  // Active Operating Expenses Total (Outflow) for current term
  const activeExpensesTotal = useMemo(() => {
    return scopedExpenses.reduce((acc, curr) => acc + parseExpenseAmount(curr?.amount), 0);
  }, [scopedExpenses]);

  // Combined Financials Calculation (includes Extra Income!)
  const financials: OverallSchoolFinancials = useMemo(() => {
    return calculateNetFinancials(incomeTotals, payrollDisbursed, scopedExpenses, scopedExtraIncomes);
  }, [incomeTotals, payrollDisbursed, scopedExpenses, scopedExtraIncomes]);

  // Filtered Expense List for UI Ledger
  const filteredExpenses = useMemo(() => {
    return scopedExpenses.filter((e) => {
      const matchSearch =
        !searchQuery.trim() ||
        (e.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
        (e.recipient && e.recipient.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (e.receiptVoucherRef && e.receiptVoucherRef.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchCat =
        selectedCategoryFilter === 'all' || e.category === selectedCategoryFilter;

      return matchSearch && matchCat;
    });
  }, [scopedExpenses, searchQuery, selectedCategoryFilter]);

  // Active Filtered Expenses Total
  const activeFilteredExpensesTotal = useMemo(() => {
    return filteredExpenses.reduce((acc, curr) => acc + parseExpenseAmount(curr?.amount), 0);
  }, [filteredExpenses]);

  // Expenses grouped by category with safe amount parsing
  const categoryTotals = useMemo(() => {
    const map: Record<string, number> = {};
    scopedExpenses.forEach((e) => {
      map[e.category] = (map[e.category] || 0) + parseExpenseAmount(e?.amount);
    });
    return map;
  }, [scopedExpenses]);

  // Add Expense Handler with AUTOMATIC IMMEDIATE PUSH TO GOOGLE SHEET
  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const numAmount = parseExpenseAmount(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setFormError('Please enter a valid expense amount (e.g. 15000).');
      return;
    }

    const catObj = EXPENSE_CATEGORIES.find((c) => c.id === category);
    const catLabel = catObj?.label || getExpenseCategoryLabel(category);
    const resolvedDesc = notes.trim() || catLabel;

    setIsSavingExpense(true);

    // 1. Immediately record locally
    const newExpense = addExpenseItem(
      {
        category,
        categoryLabel: catLabel,
        description: resolvedDesc,
        amount: numAmount,
        date: date || getTodayDateString(),
        paymentMethod: 'cash',
        term: selectedTerm !== 'all' ? selectedTerm : getCurrentTermName(schoolId),
        session: activeSchool?.academicSession || getCurrentAcademicSession(),
        recordedBy: session.bursarName,
        notes: notes.trim() || undefined,
      },
      schoolId
    );

    const updated = getStoredExpenses(schoolId);
    setExpenses(updated);
    onExpensesChange?.(updated);
    setIsAddModalOpen(false);

    // Reset form
    setAmount('');
    setDate(getTodayDateString());
    setNotes('');
    setCategory('generator_fuel');
    setFormError(null);
    setIsSavingExpense(false);

    // 2. AUTOMATICALLY PERSIST TO CLOUD FIRESTORE
    markPendingSync('expense', newExpense.id, schoolId);
    setSyncStatus({ type: 'success', message: 'Expense saved on this device. Syncing to the database...' });
    let cloudOk = false;
    try {
      cloudOk = await saveExpenseToFirestore(newExpense, schoolId);
      if (cloudOk) clearPendingSync('expense', newExpense.id, schoolId);
    } catch (err) {
      console.warn('Firestore expense sync note:', err);
    }
    setSyncStatus(
      cloudOk
        ? { type: 'success', message: 'Expense recorded and synced to the database.' }
        : { type: 'error', message: 'Expense saved on this device only. It will upload when you open this page with a connection.' }
    );
    setTimeout(() => setSyncStatus(null), cloudOk ? 3000 : 7000);
  };

  // Delete Expense Handler with AUTOMATIC FIRESTORE REMOVAL
  const handleDeleteExpense = async (id: string, description?: string) => {
    const updated = deleteExpenseItem(id, schoolId);
    setExpenses(updated);
    onExpensesChange?.(updated);
    setExpenseToDelete(null);

    let deleted = false;
    try {
      deleted = await deleteExpenseFromFirestore(id, schoolId);
    } catch (err) {
      console.warn('Firestore expense delete sync note:', err);
    }
    setSyncStatus(
      deleted
        ? { type: 'success', message: 'Expense removed.' }
        : { type: 'error', message: 'Expense removed on this device, but the database did not confirm. It may come back after a refresh. Delete it again with a connection.' }
    );
    setTimeout(() => setSyncStatus(null), deleted ? 3000 : 7000);
  };

  // Add Extra Income Handler
  const handleAddExtraIncome = async (e: React.FormEvent) => {
    e.preventDefault();
    setIncFormError(null);

    const numAmount = parseExpenseAmount(incAmount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setIncFormError('Please enter a valid income amount greater than zero (e.g. 25000).');
      return;
    }

    const catObj = EXTRA_INCOME_CATEGORIES.find((c) => c.id === incCategory);
    const catLabel = catObj?.label || getExtraIncomeCategoryLabel(incCategory);
    const resolvedDesc = incNotes.trim() || catLabel;

    setIsSavingIncome(true);

    const newIncome = addExtraIncomeItem(
      {
        category: incCategory,
        categoryLabel: catLabel,
        description: resolvedDesc,
        amount: numAmount,
        date: incDate || getTodayDateString(),
        paymentMethod: incPaymentMethod,
        payer: incPayer.trim() || undefined,
        term: selectedTerm !== 'all' ? selectedTerm : getCurrentTermName(schoolId),
        session: activeSchool?.academicSession || getCurrentAcademicSession(),
        recordedBy: session.bursarName,
        notes: incNotes.trim() || undefined,
      },
      schoolId
    );

    const updated = getStoredExtraIncomes(schoolId);
    setExtraIncomes(updated);
    onExtraIncomesChange?.(updated);
    setIsAddIncomeModalOpen(false);

    // Reset form
    setIncAmount('');
    setIncDate(getTodayDateString());
    setIncPayer('');
    setIncNotes('');
    setIncCategory('pta_levy');
    setIncFormError(null);
    setIsSavingIncome(false);

    markPendingSync('income', newIncome.id, schoolId);
    let incomeCloudOk = false;
    try {
      incomeCloudOk = await saveExtraIncomeToFirestore(newIncome, schoolId);
      if (incomeCloudOk) clearPendingSync('income', newIncome.id, schoolId);
    } catch (err) {
      console.warn('Firestore extra income sync note:', err);
    }
    setSyncStatus(
      incomeCloudOk
        ? { type: 'success', message: `Extra income (${formatCurrency(numAmount, currencySymbol)}) recorded and synced.` }
        : { type: 'error', message: `Extra income (${formatCurrency(numAmount, currencySymbol)}) saved on this device only. It will upload when you open this page with a connection.` }
    );
    setTimeout(() => setSyncStatus(null), incomeCloudOk ? 3000 : 7000);
  };

  // Delete Extra Income Handler
  const handleDeleteExtraIncome = async (id: string) => {
    if (typeof window !== 'undefined' && !window.confirm('Remove this income record?')) return;
    const updated = deleteExtraIncomeItem(id, schoolId);
    setExtraIncomes(updated);
    onExtraIncomesChange?.(updated);

    let removed = false;
    try {
      removed = await deleteExtraIncomeFromFirestore(id, schoolId);
    } catch (err) {
      console.warn('Firestore extra income delete sync note:', err);
    }
    setSyncStatus(
      removed
        ? { type: 'success', message: 'Extra income record removed.' }
        : { type: 'error', message: 'Income removed on this device, but the database did not confirm. It may come back after a refresh. Delete it again with a connection.' }
    );
    setTimeout(() => setSyncStatus(null), removed ? 3000 : 7000);
  };

  // Export Expenses to CSV
  const handleExportExpensesCSV = () => {
    const headers = ['Expense ID', 'Date', 'Category', 'Description', 'Amount', 'Payment Method', 'Payee / Vendor', 'Voucher / Receipt Ref', 'Term', 'Recorded By'];
    const rows = scopedExpenses.map((exp) => [
      csvCell(exp.id),
      csvCell(exp.date),
      csvCell(exp.categoryLabel || exp.category),
      csvCell(exp.description),
      parseExpenseAmount(exp.amount),
      csvCell(exp.paymentMethod),
      csvCell(exp.recipient || ''),
      csvCell(exp.receiptVoucherRef || ''),
      csvCell(exp.term || ''),
      csvCell(exp.recordedBy || ''),
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Expenses_${activeSchool?.name || 'School'}_${selectedTerm}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const getCategoryIcon = (cat: ExpenseCategory) => {
    switch (cat) {
      case 'generator_fuel':
        return <Fuel className="w-3.5 h-3.5" />;
      case 'utilities_power':
        return <Zap className="w-3.5 h-3.5" />;
      case 'maintenance_repairs':
        return <Wrench className="w-3.5 h-3.5" />;
      case 'exam_printing':
        return <Printer className="w-3.5 h-3.5" />;
      case 'teaching_materials':
        return <BookOpen className="w-3.5 h-3.5" />;
      case 'events_sports':
        return <Award className="w-3.5 h-3.5" />;
      case 'security_sanitation':
        return <Shield className="w-3.5 h-3.5" />;
      case 'government_levy':
        return <Building className="w-3.5 h-3.5" />;
      case 'administrative_supplies':
        return <FileSpreadsheet className="w-3.5 h-3.5" />;
      case 'salary_payroll':
        return <WalletCards className="w-3.5 h-3.5" />;
      default:
        return <Layers className="w-3.5 h-3.5" />;
    }
  };

  const isSurplus = financials.netOperatingSurplus >= 0;

  return (
    <div className="space-y-4">
      {/* Sync Notification Banner */}
      {syncStatus && (
        <div
          className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-between gap-2 transition-all ${
            syncStatus.type === 'success'
              ? 'bg-slate-50 border-slate-300 text-slate-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {syncStatus.type === 'success' ? (
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{syncStatus.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setSyncStatus(null)}
            className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 1. FINANCIAL CASHFLOW & EXPENSE TRACKER CARD - Clean, Lightweight, Simple Styling */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <span>Operating Expenses & Cashflow</span>
              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700">
                {selectedTerm === 'all' ? 'All Terms' : selectedTerm}
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              School running costs, generator diesel, maintenance, and net surplus
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Refresh Button */}
            <button
              type="button"
              onClick={handleManualSyncExpenses}
              disabled={isSyncing}
              title={isSyncing ? 'Synchronizing expenses with Firestore...' : 'Click to refresh expenses from database'}
              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-slate-900' : 'text-slate-600'}`} />
              <span>{isSyncing ? 'Syncing...' : 'Sync'}</span>
            </button>

            {onOpenFormulasModal && (
              <button
                type="button"
                onClick={onOpenFormulasModal}
                title="View Sheet columns and formulas"
                className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                <span>Formulas</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setIsAddIncomeModalOpen(true)}
              id="open-add-income-modal-btn"
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Record Income</span>
            </button>

            <button
              type="button"
              onClick={() => setIsAddModalOpen(true)}
              id="open-add-expense-modal-btn"
              className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Record Expense</span>
            </button>
          </div>
        </div>

        {/* Clean Financial Breakdown Block - Accurate Active Calculations */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 sm:p-5">
          <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-slate-200">
            <div>
              <span className="text-xs font-medium text-slate-500 block">
                {isSurplus ? 'Net Operating Cash Surplus' : 'Operating Shortfall / Deficit'}
              </span>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-2xl font-bold font-mono text-slate-900">
                  {formatCurrency(financials.netOperatingSurplus, currencySymbol)}
                </span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-200 text-slate-800">
                  {financials.netMarginPercentage}% Margin
                </span>
              </div>
            </div>

            <div className="text-right">
              <span className="text-xs text-slate-500 font-medium block">Total Active Net Expenses</span>
              <span className="text-base font-bold text-slate-900 font-mono">
                {formatCurrency(financials.totalExpenses, currencySymbol)}
              </span>
            </div>
          </div>

          {/* 3 Simple Column Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 text-xs">
            {/* 1. Inflow */}
            <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-1">
              <div className="flex items-center justify-between text-slate-700">
                <span className="font-bold">1. Fee Revenue</span>
                <span className="text-[10px] font-mono font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded">+ Inflow</span>
              </div>
              <div className="text-base font-bold text-slate-900 font-mono">
                {formatCurrency(financials.totalIncomeCollected, currencySymbol)}
              </div>
              <div className="text-[11px] text-slate-500 space-y-0.5 font-mono pt-1 border-t border-slate-100">
                <div className="flex justify-between">
                  <span>Tuition:</span>
                  <span className="font-semibold text-slate-800">{formatCurrency(financials.schoolFeeIncome, currencySymbol)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Admission:</span>
                  <span className="font-semibold text-slate-800">{formatCurrency(financials.admissionFeeIncome, currencySymbol)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Lesson & Exam:</span>
                  <span className="font-semibold text-slate-800">{formatCurrency(financials.lessonFeeIncome + financials.examFeeIncome, currencySymbol)}</span>
                </div>
                {financials.extraIncomeTotal > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>Other Sources:</span>
                    <span className="font-bold">+{formatCurrency(financials.extraIncomeTotal, currencySymbol)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* 2. Staff Payroll */}
            <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-1">
              <div className="flex items-center justify-between text-slate-700">
                <span className="font-bold">2. Staff Salaries</span>
                <span className="text-[10px] font-mono font-semibold bg-rose-50 text-rose-700 border border-rose-200 px-1.5 py-0.5 rounded">- Outflow</span>
              </div>
              <div className="text-base font-bold text-slate-900 font-mono">
                {formatCurrency(financials.payrollDisbursed, currencySymbol)}
              </div>
              <p className="text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                Disbursed staff payroll for active term.
              </p>
              {onOpenPayroll && (
                <button
                  type="button"
                  onClick={onOpenPayroll}
                  className="text-[11px] text-slate-900 hover:underline font-semibold flex items-center gap-1 cursor-pointer pt-0.5"
                >
                  <span>Open Payroll</span>
                  <ArrowUpRight className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* 3. Operating Expenses */}
            <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-1">
              <div className="flex items-center justify-between text-slate-700">
                <span className="font-bold">3. Active Expenses</span>
                <span className="text-[10px] font-mono font-semibold bg-rose-50 text-rose-700 border border-rose-200 px-1.5 py-0.5 rounded">- Outflow</span>
              </div>
              <div className="text-base font-bold text-slate-900 font-mono">
                {formatCurrency(activeExpensesTotal, currencySymbol)}
              </div>
              <p className="text-[11px] text-slate-500 pt-1 border-t border-slate-100">
                {scopedExpenses.length} active {scopedExpenses.length === 1 ? 'record' : 'records'} logged.
              </p>
              <div className="text-[10px] text-slate-600 font-mono pt-0.5">
                Total Expenses: {formatCurrency(financials.totalExpenses, currencySymbol)}
              </div>
            </div>
          </div>
        </div>

        {/* Recorded Extra Income Sources List (When present) */}
        {scopedExtraIncomes.length > 0 && (
          <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3.5 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-bold text-emerald-950">
                  Extra Income from Other Sources ({scopedExtraIncomes.length})
                </span>
              </div>
              <span className="text-xs font-black font-mono text-emerald-800">
                +{formatCurrency(financials.extraIncomeTotal, currencySymbol)}
              </span>
            </div>
            <div className="divide-y divide-emerald-100 bg-white rounded-lg border border-emerald-200/80 overflow-hidden">
              {scopedExtraIncomes.map((inc) => (
                <div key={inc.id} className="px-3 py-2 flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-bold text-slate-900">{inc.description}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold">
                        {inc.categoryLabel || getExtraIncomeCategoryLabel(inc.category)}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      {inc.date} {inc.payer ? `• From: ${inc.payer}` : ''} • {(inc.paymentMethod || 'cash').replace('_', ' ')}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono font-bold text-emerald-700">
                      +{formatCurrency(inc.amount, currencySymbol)}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDeleteExtraIncome(inc.id)}
                      title="Delete Extra Income"
                      className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Category Filters */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar pt-1">
          <button
            type="button"
            onClick={() => setSelectedCategoryFilter('all')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
              selectedCategoryFilter === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            All Categories ({scopedExpenses.length})
          </button>
          {EXPENSE_CATEGORIES.map((cat) => {
            const sum = categoryTotals[cat.id] || 0;
            if (sum === 0 && selectedCategoryFilter !== cat.id) return null;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategoryFilter(cat.id)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors flex items-center gap-1.5 cursor-pointer ${
                  selectedCategoryFilter === cat.id
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {getCategoryIcon(cat.id)}
                <span>{cat.label}</span>
                <span className="font-mono text-[10px] opacity-80">({formatCurrency(sum, currencySymbol)})</span>
              </button>
            );
          })}
        </div>

        {/* Search & Export Toolbar */}
        <div className="flex items-center justify-between gap-2 flex-wrap pt-1">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              id="expense-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search expenses by description, vendor, or voucher..."
              className="w-full pl-8 pr-3 py-2.5 sm:py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-base sm:text-xs focus:ring-1 focus:ring-slate-900 focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={handleExportExpensesCSV}
            id="export-expenses-csv-btn"
            title="Download Expenses CSV"
            className="px-3 py-2.5 sm:py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg border border-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>
        </div>

        {/* Active Expense Filter & Subtotal Banner */}
        {(selectedCategoryFilter !== 'all' || searchQuery.trim() !== '') && (
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-3 py-2 bg-slate-100 rounded-lg text-xs border border-slate-200">
            <span className="text-slate-600 font-medium">
              Filtered: <strong>{filteredExpenses.length}</strong> of {scopedExpenses.length} expenses
            </span>
            <span className="font-bold text-slate-900 font-mono">
              Active Filtered Total: {formatCurrency(activeFilteredExpensesTotal, currencySymbol)}
            </span>
          </div>
        )}

        {/* Expense Items Table */}
        <div className="space-y-2 pt-1">
          {filteredExpenses.length === 0 ? (
            <div className="text-center py-8 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="w-10 h-10 rounded-xl bg-slate-200 text-slate-700 flex items-center justify-center mx-auto">
                <Receipt className="w-5 h-5" />
              </div>
              <p className="text-xs font-bold text-slate-800">No school operating expenses recorded yet.</p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Record generator diesel, electricity, exam printing, and maintenance to automatically track them in the Google Sheet.
              </p>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(true)}
                className="mt-2 px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-semibold inline-flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add First Expense</span>
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
              {filteredExpenses.map((exp) => (
                <div
                  key={exp.id}
                  className="p-3 sm:p-3.5 flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-start gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0 mt-0.5">
                      {getCategoryIcon(exp.category)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-xs font-bold text-slate-900">{exp.description}</h4>
                        <span className="text-[10px] bg-slate-100 text-slate-600 font-medium px-1.5 py-0.2 rounded">
                          {exp.categoryLabel || getExpenseCategoryLabel(exp.category)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-[11px] text-slate-500">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          <span>{exp.date}</span>
                        </span>
                        {exp.recipient && (
                          <span>• Payee: <strong className="text-slate-700 font-medium">{exp.recipient}</strong></span>
                        )}
                        {exp.paymentMethod && (
                          <span className="capitalize">• {exp.paymentMethod.replace('_', ' ')}</span>
                        )}
                        {exp.receiptVoucherRef && (
                          <span>• Ref: <strong className="font-mono text-slate-700">{exp.receiptVoucherRef}</strong></span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-right shrink-0">
                    <div>
                      <span className="text-xs sm:text-sm font-bold text-slate-900 font-mono block">
                        -{formatCurrency(parseExpenseAmount(exp.amount), currencySymbol)}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">{exp.id}</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setExpenseToDelete(exp)}
                      title="Delete Expense"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 2. RECORD NEW EXPENSE MODAL (Simplified: Date, Category, Amount, Notes) */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[94dvh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            {/* Header */}
            <div className="px-4 sm:px-5 py-3.5 sm:py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-slate-900 text-white flex items-center justify-center">
                  <Plus className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Record School Expense
                  </h3>
                  <p className="text-xs text-slate-500">
                    Quick entry: Date, category, amount & notes
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="w-11 h-11 sm:w-8 sm:h-8 shrink-0 rounded-lg bg-white hover:bg-slate-200 text-slate-700 flex items-center justify-center border border-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form Body: Simple 4 Inputs */}
            <form onSubmit={handleAddExpense} className="p-4 sm:p-5 overflow-y-auto overscroll-contain space-y-4">
              {formError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-800 flex items-center gap-2">
                  <X className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{formError}</span>
                </div>
              )}

              {/* 1. Date */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700">
                    Date *
                  </label>
                  <button
                    type="button"
                    onClick={() => setDate(getTodayDateString())}
                    className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                  >
                    Today ({getTodayDateString()})
                  </button>
                </div>
                <input
                  type="date"
                  required
                  id="new-expense-date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="w-full px-3 py-3 sm:py-2 bg-slate-50 border border-slate-200 rounded-lg text-base sm:text-xs font-bold text-slate-900 focus:ring-1 focus:ring-slate-900 focus:outline-none"
                />
              </div>

              {/* 2. Category */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Category *
                </label>
                <select
                  id="new-expense-category-select"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as ExpenseCategory)}
                  className="w-full px-3 py-3 sm:py-2 bg-slate-50 border border-slate-200 rounded-lg text-base sm:text-xs font-bold text-slate-900 focus:ring-1 focus:ring-slate-900 focus:outline-none"
                >
                  {EXPENSE_CATEGORIES.filter((c) => c.id !== 'salary_payroll').map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* 3. Amount */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Amount ({currencySymbol}) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    {currencySymbol}
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="1"
                    step="any"
                    required
                    id="new-expense-amount"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="e.g. 15000"
                    className="w-full pl-8 pr-3 py-3 sm:py-2 bg-slate-50 border border-slate-200 rounded-lg text-base sm:text-sm font-bold text-slate-900 focus:ring-1 focus:ring-slate-900 focus:outline-none"
                  />
                </div>
              </div>

              {/* 4. Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Notes / Description
                </label>
                <textarea
                  id="new-expense-notes"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Purchased 50 Litres of diesel for generator"
                  className="w-full px-3 py-3 sm:py-2 bg-slate-50 border border-slate-200 rounded-lg text-base sm:text-xs font-medium text-slate-900 focus:ring-1 focus:ring-slate-900 focus:outline-none"
                />
              </div>

              <div className="sticky bottom-0 -mx-4 sm:mx-0 px-4 sm:px-0 pt-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:pb-0 bg-white border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="flex-1 sm:flex-none px-4 py-3 sm:py-2 text-sm sm:text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  id="submit-new-expense-btn"
                  className="flex-1 sm:flex-none px-5 py-3 sm:py-2 text-sm sm:text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-xs transition-colors cursor-pointer"
                >
                  Save Expense
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2B. RECORD EXTRA INCOME MODAL */}
      {isAddIncomeModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md max-h-[94dvh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
            {/* Header */}
            <div className="px-4 sm:px-5 py-3.5 sm:py-4 border-b border-emerald-100 flex items-center justify-between bg-emerald-50/70">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center">
                  <TrendingUp className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Record Extra Income
                  </h3>
                  <p className="text-xs text-slate-600">
                    Add income from other sources to Total Income
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddIncomeModalOpen(false)}
                className="w-11 h-11 sm:w-8 sm:h-8 shrink-0 rounded-lg bg-white hover:bg-slate-200 text-slate-700 flex items-center justify-center border border-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Form Body */}
            <form onSubmit={handleAddExtraIncome} className="p-4 sm:p-5 overflow-y-auto overscroll-contain space-y-4">
              {incFormError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-800 flex items-center gap-2">
                  <X className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{incFormError}</span>
                </div>
              )}

              {/* 1. Date */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700">
                    Date Received *
                  </label>
                  <button
                    type="button"
                    onClick={() => setIncDate(getTodayDateString())}
                    className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 cursor-pointer"
                  >
                    Today ({getTodayDateString()})
                  </button>
                </div>
                <input
                  type="date"
                  required
                  id="new-income-date"
                  value={incDate}
                  onChange={(e) => setIncDate(e.target.value)}
                  className="w-full px-3 py-3 sm:py-2 bg-slate-50 border border-slate-200 rounded-lg text-base sm:text-xs font-bold text-slate-900 focus:ring-1 focus:ring-emerald-600 focus:outline-none"
                />
              </div>

              {/* 2. Income Source Category */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Income Source Category *
                </label>
                <select
                  id="new-income-category-select"
                  value={incCategory}
                  onChange={(e) => setIncCategory(e.target.value as ExtraIncomeCategory)}
                  className="w-full px-3 py-3 sm:py-2 bg-slate-50 border border-slate-200 rounded-lg text-base sm:text-xs font-bold text-slate-900 focus:ring-1 focus:ring-emerald-600 focus:outline-none"
                >
                  {EXTRA_INCOME_CATEGORIES.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* 3. Amount */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Amount Received ({currencySymbol}) *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                    {currencySymbol}
                  </span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="1"
                    step="any"
                    required
                    id="new-income-amount"
                    value={incAmount}
                    onChange={(e) => setIncAmount(e.target.value)}
                    placeholder="e.g. 25000"
                    className="w-full pl-8 pr-3 py-3 sm:py-2 bg-slate-50 border border-slate-200 rounded-lg text-base sm:text-sm font-bold text-slate-900 focus:ring-1 focus:ring-emerald-600 focus:outline-none"
                  />
                </div>
              </div>

              {/* 4. Payer / Received From & Payment Method */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Received From / Source
                  </label>
                  <input
                    type="text"
                    id="new-income-payer"
                    value={incPayer}
                    onChange={(e) => setIncPayer(e.target.value)}
                    placeholder="e.g. PTA / Bookshop"
                    className="w-full px-3 py-3 sm:py-2 bg-slate-50 border border-slate-200 rounded-lg text-base sm:text-xs font-medium text-slate-900 focus:ring-1 focus:ring-emerald-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Payment Channel
                  </label>
                  <select
                    value={incPaymentMethod}
                    onChange={(e) => setIncPaymentMethod(e.target.value as any)}
                    className="w-full px-3 py-3 sm:py-2 bg-slate-50 border border-slate-200 rounded-lg text-base sm:text-xs font-bold text-slate-900 focus:ring-1 focus:ring-emerald-600 focus:outline-none"
                  >
                    <option value="cash">Cash</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="pos">POS</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </div>
              </div>

              {/* 5. Notes / Description */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Description / Purpose
                </label>
                <textarea
                  id="new-income-notes"
                  rows={2}
                  value={incNotes}
                  onChange={(e) => setIncNotes(e.target.value)}
                  placeholder="e.g. Sale of school uniforms & exercise books, PTA donation"
                  className="w-full px-3 py-3 sm:py-2 bg-slate-50 border border-slate-200 rounded-lg text-base sm:text-xs font-medium text-slate-900 focus:ring-1 focus:ring-emerald-600 focus:outline-none"
                />
              </div>

              <div className="sticky bottom-0 -mx-4 sm:mx-0 px-4 sm:px-0 pt-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:pb-0 bg-white border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddIncomeModalOpen(false)}
                  className="flex-1 sm:flex-none px-4 py-3 sm:py-2 text-sm sm:text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingIncome}
                  id="submit-new-income-btn"
                  className="flex-1 sm:flex-none px-5 py-3 sm:py-2 text-sm sm:text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isSavingIncome ? 'Saving...' : 'Save Income'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. CONFIRM DELETE EXPENSE MODAL */}
      {expenseToDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-2xl sm:rounded-2xl p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:max-w-sm w-full shadow-2xl border border-slate-200 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center mx-auto">
              <Trash2 className="w-5 h-5" />
            </div>
            <div className="text-center">
              <h4 className="text-sm font-bold text-slate-900">Delete Recorded Expense?</h4>
              <p className="text-xs text-slate-500 mt-1">
                Remove <strong>"{expenseToDelete.description}"</strong> ({formatCurrency(expenseToDelete.amount, currencySymbol)})?
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setExpenseToDelete(null)}
                className="flex-1 py-3 sm:py-2 rounded-lg border border-slate-200 text-sm sm:text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteExpense(expenseToDelete.id, expenseToDelete.description)}
                className="flex-1 py-3 sm:py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-sm sm:text-xs font-bold cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
