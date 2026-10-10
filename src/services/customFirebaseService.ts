/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { safeStorage } from './safeStorage';
import defaultAppletConfig from '../../firebase-applet-config.json';
import type { AppBrandingConfig } from '../types';

export interface FirebaseDeploymentConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  firestoreDatabaseId: string;
  isCustom: boolean;
  source: 'env' | 'storage' | 'default';
}

const CUSTOM_FIREBASE_STORAGE_KEY = 'eminent_custom_firebase_config_v1';

/**
 * Pre-configured parameters for the Dominion Nursery & Primary School (DNPS) Firebase project
 */
export const DNPS_PRESET_CONFIG = {
  apiKey: defaultAppletConfig.apiKey || '',
  projectId: defaultAppletConfig.projectId || 'marklar-galaxy-gt8c4',
  authDomain: defaultAppletConfig.authDomain || 'marklar-galaxy-gt8c4.firebaseapp.com',
  storageBucket: defaultAppletConfig.storageBucket || 'marklar-galaxy-gt8c4.firebasestorage.app',
  messagingSenderId: defaultAppletConfig.messagingSenderId || '32177093264',
  appId: defaultAppletConfig.appId || '1:32177093264:web:c4fe45306cf27098413615',
  firestoreDatabaseId: defaultAppletConfig.firestoreDatabaseId || 'dnpspay',
};

/**
 * Validates if an API key is a genuine Firebase Web API key rather than a placeholder string
 */
export function isRealApiKey(key: string | undefined | null): boolean {
  if (!key) return false;
  const trimmed = key.trim();
  if (trimmed.length < 15) return false;
  const lower = trimmed.toLowerCase();
  if (
    lower.includes('your firebase api key') ||
    lower.includes('placeholder') ||
    lower.includes('my_firebase_api_key') ||
    lower.includes('<your') ||
    lower.includes('api_key_here') ||
    lower.startsWith('my_')
  ) {
    return false;
  }
  return true;
}

/**
 * Retrieves the stored custom Firebase configuration from safeStorage if present
 */
export function getStoredCustomConfig(): Partial<FirebaseDeploymentConfig> | null {
  try {
    const raw = safeStorage.getItem(CUSTOM_FIREBASE_STORAGE_KEY);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('[CustomFirebase] Error reading stored config:', err);
  }
  return null;
}

/**
 * Returns the effective Firebase config by checking:
 * 1. Custom settings stored in browser local storage
 * 2. Vercel / Vite Environment variables (VITE_FIREBASE_*)
 * 3. Default applet config
 */
export function getActiveFirebaseConfig(): FirebaseDeploymentConfig {
  // 1. Check local storage override
  try {
    const raw = safeStorage.getItem(CUSTOM_FIREBASE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.projectId && isRealApiKey(parsed.apiKey)) {
        const cleanProjectId = parsed.projectId.trim();
        const isDefaultProject = cleanProjectId === defaultAppletConfig.projectId;
        if (!isDefaultProject) {
          return {
            apiKey: parsed.apiKey.trim(),
            authDomain: parsed.authDomain || `${cleanProjectId}.firebaseapp.com`,
            projectId: cleanProjectId,
            storageBucket: parsed.storageBucket || `${cleanProjectId}.firebasestorage.app`,
            messagingSenderId: parsed.messagingSenderId || '',
            appId: parsed.appId || '',
            firestoreDatabaseId: (parsed.firestoreDatabaseId && parsed.firestoreDatabaseId !== '(default)') 
              ? parsed.firestoreDatabaseId 
              : '(default)',
            isCustom: true,
            source: 'storage',
          };
        }
      }
    }
  } catch (err) {
    console.warn('[CustomFirebase] Error reading stored config:', err);
  }

  // 2. Check Vite / Vercel Environment Variables
  const env = (import.meta as any).env || {};
  if (
    env.VITE_FIREBASE_PROJECT_ID &&
    env.VITE_FIREBASE_PROJECT_ID !== defaultAppletConfig.projectId &&
    isRealApiKey(env.VITE_FIREBASE_API_KEY)
  ) {
    return {
      apiKey: env.VITE_FIREBASE_API_KEY.trim(),
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN || `${env.VITE_FIREBASE_PROJECT_ID}.firebaseapp.com`,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET || `${env.VITE_FIREBASE_PROJECT_ID}.firebasestorage.app`,
      messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
      appId: env.VITE_FIREBASE_APP_ID || '',
      firestoreDatabaseId: env.VITE_FIREBASE_DATABASE_ID || '(default)',
      isCustom: true,
      source: 'env',
    };
  }

  // 3. Fallback to default Applet config
  return {
    apiKey: defaultAppletConfig.apiKey,
    authDomain: defaultAppletConfig.authDomain,
    projectId: defaultAppletConfig.projectId,
    storageBucket: defaultAppletConfig.storageBucket,
    messagingSenderId: defaultAppletConfig.messagingSenderId,
    appId: defaultAppletConfig.appId,
    firestoreDatabaseId: defaultAppletConfig.firestoreDatabaseId || 'dnpspay',
    isCustom: false,
    source: 'default',
  };
}

