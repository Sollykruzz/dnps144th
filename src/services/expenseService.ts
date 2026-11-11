/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  ExpenseItem,
  ExpenseCategory,
  ExtraIncomeItem,
  ExtraIncomeCategory,
  BankTransactionEntry,
  PayrollRecord,
  OverallSchoolFinancials,
  StudentPaymentRecord,
  SchoolProfile,
  BursarSession,
} from '../types';
import { safeStorage } from './safeStorage';
import { getTodayDateString, deriveFeeBreakdown } from './calculations';
import {
  loadExpensesFromFirestore,
} from './firebase';

const STORAGE_EXPENSES_PREFIX = 'bursar_school_expenses';
const STORAGE_EXTRA_INCOMES_PREFIX = 'bursar_school_extra_incomes';

export const EXPENSE_CATEGORIES: { id: ExpenseCategory; label: string; iconName: string; color: string }[] = [
  { id: 'salary_payroll', label: 'Staff Salary & Payroll', iconName: 'Users', color: 'bg-indigo-100 text-indigo-800' },
  { id: 'generator_fuel', label: 'Generator Fuel & Diesel', iconName: 'Fuel', color: 'bg-amber-100 text-amber-800' },
  { id: 'utilities_power', label: 'Electricity & Water Utilities', iconName: 'Zap', color: 'bg-yellow-100 text-yellow-800' },
  { id: 'maintenance_repairs', label: 'Building Maintenance & Repairs', iconName: 'Wrench', color: 'bg-orange-100 text-orange-800' },
  { id: 'exam_printing', label: 'Exam Printing & Stationeries', iconName: 'Printer', color: 'bg-blue-100 text-blue-800' },
  { id: 'teaching_materials', label: 'Teaching & Classroom Materials', iconName: 'BookOpen', color: 'bg-emerald-100 text-emerald-800' },
  { id: 'events_sports', label: 'Sports, Excursions & Events', iconName: 'Award', color: 'bg-purple-100 text-purple-800' },
  { id: 'security_sanitation', label: 'Security & Sanitation Supplies', iconName: 'Shield', color: 'bg-cyan-100 text-cyan-800' },
  { id: 'government_levy', label: 'Govt. Levies, Taxes & Permits', iconName: 'Building', color: 'bg-rose-100 text-rose-800' },
  { id: 'administrative_supplies', label: 'Admin Office Supplies & Internet', iconName: 'FileSpreadsheet', color: 'bg-slate-100 text-slate-800' },
  { id: 'other', label: 'General / Miscellaneous Expense', iconName: 'Layers', color: 'bg-neutral-100 text-neutral-800' },
];

export function getExpenseCategoryLabel(category: ExpenseCategory): string {
  const found = EXPENSE_CATEGORIES.find((c) => c.id === category);
  return found?.label || 'General Expense';
}

/**
 * Normalizes any category string into a valid ExpenseCategory enum id
 */
export function parseExpenseCategory(val: any): ExpenseCategory {
  if (!val) return 'other';
  const str = String(val).toLowerCase().trim();
  const match = EXPENSE_CATEGORIES.find((c) => c.id === str);
  if (match) return match.id;

  if (str.includes('fuel') || str.includes('diesel') || str.includes('generator') || str.includes('petrol')) return 'generator_fuel';
  if (str.includes('util') || str.includes('power') || str.includes('electr') || str.includes('water') || str.includes('nepa') || str.includes('phcn')) return 'utilities_power';
  if (str.includes('salary') || str.includes('payroll') || str.includes('wage') || str.includes('allowance') || str.includes('stipend')) return 'salary_payroll';
  if (str.includes('maint') || str.includes('repair') || str.includes('build') || str.includes('carpenter') || str.includes('plumb') || str.includes('paint')) return 'maintenance_repairs';
  if (str.includes('exam') || str.includes('print') || str.includes('stationer') || str.includes('paper') || str.includes('photocopy')) return 'exam_printing';
  if (str.includes('teach') || str.includes('class') || str.includes('book') || str.includes('chalk') || str.includes('marker') || str.includes('board')) return 'teaching_materials';
  if (str.includes('event') || str.includes('sport') || str.includes('excursion') || str.includes('inter-house') || str.includes('party') || str.includes('club')) return 'events_sports';
  if (str.includes('sec') || str.includes('sanit') || str.includes('clean') || str.includes('guard') || str.includes('waste') || str.includes('disinfect')) return 'security_sanitation';
  if (str.includes('tax') || str.includes('levy') || str.includes('permit') || str.includes('govt') || str.includes('ministry') || str.includes('board of internal')) return 'government_levy';
  if (str.includes('admin') || str.includes('office') || str.includes('internet') || str.includes('data') || str.includes('wifi') || str.includes('comm')) return 'administrative_supplies';

  return 'other';
}

