/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StudentPaymentRecord } from '../types';
import { calculateBalance, calculateStatus, deriveFeeBreakdown, isLessonDisabled } from './calculations';

export type DuplicateMatchCriteria = 'id' | 'name_and_class' | 'name_only' | 'same_name_recommendations' | 'all';

export interface DuplicateGroup {
  groupId: string;
  criteria: 'id' | 'name_and_class' | 'name_only' | 'same_name_exact' | 'same_name_swapped';
  matchKey: string;
  matchDescription: string;
  recommendationNote?: string;
  isRecommendedSameName?: boolean;
  records: StudentPaymentRecord[];
  primaryRecordId: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface MergeResult {
  mergedRecord: StudentPaymentRecord;
  deletedRecordIds: string[];
}

/**
 * Normalizes text for reliable matching (removes accents, trims, lowercases, collapses whitespace)
 */
export function normalizeText(text?: string): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '');
}

/**
 * Returns alphabetically sorted name tokens for cross-word-order name matching
 */
export function getNameTokensKey(name?: string): string {
  const norm = normalizeText(name);
  if (!norm) return '';
  const tokens = norm.split(' ').filter((t) => t.length > 0);
  tokens.sort();
  return tokens.join(' ');
}

/**
 * Scans a list of students and detects duplicates based on ID, Name+Class, or Same Name
 */
