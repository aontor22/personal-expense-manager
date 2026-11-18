import { ensureSupabaseSession, isSupabaseConfigured, supabase } from './supabase';
import { expenseStoreForUser } from './idb';

const SYNC_TIMEOUT_MS = 20000;
function withTimeout(promise, timeoutMs = SYNC_TIMEOUT_MS) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Cloud sync timed out; local data is safe.')), timeoutMs); }),
  ]).finally(() => clearTimeout(timer));
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
async function requireSameSession(userId) {
  const session = await withTimeout(ensureSupabaseSession());
  if (!session || session.user.id !== userId) {
    throw new Error('Account changed. Sync has been stopped to protect your expense data.');
  }
  return session;
}
export async function canUseCloud(userId) {
  if (!isSupabaseConfigured || !navigator.onLine) return false;
  await requireSameSession(userId);
  return true;
}
export async function pushPendingChanges(userId) {
  if (!(await canUseCloud(userId))) return { pushed: 0, skipped: true };
  const store = expenseStoreForUser(userId);
  const pending = await store.getPendingLocalExpenses();
  let pushed = 0;
  for (const item of pending) {
    await requireSameSession(userId);
    if (item.sync_status === 'pending_delete') {
      if (item.remote_id) {
        const { error } = await withTimeout(supabase.from('expenses').delete().eq('id', item.remote_id).eq('user_id', userId));
        if (error) throw error;
      }
      await store.deleteLocalExpense(item.local_id);
      pushed++;
      continue;
    }
    const { data, error } = await withTimeout(supabase.from('expenses')
      .upsert(toRemoteRow(item, userId), { onConflict: 'user_id,local_id' })
      .select('id, local_id, updated_at').single());
    if (error) throw error;
    await store.saveLocalExpense({ ...item, remote_id: data.id, updated_at: data.updated_at || item.updated_at, sync_status: 'synced', deleted: false });
    pushed++;
  }
  return { pushed, skipped: false };
}
export async function pullCloudChanges(userId) {
  if (!(await canUseCloud(userId))) return { pulled: 0, skipped: true };
  const store = expenseStoreForUser(userId);
  const { data, error } = await withTimeout(supabase.from('expenses')
    .select('id,user_id,local_id,title,amount,category,payment_method,expense_date,note,created_at,updated_at')
    .eq('user_id', userId).order('expense_date', { ascending: false }));
  if (error) throw error;
  await requireSameSession(userId);
  const localRows = await store.getAllLocalExpenses({ includeDeleted: true });
  const byId = new Map(localRows.map((row) => [row.local_id, row]));
  const rows = (data || []).map((row) => {
    const existing = byId.get(row.local_id) || {};
    if (existing.sync_status && existing.sync_status !== 'synced') return existing;
    return fromRemoteRow(row, existing);
  });
  await store.bulkSaveLocalExpenses(rows);
  await store.setMeta('last_sync_at', new Date().toISOString());
  return { pulled: rows.length, skipped: false };
}
export async function syncNow(userId) {
  if (!isSupabaseConfigured) return { ok: false, message: 'Cloud sync is not configured.' };
  if (!navigator.onLine) return { ok: false, message: 'Offline: your expenses remain saved locally.' };
  try {
    await requireSameSession(userId);
    const pushed = await pushPendingChanges(userId);
    const pulled = await pullCloudChanges(userId);
    return { ok: true, message: `Synced successfully · ${pushed.pushed || 0} pushed · ${pulled.pulled || 0} pulled` };
  } catch (error) {
    console.error('Expense sync failed:', error);
    return { ok: false, message: error?.message || 'Sync failed; local data is safe.' };
  }
}
