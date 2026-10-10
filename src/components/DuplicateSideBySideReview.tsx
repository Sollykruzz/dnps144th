/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  X,
  GitMerge,
  Trash2,
  ArrowLeftRight,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Sparkles,
  Calendar,
  DollarSign,
  Receipt,
  GraduationCap,
  Layers,
  ArrowRight,
  ShieldCheck,
  Tag,
  FileText,
  User,
  Info,
  Clock,
  ChevronLeft,
  EyeOff
} from 'lucide-react';
import { StudentPaymentRecord, SchoolProfile, BursarSession } from '../types';
import { DuplicateGroup, mergeStudentRecords, resolveDuplicateGroup } from '../services/duplicateService';
import { formatCurrency, deriveFeeBreakdown, calculateBalance, calculateStatus } from '../services/calculations';
import { StatusBadge } from './StatusBadge';

interface DuplicateSideBySideReviewProps {
  group: DuplicateGroup;
  students: StudentPaymentRecord[];
  session: BursarSession;
  activeSchool?: SchoolProfile;
  initialPrimaryId?: string;
  onClose: () => void;
  onSuccess: (updatedStudents: StudentPaymentRecord[], message: string) => void;
  onIgnore?: (group: DuplicateGroup) => void;
}

export const DuplicateSideBySideReview: React.FC<DuplicateSideBySideReviewProps> = ({
  group,
  students,
  session,
  activeSchool,
  initialPrimaryId,
  onClose,
  onSuccess,
  onIgnore,
}) => {
  const currencySymbol = activeSchool?.currencySymbol || session.currencySymbol || '₦';
  const schoolId = activeSchool?.id || session.schoolId || 'dominion-group';

  // Selected primary ID (default to passed primaryId or recommended)
  const [primaryId, setPrimaryId] = useState<string>(
    initialPrimaryId || group.recommendedPrimaryId || group.records[0]?.id
  );

  // If group has > 2 records, allow choosing which secondary record to compare directly
  const [secondaryId, setSecondaryId] = useState<string>(() => {
    const nonPrimary = group.records.find((r) => r.id !== (initialPrimaryId || group.recommendedPrimaryId));
    return nonPrimary ? nonPrimary.id : (group.records[1]?.id || group.records[0]?.id);
  });

  const [isProcessing, setIsProcessing] = useState(false);
  const [confirmMode, setConfirmMode] = useState<'none' | 'merge' | 'delete_copy'>('none');
  const [actionError, setActionError] = useState<string | null>(null);

  // Identify Record A (Primary) and Record B (Secondary)
  const recordA = useMemo(() => {
    return group.records.find((r) => r.id === primaryId) || group.records[0];
  }, [group.records, primaryId]);

  const recordB = useMemo(() => {
    return group.records.find((r) => r.id === secondaryId) || group.records.find((r) => r.id !== primaryId) || group.records[1] || group.records[0];
  }, [group.records, secondaryId, primaryId]);

  // Derived breakdowns for comparison
  const breakdownA = useMemo(() => deriveFeeBreakdown(recordA), [recordA]);
  const breakdownB = useMemo(() => deriveFeeBreakdown(recordB), [recordB]);

  const totalPaidA = (breakdownA.tuitionPaid || 0) + (breakdownA.admissionPaid || 0) + (breakdownA.lessonPaid || 0) + (breakdownA.examPaid || 0);
  const totalPaidB = (breakdownB.tuitionPaid || 0) + (breakdownB.admissionPaid || 0) + (breakdownB.lessonPaid || 0) + (breakdownB.examPaid || 0);

  // Compute live merged preview record
  const mergedPreview = useMemo(() => {
    return mergeStudentRecords(group.records, primaryId);
  }, [group.records, primaryId]);

  const mergedBreakdown = useMemo(() => deriveFeeBreakdown(mergedPreview), [mergedPreview]);
  const mergedTotalPaid = (mergedBreakdown.tuitionPaid || 0) + (mergedBreakdown.admissionPaid || 0) + (mergedBreakdown.lessonPaid || 0) + (mergedBreakdown.examPaid || 0);

  // Check differences between Record A and Record B
  const diffs = useMemo(() => {
    return {
      name: recordA.full_name?.trim().toLowerCase() !== recordB.full_name?.trim().toLowerCase(),
      id: recordA.id !== recordB.id,
      class: recordA.class?.trim().toLowerCase() !== recordB.class?.trim().toLowerCase(),
      term: recordA.term !== recordB.term || recordA.session !== recordB.session,
      paid: totalPaidA !== totalPaidB,
      receipt: (recordA.receipt_no || '').trim() !== (recordB.receipt_no || '').trim(),
      date: (recordA.payment_date || '').trim() !== (recordB.payment_date || '').trim(),
      status: recordA.status !== recordB.status,
    };
  }, [recordA, recordB, totalPaidA, totalPaidB]);

  // Swap Primary & Secondary
  const handleSwapPrimary = () => {
    const oldPrimary = primaryId;
    const oldSecondary = secondaryId;
    setPrimaryId(oldSecondary);
    setSecondaryId(oldPrimary);
  };

  // Perform Merge Action
  const handleExecuteMerge = async () => {
    setIsProcessing(true);
    setActionError(null);
    try {
      const res = await resolveDuplicateGroup(
        group,
        primaryId,
        'merge',
        students,
        schoolId
      );
      onSuccess(
        res.updatedStudents,
        `Merged records for ${group.displayTitle} into Primary Record #${primaryId}.`
      );
    } catch (e: any) {
      setActionError(`Merge failed: ${e.message || e}`);
      setIsProcessing(false);
    }
  };

  // Perform Delete Redundant Copies Action
  const handleExecuteDeleteCopy = async () => {
    setIsProcessing(true);
    setActionError(null);
    try {
      const res = await resolveDuplicateGroup(
        group,
        primaryId,
        'keep_primary',
        students,
        schoolId
      );
      onSuccess(
        res.updatedStudents,
        `Removed duplicate rows for ${group.displayTitle}. Kept #${primaryId}.`
      );
    } catch (e: any) {
      setActionError(`Failed to delete duplicates: ${e.message || e}`);
      setIsProcessing(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[65] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/75 backdrop-blur-xs animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-4xl bg-white rounded-t-[32px] sm:rounded-3xl max-h-[95dvh] sm:max-h-[92dvh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-in slide-in-from-bottom duration-200">
        
        {/* Header Bar */}
        <div className="shrink-0 flex items-center justify-between px-5 py-4 sm:px-6 border-b border-slate-100 bg-white">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
              title="Back to duplicates list"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">
                  Side-by-Side Duplicate Review
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-blue-100 text-blue-800">
                  {group.matchType === 'id' 
                    ? 'ID Match' 
                    : group.matchType === 'name_and_class' 
                    ? 'Name & Class Match' 
                    : group.matchType === 'same_name_swapped'
                    ? '🌟 Swapped Name Match'
                    : '🌟 Same Name Match'}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                  {group.records.length} Records Cluster
                </span>
              </div>
              <p className="text-[11px] text-slate-500 font-medium truncate max-w-lg">
                Compare student attributes, fee payments, and preview the consolidated merged record
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {onIgnore && (
              <button
                type="button"
                onClick={() => {
                  onIgnore(group);
                  onClose();
                }}
                className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-amber-50 text-slate-600 hover:text-amber-800 border border-slate-200 text-xs font-bold flex items-center gap-1 transition-all cursor-pointer"
                title="Ignore suggestion (Mark as distinct students)"
              >
                <EyeOff className="w-3.5 h-3.5 text-amber-600" />
                <span className="hidden sm:inline">Ignore</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center border border-slate-200 cursor-pointer active:scale-95 transition-all"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Recommendation Note Banner */}
        {group.recommendationNote && (
          <div className="shrink-0 mx-5 mt-2.5 px-3.5 py-2 bg-amber-50/90 border border-amber-200 rounded-2xl text-[11px] font-bold text-amber-900 flex items-center gap-2 shadow-2xs">
            <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{group.recommendationNote}</span>
          </div>
        )}

        {/* Error notification banner */}
        {actionError && (
          <div className="shrink-0 mx-5 mt-3 p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 font-bold flex items-center justify-between shadow-xs animate-in fade-in">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{actionError}</span>
            </div>
            <button
              type="button"
              onClick={() => setActionError(null)}
              className="text-rose-500 hover:text-rose-700 p-0.5 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Multi-record Selector (if group has > 2 records) */}
        {group.records.length > 2 && (
          <div className="shrink-0 px-5 py-2.5 bg-amber-50/70 border-b border-amber-200/60 flex items-center justify-between flex-wrap gap-2 text-xs">
            <div className="flex items-center gap-1.5 text-amber-900 font-medium">
              <Info className="w-4 h-4 text-amber-600 shrink-0" />
              <span>This cluster has <strong>{group.records.length}</strong> duplicate entries. Select which two to compare:</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-black uppercase text-blue-700">Primary:</span>
                <select
                  value={primaryId}
                  onChange={(e) => {
                    const newId = e.target.value;
                    setPrimaryId(newId);
                    if (newId === secondaryId) {
                      const other = group.records.find((r) => r.id !== newId);
                      if (other) setSecondaryId(other.id);
                    }
                  }}
                  className="py-1 px-2 text-xs font-bold bg-white rounded-lg border border-blue-300 text-blue-900"
                >
                  {group.records.map((r) => (
                    <option key={r.id} value={r.id}>
                      #{r.id} - {r.full_name} ({r.class})
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-1">
                <span className="text-[10px] font-black uppercase text-rose-700">Compare With:</span>
                <select
                  value={secondaryId}
                  onChange={(e) => {
                    const newId = e.target.value;
                    setSecondaryId(newId);
                    if (newId === primaryId) {
                      const other = group.records.find((r) => r.id !== newId);
                      if (other) setPrimaryId(other.id);
                    }
                  }}
                  className="py-1 px-2 text-xs font-bold bg-white rounded-lg border border-rose-300 text-rose-900"
                >
                  {group.records.map((r) => (
                    <option key={r.id} value={r.id} disabled={r.id === primaryId}>
                      #{r.id} - {r.full_name} ({r.class})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Scrollable Side-by-Side Comparison Canvas */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-slate-50/50 min-h-0">
          
          {/* Side-by-Side Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative">
            
            {/* Swap Floating Pill (Desktop centered) */}
            <div className="hidden md:flex absolute left-1/2 top-8 -translate-x-1/2 z-10">
              <button
                type="button"
                onClick={handleSwapPrimary}
                title="Swap Primary and Duplicate roles"
                className="bg-white hover:bg-slate-100 text-slate-700 font-bold px-3 py-1.5 rounded-full border border-slate-300 shadow-md flex items-center gap-1.5 text-xs transition-all active:scale-95 cursor-pointer hover:border-slate-400"
              >
                <ArrowLeftRight className="w-3.5 h-3.5 text-blue-600" />
                <span>Swap Roles</span>
              </button>
            </div>

            {/* Left Card: Record A (Primary / Target Keep) */}
            <div className="bg-white rounded-2xl border-2 border-blue-500/80 shadow-xs overflow-hidden flex flex-col">
              {/* Card Header */}
              <div className="p-3.5 sm:p-4 bg-gradient-to-r from-blue-50 to-indigo-50/60 border-b border-blue-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-xl bg-blue-600 text-white flex items-center justify-center font-black text-xs shadow-xs">
                    A
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-black uppercase text-blue-900">Primary Record</span>
                      <span className="px-1.5 py-0.2 rounded bg-blue-600 text-white text-[9px] font-black uppercase">
                        Preserved
                      </span>
                      {recordA.id === group.recommendedPrimaryId && (
                        <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 text-[9px] font-black uppercase flex items-center gap-0.5">
                          <Sparkles className="w-2.5 h-2.5" />
                          Recommended
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-blue-700 font-mono font-bold">Student ID: #{recordA.id}</span>
                  </div>
                </div>
                <div className="text-right">
                  <StatusBadge status={recordA.status} size="sm" />
                </div>
              </div>

              {/* Card Content Table */}
              <div className="p-4 space-y-3 flex-1 text-xs divide-y divide-slate-100">
                {/* Identity */}
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Full Name:</span>
                    <strong className="text-slate-900 font-black text-sm text-right">{recordA.full_name}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Class:</span>
                    <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${
                      diffs.class ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-slate-100 text-slate-800'
                    }`}>
                      {recordA.class}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Term & Session:</span>
                    <span className="text-slate-700 font-semibold">{recordA.term} • {recordA.session}</span>
                  </div>
                </div>

                {/* Fee Schedule */}
                <div className="space-y-1.5 pt-3">
                  <div className="flex items-center justify-between text-slate-400 font-bold uppercase text-[10px]">
                    <span>Fee Component</span>
                    <span>Expected Fee</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Tuition Fee:</span>
                    <span className="font-bold text-slate-800">{formatCurrency(recordA.fee_amount || recordA.tuition_fee, currencySymbol)}</span>
                  </div>
                  {(breakdownA.admissionFee > 0) && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Admission Fee:</span>
                      <span className="font-semibold text-slate-800">{formatCurrency(breakdownA.admissionFee, currencySymbol)}</span>
                    </div>
                  )}
                  {(breakdownA.lessonFee > 0) && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Lesson Fee:</span>
                      <span className="font-semibold text-slate-800">{formatCurrency(breakdownA.lessonFee, currencySymbol)}</span>
                    </div>
                  )}
                  {(breakdownA.examFee > 0) && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Exam Fee:</span>
                      <span className="font-semibold text-slate-800">{formatCurrency(breakdownA.examFee, currencySymbol)}</span>
                    </div>
                  )}
                </div>

                {/* Payment History */}
                <div className="space-y-1.5 pt-3">
                  <div className="flex items-center justify-between text-slate-400 font-bold uppercase text-[10px]">
                    <span>Payments Made</span>
                    <span>Amount Paid</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Tuition Paid:</span>
                    <span className="font-bold text-slate-800">{formatCurrency(breakdownA.tuitionPaid, currencySymbol)}</span>
                  </div>
                  {(breakdownA.admissionPaid > 0) && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Admission Paid:</span>
                      <span className="font-semibold text-slate-800">{formatCurrency(breakdownA.admissionPaid, currencySymbol)}</span>
                    </div>
                  )}
                  {(breakdownA.lessonPaid > 0) && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Lesson Paid:</span>
                      <span className="font-semibold text-slate-800">{formatCurrency(breakdownA.lessonPaid, currencySymbol)}</span>
                    </div>
                  )}
                  {(breakdownA.examPaid > 0) && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Exam Paid:</span>
                      <span className="font-semibold text-slate-800">{formatCurrency(breakdownA.examPaid, currencySymbol)}</span>
                    </div>
                  )}
                  
                  {/* Total Paid Highlight Box */}
                  <div className="mt-2 p-2.5 bg-blue-50/70 rounded-xl border border-blue-200 flex items-center justify-between">
                    <span className="font-bold text-blue-900">Total Paid (Record A):</span>
                    <strong className="text-sm font-black text-blue-800">{formatCurrency(totalPaidA, currencySymbol)}</strong>
                  </div>
                </div>

                {/* Ledger & Metadata */}
                <div className="space-y-2 pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Outstanding Balance:</span>
                    <strong className={`font-black ${recordA.balance > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                      {formatCurrency(recordA.balance, currencySymbol)}
                    </strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Receipt No:</span>
                    <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
                      {recordA.receipt_no || 'None'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Payment Date:</span>
                    <span className="text-slate-700 font-semibold">{recordA.payment_date || 'N/A'}</span>
                  </div>
                  {(recordA as any).remarks && (
                    <div className="pt-1 text-[11px] text-slate-500 italic">
                      Remarks: &quot;{(recordA as any).remarks}&quot;
                    </div>
                  )}
                </div>
              </div>

              <div className="p-3 bg-blue-50/40 border-t border-blue-100 text-center">
                <span className="text-[11px] font-bold text-blue-800">
                  ✓ This record will hold the merged ledger and preserved ID
                </span>
              </div>
            </div>

            {/* Right Card: Record B (Secondary / Duplicate to Merge or Remove) */}
            <div className="bg-white rounded-2xl border-2 border-slate-300 shadow-xs overflow-hidden flex flex-col">
              {/* Card Header */}
              <div className="p-3.5 sm:p-4 bg-slate-100/80 border-b border-slate-200 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-xl bg-slate-700 text-white flex items-center justify-center font-black text-xs shadow-xs">
                    B
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-black uppercase text-slate-900">Duplicate Record</span>
                      <span className="px-1.5 py-0.2 rounded bg-rose-100 text-rose-800 text-[9px] font-black uppercase">
                        Will be Removed
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-600 font-mono font-bold">Student ID: #{recordB.id}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={recordB.status} size="sm" />
                  <button
                    type="button"
                    onClick={() => {
                      setPrimaryId(recordB.id);
                      setSecondaryId(recordA.id);
                    }}
                    className="px-2 py-1 bg-white hover:bg-blue-50 text-blue-700 hover:text-blue-900 border border-blue-200 rounded-lg text-[10px] font-black uppercase shadow-2xs transition-all active:scale-95 cursor-pointer"
                  >
                    Set as Primary
                  </button>
                </div>
              </div>

              {/* Card Content Table */}
              <div className="p-4 space-y-3 flex-1 text-xs divide-y divide-slate-100">
                {/* Identity */}
                <div className="space-y-2 pt-1">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Full Name:</span>
                    <strong className="text-slate-900 font-black text-sm text-right">{recordB.full_name}</strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Class:</span>
                    <span className={`px-2 py-0.5 rounded-lg text-xs font-bold ${
                      diffs.class ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-slate-100 text-slate-800'
                    }`}>
                      {recordB.class}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Term & Session:</span>
                    <span className="text-slate-700 font-semibold">{recordB.term} • {recordB.session}</span>
                  </div>
                </div>

                {/* Fee Schedule */}
                <div className="space-y-1.5 pt-3">
                  <div className="flex items-center justify-between text-slate-400 font-bold uppercase text-[10px]">
                    <span>Fee Component</span>
                    <span>Expected Fee</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Tuition Fee:</span>
                    <span className="font-bold text-slate-800">{formatCurrency(recordB.fee_amount || recordB.tuition_fee, currencySymbol)}</span>
                  </div>
                  {(breakdownB.admissionFee > 0) && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Admission Fee:</span>
                      <span className="font-semibold text-slate-800">{formatCurrency(breakdownB.admissionFee, currencySymbol)}</span>
                    </div>
                  )}
                  {(breakdownB.lessonFee > 0) && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Lesson Fee:</span>
                      <span className="font-semibold text-slate-800">{formatCurrency(breakdownB.lessonFee, currencySymbol)}</span>
                    </div>
                  )}
                  {(breakdownB.examFee > 0) && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Exam Fee:</span>
                      <span className="font-semibold text-slate-800">{formatCurrency(breakdownB.examFee, currencySymbol)}</span>
                    </div>
                  )}
                </div>

                {/* Payment History */}
                <div className="space-y-1.5 pt-3">
                  <div className="flex items-center justify-between text-slate-400 font-bold uppercase text-[10px]">
                    <span>Payments Made</span>
                    <span>Amount Paid</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Tuition Paid:</span>
                    <span className="font-bold text-slate-800">{formatCurrency(breakdownB.tuitionPaid, currencySymbol)}</span>
                  </div>
                  {(breakdownB.admissionPaid > 0) && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Admission Paid:</span>
                      <span className="font-semibold text-slate-800">{formatCurrency(breakdownB.admissionPaid, currencySymbol)}</span>
                    </div>
                  )}
                  {(breakdownB.lessonPaid > 0) && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Lesson Paid:</span>
                      <span className="font-semibold text-slate-800">{formatCurrency(breakdownB.lessonPaid, currencySymbol)}</span>
                    </div>
                  )}
                  {(breakdownB.examPaid > 0) && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Exam Paid:</span>
                      <span className="font-semibold text-slate-800">{formatCurrency(breakdownB.examPaid, currencySymbol)}</span>
                    </div>
                  )}
                  
                  {/* Total Paid Box */}
                  <div className="mt-2 p-2.5 bg-slate-100 rounded-xl border border-slate-200 flex items-center justify-between">
                    <span className="font-bold text-slate-800">Total Paid (Record B):</span>
                    <strong className="text-sm font-black text-slate-900">{formatCurrency(totalPaidB, currencySymbol)}</strong>
                  </div>
                </div>

                {/* Ledger & Metadata */}
                <div className="space-y-2 pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Outstanding Balance:</span>
                    <strong className={`font-black ${recordB.balance > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                      {formatCurrency(recordB.balance, currencySymbol)}
                    </strong>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Receipt No:</span>
                    <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
                      {recordB.receipt_no || 'None'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-medium">Payment Date:</span>
                    <span className="text-slate-700 font-semibold">{recordB.payment_date || 'N/A'}</span>
                  </div>
                  {(recordB as any).remarks && (
                    <div className="pt-1 text-[11px] text-slate-500 italic">
                      Remarks: &quot;{(recordB as any).remarks}&quot;
                    </div>
                  )}
                </div>
              </div>

              <div className="p-3 bg-rose-50/50 border-t border-rose-100 text-center">
                <span className="text-[11px] font-bold text-rose-800">
                  ✕ This duplicate entry will be deleted after resolution
                </span>
              </div>
            </div>

          </div>

          {/* Live Merged Result Preview Card */}
          <div className="bg-gradient-to-r from-emerald-50 via-teal-50/60 to-emerald-50 rounded-2xl border-2 border-emerald-500/70 p-4 sm:p-5 shadow-sm space-y-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-xs sm:text-sm font-black text-emerald-950 uppercase">
                    Consolidated Merged Result (Live Preview)
                  </h4>
                  <p className="text-[11px] text-emerald-700 font-medium">
                    This is how the finalized student record will appear on your roster and in Google Sheets
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={mergedPreview.status} size="md" />
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1 text-xs">
              <div className="bg-white/90 p-3 rounded-xl border border-emerald-200">
                <span className="text-[10px] font-black uppercase text-slate-400 block">Preserved Student</span>
                <strong className="text-slate-900 font-black text-xs block truncate mt-0.5">
                  #{mergedPreview.id} • {mergedPreview.full_name}
                </strong>
                <span className="text-[10px] font-bold text-emerald-800 mt-1 block">{mergedPreview.class}</span>
              </div>

              <div className="bg-white/90 p-3 rounded-xl border border-emerald-200">
                <span className="text-[10px] font-black uppercase text-slate-400 block">Combined Total Paid</span>
                <strong className="text-emerald-700 font-black text-sm block mt-0.5">
                  {formatCurrency(mergedTotalPaid, currencySymbol)}
                </strong>
                <span className="text-[9px] text-slate-500 block mt-0.5">
                  Tuition: {formatCurrency(mergedBreakdown.tuitionPaid, currencySymbol)}
                </span>
              </div>

              <div className="bg-white/90 p-3 rounded-xl border border-emerald-200">
                <span className="text-[10px] font-black uppercase text-slate-400 block">Recalculated Balance</span>
                <strong className={`font-black text-sm block mt-0.5 ${mergedPreview.balance > 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                  {formatCurrency(mergedPreview.balance, currencySymbol)}
                </strong>
                <span className="text-[9px] text-slate-500 block mt-0.5">
                  Expected: {formatCurrency(mergedPreview.fee_amount, currencySymbol)}
                </span>
              </div>

              <div className="bg-white/90 p-3 rounded-xl border border-emerald-200">
                <span className="text-[10px] font-black uppercase text-slate-400 block">Merged Receipts</span>
                <strong className="font-mono text-xs font-bold text-slate-800 block truncate mt-0.5">
                  {mergedPreview.receipt_no || 'None'}
                </strong>
                <span className="text-[9px] text-slate-500 block mt-0.5">
                  Date: {mergedPreview.payment_date || 'N/A'}
                </span>
              </div>
            </div>

            <div className="pt-1 text-[11px] text-emerald-900 bg-white/70 p-2.5 rounded-xl border border-emerald-200/80 flex items-center justify-between flex-wrap gap-2">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  Ledger safety: All payment records and receipt numbers are preserved. <strong>{group.records.length - 1}</strong> redundant row(s) will be cleared.
                </span>
              </span>
            </div>
          </div>

        </div>

        {/* Modal Footer with Actions */}
        <div className="shrink-0 p-4 sm:p-5 bg-white border-t border-slate-200 flex items-center justify-between flex-wrap gap-3 pb-6 sm:pb-4">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="py-2.5 px-4 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-200 cursor-pointer disabled:opacity-50"
            >
              Cancel Review
            </button>

            {onIgnore && (
              <button
                type="button"
                onClick={() => {
                  onIgnore(group);
                  onClose();
                }}
                disabled={isProcessing}
                className="py-2.5 px-3 rounded-2xl bg-amber-50 hover:bg-amber-100 text-amber-800 text-xs font-bold border border-amber-200 flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                title="Ignore suggestion: Keep as two separate students"
              >
                <EyeOff className="w-3.5 h-3.5 text-amber-700" />
                <span>Ignore (Distinct Students)</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Delete Copies Option */}
            <button
              type="button"
              onClick={handleExecuteDeleteCopy}
              disabled={isProcessing}
              className="py-2.5 px-3.5 rounded-2xl bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 text-xs font-bold border border-slate-200 flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5 text-rose-600" />
              <span>Keep Record A Only (Delete B)</span>
            </button>

            {/* Merge & Consolidate (Primary Action) */}
            <button
              type="button"
              onClick={handleExecuteMerge}
              disabled={isProcessing}
              className="py-2.5 px-5 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black shadow-md shadow-blue-500/25 flex items-center gap-2 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <GitMerge className="w-4 h-4" />
              {isProcessing ? (
                <span>Merging Ledger...</span>
              ) : (
                <span>Confirm & Merge Records</span>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
