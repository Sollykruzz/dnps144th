/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { safeStorage } from './safeStorage';
import { getFirebaseDb, sanitizeDocId, sanitizeForFirestore, handleFirestoreError, OperationType, recordFirebaseSyncSuccess } from './firebase';
import { doc, getDoc, setDoc, getDocs, collection } from 'firebase/firestore';
import { recordAuditLog } from './auditLoggerService';

export type UserRole = 'admin' | 'bursar';

export interface SystemUserAccount {
  id: string; // 'admin' | 'bursar'
  username: string; // e.g. 'admin' or 'bursar'
  password: string; // plain or hashed passcode string
  fullName: string;
  role: UserRole;
  title: string;
  email?: string;
  phone?: string;
  lastLoginAt?: string;
  updatedAt: string;
  updatedBy?: string;
}

const STORAGE_USERS_PREFIX = 'eminent_system_accounts_v1_';

export const DEFAULT_USERS: Record<UserRole, SystemUserAccount> = {
  admin: {
    id: 'admin',
    username: 'admin',
    password: 'admin123',
    fullName: 'School Administrator (Proprietor)',
    role: 'admin',
    title: 'School Administrator / Principal',
    email: 'admin@dominion.edu.ng',
    updatedAt: new Date().toISOString(),
  },
  bursar: {
    id: 'bursar',
    username: 'bursar',
    password: 'bursar123',
    fullName: 'Chief School Bursar',
    role: 'bursar',
    title: 'School Bursar & Accounts Officer',
    email: 'bursar@dominion.edu.ng',
    updatedAt: new Date().toISOString(),
  },
};

function getStorageKey(schoolId: string = 'dominion-group'): string {
  return `${STORAGE_USERS_PREFIX}${schoolId.toLowerCase().trim()}`;
}

/**
 * Loads system user accounts for the school, merging defaults with stored data
 */
export function getStoredSystemUsers(schoolId: string = 'dominion-group'): Record<UserRole, SystemUserAccount> {
  const key = getStorageKey(schoolId);
  try {
    const raw = safeStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.admin && parsed.bursar) {
        return {
          admin: { ...DEFAULT_USERS.admin, ...parsed.admin },
          bursar: { ...DEFAULT_USERS.bursar, ...parsed.bursar },
        };
      }
    }
  } catch (e) {
    console.warn('[UserAccountService] Error reading local user accounts:', e);
  }
  return { ...DEFAULT_USERS };
}

/**
 * Saves system user accounts to local storage
 */
export function saveStoredSystemUsers(
  users: Record<UserRole, SystemUserAccount>,
  schoolId: string = 'dominion-group'
): void {
  const key = getStorageKey(schoolId);
  try {
    safeStorage.setItem(key, JSON.stringify(users));
  } catch (e) {
    console.warn('[UserAccountService] Error saving local user accounts:', e);
  }
}

/**
 * Fetches user accounts from Firestore for real-time multi-device sync
 */
export async function fetchSystemUsersFromFirestore(
  schoolId: string = 'dominion-group'
): Promise<Record<UserRole, SystemUserAccount>> {
  const targetSchool = schoolId.toLowerCase().trim();
  const firestore = getFirebaseDb();
  const localUsers = getStoredSystemUsers(targetSchool);

  if (!firestore) return localUsers;

  const targetPath = `schools/${targetSchool}/system_users`;
  try {
    const colRef = collection(firestore, 'schools', targetSchool, 'system_users');
    const snapshot = await getDocs(colRef);
    const cloudUsers = { ...localUsers };

    snapshot.forEach((docSnap) => {
      const data = docSnap.data() as SystemUserAccount;
      if (data && data.role && (data.role === 'admin' || data.role === 'bursar')) {
        cloudUsers[data.role] = { ...cloudUsers[data.role], ...data };
      }
    });

    saveStoredSystemUsers(cloudUsers, targetSchool);
    recordFirebaseSyncSuccess();
    return cloudUsers;
  } catch (err) {
    console.warn('[Firestore] Error fetching system users:', err);
    try {
      handleFirestoreError(err, OperationType.GET, targetPath);
    } catch {
      // ignore
    }
    return localUsers;
  }
}

/**
 * Syncs user to Firestore
 */
export async function saveUserToFirestore(
  user: SystemUserAccount,
  schoolId: string = 'dominion-group'
): Promise<boolean> {
  const targetSchool = schoolId.toLowerCase().trim();
  const firestore = getFirebaseDb();
  if (!firestore || !user.id) return false;

  const targetPath = `schools/${targetSchool}/system_users/${sanitizeDocId(user.id)}`;
  try {
    const docRef = doc(firestore, 'schools', targetSchool, 'system_users', sanitizeDocId(user.id));
    await setDoc(docRef, sanitizeForFirestore({
      ...user,
      updatedAt: new Date().toISOString(),
    }), { merge: true });
    recordFirebaseSyncSuccess();
    return true;
  } catch (err) {
    console.warn('[Firestore] Error saving system user:', user.id, err);
    try {
      handleFirestoreError(err, OperationType.WRITE, targetPath);
    } catch {
      // ignore
    }
    return false;
  }
}

