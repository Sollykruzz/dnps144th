/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useDeferredValue } from 'react';
import { 
  Search, 
  CreditCard, 
  CheckCircle2, 
  AlertCircle, 
  X,
  Printer,
  Share2,
  Copy,
  Check,
  ShieldCheck,
  Edit3

} from 'lucide-react';
import { StudentPaymentRecord, PaymentReceipt
} from '../types';
import { StatusBadge } from './StatusBadge';
import { getApplicableAdditionalFees } from '../services/schoolService';
import { 
  formatCurrency, 
  getTodayDateString,
  getClassFeeSchedule,
  computeStudentLiveFees,
  FEE_SCHEDULE

} from '../services/calculations';
import { DGOSLogo } from './DGOSLogo';
import { getStoredBranding } from '../services/brandingService';
import type { PaymentLineInput } from '../services/calculations';

interface RecordPaymentViewProps {
  students: StudentPaymentRecord[];
  currencySymbol: string;
  preselectedStudent?: StudentPaymentRecord | null;
  onClearPreselectedStudent: () => void;
  onSubmitPayment: (
    student: StudentPaymentRecord,
    lines: PaymentLineInput[],
    paymentMethod: string,
    options?: { receiptNumber?: string }
  ) => Promise<PaymentReceipt>;
  onViewStudentInList: (student: StudentPaymentRecord) => void;
  onOpenAddStudent: () => void;
  activeSchool?: import('../types').SchoolProfile;
  onOpenAdditionalFees?: () => void;
}

