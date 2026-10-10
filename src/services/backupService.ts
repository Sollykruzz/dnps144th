/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { 
  StudentPaymentRecord, 
  BursarSession, 
  TermSnapshot, 
  RolloverConfig, 
  SchoolProfile,
  StaffMember,
  PayrollRecord,
  ExpenseItem,
  ScholarshipRecord,
  RemittanceRecord
} from '../types';
import * as XLSX from 'xlsx';
import { safeStorage } from './storage';
import { 
  calculateBalance, 
  calculateStatus, 
  calculateClassSummaries, 
  calculateOverallAnalytics, 
  getTodayDateString,
  deriveFeeBreakdown,
  computeStudentLiveFees,
  promoteSchoolClass,
  isLessonDisabled
} from './calculations';

const STORAGE_SNAPSHOTS_KEY = 'bursar_term_snapshots_archive';

/**
 * Computes a strictly isolated storage key for term snapshots per school
 */
export function getSchoolSnapshotsStorageKey(schoolId?: string): string {
  const normalizedId = (schoolId && schoolId.trim()) ? schoolId.trim().toLowerCase() : 'dominion-group';
  return `${STORAGE_SNAPSHOTS_KEY}_${normalizedId}`;
}

/**
 * Converts student payment records into CSV formatted string
 */
export function generateCsvData(
  students: StudentPaymentRecord[],
  session?: BursarSession,
  meta?: { term?: string; academicSession?: string; school?: SchoolProfile }
): string {
  const headers = [
    'Student ID',
    'Full Name',
    'Class',
    'Term',
    'Session',
    'Total Fee Amount',
    'Total Amount Paid',
    'Remaining Balance',
    'Overall Payment Status',
    'Last Payment Date',
    'Lesson Fee',
    'Lesson Paid',
    'Lesson Months',
    'Exam Fee',
    'Exam Paid',
    'Tuition Fee',
    'Tuition Paid',
    'Admission Fee',
    'Admission Paid',
    'Receipt No',
    'Total Remitted',
  ];

  const escapeCsv = (val: any) => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows = students.map((s) => {
    const live = computeStudentLiveFees(s, meta?.school);
    const breakdown = live.breakdown;
    return [
      escapeCsv(s.id),
      escapeCsv(s.full_name),
      escapeCsv(s.class),
      escapeCsv(s.term),
      escapeCsv(s.session),
      live.totalFee,
      live.amountPaid,
      live.balance,
      escapeCsv(live.status),
      escapeCsv(s.payment_date || 'N/A'),
      breakdown.lessonFee,
      breakdown.lessonPaid,
      escapeCsv(breakdown.lessonMonths || 'None'),
      breakdown.examFee,
      breakdown.examPaid,
      breakdown.tuitionFee,
      breakdown.tuitionPaid,
      breakdown.admissionFee,
      breakdown.admissionPaid,
      escapeCsv(s.receipt_no || 'N/A'),
      s.total_remitted ?? 0,
    ];
  });

  const headerRow = headers.join(',');
  const dataRows = rows.map((r) => r.join(',')).join('\n');

  return `${headerRow}\n${dataRows}`;
}

/**
 * Downloads a comprehensive multi-tab Excel (.xlsx) backup containing all school data
 */
