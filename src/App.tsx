/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { AlertTriangle, X
} from 'lucide-react';
import { 
  StudentPaymentRecord, 
  BursarSession, 
  PaymentReceipt,
  TabType,
  SchoolProfile,
  ScholarshipRecord,
  SchoolFeeSchedule,
  SheetApiConfig

} from './types';
import { 
  recordStudentPayments
} from './services/paymentService';
import type { PaymentLineInput } from './services/calculations';
import { 
  safeStorage, 
  getStoredStudents, 
  saveStoredStudents,
  getStoredScholarships,
  saveStoredScholarships,
  getStoredApiConfig,
  saveApiConfig,
  unmarkStudentDeleted,
  clearSchoolTombstones

} from './services/storage';
import { clearStoredIgnoredDuplicates } from './services/duplicateService';
import {
  applyCloudStaff,
  applyCloudPayroll
} from './services/payrollService';
import {
  saveStoredExpenses,
  getStoredExpenses,
  getPendingSyncIds,
  mergeCloudWithPending
} from './services/expenseService';
import { 
  getStoredSchools,
  saveStoredSchools,
  getActiveSchoolId,
  setActiveSchoolId,
  addSchool,
  updateSchool,
  deleteSchool,
  updateSchoolFeeSchedule
} from './services/schoolService';
import { 
  calculateBalance, 
  calculateStatus, 
  getTodayDateString,
  getClassFeeSchedule,
  deriveFeeBreakdown,
  buildCombinedReceipt,
  detectLessonPlanMonths,
  isLessonDisabled,
  setConfiguredAcademicSession,
  FEE_SCHEDULE

} from './services/calculations';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { StudentList } from './components/StudentList';
import { RecordPaymentView } from './components/RecordPaymentView';
import { AnalyticsView } from './components/AnalyticsView';
import { CollectionView } from './components/CollectionView';
import { BackupRolloverModal } from './components/BackupRolloverModal';
import { EndTermModal } from './components/EndTermModal';
import { StudentDetailsModal } from './components/StudentDetailsModal';
import { AddExistingStudentModal } from './components/AddExistingStudentModal';
import { ScholarshipModal } from './components/ScholarshipModal';
import { AdmissionView } from './components/AdmissionView';
import { SettingsModal } from './components/SettingsModal';
import { SchoolModal } from './components/SchoolModal';
import { LoginModal } from './components/LoginModal';
import { DuplicateCleanerModal } from './components/DuplicateCleanerModal';
import { PayrollView } from './components/PayrollView';
import { StudentUploadModal } from './components/StudentUploadModal';
import { AdditionalFeesModal } from './components/AdditionalFeesModal';
import { OfflineIndicator } from './components/OfflineIndicator';
import { recordAuditLog } from './services/auditLoggerService';
import {
  testConnection,
  subscribeAuthState,
  saveStudentToFirestore,
  savePaymentTransaction,
  getLastFirestoreWriteError,
  batchSaveStudentsToFirestore,
  getStudentsFromFirestore,
  subscribeStudentsFromFirestore,
  deleteStudentFromFirestore,
  saveScholarshipToFirestore,
  getScholarshipsFromFirestore,
  subscribeScholarshipsFromFirestore,
  deleteScholarshipFromFirestore,
  subscribeExpensesFromFirestore,
  subscribeStaffFromFirestore,
  subscribePayrollFromFirestore,
  getSyncStatus,
  subscribeSyncStatus,
  recordFirebaseSyncSuccess,
  wipeSchoolDataForCleanSlate,
  saveSchoolProfileToFirestore,
  getSchoolProfilesFromFirestore,
  subscribeSchoolsFromFirestore,
  SyncStatus,
  subscribeRemittancesFromFirestore,
  getRemittancesFromFirestore,
  subscribeBrandingFromFirestore
} from './services/firebase';
import { applyCloudBranding } from './services/brandingService';
import { 
  getSavedRemittances, 
  saveRemittances
} from './services/remittanceService';
import { RemittanceRecord } from './types';

const STORAGE_SESSION_KEY = 'bursar_session_profile';