export { getPendingSyncIds, markPendingSync, clearPendingSync, mergeCloudWithPending } from './pendingSync';

/**
 * Safely parse any expense amount (handling numbers, strings with currency symbols or commas)
 */
export function parseExpenseAmount(val: any): number {
  if (typeof val === 'number') {
    return Number.isFinite(val) ? Math.max(0, val) : 0;
  }
  if (!val) return 0;
  const str = String(val).replace(/[^0-9.-]+/g, '');
  const num = parseFloat(str);
  return isNaN(num) ? 0 : Math.max(0, num);
}

/**
 * Normalize term strings for reliable matching (e.g. '1st Term', 'First Term', 'First Term (2026/2027)')
 */
export function normalizeExpenseTerm(term?: string): string {
  if (!term) return '';
  const s = term.toLowerCase().trim();
  if (s.includes('1st') || s.includes('first')) return 'first term';
  if (s.includes('2nd') || s.includes('second')) return 'second term';
  if (s.includes('3rd') || s.includes('third')) return 'third term';
  return s;
}

export function generateExpenseId(): string {
  const dateStr = getTodayDateString().replace(/-/g, '');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `EXP-${dateStr}-${rand}`;
}

export const INITIAL_SAMPLE_EXPENSES: ExpenseItem[] = [];

const LEGACY_MOCK_EXPENSE_IDS = new Set(['EXP-20260827']);

/**
 * Load expenses for a specific school from storage
 */
export function getStoredExpenses(schoolId: string = 'dominion-group'): ExpenseItem[] {
  try {
    const key = `${STORAGE_EXPENSES_PREFIX}_${schoolId}`;
    const raw = safeStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((e) => !LEGACY_MOCK_EXPENSE_IDS.has(String(e?.id || '').trim()));
      }
    }
  } catch (e) {
    console.warn(`[Expense Storage Note] Failed loading expenses for '${schoolId}':`, e);
  }
  return [];
}

/**
 * Loads expenses directly from Cloud Firestore and syncs to local storage
 */
export async function syncExpensesFromFirestore(schoolId: string = 'dominion-group'): Promise<ExpenseItem[]> {
  try {
    const cloud = await loadExpensesFromFirestore(schoolId);
    if (Array.isArray(cloud)) {
      const clean = cloud.filter((e) => !LEGACY_MOCK_EXPENSE_IDS.has(String(e?.id || '').trim()));
      const key = `${STORAGE_EXPENSES_PREFIX}_${schoolId}`;
      safeStorage.setItem(key, JSON.stringify(clean));
      return clean;
    }
  } catch (e) {
    console.warn(`[Expense Cloud Sync Note] Failed loading from Firestore for '${schoolId}':`, e);
  }
  return getStoredExpenses(schoolId);
}

/**
 * Save expenses for a specific school to storage
 */
export function saveStoredExpenses(expenses: ExpenseItem[], schoolId: string = 'dominion-group'): void {
  try {
    const key = `${STORAGE_EXPENSES_PREFIX}_${schoolId}`;
    safeStorage.setItem(key, JSON.stringify(expenses));
  } catch (e) {
    console.warn(`[Expense Storage Note] Failed saving expenses for '${schoolId}':`, e);
  }
}

/**
 * Creates a new expense item data structure
 */
