/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { SchoolProfile, SchoolFeeSchedule, AdditionalFeeItem, StudentPaymentRecord, StudentAdditionalFee } from '../types';
import { safeStorage } from './safeStorage';
import { saveSchoolProfileToFirestore, deleteSchoolFromFirestore } from './firebase';
import { calculateBalance, calculateStatus, deriveFeeBreakdown, isLessonDisabled } from './calculations';

export const STORAGE_SCHOOLS_KEY = 'DOMINION_BURSAR_SCHOOLS_PROFILES_V3';
export const STORAGE_ACTIVE_SCHOOL_ID_KEY = 'DOMINION_BURSAR_ACTIVE_SCHOOL_ID_V3';

// Legacy keys for seamless migration
const LEGACY_STORAGE_SCHOOLS_KEY_V2 = 'EMINENT_BURSAR_SCHOOLS_PROFILES_V2';
const LEGACY_STORAGE_ACTIVE_SCHOOL_ID_KEY_V2 = 'EMINENT_BURSAR_ACTIVE_SCHOOL_ID_V2';
const LEGACY_STORAGE_SCHOOLS_KEY = 'DGOS_BURSAR_SCHOOLS_PROFILES_V1';
const LEGACY_STORAGE_ACTIVE_SCHOOL_ID_KEY = 'DGOS_BURSAR_ACTIVE_SCHOOL_ID_V1';

export const DEFAULT_DOMINION_CLASSES = [
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
];

export const DEFAULT_EMINENT_CLASSES = DEFAULT_DOMINION_CLASSES;

export const DEFAULT_PRIMARY_CLASSES = [
  'Kg1',
  'Kg2',
  'Nur1',
  'Nur2',
  'Pri1',
  'Pri2',
  'Pri3',
  'Pri4',
  'Pri5',
];

export const DEFAULT_SECONDARY_CLASSES = [
  'Jss1',
  'Jss2',
  'Jss3',
  'Ss1',
  'Ss2',
  'Ss3',
];

export const DEFAULT_PRIMARY_FEES: SchoolFeeSchedule = {
  tuitionFee: 15000,
  admissionFee: 5000,
  examFee: 1500,
  lessonFeeMonthly: 2500,
  lessonFeeTermly: 7000,
};

export const DEFAULT_SECONDARY_FEES: SchoolFeeSchedule = {
  tuitionFee: 15000,
  admissionFee: 5000,
  examFee: 1500,
  lessonFeeMonthly: 3000,
  lessonFeeTermly: 8000,
};

export const DEFAULT_COMPREHENSIVE_FEES: SchoolFeeSchedule = {
  tuitionFee: 15000,
  admissionFee: 5000,
  examFee: 1500,
  lessonFeeMonthly: 2500,
  lessonFeeTermly: 7000,
};

export const INITIAL_SCHOOLS: SchoolProfile[] = [
  {
    id: 'dominion-group',
    name: 'Dominion Group Of Schools',
    type: 'combined',
    currencySymbol: '₦',
    feeSchedule: { ...DEFAULT_COMPREHENSIVE_FEES },
    classes: [...DEFAULT_EMINENT_CLASSES],
    createdAt: '2026-08-01',
  },
];

/**
 * Loads stored school or initializes Dominion Group Of Schools (Combined Kg1 - Ss3)
 */
export function getStoredSchools(): SchoolProfile[] {
  try {
    const raw = safeStorage.getItem(STORAGE_SCHOOLS_KEY) || safeStorage.getItem(LEGACY_STORAGE_SCHOOLS_KEY_V2);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        let hasChanges = false;
        const mapped = parsed.map((s: SchoolProfile) => {
          const name = s.name && s.name.includes('Eminent') ? 'Dominion Group Of Schools' : (s.name || 'Dominion Group Of Schools');
          const id = (!s.id || s.id === 'eminent-academy' || s.id === 'dominion-group') ? 'dominion-group' : s.id;
          if (id !== s.id || name !== s.name) hasChanges = true;
          return {
            ...s,
            id,
            name,
            currencySymbol: s.currencySymbol || '₦',
            classes: Array.isArray(s.classes) && s.classes.length > 0 ? s.classes : DEFAULT_EMINENT_CLASSES,
            feeSchedule: s.feeSchedule || DEFAULT_COMPREHENSIVE_FEES,
            classFeeSchedules: s.classFeeSchedules || undefined,
            additionalFees: Array.isArray(s.additionalFees) ? s.additionalFees : [],
          };
        });
        if (hasChanges) {
          saveStoredSchools(mapped);
        }
        return mapped;
      }
    }
  } catch (e) {
    console.error('Error loading stored schools:', e);
  }

  // First time initialization
  const initial: SchoolProfile[] = [
    {
      ...INITIAL_SCHOOLS[0],
    },
  ];

  saveStoredSchools(initial);
  return initial;
}

