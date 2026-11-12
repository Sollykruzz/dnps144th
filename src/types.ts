/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type PaymentStatus = 'unpaid' | 'part_payment' | 'fully_paid';

export type TabType = 'students' | 'record_payment' | 'payroll' | 'analytics' | 'collection';

export type RemittanceApprovalStatus = 'pending' | 'approved' | 'rejected' | 'voided';

export interface RemittanceRecord {
  id: string;
  amount: number;
  date: string; // YYYY-MM-DD
  timestamp: string; // ISO string
  remittedTo: string; // e.g. "School Main Account (First Bank)", "Principal / Management Cash Handover"
  referenceNumber: string; // e.g. "RMT-20260826-4821"
  bursarName: string;
  term?: string;
  session?: string;
  notes?: string;
  paymentMethod?: 'bank_deposit' | 'bank_transfer' | 'cash_handover' | 'pos_settlement' | 'other';
  status?: RemittanceApprovalStatus;
  approvalStatus?: RemittanceApprovalStatus;
  approvedBy?: string;
  approvedAt?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  submittedBy?: string;
  submittedByRole?: 'bursar' | 'admin';
  isVoided?: boolean;
  voidedBy?: string;
  voidedAt?: string;
  voidReason?: string;
  schoolId?: string;
  updatedAt?: string;
}

export interface ScholarshipRecord {
  id: string; // Student ID e.g. DNPS/0001
  student_name: string;
  full_name?: string; // Standard alias matching StudentPaymentRecord
  class: string;
  term: string;
  session: string;
  scholarship_type?: string; // e.g. "Full Tuition Exemption", "Merit Award", "Staff Child", "Orphan / Need-Based"
  scholarship_percentage?: number; // e.g. 100 for 100% exemption
  exempt_school_fee: boolean;
  scholarship_notes?: string;
  award_date?: string; // YYYY-MM-DD
  awarded_by?: string;
  status?: 'active' | 'graduated' | 'revoked' | 'suspended';
  created_at?: string;

  // Stored details copied from Students tab
  fee_amount?: number;
  amount_paid?: number;
  balance?: number;
  payment_status?: string;
  tuition_fee?: number;
  tuition_paid?: number;
  admission_fee?: number;
  admission_paid?: number;
  lesson_fee?: number;
  lesson_paid?: number;
  lesson_months?: string;
  exam_fee?: number;
  exam_paid?: number;
  receipt_no?: string;
  payment_date?: string;
}

export interface StudentPaymentRecord {
  id: string;
  full_name: string;
  class: string;
  term: string;
  session: string;
  fee_amount: number; // Total overall fee
  amount_paid: number; // Total overall amount paid
  balance: number;
  status: PaymentStatus;
  payment_date: string;

  // Scholarship & Exemption (Exempt from school fee alone)
  is_exempt_from_school_fee?: boolean;
  scholarship_notes?: string;

  // Granular Fee Columns & Statuses
  tuition_fee?: number;
  tuition_paid?: number;
  tuition_status?: PaymentStatus;

  admission_fee?: number; // e.g. 4000 for new admission
  admission_paid?: number;
  admission_status?: PaymentStatus;
  is_new_admission?: boolean;

  lesson_fee?: number; // e.g. 2000, 4000, 6000
  lesson_paid?: number;
  lesson_status?: 'unpaid' | 'part_payment' | 'fully_paid';
  lesson_months?: string; // e.g. "Full Term (Paid)", "September", "October", "Sept & Oct", "Unpaid"
  // When true the student does not attend after-school lessons: no lesson fee is charged and the
  // lesson line is hidden from payments. Ignored while the student has lesson money on record.
  lesson_disabled?: boolean;

  exam_fee?: number; // e.g. 1000
  exam_paid?: number;
  exam_status?: PaymentStatus;

  // Receipt Tracking (Specifically for School Fee & Latest Payment)
  receipt_no?: string;
  tuition_receipt_no?: string;
  admission_receipt_no?: string;
  lesson_receipt_no?: string;
  exam_receipt_no?: string;

  // Complete Immutable Payment & Receipt History for this Student in Current Term
  payment_history?: PaymentReceipt[];

  // Additional / Ancillary Fees assigned to or paid by this student
  additional_fees?: StudentAdditionalFee[];

  // Channel of the most recent payment (Cash, Transfer, POS and so on)
  payment_method?: string;

  // Remittance & Collection Tracking Column (Synced to Google Sheet)
  total_remitted?: number;
}

export type AdditionalFeeCategory =
  | 'levy'
  | 'uniform'
  | 'graduation'
  | 'books'
  | 'book'
  | 'excursion'
  | 'ict'
  | 'activity'
  | 'medical'
  | 'party'
  | 'other';

