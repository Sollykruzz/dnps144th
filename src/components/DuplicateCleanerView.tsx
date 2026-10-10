/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useDeferredValue } from 'react';
import {
  Users,
  Search,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Merge,
  Trash2,
  Download,
  RefreshCw,
  Eye,
  EyeOff,
  Filter,
  ShieldCheck,
  ArrowRight,
  Sparkles,
  HelpCircle,
  FileSpreadsheet,
  X,
  Calendar,
  CreditCard,
  Building2,
  Tag,
  RotateCcw
} from 'lucide-react';
import { StudentPaymentRecord, BursarSession } from '../types';
import {
  findDuplicateGroups,
  mergeDuplicateRecords,
  generateDuplicateReportCsv,
  DuplicateGroup,
  DuplicateMatchCriteria,
} from '../services/deduplicationService';
import { formatCurrency, deriveFeeBreakdown } from '../services/calculations';

interface DuplicateCleanerViewProps {
  students: StudentPaymentRecord[];
  session: BursarSession;
  onMergeGroup: (primaryId: string, mergedRecord: StudentPaymentRecord, deletedIds: string[]) => Promise<void> | void;
  onDeleteRecord: (id: string, student: StudentPaymentRecord) => Promise<void> | void;
  onBatchResolve?: (mergedRecords: StudentPaymentRecord[], deletedIds: string[]) => Promise<void> | void;
  onClose?: () => void;
}

