import { ensureSupabaseSession, isSupabaseConfigured, supabase } from './supabase';
import {
  bulkSaveLocalExpenses,
  deleteLocalExpense,
  getAllLocalExpenses,
  getPendingLocalExpenses,
  saveLocalExpense,
  setMeta,
} from './idb';

const SYNC_TIMEOUT_MS = 20000;

function withTimeout(promise, timeoutMs = SYNC_TIMEOUT_MS) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = window.setTimeout(() => reject(new Error('Cloud sync timed out. Your local data is still safe.')), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timer));
}

function toRemoteRow(expense, userId) {
  return {
    user_id: userId,
    local_id: String(expense.local_id),
    title: String(expense.title || '').slice(0, 120),
    amount: Number(expense.amount || 0),
    category: String(expense.category || 'Other').slice(0, 80),
    payment_method: String(expense.payment_method || 'Cash').slice(0, 40),
    expense_date: expense.expense_date,
    note: String(expense.note || '').slice(0, 500),
    created_at: expense.created_at,
    updated_at: expense.updated_at,
  };
}

function fromRemoteRow(row, existing = {}) {
  return {
    ...existing,
    local_id: row.local_id,
    remote_id: row.id,
    title: row.title,
    amount: Number(row.amount || 0),
    category: row.category,
    payment_method: row.payment_method || 'Cash',
    expense_date: row.expense_date,
    note: row.note || '',
    created_at: row.created_at,
    updated_at: row.updated_at,
    sync_status: 'synced',
    deleted: false,
  };
}

export async function canUseCloud() {
  if (!isSupabaseConfigured || !navigator.onLine) return false;
  await withTimeout(ensureSupabaseSession());
  return true;
}

export async function pushPendingChanges() {
  if (!(await canUseCloud())) return { pushed: 0, skipped: true };

  const session = await withTimeout(ensureSupabaseSession());
  const pending = await getPendingLocalExpenses();
  let pushed = 0;

  for (const item of pending) {
    if (item.sync_status === 'local_only') {
      item.sync_status = 'pending_create';
    }

    if (item.sync_status === 'pending_delete') {
      if (item.remote_id) {
        const request = supabase.from('expenses').delete().eq('id', item.remote_id).eq('user_id', session.user.id);
        const { error } = await withTimeout(request);
        if (error) throw error;
      }
      await deleteLocalExpense(item.local_id);
      pushed += 1;
      continue;
    }

    const payload = toRemoteRow(item, session.user.id);
    const request = supabase
      .from('expenses')
      .upsert(payload, { onConflict: 'user_id,local_id' })
      .select('id, local_id, updated_at')
      .single();
    const { data, error } = await withTimeout(request);

    if (error) throw error;

    await saveLocalExpense({
      ...item,
      remote_id: data.id,
      updated_at: data.updated_at || item.updated_at,
      sync_status: 'synced',
      deleted: false,
    });
    pushed += 1;
  }

  return { pushed, skipped: false };
}

export async function pullCloudChanges() {
  if (!(await canUseCloud())) return { pulled: 0, skipped: true };

  const session = await withTimeout(ensureSupabaseSession());
  const request = supabase
    .from('expenses')
    .select('id,user_id,local_id,title,amount,category,payment_method,expense_date,note,created_at,updated_at')
    .eq('user_id', session.user.id)
    .order('expense_date', { ascending: false });
  const { data, error } = await withTimeout(request);

  if (error) throw error;

  const localRows = await getAllLocalExpenses({ includeDeleted: true });
  const byLocalId = new Map(localRows.map((item) => [item.local_id, item]));

  const rowsToSave = (data || []).map((row) => {
    const existing = byLocalId.get(row.local_id) || {};
    if (existing.sync_status && existing.sync_status !== 'synced') return existing;
    return fromRemoteRow(row, existing);
  });

  await bulkSaveLocalExpenses(rowsToSave);
  await setMeta('last_sync_at', new Date().toISOString());

  return { pulled: rowsToSave.length, skipped: false };
}

export async function syncNow() {
  if (!isSupabaseConfigured) {
    return { ok: false, message: 'Supabase is not configured. Local offline mode is active.' };
  }
  if (!navigator.onLine) {
    return { ok: false, message: 'You are offline. New records are safe locally and will sync later.' };
  }

  try {
    const pushed = await pushPendingChanges();
    const pulled = await pullCloudChanges();
    return {
      ok: true,
      message: `Synced successfully · ${pushed.pushed || 0} pushed · ${pulled.pulled || 0} pulled`,
    };
  } catch (error) {
    console.error('Expense sync failed:', error);
    return { ok: false, message: error?.message || 'Sync failed. Your local data is still safe.' };
  }
}
