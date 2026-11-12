/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  X,
  GraduationCap,
  Award,
  Search,
  Plus,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Edit3,
  Printer,
  Sparkles,
  FileSpreadsheet,
  Check,
  RefreshCw,
  UploadCloud,
  Layers,
  CheckCircle,
  HelpCircle,
} from 'lucide-react';
import { StudentPaymentRecord, ScholarshipRecord, SchoolProfile } from '../types';
import {
  formatCurrency,
  getTodayDateString,
  generateNextStudentId,
  calculateBalance,
  calculateStatus,
  calculateScholarshipTuition,
  getClassFeeSchedule,
  parseFinancialAmount,
  roundMoney,
  deriveFeeBreakdown,
  getCurrentAcademicSession,
} from '../services/calculations';
import {
  loadScholarshipsFromFirestore,
  batchSaveScholarshipsToFirestore,
} from '../services/firebase';
import {
  getStoredScholarships,
  saveStoredScholarships,
} from '../services/storage';

interface ScholarshipModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: StudentPaymentRecord[];
  scholarships?: ScholarshipRecord[];
  onRefreshScholarships?: () => Promise<void> | void;
  currencySymbol: string;
  activeSchool?: SchoolProfile;
  selectedTerm?: string;
  selectedSession?: string;
  initialStudentToGrant?: StudentPaymentRecord | null;
  onSelectStudent?: (student: StudentPaymentRecord) => void;
  onSaveScholarship: (
    scholarshipData: {
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
      fee_amount?: number;
      amount_paid?: number;
      balance?: number;
      payment_status?: string;
      tuition_fee?: number;
      tuition_paid?: number;
      admission_fee?: number;
      admission_paid?: number;
      lesson_fee?: number;
      lesson_paid?: number;
      lesson_months?: string;
      exam_fee?: number;
      exam_paid?: number;
      receipt_no?: string;
      payment_date?: string;
    }
  ) => Promise<void> | void;
  onRevokeScholarship: (student: StudentPaymentRecord) => Promise<void> | void;
  apiConfig?: any;
}

const SCHOLARSHIP_TYPE_PRESETS = [
  'Full Tuition Exemption (100% Waiver)',
  'Academic Merit Scholarship',
  'Staff Child Tuition Concession',
  'Orphan / Indigent Student Grant',
  'Pastoral / Clergy Child Exemption',
  'Board of Trustees Award',
  'Community / PTA Sponsorship Scheme',
  'Custom Exemption Type',
];

const AWARDED_BY_PRESETS = [
  'School Management',
  'Board of Trustees',
  'Proprietor / Head Teacher',
  'PTA Welfare Committee',
  'Alumni Association',
  'Community Foundation',
  'Church / Ministry Sponsorship',
];

