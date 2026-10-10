/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  X, 
  Edit3, 
  CreditCard, 
  Check, 
  AlertTriangle, 
  Calendar, 
  User, 
  Layers, 
  CalendarRange, 
  FileText,
  RotateCcw,
  CheckCircle2,
  BookOpen,
  FileCheck2,
  GraduationCap,
  Trash2,
  ShieldCheck,
  Calculator,
  RefreshCw,
  Undo2
} from 'lucide-react';
import { StudentPaymentRecord } from '../types';
import { StatusBadge } from './StatusBadge';
import { 
  calculateBalance, 
  calculateStatus, 
  formatCurrency, 
  formatDate,
  deriveFeeBreakdown,
  getClassFeeSchedule,
  isLessonDisabled,
  STANDARD_CLASSES,
  FEE_SCHEDULE
} from '../services/calculations';
import { getApplicableAdditionalFees } from '../services/schoolService';

interface StudentDetailsModalProps {
  student: StudentPaymentRecord | null;
  currencySymbol: string;
  isOpen: boolean;
  onClose: () => void;
  onRecordPaymentForStudent: (student: StudentPaymentRecord) => void;
  onSaveStudentEdits: (
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
  ) => Promise<void>;
  onDeleteStudent?: (id: string, student: StudentPaymentRecord) => Promise<void>;
  onUndoAllPayments?: (student: StudentPaymentRecord) => Promise<void>;
  activeSchool?: import('../types').SchoolProfile;
  onGrantScholarship?: (student: StudentPaymentRecord) => void;
  onRevokeScholarship?: (student: StudentPaymentRecord) => Promise<void>;
  onOpenAdditionalFees?: () => void;
}

