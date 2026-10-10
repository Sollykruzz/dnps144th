/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  CopyCheck,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Trash2,
  GitMerge,
  Search,
  Filter,
  Layers,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  Calendar,
  DollarSign,
  UserCheck,
  Info,
  RefreshCw,
  ExternalLink,
  ArrowLeftRight,
  Eye,
  EyeOff,
  RotateCcw
} from 'lucide-react';
import { StudentPaymentRecord, BursarSession, SchoolProfile } from '../types';
import { 
  DuplicateGroup, 
  detectDuplicateGroups, 
  resolveDuplicateGroup, 
  bulkResolveDuplicates,
  mergeStudentRecords,
  getStoredIgnoredDuplicateIds,
  saveStoredIgnoredDuplicateIds
} from '../services/duplicateService';
import { formatCurrency, deriveFeeBreakdown } from '../services/calculations';
import { StatusBadge } from './StatusBadge';
import { DuplicateSideBySideReview } from './DuplicateSideBySideReview';

interface DuplicateCleanerModalProps {
  isOpen: boolean;
  onClose: () => void;
  students: StudentPaymentRecord[];
  session: BursarSession;
  activeSchool?: SchoolProfile;
  onUpdateStudents: (updated: StudentPaymentRecord[], message?: string) => void;
}

