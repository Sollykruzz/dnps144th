/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StudentPaymentRecord } from '../types';
import { calculateBalance, calculateStatus, deriveFeeBreakdown, normalizeStudentRow } from './calculations';
import { saveStoredStudents, safeStorage, markStudentDeleted } from './storage';
import { saveStudentToFirestore, deleteStudentFromFirestore, getLastFirestoreWriteError } from './firebase';

export type DuplicateGroupType = 'id' | 'name' | 'name_and_class' | 'same_name_exact' | 'same_name_swapped';

export interface DuplicateGroup {
  groupId: string;
  matchType: DuplicateGroupType;
  matchKey: string; // e.g. "DOM-001" or "ADEYEMI OLUWASEUN"
  displayTitle: string;
  recommendationNote?: string;
  isRecommendedSameName?: boolean;
  records: StudentPaymentRecord[];
  recommendedPrimaryId: string;
  conflictDetails: {
    hasDifferentClasses: boolean;
    hasDifferentPayments: boolean;
    hasDifferentTerms: boolean;
    totalCombinedPaid: number;
    classesList: string[];
    termsList: string[];
  };
}

const STORAGE_IGNORED_DUPLICATES_PREFIX = 'EMINENT_IGNORED_DUPLICATES_';

/**
 * Normalizes name for duplicate detection (lowercase, trim extra spaces, ignore punctuation)
 */
