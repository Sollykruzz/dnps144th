/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  X, 
  Archive, 
  Download, 
  RefreshCw, 
  ShieldCheck, 
  AlertTriangle, 
  FileSpreadsheet, 
  CheckCircle2, 
  Trash2, 
  Calendar, 
  Sparkles,
  ArrowRight,
  Database
} from 'lucide-react';
import { 
  StudentPaymentRecord, 
  BursarSession, 
  TermSnapshot, 
  RolloverConfig 
} from '../types';
import { 
  downloadCsvBackup, 
  downloadJsonBackup, 
  downloadAllCurrentDataCsvBackup,
  saveLocalSnapshot, 
  getStoredSnapshots, 
  deleteStoredSnapshot, 
  executeTermRollover, 
  executeCleanSlateWipe 
} from '../services/backupService';
import { 
  saveTermBackupToFirestore, 
  getTermBackupsFromFirestore, 
  deleteTermBackupFromFirestore 
} from '../services/firebase';
import { getSavedRemittances } from '../services/remittanceService';
import { getStoredScholarships } from '../services/storage';
import { getStoredExpenses } from '../services/expenseService';
import { formatCurrency, formatDate, promoteSchoolClass, STANDARD_CLASSES } from '../services/calculations';

interface BackupRolloverModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: StudentPaymentRecord[];
  session: BursarSession;
  onRolloverComplete: (newStudents: StudentPaymentRecord[], message: string) => void;
  onCleanSlateComplete?: (message: string) => Promise<void> | void;
}

type ModalTab = 'rollover' | 'archives' | 'export';

