/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  UserPlus, 
  Receipt, 
  ShieldCheck, 
  CheckCircle2, 
  AlertCircle, 
  BookOpen, 
  Award, 
  GraduationCap, 
  Printer, 
  ArrowRight,
  RotateCcw,
  Sparkles,
  Layers,
  Calendar
} from 'lucide-react';
import { StudentPaymentRecord, PaymentReceipt } from '../types';
import { 
  FEE_SCHEDULE, 
  formatCurrency, 
  calculateBalance, 
  calculateStatus, 
  getTodayDateString,
  getClassFeeSchedule,
  generateNextStudentId,
  getCurrentAcademicSession
} from '../services/calculations';

interface AdmissionViewProps {
  currencySymbol: string;
  existingCount: number;
  students?: StudentPaymentRecord[];
  onAddStudent: (student: StudentPaymentRecord) => Promise<void> | void;
  onBack?: () => void;
  onViewStudent?: (student: StudentPaymentRecord) => void;
  activeSchool?: import('../types').SchoolProfile;
}

const DEFAULT_FALLBACK_CLASSES = [
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

const TERM_OPTIONS = ['First Term', 'Second Term', 'Third Term'];

export const AdmissionView: React.FC<AdmissionViewProps> = ({
  currencySymbol,
  existingCount,
  students,
  onAddStudent,
  onBack,
  onViewStudent,
  activeSchool,
}) => {
  const classOptions = activeSchool?.classes && activeSchool.classes.length > 0
    ? activeSchool.classes
    : DEFAULT_FALLBACK_CLASSES;

  const initialClass = classOptions[0] || 'Primary 1';
  const initialSchedule = getClassFeeSchedule(activeSchool, initialClass);

  const [studentId, setStudentId] = useState<string>('');
  const [fullName, setFullName] = useState('');
  const [studentClass, setStudentClass] = useState(initialClass);
  const [term, setTerm] = useState('First Term');
  const [session, setSession] = useState(activeSchool?.academicSession || getCurrentAcademicSession());

  // Admission Fee
  const [admissionFee, setAdmissionFee] = useState<string>(String(initialSchedule.admissionFee));
  const [admissionPaid, setAdmissionPaid] = useState<string>(String(initialSchedule.admissionFee));

  // Exam Fee
  const [examFee, setExamFee] = useState<string>(String(initialSchedule.examFee));
  const [examPaid, setExamPaid] = useState<string>(String(initialSchedule.examFee));

  // School Fee (Tuition)
  const [schoolFee, setSchoolFee] = useState<string>(String(initialSchedule.tuitionFee));
  const [schoolPaid, setSchoolPaid] = useState<string>(String(initialSchedule.tuitionFee));

  // Lesson Fee (Compulsory - Auto Enrolled)
  const [lessonOption, setLessonOption] = useState<'1_month' | '2_months' | 'termly' | 'custom'>('termly');
  const [lessonFeeCustom, setLessonFeeCustom] = useState<string>(String(initialSchedule.lessonFeeTermly ?? 6000));
  const [lessonPaid, setLessonPaid] = useState<string>(String(initialSchedule.lessonFeeTermly ?? 6000));

  const handleClassChange = (newClass: string) => {
    setStudentClass(newClass);
    const sched = getClassFeeSchedule(activeSchool, newClass);
    setAdmissionFee(String(sched.admissionFee));
    setAdmissionPaid(String(sched.admissionFee));
    setExamFee(String(sched.examFee));
    setExamPaid(String(sched.examFee));
    setSchoolFee(String(sched.tuitionFee));
    setSchoolPaid(String(sched.tuitionFee));
    if (lessonOption === '1_month') {
      setLessonFeeCustom(String(sched.lessonFeeMonthly));
      setLessonPaid(String(sched.lessonFeeMonthly));
    } else if (lessonOption === '2_months') {
      setLessonFeeCustom(String(sched.lessonFeeMonthly * 2));
      setLessonPaid(String(sched.lessonFeeMonthly * 2));
    } else if (lessonOption === 'termly') {
      setLessonFeeCustom(String(sched.lessonFeeTermly));
      setLessonPaid(String(sched.lessonFeeTermly));
    }
  };

  const schoolSessionSetting = activeSchool?.academicSession || getCurrentAcademicSession();
  React.useEffect(() => {
    setSession(schoolSessionSetting);
  }, [schoolSessionSetting]);

  const lastSchoolIdRef = React.useRef<string | undefined>(activeSchool?.id);
  const feeScheduleKey = JSON.stringify(activeSchool?.feeSchedule || {}) + JSON.stringify(activeSchool?.classFeeSchedules || {});

  // Update defaults when activeSchool or fee schedule changes in Settings
  React.useEffect(() => {
    const isDifferentSchool = lastSchoolIdRef.current !== activeSchool?.id;
    if (isDifferentSchool) {
      lastSchoolIdRef.current = activeSchool?.id;
      setStudentId('');
      setFullName('');
      setReceiptNo('');
      setHasAgreedPayment(false);
      setErrorMessage(null);
    }

    // Always refresh fee values to match the latest Settings if user has not entered a custom amount
    const cls = studentClass || (activeSchool?.classes && activeSchool.classes.length > 0 ? activeSchool.classes[0] : (classOptions[0] || 'Primary 1'));
    const sched = getClassFeeSchedule(activeSchool, cls);
    setAdmissionFee(String(sched.admissionFee));
    setAdmissionPaid(String(sched.admissionFee));
    setExamFee(String(sched.examFee));
    setExamPaid(String(sched.examFee));
    setSchoolFee(String(sched.tuitionFee));
    setSchoolPaid(String(sched.tuitionFee));
    if (lessonOption === 'termly') {
      setLessonFeeCustom(String(sched.lessonFeeTermly));
      setLessonPaid(String(sched.lessonFeeTermly));
    } else if (lessonOption === '1_month') {
      setLessonFeeCustom(String(sched.lessonFeeMonthly));
      setLessonPaid(String(sched.lessonFeeMonthly));
    } else if (lessonOption === '2_months') {
      setLessonFeeCustom(String(sched.lessonFeeMonthly * 2));
      setLessonPaid(String(sched.lessonFeeMonthly * 2));
    }
  }, [activeSchool?.id, feeScheduleKey]);

  // Receipt & Payment Agreement
  const [receiptNo, setReceiptNo] = useState<string>('');
  const [hasAgreedPayment, setHasAgreedPayment] = useState<boolean>(false);
  const [admissionFeeEnabled, setAdmissionFeeEnabled] = useState<boolean>(true);
  const [examFeeEnabled, setExamFeeEnabled] = useState<boolean>(true);
  const [schoolFeeEnabled, setSchoolFeeEnabled] = useState<boolean>(true);
  const [lessonFeeEnabled, setLessonFeeEnabled] = useState<boolean>(true);
  const [expandedFeeCard, setExpandedFeeCard] = useState<'admission' | 'exam' | 'school' | 'lesson' | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [enrolledStudent, setEnrolledStudent] = useState<StudentPaymentRecord | null>(null);

  // Derived values
  const currentFeeSchedule = getClassFeeSchedule(activeSchool, studentClass);
  const numAdmissionFee = Math.max(0, Number(admissionFee) || 0);
  const numAdmissionPaid = Math.max(0, Number(admissionPaid) || 0);

  const numExamFee = Math.max(0, Number(examFee) || 0);
  const numExamPaid = Math.max(0, Number(examPaid) || 0);

  const numSchoolFee = Math.max(0, Number(schoolFee) || 0);
  const numSchoolPaid = Math.max(0, Number(schoolPaid) || 0);

  let numLessonFee = currentFeeSchedule.lessonFeeTermly;
  if (lessonOption === '1_month') numLessonFee = currentFeeSchedule.lessonFeeMonthly;
  else if (lessonOption === '2_months') numLessonFee = currentFeeSchedule.lessonFeeMonthly * 2;
  else if (lessonOption === 'termly') numLessonFee = currentFeeSchedule.lessonFeeTermly;
  else if (lessonOption === 'custom') numLessonFee = Math.max(0, Number(lessonFeeCustom) || 0);

  const numLessonPaid = Math.max(0, Number(lessonPaid) || 0);

  // Effective values respect the enabled checkboxes — unchecked fees contribute 0
  const effectiveAdmissionPaid = admissionFeeEnabled ? numAdmissionPaid : 0;
  const effectiveExamFee = examFeeEnabled ? numExamFee : 0;
  const effectiveExamPaid = examFeeEnabled ? numExamPaid : 0;
  const effectiveSchoolFee = schoolFeeEnabled ? numSchoolFee : 0;
  const effectiveSchoolPaid = schoolFeeEnabled ? numSchoolPaid : 0;
  const effectiveLessonFee = lessonFeeEnabled ? numLessonFee : 0;
  const effectiveLessonPaid = lessonFeeEnabled ? numLessonPaid : 0;

  // Grand Total Fee Calculation
  const grandTotalFee = effectiveSchoolFee + numAdmissionFee + effectiveExamFee + effectiveLessonFee;
  const grandTotalPaid = effectiveSchoolPaid + effectiveAdmissionPaid + effectiveExamPaid + effectiveLessonPaid;
  const grandTotalBalance = Math.max(0, grandTotalFee - grandTotalPaid);

  const resetForm = () => {
    setFullName('');
    setStudentClass(classOptions[0] || 'Primary 1');
    setTerm('First Term');
    setSession(activeSchool?.academicSession || getCurrentAcademicSession());
    setAdmissionFee(String(currentFeeSchedule.admissionFee));
    setAdmissionPaid(String(currentFeeSchedule.admissionFee));
    setExamFee(String(currentFeeSchedule.examFee));
    setExamPaid(String(currentFeeSchedule.examFee));
    setSchoolFee(String(currentFeeSchedule.tuitionFee));
    setSchoolPaid(String(currentFeeSchedule.tuitionFee));
    setLessonOption('termly');
    setLessonFeeCustom('0');
    setLessonPaid('0');
    setReceiptNo('');
    setHasAgreedPayment(false);
    setErrorMessage(null);
    setEnrolledStudent(null);
    setAdmissionFeeEnabled(true);
    setExamFeeEnabled(true);
    setSchoolFeeEnabled(true);
    setLessonFeeEnabled(true);
    setExpandedFeeCard(null);
  };

  const handleLessonOptionChange = (option: '1_month' | '2_months' | 'termly' | 'custom') => {
    setLessonOption(option);
    if (option === '1_month') {
      setLessonFeeCustom(String(currentFeeSchedule.lessonFeeMonthly));
      setLessonPaid(String(currentFeeSchedule.lessonFeeMonthly));
    } else if (option === '2_months') {
      setLessonFeeCustom(String(currentFeeSchedule.lessonFeeMonthly * 2));
      setLessonPaid(String(currentFeeSchedule.lessonFeeMonthly * 2));
    } else if (option === 'termly') {
      setLessonFeeCustom(String(currentFeeSchedule.lessonFeeTermly));
      setLessonPaid(String(currentFeeSchedule.lessonFeeTermly));
    }
  };

  const handleQuickPayAll = () => {
    if (admissionFeeEnabled) setAdmissionPaid(String(numAdmissionFee));
    if (examFeeEnabled) setExamPaid(String(numExamFee));
    if (schoolFeeEnabled) setSchoolPaid(String(numSchoolFee));
    if (lessonFeeEnabled) setLessonPaid(String(numLessonFee));
    setHasAgreedPayment(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!studentId.trim()) {
      setErrorMessage('Please enter or verify the student ID.');
      return;
    }

    if (!fullName.trim()) {
      setErrorMessage('Please enter the student\'s full name.');
      return;
    }

    if (numAdmissionFee <= 0) {
      setErrorMessage('Admission fee amount cannot be 0 for new admissions.');
      return;
    }

    if (admissionFeeEnabled && numAdmissionPaid > numAdmissionFee) {
      setErrorMessage(`Overpayment blocked: Admission Paid (${formatCurrency(numAdmissionPaid, currencySymbol)}) cannot exceed Admission Fee (${formatCurrency(numAdmissionFee, currencySymbol)}).`);
      return;
    }
    if (examFeeEnabled && numExamPaid > numExamFee) {
      setErrorMessage(`Overpayment blocked: Exam Paid (${formatCurrency(numExamPaid, currencySymbol)}) cannot exceed Exam Fee (${formatCurrency(numExamFee, currencySymbol)}).`);
      return;
    }
    if (schoolFeeEnabled && numSchoolPaid > numSchoolFee) {
      setErrorMessage(`Overpayment blocked: School Fee Paid (${formatCurrency(numSchoolPaid, currencySymbol)}) cannot exceed School Fee (${formatCurrency(numSchoolFee, currencySymbol)}).`);
      return;
    }
    if (lessonFeeEnabled && numLessonPaid > numLessonFee) {
      setErrorMessage(`Overpayment blocked: Lesson Paid (${formatCurrency(numLessonPaid, currencySymbol)}) cannot exceed Lesson Fee (${formatCurrency(numLessonFee, currencySymbol)}).`);
      return;
    }

    setIsSubmitting(true);

    try {
      // Statuses
      const schoolStatus = calculateStatus(effectiveSchoolFee, effectiveSchoolPaid);
      const overallStatus = calculateStatus(grandTotalFee, grandTotalPaid);

      let lessonMonths = 'Unpaid';
      if (!lessonFeeEnabled) {
        lessonMonths = 'Not Enrolled';
      } else if (currentFeeSchedule.lessonFeeTermly > 0 && effectiveLessonPaid >= currentFeeSchedule.lessonFeeTermly) {
        lessonMonths = 'Termly (Paid)';
      } else if (currentFeeSchedule.lessonFeeMonthly > 0 && effectiveLessonPaid >= currentFeeSchedule.lessonFeeMonthly) {
        const months = Math.floor(effectiveLessonPaid / currentFeeSchedule.lessonFeeMonthly);
        lessonMonths = months > 1 ? `${months} Months Paid` : '1 Month Paid';
      } else if (effectiveLessonPaid > 0) {
        lessonMonths = 'Part Payment';
      }

      const newRecord: StudentPaymentRecord = {
        id: studentId.trim(),
        full_name: fullName.trim(),
        class: studentClass,
        term,
        session,
        fee_amount: grandTotalFee,
        amount_paid: grandTotalPaid,
        balance: calculateBalance(grandTotalFee, grandTotalPaid),
        status: overallStatus,
        payment_date: getTodayDateString(),

        // Granular Fee Columns & Statuses
        tuition_fee: effectiveSchoolFee,
        tuition_paid: effectiveSchoolPaid,
        tuition_status: schoolStatus,

        admission_fee: numAdmissionFee,
        admission_paid: effectiveAdmissionPaid,
        admission_status: effectiveAdmissionPaid >= numAdmissionFee ? 'fully_paid' : effectiveAdmissionPaid > 0 ? 'part_payment' : 'unpaid',
        is_new_admission: true,

        lesson_fee: effectiveLessonFee,
        lesson_paid: effectiveLessonPaid,
        lesson_status: !lessonFeeEnabled ? 'fully_paid' : effectiveLessonPaid >= effectiveLessonFee && effectiveLessonFee > 0 ? 'fully_paid' : effectiveLessonPaid > 0 ? 'part_payment' : 'unpaid',
        lesson_months: lessonMonths,
        lesson_disabled: !lessonFeeEnabled,

        exam_fee: effectiveExamFee,
        exam_paid: effectiveExamPaid,
        exam_status: effectiveExamPaid >= effectiveExamFee && effectiveExamFee > 0 ? 'fully_paid' : effectiveExamPaid > 0 ? 'part_payment' : 'unpaid',

        receipt_no: receiptNo.trim() || undefined,
      };

      await onAddStudent(newRecord);
      setEnrolledStudent(newRecord);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to complete admission.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrint = () => {
    try {
      if (typeof window !== 'undefined' && typeof window.print === 'function') {
        window.print();
      }
    } catch (e) {
      console.warn('Print error:', e);
    }
  };

  // If successfully enrolled, show the completed admission view with receipt
  if (enrolledStudent) {
    return (
      <div className="flex-1 px-4 py-5 space-y-4 pb-28">
        {onBack && (
          <button type="button" onClick={onBack} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500">
            <ArrowRight className="size-4 rotate-180" aria-hidden="true" />
            Back to enrollment options
          </button>
        )}
        <div className="bg-emerald-50 border border-emerald-200 rounded-3xl p-6 text-center space-y-4 shadow-sm">
          <div className="w-14 h-14 bg-emerald-600 text-white rounded-2xl flex items-center justify-center mx-auto shadow-md shadow-emerald-600/20">
            <CheckCircle2 className="w-7 h-7" />
          </div>
          <div>
            <span className="text-[10px] font-black tracking-wider uppercase text-emerald-800 bg-emerald-100/80 px-2.5 py-0.5 rounded-full border border-emerald-200">
              Enrollment successful
            </span>
            <h2 className="text-xl font-black text-emerald-950 mt-1.5">
              {enrolledStudent.full_name}
            </h2>
            <p className="text-xs text-emerald-800 mt-0.5 font-mono">
              Student ID: <span className="font-bold text-emerald-950">{enrolledStudent.id}</span> • {enrolledStudent.class}
            </p>
          </div>

          {/* Admission Financial Summary Card */}
          <div className="bg-white rounded-2xl p-4 border border-emerald-100 text-left space-y-2.5 shadow-xs">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-600">Admission Fee:</span>
              <span className="text-xs font-black text-slate-900 font-mono">
                {formatCurrency(enrolledStudent.admission_fee ?? 4000, currencySymbol)} (Paid: {formatCurrency(enrolledStudent.admission_paid ?? 0, currencySymbol)})
              </span>
            </div>
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-600">School Fee (Tuition):</span>
              <span className="text-xs font-black text-slate-900 font-mono">
                {formatCurrency(enrolledStudent.fee_amount, currencySymbol)} (Paid: {formatCurrency(enrolledStudent.amount_paid, currencySymbol)})
              </span>
            </div>
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <span className="text-xs font-bold text-slate-600">Exam Fee:</span>
              <span className="text-xs font-black text-slate-900 font-mono">
                {formatCurrency(enrolledStudent.exam_fee ?? 1000, currencySymbol)} (Paid: {formatCurrency(enrolledStudent.exam_paid ?? 0, currencySymbol)})
              </span>
            </div>
            {enrolledStudent.lesson_fee && enrolledStudent.lesson_fee > 0 ? (
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <span className="text-xs font-bold text-slate-600">Lesson Fee:</span>
                <span className="text-xs font-black text-slate-900 font-mono">
                  {formatCurrency(enrolledStudent.lesson_fee, currencySymbol)} (Paid: {formatCurrency(enrolledStudent.lesson_paid ?? 0, currencySymbol)})
                </span>
              </div>
            ) : null}
            {enrolledStudent.receipt_no && (
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs font-bold text-slate-600">Receipt No (School Fee):</span>
                <span className="text-xs font-black text-blue-600 font-mono">
                  {enrolledStudent.receipt_no}
                </span>
              </div>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <button
              onClick={handlePrint}
              id="print-admission-slip-btn"
              className="flex-1 py-3 px-4 rounded-2xl bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs border border-slate-200 flex items-center justify-center gap-2 active:scale-98 transition-all shadow-xs"
            >
              <Printer className="w-4 h-4 text-slate-600" />
              <span>Print Slip</span>
            </button>
            <button
              onClick={resetForm}
              id="enrol-another-admission-btn"
              className="flex-1 py-3 px-4 rounded-2xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs flex items-center justify-center gap-2 active:scale-98 transition-all shadow-sm"
            >
              <UserPlus className="w-4 h-4" />
              <span>Enrol Another Student</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 px-4 py-4 space-y-4 pb-28 bg-slate-50/50">
      {onBack && (
        <button type="button" onClick={onBack} className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500">
          <ArrowRight className="size-4 rotate-180" aria-hidden="true" />
          Back to enrollment options
        </button>
      )}
      {/* Header Banner */}
      <div className="bg-gradient-to-br from-blue-700 via-blue-800 to-indigo-900 text-white rounded-3xl p-5 shadow-lg relative overflow-hidden">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-white shrink-0">
            <UserPlus className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-500/30 text-blue-200 border border-blue-400/30">
                New Enrolment
              </span>
            </div>
            <h2 className="text-lg font-black tracking-tight text-white mt-0.5">
              New student admission
            </h2>
            <p className="text-xs text-blue-200/90 leading-tight">
              Enrol new admission with admission fee column, mandatory exam, and school fees.
            </p>
          </div>
        </div>
      </div>

      {errorMessage && (
        <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3.5 flex items-start gap-2.5 text-xs text-rose-900">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1 font-semibold">{errorMessage}</div>
        </div>
      )}

      {/* Main Admission Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Card 1: Student Bio */}
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-xs space-y-3.5">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
            <GraduationCap className="w-4 h-4 text-blue-600" />
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
              Student Bio & Academic Info
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-1">
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-bold text-slate-700 uppercase block">
                  Student ID *
                </label>
                <button
                  type="button"
                  onClick={() => setStudentId(generateNextStudentId(students || [], studentClass))}
                  className="text-[10px] text-blue-600 font-bold hover:underline active:scale-95"
                >
                  Auto ID ({studentClass && (studentClass.toLowerCase().startsWith('jss') || studentClass.toLowerCase().startsWith('ss')) ? 'DSS/0001' : 'DNPS/0001'})
                </button>
              </div>
              <input
                type="text"
                id="admission-student-id"
                required
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                placeholder="e.g. DNPS/0001 or DSS/0001"
                className="w-full px-3.5 py-2.5 text-xs font-mono font-bold bg-slate-50 rounded-xl border border-slate-200 text-slate-900 focus:ring-2 focus:ring-blue-600 focus:bg-white focus:outline-none transition-all"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1">
                Student Full Name *
              </label>
              <input
                type="text"
                id="admission-full-name"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Adeleke Emmanuel"
                className="w-full px-3.5 py-2.5 text-xs font-bold bg-slate-50 rounded-xl border border-slate-200 text-slate-900 focus:ring-2 focus:ring-blue-600 focus:bg-white focus:outline-none transition-all placeholder:text-slate-400"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                Class / Grade
              </label>
              <select
                id="admission-class-select"
                value={studentClass}
                onChange={(e) => handleClassChange(e.target.value)}
                className="w-full px-3 py-2 text-xs font-bold bg-slate-50 rounded-xl border border-slate-200 text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none"
              >
                {classOptions.map((cls) => (
                  <option key={cls} value={cls}>
                    {cls}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                Academic Term
              </label>
              <select
                id="admission-term-select"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                className="w-full px-3 py-2 text-xs font-bold bg-slate-50 rounded-xl border border-slate-200 text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none"
              >
                {TERM_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                Academic Session
              </label>
              <input
                type="text"
                id="admission-session-input"
                value={session}
                onChange={(e) => setSession(e.target.value)}
                placeholder="2025-2026"
                className="w-full px-3 py-2 text-xs font-bold bg-slate-50 rounded-xl border border-slate-200 text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Cards 2-5: Fee Checklist */}
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-xs space-y-2.5">
          <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
            <Layers className="w-4 h-4 text-blue-600" />
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
              Enrolment Fees
            </h3>
          </div>

          {/* Admission Fee Row (mandatory) */}
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40">
            <div className="flex items-center gap-3 p-3.5">
              <input type="checkbox" checked={admissionFeeEnabled} onChange={(e) => setAdmissionFeeEnabled(e.target.checked)} className="w-5 h-5 rounded-md border-slate-300 text-emerald-600 focus:ring-emerald-500 shrink-0" />
              <button
                type="button"
                onClick={() => admissionFeeEnabled && setExpandedFeeCard(expandedFeeCard === 'admission' ? null : 'admission')}
                disabled={!admissionFeeEnabled}
                className="flex-1 flex items-center justify-between min-w-0 text-left disabled:opacity-50"
              >
                <span className="text-xs font-black text-slate-900">Admission Fee</span>
                <span className="text-[11px] font-bold text-slate-600 shrink-0">{admissionFeeEnabled ? formatCurrency(numAdmissionFee, currencySymbol) : `Pending – Owing ${formatCurrency(numAdmissionFee, currencySymbol)}`}</span>
              </button>
            </div>
            {admissionFeeEnabled && expandedFeeCard === 'admission' && (
              <div className="px-3.5 pb-3.5 grid grid-cols-2 gap-3 animate-in fade-in duration-150">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-bold block mb-1">Fee ({currencySymbol})</span>
                  <input type="number" min="0" id="admission-fee-amount" value={admissionFee} onChange={(e) => setAdmissionFee(e.target.value)} className="w-full px-3 py-2 text-xs font-bold bg-white rounded-xl border border-slate-200 text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none" />
                </div>
                <div>
                  <span className="text-[10px] text-emerald-800 uppercase font-bold block mb-1">Paid ({currencySymbol})</span>
                  <input type="number" min="0" id="admission-fee-paid" value={admissionPaid} onChange={(e) => setAdmissionPaid(e.target.value)} className="w-full px-3 py-2 text-xs font-black bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
                </div>
              </div>
            )}
          </div>

          {/* Exam Fee Row (optional) */}
          <div className={`rounded-2xl border transition-all ${examFeeEnabled ? 'border-amber-200 bg-amber-50/40' : 'border-slate-200 bg-slate-50'}`}>
            <div className="flex items-center gap-3 p-3.5">
              <input type="checkbox" checked={examFeeEnabled} onChange={(e) => setExamFeeEnabled(e.target.checked)} className="w-5 h-5 rounded-md border-slate-300 text-amber-600 focus:ring-amber-500 shrink-0" />
              <button
                type="button"
                onClick={() => examFeeEnabled && setExpandedFeeCard(expandedFeeCard === 'exam' ? null : 'exam')}
                disabled={!examFeeEnabled}
                className="flex-1 flex items-center justify-between min-w-0 text-left disabled:opacity-50"
              >
                <span className="text-xs font-black text-slate-900">Exam Fee</span>
                <span className="text-[11px] font-bold text-slate-600 shrink-0">{examFeeEnabled ? formatCurrency(numExamFee, currencySymbol) : 'Pay Later'}</span>
              </button>
            </div>
            {examFeeEnabled && expandedFeeCard === 'exam' && (
              <div className="px-3.5 pb-3.5 grid grid-cols-2 gap-3 animate-in fade-in duration-150">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-bold block mb-1">Fee ({currencySymbol})</span>
                  <input type="number" min="0" id="admission-exam-fee" value={examFee} onChange={(e) => setExamFee(e.target.value)} className="w-full px-3 py-2 text-xs font-bold bg-white rounded-xl border border-slate-200 text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none" />
                </div>
                <div>
                  <span className="text-[10px] text-amber-800 uppercase font-bold block mb-1">Paid ({currencySymbol})</span>
                  <input type="number" min="0" id="admission-exam-paid" value={examPaid} onChange={(e) => setExamPaid(e.target.value)} className="w-full px-3 py-2 text-xs font-black bg-amber-50 border border-amber-200 rounded-xl text-amber-900 focus:ring-2 focus:ring-amber-500 focus:outline-none" />
                </div>
              </div>
            )}
          </div>

          {/* School Fee Row (optional) */}
          <div className={`rounded-2xl border transition-all ${schoolFeeEnabled ? 'border-blue-200 bg-blue-50/40' : 'border-slate-200 bg-slate-50'}`}>
            <div className="flex items-center gap-3 p-3.5">
              <input type="checkbox" checked={schoolFeeEnabled} onChange={(e) => setSchoolFeeEnabled(e.target.checked)} className="w-5 h-5 rounded-md border-slate-300 text-blue-600 focus:ring-blue-500 shrink-0" />
              <button
                type="button"
                onClick={() => schoolFeeEnabled && setExpandedFeeCard(expandedFeeCard === 'school' ? null : 'school')}
                disabled={!schoolFeeEnabled}
                className="flex-1 flex items-center justify-between min-w-0 text-left disabled:opacity-50"
              >
                <span className="text-xs font-black text-slate-900">School Fee (Tuition)</span>
                <span className="text-[11px] font-bold text-slate-600 shrink-0">{schoolFeeEnabled ? formatCurrency(numSchoolFee, currencySymbol) : 'Pay Later'}</span>
              </button>
            </div>
            {schoolFeeEnabled && expandedFeeCard === 'school' && (
              <div className="px-3.5 pb-3.5 grid grid-cols-2 gap-3 animate-in fade-in duration-150">
                <div>
                  <span className="text-[10px] text-slate-500 uppercase font-bold block mb-1">Fee ({currencySymbol})</span>
                  <input type="number" min="0" id="admission-school-fee" value={schoolFee} onChange={(e) => setSchoolFee(e.target.value)} className="w-full px-3 py-2 text-xs font-bold bg-white rounded-xl border border-slate-200 text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none" />
                </div>
                <div>
                  <span className="text-[10px] text-blue-800 uppercase font-bold block mb-1">Paid ({currencySymbol})</span>
                  <input type="number" min="0" id="admission-school-paid" value={schoolPaid} onChange={(e) => setSchoolPaid(e.target.value)} className="w-full px-3 py-2 text-xs font-black bg-blue-50 border border-blue-200 rounded-xl text-blue-900 focus:ring-2 focus:ring-blue-500 focus:outline-none" />
                </div>
              </div>
            )}
          </div>

          {/* Lesson Fee Row (optional, with duration selector) */}
          <div className={`rounded-2xl border transition-all ${lessonFeeEnabled ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-slate-50'}`}>
            <div className="flex items-center gap-3 p-3.5">
              <input type="checkbox" checked={lessonFeeEnabled} onChange={(e) => setLessonFeeEnabled(e.target.checked)} className="w-5 h-5 rounded-md border-slate-300 text-emerald-600 focus:ring-emerald-500 shrink-0" />
              <button
                type="button"
                onClick={() => lessonFeeEnabled && setExpandedFeeCard(expandedFeeCard === 'lesson' ? null : 'lesson')}
                disabled={!lessonFeeEnabled}
                className="flex-1 flex items-center justify-between min-w-0 text-left disabled:opacity-50"
              >
                <span className="text-xs font-black text-slate-900">Lesson Fee <span className="text-[9px] font-bold text-slate-500">(untick to disable)</span></span>
                <span className="text-[11px] font-bold text-slate-600 shrink-0">{lessonFeeEnabled ? formatCurrency(numLessonFee, currencySymbol) : 'Disabled'}</span>
              </button>
            </div>
            {lessonFeeEnabled && expandedFeeCard === 'lesson' && (
              <div className="px-3.5 pb-3.5 space-y-2.5 animate-in fade-in duration-150">
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: '1_month', label: '1 Month', fee: currentFeeSchedule.lessonFeeMonthly },
                    { id: '2_months', label: '2 Months', fee: currentFeeSchedule.lessonFeeMonthly * 2 },
                    { id: 'termly', label: 'Full Term', fee: currentFeeSchedule.lessonFeeTermly },
                  ].map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => handleLessonOptionChange(item.id as any)}
                      className={`py-2 px-2 rounded-xl border text-center transition-all ${
                        lessonOption === item.id
                          ? 'border-emerald-600 bg-emerald-100 text-emerald-950 font-bold shadow-xs'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100 text-xs'
                      }`}
                    >
                      <div className="text-[11px] font-bold">{item.label}</div>
                      <div className="text-[10px] text-slate-500 font-mono">{formatCurrency(item.fee, currencySymbol)}</div>
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-[10px] text-slate-500 uppercase font-bold block mb-1">Fee ({currencySymbol})</span>
                    <input type="number" min="0" value={lessonFeeCustom} onChange={(e) => setLessonFeeCustom(e.target.value)} className="w-full px-3 py-2 text-xs font-bold bg-white rounded-xl border border-slate-200 text-slate-900" />
                  </div>
                  <div>
                    <span className="text-[10px] text-emerald-800 uppercase font-bold block mb-1">Paid ({currencySymbol})</span>
                    <input type="number" min="0" value={lessonPaid} onChange={(e) => setLessonPaid(e.target.value)} className="w-full px-3 py-2 text-xs font-black bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900" />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Card 6: Section 5 - Manual Receipt Number (for School Fee) */}
        <div className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Receipt className="w-4 h-4 text-blue-600" />
              <label className="text-xs font-black text-slate-900 uppercase">
                Manual Receipt Number (School Fee)
              </label>
            </div>
            <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
              receipt_no column
            </span>
          </div>
          <p className="text-[10px] text-slate-500">
            Enter the manual receipt / physical slip number issued for this school fee payment.
          </p>
          <input
            type="text"
            id="admission-receipt-no"
            value={receiptNo}
            onChange={(e) => setReceiptNo(e.target.value)}
            placeholder="e.g. 004821 or Booklet Slip No. (leave blank if not yet issued)"
            className="w-full px-3.5 py-2.5 text-xs font-mono font-bold bg-slate-50 rounded-xl border border-slate-200 text-slate-900 focus:ring-2 focus:ring-blue-600 focus:bg-white focus:outline-none transition-all placeholder:text-slate-400 placeholder:font-sans"
          />
        </div>

        {/* Card 7: Grand Totals Summary & Quick Pay */}
        <div className="p-4 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 text-white rounded-3xl shadow-xl space-y-3.5">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">
                Total Enrolment Package Fee
              </span>
              <p className="text-xl font-black font-mono text-white mt-0.5">
                {formatCurrency(grandTotalFee, currencySymbol)}
              </p>
            </div>
            <div className="text-right">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold block">
                Total Paid Now
              </span>
              <p className="text-xl font-black font-mono text-emerald-400 mt-0.5">
                {formatCurrency(grandTotalPaid, currencySymbol)}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-700/60 font-mono">
            <span className="text-slate-400">Total Outstanding Balance:</span>
            <span className={`font-black ${grandTotalBalance > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
              {formatCurrency(grandTotalBalance, currencySymbol)}
            </span>
          </div>

          <div className="pt-1 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleQuickPayAll}
              className="text-[11px] font-bold text-blue-300 bg-blue-500/20 hover:bg-blue-500/30 px-3 py-1.5 rounded-xl border border-blue-400/30 flex items-center gap-1 active:scale-95 transition-all"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Mark All Paid in Full</span>
            </button>
            
            <label className="flex items-center gap-1.5 text-[11px] text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={hasAgreedPayment}
                onChange={(e) => setHasAgreedPayment(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-900"
              />
              <span>Payment confirmed</span>
            </label>
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={isSubmitting || !fullName.trim() || !hasAgreedPayment}
          id="submit-new-admission-btn"
          className="w-full py-4 px-6 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white font-black text-sm tracking-wide shadow-lg shadow-blue-600/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 active:scale-98 transition-all cursor-pointer"
        >
          {isSubmitting ? (
            <>
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Enrolling Student & Syncing Sheet...</span>
            </>
          ) : (
            <>
              <UserPlus className="w-5 h-5" />
              <span>Complete New Student Admission</span>
            </>
          )}
        </button>
      </form>
    </div>
  );
};