export function downloadComprehensiveExcelBackup(
  data: {
    students?: StudentPaymentRecord[];
    staff?: StaffMember[];
    payroll?: PayrollRecord[];
    expenses?: ExpenseItem[];
    scholarships?: ScholarshipRecord[];
    remittances?: RemittanceRecord[];
    school?: SchoolProfile | null;
  },
  session: BursarSession
): void {
  const wb = XLSX.utils.book_new();

  // 1. Students sheet
  if (data.students && data.students.length > 0) {
    const studentRows = data.students.map((s) => {
      const live = computeStudentLiveFees(s, data.school);
      return {
        'Student ID': s.id,
        'Full Name': s.full_name,
        'Class': s.class,
        'Term': s.term,
        'Session': s.session,
        'Total Fee (Live)': live.totalFee,
        'Total Paid': live.amountPaid,
        'Remaining Balance': live.balance,
        'Status': live.status,
        'Tuition Fee': live.breakdown.tuitionFee,
        'Tuition Paid': live.breakdown.tuitionPaid,
        'Admission Fee': live.breakdown.admissionFee,
        'Admission Paid': live.breakdown.admissionPaid,
        'Exam Fee': live.breakdown.examFee,
        'Exam Paid': live.breakdown.examPaid,
        'Lesson Fee': live.breakdown.lessonFee,
        'Lesson Paid': live.breakdown.lessonPaid,
        'Lesson Months': live.breakdown.lessonMonths,
        'Receipt No': s.receipt_no || '',
        'Payment Date': s.payment_date || '',
      };
    });
    const wsStudents = XLSX.utils.json_to_sheet(studentRows);
    XLSX.utils.book_append_sheet(wb, wsStudents, 'Students');
  }

  // 2. Staff sheet
  if (data.staff && data.staff.length > 0) {
    const staffRows = data.staff.map((st) => ({
      'Staff ID': st.id,
      'Full Name': st.fullName,
      'Role': st.role,
      'Department': st.department,
      'Base Salary': st.baseSalary,
      'Account Number': st.accountNumber || '',
      'Bank Name': st.bankName || '',
      'Phone': st.phone || '',
      'Status': st.status,
    }));
    const wsStaff = XLSX.utils.json_to_sheet(staffRows);
    XLSX.utils.book_append_sheet(wb, wsStaff, 'Staff_Roster');
  }

  // 3. Payroll sheet
  if (data.payroll && data.payroll.length > 0) {
    const payrollRows = data.payroll.map((p) => ({
      'Payroll ID': p.id,
      'Staff Name': p.staffName,
      'Month': p.month,
      'Term': p.term,
      'Session': p.session,
      'Base Salary': p.baseSalary,
      'Total Allowances': p.totalAllowances || 0,
      'Total Deductions': p.totalDeductions || 0,
      'Net Pay': p.netPay,
      'Payment Status': p.paymentStatus,
      'Payment Date': p.paymentDate || '',
      'Payment Method': p.paymentMethod || '',
    }));
    const wsPayroll = XLSX.utils.json_to_sheet(payrollRows);
    XLSX.utils.book_append_sheet(wb, wsPayroll, 'Payroll');
  }

  // 4. Expenses sheet
  if (data.expenses && data.expenses.length > 0) {
    const expenseRows = data.expenses.map((e) => ({
      'Expense ID': e.id,
      'Date': e.date,
      'Category': e.category,
      'Description': e.description,
      'Amount': e.amount,
      'Recipient': e.recipient || '',
      'Payment Method': e.paymentMethod || '',
      'Term': e.term || '',
      'Session': e.session || '',
    }));
    const wsExpenses = XLSX.utils.json_to_sheet(expenseRows);
    XLSX.utils.book_append_sheet(wb, wsExpenses, 'Expenses');
  }

  // 5. Scholarships sheet
  if (data.scholarships && data.scholarships.length > 0) {
    const scholarshipRows = data.scholarships.map((sc) => ({
      'Scholarship ID': sc.id,
      'Student Name': sc.student_name,
      'Class': sc.class,
      'Exempt School Fee': sc.exempt_school_fee ? 'Yes' : 'No',
      'Scholarship Type': sc.scholarship_type || 'Full Exemption',
      'Discount %': sc.scholarship_percentage || 100,
      'Notes': sc.scholarship_notes || '',
    }));
    const wsScholarships = XLSX.utils.json_to_sheet(scholarshipRows);
    XLSX.utils.book_append_sheet(wb, wsScholarships, 'Scholarships');
  }

  // 6. Remittances sheet
  if (data.remittances && data.remittances.length > 0) {
    const remittanceRows = data.remittances.map((r) => ({
      'Remittance ID': r.id,
      'Reference No': r.referenceNumber,
      'Date': r.date,
      'Amount': r.amount,
      'Remitted To': r.remittedTo,
      'Payment Method': r.paymentMethod || '',
      'Bursar': r.bursarName || '',
      'Notes': r.notes || '',
    }));
    const wsRemittances = XLSX.utils.json_to_sheet(remittanceRows);
    XLSX.utils.book_append_sheet(wb, wsRemittances, 'Remittances');
  }

  // 7. Fee Schedules sheet
  if (data.school) {
    const feeRows = [
      {
        'Scope': 'Base School Schedule',
        'Class': 'All Classes Default',
        'Tuition Fee': data.school.feeSchedule.tuitionFee,
        'Admission Fee': data.school.feeSchedule.admissionFee,
        'Exam Fee': data.school.feeSchedule.examFee,
        'Lesson Fee (Monthly)': data.school.feeSchedule.lessonFeeMonthly,
        'Lesson Fee (Termly)': data.school.feeSchedule.lessonFeeTermly,
      },
    ];

    if (data.school.classFeeSchedules) {
      Object.entries(data.school.classFeeSchedules).forEach(([cls, sched]) => {
        feeRows.push({
          'Scope': 'Class Specific',
          'Class': cls,
          'Tuition Fee': sched.tuitionFee,
          'Admission Fee': sched.admissionFee,
          'Exam Fee': sched.examFee,
          'Lesson Fee (Monthly)': sched.lessonFeeMonthly,
          'Lesson Fee (Termly)': sched.lessonFeeTermly,
        });
      });
    }

    const wsFees = XLSX.utils.json_to_sheet(feeRows);
    XLSX.utils.book_append_sheet(wb, wsFees, 'Fee_Schedules');
  }

  const schoolSlug = (session.schoolName || 'dominion_group').toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const dateStamp = getTodayDateString();
  const filename = `${schoolSlug}_complete_backup_${dateStamp}.xlsx`;

  XLSX.writeFile(wb, filename);
}

