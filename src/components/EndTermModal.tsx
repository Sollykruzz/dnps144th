/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  X, 
  Archive, 
  AlertTriangle, 
  CheckCircle2, 
  Download, 
  FileSpreadsheet, 
  ShieldAlert, 
  ArrowRight, 
  Layers, 
  RefreshCw, 
  ShieldCheck,
  AlertCircle
} from 'lucide-react';
import { StudentPaymentRecord, BursarSession, EndTermResult, SchoolProfile } from '../types';
import { executeEndTermWorkflow, generateArchiveTabName } from '../services/endTermService';
import { downloadCsvBackup, downloadJsonBackup } from '../services/backupService';
import { formatCurrency, getCurrentAcademicSession } from '../services/calculations';

interface EndTermModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: StudentPaymentRecord[];
  session: BursarSession;
  activeSchool?: SchoolProfile | null;
  onEndTermComplete: (updatedStudents: StudentPaymentRecord[], message: string) => void;
}

export const EndTermModal: React.FC<EndTermModalProps> = ({
  isOpen,
  onClose,
  students,
  session,
  activeSchool,
  onEndTermComplete,
}) => {
  const currentTerm = students[0]?.term || 'First Term';
  const currentSession = students[0]?.session || getCurrentAcademicSession();

  const defaultArchiveTab = generateArchiveTabName(currentTerm, currentSession);

  const [archiveTabName, setArchiveTabName] = useState<string>(defaultArchiveTab);
  const [newTermLabel, setNewTermLabel] = useState<string>('');
  const [newSessionLabel, setNewSessionLabel] = useState<string>('');
  const [hasManualBackup, setHasManualBackup] = useState<boolean>(false);
  const [confirmedCheckbox, setConfirmedCheckbox] = useState<boolean>(false);
  const [confirmationText, setConfirmationText] = useState<string>('');
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [currentStepText, setCurrentStepText] = useState<string>('');
  const [executionError, setExecutionError] = useState<string | null>(null);
  const [executionSuccess, setExecutionSuccess] = useState<EndTermResult | null>(null);

  useEffect(() => {
    if (isOpen) {
      const defaultName = generateArchiveTabName(currentTerm, currentSession);
      setArchiveTabName(defaultName);
      setHasManualBackup(false);
      setConfirmedCheckbox(false);
      setConfirmationText('');
      setExecutionError(null);
      setExecutionSuccess(null);
      setIsExecuting(false);
      setCurrentStepText('');
      
      // Auto-suggest next term
      if (currentTerm.toLowerCase().includes('first') || currentTerm.toLowerCase().includes('1st')) {
        setNewTermLabel('2nd Term');
      } else if (currentTerm.toLowerCase().includes('second') || currentTerm.toLowerCase().includes('2nd')) {
        setNewTermLabel('3rd Term');
      } else {
        setNewTermLabel('1st Term');
      }
      setNewSessionLabel(currentSession);
    }
  }, [isOpen, currentTerm, currentSession]);

  if (!isOpen) return null;

  const handleDownloadCsv = () => {
    downloadCsvBackup(students, session, { term: currentTerm, academicSession: currentSession });
    setHasManualBackup(true);
  };

  const handleDownloadJson = () => {
    downloadJsonBackup(students, session, { term: currentTerm, session: currentSession });
    setHasManualBackup(true);
  };

  const handleRunEndTerm = async () => {
    if (students.length === 0) {
      setExecutionError('No student records found to archive.');
      return;
    }

    setIsExecuting(true);
    setExecutionError(null);
    setExecutionSuccess(null);

    try {
      setCurrentStepText('1/3: Archiving term snapshot...');
      await new Promise((r) => setTimeout(r, 300));

      setCurrentStepText(`2/3: Resetting balances & updating fee schedules for ${newTermLabel || 'next term'}...`);
      const schoolId = activeSchool?.id || 'dominion-group';

      const result = await executeEndTermWorkflow(students, session, schoolId, {
        customTabName: archiveTabName.trim() || defaultArchiveTab,
        newTermLabel: newTermLabel.trim() || undefined,
        newSessionLabel: newSessionLabel.trim() || undefined,
        schoolProfile: activeSchool || undefined,
      });

      setCurrentStepText('3/3: Syncing to Firebase Cloud Firestore...');
      await new Promise((r) => setTimeout(r, 300));

      setExecutionSuccess(result);
      onEndTermComplete(result.updatedStudents, result.message);
    } catch (err: any) {
      console.error('End Term Execution Failed:', err);
      setExecutionError(
        err.message || 'End Term failed during execution. Live fee data was NOT modified.'
      );
    } finally {
      setIsExecuting(false);
    }
  };

  const isFormValid = Boolean(
    archiveTabName.trim() &&
    confirmedCheckbox &&
    (confirmationText.trim().toUpperCase() === 'END TERM' || confirmationText.trim().toUpperCase() === 'CONFIRM')
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92dvh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/90">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-rose-600 text-white flex items-center justify-center shadow-xs">
              <Archive className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">End Term & Data Archive</h2>
              <p className="text-[11px] text-slate-500">
                Backup to new sheet tab & reset fee balances to ₦0
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isExecuting}
            id="close-end-term-modal-btn"
            className="p-1.5 rounded-full hover:bg-slate-200 text-slate-500 transition-colors disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Success State */}
          {executionSuccess ? (
            <div className="space-y-4 py-2">
              <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 text-center space-y-2">
                <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center mx-auto shadow-sm">
                  <CheckCircle2 className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-emerald-900">End Term Completed Successfully</h3>
                <p className="text-xs text-emerald-800 leading-relaxed font-medium">
                  {executionSuccess.message}
                </p>
              </div>

              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2 text-xs">
                <div className="flex items-center justify-between border-b border-slate-200/60 pb-1.5">
                  <span className="text-slate-500 font-medium">Backup Sheet Tab Created:</span>
                  <span className="font-mono font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                    {executionSuccess.backupTabName}
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-slate-200/60 pb-1.5">
                  <span className="text-slate-500 font-medium">Records Preserved & Zeroed:</span>
                  <span className="font-mono font-bold text-slate-900">
                    {executionSuccess.rowCount} Students
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Live Fee Balances:</span>
                  <span className="font-mono font-bold text-emerald-600">
                    ₦0.00 (Clean Slate Ready)
                  </span>
                </div>
              </div>

              <button
                onClick={onClose}
                className="w-full py-3 bg-slate-900 hover:bg-black text-white font-bold text-xs rounded-2xl shadow-sm transition-all"
              >
                Close & Return to Dashboard
              </button>
            </div>
          ) : (
            <>
              {/* Warning Banner */}
              <div className="p-3.5 bg-amber-50 rounded-2xl border border-amber-200/80 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-900">
                  <span className="font-bold block">Important Notice:</span>
                  Ending the term duplicates your current live records into an archive tab inside your Google Sheet, then resets all student fee amounts, payments, and balances to ₦0. All student names and classes are preserved.
                </div>
              </div>

              {/* Step 1: Manual Backup Recommended Prompt */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold flex items-center justify-center">
                      1
                    </span>
                    <h4 className="text-xs font-bold text-slate-900">
                      Step 1: Download Manual Backup (Highly Recommended)
                    </h4>
                  </div>
                  {hasManualBackup && (
                    <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Downloaded</span>
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Before performing automated spreadsheet operations, download a copy of the current data directly to your computer or phone:
                </p>
                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  <button
                    type="button"
                    onClick={handleDownloadCsv}
                    id="end-term-manual-csv-btn"
                    className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-800 rounded-xl border border-slate-200 text-xs font-bold flex items-center gap-1.5 shadow-xs active:scale-95 transition-all"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Download CSV Backup</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadJson}
                    className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-800 rounded-xl border border-slate-200 text-xs font-bold flex items-center gap-1.5 shadow-xs active:scale-95 transition-all"
                  >
                    <Download className="w-3.5 h-3.5 text-blue-600" />
                    <span>Download JSON Archive</span>
                  </button>
                </div>
              </div>

              {/* Step 2: Spreadsheet Archive Tab Configuration */}
              <div className="p-3.5 bg-white rounded-2xl border border-slate-200 space-y-3">
                <div className="flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold flex items-center justify-center">
                    2
                  </span>
                  <h4 className="text-xs font-bold text-slate-900">
                    Step 2: Google Spreadsheet Archive Tab Name
                  </h4>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    New Sheet/Tab Name for Backup:
                  </label>
                  <input
                    type="text"
                    id="end-term-archive-tab-input"
                    value={archiveTabName}
                    onChange={(e) => setArchiveTabName(e.target.value)}
                    placeholder="e.g. Archive - First Term 2025-2026"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    A new tab with this exact name will be created inside your Google Spreadsheet to store current data.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-1">
                      Next Term Label
                    </label>
                    <input
                      type="text"
                      value={newTermLabel}
                      onChange={(e) => setNewTermLabel(e.target.value)}
                      placeholder="e.g. 2nd Term"
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-1">
                      Academic Session
                    </label>
                    <input
                      type="text"
                      value={newSessionLabel}
                      onChange={(e) => setNewSessionLabel(e.target.value)}
                      placeholder="e.g. 2025/2026"
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
              </div>

              {/* Step 3: Required Confirmation */}
              <div className="p-3.5 bg-rose-50/50 rounded-2xl border border-rose-200 space-y-3">
                <div className="flex items-center gap-1.5">
                  <span className="w-5 h-5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-bold flex items-center justify-center">
                    3
                  </span>
                  <h4 className="text-xs font-bold text-rose-900">
                    Step 3: Verification & Safety Confirmation
                  </h4>
                </div>

                <label className="flex items-start gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    id="end-term-confirm-checkbox"
                    checked={confirmedCheckbox}
                    onChange={(e) => setConfirmedCheckbox(e.target.checked)}
                    className="mt-0.5 text-rose-600 rounded focus:ring-rose-500"
                  />
                  <span className="leading-snug text-[11px]">
                    I confirm that after creating and verifying the spreadsheet backup tab, all student fee fields (<code className="bg-slate-100 px-1 py-0.5 rounded text-rose-700 font-mono">fee_amount</code>, <code className="bg-slate-100 px-1 py-0.5 rounded text-rose-700 font-mono">amount_paid</code>, <code className="bg-slate-100 px-1 py-0.5 rounded text-rose-700 font-mono">balance</code>) will be reset to 0 in the live sheet.
                  </span>
                </label>

                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-rose-800 mb-1">
                    Type <span className="font-mono underline">END TERM</span> to confirm:
                  </label>
                  <input
                    type="text"
                    id="end-term-confirm-text-input"
                    value={confirmationText}
                    onChange={(e) => setConfirmationText(e.target.value)}
                    placeholder="Type END TERM"
                    className="w-full px-3 py-2 bg-white border border-rose-300 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-rose-500"
                  />
                </div>
              </div>

              {/* Progress Indicator */}
              {isExecuting && (
                <div className="p-3 bg-blue-50 rounded-2xl border border-blue-200 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-bold text-blue-900">
                    <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
                    <span>Processing End Term Operation...</span>
                  </div>
                  <p className="text-[11px] text-blue-700 font-mono">{currentStepText}</p>
                </div>
              )}

              {/* Error Message */}
              {executionError && (
                <div className="p-3.5 bg-rose-50 rounded-2xl border border-rose-200 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-rose-900 leading-tight">
                    <span className="font-bold block">Operation Halted:</span>
                    {executionError}
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isExecuting}
                  id="cancel-end-term-btn"
                  className="flex-1 py-3 px-3 rounded-2xl bg-slate-100 text-slate-700 text-xs font-bold hover:bg-slate-200 border border-slate-200 disabled:opacity-40 transition-all"
                >
                  Cancel
                </button>

                <button
                  type="button"
                  onClick={handleRunEndTerm}
                  disabled={!isFormValid || isExecuting}
                  id="execute-end-term-confirmed-btn"
                  className="flex-1 py-3 px-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md shadow-rose-600/20 flex items-center justify-center gap-1.5 active:scale-98 disabled:opacity-40 transition-all"
                >
                  {isExecuting ? (
                    <span>Running...</span>
                  ) : (
                    <>
                      <Archive className="w-4 h-4" />
                      <span>Backup & End Term</span>
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