/**
 * Saves schools list to persistent storage
 */
export function saveStoredSchools(schools: SchoolProfile[]): void {
  try {
    safeStorage.setItem(STORAGE_SCHOOLS_KEY, JSON.stringify(schools));
  } catch (e) {
    console.error('Error saving schools:', e);
  }
}

/**
 * Gets currently selected active school ID
 */
export function getActiveSchoolId(): string {
  try {
    if (typeof window !== 'undefined' && window.location?.search) {
      const params = new URLSearchParams(window.location.search);
      const schoolParam = params.get('school');
      if (schoolParam) {
        const clean = (schoolParam === 'eminent-academy' || schoolParam === 'dominion-group') ? 'dominion-group' : schoolParam;
        safeStorage.setItem(STORAGE_ACTIVE_SCHOOL_ID_KEY, clean);
        return clean;
      }
    }
    const id = safeStorage.getItem(STORAGE_ACTIVE_SCHOOL_ID_KEY) || safeStorage.getItem(LEGACY_STORAGE_ACTIVE_SCHOOL_ID_KEY_V2);
    if (id && id !== 'eminent-academy') return id;
    if (id === 'eminent-academy') {
      safeStorage.setItem(STORAGE_ACTIVE_SCHOOL_ID_KEY, 'dominion-group');
    }
  } catch (e) {}
  return 'dominion-group';
}

/**
 * Gets a direct shareable URL for a specific school profile
 */
export function getSchoolDirectLink(schoolId: string): string {
  try {
    if (typeof window !== 'undefined') {
      const baseUrl = window.location.origin + window.location.pathname;
      return `${baseUrl}?school=${encodeURIComponent(schoolId)}`;
    }
  } catch (e) {}
  return `?school=${encodeURIComponent(schoolId)}`;
}

/**
 * Sets active school ID
 */
export function setActiveSchoolId(id: string): void {
  try {
    safeStorage.setItem(STORAGE_ACTIVE_SCHOOL_ID_KEY, id);
  } catch (e) {
    console.error('Error setting active school ID:', e);
  }
}

/**
 * Gets full active school profile
 */
export function getActiveSchool(): SchoolProfile {
  const schools = getStoredSchools();
  const activeId = getActiveSchoolId();
  const found = schools.find((s) => s.id === activeId);
  return found || schools[0] || INITIAL_SCHOOLS[0];
}

/**
 * Adds a new school profile
 */