export function normalizeNameForMatching(name?: string): string {
  if (!name) return '';
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Returns alphabetically sorted name tokens for cross-word-order name matching
 * (e.g. "Adeyemi Oluwaseun" vs "Oluwaseun Adeyemi")
 */
export function getNameTokenKey(name?: string): string {
  const norm = normalizeNameForMatching(name);
  if (!norm) return '';
  const tokens = norm.split(' ').filter((t) => t.length > 0);
  tokens.sort();
  return tokens.join(' ');
}

/**
 * Normalizes ID for duplicate detection
 */
export function normalizeIdForMatching(id?: string): string {
  if (!id) return '';
  return id.toLowerCase().trim();
}

/**
 * Retrieves persisted ignored duplicate group IDs for a school
 */
export function getStoredIgnoredDuplicateIds(schoolId: string = 'dominion-group'): string[] {
  try {
    const raw = safeStorage.getItem(`${STORAGE_IGNORED_DUPLICATES_PREFIX}${schoolId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (e) {
    console.warn('Error reading stored ignored duplicates:', e);
  }
  return [];
}

/**
 * Saves persisted ignored duplicate group IDs for a school
 */
export function saveStoredIgnoredDuplicateIds(ignoredIds: string[], schoolId: string = 'dominion-group'): void {
  try {
    safeStorage.setItem(`${STORAGE_IGNORED_DUPLICATES_PREFIX}${schoolId}`, JSON.stringify(ignoredIds));
  } catch (e) {
    console.warn('Error saving ignored duplicates:', e);
  }
}

/**
 * Clears persisted ignored duplicate IDs for a school
 */
export function clearStoredIgnoredDuplicates(schoolId: string = 'dominion-group'): void {
  try {
    safeStorage.removeItem(`${STORAGE_IGNORED_DUPLICATES_PREFIX}${schoolId}`);
  } catch (e) {
    console.warn('Error clearing ignored duplicates:', e);
  }
}

/**
 * Detects and groups duplicate student records with smart same-name recommendations
 */
export function detectDuplicateGroups(
  students: StudentPaymentRecord[],
  criteria: 'all' | 'id' | 'name' | 'name_and_class' | 'same_name_recommendations' = 'all',
  searchQuery: string = '',
  ignoredIds: string[] = []
): DuplicateGroup[] {
  if (!students || students.length === 0) return [];

  const ignoredSet = new Set(ignoredIds);
  const groupsMap = new Map<string, { 
    matchType: DuplicateGroupType; 
    matchKey: string; 
    recommendationNote?: string;
    isRecommendedSameName?: boolean;
    records: StudentPaymentRecord[];
  }>();

  // Helper to generate consistent group key from student IDs
  const getRecordPairKey = (recs: StudentPaymentRecord[]) => {
    return recs.map(r => r.id).sort().join(':::');
  };

  // 1. Group by exact Student ID
  if (criteria === 'all' || criteria === 'id') {
    const idMap = new Map<string, StudentPaymentRecord[]>();
    students.forEach((s) => {
      const normalizedId = normalizeIdForMatching(s.id);
      if (normalizedId) {
        if (!idMap.has(normalizedId)) {
          idMap.set(normalizedId, []);
        }
        idMap.get(normalizedId)!.push(s);
      }
    });

    idMap.forEach((records, normId) => {
      if (records.length > 1) {
        const key = `id:${normId}`;
        groupsMap.set(key, {
          matchType: 'id',
          matchKey: records[0].id || normId,
          recommendationNote: 'Exact Student ID Match (Duplicate rows with identical ID number)',
          isRecommendedSameName: false,
          records,
        });
      }
    });
  }

  // 2. Group by Name & Class
  if (criteria === 'all' || criteria === 'name_and_class') {
    const nameClassMap = new Map<string, StudentPaymentRecord[]>();
    students.forEach((s) => {
      const normalizedName = normalizeNameForMatching(s.full_name);
      const normalizedClass = (s.class || '').toLowerCase().trim();
      if (normalizedName && normalizedName.length >= 3) {
        const compositeKey = `${normalizedName}:::${normalizedClass}`;
        if (!nameClassMap.has(compositeKey)) {
          nameClassMap.set(compositeKey, []);
        }
        nameClassMap.get(compositeKey)!.push(s);
      }
    });

    nameClassMap.forEach((records, compKey) => {
      if (records.length > 1) {
        // If all records have the same ID, it's already captured in ID grouping
        const uniqueIds = new Set(records.map((r) => normalizeIdForMatching(r.id)));
        const idKey = `id:${normalizeIdForMatching(records[0].id)}`;
        if (uniqueIds.size > 1 || !groupsMap.has(idKey)) {
          const key = `name_class:${compKey}`;
          groupsMap.set(key, {
            matchType: 'name_and_class',
            matchKey: `${records[0].full_name} (${records[0].class})`,
            recommendationNote: 'Same Name & Same Class (High confidence duplicate student entry)',
            isRecommendedSameName: true,
            records,
          });
        }
      }
    });
  }

  // 3. Group by Exact Name across School (Same Full Name)
  if (criteria === 'all' || criteria === 'name' || criteria === 'same_name_recommendations') {
    const exactNameMap = new Map<string, StudentPaymentRecord[]>();
    students.forEach((s) => {
      const normalizedName = normalizeNameForMatching(s.full_name);
      if (normalizedName && normalizedName.length >= 3) {
        if (!exactNameMap.has(normalizedName)) {
          exactNameMap.set(normalizedName, []);
        }
        exactNameMap.get(normalizedName)!.push(s);
      }
    });

    exactNameMap.forEach((records, normName) => {
      if (records.length > 1) {
        const uniqueIds = new Set(records.map((r) => normalizeIdForMatching(r.id)));
        const uniqueClasses = new Set(records.map((r) => (r.class || '').trim().toLowerCase()));
        const idKey = `id:${normalizeIdForMatching(records[0].id)}`;
        const nameClassKey = `name_class:${normName}:::${(records[0].class || '').toLowerCase().trim()}`;

        // Only add if not already fully represented as same ID or same name & class
        if (!groupsMap.has(idKey) && !groupsMap.has(nameClassKey)) {
          const key = `same_name_exact:${normName}`;
          const isCrossClass = uniqueClasses.size > 1;
          groupsMap.set(key, {
            matchType: 'same_name_exact',
            matchKey: records[0].full_name || normName,
            recommendationNote: isCrossClass
              ? `Recommended Same Name Duplicate (Identical name across classes: ${Array.from(uniqueClasses).join(', ')})`
              : 'Recommended Same Name Duplicate (Identical student full name)',
            isRecommendedSameName: true,
            records,
          });
        }
      }
    });

    // 4. Group by Swapped/Token-ordered Name (e.g. "Adeyemi Oluwaseun" vs "Oluwaseun Adeyemi")
    const tokenMap = new Map<string, StudentPaymentRecord[]>();
    students.forEach((s) => {
      const tokenKey = getNameTokenKey(s.full_name);
      if (tokenKey && tokenKey.length >= 4 && tokenKey.includes(' ')) {
        if (!tokenMap.has(tokenKey)) {
          tokenMap.set(tokenKey, []);
        }
        tokenMap.get(tokenKey)!.push(s);
      }
    });

    tokenMap.forEach((records, tokenKey) => {
      if (records.length > 1) {
        // Verify that this isn't already covered by exact name match
        const normNames = new Set(records.map((r) => normalizeNameForMatching(r.full_name)));
        const exactKey = `same_name_exact:${normalizeNameForMatching(records[0].full_name)}`;
        
        if (normNames.size > 1 && !groupsMap.has(exactKey)) {
          const key = `same_name_swapped:${tokenKey}`;
          groupsMap.set(key, {
            matchType: 'same_name_swapped',
            matchKey: `${records[0].full_name} ⇄ ${records[1].full_name}`,
            recommendationNote: 'Recommended Same Name Duplicate (Word-order / First & Last Name swapped)',
            isRecommendedSameName: true,
            records,
          });
        }
      }
    });
  }

  // Format into final DuplicateGroup objects
  const result: DuplicateGroup[] = [];

  groupsMap.forEach((val, groupId) => {
    // Check if group is ignored
    if (ignoredSet.has(groupId)) return;

    // Also check if composite record pair is ignored
    const pairKey = `pair:${getRecordPairKey(val.records)}`;
    if (ignoredSet.has(pairKey)) return;

    // Determine recommended primary record:
    // 1. Highest total fee payments
    // 2. Has valid receipt numbers
    // 3. Most recent payment date
    // 4. Earliest valid student ID
    let bestPrimary = val.records[0];
    let maxPaid = -1;
    let hasReceipt = false;

    val.records.forEach((rec) => {
      const breakdown = deriveFeeBreakdown(rec);
      const totalPaid = (breakdown.tuitionPaid || 0) + 
                        (breakdown.admissionPaid || 0) + 
                        (breakdown.lessonPaid || 0) + 
                        (breakdown.examPaid || 0);
      const recHasReceipt = Boolean(rec.receipt_no && rec.receipt_no.trim());

      if (totalPaid > maxPaid || (totalPaid === maxPaid && recHasReceipt && !hasReceipt)) {
        maxPaid = totalPaid;
        hasReceipt = recHasReceipt;
        bestPrimary = rec;
      }
    });

    const uniqueClassesList = Array.from(new Set(val.records.map((r) => (r.class || '').trim()).filter(Boolean)));
    const uniqueTermsList = Array.from(new Set(val.records.map((r) => (r.term || '').trim()).filter(Boolean)));
    const totalCombinedPaid = val.records.reduce((acc, r) => acc + (Number(r.amount_paid) || 0), 0);

    const hasDifferentPayments = val.records.some((r, idx, arr) => 
      idx > 0 && (Number(r.amount_paid) || 0) !== (Number(arr[0].amount_paid) || 0)
    );

    let displayTitle = '';
    if (val.matchType === 'id') {
      displayTitle = `Student ID: #${val.matchKey} (${val.records[0].full_name})`;
    } else if (val.matchType === 'name_and_class') {
      displayTitle = `Same Name & Class: ${val.matchKey}`;
    } else if (val.matchType === 'same_name_swapped') {
      displayTitle = `Same Name (Swapped): ${val.matchKey}`;
    } else {
      displayTitle = `Same Name: ${val.matchKey}`;
    }

    result.push({
      groupId,
      matchType: val.matchType,
      matchKey: val.matchKey,
      displayTitle,
      recommendationNote: val.recommendationNote,
      isRecommendedSameName: val.isRecommendedSameName ?? (val.matchType !== 'id'),
      records: val.records,
      recommendedPrimaryId: bestPrimary.id,
      conflictDetails: {
        hasDifferentClasses: uniqueClassesList.length > 1,
        hasDifferentTerms: uniqueTermsList.length > 1,
        hasDifferentPayments,
        totalCombinedPaid,
        classesList: uniqueClassesList,
        termsList: uniqueTermsList,
      },
    });
  });

  // Sort groups: Recommended same-name and exact ID duplicates first
  result.sort((a, b) => {
    if (a.isRecommendedSameName && !b.isRecommendedSameName) return -1;
    if (!a.isRecommendedSameName && b.isRecommendedSameName) return 1;
    return b.records.length - a.records.length;
  });

  // Apply search query filter if provided
  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase().trim();
    return result.filter((g) => {
      const matchesTitle = g.displayTitle.toLowerCase().includes(q);
      const matchesNote = (g.recommendationNote || '').toLowerCase().includes(q);
      const matchesRecord = g.records.some(
        (r) => (r.full_name || '').toLowerCase().includes(q) || 
               (r.id || '').toLowerCase().includes(q) || 
               (r.class || '').toLowerCase().includes(q) ||
               (r.receipt_no || '').toLowerCase().includes(q)
      );
      return matchesTitle || matchesNote || matchesRecord;
    });
  }

  return result;
}