/**
 * Saves custom Firebase project credentials to safeStorage
 */
export function saveCustomFirebaseConfig(config: {
  apiKey: string;
  projectId: string;
  authDomain?: string;
  storageBucket?: string;
  messagingSenderId?: string;
  appId?: string;
  firestoreDatabaseId?: string;
}): void {
  const clean = {
    apiKey: config.apiKey.trim(),
    projectId: config.projectId.trim(),
    authDomain: config.authDomain?.trim() || `${config.projectId.trim()}.firebaseapp.com`,
    storageBucket: config.storageBucket?.trim() || `${config.projectId.trim()}.firebasestorage.app`,
    messagingSenderId: config.messagingSenderId?.trim() || '',
    appId: config.appId?.trim() || '',
    firestoreDatabaseId: config.firestoreDatabaseId?.trim() || '(default)',
  };

  safeStorage.setItem(CUSTOM_FIREBASE_STORAGE_KEY, JSON.stringify(clean));
}

/**
 * Clears custom Firebase credentials and reverts back to default / environment config
 */
export function clearCustomFirebaseConfig(): void {
  safeStorage.removeItem(CUSTOM_FIREBASE_STORAGE_KEY);
}

function getLocalBrandingConfig(): Partial<AppBrandingConfig> {
  try {
    const raw = safeStorage.getItem('eminent_app_branding_v1');
    if (raw) return JSON.parse(raw);
  } catch {
    // Ignore error
  }
  return {};
}

/**
 * Generates the complete Vercel / production .env template string populated with current school branding & Firebase config
 */