export function addSchool(newSchoolData: Omit<SchoolProfile, 'id' | 'createdAt'>): SchoolProfile {
  const schools = getStoredSchools();
  const id = `school-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const newSchool: SchoolProfile = {
    ...newSchoolData,
    id,
    createdAt: new Date().toISOString().split('T')[0],
  };

  const updatedSchools = [...schools, newSchool];
  saveStoredSchools(updatedSchools);
  saveSchoolProfileToFirestore(newSchool).catch(() => {});
  return newSchool;
}

/**
 * Updates an existing school profile
 */
export function updateSchool(id: string, updates: Partial<SchoolProfile>): SchoolProfile {
  const schools = getStoredSchools();
  let updatedSchool: SchoolProfile | null = null;

  const updatedList = schools.map((s) => {
    if (s.id === id) {
      updatedSchool = { ...s, ...updates };
      return updatedSchool;
    }
    return s;
  });

  if (!updatedSchool) {
    throw new Error(`School with ID ${id} not found.`);
  }

  saveStoredSchools(updatedList);
  saveSchoolProfileToFirestore(updatedSchool).catch(() => {});

  return updatedSchool;
}

/**
 * Deletes a school profile (cannot delete if it's the only one left)
 */
export function deleteSchool(id: string): SchoolProfile[] {
  const schools = getStoredSchools();
  if (schools.length <= 1) {
    throw new Error('You must have at least one school profile configured.');
  }

  const updated = schools.filter((s) => s.id !== id);
  saveStoredSchools(updated);
  deleteSchoolFromFirestore(id).catch((err) => {
    console.warn('[Firestore] Delete school note:', err);
  });

  if (getActiveSchoolId() === id) {
    setActiveSchoolId(updated[0].id);
  }

  return updated;
}

/**
 * Updates both base and class-specific fee schedules on a school profile
 */
export function updateSchoolFeeSchedule(
  id: string,
  feeSchedule: SchoolFeeSchedule,
  classFeeSchedules?: Record<string, SchoolFeeSchedule>
): SchoolProfile {
  return updateSchool(id, {
    feeSchedule,
    classFeeSchedules: classFeeSchedules && Object.keys(classFeeSchedules).length > 0 ? classFeeSchedules : undefined,
  });
}

/**
 * Retrieves all additional / ancillary fees configured on a school profile
 */
export function getSchoolAdditionalFees(schoolOrId: SchoolProfile | string): AdditionalFeeItem[] {
  if (!schoolOrId) return [];
  if (typeof schoolOrId === 'string') {
    const schools = getStoredSchools();
    const found = schools.find((s) => s.id === schoolOrId);
    return Array.isArray(found?.additionalFees) ? found!.additionalFees : [];
  }
  return Array.isArray(schoolOrId.additionalFees) ? schoolOrId.additionalFees : [];
}

/**
 * Determines whether a specific additional fee applies to a student's class and term
 */
export function isAdditionalFeeApplicable(
  fee: AdditionalFeeItem,
  studentClass?: string,
  studentTerm?: string
): boolean {
  if (!fee || !fee.name) return false;
  // If explicitly disabled, it is not charged to any student
  if (fee.enabled === false) return false;

  // Class Matching: 'all' applies to every class in the school
  const target = (fee.targetClass || '').trim().toLowerCase();
  if (target && target !== 'all' && target !== 'all classes' && target !== 'school-wide') {
    const sClass = (studentClass || '').trim().toLowerCase();
    const cleanTarget = target.replace(/[^a-z0-9]/g, '');
    const cleanClass = sClass.replace(/[^a-z0-9]/g, '');
    if (cleanTarget !== cleanClass) {
      return false;
    }
  }

  // Term Matching: 'all' or undefined applies across all terms
  const feeTerm = (fee.term || '').trim().toLowerCase();
  if (feeTerm && feeTerm !== 'all' && feeTerm !== 'all terms') {
    const sTerm = (studentTerm || '').trim().toLowerCase();
    if (sTerm && !sTerm.includes(feeTerm) && !feeTerm.includes(sTerm)) {
      return false;
    }
  }

  return true;
}

/**
 * Returns all additional fees that apply to a given class (and optional term)
 */
export function getApplicableAdditionalFees(
  school: SchoolProfile,
  studentClass?: string,
  studentTerm?: string
): AdditionalFeeItem[] {
  const allFees = getSchoolAdditionalFees(school);
  return allFees.filter((f) => isAdditionalFeeApplicable(f, studentClass, studentTerm));
}

/**
 * Adds a new additional fee to a school profile
 */
export function addAdditionalFeeToSchool(
  schoolId: string,
  feeData: Omit<AdditionalFeeItem, 'id' | 'createdAt'>
): { updatedSchool: SchoolProfile; newFee: AdditionalFeeItem } {
  const schools = getStoredSchools();
  const school = schools.find((s) => s.id === schoolId);
  if (!school) {
    throw new Error(`School with ID ${schoolId} not found.`);
  }

  const existingFees = Array.isArray(school.additionalFees) ? school.additionalFees : [];
  const newFee: AdditionalFeeItem = {
    ...feeData,
    id: `fee_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    name: feeData.name.trim(),
    amount: Math.max(0, Number(feeData.amount) || 0),
    targetClass: feeData.targetClass || 'all',
    term: feeData.term || 'all',
    category: feeData.category || 'levy',
    isCompulsory: feeData.isCompulsory !== false,
    enabled: feeData.enabled !== false,
    createdAt: new Date().toISOString(),
  };

  const updatedFees = [...existingFees, newFee];
  const updatedSchool = updateSchool(schoolId, { additionalFees: updatedFees });

  return { updatedSchool, newFee };
}