/**
 * Merges multiple student records into one consolidated record
 */
export function mergeStudentRecords(
  records: StudentPaymentRecord[],
  primaryId: string
): StudentPaymentRecord {
  const primary = records.find((r) => r.id === primaryId) || records[0];

  let sumTuitionPaid = 0;
  let sumAdmissionPaid = 0;
  let sumLessonPaid = 0;
  let sumExamPaid = 0;
  let latestPaymentDate = primary.payment_date || '';
  let highestTuitionFee = Number(primary.fee_amount) || Number(primary.tuition_fee) || 0;
  let highestAdmissionFee = Number(primary.admission_fee) || 0;
  let highestLessonFee = Number(primary.lesson_fee) || 0;
  let highestExamFee = Number(primary.exam_fee) || 0;
  const receipts = new Set<string>();

  records.forEach((r) => {
    const b = deriveFeeBreakdown(r);
    sumTuitionPaid += (b.tuitionPaid || 0);
    sumAdmissionPaid += (b.admissionPaid || 0);
    sumLessonPaid += (b.lessonPaid || 0);
    sumExamPaid += (b.examPaid || 0);

    highestTuitionFee = Math.max(highestTuitionFee, Number(r.fee_amount) || Number(r.tuition_fee) || 0);
    highestAdmissionFee = Math.max(highestAdmissionFee, b.admissionFee || 0);
    highestLessonFee = Math.max(highestLessonFee, b.lessonFee || 0);
    highestExamFee = Math.max(highestExamFee, b.examFee || 0);

    if (r.payment_date && (!latestPaymentDate || r.payment_date > latestPaymentDate)) {
      latestPaymentDate = r.payment_date;
    }

    if (r.receipt_no && r.receipt_no.trim()) {
      receipts.add(r.receipt_no.trim());
    }
  });

  const totalItemizedFees = highestTuitionFee + highestAdmissionFee + highestLessonFee + highestExamFee;
  const finalFeeAmount = totalItemizedFees > 0 ? totalItemizedFees : (Number(primary.fee_amount) || 5000);
  const sumTotalPaid = sumTuitionPaid + sumAdmissionPaid + sumLessonPaid + sumExamPaid;
  const finalBalance = calculateBalance(finalFeeAmount, sumTotalPaid);
  const finalStatus = calculateStatus(finalFeeAmount, sumTotalPaid);
  const tuitionStatus = calculateStatus(highestTuitionFee, sumTuitionPaid);

  const merged: StudentPaymentRecord = {
    ...primary,
    fee_amount: finalFeeAmount,
    amount_paid: sumTotalPaid,
    balance: finalBalance,
    status: finalStatus,
    payment_date: latestPaymentDate || primary.payment_date,
    tuition_fee: highestTuitionFee,
    tuition_paid: sumTuitionPaid,
    tuition_status: tuitionStatus,
    admission_fee: highestAdmissionFee,
    admission_paid: sumAdmissionPaid,
    admission_status: calculateStatus(highestAdmissionFee, sumAdmissionPaid),
    lesson_fee: highestLessonFee,
    lesson_paid: sumLessonPaid,
    lesson_status: calculateStatus(highestLessonFee, sumLessonPaid),
    exam_fee: highestExamFee,
    exam_paid: sumExamPaid,
    exam_status: calculateStatus(highestExamFee, sumExamPaid),
    receipt_no: Array.from(receipts).join(', ') || primary.receipt_no,
  };

  return normalizeStudentRow(merged);
}

