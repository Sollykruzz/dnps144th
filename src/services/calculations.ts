/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PaymentStatus, StudentPaymentRecord, ClassPaymentSummary, SchoolFeeSchedule, SchoolProfile, PaymentReceipt, AdditionalFeeItem, StudentAdditionalFee } from '../types';

/**
 * Standard Fee Schedule Configuration (fallback values used when a school has not set its own):
 * Admission Fee: ₦5,000 (new student enrolment only)
 * School Fee: ₦15,000 per term
 * Lesson Fee: ₦2,500 per month, or ₦7,000 for the full term
 * Exam Fee: ₦1,500 per term
 */
export const FEE_SCHEDULE = {
  ADMISSION_FEE: 5000,
  EXAM_FEE: 1500,
  LESSON_FEE_MONTHLY: 2500,
  LESSON_FEE_TERMLY: 7000, // Termly lesson fee
  DEFAULT_SCHOOL_FEE: 15000, // Base default School Fee
  DEFAULT_BASE_SCHOOL_FEES: {
    'JSS 1': 15000,
    'JSS 2': 15000,
    'JSS 3': 15000,
    'SSS 1': 15000,
    'SSS 2': 15000,
    'SSS 3': 15000,
    'Primary': 15000,
    'Nursery': 15000,
    'Default': 15000,
  } as Record<string, number>,
};

export const ACADEMIC_MONTHS = [
  'September',
  'October',
  'November',
  'December',
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
];

/**
 * Standard School Class Hierarchy:
 * Kg1 -> Kg2 -> Nur1 -> Nur2 -> Pri1 -> Pri2 -> Pri3 -> Pri4 -> Pri5 -> Jss1 -> Jss2 -> Jss3 -> Ss1 -> Ss2 -> Ss3
 */
export const STANDARD_CLASSES = [
  'Kg1',
  'Kg2',
  'Nur1',
  'Nur2',
  'Pri1',
  'Pri2',
  'Pri3',
  'Pri4',
  'Pri5',
  'Jss1',
  'Jss2',
  'Jss3',
  'Ss1',
  'Ss2',
  'Ss3',
] as const;

/**
 * Normalizes any class string into standard canonical format (e.g. "ss3", "SS3", "SSS 3" -> "Ss3")
 */
export function normalizeClassName(cls?: string): string {
  if (!cls || typeof cls !== 'string') return '';
  const clean = cls.trim();
  if (!clean) return '';
  const lower = clean.toLowerCase().replace(/[\s_-]+/g, '');

  if (lower === 'kg1' || lower === 'kindergarten1' || lower === 'creche' || lower === 'playgroup') return 'Kg1';
  if (lower === 'kg2' || lower === 'kindergarten2') return 'Kg2';
  if (lower === 'nur1' || lower === 'nursery1' || lower === 'reception') return 'Nur1';
  if (lower === 'nur2' || lower === 'nursery2' || lower === 'nursery' || lower === 'transition') return 'Nur2';
  if (lower === 'pri1' || lower === 'primary1' || lower === 'basic1' || lower === 'grade1') return 'Pri1';
  if (lower === 'pri2' || lower === 'primary2' || lower === 'basic2' || lower === 'grade2') return 'Pri2';
  if (lower === 'pri3' || lower === 'primary3' || lower === 'basic3' || lower === 'grade3') return 'Pri3';
  if (lower === 'pri4' || lower === 'primary4' || lower === 'basic4' || lower === 'grade4') return 'Pri4';
  if (lower === 'pri5' || lower === 'primary5' || lower === 'basic5' || lower === 'grade5') return 'Pri5';
  if (lower === 'pri6' || lower === 'primary6' || lower === 'basic6' || lower === 'grade6') return 'Pri6';
  if (lower === 'jss1' || lower === 'js1' || lower === 'junior1' || lower === 'juniorsecondary1') return 'Jss1';
  if (lower === 'jss2' || lower === 'js2' || lower === 'junior2' || lower === 'juniorsecondary2') return 'Jss2';
  if (lower === 'jss3' || lower === 'js3' || lower === 'junior3' || lower === 'juniorsecondary3') return 'Jss3';
  if (lower === 'ss1' || lower === 'sss1' || lower === 'senior1' || lower === 'seniorsecondary1') return 'Ss1';
  if (lower === 'ss2' || lower === 'sss2' || lower === 'senior2' || lower === 'seniorsecondary2') return 'Ss2';
  if (lower === 'ss3' || lower === 'sss3' || lower === 'senior3' || lower === 'seniorsecondary3') return 'Ss3';
  if (lower === 'graduated') return 'Graduated';

  return clean;
}

/**
 * Promotes a student class to the next academic grade for Session Upgrade:
 * Kg1 -> Kg2 -> Nur1 -> Nur2 -> Pri1 -> Pri2 -> Pri3 -> Pri4 -> Pri5 -> Jss1 -> Jss2 -> Jss3 -> Ss1 -> Ss2 -> Ss3 -> Graduated
 */
export function promoteSchoolClass(currentClass: string): string {
  if (!currentClass || typeof currentClass !== 'string') return 'Kg1';
  const clean = currentClass.trim();
  const normalized = clean.toLowerCase().replace(/\s+/g, '');

  if (normalized === 'kg1' || normalized === 'kindergarten1' || normalized === 'creche' || normalized === 'playgroup') {
    return 'Kg2';
  }
  if (normalized === 'kg2' || normalized === 'kindergarten2') {
    return 'Nur1';
  }
  if (normalized === 'nur1' || normalized === 'nursery1' || normalized === 'reception') {
    return 'Nur2';
  }
  if (normalized === 'nur2' || normalized === 'nursery2' || normalized === 'nursery' || normalized === 'transition') {
    return 'Pri1';
  }
  if (normalized === 'pri1' || normalized === 'primary1' || normalized === 'basic1' || normalized === 'grade1') {
    return 'Pri2';
  }
  if (normalized === 'pri2' || normalized === 'primary2' || normalized === 'basic2' || normalized === 'grade2') {
    return 'Pri3';
  }
  if (normalized === 'pri3' || normalized === 'primary3' || normalized === 'basic3' || normalized === 'grade3') {
    return 'Pri4';
  }
  if (normalized === 'pri4' || normalized === 'primary4' || normalized === 'basic4' || normalized === 'grade4') {
    return 'Pri5';
  }
  if (normalized === 'pri5' || normalized === 'primary5' || normalized === 'basic5' || normalized === 'grade5') {
    return 'Jss1';
  }
  if (normalized === 'pri6' || normalized === 'primary6' || normalized === 'basic6' || normalized === 'grade6') {
    return 'Jss1';
  }
  if (normalized === 'jss1' || normalized === 'js1' || normalized === 'junior1') {
    return 'Jss2';
  }
  if (normalized === 'jss2' || normalized === 'js2' || normalized === 'junior2') {
    return 'Jss3';
  }
  if (normalized === 'jss3' || normalized === 'js3' || normalized === 'junior3') {
    return 'Ss1';
  }
  if (normalized === 'ss1' || normalized === 'sss1' || normalized === 'senior1') {
    return 'Ss2';
  }
  if (normalized === 'ss2' || normalized === 'sss2' || normalized === 'senior2') {
    return 'Ss3';
  }
  if (normalized === 'ss3' || normalized === 'sss3' || normalized === 'senior3') {
    return 'Graduated';
  }

  return clean;
}

/**
 * Sorts an array of class name strings in academic progression order
 */
export function sortClassesInAcademicOrder(classes: string[]): string[] {
  const orderRank: Record<string, number> = {
    'kg1': 1,
    'kg2': 2,
    'nur1': 3,
    'nursery1': 3,
    'nur2': 4,
    'nursery2': 4,
    'nursery': 4,
    'pri1': 5,
    'primary1': 5,
    'basic1': 5,
    'pri2': 6,
    'primary2': 6,
    'basic2': 6,
    'pri3': 7,
    'primary3': 7,
    'basic3': 7,
    'pri4': 8,
    'primary4': 8,
    'basic4': 8,
    'pri5': 9,
    'primary5': 9,
    'basic5': 9,
    'pri6': 10,
    'primary6': 10,
    'basic6': 10,
    'jss1': 11,
    'js1': 11,
    'jss2': 12,
    'js2': 12,
    'jss3': 13,
    'js3': 13,
    'ss1': 14,
    'sss1': 14,
    'ss2': 15,
    'sss2': 15,
    'ss3': 16,
    'sss3': 16,
    'graduated': 17,
  };

  return [...classes].sort((a, b) => {
    const rankA = orderRank[a.toLowerCase().replace(/\s+/g, '')] ?? 99;
    const rankB = orderRank[b.toLowerCase().replace(/\s+/g, '')] ?? 99;
    if (rankA !== rankB) return rankA - rankB;
    return a.localeCompare(b);
  });
}

/**
 * Safely parses any financial amount (handles numbers, currency symbols like ₦/$ /etc,
 * comma-separated numbers, accounting negatives, whitespace, null/undefined).
 * Always returns a finite non-negative number (or fallback).
 */
export function parseFinancialAmount(val: any, fallback: number = 0): number {
  if (val === undefined || val === null || val === '') return fallback;
  if (typeof val === 'number') {
    return Number.isFinite(val) ? Math.max(0, val) : fallback;
  }

  const str = String(val)
    .replace(/[\uFEFF\uFFFE\u00EF\u00BB\u00BF]/g, '')
    .replace(/₦|\$|€|£|ghs|kes|zar|,|\s/gi, '')
    .trim();

  if (!str) return fallback;

  // Accounting negatives such as (500) are treated as zero, like every other negative input
  if (str.startsWith('(') && str.endsWith(')')) {
    const parsed = parseFloat(str.slice(1, -1));
    return Number.isFinite(parsed) ? 0 : fallback;
  }

  const parsed = parseFloat(str);
  return Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
}

/**
 * Rounds a money value to 2 decimal places so repeated additions never drift.
 */