/**
 * Updates an existing additional fee on a school profile
 */
export function updateAdditionalFeeInSchool(
  schoolId: string,
  feeId: string,
  updates: Partial<AdditionalFeeItem>
): SchoolProfile {
  const schools = getStoredSchools();
  const school = schools.find((s) => s.id === schoolId);
  if (!school) {
    throw new Error(`School with ID ${schoolId} not found.`);
  }

  const existingFees = Array.isArray(school.additionalFees) ? school.additionalFees : [];
  const updatedFees = existingFees.map((f) => {
    if (f.id !== feeId) return f;
    return {
      ...f,
      ...updates,
      name: updates.name !== undefined ? updates.name.trim() : f.name,
      amount: updates.amount !== undefined ? Math.max(0, Number(updates.amount) || 0) : f.amount,
      targetClass: updates.targetClass !== undefined ? updates.targetClass : f.targetClass,
      term: updates.term !== undefined ? updates.term : f.term,
      enabled: updates.enabled !== undefined ? updates.enabled : (f.enabled !== false),
    };
  });

  return updateSchool(schoolId, { additionalFees: updatedFees });
}

/**
 * Toggles a fee between enabled and disabled
 */
export function toggleAdditionalFeeEnabled(
  schoolId: string,
  feeId: string,
  enabled: boolean
): SchoolProfile {
  return updateAdditionalFeeInSchool(schoolId, feeId, { enabled });
}

/**
 * Deletes an additional fee from a school profile
 */
export function deleteAdditionalFeeFromSchool(
  schoolId: string,
  feeId: string
): SchoolProfile {
  const schools = getStoredSchools();
  const school = schools.find((s) => s.id === schoolId);
  if (!school) {
    throw new Error(`School with ID ${schoolId} not found.`);
  }

  const existingFees = Array.isArray(school.additionalFees) ? school.additionalFees : [];
  const updatedFees = existingFees.filter((f) => f.id !== feeId);

  return updateSchool(schoolId, { additionalFees: updatedFees });
}

/**
 * Overwrites the full list of additional fees on a school profile
 */
export function saveSchoolAdditionalFees(
  schoolId: string,
  additionalFees: AdditionalFeeItem[]
): SchoolProfile {
  return updateSchool(schoolId, { additionalFees });
}

/**
 * Synchronizes school-wide and class-specific additional fees across a list of student records.
 * Recalculates student's itemized additional fees, total fee, balance, and collection status.
 */