export const ScholarshipModal: React.FC<ScholarshipModalProps> = ({
  isOpen,
  onClose,
  students,
  scholarships: initialScholarshipsProp,
  onRefreshScholarships,
  currencySymbol,
  activeSchool,
  selectedTerm = 'First Term',
  selectedSession = getCurrentAcademicSession(),
  initialStudentToGrant,
  onSelectStudent,
  onSaveScholarship,
  onRevokeScholarship,
  apiConfig,
}) => {
  const schoolId = activeSchool?.id || 'dominion-group';

  const [modalTab, setModalTab] = useState<'list' | 'add' | 'print'>('list');
  const [searchQuery, setSearchQuery] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const [termFilter, setTermFilter] = useState('all');

  // Authoritative Google Sheet Scholarships state
  const [liveScholarships, setLiveScholarships] = useState<ScholarshipRecord[]>(() => {
    if (initialScholarshipsProp && initialScholarshipsProp.length > 0) {
      return initialScholarshipsProp;
    }
    return getStoredScholarships(schoolId);
  });

  const [isSyncingWithSheet, setIsSyncingWithSheet] = useState<boolean>(false);
  const [isPushingToSheet, setIsPushingToSheet] = useState<boolean>(false);
  const [sheetSyncStatus, setSheetSyncStatus] = useState<string | null>(null);
  const [pushStatusMessage, setPushStatusMessage] = useState<string | null>(null);

  // Form State for Granting / Editing Scholarship
  const [isExistingStudentMode, setIsExistingStudentMode] = useState<boolean>(true);
  const [selectedExistingStudentId, setSelectedExistingStudentId] = useState<string>('');
  const [studentSearchForGrant, setStudentSearchForGrant] = useState<string>('');

  const [formStudentId, setFormStudentId] = useState<string>('');
  const [formFullName, setFormFullName] = useState<string>('');
  const [formClass, setFormClass] = useState<string>('Primary 1');
  const [formTerm, setFormTerm] = useState<string>(selectedTerm);
  const [formSession, setFormSession] = useState<string>(selectedSession);
  const [formScholarshipType, setFormScholarshipType] = useState<string>(SCHOLARSHIP_TYPE_PRESETS[0]);
  const [customScholarshipType, setCustomScholarshipType] = useState<string>('');
  const [formPercentage, setFormPercentage] = useState<number>(100);
  const [formExemptSchoolFee, setFormExemptSchoolFee] = useState<boolean>(true);
  const [formNotes, setFormNotes] = useState<string>('');
  const [formAwardDate, setFormAwardDate] = useState<string>(getTodayDateString());
  const [formAwardedBy, setFormAwardedBy] = useState<string>(AWARDED_BY_PRESETS[0]);
  const [customAwardedBy, setCustomAwardedBy] = useState<string>('');

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [deletingStudentId, setDeletingStudentId] = useState<string | null>(null);
  const [studentToRevoke, setStudentToRevoke] = useState<StudentPaymentRecord | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  // Sync with Firestore scholarships when modal opens or school changes
  const handleFetchFromSheet = useCallback(async () => {
    setIsSyncingWithSheet(true);
    setSheetSyncStatus('Syncing scholarships with Firestore...');

    try {
      const firestoreData = await loadScholarshipsFromFirestore(schoolId);
      if (Array.isArray(firestoreData) && firestoreData.length > 0) {
        setLiveScholarships(firestoreData);
        saveStoredScholarships(firestoreData, schoolId);
        setSheetSyncStatus(`Cloud Synced: ${firestoreData.length} records loaded from Firestore`);
      } else {
        const cached = getStoredScholarships(schoolId);
        setLiveScholarships(cached);
        setSheetSyncStatus(`Loaded ${cached.length} scholarships`);
      }
    } catch (err: any) {
      console.warn('[Scholarship Sync]', err);
      const cached = getStoredScholarships(schoolId);
      setLiveScholarships(cached);
      setSheetSyncStatus(`Note: Using local cache (${cached.length} records)`);
    } finally {
      setIsSyncingWithSheet(false);
    }
  }, [schoolId]);

  useEffect(() => {
    if (isOpen) {
      handleFetchFromSheet();
    }
  }, [isOpen, schoolId]);

  // Keep liveScholarships in sync if parent passes updated scholarships prop
  useEffect(() => {
    if (initialScholarshipsProp) {
      setLiveScholarships(initialScholarshipsProp);
    }
  }, [initialScholarshipsProp]);

  // If opened with a specific student to grant scholarship, immediately populate form & switch to 'add' tab
  useEffect(() => {
    if (isOpen && initialStudentToGrant) {
      setIsExistingStudentMode(true);
      setSelectedExistingStudentId(initialStudentToGrant.id);
      setFormStudentId(initialStudentToGrant.id);
      setFormFullName(initialStudentToGrant.full_name);
      setFormClass(initialStudentToGrant.class || 'Primary 1');
      setFormTerm(initialStudentToGrant.term || selectedTerm);
      setFormSession(initialStudentToGrant.session || selectedSession);
      setFormNotes(initialStudentToGrant.scholarship_notes || '');
      setFormScholarshipType(SCHOLARSHIP_TYPE_PRESETS[0]);
      setCustomScholarshipType('');
      setFormPercentage(100);
      setFormExemptSchoolFee(true);
      setFormAwardDate(getTodayDateString());
      setFormAwardedBy(AWARDED_BY_PRESETS[0]);
      setCustomAwardedBy('');
      setFormError(null);
      setModalTab('add');
    }
  }, [isOpen, initialStudentToGrant, selectedTerm, selectedSession]);

  // Derive class list
  const availableClasses = useMemo(() => {
    if (activeSchool?.classes && activeSchool.classes.length > 0) {
      return activeSchool.classes;
    }
    const set = new Set<string>();
    students.forEach((s) => {
      if (s.class && s.class.trim()) set.add(s.class.trim());
    });
    liveScholarships.forEach((s) => {
      if (s.class && s.class.trim()) set.add(s.class.trim());
    });
    return Array.from(set);
  }, [activeSchool, students, liveScholarships]);

  // Unified list of scholarship beneficiaries (strictly derived from Google Sheet Scholarships Tab)
  const unifiedBeneficiaries = useMemo(() => {
    const map = new Map<string, {
      student: StudentPaymentRecord;
      scholarshipDetails?: ScholarshipRecord;
    }>();

    // Only records present on the Scholarships tab with status === 'active' are recognized as scholarship beneficiaries
    liveScholarships.forEach((sch) => {
      if (!sch || !sch.id) return;
      const status = String(sch.status || 'active').toLowerCase().trim();
      if (status !== 'active') {
        return;
      }

      const idKey = String(sch.id).toLowerCase().trim();
      if (!idKey) return;

      // Find if student exists in main roster to get latest fees/payments (strictly by ID)
      const rosterMatch = students.find(
        (s) => s.id && String(s.id).toLowerCase().trim() === idKey
      );

      const studentClass = sch.class || rosterMatch?.class || 'Primary 1';
      const scholarshipTerm = sch.term || rosterMatch?.term || selectedTerm;
      const classSched = getClassFeeSchedule(activeSchool, studentClass);
      const hasScholarshipPercentage = sch.scholarship_percentage !== undefined && sch.scholarship_percentage !== null;
      const isExempt = sch.exempt_school_fee === true || (!hasScholarshipPercentage && sch.exempt_school_fee !== false);
      const tuitionCalculation = calculateScholarshipTuition(
        classSched.tuitionFee,
        sch.scholarship_percentage ?? 100,
        isExempt
      );
      const pct = tuitionCalculation.scholarshipPercentage;
      const isFullExemption = isExempt || pct >= 100;
      const tuitionFee = tuitionCalculation.tuitionFee;

      // Lesson fee from class schedule
      let lessonFee = classSched.lessonFeeTermly;
      if (rosterMatch?.lesson_months) {
        if (rosterMatch.lesson_months.includes('1 Month')) lessonFee = classSched.lessonFeeMonthly;
        else if (rosterMatch.lesson_months.includes('2 Month')) lessonFee = classSched.lessonFeeMonthly * 2;
        else if (rosterMatch.lesson_months.includes('None') || rosterMatch.lesson_months === '0') lessonFee = 0;
      } else if (rosterMatch && rosterMatch.lesson_fee === 0 && Number(rosterMatch.lesson_paid || 0) === 0) {
        lessonFee = 0;
      }
      const lessonPaid = parseFinancialAmount(rosterMatch?.lesson_paid ?? sch.lesson_paid, 0);
      lessonFee = Math.max(lessonFee, lessonPaid);

      // Exam fee from class schedule
      const examPaid = parseFinancialAmount(rosterMatch?.exam_paid ?? sch.exam_paid, 0);
      const examFee = Math.max(classSched.examFee, examPaid);

      // Admission fee
      const admissionPaid = parseFinancialAmount(rosterMatch?.admission_paid ?? sch.admission_paid, 0);
      const admissionFee = rosterMatch?.is_new_admission
        ? classSched.admissionFee
        : Math.max(parseFinancialAmount(rosterMatch?.admission_fee ?? sch.admission_fee, 0), admissionPaid);

      const additionalFeeBreakdown = deriveFeeBreakdown(
        {
          ...(rosterMatch ?? {}),
          id: sch.id,
          class: studentClass,
          term: scholarshipTerm,
          additional_fees: rosterMatch?.additional_fees || [],
        },
        activeSchool,
        { forceScheduleRates: true }
      );
      const additionalFees = additionalFeeBreakdown.additionalFees;
      const totalFee = roundMoney(
        tuitionFee + admissionFee + lessonFee + examFee + additionalFeeBreakdown.additionalFeesTotal
      );
      const amountPaid = parseFinancialAmount(rosterMatch?.amount_paid ?? sch.amount_paid, 0);

      const studentRecord: StudentPaymentRecord = {
        id: sch.id,
        full_name: sch.full_name || sch.student_name || rosterMatch?.full_name || 'Scholarship Beneficiary',
        class: studentClass,
        term: scholarshipTerm,
        session: sch.session || rosterMatch?.session || selectedSession,
        fee_amount: totalFee,
        amount_paid: amountPaid,
        balance: calculateBalance(totalFee, amountPaid),
        status: calculateStatus(totalFee, amountPaid),
        payment_date: sch.payment_date || sch.award_date || rosterMatch?.payment_date || '',
        is_exempt_from_school_fee: isFullExemption,
        scholarship_notes:
          sch.scholarship_notes ||
          sch.scholarship_type ||
          (isFullExemption ? 'Full Tuition Exemption' : `${pct}% Tuition Scholarship`),
        tuition_fee: tuitionFee,
        tuition_paid: parseFinancialAmount(rosterMatch?.tuition_paid ?? sch.tuition_paid, 0),
        admission_fee: admissionFee,
        admission_paid: admissionPaid,
        lesson_fee: lessonFee,
        lesson_paid: lessonPaid,
        lesson_months: rosterMatch?.lesson_months ?? sch.lesson_months,
        exam_fee: examFee,
        exam_paid: examPaid,
        additional_fees: additionalFees,
        receipt_no: rosterMatch?.receipt_no ?? sch.receipt_no,
      };

      map.set(idKey, {
        student: studentRecord,
        scholarshipDetails: sch,
      });
    });

    return Array.from(map.values());
  }, [liveScholarships, students, selectedTerm, selectedSession, activeSchool]);

  // Filtered scholarship students
  const filteredBeneficiaries = useMemo(() => {
    return unifiedBeneficiaries.filter(({ student, scholarshipDetails }) => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = student.full_name?.toLowerCase().includes(q);
        const matchesId = student.id?.toLowerCase().includes(q);
        const matchesClass = student.class?.toLowerCase().includes(q);
        const matchesNotes = student.scholarship_notes?.toLowerCase().includes(q);
        const matchesType = scholarshipDetails?.scholarship_type?.toLowerCase().includes(q);
        const matchesAwardedBy = scholarshipDetails?.awarded_by?.toLowerCase().includes(q);
        if (!matchesName && !matchesId && !matchesClass && !matchesNotes && !matchesType && !matchesAwardedBy) {
          return false;
        }
      }

      // Class Filter
      if (classFilter !== 'all' && student.class !== classFilter) {
        return false;
      }

      // Term Filter
      if (termFilter !== 'all' && student.term !== termFilter) {
        return false;
      }

      return true;
    });
  }, [unifiedBeneficiaries, searchQuery, classFilter, termFilter]);

  // Total Estimated Waived Fee value (calculated accurately using each student's class fee schedule)
  const totalWaivedValue = useMemo(() => {
    return unifiedBeneficiaries.reduce((sum, b) => {
      const classSched = getClassFeeSchedule(activeSchool, b.student.class);
      const calculation = calculateScholarshipTuition(
        classSched.tuitionFee,
        b.scholarshipDetails?.scholarship_percentage ?? 100,
        b.scholarshipDetails?.exempt_school_fee ?? b.student.is_exempt_from_school_fee
      );
      return sum + calculation.waivedAmount;
    }, 0);
  }, [unifiedBeneficiaries, activeSchool]);

  // Non-scholarship students available to grant scholarship
  const eligibleExistingStudents = useMemo(() => {
    const existingIds = new Set(unifiedBeneficiaries.map((u) => String(u.student.id).toLowerCase().trim()));
    return students.filter((s) => !existingIds.has(String(s.id).toLowerCase().trim()));
  }, [students, unifiedBeneficiaries]);

  const searchedEligibleStudents = useMemo(() => {
    if (!studentSearchForGrant.trim()) return eligibleExistingStudents.slice(0, 15);
    const q = studentSearchForGrant.toLowerCase().trim();
    return eligibleExistingStudents
      .filter(
        (s) =>
          s.full_name?.toLowerCase().includes(q) ||
          s.id?.toLowerCase().includes(q) ||
          s.class?.toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [eligibleExistingStudents, studentSearchForGrant]);

  const selectedExistingStudentRecord = useMemo(() => {
    if (!selectedExistingStudentId) return null;
    return students.find((s) => s.id === selectedExistingStudentId) || null;
  }, [students, selectedExistingStudentId]);

  // Live schedule for currently selected form class strictly from activeSchool / Settings
  const currentFormClassSchedule = useMemo(() => {
    return getClassFeeSchedule(activeSchool, formClass);
  }, [activeSchool, formClass]);

  // Live calculation of fees with scholarship applied (always reflects Settings updates immediately)
  const formBreakdownPreview = useMemo(() => {
    const studentToEval: Partial<StudentPaymentRecord> = selectedExistingStudentRecord
      ? { ...selectedExistingStudentRecord, class: formClass, term: formTerm }
      : { class: formClass, term: formTerm, is_new_admission: false };

    const bd = deriveFeeBreakdown(studentToEval, activeSchool, { forceScheduleRates: true });
    const standardTuition = bd.tuitionFee;
    const tuitionCalculation = calculateScholarshipTuition(
      standardTuition,
      formPercentage,
      formExemptSchoolFee
    );
    const waivedPct = tuitionCalculation.waivedPercentage;
    const waivedTuitionAmount = tuitionCalculation.waivedAmount;
    const netTuitionPayable = tuitionCalculation.tuitionFee;

    const netTotalFee = roundMoney(
      netTuitionPayable + bd.admissionFee + bd.lessonFee + bd.examFee + bd.additionalFeesTotal
    );
    const amountPaid = selectedExistingStudentRecord
      ? parseFinancialAmount(selectedExistingStudentRecord.amount_paid, 0)
      : 0;
    const netBalance = calculateBalance(netTotalFee, amountPaid);
    const netStatus = calculateStatus(netTotalFee, amountPaid);

    return {
      standardTuition,
      waivedPct,
      waivedTuitionAmount,
      netTuitionPayable,
      lessonFee: bd.lessonFee,
      lessonPaid: bd.lessonPaid,
      examFee: bd.examFee,
      examPaid: bd.examPaid,
      admissionFee: bd.admissionFee,
      admissionPaid: bd.admissionPaid,
      additionalFeesTotal: bd.additionalFeesTotal,
      additionalFeesPaid: bd.additionalFeesPaid,
      netTotalFee,
      amountPaid,
      netBalance,
      netStatus,
    };
  }, [activeSchool, formClass, formExemptSchoolFee, formPercentage, selectedExistingStudentRecord]);

  // Push all combined scholarships to Firestore
  const handlePushAllToSheet = async () => {
    const recordsToPush: ScholarshipRecord[] = unifiedBeneficiaries.map(
      ({ student, scholarshipDetails }) => ({
        id: student.id,
        student_name: student.full_name,
        full_name: student.full_name,
        class: student.class,
        term: student.term,
        session: student.session,
        scholarship_type: scholarshipDetails?.scholarship_type || student.scholarship_notes || 'Full Tuition Exemption',
        scholarship_percentage:
          scholarshipDetails?.scholarship_percentage ?? (student.is_exempt_from_school_fee ? 100 : 0),
        exempt_school_fee: scholarshipDetails?.exempt_school_fee ?? student.is_exempt_from_school_fee,
        scholarship_notes: scholarshipDetails?.scholarship_notes || student.scholarship_notes || 'Full Tuition Exemption',
        award_date: scholarshipDetails?.award_date || student.payment_date || getTodayDateString(),
        awarded_by: scholarshipDetails?.awarded_by || 'School Management',
        status: 'active',
        created_at: scholarshipDetails?.created_at || new Date().toISOString(),
        fee_amount: student.fee_amount,
        amount_paid: student.amount_paid,
        balance: student.balance,
        payment_status: student.status,
        tuition_fee: student.tuition_fee ?? 0,
        tuition_paid: student.tuition_paid,
        admission_fee: student.admission_fee,
        admission_paid: student.admission_paid,
        lesson_fee: student.lesson_fee,
        lesson_paid: student.lesson_paid,
        exam_fee: student.exam_fee,
        exam_paid: student.exam_paid,
        receipt_no: student.receipt_no,
        payment_date: student.payment_date,
      })
    );

    setIsPushingToSheet(true);
    setPushStatusMessage('Saving all beneficiaries to Cloud Firestore...');

    try {
      await batchSaveScholarshipsToFirestore(recordsToPush, schoolId);
      setLiveScholarships(recordsToPush);
      saveStoredScholarships(recordsToPush, schoolId);
      setPushStatusMessage(`Success: ${recordsToPush.length} beneficiaries synced to Firestore!`);
      setTimeout(() => setPushStatusMessage(null), 4000);
      if (onRefreshScholarships) {
        await onRefreshScholarships();
      }
    } catch (err: any) {
      console.error('Push error:', err);
      setPushStatusMessage(`Push warning: ${err?.message || 'Could not write to database'}`);
    } finally {
      setIsPushingToSheet(false);
    }
  };

  // Reset form when switching to Add tab
  const handleOpenAddForm = (existingStudent?: StudentPaymentRecord, existingScholarship?: ScholarshipRecord) => {
    setFormError(null);
    if (existingStudent) {
      setIsExistingStudentMode(true);
      setSelectedExistingStudentId(existingStudent.id);
      setFormStudentId(existingStudent.id);
      setFormFullName(existingStudent.full_name);
      setFormClass(existingStudent.class || availableClasses[0] || 'Primary 1');
      setFormTerm(existingStudent.term || selectedTerm);
      setFormSession(existingStudent.session || selectedSession);
      setFormNotes(existingScholarship?.scholarship_notes || existingStudent.scholarship_notes || 'Full Tuition Exemption');
      setFormScholarshipType(existingScholarship?.scholarship_type || SCHOLARSHIP_TYPE_PRESETS[0]);
      setFormAwardedBy(existingScholarship?.awarded_by || AWARDED_BY_PRESETS[0]);
      setFormAwardDate(existingScholarship?.award_date || getTodayDateString());
    } else {
      setIsExistingStudentMode(true);
      setSelectedExistingStudentId('');
      setStudentSearchForGrant('');
      setFormStudentId('');
      setFormFullName('');
      setFormClass(availableClasses[0] || 'Primary 1');
      setFormTerm(selectedTerm);
      setFormSession(selectedSession);
      setFormNotes('');
      setFormScholarshipType(SCHOLARSHIP_TYPE_PRESETS[0]);
      setFormAwardedBy(AWARDED_BY_PRESETS[0]);
      setFormAwardDate(getTodayDateString());
    }
    setCustomScholarshipType('');
    setFormPercentage(100);
    setFormExemptSchoolFee(true);
    setCustomAwardedBy('');
    setModalTab('add');
  };

  // Handle existing student selection in grant form
  const handleSelectStudentForGrant = (student: StudentPaymentRecord) => {
    setSelectedExistingStudentId(student.id);
    setFormStudentId(student.id);
    setFormFullName(student.full_name);
    setFormClass(student.class || availableClasses[0] || 'Primary 1');
    setFormTerm(student.term || selectedTerm);
    setFormSession(student.session || selectedSession);
    setFormNotes(student.scholarship_notes || 'Full Tuition Exemption');
    setStudentSearchForGrant('');
  };

  // Submit Grant Form
  const handleSubmitGrant = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const targetName = formFullName.trim();
    const targetId = formStudentId.trim();

    if (!targetName) {
      setFormError('Please enter or select a student name.');
      return;
    }
    if (!targetId) {
      setFormError('Student ID is required.');
      return;
    }

    const finalScholarshipType =
      formScholarshipType === 'Custom Exemption Type'
        ? customScholarshipType.trim() || 'Special Exemption Grant'
        : formScholarshipType;

    const finalAwardedBy =
      formAwardedBy === 'Custom'
        ? customAwardedBy.trim() || 'School Management'
        : formAwardedBy;

    const existingRecord = students.find((s) => s.id === targetId);

    setIsSubmitting(true);
    try {
      await onSaveScholarship({
        studentId: targetId,
        fullName: targetName,
        studentClass: formClass,
        term: formTerm,
        session: formSession,
        scholarshipType: finalScholarshipType,
        scholarshipPercentage: formPercentage,
        exemptSchoolFee: formExemptSchoolFee,
        scholarshipNotes: formNotes.trim() || finalScholarshipType,
        awardDate: formAwardDate,
        awardedBy: finalAwardedBy,
        isNewStudent: !isExistingStudentMode || !existingRecord,
        fee_amount: formBreakdownPreview.netTotalFee,
        amount_paid: formBreakdownPreview.amountPaid,
        balance: formBreakdownPreview.netBalance,
        payment_status: formBreakdownPreview.netStatus,
        tuition_fee: formBreakdownPreview.netTuitionPayable,
        tuition_paid: existingRecord?.tuition_paid || 0,
        admission_fee: formBreakdownPreview.admissionFee,
        admission_paid: formBreakdownPreview.admissionPaid,
        lesson_fee: formBreakdownPreview.lessonFee,
        lesson_paid: formBreakdownPreview.lessonPaid,
        lesson_months: existingRecord?.lesson_months,
        exam_fee: formBreakdownPreview.examFee,
        exam_paid: formBreakdownPreview.examPaid,
        receipt_no: existingRecord?.receipt_no,
        payment_date: existingRecord?.payment_date,
      });

      // Update local state immediately
      const newSchRecord: ScholarshipRecord = {
        id: targetId,
        student_name: targetName,
        full_name: targetName,
        class: formClass,
        term: formTerm,
        session: formSession,
        scholarship_type: finalScholarshipType,
        scholarship_percentage: formPercentage,
        exempt_school_fee: formExemptSchoolFee,
        scholarship_notes: formNotes.trim() || finalScholarshipType,
        award_date: formAwardDate,
        awarded_by: finalAwardedBy,
        status: 'active',
        created_at: new Date().toISOString(),
        fee_amount: formBreakdownPreview.netTotalFee,
        amount_paid: formBreakdownPreview.amountPaid,
        balance: formBreakdownPreview.netBalance,
        payment_status: formBreakdownPreview.netStatus,
        tuition_fee: formBreakdownPreview.netTuitionPayable,
        tuition_paid: existingRecord?.tuition_paid || 0,
        admission_fee: formBreakdownPreview.admissionFee,
        admission_paid: formBreakdownPreview.admissionPaid,
        lesson_fee: formBreakdownPreview.lessonFee,
        lesson_paid: formBreakdownPreview.lessonPaid,
        lesson_months: existingRecord?.lesson_months,
        exam_fee: formBreakdownPreview.examFee,
        exam_paid: formBreakdownPreview.examPaid,
        receipt_no: existingRecord?.receipt_no,
        payment_date: existingRecord?.payment_date,
      };

      setLiveScholarships((prev) => [
        newSchRecord,
        ...prev.filter((s) => s.id !== targetId),
      ]);

      setModalTab('list');
    } catch (err: any) {
      setFormError(err?.message || 'Failed to save scholarship. Please check connection and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Revoke Exemption handlers
  const handleOpenRevokePrompt = (student: StudentPaymentRecord) => {
    setStudentToRevoke(student);
    setRevokeError(null);
  };

  const handleConfirmRevoke = async () => {
    if (!studentToRevoke) return;
    setDeletingStudentId(studentToRevoke.id);
    setRevokeError(null);
    try {
      await onRevokeScholarship(studentToRevoke);
      setLiveScholarships((prev) => prev.filter((s) => s.id !== studentToRevoke.id));
      setStudentToRevoke(null);
    } catch (err: any) {
      setRevokeError(err?.message || 'Could not revoke scholarship.');
    } finally {
      setDeletingStudentId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[92dvh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden">
        {/* Top Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 bg-linear-to-r from-amber-50/70 via-white to-amber-50/40 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500 text-white shadow-md shadow-amber-500/20">
              <GraduationCap className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                  Scholarship & Exemption Registry
                </h2>
                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold border border-amber-200">
                  {unifiedBeneficiaries.length} Beneficiaries
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                {activeSchool?.name || 'School'} • Cloud Firestore Scholarship Beneficiaries & Roster
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleFetchFromSheet}
              disabled={isSyncingWithSheet}
              className="px-2.5 py-1.5 rounded-xl border border-amber-300 bg-amber-50/70 hover:bg-amber-100 text-amber-900 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
              title="Fetch fresh data from Cloud Firestore scholarships"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncingWithSheet ? 'animate-spin text-amber-700' : 'text-amber-700'}`} />
              <span className="hidden sm:inline">{isSyncingWithSheet ? 'Syncing...' : 'Sync Cloud'}</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Sync Status Banner */}
        {sheetSyncStatus && (
          <div className="px-4 py-1.5 bg-amber-500/10 border-b border-amber-200 flex items-center justify-between text-[11px] text-amber-950">
            <div className="flex items-center gap-1.5 truncate">
              <Award className="w-3.5 h-3.5 text-amber-700 shrink-0" />
              <span className="font-semibold truncate">{sheetSyncStatus}</span>
            </div>
            {pushStatusMessage && (
              <span className="font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-md text-[10px] shrink-0">
                {pushStatusMessage}
              </span>
            )}
          </div>
        )}

        {/* View Switcher Tabs & Actions */}
        <div className="px-4 sm:px-5 py-2.5 bg-slate-50 border-b border-slate-200/80 flex items-center justify-between gap-2 overflow-x-auto">
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setModalTab('list')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                modalTab === 'list'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Award className="w-3.5 h-3.5 text-amber-600" />
              <span>Beneficiaries ({unifiedBeneficiaries.length})</span>
            </button>

            <button
              type="button"
              onClick={() => handleOpenAddForm()}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                modalTab === 'add'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Plus className="w-3.5 h-3.5 text-emerald-600" />
              <span>+ Grant Scholarship</span>
            </button>

            <button
              type="button"
              onClick={() => setModalTab('print')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                modalTab === 'print'
                  ? 'bg-white text-slate-900 shadow-xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              <Printer className="w-3.5 h-3.5 text-slate-600" />
              <span>Print Register</span>
            </button>
          </div>

          {modalTab === 'list' && (
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handlePushAllToSheet}
                disabled={isPushingToSheet || unifiedBeneficiaries.length === 0}
                className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer disabled:opacity-50"
                title="Write and align all scholarship beneficiaries directly to Cloud Firestore"
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>{isPushingToSheet ? 'Syncing...' : 'Save All to Cloud'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* ========================================================================= */}
          {/* VIEW 1: BENEFICIARIES LIST */}
          {/* ========================================================================= */}
          {modalTab === 'list' && (
            <div className="space-y-4">
              {/* Summary Metrics Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
                <div className="p-3 bg-amber-50/70 border border-amber-200/70 rounded-2xl flex flex-col">
                  <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">
                    Total Beneficiaries
                  </span>
                  <span className="text-xl font-black text-amber-950 mt-1">
                    {unifiedBeneficiaries.length}
                  </span>
                  <span className="text-[10px] text-amber-700/80 mt-0.5">Google Sheet + Roster</span>
                </div>

                <div className="p-3 bg-emerald-50/70 border border-emerald-200/70 rounded-2xl flex flex-col">
                  <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">
                    100% Tuition Exemption
                  </span>
                  <span className="text-xl font-black text-emerald-950 mt-1">
                    {unifiedBeneficiaries.length}
                  </span>
                  <span className="text-[10px] text-emerald-700/80 mt-0.5">Full tuition fee waiver</span>
                </div>

                <div className="p-3 bg-blue-50/70 border border-blue-200/70 rounded-2xl flex flex-col">
                  <span className="text-[10px] font-bold text-blue-800 uppercase tracking-wider">
                    Term Tuition Waived
                  </span>
                  <span className="text-xl font-black text-blue-950 mt-1">
                    {formatCurrency(totalWaivedValue, currencySymbol)}
                  </span>
                  <span className="text-[10px] text-blue-700/80 mt-0.5">Sponsored termly value</span>
                </div>

                <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col">
                  <span className="text-[10px] font-bold text-slate-600 uppercase tracking-wider">
                    Google Sheet Source
                  </span>
                  <span className="text-sm font-black text-slate-800 mt-1 flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    Scholarships Tab
                  </span>
                  <span className="text-[10px] text-slate-500 mt-0.5">
                    {liveScholarships.length} rows in dedicated tab
                  </span>
                </div>
              </div>

              {/* Search and Filters Bar */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search beneficiary name, ID (e.g. #0001), class, or category..."
                    className="w-full bg-slate-100 border border-slate-200 rounded-xl py-2 pl-9 pr-8 text-xs text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-amber-500 focus:bg-white focus:outline-none transition-all"
                  />
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <select
                    value={classFilter}
                    onChange={(e) => setClassFilter(e.target.value)}
                    className="bg-slate-100 border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  >
                    <option value="all">All Classes ({availableClasses.length})</option>
                    {availableClasses.map((cls) => (
                      <option key={cls} value={cls}>
                        {cls}
                      </option>
                    ))}
                  </select>

                  <select
                    value={termFilter}
                    onChange={(e) => setTermFilter(e.target.value)}
                    className="bg-slate-100 border border-slate-200 rounded-xl px-2.5 py-2 text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  >
                    <option value="all">All Terms</option>
                    <option value="First Term">First Term</option>
                    <option value="Second Term">Second Term</option>
                    <option value="Third Term">Third Term</option>
                  </select>
                </div>
              </div>

              {/* Beneficiary Cards List */}
              {filteredBeneficiaries.length === 0 ? (
                <div className="p-8 text-center rounded-3xl bg-slate-50 border border-dashed border-slate-300 flex flex-col items-center justify-center space-y-3">
                  <div className="p-3 rounded-full bg-amber-100 text-amber-700">
                    <GraduationCap className="w-8 h-8" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800">
                      {unifiedBeneficiaries.length === 0
                        ? 'No Scholarship Students Enrolled Yet'
                        : 'No matching scholarship beneficiaries found'}
                    </h3>
                    <p className="text-xs text-slate-500 max-w-md mt-1">
                      {unifiedBeneficiaries.length === 0
                        ? 'Grant a full tuition waiver or merit scholarship to an existing student, or enroll a new beneficiary. Everything synchronizes directly to the Google Sheet Scholarships tab.'
                        : 'Try adjusting your search keywords or class filters.'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => handleOpenAddForm()}
                      className="px-4 py-2 rounded-2xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Grant New Scholarship</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleFetchFromSheet}
                      className="px-4 py-2 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Fetch from Sheet</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredBeneficiaries.map(({ student, scholarshipDetails }) => (
                    <div
                      key={student.id}
                      className="p-4 rounded-2xl bg-white border border-slate-200/90 hover:border-amber-400 hover:shadow-md transition-all flex flex-col justify-between gap-3 group"
                    >
                      <div className="space-y-2">
                        {/* Top Info Header */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                                #{student.id}
                              </span>
                              <span className="text-[10px] font-bold text-slate-500">
                                {student.class} • {student.term}
                              </span>
                            </div>
                            <h4 className="text-sm font-black text-slate-900 truncate mt-0.5">
                              {student.full_name}
                            </h4>
                          </div>

                          <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-black border border-amber-200/80 shrink-0 flex items-center gap-1">
                            <Award className="w-3 h-3 text-amber-700" />
                            <span>100% Exemption</span>
                          </span>
                        </div>

                        {/* Grant Details Box & Copied Details from Students Tab */}
                        <div className="p-2.5 rounded-xl bg-amber-50/60 border border-amber-200/60 space-y-2 text-[11px]">
                          <div className="flex items-center justify-between text-slate-600">
                            <span className="font-semibold text-slate-700">Grant Category:</span>
                            <span className="font-bold text-amber-900 truncate max-w-[200px]">
                              {scholarshipDetails?.scholarship_type || student.scholarship_notes || 'Full Tuition Exemption'}
                            </span>
                          </div>

                          {scholarshipDetails?.awarded_by && (
                            <div className="flex items-center justify-between text-slate-600 text-[10px]">
                              <span className="font-medium text-slate-500">Awarded By:</span>
                              <span className="font-semibold text-slate-800 truncate max-w-[200px]">
                                {scholarshipDetails.awarded_by}
                              </span>
                            </div>
                          )}

                          {scholarshipDetails?.award_date && (
                            <div className="flex items-center justify-between text-slate-600 text-[10px]">
                              <span className="font-medium text-slate-500">Award Date:</span>
                              <span className="font-semibold text-slate-800">
                                {scholarshipDetails.award_date}
                              </span>
                            </div>
                          )}

                          <div className="flex items-center justify-between text-slate-600 pt-1 border-t border-amber-200/40">
                            <span className="font-semibold text-slate-700">Tuition Fee Due:</span>
                            <span className="font-black text-emerald-700">₦0.00 (100% Waived)</span>
                          </div>

                          {/* Fees Breakdown (Lesson, Exam, Admission) */}
                          <div className="pt-1.5 border-t border-amber-200/50 space-y-1 text-[10px]">
                            <div className="flex justify-between items-center text-slate-600">
                              <span>Lesson Fee:</span>
                              <span className="font-semibold text-slate-800">
                                {formatCurrency(student.lesson_fee || 0, currencySymbol)}{' '}
                                <span className="text-slate-500 font-normal">
                                  (Paid: {formatCurrency(student.lesson_paid || 0, currencySymbol)})
                                </span>
                              </span>
                            </div>
                            <div className="flex justify-between items-center text-slate-600">
                              <span>Exam Fee:</span>
                              <span className="font-semibold text-slate-800">
                                {formatCurrency(student.exam_fee || 0, currencySymbol)}{' '}
                                <span className="text-slate-500 font-normal">
                                  (Paid: {formatCurrency(student.exam_paid || 0, currencySymbol)})
                                </span>
                              </span>
                            </div>
                            {student.admission_fee !== undefined && student.admission_fee > 0 && (
                              <div className="flex justify-between items-center text-slate-600">
                                <span>Admission Fee:</span>
                                <span className="font-semibold text-slate-800">
                                  {formatCurrency(student.admission_fee || 0, currencySymbol)}{' '}
                                  <span className="text-slate-500 font-normal">
                                    (Paid: {formatCurrency(student.admission_paid || 0, currencySymbol)})
                                  </span>
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Totals & Stored Details Badge */}
                          <div className="pt-1.5 border-t border-amber-200/50 flex items-center justify-between text-[10px]">
                            <span className="text-slate-600">
                              Total Paid: <strong className="text-emerald-700">{formatCurrency(student.amount_paid, currencySymbol)}</strong>
                            </span>
                            <span className="text-slate-600">
                              Balance: <strong className={student.balance > 0 ? 'text-rose-600' : 'text-emerald-700'}>{formatCurrency(student.balance, currencySymbol)}</strong>
                            </span>
                          </div>

                          <div className="pt-1 border-t border-amber-200/40 flex items-center justify-between text-[9px] text-amber-900 font-medium">
                            <span>{student.receipt_no ? `Receipt: #${student.receipt_no}` : (student.payment_date ? `Date: ${student.payment_date}` : `Session ${student.session || getCurrentAcademicSession()}`)}</span>
                            <span className="flex items-center gap-0.5 text-emerald-700 font-bold">
                              <CheckCircle2 className="w-2.5 h-2.5" /> Synced to Sheet
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Card Action Controls */}
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-1 text-xs">
                        <div className="flex items-center gap-1">
                          {onSelectStudent && (
                            <button
                              type="button"
                              onClick={() => {
                                onSelectStudent(student);
                                onClose();
                              }}
                              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                              title="Open Student Profile"
                            >
                              <span>Profile</span>
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleOpenAddForm(student, scholarshipDetails)}
                            className="px-2.5 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 font-bold text-[11px] flex items-center gap-1 transition-colors cursor-pointer"
                            title="Edit Grant Details"
                          >
                            <Edit3 className="w-3 h-3 text-amber-700" />
                            <span>Edit</span>
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleOpenRevokePrompt(student)}
                          disabled={deletingStudentId === student.id}
                          className="px-2 py-1 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 font-bold text-[11px] flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-50"
                          title="Revoke scholarship & restore regular fee"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Revoke</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ========================================================================= */}
          {/* VIEW 2: GRANT NEW SCHOLARSHIP FORM */}
          {/* ========================================================================= */}
          {modalTab === 'add' && (
            <form onSubmit={handleSubmitGrant} className="space-y-4 max-w-2xl mx-auto">
              <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-2xl flex items-start gap-2.5 text-xs text-amber-900">
                <Sparkles className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Grant Scholarship / Tuition Exemption</p>
                  <p className="text-[11px] text-amber-800/90 mt-0.5">
                    Beneficiaries receive a full tuition exemption (₦0 base school fee). All records are directly stored in your Google Sheet &quot;Scholarships&quot; tab and roster.
                  </p>
                </div>
              </div>

              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-2 text-xs text-rose-700">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Student Mode Selector */}
              <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-200">
                <button
                  type="button"
                  onClick={() => {
                    setIsExistingStudentMode(true);
                    setFormFullName('');
                    setSelectedExistingStudentId('');
                  }}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    isExistingStudentMode
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Select from Existing Students
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsExistingStudentMode(false);
                    setSelectedExistingStudentId('');
                    setFormStudentId('');
                    setFormFullName('');
                  }}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                    !isExistingStudentMode
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Enroll New Student on Scholarship
                </button>
              </div>

              {/* Step 1: Student Selection or Entry */}
              {isExistingStudentMode ? (
                <div className="space-y-2">
                  <label className="block text-xs font-bold text-slate-700">
                    Find Existing Student *
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={studentSearchForGrant}
                      onChange={(e) => setStudentSearchForGrant(e.target.value)}
                      placeholder="Type student name or ID to search..."
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl py-2 pl-9 pr-3 text-xs text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  </div>

                  {studentSearchForGrant && (
                    <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-xl bg-white divide-y divide-slate-100 shadow-xs">
                      {searchedEligibleStudents.length === 0 ? (
                        <p className="p-2.5 text-center text-xs text-slate-400">
                          No non-exempt students found matching search.
                        </p>
                      ) : (
                        searchedEligibleStudents.map((st) => (
                          <button
                            key={st.id}
                            type="button"
                            onClick={() => handleSelectStudentForGrant(st)}
                            className="w-full p-2 text-left text-xs hover:bg-amber-50 flex items-center justify-between transition-colors cursor-pointer"
                          >
                            <div>
                              <span className="font-bold text-slate-900">{st.full_name}</span>
                              <span className="text-slate-500 text-[11px] ml-2">
                                ({st.class} • #{st.id})
                              </span>
                            </div>
                            <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                              Select
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}

                  {/* Selected Student Confirmation */}
                  {formFullName && selectedExistingStudentRecord ? (
                    <div className="p-3.5 bg-gradient-to-br from-amber-50 to-orange-50/40 border border-amber-300/80 rounded-2xl space-y-2.5 shadow-xs">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-black text-amber-950">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>Selected Student: {formFullName} (#{formStudentId})</span>
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 shadow-2xs">
                          {selectedExistingStudentRecord.class}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                        <div className="p-2 rounded-xl bg-white border border-amber-200/60 shadow-2xs">
                          <span className="text-[9px] font-bold text-slate-500 uppercase block">Configured Fee</span>
                          <span className="font-black text-slate-900">{formatCurrency(formBreakdownPreview.netTotalFee + formBreakdownPreview.waivedTuitionAmount, currencySymbol)}</span>
                        </div>
                        <div className="p-2 rounded-xl bg-white border border-amber-200/60 shadow-2xs">
                          <span className="text-[9px] font-bold text-slate-500 uppercase block">Amount Paid</span>
                          <span className="font-black text-emerald-600">{formatCurrency(formBreakdownPreview.amountPaid, currencySymbol)}</span>
                        </div>
                        <div className="p-2 rounded-xl bg-white border border-amber-200/60 shadow-2xs">
                          <span className="text-[9px] font-bold text-slate-500 uppercase block">Balance Before Grant</span>
                          <span className="font-black text-rose-600">
                            {formatCurrency(Math.max(0, (formBreakdownPreview.netTotalFee + formBreakdownPreview.waivedTuitionAmount) - formBreakdownPreview.amountPaid), currencySymbol)}
                          </span>
                        </div>
                        <div className="p-2 rounded-xl bg-white border border-amber-200/60 shadow-2xs">
                          <span className="text-[9px] font-bold text-slate-500 uppercase block">Current Status</span>
                          <span className="font-black uppercase text-[10px] text-slate-800">{selectedExistingStudentRecord.status}</span>
                        </div>
                      </div>
                    </div>
                  ) : formFullName ? (
                    <div className="p-2.5 bg-amber-100/70 border border-amber-300 rounded-xl flex items-center justify-between text-xs">
                      <div>
                        <span className="font-black text-amber-950">{formFullName}</span>
                        <span className="text-amber-800 text-[11px] ml-2">({formClass} • #{formStudentId})</span>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white text-amber-900 shadow-2xs">
                        Selected
                      </span>
                    </div>
                  ) : null}
                </div>
              ) : (
                /* New Student Input Fields */
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Student Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={formFullName}
                      onChange={(e) => setFormFullName(e.target.value)}
                      placeholder="e.g. Chukwuemeka Eze"
                      className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Student ID *
                    </label>
                    <input
                      type="text"
                      required
                      value={formStudentId}
                      onChange={(e) => setFormStudentId(e.target.value)}
                      placeholder="Enter Student ID manually"
                      className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono text-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Class, Term, Session */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Class</label>
                  <select
                    value={formClass}
                    onChange={(e) => setFormClass(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  >
                    {availableClasses.map((cls) => (
                      <option key={cls} value={cls}>
                        {cls}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Term</label>
                  <select
                    value={formTerm}
                    onChange={(e) => setFormTerm(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  >
                    <option value="First Term">First Term</option>
                    <option value="Second Term">Second Term</option>
                    <option value="Third Term">Third Term</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Session</label>
                  <input
                    type="text"
                    value={formSession}
                    onChange={(e) => setFormSession(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Step 2: Category & Details */}
              <div className="space-y-3 p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    Scholarship / Exemption Category
                  </label>
                  <select
                    value={formScholarshipType}
                    onChange={(e) => setFormScholarshipType(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  >
                    {SCHOLARSHIP_TYPE_PRESETS.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>

                  {formScholarshipType === 'Custom Exemption Type' && (
                    <input
                      type="text"
                      value={customScholarshipType}
                      onChange={(e) => setCustomScholarshipType(e.target.value)}
                      placeholder="Specify custom scholarship type..."
                      className="mt-2 w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                  )}
                </div>

                {/* Exemption Toggle */}
                <div className="p-3 bg-white rounded-xl border border-amber-200 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold text-slate-900 block">
                      Exempt School Fee Alone (100% Tuition Waiver)
                    </span>
                    <span className="text-[10px] text-slate-500">
                      Standard school policy: Tuition is ₦0; exam and lesson fees remain independently payable if applicable.
                    </span>
                  </div>
                  <input
                    type="checkbox"
                    checked={formExemptSchoolFee}
                    onChange={(e) => setFormExemptSchoolFee(e.target.checked)}
                    className="w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500 cursor-pointer"
                  />
                </div>

                {/* Awarded By & Award Date */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Awarded By / Granting Authority
                    </label>
                    <select
                      value={formAwardedBy}
                      onChange={(e) => setFormAwardedBy(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    >
                      {AWARDED_BY_PRESETS.map((ab) => (
                        <option key={ab} value={ab}>
                          {ab}
                        </option>
                      ))}
                      <option value="Custom">Other Authority...</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Date of Award
                    </label>
                    <input
                      type="date"
                      value={formAwardDate}
                      onChange={(e) => setFormAwardDate(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Notes / Justification */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Scholarship Notes / Exemption Justification
                  </label>
                  <textarea
                    rows={2}
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="e.g. Academic top ranker exemption, clergy child scholarship grant, approved by Proprietor."
                    className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Step 3: Real-time Fee Verification & Settings Synchronization */}
              <div className="space-y-3 p-4 bg-gradient-to-br from-slate-50 to-amber-50/30 rounded-2xl border border-amber-200/80">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-600" />
                    <span className="text-xs font-black text-slate-900">
                      Live Settings Fee Schedule ({formClass})
                    </span>
                  </div>
                  <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-200 px-2 py-0.5 rounded-full">
                    Synchronized with Settings
                  </span>
                </div>

                {/* Rates as configured in Settings */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="p-2 bg-white rounded-xl border border-slate-200/80">
                    <span className="text-[9px] font-bold text-slate-500 uppercase block">Configured Tuition</span>
                    <span className="font-bold text-slate-900">{formatCurrency(currentFormClassSchedule.tuitionFee, currencySymbol)}</span>
                  </div>
                  <div className="p-2 bg-white rounded-xl border border-slate-200/80">
                    <span className="text-[9px] font-bold text-slate-500 uppercase block">Lesson Fee (Term)</span>
                    <span className="font-bold text-slate-900">{formatCurrency(currentFormClassSchedule.lessonFeeTermly, currencySymbol)}</span>
                  </div>
                  <div className="p-2 bg-white rounded-xl border border-slate-200/80">
                    <span className="text-[9px] font-bold text-slate-500 uppercase block">Exam Fee</span>
                    <span className="font-bold text-slate-900">{formatCurrency(currentFormClassSchedule.examFee, currencySymbol)}</span>
                  </div>
                  <div className="p-2 bg-white rounded-xl border border-slate-200/80">
                    <span className="text-[9px] font-bold text-slate-500 uppercase block">Admission Fee</span>
                    <span className="font-bold text-slate-900">{formatCurrency(currentFormClassSchedule.admissionFee, currencySymbol)}</span>
                  </div>
                </div>

                {/* Calculation with Scholarship Applied */}
                <div className="p-3 bg-amber-500/10 rounded-xl border border-amber-300/80 space-y-2">
                  <div className="text-xs font-black text-amber-950 flex items-center justify-between">
                    <span>Fee Calculation with Scholarship Applied</span>
                    <span className="text-[11px] font-bold text-amber-800">
                      {formBreakdownPreview.waivedPct}% Tuition Exemption
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                    <div className="p-2 bg-white rounded-lg border border-amber-200">
                      <span className="text-[9px] font-bold text-slate-500 uppercase block">Tuition Waived</span>
                      <span className="font-black text-emerald-600">
                        -{formatCurrency(formBreakdownPreview.waivedTuitionAmount, currencySymbol)}
                      </span>
                    </div>
                    <div className="p-2 bg-white rounded-lg border border-amber-200">
                      <span className="text-[9px] font-bold text-slate-500 uppercase block">Total Net Fee</span>
                      <span className="font-black text-slate-900">
                        {formatCurrency(formBreakdownPreview.netTotalFee, currencySymbol)}
                      </span>
                    </div>
                    <div className="p-2 bg-white rounded-lg border border-amber-200">
                      <span className="text-[9px] font-bold text-slate-500 uppercase block">Amount Paid</span>
                      <span className="font-black text-emerald-600">
                        {formatCurrency(formBreakdownPreview.amountPaid, currencySymbol)}
                      </span>
                    </div>
                    <div className="p-2 bg-white rounded-lg border border-amber-200">
                      <span className="text-[9px] font-bold text-slate-500 uppercase block">Net Balance Due</span>
                      <span className={`font-black ${formBreakdownPreview.netBalance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {formatCurrency(formBreakdownPreview.netBalance, currencySymbol)}
                      </span>
                    </div>
                  </div>
                  <p className="text-[10px] text-amber-900/80 leading-relaxed font-medium">
                    {formBreakdownPreview.waivedPct >= 100 ? (
                      <>School tuition fee is completely waived (₦0.00). Only lesson, exam, and registration fees (if applicable) remain payable.</>
                    ) : (
                      <>Tuition fee is reduced by {formBreakdownPreview.waivedPct}%. Remaining tuition of {formatCurrency(formBreakdownPreview.netTuitionPayable, currencySymbol)} plus other applicable fees will be recorded.</>
                    )}
                  </p>
                </div>
              </div>

              {/* Form Action Controls */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setModalTab('list')}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 active:scale-95 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-amber-600/20 disabled:opacity-50 transition-all cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  <span>{isSubmitting ? 'Saving...' : 'Grant Scholarship & Save'}</span>
                </button>
              </div>
            </form>
          )}

          {/* ========================================================================= */}
          {/* VIEW 3: PRINTABLE SCHOLARSHIP REGISTER */}
          {/* ========================================================================= */}
          {modalTab === 'print' && (
            <div className="space-y-4">
              <div className="p-3 bg-slate-100 rounded-2xl flex items-center justify-between">
                <span className="text-xs text-slate-600 font-medium">
                  Official Printable Register of Scholarship Beneficiaries
                </span>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  <span>Print Document</span>
                </button>
              </div>

              {/* Printable Document Box */}
              <div className="p-6 bg-white border border-slate-300 rounded-2xl shadow-xs space-y-4 text-slate-900 font-sans print:border-none print:shadow-none">
                <div className="text-center border-b-2 border-slate-900 pb-3 space-y-1">
                  <h1 className="text-base sm:text-lg font-black uppercase tracking-wide">
                    {activeSchool?.name || 'DOMINION NURSERY & PRIMARY SCHOOL'}
                  </h1>
                  <p className="text-xs font-bold text-slate-700">
                    OFFICIAL SCHOLARSHIP & TUITION EXEMPTION REGISTER
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Academic Term: {selectedTerm} • Session: {selectedSession} • Generated: {getTodayDateString()}
                  </p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-300 bg-slate-50">
                        <th className="py-2 px-2 font-bold text-slate-900">S/N</th>
                        <th className="py-2 px-2 font-bold text-slate-900">Student ID</th>
                        <th className="py-2 px-2 font-bold text-slate-900">Student Name</th>
                        <th className="py-2 px-2 font-bold text-slate-900">Class</th>
                        <th className="py-2 px-2 font-bold text-slate-900">Grant Category</th>
                        <th className="py-2 px-2 font-bold text-slate-900">Exemption</th>
                        <th className="py-2 px-2 font-bold text-slate-900">Awarded By / Remarks</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 text-[11px]">
                      {unifiedBeneficiaries.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-4 text-center text-slate-400">
                            No scholarship beneficiaries registered.
                          </td>
                        </tr>
                      ) : (
                        unifiedBeneficiaries.map(({ student, scholarshipDetails }, idx) => (
                          <tr key={student.id} className="hover:bg-slate-50/60">
                            <td className="py-2 px-2 font-mono">{idx + 1}</td>
                            <td className="py-2 px-2 font-mono font-bold text-slate-700">#{student.id}</td>
                            <td className="py-2 px-2 font-bold text-slate-900">{student.full_name}</td>
                            <td className="py-2 px-2">{student.class}</td>
                            <td className="py-2 px-2">{scholarshipDetails?.scholarship_type || student.scholarship_notes || 'Full Tuition Exemption'}</td>
                            <td className="py-2 px-2 font-bold text-emerald-700">100% (₦0 Fee)</td>
                            <td className="py-2 px-2 text-slate-600">{scholarshipDetails?.awarded_by || student.scholarship_notes || 'Approved'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="pt-8 grid grid-cols-2 gap-8 text-center text-xs">
                  <div className="border-t border-slate-400 pt-1">
                    <p className="font-bold text-slate-900">Bursar / Accounts Officer</p>
                    <p className="text-[10px] text-slate-500">Signature & Date</p>
                  </div>
                  <div className="border-t border-slate-400 pt-1">
                    <p className="font-bold text-slate-900">Head Teacher / Principal</p>
                    <p className="text-[10px] text-slate-500">Approval & Stamp</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-3.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs">
          <span className="text-[11px] text-slate-500 flex items-center gap-1.5">
            <FileSpreadsheet className="w-3.5 h-3.5 text-slate-400" />
            <span>Synced with Google Sheet <strong>Scholarships</strong> tab</span>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>

        {/* In-Modal Revoke Confirmation Popup */}
        {studentToRevoke && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
            <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95 duration-150">
              <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
                <Award className="w-6 h-6" />
              </div>

              <div className="text-center space-y-1.5">
                <h3 className="text-base font-bold text-slate-900">Revoke Scholarship?</h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  Are you sure you want to revoke the scholarship for <strong className="text-slate-800">{studentToRevoke.full_name}</strong> (#{studentToRevoke.id})? Regular school fee billing will be immediately restored.
                </p>
              </div>

              {revokeError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 font-medium">
                  {revokeError}
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="button"
                  disabled={Boolean(deletingStudentId)}
                  onClick={() => {
                    setStudentToRevoke(null);
                    setRevokeError(null);
                  }}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={Boolean(deletingStudentId)}
                  onClick={handleConfirmRevoke}
                  className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-xs disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{deletingStudentId ? 'Revoking...' : 'Revoke Grant'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
