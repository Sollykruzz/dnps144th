/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  StaffMember,
  PayrollRecord,
  MonthlyPayrollSummary,
  TermPayrollSummary,
  StaffDepartment,
  StaffAllowances,
  StaffDeductions,
} from '../types';
import { safeStorage } from './storage';
import {
  loadStaffFromFirestore,
  loadPayrollFromFirestore,
} from './firebase';
import { getCurrentAcademicSession, getTodayDateString } from './calculations';
import { getPendingSyncIds, mergeCloudWithPending } from './pendingSync';

const STORAGE_STAFF_PREFIX = 'bursar_staff_roster';
const STORAGE_PAYROLL_PREFIX = 'bursar_payroll_records';

/**
 * Default Staff Roster is empty by default (no dummy data)
 */
export const DEFAULT_STAFF_MEMBERS: StaffMember[] = [];

/**
 * List of known legacy dummy IDs to automatically purge
 */
const LEGACY_DUMMY_STAFF_IDS = new Set([
  'STF-001',
  'STF-002',
  'STF-003',
  'STF-004',
  'STF-005',
  'STF-006',
  'STF-007',
  'STF-008',
]);

/**
 * Calculate financial totals for an individual staff member
 */
export function calculateStaffFinancials(staff: StaffMember): {
  totalAllowances: number;
  totalDeductions: number;
  grossPay: number;
  netPay: number;
} {
  const allowances = staff.allowances || {};
  const totalAllowances =
    (Number(allowances.transport) || 0) +
    (Number(allowances.housing) || 0) +
    (Number(allowances.teachingBonus) || 0) +
    (Number(allowances.lessonAllowance) || 0) +
    (Number(allowances.responsibility) || 0) +
    (Number(allowances.otherAllowance) || 0);

  const deductions = staff.deductions || {};
  const totalDeductions =
    (Number(deductions.pension) || 0) +
    (Number(deductions.taxPaye) || 0) +
    (Number(deductions.loanRepayment) || 0) +
    (Number(deductions.cooperative) || 0) +
    (Number(deductions.absencePenalty) || 0) +
    (Number(deductions.otherDeduction) || 0);

  const base = Number(staff.baseSalary) || 0;
  const grossPay = base + totalAllowances;
  const netPay = Math.max(0, grossPay - totalDeductions);

  return {
    totalAllowances,
    totalDeductions,
    grossPay,
    netPay,
  };
}

/**
 * Helper to identify if a row or object belongs to a student rather than a staff member
 */
export function isStudentRow(r: any): boolean {
  if (!r || typeof r !== 'object') return false;

  // 1. Explicit Staff signals: If row clearly has staff identifiers or fields, it is NOT a student row
  const hasStaffId = Boolean(r.staff_id || r.staffId || r.employee_id || r.emp_id);
  const hasStaffName = Boolean(r.staff_name || r.staffName || r.employee_name);
  const hasBaseSalary = r.baseSalary !== undefined || r.base_salary !== undefined || r.base_pay !== undefined || r.basic_salary !== undefined || r.salary !== undefined;
  const hasRole = Boolean(r.role && typeof r.role === 'string' && r.role.trim().toLowerCase() !== 'student');
  const hasDept = Boolean(r.department && typeof r.department === 'string' && r.department.trim() !== '');

  if (hasStaffId || hasStaffName || hasBaseSalary || hasRole || (hasDept && (r.fullName || r.full_name || r.name))) {
    return false;
  }

  // 2. If row has explicit student-only fee columns with positive fee values and no staff traits
  if (r.student_class !== undefined && r.student_class !== '') return true;
  if (r.student_id !== undefined && !hasStaffId && !hasBaseSalary && !hasRole) return true;
  if (typeof r.role === 'string' && r.role.trim().toLowerCase() === 'student') return true;

  // 3. Class column check - only treat as student if it doesn't have staff indicators
  if (r.class !== undefined && r.class !== '' && r.class !== null && !hasBaseSalary && !hasStaffId && !hasRole) {
    return true;
  }

  // 4. Student specific fee amounts
  if ((Number(r.tuition_fee) > 0 || Number(r.admission_fee) > 0 || Number(r.exam_fee) > 0 || Number(r.lesson_fee) > 0) && !hasStaffId && !hasBaseSalary) {
    return true;
  }

  return false;
}

/**
 * Retrieve staff roster for a specific school from storage (purges any legacy dummy staff or student leaks)
 */