/**
 * Triggers instant download of CSV backup file in browser
 */
export function downloadCsvBackup(
  students: StudentPaymentRecord[],
  session: BursarSession,
  meta?: { term?: string; academicSession?: string; school?: SchoolProfile }
): void {
  const csvContent = generateCsvData(students, session, meta);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.setAttribute('href', url);
  
  const schoolSlug = (session.schoolName || 'dominion_group').toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const termSlug = (meta?.term || 'current_term').toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const dateStamp = getTodayDateString();
  
  link.setAttribute('download', `${schoolSlug}_students_${termSlug}_${dateStamp}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generates an exhaustive CSV containing all students, remittances, expenses, and scholarships
 */
export function generateAllCurrentDataCsv(
  data: {
    students?: StudentPaymentRecord[];
    remittances?: RemittanceRecord[];
    expenses?: ExpenseItem[];
    scholarships?: ScholarshipRecord[];
    school?: SchoolProfile | null;
  },
  session?: BursarSession,
  meta?: { term?: string; academicSession?: string; school?: SchoolProfile }
): string {
  const escapeCsv = (val: any) => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const lines: string[] = [];

  // --- SECTION 1: STUDENT PAYMENT & FEE RECORDS ---
  const studentHeaders = [
    'Student ID',
    'Full Name',
    'Class',
    'Term',
    'Session',
    'Total Fee Amount',
    'Total Amount Paid',
    'Remaining Balance',
    'Overall Payment Status',
    'Last Payment Date',
    'Tuition Fee',
    'Tuition Paid',
    'Admission Fee',
    'Admission Paid',
    'Exam Fee',
    'Exam Paid',
    'Lesson Fee',
    'Lesson Paid',
    'Lesson Months',
    'Receipt No',
    'Total Remitted',
    'Exempt School Fee',
    'Scholarship Notes',
  ];
  lines.push(studentHeaders.join(','));

  const students = data.students || [];
  if (students.length > 0) {
    students.forEach((s) => {
      const live = computeStudentLiveFees(s, meta?.school || data.school || undefined);
      const breakdown = live.breakdown;
      lines.push([
        escapeCsv(s.id),
        escapeCsv(s.full_name),
        escapeCsv(s.class),
        escapeCsv(s.term),
        escapeCsv(s.session),
        live.totalFee,
        live.amountPaid,
        live.balance,
        escapeCsv(live.status),
        escapeCsv(s.payment_date || 'N/A'),
        breakdown.tuitionFee,
        breakdown.tuitionPaid,
        breakdown.admissionFee,
        breakdown.admissionPaid,
        breakdown.examFee,
        breakdown.examPaid,
        breakdown.lessonFee,
        breakdown.lessonPaid,
        escapeCsv(breakdown.lessonMonths || 'None'),
        escapeCsv(s.receipt_no || 'N/A'),
        s.total_remitted ?? 0,
        escapeCsv(s.is_exempt_from_school_fee ? 'Yes' : 'No'),
        escapeCsv(s.scholarship_notes || ''),
      ].join(','));
    });
  } else {
    lines.push('""');
  }

  // --- SECTION 2: REMITTANCES & BANK DEPOSITS ---
  const remittances = data.remittances || [];
  if (remittances.length > 0) {
    lines.push('');
    lines.push('# --- REMITTANCES & BANK HANDOVERS ---');
    const remittanceHeaders = [
      'Remittance ID',
      'Reference Number',
      'Date',
      'Amount',
      'Remitted To',
      'Payment Method',
      'Status',
      'Bursar Name',
      'Approved By',
      'Approved At',
      'Notes',
    ];
    lines.push(remittanceHeaders.join(','));
    remittances.forEach((r) => {
      lines.push([
        escapeCsv(r.id),
        escapeCsv(r.referenceNumber),
        escapeCsv(r.date),
        r.amount,
        escapeCsv(r.remittedTo),
        escapeCsv(r.paymentMethod || 'bank_deposit'),
        escapeCsv(r.status || r.approvalStatus || 'approved'),
        escapeCsv(r.bursarName || ''),
        escapeCsv(r.approvedBy || ''),
        escapeCsv(r.approvedAt || ''),
        escapeCsv(r.notes || ''),
      ].join(','));
    });
  }

  // --- SECTION 3: OPERATIONAL EXPENSES ---
  const expenses = data.expenses || [];
  if (expenses.length > 0) {
    lines.push('');
    lines.push('# --- OPERATIONAL EXPENSES ---');
    const expenseHeaders = [
      'Expense ID',
      'Date',
      'Category',
      'Description',
      'Amount',
      'Recipient',
      'Payment Method',
      'Term',
      'Session',
    ];
    lines.push(expenseHeaders.join(','));
    expenses.forEach((e) => {
      lines.push([
        escapeCsv(e.id),
        escapeCsv(e.date),
        escapeCsv(e.category),
        escapeCsv(e.description),
        e.amount,
        escapeCsv(e.recipient || ''),
        escapeCsv(e.paymentMethod || ''),
        escapeCsv(e.term || ''),
        escapeCsv(e.session || ''),
      ].join(','));
    });
  }

  // --- SECTION 4: SCHOLARSHIPS & WAIVERS ---
  const scholarships = data.scholarships || [];
  if (scholarships.length > 0) {
    lines.push('');
    lines.push('# --- SCHOLARSHIPS & EXEMPTIONS ---');
    const scholarshipHeaders = [
      'Scholarship ID',
      'Student Name',
      'Class',
      'Exemption Type',
      'Discount %',
      'Notes',
    ];
    lines.push(scholarshipHeaders.join(','));
    scholarships.forEach((sc) => {
      lines.push([
        escapeCsv(sc.id),
        escapeCsv(sc.student_name),
        escapeCsv(sc.class),
        escapeCsv(sc.scholarship_type || 'Full Exemption'),
        sc.scholarship_percentage ?? 100,
        escapeCsv(sc.scholarship_notes || ''),
      ].join(','));
    });
  }

  // --- SECTION 5: AUDIT TOTALS & SNAPSHOT METRICS ---
  lines.push('');
  lines.push('# --- AUDIT OVERVIEW PRIOR TO CLEAN SLATE WIPE ---');
  lines.push('Metric,Value');
  const analytics = calculateOverallAnalytics(students);
  lines.push(`School Name,${escapeCsv(session?.schoolName || 'Dominion Group Of Schools')}`);
  lines.push(`Export Timestamp,${escapeCsv(new Date().toISOString())}`);
  lines.push(`Total Students Exported,${students.length}`);
  lines.push(`Total School Fees Billed,${analytics.totalFees}`);
  lines.push(`Total Fees Paid,${analytics.totalPaid}`);
  lines.push(`Total Outstanding Arrears,${analytics.totalBalance}`);
  lines.push(`Total Remittances Count,${remittances.length}`);
  lines.push(`Total Expenses Count,${expenses.length}`);
  lines.push(`Total Scholarships Count,${scholarships.length}`);

  return lines.join('\n');
}

/**
 * Automatically triggers download of all current school data as a comprehensive CSV backup
 */
export function downloadAllCurrentDataCsvBackup(
  data: {
    students?: StudentPaymentRecord[];
    remittances?: RemittanceRecord[];
    expenses?: ExpenseItem[];
    scholarships?: ScholarshipRecord[];
    school?: SchoolProfile | null;
  },
  session: BursarSession,
  meta?: { term?: string; academicSession?: string; school?: SchoolProfile }
): void {
  const csvContent = generateAllCurrentDataCsv(data, session, meta);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.setAttribute('href', url);

  const schoolSlug = (session.schoolName || 'dominion_group')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const termSlug = (meta?.term || (data.students && data.students[0]?.term) || 'current_term')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_');
  const dateStamp = getTodayDateString();

  link.setAttribute('download', `${schoolSlug}_ALL_DATA_CLEAN_SLATE_BACKUP_${termSlug}_${dateStamp}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Converts data to JSON string and triggers browser download
 */
export function downloadJsonBackup(
  students: StudentPaymentRecord[],
  session: BursarSession,
  extraData?: Record<string, any>
): void {
  const backupPayload = {
    metadata: {
      exportedAt: new Date().toISOString(),
      schoolName: session.schoolName,
      currencySymbol: session.currencySymbol,
      bursarName: session.bursarName,
      totalStudents: students.length,
    },
    students,
    ...extraData,
  };

  const jsonContent = JSON.stringify(backupPayload, null, 2);
  const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.setAttribute('href', url);
  
  const schoolSlug = (session.schoolName || 'dominion_group').toLowerCase().replace(/[^a-z0-9]+/g, '_');
  const dateStamp = getTodayDateString();
  
  link.setAttribute('download', `${schoolSlug}_backup_${dateStamp}.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Saves a permanent snapshot of current term records to isolated local storage
 */
export function saveLocalSnapshot(
  students: StudentPaymentRecord[],
  session: BursarSession,
  term?: string,
  academicSession?: string,
  notes?: string,
  schoolId?: string
): TermSnapshot {
  const resolvedTerm = term || students[0]?.term || 'Current Term';
  const resolvedSession = academicSession || students[0]?.session || 'Current Session';
  
  const classSummaries = calculateClassSummaries(students);
  const analytics = calculateOverallAnalytics(students);

  const snapshot: TermSnapshot = {
    id: `snap_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    createdAt: new Date().toISOString(),
    dateLabel: getTodayDateString(),
    term: resolvedTerm,
    session: resolvedSession,
    schoolName: session.schoolName || 'Dominion Group Of Schools',
    bursarName: session.bursarName || 'Head Bursar',
    currencySymbol: session.currencySymbol || '₦',
    studentCount: students.length,
    totalFees: analytics.totalFees,
    totalPaid: analytics.totalPaid,
    totalBalance: analytics.totalBalance,
    overallCollectionRate: analytics.collectionRate,
    classesSummary: classSummaries,
    students: JSON.parse(JSON.stringify(students)),
    notes: notes || `Term closing archive for ${resolvedTerm} (${resolvedSession})`,
  };

  const targetSchoolId = schoolId || session.activeSchoolId || session.schoolId || 'dominion-group';
  const targetKey = getSchoolSnapshotsStorageKey(targetSchoolId);

  try {
    const existingRaw = safeStorage.getItem(targetKey);
    const existingSnapshots: TermSnapshot[] = existingRaw ? JSON.parse(existingRaw) : [];
    const updated = [snapshot, ...existingSnapshots];
    safeStorage.setItem(targetKey, JSON.stringify(updated));
  } catch (err) {
    console.error(`[Snapshot Error] Failed saving snapshot for school '${targetSchoolId}':`, err);
  }

  return snapshot;
}

/**
 * Retrieves all stored term snapshots for the target school
 */
export function getSavedSnapshots(schoolId?: string): TermSnapshot[] {
  const targetSchoolId = schoolId || 'dominion-group';
  const targetKey = getSchoolSnapshotsStorageKey(targetSchoolId);

  try {
    const raw = safeStorage.getItem(targetKey);
    if (!raw) return [];
    return JSON.parse(raw) as TermSnapshot[];
  } catch (err) {
    console.error(`[Snapshot Error] Failed loading snapshots for school '${targetSchoolId}':`, err);
    return [];
  }
}

/**
 * Deletes a term snapshot by ID
 */
export function deleteSnapshot(snapshotId: string, schoolId?: string): boolean {
  const targetSchoolId = schoolId || 'dominion-group';
  const targetKey = getSchoolSnapshotsStorageKey(targetSchoolId);

  try {
    const raw = safeStorage.getItem(targetKey);
    if (!raw) return false;
    const list = JSON.parse(raw) as TermSnapshot[];
    const filtered = list.filter((s) => s.id !== snapshotId);
    safeStorage.setItem(targetKey, JSON.stringify(filtered));
    return true;
  } catch {
    return false;
  }
}

/**
 * Executes a Next Term or Next Session Rollover:
 * 1. Takes an automatic backup snapshot of current term/session
 * 2. Prepares new term records with live clean balances
 */
export async function executeTermRollover(
  currentStudents: StudentPaymentRecord[],
  rolloverConfig: RolloverConfig,
  session: BursarSession
): Promise<{ updatedStudents: StudentPaymentRecord[]; snapshot: TermSnapshot }> {
  // Step 1: Save full snapshot of closing term
  const snapshot = saveLocalSnapshot(
    currentStudents,
    session,
    currentStudents[0]?.term,
    currentStudents[0]?.session,
    `Auto-backup created before rollover to ${rolloverConfig.targetTerm} (${rolloverConfig.targetSession})`
  );

  // Step 2: Transform student records for the new term/session
  const targetTerm = rolloverConfig.targetTerm.trim() || '1st Term';
  const targetSession = rolloverConfig.targetSession.trim() || session.schoolName;

  const newTermStudents: StudentPaymentRecord[] = currentStudents.map((s) => {
    let newClass = s.class;
    if (rolloverConfig.actionType === 'promote_classes') {
      newClass = promoteSchoolClass(s.class);
    }

    const isExempt = Boolean(
      s.is_exempt_from_school_fee ||
      (s as any).is_scholarship ||
      (s as any).scholarship ||
      (s as any).exempt
    );

    const baseFeeAmount = (rolloverConfig.standardFeeAmount && rolloverConfig.standardFeeAmount > 0 && !rolloverConfig.keepIndividualFees)
      ? rolloverConfig.standardFeeAmount
      : Math.max(0, Number(s.fee_amount) || 0);

    const feeAmount = isExempt ? 0 : baseFeeAmount;
    const amountPaid = 0; // Clean slate for new term payments
    const balance = isExempt ? 0 : calculateBalance(feeAmount, amountPaid);
    const status = isExempt ? 'fully_paid' : calculateStatus(feeAmount, amountPaid);

    return {
      id: s.id,
      full_name: s.full_name,
      class: newClass,
      term: targetTerm,
      session: targetSession,
      fee_amount: feeAmount,
      amount_paid: 0,
      balance: balance,
      status: status,
      payment_date: '',
      is_exempt_from_school_fee: isExempt,
      scholarship_notes: s.scholarship_notes || undefined,
      tuition_fee: feeAmount,
      tuition_paid: 0,
      tuition_status: isExempt ? 'fully_paid' : 'unpaid',
      lesson_fee: isLessonDisabled(s) ? 0 : (s.lesson_fee !== undefined ? Number(s.lesson_fee) : 0),
      lesson_paid: 0,
      lesson_status: isLessonDisabled(s) ? 'fully_paid' : 'unpaid',
      lesson_months: isLessonDisabled(s) ? 'Not Enrolled' : 'Unpaid',
      lesson_disabled: isLessonDisabled(s),
      exam_fee: s.exam_fee !== undefined ? Number(s.exam_fee) : 1000,
      exam_paid: 0,
      exam_status: 'unpaid',
      receipt_no: '',
      total_remitted: 0,
    };
  });

  return {
    updatedStudents: newTermStudents,
    snapshot,
  };
}

/**
 * Wipes the active roster for a 100% clean slate starting from zero,
 * after securing a permanent backup snapshot.
 */
export async function executeCleanSlateWipe(
  currentStudents: StudentPaymentRecord[],
  session: BursarSession
): Promise<{ snapshot: TermSnapshot }> {
  // Step 1: Save full snapshot
  const snapshot = saveLocalSnapshot(
    currentStudents,
    session,
    currentStudents[0]?.term || 'Archived Term',
    currentStudents[0]?.session || 'Archived Session',
    'Archive created prior to clean slate reset'
  );

  return { snapshot };
}

// Convenience export aliases
export const getStoredSnapshots = getSavedSnapshots;
export const deleteStoredSnapshot = deleteSnapshot;