export const BackupRolloverModal: React.FC<BackupRolloverModalProps> = ({
  isOpen,
  onClose,
  students,
  session,
  onRolloverComplete,
  onCleanSlateComplete,
}) => {
  const [activeTab, setActiveTab] = useState<ModalTab>('rollover');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [hasDownloadedBackup, setHasDownloadedBackup] = useState<boolean>(false);
  const [archives, setArchives] = useState<TermSnapshot[]>([]);
  const [selectedSnapshot, setSelectedSnapshot] = useState<TermSnapshot | null>(null);

  // Rollover Form State
  const currentTerm = students[0]?.term || '1st Term';
  const currentSession = students[0]?.session || '2024/2025';

  const defaultNextTerm = currentTerm.includes('1st')
    ? '2nd Term'
    : currentTerm.includes('2nd')
    ? '3rd Term'
    : '1st Term';

  const [targetTerm, setTargetTerm] = useState<string>(defaultNextTerm);
  const [targetSession, setTargetSession] = useState<string>(currentSession);
  const [actionType, setActionType] = useState<'rollover_reset' | 'promote_classes' | 'clean_slate'>('rollover_reset');
  const [feeOption, setFeeOption] = useState<'keep' | 'standard'>('keep');
  const [standardFeeAmount, setStandardFeeAmount] = useState<string>('');
  const [confirmInput, setConfirmInput] = useState<string>('');
  const [rolloverError, setRolloverError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const localArchives = getStoredSnapshots(session.schoolId || 'dominion-group');
      setArchives(localArchives);
      setHasDownloadedBackup(false);
      setConfirmInput('');
      setRolloverError(null);

      // Also pull remote snapshots from Firestore
      getTermBackupsFromFirestore(session.schoolId || 'dominion-group')
        .then((remoteBackups) => {
          if (Array.isArray(remoteBackups) && remoteBackups.length > 0) {
            const merged = [...remoteBackups];
            localArchives.forEach((local) => {
              if (!merged.some((m) => m.id === local.id)) {
                merged.push(local);
              }
            });
            setArchives(merged);
          }
        })
        .catch((err) => console.warn('[Firestore] Error fetching backups:', err));
    }
  }, [isOpen, session.schoolId]);

  if (!isOpen) return null;

  const handleDownloadCsv = () => {
    downloadCsvBackup(students, session, { term: currentTerm, academicSession: currentSession });
    setHasDownloadedBackup(true);
  };

  const handleDownloadJson = () => {
    downloadJsonBackup(students, session, { term: currentTerm, session: currentSession });
    setHasDownloadedBackup(true);
  };

  const handleCreateInstantSnapshot = () => {
    const snap = saveLocalSnapshot(
      students,
      session,
      currentTerm,
      currentSession,
      'Manual snapshot archive',
      session.schoolId || 'dominion-group'
    );
    // Push snapshot to Firestore
    saveTermBackupToFirestore(snap, session.schoolId || 'dominion-group').catch((err) =>
      console.warn('[Firestore] Error saving backup snapshot:', err)
    );
    setArchives(getStoredSnapshots(session.schoolId || 'dominion-group'));
    setHasDownloadedBackup(true);
  };

  const handleDeleteSnapshot = (id: string) => {
    deleteStoredSnapshot(id, session.schoolId || 'dominion-group');
    deleteTermBackupFromFirestore(id, session.schoolId || 'dominion-group').catch((err) =>
      console.warn('[Firestore] Error deleting backup snapshot:', err)
    );
    setArchives(getStoredSnapshots(session.schoolId || 'dominion-group'));
    if (selectedSnapshot?.id === id) {
      setSelectedSnapshot(null);
    }
  };

  const handleExecuteRollover = async () => {
    setIsProcessing(true);
    try {
      if (actionType === 'clean_slate') {
        // Step 1: Save full snapshot of existing records for permanent historical safekeeping
        const { snapshot } = await executeCleanSlateWipe(students, session);
        saveTermBackupToFirestore(snapshot, session.schoolId || 'dominion-group').catch(() => {});
        setArchives(getStoredSnapshots(session.schoolId || 'dominion-group'));

        // Step 2: AUTOMATICALLY download all current data as CSV before wiping!
        const currentRemittances = getSavedRemittances(session.schoolId || 'dominion-group');
        const currentScholarships = getStoredScholarships(session.schoolId || 'dominion-group');
        const currentExpenses = getStoredExpenses(session.schoolId || 'dominion-group');

        downloadAllCurrentDataCsvBackup(
          {
            students,
            remittances: currentRemittances,
            scholarships: currentScholarships,
            expenses: currentExpenses,
          },
          session,
          { term: currentTerm, academicSession: currentSession }
        );

        // Pause briefly to ensure the browser has initiated the file download before wiping storage
        await new Promise((resolve) => setTimeout(resolve, 350));

        // Step 3: Wipe active roster and financial records to bring brand new app
        if (onCleanSlateComplete) {
          await onCleanSlateComplete(
            `All current data downloaded as CSV! Active student roster and records wiped for a brand-new app.`
          );
        } else {
          onRolloverComplete(
            [],
            `All current data downloaded as CSV! Active student roster and records wiped for a brand-new app.`
          );
        }
        onClose();
        return;
      } else {
        const config: RolloverConfig = {
          targetTerm,
          targetSession,
          actionType,
          keepIndividualFees: feeOption === 'keep',
          standardFeeAmount: feeOption === 'standard' ? Number(standardFeeAmount) || 0 : undefined,
        };

        const { updatedStudents, snapshot } = await executeTermRollover(
          students,
          config,
          session
        );
        saveTermBackupToFirestore(snapshot, session.schoolId || 'dominion-group').catch(() => {});

        setArchives(getStoredSnapshots(session.schoolId || 'dominion-group'));
        onRolloverComplete(
          updatedStudents,
          `Clean slate ready for ${targetTerm} (${targetSession})! ${updatedStudents.length} students enrolled with reset ₦0 payment balances.`
        );
      }
      onClose();
    } catch (err: any) {
      setRolloverError(`Rollover error: ${err.message || 'Unable to complete rollover'}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92dvh]">
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-xs">
              <Archive className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Term Backup & Clean Slate</h2>
              <p className="text-[11px] text-slate-500">
                Archive records & roll over seamlessly to next term
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-200 text-slate-500 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Error notification banner if any */}
        {rolloverError && (
          <div className="mx-5 mt-4 p-3 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 font-medium flex items-center justify-between">
            <span>{rolloverError}</span>
            <button
              type="button"
              onClick={() => setRolloverError(null)}
              className="text-rose-500 hover:text-rose-700 ml-2"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-100 bg-white px-5 pt-2">
          <button
            onClick={() => setActiveTab('rollover')}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'rollover'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-400 hover:text-slate-700'
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Next Term Rollover</span>
          </button>

          <button
            onClick={() => setActiveTab('archives')}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'archives'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-400 hover:text-slate-700'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            <span>Saved Archives ({archives.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('export')}
            className={`pb-2.5 px-3 text-xs font-bold border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'export'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-400 hover:text-slate-700'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export & Backup</span>
          </button>
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {activeTab === 'rollover' && (
            <div className="space-y-4">
              {/* Step 1: Backup Requirement */}
              <div className="bg-slate-50 rounded-2xl p-3.5 border border-slate-200/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold flex items-center justify-center">
                      1
                    </div>
                    <span className="text-xs font-bold text-slate-900">
                      Step 1: Secure Current Term Backup
                    </span>
                  </div>
                  {hasDownloadedBackup && (
                    <span className="text-[10px] text-emerald-700 bg-emerald-100 font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Backup Secured</span>
                    </span>
                  )}
                </div>

                <p className="text-[11px] text-slate-600">
                  Before resetting payments to a clean slate, download your current {currentTerm} records or save a snapshot.
                </p>

                <div className="flex items-center gap-2 pt-1 flex-wrap">
                  <button
                    onClick={handleDownloadCsv}
                    className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-800 rounded-xl border border-slate-200 text-xs font-semibold flex items-center gap-1.5 shadow-xs active:scale-95 transition-all"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Download CSV</span>
                  </button>

                  <button
                    onClick={handleCreateInstantSnapshot}
                    className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-800 rounded-xl border border-slate-200 text-xs font-semibold flex items-center gap-1.5 shadow-xs active:scale-95 transition-all"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                    <span>Save to In-App Archive</span>
                  </button>
                </div>
              </div>

              {/* Step 2: Next Term or Next Session Configuration */}
              <div className="bg-white rounded-2xl p-3.5 border border-slate-200 space-y-3">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold flex items-center justify-center">
                    2
                  </div>
                  <span className="text-xs font-bold text-slate-900">
                    Step 2: Choose Transition Workflow
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-2.5">
                  {/* Option A: Next Term (No Class Upgrade) */}
                  <label
                    className={`p-3.5 rounded-2xl border flex items-start gap-3 cursor-pointer transition-all ${
                      actionType === 'rollover_reset'
                        ? 'bg-blue-50/80 border-blue-500 ring-2 ring-blue-500/20'
                        : 'hover:bg-slate-50 border-slate-200'
                    }`}
                  >
                    <input
                      type="radio"
                      name="actionType"
                      checked={actionType === 'rollover_reset'}
                      onChange={() => {
                        setActionType('rollover_reset');
                        setTargetTerm(defaultNextTerm);
                        setTargetSession(currentSession);
                      }}
                      className="mt-1 text-blue-600 focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-black text-slate-900">
                          Next Term (Same Class • Zero Out Fees)
                        </span>
                        <span className="text-[10px] font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full whitespace-nowrap">
                          Termly
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                        Moves all student records & names to the next term. <strong>Does NOT upgrade class</strong> (e.g. Primary 2 remains Primary 2). Excludes past amounts and resets all payments to ₦0 so everyone starts fresh. <em>All active scholarships are permanently preserved.</em>
                      </p>
                    </div>
                  </label>

                  {/* Option B: Next Session (Class Upgrade) */}
                  <label
                    className={`p-3.5 rounded-2xl border flex items-start gap-3 cursor-pointer transition-all ${
                      actionType === 'promote_classes'
                        ? 'bg-blue-50/80 border-blue-500 ring-2 ring-blue-500/20'
                        : 'hover:bg-slate-50 border-slate-200'
                    }`}
                  >
                    <input
                      type="radio"
                      name="actionType"
                      checked={actionType === 'promote_classes'}
                      onChange={() => {
                        setActionType('promote_classes');
                        setTargetTerm('1st Term');
                        // Auto increment academic session if standard format YYYY/YYYY
                        const sessionMatch = currentSession.match(/(\d{4})\/(\d{4})/);
                        if (sessionMatch) {
                          const y1 = parseInt(sessionMatch[1], 10) + 1;
                          const y2 = parseInt(sessionMatch[2], 10) + 1;
                          setTargetSession(`${y1}/${y2}`);
                        }
                      }}
                      className="mt-1 text-blue-600 focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-black text-slate-900">
                          Next Session (Upgrade Class • New Academic Year)
                        </span>
                        <span className="text-[10px] font-bold bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full whitespace-nowrap">
                          Annual
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                        Advances to a new session (e.g. {currentSession} → Next Year), sets term to 1st Term, <strong>upgrades all student classes</strong> (Nursery → Pri 1... → Jss 2), excludes amounts to reset balances to ₦0, and <strong>retains all active scholarships & waivers</strong>.
                      </p>
                    </div>
                  </label>

                  {/* Option C: 100% Blank Slate */}
                  <label
                    className={`p-3.5 rounded-2xl border flex items-start gap-3 cursor-pointer transition-all ${
                      actionType === 'clean_slate'
                        ? 'bg-rose-50/90 border-rose-400 ring-2 ring-rose-400/20'
                        : 'hover:bg-slate-50 border-slate-200'
                    }`}
                  >
                    <input
                      type="radio"
                      name="actionType"
                      checked={actionType === 'clean_slate'}
                      onChange={() => setActionType('clean_slate')}
                      className="mt-1 text-rose-600 focus:ring-rose-500"
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-black text-rose-900">
                          Total Clean Slate (Wipe Active Roster)
                        </span>
                        <span className="text-[10px] font-bold bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full whitespace-nowrap">
                          Auto-Download CSV & Wipe
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 mt-1 leading-relaxed">
                        Automatically downloads all your current student records and financial data as a CSV file to your computer, saves a permanent historical archive, and wipes the app clean for a fresh start.
                      </p>
                    </div>
                  </label>
                </div>

                {/* Clean Slate Assurance & Auto-Download Notice */}
                {actionType === 'clean_slate' && (
                  <div className="bg-rose-50/90 border border-rose-200 rounded-2xl p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
                        <Download className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black text-rose-900">
                          Automatic CSV Backup Safeguard Enabled
                        </h4>
                        <p className="text-[11px] text-rose-800/90 mt-0.5 leading-relaxed">
                          Before wiping, the system will <strong>automatically trigger a complete CSV download</strong> of your entire school database (all student payment records, fee breakdowns, and remittances) directly to your device.
                        </p>
                      </div>
                    </div>

                    <div className="bg-white/90 rounded-xl p-3 border border-rose-100 text-[11px] space-y-2 text-slate-700">
                      <div className="flex items-center gap-2 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span><strong>1. Automatic CSV Download:</strong> All records saved to your device immediately</span>
                      </div>
                      <div className="flex items-center gap-2 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span><strong>2. Historical Snapshot:</strong> Archived under Archives tab for future review</span>
                      </div>
                      <div className="flex items-center gap-2 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span><strong>3. Brand New App:</strong> Student roster, balances, and remittances reset to clean slate</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Term & Session Inputs for Rollover */}
                {actionType !== 'clean_slate' && (
                  <div className="space-y-2 pt-1">
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                          Target Term Label
                        </label>
                        <input
                          type="text"
                          value={targetTerm}
                          onChange={(e) => setTargetTerm(e.target.value)}
                          placeholder="e.g. 2nd Term"
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1">
                          Academic Session
                        </label>
                        <input
                          type="text"
                          value={targetSession}
                          onChange={(e) => setTargetSession(e.target.value)}
                          placeholder="e.g. 2025/2026"
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>

                    {/* Live Preview Box */}
                    {students.length > 0 && (
                      <div className="mt-3 bg-slate-50/90 rounded-2xl p-3 border border-slate-200 text-xs">
                        <div className="flex items-center justify-between mb-2 pb-1 border-b border-slate-200">
                          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                            Live Transformation Preview ({students.length} students)
                          </span>
                          <span className="text-[10px] font-mono font-bold text-blue-700">
                            {actionType === 'promote_classes' ? 'Class Upgrade Mode' : 'Same Class Mode'}
                          </span>
                        </div>
                        <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
                          {students.slice(0, 4).map((s) => {
                            const newClass = actionType === 'promote_classes' ? promoteSchoolClass(s.class) : s.class;
                            return (
                              <div key={s.id} className="flex items-center justify-between bg-white px-2.5 py-1.5 rounded-xl border border-slate-100 text-[11px]">
                                <span className="font-semibold text-slate-800 truncate max-w-[110px]">{s.full_name}</span>
                                <div className="flex items-center gap-1.5 text-slate-600">
                                  <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">{s.class}</span>
                                  <ArrowRight className="w-3 h-3 text-slate-400" />
                                  <span className={`font-mono font-bold px-1.5 py-0.5 rounded text-[10px] ${actionType === 'promote_classes' ? 'bg-indigo-50 text-indigo-700' : 'bg-blue-50 text-blue-700'}`}>
                                    {newClass}
                                  </span>
                                </div>
                                <span className="text-[10px] text-emerald-700 font-bold">₦0 Paid (Unpaid)</span>
                              </div>
                            );
                          })}
                        </div>
                        {students.length > 4 && (
                          <p className="text-[10px] text-slate-400 text-center mt-1.5">
                            + {students.length - 4} more student(s) will be rolled over identically
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Step 3: Fee Amount Strategy */}
              {actionType !== 'clean_slate' && (
                <div className="bg-white rounded-2xl p-3.5 border border-slate-200 space-y-2.5">
                  <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-bold flex items-center justify-center">
                      3
                    </div>
                    <span className="text-xs font-bold text-slate-900">
                      Step 3: New Term Fee Amounts
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-xs font-medium text-slate-700">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="feeOption"
                        checked={feeOption === 'keep'}
                        onChange={() => setFeeOption('keep')}
                        className="text-blue-600"
                      />
                      <span>Keep each student's current fee amount</span>
                    </label>

                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="feeOption"
                        checked={feeOption === 'standard'}
                        onChange={() => setFeeOption('standard')}
                        className="text-blue-600"
                      />
                      <span>Set uniform standard fee</span>
                    </label>
                  </div>

                  {feeOption === 'standard' && (
                    <div className="pt-1">
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        Standard Fee for New Term ({session.currencySymbol})
                      </label>
                      <input
                        type="number"
                        value={standardFeeAmount}
                        onChange={(e) => setStandardFeeAmount(e.target.value)}
                        placeholder="e.g. 50000"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Execution confirmation */}
              <div className="pt-2">
                <button
                  onClick={handleExecuteRollover}
                  disabled={isProcessing}
                  id="execute-term-rollover-btn"
                  className={`w-full py-3.5 rounded-2xl font-bold text-xs flex items-center justify-center gap-2 shadow-lg active:scale-98 transition-all disabled:opacity-50 ${
                    actionType === 'clean_slate'
                      ? 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-600/20'
                      : 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-600/20'
                  }`}
                >
                  {actionType === 'clean_slate' ? (
                    <Download className="w-4 h-4" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  <span>
                    {isProcessing
                      ? (actionType === 'clean_slate' ? 'Downloading CSV & Wiping...' : 'Processing Rollover...')
                      : actionType === 'clean_slate'
                      ? 'Download CSV & Wipe Clean Slate'
                      : `Save Backup & Start Clean Slate for ${targetTerm}`}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* Tab 2: Historical Archives */}
          {activeTab === 'archives' && (
            <div className="space-y-3">
              {archives.length === 0 ? (
                <div className="text-center py-10 bg-slate-50 rounded-2xl border border-slate-200/80 p-4">
                  <Archive className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <h4 className="text-xs font-bold text-slate-700">No Term Archives Stored Yet</h4>
                  <p className="text-[11px] text-slate-500 max-w-xs mx-auto mt-1">
                    Whenever you roll over to a new term or create a backup snapshot, it will appear here for historical inspection.
                  </p>
                </div>
              ) : (
                archives.map((snap) => (
                  <div
                    key={snap.id}
                    className="p-3.5 bg-slate-50 hover:bg-blue-50/40 rounded-2xl border border-slate-200 transition-all space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-bold text-slate-900 block">
                          {snap.term} ({snap.session})
                        </span>
                        <span className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          <span>Archived on {formatDate(snap.dateLabel)}</span>
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => downloadCsvBackup(snap.students, session, { term: snap.term, academicSession: snap.session })}
                          title="Download Snapshot CSV"
                          className="p-1.5 bg-white hover:bg-slate-100 rounded-lg border border-slate-200 text-slate-700 shadow-xs"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => handleDeleteSnapshot(snap.id)}
                          title="Delete Snapshot"
                          className="p-1.5 bg-white hover:bg-rose-50 rounded-lg border border-slate-200 text-rose-600 shadow-xs"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-1 text-[10px] font-mono border-t border-slate-200/60">
                      <div>
                        <span className="text-slate-400 block">Students</span>
                        <span className="font-bold text-slate-800">{snap.studentCount}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Collected</span>
                        <span className="font-bold text-emerald-600">
                          {formatCurrency(snap.totalPaid, snap.currencySymbol)}
                        </span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Debt</span>
                        <span className="font-bold text-rose-600">
                          {formatCurrency(snap.totalBalance, snap.currencySymbol)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Tab 3: Export & Backup */}
          {activeTab === 'export' && (
            <div className="space-y-4">
              <div className="p-4 bg-blue-50/60 rounded-2xl border border-blue-200 space-y-2">
                <h3 className="text-xs font-bold text-blue-900 flex items-center gap-1.5">
                  <Download className="w-4 h-4 text-blue-600" />
                  <span>Instant Data Export</span>
                </h3>
                <p className="text-[11px] text-blue-800 leading-relaxed">
                  Export the active student list with full payment histories and calculations into standard CSV spreadsheet format or structured JSON.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 bg-white rounded-2xl border border-slate-200 space-y-3 flex flex-col justify-between">
                  <div>
                    <FileSpreadsheet className="w-6 h-6 text-emerald-600 mb-1.5" />
                    <h4 className="text-xs font-bold text-slate-900">Microsoft Excel / CSV</h4>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Spreadsheet file compatible with Microsoft Excel, Google Sheets, and Apple Numbers.
                    </p>
                  </div>
                  <button
                    onClick={handleDownloadCsv}
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download CSV</span>
                  </button>
                </div>

                <div className="p-3.5 bg-white rounded-2xl border border-slate-200 space-y-3 flex flex-col justify-between">
                  <div>
                    <Database className="w-6 h-6 text-blue-600 mb-1.5" />
                    <h4 className="text-xs font-bold text-slate-900">Full JSON Archive</h4>
                    <p className="text-[10px] text-slate-500 mt-0.5">
                      Complete machine-readable backup containing class aggregations and student rows.
                    </p>
                  </div>
                  <button
                    onClick={handleDownloadJson}
                    className="w-full py-2 bg-slate-900 hover:bg-black text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download JSON</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
