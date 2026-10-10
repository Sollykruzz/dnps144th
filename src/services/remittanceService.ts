/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { RemittanceRecord, StudentPaymentRecord, BursarSession, SchoolProfile } from '../types';
import { safeStorage } from './storage';
import { getTodayDateString, deriveFeeBreakdown } from './calculations';
import {
  getRemittancesFromFirestore,
} from './firebase';

const REMITTANCE_STORAGE_KEY = 'EMINENT_BURSAR_REMITTANCES_V1';

/**
 * Computes a strictly isolated local storage key for school remittances
 */
export function getSchoolRemittanceStorageKey(schoolId?: string): string {
  const normalizedId = (schoolId && schoolId.trim()) ? schoolId.trim().toLowerCase() : 'dominion-group';
  return `${REMITTANCE_STORAGE_KEY}_${normalizedId}`;
}

/**
 * Generates a unique Remittance Reference Number (e.g. RMT-20260826-4821)
 */
export function generateRemittanceRef(): string {
  const dateStr = getTodayDateString().replace(/-/g, '');
  const random = Math.floor(1000 + Math.random() * 9000);
  return `RMT-${dateStr}-${random}`;
}

/**
 * Loads all saved remittance records strictly from the school's partition
 */
export function getSavedRemittances(schoolId?: string): RemittanceRecord[] {
  const targetSchoolId = (schoolId && schoolId.trim()) ? schoolId.trim().toLowerCase() : 'dominion-group';
  const strictKey = getSchoolRemittanceStorageKey(targetSchoolId);

  try {
    const raw = safeStorage.getItem(strictKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error(`[Remittance Boundary Error] Failed loading remittances for '${targetSchoolId}':`, e);
    return [];
  }
}

/**
 * Saves remittance records strictly to the school's partition
 */
export function saveRemittances(records: RemittanceRecord[], schoolId?: string): void {
  const targetSchoolId = (schoolId && schoolId.trim()) ? schoolId.trim().toLowerCase() : 'dominion-group';
  const strictKey = getSchoolRemittanceStorageKey(targetSchoolId);

  try {
    safeStorage.setItem(strictKey, JSON.stringify(records));
  } catch (e) {
    console.error(`[Remittance Boundary Error] Failed saving remittances for '${targetSchoolId}':`, e);
  }
}

/**
 * Adds a new remittance record and returns the updated list
 */
export function addRemittance(
  data: Omit<RemittanceRecord, 'id' | 'referenceNumber' | 'timestamp'> & { submittedByRole?: 'bursar' | 'admin' },
  existingList?: RemittanceRecord[],
  schoolId?: string
): { newRecord: RemittanceRecord; allRecords: RemittanceRecord[] } {
  const targetSchoolId = (schoolId && schoolId.trim()) ? schoolId.trim().toLowerCase() : 'dominion-group';
  const current = existingList ?? getSavedRemittances(targetSchoolId);
  const isAutoApproved = data.submittedByRole === 'admin' || data.status === 'approved';
  const approvalStatus: 'pending' | 'approved' | 'rejected' = isAutoApproved ? 'approved' : 'pending';

  const newRecord: RemittanceRecord = {
    ...data,
    id: `rmt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    referenceNumber: generateRemittanceRef(),
    timestamp: new Date().toISOString(),
    amount: Math.max(0, Number(data.amount) || 0),
    status: approvalStatus,
    approvalStatus: approvalStatus,
    submittedBy: data.submittedBy || data.bursarName,
    submittedByRole: data.submittedByRole || 'bursar',
    approvedBy: isAutoApproved ? (data.approvedBy || data.bursarName) : undefined,
    approvedAt: isAutoApproved ? new Date().toISOString() : undefined,
  };

  const updated = [newRecord, ...current];
  saveRemittances(updated, targetSchoolId);

  return { newRecord, allRecords: updated };
}

/**
 * Approves a pending remittance record (Admin only)
 */
export function approveRemittance(
  id: string,
  adminName: string,
  existingList?: RemittanceRecord[],
  schoolId?: string
): { approvedRecord: RemittanceRecord | null; allRecords: RemittanceRecord[] } {
  const targetSchoolId = (schoolId && schoolId.trim()) ? schoolId.trim().toLowerCase() : 'dominion-group';
  const current = existingList ?? getSavedRemittances(targetSchoolId);
  let approvedRecord: RemittanceRecord | null = null;

  const updated = current.map((r) => {
    if (r.id === id) {
      approvedRecord = {
        ...r,
        status: 'approved',
        approvalStatus: 'approved',
        approvedBy: adminName,
        approvedAt: new Date().toISOString(),
        rejectedBy: undefined,
        rejectedAt: undefined,
        rejectionReason: undefined,
      };
      return approvedRecord;
    }
    return r;
  });

  saveRemittances(updated, targetSchoolId);

  return { approvedRecord, allRecords: updated };
}

/**
 * Rejects a pending remittance record (Admin only)
 */
export function rejectRemittance(
  id: string,
  adminName: string,
  reason: string = 'Requires review by Bursar',
  existingList?: RemittanceRecord[],
  schoolId?: string
): { rejectedRecord: RemittanceRecord | null; allRecords: RemittanceRecord[] } {
  const targetSchoolId = (schoolId && schoolId.trim()) ? schoolId.trim().toLowerCase() : 'dominion-group';
  const current = existingList ?? getSavedRemittances(targetSchoolId);
  let rejectedRecord: RemittanceRecord | null = null;

  const updated = current.map((r) => {
    if (r.id === id) {
      rejectedRecord = {
        ...r,
        status: 'rejected',
        approvalStatus: 'rejected',
        rejectedBy: adminName,
        rejectedAt: new Date().toISOString(),
        rejectionReason: reason,
      };
      return rejectedRecord;
    }
    return r;
  });

  saveRemittances(updated, targetSchoolId);

  return { rejectedRecord, allRecords: updated };
}

/**
 * Voids a remittance record (soft delete by Admin).
 * Moves it to the Voided state while retaining full audit history.
 */
export function voidRemittance(
  id: string,
  adminName: string,
  reason: string = 'Voided by Administrator',
  existingList?: RemittanceRecord[],
  schoolId?: string
): { voidedRecord: RemittanceRecord | null; allRecords: RemittanceRecord[] } {
  const targetSchoolId = (schoolId && schoolId.trim()) ? schoolId.trim().toLowerCase() : 'dominion-group';
  const current = existingList ?? getSavedRemittances(targetSchoolId);
  let voidedRecord: RemittanceRecord | null = null;

  const updated = current.map((r) => {
    if (r.id === id) {
      voidedRecord = {
        ...r,
        isVoided: true,
        status: 'voided',
        approvalStatus: 'voided',
        voidedBy: adminName,
        voidedAt: new Date().toISOString(),
        voidReason: reason,
        updatedAt: new Date().toISOString(),
      };
      return voidedRecord;
    }
    return r;
  });

  saveRemittances(updated, targetSchoolId);

  return { voidedRecord, allRecords: updated };
}

/**
 * Restores a voided remittance back to the official approved ledger (Admin only)
 */
export function restoreVoidedRemittance(
  id: string,
  adminName: string,
  existingList?: RemittanceRecord[],
  schoolId?: string
): { restoredRecord: RemittanceRecord | null; allRecords: RemittanceRecord[] } {
  const targetSchoolId = (schoolId && schoolId.trim()) ? schoolId.trim().toLowerCase() : 'dominion-group';
  const current = existingList ?? getSavedRemittances(targetSchoolId);
  let restoredRecord: RemittanceRecord | null = null;

  const updated = current.map((r) => {
    if (r.id === id) {
      restoredRecord = {
        ...r,
        isVoided: false,
        status: 'approved',
        approvalStatus: 'approved',
        approvedBy: adminName,
        approvedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      return restoredRecord;
    }
    return r;
  });

  saveRemittances(updated, targetSchoolId);

  return { restoredRecord, allRecords: updated };
}

/**
 * Deletes a remittance record by ID.
 * Defaults to voiding (soft-delete) to preserve accountability.
 */
export function deleteRemittance(
  id: string,
  existingList?: RemittanceRecord[],
  schoolId?: string,
  adminName: string = 'Administrator',
  reason: string = 'Deleted by Administrator'
): RemittanceRecord[] {
  const { allRecords } = voidRemittance(id, adminName, reason, existingList, schoolId);
  return allRecords;
}

/**
 * Permanently deletes a remittance record from storage (hard purge)
 */
export function deleteRemittancePermanently(
  id: string,
  existingList?: RemittanceRecord[],
  schoolId?: string
): RemittanceRecord[] {
  const targetSchoolId = (schoolId && schoolId.trim()) ? schoolId.trim().toLowerCase() : 'dominion-group';
  const current = existingList ?? getSavedRemittances(targetSchoolId);
  const updated = current.filter((r) => r.id !== id);
  saveRemittances(updated, targetSchoolId);

  return updated;
}

/**
 * Updates an existing remittance record by ID
 */
export function updateRemittance(
  id: string,
  data: Partial<Omit<RemittanceRecord, 'id' | 'referenceNumber' | 'timestamp'>>,
  existingList?: RemittanceRecord[],
  schoolId?: string
): RemittanceRecord[] {
  const targetSchoolId = (schoolId && schoolId.trim()) ? schoolId.trim().toLowerCase() : 'dominion-group';
  const current = existingList ?? getSavedRemittances(targetSchoolId);
  let updatedRecord: RemittanceRecord | null = null;

  const updated = current.map((r) => {
    if (r.id === id) {
      updatedRecord = {
        ...r,
        ...data,
        amount: data.amount !== undefined ? Math.max(0, Number(data.amount) || 0) : r.amount,
      };
      return updatedRecord;
    }
    return r;
  });

  saveRemittances(updated, targetSchoolId);

  return updated;
}

/**
 * Clears all remittance records for the specified school
 */
export function clearAllRemittances(
  schoolId?: string
): RemittanceRecord[] {
  const targetSchoolId = (schoolId && schoolId.trim()) ? schoolId.trim().toLowerCase() : 'dominion-group';
  saveRemittances([], targetSchoolId);
  return [];
}

/**
 * Loads all remittances directly from Cloud Firestore
 */
export async function loadRemittancesFromCloud(schoolId?: string): Promise<RemittanceRecord[]> {
  const targetSchoolId = (schoolId && schoolId.trim()) ? schoolId.trim().toLowerCase() : 'dominion-group';
  try {
    const cloudRecords = await getRemittancesFromFirestore(targetSchoolId);
    if (Array.isArray(cloudRecords)) {
      saveRemittances(cloudRecords, targetSchoolId);
      return cloudRecords;
    }
  } catch (err) {
    console.warn('[Remittance Cloud Sync] Error fetching remittances from Firestore:', err);
  }
  return getSavedRemittances(targetSchoolId);
}

/**
 * Merges local and remote remittance records by ID without duplicates,
 * prioritizing the most recently updated or approved record.
 */
export function mergeRemittanceRecords(
  local: RemittanceRecord[],
  remote: RemittanceRecord[]
): RemittanceRecord[] {
  const map = new Map<string, RemittanceRecord>();

  (local || []).forEach((item) => {
    if (item && item.id) {
      map.set(item.id, item);
    }
  });

  (remote || []).forEach((item) => {
    if (!item || !item.id) return;
    const existing = map.get(item.id);
    if (!existing) {
      map.set(item.id, item);
    } else {
      // Compare timestamps or status priority
      const existingTime = new Date((existing as any).updatedAt || existing.approvedAt || existing.timestamp || 0).getTime();
      const remoteTime = new Date((item as any).updatedAt || item.approvedAt || item.timestamp || 0).getTime();

      // If remote has an explicit approval/rejection or is more recent, prefer remote
      if (item.status === 'approved' || item.status === 'rejected' || remoteTime >= existingTime) {
        map.set(item.id, item);
      }
    }
  });

  return Array.from(map.values()).sort(
    (a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime()
  );
}

/**
 * Calculates collection, remittance, and cash-in-hand totals.
 * ONLY approved remittances are committed to the official ledger / cash-in-hand deduction.
 */
export function calculateCollectionMetrics(
  students: StudentPaymentRecord[],
  remittances?: RemittanceRecord[],
  school?: SchoolProfile
): {
  totalCollected: number;
  totalTuitionCollected: number;
  totalAdmissionCollected: number;
  totalLessonCollected: number;
  totalExamCollected: number;
  totalRemitted: number;
  pendingRemitted: number;
  rejectedRemitted: number;
  voidedRemitted: number;
  cashInHand: number;
  availableBalance: number;
  collectionCount: number;
  remittanceCount: number;
  pendingRemittanceCount: number;
  approvedRemittanceCount: number;
  voidedRemittanceCount: number;
} {
  let totalTuitionCollected = 0;
  let totalAdmissionCollected = 0;
  let totalLessonCollected = 0;
  let totalExamCollected = 0;
  let totalAdditionalCollected = 0;

  (students || []).forEach((s) => {
    const bd = deriveFeeBreakdown(s, school);
    totalTuitionCollected += Math.max(0, bd.tuitionPaid || 0);
    totalAdmissionCollected += Math.max(0, bd.admissionPaid || 0);
    totalLessonCollected += Math.max(0, bd.lessonPaid || 0);
    totalExamCollected += Math.max(0, bd.examPaid || 0);
    totalAdditionalCollected += Math.max(0, bd.additionalFeesPaid || 0);
  });

  const totalCollected = totalTuitionCollected + totalAdmissionCollected + totalLessonCollected + totalExamCollected + totalAdditionalCollected;

  let totalApprovedRemitted = 0;
  let pendingRemitted = 0;
  let rejectedRemitted = 0;
  let voidedRemitted = 0;
  let pendingRemittanceCount = 0;
  let approvedRemittanceCount = 0;
  let voidedRemittanceCount = 0;

  if (Array.isArray(remittances)) {
    remittances.forEach((r) => {
      const amt = Math.max(0, Number(r.amount) || 0);

      // Exclude voided remittances from cash books
      if (r.isVoided || r.status === 'voided' || r.approvalStatus === 'voided') {
        voidedRemitted += amt;
        voidedRemittanceCount += 1;
        return;
      }

      const isApproved = r.status === 'approved' || r.approvalStatus === 'approved' || (!r.status && !r.approvalStatus);
      const isPending = r.status === 'pending' || r.approvalStatus === 'pending';
      const isRejected = r.status === 'rejected' || r.approvalStatus === 'rejected';

      if (isApproved) {
        totalApprovedRemitted += amt;
        approvedRemittanceCount += 1;
      } else if (isPending) {
        pendingRemitted += amt;
        pendingRemittanceCount += 1;
      } else if (isRejected) {
        rejectedRemitted += amt;
      }
    });
  } else if (Array.isArray(students) && students.length > 0) {
    const sheetRemitted = students.reduce((max, s) => {
      const val = Number(s.total_remitted) || 0;
      return Math.max(max, val);
    }, 0);
    totalApprovedRemitted = sheetRemitted;
  }

  // Cash in hand is total collected minus approved remittances in the books
  const cashInHand = Math.max(0, totalCollected - totalApprovedRemitted);
  // Available balance cannot exceed remaining cash in hand or unremitted funds minus pending requests
  const availableBalance = Math.max(0, cashInHand - pendingRemitted);

  const collectionCount = (students || []).filter((s) => {
    const admissionPaid = Math.max(0, Number(s.admission_paid) || 0);
    const hasAdditional = Array.isArray(s.additional_fees) && s.additional_fees.some((af) => (Number(af.amountPaid) || 0) > 0);
    return (
      (Number(s.amount_paid) || 0) > 0 || 
      admissionPaid > 0 ||
      (Number(s.lesson_paid) || 0) > 0 || 
      (Number(s.exam_paid) || 0) > 0 ||
      hasAdditional
    );
  }).length;

  return {
    totalCollected,
    totalTuitionCollected,
    totalAdmissionCollected,
    totalLessonCollected,
    totalExamCollected,
    totalRemitted: totalApprovedRemitted,
    pendingRemitted,
    rejectedRemitted,
    voidedRemitted,
    cashInHand,
    availableBalance,
    collectionCount,
    remittanceCount: (remittances || []).filter((r) => !r.isVoided && r.status !== 'voided').length,
    pendingRemittanceCount,
    approvedRemittanceCount,
    voidedRemittanceCount,
  };
}

export interface FeeSourceItem {
  category: 'tuition' | 'admission' | 'lesson' | 'exam' | 'additional';
  label: string;
  amount: number;
  studentCount: number;
  percentage: number;
  color: string;
  bgColor: string;
  textColor: string;
}

export interface ClassSourceItem {
  className: string;
  amount: number;
  studentCount: number;
  percentage: number;
  tuition: number;
  admission: number;
  lesson: number;
  exam: number;
}

export interface PaymentChannelItem {
  channel: string;
  label: string;
  amount: number;
  count: number;
  percentage: number;
  iconName?: string;
}

export interface CollectionSourceBreakdown {
  totalCollected: number;
  contributorCount: number;
  classCount: number;
  feeSources: FeeSourceItem[];
  classSources: ClassSourceItem[];
  channelSources: PaymentChannelItem[];
  topContributingClass: ClassSourceItem | null;
  topFeeCategory: FeeSourceItem | null;
}

/**
 * Calculates complete source intelligence of all student fee collections,
 * highlighting fee category origins, class level contributions, and payment channels.
 */
export function calculateCollectionSourceBreakdown(
  students: StudentPaymentRecord[],
  school?: SchoolProfile
): CollectionSourceBreakdown {
  const safeStudents = Array.isArray(students) ? students : [];

  let tuitionTotal = 0;
  let tuitionCount = 0;
  let admissionTotal = 0;
  let admissionCount = 0;
  let lessonTotal = 0;
  let lessonCount = 0;
  let examTotal = 0;
  let examCount = 0;
  let additionalTotal = 0;
  let additionalCount = 0;

  const classMap = new Map<string, {
    amount: number;
    studentCount: number;
    tuition: number;
    admission: number;
    lesson: number;
    exam: number;
  }>();

  const channelMap = new Map<string, { amount: number; count: number }>();

  let contributorCount = 0;

  safeStudents.forEach((student) => {
    const bd = deriveFeeBreakdown(student, school);
    const sTuition = Math.max(0, bd.tuitionPaid || 0);
    const sAdmission = Math.max(0, bd.admissionPaid || 0);
    const sLesson = Math.max(0, bd.lessonPaid || 0);
    const sExam = Math.max(0, bd.examPaid || 0);
    const sAdditional = Math.max(0, bd.additionalFeesPaid || 0);

    const studentTotal = sTuition + sAdmission + sLesson + sExam + sAdditional;

    if (studentTotal > 0) {
      contributorCount += 1;

      // Fee Category accumulation
      if (sTuition > 0) {
        tuitionTotal += sTuition;
        tuitionCount += 1;
      }
      if (sAdmission > 0) {
        admissionTotal += sAdmission;
        admissionCount += 1;
      }
      if (sLesson > 0) {
        lessonTotal += sLesson;
        lessonCount += 1;
      }
      if (sExam > 0) {
        examTotal += sExam;
        examCount += 1;
      }
      if (sAdditional > 0) {
        additionalTotal += sAdditional;
        additionalCount += 1;
      }

      // Class Source breakdown
      const className = (student.class || 'Unassigned').trim();
      const existingClass = classMap.get(className) || {
        amount: 0,
        studentCount: 0,
        tuition: 0,
        admission: 0,
        lesson: 0,
        exam: 0,
      };

      existingClass.amount += studentTotal;
      existingClass.studentCount += 1;
      existingClass.tuition += sTuition;
      existingClass.admission += sAdmission;
      existingClass.lesson += sLesson;
      existingClass.exam += sExam;
      classMap.set(className, existingClass);

      // Payment Channel breakdown: read each payment_history line, then fall back to payment_method
      const classifyChannel = (raw: unknown): string => {
        const method = String(raw || 'cash').toLowerCase();
        if (method.includes('transfer') || method.includes('direct') || method.includes('online')) return 'transfer';
        if (method.includes('pos') || method.includes('card')) return 'pos';
        if (method.includes('deposit') || method.includes('teller')) return 'deposit';
        return 'cash';
      };
      const addToChannel = (key: string, amount: number) => {
        const existingChannel = channelMap.get(key) || { amount: 0, count: 0 };
        existingChannel.amount += amount;
        existingChannel.count += 1;
        channelMap.set(key, existingChannel);
      };

      const historyLines = Array.isArray(student.payment_history) ? student.payment_history : [];
      let historyTotal = 0;
      historyLines.forEach((h) => {
        const lineAmount = Number(h.amountPaidNow) || 0;
        if (lineAmount <= 0) return;
        historyTotal += lineAmount;
        addToChannel(
          classifyChannel(h.paymentMethod || (student as any).payment_method || (student as any).paymentMethod),
          lineAmount
        );
      });

      // Older students with no history, or whose history is short of the amount paid
      const remainder = Math.round((studentTotal - historyTotal) * 100) / 100;
      if (remainder > 0.005) {
        addToChannel(
          classifyChannel((student as any).payment_method || (student as any).paymentMethod),
          remainder
        );
      }
    }
  });

  const totalCollected = tuitionTotal + admissionTotal + lessonTotal + examTotal + additionalTotal;

  // Build fee sources array with percentage and color branding
  const feeSources: FeeSourceItem[] = [
    {
      category: 'tuition',
      label: 'Tuition Fees',
      amount: tuitionTotal,
      studentCount: tuitionCount,
      percentage: totalCollected > 0 ? Math.round((tuitionTotal / totalCollected) * 1000) / 10 : 0,
      color: '#2563eb', // blue-600
      bgColor: 'bg-blue-50',
      textColor: 'text-blue-700',
    },
    {
      category: 'admission',
      label: 'Admission & Reg.',
      amount: admissionTotal,
      studentCount: admissionCount,
      percentage: totalCollected > 0 ? Math.round((admissionTotal / totalCollected) * 1000) / 10 : 0,
      color: '#9333ea', // purple-600
      bgColor: 'bg-purple-50',
      textColor: 'text-purple-700',
    },
    {
      category: 'lesson',
      label: 'Lesson Fees',
      amount: lessonTotal,
      studentCount: lessonCount,
      percentage: totalCollected > 0 ? Math.round((lessonTotal / totalCollected) * 1000) / 10 : 0,
      color: '#059669', // emerald-600
      bgColor: 'bg-emerald-50',
      textColor: 'text-emerald-700',
    },
    {
      category: 'exam',
      label: 'Exam Fees',
      amount: examTotal,
      studentCount: examCount,
      percentage: totalCollected > 0 ? Math.round((examTotal / totalCollected) * 1000) / 10 : 0,
      color: '#d97706', // amber-600
      bgColor: 'bg-amber-50',
      textColor: 'text-amber-700',
    },
  ];

  if (additionalTotal > 0) {
    feeSources.push({
      category: 'additional',
      label: 'Ancillary / Other',
      amount: additionalTotal,
      studentCount: additionalCount,
      percentage: totalCollected > 0 ? Math.round((additionalTotal / totalCollected) * 1000) / 10 : 0,
      color: '#0891b2', // cyan-600
      bgColor: 'bg-cyan-50',
      textColor: 'text-cyan-700',
    });
  }

  // Build class sources sorted by highest collection volume
  const classSources: ClassSourceItem[] = Array.from(classMap.entries())
    .map(([className, data]) => ({
      className,
      amount: data.amount,
      studentCount: data.studentCount,
      percentage: totalCollected > 0 ? Math.round((data.amount / totalCollected) * 1000) / 10 : 0,
      tuition: data.tuition,
      admission: data.admission,
      lesson: data.lesson,
      exam: data.exam,
    }))
    .sort((a, b) => b.amount - a.amount);

  // Build payment channel sources
  const channelLabels: Record<string, string> = {
    cash: 'Physical Cash (Bursar Custody)',
    transfer: 'Bank Transfer / Electronic',
    pos: 'POS Settlement',
    deposit: 'Direct Bank Deposit',
  };

  const channelSources: PaymentChannelItem[] = Array.from(channelMap.entries())
    .map(([channel, data]) => ({
      channel,
      label: channelLabels[channel] || channel,
      amount: data.amount,
      count: data.count,
      percentage: totalCollected > 0 ? Math.round((data.amount / totalCollected) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  const topContributingClass = classSources.length > 0 ? classSources[0] : null;
  const topFeeCategory = [...feeSources].sort((a, b) => b.amount - a.amount)[0] || null;

  return {
    totalCollected,
    contributorCount,
    classCount: classSources.length,
    feeSources,
    classSources,
    channelSources,
    topContributingClass,
    topFeeCategory,
  };
}

/**
 * Strictly validates that a requested remittance amount does not exceed the
 * available unremitted funds collected by the bursar.
 */
export function validateRemittanceAmount(
  amount: number,
  students: StudentPaymentRecord[],
  remittances: RemittanceRecord[],
  school?: SchoolProfile
): {
  isValid: boolean;
  availableBalance: number;
  totalCollected: number;
  totalRemitted: number;
  pendingRemitted: number;
  error?: string;
} {
  const metrics = calculateCollectionMetrics(students, remittances, school);
  const availableBalance = Math.max(0, metrics.cashInHand - metrics.pendingRemitted);

  if (isNaN(amount) || amount <= 0) {
    return {
      isValid: false,
      availableBalance,
      totalCollected: metrics.totalCollected,
      totalRemitted: metrics.totalRemitted,
      pendingRemitted: metrics.pendingRemitted,
      error: 'Please enter a valid remittance amount greater than 0.',
    };
  }

  if (amount > availableBalance) {
    return {
      isValid: false,
      availableBalance,
      totalCollected: metrics.totalCollected,
      totalRemitted: metrics.totalRemitted,
      pendingRemitted: metrics.pendingRemitted,
      error: `Balance is lower than amount she is remitting. Available collection balance is ${availableBalance}.`,
    };
  }

  return {
    isValid: true,
    availableBalance,
    totalCollected: metrics.totalCollected,
    totalRemitted: metrics.totalRemitted,
    pendingRemitted: metrics.pendingRemitted,
  };
}

/**
 * Extracts total remitted value stored in student sheet records
 */
export function getSheetTotalRemitted(students: StudentPaymentRecord[]): number {
  if (!Array.isArray(students) || students.length === 0) return 0;
  return students.reduce((max, s) => {
    const val = Number(s.total_remitted) || 0;
    return Math.max(max, val);
  }, 0);
}
