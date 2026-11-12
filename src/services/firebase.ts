/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { initializeApp, getApps, FirebaseApp 
} from 'firebase/app';
import {
  getFirestore,
  Firestore,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  deleteDoc,
  collection,
  getDocs,
  onSnapshot,
  writeBatch,
  runTransaction,
  query,
  orderBy,
  limit,
  Unsubscribe
} from 'firebase/firestore';
import {
  getAuth,
  Auth,
  signInWithPopup,
  GoogleAuthProvider,
  signOut,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  updateProfile,
  signInAnonymously,
  User,
} from 'firebase/auth';
import {
  StudentPaymentRecord,
  ScholarshipRecord,
  ExpenseItem,
  ExtraIncomeItem,
  StaffMember,
  PayrollRecord,
  SchoolProfile,
  AcademicTermSchedule,
  RemittanceRecord,
  AppBrandingConfig,
  AuditLogEntry,
} from '../types';
import defaultFirebaseConfig from '../../firebase-applet-config.json';
import { safeStorage } from './safeStorage';
import { markPendingSync, clearPendingSync, PendingKind } from './pendingSync';
import { getActiveFirebaseConfig, FirebaseDeploymentConfig } from './customFirebaseService';

let app: FirebaseApp | null = null;
let firestoreInstance: Firestore | null = null;
let authInstance: Auth | null = null;
let isFirestoreInitialized = false;

/**
 * Resets cached Firebase instances and reconnects with the current active config
 */
export function reinitializeFirebase(): { app: FirebaseApp; db: Firestore | null; auth: Auth } {
  app = null;
  firestoreInstance = null;
  authInstance = null;
  isFirestoreInitialized = false;

  const newApp = getFirebaseApp();
  const newDb = getFirebaseDb();
  const newAuth = getFirebaseAuth();

  return { app: newApp, db: newDb, auth: newAuth };
}

/**
 * Operation types conforming strictly to Firebase Integration skill specifications
 */
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

/**
 * Standardized structured error object conforming to FirestoreErrorInfo
 */
export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

/**
 * Structured Firestore error handler per the Firebase Integration Skill guidelines
 */
export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const currentAuth = getFirebaseAuth();
  const currentUser = currentAuth?.currentUser;

  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path,
    authInfo: {
      userId: currentUser?.uid || null,
      email: currentUser?.email || null,
      emailVerified: currentUser?.emailVerified || null,
      isAnonymous: currentUser?.isAnonymous || null,
      tenantId: currentUser?.tenantId || null,
      providerInfo:
        currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
  };

  const isQuota =
    errInfo.error.toLowerCase().includes('quota') ||
    errInfo.error.toLowerCase().includes('resource-exhausted');
  if (isQuota) {
    recordFirebaseSyncError('Firestore free daily quota exceeded. Operating in local cache mode.');
  }

  const isOffline =
    errInfo.error.toLowerCase().includes('offline') ||
    errInfo.error.toLowerCase().includes('unavailable') ||
    (error as any)?.code === 'unavailable';
  if (isOffline) {
    console.warn('[Firestore Offline Note]', JSON.stringify(errInfo));
    throw new Error(JSON.stringify(errInfo));
  }

  const activeConfig = getActiveFirebaseConfig();
  const isPermissionError =
    errInfo.error.toLowerCase().includes('missing or insufficient permissions') ||
    errInfo.error.toLowerCase().includes('permission-denied') ||
    (error as any)?.code === 'permission-denied';

  if (isPermissionError && activeConfig.isCustom) {
    recordFirebaseSyncError(
      `Custom Firebase project "${activeConfig.projectId}" denied access. Please update your Firestore Security Rules in Firebase Console or reset to the default database in Settings.`
    );
    console.warn('[Custom Firestore Permission Note]', JSON.stringify(errInfo));
    throw new Error(JSON.stringify(errInfo));
  }

  console.error('[Firestore Error Details]', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Initialize and get Firebase App singleton
 */
export function getFirebaseApp(): FirebaseApp {
  if (!app) {
    const config = getActiveFirebaseConfig();
    const existingApps = getApps();
    const existing = existingApps.find((a) => a.options.projectId === config.projectId);
    if (existing) {
      app = existing;
    } else {
      app = initializeApp(
        {
          apiKey: config.apiKey,
          authDomain: config.authDomain,
          projectId: config.projectId,
          storageBucket: config.storageBucket,
          messagingSenderId: config.messagingSenderId,
          appId: config.appId,
        },
        config.isCustom ? `school-${config.projectId}` : undefined
      );
    }
  }
  return app;
}

/**
 * Initialize and get Firebase Auth instance
 */
export function getFirebaseAuth(): Auth {
  if (!authInstance) {
    const firebaseApp = getFirebaseApp();
    authInstance = getAuth(firebaseApp);
    // Automatically establish auth session so security rules pass for active app
    if (typeof window !== 'undefined') {
      onAuthStateChanged(authInstance, (user) => {
        if (!user) {
          signInAnonymously(authInstance!).catch(() => {
            // Harmless fallback if anonymous provider is not toggled in console
          });
        }
      });
    }
  }
  return authInstance;
}

export const auth = getFirebaseAuth();

/**
 * Initializes Firebase App and Firestore with robust default client transport
 */
export function getFirebaseDb(): Firestore | null {
  if (firestoreInstance) return firestoreInstance;

  try {
    const firebaseApp = getFirebaseApp();
    const config = getActiveFirebaseConfig();
    const databaseId = config.firestoreDatabaseId || '(default)';

    firestoreInstance = getFirestore(firebaseApp, databaseId);
    isFirestoreInitialized = true;
    return firestoreInstance;
  } catch (err) {
    console.error('[Firebase Init Error] Failed to initialize Firestore:', err);
    return null;
  }
}

export const db = getFirebaseDb();

/**
 * Validates connection to Cloud Firestore upon initial boot with timeout and offline cache resilience
 */
export async function testConnection(): Promise<{ success: boolean; latencyMs: number; message: string }> {
  const firestore = getFirebaseDb();
  if (!firestore) {
    return { success: false, latencyMs: 0, message: 'Firestore is not initialized.' };
  }

  const start = Date.now();
  try {
    const testDocRef = doc(firestore, 'test', 'connection');
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Connection check timed out - operating in offline cache mode')), 4000);
    });

    await Promise.race([
      getDocFromServer(testDocRef),
      timeoutPromise,
    ]);
    const latencyMs = Date.now() - start;
    recordFirebaseSyncSuccess();
    return {
      success: true,
      latencyMs,
      message: `Cloud Firestore ready (${latencyMs}ms ping)`,
    };
  } catch (error: any) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
    const latencyMs = Date.now() - start;
    const msg = error instanceof Error ? error.message : String(error);
    const isOffline = msg.includes('offline') || msg.includes('unavailable') || msg.includes('timed out');
    if (isOffline) {
      console.info('[Firebase] Operating in persistent offline cache mode. Local records are active and will sync when backend is reachable.');
    }
    return {
      success: false,
      latencyMs,
      message: isOffline ? 'Operating in offline cache mode (local sync active)' : msg,
    };
  }
}

/**
 * Helper to clean undefined values before saving to Firestore
 */
export function sanitizeForFirestore<T extends Record<string, any>>(obj: T): T {
  return sanitizeValue(obj) as T;
}

// Firestore rejects `undefined` anywhere in a document, including inside arrays of objects
// (for example payment_history receipts). Object keys holding undefined are dropped; array
// entries that are undefined become null so positions are kept.
function sanitizeValue(value: any): any {
  if (value === undefined) return undefined;
  if (Array.isArray(value)) {
    return value.map((item) => {
      const cleaned = sanitizeValue(item);
      return cleaned === undefined ? null : cleaned;
    });
  }
  if (value !== null && typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    // Leave Dates, Timestamps, FieldValues and other class instances untouched
    if (proto !== Object.prototype && proto !== null) return value;
    const clean: any = {};
    for (const [key, v] of Object.entries(value)) {
      const cleaned = sanitizeValue(v);
      if (cleaned !== undefined) clean[key] = cleaned;
    }
    return clean;
  }
  return value;
}

/**
 * Sanitize Firestore document IDs (no forward slashes, spaces trimmed)
 */