export function findDuplicateGroups(
  students: StudentPaymentRecord[],
  criteria: DuplicateMatchCriteria = 'all',
  searchQuery: string = '',
  ignoredIds: string[] = []
): DuplicateGroup[] {
  if (!students || students.length < 2) return [];

  const ignoredSet = new Set(ignoredIds);
  const groups: DuplicateGroup[] = [];
  const processedIdPairs = new Set<string>();

  // 1. Group by exact Student ID
  if (criteria === 'id' || criteria === 'all') {
    const idMap = new Map<string, StudentPaymentRecord[]>();
    students.forEach((s) => {
      if (!s || !s.id) return;
      const cleanId = s.id.trim().toUpperCase();
      if (!cleanId) return;
      const list = idMap.get(cleanId) || [];
      list.push(s);
      idMap.set(cleanId, list);
    });

    idMap.forEach((matchedRecords, cleanId) => {
      if (matchedRecords.length > 1) {
        const groupId = `id-group-${cleanId}`;
        if (!ignoredSet.has(groupId)) {
          // Pick primary: student with most complete payments, or earliest created
          const primary = pickBestPrimaryRecord(matchedRecords);
          const group: DuplicateGroup = {
            groupId,
            criteria: 'id',
            matchKey: cleanId,
            matchDescription: `Duplicate Student ID: #${cleanId} (${matchedRecords[0].full_name})`,
            recommendationNote: 'Exact Student ID Duplicate (Identical student registration number)',
            isRecommendedSameName: false,
            records: matchedRecords,
            primaryRecordId: primary.id,
            confidence: 'high',
          };
          groups.push(group);

          matchedRecords.forEach((r) => {
            matchedRecords.forEach((other) => {
              if (r.id !== other.id) {
                processedIdPairs.add(`${r.id}_${other.id}`);
              }
            });
          });
        }
      }
    });
  }

  // 2. Group by Normalized Name + Class
  if (criteria === 'name_and_class' || criteria === 'all') {
    const nameClassMap = new Map<string, StudentPaymentRecord[]>();
    students.forEach((s) => {
      if (!s || !s.full_name) return;
      const normName = normalizeText(s.full_name);
      const normClass = normalizeText(s.class || 'noclass');
      if (!normName) return;

      const compositeKey = `${normName}__${normClass}`;
      const list = nameClassMap.get(compositeKey) || [];
      list.push(s);
      nameClassMap.set(compositeKey, list);
    });

    nameClassMap.forEach((matchedRecords, key) => {
      if (matchedRecords.length > 1) {
        const groupId = `nameclass-group-${key}`;
        if (!ignoredSet.has(groupId)) {
          // Check if this group was already fully covered by exact ID match
          const isDuplicateOfIdGroup = groups.some(
            (g) => g.criteria === 'id' && g.records.length === matchedRecords.length &&
                   g.records.every((r) => matchedRecords.some((mr) => mr.id === r.id))
          );

          if (!isDuplicateOfIdGroup) {
            const sample = matchedRecords[0];
            const primary = pickBestPrimaryRecord(matchedRecords);
            groups.push({
              groupId,
              criteria: 'name_and_class',
              matchKey: key,
              matchDescription: `Same Name & Class: "${sample.full_name}" (${sample.class || 'Unassigned'})`,
              recommendationNote: 'Same Name & Class (High confidence duplicate student entry)',
              isRecommendedSameName: true,
              records: matchedRecords,
              primaryRecordId: primary.id,
              confidence: 'high',
            });
          }
        }
      }
    });
  }

  // 3. Group by Exact Name across School (Same Full Name)
  if (criteria === 'name_only' || criteria === 'same_name_recommendations' || criteria === 'all') {
    const nameOnlyMap = new Map<string, StudentPaymentRecord[]>();
    students.forEach((s) => {
      if (!s || !s.full_name) return;
      const normName = normalizeText(s.full_name);
      if (!normName || normName.length < 3) return;

      const list = nameOnlyMap.get(normName) || [];
      list.push(s);
      nameOnlyMap.set(normName, list);
    });

    nameOnlyMap.forEach((matchedRecords, normName) => {
      if (matchedRecords.length > 1) {
        const groupId = `nameonly-group-${normName}`;
        if (!ignoredSet.has(groupId)) {
          const sample = matchedRecords[0];
          // Check if already captured in name & class or id
          const isAlreadyCaptured = groups.some((g) =>
            g.records.length === matchedRecords.length &&
            g.records.every((r) => matchedRecords.some((mr) => mr.id === r.id))
          );

          if (!isAlreadyCaptured) {
            const primary = pickBestPrimaryRecord(matchedRecords);
            const uniqueClasses = Array.from(new Set(matchedRecords.map((r) => r.class).filter(Boolean)));
            groups.push({
              groupId,
              criteria: 'same_name_exact',
              matchKey: normName,
              matchDescription: `Recommended Same Name Duplicate: "${sample.full_name}"`,
              recommendationNote: uniqueClasses.length > 1 
                ? `Recommended Same Name Duplicate (Found across classes: ${uniqueClasses.join(', ')})`
                : `Recommended Same Name Duplicate (Identical student full name)`,
              isRecommendedSameName: true,
              records: matchedRecords,
              primaryRecordId: primary.id,
              confidence: 'medium',
            });
          }
        }
      }
    });

    // 4. Token-sorted Name match (e.g. "Adeyemi Oluwaseun" vs "Oluwaseun Adeyemi")
    const tokenMap = new Map<string, StudentPaymentRecord[]>();
    students.forEach((s) => {
      const tokenKey = getNameTokensKey(s.full_name);
      if (tokenKey && tokenKey.length >= 4 && tokenKey.includes(' ')) {
        const list = tokenMap.get(tokenKey) || [];
        list.push(s);
        tokenMap.set(tokenKey, list);
      }
    });

    tokenMap.forEach((matchedRecords, tokenKey) => {
      if (matchedRecords.length > 1) {
        const groupId = `tokens-group-${tokenKey}`;
        if (!ignoredSet.has(groupId)) {
          const isAlreadyCaptured = groups.some((g) =>
            g.records.length === matchedRecords.length &&
            g.records.every((r) => matchedRecords.some((mr) => mr.id === r.id))
          );

          if (!isAlreadyCaptured) {
            const primary = pickBestPrimaryRecord(matchedRecords);
            groups.push({
              groupId,
              criteria: 'same_name_swapped',
              matchKey: tokenKey,
              matchDescription: `Recommended Same Name (Swapped): "${matchedRecords[0].full_name}" ⇄ "${matchedRecords[1].full_name}"`,
              recommendationNote: 'Recommended Same Name Duplicate (Word-order / First & Last name inverted)',
              isRecommendedSameName: true,
              records: matchedRecords,
              primaryRecordId: primary.id,
              confidence: 'medium',
            });
          }
        }
      }
    });
  }

  // Sort groups: Recommended same-name first
  groups.sort((a, b) => {
    if (a.isRecommendedSameName && !b.isRecommendedSameName) return -1;
    if (!a.isRecommendedSameName && b.isRecommendedSameName) return 1;
    return b.records.length - a.records.length;
  });

  // Apply search query filter if user typed in search bar (by ID, Name, or Class)
  if (searchQuery && searchQuery.trim()) {
    const q = searchQuery.toLowerCase().trim();
    return groups.filter((g) => {
      const matchDesc = g.matchDescription.toLowerCase();
      const matchKey = g.matchKey.toLowerCase();
      const matchNote = (g.recommendationNote || '').toLowerCase();
      const matchesRecord = g.records.some(
        (r) =>
          (r.id && r.id.toLowerCase().includes(q)) ||
          (r.full_name && r.full_name.toLowerCase().includes(q)) ||
          (r.class && r.class.toLowerCase().includes(q)) ||
          (r.receipt_no && r.receipt_no.toLowerCase().includes(q))
      );
      return matchDesc.includes(q) || matchKey.includes(q) || matchNote.includes(q) || matchesRecord;
    });
  }

  return groups;
}