export function generateVercelEnvTemplate(branding?: AppBrandingConfig, fbConfig?: FirebaseDeploymentConfig): string {
  const localB = getLocalBrandingConfig();
  const b = branding || {
    appName: localB.appName || 'Dominion Group Of Schools',
    shortName: localB.shortName || 'DOMINION A/C',
    tagline: localB.tagline || 'Automated School Fee & Bursary Management System',
    primaryColor: localB.primaryColor || '#0044B5',
    currencySymbol: localB.currencySymbol || '₦',
    schoolAddress: localB.schoolAddress || 'Keffi, Nasarawa State, Nigeria',
    schoolPhone: localB.schoolPhone || '+234 800 000 0000',
    schoolEmail: localB.schoolEmail || 'bursary@dominion.edu.ng',
    taxOrRegNo: localB.taxOrRegNo || 'MOE/NAS/SEC/2026/894',
    logoType: localB.logoType || 'default_crest',
    customLogoData: localB.customLogoData || '',
    presetEmblem: localB.presetEmblem || 'crown',
    emblemColor: localB.emblemColor || '#0044B5',
    bursarTitle: localB.bursarTitle || 'Authorized Bursar / Accounts Officer',
    receiptFooterText: localB.receiptFooterText || 'Official School Fee & Bursary Computerized Payment Receipt.',
    enableWatermark: true,
  };
  const fb = fbConfig || getActiveFirebaseConfig();

  return `# =================================================================
# BURSAR MANAGEMENT SYSTEM - VERCEL ENVIRONMENT CONFIGURATION
# Generated for: ${b.appName}
# =================================================================

# 1. School Identity & White-Label Customization
VITE_APP_NAME="${b.appName}"
VITE_APP_SHORT_NAME="${b.shortName}"
VITE_APP_TAGLINE="${b.tagline}"
VITE_PRIMARY_COLOR="${b.primaryColor}"
VITE_CURRENCY_SYMBOL="${b.currencySymbol}"
VITE_SCHOOL_ADDRESS="${b.schoolAddress}"
VITE_SCHOOL_PHONE="${b.schoolPhone}"
VITE_SCHOOL_EMAIL="${b.schoolEmail}"
VITE_SCHOOL_REG_NO="${b.taxOrRegNo}"
VITE_APP_LOGO_URL="${b.logoType === 'url' ? (b.customLogoData || '') : ''}"

# 2. Dedicated Cloud Firestore Database Credentials
# (Obtain these from your Firebase Console -> Project Settings -> General -> Web App)
VITE_FIREBASE_API_KEY="${fb.apiKey}"
VITE_FIREBASE_AUTH_DOMAIN="${fb.authDomain}"
VITE_FIREBASE_PROJECT_ID="${fb.projectId}"
VITE_FIREBASE_STORAGE_BUCKET="${fb.storageBucket}"
VITE_FIREBASE_MESSAGING_SENDER_ID="${fb.messagingSenderId}"
VITE_FIREBASE_APP_ID="${fb.appId}"
VITE_FIREBASE_DATABASE_ID="${fb.firestoreDatabaseId || '(default)'}"
`;
}

/**
 * Generates the official Firestore Security Rules (firestore.rules) required for the school's private Firebase project
 */
export function generateFirestoreRulesTemplate(): string {
  return `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isAuthenticated() {
      return request.auth != null;
    }

    function isSafeId(id) {
      return id is string && id.size() > 0 && id.size() <= 256;
    }

    // Connectivity test collection for latency ping
    match /test/{docId} {
      allow read, write: if true;
    }

    // Master School Isolation Boundary & all its subcollections
    match /schools/{schoolId} {
      allow read, write: if isSafeId(schoolId);

      // 1. Students subcollection
      match /students/{studentId} {
        allow read, write: if isSafeId(studentId);
      }

      // 2. Scholarships subcollection
      match /scholarships/{scholarshipId} {
        allow read, write: if isSafeId(scholarshipId);
      }

      // 3. Operational Expenses subcollection
      match /expenses/{expenseId} {
        allow read, write: if isSafeId(expenseId);
      }

      // 3b. Extra Incomes subcollection
      match /extra_incomes/{incomeId} {
        allow read, write: if isSafeId(incomeId);
      }

      // 4. Staff Roster subcollection
      match /staff/{staffId} {
        allow read, write: if isSafeId(staffId);
      }

      // 5. Monthly Staff Payroll subcollection
      match /payroll/{payrollId} {
        allow read, write: if isSafeId(payrollId);
      }

      // 6. Audit Trail Logs (Append-only: No updates or deletes allowed)
      match /audit_logs/{logId} {
        allow read, create: if isSafeId(logId);
        allow update, delete: if false; // Immutable audit log security pillar
      }

      // 7. Academic Term Schedules
      match /term_schedules/{scheduleId} {
        allow read, write: if isSafeId(scheduleId);
      }

      // 8. Bursar Remittances
      match /remittances/{remittanceId} {
        allow read, write: if isSafeId(remittanceId);
      }

      // 9. System Users and Staff Role Accounts
      match /system_users/{userId} {
        allow read, write: if isSafeId(userId);
      }

      // 10. School Branding Configuration
      match /branding/{brandingId} {
        allow read, write: if isSafeId(brandingId);
      }

      // 11. Term Backups and Snapshots
      match /backups/{backupId} {
        allow read, write: if isSafeId(backupId);
      }

      // Catch-all for any other nested subcollections under a school
      match /{allChildren=**} {
        allow read, write: if true;
      }
    }

    // Root-level school and metadata documents catch-all
    match /{document=**} {
      allow read, write: if true;
    }
  }
}`;
}