export function sanitizeDocId(id: string): string {
  if (!id) return `ID_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  return encodeURIComponent(id.trim().replace(/\//g, '__slash__'));
}

export function desanitizeDocId(docId: string): string {
  if (!docId) return '';
  return decodeURIComponent(docId).replace(/__slash__/g, '/');
}

/**
 * ============================================================================
 * AUTHENTICATION SERVICES (Secure Staff Access)
 * ============================================================================
 */

export async function signInWithEmail(email: string, pass: string): Promise<User> {
  const authObj = getFirebaseAuth();
  try {
    const cred = await signInWithEmailAndPassword(authObj, email.trim(), pass);
    return cred.user;
  } catch (err: any) {
    console.error('[Firebase Auth Error] Email sign-in failed:', err);
    throw err;
  }
}

export async function signUpWithEmail(email: string, pass: string, displayName?: string): Promise<User> {
  const authObj = getFirebaseAuth();
  try {
    const cred = await createUserWithEmailAndPassword(authObj, email.trim(), pass);
    if (displayName && displayName.trim()) {
      await updateProfile(cred.user, { displayName: displayName.trim() });
    }
    return cred.user;
  } catch (err: any) {
    console.error('[Firebase Auth Error] Staff registration failed:', err);
    throw err;
  }
}

export async function sendPasswordReset(email: string): Promise<void> {
  const authObj = getFirebaseAuth();
  try {
    await sendPasswordResetEmail(authObj, email.trim());
  } catch (err: any) {
    console.error('[Firebase Auth Error] Password reset failed:', err);
    throw err;
  }
}

export async function signInWithGoogle(): Promise<User | null> {
  const authObj = getFirebaseAuth();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    const result = await signInWithPopup(authObj, provider);
    return result.user;
  } catch (err: any) {
    console.error('[Firebase Auth Error] Google Sign-in failed:', err);
    throw err;
  }
}

export async function signOutFirebase(): Promise<void> {
  const authObj = getFirebaseAuth();
  try {
    await signOut(authObj);
  } catch (err) {
    console.error('[Firebase Auth Error] Sign out failed:', err);
    throw err;
  }
}

export function subscribeAuthState(callback: (user: User | null) => void): Unsubscribe {
  const authObj = getFirebaseAuth();
  return onAuthStateChanged(authObj, callback);
}

export function getCurrentFirebaseUser(): User | null {
  const authObj = getFirebaseAuth();
  return authObj.currentUser;
}

/**
 * ============================================================================
 * STUDENTS FIRESTORE REPOSITORY
 * ============================================================================
 */

let lastFirestoreWriteError: string | null = null;

export function getLastFirestoreWriteError(): string | null {
  return lastFirestoreWriteError;
}

export async function saveStudentToFirestore(
  student: StudentPaymentRecord,
  schoolId: string = 'dominion-group'
): Promise<boolean> {
  const firestore = getFirebaseDb();
  if (!firestore) {
    lastFirestoreWriteError = 'Firestore database is not initialized or offline';
    return false;
  }
  if (!student.id) {
    lastFirestoreWriteError = 'Student record is missing an ID';
    return false;
  }

  const targetPath = `schools/${schoolId.toLowerCase()}/students/${sanitizeDocId(student.id)}`;
  try {
    const docId = sanitizeDocId(student.id);
    const docRef = doc(firestore, 'schools', schoolId.toLowerCase(), 'students', docId);
    const cleanData = sanitizeForFirestore({
      ...student,
      updatedAt: new Date().toISOString(),
    });
    await setDoc(docRef, cleanData, { merge: true });
    recordFirebaseSyncSuccess();
    lastFirestoreWriteError = null;
    return true;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    lastFirestoreWriteError = errorMsg;
    console.warn('[Firestore] Error saving student:', student.id, err);
    recordFirebaseSyncError(errorMsg);
    try {
      handleFirestoreError(err, OperationType.WRITE, targetPath);
    } catch {
      return false;
    }
    return false;
  }
}

export const PAYMENT_SAVE_TIMEOUT_MS = 30000;

/**
 * Saves a payment safely. Inside one Firestore transaction it reads the latest
 * student document, merges it over the local copy, applies the payment to that
 * fresh copy and writes it. Two devices can no longer overwrite each other.
 * Gives up after 30 seconds with a clear message so the screen never waits forever.
 */
export async function savePaymentTransaction<T>(
  localStudent: StudentPaymentRecord,
  applyPayment: (fresh: StudentPaymentRecord) => { updatedRecord: StudentPaymentRecord } & T,
  schoolId: string = 'dominion-group'
): Promise<{ updatedRecord: StudentPaymentRecord } & T> {
  const firestore = getFirebaseDb();
  if (!firestore) {
    throw new Error('The database is not connected. Check your internet and try again.');
  }
  if (!localStudent.id) {
    throw new Error('Student record is missing an ID.');
  }
  const school = schoolId.toLowerCase();
  const docRef = doc(firestore, 'schools', school, 'students', sanitizeDocId(localStudent.id));

  const work = runTransaction(firestore, async (tx): Promise<{ updatedRecord: StudentPaymentRecord } & T> => {
    const snap = await tx.get(docRef);
    const fresh: StudentPaymentRecord = snap.exists()
      ? ({ ...localStudent, ...(snap.data() as Partial<StudentPaymentRecord>), id: localStudent.id } as StudentPaymentRecord)
      : localStudent;
    const result = applyPayment(fresh);
    const cleanData = sanitizeForFirestore({
      ...result.updatedRecord,
      updatedAt: new Date().toISOString(),
    });
    tx.set(docRef, cleanData, { merge: true });
    return result;
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new Error('Payment was not saved. The connection timed out after 30 seconds. Check your internet and try again.')),
      PAYMENT_SAVE_TIMEOUT_MS
    );
  });

  try {
    const result = await Promise.race([work, timeout]);
    recordFirebaseSyncSuccess();
    lastFirestoreWriteError = null;
    return result;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    lastFirestoreWriteError = msg;
    recordFirebaseSyncError(msg);
    // If the timeout won, a late success from the transaction is harmless: the next live snapshot corrects the screen.
    work.catch((): void => {});
    throw err instanceof Error ? err : new Error(msg);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export interface MassUploadResult {
  success: boolean;
  totalProcessed: number;
  insertedCount: number;
  updatedCount: number;
  durationMs: number;
  error?: string;
}

export async function batchSaveStudentsToFirestore(
  students: StudentPaymentRecord[],
  schoolId: string = 'dominion-group',
  onProgress?: (processed: number, total: number) => void
): Promise<boolean> {
  const firestore = getFirebaseDb();
  if (!firestore || students.length === 0) return false;

  const targetPath = `schools/${schoolId.toLowerCase()}/students`;
  try {
    const targetSchool = schoolId.toLowerCase();
    const CHUNK_SIZE = 450;
    let processed = 0;

    for (let i = 0; i < students.length; i += CHUNK_SIZE) {
      const chunk = students.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(firestore);
      const now = new Date().toISOString();

      chunk.forEach((st) => {
        if (!st.id) return;
        const docId = sanitizeDocId(st.id);
        const docRef = doc(firestore, 'schools', targetSchool, 'students', docId);
        const cleanData = sanitizeForFirestore({
          ...st,
          syncedToCloudAt: now,
        });
        batch.set(docRef, cleanData, { merge: true });
      });

      await batch.commit();
      processed += chunk.length;
      if (onProgress) {
        onProgress(Math.min(processed, students.length), students.length);
      }
    }
    recordFirebaseSyncSuccess();
    return true;
  } catch (err) {
    console.warn('[Firestore] Error batch saving students:', err);
    try {
      handleFirestoreError(err, OperationType.WRITE, targetPath);
    } catch {
      return false;
    }
    return false;
  }
}

export interface StudentClassReassignmentResult {
  success: boolean;
  movedStudents: StudentPaymentRecord[];
  firestoreStudentIds: string[];
  error?: string;
}

export async function reassignStudentsInFirestore(
  fromClass: string,
  toClass: string,
  schoolId: string = 'dominion-group'
): Promise<StudentClassReassignmentResult> {
  const firestore = getFirebaseDb();
  if (!firestore) {
    return { success: false, movedStudents: [], firestoreStudentIds: [], error: 'Firestore is not initialized or is offline.' };
  }

  const sourceClass = fromClass.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  const destinationClass = toClass.trim().replace(/\s+/g, ' ');
  if (!sourceClass || !destinationClass || sourceClass === destinationClass) {
    return { success: false, movedStudents: [], firestoreStudentIds: [], error: 'Choose two different, valid class names.' };
  }

  const targetSchool = schoolId.toLowerCase();
  const targetPath = `schools/${targetSchool}/students`;

  try {
    let readTimeout: ReturnType<typeof setTimeout> | undefined;
    const snapshot = await Promise.race([
      getDocs(collection(firestore, 'schools', targetSchool, 'students')),
      new Promise<never>((_, reject) => {
        readTimeout = setTimeout(() => reject(new Error('Firestore roster check timed out.')), 15000);
      }),
    ]).finally(() => {
      if (readTimeout) clearTimeout(readTimeout);
    });

    const records = snapshot.docs.map((docSnap) => ({
      ref: docSnap.ref,
      student: { ...(docSnap.data() as StudentPaymentRecord), id: String(docSnap.data().id || desanitizeDocId(docSnap.id)) },
    }));
    const firestoreStudentIds = records.map(({ student }) => student.id).filter(Boolean);
    const affected = records.filter(({ student }) =>
      String(student.class || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase() === sourceClass
    );

    for (let offset = 0; offset < affected.length; offset += 450) {
      const batch = writeBatch(firestore);
      const now = new Date().toISOString();
      affected.slice(offset, offset + 450).forEach(({ ref }) => {
        batch.update(ref, { class: destinationClass, updatedAt: now, syncedToCloudAt: now });
      });
      await batch.commit();
    }

    lastFirestoreWriteError = null;
    recordFirebaseSyncSuccess();
    return {
      success: true,
      firestoreStudentIds,
      movedStudents: affected.map(({ student }) => ({ ...student, class: destinationClass })),
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    lastFirestoreWriteError = error;
    try {
      handleFirestoreError(err, OperationType.WRITE, targetPath);
    } catch {
      // The failed result is returned to the caller so it can keep the source class configured.
    }
    return { success: false, movedStudents: [], firestoreStudentIds: [], error };
  }
}

export async function bulkUploadStudentsToFirestore(
  newStudents: StudentPaymentRecord[],
  schoolId: string = 'dominion-group',
  mode: 'merge' | 'replace' = 'merge',
  onProgress?: (processed: number, total: number, message: string) => void
): Promise<MassUploadResult> {
  const startTime = Date.now();
  const firestore = getFirebaseDb();
  if (!firestore) {
    return {
      success: false,
      totalProcessed: 0,
      insertedCount: 0,
      updatedCount: 0,
      durationMs: 0,
      error: 'Firebase database is not connected.',
    };
  }

  const targetPath = `schools/${schoolId.toLowerCase()}/students`;
  try {
    const targetSchool = schoolId.toLowerCase();

    if (onProgress) onProgress(0, newStudents.length, 'Checking existing cloud student documents...');
    const existingSnap = await getStudentsFromFirestore(targetSchool);
    const existingIdSet = new Set(existingSnap.map((s) => s.id.toLowerCase().trim()));

    let insertedCount = 0;
    let updatedCount = 0;

    newStudents.forEach((st) => {
      if (existingIdSet.has(st.id.toLowerCase().trim())) {
        updatedCount++;
      } else {
        insertedCount++;
      }
    });

    const CHUNK_SIZE = 450;
    let processed = 0;

    for (let i = 0; i < newStudents.length; i += CHUNK_SIZE) {
      const chunk = newStudents.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(firestore);
      const now = new Date().toISOString();

      chunk.forEach((st) => {
        if (!st.id) return;
        const docId = sanitizeDocId(st.id);
        const docRef = doc(firestore, 'schools', targetSchool, 'students', docId);
        const cleanData = sanitizeForFirestore({
          ...st,
          syncedToCloudAt: now,
          cloudUploadBatchId: `mass_upload_${startTime}`,
        });
        batch.set(docRef, cleanData, { merge: true });
      });

      if (onProgress) {
        onProgress(
          processed,
          newStudents.length,
          `Writing batch ${Math.floor(i / CHUNK_SIZE) + 1} of ${Math.ceil(newStudents.length / CHUNK_SIZE)} to Cloud Firestore...`
        );
      }

      await batch.commit();
      processed += chunk.length;

      if (onProgress) {
        onProgress(
          Math.min(processed, newStudents.length),
          newStudents.length,
          `Uploaded ${Math.min(processed, newStudents.length)} / ${newStudents.length} records...`
        );
      }
    }

    recordFirebaseSyncSuccess();

    return {
      success: true,
      totalProcessed: newStudents.length,
      insertedCount,
      updatedCount,
      durationMs: Date.now() - startTime,
    };
  } catch (err: any) {
    console.error('[Firestore] Bulk upload failed:', err);
    return {
      success: false,
      totalProcessed: 0,
      insertedCount: 0,
      updatedCount: 0,
      durationMs: Date.now() - startTime,
      error: err?.message || 'Failed mass uploading students to Cloud Firestore',
    };
  }
}

export async function getStudentsFromFirestore(
  schoolId: string = 'dominion-group',
  timeoutMs: number = 15000
): Promise<StudentPaymentRecord[]> {
  const firestore = getFirebaseDb();
  if (!firestore) return [];

  const targetPath = `schools/${schoolId.toLowerCase()}/students`;
  try {
    const colRef = collection(firestore, 'schools', schoolId.toLowerCase(), 'students');
    
    // Race getDocs against a timeout so the UI never freezes
    const fetchPromise = getDocs(colRef);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Firestore read timed out - using local cache')), timeoutMs)
    );

    const snapshot = await Promise.race([fetchPromise, timeoutPromise]);
    const students: StudentPaymentRecord[] = [];

    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as StudentPaymentRecord;
      if (data && data.id) {
        students.push(data);
      }
    });

    return students;
  } catch (err) {
    console.warn('[Firestore] Students fetch note:', err);
    return [];
  }
}

export function subscribeStudentsFromFirestore(
  schoolId: string = 'dominion-group',
  onUpdate: (students: StudentPaymentRecord[]) => void,
  onError?: (err: any) => void
): Unsubscribe | null {
  const firestore = getFirebaseDb();
  if (!firestore) return null;

  const targetPath = `schools/${schoolId.toLowerCase()}/students`;
  try {
    const colRef = collection(firestore, 'schools', schoolId.toLowerCase(), 'students');
    return onSnapshot(
      colRef,
      (snapshot) => {
        const list: StudentPaymentRecord[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as StudentPaymentRecord;
          if (data && data.id) {
            list.push(data);
          }
        });
        onUpdate(list);
      },
      (err) => {
        console.warn('[Firestore] Realtime students subscription warning:', err);
        if (onError) onError(err);
        try {
          handleFirestoreError(err, OperationType.GET, targetPath);
        } catch {}
      }
    );
  } catch (err) {
    console.warn('[Firestore] Subscription setup error:', err);
    return null;
  }
}

export async function deleteStudentFromFirestore(
  studentId: string,
  schoolId: string = 'dominion-group'
): Promise<boolean> {
  const firestore = getFirebaseDb();
  if (!firestore) {
    lastFirestoreWriteError = 'Firestore database is not initialized or offline';
    return false;
  }
  if (!studentId) {
    lastFirestoreWriteError = 'Student record is missing an ID';
    return false;
  }

  const targetPath = `schools/${schoolId.toLowerCase()}/students/${sanitizeDocId(studentId)}`;
  try {
    const docId = sanitizeDocId(studentId);
    const docRef = doc(firestore, 'schools', schoolId.toLowerCase(), 'students', docId);
    await deleteDoc(docRef);
    recordFirebaseSyncSuccess();
    lastFirestoreWriteError = null;
    return true;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    lastFirestoreWriteError = errorMsg;
    console.warn('[Firestore] Error deleting student:', studentId, err);
    recordFirebaseSyncError(errorMsg);
    try {
      handleFirestoreError(err, OperationType.DELETE, targetPath);
    } catch {
      return false;
    }
    return false;
  }
}

/**
 * ============================================================================
 * SCHOLARSHIPS FIRESTORE REPOSITORY
 * ============================================================================
 */

export async function saveScholarshipToFirestore(
  scholarship: ScholarshipRecord,
  schoolId: string = 'dominion-group'
): Promise<boolean> {
  const firestore = getFirebaseDb();
  if (!firestore) {
    lastFirestoreWriteError = 'Firestore database is not initialized or offline';
    return false;
  }
  if (!scholarship.id) {
    lastFirestoreWriteError = 'Scholarship record is missing an ID';
    return false;
  }

  const targetPath = `schools/${schoolId.toLowerCase()}/scholarships/${sanitizeDocId(scholarship.id)}`;
  try {
    const docId = sanitizeDocId(scholarship.id);
    const docRef = doc(firestore, 'schools', schoolId.toLowerCase(), 'scholarships', docId);
    const cleanData = sanitizeForFirestore({
      ...scholarship,
      updatedAt: new Date().toISOString(),
    });
    await setDoc(docRef, cleanData, { merge: true });
    recordFirebaseSyncSuccess();
    lastFirestoreWriteError = null;
    return true;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    lastFirestoreWriteError = errorMsg;
    console.warn('[Firestore] Error saving scholarship:', scholarship.id, err);
    recordFirebaseSyncError(errorMsg);
    try {
      handleFirestoreError(err, OperationType.WRITE, targetPath);
    } catch {
      return false;
    }
    return false;
  }
}

export async function batchSaveScholarshipsToFirestore(
  scholarships: ScholarshipRecord[],
  schoolId: string = 'dominion-group'
): Promise<boolean> {
  const firestore = getFirebaseDb();
  if (!firestore || scholarships.length === 0) return false;

  const targetPath = `schools/${schoolId.toLowerCase()}/scholarships`;
  try {
    const targetSchool = schoolId.toLowerCase();
    const batch = writeBatch(firestore);
    const now = new Date().toISOString();

    scholarships.forEach((s) => {
      if (!s.id) return;
      const docId = sanitizeDocId(s.id);
      const docRef = doc(firestore, 'schools', targetSchool, 'scholarships', docId);
      batch.set(docRef, sanitizeForFirestore({ ...s, syncedToCloudAt: now }), { merge: true });
    });

    await batch.commit();
    recordFirebaseSyncSuccess();
    return true;
  } catch (err) {
    console.warn('[Firestore] Error batch saving scholarships:', err);
    try {
      handleFirestoreError(err, OperationType.WRITE, targetPath);
    } catch {
      return false;
    }
  }
}

export async function getScholarshipsFromFirestore(
  schoolId: string = 'dominion-group',
  timeoutMs: number = 3500
): Promise<ScholarshipRecord[]> {
  const firestore = getFirebaseDb();
  if (!firestore) return [];

  const targetPath = `schools/${schoolId.toLowerCase()}/scholarships`;
  try {
    const colRef = collection(firestore, 'schools', schoolId.toLowerCase(), 'scholarships');
    const fetchPromise = getDocs(colRef);
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Firestore read timed out - using local cache')), timeoutMs)
    );

    const snapshot = await Promise.race([fetchPromise, timeoutPromise]);
    const list: ScholarshipRecord[] = [];

    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as ScholarshipRecord;
      if (data && data.id) {
        list.push(data);
      }
    });

    return list;
  } catch (err) {
    console.warn('[Firestore] Scholarships fetch note:', err);
    return [];
  }
}

export function subscribeScholarshipsFromFirestore(
  schoolId: string = 'dominion-group',
  onUpdate: (scholarships: ScholarshipRecord[]) => void,
  onError?: (err: any) => void
): Unsubscribe | null {
  const firestore = getFirebaseDb();
  if (!firestore) return null;

  const targetPath = `schools/${schoolId.toLowerCase()}/scholarships`;
  try {
    const colRef = collection(firestore, 'schools', schoolId.toLowerCase(), 'scholarships');
    return onSnapshot(
      colRef,
      (snapshot) => {
        const list: ScholarshipRecord[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as ScholarshipRecord;
          if (data && data.id) {
            list.push(data);
          }
        });
        onUpdate(list);
      },
      (err) => {
        console.warn('[Firestore] Realtime scholarships subscription warning:', err);
        if (onError) onError(err);
        try {
          handleFirestoreError(err, OperationType.GET, targetPath);
        } catch {}
      }
    );
  } catch (err) {
    console.warn('[Firestore] Subscription setup error:', err);
    return null;
  }
}

export async function deleteScholarshipFromFirestore(
  scholarshipId: string,
  schoolId: string = 'dominion-group'
): Promise<boolean> {
  const firestore = getFirebaseDb();
  if (!firestore) {
    lastFirestoreWriteError = 'Firestore database is not initialized or offline';
    return false;
  }
  if (!scholarshipId) {
    lastFirestoreWriteError = 'Scholarship record is missing an ID';
    return false;
  }

  const targetPath = `schools/${schoolId.toLowerCase()}/scholarships/${sanitizeDocId(scholarshipId)}`;
  try {
    const docId = sanitizeDocId(scholarshipId);
    const docRef = doc(firestore, 'schools', schoolId.toLowerCase(), 'scholarships', docId);
    await deleteDoc(docRef);
    recordFirebaseSyncSuccess();
    lastFirestoreWriteError = null;
    return true;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    lastFirestoreWriteError = errorMsg;
    console.warn('[Firestore] Error deleting scholarship:', scholarshipId, err);
    recordFirebaseSyncError(errorMsg);
    try {
      handleFirestoreError(err, OperationType.DELETE, targetPath);
    } catch {
      return false;
    }
    return false;
  }
}

/**
 * ============================================================================
 * EXPENSES FIRESTORE REPOSITORY
 * ============================================================================
 */

export async function saveExpenseToFirestore(
  expense: ExpenseItem,
  schoolId: string = 'dominion-group'
): Promise<boolean> {
  markPendingSync('expense', expense.id, schoolId);
  const firestore = getFirebaseDb();
  if (!firestore) {
    lastFirestoreWriteError = 'Firestore database is not initialized or offline';
    return false;
  }
  if (!expense.id) {
    lastFirestoreWriteError = 'Expense record is missing an ID';
    return false;
  }

  const targetPath = `schools/${schoolId.toLowerCase()}/expenses/${sanitizeDocId(expense.id)}`;
  try {
    const docId = sanitizeDocId(expense.id);
    const docRef = doc(firestore, 'schools', schoolId.toLowerCase(), 'expenses', docId);
    await setDoc(docRef, sanitizeForFirestore({
      ...expense,
      updatedAt: new Date().toISOString(),
    }), { merge: true });
    clearPendingSync('expense', expense.id, schoolId);
    recordFirebaseSyncSuccess();
    lastFirestoreWriteError = null;
    return true;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    lastFirestoreWriteError = errorMsg;
    console.warn('[Firestore] Error saving expense:', expense.id, err);
    recordFirebaseSyncError(errorMsg);
    try {
      handleFirestoreError(err, OperationType.WRITE, targetPath);
    } catch {
      return false;
    }
    return false;
  }
}

export async function batchSaveExpensesToFirestore(
  expenses: ExpenseItem[],
  schoolId: string = 'dominion-group'
): Promise<boolean> {
  const firestore = getFirebaseDb();
  if (!firestore || expenses.length === 0) return false;

  const targetPath = `schools/${schoolId.toLowerCase()}/expenses`;
  try {
    const targetSchool = schoolId.toLowerCase();
    const batch = writeBatch(firestore);

    expenses.forEach((e) => {
      if (!e.id) return;
      const docId = sanitizeDocId(e.id);
      const docRef = doc(firestore, 'schools', targetSchool, 'expenses', docId);
      batch.set(docRef, sanitizeForFirestore({
        ...e,
        updatedAt: new Date().toISOString(),
      }), { merge: true });
    });

    await batch.commit();
    recordFirebaseSyncSuccess();
    return true;
  } catch (err) {
    console.warn('[Firestore] Error batch saving expenses:', err);
    try {
      handleFirestoreError(err, OperationType.WRITE, targetPath);
    } catch {
      return false;
    }
  }
}

export async function getExpensesFromFirestore(
  schoolId: string = 'dominion-group'
): Promise<ExpenseItem[]> {
  const firestore = getFirebaseDb();
  if (!firestore) return [];

  const targetPath = `schools/${schoolId.toLowerCase()}/expenses`;
  try {
    const colRef = collection(firestore, 'schools', schoolId.toLowerCase(), 'expenses');
    const snapshot = await getDocs(colRef);
    const list: ExpenseItem[] = [];

    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as ExpenseItem;
      if (data && data.id) {
        list.push(data);
      }
    });

    return list;
  } catch (err) {
    console.warn('[Firestore] Error fetching expenses from cloud:', err);
    try {
      handleFirestoreError(err, OperationType.GET, targetPath);
    } catch {
      return [];
    }
  }
}

export function subscribeExpensesFromFirestore(
  schoolId: string = 'dominion-group',
  onUpdate: (expenses: ExpenseItem[]) => void,
  onError?: (err: any) => void
): Unsubscribe | null {
  const firestore = getFirebaseDb();
  if (!firestore) return null;

  const targetPath = `schools/${schoolId.toLowerCase()}/expenses`;
  try {
    const colRef = collection(firestore, 'schools', schoolId.toLowerCase(), 'expenses');
    return onSnapshot(
      colRef,
      (snapshot) => {
        const list: ExpenseItem[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as ExpenseItem;
          if (data && data.id) {
            list.push(data);
          }
        });
        onUpdate(list);
      },
      (err) => {
        console.warn('[Firestore] Realtime expenses subscription warning:', err);
        if (onError) onError(err);
        try {
          handleFirestoreError(err, OperationType.GET, targetPath);
        } catch {}
      }
    );
  } catch (err) {
    console.warn('[Firestore] Expense subscription setup error:', err);
    return null;
  }
}

export async function deleteExpenseFromFirestore(
  expenseId: string,
  schoolId: string = 'dominion-group'
): Promise<boolean> {
  const firestore = getFirebaseDb();
  if (!firestore) {
    lastFirestoreWriteError = 'Firestore database is not initialized or offline';
    return false;
  }
  if (!expenseId) {
    lastFirestoreWriteError = 'Expense record is missing an ID';
    return false;
  }

  const targetPath = `schools/${schoolId.toLowerCase()}/expenses/${sanitizeDocId(expenseId)}`;
  try {
    const docId = sanitizeDocId(expenseId);
    const docRef = doc(firestore, 'schools', schoolId.toLowerCase(), 'expenses', docId);
    await deleteDoc(docRef);
    recordFirebaseSyncSuccess();
    lastFirestoreWriteError = null;
    return true;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    lastFirestoreWriteError = errorMsg;
    console.warn('[Firestore] Error deleting expense:', expenseId, err);
    recordFirebaseSyncError(errorMsg);
    try {
      handleFirestoreError(err, OperationType.DELETE, targetPath);
    } catch {
      return false;
    }
    return false;
  }
}

/**
 * ============================================================================
 * EXTRA INCOMES FIRESTORE REPOSITORY
 * ============================================================================
 */

export async function saveExtraIncomeToFirestore(
  income: ExtraIncomeItem,
  schoolId: string = 'dominion-group'
): Promise<boolean> {
  markPendingSync('income', income.id, schoolId);
  const firestore = getFirebaseDb();
  if (!firestore) {
    lastFirestoreWriteError = 'Firestore database is not initialized or offline';
    return false;
  }
  if (!income.id) {
    lastFirestoreWriteError = 'Extra income record is missing an ID';
    return false;
  }

  const targetPath = `schools/${schoolId.toLowerCase()}/extra_incomes/${sanitizeDocId(income.id)}`;
  try {
    const docId = sanitizeDocId(income.id);
    const docRef = doc(firestore, 'schools', schoolId.toLowerCase(), 'extra_incomes', docId);
    await setDoc(docRef, sanitizeForFirestore({
      ...income,
      updatedAt: new Date().toISOString(),
    }), { merge: true });
    clearPendingSync('income', income.id, schoolId);
    recordFirebaseSyncSuccess();
    lastFirestoreWriteError = null;
    return true;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    lastFirestoreWriteError = errorMsg;
    console.warn('[Firestore] Error saving extra income:', income.id, err);
    recordFirebaseSyncError(errorMsg);
    try {
      handleFirestoreError(err, OperationType.WRITE, targetPath);
    } catch {
      return false;
    }
    return false;
  }
}

export async function loadExtraIncomesFromFirestore(
  schoolId: string = 'dominion-group'
): Promise<ExtraIncomeItem[]> {
  const firestore = getFirebaseDb();
  if (!firestore) return [];

  const targetPath = `schools/${schoolId.toLowerCase()}/extra_incomes`;
  try {
    const colRef = collection(firestore, 'schools', schoolId.toLowerCase(), 'extra_incomes');
    const snapshot = await getDocs(colRef);
    const list: ExtraIncomeItem[] = [];

    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as ExtraIncomeItem;
      if (data && data.id) {
        list.push(data);
      }
    });

    return list;
  } catch (err) {
    console.warn('[Firestore] Error fetching extra incomes from cloud:', err);
    try {
      handleFirestoreError(err, OperationType.GET, targetPath);
    } catch {
      return [];
    }
  }
}

export function subscribeExtraIncomesFromFirestore(
  schoolId: string = 'dominion-group',
  onUpdate: (incomes: ExtraIncomeItem[]) => void,
  onError?: (err: any) => void
): Unsubscribe | null {
  const firestore = getFirebaseDb();
  if (!firestore) return null;

  const targetPath = `schools/${schoolId.toLowerCase()}/extra_incomes`;
  try {
    const colRef = collection(firestore, 'schools', schoolId.toLowerCase(), 'extra_incomes');
    return onSnapshot(
      colRef,
      (snapshot) => {
        const list: ExtraIncomeItem[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as ExtraIncomeItem;
          if (data && data.id) {
            list.push(data);
          }
        });
        onUpdate(list);
      },
      (err) => {
        console.warn('[Firestore] Realtime extra incomes subscription warning:', err);
        if (onError) onError(err);
        try {
          handleFirestoreError(err, OperationType.GET, targetPath);
        } catch {}
      }
    );
  } catch (err) {
    console.warn('[Firestore] Extra income subscription setup error:', err);
    return null;
  }
}

export async function deleteExtraIncomeFromFirestore(
  incomeId: string,
  schoolId: string = 'dominion-group'
): Promise<boolean> {
  const firestore = getFirebaseDb();
  if (!firestore) {
    lastFirestoreWriteError = 'Firestore database is not initialized or offline';
    return false;
  }
  if (!incomeId) {
    lastFirestoreWriteError = 'Extra income record is missing an ID';
    return false;
  }

  const targetPath = `schools/${schoolId.toLowerCase()}/extra_incomes/${sanitizeDocId(incomeId)}`;
  try {
    const docId = sanitizeDocId(incomeId);
    const docRef = doc(firestore, 'schools', schoolId.toLowerCase(), 'extra_incomes', docId);
    await deleteDoc(docRef);
    recordFirebaseSyncSuccess();
    lastFirestoreWriteError = null;
    return true;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    lastFirestoreWriteError = errorMsg;
    console.warn('[Firestore] Error deleting extra income:', incomeId, err);
    recordFirebaseSyncError(errorMsg);
    try {
      handleFirestoreError(err, OperationType.DELETE, targetPath);
    } catch {
      return false;
    }
    return false;
  }
}

/**
 * ============================================================================
 * STAFF FIRESTORE REPOSITORY
 * ============================================================================
 */

export async function saveStaffToFirestore(
  staff: StaffMember,
  schoolId: string = 'dominion-group'
): Promise<boolean> {
  markPendingSync('staff', staff.id, schoolId);
  const firestore = getFirebaseDb();
  if (!firestore) {
    lastFirestoreWriteError = 'Firestore database is not initialized or offline';
    return false;
  }
  if (!staff.id) {
    lastFirestoreWriteError = 'Staff record is missing an ID';
    return false;
  }

  const targetPath = `schools/${schoolId.toLowerCase()}/staff/${sanitizeDocId(staff.id)}`;
  try {
    const docId = sanitizeDocId(staff.id);
    const docRef = doc(firestore, 'schools', schoolId.toLowerCase(), 'staff', docId);
    await setDoc(docRef, sanitizeForFirestore({
      ...staff,
      updatedAt: new Date().toISOString(),
    }), { merge: true });
    clearPendingSync('staff', staff.id, schoolId);
    recordFirebaseSyncSuccess();
    lastFirestoreWriteError = null;
    return true;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    lastFirestoreWriteError = errorMsg;
    console.warn('[Firestore] Error saving staff member:', staff.id, err);
    recordFirebaseSyncError(errorMsg);
    try {
      handleFirestoreError(err, OperationType.WRITE, targetPath);
    } catch {
      return false;
    }
    return false;
  }
}

export async function batchSaveStaffToFirestore(
  staffList: StaffMember[],
  schoolId: string = 'dominion-group'
): Promise<boolean> {
  const firestore = getFirebaseDb();
  if (!firestore || staffList.length === 0) return false;

  const targetPath = `schools/${schoolId.toLowerCase()}/staff`;
  try {
    const targetSchool = schoolId.toLowerCase();
    const batch = writeBatch(firestore);

    staffList.forEach((st) => {
      if (!st.id) return;
      const docId = sanitizeDocId(st.id);
      const docRef = doc(firestore, 'schools', targetSchool, 'staff', docId);
      batch.set(docRef, sanitizeForFirestore({
        ...st,
        updatedAt: new Date().toISOString(),
      }), { merge: true });
    });

    await batch.commit();
    recordFirebaseSyncSuccess();
    return true;
  } catch (err) {
    console.warn('[Firestore] Error batch saving staff:', err);
    try {
      handleFirestoreError(err, OperationType.WRITE, targetPath);
    } catch {
      return false;
    }
  }
}

export async function getStaffFromFirestore(
  schoolId: string = 'dominion-group'
): Promise<StaffMember[]> {
  const firestore = getFirebaseDb();
  if (!firestore) return [];

  const targetPath = `schools/${schoolId.toLowerCase()}/staff`;
  try {
    const colRef = collection(firestore, 'schools', schoolId.toLowerCase(), 'staff');
    const snapshot = await getDocs(colRef);
    const list: StaffMember[] = [];

    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as StaffMember;
      if (data && data.id) {
        list.push(data);
      }
    });

    return list;
  } catch (err) {
    console.warn('[Firestore] Error fetching staff from cloud:', err);
    try {
      handleFirestoreError(err, OperationType.GET, targetPath);
    } catch {
      return [];
    }
  }
}

export function subscribeStaffFromFirestore(
  schoolId: string = 'dominion-group',
  onUpdate: (staff: StaffMember[]) => void,
  onError?: (err: any) => void
): Unsubscribe | null {
  const firestore = getFirebaseDb();
  if (!firestore) return null;

  const targetPath = `schools/${schoolId.toLowerCase()}/staff`;
  try {
    const colRef = collection(firestore, 'schools', schoolId.toLowerCase(), 'staff');
    return onSnapshot(
      colRef,
      (snapshot) => {
        const list: StaffMember[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as StaffMember;
          if (data && data.id) {
            list.push(data);
          }
        });
        onUpdate(list);
      },
      (err) => {
        console.warn('[Firestore] Realtime staff subscription warning:', err);
        if (onError) onError(err);
        try {
          handleFirestoreError(err, OperationType.GET, targetPath);
        } catch {}
      }
    );
  } catch (err) {
    console.warn('[Firestore] Staff subscription setup error:', err);
    return null;
  }
}

export async function deleteStaffFromFirestore(
  staffId: string,
  schoolId: string = 'dominion-group'
): Promise<boolean> {
  const firestore = getFirebaseDb();
  if (!firestore) {
    lastFirestoreWriteError = 'Firestore database is not initialized or offline';
    return false;
  }
  if (!staffId) {
    lastFirestoreWriteError = 'Staff record is missing an ID';
    return false;
  }

  const targetPath = `schools/${schoolId.toLowerCase()}/staff/${sanitizeDocId(staffId)}`;
  try {
    const docId = sanitizeDocId(staffId);
    const docRef = doc(firestore, 'schools', schoolId.toLowerCase(), 'staff', docId);
    await deleteDoc(docRef);
    recordFirebaseSyncSuccess();
    lastFirestoreWriteError = null;
    return true;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    lastFirestoreWriteError = errorMsg;
    console.warn('[Firestore] Error deleting staff member:', staffId, err);
    recordFirebaseSyncError(errorMsg);
    try {
      handleFirestoreError(err, OperationType.DELETE, targetPath);
    } catch {
      return false;
    }
    return false;
  }
}

/**
 * ============================================================================
 * PAYROLL FIRESTORE REPOSITORY
 * ============================================================================
 */

export async function savePayrollToFirestore(
  payroll: PayrollRecord,
  schoolId: string = 'dominion-group'
): Promise<boolean> {
  markPendingSync('payroll', payroll.id, schoolId);
  const firestore = getFirebaseDb();
  if (!firestore) {
    lastFirestoreWriteError = 'Firestore database is not initialized or offline';
    return false;
  }
  if (!payroll.id) {
    lastFirestoreWriteError = 'Payroll record is missing an ID';
    return false;
  }

  const targetPath = `schools/${schoolId.toLowerCase()}/payroll/${sanitizeDocId(payroll.id)}`;
  try {
    const docId = sanitizeDocId(payroll.id);
    const docRef = doc(firestore, 'schools', schoolId.toLowerCase(), 'payroll', docId);
    await setDoc(docRef, sanitizeForFirestore({
      ...payroll,
      updatedAt: new Date().toISOString(),
    }), { merge: true });
    clearPendingSync('payroll', payroll.id, schoolId);
    recordFirebaseSyncSuccess();
    lastFirestoreWriteError = null;
    return true;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    lastFirestoreWriteError = errorMsg;
    console.warn('[Firestore] Error saving payroll record:', payroll.id, err);
    recordFirebaseSyncError(errorMsg);
    try {
      handleFirestoreError(err, OperationType.WRITE, targetPath);
    } catch {
      return false;
    }
    return false;
  }
}

export async function batchSavePayrollToFirestore(
  payrollList: PayrollRecord[],
  schoolId: string = 'dominion-group'
): Promise<boolean> {
  const firestore = getFirebaseDb();
  if (!firestore || payrollList.length === 0) return false;

  const targetPath = `schools/${schoolId.toLowerCase()}/payroll`;
  try {
    const targetSchool = schoolId.toLowerCase();
    const batch = writeBatch(firestore);

    payrollList.forEach((p) => {
      if (!p.id) return;
      const docId = sanitizeDocId(p.id);
      const docRef = doc(firestore, 'schools', targetSchool, 'payroll', docId);
      batch.set(docRef, sanitizeForFirestore({
        ...p,
        updatedAt: new Date().toISOString(),
      }), { merge: true });
    });

    await batch.commit();
    recordFirebaseSyncSuccess();
    return true;
  } catch (err) {
    console.warn('[Firestore] Error batch saving payroll:', err);
    try {
      handleFirestoreError(err, OperationType.WRITE, targetPath);
    } catch {
      return false;
    }
  }
}

export async function getPayrollFromFirestore(
  schoolId: string = 'dominion-group'
): Promise<PayrollRecord[]> {
  const firestore = getFirebaseDb();
  if (!firestore) return [];

  const targetPath = `schools/${schoolId.toLowerCase()}/payroll`;
  try {
    const colRef = collection(firestore, 'schools', schoolId.toLowerCase(), 'payroll');
    const snapshot = await getDocs(colRef);
    const list: PayrollRecord[] = [];

    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as PayrollRecord;
      if (data && data.id) {
        list.push(data);
      }
    });

    return list;
  } catch (err) {
    console.warn('[Firestore] Error fetching payroll from cloud:', err);
    try {
      handleFirestoreError(err, OperationType.GET, targetPath);
    } catch {
      return [];
    }
  }
}

export function subscribePayrollFromFirestore(
  schoolId: string = 'dominion-group',
  onUpdate: (payroll: PayrollRecord[]) => void,
  onError?: (err: any) => void
): Unsubscribe | null {
  const firestore = getFirebaseDb();
  if (!firestore) return null;

  const targetPath = `schools/${schoolId.toLowerCase()}/payroll`;
  try {
    const colRef = collection(firestore, 'schools', schoolId.toLowerCase(), 'payroll');
    return onSnapshot(
      colRef,
      (snapshot) => {
        const list: PayrollRecord[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as PayrollRecord;
          if (data && data.id) {
            list.push(data);
          }
        });
        onUpdate(list);
      },
      (err) => {
        console.warn('[Firestore] Realtime payroll subscription warning:', err);
        if (onError) onError(err);
        try {
          handleFirestoreError(err, OperationType.GET, targetPath);
        } catch {}
      }
    );
  } catch (err) {
    console.warn('[Firestore] Payroll subscription setup error:', err);
    return null;
  }
}

export async function deletePayrollFromFirestore(
  payrollId: string,
  schoolId: string = 'dominion-group'
): Promise<boolean> {
  const firestore = getFirebaseDb();
  if (!firestore) {
    lastFirestoreWriteError = 'Firestore database is not initialized or offline';
    return false;
  }
  if (!payrollId) {
    lastFirestoreWriteError = 'Payroll record is missing an ID';
    return false;
  }

  const targetPath = `schools/${schoolId.toLowerCase()}/payroll/${sanitizeDocId(payrollId)}`;
  try {
    const docId = sanitizeDocId(payrollId);
    const docRef = doc(firestore, 'schools', schoolId.toLowerCase(), 'payroll', docId);
    await deleteDoc(docRef);
    recordFirebaseSyncSuccess();
    lastFirestoreWriteError = null;
    return true;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    lastFirestoreWriteError = errorMsg;
    console.warn('[Firestore] Error deleting payroll record:', payrollId, err);
    recordFirebaseSyncError(errorMsg);
    try {
      handleFirestoreError(err, OperationType.DELETE, targetPath);
    } catch {
      return false;
    }
    return false;
  }
}

/**
 * ============================================================================
 * SCHOOL PROFILE & CONFIGURATION REPOSITORY
 * ============================================================================
 */

export async function saveSchoolProfileToFirestore(
  profile: SchoolProfile
): Promise<boolean> {
  const firestore = getFirebaseDb();
  if (!firestore || !profile.id) return false;

  const targetPath = `schools/${profile.id.toLowerCase()}`;
  try {
    const docRef = doc(firestore, 'schools', profile.id.toLowerCase());
    await setDoc(docRef, sanitizeForFirestore({
      ...profile,
      updatedAt: new Date().toISOString(),
    }), { merge: true });
    recordFirebaseSyncSuccess();
    return true;
  } catch (err) {
    console.warn('[Firestore] Error saving school profile:', profile.id, err);
    try {
      handleFirestoreError(err, OperationType.WRITE, targetPath);
    } catch {
      return false;
    }
  }
}

export async function getSchoolProfilesFromFirestore(): Promise<SchoolProfile[]> {
  const firestore = getFirebaseDb();
  if (!firestore) return [];

  const targetPath = `schools`;
  try {
    const colRef = collection(firestore, 'schools');
    const snapshot = await getDocs(colRef);
    const profiles: SchoolProfile[] = [];

    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as SchoolProfile;
      if (data) {
        const id = data.id || docSnap.id;
        const name = data.name || (id === 'dominion-group' ? 'Dominion Group Of Schools' : id);
        profiles.push({
          ...data,
          id,
          name,
        });
      }
    });

    return profiles;
  } catch (err) {
    console.warn('[Firestore] Error fetching school profiles:', err);
    try {
      handleFirestoreError(err, OperationType.GET, targetPath);
    } catch {
      return [];
    }
  }
}

export function subscribeSchoolsFromFirestore(
  onUpdate: (schools: SchoolProfile[]) => void,
  onError?: (err: any) => void
): Unsubscribe | null {
  const firestore = getFirebaseDb();
  if (!firestore) return null;

  const targetPath = 'schools';
  try {
    const colRef = collection(firestore, 'schools');
    return onSnapshot(
      colRef,
      (snapshot) => {
        const list: SchoolProfile[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as SchoolProfile;
          if (data) {
            const id = data.id || docSnap.id;
            const name = data.name || (id === 'dominion-group' ? 'Dominion Group Of Schools' : id);
            list.push({
              ...data,
              id,
              name,
            });
          }
        });
        if (list.length > 0) {
          onUpdate(list);
        }
      },
      (err) => {
        console.warn('[Firestore] Realtime schools subscription warning:', err);
        if (onError) onError(err);
        try {
          handleFirestoreError(err, OperationType.GET, targetPath);
        } catch {}
      }
    );
  } catch (err) {
    console.warn('[Firestore] Subscription setup error for schools:', err);
    return null;
  }
}

export function subscribeSchoolProfileFromFirestore(
  schoolId: string,
  onUpdate: (school: SchoolProfile | null) => void,
  onError?: (err: any) => void
): Unsubscribe | null {
  const firestore = getFirebaseDb();
  if (!firestore || !schoolId) return null;

  const cleanId = schoolId.toLowerCase();
  const targetPath = `schools/${cleanId}`;
  try {
    const docRef = doc(firestore, 'schools', cleanId);
    return onSnapshot(
      docRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as SchoolProfile;
          onUpdate({
            ...data,
            id: data.id || docSnap.id,
            name: data.name || docSnap.id,
          });
        } else {
          onUpdate(null);
        }
      },
      (err) => {
        console.warn('[Firestore] Realtime single school subscription warning:', err);
        if (onError) onError(err);
        try {
          handleFirestoreError(err, OperationType.GET, targetPath);
        } catch {}
      }
    );
  } catch (err) {
    console.warn('[Firestore] Single school subscription setup error:', err);
    return null;
  }
}

export async function deleteSchoolFromFirestore(schoolId: string): Promise<boolean> {
  const firestore = getFirebaseDb();
  if (!firestore || !schoolId) return false;

  const targetPath = `schools/${schoolId.toLowerCase()}`;
  try {
    const docRef = doc(firestore, 'schools', schoolId.toLowerCase());
    await deleteDoc(docRef);
    recordFirebaseSyncSuccess();
    return true;
  } catch (err) {
    console.warn('[Firestore] Error deleting school from Firestore:', schoolId, err);
    try {
      handleFirestoreError(err, OperationType.DELETE, targetPath);
    } catch {
      return false;
    }
  }
}

export const getSchoolsFromFirestore = getSchoolProfilesFromFirestore;
export const subscribeToSchools = subscribeSchoolsFromFirestore;
export const subscribeToSchoolProfile = subscribeSchoolProfileFromFirestore;

/**
 * ============================================================================
 * TERM SCHEDULE REPOSITORY
 * ============================================================================
 */

export async function saveTermScheduleToFirestore(
  schedule: AcademicTermSchedule,
  schoolId: string = 'dominion-group'
): Promise<boolean> {
  const firestore = getFirebaseDb();
  if (!firestore || !schedule.term) return false;

  const docId = sanitizeDocId(schedule.term.replace(/\s+/g, '_'));
  const targetPath = `schools/${schoolId.toLowerCase()}/term_schedules/${docId}`;
  try {
    const docRef = doc(firestore, 'schools', schoolId.toLowerCase(), 'term_schedules', docId);
    await setDoc(docRef, sanitizeForFirestore({
      ...schedule,
      id: docId,
      updatedAt: new Date().toISOString(),
    }), { merge: true });
    recordFirebaseSyncSuccess();
    return true;
  } catch (err) {
    console.warn('[Firestore] Error saving term schedule:', schedule.term, err);
    try {
      handleFirestoreError(err, OperationType.WRITE, targetPath);
    } catch {
      return false;
    }
  }
}

export async function getTermSchedulesFromFirestore(
  schoolId: string = 'dominion-group'
): Promise<AcademicTermSchedule[]> {
  const firestore = getFirebaseDb();
  if (!firestore) return [];

  const targetPath = `schools/${schoolId.toLowerCase()}/term_schedules`;
  try {
    const colRef = collection(firestore, 'schools', schoolId.toLowerCase(), 'term_schedules');
    const snapshot = await getDocs(colRef);
    const list: AcademicTermSchedule[] = [];

    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as AcademicTermSchedule;
      if (data && data.term) {
        list.push(data);
      }
    });

    return list;
  } catch (err) {
    console.warn('[Firestore] Error fetching term schedules:', err);
    try {
      handleFirestoreError(err, OperationType.GET, targetPath);
    } catch {
      return [];
    }
  }
}

/**
 * ============================================================================
 * TERM SNAPSHOTS & BACKUPS REPOSITORY
 * ============================================================================
 */

export async function saveTermBackupToFirestore(
  snapshot: any,
  schoolId: string = 'dominion-group'
): Promise<boolean> {
  const firestore = getFirebaseDb();
  if (!firestore || !snapshot.id) return false;

  const targetPath = `schools/${schoolId.toLowerCase()}/backups/${sanitizeDocId(snapshot.id)}`;
  try {
    const docId = sanitizeDocId(snapshot.id);
    const docRef = doc(firestore, 'schools', schoolId.toLowerCase(), 'backups', docId);
    await setDoc(docRef, sanitizeForFirestore({
      ...snapshot,
      updatedAt: new Date().toISOString(),
    }), { merge: true });
    recordFirebaseSyncSuccess();
    return true;
  } catch (err) {
    console.warn('[Firestore] Error saving term backup:', snapshot.id, err);
    try {
      handleFirestoreError(err, OperationType.WRITE, targetPath);
    } catch {
      return false;
    }
  }
}

export async function getTermBackupsFromFirestore(
  schoolId: string = 'dominion-group'
): Promise<any[]> {
  const firestore = getFirebaseDb();
  if (!firestore) return [];

  const targetPath = `schools/${schoolId.toLowerCase()}/backups`;
  try {
    const colRef = collection(firestore, 'schools', schoolId.toLowerCase(), 'backups');
    const snapshot = await getDocs(colRef);
    const list: any[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      if (data && data.id) {
        list.push(data);
      }
    });
    return list.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  } catch (err) {
    console.warn('[Firestore] Error getting term backups:', err);
    try {
      handleFirestoreError(err, OperationType.GET, targetPath);
    } catch {
      return [];
    }
  }
}

export async function deleteTermBackupFromFirestore(
  id: string,
  schoolId: string = 'dominion-group'
): Promise<boolean> {
  const firestore = getFirebaseDb();
  if (!firestore || !id) return false;

  const targetPath = `schools/${schoolId.toLowerCase()}/backups/${sanitizeDocId(id)}`;
  try {
    const docRef = doc(firestore, 'schools', schoolId.toLowerCase(), 'backups', sanitizeDocId(id));
    await deleteDoc(docRef);
    recordFirebaseSyncSuccess();
    return true;
  } catch (err) {
    console.warn('[Firestore] Error deleting term backup:', id, err);
    try {
      handleFirestoreError(err, OperationType.DELETE, targetPath);
    } catch {
      return false;
    }
  }
}

/**
 * ============================================================================
 * AUDIT LOGS REPOSITORY
 * ============================================================================
 */

export async function saveAuditLogToFirestore(
  entry: AuditLogEntry,
  schoolId: string = 'dominion-group'
): Promise<boolean> {
  const firestore = getFirebaseDb();
  if (!firestore || !entry.id) return false;

  const targetPath = `schools/${schoolId.toLowerCase()}/audit_logs/${sanitizeDocId(entry.id)}`;
  try {
    const docId = sanitizeDocId(entry.id);
    const docRef = doc(firestore, 'schools', schoolId.toLowerCase(), 'audit_logs', docId);
    await setDoc(docRef, sanitizeForFirestore(entry), { merge: true });
    return true;
  } catch (err) {
    console.warn('[Firestore] Error saving audit log:', entry.id, err);
    try {
      handleFirestoreError(err, OperationType.WRITE, targetPath);
    } catch {
      return false;
    }
  }
}

export async function getAuditLogsFromFirestore(
  schoolId: string = 'dominion-group',
  maxCount: number = 100
): Promise<AuditLogEntry[]> {
  const firestore = getFirebaseDb();
  if (!firestore) return [];

  const targetPath = `schools/${schoolId.toLowerCase()}/audit_logs`;
  try {
    const colRef = collection(firestore, 'schools', schoolId.toLowerCase(), 'audit_logs');
    const q = query(colRef, orderBy('timestamp', 'desc'), limit(maxCount));
    const snapshot = await getDocs(q);
    const list: AuditLogEntry[] = [];

    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as AuditLogEntry;
      if (data && data.id) {
        list.push(data);
      }
    });

    return list;
  } catch (err) {
    // Fallback without ordering if index is still building
    try {
      const colRef = collection(firestore, 'schools', schoolId.toLowerCase(), 'audit_logs');
      const snapshot = await getDocs(colRef);
      const list: AuditLogEntry[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data() as AuditLogEntry;
        if (data && data.id) list.push(data);
      });
      return list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, maxCount);
    } catch (e2) {
      console.warn('[Firestore] Error reading audit logs:', e2);
      try {
        handleFirestoreError(e2, OperationType.GET, targetPath);
      } catch {
        return [];
      }
    }
  }
}

export function subscribeAuditLogsFromFirestore(
  schoolId: string = 'dominion-group',
  callback: (logs: AuditLogEntry[]) => void,
  maxCount: number = 200
): Unsubscribe | null {
  const firestore = getFirebaseDb();
  if (!firestore) return null;

  const targetPath = `schools/${schoolId.toLowerCase()}/audit_logs`;
  try {
    const colRef = collection(firestore, 'schools', schoolId.toLowerCase(), 'audit_logs');
    const q = query(colRef, orderBy('timestamp', 'desc'), limit(maxCount));

    return onSnapshot(
      q,
      (snapshot) => {
        const list: AuditLogEntry[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as AuditLogEntry;
          if (data && data.id) {
            list.push(data);
          }
        });
        callback(list);
      },
      (err) => {
        console.warn('[Firestore] Audit logs ordered subscription note:', err);
        // Fallback without ordering if composite index is not yet built
        try {
          return onSnapshot(
            colRef,
            (snap) => {
              const list: AuditLogEntry[] = [];
              snap.forEach((docSnap) => {
                const data = docSnap.data() as AuditLogEntry;
                if (data && data.id) list.push(data);
              });
              list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
              callback(list.slice(0, maxCount));
            },
            (err2) => {
              console.warn('[Firestore] Audit log unordered subscription notice:', err2);
              try {
                handleFirestoreError(err2, OperationType.GET, targetPath);
              } catch {}
            }
          );
        } catch {
          return;
        }
      }
    );
  } catch (err) {
    console.warn('[Firestore] Error subscribing to audit logs:', err);
    return null;
  }
}

/**
 * ============================================================================
 * SCHOOL BRANDING & LOGO FIRESTORE REPOSITORY
 * ============================================================================
 */

export async function saveBrandingToFirestore(
  branding: AppBrandingConfig,
  schoolId: string = 'dominion-group'
): Promise<boolean> {
  const firestore = getFirebaseDb();
  if (!firestore) return false;

  const targetPath = `schools/${schoolId.toLowerCase()}/branding/config`;
  try {
    const docRef = doc(firestore, 'schools', schoolId.toLowerCase(), 'branding', 'config');
    const cleanData = sanitizeForFirestore({
      ...branding,
      id: 'config',
      schoolId: schoolId.toLowerCase(),
      updatedAt: new Date().toISOString(),
    });
    await setDoc(docRef, cleanData, { merge: true });
    recordFirebaseSyncSuccess();
    return true;
  } catch (err) {
    console.warn('[Firestore] Error saving school branding:', err);
    try {
      handleFirestoreError(err, OperationType.WRITE, targetPath);
    } catch {
      return false;
    }
  }
}

export async function getBrandingFromFirestore(
  schoolId: string = 'dominion-group'
): Promise<AppBrandingConfig | null> {
  const firestore = getFirebaseDb();
  if (!firestore) return null;

  const targetPath = `schools/${schoolId.toLowerCase()}/branding/config`;
  try {
    const docRef = doc(firestore, 'schools', schoolId.toLowerCase(), 'branding', 'config');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data() as AppBrandingConfig;
      return data;
    }
    return null;
  } catch (err: any) {
    const errMsg = err instanceof Error ? err.message : String(err || '');
    const isOffline =
      errMsg.includes('offline') ||
      errMsg.includes('unavailable') ||
      errMsg.includes('timed out') ||
      err?.code === 'unavailable';

    if (isOffline) {
      console.warn(`[Firestore] Client offline reading branding for ${schoolId} - using local cache`);
      return null;
    }

    console.warn('[Firestore] Error reading school branding:', err);
    try {
      handleFirestoreError(err, OperationType.GET, targetPath);
    } catch {
      return null;
    }
  }
}

export function subscribeBrandingFromFirestore(
  schoolId: string = 'dominion-group',
  callback: (branding: AppBrandingConfig) => void
): Unsubscribe | null {
  const firestore = getFirebaseDb();
  if (!firestore) return null;

  const targetPath = `schools/${schoolId.toLowerCase()}/branding/config`;
  try {
    const docRef = doc(firestore, 'schools', schoolId.toLowerCase(), 'branding', 'config');
    return onSnapshot(
      docRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as AppBrandingConfig;
          if (data && data.appName) {
            callback(data);
          }
        }
      },
      (err) => {
        const errMsg = err instanceof Error ? err.message : String(err || '');
        const isOffline =
          errMsg.includes('offline') ||
          errMsg.includes('unavailable') ||
          errMsg.includes('network') ||
          (err as any)?.code === 'unavailable';

        if (isOffline) {
          console.warn(`[Firestore] Branding listener offline note for ${schoolId}`);
          return;
        }

        console.warn('[Firestore] Error in branding listener:', err);
        try {
          handleFirestoreError(err, OperationType.GET, targetPath);
        } catch {}
      }
    );
  } catch (err) {
    console.warn('[Firestore] Error subscribing to branding:', err);
    return null;
  }
}

/**
 * ============================================================================
 * REMITTANCES FIRESTORE REPOSITORY
 * ============================================================================
 */

export async function saveRemittanceToFirestore(
  remittance: RemittanceRecord,
  schoolId: string = 'dominion-group'
): Promise<boolean> {
  const firestore = getFirebaseDb();
  if (!firestore) {
    lastFirestoreWriteError = 'Firestore database is not initialized or offline';
    return false;
  }
  if (!remittance.id) {
    lastFirestoreWriteError = 'Remittance record is missing an ID';
    return false;
  }

  const targetPath = `schools/${schoolId.toLowerCase()}/remittances/${sanitizeDocId(remittance.id)}`;
  try {
    const docId = sanitizeDocId(remittance.id);
    const docRef = doc(firestore, 'schools', schoolId.toLowerCase(), 'remittances', docId);
    const cleanData = sanitizeForFirestore({
      ...remittance,
      updatedAt: new Date().toISOString(),
    });
    await setDoc(docRef, cleanData, { merge: true });
    recordFirebaseSyncSuccess();
    lastFirestoreWriteError = null;
    return true;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    lastFirestoreWriteError = errorMsg;
    console.warn('[Firestore] Error saving remittance:', remittance.id, err);
    recordFirebaseSyncError(errorMsg);
    try {
      handleFirestoreError(err, OperationType.WRITE, targetPath);
    } catch {
      return false;
    }
    return false;
  }
}

export async function getRemittancesFromFirestore(
  schoolId: string = 'dominion-group'
): Promise<RemittanceRecord[]> {
  const firestore = getFirebaseDb();
  if (!firestore) return [];

  const targetPath = `schools/${schoolId.toLowerCase()}/remittances`;
  try {
    const colRef = collection(firestore, 'schools', schoolId.toLowerCase(), 'remittances');
    const snapshot = await getDocs(colRef);
    const list: RemittanceRecord[] = [];
    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as RemittanceRecord;
      if (data && data.id) {
        list.push(data);
      }
    });
    return list.sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
  } catch (err) {
    console.warn('[Firestore] Error getting remittances:', err);
    try {
      handleFirestoreError(err, OperationType.GET, targetPath);
    } catch {
      return [];
    }
  }
}

export function subscribeRemittancesFromFirestore(
  schoolId: string = 'dominion-group',
  callback: (remittances: RemittanceRecord[]) => void
): Unsubscribe | null {
  const firestore = getFirebaseDb();
  if (!firestore) return null;

  const targetPath = `schools/${schoolId.toLowerCase()}/remittances`;
  try {
    const colRef = collection(firestore, 'schools', schoolId.toLowerCase(), 'remittances');
    return onSnapshot(
      colRef,
      (snapshot) => {
        const list: RemittanceRecord[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as RemittanceRecord;
          if (data && data.id) {
            list.push(data);
          }
        });
        list.sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime());
        callback(list);
        recordFirebaseSyncSuccess();
      },
      (err) => {
        console.warn('[Firestore] Remittances snapshot error:', err);
        try {
          handleFirestoreError(err, OperationType.GET, targetPath);
        } catch {}
      }
    );
  } catch (err) {
    console.warn('[Firestore] Error subscribing to remittances:', err);
    return null;
  }
}

export async function deleteRemittanceFromFirestore(
  id: string,
  schoolId: string = 'dominion-group'
): Promise<boolean> {
  const firestore = getFirebaseDb();
  if (!firestore) {
    lastFirestoreWriteError = 'Firestore database is not initialized or offline';
    return false;
  }
  if (!id) {
    lastFirestoreWriteError = 'Remittance record is missing an ID';
    return false;
  }

  const targetPath = `schools/${schoolId.toLowerCase()}/remittances/${sanitizeDocId(id)}`;
  try {
    const docRef = doc(firestore, 'schools', schoolId.toLowerCase(), 'remittances', sanitizeDocId(id));
    await deleteDoc(docRef);
    recordFirebaseSyncSuccess();
    lastFirestoreWriteError = null;
    return true;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    lastFirestoreWriteError = errorMsg;
    console.warn('[Firestore] Error deleting remittance:', id, err);
    recordFirebaseSyncError(errorMsg);
    try {
      handleFirestoreError(err, OperationType.DELETE, targetPath);
    } catch {
      return false;
    }
    return false;
  }
}

/**
 * Loads the complete school data snapshot directly from Firestore for comprehensive backups
 */
export async function getFullSchoolDataFromFirestore(schoolId: string = 'dominion-group') {
  const targetSchool = schoolId.toLowerCase();
  const [
    students,
    scholarships,
    staff,
    payroll,
    expenses,
    remittances,
    profiles,
    termSchedules,
    auditLogs
  ] = await Promise.all([
    getStudentsFromFirestore(targetSchool),
    getScholarshipsFromFirestore(targetSchool),
    getStaffFromFirestore(targetSchool),
    getPayrollFromFirestore(targetSchool),
    getExpensesFromFirestore(targetSchool),
    getRemittancesFromFirestore(targetSchool),
    getSchoolProfilesFromFirestore(),
    getTermSchedulesFromFirestore(targetSchool),
    getAuditLogsFromFirestore(targetSchool, 200)
  ]);

  const activeProfile = profiles.find((p) => p.id.toLowerCase() === targetSchool) || null;

  return {
    schoolId: targetSchool,
    profile: activeProfile,
    students,
    scholarships,
    staff,
    payroll,
    expenses,
    remittances,
    termSchedules,
    auditLogs,
    exportedAt: new Date().toISOString(),
  };
}

/**
 * ============================================================================
 * CLOUD FIRESTORE SYNC STATUS DISPATCHER
 * ============================================================================
 */

export interface SyncStatus {
  isOnline: boolean;
  lastFirebaseSyncTime: string | null;
  lastSheetsSyncTime?: string | null;
  syncError: string | null;
}

let activeSyncStatus: SyncStatus = {
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  lastFirebaseSyncTime: safeStorage.getItem('bursar_last_firebase_sync_time'),
  syncError: null,
};

const syncListeners: ((status: SyncStatus) => void)[] = [];

export function getSyncStatus(): SyncStatus {
  return { ...activeSyncStatus };
}

export function subscribeSyncStatus(listener: (status: SyncStatus) => void): () => void {
  syncListeners.push(listener);
  listener(activeSyncStatus);
  return () => {
    const idx = syncListeners.indexOf(listener);
    if (idx !== -1) syncListeners.splice(idx, 1);
  };
}

function updateSyncStatus(updates: Partial<SyncStatus>): void {
  activeSyncStatus = { ...activeSyncStatus, ...updates };
  if (updates.lastFirebaseSyncTime) {
    safeStorage.setItem('bursar_last_firebase_sync_time', updates.lastFirebaseSyncTime);
  }
  syncListeners.forEach((fn) => fn(activeSyncStatus));
}

export function recordFirebaseSyncStart(): void {
  updateSyncStatus({
    syncError: null,
  });
}

export function recordFirebaseSyncSuccess(): void {
  updateSyncStatus({
    lastFirebaseSyncTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    syncError: null,
  });
}

export function recordFirebaseSyncError(err: string): void {
  updateSyncStatus({
    syncError: err,
  });
}

// Aliases for sync callbacks
export const recordSheetsSyncStart = recordFirebaseSyncStart;
export const recordSheetsSyncSuccess = recordFirebaseSyncSuccess;
export const recordSheetsSyncError = recordFirebaseSyncError;


// Convenience Aliases for consistent multi-component terminology
export const loadExpensesFromFirestore = getExpensesFromFirestore;
export const loadScholarshipsFromFirestore = getScholarshipsFromFirestore;
export const loadStaffFromFirestore = getStaffFromFirestore;
export const saveStaffMemberToFirestore = saveStaffToFirestore;
export const loadPayrollFromFirestore = getPayrollFromFirestore;
export const savePayrollRecordToFirestore = savePayrollToFirestore;
export const subscribeToExpenses = subscribeExpensesFromFirestore;
export const subscribeToStudents = subscribeStudentsFromFirestore;
export const subscribeToStaff = subscribeStaffFromFirestore;
export const subscribeToPayroll = subscribePayrollFromFirestore;
export const subscribeToScholarships = subscribeScholarshipsFromFirestore;
export const subscribeToRemittances = subscribeRemittancesFromFirestore;
export const loadStudentsFromFirestore = getStudentsFromFirestore;

/**
 * ============================================================================
 * CLEAN SLATE CLOUD WIPING REPOSITORIES
 * ============================================================================
 */

/**
 * Wipes all students for a specific school from Firestore
 */
export async function wipeSchoolStudentsFromFirestore(schoolId: string = 'dominion-group'): Promise<boolean> {
  const firestore = getFirebaseDb();
  if (!firestore) return false;
  const targetSchool = schoolId.toLowerCase();
  const targetPath = `schools/${targetSchool}/students`;
  try {
    const colRef = collection(firestore, 'schools', targetSchool, 'students');
    const snapshot = await getDocs(colRef);
    if (snapshot.empty) return true;

    const CHUNK_SIZE = 450;
    const docs = snapshot.docs;
    for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
      const chunk = docs.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(firestore);
      chunk.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    recordFirebaseSyncSuccess();
    return true;
  } catch (err) {
    console.warn('[Firestore] Error wiping students from cloud:', err);
    try {
      handleFirestoreError(err, OperationType.DELETE, targetPath);
    } catch {
      return false;
    }
  }
}

/**
 * Wipes all remittances for a specific school from Firestore
 */
export async function wipeSchoolRemittancesFromFirestore(schoolId: string = 'dominion-group'): Promise<boolean> {
  const firestore = getFirebaseDb();
  if (!firestore) return false;
  const targetSchool = schoolId.toLowerCase();
  const targetPath = `schools/${targetSchool}/remittances`;
  try {
    const colRef = collection(firestore, 'schools', targetSchool, 'remittances');
    const snapshot = await getDocs(colRef);
    if (snapshot.empty) return true;

    const CHUNK_SIZE = 450;
    const docs = snapshot.docs;
    for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
      const chunk = docs.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(firestore);
      chunk.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    recordFirebaseSyncSuccess();
    return true;
  } catch (err) {
    console.warn('[Firestore] Error wiping remittances from cloud:', err);
    try {
      handleFirestoreError(err, OperationType.DELETE, targetPath);
    } catch {
      return false;
    }
  }
}

/**
 * Wipes all scholarships for a specific school from Firestore
 */
export async function wipeSchoolScholarshipsFromFirestore(schoolId: string = 'dominion-group'): Promise<boolean> {
  const firestore = getFirebaseDb();
  if (!firestore) return false;
  const targetSchool = schoolId.toLowerCase();
  const targetPath = `schools/${targetSchool}/scholarships`;
  try {
    const colRef = collection(firestore, 'schools', targetSchool, 'scholarships');
    const snapshot = await getDocs(colRef);
    if (snapshot.empty) return true;

    const CHUNK_SIZE = 450;
    const docs = snapshot.docs;
    for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
      const chunk = docs.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(firestore);
      chunk.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    recordFirebaseSyncSuccess();
    return true;
  } catch (err) {
    console.warn('[Firestore] Error wiping scholarships from cloud:', err);
    try {
      handleFirestoreError(err, OperationType.DELETE, targetPath);
    } catch {
      return false;
    }
  }
}

/**
 * Wipes all expenses for a specific school from Firestore
 */
export async function wipeSchoolExpensesFromFirestore(schoolId: string = 'dominion-group'): Promise<boolean> {
  const firestore = getFirebaseDb();
  if (!firestore) return false;
  const targetSchool = schoolId.toLowerCase();
  const targetPath = `schools/${targetSchool}/expenses`;
  try {
    const colRef = collection(firestore, 'schools', targetSchool, 'expenses');
    const snapshot = await getDocs(colRef);
    if (snapshot.empty) return true;

    const CHUNK_SIZE = 450;
    const docs = snapshot.docs;
    for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
      const chunk = docs.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(firestore);
      chunk.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    recordFirebaseSyncSuccess();
    return true;
  } catch (err) {
    console.warn('[Firestore] Error wiping expenses from cloud:', err);
    try {
      handleFirestoreError(err, OperationType.DELETE, targetPath);
    } catch {
      return false;
    }
  }
}

/**
 * Master clean slate cloud wipe function:
 * Wipes active students, remittances, scholarships, and expenses from Firestore,
 * while keeping historical snapshots in backups intact.
 */
export async function wipeSchoolDataForCleanSlate(schoolId: string = 'dominion-group'): Promise<boolean> {
  try {
    await Promise.allSettled([
      wipeSchoolStudentsFromFirestore(schoolId),
      wipeSchoolRemittancesFromFirestore(schoolId),
      wipeSchoolScholarshipsFromFirestore(schoolId),
      wipeSchoolExpensesFromFirestore(schoolId),
    ]);
    return true;
  } catch (e) {
    console.warn('[Firestore] Error in wipeSchoolDataForCleanSlate:', e);
    return false;
  }
}
