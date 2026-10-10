/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  X,
  CreditCard,
  CheckCircle2,
  Printer,
  Building,
  User,
  Calendar,
  DollarSign,
  FileText,
  ArrowRight,
  ShieldCheck
} from 'lucide-react';
import { PayrollRecord, StaffMember, SchoolProfile, BursarSession } from '../types';
import { DGOSLogo } from './DGOSLogo';

interface PayStaffModalProps {
  isOpen: boolean;
  onClose: () => void;
  record: PayrollRecord | null;
  staff: StaffMember | null;
  school?: SchoolProfile;
  session: BursarSession;
  onConfirmPayment: (
    record: PayrollRecord,
    paymentDetails: {
      paymentMethod: 'bank_transfer' | 'cash' | 'cheque' | 'other';
      referenceNumber?: string;
      notes?: string;
      bursarName?: string;
    }
  ) => void;
}

export const PayStaffModal: React.FC<PayStaffModalProps> = ({
  isOpen,
  onClose,
  record,
  staff,
  school,
  session,
  onConfirmPayment,
}) => {
  const [paymentMethod, setPaymentMethod] = useState<'bank_transfer' | 'cash' | 'cheque' | 'other'>(
    record?.paymentMethod || 'bank_transfer'
  );
  const [referenceNumber, setReferenceNumber] = useState(
    record?.referenceNumber || (record ? `SAL-${record.month.replace('-', '')}-${record.staffId}` : '')
  );
  const [notes, setNotes] = useState(record?.notes || '');
  const [isPrintMode, setIsPrintMode] = useState(false);

  useEffect(() => {
    if (record && isOpen) {
      setPaymentMethod(record.paymentMethod || 'bank_transfer');
      setReferenceNumber(record.referenceNumber || `SAL-${record.month.replace('-', '')}-${record.staffId}`);
      setNotes(record.notes || '');
      setIsPrintMode(false);
    }
  }, [record, isOpen]);

  if (!isOpen || !record) return null;

  const currencySymbol = school?.currencySymbol || session.currencySymbol || '₦';
  const schoolName = school?.name || session.schoolName || 'Dominion Group Of Schools';

  const isAlreadyPaid = record.paymentStatus === 'paid';

  const handlePrint = () => {
    window.print();
  };

  const handleDisburse = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirmPayment(record, {
      paymentMethod,
      referenceNumber,
      notes,
      bursarName: session.bursarName || 'Bursar',
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[92dvh] overflow-hidden">
        
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-white shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-slate-100 text-slate-700">
              <CreditCard className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                {isAlreadyPaid ? 'Salary Payment Slip' : 'Disburse Staff Salary'}
              </h2>
              <p className="text-xs text-slate-500">
                {record.monthLabel} • {record.term}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Printable Payslip Card Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 print:p-0">
          
          {/* Official Voucher Style Box */}
          <div className="border border-slate-200 rounded-2xl p-4 bg-slate-50/50 space-y-3 print:border-none">
            
            {/* School Header */}
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2">
                <DGOSLogo size="xs" />
                <div>
                  <h3 className="text-xs font-black uppercase text-slate-900 leading-tight">
                    {schoolName}
                  </h3>
                  <p className="text-[10px] text-slate-500 font-medium tracking-wide uppercase">
                    Official Salary Payment Voucher
                  </p>
                </div>
              </div>
              <span
                className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  isAlreadyPaid
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}
              >
                {isAlreadyPaid ? 'PAID & DISBURSED' : 'PENDING DISBURSAL'}
              </span>
            </div>

            {/* Staff Info */}
            <div className="grid grid-cols-2 gap-2 text-xs bg-white p-3 rounded-xl border border-slate-100">
              <div>
                <span className="text-[10px] text-slate-400 font-medium block uppercase">Staff Name</span>
                <span className="font-bold text-slate-900">{record.staffName}</span>
              </div>
              <div>
                <span className="text-[10px] text-slate-400 font-medium block uppercase">Staff ID & Role</span>
                <span className="font-semibold text-slate-700">{record.staffId} • {record.role}</span>
              </div>
              {staff?.bankName && (
                <div className="col-span-2 pt-1 border-t border-slate-100 flex items-center justify-between text-[11px]">
                  <span className="text-slate-500">
                    Bank: <strong className="text-slate-800">{staff.bankName}</strong>
                  </span>
                  <span className="text-slate-500">
                    Acct: <strong className="font-mono text-slate-800">{staff.accountNumber || 'N/A'}</strong>
                  </span>
                </div>
              )}
            </div>

            {/* Itemized Calculation */}
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between py-1 border-b border-dashed border-slate-200">
                <span className="text-slate-600">Basic Salary</span>
                <span className="font-bold text-slate-900">{currencySymbol}{(record.baseSalary || 0).toLocaleString()}</span>
              </div>

              {/* Allowances breakdown */}
              {record.totalAllowances > 0 && (
                <div className="space-y-1 py-1 border-b border-dashed border-slate-200 text-[11px]">
                  <div className="flex justify-between text-emerald-700 font-semibold">
                    <span>Total Allowances & Perks</span>
                    <span>+{currencySymbol}{record.totalAllowances.toLocaleString()}</span>
                  </div>
                  {record.allowanceBreakdown?.transport ? (
                    <div className="flex justify-between text-slate-500 pl-2">
                      <span>• Transport Allowance</span>
                      <span>+{currencySymbol}{record.allowanceBreakdown.transport.toLocaleString()}</span>
                    </div>
                  ) : null}
                  {record.allowanceBreakdown?.teachingBonus ? (
                    <div className="flex justify-between text-slate-500 pl-2">
                      <span>• Teaching Bonus</span>
                      <span>+{currencySymbol}{record.allowanceBreakdown.teachingBonus.toLocaleString()}</span>
                    </div>
                  ) : null}
                  {record.allowanceBreakdown?.lessonAllowance ? (
                    <div className="flex justify-between text-slate-500 pl-2">
                      <span>• Lesson Extra Pay</span>
                      <span>+{currencySymbol}{record.allowanceBreakdown.lessonAllowance.toLocaleString()}</span>
                    </div>
                  ) : null}
                  {record.allowanceBreakdown?.responsibility ? (
                    <div className="flex justify-between text-slate-500 pl-2">
                      <span>• Headship / Responsibility</span>
                      <span>+{currencySymbol}{record.allowanceBreakdown.responsibility.toLocaleString()}</span>
                    </div>
                  ) : null}
                </div>
              )}

              {/* Deductions breakdown */}
              {record.totalDeductions > 0 && (
                <div className="space-y-1 py-1 border-b border-dashed border-slate-200 text-[11px]">
                  <div className="flex justify-between text-rose-700 font-semibold">
                    <span>Total Statutory Deductions</span>
                    <span>-{currencySymbol}{record.totalDeductions.toLocaleString()}</span>
                  </div>
                  {record.deductionBreakdown?.pension ? (
                    <div className="flex justify-between text-slate-500 pl-2">
                      <span>• Pension Contribution</span>
                      <span>-{currencySymbol}{record.deductionBreakdown.pension.toLocaleString()}</span>
                    </div>
                  ) : null}
                  {record.deductionBreakdown?.taxPaye ? (
                    <div className="flex justify-between text-slate-500 pl-2">
                      <span>• PAYE Tax</span>
                      <span>-{currencySymbol}{record.deductionBreakdown.taxPaye.toLocaleString()}</span>
                    </div>
                  ) : null}
                  {record.deductionBreakdown?.loanRepayment ? (
                    <div className="flex justify-between text-slate-500 pl-2">
                      <span>• Loan Repayment</span>
                      <span>-{currencySymbol}{record.deductionBreakdown.loanRepayment.toLocaleString()}</span>
                    </div>
                  ) : null}
                </div>
              )}

              {/* Gross & Net Total */}
              <div className="pt-2 flex justify-between items-center text-sm font-bold text-slate-900 bg-white p-2.5 rounded-xl border border-slate-200">
                <span>NET SALARY PAYABLE:</span>
                <span className="text-base font-bold text-slate-900">{currencySymbol}{record.netPay.toLocaleString()}</span>
              </div>
            </div>

            {/* Disbursal metadata if paid */}
            {isAlreadyPaid && (
              <div className="p-2.5 bg-slate-100 rounded-xl border border-slate-200 text-[11px] text-slate-800 space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-slate-900">
                  <CheckCircle2 className="w-3.5 h-3.5 text-slate-700" />
                  <span>Disbursed on: {record.paymentDate || 'Recorded'}</span>
                </div>
                <div className="text-slate-600">
                  Method: <strong className="capitalize">{record.paymentMethod?.replace('_', ' ') || 'Bank Transfer'}</strong> • Ref: <span className="font-mono">{record.referenceNumber || 'N/A'}</span>
                </div>
              </div>
            )}
          </div>

          {/* Payment Form (if not paid yet) */}
          {!isAlreadyPaid ? (
            <form onSubmit={handleDisburse} className="space-y-3 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Payment Method</label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as any)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 bg-white focus:ring-2 focus:ring-slate-400 focus:border-slate-500"
                  >
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cash">Cash Handover</option>
                    <option value="cheque">Bank Cheque</option>
                    <option value="other">Other Settlement</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Ref / Voucher No.</label>
                  <input
                    type="text"
                    value={referenceNumber}
                    onChange={(e) => setReferenceNumber(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 font-mono focus:ring-2 focus:ring-slate-400 focus:border-slate-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Bursar Payment Note (Optional)</label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Cleared via school main account"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-400 focus:border-slate-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={handlePrint}
                  className="px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-500" />
                  <span>Print Slip</span>
                </button>

                <button
                  type="submit"
                  id="confirm-disburse-salary-btn"
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer ml-auto"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirm Disbursal ({currencySymbol}{record.netPay.toLocaleString()})</span>
                </button>
              </div>
            </form>
          ) : (
            <div className="pt-2 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handlePrint}
                className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-sm"
              >
                <Printer className="w-4 h-4" />
                <span>Print Official Slip</span>
              </button>
            </div>
          )}

        </div>

      </div>
    </div>
  );
};
