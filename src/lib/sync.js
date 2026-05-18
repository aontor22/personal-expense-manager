import { ensureSupabaseSession, isSupabaseConfigured, supabase } from './supabase';
import {
  bulkSaveLocalExpenses,
  deleteLocalExpense,
  getAllLocalExpenses,
  getPendingLocalExpenses,
  saveLocalExpense,
  setMeta,
} from './idb';

function toRemoteRow(expense, userId) {
  return {
    user_id: userId,
    local_id: expense.local_id,
    title: expense.title,
    amount: Number(expense.amount || 0),
    category: expense.category,
    payment_method: expense.payment_method || 'Cash',
    expense_date: expense.expense_date,
    note: expense.note || '',
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
  await ensureSupabaseSession();
  return true;
}

export async function pushPendingChanges() {
  if (!(await canUseCloud())) return { pushed: 0, skipped: true };

  const session = await ensureSupabaseSession();
  const pending = await getPendingLocalExpenses();
  let pushed = 0;

  for (const item of pending) {
    if (item.sync_status === 'pending_delete') {
      if (item.remote_id) {
        const { error } = await supabase.from('expenses').delete().eq('id', item.remote_id);
        if (error) throw error;
      }
      await deleteLocalExpense(item.local_id);
      pushed += 1;
      continue;
    }

    const payload = toRemoteRow(item, session.user.id);
    const { data, error } = await supabase
      .from('expenses')
      .upsert(payload, { onConflict: 'user_id,local_id' })
      .select()
      .single();

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

  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .order('expense_date', { ascending: false });

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
    return { ok: false, message: 'Supabase is not configured yet. Offline local mode is active.' };
  }

  if (!navigator.onLine) {
    return { ok: false, message: 'You are offline. New records are saved locally and will sync when online.' };
  }

  try {
    const pushed = await pushPendingChanges();
    const pulled = await pullCloudChanges();
    return {
      ok: true,
      message: `Synced successfully. Pushed ${pushed.pushed || 0}, pulled ${pulled.pulled || 0}.`,
    };
  } catch (error) {
    return { ok: false, message: error.message || 'Sync failed.' };
  }
}