export interface AdditionalFeeItem {
  id: string; // Unique fee ID e.g. 'fee_pta_1725364821'
  name: string; // Fee name e.g. 'PTA Levy', 'Graduation Fee', 'Uniform & Sportswear'
  amount: number; // Amount in currency e.g. 2000, 15000
  targetClass: string; // 'all' for All Classes, or specific class name e.g. 'SSS 3', 'Primary 5'
  term?: string; // 'all' or 'First Term', 'Second Term', 'Third Term'
  targetTerm?: string; // Term applicability alias e.g. 'all', 'Term 1', 'Term 2', 'Term 3'
  category?: AdditionalFeeCategory;
  description?: string; // Optional notes or inclusions
  isCompulsory?: boolean; // Default true
  enabled?: boolean; // When false, the fee is disabled/paused and not charged to students. Default true
  createdAt?: string; // ISO date string
}

export interface StudentAdditionalFee {
  feeId: string; // Matches AdditionalFeeItem.id or unique custom ID
  name: string; // Fee label e.g. 'PTA Levy'
  amount: number; // Expected amount
  amountPaid: number; // Paid amount
  status: PaymentStatus; // 'unpaid' | 'part_payment' | 'fully_paid'
  receiptNo?: string;
  paymentDate?: string;
  notes?: string;
}

export interface ClassPaymentSummary {
  className: string;
  studentCount: number;
  totalFees: number;
  totalPaid: number;
  totalBalance: number;
  collectionRate: number; // 0 to 100 percentage
  fullyPaidCount: number;
  partPaidCount: number;
  unpaidCount: number;
}

export interface TermSnapshot {
  id: string;
  createdAt: string; // ISO string
  dateLabel: string;
  term: string;
  session: string;
  schoolName: string;
  bursarName: string;
  currencySymbol: string;
  studentCount: number;
  totalFees: number;
  totalPaid: number;
  totalBalance: number;
  overallCollectionRate: number;
  classesSummary: ClassPaymentSummary[];
  students: StudentPaymentRecord[];
  notes?: string;
}

export interface RolloverConfig {
  targetTerm: string;
  targetSession: string;
  actionType: 'rollover_reset' | 'promote_classes' | 'clean_slate';
  standardFeeAmount?: number;
  keepIndividualFees: boolean;
  notes?: string;
}

export interface SheetApiConfig {
  apiUrl: string;
  apiKey?: string;
  sheetName?: string;
  provider?: 'appsscript' | 'sheetdb' | 'google' | 'generic' | 'custom';
  autoSync?: boolean;
}

export interface SchoolFeeSchedule {
  tuitionFee: number;
  admissionFee: number;
  examFee: number;
  lessonFeeMonthly: number;
  lessonFeeTermly: number;
}

export interface SchoolProfile {
  id: string;
  name: string;
  type: 'primary' | 'secondary' | 'nursery' | 'combined' | 'college' | 'other';
  currencySymbol: string;
  feeSchedule: SchoolFeeSchedule;
  classFeeSchedules?: Record<string, SchoolFeeSchedule>;
  additionalFees?: AdditionalFeeItem[];
  classes: string[];
  motto?: string;
  /** School wide academic session, e.g. 2026/2027. Used as the default everywhere. */
  academicSession?: string;
  sheetConfig?: SheetApiConfig;
  createdAt: string;
}

export interface BursarSession {
  isAuthenticated: boolean;
  bursarName: string;
  username?: string;
  role?: 'admin' | 'bursar' | string;
  userTitle?: string;
  email?: string;
  schoolName: string;
  currencySymbol: string;
  activeSchoolId?: string;
  schoolId?: string;
  passcode?: string;
  lastLoginAt?: string;
}

export interface PaymentReceipt {
  id?: string;
  idempotencyKey?: string;
  receiptNumber: string;
  studentId: string;
  studentName: string;
  studentClass: string;
  term: string;
  session: string;
  amountPaidNow: number;
  totalFee: number;
  totalPaid: number;
  remainingBalance: number;
  status: PaymentStatus;
  paymentDate: string;
  timestamp: string;
  paymentMethod?: string;
  bursarName?: string;
  feeCategory?: 'school_fee' | 'admission' | 'lesson' | 'exam' | 'custom' | 'additional_fee';
  feeItemDescription?: string;
  additionalFeeId?: string;
  categoryFeeTotal?: number;
  categoryPaidCumulative?: number;
  categoryBalanceRemaining?: number;
  categoryStatus?: PaymentStatus;
  updatedStudent?: StudentPaymentRecord;
  // Lines of one sitting when several fees are paid on a single receipt
  items?: { description: string; amount: number; feeCategory?: PaymentReceipt['feeCategory'] }[];
}

