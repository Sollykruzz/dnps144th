/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  Users,
  WalletCards,
  Calendar,
  Plus,
  Search,
  CheckCircle2,
  Clock,
  Download,
  Printer,
  CreditCard,
  AlertCircle,
  FileSpreadsheet,
  Check,
  CheckCheck,
  RefreshCw,
  Trash2,
  Wrench,
  SlidersHorizontal,
  ArrowUpRight,
  ChevronRight,
  UserCheck,
} from 'lucide-react';
import {
  StaffMember,
  PayrollRecord,
  SchoolProfile,
  BursarSession,
  StudentPaymentRecord,
  StaffDepartment,
  AcademicTermSchedule,
} from '../types';
import {
  getStoredStaff,
  saveStoredStaff,
  getStoredPayrollRecords,
  saveStoredPayrollRecords,
  clearStoredStaffAndPayroll,
  calculateMonthlyPayrollSummary,
  calculateTermPayrollSummary,
  getOrGenerateMonthlyPayrollRecords,
  formatMonthLabel,
  getCurrentMonthString,
  markPayrollRecordPaid,
  undoPayrollRecordPayment,
  formatDepartmentName,
  calculateStaffFinancials,
  parseSheetRowsToStaffAndPayroll,
  isStudentRow,
  applyCloudStaff,
  applyCloudPayroll,
} from '../services/payrollService';
import {
  getStoredTermSchedule,
  getMonthlyPaymentDueStatus,
  getFeeCollectionTimelineStatus,
} from '../services/termScheduleService';
import { recordAuditLog } from '../services/auditLoggerService';
import {
  loadStaffFromFirestore,
  saveStaffMemberToFirestore,
  batchSaveStaffToFirestore,
  deleteStaffFromFirestore,
  deletePayrollFromFirestore,
  loadPayrollFromFirestore,
  savePayrollRecordToFirestore,
  savePayrollToFirestore,
  batchSavePayrollToFirestore,
} from '../services/firebase';
import { StaffModal } from './StaffModal';
import { PayStaffModal } from './PayStaffModal';
import { TermScheduleModal } from './TermScheduleModal';
import { getCurrentAcademicSession } from '../services/calculations';

interface PayrollViewProps {
  session: BursarSession;
  activeSchool?: SchoolProfile;
  students?: StudentPaymentRecord[];
  onOpenSettings?: () => void;
}