export default function App() {
  // Navigation
  const [activeTab, setActiveTab] = useState<TabType>('students');

  // Multi-School Management
  const [schools, setSchools] = useState<SchoolProfile[]>(() => getStoredSchools());
  const [activeSchoolId, setActiveSchoolIdState] = useState<string>(() => getActiveSchoolId());

  // Derive active school safely
  const activeSchool: SchoolProfile = useMemo(() => {
    const found = schools.find((s) => s.id === activeSchoolId);
    return found || schools[0] || {
      id: 'dominion-group',
      name: 'Dominion Group Of Schools',
      type: 'combined',
      currencySymbol: '₦',
      classes: ['Kg1', 'Kg2', 'Nur1', 'Nur2', 'Pri1', 'Pri2', 'Pri3', 'Pri4', 'Pri5', 'Jss1', 'Jss2', 'Jss3', 'Ss1', 'Ss2', 'Ss3'],
      feeSchedule: {
        tuitionFee: 15000,
        admissionFee: 5000,
        examFee: 1500,
        lessonFeeMonthly: 2500,
        lessonFeeTermly: 7000,
      },
      sheetConfig: {
        apiUrl: '',
        apiKey: '',
        provider: 'generic',
      },
      createdAt: new Date().toISOString(),
    };
  }, [schools, activeSchoolId]);

  // The session set in Settings becomes the default everywhere in the app
  useEffect(() => {
    setConfiguredAcademicSession(activeSchool?.academicSession);
  }, [activeSchool?.academicSession, activeSchool?.id]);


  // Sheet API Configuration & Bursar Profile
  const [apiConfig, setApiConfig] = useState<SheetApiConfig>(() => {
    const currentSchool = schools.find((s) => s.id === activeSchoolId) || schools[0];
    if (currentSchool?.sheetConfig?.apiUrl) {
      return currentSchool.sheetConfig;
    }
    return getStoredApiConfig();
  });

  const [session, setSession] = useState<BursarSession>(() => {
    try {
      const stored = safeStorage.getItem(STORAGE_SESSION_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return {
          ...parsed,
          isAuthenticated: Boolean(parsed.isAuthenticated),
          schoolName: activeSchool?.name || parsed.schoolName || 'Dominion Group Of Schools',
          currencySymbol: activeSchool?.currencySymbol || parsed.currencySymbol || '₦',
          schoolId: activeSchool?.id || 'dominion-group',
        };
      }
    } catch (e) {
      console.error(e);
    }
    return {
      isAuthenticated: false,
      bursarName: 'Bursar',
      role: 'bursar',
      schoolName: activeSchool?.name || 'Dominion Group Of Schools',
      currencySymbol: activeSchool?.currencySymbol || '₦',
      schoolId: activeSchool?.id || 'dominion-group',
    };
  });

  // Keep session school details reactive to live activeSchool updates from Firestore
  useEffect(() => {
    if (activeSchool) {
      setSession((prev) => {
        if (
          prev.schoolName !== activeSchool.name ||
          prev.currencySymbol !== activeSchool.currencySymbol ||
          prev.schoolId !== activeSchool.id
        ) {
          return {
            ...prev,
            schoolName: activeSchool.name,
            currencySymbol: activeSchool.currencySymbol,
            schoolId: activeSchool.id,
          };
        }
        return prev;
      });
    }
  }, [activeSchool?.name, activeSchool?.currencySymbol, activeSchool?.id]);

  // Data & Network States
  const [students, setStudents] = useState<StudentPaymentRecord[]>(() => getStoredStudents(activeSchoolId));
  // Keys of payment attempts whose save is not confirmed yet (see handleSubmitPayment)
  const pendingPaymentKeysRef = useRef<Map<string, { key: string; createdAt: number }>>(new Map());
  const [scholarships, setScholarships] = useState<ScholarshipRecord[]>(() => getStoredScholarships(activeSchoolId));
  const [remittances, setRemittances] = useState<RemittanceRecord[]>(() => getSavedRemittances(activeSchoolId));
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(() => getSyncStatus());
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState<boolean>(() => 
    typeof navigator !== 'undefined' && 'onLine' in navigator ? navigator.onLine : true
  );

  // Track uploads that succeeded locally but failed to sync to Cloud Firestore
  const [unsyncedUploadInfo, setUnsyncedUploadInfo] = useState<{
    count: number;
    error: string;
    schoolId: string;
    students: StudentPaymentRecord[];
  } | null>(null);

  // Firestore Quota Exceeded Notification Dismissed State
  const [dismissedQuotaBanner, setDismissedQuotaBanner] = useState<boolean>(false);

  const isFirestoreQuotaExceeded = useMemo(() => {
    if (syncStatus?.syncError && (
      syncStatus.syncError.toLowerCase().includes('quota') ||
      syncStatus.syncError.toLowerCase().includes('resource-exhausted')
    )) {
      return true;
    }
    return false;
  }, [syncStatus?.syncError]);

  // Guard against accidental page refresh when upload records failed cloud sync (prevents silent data loss)
  useEffect(() => {
    if (!unsyncedUploadInfo) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = `Warning: You have ${unsyncedUploadInfo.count} uploaded student records saved in this browser only. Cloud Firestore was not updated. Refreshing or closing will revert to earlier cloud data and discard unsaved records.`;
      return e.returnValue;
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [unsyncedUploadInfo]);

  // Cloud Database Sync: Instant Firestore real-time listener & fast initial fetch
  useEffect(() => {
    const currentSchoolId = activeSchool?.id || 'dominion-group';
    let isCancelled = false;

    // Load local remittances immediately for current school
    setRemittances(getSavedRemittances(currentSchoolId));

    // Test Firestore connection on boot
    testConnection().then((res) => {
      if (res.success) {
        console.log(`[Firebase Cloud] Connected to Firestore (${res.latencyMs}ms latency)`);
      } else {
        console.warn(`[Firebase Cloud Status] ${res.message}`);
      }
    });

    // Listen to Auth State
    const unsubAuth = subscribeAuthState((firebaseUser) => {
      if (!isCancelled && firebaseUser && firebaseUser.displayName) {
        setSession((prev) => ({
          ...prev,
          bursarName: firebaseUser.displayName || prev.bursarName,
        }));
      }
    });

    // Listen to sync status
    const unsubStatus = subscribeSyncStatus((s) => {
      if (!isCancelled) setSyncStatus(s);
    });

    // 1. Instantly query Firestore cache (guarded against wiping local cache if quota or network fails)
    getStudentsFromFirestore(currentSchoolId)
      .then((cloudStudents) => {
        if (!isCancelled && cloudStudents && cloudStudents.length > 0) {
          setStudents(cloudStudents);
          saveStoredStudents(cloudStudents, currentSchoolId);
          recordFirebaseSyncSuccess();
        }
      })
      .catch((err) => {
        console.warn('[Firestore] Fast student load note:', err);
      });

    getScholarshipsFromFirestore(currentSchoolId)
      .then((cloudScholarships) => {
        if (!isCancelled && cloudScholarships && cloudScholarships.length > 0) {
          setScholarships(cloudScholarships);
          saveStoredScholarships(cloudScholarships, currentSchoolId);
        }
      })
      .catch(() => {});

    getRemittancesFromFirestore(currentSchoolId)
      .then((cloudRemittances) => {
        if (isCancelled || !cloudRemittances || cloudRemittances.length === 0) return;
        setRemittances(cloudRemittances);
        saveRemittances(cloudRemittances, currentSchoolId);
      })
      .catch((err) => {
        console.warn('[Firestore] App remittance fetch note:', err);
      });

    getSchoolProfilesFromFirestore()
      .then((cloudSchools) => {
        if (!isCancelled && cloudSchools && cloudSchools.length > 0) {
          setSchools(cloudSchools);
          saveStoredSchools(cloudSchools);
        }
      })
      .catch((err) => {
        console.warn('[Firestore] Initial schools fetch note:', err);
      });

    // 2. Real-time Firestore subscription for instant multi-device synchronization
    const unsubscribeStudents = subscribeStudentsFromFirestore(currentSchoolId, (liveStudents) => {
      if (!isCancelled && liveStudents) {
        if (import.meta.env.DEV) {
          console.log(
            `[Firestore Sync: Students] Scoped path: schools/${currentSchoolId.toLowerCase()}/students | Received: ${liveStudents.length} students`
          );
        }
        setStudents(liveStudents);
        saveStoredStudents(liveStudents, currentSchoolId);
        recordFirebaseSyncSuccess();
      }
    });

    const unsubscribeScholarships = subscribeScholarshipsFromFirestore(currentSchoolId, (liveSch) => {
      if (!isCancelled && liveSch) {
        setScholarships(liveSch);
        saveStoredScholarships(liveSch, currentSchoolId);
      }
    });

    const unsubscribeRemittances = subscribeRemittancesFromFirestore(currentSchoolId, (liveRemittances) => {
      if (!isCancelled && liveRemittances) {
        setRemittances(liveRemittances);
        saveRemittances(liveRemittances, currentSchoolId);
      }
    });

    const unsubscribeSchools = subscribeSchoolsFromFirestore((liveSchools) => {
      if (!isCancelled && liveSchools && liveSchools.length > 0) {
        if (import.meta.env.DEV) {
          console.log(
            `[Firestore Sync: Schools] Live school updates received (${liveSchools.length}):`,
            liveSchools.map((s) => s.id)
          );
        }
        setSchools(liveSchools);
        saveStoredSchools(liveSchools);
      }
    });

    const unsubscribeExpenses = subscribeExpensesFromFirestore(currentSchoolId, (liveExp) => {
      if (!isCancelled && Array.isArray(liveExp)) {
        // Keep expenses saved on this device that are still waiting to upload
        const { merged } = mergeCloudWithPending(
          liveExp,
          getStoredExpenses(currentSchoolId),
          getPendingSyncIds('expense', currentSchoolId)
        );
        saveStoredExpenses(merged, currentSchoolId);
      }
    });

    const unsubscribeStaff = subscribeStaffFromFirestore(currentSchoolId, (liveStaff) => {
      if (!isCancelled && Array.isArray(liveStaff)) {
        applyCloudStaff(liveStaff, currentSchoolId);
      }
    });

    const unsubscribePayroll = subscribePayrollFromFirestore(currentSchoolId, (livePayroll) => {
      if (!isCancelled && Array.isArray(livePayroll)) {
        applyCloudPayroll(livePayroll, currentSchoolId);
      }
    });

    const unsubscribeBranding = subscribeBrandingFromFirestore(currentSchoolId, (liveBranding) => {
      if (!isCancelled && liveBranding && liveBranding.appName) {
        applyCloudBranding(liveBranding, currentSchoolId);
      }
    });

    return () => {
      isCancelled = true;
      if (unsubAuth) unsubAuth();
      if (unsubStatus) unsubStatus();
      if (unsubscribeStudents) unsubscribeStudents();
      if (unsubscribeScholarships) unsubscribeScholarships();
      if (unsubscribeRemittances) unsubscribeRemittances();
      if (unsubscribeSchools) unsubscribeSchools();
      if (unsubscribeExpenses) unsubscribeExpenses();
      if (unsubscribeStaff) unsubscribeStaff();
      if (unsubscribePayroll) unsubscribePayroll();
      if (unsubscribeBranding) unsubscribeBranding();
    };
  }, [activeSchool?.id]);

  const pendingRemittanceCount = useMemo(() => {
    return remittances.filter((r) => r.status === 'pending' || r.approvalStatus === 'pending').length;
  }, [remittances]);

  // Modals & Interactive States
  const [selectedStudentForDetails, setSelectedStudentForDetails] = useState<StudentPaymentRecord | null>(null);
  const [studentForPayment, setStudentForPayment] = useState<StudentPaymentRecord | null>(null);
  const [studentToGrantScholarship, setStudentToGrantScholarship] = useState<StudentPaymentRecord | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isAddStudentOpen, setIsAddStudentOpen] = useState<boolean>(false);
  const [isScholarshipModalOpen, setIsScholarshipModalOpen] = useState<boolean>(false);
  const [isRolloverModalOpen, setIsRolloverModalOpen] = useState<boolean>(false);
  const [isEndTermOpen, setIsEndTermOpen] = useState<boolean>(false);
  const [isDuplicateCleanerOpen, setIsDuplicateCleanerOpen] = useState<boolean>(false);
  const [isSheetUploadOpen, setIsSheetUploadOpen] = useState<boolean>(false);
  const [isAdditionalFeesOpen, setIsAdditionalFeesOpen] = useState<boolean>(false);
  
  // School Modal state
  const [isSchoolModalOpen, setIsSchoolModalOpen] = useState<boolean>(false);
  const [schoolModalMode, setSchoolModalMode] = useState<'add' | 'edit'>('add');
  const [schoolToEdit, setSchoolToEdit] = useState<SchoolProfile | null>(null);

  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleUpdateStudentsFromDuplicateCleaner = (updated: StudentPaymentRecord[], message?: string) => {
    const currentSchoolId = activeSchool?.id || 'dominion-group';
    setStudents(updated);
    saveStoredStudents(updated, currentSchoolId);
    if (message) {
      showToast(message);
    }
  };

  const handleReplaceAllStudents = (updated: StudentPaymentRecord[]) => {
    const currentSchoolId = activeSchool?.id || 'dominion-group';
    setStudents(updated);
    saveStoredStudents(updated, currentSchoolId);
    showToast(`✓ Replaced local database with ${updated.length} student records from Cloud Firestore`);
  };

  const handleUpdateSchoolFromFees = (updatedSchool: SchoolProfile) => {
    const currentSchools = getStoredSchools();
    const updated = currentSchools.map((s) => (s.id === updatedSchool.id ? updatedSchool : s));
    saveStoredSchools(updated);
    setSchools(updated);
    saveSchoolProfileToFirestore(updatedSchool).catch((err) => {
      console.warn('[Firestore] Save school additional fees note:', err);
    });
  };

  const handleUpdateStudentsFromFees = (updatedStudents: StudentPaymentRecord[]) => {
    const currentSchoolId = activeSchool?.id || 'dominion-group';
    setStudents(updatedStudents);
    saveStoredStudents(updatedStudents, currentSchoolId);
    batchSaveStudentsToFirestore(updatedStudents, currentSchoolId).catch((err) => {
      console.warn('[Firestore] Batch save students additional fees note:', err);
    });
  };

  // Clean up legacy mock data on initial load
  useEffect(() => {
    try {
      const mockIds = new Set(['ERCA/0001', 'ERCA/0002', 'ERCA/0003', 'ERCA/0004', 'ERCA/0005', 'ERCA/0010']);
      const currentSchoolId = activeSchool?.id || 'dominion-group';
      const raw = getStoredStudents(currentSchoolId);
      const cleaned = raw.filter((s) => !mockIds.has(String(s.id || '').trim()));
      if (cleaned.length !== raw.length) {
        saveStoredStudents(cleaned, currentSchoolId);
        setStudents(cleaned);
      }
    } catch (e) {
      console.warn('[Startup Clean] Legacy purge error:', e);
    }
  }, [activeSchool?.id]);

  // Track online/offline status
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Instant local-first student & scholarship loader with Firestore cloud sync
  const loadStudents = useCallback(async (isManualRefresh = false) => {
    const currentSchoolId = activeSchoolId || 'dominion-group';

    if (isManualRefresh) {
      setIsLoading(true);
    }

    try {
      const cachedStudents = getStoredStudents(currentSchoolId);
      const cachedSch = getStoredScholarships(currentSchoolId);
      
      // Update local state if currently empty or manual refresh
      setStudents((prev) => (prev.length === 0 || isManualRefresh ? cachedStudents : prev));
      setScholarships((prev) => (prev.length === 0 || isManualRefresh ? cachedSch : prev));
      setError(null);

      // Fetch fresh updates from Firestore cloud database without blocking UI
      const [cloudStudents, cloudScholarships] = await Promise.all([
        getStudentsFromFirestore(currentSchoolId, 10000),
        getScholarshipsFromFirestore(currentSchoolId, 10000),
      ]);

      if (cloudStudents) {
        setStudents(cloudStudents);
        saveStoredStudents(cloudStudents, currentSchoolId);
      }
      if (cloudScholarships) {
        setScholarships(cloudScholarships);
        saveStoredScholarships(cloudScholarships, currentSchoolId);
      }
      recordFirebaseSyncSuccess();
      if (isManualRefresh) {
        const count = cloudStudents ? cloudStudents.length : 0;
        showToast(`Cloud Database Synced: ${count} student records active.`);
      }
    } catch (err: any) {
      console.warn('[Firestore Sync Notice]:', err);
      if (isManualRefresh) {
        const cached = getStoredStudents(currentSchoolId);
        showToast(`Loaded ${cached.length} students from database.`);
      }
    } finally {
      if (isManualRefresh) {
        setIsLoading(false);
      }
    }
  }, [activeSchoolId]);

  // Load students when active school changes
  useEffect(() => {
    loadStudents();
  }, [activeSchoolId, loadStudents]);

  // Switch Active School
  const handleSelectSchool = (schoolId: string) => {
    const target = schools.find((s) => s.id === schoolId);
    if (!target) return;

    // Save active school pointer
    setActiveSchoolId(schoolId);
    setActiveSchoolIdState(schoolId);

    // Update API config to target school's sheet
    const targetConfig: SheetApiConfig = target.sheetConfig || getStoredApiConfig(target.id) || {
      apiUrl: '',
      apiKey: '',
      provider: 'generic',
    };
    saveApiConfig(targetConfig, target.id);
    setApiConfig(targetConfig);

    // Update session
    const updatedSession: BursarSession = {
      ...session,
      schoolName: target.name,
      currencySymbol: target.currencySymbol,
      schoolId: target.id,
    };
    setSession(updatedSession);
    try {
      safeStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(updatedSession));
    } catch (e) {
      console.error(e);
    }

    // Load scholarships for selected school
    const schoolSch = getStoredScholarships(schoolId);
    setScholarships(schoolSch);

    // Reset preselected student & student details
    setSelectedStudentForDetails(null);
    setStudentForPayment(null);

    showToast(`Switched to ${target.name} dashboard.`);
  };

  // Open Add School Modal
  const handleOpenAddSchool = () => {
    setSchoolModalMode('add');
    setSchoolToEdit(null);
    setIsSchoolModalOpen(true);
  };

  // Open Edit School Modal
  const handleOpenEditSchool = (school: SchoolProfile) => {
    setSchoolModalMode('edit');
    setSchoolToEdit(school);
    setIsSchoolModalOpen(true);
  };

  // Save School (Add or Edit)
  const handleSaveSchool = (
    schoolData: Omit<SchoolProfile, 'id' | 'createdAt'>,
    schoolId?: string,
    options?: { skipStudentFeeSync?: boolean }
  ) => {
    if (schoolId) {
      // Edit existing
      const before = getStoredSchools().find((s) => s.id === schoolId);
      const updated = updateSchool(schoolId, schoolData);
      const allSchools = getStoredSchools();
      setSchools(allSchools);

      if (schoolId === activeSchoolId) {
        setSession((prev) => ({
          ...prev,
          schoolName: updated.name,
          currencySymbol: updated.currencySymbol,
        }));

        // Re rate students only when the fee schedule really changed, and only when the
        // caller (Settings) has not already handled it according to its own switch.
        const scheduleChanged =
          JSON.stringify(before?.feeSchedule || {}) !== JSON.stringify(updated.feeSchedule || {}) ||
          JSON.stringify(before?.classFeeSchedules || {}) !== JSON.stringify(updated.classFeeSchedules || {});
        if (scheduleChanged && !options?.skipStudentFeeSync) {
          handleUpdateStudentsFee(
            schoolData.feeSchedule || updated.feeSchedule,
            schoolData.classFeeSchedules || updated.classFeeSchedules
          );
        }
      }

      showToast(`Updated ${updated.name} profile & fee schedule.`);
    } else {
      // Add new school
      const created = addSchool(schoolData);
      const allSchools = getStoredSchools();
      setSchools(allSchools);

      // Automatically switch to the newly created school dashboard
      handleSelectSchool(created.id);
      showToast(`Created & switched to ${created.name} dashboard!`);
    }
    setIsSchoolModalOpen(false);
  };

  // Update fee schedule across all enrolled students
  const handleUpdateStudentsFee = async (
    newScheduleOrTuition: SchoolFeeSchedule | number,
    classFeeSchedulesOverride?: Record<string, SchoolFeeSchedule>
  ) => {
    const currentSchoolId = activeSchool?.id || 'dominion-group';
    const baseSchedule: SchoolFeeSchedule = typeof newScheduleOrTuition === 'number'
      ? {
          tuitionFee: newScheduleOrTuition,
          admissionFee: activeSchool?.feeSchedule?.admissionFee ?? FEE_SCHEDULE.ADMISSION_FEE,
          examFee: activeSchool?.feeSchedule?.examFee ?? FEE_SCHEDULE.EXAM_FEE,
          lessonFeeMonthly: activeSchool?.feeSchedule?.lessonFeeMonthly ?? FEE_SCHEDULE.LESSON_FEE_MONTHLY,
          lessonFeeTermly: activeSchool?.feeSchedule?.lessonFeeTermly ?? FEE_SCHEDULE.LESSON_FEE_TERMLY,
        }
      : newScheduleOrTuition;

    const currentClassSchedules = classFeeSchedulesOverride !== undefined
      ? classFeeSchedulesOverride
      : activeSchool?.classFeeSchedules;

    // Update the school profile fee schedule permanently
    updateSchoolFeeSchedule(currentSchoolId, baseSchedule, currentClassSchedules);
    const updatedSchools = getStoredSchools();
    setSchools(updatedSchools);

    const schoolContext: SchoolProfile = {
      ...activeSchool,
      feeSchedule: baseSchedule,
      classFeeSchedules: currentClassSchedules,
    };

    const updated = students.map((st) => {
      const classSchedule = getClassFeeSchedule(schoolContext, st.class);
      const bd = deriveFeeBreakdown(st, schoolContext, { forceScheduleRates: true });

      // A fee the student has already paid in full keeps the amount it was settled at.
      const settledAt = (storedFee: unknown, paid: number): number | null => {
        const fee = Number(storedFee) || 0;
        return fee > 0 && paid >= fee ? fee : null;
      };

      const nextTuitionPaid = Number(st.tuition_paid || 0);
      const isExemptStudent = st.is_exempt_from_school_fee === true || (st.tuition_fee === 0 && Boolean(st.scholarship_notes));
      let nextTuition = 0;
      if (!isExemptStudent) {
        const settledTuition = settledAt(st.tuition_fee, nextTuitionPaid);
        if (settledTuition !== null) {
          nextTuition = settledTuition;
        } else if (st.scholarship_notes && st.tuition_fee !== undefined && st.tuition_fee < classSchedule.tuitionFee) {
          nextTuition = st.tuition_fee;
        } else {
          nextTuition = classSchedule.tuitionFee;
        }
      }

      const nextAdmissionPaid = Number(st.admission_paid || 0);
      const settledAdmission = settledAt(st.admission_fee, nextAdmissionPaid);
      const nextAdmission = settledAdmission !== null
        ? settledAdmission
        : (st.is_new_admission === true)
        ? classSchedule.admissionFee
        : (st.is_new_admission === false || st.admission_fee === 0)
        ? 0
        : (Number(st.admission_fee) || 0);

      const nextExamPaid = Number(st.exam_paid || 0);
      const settledExam = settledAt(st.exam_fee, nextExamPaid);
      const nextExam = settledExam !== null ? settledExam : classSchedule.examFee;

      const nextLessonPaid = Number(st.lesson_paid || 0);
      const settledLesson = settledAt(st.lesson_fee, nextLessonPaid);
      let nextLesson = classSchedule.lessonFeeTermly;
      if (settledLesson !== null) {
        nextLesson = settledLesson;
      } else {
        const planMonths = detectLessonPlanMonths(st.lesson_months);
        if (planMonths === 1) {
          nextLesson = classSchedule.lessonFeeMonthly;
        } else if (planMonths === 2) {
          nextLesson = classSchedule.lessonFeeMonthly * 2;
        } else if ((st.lesson_months || '').includes('None') || st.lesson_months === '0') {
          nextLesson = 0;
        } else if (!st.lesson_months && st.lesson_fee === 0 && nextLessonPaid === 0) {
          nextLesson = 0;
        }
      }

      if (isLessonDisabled(st)) nextLesson = 0;

      const nextAdditionalTotal = bd.additionalFeesTotal;
      const nextAdditionalPaid = bd.additionalFeesPaid;

      const totalFee = nextTuition + nextAdmission + nextExam + nextLesson + nextAdditionalTotal;
      const totalPaid = Math.max(
        Number(st.amount_paid || 0),
        nextTuitionPaid + nextAdmissionPaid + nextExamPaid + nextLessonPaid + nextAdditionalPaid
      );

      return {
        ...st,
        tuition_fee: nextTuition,
        tuition_status: st.is_exempt_from_school_fee ? 'fully_paid' : calculateStatus(nextTuition, nextTuitionPaid),
        admission_fee: nextAdmission,
        admission_status: nextAdmission > 0 ? calculateStatus(nextAdmission, nextAdmissionPaid) : 'unpaid',
        exam_fee: nextExam,
        exam_status: nextExam > 0 ? calculateStatus(nextExam, nextExamPaid) : 'unpaid',
        lesson_fee: nextLesson,
        lesson_status: isLessonDisabled(st) ? 'fully_paid' : (nextLesson > 0 ? calculateStatus(nextLesson, nextLessonPaid) : 'unpaid'),
        additional_fees: bd.additionalFees,
        fee_amount: totalFee,
        amount_paid: totalPaid,
        balance: calculateBalance(totalFee, totalPaid),
        status: calculateStatus(totalFee, totalPaid),
      };
    });

    const cloudSuccess = await batchSaveStudentsToFirestore(updated, currentSchoolId);
    if (!cloudSuccess) {
      const errorMsg = getLastFirestoreWriteError() || 'Failed updating student fee schedules in Firestore.';
      showToast(`⚠️ Fee schedule update failed: ${errorMsg}`);
      return;
    }

    setStudents(updated);
    saveStoredStudents(updated, currentSchoolId);

    recordAuditLog(
      'SETTINGS',
      'MODIFY_FEE_SCHEDULE',
      `Updated fee schedules across all enrolled students - Base Tuition: ${session.currencySymbol}${baseSchedule.tuitionFee.toLocaleString()}, Admission: ${session.currencySymbol}${baseSchedule.admissionFee.toLocaleString()}, Exam: ${session.currencySymbol}${baseSchedule.examFee.toLocaleString()}, Lesson: ${session.currencySymbol}${baseSchedule.lessonFeeTermly.toLocaleString()}${currentClassSchedules && Object.keys(currentClassSchedules).length > 0 ? ` with ${Object.keys(currentClassSchedules).length} class-specific override(s)` : ''}`,
      { schedule: baseSchedule, classFeeSchedules: currentClassSchedules },
      session.bursarName,
      currentSchoolId,
      'SUCCESS'
    );

    showToast(`Updated fee schedule across all enrolled students.`);
  };

  // Delete School
  const handleDeleteSchool = (schoolId: string) => {
    const success = deleteSchool(schoolId);
    if (!success) {
      showToast('Cannot delete the only remaining school.');
      return;
    }

    const allSchools = getStoredSchools();
    setSchools(allSchools);

    if (schoolId === activeSchoolId && allSchools.length > 0) {
      handleSelectSchool(allSchools[0].id);
    }
    setIsSchoolModalOpen(false);
    showToast('School dashboard removed.');
  };

  // Handle saving new API Config (including Secondary & Primary schools)
  const handleSaveApiConfig = (newConfig: SheetApiConfig, allSchoolConfigs?: Record<string, SheetApiConfig>) => {
    const currentSchoolId = activeSchool?.id || 'dominion-group';
    saveApiConfig(newConfig, currentSchoolId);
    setApiConfig(newConfig);

    if (allSchoolConfigs) {
      const currentSchools = getStoredSchools();
      const updated = currentSchools.map((s) => {
        if (allSchoolConfigs[s.id]) {
          saveApiConfig(allSchoolConfigs[s.id], s.id);
          return { ...s, sheetConfig: allSchoolConfigs[s.id] };
        }
        return s;
      });
      saveStoredSchools(updated);
      setSchools(updated);
    } else if (activeSchool) {
      updateSchool(activeSchool.id, { sheetConfig: newConfig });
      setSchools(getStoredSchools());
    }

    showToast('Configurations saved successfully.');
  };

  // Handle saving Bursar Session
  const handleSaveSession = (newSession: BursarSession) => {
    try {
      safeStorage.setItem(STORAGE_SESSION_KEY, JSON.stringify(newSession));
    } catch (e) {
      console.error(e);
    }
    setSession(newSession);

    // Also sync active school name & currency
    if (activeSchool) {
      updateSchool(activeSchool.id, {
        name: newSession.schoolName,
        currencySymbol: newSession.currencySymbol,
      });
      setSchools(getStoredSchools());
    }
  };

  const handleLogin = (sessionUpdates: { bursarName: string; username?: string; role?: 'admin' | 'bursar'; userTitle?: string } | string) => {
    if (typeof sessionUpdates === 'string') {
      const updated: BursarSession = {
        ...session,
        isAuthenticated: true,
        bursarName: sessionUpdates,
      };
      handleSaveSession(updated);
    } else {
      const updated: BursarSession = {
        ...session,
        isAuthenticated: true,
        bursarName: sessionUpdates.bursarName,
        username: sessionUpdates.username || session.username,
        role: sessionUpdates.role || session.role || 'bursar',
        userTitle: sessionUpdates.userTitle || session.userTitle,
      };
      handleSaveSession(updated);
    }
  };

  const handleLogout = () => {
    const updated: BursarSession = {
      ...session,
      isAuthenticated: false,
    };
    handleSaveSession(updated);
    showToast('Logged out securely.');
  };

  // Handle adding new student (Write)
  const handleAddStudent = async (newStudent: StudentPaymentRecord) => {
    const currentSchoolId = activeSchool?.id || 'dominion-group';

    if (newStudent.id) {
      unmarkStudentDeleted(newStudent.id, currentSchoolId);
    }

    const firestoreSuccess = await saveStudentToFirestore(newStudent, currentSchoolId);

    if (!firestoreSuccess) {
      const errorMsg =
        getLastFirestoreWriteError() ||
        'Cloud write was not acknowledged by Firestore (offline or connection error)';
      showToast(`⚠️ Could not save ${newStudent.full_name} to Cloud Firestore. Error: ${errorMsg}`);
      recordAuditLog(
        'STUDENT',
        'ENROLL_STUDENT',
        `⚠️ Failed to enroll student ${newStudent.full_name} (${newStudent.class}) - Cloud Firestore sync failed`,
        { studentId: newStudent.id, fullName: newStudent.full_name, class: newStudent.class, feeAmount: newStudent.fee_amount, error: errorMsg },
        session.bursarName,
        currentSchoolId,
        'WARNING'
      );
      throw new Error(errorMsg); // let the calling modal (AddStudentModal) catch this and keep the form open
    }

    setStudents((prev) => {
      const filtered = prev.filter((s) => s.id !== newStudent.id);
      const updated = [newStudent, ...filtered];
      saveStoredStudents(updated, currentSchoolId);
      return updated;
    });

    showToast(`Enrolled ${newStudent.full_name} (${newStudent.class}) and saved to Firebase Cloud.`);

    recordAuditLog(
      'STUDENT',
      'ENROLL_STUDENT',
      `Enrolled new student ${newStudent.full_name} (${newStudent.class}) with fee ${session.currencySymbol}${newStudent.fee_amount}`,
      { studentId: newStudent.id, fullName: newStudent.full_name, class: newStudent.class, feeAmount: newStudent.fee_amount },
      session.bursarName,
      currentSchoolId,
      'SUCCESS'
    );
  };

  // Handle editing student record (Rewrite)
  const handleSaveStudentEdits = async (
    id: string,
    updatedFields: Partial<StudentPaymentRecord> & {
      fee_amount: number;
      amount_paid: number;
      full_name: string;
      class: string;
      term: string;
      session: string;
      receipt_no?: string;
    },
    originalStudent: StudentPaymentRecord
  ) => {
    const currentSchoolId = activeSchool?.id || 'dominion-group';
    const fee = Math.max(0, updatedFields.fee_amount);
    const paid = Math.max(0, updatedFields.amount_paid);
    const updated: StudentPaymentRecord = {
      ...originalStudent,
      ...updatedFields,
      balance: calculateBalance(fee, paid),
      status: calculateStatus(fee, paid),
    };

    // 1. Save to Firebase Cloud Firestore FIRST
    const saveSuccess = await saveStudentToFirestore(updated, currentSchoolId);
    if (!saveSuccess) {
      const errorMsg =
        getLastFirestoreWriteError() ||
        'Cloud write was not acknowledged by Firestore (offline or connection error)';
      showToast(`⚠️ Could not update ${updated.full_name} in Cloud Firestore. Error: ${errorMsg}`);
      recordAuditLog(
        'STUDENT',
        'UPDATE_STUDENT',
        `⚠️ Failed updating student ${updated.full_name} (${updated.class}) - Cloud Firestore sync failed`,
        { studentId: id, fullName: updated.full_name, class: updated.class, error: errorMsg },
        session.bursarName,
        currentSchoolId,
        'WARNING'
      );
      throw new Error(errorMsg);
    }

    // 2. Only on Firestore success: update local state and localStorage cache
    setStudents((prev) => {
      const next = prev.map((s) => (s.id === id ? updated : s));
      saveStoredStudents(next, currentSchoolId);
      return next;
    });
    setSelectedStudentForDetails(updated);

    recordAuditLog(
      'STUDENT',
      'UPDATE_STUDENT',
      `Updated student record for ${updated.full_name} (${updated.class}) - Fee: ${session.currencySymbol}${updated.fee_amount}, Paid: ${session.currencySymbol}${updated.amount_paid}`,
      { studentId: id, updatedFields },
      session.bursarName,
      currentSchoolId,
      'SUCCESS'
    );

    showToast(`Updated ${updated.full_name}'s record successfully.`);
  };

  // Reset every payment recorded for one student back to 0 (fees and scholarship stay as they are)
  const handleUndoAllPayments = async (student: StudentPaymentRecord) => {
    const currentSchoolId = activeSchool?.id || 'dominion-group';

    // Works on the latest cloud copy inside one transaction, so a payment saved from another
    // device a moment ago is not missed or silently overwritten by an out-of-date screen.
    const buildReset = (current: StudentPaymentRecord) => {
      const fee = Math.max(0, Number(current.fee_amount) || 0);
      const lessonOff = isLessonDisabled(current);
      const exempt = current.is_exempt_from_school_fee === true;
      const updatedRecord: StudentPaymentRecord = {
        ...current,
        amount_paid: 0,
        balance: calculateBalance(fee, 0),
        status: calculateStatus(fee, 0),
        payment_date: '',
        payment_method: '',
        receipt_no: '',
        tuition_paid: 0,
        tuition_status: exempt ? 'fully_paid' : calculateStatus(Number(current.tuition_fee) || 0, 0),
        tuition_receipt_no: '',
        admission_paid: 0,
        admission_status: calculateStatus(Number(current.admission_fee) || 0, 0),
        admission_receipt_no: '',
        lesson_paid: 0,
        lesson_status: lessonOff ? 'fully_paid' : calculateStatus(Number(current.lesson_fee) || 0, 0),
        lesson_months: lessonOff ? current.lesson_months : '',
        lesson_receipt_no: '',
        exam_paid: 0,
        exam_status: calculateStatus(Number(current.exam_fee) || 0, 0),
        exam_receipt_no: '',
        payment_history: [],
        additional_fees: (current.additional_fees || []).map((f) => ({
          ...f,
          amountPaid: 0,
          status: 'unpaid' as const,
          receiptNo: '',
          paymentDate: '',
        })),
      };
      return { updatedRecord, previous: current };
    };

    let saved;
    try {
      saved = await savePaymentTransaction(student, buildReset, currentSchoolId);
    } catch (err: any) {
      const errorMsg = err?.message || 'Cloud write was not acknowledged by Firestore (offline or connection error)';
      showToast(`⚠️ Could not reset payments for ${student.full_name}. Error: ${errorMsg}`);
      recordAuditLog(
        'STUDENT',
        'UNDO_ALL_PAYMENTS',
        `⚠️ FAILED resetting all payments for ${student.full_name} (${student.class}) [ID: ${student.id}]`,
        { studentId: student.id, error: errorMsg },
        session.bursarName,
        currentSchoolId,
        'WARNING'
      );
      throw new Error(errorMsg);
    }

    const updated = saved.updatedRecord;
    const previous = saved.previous;

    setStudents((prev) => {
      const next = prev.map((s) => (s.id === student.id ? updated : s));
      saveStoredStudents(next, currentSchoolId);
      return next;
    });
    setSelectedStudentForDetails(updated);

    // The audit entry keeps the old figures and receipts, so a mistaken reset can be traced and re-entered
    recordAuditLog(
      'STUDENT',
      'UNDO_ALL_PAYMENTS',
      `Reset ALL payments to ${session.currencySymbol}0 for ${student.full_name} (${student.class}) [ID: ${student.id}]. Previously paid: ${session.currencySymbol}${previous.amount_paid}`,
      {
        studentId: student.id,
        previous: {
          amount_paid: previous.amount_paid,
          tuition_paid: previous.tuition_paid,
          admission_paid: previous.admission_paid,
          lesson_paid: previous.lesson_paid,
          exam_paid: previous.exam_paid,
          payment_history: previous.payment_history || [],
          additional_fees: previous.additional_fees || [],
        },
      },
      session.bursarName,
      currentSchoolId,
      'WARNING'
    );

    showToast(`All payments for ${student.full_name} have been reset to ${session.currencySymbol}0.`);
  };

  // Handle deleting student record
  const handleDeleteStudent = async (id: string, student: StudentPaymentRecord) => {
    const currentSchoolId = activeSchool?.id || 'dominion-group';

    // 1. Delete from Firebase Cloud Firestore FIRST (Primary)
    const delSuccess = await deleteStudentFromFirestore(id, currentSchoolId);
    if (!delSuccess) {
      const errorMsg =
        getLastFirestoreWriteError() ||
        'Cloud write was not acknowledged by Firestore (offline or connection error)';
      showToast(`⚠️ Delete failed: ${errorMsg}`);
      recordAuditLog(
        'STUDENT',
        'DELETE_STUDENT',
        `FAILED deleting student ${student.full_name} (${student.class}) [ID: ${id}]: ${errorMsg}`,
        { studentId: id, fullName: student.full_name, class: student.class, error: errorMsg },
        session.bursarName,
        currentSchoolId,
        'WARNING'
      );
      throw new Error(errorMsg);
    }

    // 2. Only on Firestore success: update state and in-memory cache
    const next = students.filter((s) => s.id !== id);
    setStudents(next);
    saveStoredStudents(next, currentSchoolId);

    if (selectedStudentForDetails?.id === id) {
      setSelectedStudentForDetails(null);
    }
    if (studentForPayment?.id === id) {
      setStudentForPayment(null);
    }

    recordAuditLog(
      'STUDENT',
      'DELETE_STUDENT',
      `Deleted student ${student.full_name} (${student.class}) [ID: ${id}]`,
      { studentId: id, fullName: student.full_name, class: student.class },
      session.bursarName,
      currentSchoolId,
      'WARNING'
    );

    showToast(`Deleted ${student.full_name}'s record successfully.`);
  };

  // Handle granting or editing scholarship for a student
  const handleSaveScholarship = async (scholarshipData: {
    studentId: string;
    fullName: string;
    studentClass: string;
    term: string;
    session: string;
    scholarshipType: string;
    scholarshipPercentage: number;
    exemptSchoolFee: boolean;
    scholarshipNotes: string;
    awardDate: string;
    awardedBy: string;
    isNewStudent: boolean;
  }) => {
    const currentSchoolId = activeSchool?.id || 'dominion-group';
    const existingStudent = students.find((s) => s.id === scholarshipData.studentId);
    const targetClass = scholarshipData.studentClass || existingStudent?.class || 'Primary 1';
    const classSchedule = getClassFeeSchedule(activeSchool, targetClass);

    // Live tuition resolution based on Settings
    const baseTuition = classSchedule.tuitionFee;
    const rawPct = Number(scholarshipData.scholarshipPercentage);
    const pct = Number.isFinite(rawPct) ? Math.min(100, Math.max(0, rawPct)) : 100;
    const isExempt = scholarshipData.exemptSchoolFee !== false;
    let tuitionFee = 0;
    if (isExempt || pct >= 100) {
      tuitionFee = 0;
    } else {
      tuitionFee = Math.round(baseTuition * (1 - pct / 100));
    }

    let updatedRecord: StudentPaymentRecord;

    if (existingStudent) {
      // Update existing student with scholarship exemption
      let lessonFee = classSchedule.lessonFeeTermly;
      if (existingStudent.lesson_months) {
        if (existingStudent.lesson_months.includes('1 Month')) lessonFee = classSchedule.lessonFeeMonthly;
        else if (existingStudent.lesson_months.includes('2 Month')) lessonFee = classSchedule.lessonFeeMonthly * 2;
        else if (existingStudent.lesson_months.includes('None') || existingStudent.lesson_months === '0') lessonFee = 0;
      } else if (existingStudent.lesson_fee === 0 && Number(existingStudent.lesson_paid || 0) === 0) {
        lessonFee = 0;
      }
      const lessonPaid = Number(existingStudent.lesson_paid || 0);
      if (isLessonDisabled(existingStudent)) lessonFee = 0;
      lessonFee = Math.max(lessonFee, lessonPaid);

      const examPaid = Number(existingStudent.exam_paid || 0);
      const examFee = Math.max(classSchedule.examFee, examPaid);

      const admissionPaid = Number(existingStudent.admission_paid || 0);
      const admissionFee = existingStudent.is_new_admission
        ? classSchedule.admissionFee
        : Math.max(Number(existingStudent.admission_fee || 0), admissionPaid);

      const totalFee = tuitionFee + admissionFee + lessonFee + examFee;
      const amountPaid = Number(existingStudent.amount_paid || 0);
      const balance = calculateBalance(totalFee, amountPaid);
      const status = calculateStatus(totalFee, amountPaid);

      updatedRecord = {
        ...existingStudent,
        full_name: scholarshipData.fullName || existingStudent.full_name,
        class: targetClass,
        term: scholarshipData.term || existingStudent.term,
        session: scholarshipData.session || existingStudent.session,
        is_exempt_from_school_fee: tuitionFee === 0,
        scholarship_notes: scholarshipData.scholarshipNotes,
        tuition_fee: tuitionFee,
        lesson_fee: lessonFee,
        exam_fee: examFee,
        admission_fee: admissionFee,
        fee_amount: totalFee,
        amount_paid: amountPaid,
        balance,
        status,
      };

      setStudents((prev) => {
        const updated = prev.map((s) => (s.id === existingStudent.id ? updatedRecord : s));
        saveStoredStudents(updated, currentSchoolId);
        return updated;
      });
    } else {
      // Create new student on scholarship using Settings rates
      const lessonFee = classSchedule.lessonFeeTermly;
      const examFee = classSchedule.examFee;
      const admissionFee = 0;
      const totalFee = tuitionFee + admissionFee + lessonFee + examFee;
      const balance = calculateBalance(totalFee, 0);
      const status = calculateStatus(totalFee, 0);

      updatedRecord = {
        id: scholarshipData.studentId,
        full_name: scholarshipData.fullName,
        class: targetClass,
        term: scholarshipData.term,
        session: scholarshipData.session,
        fee_amount: totalFee,
        amount_paid: 0,
        balance,
        status,
        payment_date: getTodayDateString(),
        is_exempt_from_school_fee: tuitionFee === 0,
        scholarship_notes: scholarshipData.scholarshipNotes,
        tuition_fee: tuitionFee,
        tuition_paid: 0,
        admission_fee: admissionFee,
        admission_paid: 0,
        lesson_fee: lessonFee,
        lesson_paid: 0,
        exam_fee: examFee,
        exam_paid: 0,
        total_remitted: 0,
      };

      setStudents((prev) => {
        const updated = [updatedRecord, ...prev];
        saveStoredStudents(updated, currentSchoolId);
        return updated;
      });
    }

    // Formulate complete Scholarship Record with all copied student details from Students tab
    const scholarshipRecordToStore: ScholarshipRecord = {
      id: scholarshipData.studentId,
      student_name: scholarshipData.fullName,
      class: scholarshipData.studentClass,
      term: scholarshipData.term,
      session: scholarshipData.session,
      scholarship_type: scholarshipData.scholarshipType,
      scholarship_percentage: scholarshipData.scholarshipPercentage,
      exempt_school_fee: scholarshipData.exemptSchoolFee,
      scholarship_notes: scholarshipData.scholarshipNotes,
      award_date: scholarshipData.awardDate,
      awarded_by: scholarshipData.awardedBy,
      status: 'active',
      created_at: new Date().toISOString(),
      // Copied student details from Students tab
      fee_amount: updatedRecord.fee_amount,
      amount_paid: updatedRecord.amount_paid,
      balance: updatedRecord.balance,
      payment_status: updatedRecord.status,
      tuition_fee: updatedRecord.tuition_fee,
      tuition_paid: updatedRecord.tuition_paid,
      admission_fee: updatedRecord.admission_fee,
      admission_paid: updatedRecord.admission_paid,
      lesson_fee: updatedRecord.lesson_fee,
      lesson_paid: updatedRecord.lesson_paid,
      lesson_months: updatedRecord.lesson_months,
      exam_fee: updatedRecord.exam_fee,
      exam_paid: updatedRecord.exam_paid,
      receipt_no: updatedRecord.receipt_no,
      payment_date: updatedRecord.payment_date,
    };

    // Save to Firebase Cloud Firestore FIRST (Scholarship & Student)
    const [scholarshipSaved, studentSaved] = await Promise.all([
      saveScholarshipToFirestore(scholarshipRecordToStore, currentSchoolId),
      saveStudentToFirestore(updatedRecord, currentSchoolId),
    ]);

    if (!scholarshipSaved || !studentSaved) {
      const errorMsg =
        getLastFirestoreWriteError() ||
        'Cloud write was not acknowledged by Firestore (offline or connection error)';
      showToast(`⚠️ Could not save scholarship for ${scholarshipData.fullName}. Error: ${errorMsg}`);
      recordAuditLog(
        'STUDENT',
        'SCHOLARSHIP_GRANT',
        `⚠️ Failed to grant scholarship to ${scholarshipData.fullName} (${scholarshipData.studentId}) - Cloud Firestore sync failed`,
        { studentId: scholarshipData.studentId, scholarshipType: scholarshipData.scholarshipType, error: errorMsg },
        session.bursarName,
        currentSchoolId,
        'WARNING'
      );
      throw new Error(errorMsg);
    }

    // Only on Firestore success: update local state and localStorage cache
    const storedScholarships = getStoredScholarships(currentSchoolId);
    const updatedScholarships = [
      scholarshipRecordToStore,
      ...storedScholarships.filter((s) => s.id !== scholarshipData.studentId),
    ];
    saveStoredScholarships(updatedScholarships, currentSchoolId);
    setScholarships(updatedScholarships);

    setStudents((prev) => {
      const updated = prev.map((s) => (s.id === scholarshipData.studentId ? updatedRecord : s));
      saveStoredStudents(updated, currentSchoolId);
      return updated;
    });

    recordAuditLog(
      'STUDENT',
      'SCHOLARSHIP_GRANT',
      `Granted scholarship (${scholarshipData.scholarshipType}) to ${scholarshipData.fullName} (${scholarshipData.studentId})`,
      { studentId: scholarshipData.studentId, scholarshipType: scholarshipData.scholarshipType },
      session.bursarName,
      currentSchoolId,
      'SUCCESS'
    );

    showToast(`Scholarship granted to ${scholarshipData.fullName}!`);
  };

  // Handle revoking scholarship exemption
  const handleRevokeScholarship = async (student: StudentPaymentRecord) => {
    const currentSchoolId = activeSchool?.id || 'dominion-group';
    const classSchedule = getClassFeeSchedule(activeSchool, student.class);
    const standardTuition = classSchedule.tuitionFee;

    let lessonFee = classSchedule.lessonFeeTermly;
    if (student.lesson_months) {
      if (student.lesson_months.includes('1 Month')) lessonFee = classSchedule.lessonFeeMonthly;
      else if (student.lesson_months.includes('2 Month')) lessonFee = classSchedule.lessonFeeMonthly * 2;
      else if (student.lesson_months.includes('None') || student.lesson_months === '0') lessonFee = 0;
    } else if (student.lesson_fee === 0 && Number(student.lesson_paid || 0) === 0) {
      lessonFee = 0;
    }
    const lessonPaid = Number(student.lesson_paid || 0);
    if (isLessonDisabled(student)) lessonFee = 0;
    lessonFee = Math.max(lessonFee, lessonPaid);

    const examPaid = Number(student.exam_paid || 0);
    const examFee = Math.max(classSchedule.examFee, examPaid);

    const admissionPaid = Number(student.admission_paid || 0);
    const admissionFee = student.is_new_admission
      ? classSchedule.admissionFee
      : Math.max(Number(student.admission_fee || 0), admissionPaid);

    const totalFee = standardTuition + admissionFee + lessonFee + examFee;
    const amountPaid = Number(student.amount_paid || 0);
    const balance = calculateBalance(totalFee, amountPaid);
    const status = calculateStatus(totalFee, amountPaid);

    const updatedRecord: StudentPaymentRecord = {
      ...student,
      is_exempt_from_school_fee: false,
      scholarship_notes: '',
      tuition_fee: standardTuition,
      lesson_fee: lessonFee,
      exam_fee: examFee,
      admission_fee: admissionFee,
      fee_amount: totalFee,
      amount_paid: amountPaid,
      balance,
      status,
    };

    // Save to Firebase Cloud Firestore FIRST
    const [scholarshipDeleted, studentSaved] = await Promise.all([
      deleteScholarshipFromFirestore(student.id, currentSchoolId),
      saveStudentToFirestore(updatedRecord, currentSchoolId),
    ]);

    if (!scholarshipDeleted || !studentSaved) {
      const errorMsg =
        getLastFirestoreWriteError() ||
        'Cloud write was not acknowledged by Firestore (offline or connection error)';
      showToast(`⚠️ Could not revoke scholarship for ${student.full_name}. Error: ${errorMsg}`);
      recordAuditLog(
        'STUDENT',
        'SCHOLARSHIP_REVOKE',
        `⚠️ Failed to revoke scholarship for ${student.full_name} (${student.id}) - Cloud Firestore sync failed`,
        { studentId: student.id, fullName: student.full_name, error: errorMsg },
        session.bursarName,
        currentSchoolId,
        'WARNING'
      );
      throw new Error(errorMsg);
    }

    // Only on Firestore success: update local state and localStorage cache
    setStudents((prev) => {
      const updated = prev.map((s) => (s.id === student.id ? updatedRecord : s));
      saveStoredStudents(updated, currentSchoolId);
      return updated;
    });

    // Remove from local scholarship store and state
    const storedScholarships = getStoredScholarships(currentSchoolId);
    const updatedScholarships = storedScholarships.filter((s) => s.id !== student.id);
    saveStoredScholarships(updatedScholarships, currentSchoolId);
    setScholarships(updatedScholarships);

    recordAuditLog(
      'STUDENT',
      'SCHOLARSHIP_REVOKE',
      `Revoked scholarship for ${student.full_name} (${student.id})`,
      { studentId: student.id, fullName: student.full_name },
      session.bursarName,
      currentSchoolId,
      'WARNING'
    );

    showToast(`Revoked scholarship for ${student.full_name}. Regular fees restored.`);
  };

  // Handle merging duplicate student records into a verified primary record
  const handleMergeDuplicateGroup = async (
    primaryId: string,
    mergedRecord: StudentPaymentRecord,
    deletedIds: string[]
  ) => {
    const currentSchoolId = activeSchool?.id || 'dominion-group';

    // 1. Update local state and persistent storage first
    const next = students
      .filter((s) => !deletedIds.includes(s.id))
      .map((s) => (s.id === primaryId ? mergedRecord : s));
    setStudents(next);
    saveStoredStudents(next, currentSchoolId);

    // Persist merge & deletes to Firebase Cloud Firestore
    saveStudentToFirestore(mergedRecord, currentSchoolId).catch(() => {});
    deletedIds.forEach((delId) => {
      deleteStudentFromFirestore(delId, currentSchoolId).catch(() => {});
    });

    if (selectedStudentForDetails && (selectedStudentForDetails.id === primaryId || deletedIds.includes(selectedStudentForDetails.id))) {
      setSelectedStudentForDetails(mergedRecord);
    }

    showToast(`Resolved & merged duplicates for "${mergedRecord.full_name}" into ID: ${mergedRecord.id}`);
  };

  // Handle batch resolving all verified duplicate groups
  const handleBatchResolveDuplicates = async (
    mergedRecords: StudentPaymentRecord[],
    deletedIds: string[]
  ) => {
    const currentSchoolId = activeSchool?.id || 'dominion-group';
    const deletedSet = new Set(deletedIds);
    const mergedMap = new Map(mergedRecords.map((m) => [m.id, m]));

    // Update local state and persistent storage
    setStudents((prev) => {
      const next = prev
        .filter((s) => !deletedSet.has(s.id))
        .map((s) => (mergedMap.has(s.id) ? mergedMap.get(s.id)! : s));
      saveStoredStudents(next, currentSchoolId);
      // Batch sync to Firebase Cloud Firestore
      batchSaveStudentsToFirestore(next, currentSchoolId).catch(() => {});
      return next;
    });

    // Clean up firestore deleted records
    deletedIds.forEach((delId) => {
      deleteStudentFromFirestore(delId, currentSchoolId).catch(() => {});
    });

    showToast(`Successfully merged and cleaned ${mergedRecords.length} duplicate groups.`);
  };

  // Handle recording payment (Pay & Collect): one atomic save for the whole sitting
  const handleSubmitPayment = async (
    student: StudentPaymentRecord,
    lines: PaymentLineInput[],
    paymentMethod: string,
    options?: { receiptNumber?: string }
  ): Promise<PaymentReceipt> => {
    const currentSchoolId = activeSchool?.id || 'dominion-group';
    const typedReceipt = options?.receiptNumber?.trim() || '';
    const totalAmount = lines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0);

    // A typed receipt number must not belong to a different student.
    if (typedReceipt) {
      const wanted = typedReceipt.toLowerCase();
      const clash = students.find((s) => {
        if (s.id === student.id) return false;
        if ((s.receipt_no || '').trim().toLowerCase() === wanted) return true;
        return Array.isArray(s.payment_history) &&
          s.payment_history.some((h) => (h.receiptNumber || '').trim().toLowerCase() === wanted);
      });
      if (clash) {
        throw new Error(
          `Receipt No. ${typedReceipt} is already used for ${clash.full_name} (${clash.class}). Enter a different receipt number.`
        );
      }
    }

    // One key per payment attempt. If the connection times out, the first save may still land,
    // so a retry of the same sitting reuses the key and is recognised instead of being added again.
    const fingerprint = JSON.stringify([
      currentSchoolId,
      student.id,
      paymentMethod,
      typedReceipt,
      lines.map((l) => [
        Number(l.amount) || 0,
        l.feeCategory?.categoryType || '',
        l.feeCategory?.additionalFeeId || '',
        l.feeCategory?.feeDescription || '',
        l.feeCategory?.lessonMonth || '',
      ]),
    ]);
    const KEY_LIFETIME_MS = 15 * 60 * 1000;
    const pending = pendingPaymentKeysRef.current.get(fingerprint);
    const idempotencyKey =
      pending && Date.now() - pending.createdAt < KEY_LIFETIME_MS
        ? pending.key
        : `pay_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    pendingPaymentKeysRef.current.set(fingerprint, {
      key: idempotencyKey,
      createdAt: pending && pending.key === idempotencyKey ? pending.createdAt : Date.now(),
    });

    let saved;
    let alreadySaved = false;
    try {
      saved = await savePaymentTransaction(
        student,
        (fresh) => {
          const earlier = (Array.isArray(fresh.payment_history) ? fresh.payment_history : []).filter(
            (h) => h?.idempotencyKey === idempotencyKey
          );
          if (earlier.length > 0) {
            // The first attempt was saved after all. Do not apply it a second time.
            alreadySaved = true;
            return {
              updatedRecord: fresh,
              receipts: earlier,
              combinedReceipt: buildCombinedReceipt(earlier),
            };
          }
          return recordStudentPayments(fresh, lines, paymentMethod, {
            receiptNumber: typedReceipt || undefined,
            bursarName: session.bursarName,
            idempotencyKey,
          });
        },
        currentSchoolId
      );
    } catch (err: any) {
      const message = err?.message || String(err);
      recordAuditLog(
        'PAYMENT',
        'RECORD_PAYMENT',
        `⚠️ Payment of ${session.currencySymbol}${totalAmount.toLocaleString()} for ${student.full_name} (${student.class}) FAILED to save`,
        {
          studentId: student.id,
          studentName: student.full_name,
          class: student.class,
          amount: totalAmount,
          error: message,
        },
        session.bursarName,
        currentSchoolId,
        'WARNING'
      );
      showToast(`⚠️ Payment was NOT saved. ${message}`);
      throw new Error(message);
    }

    // The save is confirmed, so the next identical payment is a new one
    pendingPaymentKeysRef.current.delete(fingerprint);

    // Update local state from the saved result only
    const updatedRecord = saved.updatedRecord;
    const receipt = saved.combinedReceipt;
    setStudents((prev) => {
      const next = prev.map((s) => (s.id === student.id ? updatedRecord : s));
      saveStoredStudents(next, currentSchoolId);
      return next;
    });
    if (selectedStudentForDetails?.id === student.id) {
      setSelectedStudentForDetails(updatedRecord);
    }

    if (alreadySaved) {
      showToast(
        `This payment of ${session.currencySymbol}${receipt.amountPaidNow.toLocaleString()} for ${student.full_name} was already saved. It was not added again.`
      );
      return { ...receipt, updatedStudent: updatedRecord };
    }

    recordAuditLog(
      'PAYMENT',
      'RECORD_PAYMENT',
      `Recorded payment of ${session.currencySymbol}${receipt.amountPaidNow.toLocaleString()} for ${student.full_name} (${student.class}) - Method: ${paymentMethod}`,
      {
        studentId: student.id,
        studentName: student.full_name,
        class: student.class,
        amount: receipt.amountPaidNow,
        receiptNo: receipt.receiptNumber,
        items: receipt.items,
        newBalance: updatedRecord.balance,
      },
      session.bursarName,
      currentSchoolId,
      'SUCCESS'
    );

    showToast(`Recorded payment of ${session.currencySymbol}${receipt.amountPaidNow.toLocaleString()} successfully.`);
    return { ...receipt, updatedStudent: updatedRecord };
  };

  // Transition from Student Details to Record Payment
  const handleRecordPaymentForStudent = (student: StudentPaymentRecord) => {
    setSelectedStudentForDetails(null);
    setStudentForPayment(student);
    setActiveTab('record_payment');
  };

  // Handle Rollover completion
  const handleRolloverComplete = (newStudents: StudentPaymentRecord[], message: string) => {
    const currentSchoolId = activeSchool?.id || 'dominion-group';
    setStudents(newStudents);
    saveStoredStudents(newStudents, currentSchoolId);
    batchSaveStudentsToFirestore(newStudents, currentSchoolId).catch(() => {});
    showToast(message);
    setActiveTab('students');
  };

  // Handle Clean Slate completion (wiping students & records for a brand-new app)
  const handleCleanSlateComplete = async (message: string) => {
    const currentSchoolId = activeSchool?.id || 'dominion-group';
    setStudents([]);
    setScholarships([]);
    setSelectedStudentForDetails(null);
    setStudentForPayment(null);
    setStudentToGrantScholarship(null);

    // Reset local partitions
    saveStoredStudents([], currentSchoolId);
    saveStoredScholarships([], currentSchoolId);
    saveRemittances([], currentSchoolId);
    saveStoredExpenses([], currentSchoolId);
    clearSchoolTombstones(currentSchoolId);
    clearStoredIgnoredDuplicates(currentSchoolId);

    // Reset Cloud Firestore
    try {
      await wipeSchoolDataForCleanSlate(currentSchoolId);
    } catch (e) {
      console.warn('Cloud clean slate wipe note:', e);
    }

    recordAuditLog(
      'ROLLOVER',
      'CLEAN_SLATE_WIPE',
      `Full clean slate wipe executed for ${activeSchool?.name || currentSchoolId}. All active student and payment records wiped after auto-exporting CSV backup.`,
      { schoolId: currentSchoolId },
      session.bursarName,
      currentSchoolId,
      'WARNING'
    );

    showToast(message);
    setActiveTab('students');
  };

  // Handle End Term completion
  const handleEndTermComplete = (updatedStudents: StudentPaymentRecord[], message: string) => {
    const currentSchoolId = activeSchool?.id || 'dominion-group';
    setStudents(updatedStudents);
    saveStoredStudents(updatedStudents, currentSchoolId);
    batchSaveStudentsToFirestore(updatedStudents, currentSchoolId).catch(() => {});
    showToast(message);
    setActiveTab('students');
    loadStudents();
  };

  if (!session.isAuthenticated) {
    return (
      <LoginModal 
        session={session} 
        schools={schools}
        activeSchool={activeSchool}
        onSelectSchool={handleSelectSchool}
        onLogin={handleLogin} 
      />
    );
  }

  const isConfigured = Boolean(apiConfig.apiUrl && apiConfig.apiUrl.trim());

  return (
    <div className="h-[100dvh] w-full bg-slate-900/5 sm:bg-slate-100 flex flex-col overflow-hidden items-center justify-center">
      {/* Offline Status & Cloud Reconnect Banner */}
      <OfflineIndicator />

      {/* Mobile-first PWA layout on small screens + Responsive Full Dashboard Canvas on Desktop */}
      <div className="w-full max-w-7xl mx-auto h-full md:my-3 md:h-[calc(100dvh-1.5rem)] bg-white shadow-2xl flex flex-col relative md:rounded-3xl border-x md:border border-slate-200/80 overflow-hidden">
        
        {/* Top Sticky Header */}
        <Header
          session={session}
          isOnline={isOnline}
          isLoading={isLoading}
          onRefresh={() => loadStudents(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          onOpenAddStudent={() => setIsAddStudentOpen(true)}
          onOpenSheetUpload={() => setIsSheetUploadOpen(true)}
          onLogout={handleLogout}
          studentCount={students.length}
          activeSchool={activeSchool}
          syncStatus={syncStatus}
        />

        {/* Toast feedback banner */}
        {toastMessage && (
          <div className="fixed top-[calc(env(safe-area-inset-top)+4rem)] left-1/2 -translate-x-1/2 z-[120] w-max max-w-[90vw] sm:max-w-sm bg-slate-900 text-white text-xs font-semibold px-4 py-2.5 rounded-2xl shadow-lg border border-slate-700 animate-in fade-in slide-in-from-top-2 duration-200 pointer-events-none text-center">
            {toastMessage}
          </div>
        )}

        {/* Admin Pending Notification Strip */}
        {session.isAuthenticated && session.role === 'admin' && pendingRemittanceCount > 0 && activeTab !== 'collection' && (
          <div className="bg-amber-500 text-slate-950 px-4 py-2 flex flex-wrap sm:flex-nowrap items-center justify-between gap-x-3 gap-y-2 text-xs font-bold shrink-0 shadow-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full bg-slate-950 animate-pulse shrink-0" />
              <span className="line-clamp-2 sm:truncate">
                Action Needed: Bursar submitted {pendingRemittanceCount} remittance request(s) awaiting your approval.
              </span>
            </div>
            <button
              type="button"
              onClick={() => setActiveTab('collection')}
              className="px-2.5 py-1 bg-slate-950 text-white rounded-lg text-[11px] font-bold hover:bg-slate-800 transition-colors shrink-0 cursor-pointer"
            >
              Review & Accept →
            </button>
          </div>
        )}

        {/* Cloud Firestore Unsynced Upload Warning Banner */}
        {unsyncedUploadInfo && (
          <div className="bg-rose-600 text-white px-4 py-2.5 flex flex-wrap sm:flex-nowrap items-center justify-between gap-x-3 gap-y-2 text-xs font-bold shrink-0 shadow-md animate-in fade-in duration-200">
            <div className="flex items-center gap-2.5 min-w-0">
              <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0" />
              <span className="line-clamp-3 sm:truncate">
                <strong>Cloud Firestore Sync Pending:</strong> {unsyncedUploadInfo.count} student records are saved in this browser only. Cloud Firestore was not updated. Reloading will discard them!
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={async () => {
                  try {
                    showToast('Retrying Cloud Firestore sync...');
                    await batchSaveStudentsToFirestore(unsyncedUploadInfo.students, unsyncedUploadInfo.schoolId);
                    setUnsyncedUploadInfo(null);
                    showToast(`✓ Cloud sync succeeded! ${unsyncedUploadInfo.count} student records synced to Cloud Firestore.`);
                  } catch (err: any) {
                    const msg = err?.message || String(err);
                    showToast(`Cloud retry failed: ${msg}`);
                  }
                }}
                className="px-3 py-1 bg-white text-rose-800 rounded-lg text-[11px] font-black hover:bg-rose-50 transition-colors cursor-pointer shadow-xs"
              >
                Retry Cloud Sync Now
              </button>
              <button
                type="button"
                onClick={() => setUnsyncedUploadInfo(null)}
                className="text-rose-200 hover:text-white p-2 -m-1"
                title="Dismiss warning"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}


        {/* Cloud Firestore Quota Limit Exceeded Banner */}
        {isFirestoreQuotaExceeded && !dismissedQuotaBanner && (
          <div className="bg-amber-600 text-white px-4 py-2.5 flex flex-wrap sm:flex-nowrap items-center justify-between gap-x-3 gap-y-2 text-xs font-bold shrink-0 shadow-md animate-in fade-in duration-200">
            <div className="flex items-center gap-2.5 min-w-0">
              <AlertTriangle className="w-4 h-4 text-amber-200 shrink-0" />
              <span className="line-clamp-3 sm:truncate">
                <strong>Cloud Firestore Daily Quota Exceeded:</strong> Free daily write/operation limit reached. Offline local-storage caching is active so your records remain safe. Quotas reset tomorrow at 00:00 UTC.
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <a
                href="https://console.firebase.google.com/project/marklar-galaxy-gt8c4/firestore/databases/dnpspay/data?openUpgradeDialog=true"
                target="_blank"
                rel="noreferrer"
                className="px-2.5 py-1 bg-white text-amber-900 rounded-lg text-[11px] font-black hover:bg-amber-50 transition-colors cursor-pointer shadow-xs inline-flex items-center gap-1"
              >
                Upgrade Plan in Firebase
              </a>
              <button
                type="button"
                onClick={() => setDismissedQuotaBanner(true)}
                className="text-amber-200 hover:text-white p-2 -m-1 cursor-pointer"
                title="Dismiss quota warning"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Dynamic Tab Content Views */}
        <main className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          {activeTab === 'students' && (
            <StudentList
              students={students}
              isLoading={isLoading}
              error={error}
              currencySymbol={session.currencySymbol}
              feeSchedule={activeSchool?.feeSchedule}
              activeSchool={activeSchool}
              onRefresh={() => loadStudents(true)}
              onSelectStudent={(stu) => setSelectedStudentForDetails(stu)}
              onOpenAddStudent={() => setIsAddStudentOpen(true)}
              onOpenScholarships={() => setIsScholarshipModalOpen(true)}
              onOpenSheetUpload={() => setIsSheetUploadOpen(true)}
              onOpenBackup={() => setIsRolloverModalOpen(true)}
              onOpenSettings={() => setIsSettingsOpen(true)}
              onOpenDuplicateCleaner={() => setIsDuplicateCleanerOpen(true)}
              onOpenAdditionalFees={() => setIsAdditionalFeesOpen(true)}
              onDeleteStudent={handleDeleteStudent}
              isConfigured={isConfigured}
            />
          )}

          {activeTab === 'record_payment' && (
            <RecordPaymentView
              students={students}
              currencySymbol={session.currencySymbol}
              preselectedStudent={studentForPayment}
              onClearPreselectedStudent={() => setStudentForPayment(null)}
              onSubmitPayment={handleSubmitPayment}
              onViewStudentInList={(stu) => {
                setSelectedStudentForDetails(stu);
                setActiveTab('students');
              }}
              onOpenAddStudent={() => setIsAddStudentOpen(true)}
              onOpenAdditionalFees={() => setIsAdditionalFeesOpen(true)}
              activeSchool={activeSchool}
            />
          )}

          {activeTab === 'admission' && (
            <AdmissionView
              currencySymbol={session.currencySymbol}
              existingCount={students.length}
              students={students}
              onAddStudent={handleAddStudent}
              onViewStudent={(stu) => {
                setSelectedStudentForDetails(stu);
                setActiveTab('students');
              }}
              activeSchool={activeSchool}
            />
          )}

          {activeTab === 'payroll' && (
            <PayrollView
              session={session}
              activeSchool={activeSchool}
              students={students}
              onOpenSettings={() => setIsSettingsOpen(true)}
            />
          )}

          {activeTab === 'analytics' && (
            <AnalyticsView
              students={students}
              session={session}
              activeSchool={activeSchool}
              onSelectStudent={(stu) => setSelectedStudentForDetails(stu)}
              onFilterByClassInList={(className) => {
                setActiveTab('students');
              }}
              onOpenPayroll={() => setActiveTab('payroll')}
            />
          )}

          {activeTab === 'collection' && (
            <CollectionView
              students={students}
              session={session}
              onUpdateStudents={setStudents}
              onSelectStudent={(stu) => setSelectedStudentForDetails(stu)}
              onOpenRecordPayment={() => setActiveTab('record_payment')}
              remittances={remittances}
              onUpdateRemittances={setRemittances}
              school={activeSchool}
            />
          )}
        </main>

        {/* Bottom 5-Tab Navigation */}
        <BottomNav
          activeTab={activeTab}
          onTabChange={(tab) => {
            setSelectedStudentForDetails(null);
            setActiveTab(tab);
            if (tab === 'students') {
              setStudentForPayment(null);
            }
          }}
          studentCount={students.length}
          pendingRemittanceCount={pendingRemittanceCount}
        />

        {/* Student Full Details Modal with Confirmation */}
        <StudentDetailsModal
          student={selectedStudentForDetails}
          currencySymbol={session.currencySymbol}
          isOpen={Boolean(selectedStudentForDetails)}
          onClose={() => setSelectedStudentForDetails(null)}
          onRecordPaymentForStudent={handleRecordPaymentForStudent}
          onSaveStudentEdits={handleSaveStudentEdits}
          onDeleteStudent={handleDeleteStudent}
          onUndoAllPayments={handleUndoAllPayments}
          activeSchool={activeSchool}
          onGrantScholarship={(student) => {
            setSelectedStudentForDetails(null);
            setStudentToGrantScholarship(student);
            setIsScholarshipModalOpen(true);
          }}
          onRevokeScholarship={handleRevokeScholarship}
          onOpenAdditionalFees={() => setIsAdditionalFeesOpen(true)}
        />

        {/* Add Existing Student Modal */}
        <AddExistingStudentModal
          isOpen={isAddStudentOpen}
          onClose={() => setIsAddStudentOpen(false)}
          currencySymbol={session.currencySymbol}
          existingCount={students.length}
          students={students}
          onAddStudent={handleAddStudent}
          activeSchool={activeSchool}
        />

        {/* Sheet API & Settings Modal */}
        <SettingsModal
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          apiConfig={apiConfig}
          session={session}
          students={students}
          schools={schools}
          activeSchool={activeSchool}
          onSelectSchool={handleSelectSchool}
          onOpenAddSchool={handleOpenAddSchool}
          onOpenEditSchool={handleOpenEditSchool}
          onSaveSchool={handleSaveSchool}
          onUpdateStudentsFee={handleUpdateStudentsFee}
          onUpdateSchoolFromFees={handleUpdateSchoolFromFees}
          onUpdateStudentsFromFees={handleUpdateStudentsFromFees}
          onSaveConfig={handleSaveApiConfig}
          onSaveSession={handleSaveSession}
          onOpenEndTerm={() => setIsEndTermOpen(true)}
          onOpenRollover={() => setIsRolloverModalOpen(true)}
          onOpenDuplicateCleaner={() => setIsDuplicateCleanerOpen(true)}
          onOpenAdditionalFees={() => setIsAdditionalFeesOpen(true)}
          onReplaceAllStudents={handleReplaceAllStudents}
          onLogout={handleLogout}
        />

        {/* Duplicate Cleaner Modal */}
        <DuplicateCleanerModal
          isOpen={isDuplicateCleanerOpen}
          onClose={() => setIsDuplicateCleanerOpen(false)}
          students={students}
          session={session}
          activeSchool={activeSchool}
          onUpdateStudents={handleUpdateStudentsFromDuplicateCleaner}
        />

        {/* Add / Edit School & Fee Configuration Modal */}
        <SchoolModal
          isOpen={isSchoolModalOpen}
          onClose={() => setIsSchoolModalOpen(false)}
          onSave={handleSaveSchool}
          onDelete={handleDeleteSchool}
          schoolToEdit={schoolToEdit}
          mode={schoolModalMode}
          canDelete={schools.length > 1}
          onOpenAdditionalFees={() => setIsAdditionalFeesOpen(true)}
        />

        {/* End Term & Duplicate Sheet Backup Modal */}
        <EndTermModal
          isOpen={isEndTermOpen}
          onClose={() => setIsEndTermOpen(false)}
          students={students}
          session={session}
          activeSchool={activeSchool}
          onEndTermComplete={handleEndTermComplete}
        />

        {/* Next Term Backup & Rollover Modal */}
        <BackupRolloverModal
          isOpen={isRolloverModalOpen}
          onClose={() => setIsRolloverModalOpen(false)}
          students={students}
          session={session}
          onRolloverComplete={handleRolloverComplete}
          onCleanSlateComplete={handleCleanSlateComplete}
        />

        {/* Student Upload via Google Sheet / Excel / CSV Modal */}
        <StudentUploadModal
          isOpen={isSheetUploadOpen}
          onClose={() => setIsSheetUploadOpen(false)}
          activeSchool={activeSchool}
          existingStudents={students}
          onUploadSuccess={(newStudents, message, isCloudSynced = true) => {
            setStudents(newStudents);
            saveStoredStudents(newStudents, activeSchool.id);
            if (isCloudSynced) {
              setUnsyncedUploadInfo(null);
              showToast(message);
            } else {
              setUnsyncedUploadInfo({
                count: newStudents.length,
                error: message,
                schoolId: activeSchool.id,
                students: newStudents,
              });
              showToast(`⚠️ WARNING: ${message}`);
            }
          }}
          onUploadPartialFailure={(localStudents, errorMessage) => {
            setStudents(localStudents);
            saveStoredStudents(localStudents, activeSchool.id);
            setUnsyncedUploadInfo({
              count: localStudents.length,
              error: errorMessage,
              schoolId: activeSchool.id,
              students: localStudents,
            });
            showToast(
              `⚠️ Upload saved locally ONLY. Cloud Firestore sync failed. Click "Retry Cloud Sync Now" before reloading.`
            );
          }}
        />

        {/* Scholarships Management Modal */}
        <ScholarshipModal
          isOpen={isScholarshipModalOpen}
          onClose={() => {
            setIsScholarshipModalOpen(false);
            setStudentToGrantScholarship(null);
          }}
          students={students}
          scholarships={scholarships}
          onRefreshScholarships={() => loadStudents(true)}
          currencySymbol={session.currencySymbol}
          activeSchool={activeSchool}
          apiConfig={apiConfig}
          initialStudentToGrant={studentToGrantScholarship}
          onSaveScholarship={handleSaveScholarship}
          onRevokeScholarship={handleRevokeScholarship}
          onSelectStudent={(student) => {
            setSelectedStudentForDetails(student);
            setActiveTab('students');
          }}
        />

        {/* Additional & Ancillary Fees Management Modal */}
        <AdditionalFeesModal
          isOpen={isAdditionalFeesOpen}
          onClose={() => setIsAdditionalFeesOpen(false)}
          activeSchool={activeSchool}
          students={students}
          onUpdateSchool={handleUpdateSchoolFromFees}
          onUpdateStudents={handleUpdateStudentsFromFees}
          currencySymbol={session.currencySymbol}
        />
      </div>
    </div>
  );
}