export const DuplicateCleanerModal: React.FC<DuplicateCleanerModalProps> = ({
  isOpen,
  onClose,
  students,
  session,
  activeSchool,
  onUpdateStudents,
}) => {
  const [filterCriteria, setFilterCriteria] = useState<'all' | 'same_name_recommendations' | 'id' | 'name' | 'name_and_class'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPrimaryMap, setSelectedPrimaryMap] = useState<Record<string, string>>({});
  const [showIgnoredTab, setShowIgnoredTab] = useState(false);
  
  const schoolId = activeSchool?.id || session.schoolId || 'dominion-group';
  const currencySymbol = activeSchool?.currencySymbol || session.currencySymbol || '₦';

  // Ignored duplicate groups state persisted per school
  const [ignoredGroupIds, setIgnoredGroupIds] = useState<string[]>(() => {
    return getStoredIgnoredDuplicateIds(schoolId);
  });

  // Reload stored ignored duplicate IDs when school changes or modal opens
  useEffect(() => {
    if (isOpen) {
      const stored = getStoredIgnoredDuplicateIds(schoolId);
      setIgnoredGroupIds(stored);
    }
  }, [isOpen, schoolId]);

  // Processing state
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingGroupId, setProcessingGroupId] = useState<string | null>(null);
  
  // Bulk Verification Modal state
  const [showBulkConfirmModal, setShowBulkConfirmModal] = useState(false);
  const [bulkActionType, setBulkActionType] = useState<'merge' | 'keep_primary'>('merge');

  // Single Group Verification Modal state
  const [groupToVerify, setGroupToVerify] = useState<{
    group: DuplicateGroup;
    action: 'merge' | 'keep_primary';
    primaryId: string;
  } | null>(null);

  // Side-by-Side Review Modal state
  const [selectedGroupForReview, setSelectedGroupForReview] = useState<{
    group: DuplicateGroup;
    primaryId?: string;
  } | null>(null);

  const [actionError, setActionError] = useState<string | null>(null);
  const [toastFeedback, setToastFeedback] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastFeedback(msg);
    setTimeout(() => setToastFeedback(null), 3500);
  };

  // Detect active duplicate groups (excluding ignored ones)
  const duplicateGroups = useMemo(() => {
    return detectDuplicateGroups(students, filterCriteria, searchQuery, ignoredGroupIds);
  }, [students, filterCriteria, searchQuery, ignoredGroupIds]);

  // Detect all raw groups to compute ignored groups list and count
  const allRawGroups = useMemo(() => {
    return detectDuplicateGroups(students, 'all', '', []);
  }, [students]);

  const ignoredGroupsList = useMemo(() => {
    const ignoredSet = new Set(ignoredGroupIds);
    return allRawGroups.filter((g) => {
      const pairKey = `pair:${g.records.map((r) => r.id).sort().join(':::')}`;
      return ignoredSet.has(g.groupId) || ignoredSet.has(pairKey);
    });
  }, [allRawGroups, ignoredGroupIds]);

  // Total redundant records count
  const totalRedundantCount = useMemo(() => {
    return duplicateGroups.reduce((acc, g) => acc + (g.records.length - 1), 0);
  }, [duplicateGroups]);

  // Count recommended same-name matches
  const sameNameCount = useMemo(() => {
    return duplicateGroups.filter((g) => g.isRecommendedSameName).length;
  }, [duplicateGroups]);

  if (!isOpen) return null;

  const handleSelectPrimary = (groupId: string, recordId: string) => {
    setSelectedPrimaryMap((prev) => ({
      ...prev,
      [groupId]: recordId,
    }));
  };

  const getEffectivePrimaryId = (group: DuplicateGroup) => {
    return selectedPrimaryMap[group.groupId] || group.recommendedPrimaryId;
  };

  // Ignore a single duplicate group / pair
  const handleIgnoreGroup = (group: DuplicateGroup) => {
    const pairKey = `pair:${group.records.map((r) => r.id).sort().join(':::')}`;
    const nextIgnored = Array.from(new Set([...ignoredGroupIds, group.groupId, pairKey]));
    setIgnoredGroupIds(nextIgnored);
    saveStoredIgnoredDuplicateIds(nextIgnored, schoolId);
    showToast(`Ignored duplicate suggestion for "${group.displayTitle}".`);
  };

  // Unignore / Restore a single group
  const handleUnignoreGroup = (group: DuplicateGroup) => {
    const pairKey = `pair:${group.records.map((r) => r.id).sort().join(':::')}`;
    const nextIgnored = ignoredGroupIds.filter((id) => id !== group.groupId && id !== pairKey);
    setIgnoredGroupIds(nextIgnored);
    saveStoredIgnoredDuplicateIds(nextIgnored, schoolId);
    showToast(`Restored "${group.displayTitle}" to duplicate scan list.`);
  };

  // Clear all ignored
  const handleClearAllIgnored = () => {
    setIgnoredGroupIds([]);
    saveStoredIgnoredDuplicateIds([], schoolId);
    showToast('Reset all ignored duplicate suggestions.');
  };

  // Execute single group resolution
  const handleExecuteSingleResolution = async () => {
    if (!groupToVerify) return;

    const { group, action, primaryId } = groupToVerify;
    setIsProcessing(true);
    setProcessingGroupId(group.groupId);
    setActionError(null);

    try {
      const res = await resolveDuplicateGroup(
        group,
        primaryId,
        action,
        students,
        schoolId
      );

      const actionText = action === 'merge' ? 'merged and cleaned' : 'deduplicated';
      onUpdateStudents(
        res.updatedStudents,
        `Successfully ${actionText} duplicate records for ${group.displayTitle}.`
      );
      setGroupToVerify(null);
    } catch (e: any) {
      setActionError(`Failed to resolve duplicate group: ${e.message || e}`);
    } finally {
      setIsProcessing(false);
      setProcessingGroupId(null);
    }
  };

  // Execute bulk resolution
  const handleExecuteBulkResolution = async () => {
    if (duplicateGroups.length === 0) return;

    setIsProcessing(true);
    setActionError(null);
    try {
      const res = await bulkResolveDuplicates(
        duplicateGroups,
        bulkActionType,
        students,
        schoolId
      );

      onUpdateStudents(
        res.updatedStudents,
        `Resolved ${res.totalResolvedGroups} duplicate groups. Removed ${res.totalDeleted} redundant rows.`
      );
      setShowBulkConfirmModal(false);
      onClose();
    } catch (e: any) {
      setActionError(`Bulk deduplication encountered an issue: ${e.message || e}`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-xs animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-2xl bg-white rounded-t-[32px] sm:rounded-3xl max-h-[92dvh] sm:max-h-[90dvh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden animate-in slide-in-from-bottom duration-200">
        
        {/* Modal Header */}
        <div className="shrink-0 flex items-center justify-between px-5 py-4 sm:px-6 border-b border-slate-100 bg-white">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-rose-600 text-white flex items-center justify-center shadow-xs">
              <CopyCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">Duplicate Records Manager</h3>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                  totalRedundantCount > 0 ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                }`}>
                  {totalRedundantCount > 0 ? `${totalRedundantCount} Duplicates` : 'Clean Roster'}
                </span>
                {sameNameCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-100 text-amber-900 flex items-center gap-0.5">
                    <Sparkles className="w-2.5 h-2.5" />
                    {sameNameCount} Same Name
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 font-medium">
                Detect, recommend same name duplicates, review side-by-side, ignore, or 1-click merge
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            id="close-duplicate-modal-btn"
            className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center border border-slate-200 cursor-pointer active:scale-95 transition-all"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Toast Feedback Notification */}
        {toastFeedback && (
          <div className="shrink-0 mx-5 mt-3 p-3 bg-slate-900 text-white rounded-2xl text-xs font-bold flex items-center justify-between shadow-lg animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{toastFeedback}</span>
            </div>
            <button
              type="button"
              onClick={() => setToastFeedback(null)}
              className="text-slate-400 hover:text-white p-0.5 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Error Notification Banner */}
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

        {/* Filter Bar & Detection Criteria */}
        <div className="shrink-0 p-4 bg-slate-50/80 border-b border-slate-200/80 space-y-3">
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
            {/* Search filter */}
            <div className="relative flex-1 min-w-[180px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter by ID, student name, class, receipt..."
                className="w-full pl-9 pr-3 py-2 text-xs font-semibold bg-white rounded-xl border border-slate-200 text-slate-800 placeholder:text-slate-400 focus:ring-2 focus:ring-rose-500 focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Quick criteria filter pills */}
            <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 text-xs font-bold shrink-0 overflow-x-auto max-w-full">
              <button
                type="button"
                onClick={() => {
                  setShowIgnoredTab(false);
                  setFilterCriteria('all');
                }}
                className={`px-2.5 py-1 rounded-lg transition-all text-nowrap cursor-pointer ${
                  !showIgnoredTab && filterCriteria === 'all' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                All Match
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowIgnoredTab(false);
                  setFilterCriteria('same_name_recommendations');
                }}
                className={`px-2.5 py-1 rounded-lg transition-all text-nowrap flex items-center gap-1 cursor-pointer ${
                  !showIgnoredTab && filterCriteria === 'same_name_recommendations' ? 'bg-amber-600 text-white' : 'text-amber-800 hover:bg-amber-50'
                }`}
                title="Filter to recommended same name duplicates"
              >
                <Sparkles className="w-3 h-3" />
                <span>Same Name</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowIgnoredTab(false);
                  setFilterCriteria('id');
                }}
                className={`px-2.5 py-1 rounded-lg transition-all text-nowrap cursor-pointer ${
                  !showIgnoredTab && filterCriteria === 'id' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                By ID
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowIgnoredTab(false);
                  setFilterCriteria('name_and_class');
                }}
                className={`px-2.5 py-1 rounded-lg transition-all text-nowrap cursor-pointer ${
                  !showIgnoredTab && filterCriteria === 'name_and_class' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Name & Class
              </button>

              {/* Ignored Tab Pill */}
              <button
                type="button"
                onClick={() => setShowIgnoredTab(true)}
                className={`px-2.5 py-1 rounded-lg transition-all text-nowrap flex items-center gap-1 cursor-pointer ${
                  showIgnoredTab ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                }`}
                title="View ignored duplicate suggestions"
              >
                <EyeOff className="w-3 h-3" />
                <span>Ignored ({ignoredGroupsList.length})</span>
              </button>
            </div>
          </div>

          {/* Quick Summary Banner */}
          {!showIgnoredTab ? (
            <div className="flex items-center justify-between text-xs font-medium text-slate-600 px-1 flex-wrap gap-2">
              <span>
                Found <strong className="text-slate-900">{duplicateGroups.length}</strong> duplicate groups ({totalRedundantCount} redundant records)
              </span>
              {duplicateGroups.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setBulkActionType('merge');
                    setShowBulkConfirmModal(true);
                  }}
                  className="text-rose-600 hover:text-rose-700 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Verify & Clean All ({duplicateGroups.length})</span>
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between text-xs font-medium text-slate-600 px-1">
              <span>
                Showing <strong className="text-slate-900">{ignoredGroupsList.length}</strong> ignored duplicate suggestions (Hidden from active duplicate scan)
              </span>
              {ignoredGroupsList.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAllIgnored}
                  className="text-amber-700 hover:text-amber-800 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>Restore All Ignored</span>
                </button>
              )}
            </div>
          )}
        </div>

        {/* Scrollable Groups Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 min-h-0 bg-slate-100/50">
          {showIgnoredTab ? (
            /* Ignored Records View */
            ignoredGroupsList.length === 0 ? (
              <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center space-y-3 shadow-xs">
                <div className="w-14 h-14 bg-slate-50 text-slate-400 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
                  <EyeOff className="w-7 h-7" />
                </div>
                <div>
                  <h4 className="text-base font-black text-slate-900">No Ignored Suggestions</h4>
                  <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 leading-relaxed">
                    You haven&apos;t ignored any duplicate student pairs yet. When you click &quot;Ignore&quot; on a group, it will appear here.
                  </p>
                </div>
              </div>
            ) : (
              ignoredGroupsList.map((group, idx) => (
                <div
                  key={group.groupId}
                  className="bg-white rounded-3xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-3"
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black text-slate-400">#{idx + 1}</span>
                        <h4 className="text-sm font-black text-slate-900">{group.displayTitle}</h4>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                          Ignored / Distinct
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {group.records.length} students in group ({group.records.map((r) => `#${r.id} ${r.class}`).join(' • ')})
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
                </div>
              ))
            )
          ) : duplicateGroups.length === 0 ? (
            <div className="bg-white rounded-3xl border border-slate-200 p-8 text-center space-y-3 shadow-xs">
              <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h4 className="text-base font-black text-slate-900">No Duplicate Records Found</h4>
                <p className="text-xs text-slate-500 max-w-sm mx-auto mt-1 leading-relaxed">
                  Your student roster in <strong>{activeSchool?.name || session.schoolName}</strong> is clean! Every student has a distinct ID and name.
                </p>
                {ignoredGroupsList.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowIgnoredTab(true)}
                    className="mt-3 text-xs font-bold text-slate-600 hover:text-slate-900 underline inline-flex items-center gap-1 cursor-pointer"
                  >
                    <EyeOff className="w-3.5 h-3.5" />
                    <span>View {ignoredGroupsList.length} ignored duplicate suggestions</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            duplicateGroups.map((group, groupIdx) => {
              const primaryId = getEffectivePrimaryId(group);
              const isItemProcessing = isProcessing && processingGroupId === group.groupId;

              return (
                <div
                  key={group.groupId}
                  className="bg-white rounded-3xl border border-slate-200/90 shadow-xs overflow-hidden transition-all"
                >
                  {/* Group Header */}
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-lg bg-rose-100 text-rose-800 text-xs font-black flex items-center justify-center shrink-0">
                        #{groupIdx + 1}
                      </span>
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <h4 className="text-xs sm:text-sm font-black text-slate-900 truncate max-w-[200px] sm:max-w-md">
                            {group.displayTitle}
                          </h4>
                          {group.isRecommendedSameName && (
                            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300 text-[9px] font-black uppercase flex items-center gap-0.5 shadow-2xs">
                              <Sparkles className="w-2.5 h-2.5 text-amber-600" />
                              Recommended Same Name Match
                            </span>
                          )}
                        </div>

                        {/* Recommendation Note */}
                        {group.recommendationNote && (
                          <p className="text-[10px] text-amber-800 font-semibold mt-0.5">
                            {group.recommendationNote}
                          </p>
                        )}

                        <div className="flex items-center gap-2 text-[10px] text-slate-500 font-medium mt-0.5">
                          <span>{group.records.length} duplicate entries</span>
                          {group.conflictDetails.hasDifferentPayments && (
                            <span className="text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded font-bold">
                              Payment Conflict Detected
                            </span>
                          )}
                          {group.conflictDetails.hasDifferentClasses && (
                            <span className="text-purple-700 bg-purple-50 px-1.5 py-0.2 rounded font-bold">
                              Class Mismatch: {group.conflictDetails.classesList.join(' vs ')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Group Quick Action Buttons */}
                    <div className="flex items-center gap-1.5 flex-wrap sm:flex-nowrap">
                      {/* Ignore button */}
                      <button
                        type="button"
                        onClick={() => handleIgnoreGroup(group)}
                        disabled={isProcessing}
                        className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-amber-50 text-slate-600 hover:text-amber-800 text-[11px] font-bold border border-slate-200 flex items-center gap-1 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                        title="Ignore this duplicate suggestion (distinct students / twins)"
                      >
                        <EyeOff className="w-3.5 h-3.5 text-amber-600" />
                        <span>Ignore</span>
                      </button>

                      {/* Side by side review */}
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedGroupForReview({
                            group,
                            primaryId,
                          });
                        }}
                        disabled={isProcessing}
                        className="px-2.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-bold border border-indigo-200 flex items-center gap-1 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                        title="Open full side-by-side details comparison before merging"
                      >
                        <ArrowLeftRight className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Review</span>
                      </button>

                      {/* Merge & Keep */}
                      <button
                        type="button"
                        onClick={() => {
                          setGroupToVerify({
                            group,
                            action: 'merge',
                            primaryId,
                          });
                        }}
                        disabled={isProcessing}
                        className="px-2.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold flex items-center gap-1 shadow-xs transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                      >
                        <GitMerge className="w-3.5 h-3.5" />
                        <span>Merge</span>
                      </button>

                      {/* Remove copies */}
                      <button
                        type="button"
                        onClick={() => {
                          setGroupToVerify({
                            group,
                            action: 'keep_primary',
                            primaryId,
                          });
                        }}
                        disabled={isProcessing}
                        className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-700 text-[11px] font-bold border border-slate-200 flex items-center gap-1 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>

                  {/* Duplicate Records List within Group */}
                  <div className="p-3 sm:p-4 space-y-2.5">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 px-1">
                      Select Primary Record to Preserve / Consolidate Payments Into:
                    </p>

                    <div className="space-y-2">
                      {group.records.map((rec, recIdx) => {
                        const isSelectedPrimary = rec.id === primaryId;
                        const isRecommended = rec.id === group.recommendedPrimaryId;
                        const b = deriveFeeBreakdown(rec);
                        const totalPaidAll = (b.tuitionPaid || 0) + (b.admissionPaid || 0) + (b.lessonPaid || 0) + (b.examPaid || 0);

                        return (
                          <div
                            key={rec.id + '-' + recIdx}
                            onClick={() => handleSelectPrimary(group.groupId, rec.id)}
                            className={`p-3 rounded-2xl border transition-all cursor-pointer relative ${
                              isSelectedPrimary
                                ? 'bg-blue-50/60 border-blue-400 ring-2 ring-blue-400/20'
                                : 'bg-white border-slate-200 hover:border-slate-300'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <input
                                  type="radio"
                                  name={`primary-${group.groupId}`}
                                  checked={isSelectedPrimary}
                                  onChange={() => handleSelectPrimary(group.groupId, rec.id)}
                                  className="w-4 h-4 text-blue-600 focus:ring-blue-500 cursor-pointer mt-0.5"
                                />
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-mono font-bold text-xs text-blue-700">
                                      #{rec.id}
                                    </span>
                                    <span className="font-black text-slate-900 text-xs truncate">
                                      {rec.full_name}
                                    </span>
                                    <span className="px-2 py-0.2 rounded-full bg-slate-100 text-slate-700 text-[10px] font-bold">
                                      {rec.class}
                                    </span>
                                    {isRecommended && (
                                      <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 text-[9px] font-black uppercase flex items-center gap-0.5">
                                        <Sparkles className="w-2.5 h-2.5 text-amber-600" />
                                        Recommended Primary
                                      </span>
                                    )}
                                    {isSelectedPrimary && (
                                      <span className="px-1.5 py-0.2 rounded bg-blue-600 text-white text-[9px] font-black uppercase">
                                        Primary (Keep)
                                      </span>
                                    )}
                                  </div>

                                  <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-3 flex-wrap">
                                    <span>Term: <strong>{rec.term}</strong> ({rec.session})</span>
                                    {rec.receipt_no && <span>Receipt: <strong className="font-mono">{rec.receipt_no}</strong></span>}
                                    {rec.payment_date && <span>Date: <strong>{rec.payment_date}</strong></span>}
                                  </div>
                                </div>
                              </div>

                              <div className="text-right shrink-0">
                                <div className="text-xs font-black text-slate-900">
                                  Paid: <span className="text-emerald-700">{formatCurrency(totalPaidAll, currencySymbol)}</span>
                                </div>
                                <div className="text-[10px] font-semibold text-slate-500">
                                  Balance: {formatCurrency(rec.balance, currencySymbol)}
                                </div>
                                <div className="mt-1">
                                  <StatusBadge status={rec.status} size="sm" />
                                </div>
                              </div>
                            </div>

                            {/* Fee Breakdown row */}
                            <div className="mt-2 pt-2 border-t border-slate-100 grid grid-cols-4 gap-1 text-[10px] text-center text-slate-600">
                              <div className="bg-slate-50 p-1 rounded-lg">
                                <span className="text-slate-400 block text-[8px] font-bold uppercase">Tuition</span>
                                <span className="font-bold text-slate-800">{formatCurrency(b.tuitionPaid, currencySymbol)}</span>
                              </div>
                              <div className="bg-slate-50 p-1 rounded-lg">
                                <span className="text-slate-400 block text-[8px] font-bold uppercase">Admission</span>
                                <span className="font-bold text-slate-800">{formatCurrency(b.admissionPaid, currencySymbol)}</span>
                              </div>
                              <div className="bg-slate-50 p-1 rounded-lg">
                                <span className="text-slate-400 block text-[8px] font-bold uppercase">Lesson</span>
                                <span className="font-bold text-slate-800">{formatCurrency(b.lessonPaid, currencySymbol)}</span>
                              </div>
                              <div className="bg-slate-50 p-1 rounded-lg">
                                <span className="text-slate-400 block text-[8px] font-bold uppercase">Exam</span>
                                <span className="font-bold text-slate-800">{formatCurrency(b.examPaid, currencySymbol)}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Actions */}
        <div className="shrink-0 p-4 bg-white border-t border-slate-200 flex items-center justify-between gap-3 pb-6 sm:pb-4">
          <button
            type="button"
            onClick={onClose}
            className="py-3 px-4 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold border border-slate-200 transition-all cursor-pointer"
          >
            Close
          </button>

          {!showIgnoredTab && duplicateGroups.length > 0 && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setBulkActionType('merge');
                  setShowBulkConfirmModal(true);
                }}
                disabled={isProcessing}
                className="py-3 px-4 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-black shadow-md shadow-blue-500/20 flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
              >
                <GitMerge className="w-4 h-4" />
                <span>Merge All ({duplicateGroups.length})</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setBulkActionType('keep_primary');
                  setShowBulkConfirmModal(true);
                }}
                disabled={isProcessing}
                className="py-3 px-4 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black shadow-md shadow-rose-500/20 flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
              >
                <Trash2 className="w-4 h-4" />
                <span>Remove Redundant Copies</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Verification Modal for Single Group */}
      {groupToVerify && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150 p-5 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className={`w-9 h-9 rounded-2xl flex items-center justify-center shadow-xs ${
                groupToVerify.action === 'merge' ? 'bg-blue-600 text-white' : 'bg-rose-600 text-white'
              }`}>
                {groupToVerify.action === 'merge' ? <GitMerge className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
              </div>
              <div>
                <h4 className="text-sm font-black text-slate-900 uppercase">
                  {groupToVerify.action === 'merge' ? 'Confirm Record Merge' : 'Confirm Duplicate Deletion'}
                </h4>
                <p className="text-[11px] text-slate-500 font-medium">Review ledger impact before confirming</p>
              </div>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Target Student:</span>
                <strong className="text-slate-900">{groupToVerify.group.displayTitle}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Preserved Primary ID:</span>
                <strong className="text-blue-700 font-mono">#{groupToVerify.primaryId}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Redundant Rows to Delete:</span>
                <strong className="text-rose-700">{groupToVerify.group.records.length - 1} records</strong>
              </div>
              {groupToVerify.action === 'merge' ? (
                <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl text-[11px] text-blue-900 leading-snug">
                  All fee payments across the {groupToVerify.group.records.length} duplicate rows will be combined into student <strong>#{groupToVerify.primaryId}</strong>.
                </div>
              ) : (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-xl text-[11px] text-rose-900 leading-snug">
                  The {groupToVerify.group.records.length - 1} duplicate rows will be removed. Only primary record <strong>#{groupToVerify.primaryId}</strong> will be kept.
                </div>
              )}
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setGroupToVerify(null)}
                className="flex-1 py-2.5 px-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold border border-slate-200"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteSingleResolution}
                disabled={isProcessing}
                className={`flex-1 py-2.5 px-3 rounded-2xl text-white text-xs font-black shadow-md flex items-center justify-center gap-1.5 ${
                  groupToVerify.action === 'merge' ? 'bg-blue-600 hover:bg-blue-700 shadow-blue-500/20' : 'bg-rose-600 hover:bg-rose-700 shadow-rose-500/20'
                }`}
              >
                {isProcessing ? <span>Processing...</span> : <span>Confirm & Apply</span>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Verification Modal for Bulk Clean All */}
      {showBulkConfirmModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-150 p-5 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl bg-rose-600 text-white flex items-center justify-center shadow-xs">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-base font-black text-slate-900 uppercase">
                  Verify Bulk Deduplication
                </h4>
                <p className="text-[11px] text-slate-500 font-medium">Please review the batch operation details</p>
              </div>
            </div>

            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs space-y-2.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Duplicate Groups:</span>
                <strong className="text-slate-900">{duplicateGroups.length} groups</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total Rows to Remove:</span>
                <strong className="text-rose-700 font-bold">{totalRedundantCount} duplicate rows</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Action Type:</span>
                <strong className="text-blue-700 uppercase">{bulkActionType === 'merge' ? 'Merge Payments & Clean' : 'Preserve Primary & Delete Copies'}</strong>
              </div>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900 space-y-1">
                <p className="font-bold">Summary of changes:</p>
                <ul className="list-disc pl-4 space-y-0.5 text-[10.5px]">
                  <li>Recommended primary record in each group will be preserved.</li>
                  {bulkActionType === 'merge' ? (
                    <li>Payments from duplicate records will be merged safely into primary records.</li>
                  ) : (
                    <li>Redundant duplicate rows will be deleted from your roster and synced with Google Sheets.</li>
                  )}
                </ul>
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowBulkConfirmModal(false)}
                className="flex-1 py-3 px-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold border border-slate-200 cursor-pointer"
              >
                Cancel / Go Back
              </button>
              <button
                type="button"
                onClick={handleExecuteBulkResolution}
                disabled={isProcessing}
                className="flex-1 py-3 px-3 rounded-2xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-black shadow-md shadow-rose-500/25 flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
              >
                {isProcessing ? (
                  <span className="flex items-center gap-1.5">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Cleaning...</span>
                  </span>
                ) : (
                  <span>Yes, Clean {totalRedundantCount} Records</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Side-by-Side Review Sub-Modal */}
      {selectedGroupForReview && (
        <DuplicateSideBySideReview
          group={selectedGroupForReview.group}
          initialPrimaryId={selectedGroupForReview.primaryId}
          students={students}
          session={session}
          activeSchool={activeSchool}
          onClose={() => setSelectedGroupForReview(null)}
          onSuccess={(updatedStudents, msg) => {
            setSelectedGroupForReview(null);
            onUpdateStudents(updatedStudents, msg);
          }}
          onIgnore={handleIgnoreGroup}
        />
      )}

    </div>
  );
};
