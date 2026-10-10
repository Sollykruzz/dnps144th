/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StudentPaymentRecord, BursarSession, EndTermResult, SchoolFeeSchedule, SchoolProfile } from '../types';
import { saveLocalSnapshot } from './backupService';
import { batchSaveStudentsToFirestore, saveTermBackupToFirestore } from './firebase';
import { saveStoredStudents } from './storage';
import { deriveFeeBreakdown, calculateStatus, calculateBalance, isLessonDisabled } from './calculations';

/**
 * Generates an archive label based on the current term and session.
 * Example: "Archive - First Term 2026/2027"
 */
export function generateArchiveTabName(term?: string, session?: string): string {
  const cleanTerm = (term && term.trim()) ? term.trim().replace(/[/\\?*:[\]]/g, '-') : 'Current Term';
  const cleanSession = (session && session.trim()) ? session.trim().replace(/[/\\?*:[\]]/g, '-') : 'Session';
  return `Archive - ${cleanTerm} ${cleanSession}`.slice(0, 80);
}

/**
 * Resets all fee-related fields for existing rows in the roster for the upcoming term.
 * Strict rules:
 * - keep id, full_name, class unchanged
 * - reset paid amounts to 0
 * - recompute fee amounts based on active class/school fee schedule
 * - reset status to "unpaid" (or "fully_paid" if on verified full scholarship exemption)
 * - set payment_date to ""
 * - do not drop any student rows
 */
export function resetStudentRosterForNewTerm(
  currentRows: StudentPaymentRecord[],
  newTermLabel?: string,
  newSessionLabel?: string,
  schoolProfile?: SchoolProfile
): StudentPaymentRecord[] {
  return currentRows.map((s) => {
    const isExempt = Boolean(
      s.is_exempt_from_school_fee ||
      (s as any).is_scholarship ||
      (s as any).scholarship ||
      (s as any).exempt
    );

    const breakdown = deriveFeeBreakdown(s, schoolProfile);
    const newTuitionFee = isExempt ? 0 : breakdown.tuitionFee;
    // New admission fee only applies once on initial entry, not carried into subsequent terms
    const newAdmissionFee = 0;
    const newLessonFee = breakdown.lessonFee;
    const newExamFee = breakdown.examFee;
    const newTotalFee = newTuitionFee + newAdmissionFee + newLessonFee + newExamFee;

    return {
      id: s.id,
      full_name: s.full_name,
      class: s.class,
      term: (newTermLabel && newTermLabel.trim()) ? newTermLabel.trim() : s.term,
      session: (newSessionLabel && newSessionLabel.trim()) ? newSessionLabel.trim() : s.session,
      fee_amount: newTotalFee,
      amount_paid: 0,
      balance: newTotalFee,
      status: isExempt ? 'fully_paid' : 'unpaid',
      payment_date: '',
      is_exempt_from_school_fee: isExempt,
      scholarship_notes: s.scholarship_notes || undefined,
      tuition_fee: newTuitionFee,
      tuition_paid: 0,
      tuition_status: isExempt ? 'fully_paid' : 'unpaid',
      admission_fee: 0,
      admission_paid: 0,
      admission_status: 'unpaid',
      // New term starts clean. These are cleared explicitly because the cloud save merges
      // into the old document, so a missing key would keep last term's value.
      is_new_admission: false,
      payment_method: '',
      tuition_receipt_no: '',
      admission_receipt_no: '',
      lesson_receipt_no: '',
      exam_receipt_no: '',
      payment_history: [],
      additional_fees: [],
      lesson_fee: newLessonFee,
      lesson_paid: 0,
      lesson_status: breakdown.lessonDisabled ? 'fully_paid' : 'unpaid',
      lesson_months: breakdown.lessonDisabled ? 'Not Enrolled' : 'Unpaid',
      lesson_disabled: isLessonDisabled(s),
      exam_fee: newExamFee,
      exam_paid: 0,
      exam_status: 'unpaid',
      receipt_no: '',
      total_remitted: 0,
    };
  });
}

/**
 * Main End-Term Execution Workflow (Firestore + Local Snapshot):
 * 1. Save an in-app encrypted/JSON snapshot of current term data for safekeeping
 * 2. Reset fee paid balances for the new term
 * 3. Persist new term roster to Firestore cloud database
 * 4. Update local storage cache
 * 5. Return outcome report
 */
export async function executeEndTermWorkflow(
  students: StudentPaymentRecord[],
  session: BursarSession,
  schoolId: string = 'dominion-group',
  options?: {
    customTabName?: string;
    newTermLabel?: string;
    newSessionLabel?: string;
    schoolProfile?: SchoolProfile;
  }
): Promise<EndTermResult> {
  if (!students || students.length === 0) {
    throw new Error('No student records found to archive.');
  }

  const currentTerm = students[0]?.term || 'Current Term';
  const currentSession = students[0]?.session || 'Current Session';
  const archiveName = options?.customTabName || generateArchiveTabName(currentTerm, currentSession);

  // Step 1: Save permanent in-app snapshot for complete data preservation
  const snapshot = saveLocalSnapshot(
    students,
    session,
    currentTerm,
    currentSession,
    `End-Term Archive created for "${archiveName}" before new term rollover`,
    schoolId
  );
  saveTermBackupToFirestore(snapshot, schoolId).catch((err) =>
    console.warn('[Firestore] Note saving end-term backup to cloud:', err)
  );

  // Step 2: Prepare new term student records
  const updatedStudents = resetStudentRosterForNewTerm(
    students,
    options?.newTermLabel,
    options?.newSessionLabel,
    options?.schoolProfile
  );

  // Step 3: Persist to Firebase Cloud Firestore
  const cloudSaved = await batchSaveStudentsToFirestore(updatedStudents, schoolId);
  if (!cloudSaved) {
    throw new Error('The new term could not be saved to the cloud, so nothing was reset. Your archive snapshot is safe. Check your connection and try again.');
  }

  // Step 4: Persist to local cache
  saveStoredStudents(updatedStudents, schoolId);

  return {
    success: true,
    backupTabName: archiveName,
    rowCount: updatedStudents.length,
    message: `End Term completed successfully! ${students.length} student records were archived to local snapshots and synced to Firebase Cloud Firestore for the new term.`,
    backupConfirmed: true,
    resetConfirmed: true,
    updatedStudents,
  };
}
