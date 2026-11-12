/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  X, 
  UserCheck, 
  CheckCircle2, 
  AlertCircle, 
  GraduationCap, 
  Receipt,
  Sparkles,
  Layers
} from 'lucide-react';
import { StudentPaymentRecord } from '../types';
import { 
  formatCurrency, 
  calculateBalance, 
  calculateStatus, 
  getTodayDateString,
  getClassFeeSchedule,
  generateStudentId,
  FEE_SCHEDULE,
  getCurrentAcademicSession
} from '../services/calculations';

interface AddExistingStudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  currencySymbol: string;
  existingCount: number;
  students?: StudentPaymentRecord[];
  onAddStudent: (student: StudentPaymentRecord) => Promise<void> | void;
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

export const AddExistingStudentModal: React.FC<AddExistingStudentModalProps> = ({
  isOpen,
  onClose,
  currencySymbol,
  existingCount,
  students,
  onAddStudent,
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

  // School Fee (Tuition) Amount & Initial Paid
  const [schoolFee, setSchoolFee] = useState<string>(String(initialSchedule.tuitionFee));
  const [tuitionPaid, setTuitionPaid] = useState<string>('0');
  const [isExemptFromSchoolFee, setIsExemptFromSchoolFee] = useState<boolean>(false);
  const [scholarshipNotes, setScholarshipNotes] = useState<string>('');

  // Exam Fee
  const [examFee, setExamFee] = useState<string>(String(initialSchedule.examFee));
  const [examPaid, setExamPaid] = useState<string>('0');

  // Lesson Fee
  const [lessonOption, setLessonOption] = useState<'none' | '1_month' | '2_months' | 'termly' | 'custom'>('termly');
  const [lessonFeeCustom, setLessonFeeCustom] = useState<string>(String(initialSchedule.lessonFeeTermly));
  const [lessonPaid, setLessonPaid] = useState<string>('0');

  // Optional Admission Fee (for existing transfers or delayed admission)
  const [includeAdmissionFee, setIncludeAdmissionFee] = useState<boolean>(false);
  const [admissionFee, setAdmissionFee] = useState<string>(String(initialSchedule.admissionFee));
  const [admissionPaid, setAdmissionPaid] = useState<string>('0');

  const [receiptNo, setReceiptNo] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleClassChange = (newClass: string) => {
    setStudentClass(newClass);
    const sched = getClassFeeSchedule(activeSchool, newClass);
    if (!isExemptFromSchoolFee) {
      setSchoolFee(String(sched.tuitionFee));
    }
    setExamFee(String(sched.examFee));
    setAdmissionFee(String(sched.admissionFee));
    if (lessonOption === '1_month') {
      setLessonFeeCustom(String(sched.lessonFeeMonthly));
    } else if (lessonOption === '2_months') {
      setLessonFeeCustom(String(sched.lessonFeeMonthly * 2));
    } else if (lessonOption === 'termly') {
      setLessonFeeCustom(String(sched.lessonFeeTermly));
    }
  };

  // Sync defaults when modal opens (Leave student ID blank for manual filling)
  React.useEffect(() => {
    if (isOpen) {
      const cls = (activeSchool?.classes && activeSchool.classes.length > 0) ? activeSchool.classes[0] : (classOptions[0] || 'Primary 1');
      const sched = getClassFeeSchedule(activeSchool, cls);

      setStudentId('');
      setStudentClass(cls);
      setSchoolFee(String(sched.tuitionFee));
      setExamFee(String(sched.examFee));
      setLessonFeeCustom(String(sched.lessonFeeTermly || 7000));
      setAdmissionFee(String(sched.admissionFee));
      setFullName('');
      setTuitionPaid('0');
      setExamPaid('0');
      setLessonPaid('0');
      setAdmissionPaid('0');
      setLessonOption('termly');
      setIncludeAdmissionFee(false);
      setReceiptNo('');
      setIsExemptFromSchoolFee(false);
      setScholarshipNotes('');
      setErrorMessage(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentFeeSchedule = getClassFeeSchedule(activeSchool, studentClass);
  const defaultTuition = currentFeeSchedule.tuitionFee;
  const defaultExam = currentFeeSchedule.examFee;
  const defaultLessonMonthly = currentFeeSchedule.lessonFeeMonthly;
  const defaultLessonTermly = currentFeeSchedule.lessonFeeTermly;

  const numTuitionFee = isExemptFromSchoolFee ? 0 : Math.max(0, Number(schoolFee) || 0);
  const numTuitionPaid = isExemptFromSchoolFee ? 0 : Math.max(0, Number(tuitionPaid) || 0);

  const numExamFee = Math.max(0, Number(examFee) || 0);
  const numExamPaid = Math.max(0, Number(examPaid) || 0);

  let numLessonFee = 0;
  if (lessonOption === 'none') {
    numLessonFee = 0;
  } else if (lessonOption === '1_month') {
    numLessonFee = defaultLessonMonthly;
  } else if (lessonOption === '2_months') {
    numLessonFee = defaultLessonMonthly * 2;
  } else if (lessonOption === 'termly') {
    numLessonFee = defaultLessonTermly;
  } else if (lessonOption === 'custom') {
    numLessonFee = Math.max(0, Number(lessonFeeCustom) || 0);
  }
  const numLessonPaid = Math.max(0, Number(lessonPaid) || 0);

  const numAdmissionFee = includeAdmissionFee ? Math.max(0, Number(admissionFee) || 0) : 0;
  const numAdmissionPaid = includeAdmissionFee ? Math.max(0, Number(admissionPaid) || 0) : 0;

  const totalFee = numTuitionFee + numExamFee + numLessonFee + numAdmissionFee;
  const totalPaid = numTuitionPaid + numExamPaid + numLessonPaid + numAdmissionPaid;
  const balance = Math.max(0, totalFee - totalPaid);
  const status = calculateStatus(totalFee, totalPaid);

  const handleLessonOptionChange = (option: 'none' | '1_month' | '2_months' | 'termly' | 'custom') => {
    setLessonOption(option);
    const mRate = defaultLessonMonthly;
    const tRate = defaultLessonTermly;
    if (option === 'none') {
      setLessonFeeCustom('0');
      setLessonPaid('0');
    } else if (option === '1_month') {
      setLessonFeeCustom(String(mRate));
    } else if (option === '2_months') {
      setLessonFeeCustom(String(mRate * 2));
    } else if (option === 'termly') {
      setLessonFeeCustom(String(tRate));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!studentId.trim()) {
      setErrorMessage('Please enter or assign a student ID.');
      return;
    }

    if (!fullName.trim()) {
      setErrorMessage('Please enter student\'s full name.');
      return;
    }

    if (!isExemptFromSchoolFee && numTuitionPaid > numTuitionFee) {
      setErrorMessage(`Overpayment blocked: Tuition Paid (${formatCurrency(numTuitionPaid, currencySymbol)}) cannot exceed School Fee (${formatCurrency(numTuitionFee, currencySymbol)}).`);
      return;
    }
    if (numExamPaid > numExamFee) {
      setErrorMessage(`Overpayment blocked: Exam Paid (${formatCurrency(numExamPaid, currencySymbol)}) cannot exceed Exam Fee (${formatCurrency(numExamFee, currencySymbol)}).`);
      return;
    }
    if (numLessonPaid > numLessonFee) {
      setErrorMessage(`Overpayment blocked: Lesson Paid (${formatCurrency(numLessonPaid, currencySymbol)}) cannot exceed Lesson Fee (${formatCurrency(numLessonFee, currencySymbol)}).`);
      return;
    }
    if (includeAdmissionFee && numAdmissionPaid > numAdmissionFee) {
      setErrorMessage(`Overpayment blocked: Admission Paid (${formatCurrency(numAdmissionPaid, currencySymbol)}) cannot exceed Admission Fee (${formatCurrency(numAdmissionFee, currencySymbol)}).`);
      return;
    }

    setIsSubmitting(true);

    try {
      let lessonMonthsLabel = 'Unpaid';
      if (numLessonPaid >= numLessonFee && numLessonFee > 0) {
        lessonMonthsLabel = lessonOption === '1_month' ? '1 Month (Paid)' : lessonOption === '2_months' ? '2 Months (Paid)' : 'Termly (Paid)';
      } else if (numLessonPaid > 0) {
        lessonMonthsLabel = 'Part Payment';
      } else if (numLessonFee === 0) {
        lessonMonthsLabel = 'None';
      }

      const newRecord: StudentPaymentRecord = {
        id: studentId.trim(),
        full_name: fullName.trim(),
        class: studentClass,
        term,
        session,
        fee_amount: totalFee,
        amount_paid: totalPaid,
        balance,
        status,
        payment_date: getTodayDateString(),
        is_exempt_from_school_fee: isExemptFromSchoolFee,
        scholarship_notes: isExemptFromSchoolFee && scholarshipNotes.trim() ? scholarshipNotes.trim() : undefined,

        // Granular Fee Columns
        tuition_fee: numTuitionFee,
        tuition_paid: numTuitionPaid,
        tuition_status: isExemptFromSchoolFee ? 'fully_paid' : calculateStatus(numTuitionFee, numTuitionPaid),

        admission_fee: numAdmissionFee,
        admission_paid: numAdmissionPaid,
        admission_status: numAdmissionFee > 0 ? calculateStatus(numAdmissionFee, numAdmissionPaid) : 'unpaid',
        is_new_admission: includeAdmissionFee,

        exam_fee: numExamFee,
        exam_paid: numExamPaid,
        exam_status: calculateStatus(numExamFee, numExamPaid),

        lesson_fee: numLessonFee,
        lesson_paid: numLessonPaid,
        lesson_status: lessonOption === 'none' ? 'fully_paid' : calculateStatus(numLessonFee, numLessonPaid),
        lesson_months: lessonOption === 'none' ? 'Not Enrolled' : lessonMonthsLabel,
        lesson_disabled: lessonOption === 'none',

        receipt_no: receiptNo.trim() || undefined,
      };

      await onAddStudent(newRecord);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to add existing student.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-xs sm:items-center sm:p-4">
      <div className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] border border-slate-200 bg-white shadow-2xl animate-in slide-in-from-bottom duration-200 sm:rounded-3xl">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center">
              <UserCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">
                Enroll Existing Student
              </h3>
              <p className="text-[11px] text-slate-500">
                Enroll student into {activeSchool?.name || 'Class Roster'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            id="close-add-existing-modal-btn"
            className="w-8 h-8 rounded-full bg-white text-slate-400 hover:text-slate-700 flex items-center justify-center border border-slate-200 shadow-xs"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Form Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {errorMessage && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3 flex items-start gap-2 text-xs text-rose-900 font-semibold">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Student Bio */}
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="sm:col-span-1">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <label className="block text-[10px] font-bold uppercase text-slate-700" htmlFor="existing-student-id">
                    Student ID *
                  </label>
                  <button
                    type="button"
                    onClick={() => setStudentId(generateStudentId(students || existingCount, studentClass))}
                    className="min-h-8 shrink-0 rounded-lg px-2 text-[10px] font-bold text-emerald-700 transition-colors hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"
                  >
                    Assign ID
                  </button>
                </div>
                <input
                  type="text"
                  required
                  id="existing-student-id"
                  value={studentId}
                  onChange={(e) => setStudentId(e.target.value)}
                  placeholder="Enter or assign a student ID"
                  className="w-full px-3 py-2.5 text-xs font-mono font-bold bg-slate-50 rounded-xl border border-slate-200 text-slate-900 focus:ring-2 focus:ring-blue-600 focus:bg-white focus:outline-none transition-all"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="text-[10px] font-bold text-slate-700 uppercase block mb-1">
                  Student Full Name *
                </label>
                <input
                  type="text"
                  required
                  id="existing-student-fullname"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Balogun Tunde"
                  className="w-full px-3.5 py-2.5 text-xs font-bold bg-slate-50 rounded-xl border border-slate-200 text-slate-900 focus:ring-2 focus:ring-blue-600 focus:bg-white focus:outline-none transition-all placeholder:text-slate-400"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                  Class / Grade
                </label>
                <select
                  id="existing-student-class"
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
                  Term
                </label>
                <select
                  id="existing-student-term"
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
                  Session
                </label>
                <input
                  type="text"
                  id="existing-student-session"
                  value={session}
                  onChange={(e) => setSession(e.target.value)}
                  placeholder="2025-2026"
                  className="w-full px-3 py-2 text-xs font-bold bg-slate-50 rounded-xl border border-slate-200 text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* Fee Schedule Section */}
          <div className="space-y-3">
            {/* 1. School Fee (Tuition) */}
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-3">
              <div className="flex items-center justify-between pb-1 border-b border-slate-200/60">
                <span className="text-[11px] font-black text-slate-800 uppercase tracking-wider">
                  1. School Fee (Tuition)
                </span>
                <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                  Standard: {currencySymbol}{defaultTuition.toLocaleString()}
                </span>
              </div>

              {/* Scholarship Toggle */}
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 space-y-1.5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    id="existing-student-scholarship-toggle"
                    checked={isExemptFromSchoolFee}
                    onChange={(e) => {
                      setIsExemptFromSchoolFee(e.target.checked);
                      if (e.target.checked) {
                        setTuitionPaid('0');
                      }
                    }}
                    className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-amber-300"
                  />
                  <span className="text-xs font-black text-amber-950">
                    ⭐ Student on Scholarship (Exempt from School Fee)
                  </span>
                </label>
                <p className="text-[10px] text-amber-800">
                  When active, tuition is {currencySymbol}0 and marked fully paid.
                </p>
                {isExemptFromSchoolFee && (
                  <input
                    type="text"
                    id="existing-student-scholarship-notes"
                    value={scholarshipNotes}
                    onChange={(e) => setScholarshipNotes(e.target.value)}
                    placeholder="Scholarship note (e.g. Merit Award)"
                    className="w-full px-3 py-1.5 text-xs bg-white rounded-lg border border-amber-200 text-amber-950 placeholder:text-amber-400 focus:outline-none"
                  />
                )}
              </div>

              {!isExemptFromSchoolFee && (
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                      School Fee ({currencySymbol})
                    </label>
                    <input
                      type="number"
                      min="0"
                      id="existing-student-fee-amount"
                      value={schoolFee}
                      onChange={(e) => setSchoolFee(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-bold bg-white rounded-xl border border-slate-200 text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                      Tuition Paid Now ({currencySymbol})
                    </label>
                    <input
                      type="number"
                      min="0"
                      id="existing-student-tuition-paid"
                      value={tuitionPaid}
                      onChange={(e) => setTuitionPaid(e.target.value)}
                      placeholder="0"
                      className="w-full px-3 py-2 text-xs font-bold bg-white rounded-xl border border-slate-200 text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 2. Exam Fee */}
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2.5">
              <div className="flex items-center justify-between pb-1 border-b border-slate-200/60">
                <span className="text-[11px] font-black text-slate-800 uppercase tracking-wider">
                  2. Exam Fee
                </span>
                <span className="text-[10px] font-bold text-slate-600 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                  Standard: {currencySymbol}{defaultExam.toLocaleString()}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                    Exam Fee ({currencySymbol})
                  </label>
                  <input
                    type="number"
                    min="0"
                    id="existing-student-exam-fee"
                    value={examFee}
                    onChange={(e) => setExamFee(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-bold bg-white rounded-xl border border-slate-200 text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                    Exam Paid Now ({currencySymbol})
                  </label>
                  <input
                    type="number"
                    min="0"
                    id="existing-student-exam-paid"
                    value={examPaid}
                    onChange={(e) => setExamPaid(e.target.value)}
                    placeholder="0"
                    className="w-full px-3 py-2 text-xs font-bold bg-white rounded-xl border border-slate-200 text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* 3. Lesson Fee */}
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2.5">
              <div className="flex items-center justify-between pb-1 border-b border-slate-200/60">
                <span className="text-[11px] font-black text-slate-800 uppercase tracking-wider">
                  3. Lesson Fee (Compulsory)
                </span>
                <span className="text-[10px] font-bold text-slate-600 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                  {currencySymbol}{defaultLessonMonthly.toLocaleString()}/mo • {currencySymbol}{defaultLessonTermly.toLocaleString()}/term
                </span>
              </div>

              {/* Lesson Option Selector */}
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { id: 'none', label: 'No Lesson' },
                  { id: '1_month', label: '1 Mo' },
                  { id: '2_months', label: '2 Mos' },
                  { id: 'termly', label: 'Termly' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => handleLessonOptionChange(opt.id as any)}
                    className={`py-1.5 px-2 text-[11px] font-bold rounded-xl border transition-all ${
                      lessonOption === opt.id
                        ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {lessonOption !== 'none' && (
                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <div>
                    <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                      Lesson Fee ({currencySymbol})
                    </label>
                    <input
                      type="number"
                      min="0"
                      id="existing-student-lesson-fee"
                      value={numLessonFee}
                      readOnly={lessonOption !== 'custom'}
                      className="w-full px-3 py-2 text-xs font-bold bg-slate-100 rounded-xl border border-slate-200 text-slate-900 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                      Lesson Paid Now ({currencySymbol})
                    </label>
                    <input
                      type="number"
                      min="0"
                      id="existing-student-lesson-paid"
                      value={lessonPaid}
                      onChange={(e) => setLessonPaid(e.target.value)}
                      placeholder="0"
                      className="w-full px-3 py-2 text-xs font-bold bg-white rounded-xl border border-slate-200 text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* 4. Optional Admission Fee Toggle */}
            <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200 space-y-2">
              <label className="flex items-center justify-between cursor-pointer">
                <span className="text-[11px] font-bold text-slate-700 uppercase">
                  Charge Admission Fee? (Transfer / Late Admission)
                </span>
                <input
                  type="checkbox"
                  checked={includeAdmissionFee}
                  onChange={(e) => setIncludeAdmissionFee(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-slate-300"
                />
              </label>

              {includeAdmissionFee && (
                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <div>
                    <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                      Admission Fee ({currencySymbol})
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={admissionFee}
                      onChange={(e) => setAdmissionFee(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-bold bg-white rounded-xl border border-slate-200 text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-600 uppercase block mb-1">
                      Admission Paid Now ({currencySymbol})
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={admissionPaid}
                      onChange={(e) => setAdmissionPaid(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-bold bg-white rounded-xl border border-slate-200 text-slate-900 focus:ring-2 focus:ring-blue-600 focus:outline-none"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Summary & Balance Card */}
            <div className="bg-slate-900 text-white rounded-2xl p-4 space-y-2 shadow-sm">
              <div className="flex items-center justify-between text-xs pb-1 border-b border-slate-800">
                <span className="text-slate-400">Total Enrolled Fees:</span>
                <span className="font-mono font-bold">{formatCurrency(totalFee, currencySymbol)}</span>
              </div>
              <div className="flex items-center justify-between text-xs pb-1 border-b border-slate-800">
                <span className="text-slate-400">Total Paid Initial:</span>
                <span className="font-mono font-bold text-emerald-400">{formatCurrency(totalPaid, currencySymbol)}</span>
              </div>
              <div className="flex items-center justify-between text-sm font-bold pt-1">
                <span>Remaining Balance:</span>
                <span className={balance > 0 ? 'text-amber-400 font-mono' : 'text-emerald-400 font-mono'}>
                  {formatCurrency(balance, currencySymbol)} ({status.replace('_', ' ')})
                </span>
              </div>
            </div>
          </div>

          {/* Optional Manual Receipt */}
          {totalPaid > 0 && (
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-600 uppercase flex items-center gap-1">
                <Receipt className="w-3.5 h-3.5 text-blue-600" />
                <span>Manual Receipt Number (Optional)</span>
              </label>
              <input
                type="text"
                id="existing-student-receipt-no"
                value={receiptNo}
                onChange={(e) => setReceiptNo(e.target.value)}
                placeholder="e.g. 004821 or Booklet Slip No."
                className="w-full px-3 py-2 text-xs font-mono font-bold bg-slate-50 rounded-xl border border-slate-200 text-slate-900 focus:ring-2 focus:ring-blue-600 focus:bg-white focus:outline-none"
              />
            </div>
          )}

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting || !fullName.trim()}
              id="save-existing-student-btn"
              className="w-full py-3.5 px-4 rounded-2xl bg-slate-900 hover:bg-black text-white font-black text-xs uppercase tracking-wider shadow-md disabled:opacity-50 flex items-center justify-center gap-2 active:scale-98 transition-all cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Adding Student...</span>
                </>
              ) : (
                <>
                  <UserCheck className="w-4 h-4" />
                  <span>Enroll Existing Student</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