export interface FilterState {
  classFilter: string;
  termFilter: string;
  statusFilter: 'all' | PaymentStatus;
  searchQuery: string;
}

export interface EndTermResult {
  success: boolean;
  backupTabName: string;
  rowCount: number;
  message: string;
  backupConfirmed: boolean;
  resetConfirmed: boolean;
  updatedStudents: StudentPaymentRecord[];
}

// -------------------------------------------------------------
// Staff Payroll Management Types
// -------------------------------------------------------------

export type StaffDepartment =
  | 'academic'
  | 'administrative'
  | 'support_security'
  | 'management'
  | 'transport_facilities'
  | 'other';

export type StaffEmploymentType = 'full_time' | 'part_time' | 'contract';

export type StaffStatus = 'active' | 'on_leave' | 'suspended' | 'resigned';

export interface StaffAllowances {
  transport?: number;
  housing?: number;
  teachingBonus?: number;
  lessonAllowance?: number;
  responsibility?: number;
  otherAllowance?: number;
}

export interface StaffDeductions {
  pension?: number;
  taxPaye?: number;
  loanRepayment?: number;
  cooperative?: number;
  absencePenalty?: number;
  otherDeduction?: number;
}

export interface StaffMember {
  id: string; // e.g. STF-001
  fullName: string;
  role: string; // e.g. "Primary 3 Class Teacher", "Head Teacher", "Security Guard", "Bursar"
  department: StaffDepartment;
  employmentType: StaffEmploymentType;
  baseSalary: number; // Monthly base salary
  bankName: string;
  accountNumber: string;
  accountName?: string;
  phone: string;
  email?: string;
  qualification?: string;
  status: StaffStatus;
  joinedDate: string; // YYYY-MM-DD
  allowances: StaffAllowances;
  deductions: StaffDeductions;
  notes?: string;
}

export type PayrollPaymentStatus = 'paid' | 'pending' | 'partially_paid';

export interface PayrollRecord {
  id: string; // e.g. PAY-202608-STF001
  staffId: string;
  staffName: string;
  role: string;
  department: StaffDepartment;
  month: string; // YYYY-MM (e.g. "2026-08")
  monthLabel: string; // e.g. "August 2026"
  term: string; // e.g. "First Term"
  session: string; // e.g. "2026/2027"
  baseSalary: number;
  totalAllowances: number;
  allowanceBreakdown?: StaffAllowances;
  totalDeductions: number;
  deductionBreakdown?: StaffDeductions;
  grossPay: number; // baseSalary + totalAllowances
  netPay: number; // grossPay - totalDeductions
  amountPaid: number;
  paymentStatus: PayrollPaymentStatus;
  paymentDate?: string; // YYYY-MM-DD
  paymentMethod?: 'bank_transfer' | 'cash' | 'cheque' | 'other';
  referenceNumber?: string;
  processedBy?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MonthlyPayrollSummary {
  month: string; // YYYY-MM
  monthLabel: string;
  totalStaffCount: number;
  activeStaffCount: number;
  totalBaseSalary: number;
  totalAllowances: number;
  totalDeductions: number;
  totalGrossExpense: number;
  totalNetExpense: number; // Monthly Staff Expense
  totalPaid: number;
  totalPending: number;
  paidCount: number;
  pendingCount: number;
  departmentBreakdown: Record<StaffDepartment, { count: number; totalNet: number }>;
}

export interface TermPayrollSummary {
  term: string;
  session: string;
  monthsCount: number; // Usually 3-4 months per term
  months: string[]; // ['2026-09', '2026-10', '2026-11']
  totalTermExpectedExpense: number; // Term projected expense
  totalTermDisbursed: number; // Term-to-date paid amount
  totalTermOutstanding: number; // Remaining payroll liability for the term
  monthlyBreakdowns: MonthlyPayrollSummary[];
  averageMonthlyExpense: number;
  activeStaffCount: number;
}

// -------------------------------------------------------------
// School Expense Tracking Types
// -------------------------------------------------------------

export type ExpenseCategory =
  | 'salary_payroll'
  | 'utilities_power'
  | 'generator_fuel'
  | 'maintenance_repairs'
  | 'teaching_materials'
  | 'exam_printing'
  | 'events_sports'
  | 'security_sanitation'
  | 'government_levy'
  | 'administrative_supplies'
  | 'other';

export interface ExpenseItem {
  id: string;
  category: ExpenseCategory;
  categoryLabel?: string;
  description: string;
  amount: number;
  date: string; // YYYY-MM-DD
  paymentMethod: 'cash' | 'bank_transfer' | 'pos' | 'cheque' | 'other';
  recipient?: string;
  receiptVoucherRef?: string;
  term?: string;
  session?: string;
  schoolId?: string;
  recordedBy?: string;
  notes?: string;
  createdAt: string; // ISO string
}

export type ExtraIncomeCategory =
  | 'pta_levy'
  | 'uniform_books'
  | 'grants_donations'
  | 'facility_rental'
  | 'transport_bus'
  | 'inter_house_sports'
  | 'graduation_party'
  | 'other_income';

export interface ExtraIncomeItem {
  id: string;
  category: ExtraIncomeCategory;
  categoryLabel?: string;
  description: string;
  amount: number;
  date: string; // YYYY-MM-DD
  paymentMethod: 'cash' | 'bank_transfer' | 'pos' | 'cheque' | 'other';
  payer?: string;
  receiptVoucherRef?: string;
  term?: string;
  session?: string;
  schoolId?: string;
  recordedBy?: string;
  notes?: string;
  createdAt: string; // ISO string
}

export interface BankTransactionEntry {
  id: string;
  date: string;
  timestamp: string;
  reference: string;
  type: 'CREDIT' | 'DEBIT';
  category: string;
  description: string;
  counterparty: string;
  paymentMethod: string;
  amount: number;
  runningBalance: number;
  term?: string;
  session?: string;
  sourceType: 'student_fee' | 'extra_income' | 'expense' | 'payroll';
}

export interface OverallSchoolFinancials {
  // Income components
  schoolFeeIncome: number;
  admissionFeeIncome: number;
  lessonFeeIncome: number;
  examFeeIncome: number;
  extraIncomeTotal: number;
  totalIncomeCollected: number;