/**
 * Authenticates user credentials against local/cloud accounts
 */
export async function authenticateCredentials(
  usernameInput: string,
  passwordInput: string,
  schoolId: string = 'dominion-group'
): Promise<{ success: boolean; user?: SystemUserAccount; error?: string }> {
  const cleanUsername = usernameInput.trim().toLowerCase();
  const cleanPassword = passwordInput.trim();

  if (!cleanUsername) {
    return { success: false, error: 'Please enter your username.' };
  }
  if (!cleanPassword) {
    return { success: false, error: 'Please enter your password.' };
  }

  // First check local/cached accounts
  let users = getStoredSystemUsers(schoolId);

  // Attempt to find match
  let matchedRole: UserRole | null = null;
  if (users.admin.username.toLowerCase() === cleanUsername) {
    matchedRole = 'admin';
  } else if (users.bursar.username.toLowerCase() === cleanUsername) {
    matchedRole = 'bursar';
  }

  // If not found locally, try fetching cloud users once
  if (!matchedRole) {
    try {
      users = await fetchSystemUsersFromFirestore(schoolId);
      if (users.admin.username.toLowerCase() === cleanUsername) {
        matchedRole = 'admin';
      } else if (users.bursar.username.toLowerCase() === cleanUsername) {
        matchedRole = 'bursar';
      }
    } catch (e) {
      console.warn('Error fetching cloud users during login:', e);
    }
  }

  if (!matchedRole) {
    return { success: false, error: 'Invalid username. Account not found.' };
  }

  const targetAccount = users[matchedRole];
  if (targetAccount.password !== cleanPassword) {
    return { success: false, error: 'Incorrect password. Please verify your credentials.' };
  }

  // Update last login
  const updatedUser: SystemUserAccount = {
    ...targetAccount,
    lastLoginAt: new Date().toISOString(),
  };

  users[matchedRole] = updatedUser;
  saveStoredSystemUsers(users, schoolId);
  saveUserToFirestore(updatedUser, schoolId).catch(() => {});

  recordAuditLog(
    'SYSTEM',
    'USER_LOGIN',
    `User logged in successfully as ${updatedUser.fullName} (${matchedRole.toUpperCase()})`,
    { username: updatedUser.username, role: matchedRole },
    updatedUser.fullName,
    schoolId,
    'INFO'
  );

  return { success: true, user: updatedUser };
}

/**
 * Updates credentials for either Admin or Bursar (strictly restricted to Admin)
 */
export async function updateSystemAccount(
  targetRole: UserRole,
  updates: {
    username?: string;
    password?: string;
    fullName?: string;
    title?: string;
  },
  performerAdminName: string,
  schoolId: string = 'dominion-group'
): Promise<{ success: boolean; updatedUsers: Record<UserRole, SystemUserAccount>; message?: string }> {
  const users = getStoredSystemUsers(schoolId);
  const currentTarget = users[targetRole];

  const newUsername = updates.username?.trim() || currentTarget.username;
  const newPassword = updates.password?.trim() || currentTarget.password;
  const newFullName = updates.fullName?.trim() || currentTarget.fullName;
  const newTitle = updates.title?.trim() || currentTarget.title;

  if (!newUsername) {
    return { success: false, updatedUsers: users, message: 'Username cannot be empty.' };
  }
  if (!newPassword || newPassword.length < 3) {
    return { success: false, updatedUsers: users, message: 'Password must be at least 3 characters long.' };
  }

  // Ensure usernames don't conflict
  const otherRole: UserRole = targetRole === 'admin' ? 'bursar' : 'admin';
  if (users[otherRole].username.toLowerCase() === newUsername.toLowerCase()) {
    return { success: false, updatedUsers: users, message: `Username "${newUsername}" is already used by the ${otherRole} account.` };
  }

  const updatedAccount: SystemUserAccount = {
    ...currentTarget,
    username: newUsername,
    password: newPassword,
    fullName: newFullName,
    title: newTitle,
    updatedAt: new Date().toISOString(),
    updatedBy: performerAdminName,
  };

  const updatedUsers = {
    ...users,
    [targetRole]: updatedAccount,
  };

  saveStoredSystemUsers(updatedUsers, schoolId);
  await saveUserToFirestore(updatedAccount, schoolId);

  recordAuditLog(
    'SETTINGS',
    'UPDATE_CREDENTIALS',
    `Admin (${performerAdminName}) updated credentials for ${targetRole.toUpperCase()} account (Username: ${newUsername}, Name: ${newFullName})`,
    { targetRole, newUsername, newFullName },
    performerAdminName,
    schoolId,
    'SUCCESS'
  );

  return { success: true, updatedUsers, message: `Successfully updated ${targetRole.toUpperCase()} credentials!` };
}
