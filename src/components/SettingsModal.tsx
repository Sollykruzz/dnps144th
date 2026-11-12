/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Settings,
  Database,
  Key,
  Check,
  Copy,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Shield,
  HelpCircle,
  School,
  Archive,
  ArrowRight,
  RefreshCw,
  Download,
  FileSpreadsheet,
  Building2,
  Plus,
  Sliders,
  GraduationCap,
  BookOpen,
  Code2,
  Sparkles,
  Zap,
  Users,
  Search,
  ArrowLeft,
  ChevronRight,
  Coins,
  UserCheck,
  Layers,
  LayoutGrid,
  ShieldCheck,
  Wallet,
  Calendar,
  Clock,
  Save,
  RotateCcw,
  Trash2,
  Edit3,
  Cloud,
  Printer,
  Calculator,
  TrendingUp,
  Filter,
  Percent,
  Palette,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { BursarSession, StudentPaymentRecord, SchoolProfile, AcademicTermSchedule, SchoolFeeSchedule, SheetApiConfig, AdditionalFeeCategory, AdditionalFeeItem } from '../types';
import { downloadCsvBackup, downloadJsonBackup } from '../services/backupService';
import { formatCurrency, getClassFeeSchedule, getCurrentAcademicSession, normalizeSessionLabel } from '../services/calculations';
import { updateSchoolFeeSchedule, getStoredSchools, addAdditionalFeeToSchool, updateAdditionalFeeInSchool, deleteAdditionalFeeFromSchool, getSchoolAdditionalFees, syncAdditionalFeesToStudents } from '../services/schoolService';
import { DuplicateCleanerView } from './DuplicateCleanerView';
import { AuditLogsView } from './AuditLogsView';
import { ClassManager } from './ClassManager';
import { SchoolBrandingCustomizer } from './SchoolBrandingCustomizer';
import { UserCredentialManager } from './UserCredentialManager';
import { PWAInstallButton } from './PWAInstallButton';
import { findDuplicateGroups } from '../services/deduplicationService';
import {
  getStoredTermSchedule,
  saveStoredTermSchedule,
  deriveMonthsBetweenDates,
  getMonthlyPaymentDueStatus,
  getFeeCollectionTimelineStatus,
} from '../services/termScheduleService';
import { formatMonthLabel } from '../services/payrollService';
import {
  testConnection as testFirebaseConnection,
  signInWithGoogle,
  signOutFirebase,
  getCurrentFirebaseUser,
  subscribeAuthState,
  batchSaveStudentsToFirestore,
  getStudentsFromFirestore,
  getSyncStatus,
  subscribeSyncStatus,
  saveTermScheduleToFirestore,
  saveSchoolProfileToFirestore,
  getSchoolProfilesFromFirestore,
  SyncStatus,
  reinitializeFirebase,
} from '../services/firebase';
import {
  getActiveFirebaseConfig,
  saveCustomFirebaseConfig,
  clearCustomFirebaseConfig,
  getStoredCustomConfig,
  DNPS_PRESET_CONFIG,
  isRealApiKey,
  generateFirestoreRulesTemplate,
  generateVercelEnvTemplate,
} from '../services/customFirebaseService';