/**
 * Automatically picks the best candidate as the primary record
 * (The one with highest payment amount, valid ID, or most granular fee records)
 */
export function pickBestPrimaryRecord(records: StudentPaymentRecord[]): StudentPaymentRecord {
  if (!records || records.length === 0) {
    throw new Error('Cannot pick primary record from empty list.');
  }
  if (records.length === 1) return records[0];

  return [...records].sort((a, b) => {
    // 1. Prefer record with higher total paid amount
    const paidA = Number(a.amount_paid) || 0;
    const paidB = Number(b.amount_paid) || 0;
    if (paidB !== paidA) return paidB - paidA;

    // 2. Prefer record with valid receipt number
    const hasReceiptA = !!(a.receipt_no && a.receipt_no.trim());
    const hasReceiptB = !!(b.receipt_no && b.receipt_no.trim());
    if (hasReceiptA && !hasReceiptB) return -1;
    if (!hasReceiptA && hasReceiptB) return 1;

    // 3. Prefer record with payment date
    const hasDateA = !!(a.payment_date && a.payment_date.trim());
    const hasDateB = !!(b.payment_date && b.payment_date.trim());
    if (hasDateA && !hasDateB) return -1;
    if (!hasDateA && hasDateB) return 1;

    // 4. Fallback to first
    return 0;
  })[0];
}

/**
 * Merges a primary record with one or more duplicate records.
 * Combines paid sums, receipts, itemized fee breakdowns, and recalculates balances.
 */