/**
 * Resolves a single duplicate group:
 * - If action is 'merge': merges payments into primary record and deletes the other duplicates.
 * - If action is 'keep_primary': preserves primary record unchanged and deletes the other duplicates.
 */
export async function resolveDuplicateGroup(
  group: DuplicateGroup,
  primaryId: string,
  action: 'merge' | 'keep_primary',
  currentStudents: StudentPaymentRecord[],
  schoolId: string = 'dominion-group'
): Promise<{
  updatedStudents: StudentPaymentRecord[];
  deletedRecordsCount: number;
  mergedRecord: StudentPaymentRecord;
}> {
  const recordsToDelete = group.records.filter((r) => r.id !== primaryId);
  const primaryRecord = group.records.find((r) => r.id === primaryId) || group.records[0];

  const finalRecord = action === 'merge'
    ? mergeStudentRecords(group.records, primaryId)
    : primaryRecord;

  // 1. Perform Firestore cloud operations FIRST (Firestore as sole source of truth)
  const saveSuccess = await saveStudentToFirestore(finalRecord, schoolId);
  if (!saveSuccess) {
    const errorMsg = getLastFirestoreWriteError() || 'Failed to save merged student record to Firestore.';
    throw new Error(errorMsg);
  }

  for (const rec of recordsToDelete) {
    const delSuccess = await deleteStudentFromFirestore(rec.id, schoolId);
    if (!delSuccess) {
      const errorMsg = getLastFirestoreWriteError() || `Failed to delete duplicate record [${rec.id}] from Firestore.`;
      throw new Error(errorMsg);
    }
  }

  // 2. Only after Firestore confirms: remove deleted records from student array & mark tombstones
  const deleteIds = new Set(recordsToDelete.map((r) => r.id));
  recordsToDelete.forEach((rec) => {
    markStudentDeleted(rec.id, rec.full_name, schoolId);
  });
  const remaining = currentStudents.filter((s) => !deleteIds.has(s.id));

  // 3. Update or ensure the primary record is present in remaining
  const finalStudents = remaining.map((s) => (s.id === primaryId ? finalRecord : s));

  // 4. Save to local storage as read-only offline fallback cache
  saveStoredStudents(finalStudents, schoolId);

  return {
    updatedStudents: finalStudents,
    deletedRecordsCount: recordsToDelete.length,
    mergedRecord: finalRecord,
  };
}

/**
 * Bulk resolves all duplicate groups with safe verification logic
 */
export async function bulkResolveDuplicates(
  groups: DuplicateGroup[],
  action: 'merge' | 'keep_primary',
  currentStudents: StudentPaymentRecord[],
  schoolId: string = 'dominion-group'
): Promise<{
  updatedStudents: StudentPaymentRecord[];
  totalDeleted: number;
  totalResolvedGroups: number;
}> {
  let activeStudentList = [...currentStudents];
  let totalDeleted = 0;

  for (const group of groups) {
    const primaryId = group.recommendedPrimaryId;
    const res = await resolveDuplicateGroup(
      group,
      primaryId,
      action,
      activeStudentList,
      schoolId
    );
    activeStudentList = res.updatedStudents;
    totalDeleted += res.deletedRecordsCount;
  }

  return {
    updatedStudents: activeStudentList,
    totalDeleted,
    totalResolvedGroups: groups.length,
  };
}