export function syncAdditionalFeesToStudents(
  students: StudentPaymentRecord[],
  school: SchoolProfile
): StudentPaymentRecord[] {
  if (!students || !Array.isArray(students)) return [];

  const schoolFees = getSchoolAdditionalFees(school);

  return students.map((st) => {
    const studentClass = st.class;
    const studentTerm = st.term;
    const applicableFees = schoolFees.filter((f) => isAdditionalFeeApplicable(f, studentClass, studentTerm));

    // Preserve existing payments or custom student-specific fees
    const currentStudentFees: StudentAdditionalFee[] = Array.isArray(st.additional_fees)
      ? [...st.additional_fees]
      : [];

    // Map each applicable fee into student's additional_fees
    const updatedStudentFees: StudentAdditionalFee[] = [];

    // First, retain or update applicable school fees
    for (const appFee of applicableFees) {
      const isFeeMatch = (sf: StudentAdditionalFee) =>
        sf.feeId === appFee.id || sf.name.trim().toLowerCase() === appFee.name.trim().toLowerCase();

      const matchingEntries = currentStudentFees.filter(isFeeMatch);
      const totalPaid = matchingEntries.reduce((sum, sf) => sum + (Number(sf.amountPaid) || 0), 0);
      const feeAmount = Math.max(0, Number(appFee.amount) || 0);

      updatedStudentFees.push({
        feeId: appFee.id,
        name: appFee.name,
        amount: feeAmount,
        amountPaid: totalPaid,
        status: feeAmount > 0 ? calculateStatus(feeAmount, totalPaid) : 'fully_paid',
      });
    }

    // Second, handle any fees previously on student that are NOT in applicableFees
    for (const curFee of currentStudentFees) {
      const alreadyHandled = updatedStudentFees.some(
        (uf) => uf.feeId === curFee.feeId || uf.name.trim().toLowerCase() === curFee.name.trim().toLowerCase()
      );
      if (!alreadyHandled) {
        // Check if this matches any school fee (e.g. disabled or meant for another class)
        const matchedSchoolFee = schoolFees.find(
          (sf) => sf.id === curFee.feeId || sf.name.trim().toLowerCase() === curFee.name.trim().toLowerCase()
        );
        const paid = Number(curFee.amountPaid) || 0;
        if (matchedSchoolFee) {
          // If the student hasn't paid anything towards this unapplicable or disabled school fee, drop it
          if (paid <= 0) {
            continue;
          }
          // If the student previously made a payment towards it, keep the paid amount with 0 balance
          updatedStudentFees.push({
            ...curFee,
            amount: paid,
            amountPaid: paid,
            status: 'fully_paid',
          });
        } else if (paid > 0) {
          // Keep custom fee only if payment was recorded
          updatedStudentFees.push({
            ...curFee,
            amount: Math.max(paid, Number(curFee.amount) || 0),
            amountPaid: paid,
            status: calculateStatus(Math.max(paid, Number(curFee.amount) || 0), paid),
          });
        }
      }
    }

    // Sum up totals
    const additionalFeesTotal = updatedStudentFees.reduce((acc, f) => acc + (Number(f.amount) || 0), 0);
    const additionalFeesPaid = updatedStudentFees.reduce((acc, f) => acc + (Number(f.amountPaid) || 0), 0);

    const bd = deriveFeeBreakdown(st, school);
    const tuitionFee = st.is_exempt_from_school_fee
      ? 0
      : (st.tuition_fee !== undefined && st.tuition_fee !== null && Number(st.tuition_fee) > 0
        ? Number(st.tuition_fee)
        : bd.tuitionFee);
    const admissionFee = (st.is_new_admission === true)
      ? (st.admission_fee !== undefined && st.admission_fee !== null ? Number(st.admission_fee) : bd.admissionFee)
      : (st.is_new_admission === false || st.admission_fee === 0)
      ? 0
      : (Number(st.admission_fee) || 0);
    const lessonOptedOut = isLessonDisabled(st);
    const lessonFee = lessonOptedOut
      ? 0
      : (st.lesson_fee !== undefined && st.lesson_fee !== null ? Number(st.lesson_fee) : bd.lessonFee);
    const examFee = st.exam_fee !== undefined && st.exam_fee !== null ? Number(st.exam_fee) : bd.examFee;

    const tuitionPaid = Number(st.tuition_paid) || bd.tuitionPaid || 0;
    const admissionPaid = Number(st.admission_paid) || bd.admissionPaid || 0;
    const lessonPaid = Number(st.lesson_paid) || bd.lessonPaid || 0;
    const examPaid = Number(st.exam_paid) || bd.examPaid || 0;

    const newTotalFee = tuitionFee + admissionFee + lessonFee + examFee + additionalFeesTotal;
    const newTotalPaid = Math.max(
      Number(st.amount_paid) || 0,
      tuitionPaid + admissionPaid + lessonPaid + examPaid + additionalFeesPaid
    );
    const newBalance = calculateBalance(newTotalFee, newTotalPaid);
    const newStatus = calculateStatus(newTotalFee, newTotalPaid);

    return {
      ...st,
      tuition_fee: tuitionFee,
      tuition_status: st.is_exempt_from_school_fee ? 'fully_paid' : calculateStatus(tuitionFee, tuitionPaid),
      admission_fee: admissionFee,
      admission_status: admissionFee > 0 ? calculateStatus(admissionFee, admissionPaid) : 'unpaid',
      lesson_fee: lessonFee,
      lesson_status: lessonOptedOut ? 'fully_paid' : (lessonFee > 0 ? calculateStatus(lessonFee, lessonPaid) : 'unpaid'),
      exam_fee: examFee,
      exam_status: examFee > 0 ? calculateStatus(examFee, examPaid) : 'unpaid',
      additional_fees: updatedStudentFees,
      fee_amount: newTotalFee,
      amount_paid: newTotalPaid,
      balance: newBalance,
      status: newStatus,
    };
  });
}


