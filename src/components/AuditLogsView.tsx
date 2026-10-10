/**
 * System Audit & Activity Logs Component
 * Displays undeletable, chronological audit trails of all activities across Dominion Group Of Schools Bursary System
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  Shield,
  Search,
  Filter,
  Download,
  FileText,
  Clock,
  User,
  CheckCircle2,
  AlertTriangle,
  Info,
  Layers,
  Sparkles,
  ArrowUpDown,
  RefreshCw,
  Eye,
  FileSpreadsheet,
  Cloud,
  Check
} from 'lucide-react';
import {
  getStoredAuditLogs,
  saveStoredAuditLogs,
  mergeAuditLogs,
  exportAuditLogsCSV,
  exportAuditLogsJSON,
  AuditLogEntry,
  AuditActionCategory,
  AuditActionSeverity
} from '../services/auditLoggerService';
import {
  subscribeAuditLogsFromFirestore,
  getAuditLogsFromFirestore,
  saveAuditLogToFirestore
} from '../services/firebase';
import { BursarSession } from '../types';

interface AuditLogsViewProps {
  session?: BursarSession;
  schoolId?: string;
}

export const AuditLogsView: React.FC<AuditLogsViewProps> = ({ session, schoolId }) => {
  const isAdmin = session ? session.role === 'admin' : true;
  const targetSchoolId = schoolId || session?.schoolId || 'dominion-group';

  if (session && !isAdmin) {
    return (
      <div className="p-8 rounded-3xl bg-white border border-slate-200 text-center space-y-4 max-w-lg mx-auto shadow-xs my-6">
        <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-700 flex items-center justify-center mx-auto border border-indigo-200">
          <Shield className="w-6 h-6" />
        </div>
        <div className="space-y-2">
          <span className="inline-block px-3 py-1 rounded-full bg-indigo-100 text-indigo-800 text-[10px] font-black uppercase tracking-wider">
            Administrator Power Required
          </span>
          <h3 className="text-base font-bold text-slate-900">Activity Logs & Audit Trails</h3>
          <p className="text-xs text-slate-600 leading-relaxed max-w-md mx-auto">
            Audit logs and system activity trails are restricted strictly to the <strong>School Administrator (Proprietor)</strong>. Bursars do not have access to view or export system logs.
          </p>
        </div>
      </div>
    );
  }

  const [logs, setLogs] = useState<AuditLogEntry[]>(() => getStoredAuditLogs());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('ALL');
  const [selectedLogForDetails, setSelectedLogForDetails] = useState<AuditLogEntry | null>(null);
  const [isCloudSyncing, setIsCloudSyncing] = useState(false);
  const [isCloudLive, setIsCloudLive] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  // Synchronize with Cloud Firestore in real time
  useEffect(() => {
    let isMounted = true;

    // 1. Subscribe to live Firestore stream
    const unsubscribe = subscribeAuditLogsFromFirestore(
      targetSchoolId,
      (cloudLogs) => {
        if (!isMounted) return;
        setLogs((currentLogs) => {
          const merged = mergeAuditLogs(currentLogs, cloudLogs);
          saveStoredAuditLogs(merged);
          return merged;
        });
        setIsCloudLive(true);
        setLastSyncedAt(new Date());
      },
      200
    );

    // 2. Perform initial reconciliation: pull latest cloud logs and push any missing local logs
    const reconcileLogs = async () => {
      setIsCloudSyncing(true);
      try {
        const cloudLogs = await getAuditLogsFromFirestore(targetSchoolId, 200);
        if (!isMounted) return;

        const localLogs = getStoredAuditLogs();
        const merged = mergeAuditLogs(localLogs, cloudLogs);
        setLogs(merged);
        saveStoredAuditLogs(merged);

        // Upload any local logs that are not present in Firestore
        const cloudIdSet = new Set(cloudLogs.map((c) => c.id));
        const unsyncedLocalLogs = localLogs.filter((l) => !cloudIdSet.has(l.id));
        if (unsyncedLocalLogs.length > 0) {
          for (const unsynced of unsyncedLocalLogs) {
            await saveAuditLogToFirestore(unsynced, targetSchoolId);
          }
        }
        setIsCloudLive(true);
        setLastSyncedAt(new Date());
      } catch (err) {
        console.warn('[Audit Sync Reconcile Error]:', err);
      } finally {
        if (isMounted) setIsCloudSyncing(false);
      }
    };

    reconcileLogs();

    return () => {
      isMounted = false;
      if (unsubscribe) unsubscribe();
    };
  }, [targetSchoolId]);

  const refreshLogs = async () => {
    setIsCloudSyncing(true);
    try {
      const cloudLogs = await getAuditLogsFromFirestore(targetSchoolId, 200);
      const localLogs = getStoredAuditLogs();
      const merged = mergeAuditLogs(localLogs, cloudLogs);
      setLogs(merged);
      saveStoredAuditLogs(merged);
      setIsCloudLive(true);
      setLastSyncedAt(new Date());
    } catch (err) {
      console.warn('[Audit Sync Manual Error]:', err);
      setLogs(getStoredAuditLogs());
    } finally {
      setIsCloudSyncing(false);
    }
  };

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // Category filter
      if (selectedCategory !== 'ALL' && log.category !== selectedCategory) {
        return false;
      }
      // Severity filter
      if (selectedSeverity !== 'ALL' && log.severity !== selectedSeverity) {
        return false;
      }
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const inAction = log.action.toLowerCase().includes(q);
        const inDesc = log.description.toLowerCase().includes(q);
        const inPerformer = (log.performer || '').toLowerCase().includes(q);
        const inTime = log.readableTime.toLowerCase().includes(q);
        const inDetails = JSON.stringify(log.details || {}).toLowerCase().includes(q);
        return inAction || inDesc || inPerformer || inTime || inDetails;
      }
      return true;
    });
  }, [logs, selectedCategory, selectedSeverity, searchQuery]);

  const stats = useMemo(() => {
    const total = logs.length;
    const payments = logs.filter((l) => l.category === 'PAYMENT').length;
    const payroll = logs.filter((l) => l.category === 'PAYROLL').length;
    const remittances = logs.filter((l) => l.category === 'REMITTANCE').length;
    const expenses = logs.filter((l) => l.category === 'EXPENSE').length;
    return { total, payments, payroll, remittances, expenses };
  }, [logs]);

  const getSeverityBadge = (severity: AuditActionSeverity) => {
    switch (severity) {
      case 'CRITICAL':
        return (
          <span className="px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 font-bold text-[10px] uppercase tracking-wider flex items-center gap-1 border border-rose-200">
            <AlertTriangle className="w-3 h-3" />
            <span>Critical</span>
          </span>
        );
      case 'WARNING':
        return (
          <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 font-bold text-[10px] uppercase tracking-wider flex items-center gap-1 border border-amber-200">
            <AlertTriangle className="w-3 h-3" />
            <span>Warning</span>
          </span>
        );
      case 'SUCCESS':
        return (
          <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold text-[10px] uppercase tracking-wider flex items-center gap-1 border border-emerald-200">
            <CheckCircle2 className="w-3 h-3" />
            <span>Success</span>
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-bold text-[10px] uppercase tracking-wider flex items-center gap-1 border border-slate-200">
            <Info className="w-3 h-3 text-slate-500" />
            <span>Info</span>
          </span>
        );
    }
  };

  const getCategoryBadge = (category: AuditActionCategory) => {
    switch (category) {
      case 'PAYMENT':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'PAYROLL':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200';
      case 'REMITTANCE':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'EXPENSE':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'STUDENT':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'ROLLOVER':
      case 'SNAPSHOT':
        return 'bg-teal-50 text-teal-700 border-teal-200';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="space-y-4">
      {/* Header Info Banner */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 text-white border border-slate-800 shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-300 flex items-center justify-center border border-indigo-400/30">
                <Shield className="w-4 h-4" />
              </div>
              <h3 className="text-sm sm:text-base font-black tracking-tight uppercase">
                System Audit & Immutable Activity Tracker
              </h3>
              {/* Cloud Sync Status Indicator */}
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-[10px] font-bold">
                <span className={`w-2 h-2 rounded-full ${isCloudLive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-400'}`} />
                <Cloud className="w-3 h-3" />
                <span>{isCloudSyncing ? 'Syncing with Firestore...' : isCloudLive ? 'Firestore Live Sync' : 'Connecting to Cloud...'}</span>
              </div>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed max-w-xl">
              Automatic, tamper-evident recording of every financial transaction, student update, payroll disbursal, remittance, and system action. Synchronized across all bursar devices via Cloud Firestore.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-center flex-wrap">
            <button
              type="button"
              onClick={refreshLogs}
              disabled={isCloudSyncing}
              className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xs font-bold flex items-center gap-1.5 transition-colors border border-white/10 cursor-pointer disabled:opacity-50"
              title="Synchronize and refresh log entries from Cloud Firestore"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isCloudSyncing ? 'animate-spin text-indigo-300' : ''}`} />
              <span>{isCloudSyncing ? 'Syncing...' : 'Sync Cloud'}</span>
            </button>
            <button
              type="button"
              onClick={exportAuditLogsCSV}
              className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
            <button
              type="button"
              onClick={exportAuditLogsJSON}
              className="px-3 py-1.5 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold flex items-center gap-1.5 transition-colors border border-slate-600 cursor-pointer"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>JSON Backup</span>
            </button>
          </div>
        </div>

        {/* Quick Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-4 pt-3 border-t border-slate-700/60">
          <div className="p-2 rounded-xl bg-white/5 border border-white/5 text-center">
            <span className="text-[10px] text-slate-400 uppercase font-semibold">Total Logs</span>
            <div className="text-sm font-black text-white">{stats.total}</div>
          </div>
          <div className="p-2 rounded-xl bg-white/5 border border-white/5 text-center">
            <span className="text-[10px] text-emerald-300 uppercase font-semibold">Fee Payments</span>
            <div className="text-sm font-black text-emerald-400">{stats.payments}</div>
          </div>
          <div className="p-2 rounded-xl bg-white/5 border border-white/5 text-center">
            <span className="text-[10px] text-indigo-300 uppercase font-semibold">Payroll Actions</span>
            <div className="text-sm font-black text-indigo-400">{stats.payroll}</div>
          </div>
          <div className="p-2 rounded-xl bg-white/5 border border-white/5 text-center">
            <span className="text-[10px] text-amber-300 uppercase font-semibold">Remittances</span>
            <div className="text-sm font-black text-amber-400">{stats.remittances}</div>
          </div>
          <div className="p-2 rounded-xl bg-white/5 border border-white/5 text-center col-span-2 sm:col-span-1">
            <span className="text-[10px] text-purple-300 uppercase font-semibold">Expenses</span>
            <div className="text-sm font-black text-purple-400">{stats.expenses}</div>
          </div>
        </div>
      </div>

      {/* Controls & Search */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by action, description, student, staff, or performer..."
            className="w-full pl-9 pr-4 py-2.5 text-xs bg-white border border-slate-200 rounded-xl font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-slate-600 font-bold"
            >
              Clear
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {/* Category Filter */}
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
          >
            <option value="ALL">All Categories</option>
            <option value="PAYMENT">Fee Payments</option>
            <option value="PAYROLL">Payroll & Salaries</option>
            <option value="REMITTANCE">Remittances</option>
            <option value="EXPENSE">Operating Expenses</option>
            <option value="STUDENT">Student Roster</option>
            <option value="ROLLOVER">Term Rollover</option>
            <option value="SNAPSHOT">End-Term Snapshot</option>
            <option value="SETTINGS">Settings & Config</option>
            <option value="SYSTEM">System & Backup</option>
          </select>

          {/* Severity Filter */}
          <select
            value={selectedSeverity}
            onChange={(e) => setSelectedSeverity(e.target.value)}
            className="px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
          >
            <option value="ALL">All Severities</option>
            <option value="INFO">Info</option>
            <option value="SUCCESS">Success</option>
            <option value="WARNING">Warning</option>
            <option value="CRITICAL">Critical</option>
          </select>
        </div>
      </div>

      {/* Log Entries Table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs font-bold text-slate-600 uppercase tracking-wide">
          <span>Audit Log Entries ({filteredLogs.length})</span>
          <span className="text-[11px] normal-case font-medium text-slate-500">
            Immutable Chronological Record
          </span>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <Shield className="w-10 h-10 text-slate-300 mx-auto" />
            <h4 className="text-xs font-bold text-slate-700">No activity log entries found</h4>
            <p className="text-[11px] text-slate-400">
              {searchQuery || selectedCategory !== 'ALL' || selectedSeverity !== 'ALL'
                ? 'Try adjusting your search filters.'
                : 'Activities across the school will automatically appear here.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 max-h-[550px] overflow-y-auto">
            {filteredLogs.map((log) => (
              <div
                key={log.id}
                onClick={() => setSelectedLogForDetails(log)}
                className="p-3.5 sm:px-4 hover:bg-slate-50/80 transition-colors flex items-start justify-between gap-3 cursor-pointer group"
              >
                {/* Left info */}
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${getCategoryBadge(
                        log.category
                      )}`}
                    >
                      {log.category}
                    </span>
                    <span className="text-xs font-mono font-bold text-slate-800">
                      {log.action}
                    </span>
                    {getSeverityBadge(log.severity)}
                  </div>

                  <p className="text-xs text-slate-700 font-medium leading-relaxed line-clamp-2">
                    {log.description}
                  </p>

                  <div className="flex items-center gap-3 text-[11px] text-slate-400 font-medium flex-wrap">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span>{log.readableTime}</span>
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3 text-slate-400" />
                      <span>By: <strong>{log.performer}</strong></span>
                    </span>
                    {log.schoolId && (
                      <>
                        <span>•</span>
                        <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                          {log.schoolId}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Right button */}
                <div className="shrink-0 pt-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedLogForDetails(log);
                    }}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors cursor-pointer"
                    title="View payload details"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Details Modal */}
      {selectedLogForDetails && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="bg-white rounded-3xl max-w-lg w-full p-5 space-y-4 shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-slate-900 text-white flex items-center justify-center">
                  <Shield className="w-4 h-4 text-indigo-400" />
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase text-slate-900">
                    Audit Log Entry Detail
                  </h3>
                  <p className="text-[10px] text-slate-400 font-mono">
                    {selectedLogForDetails.id}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLogForDetails(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Category:</span>
                  <div className="font-bold text-slate-800">{selectedLogForDetails.category}</div>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Action:</span>
                  <div className="font-mono font-bold text-slate-800">{selectedLogForDetails.action}</div>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Performer:</span>
                  <div className="font-semibold text-slate-700">{selectedLogForDetails.performer}</div>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Timestamp:</span>
                  <div className="text-slate-600 text-[11px]">{selectedLogForDetails.readableTime}</div>
                </div>
              </div>

              <div>
                <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                  Description:
                </span>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-slate-800 font-medium">
                  {selectedLogForDetails.description}
                </div>
              </div>

              {selectedLogForDetails.details && Object.keys(selectedLogForDetails.details).length > 0 && (
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                    Payload Metadata:
                  </span>
                  <pre className="p-3 rounded-xl bg-slate-900 text-indigo-300 font-mono text-[10px] overflow-x-auto max-h-48">
                    {JSON.stringify(selectedLogForDetails.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setSelectedLogForDetails(null)}
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