export function getStoredStaff(schoolId: string = 'dominion-group'): StaffMember[] {
  try {
    const key = `${STORAGE_STAFF_PREFIX}_${schoolId}`;
    const stored = safeStorage.getItem(key);
    if (stored) {
      const parsed: StaffMember[] = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        // Filter out legacy dummy entries and student data
        const clean = parsed.filter((s) => {
          if (!s || !s.fullName) return false;
          if (isStudentRow(s)) return false;
          if (LEGACY_DUMMY_STAFF_IDS.has(s.id) && (s.fullName === 'Mrs. Folake Adeleke' || s.fullName === 'Mr. Emmanuel Okafor' || s.fullName === 'Miss Blessing Danjuma')) return false;
          return true;
        });
        if (clean.length !== parsed.length) {
          saveStoredStaff(clean, schoolId);
        }
        return clean;
      }
    }
  } catch (e) {
    console.warn(`[Payroll Storage Note] Failed loading staff for '${schoolId}':`, e);
  }

  return [];
}

/**
 * Clear stored staff and payroll records completely
 */
export function clearStoredStaffAndPayroll(schoolId: string = 'dominion-group'): void {
  try {
    safeStorage.removeItem(`${STORAGE_STAFF_PREFIX}_${schoolId}`);
    safeStorage.removeItem(`${STORAGE_PAYROLL_PREFIX}_${schoolId}`);
  } catch (e) {
    console.warn(`[Payroll Storage Note] Failed clearing staff/payroll for '${schoolId}':`, e);
  }
}

/**
 * Save staff roster for a specific school to storage and Firestore
 */
export function saveStoredStaff(staff: StaffMember[], schoolId: string = 'dominion-group'): void {
  const targetSchool = (schoolId && schoolId.trim()) ? schoolId.trim().toLowerCase() : 'dominion-group';
  try {
    const key = `${STORAGE_STAFF_PREFIX}_${targetSchool}`;
    safeStorage.setItem(key, JSON.stringify(staff));
  } catch (e) {
    console.warn(`[Payroll Storage Note] Failed saving staff for '${targetSchool}':`, e);
  }
}

/**
 * Retrieve payroll payment records for a specific school from storage (purging any student leaks)
 */
export function getStoredPayrollRecords(schoolId: string = 'dominion-group'): PayrollRecord[] {
  const targetSchool = (schoolId && schoolId.trim()) ? schoolId.trim().toLowerCase() : 'dominion-group';
  try {
    const key = `${STORAGE_PAYROLL_PREFIX}_${targetSchool}`;
    const stored = safeStorage.getItem(key);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        const clean = parsed.filter((r: any) => {
          if (!r || !r.staffName) return false;
          if (isStudentRow(r)) return false;
          return true;
        });
        if (clean.length !== parsed.length) {
          saveStoredPayrollRecords(clean, targetSchool);
        }
        return clean;
      }
    }
  } catch (e) {
    console.warn(`[Payroll Storage Note] Failed loading payroll records for '${targetSchool}':`, e);
  }
  return [];
}

/**
 * Save payroll payment records for a specific school to storage and Firestore
 */
export function saveStoredPayrollRecords(records: PayrollRecord[], schoolId: string = 'dominion-group'): void {
  const targetSchool = (schoolId && schoolId.trim()) ? schoolId.trim().toLowerCase() : 'dominion-group';
  try {
    const key = `${STORAGE_PAYROLL_PREFIX}_${targetSchool}`;
    safeStorage.setItem(key, JSON.stringify(records));
  } catch (e) {
    console.warn(`[Payroll Storage Note] Failed saving payroll records for '${targetSchool}':`, e);
  }
}

/**
 * Formats a YYYY-MM string to user-friendly "Month YYYY" (e.g. "2026-08" -> "August 2026")
 */