export type AppToolId =
  | 'user_credentials'
  | 'school_branding'
  | 'fee_update'
  | 'additional_fees'
  | 'school_profiles'
  | 'class_manager'
  | 'duplicate_cleaner'
  | 'term_schedule'
  | 'bursar_settings'
  | 'term_rollover'
  | 'end_term'
  | 'backups'
  | 'data_inspector'
  | 'audit_logs'
  | 'firebase_cloud';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  apiConfig?: SheetApiConfig;
  session: BursarSession;
  students?: StudentPaymentRecord[];
  schools?: SchoolProfile[];
  activeSchool?: SchoolProfile;
  onSelectSchool?: (schoolId: string) => void;
  onOpenAddSchool?: () => void;
  onOpenEditSchool?: (school: SchoolProfile) => void;
  onSaveSchool?: (schoolData: Omit<SchoolProfile, 'id' | 'createdAt'>, schoolId?: string, options?: { skipStudentFeeSync?: boolean }) => void;
  onUpdateStudentsFee?: (newSchedule: SchoolFeeSchedule, classFeeSchedulesOverride?: Record<string, SchoolFeeSchedule>) => void;
  onSaveConfig?: (config: SheetApiConfig, allConfigs?: Record<string, SheetApiConfig>) => void;
  onSaveSession: (session: BursarSession) => void;
  onOpenEndTerm?: () => void;
  onOpenRollover?: () => void;
  onOpenDuplicateCleaner?: () => void;
  onOpenAdditionalFees?: () => void;
  onUpdateSchoolFromFees?: (updatedSchool: SchoolProfile) => void;
  onUpdateStudentsFromFees?: (updatedStudents: StudentPaymentRecord[]) => void;
  onManageClasses?: (
    updatedSchool: SchoolProfile,
    reassignment?: { fromClass: string; toClass: string }
  ) => Promise<{ success: boolean; message?: string }>;
  onLogout?: () => void;
  onMergeDuplicateGroup?: (primaryId: string, mergedRecord: StudentPaymentRecord, deletedIds: string[]) => Promise<void> | void;
  onDeleteStudent?: (id: string, student: StudentPaymentRecord) => Promise<void> | void;
  onBatchResolveDuplicates?: (mergedRecords: StudentPaymentRecord[], deletedIds: string[]) => Promise<void> | void;
  onReplaceAllStudents?: (cloudStudents: StudentPaymentRecord[]) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  apiConfig,
  session,
  students = [],
  schools = [],
  activeSchool,
  onSelectSchool,
  onOpenAddSchool,
  onOpenEditSchool,
  onSaveSchool,
  onUpdateStudentsFee,
  onUpdateSchoolFromFees,
  onUpdateStudentsFromFees,
  onManageClasses,
  onSaveConfig,
  onSaveSession,
  onOpenEndTerm,
  onOpenRollover,
  onOpenDuplicateCleaner,
  onOpenAdditionalFees,
  onLogout,
  onMergeDuplicateGroup,
  onDeleteStudent,
  onBatchResolveDuplicates,
  onReplaceAllStudents,
}) => {
  // Navigation: null = Gallery View, string = active sub-app view
  const [activeAppId, setActiveAppId] = useState<AppToolId | null>(null);
  const [gallerySearch, setGallerySearch] = useState('');

  // Currently viewed school in the Sheet API section
  const [selectedApiSchoolId, setSelectedApiSchoolId] = useState<string>(activeSchool?.id || schools[0]?.id || 'dominion-group');

  // Map of API settings per school: { [schoolId]: { apiUrl: string, apiKey: string } }
  const [schoolApiMap, setSchoolApiMap] = useState<Record<string, { apiUrl: string; apiKey: string }>>({});

  const [schoolName, setSchoolName] = useState(session.schoolName || 'Dominion Group Of Schools');
  const [bursarName, setBursarName] = useState(session.bursarName || 'Bursar');
  const [currencySymbol, setCurrencySymbol] = useState(session.currencySymbol || '₦');

  // School wide academic session (default for every form and report)
  const [sessionInput, setSessionInput] = useState<string>(() => activeSchool?.academicSession || getCurrentAcademicSession());
  const [sessionNotice, setSessionNotice] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    setSessionInput(activeSchool?.academicSession || getCurrentAcademicSession());
  }, [activeSchool?.id, activeSchool?.academicSession]);

  const handleSaveAcademicSession = () => {
    if (!activeSchool || !onSaveSchool) return;
    const clean = normalizeSessionLabel(sessionInput);
    if (!clean) {
      setSessionNotice({ ok: false, text: 'Enter the session like 2026/2027. The second year must follow the first.' });
      return;
    }
    const { id: _id, createdAt: _createdAt, ...rest } = activeSchool;
    onSaveSchool({ ...rest, academicSession: clean }, activeSchool.id, { skipStudentFeeSync: true });
    setSessionInput(clean);
    setSessionNotice({ ok: true, text: `Session ${clean} saved. New students, admissions and reports now use it.` });
    setTimeout(() => setSessionNotice(null), 5000);
  };

  // Base Fee schedule modification state
  const [tuitionFee, setTuitionFee] = useState<string>(() => String(activeSchool?.feeSchedule?.tuitionFee ?? 15000));
  const [admissionFee, setAdmissionFee] = useState<string>(() => String(activeSchool?.feeSchedule?.admissionFee ?? 5000));
  const [examFee, setExamFee] = useState<string>(() => String(activeSchool?.feeSchedule?.examFee ?? 1500));
  const [lessonFeeMonthly, setLessonFeeMonthly] = useState<string>(() => String(activeSchool?.feeSchedule?.lessonFeeMonthly ?? 2500));
  const [lessonFeeTermly, setLessonFeeTermly] = useState<string>(() => String(activeSchool?.feeSchedule?.lessonFeeTermly ?? 7000));
  
  // Class-specific fee schedule state
  const [classFeeSchedules, setClassFeeSchedules] = useState<Record<string, SchoolFeeSchedule>>({});
  const [selectedFeeClass, setSelectedFeeClass] = useState<string>('');
  const [classTuition, setClassTuition] = useState<string>('');
  const [classAdmission, setClassAdmission] = useState<string>('');
  const [classExam, setClassExam] = useState<string>('');
  const [classLessonMonthly, setClassLessonMonthly] = useState<string>('');
  const [classLessonTermly, setClassLessonTermly] = useState<string>('');
  const [classOverrideSuccess, setClassOverrideSuccess] = useState<string | null>(null);

  // Custom Fee tab filtering, batch actions, and modal states
  const [feeSectionFilter, setFeeSectionFilter] = useState<'all' | 'nursery' | 'primary' | 'jss' | 'sss'>('all');
  const [feeSearchTerm, setFeeSearchTerm] = useState<string>('');
  const [showBulkAdjustModal, setShowBulkAdjustModal] = useState<boolean>(false);
  const [bulkSurchargeAmount, setBulkSurchargeAmount] = useState<string>('1000');
  const [bulkSurchargeType, setBulkSurchargeType] = useState<'fixed' | 'percent'>('fixed');
  const [bulkSurchargeTarget, setBulkSurchargeTarget] = useState<'all' | 'nursery' | 'primary' | 'jss' | 'sss'>('all');
  const [bulkSurchargeField, setBulkSurchargeField] = useState<'tuitionFee' | 'examFee' | 'lessonFeeTermly' | 'admissionFee'>('tuitionFee');

  const [applyToEnrolledStudents, setApplyToEnrolledStudents] = useState<boolean>(true);
  const [feeSaveSuccess, setFeeSaveSuccess] = useState<string | null>(null);

  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [copiedType, setCopiedType] = useState<'itemized' | 'staff' | 'expenses' | 'basic' | 'appscript' | 'rules' | 'env' | null>(null);
  const [showAppsScriptGuide, setShowAppsScriptGuide] = useState(false);
  const [headerTab, setHeaderTab] = useState<'students' | 'staff' | 'expenses'>('students');

  // Firebase Cloud State & Handlers
  const [firebaseUser, setFirebaseUser] = useState(getCurrentFirebaseUser());
  const [isFirebaseTesting, setIsFirebaseTesting] = useState(false);
  const [firebasePingResult, setFirebasePingResult] = useState<{ success: boolean; latencyMs: number; message: string } | null>(null);
  const [isFirebasePushing, setIsFirebasePushing] = useState(false);
  const [isFirebasePulling, setIsFirebasePulling] = useState(false);
  const [firebaseSyncMsg, setFirebaseSyncMsg] = useState<{ success: boolean; message: string } | null>(null);
  const [activeSyncLiveStatus, setActiveSyncLiveStatus] = useState<SyncStatus>(getSyncStatus());

  useEffect(() => {
    const unsubAuth = subscribeAuthState((u) => setFirebaseUser(u));
    const unsubSync = subscribeSyncStatus((s) => setActiveSyncLiveStatus(s));
    return () => {
      unsubAuth();
      unsubSync();
    };
  }, []);

  const handleTestFirebasePing = async () => {
    setIsFirebaseTesting(true);
    setFirebasePingResult(null);
    try {
      const res = await testFirebaseConnection();
      setFirebasePingResult(res);
    } catch (err: any) {
      setFirebasePingResult({
        success: false,
        latencyMs: 0,
        message: err?.message || 'Failed connecting to Firestore',
      });
    } finally {
      setIsFirebaseTesting(false);
    }
  };

  const handleFirebaseGoogleSignIn = async () => {
    try {
      const user = await signInWithGoogle();
      if (user) {
        setFirebaseSyncMsg({ success: true, message: `Connected as ${user.displayName || user.email}` });
        setTimeout(() => setFirebaseSyncMsg(null), 4000);
      }
    } catch (err: any) {
      setFirebaseSyncMsg({ success: false, message: `Sign in error: ${err?.message || err}` });
      setTimeout(() => setFirebaseSyncMsg(null), 5000);
    }
  };

  const handleFirebaseSignOut = async () => {
    try {
      await signOutFirebase();
      setFirebaseSyncMsg({ success: true, message: 'Signed out from Google account' });
      setTimeout(() => setFirebaseSyncMsg(null), 3000);
    } catch (err: any) {
      setFirebaseSyncMsg({ success: false, message: `Sign out error: ${err?.message || err}` });
    }
  };

  const handlePushAllToFirebase = async () => {
    if (!students || students.length === 0) {
      setFirebaseSyncMsg({ success: false, message: 'No student records to push.' });
      setTimeout(() => setFirebaseSyncMsg(null), 3000);
      return;
    }
    const currentSchoolId = activeSchool?.id || 'dominion-group';
    setIsFirebasePushing(true);
    setFirebaseSyncMsg(null);
    try {
      const ok = await batchSaveStudentsToFirestore(students, currentSchoolId);
      if (ok) {
        setFirebaseSyncMsg({
          success: true,
          message: `✓ Successfully synced ${students.length} student records to Cloud Firestore!`,
        });
      } else {
        setFirebaseSyncMsg({
          success: false,
          message: 'Could not push all records. Please check cloud connection.',
        });
      }
    } catch (err: any) {
      setFirebaseSyncMsg({ success: false, message: `Push failed: ${err?.message || err}` });
    } finally {
      setIsFirebasePushing(false);
      setTimeout(() => setFirebaseSyncMsg(null), 5000);
    }
  };

  const handlePullAllFromFirebase = async () => {
    const currentSchoolId = activeSchool?.id || 'dominion-group';

    if (!window.confirm('This will REPLACE all local student records with what is currently stored in Cloud Firestore. Any local-only or unsynced changes will be lost. Continue?')) {
      return;
    }

    setIsFirebasePulling(true);
    setFirebaseSyncMsg(null);
    try {
      const cloudStudents = await getStudentsFromFirestore(currentSchoolId);
      if (cloudStudents && cloudStudents.length > 0) {
        if (onReplaceAllStudents) {
          onReplaceAllStudents(cloudStudents);
        }
        setFirebaseSyncMsg({
          success: true,
          message: `✓ Successfully replaced local data with ${cloudStudents.length} student records from Cloud Firestore!`,
        });
      } else {
        setFirebaseSyncMsg({
          success: false,
          message: 'No student records found in Cloud Firestore for this campus.',
        });
      }
    } catch (err: any) {
      setFirebaseSyncMsg({ success: false, message: `Pull failed: ${err?.message || err}` });
    } finally {
      setIsFirebasePulling(false);
      setTimeout(() => setFirebaseSyncMsg(null), 5000);
    }
  };

  // Custom Dedicated Firebase Project State & Handlers
  const [activeFbConfig, setActiveFbConfig] = useState(() => getActiveFirebaseConfig());
  const [fbProjectId, setFbProjectId] = useState(() => {
    const stored = getStoredCustomConfig();
    return stored?.projectId || DNPS_PRESET_CONFIG.projectId;
  });
  const [fbApiKey, setFbApiKey] = useState(() => {
    const stored = getStoredCustomConfig();
    return stored?.apiKey || DNPS_PRESET_CONFIG.apiKey || '';
  });
  const [fbAuthDomain, setFbAuthDomain] = useState(() => {
    const stored = getStoredCustomConfig();
    return stored?.authDomain || DNPS_PRESET_CONFIG.authDomain;
  });
  const [fbStorageBucket, setFbStorageBucket] = useState(() => {
    const stored = getStoredCustomConfig();
    return stored?.storageBucket || DNPS_PRESET_CONFIG.storageBucket;
  });
  const [fbMessagingSenderId, setFbMessagingSenderId] = useState(() => {
    const stored = getStoredCustomConfig();
    return stored?.messagingSenderId || DNPS_PRESET_CONFIG.messagingSenderId;
  });
  const [fbAppId, setFbAppId] = useState(() => {
    const stored = getStoredCustomConfig();
    return stored?.appId || DNPS_PRESET_CONFIG.appId;
  });
  const [fbDatabaseId, setFbDatabaseId] = useState(() => {
    const stored = getStoredCustomConfig();
    return stored?.firestoreDatabaseId || getActiveFirebaseConfig().firestoreDatabaseId || 'dnpspay';
  });
  const [fbConfigSavedMsg, setFbConfigSavedMsg] = useState<{ success: boolean; message: string } | null>(null);
  const [showFirestoreRulesGuide, setShowFirestoreRulesGuide] = useState(false);
  const [showVercelEnvGuide, setShowVercelEnvGuide] = useState(false);

  const handleSaveCustomFirebase = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fbProjectId.trim()) {
      setFbConfigSavedMsg({ success: false, message: 'Firebase Project ID cannot be empty.' });
      setTimeout(() => setFbConfigSavedMsg(null), 4000);
      return;
    }
    if (!fbApiKey.trim() || !isRealApiKey(fbApiKey)) {
      setFbConfigSavedMsg({
        success: false,
        message: 'Please provide a valid Firebase Web API key (starts with AIzaSy...). The string "Your Firebase API key" is a placeholder.',
      });
      setTimeout(() => setFbConfigSavedMsg(null), 6000);
      return;
    }
    saveCustomFirebaseConfig({
      projectId: fbProjectId.trim(),
      apiKey: fbApiKey.trim(),
      authDomain: fbAuthDomain.trim() || `${fbProjectId.trim()}.firebaseapp.com`,
      storageBucket: fbStorageBucket.trim() || `${fbProjectId.trim()}.firebasestorage.app`,
      messagingSenderId: fbMessagingSenderId.trim(),
      appId: fbAppId.trim(),
      firestoreDatabaseId: fbDatabaseId.trim() || '(default)',
    });
    reinitializeFirebase();
    const updated = getActiveFirebaseConfig();
    setActiveFbConfig(updated);
    setFbConfigSavedMsg({
      success: true,
      message: `✓ Connected to custom Firebase project "${fbProjectId.trim()}"!`,
    });
    setTimeout(() => setFbConfigSavedMsg(null), 4000);
  };

  const handleResetToDefaultFirebase = () => {
    clearCustomFirebaseConfig();
    reinitializeFirebase();
    const updated = getActiveFirebaseConfig();
    setActiveFbConfig(updated);
    setFbProjectId(DNPS_PRESET_CONFIG.projectId);
    setFbApiKey(DNPS_PRESET_CONFIG.apiKey || '');
    setFbAuthDomain(DNPS_PRESET_CONFIG.authDomain);
    setFbStorageBucket(DNPS_PRESET_CONFIG.storageBucket);
    setFbMessagingSenderId(DNPS_PRESET_CONFIG.messagingSenderId);
    setFbAppId(DNPS_PRESET_CONFIG.appId);
    setFbDatabaseId(updated.firestoreDatabaseId || 'dnpspay');
    setFbConfigSavedMsg({
      success: true,
      message: `✓ Reverted to default Cloud Firestore (Database: ${updated.firestoreDatabaseId || 'dnpspay'}).`,
    });
    setTimeout(() => setFbConfigSavedMsg(null), 4000);
  };

  const handleLoadDnpsPreset = () => {
    setFbProjectId(DNPS_PRESET_CONFIG.projectId);
    setFbApiKey(DNPS_PRESET_CONFIG.apiKey || '');
    setFbAuthDomain(DNPS_PRESET_CONFIG.authDomain);
    setFbStorageBucket(DNPS_PRESET_CONFIG.storageBucket);
    setFbMessagingSenderId(DNPS_PRESET_CONFIG.messagingSenderId);
    setFbAppId(DNPS_PRESET_CONFIG.appId);
    setFbDatabaseId(DNPS_PRESET_CONFIG.firestoreDatabaseId);
    setFbConfigSavedMsg({
      success: true,
      message: `✓ Loaded DNPS Cloud Firestore credentials (Project: ${DNPS_PRESET_CONFIG.projectId}, DB: ${DNPS_PRESET_CONFIG.firestoreDatabaseId}).`,
    });
    setTimeout(() => setFbConfigSavedMsg(null), 5000);
  };

  // Term Schedule Configuration within Settings
  const settingsSchoolId = activeSchool?.id || session.schoolId || 'dominion-group';
  const [scheduleTerm, setScheduleTerm] = useState<string>('First Term');
  const [termScheduleData, setTermScheduleData] = useState<AcademicTermSchedule>(() =>
    getStoredTermSchedule('First Term', session.schoolName, settingsSchoolId)
  );
  const [scheduleStartDate, setScheduleStartDate] = useState(termScheduleData.termStartDate);
  const [scheduleEndDate, setScheduleEndDate] = useState(termScheduleData.termEndDate);
  const [scheduleSalaryDueDay, setScheduleSalaryDueDay] = useState(termScheduleData.salaryDueDay || 25);
  const [scheduleFeeStart, setScheduleFeeStart] = useState(termScheduleData.feeCollectionStartDate);
  const [scheduleFeeDue, setScheduleFeeDue] = useState(termScheduleData.feeDueDate);
  const [scheduleSavedMsg, setScheduleSavedMsg] = useState(false);

  const derivedScheduleMonths = useMemo(() => {
    return deriveMonthsBetweenDates(scheduleStartDate, scheduleEndDate);
  }, [scheduleStartDate, scheduleEndDate]);

  const scheduleTimelineStatus = useMemo(() => {
    return getFeeCollectionTimelineStatus({
      term: scheduleTerm,
      session: session.schoolName || getCurrentAcademicSession(),
      termStartDate: scheduleStartDate,
      termEndDate: scheduleEndDate,
      salaryDueDay: Number(scheduleSalaryDueDay) || 25,
      feeCollectionStartDate: scheduleFeeStart,
      feeDueDate: scheduleFeeDue,
      monthsInTerm: derivedScheduleMonths,
    });
  }, [scheduleTerm, session.schoolName, scheduleStartDate, scheduleEndDate, scheduleSalaryDueDay, scheduleFeeStart, scheduleFeeDue, derivedScheduleMonths]);

  // Sync state when props change or modal opens
  useEffect(() => {
    if (isOpen) {
      const initialMap: Record<string, { apiUrl: string; apiKey: string }> = {};
      schools.forEach((sch) => {
        initialMap[sch.id] = {
          apiUrl: sch.sheetConfig?.apiUrl || (sch.id === activeSchool?.id ? apiConfig.apiUrl : '') || '',
          apiKey: sch.sheetConfig?.apiKey || (sch.id === activeSchool?.id ? apiConfig.apiKey : '') || '',
        };
      });

      if (activeSchool && !initialMap[activeSchool.id]) {
        initialMap[activeSchool.id] = {
          apiUrl: apiConfig.apiUrl || '',
          apiKey: apiConfig.apiKey || '',
        };
      }

      setSchoolApiMap(initialMap);
      setSelectedApiSchoolId(activeSchool?.id || schools[0]?.id || 'dominion-group');
      setSchoolName(activeSchool?.name || session.schoolName || 'Dominion Group Of Schools');
      setBursarName(session.bursarName || 'Bursar');
      setCurrencySymbol(activeSchool?.currencySymbol || session.currencySymbol || '₦');
      setTestResult(null);
      setSaveSuccess(false);

      // Refresh schedule on open
      const sch = getStoredTermSchedule(scheduleTerm, session.schoolName, settingsSchoolId);
      setTermScheduleData(sch);
      setScheduleStartDate(sch.termStartDate);
      setScheduleEndDate(sch.termEndDate);
      setScheduleSalaryDueDay(sch.salaryDueDay || 25);
      setScheduleFeeStart(sch.feeCollectionStartDate);
      setScheduleFeeDue(sch.feeDueDate);

      // Refresh fee schedule inputs & class-specific schedules
      const baseT = String(activeSchool?.feeSchedule?.tuitionFee ?? 15000);
      const baseA = String(activeSchool?.feeSchedule?.admissionFee ?? 5000);
      const baseE = String(activeSchool?.feeSchedule?.examFee ?? 1500);
      const baseLM = String(activeSchool?.feeSchedule?.lessonFeeMonthly ?? 2500);
      const baseLT = String(activeSchool?.feeSchedule?.lessonFeeTermly ?? 7000);

      setTuitionFee(baseT);
      setAdmissionFee(baseA);
      setExamFee(baseE);
      setLessonFeeMonthly(baseLM);
      setLessonFeeTermly(baseLT);

      const initialClassSchedules = activeSchool?.classFeeSchedules ? { ...activeSchool.classFeeSchedules } : {};
      setClassFeeSchedules(initialClassSchedules);

      const schoolClasses = activeSchool?.classes && activeSchool.classes.length > 0
        ? activeSchool.classes
        : ['Kg1', 'Kg2', 'Nur1', 'Nur2', 'Pri1', 'Pri2', 'Pri3', 'Pri4', 'Pri5', 'Jss1', 'Jss2', 'Jss3', 'Ss1', 'Ss2', 'Ss3'];
      
      const firstClass = schoolClasses[0] || 'Pri1';
      setSelectedFeeClass(firstClass);

      const firstClassSchedule = initialClassSchedules[firstClass];
      if (firstClassSchedule) {
        setClassTuition(String(firstClassSchedule.tuitionFee ?? baseT));
        setClassAdmission(String(firstClassSchedule.admissionFee ?? baseA));
        setClassExam(String(firstClassSchedule.examFee ?? baseE));
        setClassLessonMonthly(String(firstClassSchedule.lessonFeeMonthly ?? baseLM));
        setClassLessonTermly(String(firstClassSchedule.lessonFeeTermly ?? baseLT));
      } else {
        setClassTuition(baseT);
        setClassAdmission(baseA);
        setClassExam(baseE);
        setClassLessonMonthly(baseLM);
        setClassLessonTermly(baseLT);
      }
    }
  }, [isOpen, apiConfig, session, activeSchool, schools, settingsSchoolId]);

  // Additional / Ancillary Fees state & handlers
  const [feeName, setFeeName] = useState('');
  const [feeAmount, setFeeAmount] = useState('');
  const [feeCategory, setFeeCategory] = useState<AdditionalFeeCategory>('levy');
  const [feeTargetClass, setFeeTargetClass] = useState<string>('all');
  const [feeTargetTerm, setFeeTargetTerm] = useState<string>('all');
  const [feeIsMandatory, setFeeIsMandatory] = useState<boolean>(true);
  const [feeSyncNotice, setFeeSyncNotice] = useState<string | null>(null);
  const [isSavingFee, setIsSavingFee] = useState<boolean>(false);

  const currentAdditionalFees = useMemo(() => {
    return activeSchool ? getSchoolAdditionalFees(activeSchool) : [];
  }, [activeSchool, schools]);

  const handleAddAdditionalFee = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSchool) return;
    const trimmedName = feeName.trim();
    const numAmount = Math.max(0, Number(feeAmount) || 0);

    if (!trimmedName) {
      alert('Please enter a fee name (e.g. PTA levy)');
      return;
    }
    if (numAmount <= 0) {
      alert('Please enter an amount greater than 0');
      return;
    }

    setIsSavingFee(true);
    try {
      const { updatedSchool } = addAdditionalFeeToSchool(activeSchool.id, {
        name: trimmedName,
        amount: numAmount,
        category: feeCategory,
        targetClass: feeTargetClass === 'all' ? 'all' : feeTargetClass,
        term: feeTargetTerm === 'all' ? 'all' : feeTargetTerm,
        targetTerm: feeTargetTerm === 'all' ? 'all' : feeTargetTerm,
        isCompulsory: feeIsMandatory,
      });

      // Synchronize to all enrolled students immediately
      const updatedStudents = syncAdditionalFeesToStudents(students, updatedSchool);

      if (onUpdateSchoolFromFees) {
        onUpdateSchoolFromFees(updatedSchool);
      } else if (onSaveSchool) {
        onSaveSchool(updatedSchool, updatedSchool.id);
      }

      if (onUpdateStudentsFromFees) {
        onUpdateStudentsFromFees(updatedStudents);
      }

      setFeeName('');
      setFeeAmount('');
      setFeeSyncNotice(`✓ "${trimmedName}" (${currencySymbol}${numAmount.toLocaleString()}) added! Total due updated across dashboard immediately.`);
      setTimeout(() => setFeeSyncNotice(null), 5000);
    } finally {
      setIsSavingFee(false);
    }
  };

  const handleToggleAdditionalFee = (feeId: string, feeName: string, currentEnabled?: boolean) => {
    if (!activeSchool) return;
    const newStatus = currentEnabled === false ? true : false;
    const updatedSchool = updateAdditionalFeeInSchool(activeSchool.id, feeId, {
      enabled: newStatus,
    });
    const updatedStudents = syncAdditionalFeesToStudents(students, updatedSchool);

    if (onUpdateSchoolFromFees) {
      onUpdateSchoolFromFees(updatedSchool);
    } else if (onSaveSchool) {
      onSaveSchool(updatedSchool, updatedSchool.id);
    }

    if (onUpdateStudentsFromFees) {
      onUpdateStudentsFromFees(updatedStudents);
    }

    setFeeSyncNotice(
      newStatus
        ? `✓ "${feeName}" is now ACTIVE and charging eligible students.`
        : `✓ "${feeName}" is now PAUSED (Disabled — not charging students).`
    );
    setTimeout(() => setFeeSyncNotice(null), 4000);
  };

  const handleDeleteAdditionalFee = (feeId: string, feeNameToDelete: string) => {
    if (!activeSchool) return;
    if (!window.confirm(`Remove "${feeNameToDelete}"? All students' total due will be recalculated immediately.`)) return;

    const updatedSchool = deleteAdditionalFeeFromSchool(activeSchool.id, feeId);
    const updatedStudents = syncAdditionalFeesToStudents(students, updatedSchool);

    if (onUpdateSchoolFromFees) {
      onUpdateSchoolFromFees(updatedSchool);
    } else if (onSaveSchool) {
      onSaveSchool(updatedSchool, updatedSchool.id);
    }

    if (onUpdateStudentsFromFees) {
      onUpdateStudentsFromFees(updatedStudents);
    }

    setFeeSyncNotice(`✓ Removed "${feeNameToDelete}" and updated all students.`);
    setTimeout(() => setFeeSyncNotice(null), 4000);
  };

  // Switch selected fee class and load its values
  const handleSelectFeeClass = (cls: string) => {
    setSelectedFeeClass(cls);
    const existing = classFeeSchedules[cls];
    if (existing) {
      setClassTuition(String(existing.tuitionFee ?? tuitionFee));
      setClassAdmission(String(existing.admissionFee ?? admissionFee));
      setClassExam(String(existing.examFee ?? examFee));
      setClassLessonMonthly(String(existing.lessonFeeMonthly ?? lessonFeeMonthly));
      setClassLessonTermly(String(existing.lessonFeeTermly ?? lessonFeeTermly));
    } else {
      setClassTuition(tuitionFee);
      setClassAdmission(admissionFee);
      setClassExam(examFee);
      setClassLessonMonthly(lessonFeeMonthly);
      setClassLessonTermly(lessonFeeTermly);
    }
  };

  // Set / update custom rates for the selected class and apply immediately
  const handleApplyClassOverride = () => {
    if (!selectedFeeClass || !activeSchool) return;
    const newClassSchedule: SchoolFeeSchedule = {
      tuitionFee: Math.max(0, Number(classTuition) || 0),
      admissionFee: Math.max(0, Number(classAdmission) || 0),
      examFee: Math.max(0, Number(classExam) || 0),
      lessonFeeMonthly: Math.max(0, Number(classLessonMonthly) || 0),
      lessonFeeTermly: Math.max(0, Number(classLessonTermly) || 0),
    };

    const nextClassSchedules = {
      ...classFeeSchedules,
      [selectedFeeClass]: newClassSchedule,
    };

    setClassFeeSchedules(nextClassSchedules);

    const parsedTuition = Math.max(0, Number(tuitionFee) || 0);
    const parsedAdmission = Math.max(0, Number(admissionFee) || 0);
    const parsedExam = Math.max(0, Number(examFee) || 0);
    const parsedLessonMonthly = Math.max(0, Number(lessonFeeMonthly) || 0);
    const parsedLessonTermly = Math.max(0, Number(lessonFeeTermly) || 0);

    const baseSchedule: SchoolFeeSchedule = {
      tuitionFee: parsedTuition,
      admissionFee: parsedAdmission,
      examFee: parsedExam,
      lessonFeeMonthly: parsedLessonMonthly,
      lessonFeeTermly: parsedLessonTermly,
    };

    // 1. Direct LocalStorage persistence
    updateSchoolFeeSchedule(activeSchool.id, baseSchedule, nextClassSchedules);

    // 2. Parent state notification
    if (onSaveSchool) {
      const payload: Omit<SchoolProfile, 'id' | 'createdAt'> = {
        name: activeSchool.name,
        type: activeSchool.type,
        currencySymbol: activeSchool.currencySymbol || currencySymbol || '₦',
        feeSchedule: baseSchedule,
        classFeeSchedules: Object.keys(nextClassSchedules).length > 0 ? nextClassSchedules : undefined,
        classes: activeSchool.classes,
        sheetConfig: activeSchool.sheetConfig,
      };
      onSaveSchool(payload, activeSchool.id, { skipStudentFeeSync: true });
    }

    // 3. Update enrolled students if enabled
    if (applyToEnrolledStudents && onUpdateStudentsFee) {
      onUpdateStudentsFee(baseSchedule, nextClassSchedules);
    }

    setClassOverrideSuccess(`✓ Modified rates for ${selectedFeeClass} saved permanently & applied across the app!`);
    setTimeout(() => setClassOverrideSuccess(null), 4000);
  };

  // Remove override for a class (revert to base rates) and apply immediately
  const handleResetClassOverride = (cls: string) => {
    if (!activeSchool) return;
    const nextClassSchedules = { ...classFeeSchedules };
    delete nextClassSchedules[cls];
    setClassFeeSchedules(nextClassSchedules);

    if (cls === selectedFeeClass) {
      setClassTuition(tuitionFee);
      setClassAdmission(admissionFee);
      setClassExam(examFee);
      setClassLessonMonthly(lessonFeeMonthly);
      setClassLessonTermly(lessonFeeTermly);
    }

    const parsedTuition = Math.max(0, Number(tuitionFee) || 0);
    const parsedAdmission = Math.max(0, Number(admissionFee) || 0);
    const parsedExam = Math.max(0, Number(examFee) || 0);
    const parsedLessonMonthly = Math.max(0, Number(lessonFeeMonthly) || 0);
    const parsedLessonTermly = Math.max(0, Number(lessonFeeTermly) || 0);

    const baseSchedule: SchoolFeeSchedule = {
      tuitionFee: parsedTuition,
      admissionFee: parsedAdmission,
      examFee: parsedExam,
      lessonFeeMonthly: parsedLessonMonthly,
      lessonFeeTermly: parsedLessonTermly,
    };

    // 1. Direct LocalStorage persistence
    updateSchoolFeeSchedule(activeSchool.id, baseSchedule, nextClassSchedules);

    // 2. Parent state notification
    if (onSaveSchool) {
      const payload: Omit<SchoolProfile, 'id' | 'createdAt'> = {
        name: activeSchool.name,
        type: activeSchool.type,
        currencySymbol: activeSchool.currencySymbol || currencySymbol || '₦',
        feeSchedule: baseSchedule,
        classFeeSchedules: Object.keys(nextClassSchedules).length > 0 ? nextClassSchedules : undefined,
        classes: activeSchool.classes,
        sheetConfig: activeSchool.sheetConfig,
      };
      onSaveSchool(payload, activeSchool.id, { skipStudentFeeSync: true });
    }

    // 3. Update enrolled students if enabled
    if (applyToEnrolledStudents && onUpdateStudentsFee) {
      onUpdateStudentsFee(baseSchedule, nextClassSchedules);
    }

    setClassOverrideSuccess(`✓ Reverted ${cls} to Base Academy Rates across the app`);
    setTimeout(() => setClassOverrideSuccess(null), 4000);
  };

  // Copy base rates into class inputs
  const handleCopyBaseToClass = () => {
    setClassTuition(tuitionFee);
    setClassAdmission(admissionFee);
    setClassExam(examFee);
    setClassLessonMonthly(lessonFeeMonthly);
    setClassLessonTermly(lessonFeeTermly);
  };

  // Helper to categorize classes into educational tiers
  const getClassSection = (cls: string): 'nursery' | 'primary' | 'jss' | 'sss' | 'other' => {
    const c = cls.toLowerCase().trim();
    if (c.startsWith('kg') || c.startsWith('nur') || c.includes('creche') || c.includes('play')) return 'nursery';
    if (c.startsWith('pri') || c.startsWith('basic') || c.startsWith('grade')) return 'primary';
    if (c.startsWith('jss') || c.startsWith('j.s')) return 'jss';
    if (c.startsWith('ss') || c.startsWith('s.s')) return 'sss';
    return 'other';
  };

  const schoolClassesList = useMemo(() => {
    const fromSchool = activeSchool?.classes && activeSchool.classes.length > 0
      ? activeSchool.classes
      : ['Kg1', 'Kg2', 'Nur1', 'Nur2', 'Pri1', 'Pri2', 'Pri3', 'Pri4', 'Pri5', 'Jss1', 'Jss2', 'Jss3', 'Ss1', 'Ss2', 'Ss3'];
    const set = new Set(fromSchool);
    if (Array.isArray(students)) {
      students.forEach((s) => {
        if (s.class && String(s.class).trim()) {
          set.add(String(s.class).trim());
        }
      });
    }
    return Array.from(set);
  }, [activeSchool, students]);

  // Enrolled student counts and projected revenue calculations
  const classEnrollmentStats = useMemo(() => {
    const counts: Record<string, number> = {};
    const revenue: Record<string, number> = {};
    let totalEnrolled = 0;
    let totalProjected = 0;

    if (Array.isArray(students)) {
      students.forEach((s) => {
        if (!s) return;
        const cls = s.class || 'Unassigned';
        counts[cls] = (counts[cls] || 0) + 1;
        totalEnrolled += 1;
      });
    }

    schoolClassesList.forEach((cls) => {
      const count = counts[cls] || 0;
      const sched = classFeeSchedules[cls] || {
        tuitionFee: Number(tuitionFee) || 15000,
        examFee: Number(examFee) || 1500,
        lessonFeeTermly: Number(lessonFeeTermly) || 7000,
      };
      const termPkg = (sched.tuitionFee || 0) + (sched.examFee || 0) + (sched.lessonFeeTermly || 0);
      const rev = count * termPkg;
      revenue[cls] = rev;
      totalProjected += rev;
    });

    return { counts, revenue, totalEnrolled, totalProjected };
  }, [students, schoolClassesList, classFeeSchedules, tuitionFee, examFee, lessonFeeTermly]);

  // Batch apply current form rates to an entire educational tier/section
  const handleBatchApplyToSection = (section: 'nursery' | 'primary' | 'jss' | 'sss' | 'all') => {
    if (!activeSchool) return;
    const targetClasses = schoolClassesList.filter(
      (cls) => section === 'all' || getClassSection(cls) === section
    );
    if (targetClasses.length === 0) return;

    const newScheduleForSection: SchoolFeeSchedule = {
      tuitionFee: Math.max(0, Number(classTuition) || 0),
      admissionFee: Math.max(0, Number(classAdmission) || 0),
      examFee: Math.max(0, Number(classExam) || 0),
      lessonFeeMonthly: Math.max(0, Number(classLessonMonthly) || 0),
      lessonFeeTermly: Math.max(0, Number(classLessonTermly) || 0),
    };

    const nextClassSchedules = { ...classFeeSchedules };
    targetClasses.forEach((cls) => {
      nextClassSchedules[cls] = { ...newScheduleForSection };
    });

    setClassFeeSchedules(nextClassSchedules);

    const baseSchedule: SchoolFeeSchedule = {
      tuitionFee: Math.max(0, Number(tuitionFee) || 0),
      admissionFee: Math.max(0, Number(admissionFee) || 0),
      examFee: Math.max(0, Number(examFee) || 0),
      lessonFeeMonthly: Math.max(0, Number(lessonFeeMonthly) || 0),
      lessonFeeTermly: Math.max(0, Number(lessonFeeTermly) || 0),
    };

    updateSchoolFeeSchedule(activeSchool.id, baseSchedule, nextClassSchedules);
    if (onSaveSchool) {
      onSaveSchool(
        {
          name: activeSchool.name,
          type: activeSchool.type,
          currencySymbol: activeSchool.currencySymbol || currencySymbol || '₦',
          feeSchedule: baseSchedule,
          classFeeSchedules: nextClassSchedules,
          classes: activeSchool.classes,
          sheetConfig: activeSchool.sheetConfig,
        },
        activeSchool.id,
        { skipStudentFeeSync: true }
      );
    }
    if (applyToEnrolledStudents && onUpdateStudentsFee) {
      onUpdateStudentsFee(baseSchedule, nextClassSchedules);
    }

    setClassOverrideSuccess(
      `✓ Applied rates to all ${targetClasses.length} classes in ${section.toUpperCase()}!`
    );
    setTimeout(() => setClassOverrideSuccess(null), 4000);
  };

  // Reset all class fee overrides back to the base academy schedule
  const handleResetAllClassOverrides = () => {
    if (!activeSchool) return;
    setClassFeeSchedules({});

    const baseSchedule: SchoolFeeSchedule = {
      tuitionFee: Math.max(0, Number(tuitionFee) || 0),
      admissionFee: Math.max(0, Number(admissionFee) || 0),
      examFee: Math.max(0, Number(examFee) || 0),
      lessonFeeMonthly: Math.max(0, Number(lessonFeeMonthly) || 0),
      lessonFeeTermly: Math.max(0, Number(lessonFeeTermly) || 0),
    };

    updateSchoolFeeSchedule(activeSchool.id, baseSchedule, {});
    if (onSaveSchool) {
      onSaveSchool(
        {
          name: activeSchool.name,
          type: activeSchool.type,
          currencySymbol: activeSchool.currencySymbol || currencySymbol || '₦',
          feeSchedule: baseSchedule,
          classFeeSchedules: undefined,
          classes: activeSchool.classes,
          sheetConfig: activeSchool.sheetConfig,
        },
        activeSchool.id,
        { skipStudentFeeSync: true }
      );
    }
    if (applyToEnrolledStudents && onUpdateStudentsFee) {
      onUpdateStudentsFee(baseSchedule, {});
    }

    setClassTuition(tuitionFee);
    setClassAdmission(admissionFee);
    setClassExam(examFee);
    setClassLessonMonthly(lessonFeeMonthly);
    setClassLessonTermly(lessonFeeTermly);

    setClassOverrideSuccess('✓ Reverted all classes to Base Academy Rates across the entire app!');
    setTimeout(() => setClassOverrideSuccess(null), 4000);
  };

  // Bulk rate adjuster (surcharge or discount)
  const handleApplyBulkAdjust = () => {
    const val = Number(bulkSurchargeAmount);
    if (isNaN(val) || val === 0 || !activeSchool) return;

    const targetClasses = schoolClassesList.filter(
      (cls) => bulkSurchargeTarget === 'all' || getClassSection(cls) === bulkSurchargeTarget
    );
    const nextClassSchedules = { ...classFeeSchedules };

    targetClasses.forEach((cls) => {
      const current = classFeeSchedules[cls] || {
        tuitionFee: Number(tuitionFee) || 0,
        admissionFee: Number(admissionFee) || 0,
        examFee: Number(examFee) || 0,
        lessonFeeMonthly: Number(lessonFeeMonthly) || 0,
        lessonFeeTermly: Number(lessonFeeTermly) || 0,
      };

      const originalAmt = current[bulkSurchargeField] || 0;
      const delta =
        bulkSurchargeType === 'percent' ? Math.round((originalAmt * val) / 100) : val;

      nextClassSchedules[cls] = {
        ...current,
        [bulkSurchargeField]: Math.max(0, originalAmt + delta),
      };
    });

    setClassFeeSchedules(nextClassSchedules);

    const baseSchedule: SchoolFeeSchedule = {
      tuitionFee: Math.max(0, Number(tuitionFee) || 0),
      admissionFee: Math.max(0, Number(admissionFee) || 0),
      examFee: Math.max(0, Number(examFee) || 0),
      lessonFeeMonthly: Math.max(0, Number(lessonFeeMonthly) || 0),
      lessonFeeTermly: Math.max(0, Number(lessonFeeTermly) || 0),
    };

    updateSchoolFeeSchedule(activeSchool.id, baseSchedule, nextClassSchedules);
    if (onSaveSchool) {
      onSaveSchool(
        {
          name: activeSchool.name,
          type: activeSchool.type,
          currencySymbol: activeSchool.currencySymbol || currencySymbol || '₦',
          feeSchedule: baseSchedule,
          classFeeSchedules: nextClassSchedules,
          classes: activeSchool.classes,
          sheetConfig: activeSchool.sheetConfig,
        },
        activeSchool.id,
        { skipStudentFeeSync: true }
      );
    }
    if (applyToEnrolledStudents && onUpdateStudentsFee) {
      onUpdateStudentsFee(baseSchedule, nextClassSchedules);
    }

    // Refresh currently edited inputs if in target list
    if (selectedFeeClass && targetClasses.includes(selectedFeeClass)) {
      const updated = nextClassSchedules[selectedFeeClass];
      if (updated) {
        setClassTuition(String(updated.tuitionFee));
        setClassAdmission(String(updated.admissionFee));
        setClassExam(String(updated.examFee));
        setClassLessonMonthly(String(updated.lessonFeeMonthly));
        setClassLessonTermly(String(updated.lessonFeeTermly));
      }
    }

    setShowBulkAdjustModal(false);
    setClassOverrideSuccess(
      `✓ Adjusted ${bulkSurchargeField} for ${targetClasses.length} classes by ${
        bulkSurchargeType === 'percent' ? `${val}%` : `${currencySymbol}${val.toLocaleString()}`
      }!`
    );
    setTimeout(() => setClassOverrideSuccess(null), 4000);
  };

  // Export fee schedule to CSV
  const handleExportFeeScheduleCsv = () => {
    const headers = [
      'Class',
      'Section',
      'Tuition Fee',
      'Admission Fee (New)',
      'Exam Fee',
      'Lesson Monthly',
      'Lesson Termly',
      'Total Term Package (Tuition+Exam+Lesson)',
      'Enrolled Students',
      'Projected Revenue',
      'Rate Status',
    ];
    const rows = schoolClassesList.map((cls) => {
      const override = classFeeSchedules[cls];
      const t = override?.tuitionFee ?? (Number(tuitionFee) || 15000);
      const a = override?.admissionFee ?? (Number(admissionFee) || 5000);
      const e = override?.examFee ?? (Number(examFee) || 1500);
      const lm = override?.lessonFeeMonthly ?? (Number(lessonFeeMonthly) || 2500);
      const lt = override?.lessonFeeTermly ?? (Number(lessonFeeTermly) || 7000);
      const totalTerm = t + e + lt;
      const count = classEnrollmentStats.counts[cls] || 0;
      const rev = count * totalTerm;
      const sec = getClassSection(cls).toUpperCase();
      const status = override ? 'Custom Rate' : 'Base Rate';
      return [cls, sec, t, a, e, lm, lt, totalTerm, count, rev, status];
    });

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `${(activeSchool?.name || 'School').replace(/\s+/g, '_')}_Fee_Schedule_${
        new Date().toISOString().split('T')[0]
      }.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Print official school fee schedule
  const handlePrintFeeSchedule = () => {
    window.print();
  };

  const handleSaveFeeSchedule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSchool) return;

    const parsedTuition = Math.max(0, Number(tuitionFee) || 0);
    const parsedAdmission = Math.max(0, Number(admissionFee) || 0);
    const parsedExam = Math.max(0, Number(examFee) || 0);
    const parsedLessonMonthly = Math.max(0, Number(lessonFeeMonthly) || 0);
    const parsedLessonTermly = Math.max(0, Number(lessonFeeTermly) || 0);

    const updatedSchedule: SchoolFeeSchedule = {
      tuitionFee: parsedTuition,
      admissionFee: parsedAdmission,
      examFee: parsedExam,
      lessonFeeMonthly: parsedLessonMonthly,
      lessonFeeTermly: parsedLessonTermly,
    };

    const finalClassSchedules = { ...classFeeSchedules };

    // Only update selectedFeeClass if it is already an explicit class override
    if (selectedFeeClass && classFeeSchedules[selectedFeeClass]) {
      const currentClassTuition = Math.max(0, Number(classTuition) || 0);
      const currentClassAdmission = Math.max(0, Number(classAdmission) || 0);
      const currentClassExam = Math.max(0, Number(classExam) || 0);
      const currentClassLessonMonthly = Math.max(0, Number(classLessonMonthly) || 0);
      const currentClassLessonTermly = Math.max(0, Number(classLessonTermly) || 0);

      finalClassSchedules[selectedFeeClass] = {
        tuitionFee: currentClassTuition,
        admissionFee: currentClassAdmission,
        examFee: currentClassExam,
        lessonFeeMonthly: currentClassLessonMonthly,
        lessonFeeTermly: currentClassLessonTermly,
      };
    }

    // 1. Direct LocalStorage persistence
    updateSchoolFeeSchedule(activeSchool.id, updatedSchedule, finalClassSchedules);

    // 2. Parent state notification
    if (onSaveSchool) {
      const payload: Omit<SchoolProfile, 'id' | 'createdAt'> = {
        name: activeSchool.name,
        type: activeSchool.type,
        currencySymbol: activeSchool.currencySymbol || currencySymbol || '₦',
        feeSchedule: updatedSchedule,
        classFeeSchedules: Object.keys(finalClassSchedules).length > 0 ? finalClassSchedules : undefined,
        classes: activeSchool.classes,
        sheetConfig: activeSchool.sheetConfig,
      };
      onSaveSchool(payload, activeSchool.id, { skipStudentFeeSync: true });
    }

    // 3. Update enrolled students if enabled
    if (applyToEnrolledStudents && onUpdateStudentsFee) {
      onUpdateStudentsFee(updatedSchedule, finalClassSchedules);
    }

    const sym = activeSchool.currencySymbol || currencySymbol || '₦';
    const customCount = Object.keys(finalClassSchedules).length;
    setFeeSaveSuccess(`✓ All fee schedules saved permanently! Base School Fee: ${sym}${parsedTuition.toLocaleString()}${customCount > 0 ? ` (${customCount} class-specific override${customCount > 1 ? 's' : ''} active)` : ''}. Applied immediately across the entire app!`);
    setTimeout(() => {
      setFeeSaveSuccess(null);
    }, 4500);
  };

  // Count active duplicates for live badge
  const duplicateStats = useMemo(() => {
    if (!students || students.length < 2) return { count: 0, groups: 0 };
    const groups = findDuplicateGroups(students, 'all');
    const redundantCount = groups.reduce((acc, g) => acc + (g.records.length - 1), 0);
    return { count: redundantCount, groups: groups.length };
  }, [students]);

  // Data Health inspection stats
  const healthStats = useMemo(() => {
    let negativeBalances = 0;
    let missingClasses = 0;
    let zeroFees = 0;
    let missingNames = 0;
    students.forEach((s) => {
      if (!s) return;
      if (Number(s.balance) < 0) negativeBalances++;
      if (!s.class || !s.class.trim()) missingClasses++;
      if (Number(s.fee_amount || s.tuition_fee || 0) <= 0) zeroFees++;
      if (!s.full_name || !s.full_name.trim()) missingNames++;
    });

    const totalIssues = negativeBalances + missingClasses + zeroFees + missingNames;
    return {
      negativeBalances,
      missingClasses,
      zeroFees,
      missingNames,
      totalIssues,
      isClean: totalIssues === 0 && duplicateStats.count === 0,
    };
  }, [students, duplicateStats]);

  const currentSelectedSchool = schools.find((s) => s.id === selectedApiSchoolId) || activeSchool || schools[0];
  const currentSchoolApi = schoolApiMap[selectedApiSchoolId] || { apiUrl: '', apiKey: '' };

  const handleUpdateCurrentSchoolApi = (field: 'apiUrl' | 'apiKey', value: string) => {
    setSchoolApiMap((prev) => ({
      ...prev,
      [selectedApiSchoolId]: {
        ...prev[selectedApiSchoolId],
        [field]: value,
      },
    }));
    setTestResult(null);
  };

  const exactHeaders =
    'id,full_name,class,term,session,fee_amount,amount_paid,balance,status,payment_date,admission_fee,admission_paid,lesson_fee,lesson_paid,exam_fee,exam_paid,lesson_months,receipt_no,total_remitted';
  const standardHeaders =
    'id,full_name,class,term,session,fee_amount,amount_paid,balance,status,payment_date,admission_fee,admission_paid,receipt_no,total_remitted';
  const exactStaffHeaders =
    'staff_id,staff_name,role,department,month,term,session,base_salary,allowances,deductions,net_pay,payment_status,amount_paid,payment_date,payment_method,reference_number,bank_name,account_number,phone,remarks';
  const exactExpenseHeaders =
    'id,date,category,category_label,description,amount,payment_method,recipient,receipt_voucher_ref,term,session,recorded_by,notes,created_at';

  const handleCopyHeaders = async (
    textToCopy: string,
    type: 'itemized' | 'staff' | 'expenses' | 'basic' | 'appscript' | 'rules' | 'env'
  ) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(textToCopy);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = textToCopy;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
    } catch (e) {
      console.warn('Clipboard write restricted in iframe:', e);
    }
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2500);
  };

  const handleSaveAll = (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const allConfigs: Record<string, SheetApiConfig> = {};
    Object.entries(schoolApiMap).forEach(([schId, cfg]) => {
      allConfigs[schId] = {
        apiUrl: cfg.apiUrl.trim(),
        apiKey: cfg.apiKey.trim(),
        provider: 'generic',
      };
    });

    const activeConfig = allConfigs[activeSchool?.id || 'dominion-group'] || {
      apiUrl: currentSchoolApi.apiUrl.trim(),
      apiKey: currentSchoolApi.apiKey.trim(),
      provider: 'generic',
    };

    if (onSaveConfig) {
      onSaveConfig(activeConfig, allConfigs);
    }

    onSaveSession({
      ...session,
      schoolName: schoolName.trim() || 'Dominion Group Of Schools',
      bursarName: bursarName.trim() || 'Bursar',
      currencySymbol: currencySymbol.trim() || '₦',
    });

    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
      setActiveAppId(null);
    }, 800);
  };

  const handleTermTabSwitch = (t: string) => {
    setScheduleTerm(t);
    const sch = getStoredTermSchedule(t, session.schoolName, settingsSchoolId);
    setTermScheduleData(sch);
    setScheduleStartDate(sch.termStartDate);
    setScheduleEndDate(sch.termEndDate);
    setScheduleSalaryDueDay(sch.salaryDueDay || 25);
    setScheduleFeeStart(sch.feeCollectionStartDate);
    setScheduleFeeDue(sch.feeDueDate);
  };

  const handleSaveTermSchedule = (e: React.FormEvent) => {
    e.preventDefault();
    const updated: AcademicTermSchedule = {
      term: scheduleTerm,
      session: session.schoolName || getCurrentAcademicSession(),
      termStartDate: scheduleStartDate,
      termEndDate: scheduleEndDate,
      salaryDueDay: Math.min(28, Math.max(1, Number(scheduleSalaryDueDay) || 25)),
      feeCollectionStartDate: scheduleFeeStart,
      feeDueDate: scheduleFeeDue,
      monthsInTerm: derivedScheduleMonths.length > 0 ? derivedScheduleMonths : ['2026-09', '2026-10', '2026-11'],
      updatedAt: new Date().toISOString(),
    };
    saveStoredTermSchedule(updated, settingsSchoolId);
    saveTermScheduleToFirestore(updated, settingsSchoolId).catch((err) =>
      console.warn('[Firestore] Error saving term schedule:', err)
    );
    setTermScheduleData(updated);
    setScheduleSavedMsg(true);
    setTimeout(() => {
      setScheduleSavedMsg(false);
      setActiveAppId(null);
    }, 1000);
  };

  if (!isOpen) return null;

  // List of all Apps in the Gallery (Admins have access to User Credentials & Audit Logs, Bursars do not)
  const isAdmin = session.role === 'admin';

  const primaryApps = [
    ...(isAdmin
      ? [
          {
            id: 'user_credentials' as AppToolId,
            title: '👑 User Credentials & RBAC Security',
            category: 'Security & Access Control',
            description: 'Manage Admin & Bursar usernames, passwords, access privileges & cloud sync',
            icon: ShieldCheck,
            color: 'bg-purple-700 text-white',
            badge: 'Admin Only',
            badgeColor: 'bg-purple-100 text-purple-800 font-bold',
          },
        ]
      : []),
    {
      id: 'school_branding' as AppToolId,
      title: '🎨 School Branding & Customizer',
      category: 'School Customization',
      description: 'Change School Name, Logo (upload/URL/presets), Theme Color, and Official Receipt credentials',
      icon: Palette,
      color: 'bg-purple-600 text-white',
      badge: 'Customizable',
      badgeColor: 'bg-purple-100 text-purple-800 font-bold',
    },
    {
      id: 'fee_update' as AppToolId,
      title: 'Fee Update & Class Rates',
      category: 'Fee Configuration',
      description: 'Set & modify school fees per class with persistent storage & Google Sheets sync',
      icon: Coins,
      color: 'bg-purple-600 text-white',
      badge: `${Object.keys(classFeeSchedules).length} Custom Classes`,
      badgeColor: Object.keys(classFeeSchedules).length > 0 ? 'bg-purple-100 text-purple-800 font-bold' : 'bg-slate-100 text-slate-700',
    },
    {
      id: 'class_manager' as AppToolId,
      title: 'Class Manager',
      category: 'Academy Configuration',
      description: 'Add, rename, and remove classes with safe student reassignment',
      icon: BookOpen,
      color: 'bg-blue-700 text-white',
      badge: `${activeSchool?.classes?.length || 0} Classes`,
      badgeColor: 'bg-blue-100 text-blue-800 font-bold',
    },
    {
      id: 'additional_fees' as AppToolId,
      title: 'Additional & Ancillary Fees',
      category: 'Fee Configuration',
      description: 'Manage PTA levies, uniforms, graduation, excursions, ICT and class-specific fees',
      icon: Layers,
      color: 'bg-emerald-600 text-white',
      badge: `${activeSchool?.additionalFees?.length || 0} Configured`,
      badgeColor: 'bg-emerald-100 text-emerald-800 font-bold',
    },
    {
      id: 'firebase_cloud' as AppToolId,
      title: 'Firebase Cloud Database & Sync',
      category: 'Core Integration',
      description: 'Dedicated Firestore database (dnpspay), API credentials, latency ping & data sync',
      icon: Cloud,
      color: 'bg-amber-600 text-white',
      badge: activeFbConfig.isCustom ? `Custom: ${activeFbConfig.projectId}` : 'Cloud Live',
      badgeColor: activeFbConfig.isCustom ? 'bg-amber-100 text-amber-800 font-bold' : 'bg-emerald-100 text-emerald-800 font-bold',
    },
    {
      id: 'school_profiles' as AppToolId,
      title: 'Academy Fees & Campuses',
      category: 'Academy Configuration',
      description: 'Switch school campuses, manage classes, and adjust base & class fee schedules',
      icon: Building2,
      color: 'bg-indigo-600 text-white',
      badge: 'Active',
      badgeColor: 'bg-indigo-100 text-indigo-800 font-bold',
    },
    {
      id: 'duplicate_cleaner' as AppToolId,
      title: 'Duplicate Cleaner Hub',
      category: 'Data Quality',
      description: 'Filter by ID & Name, side-by-side verify, and 1-click merge records',
      icon: Users,
      color: 'bg-rose-600 text-white',
      badge: duplicateStats.count > 0 ? `${duplicateStats.count} Duplicates Found` : 'Clean',
      badgeColor: duplicateStats.count > 0 ? 'bg-rose-100 text-rose-800 font-black animate-pulse' : 'bg-emerald-100 text-emerald-800',
      action: onOpenDuplicateCleaner
        ? () => {
            onClose();
            onOpenDuplicateCleaner();
          }
        : undefined,
    },
    {
      id: 'term_schedule' as AppToolId,
      title: 'Term Duration & Payment Schedule',
      category: 'Academic Schedule',
      description: 'Define term start & end dates, staff salary due day, and fee collection start dates',
      icon: Calendar,
      color: 'bg-emerald-600 text-white',
      badge: 'Payroll & Fees',
      badgeColor: 'bg-emerald-100 text-emerald-800 font-bold',
    },
    {
      id: 'bursar_settings' as AppToolId,
      title: 'Bursar & Currency Profile',
      category: 'Preferences',
      description: 'Bursar officer name, currency symbol, default receipt headers',
      icon: UserCheck,
      color: 'bg-amber-600 text-white',
      badge: currencySymbol,
      badgeColor: 'bg-amber-100 text-amber-800 font-mono',
    },
  ];

  const additionalApps = [
    {
      id: 'term_rollover' as AppToolId,
      title: 'Term Rollover & Promotion',
      category: 'Academic Transition',
      description: 'Advance students to next term, carry forward arrears, & promote classes',
      icon: RefreshCw,
      color: 'bg-teal-600 text-white',
      badge: 'Protected',
      badgeColor: 'bg-teal-100 text-teal-800',
      action: onOpenRollover
        ? () => {
            onClose();
            onOpenRollover();
          }
        : undefined,
    },
    {
      id: 'end_term' as AppToolId,
      title: 'End-of-Term Snapshot',
      category: 'Audit & Archiving',
      description: 'Freeze term financial records, audit lock, & download ledger spreadsheets',
      icon: Archive,
      color: 'bg-purple-600 text-white',
      badge: 'Audit Lock',
      badgeColor: 'bg-purple-100 text-purple-800',
      action: onOpenEndTerm
        ? () => {
            onClose();
            onOpenEndTerm();
          }
        : undefined,
    },
    {
      id: 'backups' as AppToolId,
      title: 'Backup & Restore Center',
      category: 'Data Protection',
      description: 'Export instant offline CSV and JSON emergency backup files',
      icon: Download,
      color: 'bg-emerald-600 text-white',
      badge: 'Offline Safe',
      badgeColor: 'bg-emerald-100 text-emerald-800',
    },
    {
      id: 'data_inspector' as AppToolId,
      title: 'Data Health & Audit Inspector',
      category: 'Diagnostics',
      description: 'Scan roster for zero fees, negative balances, or unassigned classrooms',
      icon: ShieldCheck,
      color: 'bg-cyan-700 text-white',
      badge: healthStats.isClean ? 'Optimal Health' : `${healthStats.totalIssues} Alerts`,
      badgeColor: healthStats.isClean ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800',
    },
    ...(isAdmin
      ? [
          {
            id: 'audit_logs' as AppToolId,
            title: 'Activity Logs & Audit Trails',
            category: 'Audit & Tracking',
            description: 'Tamper-evident, undeletable logs tracking every payment, staff, expense & system action',
            icon: Shield,
            color: 'bg-indigo-900 text-white',
            badge: 'Admin Only',
            badgeColor: 'bg-indigo-100 text-indigo-800 font-bold',
          },
        ]
      : []),
  ];

  // Filter gallery apps by search
  const filteredPrimary = primaryApps.filter(
    (app) =>
      app.title.toLowerCase().includes(gallerySearch.toLowerCase()) ||
      app.description.toLowerCase().includes(gallerySearch.toLowerCase()) ||
      app.category.toLowerCase().includes(gallerySearch.toLowerCase())
  );

  const filteredAdditional = additionalApps.filter(
    (app) =>
      app.title.toLowerCase().includes(gallerySearch.toLowerCase()) ||
      app.description.toLowerCase().includes(gallerySearch.toLowerCase()) ||
      app.category.toLowerCase().includes(gallerySearch.toLowerCase())
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-xs">
      <div className="w-full max-w-4xl bg-white h-[100dvh] sm:h-auto sm:max-h-[90dvh] rounded-none sm:rounded-3xl flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-in slide-in-from-bottom duration-200">
        {/* Navigation Bar */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-slate-200 bg-white sticky top-0 z-20 shrink-0">
          <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
            {activeAppId ? (
              <button
                type="button"
                onClick={() => setActiveAppId(null)}
                className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-indigo-700 flex items-center gap-1 transition-colors cursor-pointer mr-0.5 font-bold text-xs shrink-0 border border-slate-200 shadow-2xs active:scale-95"
                title="Back to App Gallery"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>
            ) : (
              <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-2xl bg-[#1a1a1a] text-white flex items-center justify-center shadow-xs shrink-0">
                <LayoutGrid className="w-4 h-4 text-blue-400" />
              </div>
            )}
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-black text-[#1a1a1a] uppercase tracking-tight truncate">
                {activeAppId === 'user_credentials'
                  ? 'User Credentials & RBAC Security'
                  : activeAppId === 'school_branding'
                  ? 'School Branding & White-Label Customizer'
                  : activeAppId === 'fee_update'
                  ? 'Fee Update & Class Fee Rates'
                  : activeAppId === 'additional_fees'
                  ? 'Additional & Ancillary Fees Manager'
                  : activeAppId === 'duplicate_cleaner'
                  ? 'Duplicate Records Cleaner'
                  : activeAppId === 'firebase_cloud'
                  ? 'Firebase Cloud Database & Sync'
                  : activeAppId === 'school_profiles'
                  ? 'School Campuses & Fee Schedules'
                  : activeAppId === 'class_manager'
                  ? 'Class Manager'
                  : activeAppId === 'term_schedule'
                  ? 'Term Duration & Payment Schedule'
                  : activeAppId === 'bursar_settings'
                  ? 'Bursar & Currency Settings'
                  : activeAppId === 'backups'
                  ? 'Backup & Data Export'
                  : activeAppId === 'data_inspector'
                  ? 'Data Health & Integrity Inspector'
                  : activeAppId === 'audit_logs'
                  ? 'Activity Logs & Immutable Audit Trail'
                  : 'Bursar Tools & App Gallery'}
              </h3>
              <p className="text-[10px] sm:text-[11px] text-[#a0a0a0] font-medium truncate">
                {activeAppId ? 'Tap "Back" to return to App Gallery' : 'Select an app or utility to launch'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {activeAppId && (
              <button
                type="button"
                onClick={() => setActiveAppId(null)}
                className="text-xs font-bold text-blue-600 hover:text-blue-800 px-2.5 py-1 rounded-lg hover:bg-blue-50 cursor-pointer hidden sm:block border border-blue-100"
              >
                App Gallery
              </button>
            )}
            <button
              onClick={onClose}
              id="close-settings-modal-btn"
              className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-[#f4f4f7] text-[#1a1a1a] hover:bg-slate-200 flex items-center justify-center border border-[#eee] cursor-pointer active:scale-95 transition-all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Scrollable Container */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-5">
          {/* ========================================================================= */}
          {/* VIEW 0: MAIN APP GALLERY (When activeAppId is null)                      */}
          {/* ========================================================================= */}
          {!activeAppId && (
            <div className="space-y-5">
              {/* PWA & Android Installation Card */}
              <PWAInstallButton variant="settings" />

              {/* Active Campus Quick Indicator Banner */}
              <div className="bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 text-white p-4 sm:p-5 rounded-3xl space-y-3 shadow-sm relative overflow-hidden">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-2xl bg-blue-500/20 text-blue-300 flex items-center justify-center border border-blue-400/30">
                      <School className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-white">{activeSchool?.name || session.schoolName}</span>
                        <span className="text-[9px] bg-blue-500 text-white font-black px-1.5 py-0.2 rounded-full uppercase">
                          Active Dashboard
                        </span>
                      </div>
                      <p className="text-[11px] text-blue-200/80 font-medium">
                        Tuition: {currencySymbol}{activeSchool?.feeSchedule?.tuitionFee?.toLocaleString() || '15,000'} • {students.length} Students Enrolled
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setActiveAppId('school_profiles')}
                    className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-1 transition-all cursor-pointer backdrop-blur-xs"
                  >
                    <Sliders className="w-3.5 h-3.5 text-blue-300" />
                    <span>Switch Campus</span>
                  </button>
                </div>
              </div>

              {/* Quick Search across Tools & Apps */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" />
                <input
                  type="text"
                  value={gallerySearch}
                  onChange={(e) => setGallerySearch(e.target.value)}
                  placeholder="Search settings, apps, deduplication, sync, backups..."
                  className="w-full pl-10 pr-4 py-2.5 text-xs font-bold bg-slate-50 rounded-2xl border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none transition-all"
                />
                {gallerySearch && (
                  <button
                    onClick={() => setGallerySearch('')}
                    className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 p-0.5"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Section 1: Core Daily Apps */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                    <span>Core Management Apps</span>
                  </h4>
                  <span className="text-[10px] text-slate-400 font-bold">Touch an app to launch</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filteredPrimary.map((app) => {
                    const IconComponent = app.icon;
                    return (
                      <button
                        key={app.id}
                        type="button"
                        onClick={() => {
                          if (app.action) {
                            app.action();
                          } else {
                            setActiveAppId(app.id);
                          }
                        }}
                        className="p-4 rounded-3xl bg-white hover:bg-blue-50/40 border border-slate-200/90 hover:border-blue-300 transition-all text-left shadow-xs flex flex-col justify-between space-y-3 group cursor-pointer active:scale-[0.99]"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shadow-xs ${app.color} group-hover:scale-105 transition-transform`}>
                            <IconComponent className="w-5 h-5" />
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${app.badgeColor}`}>
                            {app.badge}
                          </span>
                        </div>

                        <div className="space-y-1">
                          <div className="text-xs font-black text-slate-900 group-hover:text-blue-700 transition-colors flex items-center justify-between">
                            <span>{app.title}</span>
                            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all" />
                          </div>
                          <p className="text-[11px] text-slate-500 leading-snug">
                            {app.description}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Section 2: Additional Apps & Advanced Tools */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Additional Apps & Advanced Utilities</span>
                  </h4>
                  <span className="text-[10px] text-slate-400 font-bold">{additionalApps.length} Tools</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filteredAdditional.map((app) => {
                    const IconComponent = app.icon;
                    return (
                      <button
                        key={app.id}
                        type="button"
                        onClick={() => {
                          if (app.action) {
                            app.action();
                          } else {
                            setActiveAppId(app.id);
                          }
                        }}
                        className="p-4 rounded-3xl bg-slate-50/80 hover:bg-indigo-50/40 border border-slate-200 hover:border-indigo-300 transition-all text-left shadow-xs flex flex-col justify-between space-y-3 group cursor-pointer active:scale-[0.99]"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className={`w-9 h-9 rounded-2xl flex items-center justify-center shadow-xs ${app.color} group-hover:scale-105 transition-transform`}>
                            <IconComponent className="w-4 h-4" />
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${app.badgeColor}`}>
                            {app.badge}
                          </span>
                        </div>

                        <div className="space-y-1">
                          <div className="text-xs font-black text-slate-900 group-hover:text-indigo-700 transition-colors flex items-center justify-between">
                            <span>{app.title}</span>
                            <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 group-hover:translate-x-0.5 transition-all" />
                          </div>
                          <p className="text-[11px] text-slate-500 leading-snug">
                            {app.description}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* VIEW: USER CREDENTIALS & RBAC SECURITY                                    */}
          {/* ========================================================================= */}
          {activeAppId === 'user_credentials' && (
            <UserCredentialManager
              session={session}
              onSessionUpdated={(updatedSession) => {
                onSaveSession(updatedSession);
              }}
            />
          )}

          {/* ========================================================================= */}
          {/* VIEW 1: DUPLICATE CLEANER APP                                             */}
          {/* ========================================================================= */}
          {activeAppId === 'class_manager' && (
            onManageClasses ? (
              <ClassManager
                school={activeSchool}
                students={students}
                onManageClasses={onManageClasses}
              />
            ) : (
              <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-800">
                Class management is unavailable because the safe Firestore save action is not configured.
              </div>
            )
          )}

          {activeAppId === 'duplicate_cleaner' && (
            <DuplicateCleanerView
              students={students}
              session={session}
              onMergeGroup={async (primaryId, mergedRecord, deletedIds) => {
                if (onMergeDuplicateGroup) {
                  await onMergeDuplicateGroup(primaryId, mergedRecord, deletedIds);
                }
              }}
              onDeleteRecord={async (id, record) => {
                if (onDeleteStudent) {
                  await onDeleteStudent(id, record);
                }
              }}
              onBatchResolve={async (mergedRecords, deletedIds) => {
                if (onBatchResolveDuplicates) {
                  await onBatchResolveDuplicates(mergedRecords, deletedIds);
                }
              }}
              onClose={() => setActiveAppId(null)}
            />
          )}

          {/* ========================================================================= */}
          {/* VIEW 2.5: FIREBASE CLOUD DATABASE & SYNC APP                              */}
          {/* ========================================================================= */}
          {activeAppId === 'firebase_cloud' && (
            <div className="space-y-5">
              {/* Header Status Banner */}
              <div className="bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-yellow-500/10 border border-amber-500/30 p-4 rounded-3xl space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl bg-amber-600 text-white flex items-center justify-center shadow-xs">
                      <Cloud className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                        <span>Firestore Cloud Database</span>
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${
                          activeFbConfig.isCustom
                            ? 'bg-amber-100 text-amber-900 border border-amber-200'
                            : 'bg-emerald-100 text-emerald-900 border border-emerald-200'
                        }`}>
                          {activeFbConfig.isCustom ? `Custom: ${activeFbConfig.projectId}` : 'Applet Cloud Active'}
                        </span>
                      </h4>
                      <p className="text-[10px] text-slate-500 font-mono mt-0.5">
                        Project ID: <span className="font-bold text-slate-800">{activeFbConfig.projectId}</span> • Database: <span className="font-bold text-emerald-700">{activeFbConfig.firestoreDatabaseId || 'dnpspay'}</span> • Source: {activeFbConfig.source}
                      </p>
                    </div>
                  </div>

                  {/* Ping latency action */}
                  <button
                    type="button"
                    onClick={handleTestFirebasePing}
                    disabled={isFirebaseTesting}
                    className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    {isFirebaseTesting ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Testing Ping...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="w-3.5 h-3.5 fill-current" />
                        <span>Test Latency Ping</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Ping Result Display */}
                {firebasePingResult && (
                  <div
                    className={`p-3 rounded-2xl text-xs flex items-center justify-between gap-2 border ${
                      firebasePingResult.success
                        ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                        : 'bg-amber-50 text-amber-900 border-amber-200'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {firebasePingResult.success ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                      )}
                      <div>
                        <p className="font-bold">{firebasePingResult.message}</p>
                        {firebasePingResult.success && (
                          <p className="text-[10px] text-emerald-700 font-mono">
                            Round-trip latency: <span className="font-black">{firebasePingResult.latencyMs} ms</span>
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* API Key Status Notice */}
                {!isRealApiKey(activeFbConfig.apiKey) && (
                  <div className="p-3 bg-amber-500/15 border border-amber-500/40 rounded-2xl text-amber-900 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <div className="text-[11px] leading-relaxed">
                      <p className="font-bold">Web API Key Required to Finalize Private Connection</p>
                      <p className="text-amber-800 mt-0.5">
                        Your project is identified as <span className="font-mono font-bold">{activeFbConfig.projectId || 'marklar-galaxy-gt8c4'}</span> (DB: <span className="font-mono font-bold">dnpspay</span>). To connect directly to your private Firebase console, copy your Web API Key from Firebase Console and paste it into the form below.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Push & Pull Live Synchronization Cards */}
              <div className="bg-white border border-slate-200 rounded-3xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Database className="w-4 h-4 text-amber-600" />
                    <span>Live Cloud Data Sync</span>
                  </h4>
                  <span className="text-[10px] text-slate-500 font-medium">
                    {students?.length || 0} Local Students Ready
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={handlePushAllToFirebase}
                    disabled={isFirebasePushing}
                    className="p-3 rounded-2xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 flex items-center justify-center gap-2 font-bold text-xs cursor-pointer transition-colors disabled:opacity-50"
                  >
                    {isFirebasePushing ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-amber-700" />
                        <span>Uploading to Firestore...</span>
                      </>
                    ) : (
                      <>
                        <Cloud className="w-4 h-4 text-amber-700" />
                        <span>Push All Students to Cloud</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handlePullAllFromFirebase}
                    disabled={isFirebasePulling}
                    className="p-3 rounded-2xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-800 flex items-center justify-center gap-2 font-bold text-xs cursor-pointer transition-colors disabled:opacity-50"
                  >
                    {isFirebasePulling ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin text-slate-700" />
                        <span>Fetching from Firestore...</span>
                      </>
                    ) : (
                      <>
                        <Download className="w-4 h-4 text-slate-700" />
                        <span>Pull All Students from Cloud</span>
                      </>
                    )}
                  </button>
                </div>

                {firebaseSyncMsg && (
                  <div
                    className={`p-3 rounded-2xl text-xs font-medium border ${
                      firebaseSyncMsg.success
                        ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                        : 'bg-rose-50 text-rose-900 border-rose-200'
                    }`}
                  >
                    {firebaseSyncMsg.message}
                  </div>
                )}
              </div>

              {/* Dedicated Project Configuration Form */}
              <form onSubmit={handleSaveCustomFirebase} className="bg-white border border-slate-200 rounded-3xl p-4 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                      <Key className="w-4 h-4 text-amber-600" />
                      <span>Dedicated Firebase Project Credentials</span>
                    </h4>
                    <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                      Dominion Nursery & Primary School (DNPS) Project Settings
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleLoadDnpsPreset}
                    className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-800 rounded-xl text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3 text-amber-600" />
                    <span>Load DNPS Preset</span>
                  </button>
                </div>

                {/* Feedback status message */}
                {fbConfigSavedMsg && (
                  <div
                    className={`p-3 rounded-2xl text-xs font-medium border ${
                      fbConfigSavedMsg.success
                        ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                        : 'bg-rose-50 text-rose-900 border-rose-200'
                    }`}
                  >
                    {fbConfigSavedMsg.message}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Project ID
                    </label>
                    <input
                      type="text"
                      value={fbProjectId}
                      onChange={(e) => setFbProjectId(e.target.value)}
                      placeholder="e.g. marklar-galaxy-gt8c4"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Firebase Web API Key
                    </label>
                    <input
                      type="text"
                      value={fbApiKey}
                      onChange={(e) => setFbApiKey(e.target.value)}
                      placeholder="AIzaSy... (Paste from Firebase Console)"
                      className={`w-full px-3 py-2 border rounded-xl text-xs font-mono font-bold text-slate-800 focus:outline-none focus:ring-2 ${
                        isRealApiKey(fbApiKey)
                          ? 'border-emerald-300 bg-emerald-50/20 focus:ring-emerald-500'
                          : 'border-amber-300 bg-amber-50/20 focus:ring-amber-500'
                      }`}
                    />
                    <p className="text-[9px] text-slate-400 mt-1">
                      {isRealApiKey(fbApiKey) ? '✓ Valid API key format' : 'Required: Web API Key from Firebase Console'}
                    </p>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Auth Domain
                    </label>
                    <input
                      type="text"
                      value={fbAuthDomain}
                      onChange={(e) => setFbAuthDomain(e.target.value)}
                      placeholder="e.g. marklar-galaxy-gt8c4.firebaseapp.com"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Storage Bucket
                    </label>
                    <input
                      type="text"
                      value={fbStorageBucket}
                      onChange={(e) => setFbStorageBucket(e.target.value)}
                      placeholder="e.g. marklar-galaxy-gt8c4.firebasestorage.app"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Messaging Sender ID
                    </label>
                    <input
                      type="text"
                      value={fbMessagingSenderId}
                      onChange={(e) => setFbMessagingSenderId(e.target.value)}
                      placeholder="e.g. 383892076840"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                      App ID
                    </label>
                    <input
                      type="text"
                      value={fbAppId}
                      onChange={(e) => setFbAppId(e.target.value)}
                      placeholder="e.g. 1:383892076840:web:da822d88d35d8bda12781d"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Firestore Database ID
                    </label>
                    <input
                      type="text"
                      value={fbDatabaseId}
                      onChange={(e) => setFbDatabaseId(e.target.value)}
                      placeholder="dnpspay"
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono font-bold text-emerald-800 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>

                <div className="pt-2 flex items-center gap-2">
                  <button
                    type="submit"
                    className="flex-1 py-3 px-4 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    <span>Save & Connect Firebase</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleResetToDefaultFirebase}
                    className="py-3 px-4 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <RotateCcw className="w-4 h-4" />
                    <span>Reset to Default DB</span>
                  </button>
                </div>
              </form>

              {/* Developer Guides & One-Click Rules */}
              <div className="bg-slate-50 border border-slate-200 rounded-3xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>Cloud Firestore Security Rules & Setup</span>
                  </h4>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleCopyHeaders(generateFirestoreRulesTemplate(), 'rules')}
                      className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-[10px] font-bold text-slate-800 flex items-center gap-1 cursor-pointer"
                    >
                      {copiedType === ('rules' as any) ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      <span>Copy firestore.rules</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleCopyHeaders(generateVercelEnvTemplate(), 'env')}
                      className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl text-[10px] font-bold text-slate-800 flex items-center gap-1 cursor-pointer"
                    >
                      {copiedType === ('env' as any) ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                      <span>Copy .env Template</span>
                    </button>
                  </div>
                </div>

                <div className="text-[11px] text-slate-600 space-y-1.5 leading-relaxed bg-white p-3 rounded-2xl border border-slate-200">
                  <p className="font-bold text-slate-900">How to manage your Firestore database (dnpspay):</p>
                  <ol className="list-decimal list-inside space-y-1 text-[10px] text-slate-600">
                    <li>
                      Visit{' '}
                      <a
                        href={`https://console.firebase.google.com/project/${activeFbConfig.projectId || 'marklar-galaxy-gt8c4'}/firestore/databases/${activeFbConfig.firestoreDatabaseId || 'dnpspay'}/data`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:underline inline-flex items-center gap-0.5 font-bold"
                      >
                        Firebase Console ({activeFbConfig.projectId || 'marklar-galaxy-gt8c4'} / {activeFbConfig.firestoreDatabaseId || 'dnpspay'}) <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    </li>
                    <li>Under <strong>Project settings &gt; General</strong>, you can view or rotate your <strong>Web API Key</strong>.</li>
                    <li>All school data is scoped under <span className="font-mono font-bold">/schools/dominion-group</span> in the <span className="font-mono font-bold">dnpspay</span> database.</li>
                    <li>Click <strong>Test Latency Ping</strong> above at any time to verify real-time cloud connectivity.</li>
                  </ol>
                </div>
              </div>

              {/* Back to Gallery button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setActiveAppId(null)}
                  className="w-full py-3 px-4 rounded-2xl bg-slate-100 text-slate-800 font-bold text-xs hover:bg-slate-200 cursor-pointer"
                >
                  Back to App Gallery
                </button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* VIEW 3: FEE UPDATE & ACADEMY CLASS RATES APP                              */}
          {/* ========================================================================= */}
          {(activeAppId === 'school_profiles' || activeAppId === 'fee_update') && (
            <div className="space-y-5">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h4 className="text-sm font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <GraduationCap className="w-5 h-5 text-purple-600" />
                    <span>Fee Update & Class Rates Hub</span>
                  </h4>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Configure base school rates and customize separate fees per class across all categories. All updates are permanently stored and synchronized to Google Sheets.
                  </p>
                </div>

                {onOpenEditSchool && activeSchool && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenEditSchool(activeSchool);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold shrink-0 flex items-center gap-1.5 cursor-pointer shadow-xs transition-all"
                  >
                    <Sliders className="w-3.5 h-3.5" />
                    <span>Switch Campus</span>
                  </button>
                )}
              </div>

              {/* ADDITIONAL & ANCILLARY FEES (PTA, UNIFORMS, GRADUATION) SHORTCUT BANNER */}
              <div className="p-3.5 rounded-2xl border border-emerald-200 bg-emerald-50/60 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <Layers className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                      <span>Additional & Ancillary Fees (PTA, Uniforms, Graduation)</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-200 text-emerald-900">
                        {activeSchool?.additionalFees?.length || 0} Configured
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-600 font-medium">
                      Manage PTA levies, uniforms, graduation, excursions, ICT and class-targeted fees with live billing.
                    </p>
                  </div>
                </div>

                {onOpenAdditionalFees && (
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenAdditionalFees();
                    }}
                    className="w-full sm:w-auto px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shrink-0 flex items-center justify-center gap-1.5 cursor-pointer shadow-xs transition-all active:scale-95"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Manage Additional Fees</span>
                  </button>
                )}
              </div>

              {feeSaveSuccess && (
                <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold flex items-center gap-2.5 animate-fadeIn">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span>{feeSaveSuccess}</span>
                </div>
              )}

              {/* ACADEMIC SESSION (applies everywhere) */}
              <div className="p-4 rounded-3xl border border-emerald-200 bg-emerald-50/40 space-y-3">
                <div>
                  <div className="text-xs font-black text-slate-900">Academic Session</div>
                  <div className="text-[11px] text-slate-600 font-medium">
                    Used as the default session when adding new or existing students, admissions, payroll and term schedules.
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={sessionInput}
                    onChange={(e) => { setSessionInput(e.target.value); setSessionNotice(null); }}
                    placeholder="e.g. 2026/2027"
                    className="flex-1 px-3.5 py-2 text-xs font-mono font-bold bg-white rounded-xl border border-slate-200 text-slate-900 focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleSaveAcademicSession}
                    className="py-2 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer shadow-xs active:scale-95"
                  >
                    Save Session
                  </button>
                </div>
                {sessionNotice && (
                  <div className={`text-[11px] font-bold ${sessionNotice.ok ? 'text-emerald-700' : 'text-rose-600'}`}>
                    {sessionNotice.text}
                  </div>
                )}
              </div>

              {/* SECTION 1: BASE ACADEMY FEE SCHEDULE */}
              <div className="p-4.5 rounded-3xl border border-blue-200 bg-blue-50/40 space-y-4">
                <div className="flex items-center justify-between gap-3 border-b border-blue-100/80 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <Coins className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-black text-slate-900">
                        1. Base Academy Fee Schedule (Default Rates)
                      </div>
                      <div className="text-[11px] text-slate-600 font-medium">
                        Standard default rates applied to classes without specific overrides
                      </div>
                    </div>
                  </div>

                  <span className="px-2.5 py-1 rounded-lg bg-blue-100/70 border border-blue-200 text-blue-900 text-[10px] font-mono font-bold">
                    {activeSchool?.name || 'Active School'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1">
                      Base School Fee / Tuition ({currencySymbol})
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="100"
                      value={tuitionFee}
                      onChange={(e) => setTuitionFee(e.target.value)}
                      placeholder="e.g. 15000"
                      className="w-full px-3.5 py-2 text-xs font-mono font-bold bg-white rounded-xl border border-slate-200 text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none"
                    />
                    <span className="text-[10px] text-slate-400 mt-0.5 block">Standard baseline tuition</span>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1">
                      Base Admission Fee ({currencySymbol})
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="100"
                      value={admissionFee}
                      onChange={(e) => setAdmissionFee(e.target.value)}
                      placeholder="e.g. 5000"
                      className="w-full px-3.5 py-2 text-xs font-mono font-bold bg-white rounded-xl border border-slate-200 text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none"
                    />
                    <span className="text-[10px] text-slate-400 mt-0.5 block">New student registration</span>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1">
                      Base Exam Fee ({currencySymbol})
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="100"
                      value={examFee}
                      onChange={(e) => setExamFee(e.target.value)}
                      placeholder="e.g. 1500"
                      className="w-full px-3.5 py-2 text-xs font-mono font-bold bg-white rounded-xl border border-slate-200 text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none"
                    />
                    <span className="text-[10px] text-slate-400 mt-0.5 block">Termly exam charge</span>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1">
                      Base Lesson (Monthly) ({currencySymbol})
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="100"
                      value={lessonFeeMonthly}
                      onChange={(e) => setLessonFeeMonthly(e.target.value)}
                      placeholder="e.g. 2500"
                      className="w-full px-3.5 py-2 text-xs font-mono font-bold bg-white rounded-xl border border-slate-200 text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none"
                    />
                    <span className="text-[10px] text-slate-400 mt-0.5 block">1-Month lesson fee</span>
                  </div>

                  <div>
                    <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1">
                      Base Lesson (Full Term) ({currencySymbol})
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="100"
                      value={lessonFeeTermly}
                      onChange={(e) => setLessonFeeTermly(e.target.value)}
                      placeholder="e.g. 7000"
                      className="w-full px-3.5 py-2 text-xs font-mono font-bold bg-white rounded-xl border border-slate-200 text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none"
                    />
                    <span className="text-[10px] text-slate-400 mt-0.5 block">Full term lesson fee</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2.5 border-t border-blue-100/80">
                  <div className="text-[11px] text-slate-500 font-medium">
                    Updates base default rates for standard classes without overrides
                  </div>
                  <button
                    type="button"
                    onClick={(e) => handleSaveFeeSchedule(e as any)}
                    className="py-2 px-3.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-xs transition-all active:scale-95"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Update & Apply Base Fees</span>
                  </button>
                </div>
              </div>

              {/* SECTION 2: CLASS-SPECIFIC FEE CUSTOMIZATION & MANAGEMENT */}
              <div className="p-4 sm:p-5 rounded-3xl border border-purple-200 bg-purple-50/40 space-y-4">
                {/* Header & Quick Summary */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-purple-200/70 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-2xl bg-purple-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                      <Layers className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs sm:text-sm font-black text-slate-900 flex items-center gap-2 flex-wrap">
                        <span>2. Class-Specific Fees & Grade Schedule Management</span>
                        <span className="px-2 py-0.5 rounded-full bg-purple-600 text-white text-[10px] font-bold font-mono">
                          {Object.keys(classFeeSchedules).length} Custom / {schoolClassesList.length} Total Classes
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-600 font-medium">
                        Configure customized tuition, admission, exam, and lesson rates for each grade. All changes propagate immediately across cards, receipts, and payment records.
                      </div>
                    </div>
                  </div>

                  {/* Export & Tools Action Buttons */}
                  <div className="flex items-center gap-1.5 self-end sm:self-center flex-wrap">
                    <button
                      type="button"
                      onClick={() => setShowBulkAdjustModal(true)}
                      id="bulk-adjust-fee-btn"
                      className="px-2.5 py-1.5 rounded-xl bg-purple-100 hover:bg-purple-200 text-purple-900 text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer border border-purple-200 shadow-2xs"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                      <span>Bulk Adjuster</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleExportFeeScheduleCsv}
                      id="export-fee-csv-btn"
                      className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer border border-slate-200 shadow-2xs"
                      title="Download Fee Schedule as CSV"
                    >
                      <Download className="w-3.5 h-3.5 text-slate-600" />
                      <span>Export CSV</span>
                    </button>
                    <button
                      type="button"
                      onClick={handlePrintFeeSchedule}
                      id="print-fee-schedule-btn"
                      className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-[11px] font-bold flex items-center gap-1.5 transition-all cursor-pointer border border-slate-200 shadow-2xs"
                      title="Print Official Fee Schedule"
                    >
                      <Printer className="w-3.5 h-3.5 text-slate-600" />
                      <span>Print</span>
                    </button>
                  </div>
                </div>

                {/* Live Campus Projected Revenue Banner */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="p-3 rounded-2xl bg-white border border-purple-100 shadow-2xs flex flex-col justify-between">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Total Classes</span>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className="text-base sm:text-lg font-black text-slate-900">{schoolClassesList.length}</span>
                      <span className="text-[10px] text-slate-500 font-medium">Grades</span>
                    </div>
                  </div>
                  <div className="p-3 rounded-2xl bg-white border border-purple-100 shadow-2xs flex flex-col justify-between">
                    <span className="text-[10px] font-black text-amber-700 uppercase tracking-wider">Customized Rates</span>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className="text-base sm:text-lg font-black text-amber-900">{Object.keys(classFeeSchedules).length}</span>
                      <span className="text-[10px] text-amber-700 font-medium">Overridden</span>
                    </div>
                  </div>
                  <div className="p-3 rounded-2xl bg-white border border-purple-100 shadow-2xs flex flex-col justify-between">
                    <span className="text-[10px] font-black text-blue-700 uppercase tracking-wider">Enrolled Students</span>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className="text-base sm:text-lg font-black text-blue-900">{classEnrollmentStats.totalEnrolled}</span>
                      <span className="text-[10px] text-blue-700 font-medium">Total</span>
                    </div>
                  </div>
                  <div className="p-3 rounded-2xl bg-white border border-purple-100 shadow-2xs flex flex-col justify-between">
                    <span className="text-[10px] font-black text-emerald-700 uppercase tracking-wider">Projected Term Fees</span>
                    <div className="flex items-baseline gap-1 mt-1">
                      <span className="text-xs sm:text-sm font-black text-emerald-900 truncate">
                        {currencySymbol}{classEnrollmentStats.totalProjected.toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                {classOverrideSuccess && (
                  <div className="p-3 rounded-2xl bg-purple-100 border border-purple-300 text-purple-900 text-xs font-bold flex items-center gap-2 animate-in fade-in">
                    <Check className="w-4 h-4 text-purple-700 shrink-0" />
                    <span>{classOverrideSuccess}</span>
                  </div>
                )}

                {/* Section Filter Tabs & Quick Section Presets */}
                <div className="space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar">
                      <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider mr-1 shrink-0 flex items-center gap-1">
                        <Filter className="w-3 h-3" /> Section:
                      </span>
                      {[
                        { id: 'all', label: 'All Classes' },
                        { id: 'nursery', label: 'Early Years / Nursery' },
                        { id: 'primary', label: 'Primary (Basic 1-5)' },
                        { id: 'jss', label: 'Junior High (JSS)' },
                        { id: 'sss', label: 'Senior High (SSS)' },
                      ].map((tab) => (
                        <button
                          key={tab.id}
                          type="button"
                          onClick={() => setFeeSectionFilter(tab.id as any)}
                          className={`px-3 py-1 rounded-xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                            feeSectionFilter === tab.id
                              ? 'bg-purple-600 text-white shadow-2xs'
                              : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                          }`}
                        >
                          {tab.label}
                        </button>
                      ))}
                    </div>

                    {/* Search inside classes */}
                    <div className="relative w-full sm:w-44">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={feeSearchTerm}
                        onChange={(e) => setFeeSearchTerm(e.target.value)}
                        placeholder="Search class..."
                        className="w-full pl-8 pr-2.5 py-1 text-xs bg-white rounded-xl border border-slate-200 text-slate-900 focus:outline-none focus:ring-1 focus:ring-purple-500"
                      />
                    </div>
                  </div>

                  {/* Class Selection Grid */}
                  <div className="flex flex-wrap gap-1.5 p-2 rounded-2xl bg-white/80 border border-purple-100">
                    {schoolClassesList
                      .filter((cls) => {
                        if (feeSectionFilter !== 'all' && getClassSection(cls) !== feeSectionFilter) return false;
                        if (feeSearchTerm.trim() && !cls.toLowerCase().includes(feeSearchTerm.toLowerCase().trim())) return false;
                        return true;
                      })
                      .map((cls) => {
                        const hasOverride = Boolean(classFeeSchedules[cls]);
                        const isSelected = selectedFeeClass === cls;
                        const studentCount = classEnrollmentStats.counts[cls] || 0;
                        return (
                          <button
                            key={cls}
                            type="button"
                            onClick={() => handleSelectFeeClass(cls)}
                            id={`select-fee-class-${cls}`}
                            className={`px-3 py-1.5 rounded-xl text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                              isSelected
                                ? 'bg-purple-600 text-white shadow-xs scale-105 ring-2 ring-purple-400'
                                : hasOverride
                                ? 'bg-amber-100 text-amber-950 border border-amber-300 hover:bg-amber-200'
                                : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            <span>{cls}</span>
                            {studentCount > 0 && (
                              <span className={`text-[9px] px-1 py-0.2 rounded font-sans ${isSelected ? 'bg-purple-700 text-purple-100' : 'bg-slate-100 text-slate-600'}`}>
                                {studentCount}
                              </span>
                            )}
                            {hasOverride && (
                              <span
                                className={`w-2 h-2 rounded-full ${isSelected ? 'bg-amber-300' : 'bg-amber-500'}`}
                                title="Custom rates configured"
                              />
                            )}
                          </button>
                        );
                      })}
                  </div>
                </div>

                {/* Selected Class Editor Card */}
                {selectedFeeClass && (
                  <div className="p-4 sm:p-4.5 rounded-2xl bg-white border border-purple-200 shadow-xs space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black text-slate-900 flex items-center gap-1.5">
                          <span>Class:</span>
                          <span className="text-purple-700 font-mono text-sm px-2 py-0.5 bg-purple-50 rounded-lg border border-purple-200">
                            {selectedFeeClass}
                          </span>
                        </span>
                        {classFeeSchedules[selectedFeeClass] ? (
                          <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200 text-[10px] font-bold">
                            ⚡ Custom Rates Active
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 text-[10px] font-bold">
                            🏷️ Using Base Academy Rates
                          </span>
                        )}
                        <span className="text-[11px] text-slate-500 font-medium">
                          ({classEnrollmentStats.counts[selectedFeeClass] || 0} enrolled students)
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={handleCopyBaseToClass}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold cursor-pointer transition-all"
                          title="Fill inputs with Base Academy Rates"
                        >
                          Copy Base Rates
                        </button>

                        {/* Batch Apply to Section Button */}
                        {getClassSection(selectedFeeClass) !== 'other' && (
                          <button
                            type="button"
                            onClick={() => handleBatchApplyToSection(getClassSection(selectedFeeClass) as any)}
                            className="px-2.5 py-1 rounded-lg bg-purple-100 hover:bg-purple-200 text-purple-900 border border-purple-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-all"
                            title={`Apply these current rates to all ${getClassSection(selectedFeeClass).toUpperCase()} classes`}
                          >
                            <Copy className="w-3 h-3 text-purple-700" />
                            <span>Apply to All {getClassSection(selectedFeeClass).toUpperCase()}</span>
                          </button>
                        )}

                        {classFeeSchedules[selectedFeeClass] && (
                          <button
                            type="button"
                            onClick={() => handleResetClassOverride(selectedFeeClass)}
                            className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-all"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Reset to Base</span>
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1">
                          {selectedFeeClass} Tuition Fee ({currencySymbol})
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="100"
                          value={classTuition}
                          onChange={(e) => setClassTuition(e.target.value)}
                          placeholder="e.g. 18000"
                          className="w-full px-3 py-2 text-xs font-mono font-bold bg-slate-50 focus:bg-white rounded-xl border border-slate-200 text-slate-900 focus:ring-2 focus:ring-purple-600 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1">
                          {selectedFeeClass} Admission Fee ({currencySymbol})
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="100"
                          value={classAdmission}
                          onChange={(e) => setClassAdmission(e.target.value)}
                          placeholder="e.g. 6000"
                          className="w-full px-3 py-2 text-xs font-mono font-bold bg-slate-50 focus:bg-white rounded-xl border border-slate-200 text-slate-900 focus:ring-2 focus:ring-purple-600 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1">
                          {selectedFeeClass} Exam Fee ({currencySymbol})
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="100"
                          value={classExam}
                          onChange={(e) => setClassExam(e.target.value)}
                          placeholder="e.g. 2000"
                          className="w-full px-3 py-2 text-xs font-mono font-bold bg-slate-50 focus:bg-white rounded-xl border border-slate-200 text-slate-900 focus:ring-2 focus:ring-purple-600 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1">
                          {selectedFeeClass} Lesson (Monthly) ({currencySymbol})
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="100"
                          value={classLessonMonthly}
                          onChange={(e) => setClassLessonMonthly(e.target.value)}
                          placeholder="e.g. 3000"
                          className="w-full px-3 py-2 text-xs font-mono font-bold bg-slate-50 focus:bg-white rounded-xl border border-slate-200 text-slate-900 focus:ring-2 focus:ring-purple-600 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-black text-slate-600 uppercase tracking-wider mb-1">
                          {selectedFeeClass} Lesson (Full Term) ({currencySymbol})
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="100"
                          value={classLessonTermly}
                          onChange={(e) => setClassLessonTermly(e.target.value)}
                          placeholder="e.g. 8000"
                          className="w-full px-3 py-2 text-xs font-mono font-bold bg-slate-50 focus:bg-white rounded-xl border border-slate-200 text-slate-900 focus:ring-2 focus:ring-purple-600 focus:outline-none"
                        />
                      </div>

                      {/* Calculated Total Term Package */}
                      <div className="p-2.5 rounded-xl bg-purple-50/70 border border-purple-200/80 flex flex-col justify-between">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black text-purple-900 uppercase">Term Package Due:</span>
                          <span className="text-[10px] text-purple-700 font-medium">Tuition + Exam + Lesson</span>
                        </div>
                        <div className="text-sm font-black font-mono text-purple-950 mt-1">
                          {currencySymbol}
                          {(
                            (Math.max(0, Number(classTuition) || 0)) +
                            (Math.max(0, Number(classExam) || 0)) +
                            (Math.max(0, Number(classLessonTermly) || 0))
                          ).toLocaleString()}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={handleApplyClassOverride}
                        id="save-class-rate-btn"
                        className="w-full sm:flex-1 py-2.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-xs transition-all active:scale-95"
                      >
                        <Check className="w-4 h-4" />
                        <span>Save & Apply Custom Rates for {selectedFeeClass}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleBatchApplyToSection('all')}
                        className="w-full sm:w-auto py-2.5 px-4 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                        title="Copy these numbers across every class in the academy"
                      >
                        <Layers className="w-3.5 h-3.5 text-slate-600" />
                        <span>Apply to ALL {schoolClassesList.length} Classes</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* All Classes Rates Comparison Matrix Table */}
                <div className="space-y-2.5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-black text-slate-800 uppercase tracking-wider">
                        All Classes Fee Schedule Matrix:
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold">
                        {schoolClassesList.length} Classes
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {Object.keys(classFeeSchedules).length > 0 && (
                        <button
                          type="button"
                          onClick={handleResetAllClassOverrides}
                          className="text-[11px] font-bold text-rose-600 hover:text-rose-700 hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Reset All Custom Overrides</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-2xl border border-purple-200/80 bg-white shadow-2xs">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-100/90 text-slate-700 text-[10px] font-black uppercase tracking-wider border-b border-slate-200">
                          <th className="py-2.5 px-3">Class / Section</th>
                          <th className="py-2.5 px-3">Students</th>
                          <th className="py-2.5 px-3">Tuition / School Fee</th>
                          <th className="py-2.5 px-3">Admission</th>
                          <th className="py-2.5 px-3">Exam</th>
                          <th className="py-2.5 px-3">Lesson (Term)</th>
                          <th className="py-2.5 px-3">Full Term Pkg</th>
                          <th className="py-2.5 px-3">Projected Total</th>
                          <th className="py-2.5 px-3">Rate Status</th>
                          <th className="py-2.5 px-3 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono">
                        {schoolClassesList
                          .filter((cls) => {
                            if (feeSectionFilter !== 'all' && getClassSection(cls) !== feeSectionFilter) return false;
                            if (feeSearchTerm.trim() && !cls.toLowerCase().includes(feeSearchTerm.toLowerCase().trim())) return false;
                            return true;
                          })
                          .map((cls) => {
                            const override = classFeeSchedules[cls];
                            const effectiveTuition = override?.tuitionFee ?? (Number(tuitionFee) || 15000);
                            const effectiveAdmission = override?.admissionFee ?? (Number(admissionFee) || 5000);
                            const effectiveExam = override?.examFee ?? (Number(examFee) || 1500);
                            const effectiveLessonTerm = override?.lessonFeeTermly ?? (Number(lessonFeeTermly) || 7000);
                            const termPkg = effectiveTuition + effectiveExam + effectiveLessonTerm;
                            const studentCount = classEnrollmentStats.counts[cls] || 0;
                            const projectedRev = studentCount * termPkg;
                            const isCustom = Boolean(override);

                            return (
                              <tr
                                key={cls}
                                className={`hover:bg-purple-50/40 transition-colors ${
                                  selectedFeeClass === cls ? 'bg-purple-50/70 font-bold' : ''
                                }`}
                              >
                                <td className="py-2.5 px-3 font-bold text-slate-900 font-sans">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-mono font-bold text-sm">{cls}</span>
                                    <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 font-semibold">
                                      {getClassSection(cls)}
                                    </span>
                                  </div>
                                </td>
                                <td className="py-2.5 px-3 text-slate-600 font-sans">
                                  <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-800 text-[11px] font-bold">
                                    {studentCount}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-blue-900 font-bold">
                                  {currencySymbol}{effectiveTuition.toLocaleString()}
                                </td>
                                <td className="py-2.5 px-3 text-purple-900">
                                  {currencySymbol}{effectiveAdmission.toLocaleString()}
                                </td>
                                <td className="py-2.5 px-3 text-amber-900">
                                  {currencySymbol}{effectiveExam.toLocaleString()}
                                </td>
                                <td className="py-2.5 px-3 text-emerald-900">
                                  {currencySymbol}{effectiveLessonTerm.toLocaleString()}
                                </td>
                                <td className="py-2.5 px-3 text-purple-950 font-black">
                                  {currencySymbol}{termPkg.toLocaleString()}
                                </td>
                                <td className="py-2.5 px-3 text-slate-700 text-[11px]">
                                  {studentCount > 0 ? (
                                    <span className="text-emerald-700 font-bold">
                                      {currencySymbol}{projectedRev.toLocaleString()}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">—</span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 font-sans">
                                  {isCustom ? (
                                    <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-bold">
                                      Custom
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] font-medium">
                                      Base
                                    </span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-right font-sans">
                                  <button
                                    type="button"
                                    onClick={() => handleSelectFeeClass(cls)}
                                    className="px-2.5 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 text-[11px] font-bold cursor-pointer transition-all"
                                  >
                                    Edit
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* MODAL: BULK RATE ADJUSTER POPOVER */}
              {showBulkAdjustModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in">
                  <div className="bg-white rounded-3xl p-5 max-w-md w-full border border-slate-200 shadow-2xl space-y-4 animate-in zoom-in-95">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-xl bg-purple-600 text-white flex items-center justify-center">
                          <Sparkles className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-slate-900">Bulk Fee Adjuster / Surcharge</h3>
                          <p className="text-[11px] text-slate-500">Apply uniform increments or % adjustments</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowBulkAdjustModal(false)}
                        className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">
                          Target Fee Field:
                        </label>
                        <select
                          value={bulkSurchargeField}
                          onChange={(e) => setBulkSurchargeField(e.target.value as any)}
                          className="w-full px-3 py-2 text-xs font-bold bg-slate-50 rounded-xl border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-600"
                        >
                          <option value="tuitionFee">Tuition / School Fee</option>
                          <option value="examFee">Exam Fee</option>
                          <option value="lessonFeeTermly">Lesson Fee (Termly)</option>
                          <option value="admissionFee">Admission Fee</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">
                          Apply To Classes In:
                        </label>
                        <select
                          value={bulkSurchargeTarget}
                          onChange={(e) => setBulkSurchargeTarget(e.target.value as any)}
                          className="w-full px-3 py-2 text-xs font-bold bg-slate-50 rounded-xl border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-600"
                        >
                          <option value="all">All Classes ({schoolClassesList.length} classes)</option>
                          <option value="nursery">Early Years / Nursery Only</option>
                          <option value="primary">Primary Classes Only</option>
                          <option value="jss">Junior Secondary (JSS) Only</option>
                          <option value="sss">Senior Secondary (SSS) Only</option>
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">
                            Adjustment Type:
                          </label>
                          <div className="flex rounded-xl bg-slate-100 p-1">
                            <button
                              type="button"
                              onClick={() => setBulkSurchargeType('fixed')}
                              className={`flex-1 py-1 text-xs font-bold rounded-lg transition-all ${
                                bulkSurchargeType === 'fixed' ? 'bg-white shadow-2xs text-purple-700' : 'text-slate-600'
                              }`}
                            >
                              Fixed ({currencySymbol})
                            </button>
                            <button
                              type="button"
                              onClick={() => setBulkSurchargeType('percent')}
                              className={`flex-1 py-1 text-xs font-bold rounded-lg transition-all ${
                                bulkSurchargeType === 'percent' ? 'bg-white shadow-2xs text-purple-700' : 'text-slate-600'
                              }`}
                            >
                              Percentage (%)
                            </button>
                          </div>
                        </div>

                        <div>
                          <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-1">
                            Value {bulkSurchargeType === 'fixed' ? `(${currencySymbol})` : '(%)'}:
                          </label>
                          <input
                            type="number"
                            value={bulkSurchargeAmount}
                            onChange={(e) => setBulkSurchargeAmount(e.target.value)}
                            placeholder="e.g. 1000 or 10"
                            className="w-full px-3 py-2 text-xs font-mono font-bold bg-slate-50 rounded-xl border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-600"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setShowBulkAdjustModal(false)}
                        className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleApplyBulkAdjust}
                        className="flex-1 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold shadow-xs transition-all active:scale-95"
                      >
                        Apply Adjustment
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* SAVE FORM & ACTIONS */}
              <form onSubmit={handleSaveFeeSchedule} className="p-4 rounded-3xl border border-slate-200 bg-white space-y-3.5">
                <div className="p-3 rounded-2xl bg-blue-50/70 border border-blue-200/80 flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    id="apply-to-enrolled"
                    checked={applyToEnrolledStudents}
                    onChange={(e) => setApplyToEnrolledStudents(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <label htmlFor="apply-to-enrolled" className="text-xs text-slate-700 font-medium cursor-pointer leading-tight">
                    <span className="font-bold text-slate-900 block">Apply fee updates across entire app & existing students immediately</span>
                    Recalculates tuition, exam, admission, and lesson fee balances for all enrolled students based on their exact class fee schedule.
                  </label>
                </div>

                <div className="flex gap-2.5">
                  <button
                    type="button"
                    onClick={() => setActiveAppId(null)}
                    className="py-3 px-4 rounded-2xl bg-slate-100 text-slate-800 font-bold text-xs hover:bg-slate-200 cursor-pointer"
                  >
                    Back to Gallery
                  </button>

                  <button
                    type="submit"
                    className="flex-1 py-3 px-4 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-xs transition-all active:scale-95"
                  >
                    <Save className="w-4 h-4" />
                    <span>Save All Fee Schedules & Apply Across App</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ========================================================================= */}
          {/* VIEW: ADDITIONAL & ANCILLARY FEES MANAGER                                 */}
          {/* ========================================================================= */}
          {activeAppId === 'additional_fees' && (
            <div className="space-y-5">
              {/* Header Banner */}
              <div className="p-4 rounded-3xl bg-gradient-to-r from-purple-900 to-indigo-900 text-white shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center shrink-0 border border-white/20">
                    <Layers className="w-5 h-5 text-purple-300" />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-white flex items-center gap-2">
                      <span>Additional & Ancillary Fees Manager</span>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-400/20 text-purple-200 border border-purple-300/30">
                        {currentAdditionalFees.length} Active
                      </span>
                    </h3>
                    <p className="text-[11px] text-purple-200/90 mt-0.5">
                      Add PTA levies, uniform, excursion or graduation fees. Any fee added here is immediately computed into each student's total due on the dashboard.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {onOpenAdditionalFees && (
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenAdditionalFees();
                      }}
                      className="px-3 py-1.5 rounded-xl bg-white/15 hover:bg-white/25 text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>Dedicated Modal</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setActiveAppId(null)}
                    className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all cursor-pointer"
                  >
                    Back to Gallery
                  </button>
                </div>
              </div>

              {/* Notification Banner */}
              {feeSyncNotice && (
                <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-bold flex items-center gap-2 animate-in fade-in">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{feeSyncNotice}</span>
                </div>
              )}

              {/* Quick Suggestions */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Quick Suggestions:</span>
                {[
                  { name: 'PTA levy', amount: 1000, cat: 'levy' as const },
                  { name: 'Development Levy', amount: 2000, cat: 'levy' as const },
                  { name: 'ICT Levy', amount: 1500, cat: 'activity' as const },
                  { name: 'School Uniform', amount: 8000, cat: 'uniform' as const },
                  { name: 'Graduation Dues', amount: 5000, cat: 'graduation' as const },
                ].map((sug) => (
                  <button
                    key={sug.name}
                    type="button"
                    onClick={() => {
                      setFeeName(sug.name);
                      setFeeAmount(String(sug.amount));
                      setFeeCategory(sug.cat);
                    }}
                    className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-purple-100 hover:text-purple-800 text-slate-700 text-[11px] font-semibold transition-all border border-slate-200/80 cursor-pointer"
                  >
                    + {sug.name} ({currencySymbol}{sug.amount.toLocaleString()})
                  </button>
                ))}
              </div>

              {/* Add Fee Form */}
              <form onSubmit={handleAddAdditionalFee} className="p-4 rounded-3xl bg-slate-50/80 border border-slate-200/80 space-y-4">
                <div className="font-bold text-xs text-slate-900 flex items-center gap-2">
                  <Plus className="w-4 h-4 text-purple-600" />
                  <span>Configure & Apply New Fee (e.g. PTA levy ₦1,000)</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {/* Fee Name */}
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                      Fee Name *
                    </label>
                    <input
                      type="text"
                      value={feeName}
                      onChange={(e) => setFeeName(e.target.value)}
                      placeholder="e.g. PTA levy, ICT dues"
                      required
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                    />
                  </div>

                  {/* Fee Amount */}
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                      Fee Amount ({currencySymbol}) *
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="100"
                      value={feeAmount}
                      onChange={(e) => setFeeAmount(e.target.value)}
                      placeholder="e.g. 1000"
                      required
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-900 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                    />
                  </div>

                  {/* Category */}
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                      Category
                    </label>
                    <select
                      value={feeCategory}
                      onChange={(e) => setFeeCategory(e.target.value as AdditionalFeeCategory)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                    >
                      <option value="levy">PTA / Development Levy</option>
                      <option value="activity">ICT / Activities / Sports</option>
                      <option value="uniform">School Uniform & Sports Wear</option>
                      <option value="graduation">Graduation & Yearbooks</option>
                      <option value="book">Books & Materials</option>
                      <option value="other">General Other Fees</option>
                    </select>
                  </div>

                  {/* Target Class */}
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                      Target Students (Class)
                    </label>
                    <select
                      value={feeTargetClass}
                      onChange={(e) => setFeeTargetClass(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                    >
                      <option value="all">All Classes (Universal for everyone)</option>
                      {(activeSchool?.classes || []).map((c) => (
                        <option key={c} value={c}>Class: {c} only</option>
                      ))}
                    </select>
                  </div>

                  {/* Target Term */}
                  <div>
                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                      Term Applicability
                    </label>
                    <select
                      value={feeTargetTerm}
                      onChange={(e) => setFeeTargetTerm(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold text-slate-900 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                    >
                      <option value="all">All Terms (Continuous)</option>
                      <option value="Term 1">Term 1 Only</option>
                      <option value="Term 2">Term 2 Only</option>
                      <option value="Term 3">Term 3 Only</option>
                    </select>
                  </div>

                  {/* Submit Button */}
                  <div className="flex items-end">
                    <button
                      type="submit"
                      disabled={isSavingFee}
                      className="w-full py-2.5 px-4 rounded-xl bg-purple-700 hover:bg-purple-800 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer shadow-xs transition-all active:scale-95"
                    >
                      <Plus className="w-4 h-4" />
                      <span>{isSavingFee ? 'Applying...' : 'Add Fee & Apply to Students'}</span>
                    </button>
                  </div>
                </div>
              </form>

              {/* List of Configured Fees */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs font-bold text-slate-900">
                  <span>Currently Configured Fees ({currentAdditionalFees.length})</span>
                  <span className="text-[10px] text-slate-500 font-normal">
                    Total Levies: {formatCurrency(currentAdditionalFees.reduce((acc, f) => acc + (Number(f.amount) || 0), 0), currencySymbol)}
                  </span>
                </div>

                {currentAdditionalFees.length === 0 ? (
                  <div className="p-8 text-center rounded-2xl bg-white border border-dashed border-slate-200 text-slate-500 text-xs">
                    <p className="font-semibold text-slate-700">No additional fees configured yet.</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Add a fee above like "PTA levy" (e.g. ₦1,000) to immediately update the total due for all students on the dashboard.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                    {currentAdditionalFees.map((fee) => (
                      <div
                        key={fee.id}
                        className="p-3.5 rounded-2xl bg-white border border-slate-200/80 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between gap-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h4 className="text-xs font-black text-slate-900 truncate">{fee.name}</h4>
                              <span
                                className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full border ${
                                  fee.enabled !== false
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : 'bg-slate-100 text-slate-600 border-slate-200'
                                }`}
                              >
                                {fee.enabled !== false ? 'Active' : 'Paused'}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                              <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 text-[9px] font-bold border border-purple-200">
                                {(fee.category || 'levy').toUpperCase()}
                              </span>
                              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[9px] font-semibold">
                                {fee.targetClass ? fee.targetClass : 'All Classes'}
                              </span>
                              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[9px] font-semibold">
                                {fee.targetTerm || fee.term || 'All Terms'}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleToggleAdditionalFee(fee.id, fee.name, fee.enabled)}
                              title={fee.enabled !== false ? 'Click to pause/disable fee' : 'Click to enable fee'}
                              className={`px-2 py-1 rounded-lg text-[10px] font-bold transition-all cursor-pointer ${
                                fee.enabled !== false
                                  ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                  : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                              }`}
                            >
                              {fee.enabled !== false ? 'Active' : 'Enable'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteAdditionalFee(fee.id, fee.name)}
                              title="Remove this fee"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-all cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                          <span className="text-[10px] text-slate-500 font-medium">
                            {fee.enabled !== false ? 'Billed Amount:' : 'Rate (Paused):'}
                          </span>
                          <span className="text-sm font-black text-purple-900 font-mono">
                            {formatCurrency(fee.amount, currencySymbol)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* VIEW 4: BURSAR & CURRENCY PREFERENCES APP                                 */}
          {/* ========================================================================= */}
          {activeAppId === 'bursar_settings' && (
            <form onSubmit={handleSaveAll} className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                  Active School Name
                </label>
                <input
                  type="text"
                  id="settings-school-name"
                  value={schoolName}
                  onChange={(e) => setSchoolName(e.target.value)}
                  placeholder="e.g. Dominion Group Of Schools"
                  className="w-full px-4 py-2.5 text-xs font-bold bg-[#f4f4f7] rounded-2xl border-none text-[#1a1a1a] focus:ring-2 focus:ring-blue-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                    Bursar / Officer Name
                  </label>
                  <input
                    type="text"
                    id="settings-bursar-name"
                    value={bursarName}
                    onChange={(e) => setBursarName(e.target.value)}
                    className="w-full px-4 py-2.5 text-xs font-bold bg-[#f4f4f7] rounded-2xl border-none text-[#1a1a1a] focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                    Currency Symbol
                  </label>
                  <select
                    id="settings-currency-symbol"
                    value={currencySymbol}
                    onChange={(e) => setCurrencySymbol(e.target.value)}
                    className="w-full px-4 py-2.5 text-xs font-black bg-[#f4f4f7] rounded-2xl border border-[#eee] text-[#1a1a1a] focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  >
                    <option value="₦">₦ (Naira)</option>
                    <option value="$">$ (USD / CAD / AUD)</option>
                    <option value="£">£ (Pound Sterling)</option>
                    <option value="€">€ (Euro)</option>
                    <option value="GH₵">GH₵ (Cedi)</option>
                    <option value="KSh">KSh (Kenyan Shilling)</option>
                    <option value="R">R (Rand)</option>
                    <option value="Rs">Rs (Rupee)</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveAppId(null)}
                  className="flex-1 py-3 px-4 rounded-2xl bg-slate-100 text-slate-800 font-bold text-xs hover:bg-slate-200 cursor-pointer"
                >
                  Back to Gallery
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 px-4 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {saveSuccess ? <Check className="w-4 h-4 text-white" /> : <span>Save Profile</span>}
                </button>
              </div>

              {onLogout && (
                <div className="pt-4 border-t border-slate-200">
                  <div className="bg-rose-50 border border-rose-200 p-4 rounded-2xl flex items-center justify-between">
                    <div>
                      <h5 className="text-xs font-bold text-rose-950">Active Session Access</h5>
                      <p className="text-[11px] text-rose-700">Lock portal and return to system login screen</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onLogout();
                      }}
                      className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-xs cursor-pointer"
                    >
                      Sign Out & Lock
                    </button>
                  </div>
                </div>
              )}
            </form>
          )}

          {/* ========================================================================= */}
          {/* VIEW 5: BACKUP & DATA RESTORE APP                                         */}
          {/* ========================================================================= */}
          {activeAppId === 'backups' && (
            <div className="space-y-4">
              <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-3xl space-y-2">
                <div className="flex items-center gap-2">
                  <Download className="w-4 h-4 text-emerald-700" />
                  <h4 className="text-xs font-black text-emerald-950 uppercase">Offline Safety Backups</h4>
                </div>
                <p className="text-xs text-emerald-800/90 leading-snug">
                  Download snapshots of all current student financial records to store securely on your computer or flash drive.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => downloadCsvBackup(students, session)}
                  className="p-4 rounded-3xl bg-white border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/30 transition-all text-center space-y-2 cursor-pointer shadow-xs"
                >
                  <FileSpreadsheet className="w-8 h-8 text-emerald-600 mx-auto" />
                  <div className="text-xs font-black text-slate-900">Download CSV</div>
                  <p className="text-[10px] text-slate-500">Excel / Spreadsheet compatible</p>
                </button>

                <button
                  type="button"
                  onClick={() => downloadJsonBackup(students, session)}
                  className="p-4 rounded-3xl bg-white border border-slate-200 hover:border-blue-500 hover:bg-blue-50/30 transition-all text-center space-y-2 cursor-pointer shadow-xs"
                >
                  <Download className="w-8 h-8 text-blue-600 mx-auto" />
                  <div className="text-xs font-black text-slate-900">Download JSON</div>
                  <p className="text-[10px] text-slate-500">Complete raw database backup</p>
                </button>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setActiveAppId(null)}
                  className="w-full py-3 px-4 rounded-2xl bg-slate-100 text-slate-800 font-bold text-xs hover:bg-slate-200 cursor-pointer"
                >
                  Back to App Gallery
                </button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* VIEW 7: DATA HEALTH INSPECTOR APP                                         */}
          {/* ========================================================================= */}
          {activeAppId === 'data_inspector' && (
            <div className="space-y-4">
              <div className={`p-4 rounded-3xl border space-y-2 ${healthStats.isClean ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                <div className="flex items-center gap-2">
                  <ShieldCheck className={`w-5 h-5 ${healthStats.isClean ? 'text-emerald-600' : 'text-amber-600'}`} />
                  <h4 className="text-xs font-black uppercase text-slate-900">
                    {healthStats.isClean ? 'Database Health is Excellent' : 'Database Anomalies Detected'}
                  </h4>
                </div>
                <p className="text-xs text-slate-600">
                  {healthStats.isClean
                    ? 'No negative balances, missing names, unassigned classrooms, or duplicate records found.'
                    : `Detected ${healthStats.totalIssues} data consistency alerts that may require attention.`}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Duplicates:</div>
                  <div className={`text-sm font-black font-mono ${duplicateStats.count > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {duplicateStats.count} {duplicateStats.count > 0 ? '(Action needed)' : 'None'}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Negative Balances:</div>
                  <div className={`text-sm font-black font-mono ${healthStats.negativeBalances > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                    {healthStats.negativeBalances}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Unassigned Class:</div>
                  <div className={`text-sm font-black font-mono ${healthStats.missingClasses > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {healthStats.missingClasses}
                  </div>
                </div>

                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">Zero-Fee Records:</div>
                  <div className={`text-sm font-black font-mono ${healthStats.zeroFees > 0 ? 'text-slate-600' : 'text-emerald-600'}`}>
                    {healthStats.zeroFees}
                  </div>
                </div>
              </div>

              {duplicateStats.count > 0 && (
                <button
                  type="button"
                  onClick={() => setActiveAppId('duplicate_cleaner')}
                  className="w-full py-2.5 px-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                >
                  <Users className="w-4 h-4" />
                  <span>Launch Duplicate Cleaner ({duplicateStats.count} Duplicates)</span>
                </button>
              )}

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setActiveAppId(null)}
                  className="w-full py-3 px-4 rounded-2xl bg-slate-100 text-slate-800 font-bold text-xs hover:bg-slate-200 cursor-pointer"
                >
                  Back to App Gallery
                </button>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* VIEW 8: TERM DURATION & PAYMENT SCHEDULE APP                              */}
          {/* ========================================================================= */}
          {activeAppId === 'term_schedule' && (
            <form onSubmit={handleSaveTermSchedule} className="space-y-4">
              {/* Term Switcher */}
              <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-2xl">
                {['First Term', 'Second Term', 'Third Term'].map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => handleTermTabSwitch(t)}
                    className={`flex-1 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      scheduleTerm === t
                        ? 'bg-white text-indigo-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {scheduleSavedMsg && (
                <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-xs font-bold text-emerald-800 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Academic term duration and payment dates saved!</span>
                </div>
              )}

              {/* 1. Term Duration */}
              <div className="p-4 rounded-3xl bg-slate-50 border border-slate-200 space-y-3">
                <h4 className="text-xs font-black uppercase text-slate-900 flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-indigo-600" />
                  <span>1. Term Academic Dates</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                      Term Begins (Start Date) *
                    </label>
                    <input
                      type="date"
                      required
                      value={scheduleStartDate}
                      onChange={(e) => setScheduleStartDate(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                      Term Ends (End Date) *
                    </label>
                    <input
                      type="date"
                      required
                      value={scheduleEndDate}
                      onChange={(e) => setScheduleEndDate(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <span className="block text-[10px] font-bold uppercase text-slate-500 mb-1">
                    Months in this Term ({derivedScheduleMonths.length} Months):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {derivedScheduleMonths.map((m) => (
                      <span
                        key={m}
                        className="px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200 text-[11px] font-bold font-mono"
                      >
                        {formatMonthLabel(m)}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* 2. Salary Due Day */}
              <div className="p-4 rounded-3xl bg-slate-50 border border-slate-200 space-y-3">
                <h4 className="text-xs font-black uppercase text-slate-900 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-emerald-600" />
                  <span>2. Staff Salary Monthly Due Day</span>
                </h4>
                <div>
                  <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                    Salary Payment Due Day of Month *
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min="1"
                      max="28"
                      required
                      value={scheduleSalaryDueDay}
                      onChange={(e) => setScheduleSalaryDueDay(Number(e.target.value))}
                      className="w-24 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-black text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none text-center"
                    />
                    <span className="text-xs text-slate-600 font-medium">
                      e.g. <strong>{scheduleSalaryDueDay}th</strong> of every month
                    </span>
                  </div>
                </div>
              </div>

              {/* 3. Fee Collection Timeline */}
              <div className="p-4 rounded-3xl bg-slate-50 border border-slate-200 space-y-3">
                <h4 className="text-xs font-black uppercase text-slate-900 flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-blue-600" />
                  <span>3. Student Fee Collection Timeline</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                      Collection Starts On *
                    </label>
                    <input
                      type="date"
                      required
                      value={scheduleFeeStart}
                      onChange={(e) => setScheduleFeeStart(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-600 mb-1">
                      School Fee Due Date *
                    </label>
                    <input
                      type="date"
                      required
                      value={scheduleFeeDue}
                      onChange={(e) => setScheduleFeeDue(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-white border border-slate-200 flex items-center justify-between text-xs">
                  <span className="text-slate-600 font-medium">Status Preview:</span>
                  <span className="font-bold text-indigo-700">
                    {scheduleTimelineStatus.statusText}
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setActiveAppId(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer"
                >
                  Back
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black shadow-xs cursor-pointer"
                >
                  Save Schedule
                </button>
              </div>
            </form>
          )}

          {/* 11. Activity & Immutable Audit Logs Sub-App */}
          {activeAppId === 'audit_logs' && (
            <div className="space-y-4">
              <AuditLogsView session={session} schoolId={activeSchool?.id} />
            </div>
          )}

          {/* 12. School Branding & White-Label Customizer Sub-App */}
          {activeAppId === 'school_branding' && (
            <div className="space-y-4">
              <SchoolBrandingCustomizer
                schoolId={activeSchool?.id}
                activeSchool={activeSchool}
                onUpdateSchool={onUpdateSchoolFromFees}
              />
            </div>
          )}
        </div>

        {/* Persistent Sticky Mobile Bottom Navigation Bar when a sub-app is active */}
        {activeAppId && (
          <div className="sm:hidden px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2 shrink-0 z-10 shadow-lg">
            <button
              type="button"
              onClick={() => setActiveAppId(null)}
              className="flex-1 py-2.5 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to App Gallery</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="py-2.5 px-4 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs cursor-pointer"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