  // Expected vs collected
  totalIncomeExpected: number;
  totalIncomeOutstanding: number;

  // Outflow components
  payrollDisbursed: number;
  otherExpensesTotal: number;
  totalExpenses: number;

  // Net Cash Flow
  netOperatingSurplus: number; // totalIncomeCollected - totalExpenses
  netMarginPercentage: number; // (netOperatingSurplus / totalIncomeCollected) * 100
}

// -------------------------------------------------------------
// Term Payment Duration & Academic Schedule
// -------------------------------------------------------------

export interface AcademicTermSchedule {
  term: string; // e.g. "First Term"
  session: string; // e.g. "2026/2027"
  termStartDate: string; // YYYY-MM-DD
  termEndDate: string; // YYYY-MM-DD
  salaryDueDay: number; // Day of month e.g. 25
  feeCollectionStartDate: string; // YYYY-MM-DD
  feeDueDate: string; // YYYY-MM-DD
  monthsInTerm: string[]; // e.g. ['2026-09', '2026-10', '2026-11', '2026-12']
  updatedAt?: string;
}

// -------------------------------------------------------------
// School Identity & Branding Types
// -------------------------------------------------------------

export interface AppBrandingConfig {
  appName: string;
  shortName: string;
  tagline: string;
  logoType: 'default_crest' | 'custom_upload' | 'url' | 'preset_emblem';
  customLogoData?: string;
  presetEmblem: 'crown' | 'shield' | 'mortarboard' | 'book' | 'torch' | 'crest' | 'star' | 'building' | 'globe' | 'feather' | 'laurel' | 'compass';
  emblemColor: string;
  primaryColor: string;
  schoolAddress: string;
  schoolPhone: string;
  schoolEmail: string;
  taxOrRegNo: string;
  bursarTitle: string;
  currencySymbol: string;
  receiptFooterText: string;
  enableWatermark: boolean;
  schoolId?: string;
  updatedAt?: string;
}

// -------------------------------------------------------------
// System Audit Log Types
// -------------------------------------------------------------

export type AuditActionCategory = 
  | 'PAYMENT' 
  | 'STUDENT' 
  | 'PAYROLL' 
  | 'EXPENSE' 
  | 'REMITTANCE' 
  | 'ROLLOVER' 
  | 'SNAPSHOT' 
  | 'SETTINGS' 
  | 'SYSTEM';

export type AuditActionSeverity = 'INFO' | 'SUCCESS' | 'WARNING' | 'CRITICAL';

export interface AuditLogEntry {
  id: string;
  timestamp: string; // ISO string
  readableTime: string; // Formatted date time string
  category: AuditActionCategory;
  action: string; // Short verb e.g. "RECORD_PAYMENT", "DELETE_REMITTANCE", "UPSERT_STAFF"
  description: string; // Human readable description
  details?: Record<string, any>;
  performer: string; // Bursar name or system
  schoolId?: string;
  severity: AuditActionSeverity;
}