export const StudentDetailsModal: React.FC<StudentDetailsModalProps> = ({
  student,
  currencySymbol,
  isOpen,
  onClose,
  onRecordPaymentForStudent,
  onSaveStudentEdits,
  onDeleteStudent,
  onUndoAllPayments,
  activeSchool,
  onGrantScholarship,
  onRevokeScholarship,
  onOpenAdditionalFees,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isDeletingConfirm, setIsDeletingConfirm] = useState(false);
  const [isUndoConfirm, setIsUndoConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Editable form state
  const [studentId, setStudentId] = useState(student?.id || '');
  const [fullName, setFullName] = useState(student?.full_name || '');
  const [studentClass, setStudentClass] = useState(student?.class || '');
  const [term, setTerm] = useState(student?.term || '');
  const [session, setSession] = useState(student?.session || '');
  const [feeAmount, setFeeAmount] = useState<string>(String(student?.fee_amount || 0));
  const [amountPaid, setAmountPaid] = useState<string>(String(student?.amount_paid || 0));
  const [receiptNo, setReceiptNo] = useState<string>(student?.receipt_no || '');
  const [isExemptFromSchoolFee, setIsExemptFromSchoolFee] = useState<boolean>(Boolean(student?.is_exempt_from_school_fee));
  const [scholarshipNotes, setScholarshipNotes] = useState<string>(student?.scholarship_notes || '');

  // Granular Fee States (Exam, Lesson, Tuition, Admission)
  const [examFee, setExamFee] = useState<string>('1500');
  const [examPaid, setExamPaid] = useState<string>('0');
  const [lessonFee, setLessonFee] = useState<string>('7000');
  const [lessonPaid, setLessonPaid] = useState<string>('0');
  const [lessonMonths, setLessonMonths] = useState<string>('');
  // Opt-out from after-school lessons: no lesson fee is charged to this student
  const [lessonDisabled, setLessonDisabled] = useState<boolean>(isLessonDisabled(student));
  const [tuitionFee, setTuitionFee] = useState<string>('0');
  const [tuitionPaid, setTuitionPaid] = useState<string>('0');
  const [admissionFee, setAdmissionFee] = useState<string>('0');
  const [admissionPaid, setAdmissionPaid] = useState<string>('0');
  const [activeFeeTab, setActiveFeeTab] = useState<'all' | 'exam' | 'lesson' | 'tuition' | 'admission'>('all');
  const [autoSyncTotals, setAutoSyncTotals] = useState<boolean>(true);

  // Ref to track last initialized student and open state
  const prevInitKeyRef = React.useRef<string>('');

  // Initialize/reset form ONLY when opening modal or switching to a different student
  useEffect(() => {
    if (student && isOpen) {
      const currentKey = `${student.id}_${student.term}_${student.session}`;
      
      // If modal just opened or switched to a different student, initialize form
      if (prevInitKeyRef.current !== currentKey) {
        prevInitKeyRef.current = currentKey;

        setStudentId(student.id || '');
        setFullName(student.full_name || '');
        setStudentClass(student.class || '');
        setTerm(student.term || '');
        setSession(student.session || '');
        setFeeAmount(String(student.fee_amount || 0));
        setAmountPaid(String(student.amount_paid || 0));
        setReceiptNo(student.receipt_no || '');
        setIsExemptFromSchoolFee(Boolean(student.is_exempt_from_school_fee));
        setScholarshipNotes(student.scholarship_notes || '');

        const bd = deriveFeeBreakdown(student, activeSchool);
        setExamFee(String(bd.examFee));
        setExamPaid(String(student.exam_paid !== undefined ? student.exam_paid : 0));
        setLessonFee(String(bd.lessonFee));
        setLessonPaid(String(student.lesson_paid !== undefined ? student.lesson_paid : 0));
        setLessonMonths(student.lesson_months || bd.lessonMonths || '');
        setLessonDisabled(bd.lessonDisabled);
        setTuitionFee(String(student.is_exempt_from_school_fee ? 0 : bd.tuitionFee));
        setTuitionPaid(String(student.tuition_paid !== undefined && student.tuition_paid !== null ? student.tuition_paid : bd.tuitionPaid));
        setAdmissionFee(String(bd.admissionFee));
        setAdmissionPaid(String(student.admission_paid !== undefined ? student.admission_paid : 0));

        setActiveFeeTab('all');
        setAutoSyncTotals(true);
        setFormError(null);
        setIsEditing(false);
        setIsConfirming(false);
        setIsDeletingConfirm(false);
        setIsUndoConfirm(false);
      }
    } else if (!isOpen) {
      prevInitKeyRef.current = '';
    }
  }, [student?.id, student?.term, student?.session, isOpen]);

  if (!isOpen || !student) return null;

  // Reset form when modal reopens or entering edit mode with specific tab
  const handleOpenEdit = (tab: 'all' | 'exam' | 'lesson' | 'tuition' | 'admission' = 'all') => {
    setStudentId(student.id || '');
    setFullName(student.full_name || '');
    setStudentClass(student.class || '');
    setTerm(student.term || '');
    setSession(student.session || '');
    setFeeAmount(String(student.fee_amount || 0));
    setAmountPaid(String(student.amount_paid || 0));
    setReceiptNo(student.receipt_no || '');
    setIsExemptFromSchoolFee(Boolean(student.is_exempt_from_school_fee));
    setScholarshipNotes(student.scholarship_notes || '');

    const bd = deriveFeeBreakdown(student, activeSchool);
    setExamFee(String(bd.examFee));
    setExamPaid(String(student.exam_paid !== undefined ? student.exam_paid : 0));
    setLessonFee(String(bd.lessonFee));
    setLessonPaid(String(student.lesson_paid !== undefined ? student.lesson_paid : 0));
    setLessonMonths(student.lesson_months || bd.lessonMonths || '');
    setLessonDisabled(bd.lessonDisabled);
    setTuitionFee(String(student.is_exempt_from_school_fee ? 0 : bd.tuitionFee));
    setTuitionPaid(String(student.tuition_paid !== undefined && student.tuition_paid !== null ? student.tuition_paid : bd.tuitionPaid));
    setAdmissionFee(String(bd.admissionFee));
    setAdmissionPaid(String(student.admission_paid !== undefined ? student.admission_paid : 0));

    setActiveFeeTab(tab);
    setFormError(null);
    setIsEditing(true);
    setIsDeletingConfirm(false);
    setIsUndoConfirm(false);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setIsConfirming(false);
    setFormError(null);
  };

  const handleDeleteClick = async () => {
    if (!onDeleteStudent) return;
    setIsSubmitting(true);
    setFormError(null);
    try {
      await onDeleteStudent(student.id, student);
      setIsDeletingConfirm(false);
      onClose();
    } catch (err: any) {
      setFormError(err.message || 'Failed to delete student.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUndoAllClick = async () => {
    if (!onUndoAllPayments) return;
    setIsSubmitting(true);
    setFormError(null);
    try {
      await onUndoAllPayments(student);
      setIsUndoConfirm(false);
    } catch (err: any) {
      setFormError(err.message || 'Failed to reset payments.');
      setIsUndoConfirm(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const receiptCount = Array.isArray(student.payment_history) ? student.payment_history.length : 0;
  const hasAnyPayment =
    Number(student.amount_paid || 0) > 0 ||
    receiptCount > 0 ||
    (student.additional_fees || []).some((f) => Number(f.amountPaid || 0) > 0);

  // Parsed Granular Values
  const parsedExamFee = Math.max(0, Number(examFee) || 0);
  const parsedExamPaid = Math.max(0, Number(examPaid) || 0);
  const parsedLessonFee = Math.max(0, Number(lessonFee) || 0);
  const parsedLessonPaid = Math.max(0, Number(lessonPaid) || 0);
  const parsedAdmissionFee = Math.max(0, Number(admissionFee) || 0);
  const parsedAdmissionPaid = Math.max(0, Number(admissionPaid) || 0);
  const parsedTuitionFee = isExemptFromSchoolFee ? 0 : Math.max(0, Number(tuitionFee) || 0);
  const parsedTuitionPaid = isExemptFromSchoolFee ? 0 : Math.max(0, Number(tuitionPaid) || 0);

  // Breakdown Calculated Totals
  const calculatedBreakdownTotalFee = parsedTuitionFee + parsedAdmissionFee + parsedLessonFee + parsedExamFee;
  const calculatedBreakdownTotalPaid = parsedTuitionPaid + parsedAdmissionPaid + parsedLessonPaid + parsedExamPaid;

  // Granular Updaters with Auto-sync to overall totals
  const handleUpdateExamFee = (val: string) => {
    setExamFee(val);
    if (autoSyncTotals) {
      const ef = Math.max(0, Number(val) || 0);
      setFeeAmount(String(parsedTuitionFee + parsedAdmissionFee + parsedLessonFee + ef));
    }
  };
  const handleUpdateExamPaid = (val: string) => {
    setExamPaid(val);
    if (autoSyncTotals) {
      const ep = Math.max(0, Number(val) || 0);
      setAmountPaid(String(parsedTuitionPaid + parsedAdmissionPaid + parsedLessonPaid + ep));
    }
  };
  const handleUpdateLessonFee = (val: string) => {
    setLessonFee(val);
    if (autoSyncTotals) {
      const lf = Math.max(0, Number(val) || 0);
      setFeeAmount(String(parsedTuitionFee + parsedAdmissionFee + lf + parsedExamFee));
    }
  };
  // Money already recorded for lessons blocks the opt-out, so a payment can never vanish from the books
  const hasLessonPayments =
    Number(student?.lesson_paid || 0) > 0 ||
    (Array.isArray(student?.payment_history) &&
      student!.payment_history!.some((h) => h?.feeCategory === 'lesson' && Number(h.amountPaidNow) > 0));

  const handleToggleLessonDisabled = (disabled: boolean) => {
    if (disabled && hasLessonPayments) return;
    setLessonDisabled(disabled);
    setFormError(null);
    if (disabled) {
      handleUpdateLessonFee('0');
      handleUpdateLessonPaid('0');
      setLessonMonths('');
    } else {
      const sched = getClassFeeSchedule(activeSchool, studentClass || student?.class || '');
      handleUpdateLessonFee(String(sched.lessonFeeTermly));
    }
  };
  const handleUpdateLessonPaid = (val: string) => {
    setLessonPaid(val);
    if (autoSyncTotals) {
      const lp = Math.max(0, Number(val) || 0);
      setAmountPaid(String(parsedTuitionPaid + parsedAdmissionPaid + lp + parsedExamPaid));
    }
  };
  const handleUpdateTuitionFee = (val: string) => {
    setTuitionFee(val);
    if (autoSyncTotals && !isExemptFromSchoolFee) {
      const tf = Math.max(0, Number(val) || 0);
      setFeeAmount(String(tf + parsedAdmissionFee + parsedLessonFee + parsedExamFee));
    }
  };
  const handleUpdateTuitionPaid = (val: string) => {
    setTuitionPaid(val);
    if (autoSyncTotals && !isExemptFromSchoolFee) {
      const tp = Math.max(0, Number(val) || 0);
      setAmountPaid(String(tp + parsedAdmissionPaid + parsedLessonPaid + parsedExamPaid));
    }
  };
  const handleUpdateAdmissionFee = (val: string) => {
    setAdmissionFee(val);
    if (autoSyncTotals) {
      const af = Math.max(0, Number(val) || 0);
      setFeeAmount(String(parsedTuitionFee + af + parsedLessonFee + parsedExamFee));
    }
  };
  const handleUpdateAdmissionPaid = (val: string) => {
    setAdmissionPaid(val);
    if (autoSyncTotals) {
      const ap = Math.max(0, Number(val) || 0);
      setAmountPaid(String(parsedTuitionPaid + ap + parsedLessonPaid + parsedExamPaid));
    }
  };
  const handleToggleExemption = (exempt: boolean) => {
    setIsExemptFromSchoolFee(exempt);
    if (autoSyncTotals) {
      const tf = exempt ? 0 : parsedTuitionFee;
      const tp = exempt ? 0 : parsedTuitionPaid;
      setFeeAmount(String(tf + parsedAdmissionFee + parsedLessonFee + parsedExamFee));
      setAmountPaid(String(tp + parsedAdmissionPaid + parsedLessonPaid + parsedExamPaid));
    }
  };

  const handleSyncTotalsFromBreakdown = () => {
    setFeeAmount(String(calculatedBreakdownTotalFee));
    setAmountPaid(String(calculatedBreakdownTotalPaid));
  };

  // Sync fees directly to rates configured in Settings for this student's class
  const handleApplyStandardClassRates = () => {
    const targetClass = studentClass || student?.class || '';
    const classSchedule = getClassFeeSchedule(activeSchool, targetClass);
    const newTuition = isExemptFromSchoolFee ? 0 : classSchedule.tuitionFee;
    const newExam = classSchedule.examFee;
    const newLesson = lessonDisabled ? 0 : classSchedule.lessonFeeTermly;
    const hasAdmission = Boolean(student?.is_new_admission) || parsedAdmissionFee > 0;
    const newAdmission = hasAdmission ? classSchedule.admissionFee : 0;

    setTuitionFee(String(newTuition));
    setExamFee(String(newExam));
    setLessonFee(String(newLesson));
    if (hasAdmission) {
      setAdmissionFee(String(newAdmission));
    }
    const newTotal = newTuition + newExam + newLesson + (hasAdmission ? newAdmission : 0);
    setFeeAmount(String(newTotal));
  };

  // Preview calculations for overall total
  const parsedFee = Math.max(0, Number(feeAmount) || 0);
  const parsedPaid = Math.max(0, Number(amountPaid) || 0);
  const previewBalance = calculateBalance(parsedFee, parsedPaid);
  const previewStatus = calculateStatus(parsedFee, parsedPaid);

  const validateAndProceedToConfirmation = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!studentId.trim()) {
      setFormError('Student ID cannot be empty.');
      return;
    }
    if (!fullName.trim()) {
      setFormError('Student name cannot be empty.');
      return;
    }
    if (isNaN(Number(feeAmount)) || Number(feeAmount) < 0) {
      setFormError('Fee amount must be a positive number.');
      return;
    }
    if (isNaN(Number(amountPaid)) || Number(amountPaid) < 0) {
      setFormError('Amount paid cannot be negative.');
      return;
    }
    if (isNaN(Number(examFee)) || Number(examFee) < 0) {
      setFormError('Exam fee must be a positive number.');
      return;
    }
    if (isNaN(Number(examPaid)) || Number(examPaid) < 0) {
      setFormError('Exam amount paid cannot be negative.');
      return;
    }
    if (isNaN(Number(lessonFee)) || Number(lessonFee) < 0) {
      setFormError('Lesson fee must be a positive number.');
      return;
    }
    if (isNaN(Number(lessonPaid)) || Number(lessonPaid) < 0) {
      setFormError('Lesson amount paid cannot be negative.');
      return;
    }
    if (parsedExamPaid > parsedExamFee) {
      setFormError(`Overpayment blocked: Exam Paid (${formatCurrency(parsedExamPaid, currencySymbol)}) cannot exceed Exam Fee (${formatCurrency(parsedExamFee, currencySymbol)}).`);
      return;
    }
    if (parsedLessonPaid > parsedLessonFee) {
      setFormError(`Overpayment blocked: Lesson Paid (${formatCurrency(parsedLessonPaid, currencySymbol)}) cannot exceed Lesson Fee (${formatCurrency(parsedLessonFee, currencySymbol)}).`);
      return;
    }
    if (!isExemptFromSchoolFee && parsedTuitionPaid > parsedTuitionFee) {
      setFormError(`Overpayment blocked: Tuition Paid (${formatCurrency(parsedTuitionPaid, currencySymbol)}) cannot exceed Tuition Fee (${formatCurrency(parsedTuitionFee, currencySymbol)}).`);
      return;
    }
    if (parsedAdmissionPaid > parsedAdmissionFee) {
      setFormError(`Overpayment blocked: Admission Paid (${formatCurrency(parsedAdmissionPaid, currencySymbol)}) cannot exceed Admission Fee (${formatCurrency(parsedAdmissionFee, currencySymbol)}).`);
      return;
    }
    if (parsedPaid > parsedFee) {
      setFormError(`Overpayment blocked: Total Amount Paid (${formatCurrency(parsedPaid, currencySymbol)}) cannot exceed Total Fee Amount (${formatCurrency(parsedFee, currencySymbol)}).`);
      return;
    }

    // Step 2: Show confirmation prompt as strictly required
    setIsConfirming(true);
  };

  const handleFinalSave = async () => {
    setIsSubmitting(true);
    setFormError(null);

    const finalFeeAmount = parsedFee;
    const finalAmountPaid = parsedPaid;
    const finalBalance = previewBalance;
    const finalStatus = previewStatus;

    try {
      await onSaveStudentEdits(
        student.id,
        {
          id: studentId.trim(),
          full_name: fullName.trim(),
          class: studentClass.trim(),
          term: term.trim(),
          session: session.trim(),
          fee_amount: finalFeeAmount,
          amount_paid: finalAmountPaid,
          balance: finalBalance,
          status: finalStatus,
          tuition_fee: parsedTuitionFee,
          tuition_paid: parsedTuitionPaid,
          tuition_status: isExemptFromSchoolFee ? 'fully_paid' : calculateStatus(parsedTuitionFee, parsedTuitionPaid),
          exam_fee: parsedExamFee,
          exam_paid: parsedExamPaid,
          exam_status: calculateStatus(parsedExamFee, parsedExamPaid),
          lesson_fee: lessonDisabled ? 0 : parsedLessonFee,
          lesson_paid: lessonDisabled ? 0 : parsedLessonPaid,
          lesson_status: lessonDisabled ? 'fully_paid' : calculateStatus(parsedLessonFee, parsedLessonPaid),
          lesson_months: lessonDisabled ? 'Not Enrolled' : lessonMonths.trim(),
          lesson_disabled: lessonDisabled,
          admission_fee: parsedAdmissionFee,
          admission_paid: parsedAdmissionPaid,
          admission_status: calculateStatus(parsedAdmissionFee, parsedAdmissionPaid),
          is_new_admission: parsedAdmissionFee > 0,
          is_exempt_from_school_fee: isExemptFromSchoolFee,
          scholarship_notes: scholarshipNotes.trim(),
          receipt_no: receiptNo.trim(),
        },
        student
      );
      setIsConfirming(false);
      setIsEditing(false);
    } catch (err: any) {
      setFormError(err.message || 'Failed to update student in database.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleScholarshipQuick = async () => {
    if (student.is_exempt_from_school_fee) {
      if (onRevokeScholarship) {
        setIsSubmitting(true);
        setFormError(null);
        try {
          await onRevokeScholarship(student);
        } catch (err: any) {
          setFormError(err.message || 'Failed to revoke scholarship.');
        } finally {
          setIsSubmitting(false);
        }
        return;
      }
    } else {
      if (onGrantScholarship) {
        onGrantScholarship(student);
        return;
      }
    }

    // Fallback if callbacks not provided directly
    setIsSubmitting(true);
    setFormError(null);
    const newExempt = !student.is_exempt_from_school_fee;
    const classSchedule = getClassFeeSchedule(activeSchool, student.class);
    const standardTuition = student.tuition_fee > 0 ? student.tuition_fee : classSchedule.tuitionFee;
    const admissionFee = Number(student.admission_fee || 0);
    const lessonFee = Number(student.lesson_fee || 0);
    const examFee = Number(student.exam_fee || 0);
    const newTuition = newExempt ? 0 : standardTuition;
    const newTotalFee = newTuition + admissionFee + lessonFee + examFee;
    const newBalance = newExempt && student.amount_paid >= newTotalFee ? 0 : calculateBalance(newTotalFee, student.amount_paid);
    const newStatus = newExempt && newTotalFee === 0 ? 'fully_paid' : calculateStatus(newTotalFee, student.amount_paid);

    try {
      await onSaveStudentEdits(
        student.id,
        {
          ...student,
          is_exempt_from_school_fee: newExempt,
          tuition_fee: newTuition,
          fee_amount: newTotalFee,
          balance: newBalance,
          status: newStatus,
          tuition_status: newExempt ? 'fully_paid' : (student.tuition_status || 'unpaid'),
        },
        student
      );
    } catch (err: any) {
      setFormError(err.message || 'Failed to update scholarship status.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50">
      <div className="w-full max-w-md sm:max-w-xl bg-white rounded-t-[28px] sm:rounded-3xl max-h-[88dvh] sm:max-h-[92dvh] flex flex-col shadow-2xl border border-[#f0f0f0] overflow-hidden animate-in slide-in-from-bottom duration-200">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-5 py-4 sm:px-6 sm:py-5 border-b border-[#f0f0f0] bg-white sticky top-0 z-10">
          <div>
            <span className="text-[10px] font-mono font-bold text-[#a0a0a0] uppercase tracking-wider">
              #{student.id}
            </span>
            <h2 className="text-lg font-black text-[#1a1a1a] uppercase leading-snug truncate max-w-[260px] sm:max-w-md">
              {student.full_name}
            </h2>
          </div>
          <button
            onClick={onClose}
            id="close-student-modal-btn"
            className="w-9 h-9 rounded-full bg-[#f4f4f7] text-[#1a1a1a] hover:bg-slate-200 flex items-center justify-center transition-colors border border-[#eee]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1 min-h-0">
          {formError && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-900 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          {/* Mode 1: Confirmation Step View */}
          {isDeletingConfirm ? (
            <div className="space-y-4 bg-rose-50/80 p-5 rounded-3xl border border-rose-200 animate-in fade-in duration-150">
              <div className="flex items-center gap-2 text-rose-950 font-black text-sm uppercase tracking-tight">
                <Trash2 className="w-5 h-5 text-rose-600 shrink-0" />
                <span>Delete Student Record</span>
              </div>
              <p className="text-xs text-rose-900 leading-relaxed font-medium">
                Are you sure you want to permanently remove <strong className="font-bold text-rose-950 font-sans">{student.full_name}</strong> (<span className="font-mono">#{student.id}</span>)?
              </p>
              <div className="p-3 bg-white/90 rounded-2xl border border-rose-200/80 text-[11px] text-rose-900 space-y-1">
                <p className="font-semibold">• This will remove the student from your active roster.</p>
                <p className="font-semibold">• The student will be permanently deleted from Cloud Firestore.</p>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setIsDeletingConfirm(false)}
                  className="py-3 px-4 rounded-2xl bg-white text-[#1a1a1a] text-xs font-bold hover:bg-slate-100 active:scale-95 transition-all border border-rose-200"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleDeleteClick}
                  id="confirm-delete-student-btn"
                  className="py-3 px-4 rounded-2xl bg-rose-600 text-white text-xs font-black hover:bg-rose-700 active:scale-95 transition-all flex items-center justify-center gap-1.5 shadow-md shadow-rose-600/20 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <span>Deleting...</span>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Yes, Delete</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : isUndoConfirm ? (
            <div className="space-y-4 bg-rose-50/80 p-5 rounded-3xl border border-rose-200 animate-in fade-in duration-150">
              <div className="flex items-center gap-2 text-rose-950 font-black text-sm uppercase tracking-tight">
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
                <span>Undo All Payments</span>
              </div>
              <p className="text-xs text-rose-900 leading-relaxed font-medium">
                You are about to reset every payment for <strong className="font-bold text-rose-950">{student.full_name}</strong> (<span className="font-mono">#{student.id}</span>) to {currencySymbol}0.
              </p>
              <div className="p-3 bg-white/90 rounded-2xl border border-rose-200/80 text-[11px] text-rose-900 space-y-1">
                <p className="font-semibold">• Total paid goes from {formatCurrency(student.amount_paid, currencySymbol)} to {formatCurrency(0, currencySymbol)}.</p>
                <p className="font-semibold">• Admission, tuition, lesson, exam and additional fee payments are all cleared.</p>
                <p className="font-semibold">• {receiptCount > 0 ? `${receiptCount} saved receipt${receiptCount === 1 ? '' : 's'} will be removed from this student's history.` : 'Receipt numbers and the last payment date are cleared.'}</p>
                <p className="font-semibold">• Fee amounts and scholarship status stay the same. The balance becomes {formatCurrency(student.fee_amount, currencySymbol)}.</p>
                <p className="font-bold text-rose-700">• This cannot be undone from the app.</p>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setIsUndoConfirm(false)}
                  className="py-3 px-4 rounded-2xl bg-white text-[#1a1a1a] text-xs font-bold hover:bg-slate-100 active:scale-95 transition-all border border-rose-200"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleUndoAllClick}
                  id="confirm-undo-all-payments-btn"
                  className="py-3 px-4 rounded-2xl bg-rose-600 text-white text-xs font-black hover:bg-rose-700 active:scale-95 transition-all flex items-center justify-center gap-1.5 shadow-md shadow-rose-600/20 disabled:opacity-50"
                >
                  {isSubmitting ? (
                    <span>Resetting...</span>
                  ) : (
                    <>
                      <Undo2 className="w-3.5 h-3.5" />
                      <span>Yes, Reset to {currencySymbol}0</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : isConfirming ? (
            <div className="space-y-4 bg-[#f4f4f7] p-5 rounded-3xl border border-[#eee]">
              <div className="flex items-center gap-2 text-[#1a1a1a] font-black text-xs uppercase tracking-tight">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>Confirm Changes to Database</span>
              </div>
              <p className="text-xs text-[#666] leading-relaxed">
                Please verify the adjusted values before saving to Cloud Firestore:
              </p>

              <div className="space-y-2 text-xs bg-white p-4 rounded-2xl border border-[#eee] font-mono">
                {student.id !== studentId.trim() && (
                  <div className="flex justify-between py-1 border-b border-[#f0f0f0]">
                    <span className="text-[#a0a0a0]">Student ID:</span>
                    <span className="font-bold text-[#1a1a1a]">
                      #{student.id} → <span className="text-[#2563eb] font-black">#{studentId.trim()}</span>
                    </span>
                  </div>
                )}
                <div className="flex justify-between py-1 border-b border-[#f0f0f0]">
                  <span className="text-[#a0a0a0]">Student:</span>
                  <span className="font-bold text-[#1a1a1a]">{fullName}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#f0f0f0]">
                  <span className="text-[#a0a0a0]">Exam Fee / Paid:</span>
                  <span className="font-bold text-[#1a1a1a]">
                    {formatCurrency(student.exam_fee ?? 1000, currencySymbol)} / {formatCurrency(student.exam_paid ?? 0, currencySymbol)} →{' '}
                    <span className="text-[#2563eb] font-black">{formatCurrency(parsedExamFee, currencySymbol)} / {formatCurrency(parsedExamPaid, currencySymbol)}</span>
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#f0f0f0]">
                  <span className="text-[#a0a0a0]">Lesson Fee / Paid:</span>
                  <span className="font-bold text-[#1a1a1a]">
                    {formatCurrency(student.lesson_fee ?? parsedLessonFee, currencySymbol)} / {formatCurrency(student.lesson_paid ?? 0, currencySymbol)} →{' '}
                    <span className="text-[#2563eb] font-black">{formatCurrency(parsedLessonFee, currencySymbol)} / {formatCurrency(parsedLessonPaid, currencySymbol)}</span>
                    {lessonMonths ? ` (${lessonMonths})` : ''}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#f0f0f0]">
                  <span className="text-[#a0a0a0]">School Fee (Tuition):</span>
                  <span className="font-bold text-[#1a1a1a]">
                    {isExemptFromSchoolFee ? '₦0.00 (Scholarship Exempt)' : `${formatCurrency(parsedTuitionFee, currencySymbol)} (Paid: ${formatCurrency(parsedTuitionPaid, currencySymbol)})`}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#f0f0f0]">
                  <span className="text-[#a0a0a0]">Admission Fee / Paid:</span>
                  <span className="font-bold text-[#1a1a1a]">
                    {formatCurrency(parsedAdmissionFee, currencySymbol)} / {formatCurrency(parsedAdmissionPaid, currencySymbol)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#f0f0f0]">
                  <span className="text-[#a0a0a0]">Total Fee:</span>
                  <span className="font-bold text-[#1a1a1a]">
                    {formatCurrency(student.fee_amount, currencySymbol)} →{' '}
                    <span className="text-[#2563eb] font-black">{formatCurrency(parsedFee, currencySymbol)}</span>
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#f0f0f0]">
                  <span className="text-[#a0a0a0]">Total Amount Paid:</span>
                  <span className="font-bold text-[#1a1a1a]">
                    {formatCurrency(student.amount_paid, currencySymbol)} →{' '}
                    <span className="text-[#10b981] font-black">{formatCurrency(parsedPaid, currencySymbol)}</span>
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#f0f0f0]">
                  <span className="text-[#a0a0a0]">Recalculated Balance:</span>
                  <span className="font-black text-[#1a1a1a]">
                    {formatCurrency(previewBalance, currencySymbol)}
                  </span>
                </div>
                <div className="flex justify-between py-1 items-center">
                  <span className="text-[#a0a0a0]">Recalculated Status:</span>
                  <StatusBadge status={previewStatus} size="sm" />
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsConfirming(false)}
                  disabled={isSubmitting}
                  id="back-to-edit-btn"
                  className="flex-1 py-3 px-3 rounded-2xl bg-white border border-[#eee] text-[#1a1a1a] text-xs font-bold hover:bg-slate-50"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleFinalSave}
                  disabled={isSubmitting}
                  id="confirm-save-student-edits-btn"
                  className="flex-1 py-3 px-3 rounded-2xl bg-[#2563eb] text-white text-xs font-black hover:bg-blue-700 flex items-center justify-center gap-1.5 shadow-md shadow-blue-500/20"
                >
                  {isSubmitting ? (
                    <span>Writing to Sheet...</span>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Confirm & Save</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : isEditing ? (
            /* Mode 2: Comprehensive Edit Form */
            <form onSubmit={validateAndProceedToConfirmation} className="space-y-4">
              {/* Basic Student Information */}
              <div className="bg-[#f9f9fb] p-4 rounded-3xl border border-[#eee] space-y-3">
                <h3 className="text-[11px] font-black text-slate-800 uppercase tracking-wider">
                  1. Student Identity & Enrollment
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="sm:col-span-1">
                    <label className="block text-[10px] font-black text-[#a0a0a0] uppercase tracking-wider mb-1">
                      Student ID
                    </label>
                    <input
                      type="text"
                      required
                      id="edit-student-id"
                      value={studentId}
                      onChange={(e) => setStudentId(e.target.value)}
                      placeholder="e.g. DNPS/0170"
                      className="w-full px-3 py-2.5 text-xs font-mono font-bold bg-white rounded-2xl border border-slate-200 text-[#1a1a1a] focus:ring-2 focus:ring-[#2563eb] focus:outline-none"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[10px] font-black text-[#a0a0a0] uppercase tracking-wider mb-1">
                      Full Name
                    </label>
                    <input
                      type="text"
                      required
                      id="edit-student-fullname"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className="w-full px-4 py-2.5 text-sm bg-white rounded-2xl border border-slate-200 text-[#1a1a1a] focus:ring-2 focus:ring-[#2563eb] focus:outline-none font-bold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="block text-[10px] font-black text-[#a0a0a0] uppercase tracking-wider mb-1">
                      Class
                    </label>
                    <input
                      type="text"
                      id="edit-student-class"
                      list="standard-classes-list-edit"
                      value={studentClass}
                      onChange={(e) => setStudentClass(e.target.value)}
                      placeholder="e.g. Primary 1"
                      className="w-full px-3 py-2.5 text-xs bg-white rounded-2xl border border-slate-200 text-[#1a1a1a] focus:ring-2 focus:ring-[#2563eb] focus:outline-none font-medium"
                    />
                    <datalist id="standard-classes-list-edit">
                      {(activeSchool?.classes && activeSchool.classes.length > 0 ? activeSchool.classes : STANDARD_CLASSES).map((cls) => (
                        <option key={cls} value={cls} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-[#a0a0a0] uppercase tracking-wider mb-1">
                      Term
                    </label>
                    <input
                      type="text"
                      id="edit-student-term"
                      value={term}
                      onChange={(e) => setTerm(e.target.value)}
                      placeholder="e.g. 1st Term"
                      className="w-full px-3 py-2.5 text-xs bg-white rounded-2xl border border-slate-200 text-[#1a1a1a] focus:ring-2 focus:ring-[#2563eb] focus:outline-none font-medium"
                    />
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <label className="block text-[10px] font-black text-[#a0a0a0] uppercase tracking-wider mb-1">
                      Session
                    </label>
                    <input
                      type="text"
                      id="edit-student-session"
                      value={session}
                      onChange={(e) => setSession(e.target.value)}
                      placeholder="e.g. 2025/2026"
                      className="w-full px-3 py-2.5 text-xs bg-white rounded-2xl border border-slate-200 text-[#1a1a1a] focus:ring-2 focus:ring-[#2563eb] focus:outline-none font-medium"
                    />
                  </div>
                </div>
              </div>

              {/* Granular Fees Navigation Filter */}
              <div className="space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h3 className="text-[11px] font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Calculator className="w-3.5 h-3.5 text-[#2563eb]" />
                    <span>2. Fee Breakdown & Payment Editor</span>
                  </h3>
                  <button
                    type="button"
                    onClick={handleApplyStandardClassRates}
                    className="px-2.5 py-1 rounded-xl bg-purple-100 hover:bg-purple-200 text-purple-900 border border-purple-300 text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-all active:scale-95"
                    title="Load standard rates configured in Settings for this student's class"
                  >
                    <span>⚡ Load {studentClass || student.class || 'Class'} Rates from Settings</span>
                  </button>
                </div>

                <div className="flex items-center gap-1 overflow-x-auto pb-1 no-scrollbar">
                  {[
                    { id: 'all', label: 'All Fees' },
                    { id: 'exam', label: 'Exam Fee', icon: FileCheck2 },
                    { id: 'lesson', label: 'Lesson Fee', icon: BookOpen },
                    { id: 'tuition', label: 'School Fee', icon: GraduationCap },
                    { id: 'admission', label: 'Admission Fee', icon: ShieldCheck },
                  ].map((tab) => {
                    const Icon = tab.icon;
                    const isActive = activeFeeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveFeeTab(tab.id as any)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap flex items-center gap-1.5 transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-[#2563eb] text-white shadow-xs'
                            : 'bg-[#f4f4f7] text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {Icon && <Icon className="w-3 h-3" />}
                        <span>{tab.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 1. EXAM FEE SECTION */}
              {(activeFeeTab === 'all' || activeFeeTab === 'exam') && (
                <div className="bg-blue-50/60 rounded-3xl p-4 border border-blue-200/80 space-y-3 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-xl bg-blue-100 flex items-center justify-center text-[#2563eb]">
                        <FileCheck2 className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-blue-950 uppercase tracking-tight">Exam Fee</h4>
                        <p className="text-[10px] text-blue-700">Termly examination charge</p>
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                      parsedExamFee > 0 && parsedExamPaid >= parsedExamFee
                        ? 'bg-emerald-100 text-emerald-800'
                        : parsedExamPaid > 0
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}>
                      {parsedExamFee > 0 && parsedExamPaid >= parsedExamFee
                        ? 'Paid ✓'
                        : parsedExamPaid > 0
                        ? `Part (${formatCurrency(parsedExamPaid, currencySymbol)})`
                        : 'Unpaid'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-black text-blue-900 uppercase tracking-wider mb-1">
                        Exam Fee ({currencySymbol})
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        id="edit-student-exam-fee"
                        value={examFee}
                        onChange={(e) => handleUpdateExamFee(e.target.value)}
                        className="w-full px-3 py-2 text-xs font-bold bg-white rounded-2xl border border-blue-200 text-[#1a1a1a] focus:ring-2 focus:ring-[#2563eb] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-blue-900 uppercase tracking-wider mb-1">
                        Exam Paid ({currencySymbol})
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        id="edit-student-exam-paid"
                        value={examPaid}
                        onChange={(e) => handleUpdateExamPaid(e.target.value)}
                        className="w-full px-3 py-2 text-xs font-bold bg-white rounded-2xl border border-blue-200 text-[#1a1a1a] focus:ring-2 focus:ring-[#2563eb] focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Quick Preset Buttons for Exam Fee */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[10px]">
                    <span className="text-blue-800 font-bold">Quick Presets:</span>
                    <button
                      type="button"
                      onClick={() => handleUpdateExamPaid(examFee)}
                      className="px-2 py-1 rounded-lg bg-white hover:bg-blue-100 border border-blue-200 font-bold text-blue-950 transition-colors"
                    >
                      ✓ Mark Full Paid
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateExamPaid('0')}
                      className="px-2 py-1 rounded-lg bg-white hover:bg-blue-100 border border-blue-200 font-bold text-slate-700 transition-colors"
                    >
                      Reset Unpaid
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateExamFee('1000')}
                      className="px-2 py-1 rounded-lg bg-white hover:bg-blue-100 border border-blue-200 font-bold text-blue-950 transition-colors"
                    >
                      Standard ₦1,000
                    </button>
                  </div>
                </div>
              )}

              {/* 2. LESSON FEE SECTION */}
              {(activeFeeTab === 'all' || activeFeeTab === 'lesson') && (
                <div className="bg-emerald-50/60 rounded-3xl p-4 border border-emerald-200/80 space-y-3 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-700">
                        <BookOpen className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-emerald-950 uppercase tracking-tight">Lesson Fee</h4>
                        <p className="text-[10px] text-emerald-700">Termly (₦6,000) or Monthly (₦2,000/mo)</p>
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                      lessonDisabled
                        ? 'bg-slate-200 text-slate-700'
                        : parsedLessonFee > 0 && parsedLessonPaid >= parsedLessonFee
                        ? 'bg-emerald-200 text-emerald-900'
                        : parsedLessonPaid > 0
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-rose-100 text-rose-800'
                    }`}>
                      {lessonDisabled
                        ? 'Disabled'
                        : parsedLessonFee > 0 && parsedLessonPaid >= parsedLessonFee
                        ? 'Paid ✓'
                        : parsedLessonPaid > 0
                        ? `Part (${formatCurrency(parsedLessonPaid, currencySymbol)})`
                        : 'Unpaid'}
                    </span>
                  </div>

                  {/* Opt-out: student does not attend after-school lessons */}
                  <label
                    htmlFor="edit-student-lesson-disabled"
                    className={`flex items-start gap-2.5 p-3 rounded-2xl border bg-white ${
                      hasLessonPayments && !lessonDisabled ? 'border-emerald-100 opacity-70' : 'border-emerald-200 cursor-pointer'
                    }`}
                  >
                    <input
                      type="checkbox"
                      id="edit-student-lesson-disabled"
                      checked={lessonDisabled}
                      disabled={hasLessonPayments && !lessonDisabled}
                      onChange={(e) => handleToggleLessonDisabled(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded accent-emerald-600"
                    />
                    <span className="text-[11px] leading-snug">
                      <span className="block font-black text-emerald-950">Disable lesson fee for this student</span>
                      <span className="block text-emerald-800">
                        {hasLessonPayments && !lessonDisabled
                          ? 'Not available: a lesson payment is already recorded for this student.'
                          : lessonDisabled
                          ? 'Not attending lessons. No lesson fee is charged and it is hidden from payments.'
                          : 'Use this for students who will not attend after-school lessons.'}
                      </span>
                    </span>
                  </label>

                  {!lessonDisabled && (
                  <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-black text-emerald-900 uppercase tracking-wider mb-1">
                        Lesson Fee ({currencySymbol})
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        id="edit-student-lesson-fee"
                        value={lessonFee}
                        onChange={(e) => handleUpdateLessonFee(e.target.value)}
                        className="w-full px-3 py-2 text-xs font-bold bg-white rounded-2xl border border-emerald-200 text-[#1a1a1a] focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-emerald-900 uppercase tracking-wider mb-1">
                        Lesson Paid ({currencySymbol})
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        id="edit-student-lesson-paid"
                        value={lessonPaid}
                        onChange={(e) => handleUpdateLessonPaid(e.target.value)}
                        className="w-full px-3 py-2 text-xs font-bold bg-white rounded-2xl border border-emerald-200 text-[#1a1a1a] focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                      />
                    </div>
                  </div>

                  {/* Months Covered input & quick chips */}
                  <div>
                    <label className="block text-[10px] font-black text-emerald-900 uppercase tracking-wider mb-1">
                      Months Covered
                    </label>
                    <input
                      type="text"
                      id="edit-student-lesson-months"
                      value={lessonMonths}
                      onChange={(e) => setLessonMonths(e.target.value)}
                      placeholder="e.g. Termly (Paid), Sept, Oct, Nov"
                      className="w-full px-3 py-2 text-xs bg-white rounded-2xl border border-emerald-200 text-[#1a1a1a] focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                    />

                    <div className="flex flex-wrap gap-1 mt-2">
                      {['Termly (Paid)', 'Sept', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'June', 'July'].map((m) => {
                        const isSelected = lessonMonths.toLowerCase().includes(m.toLowerCase());
                        return (
                          <button
                            key={m}
                            type="button"
                            onClick={() => {
                              if (m === 'Termly (Paid)') {
                                setLessonMonths('Termly (Paid)');
                              } else {
                                const currentParts = lessonMonths ? lessonMonths.split(',').map(p => p.trim()).filter(Boolean) : [];
                                const newParts = currentParts.includes(m)
                                  ? currentParts.filter(p => p !== m)
                                  : [...currentParts.filter(p => p !== 'Termly (Paid)'), m];
                                setLessonMonths(newParts.join(', '));
                              }
                            }}
                            className={`px-2 py-0.5 rounded-lg text-[10px] font-bold transition-all ${
                              isSelected
                                ? 'bg-emerald-600 text-white shadow-2xs'
                                : 'bg-white text-emerald-900 border border-emerald-200 hover:bg-emerald-100'
                            }`}
                          >
                            {m}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Quick Preset Buttons for Lesson Fee */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[10px]">
                    <span className="text-emerald-900 font-bold">Quick Presets:</span>
                    <button
                      type="button"
                      onClick={() => {
                        handleUpdateLessonPaid(lessonFee);
                        if (!lessonMonths) setLessonMonths('Termly (Paid)');
                      }}
                      className="px-2 py-1 rounded-lg bg-white hover:bg-emerald-100 border border-emerald-200 font-bold text-emerald-950 transition-colors"
                    >
                      ✓ Mark Full Paid
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleUpdateLessonPaid('0');
                        setLessonMonths('');
                      }}
                      className="px-2 py-1 rounded-lg bg-white hover:bg-emerald-100 border border-emerald-200 font-bold text-slate-700 transition-colors"
                    >
                      Reset Unpaid
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateLessonFee('6000')}
                      className="px-2 py-1 rounded-lg bg-white hover:bg-emerald-100 border border-emerald-200 font-bold text-emerald-950 transition-colors"
                    >
                      Termly ₦6,000
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateLessonFee('2000')}
                      className="px-2 py-1 rounded-lg bg-white hover:bg-emerald-100 border border-emerald-200 font-bold text-emerald-950 transition-colors"
                    >
                      Monthly ₦2,000
                    </button>
                  </div>
                  </>
                  )}
                </div>
              )}

              {/* 3. TUITION / SCHOOL FEE SECTION */}
              {(activeFeeTab === 'all' || activeFeeTab === 'tuition') && (
                <div className="bg-purple-50/60 rounded-3xl p-4 border border-purple-200/80 space-y-3 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-xl bg-purple-100 flex items-center justify-center text-purple-700">
                        <GraduationCap className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-purple-950 uppercase tracking-tight">School Fee (Tuition)</h4>
                        <p className="text-[10px] text-purple-700">Core academic instructional fee</p>
                      </div>
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                      isExemptFromSchoolFee
                        ? 'bg-amber-100 text-amber-900'
                        : parsedTuitionFee > 0 && parsedTuitionPaid >= parsedTuitionFee
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-100 text-slate-800'
                    }`}>
                      {isExemptFromSchoolFee ? 'Scholarship (₦0)' : (parsedTuitionPaid >= parsedTuitionFee ? 'Paid ✓' : 'Active')}
                    </span>
                  </div>

                  {/* Scholarship Exemption Toggle */}
                  <div className="p-3 rounded-2xl bg-white border border-purple-200 space-y-2">
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        id="edit-student-scholarship-toggle"
                        checked={isExemptFromSchoolFee}
                        onChange={(e) => handleToggleExemption(e.target.checked)}
                        className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-amber-300"
                      />
                      <span className="text-xs font-black text-amber-950 flex items-center gap-1.5">
                        <span>⭐ Student on Scholarship (Exempt from School Fee Alone)</span>
                      </span>
                    </label>
                    <p className="text-[11px] text-amber-900 leading-snug">
                      When enabled, tuition fee is automatically set to {currencySymbol}0. Student pays only other fees (admission, lesson, exam).
                    </p>
                    {isExemptFromSchoolFee && (
                      <input
                        type="text"
                        id="edit-student-scholarship-notes"
                        value={scholarshipNotes}
                        onChange={(e) => setScholarshipNotes(e.target.value)}
                        placeholder="Optional scholarship notes (e.g. Merit Award, Need-based)"
                        className="w-full px-3 py-1.5 text-xs bg-amber-50/50 rounded-xl border border-amber-200 text-amber-950 focus:ring-2 focus:ring-amber-500 focus:outline-none placeholder:text-amber-400"
                      />
                    )}
                  </div>

                  {!isExemptFromSchoolFee && (
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-black text-purple-900 uppercase tracking-wider mb-1">
                          Tuition Fee ({currencySymbol})
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          id="edit-student-tuition-fee"
                          value={tuitionFee}
                          onChange={(e) => handleUpdateTuitionFee(e.target.value)}
                          className="w-full px-3 py-2 text-xs font-bold bg-white rounded-2xl border border-purple-200 text-[#1a1a1a] focus:ring-2 focus:ring-purple-600 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-purple-900 uppercase tracking-wider mb-1">
                          Tuition Paid ({currencySymbol})
                        </label>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          id="edit-student-tuition-paid"
                          value={tuitionPaid}
                          onChange={(e) => handleUpdateTuitionPaid(e.target.value)}
                          className="w-full px-3 py-2 text-xs font-bold bg-white rounded-2xl border border-purple-200 text-[#1a1a1a] focus:ring-2 focus:ring-purple-600 focus:outline-none"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* 4. ADMISSION FEE SECTION */}
              {(activeFeeTab === 'all' || activeFeeTab === 'admission') && (
                <div className="bg-slate-50 rounded-3xl p-4 border border-slate-200 space-y-3 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-xl bg-slate-200 flex items-center justify-center text-slate-700">
                        <ShieldCheck className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-slate-900 uppercase tracking-tight">Admission Fee</h4>
                        <p className="text-[10px] text-slate-500">New intake registration charge</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold text-slate-500">
                      {parsedAdmissionFee > 0 ? (parsedAdmissionPaid >= parsedAdmissionFee ? 'Paid ✓' : 'Pending') : 'None'}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-black text-slate-700 uppercase tracking-wider mb-1">
                        Admission Fee ({currencySymbol})
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        id="edit-student-admission-fee"
                        value={admissionFee}
                        onChange={(e) => handleUpdateAdmissionFee(e.target.value)}
                        className="w-full px-3 py-2 text-xs font-bold bg-white rounded-2xl border border-slate-200 text-[#1a1a1a] focus:ring-2 focus:ring-slate-600 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-700 uppercase tracking-wider mb-1">
                        Admission Paid ({currencySymbol})
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        id="edit-student-admission-paid"
                        value={admissionPaid}
                        onChange={(e) => handleUpdateAdmissionPaid(e.target.value)}
                        className="w-full px-3 py-2 text-xs font-bold bg-white rounded-2xl border border-slate-200 text-[#1a1a1a] focus:ring-2 focus:ring-slate-600 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[10px]">
                    <button
                      type="button"
                      onClick={() => handleUpdateAdmissionPaid(admissionFee)}
                      className="px-2 py-1 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 font-bold text-slate-700"
                    >
                      ✓ Mark Full Paid
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        handleUpdateAdmissionFee('0');
                        handleUpdateAdmissionPaid('0');
                      }}
                      className="px-2 py-1 rounded-lg bg-white hover:bg-slate-100 border border-slate-200 font-bold text-slate-700"
                    >
                      Clear (₦0)
                    </button>
                  </div>
                </div>
              )}

              {/* 5. OVERALL TOTALS & SYNC CONTROLS */}
              <div className="bg-[#f4f4f7] rounded-3xl p-4 border border-[#eee] space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-tight">
                    3. Overall Totals & Official Receipt
                  </h4>
                  <button
                    type="button"
                    onClick={handleSyncTotalsFromBreakdown}
                    id="sync-totals-btn"
                    className="px-2.5 py-1 rounded-xl bg-white hover:bg-slate-100 border border-slate-300 text-[10px] font-bold text-[#2563eb] flex items-center gap-1 transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Sync from Breakdown</span>
                  </button>
                </div>

                <div className="flex items-center justify-between text-[11px] p-2 bg-white rounded-xl border border-slate-200">
                  <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
                    <input
                      type="checkbox"
                      checked={autoSyncTotals}
                      onChange={(e) => setAutoSyncTotals(e.target.checked)}
                      className="w-3.5 h-3.5 rounded text-[#2563eb]"
                    />
                    <span>Auto-update overall totals when editing granular fees</span>
                  </label>
                  <span className="text-[10px] font-mono font-bold text-slate-500">
                    Breakdown Sum: {formatCurrency(calculatedBreakdownTotalFee, currencySymbol)}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-black text-[#a0a0a0] uppercase tracking-wider mb-1">
                      Total Fee Amount ({currencySymbol})
                    </label>
                    <input
                      type="number"
                      required
                      min="0"
                      step="any"
                      id="edit-student-fee-amount"
                      value={feeAmount}
                      onChange={(e) => setFeeAmount(e.target.value)}
                      className="w-full px-4 py-2.5 text-sm font-bold bg-white rounded-2xl border border-slate-200 text-[#1a1a1a] focus:ring-2 focus:ring-[#2563eb] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-[#a0a0a0] uppercase tracking-wider mb-1">
                      Total Amount Paid ({currencySymbol})
                    </label>
                    <input
                      type="number"
                      required
                      min="0"
                      step="any"
                      id="edit-student-amount-paid"
                      value={amountPaid}
                      onChange={(e) => setAmountPaid(e.target.value)}
                      className="w-full px-4 py-2.5 text-sm font-bold bg-white rounded-2xl border border-slate-200 text-[#1a1a1a] focus:ring-2 focus:ring-[#2563eb] focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black text-[#a0a0a0] uppercase tracking-wider mb-1">
                    Receipt No. (Official / Physical Slip)
                  </label>
                  <input
                    type="text"
                    id="edit-student-receipt-no"
                    value={receiptNo}
                    onChange={(e) => setReceiptNo(e.target.value)}
                    placeholder="e.g. REC-2026-0042 or Booklet No."
                    className="w-full px-4 py-2 text-xs font-mono bg-white rounded-2xl border border-slate-200 text-[#1a1a1a] focus:ring-2 focus:ring-[#2563eb] focus:outline-none"
                  />
                </div>

                {/* Real-time Calculated Balance & Status Preview */}
                <div className="bg-white p-3 rounded-2xl border border-slate-200 flex items-center justify-between text-xs">
                  <div>
                    <p className="text-[10px] text-[#a0a0a0] font-bold uppercase">Calculated Balance</p>
                    <p className="font-black text-[#1a1a1a] text-sm">
                      {formatCurrency(previewBalance, currencySymbol)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-[#a0a0a0] font-bold uppercase mb-1">Calculated Status</p>
                    <StatusBadge status={previewStatus} size="sm" />
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-2 sticky bottom-0 bg-white/95 backdrop-blur-xs py-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  id="cancel-edit-mode-btn"
                  className="flex-1 py-3 px-3 rounded-2xl bg-[#f4f4f7] text-[#1a1a1a] text-xs font-bold hover:bg-slate-200 border border-[#eee]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  id="review-changes-btn"
                  className="flex-1 py-3 px-3 rounded-2xl bg-[#2563eb] text-white text-xs font-black hover:bg-blue-700 shadow-md shadow-blue-500/20"
                >
                  Review & Confirm
                </button>
              </div>
            </form>
          ) : (
            /* Mode 3: Detailed View */
            <div className="space-y-4">
              {/* Financial Highlight Card */}
              <div className="p-5 bg-[#2563eb] rounded-[28px] text-white space-y-3 shadow-lg shadow-blue-500/20">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] text-white/80 font-bold uppercase tracking-wider">
                    Total Payment Status
                  </span>
                  <StatusBadge status={student.status} size="md" />
                </div>
                <div className="grid grid-cols-3 gap-2 text-center pt-2 border-t border-white/20">
                  <div className="text-left">
                    <p className="text-[9px] text-white/80 uppercase font-bold">Total Fee</p>
                    <p className="text-sm font-black text-white mt-0.5 truncate">
                      {formatCurrency(student.fee_amount, currencySymbol)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] text-white/80 uppercase font-bold">Total Paid</p>
                    <p className="text-sm font-black text-emerald-200 mt-0.5 truncate">
                      {formatCurrency(student.amount_paid, currencySymbol)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[9px] text-white/80 uppercase font-bold">Balance</p>
                    <p
                      className={`text-sm font-black mt-0.5 truncate ${
                        student.balance > 0 ? 'text-amber-200' : 'text-white'
                      }`}
                    >
                      {formatCurrency(student.balance, currencySymbol)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Scholarship Exemption Info Banner */}
              <div className={`p-4 rounded-3xl border flex items-center justify-between gap-3 ${
                student.is_exempt_from_school_fee 
                  ? 'bg-amber-50/90 border-amber-300 text-amber-950'
                  : 'bg-slate-50 border-slate-200 text-slate-700'
              }`}>
                <div className="space-y-0.5 min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black uppercase tracking-tight flex items-center gap-1">
                      <span>⭐ Scholarship / Fee Exemption</span>
                    </span>
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                      student.is_exempt_from_school_fee 
                        ? 'bg-amber-200 text-amber-900' 
                        : 'bg-slate-200 text-slate-600'
                    }`}>
                      {student.is_exempt_from_school_fee ? 'Active (Exempt Tuition)' : 'Regular (No Exemption)'}
                    </span>
                  </div>
                  <p className="text-[11px] leading-relaxed opacity-90">
                    {student.is_exempt_from_school_fee 
                      ? `Exempt from School Fee (${currencySymbol}0). Student pays only other fees (admission, lesson, exam).`
                      : `Standard tuition applied. Toggle to exempt student from school fee alone.`}
                  </p>
                  {student.scholarship_notes && (
                    <p className="text-[10px] font-medium italic text-amber-900 mt-1">
                      Note: {student.scholarship_notes}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleToggleScholarshipQuick}
                  id="toggle-scholarship-quick-btn"
                  className={`shrink-0 px-3 py-2 rounded-2xl text-xs font-black active:scale-95 transition-all shadow-xs ${
                    student.is_exempt_from_school_fee
                      ? 'bg-amber-200 hover:bg-amber-300 text-amber-950'
                      : 'bg-white hover:bg-slate-100 text-slate-800 border border-slate-300'
                  }`}
                >
                  {student.is_exempt_from_school_fee ? 'Remove Exemption' : 'Grant Scholarship'}
                </button>
              </div>

              {/* All Fees Breakdown Status Cards */}
              {(() => {
                const breakdown = deriveFeeBreakdown(student, activeSchool);
                return (
                  <div className="bg-white rounded-3xl p-4 border border-[#eee] space-y-3 shadow-xs">
                    <div className="flex items-center justify-between">
                      <h4 className="text-[10px] font-black text-[#a0a0a0] uppercase tracking-wider">
                        Fee Breakdown Status
                      </h4>
                      <button
                        type="button"
                        onClick={() => handleOpenEdit('all')}
                        className="text-[10px] font-bold text-[#2563eb] hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <Edit3 className="w-3 h-3" />
                        <span>Edit Breakdown</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      {/* Admission Card */}
                      <div className="p-3 rounded-2xl bg-[#f4f4f7] border border-[#eee] space-y-1">
                        <div className="flex items-center justify-between text-[#666]">
                          <span className="text-[10px] font-bold uppercase">Admission</span>
                          <button
                            type="button"
                            onClick={() => handleOpenEdit('admission')}
                            title="Edit Admission Fee"
                            className="text-[10px] font-bold text-[#2563eb] hover:underline flex items-center gap-0.5 cursor-pointer"
                          >
                            <Edit3 className="w-2.5 h-2.5" />
                            <span>Edit</span>
                          </button>
                        </div>
                        <p className="text-sm font-black text-[#1a1a1a]">
                          {formatCurrency(
                            breakdown.admissionFee > 0 
                              ? breakdown.admissionFee 
                              : (student.admission_fee ?? (student.is_new_admission ? getClassFeeSchedule(activeSchool, student.class).admissionFee : 0)), 
                            currencySymbol
                          )}
                        </p>
                        <div className="flex items-center justify-between pt-1 border-t border-[#eee] text-[10px]">
                          <span className="text-[#a0a0a0]">Paid: {formatCurrency(breakdown.admissionPaid, currencySymbol)}</span>
                          <StatusBadge status={breakdown.admissionStatus} size="sm" />
                        </div>
                      </div>

                      {/* Tuition Card */}
                      <div className="p-3 rounded-2xl bg-[#f4f4f7] border border-[#eee] space-y-1">
                        <div className="flex items-center justify-between text-[#666]">
                          <span className="text-[10px] font-bold uppercase">Tuition Fee</span>
                          <button
                            type="button"
                            onClick={() => handleOpenEdit('tuition')}
                            title="Edit School Fee"
                            className="text-[10px] font-bold text-[#2563eb] hover:underline flex items-center gap-0.5 cursor-pointer"
                          >
                            <Edit3 className="w-2.5 h-2.5" />
                            <span>Edit</span>
                          </button>
                        </div>
                        <p className="text-sm font-black text-[#1a1a1a]">
                          {formatCurrency(breakdown.tuitionFee, currencySymbol)}
                        </p>
                        <div className="flex items-center justify-between pt-1 border-t border-[#eee] text-[10px]">
                          <span className="text-[#a0a0a0]">Paid: {formatCurrency(breakdown.tuitionPaid, currencySymbol)}</span>
                          <StatusBadge status={breakdown.tuitionStatus} size="sm" />
                        </div>
                      </div>

                      {/* Lesson Fee Card */}
                      <div className="p-3 rounded-2xl bg-[#f4f4f7] border border-[#eee] space-y-1">
                        <div className="flex items-center justify-between text-[#666]">
                          <span className="text-[10px] font-bold uppercase">Lesson Fee</span>
                          <button
                            type="button"
                            onClick={() => handleOpenEdit('lesson')}
                            title="Edit Lesson Fee"
                            className="text-[10px] font-bold text-[#2563eb] hover:underline flex items-center gap-0.5 cursor-pointer"
                          >
                            <Edit3 className="w-2.5 h-2.5" />
                            <span>Edit</span>
                          </button>
                        </div>
                        <p className="text-sm font-black text-[#1a1a1a]">
                          {breakdown.lessonDisabled ? 'Disabled' : formatCurrency(breakdown.lessonFee, currencySymbol)}
                        </p>
                        <div className="flex items-center justify-between pt-1 border-t border-[#eee] text-[10px]">
                          <span className="font-bold text-[#2563eb] truncate">{breakdown.lessonMonths}</span>
                          <span className="text-[#a0a0a0]">Paid: {formatCurrency(breakdown.lessonPaid, currencySymbol)}</span>
                        </div>
                      </div>

                      {/* Exam Fee Card */}
                      <div className="p-3 rounded-2xl bg-[#f4f4f7] border border-[#eee] space-y-1">
                        <div className="flex items-center justify-between text-[#666]">
                          <span className="text-[10px] font-bold uppercase">Exam Fee</span>
                          <button
                            type="button"
                            onClick={() => handleOpenEdit('exam')}
                            title="Edit Exam Fee"
                            className="text-[10px] font-bold text-[#2563eb] hover:underline flex items-center gap-0.5 cursor-pointer"
                          >
                            <Edit3 className="w-2.5 h-2.5" />
                            <span>Edit</span>
                          </button>
                        </div>
                        <p className="text-sm font-black text-[#1a1a1a]">
                          {formatCurrency(breakdown.examFee, currencySymbol)}
                        </p>
                        <div className="flex items-center justify-between pt-1 border-t border-[#eee] text-[10px]">
                          <span className="text-[#a0a0a0]">Paid: {formatCurrency(breakdown.examPaid, currencySymbol)}</span>
                          <span className={`px-2 py-0.5 rounded-full font-bold text-[9px] ${
                            breakdown.examStatus === 'fully_paid' && breakdown.examPaid >= breakdown.examFee && breakdown.examFee > 0
                              ? 'bg-emerald-100 text-emerald-800'
                              : breakdown.examPaid > 0
                              ? 'bg-amber-100 text-amber-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}>
                            {breakdown.examStatus === 'fully_paid' && breakdown.examPaid >= breakdown.examFee && breakdown.examFee > 0
                              ? 'Paid ✓'
                              : breakdown.examPaid > 0
                              ? `Part (${formatCurrency(breakdown.examPaid, currencySymbol)})`
                              : 'Unpaid ✗'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Additional & Ancillary Fees Section */}
              {(() => {
                const relevantSchoolFees = activeSchool ? getApplicableAdditionalFees(activeSchool, student.class, student.term) : [];
                const studentFees = student.additional_fees || [];

                if (relevantSchoolFees.length === 0 && studentFees.length === 0) {
                  return null;
                }

                // Collect combined fee items
                const feeItems: Array<{
                  id: string;
                  name: string;
                  category: string;
                  amount: number;
                  paidAmount: number;
                  balance: number;
                  status: string;
                }> = relevantSchoolFees.map((sf) => {
                  const matchingRecords = studentFees.filter(
                    (f) => f.feeId === sf.id || f.name.trim().toLowerCase() === sf.name.trim().toLowerCase()
                  );
                  const amount = Math.max(0, Number(sf.amount) || 0);
                  const paidAmount = matchingRecords.reduce((sum, f) => sum + (Number(f.amountPaid) || 0), 0);
                  const balance = Math.max(0, amount - paidAmount);
                  const status = amount > 0 ? calculateStatus(amount, paidAmount) : 'fully_paid';
                  return {
                    id: sf.id,
                    name: sf.name,
                    category: sf.category || 'other',
                    amount,
                    paidAmount,
                    balance,
                    status,
                  };
                });

                // Also include any custom student fees that might not be in relevantSchoolFees
                studentFees.forEach((stFee) => {
                  if (!feeItems.some((fi) => fi.id === stFee.feeId || fi.name.trim().toLowerCase() === stFee.name.trim().toLowerCase())) {
                    // Check if this matches a fee in activeSchool that is disabled
                    const matchedSchoolFee = activeSchool?.additionalFees?.find(
                      (sf) => sf.id === stFee.feeId || sf.name.trim().toLowerCase() === stFee.name.trim().toLowerCase()
                    );
                    if (matchedSchoolFee && matchedSchoolFee.enabled === false) {
                      // If student hasn't paid anything towards this disabled fee, do not show it
                      if ((Number(stFee.amountPaid) || 0) <= 0) return;
                      // If paid, show as fully paid with 0 balance
                      feeItems.push({
                        id: stFee.feeId,
                        name: stFee.name,
                        category: 'other',
                        amount: Number(stFee.amountPaid) || 0,
                        paidAmount: Number(stFee.amountPaid) || 0,
                        balance: 0,
                        status: 'fully_paid',
                      });
                      return;
                    }

                    const amount = stFee.amount;
                    const paidAmount = stFee.amountPaid || 0;
                    const balance = Math.max(0, amount - paidAmount);
                    feeItems.push({
                      id: stFee.feeId,
                      name: stFee.name,
                      category: 'other',
                      amount,
                      paidAmount,
                      balance,
                      status: stFee.status,
                    });
                  }
                });

                const totalAdditionalFee = feeItems.reduce((acc, curr) => acc + curr.amount, 0);
                const totalAdditionalPaid = feeItems.reduce((acc, curr) => acc + curr.paidAmount, 0);
                const totalAdditionalDue = Math.max(0, totalAdditionalFee - totalAdditionalPaid);

                return (
                  <div className="bg-white rounded-3xl p-4 border border-[#eee] space-y-3 shadow-xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-[#2563eb]" />
                        <h4 className="text-[10px] font-black text-[#a0a0a0] uppercase tracking-wider">
                          Additional & Ancillary Fees ({feeItems.length})
                        </h4>
                      </div>
                      {onOpenAdditionalFees && (
                        <button
                          type="button"
                          onClick={() => {
                            onClose();
                            onOpenAdditionalFees();
                          }}
                          className="text-[10px] font-bold text-[#2563eb] hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <Edit3 className="w-2.5 h-2.5" />
                          <span>Manage Fees</span>
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {feeItems.map((item) => (
                        <div key={item.id} className="p-3 rounded-2xl bg-[#f4f4f7] border border-[#eee] space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="font-black text-slate-800 truncate text-xs">{item.name}</span>
                            <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full uppercase bg-blue-100 text-blue-800">
                              {item.category}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-[#666]">Fee:</span>
                            <span className="font-bold text-[#1a1a1a]">{formatCurrency(item.amount, currencySymbol)}</span>
                          </div>
                          <div className="flex items-center justify-between pt-1 border-t border-[#eee] text-[10px]">
                            <span className="text-[#a0a0a0]">Paid: {formatCurrency(item.paidAmount, currencySymbol)}</span>
                            <StatusBadge status={item.status as any} size="sm" />
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="flex items-center justify-between pt-1 text-[11px] text-[#666] font-semibold">
                      <span>Total Ancillary: {formatCurrency(totalAdditionalFee, currencySymbol)} (Paid: {formatCurrency(totalAdditionalPaid, currencySymbol)})</span>
                      <span className={totalAdditionalDue > 0 ? 'text-amber-700 font-bold' : 'text-emerald-700 font-bold'}>
                        {totalAdditionalDue > 0 ? `Due: ${formatCurrency(totalAdditionalDue, currencySymbol)}` : 'Cleared ✓'}
                      </span>
                    </div>
                  </div>
                );
              })()}

              {/* Exact Google Sheet Fields Breakdown */}
              <div className="bg-[#f4f4f7] rounded-3xl p-5 border border-[#eee] space-y-2 text-xs">
                <div className="flex items-center justify-between mb-1">
                  <h4 className="text-[10px] font-black text-[#a0a0a0] uppercase tracking-wider">
                    Google Sheet Real-Time Columns
                  </h4>
                  <span className="text-[9px] font-bold text-[#2563eb] bg-blue-50 px-2 py-0.5 rounded-full border border-blue-100">
                    Auto-Synced
                  </span>
                </div>

                <div className="flex justify-between py-1 border-b border-[#eee]">
                  <span className="text-[#666]">Student ID:</span>
                  <span className="font-mono font-bold text-[#1a1a1a]">#{student.id}</span>
                </div>

                <div className="flex justify-between py-1 border-b border-[#eee]">
                  <span className="text-[#666]">Full Name:</span>
                  <span className="font-bold text-[#1a1a1a]">{student.full_name}</span>
                </div>

                <div className="flex justify-between py-1 border-b border-[#eee]">
                  <span className="text-[#666]">Class & Term:</span>
                  <span className="font-bold text-[#1a1a1a]">{student.class || '—'} • {student.term || '—'}</span>
                </div>

                <div className="flex justify-between py-1 border-b border-[#eee]">
                  <span className="text-[#666]">Admission Fee / Paid:</span>
                  <span className="font-bold text-[#1a1a1a]">
                    {formatCurrency(student.admission_fee ?? (student.is_new_admission ? getClassFeeSchedule(activeSchool, student.class).admissionFee : 0), currencySymbol)} / {formatCurrency(student.admission_paid ?? 0, currencySymbol)}
                  </span>
                </div>

                <div className="flex justify-between py-1 border-b border-[#eee]">
                  <span className="text-[#666]">Lesson Fee / Paid:</span>
                  <span className="font-bold text-[#1a1a1a]">
                    {formatCurrency(student.lesson_fee ?? getClassFeeSchedule(activeSchool, student.class).lessonFeeTermly, currencySymbol)} / {formatCurrency(student.lesson_paid ?? 0, currencySymbol)}
                    {student.lesson_months ? ` (${student.lesson_months})` : ' (Full Term)'}
                  </span>
                </div>

                <div className="flex justify-between py-1 border-b border-[#eee]">
                  <span className="text-[#666]">Exam Fee / Paid:</span>
                  <span className="font-bold text-[#1a1a1a]">
                    {formatCurrency(student.exam_fee ?? getClassFeeSchedule(activeSchool, student.class).examFee, currencySymbol)} / {formatCurrency(student.exam_paid ?? 0, currencySymbol)}
                  </span>
                </div>

                <div className="flex justify-between py-1 border-b border-[#eee]">
                  <span className="text-[#666]">Total Due / Total Paid:</span>
                  <span className="font-bold text-[#1a1a1a]">
                    {formatCurrency(student.fee_amount, currencySymbol)} / {formatCurrency(student.amount_paid, currencySymbol)}
                  </span>
                </div>

                <div className="flex justify-between py-1 border-b border-[#eee]">
                  <span className="text-[#666]">Last Payment Date:</span>
                  <span className="font-bold text-[#1a1a1a]">
                    {student.payment_date ? formatDate(student.payment_date) : 'No payment recorded'}
                  </span>
                </div>

                <div className="flex justify-between py-1 border-b border-[#eee]">
                  <span className="text-[#666]">Receipt No (School Fee):</span>
                  <span className={`font-mono font-bold ${student.receipt_no ? 'text-[#2563eb]' : 'text-[#888]'}`}>
                    {student.receipt_no || '—'}
                  </span>
                </div>

                <div className="flex justify-between py-1">
                  <span className="text-[#666]">Overall Status:</span>
                  <span className="font-mono font-bold text-[#1a1a1a]">{student.status}</span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2 pt-1">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenEdit('all')}
                    id="edit-student-record-btn"
                    className="py-3 px-3 rounded-2xl bg-[#f4f4f7] text-[#1a1a1a] text-xs font-bold hover:bg-slate-200 active:scale-95 flex items-center justify-center gap-1.5 transition-all border border-[#eee]"
                  >
                    <Edit3 className="w-4 h-4" />
                    <span>Edit Record</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onRecordPaymentForStudent(student);
                    }}
                    id="record-payment-for-this-student-btn"
                    className="py-3 px-3 rounded-2xl bg-[#2563eb] text-white text-xs font-black hover:bg-blue-700 active:scale-95 flex items-center justify-center gap-1.5 shadow-md shadow-blue-500/20 transition-all"
                  >
                    <CreditCard className="w-4 h-4" />
                    <span>Record Payment</span>
                  </button>
                </div>

                {onUndoAllPayments && (
                  <button
                    type="button"
                    disabled={!hasAnyPayment}
                    onClick={() => setIsUndoConfirm(true)}
                    id="open-undo-all-payments-prompt-btn"
                    className="w-full py-2.5 px-3 rounded-2xl bg-amber-50 text-amber-800 hover:bg-amber-100 hover:text-amber-950 active:scale-95 text-xs font-bold flex items-center justify-center gap-1.5 transition-all border border-amber-200/80 disabled:opacity-40 disabled:pointer-events-none"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    <span>Undo All Payments</span>
                  </button>
                )}

                {onDeleteStudent && (
                  <button
                    type="button"
                    onClick={() => setIsDeletingConfirm(true)}
                    id="open-delete-student-prompt-btn"
                    className="w-full py-2.5 px-3 rounded-2xl bg-rose-50 text-rose-700 hover:bg-rose-100 hover:text-rose-900 active:scale-95 text-xs font-bold flex items-center justify-center gap-1.5 transition-all border border-rose-200/60"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Student Record</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
