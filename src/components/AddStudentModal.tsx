/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  X, 
  UserPlus, 
  AlertCircle, 
  CheckCircle2, 
  Calculator, 
  BookOpen, 
  GraduationCap, 
  FileCheck2,
  Sparkles,
  ShieldCheck,
  Receipt,
  RotateCcw
} from 'lucide-react';
import { StudentPaymentRecord } from '../types';
import { 
  calculateBalance, 
  calculateStatus, 
  formatCurrency, 
  generateStudentId, 
  getTodayDateString,
  FEE_SCHEDULE,
  STANDARD_CLASSES,
  generateReceiptNumber,
  getClassFeeSchedule,
  getCurrentAcademicSession
} from '../services/calculations';
import { StatusBadge } from './StatusBadge';

interface AddStudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  currencySymbol: string;
  existingCount: number;
  students?: StudentPaymentRecord[];
  onAddStudent: (student: StudentPaymentRecord) => Promise<void>;
  activeSchool?: import('../types').SchoolProfile;
}

export const AddStudentModal: React.FC<AddStudentModalProps> = ({
  isOpen,
  onClose,
  currencySymbol,
  existingCount,
  students,
  onAddStudent,
  activeSchool,
}) => {
  const initialClass = activeSchool?.classes?.[0] || 'JSS 1';
  const initialSchedule = getClassFeeSchedule(activeSchool, initialClass);

  const [studentId, setStudentId] = useState<string>('');
  const [fullName, setFullName] = useState<string>('');
  const [studentClass, setStudentClass] = useState<string>(initialClass);
  const [term, setTerm] = useState<string>('1st Term');
  const [session, setSession] = useState<string>(activeSchool?.academicSession || getCurrentAcademicSession());
  
  // Mandatory Enrolment Fees
  const [admissionFee, setAdmissionFee] = useState<string>(String(initialSchedule.admissionFee));
  const [admissionPaid, setAdmissionPaid] = useState<string>(String(initialSchedule.admissionFee));
  
  const [examFee, setExamFee] = useState<string>(String(initialSchedule.examFee));
  const [examPaid, setExamPaid] = useState<string>(String(initialSchedule.examFee));

  // School Fee (Tuition)
  const [schoolFee, setSchoolFee] = useState<string>(String(initialSchedule.tuitionFee));
  const [schoolPaid, setSchoolPaid] = useState<string>(String(initialSchedule.tuitionFee));
  const [isExemptFromSchoolFee, setIsExemptFromSchoolFee] = useState<boolean>(false);
  const [scholarshipNotes, setScholarshipNotes] = useState<string>('');

  // Compulsory Lesson Fee (Auto-Enrolled)
  const [lessonOption, setLessonOption] = useState<'none' | '1_month' | '2_months' | 'termly'>('termly');
  const [lessonFeeCustom, setLessonFeeCustom] = useState<string>(String(initialSchedule.lessonFeeTermly ?? 6000));
  const [lessonPaid, setLessonPaid] = useState<string>('0');

  // Receipt & Payment Agreement
  const [receiptNo, setReceiptNo] = useState<string>('');
  const [hasAgreedPayment, setHasAgreedPayment] = useState<boolean>(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Helper to apply class-specific fee schedule
  const handleClassChange = (newClass: string) => {
    setStudentClass(newClass);
    const sched = getClassFeeSchedule(activeSchool, newClass);
    setAdmissionFee(String(sched.admissionFee));
    setAdmissionPaid(String(sched.admissionFee));
    setExamFee(String(sched.examFee));
    setExamPaid(String(sched.examFee));
    if (!isExemptFromSchoolFee) {
      setSchoolFee(String(sched.tuitionFee));
      setSchoolPaid(String(sched.tuitionFee));
    }
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

  // Sync lesson fee with option
  useEffect(() => {
    const currentClassSchedule = getClassFeeSchedule(activeSchool, studentClass);
    let fee = currentClassSchedule.lessonFeeTermly;
    if (lessonOption === '1_month') fee = currentClassSchedule.lessonFeeMonthly;
    else if (lessonOption === '2_months') fee = currentClassSchedule.lessonFeeMonthly * 2;
    else if (lessonOption === 'termly') fee = currentClassSchedule.lessonFeeTermly;
    else if (lessonOption === 'none') fee = 0;
    
    setLessonFeeCustom(String(fee));
    setLessonPaid(String(fee));
  }, [lessonOption, studentClass, activeSchool]);

  // Reset form when modal opens (Leave student ID blank for manual filling)
  useEffect(() => {
    if (isOpen) {
      const cls = activeSchool?.classes?.[0] || 'JSS 1';
      const sched = getClassFeeSchedule(activeSchool, cls);
      
      setStudentId('');
      setFullName('');
      setStudentClass(cls);
      setAdmissionFee(String(sched.admissionFee));
      setAdmissionPaid(String(sched.admissionFee));
      setExamFee(String(sched.examFee));
      setExamPaid(String(sched.examFee));
      setSchoolFee(String(sched.tuitionFee));
      setSchoolPaid(String(sched.tuitionFee));
      setIsExemptFromSchoolFee(false);
      setScholarshipNotes('');
      setLessonOption('termly');
      setLessonFeeCustom(String(sched.lessonFeeTermly));
      setLessonPaid(String(sched.lessonFeeTermly));
      setReceiptNo('');
      setHasAgreedPayment(false);
      setErrorMessage(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentFeeSchedule = getClassFeeSchedule(activeSchool, studentClass);
  const currentTuition = currentFeeSchedule.tuitionFee;

  // Numerical values
  const parsedAdmissionFee = Math.max(0, Number(admissionFee) || 0);
  const parsedAdmissionPaid = Math.max(0, Number(admissionPaid) || 0);
  
  const parsedExamFee = Math.max(0, Number(examFee) || 0);
  const parsedExamPaid = Math.max(0, Number(examPaid) || 0);

  const rawSchoolFee = Math.max(0, Number(schoolFee) || 0);
  const rawSchoolPaid = Math.max(0, Number(schoolPaid) || 0);
  
  const effectiveSchoolFee = isExemptFromSchoolFee ? 0 : rawSchoolFee;
  const effectiveSchoolPaid = isExemptFromSchoolFee ? 0 : rawSchoolPaid;
  const schoolBalance = calculateBalance(effectiveSchoolFee, effectiveSchoolPaid);
  const schoolStatus = isExemptFromSchoolFee ? 'fully_paid' : calculateStatus(effectiveSchoolFee, effectiveSchoolPaid);

  const parsedLessonFee = Math.max(0, Number(lessonFeeCustom) || 0);
  const parsedLessonPaid = Math.max(0, Number(lessonPaid) || 0);

  // Grand totals across all enrolment fees
  const totalEnrolmentFee = parsedAdmissionFee + parsedExamFee + effectiveSchoolFee + parsedLessonFee;
  const totalEnrolmentPaid = parsedAdmissionPaid + parsedExamPaid + effectiveSchoolPaid + parsedLessonPaid;
  const grandBalance = Math.max(0, totalEnrolmentFee - totalEnrolmentPaid);

  // Action helpers
  const handlePayFullSchoolFee = () => {
    setSchoolPaid(String(rawSchoolFee));
  };

  const handlePayAllInFull = () => {
    setAdmissionPaid(String(parsedAdmissionFee));
    setExamPaid(String(parsedExamFee));
    if (!isExemptFromSchoolFee) {
      setSchoolPaid(String(rawSchoolFee));
    }
    setLessonPaid(String(parsedLessonFee));
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
      setErrorMessage('Please enter the student full name.');
      return;
    }

    if (!isExemptFromSchoolFee && rawSchoolFee <= 0) {
      setErrorMessage('School Fee amount must be greater than zero.');
      return;
    }

    if (parsedAdmissionPaid < parsedAdmissionFee && parsedAdmissionFee > 0) {
      setErrorMessage(`Admission fee of ${currencySymbol}${parsedAdmissionFee.toLocaleString()} must be fully paid prior to admitting.`);
      return;
    }

    if (parsedExamPaid < parsedExamFee && parsedExamFee > 0) {
      setErrorMessage(`Exam fee of ${currencySymbol}${parsedExamFee.toLocaleString()} must be fully paid prior to admitting.`);
      return;
    }

    if (parsedAdmissionPaid > parsedAdmissionFee) {
      setErrorMessage(`Overpayment blocked: Admission Paid (${formatCurrency(parsedAdmissionPaid, currencySymbol)}) cannot exceed Admission Fee (${formatCurrency(parsedAdmissionFee, currencySymbol)}).`);
      return;
    }
    if (parsedExamPaid > parsedExamFee) {
      setErrorMessage(`Overpayment blocked: Exam Paid (${formatCurrency(parsedExamPaid, currencySymbol)}) cannot exceed Exam Fee (${formatCurrency(parsedExamFee, currencySymbol)}).`);
      return;
    }
    if (!isExemptFromSchoolFee && effectiveSchoolPaid > effectiveSchoolFee) {
      setErrorMessage(`Overpayment blocked: School Fee Paid (${formatCurrency(effectiveSchoolPaid, currencySymbol)}) cannot exceed School Fee (${formatCurrency(effectiveSchoolFee, currencySymbol)}).`);
      return;
    }
    if (parsedLessonPaid > parsedLessonFee) {
      setErrorMessage(`Overpayment blocked: Lesson Paid (${formatCurrency(parsedLessonPaid, currencySymbol)}) cannot exceed Lesson Fee (${formatCurrency(parsedLessonFee, currencySymbol)}).`);
      return;
    }

    setIsSubmitting(true);
    try {
      const totalStudentFee = isExemptFromSchoolFee 
        ? (parsedAdmissionFee + parsedExamFee + parsedLessonFee) 
        : (effectiveSchoolFee + parsedAdmissionFee + parsedExamFee + parsedLessonFee);
      const totalStudentPaid = isExemptFromSchoolFee 
        ? (parsedAdmissionPaid + parsedExamPaid + parsedLessonPaid) 
        : (effectiveSchoolPaid + parsedAdmissionPaid + parsedExamPaid + parsedLessonPaid);
      const totalBalance = Math.max(0, totalStudentFee - totalStudentPaid);
      const overallStatus = calculateStatus(totalStudentFee, totalStudentPaid);

      const newRecord: StudentPaymentRecord = {
        id: studentId.trim(),
        full_name: fullName.trim(),
        class: studentClass.trim(),
        term: term.trim(),
        session: session.trim(),
        // Core Sheet Columns (Overall Total Fee)
        fee_amount: totalStudentFee,
        amount_paid: totalStudentPaid,
        balance: totalBalance,
        status: overallStatus,
        payment_date: getTodayDateString(),
        is_exempt_from_school_fee: isExemptFromSchoolFee,
        scholarship_notes: isExemptFromSchoolFee && scholarshipNotes.trim() ? scholarshipNotes.trim() : undefined,
        tuition_fee: effectiveSchoolFee,
        tuition_paid: effectiveSchoolPaid,
        tuition_status: schoolStatus,
        // Admission Fee Column
        admission_fee: parsedAdmissionFee,
        admission_paid: parsedAdmissionPaid,
        admission_status: parsedAdmissionPaid >= parsedAdmissionFee ? 'fully_paid' : 'part_payment',
        is_new_admission: true,
        // Exam Fee Column
        exam_fee: parsedExamFee,
        exam_paid: parsedExamPaid,
        exam_status: parsedExamPaid >= parsedExamFee ? 'fully_paid' : 'part_payment',
        // Compulsory Lesson Fee Column
        lesson_fee: parsedLessonFee,
        lesson_paid: parsedLessonPaid,
        lesson_status: lessonOption === 'none' ? 'fully_paid' : parsedLessonFee > 0 ? (parsedLessonPaid >= parsedLessonFee ? 'fully_paid' : parsedLessonPaid > 0 ? 'part_payment' : 'unpaid') : 'unpaid',
        lesson_months: lessonOption === 'none'
          ? 'Not Enrolled'
          : parsedLessonFee > 0 
          ? (lessonOption === 'termly' ? (parsedLessonPaid >= parsedLessonFee ? 'Full Term (Paid)' : 'Full Term') : lessonOption === '2_months' ? '2 Months' : '1 Month')
          : 'Full Term',
        lesson_disabled: lessonOption === 'none',
        // Official Receipt Reference
        receipt_no: receiptNo.trim() || undefined,
      };

      await onAddStudent(newRecord);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to enroll student in database.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/40 backdrop-blur-xs">
      <div className="w-full max-w-lg bg-white rounded-t-[32px] sm:rounded-3xl max-h-[94dvh] flex flex-col shadow-2xl border border-[#f0f0f0] overflow-hidden animate-in slide-in-from-bottom duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#f0f0f0] bg-white sticky top-0 z-10">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-[#1a1a1a] text-white flex items-center justify-center shadow-xs">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-[#1a1a1a] uppercase tracking-tight">
                New Student Enrollment
              </h3>
              <p className="text-[11px] text-[#a0a0a0] font-medium">
                Complete admission, school fee, and prerequisite setup
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            id="close-add-student-modal-btn"
            className="w-9 h-9 rounded-full bg-[#f4f4f7] text-[#1a1a1a] hover:bg-slate-200 flex items-center justify-center border border-[#eee]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4 flex-1">
          {errorMessage && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-900 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span className="font-semibold">{errorMessage}</span>
            </div>
          )}

          {/* Quick Action: Pay All In Full */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-100 p-3.5 rounded-2xl flex items-center justify-between">
            <div>
              <p className="text-xs font-black text-[#2563eb]">Quick Enrolment Action</p>
              <p className="text-[11px] text-[#555]">Set full payment for all selected fees with 1 click</p>
            </div>
            <button
              type="button"
              onClick={handlePayAllInFull}
              id="pay-all-fees-full-btn"
              className="px-3.5 py-2 bg-[#2563eb] text-white text-xs font-black rounded-xl hover:bg-blue-700 active:scale-95 transition-all flex items-center gap-1.5 shadow-sm shadow-blue-500/20"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Pay All in Full</span>
            </button>
          </div>

          {/* Student ID & Full Name */}
          <div>
            <label className="block text-[10px] font-black text-[#a0a0a0] uppercase tracking-wider mb-1">
              Student Full Name *
            </label>
            <input
              type="text"
              required
              id="new-student-fullname"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Sarah Adebayo"
              className="w-full px-4 py-2.5 text-sm font-bold bg-[#f4f4f7] rounded-2xl border-none text-[#1a1a1a] placeholder:text-[#a0a0a0] focus:ring-2 focus:ring-[#2563eb] focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-[10px] font-black text-[#a0a0a0] uppercase tracking-wider">
                  Student ID
                </label>
                <button
                  type="button"
                  onClick={() => setStudentId(generateStudentId(students || existingCount, studentClass))}
                  className="text-[9px] text-blue-600 font-bold hover:underline"
                >
                  Auto ({studentClass && (studentClass.toLowerCase().startsWith('jss') || studentClass.toLowerCase().startsWith('ss')) ? 'DSS/0001' : 'DNPS/0001'})
                </button>
              </div>
              <input
                type="text"
                required
                id="new-student-id"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                placeholder="e.g. DNPS/0001 or DSS/0001"
                className="w-full px-3 py-2 text-xs font-mono font-bold bg-[#f4f4f7] rounded-2xl border-none text-[#1a1a1a] focus:ring-2 focus:ring-[#2563eb] focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-[#a0a0a0] uppercase tracking-wider mb-1">
                Class
              </label>
              <input
                type="text"
                required
                id="new-student-class"
                list="standard-classes-list-modal"
                value={studentClass}
                onChange={(e) => handleClassChange(e.target.value)}
                placeholder="e.g. JSS 1"
                className="w-full px-3 py-2 text-xs font-bold bg-[#f4f4f7] rounded-2xl border-none text-[#1a1a1a] focus:ring-2 focus:ring-[#2563eb] focus:outline-none"
              />
              <datalist id="standard-classes-list-modal">
                {STANDARD_CLASSES.map((cls) => (
                  <option key={cls} value={cls} />
                ))}
              </datalist>
            </div>
            <div>
              <label className="block text-[10px] font-black text-[#a0a0a0] uppercase tracking-wider mb-1">
                Term
              </label>
              <select
                id="new-student-term"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                className="w-full px-2.5 py-2 text-xs font-semibold bg-[#f4f4f7] rounded-2xl border border-[#eee] text-[#1a1a1a] focus:ring-2 focus:ring-[#2563eb] focus:outline-none"
              >
                <option value="1st Term">1st Term</option>
                <option value="2nd Term">2nd Term</option>
                <option value="3rd Term">3rd Term</option>
              </select>
            </div>
          </div>

          {/* Section 1: Admission Fee Column & Mandatory Exam Fee */}
          <div className="bg-[#fcfcfe] rounded-2xl p-4 border border-[#e8e8ed] space-y-3 shadow-xs">
            <div className="flex items-center justify-between pb-1 border-b border-[#f0f0f0]">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <h4 className="text-xs font-black text-[#1a1a1a] uppercase tracking-wider">
                  Admission Fee Column & Enrolment Fees
                </h4>
              </div>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                Enrolment Record
              </span>
            </div>

            {/* Admission Fee Column (₦4,000 default, custom/editable) */}
            <div className="p-3 bg-white rounded-xl border border-[#eee] space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-[11px] font-black text-[#1a1a1a] uppercase flex items-center gap-1.5">
                  <span>1. Admission Fee Column</span>
                  <span className="text-[9px] font-bold text-[#2563eb] bg-blue-50 px-1.5 py-0.2 rounded border border-blue-100">
                    admission_fee
                  </span>
                </label>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                  ₦4,000 Standard
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[9px] text-[#777] uppercase font-bold">Admission Fee ({currencySymbol})</span>
                  <input
                    type="number"
                    min="0"
                    required
                    id="new-student-admission-fee"
                    value={admissionFee}
                    onChange={(e) => setAdmissionFee(e.target.value)}
                    placeholder="4000"
                    className="w-full px-3 py-1.5 text-xs font-bold bg-[#f4f4f7] rounded-xl border border-[#eee] text-[#1a1a1a] focus:ring-2 focus:ring-[#2563eb] focus:outline-none"
                  />
                </div>
                <div>
                  <span className="text-[9px] text-[#777] uppercase font-bold">Admission Paid ({currencySymbol})</span>
                  <input
                    type="number"
                    min="0"
                    required
                    id="new-student-admission-paid"
                    value={admissionPaid}
                    onChange={(e) => setAdmissionPaid(e.target.value)}
                    placeholder="4000"
                    className="w-full px-3 py-1.5 text-xs font-black bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 focus:ring-2 focus:ring-emerald-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Exam Fee (₦1,000) */}
            <div className="p-3 bg-white rounded-xl border border-[#eee] space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-[11px] font-black text-[#1a1a1a] uppercase">
                  2. Exam Fee (₦1,000 Required)
                </label>
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                  ₦1,000 Fixed
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[9px] text-[#777] uppercase font-bold">Fee Amount</span>
                  <input
                    type="number"
                    min="0"
                    required
                    id="new-student-exam-fee"
                    value={examFee}
                    onChange={(e) => setExamFee(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs font-bold bg-[#f4f4f7] rounded-xl border border-[#eee] text-[#1a1a1a]"
                  />
                </div>
                <div>
                  <span className="text-[9px] text-[#777] uppercase font-bold">Amount Paid (₦)</span>
                  <input
                    type="number"
                    min="0"
                    required
                    id="new-student-exam-paid"
                    value={examPaid}
                    onChange={(e) => setExamPaid(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs font-black bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: School Fee (Tuition) & Scholarship */}
          <div className="bg-white rounded-2xl p-4 border border-[#e8e8ed] space-y-2.5 shadow-xs">
            <div className="flex items-center justify-between pb-1 border-b border-[#f0f0f0]">
              <div className="flex items-center gap-1.5">
                <GraduationCap className="w-4 h-4 text-[#2563eb]" />
                <h4 className="text-xs font-black text-[#1a1a1a] uppercase tracking-wider">
                  School Fee (Tuition)
                </h4>
              </div>
              {!isExemptFromSchoolFee && (
                <button
                  type="button"
                  onClick={handlePayFullSchoolFee}
                  id="pay-full-school-fee-btn"
                  className="text-[10px] font-bold text-[#2563eb] bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100 hover:bg-blue-100 transition-colors"
                >
                  Pay Full ({currencySymbol}{rawSchoolFee})
                </button>
              )}
            </div>

            {/* Scholarship Toggle Checkbox */}
            <div className="p-3 bg-amber-50/80 rounded-xl border border-amber-200/80 space-y-1.5">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  id="new-student-scholarship-toggle"
                  checked={isExemptFromSchoolFee}
                  onChange={(e) => {
                    setIsExemptFromSchoolFee(e.target.checked);
                    if (e.target.checked) {
                      setSchoolFee('0');
                      setSchoolPaid('0');
                    } else {
                      setSchoolFee(String(currentTuition));
                      setSchoolPaid(String(currentTuition));
                    }
                  }}
                  className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-amber-300"
                />
                <span className="text-xs font-black text-amber-950 flex items-center gap-1">
                  <span>⭐ Student on Scholarship (Exempt from School Fee Alone)</span>
                </span>
              </label>
              <p className="text-[10px] text-amber-800 leading-snug">
                Student will not be billed for school fee ({currencySymbol}0), but must still pay admission, exam, and lesson fees.
              </p>
              {isExemptFromSchoolFee && (
                <input
                  type="text"
                  id="new-student-scholarship-notes"
                  value={scholarshipNotes}
                  onChange={(e) => setScholarshipNotes(e.target.value)}
                  placeholder="Scholarship / Exemption notes (e.g. Merit Award)"
                  className="w-full px-3 py-1.5 text-xs bg-white rounded-lg border border-amber-200 text-amber-950 placeholder:text-amber-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
                />
              )}
            </div>

            {!isExemptFromSchoolFee && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[9px] font-bold text-[#666] uppercase mb-1">
                    School Fee Amount ({currencySymbol})
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    id="new-student-school-fee"
                    value={schoolFee}
                    onChange={(e) => setSchoolFee(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-bold bg-[#f4f4f7] rounded-xl border border-[#eee] text-[#1a1a1a] focus:ring-2 focus:ring-[#2563eb] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[9px] font-bold text-[#666] uppercase mb-1">
                    Initial Payment Made ({currencySymbol})
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    id="new-student-school-paid"
                    value={schoolPaid}
                    onChange={(e) => setSchoolPaid(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-black bg-[#f4f4f7] rounded-xl border border-[#eee] text-[#1a1a1a] focus:ring-2 focus:ring-[#2563eb] focus:outline-none"
                  />
                </div>
              </div>
            )}

            {/* Live School Fee Status Preview */}
            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#f8f8fb] text-xs">
              <span className="text-[11px] font-bold text-[#666]">
                School Fee Balance: <strong className="text-[#1a1a1a]">{formatCurrency(schoolBalance, currencySymbol)}</strong>
              </span>
              <StatusBadge status={schoolStatus} size="sm" />
            </div>
          </div>

          {/* Section 3: Compulsory Lesson Fee */}
          <div className="bg-white rounded-2xl p-4 border border-[#e8e8ed] space-y-2.5 shadow-xs">
            <div className="flex items-center justify-between pb-1 border-b border-[#f0f0f0]">
              <div className="flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-[#2563eb]" />
                <h4 className="text-xs font-black text-[#1a1a1a] uppercase tracking-wider">
                  Compulsory Lesson Fee
                </h4>
              </div>
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                Auto-Enrolled
              </span>
            </div>

            <div className="grid grid-cols-4 gap-1.5">
              <button
                type="button"
                onClick={() => setLessonOption('none')}
                id="lesson-opt-none"
                className={`py-2 px-1 rounded-xl text-[10px] font-black border transition-all ${
                  lessonOption === 'none'
                    ? 'bg-[#1a1a1a] text-white border-[#1a1a1a] shadow-xs'
                    : 'bg-[#f4f4f7] text-[#666] border-[#eee] hover:bg-slate-100'
                }`}
              >
                No Lesson
              </button>
              <button
                type="button"
                onClick={() => setLessonOption('1_month')}
                id="lesson-opt-1mo"
                className={`py-2 px-1 rounded-xl text-[10px] font-black border transition-all ${
                  lessonOption === '1_month'
                    ? 'bg-[#2563eb] text-white border-[#2563eb] shadow-xs'
                    : 'bg-[#f4f4f7] text-[#666] border-[#eee] hover:bg-slate-100'
                }`}
              >
                1 Mo ({formatCurrency(currentFeeSchedule.lessonFeeMonthly, currencySymbol)})
              </button>
              <button
                type="button"
                onClick={() => setLessonOption('2_months')}
                id="lesson-opt-2mo"
                className={`py-2 px-1 rounded-xl text-[10px] font-black border transition-all ${
                  lessonOption === '2_months'
                    ? 'bg-[#2563eb] text-white border-[#2563eb] shadow-xs'
                    : 'bg-[#f4f4f7] text-[#666] border-[#eee] hover:bg-slate-100'
                }`}
              >
                2 Mos ({formatCurrency(currentFeeSchedule.lessonFeeMonthly * 2, currencySymbol)})
              </button>
              <button
                type="button"
                onClick={() => setLessonOption('termly')}
                id="lesson-opt-termly"
                className={`py-2 px-1 rounded-xl text-[10px] font-black border transition-all ${
                  lessonOption === 'termly'
                    ? 'bg-[#2563eb] text-white border-[#2563eb] shadow-xs'
                    : 'bg-[#f4f4f7] text-[#666] border-[#eee] hover:bg-slate-100'
                }`}
              >
                Full Term ({formatCurrency(currentFeeSchedule.lessonFeeTermly, currencySymbol)})
              </button>
            </div>

            {lessonOption !== 'none' && (
              <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-100 flex items-center justify-between text-xs animate-in fade-in duration-150">
                <span className="font-semibold text-blue-950">
                  Lesson Fee: <strong>{formatCurrency(parsedLessonFee, currencySymbol)}</strong>
                </span>
                <span className="font-bold text-blue-700 bg-white px-2 py-0.5 rounded-md border border-blue-200">
                  Paid in full (₦{parsedLessonPaid})
                </span>
              </div>
            )}
          </div>

          {/* Section 4: Manual Receipt Number for School Fee */}
          <div className="bg-[#fcfcfe] rounded-2xl p-4 border border-[#e8e8ed] space-y-2 shadow-xs">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Receipt className="w-4 h-4 text-[#2563eb]" />
                <label className="text-[11px] font-black text-[#1a1a1a] uppercase">
                  Receipt Number (Manual Entry)
                </label>
              </div>
              <span className="text-[9px] font-bold text-[#666] bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                School Fee Column (receipt_no)
              </span>
            </div>
            <p className="text-[10px] text-[#777]">
              Enter the manual receipt / physical slip number issued for this school fee payment.
            </p>
            <input
              type="text"
              id="new-student-receipt-no"
              value={receiptNo}
              onChange={(e) => setReceiptNo(e.target.value)}
              placeholder="e.g. 004821 or Booklet Slip No. (leave blank if not yet issued)"
              className="w-full px-3.5 py-2.5 text-xs font-mono font-bold bg-[#f4f4f7] rounded-xl border border-[#eee] text-[#1a1a1a] focus:ring-2 focus:ring-[#2563eb] focus:bg-white focus:outline-none transition-all placeholder:text-[#a0a0a0] placeholder:font-sans"
            />
          </div>

          {/* Grand Totals Summary Card */}
          <div className="p-4 bg-[#1a1a1a] rounded-2xl text-white space-y-2.5 shadow-lg">
            <div className="flex justify-between items-center text-white/70">
              <span className="text-[9px] uppercase font-black tracking-wider">
                Total Enrolment Settlement
              </span>
              <span className="text-[10px] font-bold bg-white/10 px-2 py-0.5 rounded-full text-white">
                New Admission
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-1 border-t border-white/10 font-mono text-xs">
              <div>
                <span className="text-[9px] text-white/60 uppercase">Total Fees</span>
                <p className="font-black text-white text-sm">
                  {formatCurrency(totalEnrolmentFee, currencySymbol)}
                </p>
              </div>
              <div>
                <span className="text-[9px] text-white/60 uppercase">Total Paid</span>
                <p className="font-black text-emerald-400 text-sm">
                  {formatCurrency(totalEnrolmentPaid, currencySymbol)}
                </p>
              </div>
              <div className="text-right">
                <span className="text-[9px] text-white/60 uppercase">Balance</span>
                <p className={`font-black text-sm ${grandBalance > 0 ? 'text-amber-300' : 'text-white'}`}>
                  {formatCurrency(grandBalance, currencySymbol)}
                </p>
              </div>
            </div>
          </div>

          {/* Section 5: Mandatory Agreement Confirmation Checkbox */}
          <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-2xl space-y-2">
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                required
                id="enrolment-agreement-checkbox"
                checked={hasAgreedPayment}
                onChange={(e) => setHasAgreedPayment(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded text-[#2563eb] focus:ring-[#2563eb]"
              />
              <span className="text-xs text-amber-950 font-semibold leading-relaxed">
                I confirm and agree that the student has fully settled the <strong>Admission Fee ({currencySymbol}{parsedAdmissionPaid})</strong>, <strong>Exam Fee ({currencySymbol}{parsedExamPaid})</strong>, School Fee ({currencySymbol}{effectiveSchoolPaid}), and Prerequisite Fees prior to enrollment.
              </span>
            </label>
          </div>

          {/* Submit Action */}
          <div className="pt-2 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              id="cancel-add-student-btn"
              className="flex-1 py-3 px-3 rounded-2xl bg-[#f4f4f7] text-[#1a1a1a] text-xs font-bold hover:bg-slate-200 border border-[#eee]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !hasAgreedPayment}
              id="save-new-student-to-sheet-btn"
              className="flex-1 py-3 px-3 rounded-2xl bg-[#2563eb] text-white text-xs font-black hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-blue-500/20 flex items-center justify-center gap-1.5 transition-all"
            >
              {isSubmitting ? (
                <span>Writing to Sheet...</span>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Agree & Enroll Student</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
