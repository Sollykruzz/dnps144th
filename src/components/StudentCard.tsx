/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import { BookOpen, FileCheck2, GraduationCap, Check, X as XIcon, Layers } from 'lucide-react';
import { StudentPaymentRecord, SchoolFeeSchedule, SchoolProfile } from '../types';
import { StatusBadge } from './StatusBadge';
import { formatCurrency, computeStudentLiveFees } from '../services/calculations';

interface StudentCardProps {
  student: StudentPaymentRecord;
  currencySymbol: string;
  feeSchedule?: SchoolProfile | SchoolFeeSchedule;
  onClick: (student: StudentPaymentRecord) => void;
}

export const StudentCard: React.FC<StudentCardProps> = React.memo(({
  student,
  currencySymbol,
  feeSchedule,
  onClick,
}) => {
  const live = useMemo(() => computeStudentLiveFees(student, feeSchedule), [student, feeSchedule]);
  const breakdown = live.breakdown;

  return (
    <div
      onClick={() => onClick(student)}
      id={`student-card-${student.id}`}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick(student);
        }
      }}
      className="group relative p-4 rounded-3xl bg-white border border-[#f0f0f0] shadow-xs flex flex-col gap-3 cursor-pointer hover:bg-neutral-50/80 hover:border-slate-300 active:scale-[0.99] transition-all"
    >
      {/* Top Row: Info & Main Status */}
      <div className="flex items-start justify-between">
        <div className="flex flex-col min-w-0 pr-3">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] uppercase tracking-wider text-[#a0a0a0] font-bold truncate">
              {student.class || 'Class N/A'} • {student.term || 'Term 1'}
              {student.session && ` • ${student.session}`}
            </span>
            {student.is_exempt_from_school_fee && (
              <span className="px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[9px] font-bold border border-amber-300 flex items-center gap-1">
                <span>⭐ Scholarship</span>
              </span>
            )}
          </div>
          <span className="text-[15px] font-bold text-[#1a1a1a] truncate mt-0.5">
            {student.full_name || 'Unnamed Student'}
          </span>
          <div className="mt-0.5 flex items-center gap-1.5 flex-wrap text-[11px]">
            <span className="text-[#666] font-medium">Total Due:</span>
            <span className="font-black text-[#1a1a1a]">
              {formatCurrency(live.totalFee, currencySymbol)}
            </span>
            <span className="text-[#666]">
              • Paid: <span className="font-bold text-emerald-600">{formatCurrency(live.amountPaid, currencySymbol)}</span>
            </span>
            <span className="text-[#666]">
              • Bal: <span className={`font-bold ${live.balance > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                {formatCurrency(live.balance, currencySymbol)}
              </span>
            </span>
          </div>
        </div>

        <div className="flex flex-col items-end shrink-0">
          <StatusBadge status={live.status} size="sm" />
          <span className="text-[10px] text-[#a0a0a0] font-mono mt-1.5">
            #{student.id}
          </span>
        </div>
      </div>

      {/* Fee Status Breakdown Row for All Fees */}
      <div className={`pt-2 border-t border-[#f4f4f7] grid ${breakdown.additionalFeesTotal > 0 ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'} gap-1.5 text-[10px]`}>
        {/* 1. Tuition Fee Status */}
        <div className={`px-2 py-1.5 rounded-xl border flex flex-col justify-between ${
          student.is_exempt_from_school_fee
            ? 'bg-amber-50/90 border-amber-200 text-amber-900'
            : breakdown.tuitionStatus === 'fully_paid' 
            ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
            : breakdown.tuitionStatus === 'part_payment'
            ? 'bg-amber-50/80 border-amber-200 text-amber-900'
            : 'bg-rose-50/80 border-rose-200 text-rose-900'
        }`}>
          <div className="flex items-center justify-between opacity-80 font-bold uppercase tracking-tight text-[9px]">
            <span>Tuition</span>
            <GraduationCap className="w-3 h-3 shrink-0" />
          </div>
          <p className="font-bold truncate mt-0.5 flex items-center gap-1">
            {student.is_exempt_from_school_fee ? (
              <span className="text-amber-700 font-semibold">Exempt (₦0)</span>
            ) : breakdown.tuitionStatus === 'fully_paid' ? (
              <>
                <Check className="w-3 h-3 text-emerald-600 inline shrink-0" />
                <span>Paid ({formatCurrency(breakdown.tuitionPaid > 0 ? breakdown.tuitionPaid : breakdown.tuitionFee, currencySymbol)})</span>
              </>
            ) : breakdown.tuitionStatus === 'part_payment' ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block shrink-0"></span>
                <span>Part ({formatCurrency(breakdown.tuitionPaid, currencySymbol)})</span>
              </>
            ) : (
              <>
                <XIcon className="w-3 h-3 text-rose-500 inline shrink-0" />
                <span>Unpaid ({formatCurrency(breakdown.tuitionFee, currencySymbol)})</span>
              </>
            )}
          </p>
        </div>

        {/* 2. Lesson Fee Status & Target Amount */}
        <div className={`px-2 py-1.5 rounded-xl border flex flex-col justify-between ${
          breakdown.lessonDisabled || (breakdown.lessonFee === 0 && breakdown.lessonPaid === 0)
            ? 'bg-slate-50 border-slate-200 text-slate-700'
            : breakdown.lessonStatus === 'fully_paid' && breakdown.lessonFee > 0
            ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
            : breakdown.lessonPaid > 0
            ? 'bg-amber-50/80 border-amber-200 text-amber-900'
            : 'bg-rose-50/80 border-rose-200 text-rose-900'
        }`}>
          <div className="flex items-center justify-between opacity-80 font-bold uppercase tracking-tight text-[9px]">
            <span>Lesson</span>
            <BookOpen className="w-3 h-3 shrink-0" />
          </div>
          <p className="font-bold truncate mt-0.5 flex items-center gap-1">
            {breakdown.lessonDisabled ? (
              <span className="text-slate-500 font-semibold">Not enrolled</span>
            ) : breakdown.lessonFee === 0 && breakdown.lessonPaid === 0 ? (
              <span className="text-slate-500 font-semibold">Unpaid (₦0)</span>
            ) : breakdown.lessonStatus === 'fully_paid' && breakdown.lessonFee > 0 ? (
              <>
                <Check className="w-3 h-3 text-emerald-600 inline shrink-0" />
                <span>Paid ({formatCurrency(breakdown.lessonPaid > 0 ? breakdown.lessonPaid : breakdown.lessonFee, currencySymbol)})</span>
              </>
            ) : breakdown.lessonPaid > 0 ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block shrink-0"></span>
                <span>Part ({formatCurrency(breakdown.lessonPaid, currencySymbol)})</span>
              </>
            ) : (
              <>
                <XIcon className="w-3 h-3 text-rose-500 inline shrink-0" />
                <span>Unpaid ({formatCurrency(breakdown.lessonFee, currencySymbol)})</span>
              </>
            )}
          </p>
        </div>

        {/* 3. Exam Fee Status */}
        <div className={`px-2 py-1.5 rounded-xl border flex flex-col justify-between ${
          breakdown.examFee === 0 && breakdown.examPaid === 0
            ? 'bg-slate-50 border-slate-200 text-slate-700'
            : breakdown.examStatus === 'fully_paid' && breakdown.examPaid >= breakdown.examFee && breakdown.examFee > 0
            ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
            : breakdown.examPaid > 0
            ? 'bg-amber-50/80 border-amber-200 text-amber-900'
            : 'bg-rose-50/80 border-rose-200 text-rose-900'
        }`}>
          <div className="flex items-center justify-between opacity-80 font-bold uppercase tracking-tight text-[9px]">
            <span>Exam Fee</span>
            <FileCheck2 className="w-3 h-3 shrink-0" />
          </div>
          <p className="font-bold truncate mt-0.5 flex items-center gap-1">
            {breakdown.examFee === 0 && breakdown.examPaid === 0 ? (
              <span className="text-slate-500 font-semibold">Not Billed</span>
            ) : breakdown.examStatus === 'fully_paid' && breakdown.examPaid >= breakdown.examFee && breakdown.examFee > 0 ? (
              <>
                <Check className="w-3 h-3 text-emerald-600 inline shrink-0" />
                <span>Paid ({formatCurrency(breakdown.examPaid > 0 ? breakdown.examPaid : breakdown.examFee, currencySymbol)})</span>
              </>
            ) : breakdown.examPaid > 0 ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block shrink-0"></span>
                <span>Part ({formatCurrency(breakdown.examPaid, currencySymbol)})</span>
              </>
            ) : (
              <>
                <XIcon className="w-3 h-3 text-rose-500 inline shrink-0" />
                <span>Unpaid ({formatCurrency(breakdown.examFee, currencySymbol)})</span>
              </>
            )}
          </p>
        </div>

        {/* 4. Additional & Ancillary Fees (PTA, Levies, Uniform) */}
        {breakdown.additionalFeesTotal > 0 && (
          <div className={`px-2 py-1.5 rounded-xl border flex flex-col justify-between ${
            breakdown.additionalFeesPaid >= breakdown.additionalFeesTotal
              ? 'bg-purple-50/80 border-purple-200 text-purple-900'
              : breakdown.additionalFeesPaid > 0
              ? 'bg-amber-50/80 border-amber-200 text-amber-900'
              : 'bg-rose-50/80 border-rose-200 text-rose-900'
          }`}>
            <div className="flex items-center justify-between opacity-80 font-bold uppercase tracking-tight text-[9px]">
              <span className="truncate">PTA & Levies</span>
              <Layers className="w-3 h-3 shrink-0 text-purple-600" />
            </div>
            <p className="font-bold truncate mt-0.5 flex items-center gap-1">
              {breakdown.additionalFeesPaid >= breakdown.additionalFeesTotal ? (
                <>
                  <Check className="w-3 h-3 text-purple-600 inline shrink-0" />
                  <span>Paid ({formatCurrency(breakdown.additionalFeesPaid, currencySymbol)})</span>
                </>
              ) : breakdown.additionalFeesPaid > 0 ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 inline-block shrink-0"></span>
                  <span>Part ({formatCurrency(breakdown.additionalFeesPaid, currencySymbol)})</span>
                </>
              ) : (
                <>
                  <XIcon className="w-3 h-3 text-rose-500 inline shrink-0" />
                  <span>Unpaid ({formatCurrency(breakdown.additionalFeesTotal, currencySymbol)})</span>
                </>
              )}
            </p>
          </div>
        )}
      </div>
    </div>
  );
});