export function createExpenseItem(expense: Omit<ExpenseItem, 'id' | 'createdAt'>, schoolId: string = 'dominion-group'): ExpenseItem {
  return {
    ...expense,
    id: generateExpenseId(),
    categoryLabel: getExpenseCategoryLabel(expense.category),
    schoolId,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Add a new expense item to local storage cache
 */
export function addExpenseItem(expense: Omit<ExpenseItem, 'id' | 'createdAt'>, schoolId: string = 'dominion-group'): ExpenseItem {
  const current = getStoredExpenses(schoolId);
  const newExpense = createExpenseItem(expense, schoolId);
  const updated = [newExpense, ...current];
  saveStoredExpenses(updated, schoolId);
  return newExpense;
}

/**
 * Delete an expense item from local storage cache
 */
export function deleteExpenseItem(expenseId: string, schoolId: string = 'dominion-group'): ExpenseItem[] {
  const current = getStoredExpenses(schoolId);
  const updated = current.filter((e) => e.id !== expenseId);
  saveStoredExpenses(updated, schoolId);
  return updated;
}

/**
 * ============================================================================
 * EXTRA INCOME TRACKING (NON-TUITION OTHER SOURCES)
 * ============================================================================
 */

export const EXTRA_INCOME_CATEGORIES: { id: ExtraIncomeCategory; label: string; color: string }[] = [
  { id: 'pta_levy', label: 'PTA Levy & Contributions', color: 'bg-emerald-100 text-emerald-800' },
  { id: 'uniform_books', label: 'Uniforms, Books & Stationery Sales', color: 'bg-blue-100 text-blue-800' },
  { id: 'grants_donations', label: 'Grants, Endowments & Donations', color: 'bg-purple-100 text-purple-800' },
  { id: 'facility_rental', label: 'Hall / Facility Rental', color: 'bg-amber-100 text-amber-800' },
  { id: 'transport_bus', label: 'School Bus & Transport Income', color: 'bg-cyan-100 text-cyan-800' },
  { id: 'inter_house_sports', label: 'Inter-House Sports & Events', color: 'bg-pink-100 text-pink-800' },
  { id: 'graduation_party', label: 'Graduation & End-of-Year Levy', color: 'bg-indigo-100 text-indigo-800' },
  { id: 'other_income', label: 'Other Miscellaneous Income', color: 'bg-slate-100 text-slate-800' },
];

export function getExtraIncomeCategoryLabel(category: ExtraIncomeCategory): string {
  const found = EXTRA_INCOME_CATEGORIES.find((c) => c.id === category);
  return found?.label || 'Other Extra Income';
}

export function generateExtraIncomeId(): string {
  const dateStr = getTodayDateString().replace(/-/g, '');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `INC-${dateStr}-${rand}`;
}

export function getStoredExtraIncomes(schoolId: string = 'dominion-group'): ExtraIncomeItem[] {
  try {
    const key = `${STORAGE_EXTRA_INCOMES_PREFIX}_${schoolId}`;
    const raw = safeStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn(`[Extra Income Storage Note] Failed loading extra incomes for '${schoolId}':`, e);
  }
  return [];
}

export function saveStoredExtraIncomes(incomes: ExtraIncomeItem[], schoolId: string = 'dominion-group'): void {
  try {
    const key = `${STORAGE_EXTRA_INCOMES_PREFIX}_${schoolId}`;
    safeStorage.setItem(key, JSON.stringify(incomes));
  } catch (e) {
    console.warn(`[Extra Income Storage Note] Failed saving extra incomes for '${schoolId}':`, e);
  }
}

export function createExtraIncomeItem(
  income: Omit<ExtraIncomeItem, 'id' | 'createdAt'>,
  schoolId: string = 'dominion-group'
): ExtraIncomeItem {
  return {
    ...income,
    id: generateExtraIncomeId(),
    categoryLabel: getExtraIncomeCategoryLabel(income.category),
    schoolId,
    createdAt: new Date().toISOString(),
  };
}

export function addExtraIncomeItem(
  income: Omit<ExtraIncomeItem, 'id' | 'createdAt'>,
  schoolId: string = 'dominion-group'
): ExtraIncomeItem {
  const current = getStoredExtraIncomes(schoolId);
  const newItem = createExtraIncomeItem(income, schoolId);
  const updated = [newItem, ...current];
  saveStoredExtraIncomes(updated, schoolId);
  return newItem;
}

export function deleteExtraIncomeItem(incomeId: string, schoolId: string = 'dominion-group'): ExtraIncomeItem[] {
  const current = getStoredExtraIncomes(schoolId);
  const updated = current.filter((item) => item.id !== incomeId);
  saveStoredExtraIncomes(updated, schoolId);
  return updated;
}

/**
 * Calculate combined Net School Financials:
 * Total Fees Inflow (School fee, admission, lesson, exam + Extra Income) MINUS (Payroll Disbursed + Operating Expenses)
 */
export function calculateNetFinancials(
  incomeTotals: {
    schoolFeeCollected: number;
    admissionFeeCollected: number;
    lessonFeeCollected: number;
    examFeeCollected: number;
    schoolFeeTotal: number;
    admissionFeeTotal: number;
    lessonFeeTotal: number;
    examFeeTotal: number;
  },
  payrollDisbursed: number,
  expenses: ExpenseItem[],
  extraIncomes: ExtraIncomeItem[] = []
): OverallSchoolFinancials {
  const schoolFeeIncome = incomeTotals.schoolFeeCollected || 0;
  const admissionFeeIncome = incomeTotals.admissionFeeCollected || 0;
  const lessonFeeIncome = incomeTotals.lessonFeeCollected || 0;
  const examFeeIncome = incomeTotals.examFeeCollected || 0;
  const extraIncomeTotal = (extraIncomes || []).reduce((acc, curr) => acc + parseExpenseAmount(curr?.amount), 0);

  const totalIncomeCollected =
    schoolFeeIncome + admissionFeeIncome + lessonFeeIncome + examFeeIncome + extraIncomeTotal;

  const totalIncomeExpected =
    (incomeTotals.schoolFeeTotal || 0) +
    (incomeTotals.admissionFeeTotal || 0) +
    (incomeTotals.lessonFeeTotal || 0) +
    (incomeTotals.examFeeTotal || 0) +
    extraIncomeTotal;

  const totalIncomeOutstanding = Math.max(0, totalIncomeExpected - totalIncomeCollected);

  // Sum non-payroll operating expenses using parseExpenseAmount
  const otherExpensesTotal = expenses.reduce((acc, curr) => acc + parseExpenseAmount(curr?.amount), 0);

  const totalExpenses = (payrollDisbursed || 0) + otherExpensesTotal;
  const netOperatingSurplus = totalIncomeCollected - totalExpenses;
  const netMarginPercentage = totalIncomeCollected > 0
    ? Math.round((netOperatingSurplus / totalIncomeCollected) * 1000) / 10
    : 0;

  return {
    schoolFeeIncome,
    admissionFeeIncome,
    lessonFeeIncome,
    examFeeIncome,
    extraIncomeTotal,
    totalIncomeCollected,
    totalIncomeExpected,
    totalIncomeOutstanding,
    payrollDisbursed: payrollDisbursed || 0,
    otherExpensesTotal,
    totalExpenses,
    netOperatingSurplus,
    netMarginPercentage,
  };
}

/**
 * Builds a unified chronological Bank-Style Transaction Statement across:
 * 1. Student Fee Payments (CREDIT)
 * 2. Extra Income Sources (CREDIT)
 * 3. Operational Expenses (DEBIT)
 * 4. Staff Payroll Disbursements (DEBIT)
 */
export function buildBankTransactionHistory(params: {
  students: StudentPaymentRecord[];
  extraIncomes: ExtraIncomeItem[];
  expenses: ExpenseItem[];
  payrollRecords: PayrollRecord[];
  activeSchool?: SchoolProfile;
}): BankTransactionEntry[] {
  const rawEntries: Omit<BankTransactionEntry, 'runningBalance'>[] = [];

  // 1. Student Fee Payments (Credits): one entry per payment_history line
  (params.students || []).forEach((s) => {
    const bd = deriveFeeBreakdown(s, params.activeSchool);
    const totalPaid = bd.tuitionPaid + bd.admissionPaid + bd.lessonPaid + bd.examPaid + bd.additionalFeesPaid;
    if (totalPaid <= 0) return;

    const history = Array.isArray(s.payment_history) ? s.payment_history : [];
    let historyTotal = 0;
    history.forEach((h, idx) => {
      const amt = Number(h.amountPaidNow) || 0;
      if (amt <= 0) return;
      historyTotal += amt;
      const dateStr = h.paymentDate && h.paymentDate.trim() ? h.paymentDate.trim() : getTodayDateString();
      rawEntries.push({
        id: `tx_stu_${s.id}_${h.id || `${h.receiptNumber}_${idx}`}`,
        date: dateStr,
        timestamp: h.timestamp || `${dateStr}T10:00:00.000Z`,
        reference: h.receiptNumber || `FEE-${s.id}`,
        type: 'CREDIT',
        category: 'Student School Fees',
        description: `School Fee Payment (${h.feeItemDescription || 'Payment'})`,
        counterparty: `${s.full_name} (${s.class})`,
        paymentMethod: h.paymentMethod || (s as any).payment_method || 'Cash / Bank Transfer',
        amount: amt,
        term: s.term,
        session: s.session,
        sourceType: 'student_fee',
      });
    });

    // Older students with no history, or whose history is short of the amount paid,
    // get one entry for the difference dated at the last payment date.
    const gap = Math.round((totalPaid - historyTotal) * 100) / 100;
    if (gap > 0.005) {
      const parts: string[] = [];
      if (history.length === 0) {
        if (bd.tuitionPaid > 0) parts.push(`Tuition: ${bd.tuitionPaid.toLocaleString()}`);
        if (bd.admissionPaid > 0) parts.push(`Admission: ${bd.admissionPaid.toLocaleString()}`);
        if (bd.lessonPaid > 0) parts.push(`Lesson: ${bd.lessonPaid.toLocaleString()}`);
        if (bd.examPaid > 0) parts.push(`Exam: ${bd.examPaid.toLocaleString()}`);
        if (bd.additionalFeesPaid > 0) parts.push(`Other: ${bd.additionalFeesPaid.toLocaleString()}`);
      }
      const dateStr = s.payment_date && s.payment_date.trim() ? s.payment_date.trim() : getTodayDateString();
      rawEntries.push({
        id: `tx_stu_${s.id}_${s.term || 'term'}_prior`,
        date: dateStr,
        timestamp: (s as any).updatedAt || `${dateStr}T10:00:00.000Z`,
        reference: s.receipt_no || `FEE-${s.id}`,
        type: 'CREDIT',
        category: 'Student School Fees',
        description: parts.length > 0
          ? `School Fee Payment (${parts.join(', ')})`
          : 'School Fee Payment (earlier payments)',
        counterparty: `${s.full_name} (${s.class})`,
        paymentMethod: (s as any).payment_method || 'Cash / Bank Transfer',
        amount: gap,
        term: s.term,
        session: s.session,
        sourceType: 'student_fee',
      });
    }
  });

  // 2. Extra Incomes (Credits)
  (params.extraIncomes || []).forEach((inc) => {
    const amt = parseExpenseAmount(inc.amount);
    if (amt > 0) {
      rawEntries.push({
        id: `tx_inc_${inc.id}`,
        date: inc.date || getTodayDateString(),
        timestamp: inc.createdAt || `${inc.date || getTodayDateString()}T12:00:00.000Z`,
        reference: inc.receiptVoucherRef || inc.id,
        type: 'CREDIT',
        category: inc.categoryLabel || getExtraIncomeCategoryLabel(inc.category),
        description: inc.description || inc.categoryLabel || 'Extra School Income',
        counterparty: inc.payer || 'External Source / Payer',
        paymentMethod: (inc.paymentMethod || 'cash').replace('_', ' ').toUpperCase(),
        amount: amt,
        term: inc.term,
        session: inc.session,
        sourceType: 'extra_income',
      });
    }
  });

  // 3. Operational Expenses (Debits)
  (params.expenses || []).forEach((exp) => {
    const amt = parseExpenseAmount(exp.amount);
    if (amt > 0) {
      rawEntries.push({
        id: `tx_exp_${exp.id}`,
        date: exp.date || getTodayDateString(),
        timestamp: exp.createdAt || `${exp.date || getTodayDateString()}T14:00:00.000Z`,
        reference: exp.receiptVoucherRef || exp.id,
        type: 'DEBIT',
        category: exp.categoryLabel || getExpenseCategoryLabel(exp.category),
        description: exp.description || exp.categoryLabel || 'Operating Expense',
        counterparty: exp.recipient || 'Vendor / Service Provider',
        paymentMethod: (exp.paymentMethod || 'cash').replace('_', ' ').toUpperCase(),
        amount: amt,
        term: exp.term,
        session: exp.session,
        sourceType: 'expense',
      });
    }
  });

  // 4. Staff Payroll Disbursements (Debits)
  (params.payrollRecords || []).forEach((pr) => {
    const amt = parseExpenseAmount(pr.amountPaid);
    if (amt > 0) {
      const dateStr = pr.paymentDate || (pr.createdAt ? pr.createdAt.split('T')[0] : getTodayDateString());
      rawEntries.push({
        id: `tx_pay_${pr.id}`,
        date: dateStr,
        timestamp: pr.updatedAt || pr.createdAt || `${dateStr}T16:00:00.000Z`,
        reference: pr.referenceNumber || pr.id,
        type: 'DEBIT',
        category: 'Staff Salaries & Payroll',
        description: `Salary Disbursement - ${pr.monthLabel || pr.month} (${pr.role})`,
        counterparty: pr.staffName,
        paymentMethod: (pr.paymentMethod || 'bank_transfer').replace('_', ' ').toUpperCase(),
        amount: amt,
        term: pr.term,
        session: pr.session,
        sourceType: 'payroll',
      });
    }
  });

  // Sort oldest to newest first to compute accurate running balance like a bank statement
  const chronological = [...rawEntries].sort((a, b) => {
    const dA = new Date(a.date).getTime() || 0;
    const dB = new Date(b.date).getTime() || 0;
    if (dA !== dB) return dA - dB;
    const tA = new Date(a.timestamp).getTime() || 0;
    const tB = new Date(b.timestamp).getTime() || 0;
    return tA - tB;
  });

  let running = 0;
  const withBalance: BankTransactionEntry[] = chronological.map((entry) => {
    if (entry.type === 'CREDIT') {
      running += entry.amount;
    } else {
      running -= entry.amount;
    }
    return {
      ...entry,
      runningBalance: running,
    };
  });

  // Return newest first (standard bank statement view)
  return withBalance.reverse();
}

/**
 * Exports Bank-Style Transaction History to CSV or Excel (.xlsx)
 */
export async function exportBankTransactionHistory(
  transactions: BankTransactionEntry[],
  session: BursarSession,
  format: 'csv' | 'xlsx' = 'csv',
  periodLabel: string = 'All Terms'
): Promise<void> {
  const currency = session.currencySymbol || '₦';
  const rows = transactions.map((tx) => ({
    'Date': tx.date,
    'Reference': tx.reference,
    'Type': tx.type,
    'Category': tx.category,
    'Description / Narration': tx.description,
    'Payer / Recipient': tx.counterparty,
    'Channel': tx.paymentMethod,
    [`Credit Inflow (${currency})`]: tx.type === 'CREDIT' ? tx.amount : 0,
    [`Debit Outflow (${currency})`]: tx.type === 'DEBIT' ? tx.amount : 0,
    [`Running Balance (${currency})`]: tx.runningBalance,
    'Term': tx.term || periodLabel,
  }));

  const schoolSlug = (session.schoolName || 'dominion_schools').toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const dateStamp = getTodayDateString();

  if (format === 'xlsx') {
    const XLSX = await import('xlsx');
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, 'Bank_Statement');
    XLSX.writeFile(wb, `${schoolSlug}_transaction_statement_${dateStamp}.xlsx`);
    return;
  }

  // CSV Export
  const escapeCsv = (val: any) => {
    if (val === null || val === undefined) return '""';
    return `"${String(val).replace(/"/g, '""')}"`;
  };

  const headers = [
    'Date',
    'Reference',
    'Type',
    'Category',
    'Description / Narration',
    'Payer / Recipient',
    'Channel',
    `Credit Inflow (${currency})`,
    `Debit Outflow (${currency})`,
    `Running Balance (${currency})`,
    'Term',
  ];

  const csvLines = [
    headers.map(escapeCsv).join(','),
    ...transactions.map((tx) =>
      [
        escapeCsv(tx.date),
        escapeCsv(tx.reference),
        escapeCsv(tx.type),
        escapeCsv(tx.category),
        escapeCsv(tx.description),
        escapeCsv(tx.counterparty),
        escapeCsv(tx.paymentMethod),
        tx.type === 'CREDIT' ? tx.amount : 0,
        tx.type === 'DEBIT' ? tx.amount : 0,
        tx.runningBalance,
        escapeCsv(tx.term || periodLabel),
      ].join(',')
    ),
  ];

  const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${schoolSlug}_transaction_statement_${dateStamp}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