export function roundMoney(value: number): number {
  const n = Number.isFinite(value) ? value : 0;
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function calculateScholarshipTuition(
  baseTuition: number | string,
  scholarshipPercentage: number | string,
  exemptSchoolFee = false
): {
  baseTuition: number;
  scholarshipPercentage: number;
  waivedPercentage: number;
  waivedAmount: number;
  tuitionFee: number;
} {
  const base = roundMoney(parseFinancialAmount(baseTuition, 0));
  const rawPercentage = Number(scholarshipPercentage);
  const percentage = Number.isFinite(rawPercentage)
    ? Math.min(100, Math.max(0, rawPercentage))
    : 100;
  const waivedPercentage = exemptSchoolFee ? 100 : percentage;
  const waivedAmount = roundMoney((base * waivedPercentage) / 100);

  return {
    baseTuition: base,
    scholarshipPercentage: percentage,
    waivedPercentage,
    waivedAmount,
    tuitionFee: Math.max(0, roundMoney(base - waivedAmount)),
  };
}

/**
 * True when the student has been opted out of after-school lessons.
 * The opt-out is ignored once any lesson money is on record, so a recorded payment can never
 * disappear from the books. Remove or refund the payment first, then disable the lesson fee.
 */
export function isLessonDisabled(student: Partial<StudentPaymentRecord> | null | undefined): boolean {
  if (!student || student.lesson_disabled !== true) return false;
  if (parseFinancialAmount(student.lesson_paid, 0) > 0) return false;
  const history = Array.isArray(student.payment_history) ? student.payment_history : [];
  return !history.some((h) => h && h.feeCategory === 'lesson' && parseFinancialAmount(h.amountPaidNow, 0) > 0);
}

/**
 * Labels the app generates by itself for display (never typed by a user).
 * They must never be stored as the lesson plan or used to decide a fee.
 */
export function isAutoLessonLabel(label?: string | null): boolean {
  const text = (label || '').trim();
  if (!text) return false;
  return /^(none|unpaid|full term|part payment|termly \((paid|part payment)\)|\d+\s*months?\s*paid)$/i.test(text);
}

/**
 * Returns the lesson label only when a person chose it (month names, "2 Months" and so on).
 */
export function sanitizeLessonMonths(label?: string | null): string {
  const text = (label || '').trim();
  return isAutoLessonLabel(text) ? '' : text;
}

/**
 * Reads the lesson plan length (1 or 2 months) from a label chosen by a person.
 * Returns 0 for the termly plan or for any label the app generated itself.
 */
export function detectLessonPlanMonths(lessonMonths?: string | null): 0 | 1 | 2 {
  const text = (lessonMonths || '').trim();
  if (!text || /paid|part payment|full term/i.test(text)) return 0;
  if (/(^|[^0-9])2\s*months?\b/i.test(text)) return 2;
  if (/(^|[^0-9])1\s*months?\b/i.test(text)) return 1;
  return 0;
}

let configuredAcademicSession = '';

/**
 * Normalises a typed session such as 2026-2027 or 2026 / 2027 to 2026/2027.
 * Returns an empty string when the text is not a valid session.
 */
export function normalizeSessionLabel(value?: string | null): string {
  const m = String(value || '').trim().match(/^(\d{4})\s*[\/\-\\]\s*(\d{4})$/);
  if (!m) return '';
  return Number(m[2]) === Number(m[1]) + 1 ? `${m[1]}/${m[2]}` : '';
}

/**
 * Sets the session chosen in Settings. Every default in the app then follows it.
 * Pass an empty value to go back to the calendar based session.
 */
export function setConfiguredAcademicSession(value?: string | null): void {
  configuredAcademicSession = normalizeSessionLabel(value);
}

/**
 * Academic session. Uses the session set in Settings. If none is set, it is worked
 * out from the date (a Nigerian session starts in September).
 */
export function getCurrentAcademicSession(date?: Date): string {
  if (!date && configuredAcademicSession) return configuredAcademicSession;
  const d = date || new Date();
  const year = d.getFullYear();
  return d.getMonth() >= 8 ? `${year}/${year + 1}` : `${year - 1}/${year}`;
}

/**
 * Calculates total payable fee from breakdown:
 * baseSchoolFee + lessonFee + examFee
 */
export function calculateItemizedTotalFee(
  baseSchoolFee: number,
  lessonOption: 'none' | '1_month' | '2_months' | 'termly' | 'custom',
  includeExamFee: boolean,
  customLessonAmount: number = 0
): {
  totalFee: number;
  schoolFee: number;
  lessonFee: number;
  examFee: number;
} {
  const schoolFee = parseFinancialAmount(baseSchoolFee, 0);
  let lessonFee = 0;
  if (lessonOption === '1_month') lessonFee = FEE_SCHEDULE.LESSON_FEE_MONTHLY;
  else if (lessonOption === '2_months') lessonFee = FEE_SCHEDULE.LESSON_FEE_MONTHLY * 2;
  else if (lessonOption === 'termly') lessonFee = FEE_SCHEDULE.LESSON_FEE_TERMLY;
  else if (lessonOption === 'custom') lessonFee = parseFinancialAmount(customLessonAmount, 0);

  const examFee = includeExamFee ? FEE_SCHEDULE.EXAM_FEE : 0;
  const totalFee = schoolFee + lessonFee + examFee;

  return {
    totalFee,
    schoolFee,
    lessonFee,
    examFee,
  };
}

/**
 * Resolves the precise fee schedule for a given class, checking class-specific
 * overrides first before falling back to the school's general fee schedule.
 */
export function getClassFeeSchedule(
  schoolOrSchedule?: SchoolProfile | SchoolFeeSchedule | {
    tuitionFee?: number;
    admissionFee?: number;
    examFee?: number;
    lessonFeeMonthly?: number;
    lessonFeeTermly?: number;
    classFeeSchedules?: Record<string, SchoolFeeSchedule>;
  } | null,
  studentClass?: string
): SchoolFeeSchedule {
  const fallbackSchedule: SchoolFeeSchedule = {
    tuitionFee: FEE_SCHEDULE.DEFAULT_SCHOOL_FEE,
    admissionFee: FEE_SCHEDULE.ADMISSION_FEE,
    examFee: FEE_SCHEDULE.EXAM_FEE,
    lessonFeeMonthly: FEE_SCHEDULE.LESSON_FEE_MONTHLY,
    lessonFeeTermly: FEE_SCHEDULE.LESSON_FEE_TERMLY,
  };

  if (!schoolOrSchedule) {
    return fallbackSchedule;
  }

  let baseSchedule: SchoolFeeSchedule = fallbackSchedule;
  let classSchedules: Record<string, SchoolFeeSchedule> | undefined;

  if ('feeSchedule' in schoolOrSchedule && schoolOrSchedule.feeSchedule) {
    baseSchedule = {
      tuitionFee: parseFinancialAmount(schoolOrSchedule.feeSchedule.tuitionFee, fallbackSchedule.tuitionFee),
      admissionFee: parseFinancialAmount(schoolOrSchedule.feeSchedule.admissionFee, fallbackSchedule.admissionFee),
      examFee: parseFinancialAmount(schoolOrSchedule.feeSchedule.examFee, fallbackSchedule.examFee),
      lessonFeeMonthly: parseFinancialAmount(schoolOrSchedule.feeSchedule.lessonFeeMonthly, fallbackSchedule.lessonFeeMonthly),
      lessonFeeTermly: parseFinancialAmount(schoolOrSchedule.feeSchedule.lessonFeeTermly, fallbackSchedule.lessonFeeTermly),
    };
    classSchedules = (schoolOrSchedule as any).classFeeSchedules;
  } else {
    baseSchedule = {
      tuitionFee: parseFinancialAmount((schoolOrSchedule as any).tuitionFee, fallbackSchedule.tuitionFee),
      admissionFee: parseFinancialAmount((schoolOrSchedule as any).admissionFee, fallbackSchedule.admissionFee),
      examFee: parseFinancialAmount((schoolOrSchedule as any).examFee, fallbackSchedule.examFee),
      lessonFeeMonthly: parseFinancialAmount((schoolOrSchedule as any).lessonFeeMonthly, fallbackSchedule.lessonFeeMonthly),
      lessonFeeTermly: parseFinancialAmount((schoolOrSchedule as any).lessonFeeTermly, fallbackSchedule.lessonFeeTermly),
    };
    classSchedules = (schoolOrSchedule as any).classFeeSchedules;
  }

  if (studentClass && classSchedules && typeof classSchedules === 'object') {
    const cleanStr = (s: string) => {
      let r = s.trim().toLowerCase().replace(/[\s_\.-]+/g, '');
      if (r === 'sss1') r = 'ss1';
      if (r === 'sss2') r = 'ss2';
      if (r === 'sss3') r = 'ss3';
      return r;
    };
    const target = cleanStr(studentClass);
    const targetNorm = normalizeClassName(studentClass);
    const matchedKey = Object.keys(classSchedules).find((k) => {
      if (k === studentClass) return true;
      const kClean = cleanStr(k);
      if (kClean === target) return true;
      const kNorm = normalizeClassName(k);
      if (targetNorm && kNorm && targetNorm.toLowerCase() === kNorm.toLowerCase()) return true;
      if (targetNorm && cleanStr(targetNorm) === kClean) return true;
      if (kNorm && cleanStr(kNorm) === target) return true;
      return false;
    });
    if (matchedKey && classSchedules[matchedKey]) {
      const classSpec = classSchedules[matchedKey];
      return {
        tuitionFee: classSpec.tuitionFee !== undefined ? parseFinancialAmount(classSpec.tuitionFee, baseSchedule.tuitionFee) : baseSchedule.tuitionFee,
        admissionFee: classSpec.admissionFee !== undefined ? parseFinancialAmount(classSpec.admissionFee, baseSchedule.admissionFee) : baseSchedule.admissionFee,
        examFee: classSpec.examFee !== undefined ? parseFinancialAmount(classSpec.examFee, baseSchedule.examFee) : baseSchedule.examFee,
        lessonFeeMonthly: classSpec.lessonFeeMonthly !== undefined ? parseFinancialAmount(classSpec.lessonFeeMonthly, baseSchedule.lessonFeeMonthly) : baseSchedule.lessonFeeMonthly,
        lessonFeeTermly: classSpec.lessonFeeTermly !== undefined ? parseFinancialAmount(classSpec.lessonFeeTermly, baseSchedule.lessonFeeTermly) : baseSchedule.lessonFeeTermly,
      };
    }
  }

  return baseSchedule;
}

/**
 * Sanitizes and normalizes fee category breakdown for a student record
 */
export function deriveFeeBreakdown(
  student: Partial<StudentPaymentRecord>,
  schedule?: SchoolProfile | SchoolFeeSchedule | {
    tuitionFee?: number;
    admissionFee?: number;
    examFee?: number;
    lessonFeeMonthly?: number;
    lessonFeeTermly?: number;
    classFeeSchedules?: Record<string, SchoolFeeSchedule>;
    additionalFees?: AdditionalFeeItem[];
  },
  options?: {
    forceScheduleRates?: boolean;
  }
): {
  tuitionFee: number;
  tuitionPaid: number;
  tuitionStatus: PaymentStatus;
  admissionFee: number;
  admissionPaid: number;
  admissionStatus: PaymentStatus;
  lessonFee: number;
  lessonPaid: number;
  lessonStatus: PaymentStatus;
  lessonMonths: string;
  lessonDisabled: boolean;
  examFee: number;
  examPaid: number;
  examStatus: PaymentStatus;
  additionalFeesTotal: number;
  additionalFeesPaid: number;
  additionalFees: StudentAdditionalFee[];
} {
  const resolved = getClassFeeSchedule(schedule, (student as any).class_name || student.class);
  const hasSchedule = Boolean(schedule);
  const useSchedule = Boolean(options?.forceScheduleRates) || hasSchedule;
  // A rate of 0 in the school settings is respected (for example no exam fee).
  const defaultAdmission = resolved.admissionFee;
  const defaultExam = resolved.examFee;
  const defaultLessonTermly = resolved.lessonFeeTermly;
  const defaultLessonMonthly = resolved.lessonFeeMonthly;
  const defaultTuition = resolved.tuitionFee;

  // A fee the student has already settled in full keeps the amount it was settled at,
  // so a later change to the school rates cannot turn a fully paid student into a part payment.
  const settledFee = (storedFee: any, storedPaid: any): number | null => {
    const fee = parseFinancialAmount(storedFee, 0);
    const paid = parseFinancialAmount(storedPaid, 0);
    return fee > 0 && paid >= fee - 0.005 ? fee : null;
  };

  // 1. Admission Fee Breakdown
  // Existing students never pay admission fees. It applies only to new admissions,
  // or to a student who carries an explicit positive admission fee and is not marked as existing.
  const isExplicitExisting = student.is_new_admission === false;
  let admissionFee = 0;
  if (!isExplicitExisting) {
    if (student.is_new_admission === true) {
      admissionFee = useSchedule
        ? defaultAdmission
        : ((student.admission_fee !== undefined && parseFinancialAmount(student.admission_fee) > 0)
            ? parseFinancialAmount(student.admission_fee)
            : defaultAdmission);
    } else if (student.admission_fee !== undefined && student.admission_fee !== null && parseFinancialAmount(student.admission_fee) > 0) {
      admissionFee = parseFinancialAmount(student.admission_fee);
    }
    const settledAdmission = settledFee(student.admission_fee, student.admission_paid);
    if (admissionFee > 0 && settledAdmission !== null) admissionFee = settledAdmission;
  }

  // 2. Exam Fee Breakdown
  const hasExplicitExamFee = student.exam_fee !== undefined && student.exam_fee !== null && parseFinancialAmount(student.exam_fee) >= 0;
  let examFee = defaultExam;
  if (!useSchedule && hasExplicitExamFee) {
    examFee = parseFinancialAmount(student.exam_fee);
  }
  const settledExam = settledFee(student.exam_fee, student.exam_paid);
  if (settledExam !== null) examFee = settledExam;

  // 3. Lesson Fee Breakdown (compulsory for all students, so everyone is enrolled automatically)
  // Older saves may carry a generated label such as "1 Month Paid" together with a lesson fee that
  // was wrongly cut down to match it. Those records go back to the school rate.
  const lessonRecordCorrupted = /^\s*\d+\s*months?\s*paid\s*$/i.test(student.lesson_months || '');
  const lessonPlanMonths = detectLessonPlanMonths(student.lesson_months);
  const hasExplicitLessonFee = !lessonRecordCorrupted
    && student.lesson_fee !== undefined && student.lesson_fee !== null && parseFinancialAmount(student.lesson_fee) > 0;
  let lessonFee = defaultLessonTermly;
  if (useSchedule) {
    if (lessonPlanMonths === 1) {
      lessonFee = defaultLessonMonthly;
    } else if (lessonPlanMonths === 2) {
      lessonFee = defaultLessonMonthly * 2;
    } else if (hasExplicitLessonFee && !options?.forceScheduleRates) {
      lessonFee = parseFinancialAmount(student.lesson_fee);
    } else {
      lessonFee = defaultLessonTermly;
    }
  } else if (hasExplicitLessonFee) {
    lessonFee = parseFinancialAmount(student.lesson_fee);
  } else if (lessonPlanMonths === 1) {
    lessonFee = defaultLessonMonthly;
  } else if (lessonPlanMonths === 2) {
    lessonFee = defaultLessonMonthly * 2;
  }
  if (!lessonRecordCorrupted) {
    const settledLesson = settledFee(student.lesson_fee, student.lesson_paid);
    if (settledLesson !== null) lessonFee = settledLesson;
  }

  // A student opted out of lessons is charged nothing for them.
  const lessonDisabled = isLessonDisabled(student);
  if (lessonDisabled) lessonFee = 0;

  // 4. School Fee (Tuition)
  // Only a student who is exempt (flag, or zero fee with scholarship notes) pays no tuition.
  // A stored fee of 0 on its own, for example from an import, does not remove the fee.
  const isExempt = student.is_exempt_from_school_fee === true ||
    (parseFinancialAmount(student.tuition_fee, -1) === 0 && Boolean(student.scholarship_notes));
  let tuitionFee = 0;

  if (!isExempt) {
    const storedTuition = parseFinancialAmount(student.tuition_fee, 0);
    const settledTuition = settledFee(student.tuition_fee, student.tuition_paid);
    if (student.scholarship_notes && student.tuition_fee !== undefined && student.tuition_fee !== null && storedTuition < defaultTuition) {
      tuitionFee = storedTuition;
    } else if (settledTuition !== null) {
      tuitionFee = settledTuition;
    } else if (useSchedule) {
      tuitionFee = defaultTuition;
    } else if (storedTuition > 0) {
      tuitionFee = storedTuition;
    } else if (defaultTuition > 0) {
      tuitionFee = defaultTuition;
    } else if (student.fee_amount !== undefined && student.fee_amount !== null && parseFinancialAmount(student.fee_amount) > 0) {
      tuitionFee = parseFinancialAmount(student.fee_amount);
    } else {
      tuitionFee = FEE_SCHEDULE.DEFAULT_SCHOOL_FEE;
    }
  }

  // 5. Additional / Ancillary Fees resolution (resolved first so their payments are not counted twice)
  let resolvedAdditionalFees: StudentAdditionalFee[] = [];
  if (Array.isArray(student.additional_fees) && student.additional_fees.length > 0) {
    resolvedAdditionalFees = student.additional_fees.map((f) => ({
      ...f,
      amount: parseFinancialAmount(f.amount),
      amountPaid: parseFinancialAmount(f.amountPaid),
      status: f.status || (parseFinancialAmount(f.amountPaid) >= parseFinancialAmount(f.amount) ? 'fully_paid' : parseFinancialAmount(f.amountPaid) > 0 ? 'part_payment' : 'unpaid'),
    }));
  }

  // If schedule has additionalFees, ensure applicable fees for student class & term are reflected
  if (schedule && 'additionalFees' in schedule && Array.isArray((schedule as any).additionalFees)) {
    const schoolFees = (schedule as any).additionalFees as AdditionalFeeItem[];
    const studentClass = (student as any).class_name || student.class;
    const studentTerm = student.term;

    // First, handle fees defined on the school profile
    for (const sFee of schoolFees) {
      if (!sFee || !sFee.name) continue;

      const target = (sFee.targetClass || '').trim().toLowerCase();
      let appliesToClass = true;
      if (target && target !== 'all' && target !== 'all classes' && target !== 'school-wide') {
        const c1 = target.replace(/[^a-z0-9]/g, '');
        const c2 = (studentClass || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
        if (c1 !== c2) appliesToClass = false;
      }
      let appliesToTerm = true;
      const feeTerm = (sFee.term || '').trim().toLowerCase();
      if (feeTerm && feeTerm !== 'all' && feeTerm !== 'all terms') {
        const sTerm = (studentTerm || '').trim().toLowerCase();
        if (sTerm && !sTerm.includes(feeTerm) && !feeTerm.includes(sTerm)) appliesToTerm = false;
      }

      // Find all student records that match this school fee (by id or normalized name)
      const isFeeMatch = (rf: StudentAdditionalFee) =>
        rf.feeId === sFee.id ||
        rf.name.trim().toLowerCase() === sFee.name.trim().toLowerCase();

      const matchingItems = resolvedAdditionalFees.filter(isFeeMatch);
      const totalPaidForFee = matchingItems.reduce((sum, item) => sum + parseFinancialAmount(item.amountPaid), 0);

      // Remove all matches from resolvedAdditionalFees so we can insert a single canonical record
      resolvedAdditionalFees = resolvedAdditionalFees.filter((rf) => !isFeeMatch(rf));

      if (sFee.enabled === false) {
        // Paused/Disabled fee: if student paid, preserve historical payment with 0 balance; otherwise drop
        if (totalPaidForFee > 0) {
          resolvedAdditionalFees.push({
            feeId: sFee.id,
            name: sFee.name,
            amount: totalPaidForFee,
            amountPaid: totalPaidForFee,
            status: 'fully_paid',
          });
        }
      } else if (appliesToClass && appliesToTerm) {
        // Active fee that applies to this student: strictly enforce official school rate
        const officialFeeAmount = parseFinancialAmount(sFee.amount);
        resolvedAdditionalFees.push({
          feeId: sFee.id,
          name: sFee.name,
          amount: officialFeeAmount,
          amountPaid: totalPaidForFee,
          status: officialFeeAmount > 0 ? calculateStatus(officialFeeAmount, totalPaidForFee) : 'fully_paid',
        });
      } else {
        // Fee does not apply to this student: if they previously paid something, retain history with 0 balance
        if (totalPaidForFee > 0) {
          resolvedAdditionalFees.push({
            feeId: sFee.id,
            name: sFee.name,
            amount: totalPaidForFee,
            amountPaid: totalPaidForFee,
            status: 'fully_paid',
          });
        }
      }
    }
  }

  const additionalFeesTotal = resolvedAdditionalFees.reduce((acc, f) => acc + parseFinancialAmount(f.amount), 0);
  const additionalFeesPaid = resolvedAdditionalFees.reduce((acc, f) => acc + parseFinancialAmount(f.amountPaid), 0);

  // 6. Payment Allocation and Reconciliation
  // amount_paid is the overall total and already contains additional fee payments,
  // so those are taken out before anything is allocated to the core fees.
  const hasExplicitTuitionPaid = student.tuition_paid !== undefined && student.tuition_paid !== null;
  const hasExplicitExamPaid = student.exam_paid !== undefined && student.exam_paid !== null;
  const hasExplicitLessonPaid = student.lesson_paid !== undefined && student.lesson_paid !== null;
  const hasExplicitAdmissionPaid = student.admission_paid !== undefined && student.admission_paid !== null;
  const corePaidTotal = Math.max(0, parseFinancialAmount(student.amount_paid) - additionalFeesPaid);

  let finalTuitionPaid = 0;
  let finalAdmissionPaid = 0;
  let finalExamPaid = 0;
  let finalLessonPaid = 0;

  if (hasExplicitTuitionPaid || hasExplicitExamPaid || hasExplicitLessonPaid || hasExplicitAdmissionPaid) {
    finalTuitionPaid = hasExplicitTuitionPaid ? parseFinancialAmount(student.tuition_paid) : 0;
    finalAdmissionPaid = hasExplicitAdmissionPaid ? parseFinancialAmount(student.admission_paid) : 0;
    finalExamPaid = hasExplicitExamPaid ? parseFinancialAmount(student.exam_paid) : 0;
    finalLessonPaid = hasExplicitLessonPaid ? parseFinancialAmount(student.lesson_paid) : 0;

    // Only if the core total has a surplus beyond the explicit components, allocate the surplus
    const explicitSum = finalTuitionPaid + finalAdmissionPaid + finalExamPaid + finalLessonPaid;
    if (corePaidTotal > explicitSum) {
      let surplus = corePaidTotal - explicitSum;
      if (finalTuitionPaid < tuitionFee && surplus > 0) {
        const add = Math.min(surplus, tuitionFee - finalTuitionPaid);
        finalTuitionPaid += add;
        surplus -= add;
      }
      if (finalLessonPaid < lessonFee && surplus > 0) {
        const add = Math.min(surplus, lessonFee - finalLessonPaid);
        finalLessonPaid += add;
        surplus -= add;
      }
      if (finalExamPaid < examFee && surplus > 0) {
        const add = Math.min(surplus, examFee - finalExamPaid);
        finalExamPaid += add;
        surplus -= add;
      }
      if (finalAdmissionPaid < admissionFee && surplus > 0) {
        const add = Math.min(surplus, admissionFee - finalAdmissionPaid);
        finalAdmissionPaid += add;
        surplus -= add;
      }
    }
    finalTuitionPaid = Math.min(finalTuitionPaid, tuitionFee);
    finalLessonPaid = Math.min(finalLessonPaid, lessonFee);
    finalExamPaid = Math.min(finalExamPaid, examFee);
    finalAdmissionPaid = Math.min(finalAdmissionPaid, admissionFee);
  } else {
    // Only the total is available without individual columns.
    // Sequential allocation: Tuition, then Lesson, then Exam, then Admission
    let unallocated = corePaidTotal;

    finalTuitionPaid = Math.min(tuitionFee, unallocated);
    unallocated = Math.max(0, unallocated - finalTuitionPaid);

    finalLessonPaid = Math.min(lessonFee, unallocated);
    unallocated = Math.max(0, unallocated - finalLessonPaid);

    finalExamPaid = Math.min(examFee, unallocated);
    unallocated = Math.max(0, unallocated - finalExamPaid);

    finalAdmissionPaid = Math.min(admissionFee, unallocated);
    unallocated = Math.max(0, unallocated - finalAdmissionPaid);
  }

  // Generated labels are display only: they are recomputed every time and never kept or trusted.
  let lessonMonths = lessonDisabled ? 'Not Enrolled' : sanitizeLessonMonths(student.lesson_months);
  if (!lessonMonths) {
    if (finalLessonPaid >= lessonFee && lessonFee > 0) {
      lessonMonths = 'Termly (Paid)';
    } else if (finalLessonPaid >= defaultLessonMonthly && defaultLessonMonthly > 0) {
      const months = Math.floor(finalLessonPaid / defaultLessonMonthly);
      lessonMonths = months > 1 ? `${months} Months Paid` : '1 Month Paid';
    } else if (finalLessonPaid > 0) {
      lessonMonths = 'Part Payment';
    } else {
      lessonMonths = 'Full Term';
    }
  }

  const tuitionStatus: PaymentStatus = calculateStatus(tuitionFee, finalTuitionPaid);
  const admissionStatus: PaymentStatus = calculateStatus(admissionFee, finalAdmissionPaid);
  const examStatus: PaymentStatus = calculateStatus(examFee, finalExamPaid);
  const lessonStatus: PaymentStatus = lessonDisabled
    ? 'fully_paid'
    : calculateStatus(lessonFee, finalLessonPaid);

  return {
    tuitionFee,
    tuitionPaid: finalTuitionPaid,
    tuitionStatus,
    admissionFee,
    admissionPaid: finalAdmissionPaid,
    admissionStatus,
    lessonFee,
    lessonPaid: finalLessonPaid,
    lessonStatus,
    lessonMonths,
    lessonDisabled,
    examFee,
    examPaid: finalExamPaid,
    examStatus,
    additionalFeesTotal,
    additionalFeesPaid,
    additionalFees: resolvedAdditionalFees,
  };
}

/**
 * Canonical helper to compute a student's LIVE fee amounts, balance, status, and breakdown
 * from the active school/class fee schedule.
 * ALWAYS checks classFeeSchedules[student.class] first, then falls back to school feeSchedule.
 */
export function computeStudentLiveFees(
  student: Partial<StudentPaymentRecord>,
  schoolOrSchedule?: SchoolProfile | SchoolFeeSchedule | {
    tuitionFee?: number;
    admissionFee?: number;
    examFee?: number;
    lessonFeeMonthly?: number;
    lessonFeeTermly?: number;
    classFeeSchedules?: Record<string, SchoolFeeSchedule>;
    additionalFees?: AdditionalFeeItem[];
  } | null
): {
  totalFee: number;
  balance: number;
  status: PaymentStatus;
  amountPaid: number;
  breakdown: ReturnType<typeof deriveFeeBreakdown>;
} {
  const breakdown = deriveFeeBreakdown(student, schoolOrSchedule ?? undefined);
  const totalFee = breakdown.tuitionFee + breakdown.admissionFee + breakdown.examFee + breakdown.lessonFee + breakdown.additionalFeesTotal;
  const itemizedPaidSum = breakdown.tuitionPaid + breakdown.admissionPaid + breakdown.examPaid + breakdown.lessonPaid + breakdown.additionalFeesPaid;
  const rawPaid = Math.max(parseFinancialAmount(student.amount_paid), itemizedPaidSum);
  const effectiveTotalFee = totalFee;
  const amountPaid = Math.min(rawPaid, effectiveTotalFee);
  const balance = Math.max(0, effectiveTotalFee - amountPaid);
  const status = calculateStatus(effectiveTotalFee, amountPaid);

  return {
    totalFee: effectiveTotalFee,
    balance,
    status,
    amountPaid,
    breakdown,
  };
}

/**
 * Returns the live total fee for a student based on their class fee schedule.
 */
export function getStudentTotalFee(
  student: Partial<StudentPaymentRecord>,
  schoolOrSchedule?: SchoolProfile | SchoolFeeSchedule | null
): number {
  return computeStudentLiveFees(student, schoolOrSchedule).totalFee;
}

/**
 * Returns the live remaining balance for a student.
 */
export function getStudentLiveBalance(
  student: Partial<StudentPaymentRecord>,
  schoolOrSchedule?: SchoolProfile | SchoolFeeSchedule | null
): number {
  return computeStudentLiveFees(student, schoolOrSchedule).balance;
}

/**
 * Returns the live payment status for a student.
 */
export function getStudentLiveStatus(
  student: Partial<StudentPaymentRecord>,
  schoolOrSchedule?: SchoolProfile | SchoolFeeSchedule | null
): PaymentStatus {
  return computeStudentLiveFees(student, schoolOrSchedule).status;
}

/**
 * Calculates remaining balance: fee_amount - amount_paid
 */
export function calculateBalance(feeAmount: number | string, amountPaid: number | string): number {
  const fee = parseFinancialAmount(feeAmount, 0);
  const paid = parseFinancialAmount(amountPaid, 0);
  return Math.max(0, Math.round((fee - paid) * 100) / 100);
}

/**
 * Calculates payment status strictly based on amount_paid vs fee_amount:
 * - amount_paid <= 0 -> "unpaid"
 * - amount_paid < fee_amount -> "part_payment"
 * - amount_paid >= fee_amount -> "fully_paid"
 */
export function calculateStatus(feeAmount: number | string, amountPaid: number | string): PaymentStatus {
  const fee = parseFinancialAmount(feeAmount, 0);
  const paid = parseFinancialAmount(amountPaid, 0);

  if (fee === 0 || paid >= fee) {
    return 'fully_paid';
  }
  if (paid <= 0) {
    return 'unpaid';
  }
  return 'part_payment';
}

/**
 * Generates today's date in YYYY-MM-DD format
 */
export function getTodayDateString(): string {
  try {
    const formatted = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Lagos',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    if (/^\d{4}-\d{2}-\d{2}$/.test(formatted)) return formatted;
  } catch {
    // fall through to the device clock
  }
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Formats a currency number with symbol and comma separation
 */
export function formatCurrency(amount: number | string | undefined | null, symbol: string = '₦'): string {
  if (amount === undefined || amount === null || amount === '') return `${symbol}0`;
  const num = parseFinancialAmount(amount, NaN);
  if (isNaN(num)) return `${symbol}0`;
  return `${symbol}${num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/**
 * Formats a date string (YYYY-MM-DD or ISO) into readable localized format
 */
export function formatDate(dateString?: string | null): string {
  if (!dateString || typeof dateString !== 'string') return '—';
  try {
    const trimmed = dateString.trim();
    if (!trimmed) return '—';
    const parts = trimmed.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        });
      }
    }
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    }
    return trimmed;
  } catch {
    return String(dateString || '—');
  }
}

/**
 * Sanitizes and parses raw row data from Google Sheet REST API to ensure exact types
 */
export function normalizeStudentRow(row: Record<string, any>): StudentPaymentRecord {
  const feeAmount = parseFinancialAmount(
    row.fee_amount ?? 
    row['fee_amount'] ?? 
    row['Fee Amount'] ?? 
    row['Fee_Amount'] ?? 
    row.feeAmount ?? 
    row.total_fee ?? 
    row['Total Fee'] ?? 
    row.fee ?? 
    row.Fee,
    0
  );

  const amountPaid = parseFinancialAmount(
    row.amount_paid ?? 
    row['amount_paid'] ?? 
    row['Amount Paid'] ?? 
    row['Amount_Paid'] ?? 
    row.amountPaid ?? 
    row.total_paid ?? 
    row['Total Paid'] ?? 
    row.paid ?? 
    row.Paid,
    0
  );
  
  // App recalculates balance and status to guarantee correctness even if sheet has inconsistent entries
  const balance = calculateBalance(feeAmount, amountPaid);
  const status = calculateStatus(feeAmount, amountPaid);

  // Parse breakdown columns if present (with aliases for spreadsheet columns)
  const rawTuitionFee = row.tuition_fee ?? row['tuition_fee'] ?? row['Tuition Fee'] ?? row['Tuition_Fee'] ?? row.tuitionFee ?? row.school_fee ?? row['School Fee'];
  const tuitionFee = rawTuitionFee !== undefined && rawTuitionFee !== null && rawTuitionFee !== ''
    ? parseFinancialAmount(rawTuitionFee) 
    : undefined;

  const rawTuitionPaid = row.tuition_paid ?? row['tuition_paid'] ?? row['Tuition Paid'] ?? row['Tuition_Paid'] ?? row.tuitionPaid;
  const tuitionPaid = rawTuitionPaid !== undefined && rawTuitionPaid !== null && rawTuitionPaid !== ''
    ? parseFinancialAmount(rawTuitionPaid) 
    : undefined;

  const rawLessonFee = row.lesson_fee ?? row['lesson_fee'] ?? row['Lesson Fee'] ?? row['Lesson_Fee'] ?? row.lessonFee ?? row.lesson_amount;
  const lessonFee = rawLessonFee !== undefined && rawLessonFee !== null && rawLessonFee !== ''
    ? parseFinancialAmount(rawLessonFee) 
    : undefined;

  const rawLessonPaid = row.lesson_paid ?? row['lesson_paid'] ?? row['Lesson Paid'] ?? row['Lesson_Paid'] ?? row.lessonPaid;
  const lessonPaid = rawLessonPaid !== undefined && rawLessonPaid !== null && rawLessonPaid !== ''
    ? parseFinancialAmount(rawLessonPaid) 
    : undefined;

  const lessonMonths = (row.lesson_months ?? row['lesson_months'] ?? row['Lesson Months'] ?? row['Lesson_Months'] ?? row.lessonMonths ?? row.lesson_month ?? row['Lesson Month']) !== undefined 
    ? String(row.lesson_months ?? row['lesson_months'] ?? row['Lesson Months'] ?? row['Lesson_Months'] ?? row.lessonMonths ?? row.lesson_month ?? row['Lesson Month']) 
    : undefined;

  const lessonStatusRaw = row.lesson_status ?? row['lesson_status'] ?? row['Lesson Status'] ?? row['Lesson_Status'] ?? row.lessonStatus;
  let lessonStatus: PaymentStatus | undefined = undefined;
  if (lessonPaid !== undefined) {
    lessonStatus = calculateStatus(lessonFee !== undefined && lessonFee > 0 ? lessonFee : FEE_SCHEDULE.LESSON_FEE_TERMLY, lessonPaid);
  } else if (lessonStatusRaw) {
    const rawStr = String(lessonStatusRaw).toLowerCase().trim();
    lessonStatus = rawStr === 'fully_paid' || rawStr === 'paid' || rawStr === 'complete' ? 'fully_paid' : rawStr === 'part_payment' || rawStr === 'part' ? 'part_payment' : 'unpaid';
  }

  const rawExamFee = row.exam_fee ?? row['exam_fee'] ?? row['Exam Fee'] ?? row['Exam_Fee'] ?? row.examFee ?? row.exam_amount;
  const examFee = rawExamFee !== undefined && rawExamFee !== null && rawExamFee !== ''
    ? parseFinancialAmount(rawExamFee) 
    : undefined;

  const rawExamPaid = row.exam_paid ?? row['exam_paid'] ?? row['Exam Paid'] ?? row['Exam_Paid'] ?? row.examPaid;
  const examPaid = rawExamPaid !== undefined && rawExamPaid !== null && rawExamPaid !== ''
    ? parseFinancialAmount(rawExamPaid) 
    : undefined;

  const examStatusRaw = row.exam_status ?? row['exam_status'] ?? row['Exam Status'] ?? row['Exam_Status'] ?? row.examStatus;
  let examStatus: PaymentStatus | undefined = undefined;
  if (examPaid !== undefined) {
    // Strict accounting rule: payment amount dictates status
    examStatus = calculateStatus(examFee !== undefined && examFee > 0 ? examFee : FEE_SCHEDULE.EXAM_FEE, examPaid);
  } else if (examStatusRaw) {
    const rawStr = String(examStatusRaw).toLowerCase().trim();
    examStatus = rawStr === 'fully_paid' || rawStr === 'paid' || rawStr === 'complete' ? 'fully_paid' : rawStr === 'part_payment' || rawStr === 'part' ? 'part_payment' : 'unpaid';
  }

  const rawAdmissionFee = row.admission_fee ?? row['admission_fee'] ?? row['Admission Fee'] ?? row['Admission_Fee'] ?? row.admissionFee ?? row.admission_amount;
  const admissionFee = rawAdmissionFee !== undefined && rawAdmissionFee !== null && rawAdmissionFee !== ''
    ? parseFinancialAmount(rawAdmissionFee)
    : undefined;

  const rawAdmissionPaid = row.admission_paid ?? row['admission_paid'] ?? row['Admission Paid'] ?? row['Admission_Paid'] ?? row.admissionPaid;
  const admissionPaid = rawAdmissionPaid !== undefined && rawAdmissionPaid !== null && rawAdmissionPaid !== ''
    ? parseFinancialAmount(rawAdmissionPaid)
    : undefined;

  const admissionStatusRaw = row.admission_status ?? row['admission_status'] ?? row['Admission Status'] ?? row['Admission_Status'] ?? row.admissionStatus;
  let admissionStatus: PaymentStatus | undefined = undefined;
  if (admissionPaid !== undefined && admissionFee !== undefined) {
    admissionStatus = calculateStatus(admissionFee, admissionPaid);
  } else if (admissionStatusRaw) {
    const rawStr = String(admissionStatusRaw).toLowerCase().trim();
    admissionStatus = rawStr === 'fully_paid' || rawStr === 'paid' || rawStr === 'complete' ? 'fully_paid' : rawStr === 'part_payment' || rawStr === 'part' ? 'part_payment' : 'unpaid';
  }

  const totalRemittedRaw = row.total_remitted ?? 
    row['total_remitted'] ?? 
    row['Total Remitted'] ?? 
    row['Total_Remitted'] ?? 
    row.totalRemitted ?? 
    row.remitted ?? 
    row['remitted'] ?? 
    row['Remitted'] ?? 
    row.remitted_amount ?? 
    row['Remitted Amount'] ?? 
    row.bank_remitted ?? 
    row['Bank Remitted'];

  const totalRemitted = totalRemittedRaw !== undefined && totalRemittedRaw !== null && totalRemittedRaw !== ''
    ? parseFinancialAmount(totalRemittedRaw)
    : undefined;

  const receiptNoRaw = row.receipt_no ?? 
    row['receipt_no'] ?? 
    row['Receipt No'] ?? 
    row['Receipt_No'] ?? 
    row['Receipt Number'] ?? 
    row['receipt_number'] ?? 
    row.receiptNo ?? 
    row.receiptNumber ??
    row.ReceiptNo ??
    row['Receipt'];

  const receiptNo = receiptNoRaw !== undefined && receiptNoRaw !== null && String(receiptNoRaw).trim() !== ''
    ? String(receiptNoRaw).trim()
    : undefined;

  const rawExemptCandidate = row.is_exempt_from_school_fee ?? 
    row['is_exempt_from_school_fee'] ?? 
    row['exempt_school_fee'] ??
    row.exempt_school_fee ??
    row['Exempt School Fee'] ??
    row['Exempt_School_Fee'] ??
    row.is_scholarship ??
    row['is_scholarship'] ??
    row.is_exempt ??
    row['is_exempt'] ??
    row['Is Exempt'];

  let isExempt = false;
  if (rawExemptCandidate === true || rawExemptCandidate === 1) {
    isExempt = true;
  } else if (typeof rawExemptCandidate === 'string') {
    const s = rawExemptCandidate.toLowerCase().trim();
    if (['true', 'yes', 'y', '1', 'exempt', 'scholarship', '100%', 'full scholarship', 'full tuition exemption'].includes(s)) {
      isExempt = true;
    }
  } else if (rawExemptCandidate === undefined || rawExemptCandidate === null) {
    // Only check general scholarship / grant column if it contains an explicit affirmation of exemption
    const schCol = row.scholarship ?? row['Scholarship'] ?? row.scholarship_type ?? row['scholarship_type'] ?? row['Scholarship Type'] ?? row.grant_type ?? row['Grant Type'];
    if (schCol === true || schCol === 1) {
      isExempt = true;
    } else if (typeof schCol === 'string') {
      const s = schCol.toLowerCase().trim();
      if (['true', 'yes', 'y', '1', 'exempt', 'scholarship', '100%', 'full scholarship', 'full tuition exemption'].includes(s)) {
        isExempt = true;
      }
    }
  }

  let scholarshipNotes: string | undefined = undefined;
  if (isExempt) {
    const notesRaw = row.scholarship_notes ?? 
      row['scholarship_notes'] ?? 
      row['Scholarship Notes'] ?? 
      row['Scholarship_Notes'] ??
      row.scholarshipNotes ??
      row.scholarship_type ??
      row['scholarship_type'] ??
      row['Scholarship Type'] ??
      row.grant_type ??
      row['Grant Type'] ??
      row.scholarship ??
      row['Scholarship'];
    if (notesRaw !== undefined && notesRaw !== null && String(notesRaw).trim().length > 0) {
      const str = String(notesRaw).trim();
      const lower = str.toLowerCase();
      if (!['false', 'no', '0', 'none', 'null', 'undefined', 'n/a', '-', 'nil'].includes(lower)) {
        scholarshipNotes = str;
      }
    }
    if (!scholarshipNotes) {
      scholarshipNotes = 'Full Tuition Exemption';
    }
  }

  const rawClass = String(row.class || row.Class || row.className || row['Class Name'] || row['class_name'] || '').trim();
  const normalizedClass = normalizeClassName(rawClass);

  const isNewAdmRaw = row.is_new_admission ?? row['is_new_admission'] ?? row['New Admission'] ?? row['new_admission'] ?? row['Is New Admission'];
  let parsedIsNewAdmission: boolean | undefined = undefined;
  if (isNewAdmRaw === true || isNewAdmRaw === 1) {
    parsedIsNewAdmission = true;
  } else if (isNewAdmRaw === false || isNewAdmRaw === 0) {
    parsedIsNewAdmission = false;
  } else if (typeof isNewAdmRaw === 'string') {
    const lower = isNewAdmRaw.toLowerCase().trim();
    if (['true', 'yes', 'y', '1', 'new', 'new admission'].includes(lower)) {
      parsedIsNewAdmission = true;
    } else if (['false', 'no', 'n', '0', 'existing', 'returning', 'existing student'].includes(lower)) {
      parsedIsNewAdmission = false;
    }
  }

  const derived = deriveFeeBreakdown({
    class: normalizedClass,
    fee_amount: feeAmount,
    amount_paid: amountPaid,
    is_exempt_from_school_fee: isExempt,
    is_new_admission: parsedIsNewAdmission,
    tuition_fee: tuitionFee,
    tuition_paid: tuitionPaid,
    admission_fee: admissionFee,
    admission_paid: admissionPaid,
    admission_status: admissionStatus,
    lesson_fee: lessonFee,
    lesson_paid: lessonPaid,
    lesson_status: lessonStatus,
    lesson_months: lessonMonths,
    exam_fee: examFee,
    exam_paid: examPaid,
    exam_status: examStatus,
  }, row.school_context || row.schedule);

  // Calculate the overall total due per student:
  // Total Fee = Tuition Fee + Admission Fee + Lesson Fee + Exam Fee
  const calculatedTotalFee = derived.tuitionFee + (derived.admissionFee || 0) + (derived.lessonFee || 0) + (derived.examFee || 0);
  const effectiveFeeAmount = calculatedTotalFee;

  const effectiveAmountPaid = derived.tuitionPaid + (derived.admissionPaid || 0) + (derived.lessonPaid || 0) + (derived.examPaid || 0);
  const effectiveBalance = Math.max(0, effectiveFeeAmount - effectiveAmountPaid);
  const effectiveStatus = calculateStatus(effectiveFeeAmount, effectiveAmountPaid);

  return {
    id: String(row.id || row.ID || row.student_id || row['Student ID'] || '').trim(),
    full_name: String(row.full_name || row['full_name'] || row['Full Name'] || row.fullName || row.name || row.Name || '').trim(),
    class: normalizedClass,
    term: String(row.term || row.Term || '').trim(),
    session: String(row.session || row.Session || row.academic_session || '').trim(),
    fee_amount: effectiveFeeAmount,
    amount_paid: effectiveAmountPaid,
    balance: effectiveBalance,
    status: effectiveStatus,
    payment_date: String(row.payment_date || row['payment_date'] || row['Payment Date'] || row.paymentDate || row.date || '').trim(),
    is_exempt_from_school_fee: isExempt,
    scholarship_notes: scholarshipNotes,
    tuition_fee: derived.tuitionFee,
    tuition_paid: derived.tuitionPaid,
    tuition_status: derived.tuitionStatus,
    admission_fee: derived.admissionFee,
    admission_paid: derived.admissionPaid,
    admission_status: derived.admissionStatus,
    is_new_admission: parsedIsNewAdmission !== undefined ? parsedIsNewAdmission : derived.admissionFee > 0,
    lesson_fee: derived.lessonFee,
    lesson_paid: derived.lessonPaid,
    lesson_status: derived.lessonStatus,
    lesson_months: derived.lessonMonths,
    exam_fee: derived.examFee,
    exam_paid: derived.examPaid,
    exam_status: derived.examStatus,
    receipt_no: receiptNo,
    total_remitted: totalRemitted,
  };
}

/**
 * Determines whether a class belongs to Primary/Nursery (DNPS/) or Secondary (DSS/)
 */
export function getDefaultStudentIdPrefix(className?: string): string {
  if (!className) return 'DNPS/';
  const lower = className.toLowerCase().replace(/[\s_-]+/g, '');
  if (
    lower.startsWith('jss') || 
    lower.startsWith('js') || 
    lower.startsWith('ss') || 
    lower.startsWith('sss') || 
    lower.includes('secondary')
  ) {
    return 'DSS/';
  }
  return 'DNPS/';
}

/**
 * Examines existing student IDs in ascending order, parses the numeric component,
 * and generates the next sequential student ID starting from DNPS/0001 or DSS/0001
 * (e.g. DNPS/0001 for Nursery/Primary, DSS/0001 for Secondary).
 */
export function generateNextStudentId(
  studentsOrCount?: StudentPaymentRecord[] | { id?: string; class?: string }[] | number,
  customPrefix?: string,
  targetClass?: string
): string {
  const prefix = customPrefix || getDefaultStudentIdPrefix(targetClass);
  const cleanPrefix = prefix.endsWith('/') ? prefix : `${prefix}/`;
  const prefixTag = cleanPrefix.replace(/[/\\_-]/g, '').toUpperCase(); // 'DNPS' or 'DSS'
  let maxNumber = 0;

  if (Array.isArray(studentsOrCount)) {
    for (const s of studentsOrCount) {
      if (!s || !s.id) continue;
      const idStr = String(s.id).trim();

      // 1. Direct matched prefix: e.g. DNPS/0001 or DSS/0001
      const regex = new RegExp(`^${prefixTag}[/_\\-\\s]?0*(\\d+)`, 'i');
      const match = idStr.match(regex);
      if (match && match[1]) {
        const num = parseInt(match[1], 10);
        if (!isNaN(num) && num > maxNumber && num < 100000) {
          maxNumber = num;
          continue;
        }
      }

      // 2. Generic prefix format if maxNumber still 0
      const anyMatch = idStr.match(/^(?:DNPS|DSS)[/_\-\s]?0*(\d+)/i);
      if (anyMatch && anyMatch[1] && prefixTag === 'DNPS' && maxNumber === 0) {
        const num = parseInt(anyMatch[1], 10);
        if (!isNaN(num) && num > maxNumber && num < 100000) {
          maxNumber = num;
        }
      }
    }
  } else if (typeof studentsOrCount === 'number' && !isNaN(studentsOrCount)) {
    maxNumber = Math.max(0, studentsOrCount);
  }

  const nextNumber = maxNumber + 1;
  const paddedNumber = String(nextNumber).padStart(4, '0');
  return `${cleanPrefix}${paddedNumber}`;
}

/**
 * Generates a unique Student ID in ascending order (e.g. DNPS/0001 or DSS/0001)
 */
export function generateStudentId(
  studentsOrCount: StudentPaymentRecord[] | number = 0,
  targetClass?: string,
  customPrefix?: string
): string {
  return generateNextStudentId(studentsOrCount, customPrefix, targetClass);
}

/**
 * Generates a unique Receipt Number
 */
export function generateReceiptNumber(): string {
  const dateStr = getTodayDateString().replace(/-/g, '');
  const now = new Date();
  const time = [now.getHours(), now.getMinutes(), now.getSeconds()]
    .map((n) => String(n).padStart(2, '0'))
    .join('');
  const randomSuffix = Math.floor(100 + Math.random() * 900);
  return `REC-${dateStr}-${time}${randomSuffix}`;
}

/**
 * Computes class-by-class aggregated financial summaries
 */
export function calculateClassSummaries(
  students: StudentPaymentRecord[],
  schedule?: SchoolFeeSchedule | SchoolProfile
): ClassPaymentSummary[] {
  if (!students || !Array.isArray(students) || students.length === 0) {
    return [];
  }

  const classMap = new Map<string, {
    studentCount: number;
    totalFees: number;
    totalPaid: number;
    totalBalance: number;
    fullyPaidCount: number;
    partPaidCount: number;
    unpaidCount: number;
  }>();

  for (const s of students) {
    if (!s) continue;
    const cName = (s.class && s.class.trim()) ? s.class.trim() : 'Unassigned Class';
    const existing = classMap.get(cName) || {
      studentCount: 0,
      totalFees: 0,
      totalPaid: 0,
      totalBalance: 0,
      fullyPaidCount: 0,
      partPaidCount: 0,
      unpaidCount: 0,
    };

    const live = computeStudentLiveFees(s, schedule);
    const fee = live.totalFee;
    const paid = live.amountPaid;
    const bal = live.balance;
    const status = live.status;

    existing.studentCount += 1;
    existing.totalFees += fee;
    existing.totalPaid += paid;
    existing.totalBalance += bal;

    if (status === 'fully_paid') {
      existing.fullyPaidCount += 1;
    } else if (status === 'part_payment') {
      existing.partPaidCount += 1;
    } else {
      existing.unpaidCount += 1;
    }

    classMap.set(cName, existing);
  }

  const result: ClassPaymentSummary[] = [];

  classMap.forEach((stats, className) => {
    const collectionRate = stats.totalFees > 0
      ? Math.min(100, Math.round((stats.totalPaid / stats.totalFees) * 1000) / 10)
      : (stats.totalPaid > 0 ? 100 : 0);

    result.push({
      className,
      studentCount: stats.studentCount,
      totalFees: stats.totalFees,
      totalPaid: stats.totalPaid,
      totalBalance: stats.totalBalance,
      collectionRate,
      fullyPaidCount: stats.fullyPaidCount,
      partPaidCount: stats.partPaidCount,
      unpaidCount: stats.unpaidCount,
    });
  });

  // Default sort: highest total paid first
  return result.sort((a, b) => b.totalPaid - a.totalPaid);
}

/**
 * Computes global overall analytics and KPIs
 */
export function calculateOverallAnalytics(students: StudentPaymentRecord[], schedule?: SchoolFeeSchedule | SchoolProfile) {
  if (!students || !Array.isArray(students) || students.length === 0) {
    return {
      studentCount: 0,
      newAdmissionsCount: 0,
      scholarshipCount: 0,
      totalFees: 0,
      totalPaid: 0,
      totalBalance: 0,
      schoolFeeCollected: 0,
      admissionFeeCollected: 0,
      admissionFeeTotal: 0,
      admissionFeeBalance: 0,
      lessonFeeCollected: 0,
      examFeeCollected: 0,
      overallCollected: 0,
      schoolFeeTotal: 0,
      lessonFeeTotal: 0,
      examFeeTotal: 0,
      overallTotal: 0,
      overallBalance: 0,
      collectionRate: 0,
      fullyPaidCount: 0,
      partPaidCount: 0,
      unpaidCount: 0,
      fullyPaidPercentage: 0,
      partPaidPercentage: 0,
      unpaidPercentage: 0,
      topClassByAmount: null as string | null,
      topClassByRate: null as string | null,
      averageFee: 0,
      averagePaidPerStudent: 0,
    };
  }

  let totalFees = 0;
  let totalPaid = 0;
  let totalBalance = 0;
  let fullyPaidCount = 0;
  let partPaidCount = 0;
  let unpaidCount = 0;
  let newAdmissionsCount = 0;
  let scholarshipCount = 0;

  let schoolFeeCollected = 0;
  let admissionFeeCollected = 0;
  let admissionFeeTotal = 0;
  let lessonFeeCollected = 0;
  let examFeeCollected = 0;
  let additionalFeesCollected = 0;
  let additionalFeesTotal = 0;
  let schoolFeeTotal = 0;
  let lessonFeeTotal = 0;
  let examFeeTotal = 0;

  for (const s of students) {
    if (!s) continue;
    const isExempt = Boolean(s.is_exempt_from_school_fee);
    if (isExempt) {
      scholarshipCount += 1;
    }

    const live = computeStudentLiveFees(s, schedule);
    const fee = live.totalFee;
    const paid = live.amountPaid;
    const bal = live.balance;
    const status = live.status;

    totalFees += fee;
    totalPaid += paid;
    totalBalance += bal;

    const bd = live.breakdown;
    const sFee = bd.tuitionFee;
    const sPaid = bd.tuitionPaid;
    const aFee = bd.admissionFee;
    const aPaid = bd.admissionPaid;
    if (aFee > 0 || s.is_new_admission) {
      newAdmissionsCount += 1;
    }
    const lFee = bd.lessonFee;
    const lPaid = bd.lessonPaid;
    const eFee = bd.examFee;
    const ePaid = bd.examPaid;
    const addFee = bd.additionalFeesTotal;
    const addPaid = bd.additionalFeesPaid;

    schoolFeeTotal += sFee;
    schoolFeeCollected += sPaid;
    admissionFeeTotal += aFee;
    admissionFeeCollected += aPaid;
    lessonFeeTotal += lFee;
    lessonFeeCollected += lPaid;
    examFeeTotal += eFee;
    examFeeCollected += ePaid;
    additionalFeesTotal += addFee;
    additionalFeesCollected += addPaid;

    if (status === 'fully_paid') {
      fullyPaidCount += 1;
    } else if (status === 'part_payment') {
      partPaidCount += 1;
    } else {
      unpaidCount += 1;
    }
  }

  const count = students.length;
  const overallCollected = schoolFeeCollected + admissionFeeCollected + lessonFeeCollected + examFeeCollected + additionalFeesCollected;
  const overallTotal = schoolFeeTotal + admissionFeeTotal + lessonFeeTotal + examFeeTotal + additionalFeesTotal;
  const overallBalance = Math.max(0, overallTotal - overallCollected);
  const admissionFeeBalance = Math.max(0, admissionFeeTotal - admissionFeeCollected);

  const collectionRate = totalFees > 0 
    ? Math.min(100, Math.round((totalPaid / totalFees) * 1000) / 10) 
    : (totalPaid > 0 ? 100 : 0);

  const fullyPaidPercentage = count > 0 ? Math.round((fullyPaidCount / count) * 1000) / 10 : 0;
  const partPaidPercentage = count > 0 ? Math.round((partPaidCount / count) * 1000) / 10 : 0;
  const unpaidPercentage = count > 0 ? Math.round((unpaidCount / count) * 1000) / 10 : 0;

  const classSummaries = calculateClassSummaries(students, schedule);
  const topClassByAmount = classSummaries.length > 0 ? classSummaries[0].className : null;
  
  const sortedByRate = [...classSummaries].sort((a, b) => b.collectionRate - a.collectionRate);
  const topClassByRate = sortedByRate.length > 0 ? sortedByRate[0].className : null;

  return {
    studentCount: count,
    newAdmissionsCount,
    scholarshipCount,
    totalFees,
    totalPaid,
    totalBalance,
    schoolFeeCollected,
    admissionFeeCollected,
    admissionFeeTotal,
    admissionFeeBalance,
    lessonFeeCollected,
    examFeeCollected,
    overallCollected,
    schoolFeeTotal,
    lessonFeeTotal,
    examFeeTotal,
    overallTotal,
    overallBalance,
    collectionRate,
    fullyPaidCount,
    partPaidCount,
    unpaidCount,
    fullyPaidPercentage,
    partPaidPercentage,
    unpaidPercentage,
    topClassByAmount,
    topClassByRate,
    averageFee: count > 0 ? Math.round(totalFees / count) : 0,
    averagePaidPerStudent: count > 0 ? Math.round(totalPaid / count) : 0,
  };
}

export interface PaymentFeeCategoryInput {
  categoryType?: 'tuition' | 'admission' | 'lesson' | 'exam' | 'custom' | 'additional_fee';
  lessonMonth?: string;
  isPartPayment?: boolean;
  feeDescription?: string;
  receiptNumber?: string;
  additionalFeeId?: string;
}

export interface PaymentExtraOptions {
  recordedBy?: string;
  // Marks every receipt of one payment attempt so a retry can be recognised and never applied twice
  idempotencyKey?: string;
}

/**
 * Canonical processor for student payments across tuition, admission, lesson, exam, and custom categories.
 * Correctly computes category breakdowns, cumulative paid amounts, live balance, and digital receipt.
 * Every payment is also written to the student's payment_history so cash can be reported by day.
 */
export function processStudentPayment(
  student: StudentPaymentRecord,
  paymentAmount: number,
  paymentMethod: string = 'Cash / Direct Transfer',
  feeCategory?: PaymentFeeCategoryInput,
  schoolProfile?: SchoolProfile,
  extra?: PaymentExtraOptions
): { updatedRecord: StudentPaymentRecord; receipt: PaymentReceipt } {
  const amount = roundMoney(parseFinancialAmount(paymentAmount, 0));
  if (amount <= 0) {
    throw new Error('Payment amount must be greater than zero.');
  }
  const TOLERANCE = 0.005;

  const today = getTodayDateString();
  const breakdown = deriveFeeBreakdown(student, schoolProfile);
  const categoryType = feeCategory?.categoryType || 'tuition';
  const enteredReceiptNo = feeCategory?.receiptNumber?.trim();
  // A new payment never reuses the receipt number of an earlier payment.
  const receiptNumber = enteredReceiptNo || generateReceiptNumber();

  const cur = schoolProfile?.currencySymbol || '₦';
  const assertWithinDue = (label: string, due: number, cap: number) => {
    if (amount > due + TOLERANCE) {
      throw new Error(`Overpayment blocked: ${label} remaining balance is ${cur}${due.toLocaleString()} (Fee cap: ${cur}${cap.toLocaleString()}), but ${cur}${amount.toLocaleString()} was entered.`);
    }
  };

  let updatedTuitionFee = breakdown.tuitionFee;
  let updatedTuitionPaid = breakdown.tuitionPaid;
  let updatedTuitionStatus = breakdown.tuitionStatus;

  let updatedAdmissionFee = breakdown.admissionFee;
  let updatedAdmissionPaid = breakdown.admissionPaid;
  let updatedAdmissionStatus = breakdown.admissionStatus;

  let updatedLessonFee = breakdown.lessonFee;
  let updatedLessonPaid = breakdown.lessonPaid;
  let updatedLessonStatus = breakdown.lessonStatus;
  // Only text a person chose is kept. Generated labels are recomputed whenever they are shown.
  let updatedLessonMonths = sanitizeLessonMonths(student.lesson_months) || breakdown.lessonMonths;

  let updatedExamFee = breakdown.examFee;
  let updatedExamPaid = breakdown.examPaid;
  let updatedExamStatus = breakdown.examStatus;

  // Additional Fees List from breakdown
  const updatedAdditionalFees: StudentAdditionalFee[] = Array.isArray(breakdown.additionalFees)
    ? breakdown.additionalFees.map((f) => ({ ...f }))
    : [];

  let receiptFee = updatedTuitionFee;
  let receiptPaid = updatedTuitionPaid;
  let receiptBalance = Math.max(0, updatedTuitionFee - updatedTuitionPaid);
  let receiptStatus = updatedTuitionStatus;
  let receiptDesc = feeCategory?.feeDescription || 'Tuition Fee';

  if (categoryType === 'admission') {
    const due = Math.max(0, updatedAdmissionFee - breakdown.admissionPaid);
    assertWithinDue('Admission Fee', due, updatedAdmissionFee);
    updatedAdmissionPaid = roundMoney(breakdown.admissionPaid + amount);
    updatedAdmissionStatus = calculateStatus(updatedAdmissionFee, updatedAdmissionPaid);

    receiptFee = updatedAdmissionFee;
    receiptPaid = updatedAdmissionPaid;
    receiptBalance = Math.max(0, roundMoney(updatedAdmissionFee - updatedAdmissionPaid));
    receiptStatus = updatedAdmissionStatus;
    receiptDesc = feeCategory?.feeDescription || 'Admission (New)';

  } else if (categoryType === 'lesson') {
    if (breakdown.lessonDisabled) {
      throw new Error('Lesson fee is disabled for this student. Enable it in the student profile before recording a lesson payment.');
    }
    const due = Math.max(0, updatedLessonFee - breakdown.lessonPaid);
    assertWithinDue('Lesson Fee', due, updatedLessonFee);
    updatedLessonPaid = roundMoney(breakdown.lessonPaid + amount);
    updatedLessonStatus = calculateStatus(updatedLessonFee, updatedLessonPaid);

    let months = sanitizeLessonMonths(student.lesson_months);
    const monthLabel = feeCategory?.lessonMonth?.trim();
    if (monthLabel) {
      if (!months) {
        months = monthLabel;
      } else if (!months.split(/[,&/]+/).map((m) => m.trim().toLowerCase()).includes(monthLabel.toLowerCase())) {
        months = `${months}, ${monthLabel}`;
      }
    } else if (updatedLessonStatus === 'fully_paid' && !months) {
      months = 'Termly (Paid)';
    }
    updatedLessonMonths = months;

    receiptFee = updatedLessonFee;
    receiptPaid = updatedLessonPaid;
    receiptBalance = Math.max(0, roundMoney(updatedLessonFee - updatedLessonPaid));
    receiptStatus = updatedLessonStatus;
    receiptDesc = feeCategory?.feeDescription || `Lesson Fee (${months || 'General'})`;

  } else if (categoryType === 'exam') {
    const due = Math.max(0, updatedExamFee - breakdown.examPaid);
    assertWithinDue('Exam Fee', due, updatedExamFee);
    updatedExamPaid = roundMoney(breakdown.examPaid + amount);
    updatedExamStatus = calculateStatus(updatedExamFee, updatedExamPaid);

    receiptFee = updatedExamFee;
    receiptPaid = updatedExamPaid;
    receiptBalance = Math.max(0, roundMoney(updatedExamFee - updatedExamPaid));
    receiptStatus = updatedExamStatus;
    receiptDesc = feeCategory?.feeDescription || 'Exam Fee';

  } else if (categoryType === 'additional_fee' || categoryType === 'custom') {
    // Custom payments are recorded as an additional fee. They are never pushed into tuition.
    const targetId = feeCategory?.additionalFeeId;
    const feeName = feeCategory?.feeDescription?.trim() || 'Additional Class Fee';
    const targetName = feeName.toLowerCase();

    // An id is exact. Matching by name is only a fallback when no id was supplied.
    let matchedItem = targetId
      ? updatedAdditionalFees.find((f) => f.feeId === targetId)
      : updatedAdditionalFees.find((f) => f.name.trim().toLowerCase() === targetName);

    if (!matchedItem) {
      // Create a new additional fee entry for this student
      matchedItem = {
        feeId: targetId || `custom_${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`,
        name: feeName,
        amount: amount,
        amountPaid: 0,
        status: 'unpaid',
      };
      updatedAdditionalFees.push(matchedItem);
    }

    const curPaid = parseFinancialAmount(matchedItem.amountPaid, 0);
    const due = Math.max(0, roundMoney(matchedItem.amount - curPaid));
    assertWithinDue(matchedItem.name, due, matchedItem.amount);
    const nextPaid = roundMoney(curPaid + amount);
    matchedItem.amountPaid = nextPaid;
    matchedItem.status = matchedItem.amount > 0 ? calculateStatus(matchedItem.amount, nextPaid) : 'fully_paid';
    matchedItem.paymentDate = today;
    matchedItem.receiptNo = receiptNumber;

    receiptFee = matchedItem.amount;
    receiptPaid = nextPaid;
    receiptBalance = Math.max(0, roundMoney(matchedItem.amount - nextPaid));
    receiptStatus = matchedItem.status;
    receiptDesc = feeCategory?.feeDescription || matchedItem.name;

  } else {
    // Tuition / School Fee
    const due = Math.max(0, updatedTuitionFee - breakdown.tuitionPaid);
    assertWithinDue('School Tuition Fee', due, updatedTuitionFee);
    updatedTuitionPaid = roundMoney(breakdown.tuitionPaid + amount);
    updatedTuitionStatus = calculateStatus(updatedTuitionFee, updatedTuitionPaid);

    receiptFee = updatedTuitionFee;
    receiptPaid = updatedTuitionPaid;
    receiptBalance = Math.max(0, roundMoney(updatedTuitionFee - updatedTuitionPaid));
    receiptStatus = updatedTuitionStatus;
    receiptDesc = feeCategory?.feeDescription || 'School Tuition Fee';
  }

  // Calculate student's overall totals across all fees including additional fees
  const updatedAdditionalTotal = updatedAdditionalFees.reduce((acc, f) => acc + parseFinancialAmount(f.amount), 0);
  const updatedAdditionalPaid = updatedAdditionalFees.reduce((acc, f) => acc + parseFinancialAmount(f.amountPaid), 0);

  const overallFeeAmount = roundMoney(updatedTuitionFee + updatedAdmissionFee + updatedLessonFee + updatedExamFee + updatedAdditionalTotal);
  const overallAmountPaid = roundMoney(updatedTuitionPaid + updatedAdmissionPaid + updatedLessonPaid + updatedExamPaid + updatedAdditionalPaid);
  const overallBalance = Math.max(0, roundMoney(overallFeeAmount - overallAmountPaid));
  const overallStatus = calculateStatus(overallFeeAmount, overallAmountPaid);

  const feeCategoryForReceipt: PaymentReceipt['feeCategory'] =
    categoryType === 'tuition' ? 'school_fee' : categoryType;

  const receipt: PaymentReceipt = {
    receiptNumber,
    studentId: student.id,
    studentName: student.full_name,
    studentClass: student.class,
    term: student.term,
    session: student.session || getCurrentAcademicSession(),
    amountPaidNow: amount,
    paymentDate: today,
    paymentMethod,
    bursarName: extra?.recordedBy,
    ...(extra?.idempotencyKey ? { idempotencyKey: extra.idempotencyKey } : {}),
    totalPaid: overallAmountPaid,
    totalFee: overallFeeAmount,
    remainingBalance: overallBalance,
    status: overallStatus,
    timestamp: new Date().toISOString(),
    feeCategory: feeCategoryForReceipt,
    feeItemDescription: receiptDesc,
    additionalFeeId: feeCategory?.additionalFeeId,
    categoryFeeTotal: receiptFee,
    categoryPaidCumulative: receiptPaid,
    categoryBalanceRemaining: receiptBalance,
    categoryStatus: receiptStatus,
  };

  // Permanent line in the payment history. It is what daily cash, the bank statement and receipts read.
  const historyEntry: PaymentReceipt = {
    ...receipt,
    id: `${receiptNumber}_${categoryType}_${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`,
  };
  const previousHistory = Array.isArray(student.payment_history) ? student.payment_history : [];

  const categoryReceiptPatch: Partial<StudentPaymentRecord> = {};
  if (categoryType === 'tuition') categoryReceiptPatch.tuition_receipt_no = receiptNumber;
  if (categoryType === 'admission') categoryReceiptPatch.admission_receipt_no = receiptNumber;
  if (categoryType === 'lesson') categoryReceiptPatch.lesson_receipt_no = receiptNumber;
  if (categoryType === 'exam') categoryReceiptPatch.exam_receipt_no = receiptNumber;

  const updatedRecord: StudentPaymentRecord = {
    ...student,
    ...categoryReceiptPatch,
    fee_amount: overallFeeAmount,
    amount_paid: overallAmountPaid,
    balance: overallBalance,
    status: overallStatus,
    payment_date: today,
    payment_method: paymentMethod,
    tuition_fee: updatedTuitionFee,
    tuition_paid: updatedTuitionPaid,
    tuition_status: updatedTuitionStatus,
    admission_fee: updatedAdmissionFee,
    admission_paid: updatedAdmissionPaid,
    admission_status: updatedAdmissionStatus,
    lesson_fee: updatedLessonFee,
    lesson_paid: updatedLessonPaid,
    lesson_status: updatedLessonStatus,
    lesson_months: updatedLessonMonths,
    exam_fee: updatedExamFee,
    exam_paid: updatedExamPaid,
    exam_status: updatedExamStatus,
    additional_fees: updatedAdditionalFees,
    receipt_no: receiptNumber,
    payment_history: [...previousHistory, historyEntry],
    total_remitted: student.total_remitted || 0,
  };

  return { updatedRecord, receipt };
}

/**
 * Joins the receipts of one sitting into the single receipt shown to the person paying.
 * Also used to rebuild that receipt when a retried payment is recognised as already saved.
 */
export function buildCombinedReceipt(receipts: PaymentReceipt[]): PaymentReceipt {
  const last = receipts[receipts.length - 1];
  const totalNow = roundMoney(receipts.reduce((sum, r) => sum + r.amountPaidNow, 0));
  return {
    ...last,
    amountPaidNow: totalNow,
    feeItemDescription: receipts.map((r) => r.feeItemDescription || 'Payment').join(', '),
    feeCategory: receipts.length === 1 ? last.feeCategory : 'custom',
    items: receipts.map((r) => ({
      description: r.feeItemDescription || 'Payment',
      amount: r.amountPaidNow,
      feeCategory: r.feeCategory,
    })),
  };
}

export interface PaymentLineInput {
  amount: number;
  feeCategory?: PaymentFeeCategoryInput;
}

/**
 * Applies several fee lines for one student as a single sitting.
 * All lines share one receipt number. If any line is rejected, nothing is applied.
 */
export function processStudentPayments(
  student: StudentPaymentRecord,
  lines: PaymentLineInput[],
  paymentMethod: string = 'Cash / Direct Transfer',
  schoolProfile?: SchoolProfile,
  options?: { receiptNumber?: string; recordedBy?: string; idempotencyKey?: string }
): { updatedRecord: StudentPaymentRecord; receipts: PaymentReceipt[]; combinedReceipt: PaymentReceipt } {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error('Select at least one fee to pay.');
  }
  const receiptNumber = options?.receiptNumber?.trim() || generateReceiptNumber();

  let working = student;
  const receipts: PaymentReceipt[] = [];
  for (const line of lines) {
    const result = processStudentPayment(
      working,
      line.amount,
      paymentMethod,
      { ...(line.feeCategory || {}), receiptNumber },
      schoolProfile,
      { recordedBy: options?.recordedBy, idempotencyKey: options?.idempotencyKey }
    );
    working = result.updatedRecord;
    receipts.push(result.receipt);
  }

  const combinedReceipt = buildCombinedReceipt(receipts);

  return { updatedRecord: working, receipts, combinedReceipt };
}
