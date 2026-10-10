/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { safeStorage } from './safeStorage';

/**
 * Records saved on this device that the database has not confirmed yet.
 * They are kept when cloud data is loaded, so nothing saved offline is lost.
 */
export type PendingKind = 'expense' | 'income' | 'staff' | 'payroll';

const pendingKey = (kind: PendingKind, schoolId: string) =>
  `bursar_pending_sync_${kind}_${(schoolId || 'dominion-group').toLowerCase()}`;

export function getPendingSyncIds(kind: PendingKind, schoolId: string = 'dominion-group'): string[] {
  try {
    const raw = safeStorage.getItem(pendingKey(kind, schoolId));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function markPendingSync(kind: PendingKind, id: string, schoolId: string = 'dominion-group'): void {
  if (!id) return;
  const list = getPendingSyncIds(kind, schoolId);
  if (!list.includes(id)) safeStorage.setItem(pendingKey(kind, schoolId), JSON.stringify([...list, id]));
}

export function clearPendingSync(kind: PendingKind, id: string, schoolId: string = 'dominion-group'): void {
  if (!id) return;
  const list = getPendingSyncIds(kind, schoolId);
  if (list.includes(id)) safeStorage.setItem(pendingKey(kind, schoolId), JSON.stringify(list.filter((x) => x !== id)));
}

/**
 * Merges cloud records with this device. Cloud wins for the same id.
 * A record only on this device is kept when it is still waiting to upload.
 */
export function mergeCloudWithPending<T extends { id: string }>(
  cloud: T[],
  local: T[],
  pendingIds: string[]
): { merged: T[]; localOnly: T[] } {
  const cloudIds = new Set(cloud.map((r) => r.id));
  const pending = new Set(pendingIds);
  const localOnly = local.filter((r) => r && r.id && !cloudIds.has(r.id) && pending.has(r.id));
  const sortKey = (r: any) => String(r?.date || r?.paymentDate || r?.createdAt || '');
  const merged = [...cloud, ...localOnly].sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
  return { merged, localOnly };
}
