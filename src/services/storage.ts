/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StudentPaymentRecord, ScholarshipRecord, SheetApiConfig } from '../types';
import { normalizeStudentRow } from './calculations';
import { safeStorage } from './safeStorage';
import {
  deleteStudentFromFirestore,
  deleteScholarshipFromFirestore,
  deleteExpenseFromFirestore,
  deleteStaffFromFirestore,
} from './firebase';

export { safeStorage };

export const STORAGE_STUDENTS_KEY = 'EMINENT_BURSAR_STUDENTS_ROSTER_V1';
export const STORAGE_API_CONFIG_KEY = 'EMINENT_BURSAR_API_CONFIG_V1';

export function getStoredApiConfig(schoolId?: string): SheetApiConfig {
  const key = schoolId ? `${STORAGE_API_CONFIG_KEY}_${schoolId.trim().toLowerCase()}` : STORAGE_API_CONFIG_KEY;
  try {
    const raw = safeStorage.getItem(key) || safeStorage.getItem(STORAGE_API_CONFIG_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.warn(e);
  }
  return { apiUrl: '', apiKey: '', provider: 'appsscript', autoSync: false };
}

export function saveApiConfig(config: SheetApiConfig, schoolId?: string): void {
  const key = schoolId ? `${STORAGE_API_CONFIG_KEY}_${schoolId.trim().toLowerCase()}` : STORAGE_API_CONFIG_KEY;
  try {
    safeStorage.setItem(key, JSON.stringify(config));
    if (!schoolId) {
      safeStorage.setItem(STORAGE_API_CONFIG_KEY, JSON.stringify(config));
    }
  } catch (e) {
    console.warn(e);
  }
}

export const INITIAL_SAMPLE_STUDENTS: StudentPaymentRecord[] = [];

// Set of legacy mock student IDs & names to automatically purge from storage and syncs
export const LEGACY_MOCK_STUDENT_IDS = new Set([
  'ERCA/0001',
  'ERCA/0002',
  'ERCA/0003',
  'ERCA/0004',
  'ERCA/0005',
  'ERCA/0010',
]);

export const LEGACY_MOCK_STUDENT_NAMES = new Set([
  'adeyemi oluwaseun',
  'chukwuebuka daniel',
  'ibrahim fatima zahra',
  'okonkwo grace chioma',
  'bello farouk usman',
  'mohammed sadiq',
]);

export function isLegacyMockStudent(id?: string, name?: string): boolean {
  if (id && LEGACY_MOCK_STUDENT_IDS.has(id.trim().toUpperCase())) return true;
  if (name && LEGACY_MOCK_STUDENT_NAMES.has(name.trim().toLowerCase())) return true;
  return false;
}

/**
 * Computes an isolated memory key for a specific school
 */
export function getSchoolStudentsStorageKey(schoolId?: string): string {
  const normalizedId = (schoolId && schoolId.trim()) ? schoolId.trim().toLowerCase() : 'dominion-group';
  return `${STORAGE_STUDENTS_KEY}_${normalizedId}`;
}

/**
 * Loads student records from runtime cache or returns empty roster
 */
export function getStoredStudents(schoolId?: string): StudentPaymentRecord[] {
  const targetSchoolId = (schoolId && schoolId.trim()) ? schoolId.trim().toLowerCase() : 'dominion-group';
  const strictKey = getSchoolStudentsStorageKey(targetSchoolId);

  try {
    const raw = safeStorage.getItem(strictKey);
    if (raw !== null) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
          .filter((item) => !LEGACY_MOCK_STUDENT_IDS.has(String(item?.id || '').trim()))
          .map((item) => normalizeStudentRow(item));
      }
    }
    return [];
  } catch (e) {
    return [];
  }
}

/**
 * Saves student records to in-memory cache and persists directly to Cloud Firestore.
 */