export const PayrollView: React.FC<PayrollViewProps> = ({
  session,
  activeSchool,
  students = [],
  onOpenSettings,
}) => {
  const currencySymbol = activeSchool?.currencySymbol || session.currencySymbol || '₦';
  const schoolId = activeSchool?.id || session.schoolId || 'dominion-group';

  // State
  const [staffList, setStaffList] = useState<StaffMember[]>(() => getStoredStaff(schoolId));
  const [payrollRecords, setPayrollRecords] = useState<PayrollRecord[]>(() =>
    getStoredPayrollRecords(schoolId)
  );

  // Sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Month navigation
  const [selectedMonth, setSelectedMonth] = useState<string>(() => getCurrentMonthString());
  const [selectedTerm, setSelectedTerm] = useState<string>('First Term');
  const [selectedSession, setSelectedSession] = useState<string>(getCurrentAcademicSession());

  // Sub-tabs: 'disbursals' | 'staff' | 'term_analytics'
  const [activeSubTab, setActiveSubTab] = useState<'disbursals' | 'staff' | 'term_analytics'>('disbursals');

  // Filtering & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'pending'>('all');

  // Modals state
  const [isStaffModalOpen, setIsStaffModalOpen] = useState(false);
  const [staffToEdit, setStaffToEdit] = useState<StaffMember | null>(null);
  const [isTermScheduleModalOpen, setIsTermScheduleModalOpen] = useState(false);
  const [termSchedule, setTermSchedule] = useState<AcademicTermSchedule>(() =>
    getStoredTermSchedule(selectedTerm, selectedSession, schoolId)
  );

  // Update termSchedule when term or school changes
  useEffect(() => {
    setTermSchedule(getStoredTermSchedule(selectedTerm, selectedSession, schoolId));
  }, [selectedTerm, selectedSession, schoolId]);

  // Monthly salary due date and status
  const monthlyDueStatus = useMemo(() => {
    return getMonthlyPaymentDueStatus(selectedMonth, termSchedule.salaryDueDay || 25);
  }, [selectedMonth, termSchedule.salaryDueDay]);

  // Confirmation state
  const [staffToDeleteConfirm, setStaffToDeleteConfirm] = useState<StaffMember | null>(null);
  const [isDeletingStaff, setIsDeletingStaff] = useState(false);
  const [recordToUndoConfirm, setRecordToUndoConfirm] = useState<PayrollRecord | null>(null);
  const [isUndoingPayment, setIsUndoingPayment] = useState(false);
  const [showClearRosterConfirm, setShowClearRosterConfirm] = useState(false);
  const [showFixOrphanedConfirm, setShowFixOrphanedConfirm] = useState(false);
  const [isCleaningOrphaned, setIsCleaningOrphaned] = useState(false);
  const [batchPayConfirmType, setBatchPayConfirmType] = useState<'selected' | 'all' | null>(null);

  const [selectedRecordForPayment, setSelectedRecordForPayment] = useState<PayrollRecord | null>(null);
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([]);

  // Reload staff and records when school changes or auto-sync from Firestore
  useEffect(() => {
    const storedStaff = getStoredStaff(schoolId);
    const storedPayroll = getStoredPayrollRecords(schoolId);
    setStaffList(storedStaff);
    setPayrollRecords(storedPayroll);

    let isMounted = true;
    Promise.all([
      loadStaffFromFirestore(schoolId),
      loadPayrollFromFirestore(schoolId),
    ])
      .then(([firestoreStaff, firestorePayroll]) => {
        if (!isMounted) return;
        if (Array.isArray(firestoreStaff) && firestoreStaff.length > 0) {
          setStaffList(applyCloudStaff(firestoreStaff, schoolId));
        }
        if (Array.isArray(firestorePayroll) && firestorePayroll.length > 0) {
          setPayrollRecords(applyCloudPayroll(firestorePayroll, schoolId));
        }
      })
      .catch((err) => {
        console.warn('[Firestore] Error loading staff/payroll:', err);
      });

    return () => {
      isMounted = false;
    };
  }, [schoolId]);

  // Ensure payroll records exist for the selected month
  const activeMonthRecords = useMemo(() => {
    return getOrGenerateMonthlyPayrollRecords(
      staffList,
      selectedMonth,
      selectedTerm,
      selectedSession,
      payrollRecords
    );
  }, [staffList, selectedMonth, selectedTerm, selectedSession, payrollRecords]);

  // Calculate monthly summary
  const monthlySummary = useMemo(() => {
    return calculateMonthlyPayrollSummary(staffList, activeMonthRecords, selectedMonth);
  }, [staffList, activeMonthRecords, selectedMonth]);

  // Calculate term summary
  const termSummary = useMemo(() => {
    return calculateTermPayrollSummary(
      staffList,
      payrollRecords,
      selectedTerm,
      selectedSession,
      selectedMonth
    );
  }, [staffList, payrollRecords, selectedTerm, selectedSession, selectedMonth]);

  // Total student fees collected
  const totalStudentFeesCollected = useMemo(() => {
    return students.reduce((sum, s) => sum + (Number(s.amount_paid) || 0), 0);
  }, [students]);

  // Filtered disbursals
  const filteredDisbursals = useMemo(() => {
    return activeMonthRecords.filter((record) => {
      const matchSearch =
        !searchQuery ||
        record.staffName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        record.role.toLowerCase().includes(searchQuery.toLowerCase());
      const matchDept = departmentFilter === 'all' || record.department === departmentFilter;
      const matchStatus = statusFilter === 'all' || record.paymentStatus === statusFilter;
      return matchSearch && matchDept && matchStatus;
    });
  }, [activeMonthRecords, searchQuery, departmentFilter, statusFilter]);

  // Filtered staff
  const filteredStaff = useMemo(() => {
    return staffList.filter((staff) => {
      const matchSearch =
        !searchQuery ||
        staff.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        staff.role.toLowerCase().includes(searchQuery.toLowerCase()) ||
        staff.phone?.includes(searchQuery);
      const matchDept = departmentFilter === 'all' || staff.department === departmentFilter;
      return matchSearch && matchDept;
    });
  }, [staffList, searchQuery, departmentFilter]);

  // Save / Update Staff with IMMEDIATE PUSH TO GOOGLE SHEET
  const handleSaveStaff = async (staff: StaffMember) => {
    const existingIndex = staffList.findIndex((s) => s.id === staff.id);
    let updatedStaff: StaffMember[];
    if (existingIndex >= 0) {
      updatedStaff = [...staffList];
      updatedStaff[existingIndex] = staff;
    } else {
      updatedStaff = [...staffList, staff];
    }
    setStaffList(updatedStaff);
    saveStoredStaff(updatedStaff, schoolId);

    const updatedRecords = getOrGenerateMonthlyPayrollRecords(
      updatedStaff,
      selectedMonth,
      selectedTerm,
      selectedSession,
      payrollRecords
    );
    setPayrollRecords(updatedRecords);
    saveStoredPayrollRecords(updatedRecords, schoolId);

    recordAuditLog(
      'PAYROLL',
      existingIndex >= 0 ? 'UPDATE_STAFF' : 'ADD_STAFF',
      `${existingIndex >= 0 ? 'Updated' : 'Added'} staff member ${staff.fullName} (${formatDepartmentName(staff.department)}) - Base: ${currencySymbol}${staff.baseSalary}`,
      { staffId: staff.id, fullName: staff.fullName, department: staff.department, baseSalary: staff.baseSalary },
      session.bursarName,
      schoolId,
      'INFO'
    );

    setIsStaffModalOpen(false);
    setStaffToEdit(null);

    // AUTO-PERSIST TO FIRESTORE IMMEDIATELY
    saveStaffMemberToFirestore(staff, schoolId)
      .then(() => {
        setSyncStatusMsg({
          type: 'success',
          text: `Staff member "${staff.fullName}" saved to database!`,
        });
      })
      .catch((err) => {
        console.warn('Staff Firestore save note:', err);
        setSyncStatusMsg({
          type: 'error',
          text: `Saved locally. (Cloud sync notice: ${err?.message || 'Will sync when online'})`,
        });
      })
      .finally(() => {
        setTimeout(() => setSyncStatusMsg(null), 3000);
      });
  };

  // Delete Staff
  const handleDeleteStaff = async (staffId: string) => {
    setIsDeletingStaff(true);
    try {
      const targetStaff = staffList.find((s) => s.id === staffId);
      const updatedStaff = staffList.filter((s) => s.id !== staffId);
      setStaffList(updatedStaff);
      saveStoredStaff(updatedStaff, schoolId);

      const updatedRecords = payrollRecords.filter((r) => r.staffId !== staffId);
      setPayrollRecords(updatedRecords);
      saveStoredPayrollRecords(updatedRecords, schoolId);

      const recordsToDelete = payrollRecords.filter((r) => r.staffId === staffId);
      Promise.all(
        recordsToDelete.map((r) => deletePayrollFromFirestore(r.id, schoolId).catch((err) => {
          console.warn(`Failed to delete payroll record ${r.id} from Firestore:`, err);
        }))
      ).catch(() => {});

      deleteStaffFromFirestore(staffId, schoolId)
        .then(() => {
          setSyncStatusMsg({
            type: 'success',
            text: `Removed "${targetStaff?.fullName || staffId}" from database.`,
          });
        })
        .catch((err) => {
          console.warn('Delete staff Firestore sync note:', err);
        })
        .finally(() => {
          setTimeout(() => setSyncStatusMsg(null), 3000);
        });

      recordAuditLog(
        'PAYROLL',
        'DELETE_STAFF',
        `Deleted staff member ${targetStaff?.fullName || staffId} [ID: ${staffId}]`,
        { staffId, fullName: targetStaff?.fullName },
        session.bursarName,
        schoolId,
        'WARNING'
      );

      setStaffToDeleteConfirm(null);
      setIsStaffModalOpen(false);
      setStaffToEdit(null);
    } finally {
      setIsDeletingStaff(false);
    }
  };

  // Undo a disbursed payment, reverting it back to Pending
  const handleUndoPayment = async (record: PayrollRecord) => {
    setIsUndoingPayment(true);
    try {
      const reverted = undoPayrollRecordPayment(record);
      const updatedRecords = payrollRecords.map((r) => (r.id === record.id ? reverted : r));
      setPayrollRecords(updatedRecords);
      saveStoredPayrollRecords(updatedRecords, schoolId);

      savePayrollToFirestore(reverted, schoolId).catch((err) => {
        console.warn('Undo payment Firestore sync note:', err);
      });

      recordAuditLog(
        'PAYROLL',
        'UNDO_PAYMENT',
        `Reversed salary payment for ${record.staffName} (${record.monthLabel}) — was ${currencySymbol}${record.netPay.toLocaleString()}, now Pending`,
        { staffId: record.staffId, staffName: record.staffName, month: record.month, amount: record.netPay },
        session.bursarName,
        schoolId,
        'WARNING'
      );

      setRecordToUndoConfirm(null);
    } finally {
      setIsUndoingPayment(false);
    }
  };

  // Clear All Data
  const handleExecuteClearRoster = () => {
    clearStoredStaffAndPayroll(schoolId);
    setStaffList([]);
    setPayrollRecords([]);
    setSelectedRecordIds([]);
    setShowClearRosterConfirm(false);

    recordAuditLog(
      'PAYROLL',
      'CLEAR_PAYROLL_ROSTER',
      `Cleared local staff payroll roster`,
      {},
      session.bursarName,
      schoolId,
      'CRITICAL'
    );
  };

  // Clean up orphaned payroll records for deleted staff
  const handleCleanupOrphanedPayroll = async () => {
    setIsCleaningOrphaned(true);
    try {
      const validStaffIds = new Set(staffList.map((s) => s.id));
      const orphaned = payrollRecords.filter((r) => !validStaffIds.has(r.staffId));

      if (orphaned.length === 0) {
        setSyncStatusMsg({ type: 'success', text: 'No orphaned payroll records found.' });
        setTimeout(() => setSyncStatusMsg(null), 3000);
        return;
      }

      const cleaned = payrollRecords.filter((r) => validStaffIds.has(r.staffId));
      setPayrollRecords(cleaned);
      saveStoredPayrollRecords(cleaned, schoolId);

      await Promise.all(
        orphaned.map((r) =>
          deletePayrollFromFirestore(r.id, schoolId).catch((err) => {
            console.warn(`Failed to delete orphaned payroll record ${r.id} from Firestore:`, err);
          })
        )
      );

      recordAuditLog(
        'PAYROLL',
        'CLEANUP_ORPHANED_PAYROLL',
        `Removed ${orphaned.length} orphaned payroll record(s) for deleted staff`,
        { orphanedIds: orphaned.map((r) => r.id), orphanedStaffIds: [...new Set(orphaned.map((r) => r.staffId))] },
        session.bursarName,
        schoolId,
        'CRITICAL'
      );

      setSyncStatusMsg({ type: 'success', text: `Removed ${orphaned.length} orphaned payroll record(s).` });
      setTimeout(() => setSyncStatusMsg(null), 3000);
    } finally {
      setIsCleaningOrphaned(false);
      setShowFixOrphanedConfirm(false);
    }
  };

  // Confirm Single Payment
  const handleConfirmSinglePayment = async (
    record: PayrollRecord,
    paymentDetails: {
      paymentMethod: 'bank_transfer' | 'cash' | 'cheque' | 'other';
      referenceNumber?: string;
      notes?: string;
      bursarName?: string;
    }
  ) => {
    const updatedRecord = markPayrollRecordPaid(record, paymentDetails);
    const updatedRecords = payrollRecords.map((r) => (r.id === record.id ? updatedRecord : r));
    setPayrollRecords(updatedRecords);
    saveStoredPayrollRecords(updatedRecords, schoolId);

    savePayrollRecordToFirestore(updatedRecord, schoolId)
      .then(() => {
        setSyncStatusMsg({
          type: 'success',
          text: `Payment for ${record.staffName} saved to database!`,
        });
      })
      .catch((e) => {
        console.warn('Single payment Firestore sync note:', e);
      })
      .finally(() => {
        setTimeout(() => setSyncStatusMsg(null), 3000);
      });

    recordAuditLog(
      'PAYROLL',
      'DISBURSE_SALARY',
      `Disbursed ${currencySymbol}${updatedRecord.amountPaid.toLocaleString()} salary to ${record.staffName} for ${record.monthLabel}`,
      {
        recordId: record.id,
        staffId: record.staffId,
        staffName: record.staffName,
        month: record.month,
        amountPaid: updatedRecord.amountPaid,
        method: paymentDetails.paymentMethod,
        ref: paymentDetails.referenceNumber,
      },
      session.bursarName,
      schoolId,
      'SUCCESS'
    );

    setSelectedRecordForPayment(null);
  };

  // Batch Pay Selected
  const executeBatchPaySelected = async () => {
    const recordsToUpdate: PayrollRecord[] = [];
    const updatedRecords = payrollRecords.map((r) => {
      if (selectedRecordIds.includes(r.id) && r.paymentStatus !== 'paid') {
        const marked = markPayrollRecordPaid(r, {
          paymentMethod: 'bank_transfer',
          referenceNumber: `BATCH-${Date.now().toString().slice(-6)}`,
          notes: 'Batch bank transfer payment',
          bursarName: session.bursarName || 'Bursar',
        });
        recordsToUpdate.push(marked);
        return marked;
      }
      return r;
    });

    setPayrollRecords(updatedRecords);
    saveStoredPayrollRecords(updatedRecords, schoolId);

    if (recordsToUpdate.length > 0) {
      batchSavePayrollToFirestore(recordsToUpdate, schoolId)
        .then(() => {
          setSyncStatusMsg({
            type: 'success',
            text: `Batch payments saved to database!`,
          });
        })
        .catch((e) => {
          console.warn('Batch pay Firestore sync note:', e);
        })
        .finally(() => {
          setTimeout(() => setSyncStatusMsg(null), 3000);
        });
    }

    recordAuditLog(
      'PAYROLL',
      'BATCH_PAY_SELECTED',
      `Batch disbursed salaries for ${selectedRecordIds.length} selected staff members in ${formatMonthLabel(selectedMonth)}`,
      { recordIds: selectedRecordIds, month: selectedMonth },
      session.bursarName,
      schoolId,
      'SUCCESS'
    );

    setSelectedRecordIds([]);
    setBatchPayConfirmType(null);
  };

  // Batch Pay All Pending
  const executeBatchPayAllPending = async () => {
    const pendingInMonth = activeMonthRecords.filter((r) => r.paymentStatus !== 'paid');
    const pendingIds = pendingInMonth.map((r) => r.id);

    const recordsToUpdate: PayrollRecord[] = [];
    const updatedRecords = payrollRecords.map((r) => {
      if (pendingIds.includes(r.id) && r.month === selectedMonth) {
        const marked = markPayrollRecordPaid(r, {
          paymentMethod: 'bank_transfer',
          referenceNumber: `ALL-${selectedMonth.replace('-', '')}-${Date.now().toString().slice(-4)}`,
          notes: `Full monthly disbursal for ${formatMonthLabel(selectedMonth)}`,
          bursarName: session.bursarName || 'Bursar',
        });
        recordsToUpdate.push(marked);
        return marked;
      }
      return r;
    });

    setPayrollRecords(updatedRecords);
    saveStoredPayrollRecords(updatedRecords, schoolId);

    if (recordsToUpdate.length > 0) {
      batchSavePayrollToFirestore(recordsToUpdate, schoolId)
        .then(() => {
          setSyncStatusMsg({
            type: 'success',
            text: `All pending salary payments saved to database!`,
          });
        })
        .catch((e) => {
          console.warn('Batch pay all Firestore sync note:', e);
        })
        .finally(() => {
          setTimeout(() => setSyncStatusMsg(null), 3000);
        });
    }

    recordAuditLog(
      'PAYROLL',
      'BATCH_PAY_ALL_PENDING',
      `Batch disbursed all ${pendingIds.length} pending staff salaries for ${formatMonthLabel(selectedMonth)}`,
      { pendingIds, month: selectedMonth },
      session.bursarName,
      schoolId,
      'SUCCESS'
    );

    setSelectedRecordIds([]);
    setBatchPayConfirmType(null);
  };

  // Push Full Payroll Roster to Cloud Firestore
  const handleSyncPushToSheet = async () => {
    setIsSyncing(true);
    setSyncStatusMsg({
      type: 'success',
      text: 'Saving all staff and payroll records to Cloud Firestore...',
    });

    try {
      const activeOrAllRecords = activeMonthRecords.length > 0 ? activeMonthRecords : payrollRecords;
      await Promise.all([
        batchSaveStaffToFirestore(staffList, schoolId),
        batchSavePayrollToFirestore(activeOrAllRecords, schoolId),
      ]);
      setSyncStatusMsg({
        type: 'success',
        text: `Successfully synced ${staffList.length} staff records to Firestore!`,
      });
    } catch (err: any) {
      setSyncStatusMsg({
        type: 'error',
        text: err?.message || 'Failed to sync to database. Check connection.',
      });
    } finally {
      setIsSyncing(false);
      setTimeout(() => setSyncStatusMsg(null), 4000);
    }
  };

  // Sync Pull from Cloud Firestore
  const handleSyncPullFromSheet = async (showFeedback = true) => {
    setIsSyncing(true);
    if (showFeedback) setSyncStatusMsg(null);
    try {
      const [firestoreStaff, firestorePayroll] = await Promise.all([
        loadStaffFromFirestore(schoolId),
        loadPayrollFromFirestore(schoolId),
      ]);

      if (Array.isArray(firestoreStaff) && firestoreStaff.length > 0) {
        const mergedStaff = applyCloudStaff(firestoreStaff, schoolId);
        setStaffList(mergedStaff);

        let cleanRecords = Array.isArray(firestorePayroll) && firestorePayroll.length > 0
          ? applyCloudPayroll(firestorePayroll, schoolId)
          : [];
        if (cleanRecords.length === 0) {
          cleanRecords = getOrGenerateMonthlyPayrollRecords(mergedStaff, selectedMonth, selectedTerm, selectedSession, []);
        }

        setPayrollRecords(cleanRecords);
        saveStoredPayrollRecords(cleanRecords, schoolId);

        if (showFeedback) {
          setSyncStatusMsg({
            type: 'success',
            text: `Loaded ${firestoreStaff.length} staff records from Firestore!`,
          });
          setTimeout(() => setSyncStatusMsg(null), 4000);
        }
      } else if (showFeedback) {
        setSyncStatusMsg({
          type: 'error',
          text: 'No staff records found in database.',
        });
        setTimeout(() => setSyncStatusMsg(null), 4000);
      }
    } catch (err: any) {
      if (showFeedback) {
        setSyncStatusMsg({
          type: 'error',
          text: err?.message || 'Failed to load from database. Check connection.',
        });
        setTimeout(() => setSyncStatusMsg(null), 4000);
      }
    } finally {
      setIsSyncing(false);
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    const headers = [
      'Staff ID',
      'Staff Name',
      'Role',
      'Department',
      'Month',
      'Term',
      'Base Salary',
      'Allowances',
      'Deductions',
      'Net Pay',
      'Status',
      'Payment Method',
      'Paid Date',
      'Reference No',
      'Bank Name',
      'Account Number',
    ];

    const rows = filteredDisbursals.map((r) => {
      const stf = staffList.find((s) => s.id === r.staffId);
      return [
        r.staffId,
        `"${r.staffName}"`,
        `"${r.role}"`,
        r.department,
        r.month,
        `"${r.term}"`,
        r.baseSalary,
        r.totalAllowances,
        r.totalDeductions,
        r.netPay,
        r.paymentStatus,
        r.paymentMethod || '',
        r.paymentDate || '',
        r.referenceNumber || '',
        `"${stf?.bankName || ''}"`,
        `"${stf?.accountNumber || ''}"`,
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `payroll_${selectedMonth}_${schoolId}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const activeStaffForModal = useMemo(() => {
    if (!selectedRecordForPayment) return null;
    return staffList.find((s) => s.id === selectedRecordForPayment.staffId) || null;
  }, [selectedRecordForPayment, staffList]);

  return (
    <div className="flex flex-col h-full bg-[#f8fafc] overflow-y-auto">
      
      {/* 1. Header Toolbar */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-4 sticky top-0 z-20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          
          {/* Title & Active Term */}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                Staff Payroll & Compensation
              </h1>
              <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                {selectedTerm}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Manage salary disbursals, staff compensation, and payment schedules
            </p>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => handleSyncPushToSheet()}
              disabled={isSyncing}
              title="Sync all staff & payroll records to Firestore database"
              className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold border border-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-emerald-600 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Syncing...' : 'Sync Cloud'}</span>
            </button>

            <button
              type="button"
              onClick={() => setIsTermScheduleModalOpen(true)}
              className="px-3 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold border border-slate-200 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              <span>Schedule</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setStaffToEdit(null);
                setIsStaffModalOpen(true);
              }}
              className="px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Staff</span>
            </button>
          </div>
        </div>

        {/* Month Selector Tabs */}
        <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-slate-100 flex-wrap">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            <span className="text-[11px] font-semibold text-slate-400 mr-1 uppercase">Month:</span>
            {termSchedule.monthsInTerm.map((m) => {
              const isSelected = selectedMonth === m;
              const mRecords = payrollRecords.filter((r) => r.month === m);
              const mPaid = mRecords.filter((r) => r.paymentStatus === 'paid').length;
              const mTotal = mRecords.length;
              const isAllPaid = mTotal > 0 && mPaid === mTotal;

              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setSelectedMonth(m)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <span>{formatMonthLabel(m)}</span>
                  {isAllPaid && !isSelected && (
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Due Status Pill */}
          <div className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>
              Salary Due: <strong>{termSchedule.salaryDueDay || 25}th</strong> ({monthlyDueStatus.statusLabel})
            </span>
          </div>
        </div>

        {/* Sub-Navigation Tabs */}
        <div className="flex items-center gap-2 mt-3 pt-2.5 border-t border-slate-100">
          <button
            type="button"
            onClick={() => setActiveSubTab('disbursals')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              activeSubTab === 'disbursals'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Disbursals Ledger
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('staff')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              activeSubTab === 'staff'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Staff Directory ({staffList.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('term_analytics')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              activeSubTab === 'term_analytics'
                ? 'bg-slate-900 text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Term Summary (3-Month)
          </button>
        </div>
      </div>

      <div className="p-4 sm:p-6 space-y-5 max-w-7xl mx-auto w-full">

        {/* Sync Status Banner */}
        {syncStatusMsg && (
          <div
            className={`p-3 rounded-xl border flex items-center justify-between text-xs font-semibold ${
              syncStatusMsg.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-rose-50 text-rose-800 border-rose-200'
            }`}
          >
            <span>{syncStatusMsg.text}</span>
            <button
              type="button"
              onClick={() => setSyncStatusMsg(null)}
              className="text-xs underline ml-2 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* 2. Minimalist KPI Metric Cards (Single Color Palette) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Card 1: Monthly Total */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-1 shadow-xs">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              {formatMonthLabel(selectedMonth)} Payroll
            </span>
            <div className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              {currencySymbol}{monthlySummary.totalNetExpense.toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-100 flex justify-between">
              <span>Base: {currencySymbol}{monthlySummary.totalBaseSalary.toLocaleString()}</span>
              <span>Net Total</span>
            </div>
          </div>

          {/* Card 2: Disbursed vs Pending */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-1 shadow-xs">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              Disbursed Status
            </span>
            <div className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              {currencySymbol}{monthlySummary.totalPaid.toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-100 flex justify-between">
              <span>{monthlySummary.paidCount} of {monthlySummary.totalStaffCount} Paid</span>
              <span>Pending: {currencySymbol}{monthlySummary.totalPending.toLocaleString()}</span>
            </div>
          </div>

          {/* Card 3: Term Total (3 Months) */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-1 shadow-xs">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              Term Budget (3 Months)
            </span>
            <div className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              {currencySymbol}{termSummary.totalTermExpectedExpense.toLocaleString()}
            </div>
            <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-100 flex justify-between">
              <span>Avg: {currencySymbol}{termSummary.averageMonthlyExpense.toLocaleString()}/mo</span>
              <span>{selectedTerm}</span>
            </div>
          </div>

          {/* Card 4: Active Staff */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-1 shadow-xs">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              Staff on Payroll
            </span>
            <div className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              {staffList.length} Members
            </div>
            <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-100 flex justify-between">
              <span>{monthlySummary.paidCount} Paid</span>
              <span>{monthlySummary.pendingCount} Pending</span>
            </div>
          </div>
        </div>

        {/* 3. VIEW 1: MONTHLY DISBURSALS */}
        {activeSubTab === 'disbursals' && (
          <div className="space-y-3.5">
            
            {/* Search & Filter Toolbar */}
            <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-3 shadow-xs">
              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                {/* Search */}
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search staff name or role..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-900 focus:outline-hidden focus:border-slate-400"
                  />
                </div>

                {/* Status */}
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-700"
                >
                  <option value="all">All Status ({activeMonthRecords.length})</option>
                  <option value="pending">Pending ({monthlySummary.pendingCount})</option>
                  <option value="paid">Paid ({monthlySummary.paidCount})</option>
                </select>

                {/* Department */}
                <select
                  value={departmentFilter}
                  onChange={(e) => setDepartmentFilter(e.target.value)}
                  className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-700"
                >
                  <option value="all">All Departments</option>
                  <option value="academic">Academic / Teaching</option>
                  <option value="administrative">Administrative</option>
                  <option value="management">Management</option>
                  <option value="support_security">Support & Security</option>
                  <option value="transport_facilities">Transport</option>
                </select>
              </div>

              {/* Action Toolbar */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100 flex-wrap gap-2 text-xs">
                <div className="flex items-center gap-2">
                  {monthlySummary.pendingCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setBatchPayConfirmType('all')}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <CheckCheck className="w-3.5 h-3.5" />
                      <span>Pay All Pending ({currencySymbol}{monthlySummary.totalPending.toLocaleString()})</span>
                    </button>
                  )}

                  {selectedRecordIds.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setBatchPayConfirmType('selected')}
                      className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>Pay Selected ({selectedRecordIds.length})</span>
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-1.5 ml-auto">
                  <button
                    type="button"
                    onClick={() => handleSyncPullFromSheet(true)}
                    disabled={isSyncing}
                    className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 font-semibold border border-slate-200 flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isSyncing ? 'animate-spin' : ''}`} />
                    <span>Pull from Sheet</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleExportCSV}
                    className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 font-semibold border border-slate-200 flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-slate-500" />
                    <span>Export CSV</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Disbursals Ledger Table */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs font-semibold text-slate-600 uppercase tracking-wide">
                <span>Staff Salary Disbursal Ledger ({filteredDisbursals.length})</span>
                <span className="normal-case font-normal text-slate-500">
                  {monthlySummary.paidCount} Paid • {monthlySummary.pendingCount} Pending
                </span>
              </div>

              {filteredDisbursals.length === 0 ? (
                <div className="p-10 text-center text-slate-400 space-y-2">
                  <UserCheck className="w-8 h-8 mx-auto text-slate-300" />
                  <p className="text-xs font-medium text-slate-600">
                    {staffList.length === 0
                      ? 'No staff registered. Click "Add Staff" to create staff members.'
                      : 'No payroll records found matching the current filters.'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {filteredDisbursals.map((rec) => {
                    const stf = staffList.find((s) => s.id === rec.staffId);
                    const isPaid = rec.paymentStatus === 'paid';
                    const isSelected = selectedRecordIds.includes(rec.id);
                    const initials = rec.staffName
                      .split(' ')
                      .map((n) => n[0])
                      .filter(Boolean)
                      .slice(0, 2)
                      .join('')
                      .toUpperCase() || 'ST';

                    return (
                      <div
                        key={rec.id}
                        className={`p-4 transition-colors ${
                          isSelected ? 'bg-slate-50/90' : 'hover:bg-slate-50/50'
                        }`}
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          {/* Left: Checkbox + Avatar + Staff Name & Details */}
                          <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                            {!isPaid ? (
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedRecordIds([...selectedRecordIds, rec.id]);
                                  } else {
                                    setSelectedRecordIds(selectedRecordIds.filter((id) => id !== rec.id));
                                  }
                                }}
                                className="mt-1 sm:mt-0 w-4 h-4 rounded-sm text-slate-900 border-slate-300 focus:ring-slate-500 cursor-pointer shrink-0"
                              />
                            ) : (
                              <div className="hidden sm:block w-4 shrink-0" />
                            )}

                            {/* Avatar Badge */}
                            <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200/80 text-slate-700 font-bold text-xs flex items-center justify-center shrink-0">
                              {initials}
                            </div>

                            {/* Staff Info without name truncation */}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-semibold text-slate-900 break-words">
                                  {rec.staffName}
                                </span>
                                <span
                                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                                    isPaid
                                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                      : 'bg-amber-50 text-amber-800 border-amber-200'
                                  }`}
                                >
                                  {isPaid ? 'Paid' : 'Pending'}
                                </span>
                              </div>

                              <div className="text-xs text-slate-500 flex items-center gap-1.5 flex-wrap mt-0.5">
                                <span className="font-medium text-slate-600">{rec.role || 'Staff Member'}</span>
                                <span className="text-slate-300">•</span>
                                <span>{formatDepartmentName(rec.department)}</span>
                                {stf?.bankName && (
                                  <>
                                    <span className="text-slate-300">•</span>
                                    <span className="text-slate-500">
                                      {stf.bankName} {stf.accountNumber ? `(${stf.accountNumber})` : ''}
                                    </span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Right: Net Pay & Action Button */}
                          <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0 pl-13 sm:pl-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                            <div className="text-left sm:text-right">
                              <div className="text-sm sm:text-base font-bold text-slate-900">
                                {currencySymbol}{rec.netPay.toLocaleString()}
                              </div>
                              <div className="text-[11px] text-slate-400">
                                Base: {currencySymbol}{rec.baseSalary.toLocaleString()}
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0">
                              {isPaid && (
                                <button
                                  type="button"
                                  onClick={() => setRecordToUndoConfirm(rec)}
                                  title="Undo this payment"
                                  className="p-2 rounded-lg bg-white hover:bg-rose-50 text-rose-600 border border-slate-200 transition-colors cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => setSelectedRecordForPayment(rec)}
                                className={`px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                                  isPaid
                                    ? 'bg-slate-100 hover:bg-slate-200 text-slate-800'
                                    : 'bg-slate-900 hover:bg-slate-800 text-white shadow-xs'
                                }`}
                              >
                                {isPaid ? (
                                  <>
                                    <Printer className="w-3.5 h-3.5" />
                                    <span>Payslip</span>
                                  </>
                                ) : (
                                  <>
                                    <CreditCard className="w-3.5 h-3.5" />
                                    <span>Disburse</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        )}

        {/* 4. VIEW 2: STAFF DIRECTORY */}
        {activeSubTab === 'staff' && (
          <div className="space-y-3.5">
            
            {/* Toolbar */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search staff directory..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white text-slate-900 focus:outline-hidden"
                />
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleSyncPullFromSheet(true)}
                  disabled={isSyncing}
                  className="px-3 py-1.5 rounded-lg bg-white hover:bg-slate-50 text-slate-700 font-semibold border border-slate-200 text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Reload staff records from Firestore database"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isSyncing ? 'animate-spin' : ''}`} />
                  <span>{isSyncing ? 'Reloading...' : 'Reload from DB'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowFixOrphanedConfirm(true)}
                  className="px-3 py-1.5 rounded-lg bg-white hover:bg-amber-50 text-amber-800 border border-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                  title="Purge orphaned payroll records for staff who were deleted"
                >
                  <Wrench className="w-3.5 h-3.5 text-amber-600" />
                  <span>Fix Orphaned Records</span>
                </button>

                {staffList.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowClearRosterConfirm(true)}
                    className="px-3 py-1.5 rounded-lg bg-white hover:bg-rose-50 text-rose-700 border border-slate-200 text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear Roster</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setStaffToEdit(null);
                    setIsStaffModalOpen(true);
                  }}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add New Staff</span>
                </button>
              </div>
            </div>

            {/* Staff Cards Grid */}
            {filteredStaff.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-10 text-center space-y-3">
                <Users className="w-10 h-10 mx-auto text-slate-300" />
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {searchQuery ? 'No staff found matching search.' : 'Staff directory is currently empty'}
                  </p>
                  <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                    Add new staff members or load them from your school database.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-2 pt-1 flex-wrap">
                  <button
                    type="button"
                    onClick={() => handleSyncPullFromSheet(true)}
                    disabled={isSyncing}
                    className="px-3.5 py-2 rounded-lg bg-white hover:bg-slate-50 text-slate-700 font-semibold border border-slate-200 text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${isSyncing ? 'animate-spin' : ''}`} />
                    <span>{isSyncing ? 'Reloading...' : 'Reload from DB'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setStaffToEdit(null);
                      setIsStaffModalOpen(true);
                    }}
                    className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add New Staff</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {filteredStaff.map((staff) => {
                  const fin = calculateStaffFinancials(staff);
                  const initials = staff.fullName
                    .split(' ')
                    .map((n) => n[0])
                    .filter(Boolean)
                    .slice(0, 2)
                    .join('')
                    .toUpperCase() || 'ST';

                  return (
                    <div
                      key={staff.id}
                      className="bg-white rounded-xl border border-slate-200 p-4 flex flex-col justify-between space-y-3.5 shadow-xs hover:border-slate-300 transition-colors"
                    >
                      <div>
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-2.5 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200/80 text-slate-700 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                              {initials}
                            </div>
                            <div className="min-w-0">
                              <h3 className="text-sm font-semibold text-slate-900 break-words leading-tight">
                                {staff.fullName}
                              </h3>
                              <p className="text-xs text-slate-600 font-medium mt-0.5">{staff.role}</p>
                              <p className="text-[11px] text-slate-400">
                                {formatDepartmentName(staff.department)}
                              </p>
                            </div>
                          </div>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 shrink-0">
                            {staff.status.toUpperCase()}
                          </span>
                        </div>

                        {/* Financial breakdown */}
                        <div className="mt-3 p-2.5 rounded-lg bg-slate-50 border border-slate-100 text-xs space-y-1">
                          <div className="flex justify-between text-slate-600 text-[11px]">
                            <span>Base Salary:</span>
                            <span className="font-semibold text-slate-900">
                              {currencySymbol}{staff.baseSalary.toLocaleString()}
                            </span>
                          </div>
                          {fin.totalAllowances > 0 && (
                            <div className="flex justify-between text-slate-500 text-[10px]">
                              <span>+ Allowances:</span>
                              <span>+{currencySymbol}{fin.totalAllowances.toLocaleString()}</span>
                            </div>
                          )}
                          {fin.totalDeductions > 0 && (
                            <div className="flex justify-between text-slate-500 text-[10px]">
                              <span>- Deductions:</span>
                              <span>-{currencySymbol}{fin.totalDeductions.toLocaleString()}</span>
                            </div>
                          )}
                          <div className="pt-1 border-t border-slate-200 flex justify-between font-bold text-slate-900 text-xs">
                            <span>Net Monthly:</span>
                            <span>{currencySymbol}{fin.netPay.toLocaleString()}</span>
                          </div>
                        </div>

                        {/* Bank info */}
                        {staff.bankName && (
                          <div className="mt-2 text-[11px] text-slate-500 bg-slate-50 p-2 rounded-lg border border-slate-100 flex items-center justify-between">
                            <span>{staff.bankName}</span>
                            <span className="font-mono text-slate-700">{staff.accountNumber || 'N/A'}</span>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                        <button
                          type="button"
                          onClick={() => setStaffToDeleteConfirm(staff)}
                          className="p-1 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                          title="Delete staff"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setStaffToEdit(staff);
                            setIsStaffModalOpen(true);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold transition-colors cursor-pointer"
                        >
                          Edit Profile
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

          </div>
        )}

        {/* 5. VIEW 3: TERM SUMMARY (3-MONTH OVERVIEW) */}
        {activeSubTab === 'term_analytics' && (
          <div className="space-y-4">
            
            {/* 3-Month Breakdown */}
            <div className="bg-white rounded-xl border border-slate-200 p-4.5 space-y-3 shadow-xs">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                    {selectedTerm} 3-Month Budget & Disbursements
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Projected payroll expenditures across the 3-month cycle
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-slate-500 block">Total Budget</span>
                  <span className="text-base font-bold text-slate-900">
                    {currencySymbol}{termSummary.totalTermExpectedExpense.toLocaleString()}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                {termSummary.monthlyBreakdowns.map((mSummary, idx) => (
                  <div
                    key={mSummary.month}
                    className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/60 space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500 font-medium">Month {idx + 1}</span>
                      <span className="font-bold text-slate-900">{mSummary.monthLabel}</span>
                    </div>
                    <div className="text-base font-bold text-slate-900">
                      {currencySymbol}{mSummary.totalNetExpense.toLocaleString()}
                    </div>
                    <div className="text-[11px] text-slate-500 pt-1 border-t border-slate-200 flex justify-between">
                      <span>Paid: {currencySymbol}{mSummary.totalPaid.toLocaleString()}</span>
                      <span>Pending: {currencySymbol}{mSummary.totalPending.toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Department Breakdown */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3 shadow-xs">
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wide">
                Monthly Cost Allocation by Department
              </h3>

              <div className="space-y-2.5 text-xs">
                {Object.entries(monthlySummary.departmentBreakdown).map(([deptKey, data]) => {
                  if (data.count === 0 && data.totalNet === 0) return null;
                  const deptShare =
                    monthlySummary.totalNetExpense > 0
                      ? Math.round((data.totalNet / monthlySummary.totalNetExpense) * 100)
                      : 0;

                  return (
                    <div key={deptKey} className="space-y-1">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-700 font-medium">
                          {formatDepartmentName(deptKey as StaffDepartment)} ({data.count} staff)
                        </span>
                        <span className="font-semibold text-slate-900">
                          {currencySymbol}{data.totalNet.toLocaleString()} ({deptShare}%)
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="bg-slate-900 h-full rounded-full"
                          style={{ width: `${deptShare}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

          </div>
        )}

      </div>

      {/* Staff Modal */}
      <StaffModal
        isOpen={isStaffModalOpen}
        onClose={() => {
          setIsStaffModalOpen(false);
          setStaffToEdit(null);
        }}
        onSave={handleSaveStaff}
        onDelete={handleDeleteStaff}
        staffToEdit={staffToEdit}
        currencySymbol={currencySymbol}
        nextStaffNumber={staffList.length + 1}
      />

      {/* Delete Staff Confirmation */}
      {staffToDeleteConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-sm rounded-xl shadow-xl border border-slate-200 p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-900">Delete Staff Profile</h3>
            <p className="text-xs text-slate-600">
              Are you sure you want to delete <strong>{staffToDeleteConfirm.fullName}</strong>? This will remove their salary records from this school.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setStaffToDeleteConfirm(null)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteStaff(staffToDeleteConfirm.id)}
                className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Undo Payment Confirmation */}
      {recordToUndoConfirm && (
        <div className="fixed inset-0 z-70 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-2xl p-5 max-w-sm w-full space-y-4 shadow-xl border border-slate-200">
            <h3 className="text-sm font-bold text-slate-900">Undo Salary Payment</h3>
            <p className="text-xs text-slate-600">
              Reverse the {currencySymbol}{recordToUndoConfirm.netPay.toLocaleString()} payment to{' '}
              <strong>{recordToUndoConfirm.staffName}</strong> for {recordToUndoConfirm.monthLabel}? This will mark it back as Pending.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setRecordToUndoConfirm(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 text-xs font-semibold cursor-pointer hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleUndoPayment(recordToUndoConfirm)}
                disabled={isUndoingPayment}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer transition-colors"
              >
                {isUndoingPayment ? 'Reversing...' : 'Undo Payment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear Roster Confirmation */}
      {showClearRosterConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-sm rounded-xl shadow-xl border border-slate-200 p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-900">Clear Staff Roster</h3>
            <p className="text-xs text-slate-600">
              Are you sure you want to clear all staff members and payroll records stored locally? You can pull them back anytime from Google Sheet.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowClearRosterConfirm(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteClearRoster}
                className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer"
              >
                Clear All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fix Orphaned Records Confirmation */}
      {showFixOrphanedConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-sm rounded-xl shadow-xl border border-slate-200 p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-900">Fix Orphaned Records</h3>
            <p className="text-xs text-slate-600">
              Scan and purge any orphaned payroll records belonging to deleted staff members from local storage and the cloud database?
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowFixOrphanedConfirm(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold cursor-pointer hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCleanupOrphanedPayroll}
                disabled={isCleaningOrphaned}
                className="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-50 transition-colors"
              >
                {isCleaningOrphaned ? 'Cleaning...' : 'Fix Records'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Pay Confirmation */}
      {batchPayConfirmType && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white w-full max-w-sm rounded-xl shadow-xl border border-slate-200 p-5 space-y-3">
            <h3 className="text-sm font-bold text-slate-900">
              {batchPayConfirmType === 'selected' ? 'Disburse Selected Salaries' : 'Disburse All Pending Salaries'}
            </h3>
            <p className="text-xs text-slate-600">
              {batchPayConfirmType === 'selected'
                ? `Confirm bank transfer disbursement for ${selectedRecordIds.length} selected staff members.`
                : `Confirm full salary disbursement for all ${monthlySummary.pendingCount} pending staff (${currencySymbol}${monthlySummary.totalPending.toLocaleString()}).`}
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setBatchPayConfirmType(null)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={batchPayConfirmType === 'selected' ? executeBatchPaySelected : executeBatchPayAllPending}
                className="px-3.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
              >
                Confirm & Pay
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pay Staff & Payslip Modal */}
      <PayStaffModal
        isOpen={Boolean(selectedRecordForPayment)}
        onClose={() => setSelectedRecordForPayment(null)}
        record={selectedRecordForPayment}
        staff={activeStaffForModal}
        school={activeSchool}
        session={session}
        onConfirmPayment={handleConfirmSinglePayment}
      />

      {/* Academic Term Duration & Schedule Modal */}
      <TermScheduleModal
        isOpen={isTermScheduleModalOpen}
        onClose={() => setIsTermScheduleModalOpen(false)}
        selectedTerm={selectedTerm}
        session={session}
        activeSchool={activeSchool}
        onSelectTerm={(t) => setSelectedTerm(t)}
        onScheduleUpdated={(updatedSchedule) => {
          setTermSchedule(updatedSchedule);
          if (updatedSchedule.monthsInTerm.length > 0 && !updatedSchedule.monthsInTerm.includes(selectedMonth)) {
            setSelectedMonth(updatedSchedule.monthsInTerm[0]);
          }
        }}
      />
    </div>
  );
};