export function mergeDuplicateRecords(
  primaryRecord: StudentPaymentRecord,
  duplicateRecords: StudentPaymentRecord[]
): MergeResult {
  const allRecords = [primaryRecord, ...duplicateRecords];
  const deletedRecordIds = duplicateRecords.map((d) => d.id);

  // Fee breakdowns
  const primaryBreakdown = deriveFeeBreakdown(primaryRecord);

  // Aggregated financials
  let totalFee = Number(primaryRecord.fee_amount) || Number(primaryRecord.tuition_fee) || 0;
  let totalTuitionPaid = 0;
  let totalAdmissionFee = primaryBreakdown.admissionFee;
  let totalAdmissionPaid = 0;
  let totalLessonFee = primaryBreakdown.lessonFee;
  let totalLessonPaid = 0;
  let totalExamFee = primaryBreakdown.examFee;
  let totalExamPaid = 0;
  let totalOverallPaid = 0;

  const receiptNumbers = new Set<string>();
  const lessonMonthsSet = new Set<string>();
  let latestPaymentDate = primaryRecord.payment_date || '';

  allRecords.forEach((r) => {
    const bd = deriveFeeBreakdown(r);

    // School Fee / Tuition Paid
    const tuitionPaid = Number(r.tuition_paid) !== undefined && !isNaN(Number(r.tuition_paid))
      ? Number(r.tuition_paid)
      : (Number(r.amount_paid) || 0);
    totalTuitionPaid += tuitionPaid;

    // Admission
    totalAdmissionPaid += bd.admissionPaid;
    if (bd.admissionFee > totalAdmissionFee) totalAdmissionFee = bd.admissionFee;

    // Lesson
    totalLessonPaid += bd.lessonPaid;
    if (bd.lessonFee > totalLessonFee) totalLessonFee = bd.lessonFee;
    if (bd.lessonMonths && bd.lessonMonths !== 'Unpaid' && bd.lessonMonths !== 'None') {
      bd.lessonMonths.split(',').forEach((m) => {
        const trimmed = m.trim();
        if (trimmed) lessonMonthsSet.add(trimmed);
      });
    }

    // Exam
    totalExamPaid += bd.examPaid;
    if (bd.examFee > totalExamFee) totalExamFee = bd.examFee;

    // Overall Total Paid
    totalOverallPaid += Number(r.amount_paid) || 0;

    // Receipts
    if (r.receipt_no && r.receipt_no.trim()) {
      receiptNumbers.add(r.receipt_no.trim());
    }

    // Date
    if (r.payment_date && (!latestPaymentDate || r.payment_date > latestPaymentDate)) {
      latestPaymentDate = r.payment_date;
    }
  });

  // Calculate overall fee if fee_amount is less than tuition
  if (totalFee < totalTuitionPaid) {
    totalFee = totalTuitionPaid;
  }

  const effectiveTotalPaid = Math.max(totalOverallPaid, totalTuitionPaid);
  const newBalance = calculateBalance(totalFee, effectiveTotalPaid);
  const newStatus = calculateStatus(totalFee, effectiveTotalPaid);

  const combinedReceipts = Array.from(receiptNumbers).join(', ');
  const combinedLessonMonths = lessonMonthsSet.size > 0
    ? Array.from(lessonMonthsSet).join(', ')
    : (primaryBreakdown.lessonMonths || 'Unpaid');

  const mergedRecord: StudentPaymentRecord = {
    ...primaryRecord,
    fee_amount: totalFee,
    amount_paid: effectiveTotalPaid,
    balance: newBalance,
    status: newStatus,
    payment_date: latestPaymentDate || primaryRecord.payment_date || '',
    
    // Tuition Breakdown
    tuition_fee: totalFee,
    tuition_paid: totalTuitionPaid,
    tuition_status: calculateStatus(totalFee, totalTuitionPaid),

    // Admission Breakdown
    admission_fee: totalAdmissionFee,
    admission_paid: totalAdmissionPaid,
    admission_status: calculateStatus(totalAdmissionFee, totalAdmissionPaid),
    is_new_admission: totalAdmissionFee > 0,

    // Lesson Breakdown
    lesson_fee: totalLessonFee,
    lesson_paid: totalLessonPaid,
    lesson_status: calculateStatus(totalLessonFee, totalLessonPaid) as 'unpaid' | 'part_payment' | 'fully_paid',
    lesson_months: combinedLessonMonths,
    // Stays opted out only if nothing was charged or paid for lessons on any of the merged records.
    lesson_disabled: totalLessonFee === 0 && totalLessonPaid === 0 && allRecords.some((r) => isLessonDisabled(r)),

    // Exam Breakdown
    exam_fee: totalExamFee,
    exam_paid: totalExamPaid,
    exam_status: calculateStatus(totalExamFee, totalExamPaid),

    receipt_no: combinedReceipts || primaryRecord.receipt_no || '',
  };

  return {
    mergedRecord,
    deletedRecordIds,
  };
}

/**
 * Exports duplicate report to CSV for offline administrative audit
 */
export function generateDuplicateReportCsv(groups: DuplicateGroup[]): string {
  const headers = [
    'Group Type',
    'Matched Identifier',
    'Student ID',
    'Full Name',
    'Class',
    'Term',
    'Session',
    'Total Fee',
    'Amount Paid',
    'Balance',
    'Status',
    'Payment Date',
    'Receipt No',
  ];

  const rows: string[] = [headers.join(',')];

  groups.forEach((g) => {
    g.records.forEach((r) => {
      const row = [
        `"${g.criteria}"`,
        `"${g.matchDescription.replace(/"/g, '""')}"`,
        `"${r.id || ''}"`,
        `"${(r.full_name || '').replace(/"/g, '""')}"`,
        `"${r.class || ''}"`,
        `"${r.term || ''}"`,
        `"${r.session || ''}"`,
        r.fee_amount || 0,
        r.amount_paid || 0,
        r.balance || 0,
        `"${r.status || 'unpaid'}"`,
        `"${r.payment_date || ''}"`,
        `"${r.receipt_no || ''}"`,
      ];
      rows.push(row.join(','));
    });
  });

  return rows.join('\n');
}