export const RecordPaymentView: React.FC<RecordPaymentViewProps> = ({
  students,
  currencySymbol,
  preselectedStudent,
  onClearPreselectedStudent,
  onSubmitPayment,
  onViewStudentInList,
  onOpenAddStudent,
  activeSchool,
  onOpenAdditionalFees,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<StudentPaymentRecord | null>(
    preselectedStudent || null
  );
  const [receiptNumber, setReceiptNumber] = useState<string>('');
  const [receiptError, setReceiptError] = useState<boolean>(false);
  const [paymentMethod, setPaymentMethod] = useState<string>('Cash / Bank Transfer');

  type FeeKey = 'tuition' | 'admission' | 'exam' | 'lesson' | `additional_${string}`;
  const [selectedFees, setSelectedFees] = useState<Record<string, boolean>>({});
  const [feeAmounts, setFeeAmounts] = useState<Record<string, string>>({});
  const [lessonDuration, setLessonDuration] = useState<'1_month' | '2_months' | 'termly'>('termly');
  const [submitProgress, setSubmitProgress] = useState<{ label: string; status: 'pending' | 'success' | 'error' }[]>([]);

  const selectedLessonMonthFallback = new Date().toLocaleString('default', { month: 'long' });

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [completedReceipt, setCompletedReceipt] = useState<PaymentReceipt | null>(null);

  const prevPreselectedIdRef = React.useRef<string | undefined>(undefined);

  // Sync if preselectedStudent prop actually changes
  useEffect(() => {
    if (preselectedStudent && preselectedStudent.id !== prevPreselectedIdRef.current) {
      prevPreselectedIdRef.current = preselectedStudent.id;
      setSelectedStudent(preselectedStudent);
      setSearchQuery('');
      setCompletedReceipt(null);
      setErrorMessage(null);
      setReceiptError(false);
      setReceiptNumber('');
      setShowConfirmModal(false);
      setSelectedFees({});
      setFeeAmounts({});
      setLessonDuration('termly');
      setSubmitProgress([]);
    } else if (!preselectedStudent) {
      prevPreselectedIdRef.current = undefined;
    }
  }, [preselectedStudent?.id]);

  // Autocomplete matching students with deferred value for instant input typing
  const deferredSearch = useDeferredValue(searchQuery);
  const matchingStudents = useMemo(() => {
    if (!students || !Array.isArray(students)) return [];
    if (!deferredSearch.trim()) return [];
    const q = deferredSearch.toLowerCase().trim();
    return students
      .filter(
        (s) =>
          (s?.full_name || '').toLowerCase().includes(q) ||
          (s?.id || '').toLowerCase().includes(q) ||
          (s?.class || '').toLowerCase().includes(q)
      )
      .slice(0, 6);
  }, [students, deferredSearch]);

  // Live resolved calculations for selected student
  const liveStudentFees = useMemo(() => {
    return selectedStudent ? computeStudentLiveFees(selectedStudent, activeSchool) : null;
  }, [selectedStudent, activeSchool]);

  const selectedClassSchedule = useMemo(() => {
    return getClassFeeSchedule(activeSchool, selectedStudent?.class);
  }, [activeSchool, selectedStudent?.class]);

  const studentBreakdown = liveStudentFees?.breakdown || null;

  // Additional fees applicable to current student
  const availableAdditionalFees = useMemo(() => {
    if (!activeSchool) return [];
    return getApplicableAdditionalFees(activeSchool, selectedStudent?.class, selectedStudent?.term);
  }, [activeSchool, selectedStudent?.class, selectedStudent?.term]);

  // Build the checklist of payable fee lines for the selected student
  const feeLines = useMemo(() => {
    if (!selectedStudent || !studentBreakdown) return [];
    const lines: { key: FeeKey; label: string; fee: number; paid: number; due: number }[] = [
      {
        key: 'tuition',
        label: 'Tuition / School Fee',
        fee: studentBreakdown.tuitionFee,
        paid: studentBreakdown.tuitionPaid,
        due: Math.max(0, studentBreakdown.tuitionFee - studentBreakdown.tuitionPaid),
      },
      {
        key: 'admission',
        label: 'Admission Fee (New Student)',
        fee: studentBreakdown.admissionFee,
        paid: studentBreakdown.admissionPaid,
        due: Math.max(0, studentBreakdown.admissionFee - studentBreakdown.admissionPaid),
      },
      {
        key: 'exam',
        label: 'Exam Fee',
        fee: studentBreakdown.examFee,
        paid: studentBreakdown.examPaid,
        due: Math.max(0, studentBreakdown.examFee - studentBreakdown.examPaid),
      },
      {
        key: 'lesson',
        label: 'Lesson Fee',
        fee: studentBreakdown.lessonFee,
        paid: studentBreakdown.lessonPaid,
        due: Math.max(0, studentBreakdown.lessonFee - studentBreakdown.lessonPaid),
      },
    ];
    availableAdditionalFees.forEach((af) => {
      const record = studentBreakdown.additionalFees?.find((f) => f.feeId === af.id);
      const feeAmt = record?.amount ?? af.amount;
      const paidAmt = record?.amountPaid || 0;
      lines.push({
        key: `additional_${af.id}` as FeeKey,
        label: af.name,
        fee: feeAmt,
        paid: paidAmt,
        due: Math.max(0, feeAmt - paidAmt),
      });
    });
    return lines.filter((l) => l.fee > 0 || l.paid > 0);
  }, [selectedStudent, studentBreakdown, availableAdditionalFees]);

  const selectedFeeKeys = useMemo(
    () => feeLines.filter((l) => selectedFees[l.key]).map((l) => l.key),
    [feeLines, selectedFees]
  );

  const totalSelectedAmount = useMemo(
    () => selectedFeeKeys.reduce((sum, key) => sum + (Number(feeAmounts[key]) || 0), 0),
    [selectedFeeKeys, feeAmounts]
  );

  const tuitionLine = feeLines.find((l) => l.key === 'tuition');
  const tuitionAmount = Number(feeAmounts['tuition']) || 0;
  const tuitionRequiresReceipt =
    selectedFees['tuition'] && tuitionLine
      ? tuitionAmount >= tuitionLine.due || tuitionAmount >= tuitionLine.fee
      : false;

  const handleToggleFee = (line: { key: FeeKey; due: number }) => {
    setSelectedFees((prev) => {
      const next = { ...prev, [line.key]: !prev[line.key] };
      if (next[line.key] && !feeAmounts[line.key]) {
        setFeeAmounts((amts) => ({ ...amts, [line.key]: String(line.due) }));
      }
      return next;
    });
    setErrorMessage(null);
  };

  const handleFeeAmountChange = (key: string, value: string) => {
    setFeeAmounts((prev) => ({ ...prev, [key]: value }));
    setErrorMessage(null);
  };

  const handleLessonDurationChange = (opt: '1_month' | '2_months' | 'termly') => {
    setLessonDuration(opt);
    const monthly = selectedClassSchedule.lessonFeeMonthly;
    const termly = selectedClassSchedule.lessonFeeTermly;
    const amt = opt === '1_month' ? monthly : opt === '2_months' ? monthly * 2 : termly;
    setFeeAmounts((prev) => ({ ...prev, lesson: String(amt) }));
  };

  const handleSelectStudent = (student: StudentPaymentRecord) => {
    setSelectedStudent(student);
    setSearchQuery('');
    setErrorMessage(null);
    setReceiptError(false);
    setReceiptNumber('');
    setSelectedFees({});
    setFeeAmounts({});
    setLessonDuration('termly');
    setSubmitProgress([]);
  };

  const handleClearStudent = () => {
    setSelectedStudent(null);
    setSearchQuery('');
    setSelectedFees({});
    setFeeAmounts({});
    setLessonDuration('termly');
    setSubmitProgress([]);
    setReceiptNumber('');
    setReceiptError(false);
    setErrorMessage(null);
    setShowConfirmModal(false);
    onClearPreselectedStudent();
  };

  const handleOpenConfirmation = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setReceiptError(false);

    if (!selectedStudent) {
      setErrorMessage('Please search and select a student first.');
      return;
    }

    if (selectedFeeKeys.length === 0) {
      setErrorMessage('Please select at least one fee to pay.');
      return;
    }

    const missingAmounts = selectedFeeKeys.filter((key) => !(Number(feeAmounts[key]) > 0));
    if (missingAmounts.length > 0) {
      const labels = missingAmounts
        .map((key) => feeLines.find((l) => l.key === key)?.label || key)
        .join(', ');
      setErrorMessage(`Please enter an amount for: ${labels}.`);
      return;
    }

    const overpaidLines = selectedFeeKeys
      .map((key) => {
        const line = feeLines.find((l) => l.key === key);
        const amt = Number(feeAmounts[key]) || 0;
        // Same 0.005 tolerance as the payment engine, so 0.1 + 0.2 style rounding never blocks a valid amount
        if (line && amt > line.due + 0.005) {
          return `${line.label} (Entered: ${currencySymbol}${amt.toLocaleString()}, Max Due: ${currencySymbol}${line.due.toLocaleString()})`;
        }
        return null;
      })
      .filter(Boolean);

    if (overpaidLines.length > 0) {
      setErrorMessage(`Overpayment is not allowed! Amount exceeds remaining balance due for: ${overpaidLines.join('; ')}.`);
      return;
    }

    if (tuitionRequiresReceipt && !receiptNumber.trim()) {
      setReceiptError(true);
      setErrorMessage('Receipt No. is required when recording a full Tuition/School Fee payment.');
      const input = document.getElementById('payment-receipt-no-input');
      if (input) input.focus();
      return;
    }

    setShowConfirmModal(true);
  };

  // Blocks a second tap while the first save is still running (state updates are asynchronous)
  const submitLockRef = React.useRef(false);

  const handleConfirmAndSubmit = async () => {
    if (!selectedStudent || selectedFeeKeys.length === 0) return;
    if (submitLockRef.current) return;

    if (tuitionRequiresReceipt && !receiptNumber.trim()) {
      setReceiptError(true);
      setErrorMessage('Receipt No. is required for full Tuition/School Fee payments.');
      setShowConfirmModal(false);
      return;
    }

    submitLockRef.current = true;
    setIsSubmitting(true);
    setErrorMessage(null);

    setSubmitProgress(
      selectedFeeKeys.map((key) => ({
        label: feeLines.find((l) => l.key === key)?.label || key,
        status: 'pending' as const,
      }))
    );

    const lines: PaymentLineInput[] = selectedFeeKeys.map((key) => {
      const line = feeLines.find((l) => l.key === key)!;
      const amt = Number(feeAmounts[key]) || 0;
      const categoryType: 'tuition' | 'admission' | 'lesson' | 'exam' | 'additional_fee' =
        key === 'tuition' ? 'tuition'
        : key === 'admission' ? 'admission'
        : key === 'exam' ? 'exam'
        : key === 'lesson' ? 'lesson'
        : 'additional_fee';
      return {
        amount: amt,
        feeCategory: {
          categoryType,
          lessonMonth: key === 'lesson'
            ? (lessonDuration === 'termly' ? 'Termly (Paid)' : lessonDuration === '2_months' ? '2 Months' : selectedLessonMonthFallback)
            : undefined,
          isPartPayment: amt < line.due,
          feeDescription: line.label,
          additionalFeeId: key.startsWith('additional_') ? key.replace('additional_', '') : undefined,
        },
      };
    });

    try {
      // One atomic call for the whole sitting. One receipt number for every line.
      const receipt = await onSubmitPayment(
        selectedStudent,
        lines,
        paymentMethod,
        { receiptNumber: receiptNumber.trim() || undefined }
      );
      setSubmitProgress((prev) => prev.map((p) => ({ ...p, status: 'success' as const })));
      submitLockRef.current = false;
      setIsSubmitting(false);
      setCompletedReceipt(receipt);
      setShowConfirmModal(false);
    } catch (err: any) {
      setSubmitProgress((prev) => prev.map((p) => ({ ...p, status: 'error' as const })));
      submitLockRef.current = false;
      setIsSubmitting(false);
      // Do not keep a stale snapshot: pick up the latest copy of the student.
      const latest = students.find((st) => st.id === selectedStudent.id);
      if (latest) setSelectedStudent(latest);
      setErrorMessage(
        `Payment was not saved. ${err?.message || 'Unknown error.'} Nothing was recorded, so you can try again.`
      );
      setShowConfirmModal(false);
    }
  };

  const handleResetForNextPayment = () => {
    setCompletedReceipt(null);
    setSelectedStudent(null);
    setSelectedFees({});
    setFeeAmounts({});
    setLessonDuration('termly');
    setSubmitProgress([]);
    setReceiptNumber('');
    setReceiptError(false);
    setSearchQuery('');
    setErrorMessage(null);
    setShowConfirmModal(false);
    onClearPreselectedStudent();
  };

  const [copiedReceipt, setCopiedReceipt] = useState(false);

  const getReceiptShareText = (receipt: PaymentReceipt): string => {
    const schoolName = activeSchool?.name || getStoredBranding(activeSchool?.id).appName || 'Dominion Group Of Schools';
    const lines = [
      `*🧾 OFFICIAL PAYMENT RECEIPT*`,
      `*${schoolName}*`,
      `--------------------------------`,
      `*Student:* ${receipt.studentName}`,
      `*ID:* #${receipt.studentId} | *Class:* ${receipt.studentClass}`,
      `*Receipt No:* ${receipt.receiptNumber || 'Official Record'}`,
      `*Date:* ${receipt.paymentDate}`,
      `*Term:* ${receipt.term} ${receipt.session ? `(${receipt.session})` : ''}`,
      receipt.items && receipt.items.length > 1
        ? `*Payment Items:*\n${receipt.items.map((i) => `  ${i.description}: ${currencySymbol}${i.amount.toLocaleString()}`).join('\n')}`
        : receipt.feeItemDescription ? `*Payment Purpose:* ${receipt.feeItemDescription}` : '',
      `*Channel:* ${receipt.paymentMethod || 'Cash / Bank Transfer'}`,
      `--------------------------------`,
      `*Amount Paid Now:* ${currencySymbol}${receipt.amountPaidNow.toLocaleString()}`,
      `*Total Cumulative Paid:* ${currencySymbol}${receipt.totalPaid.toLocaleString()}`,
      `*Remaining Balance:* ${currencySymbol}${receipt.remainingBalance.toLocaleString()}`,
      `*Status:* ${receipt.status.toUpperCase().replace('_', ' ')}`,
      `--------------------------------`,
      `_Verified School Bursary Record • Thank you!_`
    ].filter(Boolean);
    return lines.join('\n');
  };

  const handleShareReceipt = async () => {
    if (!completedReceipt) return;
    const text = getReceiptShareText(completedReceipt);
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: `Payment Receipt - ${completedReceipt.studentName}`,
          text: text,
        });
        return;
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.warn('Share error, using WhatsApp fallback:', err);
        } else {
          return;
        }
      }
    }
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
    if (typeof window !== 'undefined') {
      window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const handleCopyReceipt = async () => {
    if (!completedReceipt) return;
    const text = getReceiptShareText(completedReceipt);
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        setCopiedReceipt(true);
        setTimeout(() => setCopiedReceipt(false), 2500);
      }
    } catch {
      // Fallback if clipboard API restricted
    }
  };

  const handlePrintReceipt = () => {
    try {
      if (typeof window !== 'undefined' && typeof window.print === 'function') {
        window.print();
      }
    } catch (e) {
      console.warn('Print action blocked or not supported in iframe context:', e);
    }
  };

  return (
    <div className="flex-1 pb-32 px-3 sm:px-5 pt-3 sm:pt-4 space-y-3 sm:space-y-4 max-w-xl mx-auto w-full">
      {/* State A: Completed Payment Receipt Screen */}
      {completedReceipt ? (
        <div className="space-y-3 sm:space-y-4">
          {/* Mobile-Friendly Success Banner */}
          <div className="bg-emerald-50 border border-emerald-200/80 rounded-2xl sm:rounded-3xl p-3.5 sm:p-4 text-center space-y-1 sm:space-y-1.5 animate-in fade-in zoom-in-95 duration-200 shadow-2xs">
            <div className="w-10 h-10 rounded-xl sm:rounded-2xl bg-emerald-600 text-white flex items-center justify-center mx-auto shadow-xs">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <h3 className="text-sm sm:text-base font-black text-emerald-900 uppercase tracking-tight">
              Payment Recorded Successfully
            </h3>
            <p className="text-[11px] sm:text-xs text-emerald-700 font-medium">
              Recalculated ledger balance &amp; synced official records.
            </p>
          </div>

          {/* Printable Digital Receipt Card (Optimized for Mobile Viewports & Touch Devices) */}
          <div
            id="printable-receipt"
            className="bg-white rounded-2xl sm:rounded-3xl p-4 sm:p-6 border border-slate-200/90 shadow-xs space-y-3 sm:space-y-4 font-sans relative overflow-hidden"
          >
            {/* Responsive Header: Stacks gracefully on mobile, side-by-side on desktop */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2.5 pb-3 border-b border-slate-100">
              <div className="flex items-start gap-2.5 sm:gap-3 min-w-0">
                <div className="shrink-0 pt-0.5">
                  <DGOSLogo size="sm" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[9px] sm:text-[10px] uppercase font-black text-blue-600 tracking-wider">
                      Official Payment Receipt
                    </span>
                    <span className="text-[9px] sm:text-[10px] text-slate-400 font-bold truncate max-w-[150px] sm:max-w-[220px]">
                      • {activeSchool?.name || getStoredBranding(activeSchool?.id).appName}
                    </span>
                  </div>
                  <h4 className="text-sm sm:text-base font-black text-slate-900 leading-tight mt-0.5 break-words">
                    {completedReceipt.studentName}
                  </h4>
                  <p className="text-[11px] sm:text-xs text-slate-500 font-mono mt-0.5">
                    #{completedReceipt.studentId} • <span className="font-semibold text-slate-700">{completedReceipt.studentClass}</span>
                  </p>
                </div>
              </div>

              {/* Receipt Number & Date Badge (Neat compact pill on mobile) */}
              <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-start bg-slate-50 sm:bg-transparent px-2.5 py-1.5 sm:p-0 rounded-xl sm:rounded-none border sm:border-0 border-slate-100 text-right shrink-0">
                <span className="text-[11px] sm:text-xs font-mono font-bold text-slate-800 tracking-tight">
                  {completedReceipt.receiptNumber || 'Official Record'}
                </span>
                <span className="text-[10px] sm:text-[11px] text-slate-500">
                  {completedReceipt.paymentDate}
                </span>
              </div>
            </div>

            {/* Prominent Payment Amount & Balance Card */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50/70 border border-blue-200/80 rounded-2xl p-3 sm:p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="text-[10px] sm:text-[11px] font-bold text-blue-700 uppercase tracking-wider block">
                  Amount Paid Now
                </span>
                <p className="text-xl sm:text-2xl font-black text-blue-700 tracking-tight">
                  {formatCurrency(completedReceipt.amountPaidNow, currencySymbol)}
                </p>
              </div>
              <div className="text-right shrink-0">
                <span className="text-[10px] text-slate-500 font-medium block">Balance Remaining</span>
                <p className={`text-xs sm:text-sm font-black ${completedReceipt.remainingBalance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                  {formatCurrency(completedReceipt.remainingBalance, currencySymbol)}
                </p>
                <div className="mt-1 flex justify-end">
                  <StatusBadge status={completedReceipt.status} size="sm" />
                </div>
              </div>
            </div>

            {/* Line Items Details (Compact, resilient wrapping for all phone screen widths) */}
            <div className="space-y-1.5 sm:space-y-2 text-xs">
              <div className="flex items-center justify-between py-1 border-b border-slate-100 gap-2">
                <span className="text-slate-500 shrink-0">Term / Session:</span>
                <span className="font-bold text-slate-800 text-right truncate">
                  {completedReceipt.term} {completedReceipt.session && `(${completedReceipt.session})`}
                </span>
              </div>
              {completedReceipt.items && completedReceipt.items.length > 1 ? (
                <div className="py-1 border-b border-slate-100 space-y-1">
                  <span className="text-slate-500 block">Payment Items:</span>
                  {completedReceipt.items.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between gap-2">
                      <span className="font-bold text-blue-700 truncate">{item.description}</span>
                      <span className="font-bold text-slate-800 shrink-0">{formatCurrency(item.amount, currencySymbol)}</span>
                    </div>
                  ))}
                </div>
              ) : completedReceipt.feeItemDescription ? (
                <div className="flex items-center justify-between py-1 border-b border-slate-100 gap-2">
                  <span className="text-slate-500 shrink-0">Payment Purpose:</span>
                  <span className="font-bold text-blue-700 text-right truncate max-w-[180px] sm:max-w-[260px]">
                    {completedReceipt.feeItemDescription}
                  </span>
                </div>
              ) : null}
              <div className="flex items-center justify-between py-1 border-b border-slate-100 gap-2">
                <span className="text-slate-500 shrink-0">Payment Channel:</span>
                <span className="font-bold text-slate-800 text-right">{completedReceipt.paymentMethod}</span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-100 gap-2">
                <span className="text-slate-500 shrink-0">
                  {completedReceipt.feeCategory === 'lesson' 
                    ? 'Lesson Fee Payable:' 
                    : completedReceipt.feeCategory === 'exam' 
                    ? 'Exam Fee Payable:' 
                    : completedReceipt.feeCategory === 'additional_fee'
                    ? `${completedReceipt.feeItemDescription || 'Fee'} Payable:`
                    : 'School Fee Payable:'}
                </span>
                <span className="font-bold text-slate-800 text-right">
                  {formatCurrency(completedReceipt.totalFee, currencySymbol)}
                </span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-100 gap-2">
                <span className="text-slate-500 shrink-0">Total Cumulative Paid:</span>
                <span className="font-bold text-slate-800 text-right">
                  {formatCurrency(completedReceipt.totalPaid, currencySymbol)}
                </span>
              </div>
              <div className="flex items-center justify-between py-1 border-b border-slate-100 gap-2">
                <span className="text-slate-500 shrink-0">Remaining Balance:</span>
                <span className={`font-bold text-right ${completedReceipt.remainingBalance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                  {formatCurrency(completedReceipt.remainingBalance, currencySymbol)}
                </span>
              </div>
            </div>

            {/* Receipt Footer */}
            <div className="pt-2 text-[10px] text-center text-slate-400 border-t border-slate-100 space-y-0.5">
              <p>{getStoredBranding(activeSchool?.id).receiptFooterText || 'Official payment record • Verified Bursary Access'}</p>
              <p className="text-[9px] text-slate-400 font-mono">Verified Bursary Access • {getTodayDateString()}</p>
            </div>
          </div>

          {/* Action Buttons for Receipt (Mobile-optimized action bar with WhatsApp/Share & Copy) */}
          <div className="space-y-2 no-print">
            {/* Primary Action Button (Thumb-friendly full-width) */}
            <button
              onClick={handleResetForNextPayment}
              id="record-another-payment-btn"
              className="w-full py-3.5 px-4 rounded-2xl bg-blue-600 text-white text-xs sm:text-sm font-black hover:bg-blue-700 active:scale-[0.99] flex items-center justify-center gap-2 shadow-md shadow-blue-500/25 transition-all min-h-[48px]"
            >
              <CreditCard className="w-4 h-4 shrink-0" />
              <span>Record Next Payment</span>
            </button>

            {/* Secondary Actions: Share, Copy, Print */}
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={handleShareReceipt}
                id="share-whatsapp-receipt-btn"
                className="py-2.5 px-2 rounded-2xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-200/80 active:scale-95 flex items-center justify-center gap-1.5 transition-all min-h-[44px]"
                title="Share receipt via WhatsApp or SMS"
              >
                <Share2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="truncate">Share</span>
              </button>

              <button
                type="button"
                onClick={handleCopyReceipt}
                id="copy-receipt-btn"
                className="py-2.5 px-2 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold border border-slate-200 active:scale-95 flex items-center justify-center gap-1.5 transition-all min-h-[44px]"
                title="Copy formatted receipt text"
              >
                {copiedReceipt ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span className="text-emerald-700 font-bold truncate">Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                    <span className="truncate">Copy</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handlePrintReceipt}
                id="print-receipt-btn"
                className="py-2.5 px-2 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold border border-slate-200 active:scale-95 flex items-center justify-center gap-1.5 transition-all min-h-[44px]"
                title="Print digital receipt"
              >
                <Printer className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                <span className="truncate">Print</span>
              </button>
            </div>

            {selectedStudent && (
              <button
                type="button"
                onClick={() => onViewStudentInList(selectedStudent)}
                className="w-full py-2.5 px-3 rounded-2xl bg-white border border-slate-200 text-slate-700 text-xs font-bold hover:bg-slate-50 flex items-center justify-center gap-1.5 transition-all shadow-2xs min-h-[40px]"
              >
                <Edit3 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span className="truncate">Edit Student Fees (Exam, Lesson, Tuition)</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        /* State B: Payment Recording Form */
        <form onSubmit={handleOpenConfirmation} className="space-y-4">
          <div className="bg-white rounded-3xl p-5 border border-[#f0f0f0] shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-black uppercase tracking-wider text-[#1a1a1a]">Step 1: Select Student</h2>
              <span className="text-[10px] font-bold text-[#a0a0a0] uppercase">Required</span>
            </div>

            {/* If Student Selected */}
            {selectedStudent ? (
              <div className="bg-[#f4f4f7] rounded-2xl p-4 border border-[#eee] space-y-2 relative">
                <button
                  type="button"
                  onClick={handleClearStudent}
                  id="change-selected-student-btn"
                  className="absolute right-3 top-3 text-xs text-[#1a1a1a] hover:bg-slate-200 bg-white border border-[#eee] px-2.5 py-1 rounded-full font-bold shadow-2xs"
                >
                  Change
                </button>
                <div>
                  <span className="text-[10px] font-mono font-bold text-[#a0a0a0] uppercase">
                    #{selectedStudent.id}
                  </span>
                  <h3 className="text-base font-bold text-[#1a1a1a] pr-16">{selectedStudent.full_name}</h3>
                  <p className="text-xs text-[#666] mt-0.5">
                    {selectedStudent.class || 'No Class'} • {selectedStudent.term || 'No Term'}
                  </p>
                </div>

                {/* Financial Summary */}
                <div className="grid grid-cols-3 gap-2 text-center pt-2.5 border-t border-[#eee] text-xs">
                  <div>
                    <span className="text-[9px] text-[#a0a0a0] uppercase font-bold">Fee</span>
                    <p className="font-bold text-[#1a1a1a]">
                      {formatCurrency(liveStudentFees?.totalFee ?? selectedStudent.fee_amount, currencySymbol)}
                    </p>
                  </div>
                  <div>
                    <span className="text-[9px] text-[#a0a0a0] uppercase font-bold">Paid</span>
                    <p className="font-bold text-[#10b981]">
                      {formatCurrency(liveStudentFees?.amountPaid ?? selectedStudent.amount_paid, currencySymbol)}
                    </p>
                  </div>
                  <div>
                    <span className="text-[9px] text-[#a0a0a0] uppercase font-bold">Balance</span>
                    <p
                      className={`font-bold ${
                        (liveStudentFees?.balance ?? selectedStudent.balance) > 0 ? 'text-[#ef4444]' : 'text-[#10b981]'
                      }`}
                    >
                      {formatCurrency(liveStudentFees?.balance ?? selectedStudent.balance, currencySymbol)}
                    </p>
                  </div>
                </div>

                {/* Shortcut to view/edit student fee details */}
                <div className="pt-2 border-t border-[#eee] flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => onViewStudentInList(selectedStudent)}
                    className="text-[11px] font-bold text-[#2563eb] hover:text-blue-800 hover:underline flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Edit3 className="w-3 h-3" />
                    <span>Edit Fees (Exam, Lesson, Tuition)</span>
                  </button>
                  <span className="text-[10px] text-[#a0a0a0]">
                    Editable after payment
                  </span>
                </div>
              </div>
            ) : (
              /* Student Search Box */
              <div className="space-y-2">
                <div className="relative">
                  <input
                    type="text"
                    id="payment-search-student-input"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search student..."
                    className="w-full bg-[#f4f4f7] border-none rounded-2xl py-3 pl-11 pr-9 text-sm text-[#1a1a1a] placeholder:text-[#a0a0a0] focus:ring-2 focus:ring-[#2563eb] focus:outline-none transition-all"
                  />
                  <Search className="w-4 h-4 text-[#a0a0a0] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      id="clear-payment-search-btn"
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[#a0a0a0] hover:text-[#1a1a1a] p-0.5"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Autocomplete Dropdown List */}
                {matchingStudents.length > 0 && (
                  <div className="bg-white border border-[#f0f0f0] rounded-2xl shadow-lg divide-y divide-[#f0f0f0] overflow-hidden">
                    {matchingStudents.map((stu) => (
                      <button
                        key={stu.id}
                        type="button"
                        onClick={() => handleSelectStudent(stu)}
                        id={`select-stu-${stu.id}`}
                        className="w-full p-3 text-left hover:bg-[#f4f4f7] flex items-center justify-between gap-2 transition-colors"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-[#1a1a1a] truncate">{stu.full_name}</p>
                          <p className="text-[10px] text-[#a0a0a0] font-mono">
                            #{stu.id} • {stu.class} • Balance: {formatCurrency(stu.balance, currencySymbol)}
                          </p>
                        </div>
                        <StatusBadge status={stu.status} size="sm" />
                      </button>
                    ))}
                  </div>
                )}

                {searchQuery.trim() && matchingStudents.length === 0 && (
                  <div className="p-3 text-center text-xs text-[#666] bg-[#f4f4f7] rounded-2xl border border-[#eee]">
                    No students match &quot;{searchQuery}&quot;.{' '}
                    <button
                      type="button"
                      onClick={onOpenAddStudent}
                      className="text-[#2563eb] font-bold underline"
                    >
                      Enroll as new student?
                    </button>
                  </div>
                )}

                {!searchQuery && students.length === 0 && (
                  <div className="p-3 text-center text-xs text-[#666] bg-[#f4f4f7] rounded-2xl">
                    No student records found in Google Sheet. Enroll students first.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Step 2: Select Fees & Enter Amounts (Enabled when student selected) */}
          <div
            className={`bg-white rounded-3xl p-5 border border-[#f0f0f0] shadow-xs space-y-4 transition-opacity ${
              !selectedStudent ? 'opacity-40 pointer-events-none' : 'opacity-100'
            }`}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-black uppercase tracking-wider text-[#1a1a1a]">Step 2: Select Fees to Pay</h2>
              <span className="text-[10px] font-bold text-[#2563eb] uppercase">Step 2 of 2</span>
            </div>

            {selectedStudent && studentBreakdown && (
              <div className="space-y-2.5">
                {feeLines.map((line) => (
                  <div
                    key={line.key}
                    className={`rounded-2xl border transition-all ${
                      selectedFees[line.key]
                        ? 'border-[#2563eb] bg-blue-50/50'
                        : 'border-[#eee] bg-[#f9f9fb]'
                    }`}
                  >
                    <label className="flex items-center gap-3 p-3.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!selectedFees[line.key]}
                        onChange={() => handleToggleFee(line)}
                        disabled={line.due <= 0}
                        className="w-5 h-5 rounded-md border-slate-300 text-[#2563eb] focus:ring-[#2563eb] shrink-0"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-black text-[#1a1a1a] truncate">{line.label}</span>
                          <span className={`text-[11px] font-bold shrink-0 ${line.due > 0 ? 'text-[#666]' : 'text-emerald-600'}`}>
                            {line.due > 0 ? `Due: ${formatCurrency(line.due, currencySymbol)}` : 'Fully Paid'}
                          </span>
                        </div>
                      </div>
                    </label>

                    {selectedFees[line.key] && (
                      <div className="px-3.5 pb-3.5 space-y-2 animate-in fade-in duration-150">
                        {line.key === 'lesson' && (
                          <div className="flex gap-1.5">
                            {(['1_month', '2_months', 'termly'] as const).map((opt) => (
                              <button
                                key={opt}
                                type="button"
                                onClick={() => handleLessonDurationChange(opt)}
                                className={`px-2.5 py-1 text-[10px] font-bold rounded-lg border transition-all ${
                                  lessonDuration === opt
                                    ? 'bg-[#2563eb] text-white border-[#2563eb]'
                                    : 'bg-white text-[#1a1a1a] border-slate-200 hover:bg-slate-100'
                                }`}
                              >
                                {opt === '1_month' ? '1 Month' : opt === '2_months' ? '2 Months' : 'Full Term'}
                              </button>
                            ))}
                          </div>
                        )}
                        {(() => {
                          const enteredAmt = Number(feeAmounts[line.key] || 0);
                          const isOverpaying = enteredAmt > line.due;
                          return (
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-2">
                                <div className="relative flex-1">
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                                    {currencySymbol}
                                  </span>
                                  <input
                                    type="number"
                                    min="0"
                                    max={line.due}
                                    value={feeAmounts[line.key] ?? ''}
                                    onChange={(e) => handleFeeAmountChange(line.key, e.target.value)}
                                    placeholder="0"
                                    className={`w-full pl-7 pr-3 py-2 text-xs font-black bg-white border rounded-xl text-[#1a1a1a] focus:ring-2 focus:outline-none ${
                                      isOverpaying
                                        ? 'border-rose-500 bg-rose-50/40 text-rose-900 focus:ring-rose-500'
                                        : 'border-slate-200 focus:ring-[#2563eb]'
                                    }`}
                                  />
                                </div>
                                {enteredAmt > 0 && enteredAmt < line.due && (
                                  <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-1 rounded-lg shrink-0">
                                    Part Payment
                                  </span>
                                )}
                                {enteredAmt > 0 && enteredAmt !== line.due && (
                                  <button
                                    type="button"
                                    onClick={() => handleFeeAmountChange(line.key, String(line.due))}
                                    className="text-[10px] font-bold text-[#2563eb] bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2 py-1 rounded-lg shrink-0 cursor-pointer transition-colors"
                                  >
                                    Max ({formatCurrency(line.due, currencySymbol)})
                                  </button>
                                )}
                              </div>
                              {isOverpaying && (
                                <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-[10px] font-bold text-rose-800">
                                  <span>
                                    ⚠️ Overpayment blocked: Exceeds balance due ({formatCurrency(line.due, currencySymbol)}) by {formatCurrency(enteredAmt - line.due, currencySymbol)}!
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => handleFeeAmountChange(line.key, String(line.due))}
                                    className="underline font-black text-rose-900 hover:text-rose-700 shrink-0 cursor-pointer"
                                  >
                                    Cap to {formatCurrency(line.due, currencySymbol)}
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Receipt Number (required only if Tuition is checked and paid in full) */}
            {selectedStudent && (
              <div>
                <label className="text-[11px] font-bold text-[#1a1a1a] uppercase block mb-1">
                  Receipt No. {tuitionRequiresReceipt && <span className="text-rose-600">*</span>}
                </label>
                <input
                  type="text"
                  id="payment-receipt-no-input"
                  value={receiptNumber}
                  onChange={(e) => {
                    setReceiptNumber(e.target.value);
                    setReceiptError(false);
                  }}
                  placeholder="e.g. 004821"
                  className={`w-full px-3.5 py-2.5 text-xs font-mono font-bold bg-[#f4f4f7] rounded-xl border focus:ring-2 focus:outline-none transition-all ${
                    receiptError ? 'border-rose-400 ring-2 ring-rose-100' : 'border-[#eee] focus:ring-[#2563eb]'
                  }`}
                />
              </div>
            )}

            {/* Payment Method */}
            {selectedStudent && (
              <div>
                <label className="text-[11px] font-bold text-[#1a1a1a] uppercase block mb-1">Payment Method</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-xs font-bold bg-[#f4f4f7] rounded-xl border border-[#eee] text-[#1a1a1a] focus:ring-2 focus:ring-[#2563eb] focus:outline-none"
                >
                  <option>Cash / Bank Transfer</option>
                  <option>Cash</option>
                  <option>Bank Transfer</option>
                  <option>Cheque</option>
                  <option>POS</option>
                </select>
              </div>
            )}

            {/* Selected Total Summary */}
            {selectedFeeKeys.length > 0 && (
              <div className="p-4 bg-[#2563eb] rounded-2xl text-white space-y-1.5 shadow-md shadow-blue-500/10">
                <div className="flex justify-between items-center text-white/80 text-[10px] font-bold uppercase tracking-wider">
                  <span>{selectedFeeKeys.length} Fee{selectedFeeKeys.length > 1 ? 's' : ''} Selected</span>
                  <span>Date: {getTodayDateString()}</span>
                </div>
                <p className="text-2xl font-black text-white">
                  {formatCurrency(totalSelectedAmount, currencySymbol)}
                </p>
              </div>
            )}
          </div>

          {errorMessage && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-900 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Trigger Confirmation Prompt */}
          <button
            type="submit"
            disabled={!selectedStudent || selectedFeeKeys.length === 0 || isSubmitting}
            id="proceed-to-payment-confirm-btn"
            className="w-full py-4 px-4 rounded-2xl bg-[#2563eb] text-white font-black text-sm hover:bg-blue-700 active:scale-[0.99] disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
          >
            <CreditCard className="w-4 h-4" />
            <span>Review & Record Payment</span>
          </button>
        </form>
      )}

      {/* Confirmation Prompt Modal */}
      {showConfirmModal && selectedStudent && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg bg-white rounded-3xl max-h-[88dvh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="shrink-0 flex items-center justify-between px-4 py-3 sm:px-6 sm:py-3.5 border-b border-slate-100 bg-slate-50/90 backdrop-blur-xs">
              <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shadow-xs shrink-0">
                  <ShieldCheck className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm sm:text-base font-black text-slate-900 uppercase tracking-tight truncate">Confirm Payment</h3>
                  <p className="text-[10px] sm:text-[11px] text-slate-500 font-medium truncate">Verify before writing to ledger</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[11px] sm:text-xs font-black">
                  {formatCurrency(totalSelectedAmount, currencySymbol)}
                </span>
                <button
                  type="button"
                  onClick={() => setShowConfirmModal(false)}
                  id="close-confirm-modal-btn"
                  className="w-8 h-8 rounded-full bg-white text-slate-700 hover:bg-slate-200 flex items-center justify-center border border-slate-200 shadow-2xs"
                  aria-label="Close modal"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Modal Body (Scrollable, optimized for mobile viewport with immediate top action) */}
            <div className="p-3.5 sm:p-5 overflow-y-auto space-y-3 flex-1 min-h-0">
              {/* TOP PRIMARY CONFIRMATION CARD (Immediately visible at top of mobile screen) */}
              <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-3.5 sm:p-4 text-white space-y-3 shadow-md">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-blue-200 block">
                      Total Payment to Collect
                    </span>
                    <p className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                      {formatCurrency(totalSelectedAmount, currencySymbol)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <span className="text-xs font-bold text-white block truncate max-w-[140px] sm:max-w-[180px]">
                      {selectedStudent.full_name}
                    </span>
                    <span className="text-[10px] text-blue-200 font-mono">
                      #{selectedStudent.id} • {selectedStudent.class}
                    </span>
                  </div>
                </div>

                {/* Immediate Top Confirm Button for Mobile & Touch */}
                <button
                  type="button"
                  onClick={handleConfirmAndSubmit}
                  disabled={isSubmitting}
                  id="top-confirm-payment-btn"
                  className="w-full py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/20 active:scale-[0.99] transition-all disabled:opacity-50 cursor-pointer min-h-[46px]"
                >
                  {isSubmitting ? (
                    <span>Recording Payment...</span>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-white shrink-0" />
                      <span>Confirm &amp; Pay {formatCurrency(totalSelectedAmount, currencySymbol)}</span>
                    </>
                  )}
                </button>
              </div>

              {/* Fee Lines Breakdown */}
              <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200/80 space-y-2 text-xs">
                <div className="flex items-center justify-between text-[10px] font-black text-slate-500 uppercase tracking-wider">
                  <span>Selected Fees ({selectedFeeKeys.length})</span>
                  <span>Method: {paymentMethod}</span>
                </div>
                <div className="space-y-1">
                  {selectedFeeKeys.map((key) => {
                    const line = feeLines.find((l) => l.key === key);
                    const progressItem = submitProgress.find((p) => p.label === line?.label);
                    return (
                      <div key={key} className="flex items-center justify-between text-xs bg-white rounded-lg px-2.5 py-1.5 border border-slate-100">
                        <span className="font-bold text-slate-800 flex items-center gap-1.5 truncate">
                          {progressItem?.status === 'success' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                          {progressItem?.status === 'error' && <AlertCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />}
                          <span className="truncate">{line?.label}</span>
                        </span>
                        <span className="font-mono font-black text-blue-700 shrink-0 ml-2">
                          {formatCurrency(Number(feeAmounts[key]) || 0, currencySymbol)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Student Summary & Details */}
              <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200/80 space-y-1.5 text-xs">
                <div className="flex justify-between items-center pb-1 border-b border-slate-200/80">
                  <span className="text-slate-500 font-medium">Term / Session:</span>
                  <span className="font-bold text-slate-800">
                    {selectedStudent.term} ({selectedStudent.session})
                  </span>
                </div>
                <div className="flex justify-between items-center pt-0.5">
                  <span className="text-slate-500 font-medium">Receipt Number:</span>
                  <span className={`font-mono font-bold text-xs ${receiptNumber.trim() ? 'text-blue-600' : 'text-slate-400'}`}>
                    {receiptNumber.trim() || 'Auto-generated on submit'}
                  </span>
                </div>
              </div>
            </div>

            {/* Modal Actions (Bottom sticky footer with cancel & duplicate confirm) */}
            <div className="shrink-0 p-3 sm:p-4 bg-white border-t border-slate-100 shadow-[0_-4px_16px_rgba(0,0,0,0.04)] flex gap-2.5 z-10">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={isSubmitting}
                id="cancel-payment-confirm-btn"
                className="flex-1 py-3 px-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs sm:text-sm font-bold border border-slate-200 active:scale-95 transition-all flex items-center justify-center min-h-[44px]"
              >
                Modify / Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAndSubmit}
                disabled={isSubmitting}
                id="final-confirm-payment-btn"
                className="flex-[1.4] py-3 px-4 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-black disabled:opacity-50 shadow-md shadow-blue-500/25 flex items-center justify-center gap-2 active:scale-95 transition-all min-h-[44px]"
              >
                {isSubmitting ? (
                  <span>Recording Payment...</span>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>Confirm &amp; Pay</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
