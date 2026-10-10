/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
import { 
  Wallet, 
  ArrowUpRight, 
  CheckCircle2, 
  Plus, 
  Trash2, 
  Printer, 
  Download, 
  Calendar, 
  FileText, 
  Clock, 
  AlertCircle, 
  ShieldCheck, 
  X, 
  DollarSign, 
  UserCheck, 
  Landmark,
  HandCoins,
  History,
  Receipt,
  RefreshCw,
  Edit2,
  AlertTriangle,
  RotateCcw,
  Ban,
  Check,
  Search,
  ChevronRight,
  Info,
  Lock,
  PieChart,
  BarChart3,
  Layers,
  TrendingUp,
  Building2,
  CreditCard,
  Coins,
  ChevronDown,
  ChevronUp,
  SlidersHorizontal
} from 'lucide-react';
import { StudentPaymentRecord, RemittanceRecord, BursarSession, SchoolProfile } from '../types';
import { 
  getSavedRemittances, 
  saveRemittances,
  addRemittance, 
  updateRemittance,
  approveRemittance,
  rejectRemittance,
  voidRemittance,
  restoreVoidedRemittance,
  deleteRemittancePermanently,
  clearAllRemittances,
  calculateCollectionMetrics,
  calculateCollectionSourceBreakdown,
  validateRemittanceAmount,
  CollectionSourceBreakdown,
  FeeSourceItem,
  ClassSourceItem,
  PaymentChannelItem,
  mergeRemittanceRecords
} from '../services/remittanceService';
import { formatCurrency, formatDate, getTodayDateString, deriveFeeBreakdown } from '../services/calculations';
import { recordAuditLog } from '../services/auditLoggerService';
import { 
  batchSaveStudentsToFirestore,
  saveRemittanceToFirestore,
  getRemittancesFromFirestore,
  subscribeRemittancesFromFirestore,
  deleteRemittanceFromFirestore,
  wipeSchoolRemittancesFromFirestore,
  recordFirebaseSyncSuccess,
  getLastFirestoreWriteError,
} from '../services/firebase';

interface CollectionViewProps {
  students: StudentPaymentRecord[];
  session: BursarSession;
  onUpdateStudents?: (students: StudentPaymentRecord[]) => void;
  onSelectStudent?: (student: StudentPaymentRecord) => void;
  onOpenRecordPayment?: () => void;
  remittances?: RemittanceRecord[];
  onUpdateRemittances?: (records: RemittanceRecord[]) => void;
  initialSubTab?: 'remittances' | 'collections' | 'sources' | 'voided' | 'reconciliation';
  school?: SchoolProfile;
}