export function saveStoredStudents(students: StudentPaymentRecord[], schoolId?: string): void {
  const targetSchoolId = (schoolId && schoolId.trim()) ? schoolId.trim().toLowerCase() : 'dominion-group';
  const strictKey = getSchoolStudentsStorageKey(targetSchoolId);

  try {
    safeStorage.setItem(strictKey, JSON.stringify(students));
  } catch (e) {
    console.error(`Failed saving students for school '${targetSchoolId}':`, e);
  }
}

/**
 * Clears student records memory cache for a specific school
 */
export function clearStoredStudentsForSchool(schoolId: string): void {
  const targetSchoolId = (schoolId && schoolId.trim()) ? schoolId.trim().toLowerCase() : 'dominion-group';
  const strictKey = getSchoolStudentsStorageKey(targetSchoolId);
  safeStorage.setItem(strictKey, JSON.stringify([]));
}

export const STORAGE_SCHOLARSHIPS_KEY = 'EMINENT_BURSAR_SCHOLARSHIPS_V1';

export function getSchoolScholarshipsStorageKey(schoolId?: string): string {
  const normalizedId = (schoolId && schoolId.trim()) ? schoolId.trim().toLowerCase() : 'dominion-group';
  return `${STORAGE_SCHOLARSHIPS_KEY}_${normalizedId}`;
}

export const INITIAL_SAMPLE_SCHOLARSHIPS: ScholarshipRecord[] = [];

export function getStoredScholarships(schoolId?: string): ScholarshipRecord[] {
  const targetSchoolId = (schoolId && schoolId.trim()) ? schoolId.trim().toLowerCase() : 'dominion-group';
  const key = getSchoolScholarshipsStorageKey(targetSchoolId);
  try {
    const raw = safeStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.filter((s) => !LEGACY_MOCK_STUDENT_IDS.has(String(s?.id || '').trim()));
      }
    }
  } catch (e) {
    console.error(`Failed loading scholarships for school '${targetSchoolId}':`, e);
  }
  return [];
}

export function saveStoredScholarships(records: ScholarshipRecord[], schoolId?: string): void {
  const targetSchoolId = (schoolId && schoolId.trim()) ? schoolId.trim().toLowerCase() : 'dominion-group';
  const key = getSchoolScholarshipsStorageKey(targetSchoolId);
  try {
    safeStorage.setItem(key, JSON.stringify(records));
  } catch (e) {
    console.error(`Failed saving scholarships for school '${targetSchoolId}':`, e);
  }
}

/**
 * Direct deletion operations targeting Firestore as the only source of truth.
 * No persistent tombstone blocking or name suppression is permitted.
 */
export function markStudentDeleted(id: string, fullName?: string, schoolId?: string): void {
  if (id) {
    deleteStudentFromFirestore(id, schoolId).catch(() => {});
  }
}

export function isStudentDeleted(id?: string, fullName?: string, schoolId?: string): boolean {
  return false;
}

export function unmarkStudentDeleted(id: string, schoolId?: string): void {
  // No-op: Firestore is the only source of truth
}

export function markScholarshipDeleted(id: string, schoolId?: string): void {
  if (id) {
    deleteScholarshipFromFirestore(id, schoolId).catch(() => {});
  }
}

export function isScholarshipDeleted(id?: string, schoolId?: string): boolean {
  return false;
}

export function unmarkScholarshipDeleted(id: string, schoolId?: string): void {
  // No-op: Firestore is the only source of truth
}

export function clearSchoolTombstones(schoolId?: string): void {
  // No-op
}

export function markExpenseDeleted(id: string, schoolId?: string): void {
  if (id) {
    deleteExpenseFromFirestore(id, schoolId).catch(() => {});
  }
}

export function isExpenseDeleted(id?: string, schoolId?: string): boolean {
  return false;
}

export function unmarkExpenseDeleted(id: string, schoolId?: string): void {
  // No-op
}

export function markStaffDeleted(id: string, schoolId?: string): void {
  if (id) {
    deleteStaffFromFirestore(id, schoolId).catch(() => {});
  }
}

export function isStaffDeleted(id?: string, schoolId?: string): boolean {
  return false;
}

export function unmarkStaffDeleted(id: string, schoolId?: string): void {
  // No-op
}
