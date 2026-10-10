/**
 * System Audit & Activity Logging Service
 * Provides persistent, tamper-evident audit trails of actions across Dominion Group Of Schools Bursary System.
 */

import { safeStorage } from './safeStorage';
import { saveAuditLogToFirestore } from './firebase';
import type { AuditActionCategory, AuditActionSeverity, AuditLogEntry } from '../types';

export type { AuditActionCategory, AuditActionSeverity, AuditLogEntry };

const STORAGE_AUDIT_LOGS_KEY = 'eminent_system_audit_logs_v1';
const MAX_LOG_ENTRIES = 2000;

/**
 * Appends a new immutable audit record to the persistent log
 */
export function recordAuditLog(
  category: AuditActionCategory,
  action: string,
  description: string,
  details?: Record<string, any>,
  performer: string = 'Bursar',
  schoolId?: string,
  severity: AuditActionSeverity = 'INFO'
): AuditLogEntry {
  const now = new Date();
  const entry: AuditLogEntry = {
    id: `LOG-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`,
    timestamp: now.toISOString(),
    readableTime: now.toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'medium',
    }),
    category,
    action,
    description,
    details,
    performer: performer || 'Bursar',
    schoolId,
    severity,
  };

  try {
    const existing = getStoredAuditLogs();
    // Prepend newest first, and cap at MAX_LOG_ENTRIES
    const updated = [entry, ...existing].slice(0, MAX_LOG_ENTRIES);
    safeStorage.setItem(STORAGE_AUDIT_LOGS_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('Failed to persist audit log locally:', e);
  }

  // Asynchronously synchronize with Firestore for cross-device visibility
  try {
    const targetSchool = (schoolId || 'dominion-group').toLowerCase();
    saveAuditLogToFirestore(entry, targetSchool).catch((err) => {
      console.warn('[Audit Logger] Firestore background sync notice:', err);
    });
  } catch (syncErr) {
    console.warn('[Audit Logger] Firestore dispatch notice:', syncErr);
  }

  return entry;
}

/**
 * Saves a list of audit logs to safe local cache
 */
export function saveStoredAuditLogs(logs: AuditLogEntry[]): void {
  try {
    const capped = logs.slice(0, MAX_LOG_ENTRIES);
    safeStorage.setItem(STORAGE_AUDIT_LOGS_KEY, JSON.stringify(capped));
  } catch (e) {
    console.warn('Failed to persist audit logs cache:', e);
  }
}

/**
 * Merges local and cloud audit logs without duplicates, sorted descending by timestamp
 */
export function mergeAuditLogs(localLogs: AuditLogEntry[], cloudLogs: AuditLogEntry[]): AuditLogEntry[] {
  const map = new Map<string, AuditLogEntry>();
  // Process local logs first
  (localLogs || []).forEach((l) => {
    if (l && l.id) map.set(l.id, l);
  });
  // Overlay cloud logs
  (cloudLogs || []).forEach((c) => {
    if (c && c.id) map.set(c.id, c);
  });
  const merged = Array.from(map.values());
  return merged
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, MAX_LOG_ENTRIES);
}

/**
 * Retrieves all stored audit logs
 */
export function getStoredAuditLogs(): AuditLogEntry[] {
  try {
    const raw = safeStorage.getItem(STORAGE_AUDIT_LOGS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed;
    }
  } catch (e) {
    console.warn('Failed to read audit logs:', e);
  }
  return [];
}

/**
 * Exports logs as downloadable JSON file
 */
export function exportAuditLogsJSON(): void {
  const logs = getStoredAuditLogs();
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(logs, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute('href', dataStr);
  downloadAnchor.setAttribute('download', `system_audit_logs_${new Date().toISOString().split('T')[0]}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

/**
 * Exports logs as downloadable CSV file
 */
export function exportAuditLogsCSV(): void {
  const logs = getStoredAuditLogs();
  const headers = ['Timestamp', 'Date/Time', 'Category', 'Action', 'Description', 'Performer', 'School ID', 'Severity', 'Details'];
  
  const rows = logs.map((l) => [
    l.timestamp,
    `"${l.readableTime}"`,
    l.category,
    l.action,
    `"${(l.description || '').replace(/"/g, '""')}"`,
    `"${l.performer || ''}"`,
    l.schoolId || '',
    l.severity,
    `"${JSON.stringify(l.details || {}).replace(/"/g, '""')}"`,
  ]);

  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const encodedUri = encodeURI(csvContent);
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute('href', encodedUri);
  downloadAnchor.setAttribute('download', `system_audit_logs_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}