export function formatMonthLabel(monthStr: string): string {
  if (!monthStr) return '';
  const [yearStr, monthNumStr] = monthStr.split('-');
  const year = parseInt(yearStr, 10);
  const monthIdx = parseInt(monthNumStr, 10) - 1;
  const date = new Date(year, monthIdx, 1);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/**
 * Gets the current month in YYYY-MM format
 */
export function getCurrentMonthString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Derives the 3 calendar months of a standard Nigerian academic term
 */
export function getTermMonths(term: string, sessionYear: number | string = 2026): { months: string[]; labels: string[] } {
  const cleanTerm = (term || 'First Term').toLowerCase();

  let baseYear = 2026;
  if (typeof sessionYear === 'string') {
    const match = sessionYear.match(/\d{4}/);
    baseYear = match ? parseInt(match[0], 10) : 2026;
  } else if (typeof sessionYear === 'number' && !isNaN(sessionYear)) {
    baseYear = sessionYear;
  }

  let monthIndices: number[] = [8, 9, 10]; // 0-indexed: Sept (8), Oct (9), Nov (10) for 1st Term

  if (cleanTerm.includes('second') || cleanTerm.includes('2nd')) {
    monthIndices = [0, 1, 2]; // Jan (0), Feb (1), Mar (2) for 2nd Term
  } else if (cleanTerm.includes('third') || cleanTerm.includes('3rd')) {
    monthIndices = [3, 4, 5]; // Apr (3), May (4), Jun (5) for 3rd Term
  }

  const months: string[] = [];
  const labels: string[] = [];

  monthIndices.forEach((mIdx) => {
    // If month is Jan-July in a term other than 1st term, it belongs to baseYear + 1
    const y = mIdx >= 8 ? baseYear : (cleanTerm.includes('first') ? baseYear : baseYear + 1);
    const mStr = `${y}-${String(mIdx + 1).padStart(2, '0')}`;
    months.push(mStr);
    labels.push(formatMonthLabel(mStr));
  });

  return { months, labels };
}

/**
 * Generates or synchronizes payroll records for a selected month
 */
export function getOrGenerateMonthlyPayrollRecords(
  staffList: StaffMember[],
  month: string,
  term: string,
  session: string,
  existingRecords: PayrollRecord[]
): PayrollRecord[] {
  const monthLabel = formatMonthLabel(month);
  const existingForMonth = existingRecords.filter((r) => r.month === month);
  const existingMap = new Map<string, PayrollRecord>(existingForMonth.map((r) => [r.staffId, r]));

  const result: PayrollRecord[] = [];

  staffList.forEach((staff) => {
    if (staff.status === 'resigned') return;

    const existing = existingMap.get(staff.id);
    const financials = calculateStaffFinancials(staff);

    if (existing) {
      // Keep existing status & payment details, but update base if changed
      result.push({
        ...existing,
        staffName: staff.fullName,
        role: staff.role,
        department: staff.department,
        term: term || existing.term,
        session: session || existing.session,
        baseSalary: staff.baseSalary,
        totalAllowances: financials.totalAllowances,
        allowanceBreakdown: staff.allowances,
        totalDeductions: financials.totalDeductions,
        deductionBreakdown: staff.deductions,
        grossPay: financials.grossPay,
        netPay: financials.netPay,
        updatedAt: new Date().toISOString(),
      });
    } else {
      // Create new pending payroll record for this staff for this month
      result.push({
        id: `PAY-${month.replace('-', '')}-${staff.id}`,
        staffId: staff.id,
        staffName: staff.fullName,
        role: staff.role,
        department: staff.department,
        month,
        monthLabel,
        term: term || 'First Term',
        session: session || getCurrentAcademicSession(),
        baseSalary: staff.baseSalary,
        totalAllowances: financials.totalAllowances,
        allowanceBreakdown: staff.allowances,
        totalDeductions: financials.totalDeductions,
        deductionBreakdown: staff.deductions,
        grossPay: financials.grossPay,
        netPay: financials.netPay,
        amountPaid: 0,
        paymentStatus: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  });

  return result;
}

/**
 * Calculates full Monthly Payroll Summary (Total /month expenses on staff)
 */
export function calculateMonthlyPayrollSummary(
  staffList: StaffMember[],
  payrollRecords: PayrollRecord[],
  targetMonth: string
): MonthlyPayrollSummary {
  const validStaffIds = new Set(staffList.map((s) => s.id));
  const monthRecords = payrollRecords.filter((r) => r.month === targetMonth && validStaffIds.has(r.staffId));
  const monthLabel = formatMonthLabel(targetMonth);

  const activeStaff = staffList.filter((s) => s.status !== 'resigned');

  let totalBaseSalary = 0;
  let totalAllowances = 0;
  let totalDeductions = 0;
  let totalGrossExpense = 0;
  let totalNetExpense = 0;
  let totalPaid = 0;
  let totalPending = 0;
  let paidCount = 0;
  let pendingCount = 0;

  const departmentBreakdown: Record<StaffDepartment, { count: number; totalNet: number }> = {
    academic: { count: 0, totalNet: 0 },
    administrative: { count: 0, totalNet: 0 },
    support_security: { count: 0, totalNet: 0 },
    management: { count: 0, totalNet: 0 },
    transport_facilities: { count: 0, totalNet: 0 },
    other: { count: 0, totalNet: 0 },
  };

  if (monthRecords.length > 0) {
    monthRecords.forEach((rec) => {
      totalBaseSalary += rec.baseSalary || 0;
      totalAllowances += rec.totalAllowances || 0;
      totalDeductions += rec.totalDeductions || 0;
      totalGrossExpense += rec.grossPay || 0;
      totalNetExpense += rec.netPay || 0;
      totalPaid += rec.amountPaid || 0;

      const remaining = Math.max(0, rec.netPay - (rec.amountPaid || 0));
      totalPending += remaining;

      if (rec.paymentStatus === 'paid') {
        paidCount++;
      } else {
        pendingCount++;
      }

      const dept = rec.department || 'academic';
      if (departmentBreakdown[dept]) {
        departmentBreakdown[dept].count += 1;
        departmentBreakdown[dept].totalNet += rec.netPay;
      }
    });
  } else {
    // If no payroll records generated yet, project from active staff definitions
    activeStaff.forEach((stf) => {
      const f = calculateStaffFinancials(stf);
      totalBaseSalary += stf.baseSalary || 0;
      totalAllowances += f.totalAllowances;
      totalDeductions += f.totalDeductions;
      totalGrossExpense += f.grossPay;
      totalNetExpense += f.netPay;
      totalPending += f.netPay;
      pendingCount++;

      const dept = stf.department || 'academic';
      if (departmentBreakdown[dept]) {
        departmentBreakdown[dept].count += 1;
        departmentBreakdown[dept].totalNet += f.netPay;
      }
    });
  }

  return {
    month: targetMonth,
    monthLabel,
    totalStaffCount: staffList.length,
    activeStaffCount: activeStaff.length,
    totalBaseSalary,
    totalAllowances,
    totalDeductions,
    totalGrossExpense,
    totalNetExpense,
    totalPaid,
    totalPending,
    paidCount,
    pendingCount,
    departmentBreakdown,
  };
}

/**
 * Calculates Term Payroll Summary (3 months term expenses on staff)
 */
export function calculateTermPayrollSummary(
  staffList: StaffMember[],
  allPayrollRecords: PayrollRecord[],
  term: string = 'First Term',
  session: string = getCurrentAcademicSession(),
  referenceMonth: string = getCurrentMonthString()
): TermPayrollSummary {
  // Extract year from reference month or session
  const [yearStr] = referenceMonth.split('-');
  const year = parseInt(yearStr, 10) || 2026;

  const { months } = getTermMonths(term, year);

  const monthlyBreakdowns: MonthlyPayrollSummary[] = months.map((m) =>
    calculateMonthlyPayrollSummary(staffList, allPayrollRecords, m)
  );

  const activeStaffCount = staffList.filter((s) => s.status !== 'resigned').length;

  // Expected 3-month expense
  // Sum net expenses of the 3 months (or monthly net * 3)
  const currentMonthlyNet =
    monthlyBreakdowns[0]?.totalNetExpense ||
    staffList
      .filter((s) => s.status !== 'resigned')
      .reduce((acc, s) => acc + calculateStaffFinancials(s).netPay, 0);

  const totalTermExpectedExpense = currentMonthlyNet * 3;

  // Actual disbursed across these 3 months
  const totalTermDisbursed = monthlyBreakdowns.reduce((acc, m) => acc + m.totalPaid, 0);
  const totalTermOutstanding = Math.max(0, totalTermExpectedExpense - totalTermDisbursed);

  const averageMonthlyExpense = currentMonthlyNet;

  return {
    term,
    session,
    monthsCount: 3,
    months,
    totalTermExpectedExpense,
    totalTermDisbursed,
    totalTermOutstanding,
    monthlyBreakdowns,
    averageMonthlyExpense,
    activeStaffCount,
  };
}

/**
 * Marks an individual payroll record as Paid
 */
export function markPayrollRecordPaid(
  record: PayrollRecord,
  paymentDetails: {
    paymentMethod: 'bank_transfer' | 'cash' | 'cheque' | 'other';
    referenceNumber?: string;
    notes?: string;
    bursarName?: string;
  }
): PayrollRecord {
  return {
    ...record,
    amountPaid: record.netPay,
    paymentStatus: 'paid',
    paymentDate: getTodayDateString(),
    paymentMethod: paymentDetails.paymentMethod,
    referenceNumber: paymentDetails.referenceNumber || `SAL-${record.month.replace('-', '')}-${record.staffId}`,
    processedBy: paymentDetails.bursarName || 'Bursar',
    notes: paymentDetails.notes || record.notes,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Reverses a payroll record back to Pending, clearing its payment details.
 * Used when a disbursed payment was recorded in error.
 */
export function undoPayrollRecordPayment(record: PayrollRecord): PayrollRecord {
  return {
    ...record,
    amountPaid: 0,
    paymentStatus: 'pending',
    paymentDate: undefined,
    paymentMethod: undefined,
    referenceNumber: undefined,
    processedBy: undefined,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Converts Department Enum to readable human string
 */
export function formatDepartmentName(dept: StaffDepartment): string {
  switch (dept) {
    case 'academic':
      return 'Academic / Teaching';
    case 'administrative':
      return 'Administrative / Accounts';
    case 'management':
      return 'School Leadership / Admin';
    case 'support_security':
      return 'Security & Sanitation';
    case 'transport_facilities':
      return 'Transport & Facilities';
    default:
      return 'General Staff';
  }
}

/**
 * Parses raw rows from Google Sheet staffpayroll tab into StaffMember[] and PayrollRecord[]
 */
export function parseSheetRowsToStaffAndPayroll(rawRows: any[]): {
  staffList: StaffMember[];
  payrollRecords: PayrollRecord[];
} {
  const staffMap = new Map<string, StaffMember>();
  const records: PayrollRecord[] = [];

  rawRows.forEach((r, idx) => {
    // Strictly skip student data from entering staff payroll
    if (isStudentRow(r)) return;

    const id = String(
      r.staff_id ||
      r.staffId ||
      r.employee_id ||
      r.emp_id ||
      r.id ||
      r.sn ||
      r.s_n ||
      `STF-${String(idx + 1).padStart(3, '0')}`
    ).trim();

    const fullName = String(
      r.staff_name ||
      r.staffName ||
      r.full_name ||
      r.fullName ||
      r.name ||
      r.employee_name ||
      r.employee ||
      r.staff ||
      r.member_name ||
      ''
    ).trim();

    if (!fullName && !id) return;

    const baseSalary = Number(
      r.base_salary !== undefined
        ? r.base_salary
        : r.baseSalary !== undefined
        ? r.baseSalary
        : r.basic_salary !== undefined
        ? r.basic_salary
        : r.basicSalary !== undefined
        ? r.basicSalary
        : r.salary !== undefined
        ? r.salary
        : r.base_pay !== undefined
        ? r.base_pay
        : r.monthly_salary !== undefined
        ? r.monthly_salary
        : r.gross_salary !== undefined
        ? r.gross_salary
        : r.net_pay !== undefined
        ? r.net_pay
        : r.netPay !== undefined
        ? r.netPay
        : r.amount !== undefined
        ? r.amount
        : 0
    ) || 0;

    const allowancesNum = Number(r.allowances !== undefined ? r.allowances : (r.totalAllowances || r.allowance || r.bonus || 0)) || 0;
    const deductionsNum = Number(r.deductions !== undefined ? r.deductions : (r.totalDeductions || r.deduction || r.tax || 0)) || 0;
    const netPayNum = Number(r.net_pay !== undefined ? r.net_pay : (r.netPay !== undefined ? r.netPay : (baseSalary + allowancesNum - deductionsNum))) || 0;

    const role = String(
      r.role ||
      r.position ||
      r.designation ||
      r.job_title ||
      r.jobTitle ||
      r.title ||
      r.post ||
      'Staff Member'
    ).trim();

    const deptRaw = String(r.department || r.dept || r.unit || r.section || r.category || '').toLowerCase().replace(/[\s-]+/g, '_');
    let department: StaffDepartment = 'academic';
    if (deptRaw.includes('admin') || deptRaw.includes('account') || deptRaw.includes('bursar') || deptRaw.includes('secr')) department = 'administrative';
    else if (deptRaw.includes('manage') || deptRaw.includes('principal') || deptRaw.includes('head') || deptRaw.includes('direct') || deptRaw.includes('vp') || deptRaw.includes('proprietor')) department = 'management';
    else if (deptRaw.includes('sec') || deptRaw.includes('guard') || deptRaw.includes('support') || deptRaw.includes('clean') || deptRaw.includes('cook') || deptRaw.includes('sanit')) department = 'support_security';
    else if (deptRaw.includes('facil') || deptRaw.includes('driver') || deptRaw.includes('trans') || deptRaw.includes('bus') || deptRaw.includes('maint')) department = 'transport_facilities';
    else if (deptRaw.includes('other')) department = 'other';
    else if (role.toLowerCase().includes('principal') || role.toLowerCase().includes('director') || role.toLowerCase().includes('head') || role.toLowerCase().includes('proprietor')) department = 'management';
    else if (role.toLowerCase().includes('account') || role.toLowerCase().includes('admin') || role.toLowerCase().includes('bursar') || role.toLowerCase().includes('secretary') || role.toLowerCase().includes('clerk')) department = 'administrative';
    else if (role.toLowerCase().includes('driver') || role.toLowerCase().includes('bus') || role.toLowerCase().includes('transport') || role.toLowerCase().includes('facilities')) department = 'transport_facilities';
    else if (role.toLowerCase().includes('security') || role.toLowerCase().includes('guard') || role.toLowerCase().includes('cleaner') || role.toLowerCase().includes('cook') || role.toLowerCase().includes('gate')) department = 'support_security';

    const bankName = String(r.bank_name || r.bankName || r.bank || '').trim();
    const accountNumber = String(r.account_number || r.accountNumber || r.account_no || r.acc_no || r.account || '').trim();
    const phone = String(r.phone || r.phone_number || r.mobile || r.contact || r.phone_no || '').trim();

    // Check if staff member already collected
    if (!staffMap.has(id)) {
      staffMap.set(id, {
        id,
        fullName: fullName || `Staff ${id}`,
        role: role || 'Staff Member',
        department,
        baseSalary,
        allowances: {
          transport: allowancesNum,
          housing: 0,
          teachingBonus: 0,
          lessonAllowance: 0,
          responsibility: 0,
          otherAllowance: 0,
        },
        deductions: {
          pension: 0,
          taxPaye: 0,
          loanRepayment: 0,
          cooperative: 0,
          absencePenalty: 0,
          otherDeduction: deductionsNum,
        },
        bankName,
        accountNumber,
        phone,
        status: 'active',
        employmentType: 'full_time',
        joinedDate: r.payment_date || r.paymentDate || getTodayDateString(),
        notes: r.remarks || r.notes || '',
      });
    }

    if (r.month) {
      const month = String(r.month).trim();
      const statusRaw = String(r.payment_status || r.paymentStatus || r.status || 'pending').toLowerCase();
      const paymentStatus: 'paid' | 'pending' | 'partially_paid' = statusRaw.includes('paid') && !statusRaw.includes('unpaid') && !statusRaw.includes('not') ? 'paid' : 'pending';
      const amountPaid = Number(r.amount_paid !== undefined ? r.amount_paid : (r.amountPaid || 0)) || (paymentStatus === 'paid' ? netPayNum : 0);

      records.push({
        id: `PAY-${month.replace('-', '')}-${id}`,
        staffId: id,
        staffName: fullName || `Staff ${id}`,
        role: role || 'Staff Member',
        department,
        month,
        monthLabel: formatMonthLabel(month),
        term: r.term || 'First Term',
        session: r.session || getCurrentAcademicSession(),
        baseSalary,
        totalAllowances: allowancesNum,
        totalDeductions: deductionsNum,
        grossPay: baseSalary + allowancesNum,
        netPay: netPayNum,
        amountPaid,
        paymentStatus,
        paymentDate: r.payment_date || r.paymentDate || '',
        paymentMethod: r.payment_method || r.paymentMethod || '',
        referenceNumber: r.reference_number || r.referenceNumber || '',
        notes: r.remarks || r.notes || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  });

  return {
    staffList: Array.from(staffMap.values()),
    payrollRecords: records,
  };
}

/**
 * Applies staff loaded from the cloud. Staff saved here and not yet uploaded are kept.
 */
export function applyCloudStaff(cloud: StaffMember[], schoolId: string = 'dominion-group'): StaffMember[] {
  const { merged } = mergeCloudWithPending(cloud, getStoredStaff(schoolId), getPendingSyncIds('staff', schoolId));
  saveStoredStaff(merged, schoolId);
  return merged;
}

/**
 * Applies payroll records loaded from the cloud. Records saved here and not yet uploaded are kept.
 */
export function applyCloudPayroll(cloud: PayrollRecord[], schoolId: string = 'dominion-group'): PayrollRecord[] {
  const { merged } = mergeCloudWithPending(cloud, getStoredPayrollRecords(schoolId), getPendingSyncIds('payroll', schoolId));
  saveStoredPayrollRecords(merged, schoolId);
  return merged;
}