export const CollectionView: React.FC<CollectionViewProps> = ({
  students,
  session,
  onUpdateStudents,
  onSelectStudent,
  onOpenRecordPayment,
  remittances: propRemittances,
  onUpdateRemittances,
  initialSubTab = 'remittances',
  school,
}) => {
  const currentSchoolId = session.schoolId || 'dominion-group';
  const isAdmin = session.role === 'admin';

  // Internal remittances state (synchronized with props or local storage)
  const [remittances, setRemittancesState] = useState<RemittanceRecord[]>(() => {
    if (propRemittances && propRemittances.length > 0) return propRemittances;
    return getSavedRemittances(currentSchoolId);
  });

  const setRemittances = (records: RemittanceRecord[]) => {
    setRemittancesState(records);
    if (onUpdateRemittances) {
      queueMicrotask(() => {
        onUpdateRemittances(records);
      });
    }
  };

  // Sub-tabs: remittances | collections | sources | voided | reconciliation
  const [activeSubTab, setActiveSubTab] = useState<'remittances' | 'collections' | 'sources' | 'voided' | 'reconciliation'>(initialSubTab);

  // Mini Dashboard state for collection sources intelligence
  const [isSourceDashboardCollapsed, setIsSourceDashboardCollapsed] = useState(false);
  const [sourceViewMode, setSourceViewMode] = useState<'category' | 'class' | 'channel'>('category');

  // Remittance filter: all | approved | pending
  const [remittanceFilter, setRemittanceFilter] = useState<'all' | 'approved' | 'pending'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals & Action States
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [remittanceToEdit, setRemittanceToEdit] = useState<RemittanceRecord | null>(null);
  const [remittanceToVoid, setRemittanceToVoid] = useState<RemittanceRecord | null>(null);
  const [voidReasonInput, setVoidReasonInput] = useState('');
  const [remittanceToReject, setRemittanceToReject] = useState<RemittanceRecord | null>(null);
  const [rejectionReasonInput, setRejectionReasonInput] = useState('');
  const [remittanceToPurge, setRemittanceToPurge] = useState<RemittanceRecord | null>(null);
  const [isClearAllModalOpen, setIsClearAllModalOpen] = useState(false);

  // Loading States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isApprovingId, setIsApprovingId] = useState<string | null>(null);
  const [isProcessingAction, setIsProcessingAction] = useState(false);
  const [isSyncingRemittances, setIsSyncingRemittances] = useState(false);

  // Form input state
  const [amountInput, setAmountInput] = useState('');
  const [dateInput, setDateInput] = useState(getTodayDateString());
  const [remittedToInput, setRemittedToInput] = useState('First Bank (School Main Account)');
  const [customRecipient, setCustomRecipient] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'bank_deposit' | 'bank_transfer' | 'cash_handover' | 'pos_settlement' | 'other'>('bank_deposit');
  const [referenceNotes, setReferenceNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  // Toast feedback
  const [successToast, setSuccessToast] = useState<string | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);

  // Pagination for student payments
  const [visibleCollectionsCount, setVisibleCollectionsCount] = useState(30);

  // 1. Initial Load and Cloud Sync
  useEffect(() => {
    let isCancelled = false;

    // Load local storage first if prop is not provided
    if (!propRemittances || propRemittances.length === 0) {
      const local = getSavedRemittances(currentSchoolId);
      setRemittancesState(local);

      // Fetch from Firestore and reconcile if parent is not already managing remittances
      getRemittancesFromFirestore(currentSchoolId)
        .then(async (cloudList) => {
          if (isCancelled) return;
          const currentLocal = getSavedRemittances(currentSchoolId);
          
          // Push any local remittances missing from cloud
          const cloudIdSet = new Set(cloudList.map((r) => r.id));
          const unsynced = currentLocal.filter((r) => r.id && !cloudIdSet.has(r.id));
          if (unsynced.length > 0) {
            for (const item of unsynced) {
              await saveRemittanceToFirestore(item, currentSchoolId).catch((err) => {
                console.warn('[Remittance Sync] Note:', err);
              });
            }
          }

          const merged = mergeRemittanceRecords(currentLocal, cloudList);
          setRemittancesState(merged);
          saveRemittances(merged, currentSchoolId);
          recordFirebaseSyncSuccess();
          if (onUpdateRemittances) {
            queueMicrotask(() => {
              onUpdateRemittances(merged);
            });
          }
        })
        .catch((err) => {
          console.warn('[Firestore Remittance Note]', err);
        });
    }

    // Real-time listener only if parent is not already managing remittances prop
    let unsubscribe: (() => void) | null = null;
    if (!propRemittances) {
      unsubscribe = subscribeRemittancesFromFirestore(currentSchoolId, (liveList) => {
        if (isCancelled || !Array.isArray(liveList)) return;
        const currentLocal = getSavedRemittances(currentSchoolId);
        const merged = mergeRemittanceRecords(currentLocal, liveList);
        saveRemittances(merged, currentSchoolId);
        setRemittancesState(merged);
        if (onUpdateRemittances) {
          queueMicrotask(() => {
            onUpdateRemittances(merged);
          });
        }
      });
    }

    return () => {
      isCancelled = true;
      if (unsubscribe) unsubscribe();
    };
  }, [currentSchoolId, propRemittances, onUpdateRemittances]);

  // Keep internal state aligned if parent prop updates
  useEffect(() => {
    if (propRemittances) {
      setRemittancesState(propRemittances);
    }
  }, [propRemittances]);

  // Manual Cloud Sync
  const handleManualCloudSync = async () => {
    setIsSyncingRemittances(true);
    try {
      const cloudList = await getRemittancesFromFirestore(currentSchoolId);
      const local = getSavedRemittances(currentSchoolId);
      const merged = mergeRemittanceRecords(local, cloudList);
      setRemittances(merged);
      saveRemittances(merged, currentSchoolId);
      recordFirebaseSyncSuccess();
      setSuccessToast(`Cloud synchronized: ${merged.length} record(s) loaded.`);
      setTimeout(() => setSuccessToast(null), 3500);
    } catch (err: any) {
      setErrorToast(err?.message || 'Cloud sync encountered a network error.');
      setTimeout(() => setErrorToast(null), 4000);
    } finally {
      setIsSyncingRemittances(false);
    }
  };

  // Metrics calculation
  const metrics = useMemo(() => {
    return calculateCollectionMetrics(students, remittances, school);
  }, [students, remittances, school]);

  // Available remittance balance (Strict constraint: cannot remit beyond what she has collected)
  const availableRemittanceBalance = useMemo(() => {
    return Math.max(0, metrics.cashInHand - metrics.pendingRemitted);
  }, [metrics.cashInHand, metrics.pendingRemitted]);

  // Collection Source Breakdown calculation (mini dashboard highlighting where funds originated)
  const sourceBreakdown = useMemo(() => {
    return calculateCollectionSourceBreakdown(students, school);
  }, [students, school]);

  // Partition remittances: Active vs Voided
  const activeRemittances = useMemo(() => {
    return remittances.filter((r) => !r.isVoided && r.status !== 'voided' && r.approvalStatus !== 'voided');
  }, [remittances]);

  const voidedRemittances = useMemo(() => {
    return remittances
      .filter((r) => r.isVoided || r.status === 'voided' || r.approvalStatus === 'voided')
      .sort((a, b) => new Date(b.voidedAt || b.timestamp || 0).getTime() - new Date(a.voidedAt || a.timestamp || 0).getTime());
  }, [remittances]);

  const pendingRemittances = useMemo(() => {
    return activeRemittances.filter((r) => r.status === 'pending' || r.approvalStatus === 'pending');
  }, [activeRemittances]);

  const approvedRemittances = useMemo(() => {
    return activeRemittances.filter((r) => r.status === 'approved' || r.approvalStatus === 'approved' || (!r.status && !r.approvalStatus));
  }, [activeRemittances]);

  // Filtered list for the active Remittances tab
  const filteredRemittances = useMemo(() => {
    let list = activeRemittances;
    if (remittanceFilter === 'pending') {
      list = pendingRemittances;
    } else if (remittanceFilter === 'approved') {
      list = approvedRemittances;
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      list = list.filter((r) => 
        (r.referenceNumber || '').toLowerCase().includes(query) ||
        (r.remittedTo || '').toLowerCase().includes(query) ||
        (r.bursarName || '').toLowerCase().includes(query) ||
        (r.notes || '').toLowerCase().includes(query) ||
        String(r.amount).includes(query)
      );
    }

    return list.sort((a, b) => new Date(b.date || b.timestamp || 0).getTime() - new Date(a.date || a.timestamp || 0).getTime());
  }, [activeRemittances, pendingRemittances, approvedRemittances, remittanceFilter, searchQuery]);

  // Student payments collection feed
  const paidStudents = useMemo(() => {
    return students
      .filter((s) => {
        const admissionFee = Number(s.admission_fee) || 0;
        const admissionPaid = Number(s.admission_paid) || (admissionFee > 0 && s.is_new_admission ? admissionFee : 0);
        return (
          (Number(s.amount_paid) || 0) > 0 ||
          admissionPaid > 0 ||
          (Number(s.lesson_paid) || 0) > 0 ||
          (Number(s.exam_paid) || 0) > 0
        );
      })
      .sort((a, b) => (b.payment_date || '').localeCompare(a.payment_date || ''));
  }, [students]);

  // Sync approved total to students array and firestore
  const syncApprovedTotalToStudents = (newApprovedTotal: number) => {
    if (onUpdateStudents && students.length > 0) {
      const updated = students.map((s) => ({
        ...s,
        total_remitted: newApprovedTotal,
      }));
      queueMicrotask(() => {
        onUpdateStudents(updated);
      });
      batchSaveStudentsToFirestore(updated, currentSchoolId).catch(() => {});
    }
  };

  // Open Record Remittance modal
  const handleOpenRecordModal = (prefillAmount?: number) => {
    const availableBalance = Math.max(0, metrics.cashInHand - metrics.pendingRemitted);
    if (prefillAmount !== undefined) {
      setAmountInput(String(Math.min(prefillAmount, availableBalance)));
    } else if (availableBalance > 0) {
      setAmountInput(String(availableBalance));
    } else {
      setAmountInput('');
    }
    setDateInput(getTodayDateString());
    setRemittedToInput('First Bank (School Main Account)');
    setCustomRecipient('');
    setPaymentMethod('bank_deposit');
    setReferenceNotes('');
    if (availableBalance <= 0) {
      setFormError(`Balance is lower than amount she is remitting. There is currently ${formatCurrency(0, session.currencySymbol)} available in unremitted collections.`);
    } else {
      setFormError(null);
    }
    setIsRecordModalOpen(true);
  };

  // Save new remittance (Bursar submits request; Admin auto-approves)
  const handleSaveRemittance = async (e: React.FormEvent) => {
    e.preventDefault();
    const numAmount = Number(amountInput);

    if (isNaN(numAmount) || numAmount <= 0) {
      setFormError('Please enter a valid remittance amount greater than 0.');
      return;
    }

    // Strict validation: Do not let her remit beyond what she has collected
    // User requirement: "And don't let her remittance beyond what she has collect, if she tries report that balance is lower than amount she is remitting"
    const validation = validateRemittanceAmount(numAmount, students, remittances, school);
    if (!validation.isValid) {
      const errorMsg = validation.error || `Balance is lower than amount she is remitting. Available unremitted collection balance is ${formatCurrency(availableRemittanceBalance, session.currencySymbol)}.`;
      setFormError(errorMsg);
      setErrorToast(errorMsg);
      return;
    }

    const finalRecipient = remittedToInput === 'Custom' ? customRecipient.trim() : remittedToInput;
    if (!finalRecipient) {
      setFormError('Please select or specify the bank account or recipient.');
      return;
    }

    setIsSubmitting(true);
    setFormError(null);

    try {
      const isAutoApproved = isAdmin;
      const { newRecord, allRecords } = addRemittance(
        {
          amount: numAmount,
          date: dateInput || getTodayDateString(),
          remittedTo: finalRecipient,
          bursarName: session.bursarName || (isAdmin ? 'Administrator' : 'Bursar'),
          notes: referenceNotes.trim() || undefined,
          paymentMethod,
          submittedBy: session.bursarName || 'Bursar',
          submittedByRole: isAdmin ? 'admin' : 'bursar',
          status: isAutoApproved ? 'approved' : 'pending',
          approvalStatus: isAutoApproved ? 'approved' : 'pending',
          approvedBy: isAutoApproved ? (session.bursarName || 'Administrator') : undefined,
          approvedAt: isAutoApproved ? new Date().toISOString() : undefined,
          isVoided: false,
        },
        remittances,
        currentSchoolId
      );

      // Cloud Firestore write FIRST (Firestore as sole source of truth)
      const firestoreSuccess = await saveRemittanceToFirestore(newRecord, currentSchoolId);
      if (!firestoreSuccess) {
        const errorMsg = getLastFirestoreWriteError() || 'Failed saving remittance to Firestore database.';
        setFormError(errorMsg);
        setErrorToast(errorMsg);
        setTimeout(() => setErrorToast(null), 5000);
        recordAuditLog(
          'REMITTANCE',
          isAutoApproved ? 'RECORD_REMITTANCE' : 'SUBMIT_REMITTANCE',
          `Failed writing remittance [Ref: ${newRecord.referenceNumber}] to cloud: ${errorMsg}`,
          { amount: numAmount, remittedTo: finalRecipient, error: errorMsg },
          session.bursarName,
          session.schoolId,
          'WARNING'
        );
        return;
      }

      setRemittances(allRecords);
      setIsRecordModalOpen(false);

      // If Admin recorded, update student sheets immediately
      if (isAutoApproved) {
        const newTotalApproved = allRecords
          .filter((r) => !r.isVoided && (r.status === 'approved' || r.approvalStatus === 'approved' || (!r.status && !r.approvalStatus)))
          .reduce((acc, r) => acc + (Number(r.amount) || 0), 0);
        syncApprovedTotalToStudents(newTotalApproved);

        recordAuditLog(
          'REMITTANCE',
          'RECORD_REMITTANCE',
          `Admin [${session.bursarName}] recorded and booked remittance of ${formatCurrency(numAmount, session.currencySymbol)} to "${finalRecipient}" [Ref: ${newRecord.referenceNumber}]`,
          { amount: numAmount, remittedTo: finalRecipient, ref: newRecord.referenceNumber, status: 'approved' },
          session.bursarName,
          session.schoolId,
          'SUCCESS'
        );
        setSuccessToast(`✓ Remittance of ${formatCurrency(numAmount, session.currencySymbol)} recorded & approved into official ledger.`);
      } else {
        recordAuditLog(
          'REMITTANCE',
          'SUBMIT_REMITTANCE',
          `Bursar [${session.bursarName}] submitted collection remittance request of ${formatCurrency(numAmount, session.currencySymbol)} [Ref: ${newRecord.referenceNumber}] for Admin Approval`,
          { amount: numAmount, remittedTo: finalRecipient, ref: newRecord.referenceNumber, status: 'pending' },
          session.bursarName,
          session.schoolId,
          'INFO'
        );
        setSuccessToast(`Collection request submitted! It will appear on the Administrator's dashboard for acceptance.`);
      }

      setTimeout(() => setSuccessToast(null), 5000);
    } catch (err: any) {
      setFormError(err?.message || 'Failed to submit remittance.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Admin accepts a pending request
  const handleApproveRemittance = async (remittance: RemittanceRecord) => {
    if (!isAdmin) {
      setErrorToast('Permission Denied: Only School Administrator can accept collection requests.');
      setTimeout(() => setErrorToast(null), 4000);
      return;
    }

    setIsApprovingId(remittance.id);
    try {
      const { approvedRecord, allRecords } = approveRemittance(
        remittance.id,
        session.bursarName || 'Administrator',
        remittances,
        currentSchoolId
      );

      if (approvedRecord) {
        const firestoreSuccess = await saveRemittanceToFirestore(approvedRecord, currentSchoolId);
        if (!firestoreSuccess) {
          const errorMsg = getLastFirestoreWriteError() || 'Failed approving remittance in Firestore.';
          setErrorToast(errorMsg);
          setTimeout(() => setErrorToast(null), 4000);
          return;
        }
      }

      setRemittances(allRecords);

      const newTotalApproved = allRecords
        .filter((r) => !r.isVoided && (r.status === 'approved' || r.approvalStatus === 'approved' || (!r.status && !r.approvalStatus)))
        .reduce((acc, r) => acc + (Number(r.amount) || 0), 0);
      syncApprovedTotalToStudents(newTotalApproved);

      recordAuditLog(
        'REMITTANCE',
        'APPROVE_REMITTANCE',
        `Admin [${session.bursarName}] ACCEPTED remittance request of ${formatCurrency(remittance.amount, session.currencySymbol)} [Ref: ${remittance.referenceNumber}] to "${remittance.remittedTo}" — Posted to Official Ledger`,
        { id: remittance.id, amount: remittance.amount, ref: remittance.referenceNumber, approvedBy: session.bursarName },
        session.bursarName,
        session.schoolId,
        'SUCCESS'
      );

      setSuccessToast(`✓ Accepted remittance ${remittance.referenceNumber} (${formatCurrency(remittance.amount, session.currencySymbol)}) into official ledger.`);
      setTimeout(() => setSuccessToast(null), 4000);
    } catch (err: any) {
      setErrorToast(err?.message || 'Failed to accept remittance.');
      setTimeout(() => setErrorToast(null), 4000);
    } finally {
      setIsApprovingId(null);
    }
  };

  // Admin Quick Accept All pending requests
  const handleAcceptAllPending = async () => {
    if (!isAdmin || pendingRemittances.length === 0) return;
    setIsProcessingAction(true);
    try {
      let currentRecords = [...remittances];
      let approvedCount = 0;
      let failedCount = 0;

      for (const item of pendingRemittances) {
        const { approvedRecord, allRecords } = approveRemittance(
          item.id,
          session.bursarName || 'Administrator',
          currentRecords,
          currentSchoolId
        );
        if (approvedRecord) {
          let firestoreSuccess = false;
          try {
            firestoreSuccess = await saveRemittanceToFirestore(approvedRecord, currentSchoolId);
          } catch {
            firestoreSuccess = false;
          }

          if (firestoreSuccess) {
            currentRecords = allRecords;
            approvedCount++;
          } else {
            failedCount++;
          }
        }
      }

      if (approvedCount > 0) {
        setRemittances(currentRecords);

        const newTotalApproved = currentRecords
          .filter((r) => !r.isVoided && (r.status === 'approved' || r.approvalStatus === 'approved' || (!r.status && !r.approvalStatus)))
          .reduce((acc, r) => acc + (Number(r.amount) || 0), 0);
        syncApprovedTotalToStudents(newTotalApproved);
      }

      if (failedCount === 0) {
        setSuccessToast(`✓ Accepted all ${pendingRemittances.length} pending collection requests!`);
        setTimeout(() => setSuccessToast(null), 4000);
      } else if (approvedCount > 0) {
        setSuccessToast(`✓ ${approvedCount} of ${pendingRemittances.length} approved. ${failedCount} failed to sync to Cloud Firestore.`);
        setTimeout(() => setSuccessToast(null), 5000);
      } else {
        const lastErr = getLastFirestoreWriteError() || 'Failed to sync approvals to Cloud Firestore.';
        setErrorToast(`⚠️ Could not accept requests in Cloud Firestore: ${lastErr}`);
        setTimeout(() => setErrorToast(null), 5000);
      }
    } catch (err: any) {
      setErrorToast(err?.message || 'Error processing bulk acceptance.');
      setTimeout(() => setErrorToast(null), 4000);
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Admin rejects a pending request
  const handleConfirmReject = async () => {
    if (!remittanceToReject || !isAdmin) return;
    const reason = rejectionReasonInput.trim() || 'Returned by Administrator for clarification';
    setIsProcessingAction(true);
    try {
      const { rejectedRecord, allRecords } = rejectRemittance(
        remittanceToReject.id,
        session.bursarName || 'Administrator',
        reason,
        remittances,
        currentSchoolId
      );

      if (rejectedRecord) {
        const firestoreSuccess = await saveRemittanceToFirestore(rejectedRecord, currentSchoolId);
        if (!firestoreSuccess) {
          const errorMsg = getLastFirestoreWriteError() || 'Failed rejecting remittance in Firestore.';
          setErrorToast(errorMsg);
          setTimeout(() => setErrorToast(null), 4000);
          return;
        }
      }

      setRemittances(allRecords);

      const newTotalApproved = allRecords
        .filter((r) => !r.isVoided && (r.status === 'approved' || r.approvalStatus === 'approved' || (!r.status && !r.approvalStatus)))
        .reduce((acc, r) => acc + (Number(r.amount) || 0), 0);
      syncApprovedTotalToStudents(newTotalApproved);

      recordAuditLog(
        'REMITTANCE',
        'REJECT_REMITTANCE',
        `Admin [${session.bursarName}] REJECTED remittance submission [Ref: ${remittanceToReject.referenceNumber}] (${formatCurrency(remittanceToReject.amount, session.currencySymbol)}). Reason: ${reason}`,
        { id: remittanceToReject.id, amount: remittanceToReject.amount, ref: remittanceToReject.referenceNumber, reason },
        session.bursarName,
        session.schoolId,
        'WARNING'
      );

      setSuccessToast(`Remittance [${remittanceToReject.referenceNumber}] returned with note.`);
      setRemittanceToReject(null);
      setRejectionReasonInput('');
      setTimeout(() => setSuccessToast(null), 4000);
    } catch (err: any) {
      setErrorToast(err?.message || 'Failed to reject remittance.');
      setTimeout(() => setErrorToast(null), 4000);
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Admin voids a collection (Soft Delete -> Moves to Voided Tab)
  const handleConfirmVoid = async () => {
    if (!remittanceToVoid || !isAdmin) {
      setErrorToast('Permission Denied: Only Administrator can void remittances.');
      setTimeout(() => setErrorToast(null), 4000);
      return;
    }

    const reason = voidReasonInput.trim() || 'Voided by Administrator during ledger review';
    setIsProcessingAction(true);
    try {
      const { voidedRecord, allRecords } = voidRemittance(
        remittanceToVoid.id,
        session.bursarName || 'Administrator',
        reason,
        remittances,
        currentSchoolId
      );

      if (voidedRecord) {
        const firestoreSuccess = await saveRemittanceToFirestore(voidedRecord, currentSchoolId);
        if (!firestoreSuccess) {
          const errorMsg = getLastFirestoreWriteError() || 'Failed voiding remittance in Firestore.';
          setErrorToast(errorMsg);
          setTimeout(() => setErrorToast(null), 4000);
          return;
        }
      }

      setRemittances(allRecords);

      // Exclude voided remittance from official ledger
      const newTotalApproved = allRecords
        .filter((r) => !r.isVoided && (r.status === 'approved' || r.approvalStatus === 'approved' || (!r.status && !r.approvalStatus)))
        .reduce((acc, r) => acc + (Number(r.amount) || 0), 0);
      syncApprovedTotalToStudents(newTotalApproved);

      recordAuditLog(
        'REMITTANCE',
        'VOID_REMITTANCE',
        `Admin [${session.bursarName}] VOIDED remittance of ${formatCurrency(remittanceToVoid.amount, session.currencySymbol)} [Ref: ${remittanceToVoid.referenceNumber}]. Reason: ${reason}`,
        { id: remittanceToVoid.id, amount: remittanceToVoid.amount, ref: remittanceToVoid.referenceNumber, reason },
        session.bursarName,
        session.schoolId,
        'WARNING'
      );

      setSuccessToast(`Collection [${remittanceToVoid.referenceNumber}] voided and moved to the Voided Remittance tab.`);
      setRemittanceToVoid(null);
      setVoidReasonInput('');
      setTimeout(() => setSuccessToast(null), 4500);
    } catch (err: any) {
      setErrorToast(err?.message || 'Failed to void remittance.');
      setTimeout(() => setErrorToast(null), 4000);
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Admin restores a voided remittance back to approved
  const handleRestoreVoided = async (remittance: RemittanceRecord) => {
    if (!isAdmin) {
      setErrorToast('Permission Denied: Only Administrator can restore voided remittances.');
      setTimeout(() => setErrorToast(null), 4000);
      return;
    }

    setIsProcessingAction(true);
    try {
      const { restoredRecord, allRecords } = restoreVoidedRemittance(
        remittance.id,
        session.bursarName || 'Administrator',
        remittances,
        currentSchoolId
      );

      if (restoredRecord) {
        const firestoreSuccess = await saveRemittanceToFirestore(restoredRecord, currentSchoolId);
        if (!firestoreSuccess) {
          const errorMsg = getLastFirestoreWriteError() || 'Failed restoring remittance in Firestore.';
          setErrorToast(errorMsg);
          setTimeout(() => setErrorToast(null), 4000);
          return;
        }
      }

      setRemittances(allRecords);

      const newTotalApproved = allRecords
        .filter((r) => !r.isVoided && (r.status === 'approved' || r.approvalStatus === 'approved' || (!r.status && !r.approvalStatus)))
        .reduce((acc, r) => acc + (Number(r.amount) || 0), 0);
      syncApprovedTotalToStudents(newTotalApproved);

      recordAuditLog(
        'REMITTANCE',
        'RESTORE_REMITTANCE',
        `Admin [${session.bursarName}] RESTORED voided remittance of ${formatCurrency(remittance.amount, session.currencySymbol)} [Ref: ${remittance.referenceNumber}] back to official books`,
        { id: remittance.id, amount: remittance.amount, ref: remittance.referenceNumber },
        session.bursarName,
        session.schoolId,
        'INFO'
      );

      setSuccessToast(`✓ Remittance [${remittance.referenceNumber}] restored to official ledger.`);
      setTimeout(() => setSuccessToast(null), 4000);
    } catch (err: any) {
      setErrorToast(err?.message || 'Failed to restore remittance.');
      setTimeout(() => setErrorToast(null), 4000);
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Admin permanently purges a voided record (Hard delete)
  const handleConfirmPermanentPurge = async () => {
    if (!remittanceToPurge || !isAdmin) return;
    setIsProcessingAction(true);
    try {
      const delSuccess = await deleteRemittanceFromFirestore(remittanceToPurge.id, currentSchoolId);
      if (!delSuccess) {
        const errorMsg = getLastFirestoreWriteError() || 'Failed permanently purging remittance from Firestore.';
        setErrorToast(errorMsg);
        setTimeout(() => setErrorToast(null), 4000);
        return;
      }

      const updated = deleteRemittancePermanently(remittanceToPurge.id, remittances, currentSchoolId);
      setRemittances(updated);
      setRemittanceToPurge(null);

      recordAuditLog(
        'REMITTANCE',
        'PURGE_REMITTANCE',
        `Admin [${session.bursarName}] permanently purged voided remittance record [Ref: ${remittanceToPurge.referenceNumber}]`,
        { id: remittanceToPurge.id, ref: remittanceToPurge.referenceNumber },
        session.bursarName,
        session.schoolId,
        'CRITICAL'
      );

      setSuccessToast(`Record permanently purged.`);
      setTimeout(() => setSuccessToast(null), 3000);
    } catch (err: any) {
      setErrorToast(err?.message || 'Failed to purge record.');
      setTimeout(() => setErrorToast(null), 4000);
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Admin opens Edit modal
  const handleOpenEditModal = (remittance: RemittanceRecord) => {
    if (!isAdmin) {
      setErrorToast('Permission Denied: Published collections cannot be edited by the Bursar.');
      setTimeout(() => setErrorToast(null), 4000);
      return;
    }

    setRemittanceToEdit(remittance);
    setAmountInput(String(remittance.amount));
    setDateInput(remittance.date || getTodayDateString());
    const standardRecipients = [
      'First Bank (School Main Account)',
      'Zenith Bank (School Ops Account)',
      'GTBank (Tuition Account)',
      'Principal / Proprietor Handover',
      'School Management Committee',
      'School Cash Vault / Safe',
    ];
    if (standardRecipients.includes(remittance.remittedTo)) {
      setRemittedToInput(remittance.remittedTo);
      setCustomRecipient('');
    } else {
      setRemittedToInput('Custom');
      setCustomRecipient(remittance.remittedTo);
    }
    setPaymentMethod(remittance.paymentMethod || 'bank_deposit');
    setReferenceNotes(remittance.notes || '');
    setFormError(null);
  };

  // Admin saves edit
  const handleSaveEditRemittance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!remittanceToEdit || !isAdmin) return;
    const numAmount = Number(amountInput);

    if (isNaN(numAmount) || numAmount <= 0) {
      setFormError('Please enter a valid amount greater than 0.');
      return;
    }

    // Check total remittance does not exceed total collections
    const otherApprovedTotal = remittances
      .filter((r) => r.id !== remittanceToEdit.id && !r.isVoided && (r.status === 'approved' || r.approvalStatus === 'approved' || (!r.status && !r.approvalStatus)))
      .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    const maxAllowable = Math.max(0, metrics.totalCollected - otherApprovedTotal);
    if (numAmount > maxAllowable) {
      setFormError(`Balance is lower than amount she is remitting. Maximum allowable remittance based on total collections is ${formatCurrency(maxAllowable, session.currencySymbol)}.`);
      return;
    }

    const finalRecipient = remittedToInput === 'Custom' ? customRecipient.trim() : remittedToInput;
    if (!finalRecipient) {
      setFormError('Please select or specify the recipient/account.');
      return;
    }

    setIsProcessingAction(true);
    try {
      const updated = updateRemittance(
        remittanceToEdit.id,
        {
          amount: numAmount,
          date: dateInput || getTodayDateString(),
          remittedTo: finalRecipient,
          notes: referenceNotes.trim() || undefined,
          paymentMethod,
        },
        remittances,
        currentSchoolId
      );

      const editedRecord = updated.find((r) => r.id === remittanceToEdit.id);
      if (editedRecord) {
        const firestoreSuccess = await saveRemittanceToFirestore(editedRecord, currentSchoolId);
        if (!firestoreSuccess) {
          const errorMsg = getLastFirestoreWriteError() || 'Failed saving updated remittance to Firestore.';
          setFormError(errorMsg);
          return;
        }
      }

      setRemittances(updated);
      setRemittanceToEdit(null);

      const newTotalApproved = updated
        .filter((r) => !r.isVoided && (r.status === 'approved' || r.approvalStatus === 'approved' || (!r.status && !r.approvalStatus)))
        .reduce((acc, r) => acc + (Number(r.amount) || 0), 0);
      syncApprovedTotalToStudents(newTotalApproved);

      recordAuditLog(
        'REMITTANCE',
        'UPDATE_REMITTANCE',
        `Admin [${session.bursarName}] updated remittance [${remittanceToEdit.referenceNumber}] to ${formatCurrency(numAmount, session.currencySymbol)}`,
        { id: remittanceToEdit.id, amount: numAmount, remittedTo: finalRecipient },
        session.bursarName,
        session.schoolId,
        'INFO'
      );

      setSuccessToast(`Remittance updated to ${formatCurrency(numAmount, session.currencySymbol)}.`);
      setTimeout(() => setSuccessToast(null), 3000);
    } catch (err: any) {
      setFormError(err?.message || 'Failed to update remittance.');
    } finally {
      setIsProcessingAction(false);
    }
  };

  // Admin clear all
  const handleConfirmClearAll = async () => {
    if (!isAdmin) return;
    setIsProcessingAction(true);
    try {
      const wipeSuccess = await wipeSchoolRemittancesFromFirestore(currentSchoolId);
      if (!wipeSuccess) {
        const errorMsg = getLastFirestoreWriteError() || 'Failed clearing remittances from Firestore.';
        setErrorToast(errorMsg);
        setTimeout(() => setErrorToast(null), 4000);
        return;
      }

      const updated = clearAllRemittances(currentSchoolId);
      setRemittances(updated);
      setIsClearAllModalOpen(false);
      syncApprovedTotalToStudents(0);

      recordAuditLog(
        'REMITTANCE',
        'CLEAR_ALL_REMITTANCES',
        `Admin cleared and reset all remittance transactions`,
        {},
        session.bursarName,
        session.schoolId,
        'CRITICAL'
      );

      setSuccessToast('All remittance records cleared.');
      setTimeout(() => setSuccessToast(null), 3000);
    } catch (err: any) {
      setErrorToast(err?.message || 'Failed to clear remittances.');
      setTimeout(() => setErrorToast(null), 4000);
    } finally {
      setIsProcessingAction(false);
    }
  };

  // CSV Export
  const handleExportCsv = () => {
    const headers = ['Reference', 'Date', 'Amount Remitted', 'Remitted To', 'Method', 'Status', 'Submitted By', 'Notes'];
    const rows = activeRemittances.map((r) => [
      r.referenceNumber,
      r.date,
      r.amount,
      `"${(r.remittedTo || '').replace(/"/g, '""')}"`,
      r.paymentMethod || '',
      r.status || 'approved',
      `"${(r.submittedBy || r.bursarName || '').replace(/"/g, '""')}"`,
      `"${(r.notes || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Remittance_Report_${getTodayDateString()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-5 space-y-5 pb-28">
      {/* Toast Feedback */}
      {successToast && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold px-4 py-2.5 rounded-xl shadow-xs flex items-center justify-between gap-2 animate-in fade-in slide-in-from-top-1">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successToast}</span>
          </div>
          <button onClick={() => setSuccessToast(null)} className="text-emerald-500 hover:text-emerald-800 cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {errorToast && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold px-4 py-2.5 rounded-xl shadow-xs flex items-center justify-between gap-2 animate-in fade-in slide-in-from-top-1">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorToast}</span>
          </div>
          <button onClick={() => setErrorToast(null)} className="text-rose-500 hover:text-rose-800 cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Lightweight Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg sm:text-xl font-bold text-slate-900 tracking-tight">
              Collections & Remittances
            </h2>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
              isAdmin 
                ? 'bg-blue-50 text-blue-700 border-blue-200' 
                : 'bg-slate-100 text-slate-600 border-slate-200'
            }`}>
              {isAdmin ? 'Admin Approval Mode' : 'Bursar Mode'}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Track student collections, submit remittances to school accounts, and reconcile cash in hand.
          </p>
        </div>

        {/* Header Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleManualCloudSync}
            disabled={isSyncingRemittances}
            title="Synchronize with Cloud Firestore"
            className="p-2 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-2xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncingRemittances ? 'animate-spin text-blue-600' : ''}`} />
            <span className="hidden sm:inline">Sync</span>
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            title="Export Remittance Ledger to CSV"
            className="px-3 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span className="hidden sm:inline">Export CSV</span>
          </button>

          <button
            type="button"
            id="record-remittance-primary-btn"
            onClick={() => handleOpenRecordModal()}
            className="px-3.5 py-2 bg-slate-900 text-white hover:bg-slate-800 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer active:scale-98"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{isAdmin ? 'Record Remittance' : 'Submit Remittance Request'}</span>
          </button>
        </div>
      </div>

      {/* ADMIN NOTIFICATION BANNER: Pending Requests awaiting acceptance */}
      {isAdmin && pendingRemittances.length > 0 && (
        <div className="bg-amber-50/90 border border-amber-300/80 rounded-2xl p-4 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                <Clock className="w-4 h-4" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-bold text-amber-950 uppercase tracking-wider">
                    Action Required: Pending Remittance Requests
                  </h3>
                  <span className="px-1.5 py-0.5 rounded-full bg-amber-200 text-amber-900 text-[10px] font-black">
                    {pendingRemittances.length}
                  </span>
                </div>
                <p className="text-xs text-amber-800 mt-0.5">
                  Bursar has submitted {pendingRemittances.length} remittance request(s) totaling{' '}
                  <span className="font-bold font-mono text-amber-950">
                    {formatCurrency(
                      pendingRemittances.reduce((sum, r) => sum + (Number(r.amount) || 0), 0),
                      session.currencySymbol
                    )}
                  </span>{' '}
                  awaiting your review to post into official books.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
              <button
                type="button"
                onClick={handleAcceptAllPending}
                disabled={isProcessingAction}
                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Accept All ({pendingRemittances.length})</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveSubTab('remittances');
                  setRemittanceFilter('pending');
                }}
                className="px-3 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                Review Items
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 3 Simple, High-Contrast Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        {/* Metric 1: Total Collected */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Collected</span>
            <Receipt className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 font-mono tracking-tight">
            {formatCurrency(metrics.totalCollected, session.currencySymbol)}
          </div>
          <div className="flex items-center gap-1.5 mt-2 text-[10px] text-slate-500 flex-wrap">
            <span className="bg-slate-100 px-1.5 py-0.5 rounded font-medium">
              Tuition: {formatCurrency(metrics.totalTuitionCollected, session.currencySymbol)}
            </span>
            {metrics.totalAdmissionCollected > 0 && (
              <span className="bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded font-medium">
                Adm: {formatCurrency(metrics.totalAdmissionCollected, session.currencySymbol)}
              </span>
            )}
            {metrics.totalLessonCollected > 0 && (
              <span className="bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded font-medium">
                Lesson: {formatCurrency(metrics.totalLessonCollected, session.currencySymbol)}
              </span>
            )}
          </div>
        </div>

        {/* Metric 2: Total Remitted */}
        <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider">Approved Remitted</span>
            <Landmark className="w-4 h-4 text-blue-600" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-blue-700 font-mono tracking-tight">
            {formatCurrency(metrics.totalRemitted, session.currencySymbol)}
          </div>
          <div className="flex items-center justify-between mt-2 text-[10px] text-slate-500">
            <span>{metrics.approvedRemittanceCount} approved deposit(s) in bank</span>
            {metrics.pendingRemittanceCount > 0 && (
              <span className="font-bold text-amber-600">
                +{formatCurrency(metrics.pendingRemitted, session.currencySymbol)} pending
              </span>
            )}
          </div>
        </div>

        {/* Metric 3: Cash in Hand & Remittable Balance */}
        <div className={`rounded-2xl p-4 border shadow-2xs ${
          availableRemittanceBalance > 0 
            ? 'bg-amber-50/70 border-amber-200' 
            : metrics.pendingRemitted > 0
              ? 'bg-blue-50/70 border-blue-200'
              : 'bg-emerald-50/70 border-emerald-200'
        }`}>
          <div className="flex items-center justify-between text-slate-600 mb-1.5">
            <span className="text-xs font-semibold uppercase tracking-wider">Cash in Hand</span>
            <Wallet className={`w-4 h-4 ${availableRemittanceBalance > 0 ? 'text-amber-600' : 'text-emerald-600'}`} />
          </div>
          <div className={`text-xl sm:text-2xl font-black font-mono tracking-tight ${
            availableRemittanceBalance > 0 ? 'text-amber-900' : 'text-emerald-800'
          }`}>
            {formatCurrency(metrics.cashInHand, session.currencySymbol)}
          </div>
          <div className="flex items-center justify-between mt-2 text-[10px] gap-2 flex-wrap">
            <span className={availableRemittanceBalance > 0 ? 'text-amber-700 font-medium' : 'text-emerald-700 font-medium'}>
              {availableRemittanceBalance > 0 
                ? `Available to remit: ${formatCurrency(availableRemittanceBalance, session.currencySymbol)}` 
                : metrics.pendingRemitted > 0
                  ? `Pending Approval: ${formatCurrency(metrics.pendingRemitted, session.currencySymbol)}`
                  : 'Fully remitted & balanced'}
            </span>
            {availableRemittanceBalance > 0 ? (
              <button
                type="button"
                onClick={() => handleOpenRecordModal(availableRemittanceBalance)}
                className="text-[10px] font-bold text-amber-800 underline hover:text-amber-950 cursor-pointer"
              >
                Remit Now ({formatCurrency(availableRemittanceBalance, session.currencySymbol)}) →
              </button>
            ) : metrics.pendingRemitted > 0 ? (
              <span className="text-[10px] font-bold text-blue-700">Awaiting Admin</span>
            ) : null}
          </div>
        </div>
      </div>

      {/* COLLECTION SOURCE MINI DASHBOARD (Highlighting where she collected it from) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden transition-all">
        {/* Header Bar with quick metrics and toggle */}
        <div className="p-4 sm:p-4.5 bg-gradient-to-r from-slate-50 via-white to-slate-50 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-2xs mt-0.5">
              <PieChart className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-bold text-slate-900 tracking-tight">
                  Collection Source Intelligence
                </h3>
                <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full border border-blue-200">
                  Where Funds Originated
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Detailed source breakdown of {formatCurrency(sourceBreakdown.totalCollected, session.currencySymbol)} collected from {sourceBreakdown.contributorCount} student contributor(s) across {sourceBreakdown.classCount} class(es).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-start md:self-center flex-wrap">
            {/* View Switcher Chips */}
            <div className="inline-flex p-1 bg-slate-100 rounded-xl border border-slate-200 text-xs">
              <button
                type="button"
                onClick={() => {
                  setIsSourceDashboardCollapsed(false);
                  setSourceViewMode('category');
                }}
                className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                  !isSourceDashboardCollapsed && sourceViewMode === 'category'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Fee Streams
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsSourceDashboardCollapsed(false);
                  setSourceViewMode('class');
                }}
                className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                  !isSourceDashboardCollapsed && sourceViewMode === 'class'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                By Class ({sourceBreakdown.classCount})
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsSourceDashboardCollapsed(false);
                  setSourceViewMode('channel');
                }}
                className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all cursor-pointer ${
                  !isSourceDashboardCollapsed && sourceViewMode === 'channel'
                    ? 'bg-white text-slate-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Payment Channels
              </button>
            </div>

            {/* Collapse / Expand Button */}
            <button
              type="button"
              onClick={() => setIsSourceDashboardCollapsed((prev) => !prev)}
              title={isSourceDashboardCollapsed ? 'Expand Source Dashboard' : 'Collapse Source Dashboard'}
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer border border-slate-200"
            >
              {isSourceDashboardCollapsed ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronUp className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {/* Dashboard Body (Collapsible) */}
        {!isSourceDashboardCollapsed && (
          <div className="p-4 sm:p-5 space-y-4">
            {/* Quick KPI Bar & Multi-segment Proportional Bar */}
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span className="font-semibold text-slate-800">Collection Distribution by Category</span>
                <span className="text-[11px] text-slate-500">
                  Primary Stream: <strong className="text-slate-900 font-bold">{sourceBreakdown.topFeeCategory?.label || 'Tuition'} ({sourceBreakdown.topFeeCategory?.percentage || 0}%)</strong>
                </span>
              </div>

              {/* Stacked Proportional Bar */}
              <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden flex shadow-inner">
                {sourceBreakdown.feeSources.map((f) => (
                  <div
                    key={f.category}
                    title={`${f.label}: ${formatCurrency(f.amount, session.currencySymbol)} (${f.percentage}%)`}
                    style={{
                      width: `${Math.max(f.percentage, f.amount > 0 ? 1 : 0)}%`,
                      backgroundColor: f.color,
                    }}
                    className="h-full transition-all duration-300 first:rounded-l-full last:rounded-r-full"
                  />
                ))}
              </div>
            </div>

            {/* VIEW 1: FEE STREAMS BREAKDOWN */}
            {sourceViewMode === 'category' && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {sourceBreakdown.feeSources.map((source) => (
                  <div
                    key={source.category}
                    className={`rounded-xl p-3.5 border border-slate-200/80 ${source.bgColor} flex flex-col justify-between`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className={`text-[11px] font-bold ${source.textColor} uppercase tracking-wider`}>
                          {source.label}
                        </span>
                        <span className={`text-[11px] font-black font-mono ${source.textColor}`}>
                          {source.percentage}%
                        </span>
                      </div>
                      <div className="text-base sm:text-lg font-black font-mono text-slate-900 tracking-tight">
                        {formatCurrency(source.amount, session.currencySymbol)}
                      </div>
                    </div>
                    <div className="mt-2.5 pt-2 border-t border-slate-200/50 flex items-center justify-between text-[10px] text-slate-500">
                      <span>{source.studentCount} student(s)</span>
                      <span className="font-semibold text-slate-600">
                        {source.amount > 0 && source.studentCount > 0 
                          ? `Avg: ${formatCurrency(Math.round(source.amount / source.studentCount), session.currencySymbol)}` 
                          : 'No entries'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* VIEW 2: BY CLASS LEVEL CONTRIBUTIONS */}
            {sourceViewMode === 'class' && (
              <div className="space-y-2.5">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Class Level Contributor Ranking ({sourceBreakdown.classSources.length} classes)</span>
                  <span>Top Contributor: <strong className="text-slate-900">{sourceBreakdown.topContributingClass?.className || 'None'}</strong></span>
                </div>

                {sourceBreakdown.classSources.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-500 bg-slate-50 rounded-xl">
                    No student payment records found to group by class.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {sourceBreakdown.classSources.map((cs, idx) => (
                      <div
                        key={cs.className}
                        className="bg-slate-50/80 hover:bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 text-[10px] font-black flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                            <span className="text-xs font-bold text-slate-900 truncate">
                              {cs.className}
                            </span>
                          </div>
                          <span className="text-xs font-black font-mono text-slate-900">
                            {formatCurrency(cs.amount, session.currencySymbol)}
                          </span>
                        </div>

                        {/* Progress bar representing share */}
                        <div className="space-y-1">
                          <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                            <div
                              style={{ width: `${Math.min(100, Math.max(2, cs.percentage))}%` }}
                              className="h-full bg-blue-600 rounded-full"
                            />
                          </div>
                          <div className="flex items-center justify-between text-[10px] text-slate-500">
                            <span>{cs.studentCount} student(s) paid</span>
                            <span className="font-bold text-slate-700">{cs.percentage}% of collections</span>
                          </div>
                        </div>

                        {/* Micro category breakdown */}
                        <div className="pt-1.5 border-t border-slate-200/60 flex items-center gap-1.5 flex-wrap text-[9px]">
                          {cs.tuition > 0 && (
                            <span className="px-1.5 py-0.5 bg-blue-100 text-blue-800 rounded font-medium">
                              T: {formatCurrency(cs.tuition, session.currencySymbol)}
                            </span>
                          )}
                          {cs.admission > 0 && (
                            <span className="px-1.5 py-0.5 bg-purple-100 text-purple-800 rounded font-medium">
                              Adm: {formatCurrency(cs.admission, session.currencySymbol)}
                            </span>
                          )}
                          {cs.lesson > 0 && (
                            <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded font-medium">
                              Les: {formatCurrency(cs.lesson, session.currencySymbol)}
                            </span>
                          )}
                          {cs.exam > 0 && (
                            <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded font-medium">
                              Ex: {formatCurrency(cs.exam, session.currencySymbol)}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* VIEW 3: PAYMENT CHANNELS */}
            {sourceViewMode === 'channel' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {sourceBreakdown.channelSources.map((channel) => (
                  <div
                    key={channel.channel}
                    className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800">{channel.label}</span>
                      <span className="text-[11px] font-black font-mono text-slate-600">{channel.percentage}%</span>
                    </div>
                    <div className="text-lg font-black font-mono text-slate-900">
                      {formatCurrency(channel.amount, session.currencySymbol)}
                    </div>
                    <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-200/60 flex items-center justify-between">
                      <span>{channel.count} receipt transaction(s)</span>
                      {channel.channel === 'cash' && (
                        <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.2 rounded">
                          Physical Vault
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Tab Navigation */}
      <div className="flex items-center justify-between border-b border-slate-200 gap-2 overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1 sm:gap-2">
          <button
            type="button"
            id="tab-remittances"
            onClick={() => setActiveSubTab('remittances')}
            className={`px-3 sm:px-4 py-2 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeSubTab === 'remittances'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>Remittances</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 text-slate-700 font-bold">
              {activeRemittances.length}
            </span>
          </button>

          <button
            type="button"
            id="tab-student-collections"
            onClick={() => setActiveSubTab('collections')}
            className={`px-3 sm:px-4 py-2 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeSubTab === 'collections'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>Student Collections</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-100 text-slate-700 font-bold">
              {paidStudents.length}
            </span>
          </button>

          {/* DEDICATED SOURCES BREAKDOWN TAB */}
          <button
            type="button"
            id="tab-collection-sources"
            onClick={() => setActiveSubTab('sources')}
            className={`px-3 sm:px-4 py-2 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeSubTab === 'sources'
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <PieChart className="w-3.5 h-3.5" />
            <span>Sources Breakdown</span>
          </button>

          {/* VOIDED REMITTANCES TAB: User explicit requirement */}
          <button
            type="button"
            id="tab-voided-remittances"
            onClick={() => setActiveSubTab('voided')}
            className={`px-3 sm:px-4 py-2 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeSubTab === 'voided'
                ? 'border-rose-600 text-rose-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Ban className="w-3.5 h-3.5" />
            <span>Voided Remittances</span>
            {voidedRemittances.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-rose-100 text-rose-800 font-bold">
                {voidedRemittances.length}
              </span>
            )}
          </button>

          <button
            type="button"
            id="tab-reconciliation"
            onClick={() => setActiveSubTab('reconciliation')}
            className={`px-3 sm:px-4 py-2 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeSubTab === 'reconciliation'
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Reconciliation & Audit</span>
          </button>
        </div>

        {/* Clear All Button for Admin */}
        {isAdmin && activeRemittances.length > 0 && (
          <button
            type="button"
            onClick={() => setIsClearAllModalOpen(true)}
            className="text-[11px] font-semibold text-rose-600 hover:text-rose-800 hover:bg-rose-50 px-2.5 py-1 rounded-lg transition-colors cursor-pointer shrink-0"
          >
            Reset Ledger
          </button>
        )}
      </div>

      {/* TAB 1: REMITTANCES LIST */}
      {activeSubTab === 'remittances' && (
        <div className="space-y-3">
          {/* Filter Chips & Search Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setRemittanceFilter('all')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  remittanceFilter === 'all'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                All ({activeRemittances.length})
              </button>
              <button
                type="button"
                onClick={() => setRemittanceFilter('approved')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  remittanceFilter === 'approved'
                    ? 'bg-emerald-700 text-white'
                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                }`}
              >
                Approved ({approvedRemittances.length})
              </button>
              <button
                type="button"
                onClick={() => setRemittanceFilter('pending')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                  remittanceFilter === 'pending'
                    ? 'bg-amber-600 text-white'
                    : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
                }`}
              >
                Pending Approval ({pendingRemittances.length})
              </button>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search reference, recipient..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-slate-900"
              />
            </div>
          </div>

          {/* Remittances Content */}
          {filteredRemittances.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <Landmark className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800">No Remittances Found</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                  {searchQuery 
                    ? 'No records match your search filter.' 
                    : remittanceFilter === 'pending'
                    ? 'There are no pending collection requests awaiting approval.'
                    : 'No remittances have been recorded yet. Click "Submit Remittance Request" to deposit funds into the school account.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleOpenRecordModal()}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl hover:bg-slate-800 cursor-pointer shadow-xs"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{isAdmin ? 'Record First Remittance' : 'Submit First Remittance Request'}</span>
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden shadow-2xs">
              {filteredRemittances.map((remittance) => {
                const isPending = remittance.status === 'pending' || remittance.approvalStatus === 'pending';
                const isRejected = remittance.status === 'rejected' || remittance.approvalStatus === 'rejected';
                const isApproved = !isPending && !isRejected;

                return (
                  <div 
                    key={remittance.id}
                    className="p-3.5 sm:p-4 hover:bg-slate-50/80 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    {/* Left details */}
                    <div className="flex items-start gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                        isPending 
                          ? 'bg-amber-100 text-amber-700' 
                          : isRejected 
                          ? 'bg-rose-100 text-rose-700'
                          : 'bg-blue-50 text-blue-700'
                      }`}>
                        {isPending ? <Clock className="w-4 h-4" /> : isRejected ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-xs text-slate-900 font-mono">
                            {remittance.referenceNumber}
                          </span>
                          
                          {/* Status Badge */}
                          {isPending ? (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              <span>Pending Admin Approval</span>
                            </span>
                          ) : isRejected ? (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-100 text-rose-800 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" />
                              <span>Returned for Review</span>
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Approved & Booked</span>
                            </span>
                          )}

                          {remittance.paymentMethod && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-600 capitalize">
                              {remittance.paymentMethod.replace('_', ' ')}
                            </span>
                          )}
                        </div>

                        <div className="text-xs text-slate-700 font-medium mt-1">
                          To: <span className="font-semibold text-slate-900">{remittance.remittedTo}</span>
                        </div>

                        <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-0.5 flex-wrap">
                          <span>Date: {formatDate(remittance.date)}</span>
                          <span>•</span>
                          <span>By: {remittance.submittedBy || remittance.bursarName || 'Bursar'}</span>
                          {remittance.approvedBy && (
                            <>
                              <span>•</span>
                              <span className="text-emerald-700 font-medium">Approved by: {remittance.approvedBy}</span>
                            </>
                          )}
                          {remittance.rejectionReason && (
                            <>
                              <span>•</span>
                              <span className="text-rose-700 font-medium">Note: {remittance.rejectionReason}</span>
                            </>
                          )}
                          {remittance.notes && !remittance.rejectionReason && (
                            <>
                              <span>•</span>
                              <span className="italic text-slate-500">"{remittance.notes}"</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Right Amount & Actions */}
                    <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100">
                      <div className="text-sm sm:text-base font-black text-slate-900 font-mono">
                        {formatCurrency(remittance.amount, session.currencySymbol)}
                      </div>

                      {/* ACTIONS */}
                      <div className="flex items-center gap-1.5">
                        {/* ADMIN ACTIONS */}
                        {isAdmin ? (
                          <>
                            {isPending && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => handleApproveRemittance(remittance)}
                                  disabled={isApprovingId === remittance.id}
                                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer shadow-2xs disabled:opacity-50"
                                >
                                  <Check className="w-3 h-3" />
                                  <span>Accept</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setRemittanceToReject(remittance)}
                                  className="px-2 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                                >
                                  Reject
                                </button>
                              </>
                            )}

                            {/* Admin can edit or void (delete) collection */}
                            <button
                              type="button"
                              onClick={() => handleOpenEditModal(remittance)}
                              title="Edit Remittance (Admin)"
                              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>

                            <button
                              type="button"
                              onClick={() => {
                                setRemittanceToVoid(remittance);
                                setVoidReasonInput('');
                              }}
                              title="Void / Delete Collection (Moves to Voided Tab)"
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        ) : (
                          /* BURSAR ACTIONS: Cannot edit or delete once published! */
                          <div className="flex items-center gap-1 text-[11px] text-slate-400 font-medium">
                            <Lock className="w-3 h-3 text-slate-400" />
                            <span>Published (Protected)</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: STUDENT COLLECTIONS FEED */}
      {activeSubTab === 'collections' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-600 px-1">
            <span>Student fee payments recorded ({paidStudents.length})</span>
            {onOpenRecordPayment && (
              <button
                type="button"
                onClick={onOpenRecordPayment}
                className="font-bold text-slate-900 underline hover:text-blue-700 cursor-pointer"
              >
                + Record Student Fee Payment
              </button>
            )}
          </div>

          {paidStudents.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-2">
              <Receipt className="w-8 h-8 text-slate-300 mx-auto" />
              <div className="text-xs font-bold text-slate-700">No Student Payments Recorded</div>
              <p className="text-xs text-slate-500">Payments recorded on student profiles will automatically show here.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden shadow-2xs">
              {paidStudents.slice(0, visibleCollectionsCount).map((student) => {
                const rowBd = deriveFeeBreakdown(student, school);
                const sTuitionPaid = Math.max(0, rowBd.tuitionPaid || 0);
                const sAdmissionPaid = Math.max(0, rowBd.admissionPaid || 0);
                const sLessonPaid = Math.max(0, rowBd.lessonPaid || 0);
                const sExamPaid = Math.max(0, rowBd.examPaid || 0);
                const sTotalPaid = sTuitionPaid + sAdmissionPaid + sLessonPaid + sExamPaid + Math.max(0, rowBd.additionalFeesPaid || 0);

                return (
                  <div
                    key={student.id}
                    onClick={() => onSelectStudent && onSelectStudent(student)}
                    className="p-3.5 hover:bg-slate-50 transition-colors flex items-center justify-between gap-3 cursor-pointer"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 mt-0.5">
                        <Receipt className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-slate-900 truncate">
                            {student.full_name}
                          </span>
                          <span className="text-[10px] font-bold bg-slate-100 text-slate-700 px-1.5 py-0.2 rounded">
                            {student.class}
                          </span>
                          {sAdmissionPaid > 0 && (
                            <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.2 rounded bg-purple-100 text-purple-800">
                              Admission
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5 flex-wrap">
                          <span>Paid: {formatDate(student.payment_date)}</span>
                          {sTuitionPaid > 0 && <span>Tuition: {formatCurrency(sTuitionPaid, session.currencySymbol)}</span>}
                          {sLessonPaid > 0 && <span>Lesson: {formatCurrency(sLessonPaid, session.currencySymbol)}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <div className="text-xs font-black text-emerald-700 font-mono">
                        +{formatCurrency(sTotalPaid, session.currencySymbol)}
                      </div>
                      <span className="text-[10px] text-slate-500">
                        Bal: {formatCurrency(student.balance, session.currencySymbol)}
                      </span>
                    </div>
                  </div>
                );
              })}

              {paidStudents.length > visibleCollectionsCount && (
                <div className="p-3 text-center bg-slate-50 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setVisibleCollectionsCount((prev) => prev + 30)}
                    className="px-4 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
                  >
                    Show More ({paidStudents.length - visibleCollectionsCount} remaining)
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: VOIDED REMITTANCES (Requested feature for Admin deleted collections) */}
      {activeSubTab === 'voided' && (
        <div className="space-y-3">
          <div className="bg-rose-50/70 border border-rose-200 rounded-xl p-3.5 text-xs text-rose-900 flex items-start gap-2.5">
            <Info className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-bold">Voided Collections Ledger:</span> When an Administrator deletes a remittance, it is preserved here as voided. Voided amounts are immediately excluded from official books and cash-in-hand calculations.
            </div>
          </div>

          {voidedRemittances.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-2">
              <Ban className="w-8 h-8 text-slate-300 mx-auto" />
              <div className="text-xs font-bold text-slate-700">No Voided Remittances</div>
              <p className="text-xs text-slate-500">All recorded remittances are active in the official books.</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden shadow-2xs">
              {voidedRemittances.map((remittance) => (
                <div 
                  key={remittance.id}
                  className="p-3.5 sm:p-4 hover:bg-slate-50/80 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 mt-0.5">
                      <Ban className="w-4 h-4" />
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-xs text-slate-900 font-mono">
                          {remittance.referenceNumber}
                        </span>
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-black bg-rose-100 text-rose-800 uppercase tracking-wide">
                          VOIDED
                        </span>
                        <span className="text-[11px] text-slate-500">
                          To: <span className="font-semibold text-slate-700">{remittance.remittedTo}</span>
                        </span>
                      </div>

                      <div className="text-xs text-rose-700 mt-1 font-medium">
                        Reason: {remittance.voidReason || 'Voided by Administrator'}
                      </div>

                      <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5 flex-wrap">
                        <span>Original Date: {formatDate(remittance.date)}</span>
                        <span>•</span>
                        <span>Voided At: {formatDate(remittance.voidedAt)}</span>
                        {remittance.voidedBy && (
                          <>
                            <span>•</span>
                            <span className="font-medium">Voided by: {remittance.voidedBy}</span>
                          </>
                        )}
                        <span>•</span>
                        <span>Submitted by: {remittance.submittedBy || remittance.bursarName || 'Bursar'}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-2 shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100">
                    <div className="text-sm sm:text-base font-black text-slate-400 line-through font-mono">
                      {formatCurrency(remittance.amount, session.currencySymbol)}
                    </div>

                    {/* Admin Restore or Purge */}
                    {isAdmin && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleRestoreVoided(remittance)}
                          disabled={isProcessingAction}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Restore</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setRemittanceToPurge(remittance)}
                          disabled={isProcessingAction}
                          className="px-2 py-1 text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                        >
                          Purge
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB: COLLECTION SOURCES BREAKDOWN & AUDIT */}
      {activeSubTab === 'sources' && (
        <div className="space-y-4">
          {/* Top Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Total Inflow</div>
              <div className="text-xl font-black font-mono text-slate-900 mt-1">
                {formatCurrency(sourceBreakdown.totalCollected, session.currencySymbol)}
              </div>
              <div className="text-[10px] text-slate-500 mt-1">
                100% of recorded fees
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Paying Students</div>
              <div className="text-xl font-black font-mono text-blue-700 mt-1">
                {sourceBreakdown.contributorCount}
              </div>
              <div className="text-[10px] text-slate-500 mt-1">
                Across {sourceBreakdown.classCount} class levels
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Top Stream</div>
              <div className="text-lg font-black text-slate-900 mt-1 truncate">
                {sourceBreakdown.topFeeCategory?.label || 'Tuition'}
              </div>
              <div className="text-[10px] text-emerald-600 font-bold mt-1">
                {sourceBreakdown.topFeeCategory?.percentage || 0}% of all revenue
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
              <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Top Class</div>
              <div className="text-lg font-black text-purple-700 mt-1 truncate">
                {sourceBreakdown.topContributingClass?.className || 'N/A'}
              </div>
              <div className="text-[10px] text-slate-500 mt-1">
                {sourceBreakdown.topContributingClass 
                  ? `${formatCurrency(sourceBreakdown.topContributingClass.amount, session.currencySymbol)} (${sourceBreakdown.topContributingClass.percentage}%)`
                  : 'None'}
              </div>
            </div>
          </div>

          {/* Fee Stream Breakdown Table */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Fee Stream Inflow Origins</h3>
                <p className="text-xs text-slate-500">Distribution across all fee categories paid by students</p>
              </div>
              <span className="text-xs font-mono font-bold text-slate-700">
                {sourceBreakdown.feeSources.length} Categories
              </span>
            </div>

            <div className="divide-y divide-slate-100">
              {sourceBreakdown.feeSources.map((source) => (
                <div key={source.category} className="p-4 hover:bg-slate-50/70 transition-colors">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full shrink-0`} style={{ backgroundColor: source.color }} />
                      <span className="text-xs font-bold text-slate-900">{source.label}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-semibold">
                        {source.studentCount} student(s)
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="text-sm font-black font-mono text-slate-900">
                        {formatCurrency(source.amount, session.currencySymbol)}
                      </span>
                      <span className="text-xs font-bold text-slate-500 w-12 text-right">
                        {source.percentage}%
                      </span>
                    </div>
                  </div>

                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div
                      style={{ 
                        width: `${Math.max(source.percentage, source.amount > 0 ? 1 : 0)}%`,
                        backgroundColor: source.color,
                      }}
                      className="h-full rounded-full transition-all duration-300"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Class-by-Class Contributions */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Collections by Class Level</h3>
                <p className="text-xs text-slate-500">Breakdown of how much revenue originated from each classroom</p>
              </div>
              <span className="text-xs font-mono font-bold text-slate-700">
                {sourceBreakdown.classSources.length} Classes
              </span>
            </div>

            {sourceBreakdown.classSources.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No class collection data available yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50/80 text-slate-600 font-semibold border-b border-slate-100">
                      <th className="p-3">Class</th>
                      <th className="p-3 text-right">Tuition</th>
                      <th className="p-3 text-right">Admission</th>
                      <th className="p-3 text-right">Lesson</th>
                      <th className="p-3 text-right">Exam</th>
                      <th className="p-3 text-right">Total Inflow</th>
                      <th className="p-3 text-center">Share</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sourceBreakdown.classSources.map((cs) => (
                      <tr key={cs.className} className="hover:bg-slate-50/60 transition-colors">
                        <td className="p-3 font-bold text-slate-900">
                          {cs.className}
                          <span className="text-[10px] text-slate-400 font-normal ml-1.5">
                            ({cs.studentCount} students)
                          </span>
                        </td>
                        <td className="p-3 text-right font-mono text-slate-700">
                          {cs.tuition > 0 ? formatCurrency(cs.tuition, session.currencySymbol) : '—'}
                        </td>
                        <td className="p-3 text-right font-mono text-slate-700">
                          {cs.admission > 0 ? formatCurrency(cs.admission, session.currencySymbol) : '—'}
                        </td>
                        <td className="p-3 text-right font-mono text-slate-700">
                          {cs.lesson > 0 ? formatCurrency(cs.lesson, session.currencySymbol) : '—'}
                        </td>
                        <td className="p-3 text-right font-mono text-slate-700">
                          {cs.exam > 0 ? formatCurrency(cs.exam, session.currencySymbol) : '—'}
                        </td>
                        <td className="p-3 text-right font-mono font-black text-slate-900">
                          {formatCurrency(cs.amount, session.currencySymbol)}
                        </td>
                        <td className="p-3 text-center">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-800">
                            {cs.percentage}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: RECONCILIATION & AUDIT */}
      {activeSubTab === 'reconciliation' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              <span>Financial Reconciliation Formula</span>
            </h3>
            <button
              type="button"
              onClick={() => window.print()}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Voucher</span>
            </button>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl space-y-2 font-mono text-xs border border-slate-200">
            <div className="flex justify-between text-slate-700">
              <span>(A) Total Student Collections:</span>
              <span className="font-bold text-emerald-700">+{formatCurrency(metrics.totalCollected, session.currencySymbol)}</span>
            </div>
            <div className="flex justify-between text-slate-700">
              <span>(B) Approved Bank Remittances:</span>
              <span className="font-bold text-blue-700">-{formatCurrency(metrics.totalRemitted, session.currencySymbol)}</span>
            </div>
            {metrics.voidedRemitted > 0 && (
              <div className="flex justify-between text-rose-700">
                <span>(C) Voided Remittances (Excluded):</span>
                <span className="font-semibold line-through">{formatCurrency(metrics.voidedRemitted, session.currencySymbol)}</span>
              </div>
            )}
            <div className="border-t border-slate-300 pt-2 flex justify-between font-black text-sm text-slate-900">
              <span>Net Cash in Bursar Custody:</span>
              <span className={metrics.cashInHand > 0 ? 'text-amber-700' : 'text-emerald-700'}>
                {formatCurrency(metrics.cashInHand, session.currencySymbol)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* RECORD REMITTANCE MODAL */}
      {isRecordModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {isAdmin ? 'Record Bank Remittance' : 'Submit Remittance Request'}
                </h3>
                <p className="text-[11px] text-slate-500">
                  {isAdmin 
                    ? 'Records approved funds into the official books.' 
                    : 'Submits request to Administrator for acceptance into official books.'}
                </p>
              </div>
              <button 
                onClick={() => setIsRecordModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveRemittance} className="p-4 space-y-3.5">
              {/* Available Collection Balance Status Card */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 font-medium">Available Unremitted Collections:</span>
                  <span className={`font-mono font-black text-sm ${availableRemittanceBalance > 0 ? 'text-slate-900' : 'text-rose-600'}`}>
                    {formatCurrency(availableRemittanceBalance, session.currencySymbol)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1 border-t border-slate-200/60 flex-wrap gap-1">
                  <span>Cash in Hand: {formatCurrency(metrics.cashInHand, session.currencySymbol)}</span>
                  {metrics.pendingRemitted > 0 && (
                    <span className="text-amber-700 font-medium">
                      Pending Approval: -{formatCurrency(metrics.pendingRemitted, session.currencySymbol)}
                    </span>
                  )}
                </div>
              </div>

              {formError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl font-medium flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Dynamic validation alert: Balance is lower than amount she is remitting */}
              {!formError && Number(amountInput) > availableRemittanceBalance && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl font-medium flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                  <div>
                    <span className="font-bold">Balance is lower than amount she is remitting.</span>
                    <div className="text-[11px] text-rose-700 mt-0.5">
                      The entered amount ({formatCurrency(Number(amountInput) || 0, session.currencySymbol)}) exceeds the available unremitted collection balance of {formatCurrency(availableRemittanceBalance, session.currencySymbol)}.
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Amount to Remit ({session.currencySymbol})
                </label>
                <input
                  type="number"
                  min="1"
                  max={availableRemittanceBalance > 0 ? availableRemittanceBalance : 0}
                  step="any"
                  required
                  value={amountInput}
                  onChange={(e) => {
                    setAmountInput(e.target.value);
                    setFormError(null);
                  }}
                  placeholder="e.g. 50000"
                  className="w-full px-3 py-2 text-sm font-mono font-bold bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
                {availableRemittanceBalance > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setAmountInput(String(availableRemittanceBalance));
                      setFormError(null);
                    }}
                    className="text-[10px] text-blue-600 hover:underline mt-1 font-semibold cursor-pointer block"
                  >
                    Auto-fill maximum available: {formatCurrency(availableRemittanceBalance, session.currencySymbol)}
                  </button>
                ) : (
                  <p className="text-[10px] text-rose-600 mt-1 font-medium">
                    No unremitted balance available to remit at this time.
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={dateInput}
                    onChange={(e) => setDateInput(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Method</label>
                  <select
                    value={paymentMethod}
                    onChange={(e: any) => setPaymentMethod(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900"
                  >
                    <option value="bank_deposit">Bank Deposit</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cash_handover">Cash Handover</option>
                    <option value="pos_settlement">POS Settlement</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Remitted To / Account</label>
                <select
                  value={remittedToInput}
                  onChange={(e) => setRemittedToInput(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900"
                >
                  <option value="First Bank (School Main Account)">First Bank (School Main Account)</option>
                  <option value="Zenith Bank (School Ops Account)">Zenith Bank (School Ops Account)</option>
                  <option value="GTBank (Tuition Account)">GTBank (Tuition Account)</option>
                  <option value="Principal / Proprietor Handover">Principal / Proprietor Handover</option>
                  <option value="School Management Committee">School Management Committee</option>
                  <option value="School Cash Vault / Safe">School Cash Vault / Safe</option>
                  <option value="Custom">Custom / Other Account...</option>
                </select>
              </div>

              {remittedToInput === 'Custom' && (
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Specific Recipient Name / Details</label>
                  <input
                    type="text"
                    required
                    value={customRecipient}
                    onChange={(e) => setCustomRecipient(e.target.value)}
                    placeholder="e.g. Stanbic IBTC (Account # 0012345678)"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Reference Notes (Optional)</label>
                <input
                  type="text"
                  value={referenceNotes}
                  onChange={(e) => setReferenceNotes(e.target.value)}
                  placeholder="e.g. Deposit slip # 4821, Paid by Bursar"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsRecordModalOpen(false)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={
                    isSubmitting || 
                    availableRemittanceBalance <= 0 || 
                    !amountInput || 
                    Number(amountInput) <= 0 || 
                    Number(amountInput) > availableRemittanceBalance
                  }
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? 'Submitting...' : isAdmin ? 'Record & Approve' : 'Submit Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT REMITTANCE MODAL (Admin Only) */}
      {remittanceToEdit && isAdmin && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Edit Remittance Record</h3>
                <p className="text-[11px] text-slate-500">Admin correction for Ref: {remittanceToEdit.referenceNumber}</p>
              </div>
              <button 
                onClick={() => setRemittanceToEdit(null)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEditRemittance} className="p-4 space-y-3.5">
              {formError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-xl font-medium">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Amount ({session.currencySymbol})
                </label>
                <input
                  type="number"
                  min="1"
                  step="any"
                  required
                  value={amountInput}
                  onChange={(e) => setAmountInput(e.target.value)}
                  className="w-full px-3 py-2 text-sm font-mono font-bold bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={dateInput}
                    onChange={(e) => setDateInput(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Method</label>
                  <select
                    value={paymentMethod}
                    onChange={(e: any) => setPaymentMethod(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                  >
                    <option value="bank_deposit">Bank Deposit</option>
                    <option value="bank_transfer">Bank Transfer</option>
                    <option value="cash_handover">Cash Handover</option>
                    <option value="pos_settlement">POS Settlement</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Recipient Account</label>
                <input
                  type="text"
                  required
                  value={remittedToInput === 'Custom' ? customRecipient : remittedToInput}
                  onChange={(e) => {
                    setRemittedToInput('Custom');
                    setCustomRecipient(e.target.value);
                  }}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Reference / Note</label>
                <input
                  type="text"
                  value={referenceNotes}
                  onChange={(e) => setReferenceNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRemittanceToEdit(null)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProcessingAction}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  {isProcessingAction ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VOID REMITTANCE CONFIRMATION MODAL (Admin deletes collection) */}
      {remittanceToVoid && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl border border-slate-200 overflow-hidden p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Ban className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Void Remittance Record</h3>
                <p className="text-xs text-slate-500">Ref: {remittanceToVoid.referenceNumber}</p>
              </div>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl text-xs space-y-1 border border-slate-200">
              <div className="flex justify-between">
                <span className="text-slate-500">Amount:</span>
                <span className="font-bold text-slate-900 font-mono">
                  {formatCurrency(remittanceToVoid.amount, session.currencySymbol)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Recipient:</span>
                <span className="font-medium text-slate-800">{remittanceToVoid.remittedTo}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Date:</span>
                <span className="text-slate-800">{formatDate(remittanceToVoid.date)}</span>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Voiding this collection will remove{' '}
              <span className="font-bold text-slate-900">{formatCurrency(remittanceToVoid.amount, session.currencySymbol)}</span>{' '}
              from total remitted, update cash in hand, and move this record to the{' '}
              <span className="font-bold text-rose-700">Voided Remittance</span> tab.
            </p>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Reason for Voiding (Optional)
              </label>
              <input
                type="text"
                value={voidReasonInput}
                onChange={(e) => setVoidReasonInput(e.target.value)}
                placeholder="e.g. Duplicate entry, wrong bank account, correction"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setRemittanceToVoid(null)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmVoid}
                disabled={isProcessingAction}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {isProcessingAction ? 'Voiding...' : 'Confirm Void'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* REJECT REMITTANCE MODAL (Admin returns pending request) */}
      {remittanceToReject && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl border border-slate-200 overflow-hidden p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">Return Remittance Request</h3>
                <p className="text-xs text-slate-500">Ref: {remittanceToReject.referenceNumber}</p>
              </div>
            </div>

            <p className="text-xs text-slate-600">
              Return remittance of{' '}
              <span className="font-bold text-slate-900">{formatCurrency(remittanceToReject.amount, session.currencySymbol)}</span>{' '}
              back to the Bursar for clarification.
            </p>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Feedback Note / Reason
              </label>
              <textarea
                rows={2}
                value={rejectionReasonInput}
                onChange={(e) => setRejectionReasonInput(e.target.value)}
                placeholder="e.g. Please attach deposit teller number"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-slate-900"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setRemittanceToReject(null)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReject}
                disabled={isProcessingAction}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {isProcessingAction ? 'Returning...' : 'Return Request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PERMANENT PURGE CONFIRMATION MODAL */}
      {remittanceToPurge && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl border border-slate-200 p-5 space-y-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Permanently Purge Record?</h3>
              <p className="text-xs text-slate-500 mt-1">
                This will permanently remove Ref: {remittanceToPurge.referenceNumber} from database and local storage. This action cannot be undone.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRemittanceToPurge(null)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmPermanentPurge}
                disabled={isProcessingAction}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {isProcessingAction ? 'Purging...' : 'Yes, Purge Record'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* RESET ALL MODAL */}
      {isClearAllModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-xl border border-slate-200 p-5 space-y-4 text-center">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Reset Remittance Ledger?</h3>
              <p className="text-xs text-slate-500 mt-1">
                This will clear all remittance transactions and reset the school's total remitted figure to 0.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsClearAllModalOpen(false)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmClearAll}
                disabled={isProcessingAction}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {isProcessingAction ? 'Resetting...' : 'Yes, Reset All'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