export const DuplicateCleanerView: React.FC<DuplicateCleanerViewProps> = ({
  students,
  session,
  onMergeGroup,
  onDeleteRecord,
  onBatchResolve,
  onClose,
}) => {
  const [selectedCriteria, setSelectedCriteria] = useState<DuplicateMatchCriteria>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [primarySelections, setPrimarySelections] = useState<Record<string, string>>({});
  const [ignoredGroupIds, setIgnoredGroupIds] = useState<Set<string>>(new Set());
  const [showIgnoredTab, setShowIgnoredTab] = useState(false);
  const [isProcessing, setIsProcessing] = useState<string | null>(null);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);
  const [actionErrorMsg, setActionErrorMsg] = useState<string | null>(null);
  const [recordToDeleteConfirm, setRecordToDeleteConfirm] = useState<{ group: DuplicateGroup; student: StudentPaymentRecord } | null>(null);

  const deferredSearch = useDeferredValue(searchQuery);

  // Available classes in the current student roster
  const availableClasses = useMemo(() => {
    const set = new Set<string>();
    students.forEach((s) => {
      if (s?.class?.trim()) set.add(s.class.trim());
    });
    return Array.from(set).sort();
  }, [students]);

  // Scan database and detect duplicate groups
  const duplicateGroups = useMemo(() => {
    const rawGroups = findDuplicateGroups(students, selectedCriteria, deferredSearch, Array.from(ignoredGroupIds));

    return rawGroups.filter((g) => {
      // Filter by selected class if specified
      if (selectedClass !== 'all') {
        const hasClass = g.records.some((r) => r.class === selectedClass);
        if (!hasClass) return false;
      }

      return true;
    });
  }, [students, selectedCriteria, deferredSearch, selectedClass, ignoredGroupIds]);

  // All raw groups for ignored tab
  const allRawGroups = useMemo(() => {
    return findDuplicateGroups(students, 'all', '', []);
  }, [students]);

  const ignoredGroupsList = useMemo(() => {
    return allRawGroups.filter((g) => {
      const pairKey = `pair:${g.records.map((r) => r.id).sort().join(':::')}`;
      return ignoredGroupIds.has(g.groupId) || ignoredGroupIds.has(pairKey);
    });
  }, [allRawGroups, ignoredGroupIds]);

  // Total affected duplicate records
  const totalDuplicateRecordsCount = useMemo(() => {
    return duplicateGroups.reduce((acc, g) => acc + (g.records.length - 1), 0);
  }, [duplicateGroups]);

  const sameNameCount = useMemo(() => {
    return duplicateGroups.filter((g) => g.isRecommendedSameName).length;
  }, [duplicateGroups]);

  const showToast = (msg: string) => {
    setActionSuccessMsg(msg);
    setTimeout(() => setActionSuccessMsg(null), 4000);
  };

  const showErrorToast = (msg: string) => {
    setActionErrorMsg(msg);
    setTimeout(() => setActionErrorMsg(null), 5000);
  };

  // Select primary record in a group
  const handleSelectPrimary = (groupId: string, studentId: string) => {
    setPrimarySelections((prev) => ({
      ...prev,
      [groupId]: studentId,
    }));
  };

  // Merge group
  const handleMergeGroup = async (group: DuplicateGroup) => {
    const primaryId = primarySelections[group.groupId] || group.primaryRecordId;
    const primaryRecord = group.records.find((r) => r.id === primaryId) || group.records[0];
    const duplicates = group.records.filter((r) => r.id !== primaryRecord.id);

    if (duplicates.length === 0) return;

    setIsProcessing(group.groupId);
    try {
      const { mergedRecord, deletedRecordIds } = mergeDuplicateRecords(primaryRecord, duplicates);
      await onMergeGroup(primaryRecord.id, mergedRecord, deletedRecordIds);
      showToast(`Merged duplicate records for "${mergedRecord.full_name}" into ID: ${mergedRecord.id}`);
    } catch (e: any) {
      showErrorToast(`Merge error: ${e.message}`);
    } finally {
      setIsProcessing(null);
    }
  };

  // Prompt delete single duplicate record in a group
  const handleDeleteDuplicate = (group: DuplicateGroup, studentToDelete: StudentPaymentRecord) => {
    setRecordToDeleteConfirm({ group, student: studentToDelete });
  };

  // Confirm delete single duplicate record
  const handleConfirmDeleteDuplicate = async () => {
    if (!recordToDeleteConfirm) return;
    const { group, student: studentToDelete } = recordToDeleteConfirm;

    setIsProcessing(`${group.groupId}_${studentToDelete.id}`);
    try {
      await onDeleteRecord(studentToDelete.id, studentToDelete);
      showToast(`Removed duplicate record "${studentToDelete.full_name}" (ID: ${studentToDelete.id})`);
      setRecordToDeleteConfirm(null);
    } catch (e: any) {
      showErrorToast(`Delete error: ${e.message}`);
    } finally {
      setIsProcessing(null);
    }
  };

  // Ignore group
  const handleIgnoreGroup = (group: DuplicateGroup) => {
    const pairKey = `pair:${group.records.map((r) => r.id).sort().join(':::')}`;
    setIgnoredGroupIds((prev) => {
      const next = new Set(prev);
      next.add(group.groupId);
      next.add(pairKey);
      return next;
    });
    showToast(`Ignored duplicate suggestion for "${group.matchDescription}".`);
  };

  // Unignore group
  const handleUnignoreGroup = (group: DuplicateGroup) => {
    const pairKey = `pair:${group.records.map((r) => r.id).sort().join(':::')}`;
    setIgnoredGroupIds((prev) => {
      const next = new Set(prev);
      next.delete(group.groupId);
      next.delete(pairKey);
      return next;
    });
    showToast(`Restored "${group.matchDescription}" to duplicate scan list.`);
  };

  // Clear all ignored
  const handleClearAllIgnored = () => {
    setIgnoredGroupIds(new Set());
    showToast('Reset all ignored duplicate suggestions.');
  };

  // Batch auto-merge all exact ID duplicate groups
  const handleBatchAutoMerge = async () => {
    const exactIdGroups = duplicateGroups.filter((g) => g.criteria === 'id' || g.criteria === 'name_and_class');
    if (exactIdGroups.length === 0) {
      showErrorToast('No exact duplicate groups available to auto-merge.');
      return;
    }

    setIsProcessing('batch');
    const allMerged: StudentPaymentRecord[] = [];
    const allDeletedIds: string[] = [];

    exactIdGroups.forEach((group) => {
      const primaryId = primarySelections[group.groupId] || group.primaryRecordId;
      const primaryRecord = group.records.find((r) => r.id === primaryId) || group.records[0];
      const duplicates = group.records.filter((r) => r.id !== primaryRecord.id);

      if (duplicates.length > 0) {
        const { mergedRecord, deletedRecordIds } = mergeDuplicateRecords(primaryRecord, duplicates);
        allMerged.push(mergedRecord);
        allDeletedIds.push(...deletedRecordIds);
      }
    });

    try {
      if (onBatchResolve) {
        await onBatchResolve(allMerged, allDeletedIds);
      } else {
        for (let i = 0; i < allMerged.length; i++) {
          const m = allMerged[i];
          const group = exactIdGroups[i];
          const primaryRecord = group.records.find((r) => r.id === m.id) || group.records[0];
          const duplicates = group.records.filter((r) => r.id !== primaryRecord.id);
          const delIds = duplicates.map((d) => d.id);
          await onMergeGroup(primaryRecord.id, m, delIds);
        }
      }
      setShowBatchModal(false);
      showToast(`Cleaned & resolved ${allMerged.length} duplicate groups (${allDeletedIds.length} redundant rows removed).`);
    } catch (e: any) {
      showErrorToast(`Batch merge error: ${e.message}`);
    } finally {
      setIsProcessing(null);
    }
  };

  // Export CSV Report
  const handleExportCsv = () => {
    const csv = generateDuplicateReportCsv(duplicateGroups);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Dominion_Duplicate_Records_Audit_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showToast('Downloaded Duplicate Audit CSV.');
  };

  return (
    <div className="space-y-4 text-slate-800">
      {/* Action Success Toast */}
      {actionSuccessMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-900 text-xs font-bold flex items-center justify-between shadow-sm animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{actionSuccessMsg}</span>
          </div>
          <button
            onClick={() => setActionSuccessMsg(null)}
            className="text-emerald-700 hover:text-emerald-950 p-1 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Action Error Toast */}
      {actionErrorMsg && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl text-rose-900 text-xs font-bold flex items-center justify-between shadow-sm animate-in fade-in">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{actionErrorMsg}</span>
          </div>
          <button
            onClick={() => setActionErrorMsg(null)}
            className="text-rose-700 hover:text-rose-950 p-1 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Header Summary Banner */}
      <div className="bg-gradient-to-br from-indigo-900 via-blue-900 to-slate-900 text-white rounded-3xl p-5 shadow-lg relative overflow-hidden">
        <div className="relative z-10 space-y-3">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-white/10 text-white flex items-center justify-center backdrop-blur-xs shadow-inner">
                <Users className="w-5 h-5 text-blue-300" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-black uppercase tracking-tight">Duplicate Records Cleaner</h3>
                  <span className="text-[10px] bg-blue-500 text-white font-black px-2 py-0.5 rounded-full uppercase">
                    Audit Hub
                  </span>
                </div>
                <p className="text-xs text-blue-200/90 font-medium">
                  Scan, compare, verify, and merge redundant student IDs or names
                </p>
              </div>
            </div>

            {duplicateGroups.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleExportCsv}
                  className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer backdrop-blur-xs"
                  title="Export Duplicate Audit Report"
                >
                  <Download className="w-3.5 h-3.5 text-blue-300" />
                  <span>Export CSV</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowBatchModal(true)}
                  className="px-3.5 py-1.5 rounded-xl bg-blue-500 hover:bg-blue-400 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm active:scale-95 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Auto-Merge Verified ({totalDuplicateRecordsCount})</span>
                </button>
              </div>
            )}
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/10 text-center text-xs">
            <div className="bg-white/5 rounded-2xl p-2">
              <div className="text-[10px] text-blue-200 font-bold uppercase tracking-wider">Total Scanned</div>
              <div className="text-sm font-black text-white font-mono">{students.length} Records</div>
            </div>
            <div className="bg-white/5 rounded-2xl p-2">
              <div className="text-[10px] text-blue-200 font-bold uppercase tracking-wider">Duplicate Groups</div>
              <div className={`text-sm font-black font-mono ${duplicateGroups.length > 0 ? 'text-amber-300' : 'text-emerald-300'}`}>
                {duplicateGroups.length} Groups
              </div>
            </div>
            <div className="bg-white/5 rounded-2xl p-2">
              <div className="text-[10px] text-blue-200 font-bold uppercase tracking-wider">Redundant Rows</div>
              <div className={`text-sm font-black font-mono ${totalDuplicateRecordsCount > 0 ? 'text-rose-300' : 'text-emerald-300'}`}>
                {totalDuplicateRecordsCount} to clean
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Search Controls Bar */}
      <div className="bg-white p-3.5 rounded-3xl border border-slate-200/80 shadow-xs space-y-3">
        {/* Search by ID, Name, Class */}
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter duplicates by Student ID, Full Name, or Class..."
            className="w-full pl-10 pr-10 py-2 text-xs font-bold bg-slate-50 rounded-2xl border border-slate-200 text-slate-900 placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-blue-600 focus:outline-none transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 p-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Criteria & Class Filters */}
        <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
          {/* Match Criteria Pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
            <button
              type="button"
              onClick={() => {
                setShowIgnoredTab(false);
                setSelectedCriteria('all');
              }}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all text-[11px] whitespace-nowrap cursor-pointer ${
                !showIgnoredTab && selectedCriteria === 'all'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All Match Types
            </button>
            <button
              type="button"
              onClick={() => {
                setShowIgnoredTab(false);
                setSelectedCriteria('same_name_recommendations');
              }}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all text-[11px] whitespace-nowrap flex items-center gap-1 cursor-pointer ${
                !showIgnoredTab && selectedCriteria === 'same_name_recommendations'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
              }`}
            >
              <Sparkles className="w-3 h-3 text-amber-500" />
              <span>🌟 Same Name Matches</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setShowIgnoredTab(false);
                setSelectedCriteria('id');
              }}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all text-[11px] whitespace-nowrap cursor-pointer ${
                !showIgnoredTab && selectedCriteria === 'id'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              🪪 Same Student ID
            </button>
            <button
              type="button"
              onClick={() => {
                setShowIgnoredTab(false);
                setSelectedCriteria('name_and_class');
              }}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all text-[11px] whitespace-nowrap cursor-pointer ${
                !showIgnoredTab && selectedCriteria === 'name_and_class'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              👥 Same Name & Class
            </button>
            <button
              type="button"
              onClick={() => {
                setShowIgnoredTab(false);
                setSelectedCriteria('name_only');
              }}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all text-[11px] whitespace-nowrap cursor-pointer ${
                !showIgnoredTab && selectedCriteria === 'name_only'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              🌐 Exact Names
            </button>

            {/* Ignored tab */}
            <button
              type="button"
              onClick={() => setShowIgnoredTab(true)}
              className={`px-3 py-1.5 rounded-xl font-bold transition-all text-[11px] whitespace-nowrap flex items-center gap-1 cursor-pointer ${
                showIgnoredTab
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <EyeOff className="w-3 h-3" />
              <span>Ignored ({ignoredGroupsList.length})</span>
            </button>
          </div>

          {/* Class Filter Dropdown */}
          {availableClasses.length > 0 && !showIgnoredTab && (
            <div className="flex items-center gap-1.5 shrink-0 ml-auto">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Class:</span>
              <select
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="py-1 px-2.5 text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl text-slate-800 focus:ring-2 focus:ring-blue-600 focus:outline-none"
              >
                <option value="all">All Classes</option>
                {availableClasses.map((cls) => (
                  <option key={cls} value={cls}>
                    {cls}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Duplicate Groups List */}
      {showIgnoredTab ? (
        /* Ignored Suggestions List */
        ignoredGroupsList.length === 0 ? (
          <div className="bg-white rounded-3xl p-8 border border-slate-200/80 text-center space-y-3 shadow-xs">
            <div className="w-12 h-12 rounded-2xl bg-slate-50 text-slate-400 flex items-center justify-center mx-auto shadow-xs border border-slate-200">
              <EyeOff className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">No Ignored Suggestions</h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                You have not ignored any duplicate candidate pairs. When you click &quot;Ignore&quot; on a duplicate suggestion, it will be stored here.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs px-1">
              <span className="font-bold text-slate-600">
                Showing <strong className="text-slate-900 font-black">{ignoredGroupsList.length}</strong> ignored duplicate suggestion{ignoredGroupsList.length === 1 ? '' : 's'}:
              </span>
              <button
                type="button"
                onClick={handleClearAllIgnored}
                className="text-amber-700 hover:text-amber-800 font-bold hover:underline flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Restore All Ignored</span>
              </button>
            </div>

            {ignoredGroupsList.map((group, idx) => (
              <div
                key={group.groupId}
                className="bg-white rounded-3xl border border-slate-200/80 p-4 shadow-xs flex items-center justify-between flex-wrap gap-2"
              >
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-black text-slate-400">#{idx + 1}</span>
                    <h4 className="text-sm font-black text-slate-900">{group.matchDescription}</h4>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                      Ignored
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    {group.records.length} students: {group.records.map((r) => `#${r.id} ${r.full_name} (${r.class})`).join(' • ')}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => handleUnignoreGroup(group)}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold border border-slate-200 flex items-center gap-1.5 transition-all cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-blue-600" />
                  <span>Unignore / Restore to Scan</span>
                </button>
              </div>
            ))}
          </div>
        )
      ) : duplicateGroups.length === 0 ? (
        <div className="bg-white rounded-3xl p-8 border border-slate-200/80 text-center space-y-3 shadow-xs">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto shadow-xs border border-emerald-100">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">Database is Clean & Verified!</h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              {deferredSearch || selectedClass !== 'all' || selectedCriteria !== 'all'
                ? 'No duplicate student records match your active search filters.'
                : 'No duplicate Student IDs or conflicting student names were detected in this school roster.'}
            </p>
          </div>
          {(deferredSearch || selectedClass !== 'all' || selectedCriteria !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setSelectedClass('all');
                setSelectedCriteria('all');
              }}
              className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-all cursor-pointer"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between text-xs px-1">
            <span className="font-bold text-slate-600">
              Showing <strong className="text-slate-900 font-black">{duplicateGroups.length}</strong> duplicate conflict{duplicateGroups.length === 1 ? '' : 's'}:
            </span>
            <span className="text-[11px] text-slate-400">
              Select which record to keep as Primary, then click <strong>Merge</strong>
            </span>
          </div>

          {duplicateGroups.map((group, groupIdx) => {
            const currentPrimaryId = primarySelections[group.groupId] || group.primaryRecordId;
            const isGroupBusy = isProcessing === group.groupId;

            return (
              <div
                key={group.groupId}
                className="bg-white rounded-3xl border border-slate-200/80 shadow-xs overflow-hidden transition-all hover:border-slate-300"
              >
                {/* Group Header */}
                <div className="p-4 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 font-mono text-xs font-bold flex items-center justify-center shrink-0">
                      {groupIdx + 1}
                    </span>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black text-slate-900">{group.matchDescription}</span>
                        {group.isRecommendedSameName && (
                          <span className="text-[9px] font-black px-2 py-0.5 rounded-full uppercase bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-0.5">
                            <Sparkles className="w-2.5 h-2.5 text-amber-600" />
                            Recommended Same Name
                          </span>
                        )}
                        <span
                          className={`text-[9px] font-black px-2 py-0.2 rounded-full uppercase tracking-wider ${
                            group.criteria === 'id'
                              ? 'bg-rose-100 text-rose-800'
                              : group.criteria === 'name_and_class'
                              ? 'bg-amber-100 text-amber-800'
                              : group.criteria === 'same_name_swapped'
                              ? 'bg-purple-100 text-purple-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {group.criteria === 'id'
                            ? 'Exact ID Conflict'
                            : group.criteria === 'name_and_class'
                            ? 'Same Class Conflict'
                            : group.criteria === 'same_name_swapped'
                            ? 'Swapped Name Order'
                            : 'Cross-Class Match'}
                        </span>
                      </div>

                      {group.recommendationNote && (
                        <p className="text-[10px] text-amber-800 font-semibold mt-0.5">
                          {group.recommendationNote}
                        </p>
                      )}

                      <p className="text-[10px] text-slate-500 font-medium mt-0.5">
                        {group.records.length} records found sharing this key
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleIgnoreGroup(group)}
                      title="Keep both records as distinct students / twins"
                      className="px-2.5 py-1.5 rounded-xl text-slate-600 hover:text-amber-800 hover:bg-amber-50 border border-slate-200 text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1"
                    >
                      <EyeOff className="w-3.5 h-3.5 text-amber-600" />
                      <span>Ignore</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleMergeGroup(group)}
                      disabled={isGroupBusy}
                      className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold flex items-center gap-1.5 transition-all shadow-xs active:scale-95 disabled:opacity-50 cursor-pointer"
                    >
                      <Merge className="w-3.5 h-3.5" />
                      <span>{isGroupBusy ? 'Merging...' : 'Merge Into Primary'}</span>
                    </button>
                  </div>
                </div>

                {/* Comparative Records Grid */}
                <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3 bg-white">
                  {group.records.map((record, rIdx) => {
                    const isPrimary = record.id === currentPrimaryId;
                    const bd = deriveFeeBreakdown(record);
                    const isRecordDeleting = isProcessing === `${group.groupId}_${record.id}`;

                    return (
                      <div
                        key={`${record.id}_${rIdx}`}
                        className={`p-3.5 rounded-2xl border transition-all relative ${
                          isPrimary
                            ? 'bg-blue-50/50 border-blue-300 ring-2 ring-blue-500/20'
                            : 'bg-slate-50/60 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {/* Radio selection to pick Primary */}
                        <div className="flex items-start justify-between gap-2 mb-2.5">
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="radio"
                              name={`primary_${group.groupId}`}
                              checked={isPrimary}
                              onChange={() => handleSelectPrimary(group.groupId, record.id)}
                              className="w-4 h-4 text-blue-600 focus:ring-blue-500 border-slate-300 cursor-pointer"
                            />
                            <span className="text-xs font-bold text-slate-900">
                              {isPrimary ? (
                                <span className="text-blue-700 font-black flex items-center gap-1">
                                  <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                                  <span>Primary Target</span>
                                </span>
                              ) : (
                                <span className="text-slate-600">Candidate #{rIdx + 1}</span>
                              )}
                            </span>
                          </label>

                          <div className="flex items-center gap-1.5">
                            {/* Delete single duplicate button */}
                            {!isPrimary && (
                              <button
                                type="button"
                                onClick={() => handleDeleteDuplicate(group, record)}
                                disabled={isRecordDeleting}
                                title="Delete this duplicate record only"
                                className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Student Details Fields */}
                        <div className="space-y-1.5 text-xs">
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-slate-400 font-bold uppercase">ID:</span>
                            <span className="font-mono font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                              {record.id}
                            </span>
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-slate-400 font-bold uppercase">Name:</span>
                            <span className="font-bold text-slate-900 text-right truncate max-w-[200px]">
                              {record.full_name}
                            </span>
                          </div>

                          <div className="flex items-center justify-between">
                            <span className="text-[11px] text-slate-400 font-bold uppercase">Class & Term:</span>
                            <span className="font-medium text-slate-700">
                              {record.class} • {record.term}
                            </span>
                          </div>

                          {/* Financial Summary */}
                          <div className="pt-2 border-t border-slate-200/60 mt-2 space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-slate-500 font-bold uppercase">School Fee:</span>
                              <span className="font-mono font-bold text-slate-800">
                                {session.currencySymbol}{Number(record.fee_amount || record.tuition_fee || 0).toLocaleString()}
                              </span>
                            </div>

                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-slate-500 font-bold uppercase">Amount Paid:</span>
                              <span
                                className={`font-mono font-bold ${
                                  Number(record.amount_paid) > 0 ? 'text-emerald-700 font-black' : 'text-slate-600'
                                }`}
                              >
                                {session.currencySymbol}{Number(record.amount_paid || 0).toLocaleString()}
                              </span>
                            </div>

                            <div className="flex items-center justify-between">
                              <span className="text-[10px] text-slate-500 font-bold uppercase">Balance:</span>
                              <span
                                className={`font-mono font-bold ${
                                  Number(record.balance) > 0 ? 'text-rose-700' : 'text-emerald-700'
                                }`}
                              >
                                {session.currencySymbol}{Number(record.balance || 0).toLocaleString()}
                              </span>
                            </div>

                            {/* Itemized Fees Summary */}
                            {(bd.admissionPaid > 0 || bd.lessonPaid > 0 || bd.examPaid > 0) && (
                              <div className="pt-1.5 border-t border-dashed border-slate-200 text-[10px] text-slate-600 space-y-0.5">
                                {bd.admissionPaid > 0 && (
                                  <div className="flex justify-between">
                                    <span>Admission Paid:</span>
                                    <span className="font-mono font-bold">{session.currencySymbol}{bd.admissionPaid.toLocaleString()}</span>
                                  </div>
                                )}
                                {bd.lessonPaid > 0 && (
                                  <div className="flex justify-between">
                                    <span>Lesson Paid:</span>
                                    <span className="font-mono font-bold">{session.currencySymbol}{bd.lessonPaid.toLocaleString()}</span>
                                  </div>
                                )}
                                {bd.examPaid > 0 && (
                                  <div className="flex justify-between">
                                    <span>Exam Paid:</span>
                                    <span className="font-mono font-bold">{session.currencySymbol}{bd.examPaid.toLocaleString()}</span>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Receipt Number */}
                            {record.receipt_no && (
                              <div className="pt-1 text-[10px] flex items-center justify-between text-blue-700 bg-blue-50/80 px-2 py-0.5 rounded font-mono">
                                <span className="font-bold">Receipt:</span>
                                <span className="font-bold">{record.receipt_no}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Batch Merge Confirmation Modal */}
      {showBatchModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 space-y-4 shadow-2xl border border-slate-100 animate-in zoom-in-95">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-base font-black text-slate-900">Auto-Merge All Duplicates?</h4>
                <p className="text-xs text-slate-500">
                  Combine payments, preserve receipts, and eliminate duplicate entries
                </p>
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-700 space-y-2">
              <div className="flex justify-between font-bold">
                <span>Groups to resolve:</span>
                <span className="font-mono text-blue-700">{duplicateGroups.length} groups</span>
              </div>
              <div className="flex justify-between font-bold">
                <span>Redundant records removed:</span>
                <span className="font-mono text-rose-700">{totalDuplicateRecordsCount} records</span>
              </div>
              <p className="text-[11px] text-slate-500 pt-1 border-t border-slate-200">
                Primary records will be updated with the combined total paid amounts and receipts. Changes will sync directly to your local database and connected Google Sheet.
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowBatchModal(false)}
                className="flex-1 py-2.5 px-3 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBatchAutoMerge}
                disabled={isProcessing === 'batch'}
                className="flex-1 py-2.5 px-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isProcessing === 'batch' ? (
                  <span>Processing...</span>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Confirm Auto-Merge</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Duplicate Confirmation Modal */}
      {recordToDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="text-base font-bold text-slate-900">Delete Redundant Record?</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Permanently delete copy for <strong className="text-slate-800">{recordToDeleteConfirm.student.full_name}</strong> (ID: {recordToDeleteConfirm.student.id}) from the database?
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                disabled={Boolean(isProcessing)}
                onClick={() => setRecordToDeleteConfirm(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={Boolean(isProcessing)}
                onClick={handleConfirmDeleteDuplicate}
                className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-all shadow-xs disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isProcessing ? 'Deleting...' : 'Delete Copy'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
