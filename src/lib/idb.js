/** ExpenseFlow account-scoped IndexedDB. The pre-auth v1 database is never deleted. */
const LEGACY_DB = 'personal_expense_manager_db';
const DB_VERSION = 1;
const EXPENSE_STORE = 'expenses';
const META_STORE = 'meta';

export function databaseNameForUser(userId) {
  if (typeof userId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(userId)) {
    throw new Error('An authenticated user ID is required to access expenses.');
  }
  return `${LEGACY_DB}_user_${userId}`;
}

function openExpenseDB(name) {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in globalThis)) {
      reject(new Error('IndexedDB is unavailable in this browser.'));
      return;
    }
    const request = indexedDB.open(name, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(EXPENSE_STORE)) {
        const expenses = db.createObjectStore(EXPENSE_STORE, { keyPath: 'local_id' });
        expenses.createIndex('sync_status', 'sync_status', { unique: false });
        expenses.createIndex('expense_date', 'expense_date', { unique: false });
        expenses.createIndex('category', 'category', { unique: false });
        expenses.createIndex('remote_id', 'remote_id', { unique: false });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'key' });
      }
    };
    request.onblocked = () => reject(new Error('Local database upgrade is blocked by another tab. Close other ExpenseFlow tabs.'));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error || new Error('Could not open the local database.'));
  });
}

function requestToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
function completeTx(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Local database transaction failed.'));
  });
}
async function readRows(name, { includeDeleted = false } = {}) {
  const db = await openExpenseDB(name);
  try {
    const rows = await requestToPromise(db.transaction(EXPENSE_STORE, 'readonly').objectStore(EXPENSE_STORE).getAll());
    return rows.filter((row) => includeDeleted || !row.deleted)
      .sort((a, b) => String(b.expense_date).localeCompare(String(a.expense_date)));
  } finally { db.close(); }
}
async function getRow(name, localId) {
  const db = await openExpenseDB(name);
  try { return await requestToPromise(db.transaction(EXPENSE_STORE, 'readonly').objectStore(EXPENSE_STORE).get(localId)); }
  finally { db.close(); }
}
async function putRow(name, row) {
  const db = await openExpenseDB(name);
  try { const tx = db.transaction(EXPENSE_STORE, 'readwrite'); tx.objectStore(EXPENSE_STORE).put(row); await completeTx(tx); return row; }
  finally { db.close(); }
}
async function putRows(name, rows) {
  if (!rows.length) return;
  const db = await openExpenseDB(name);
  try {
    const tx = db.transaction(EXPENSE_STORE, 'readwrite');
    for (const row of rows) tx.objectStore(EXPENSE_STORE).put(row);
    await completeTx(tx);
  } finally { db.close(); }
}
async function removeRow(name, localId) {
  const db = await openExpenseDB(name);
  try { const tx = db.transaction(EXPENSE_STORE, 'readwrite'); tx.objectStore(EXPENSE_STORE).delete(localId); await completeTx(tx); }
  finally { db.close(); }
}
async function metaRead(name, key) {
  const db = await openExpenseDB(name);
  try { const result = await requestToPromise(db.transaction(META_STORE, 'readonly').objectStore(META_STORE).get(key)); return result?.value; }
  finally { db.close(); }
}
async function metaWrite(name, key, value) {
  const db = await openExpenseDB(name);
  try { const tx = db.transaction(META_STORE, 'readwrite'); tx.objectStore(META_STORE).put({ key, value }); await completeTx(tx); }
  finally { db.close(); }
}

export function generateLocalId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const random = globalThis.crypto?.getRandomValues
    ? Array.from(globalThis.crypto.getRandomValues(new Uint32Array(4)), (n) => n.toString(16)).join('')
    : Math.random().toString(16).slice(2);
  return `local_${Date.now()}_${random}`;
}

/** Immutable store bound to exactly one account; no global active-user pointer. */
export function expenseStoreForUser(userId) {
  const name = databaseNameForUser(userId);
  return {
    getAllLocalExpenses: (options) => readRows(name, options),
    getLocalExpense: (localId) => getRow(name, localId),
    saveLocalExpense: (row) => putRow(name, row),
    bulkSaveLocalExpenses: (rows) => putRows(name, rows),
    deleteLocalExpense: (localId) => removeRow(name, localId),
    getPendingLocalExpenses: async () => {
      const rows = await readRows(name, { includeDeleted: true });
      return rows.filter((row) => row.sync_status && row.sync_status !== 'synced');
    },
    getMeta: (key) => metaRead(name, key),
    setMeta: (key, value) => metaWrite(name, key, value),
  };
}

/**
 * Old v1 data can belong to a DIFFERENT person using this browser.
 * Do not show old finance rows or copy them until the current user explicitly claims them.
 * A completed import is tied to a single user; originals remain in the old database.
 */
export async function getLegacyImportStatus(userId) {
  databaseNameForUser(userId);
  const claimedBy = await metaRead(LEGACY_DB, 'expenseflow_migrated_owner');
  if (claimedBy) return { count: 0, alreadyClaimed: claimedBy === userId };
  const rows = await readRows(LEGACY_DB);
  return { count: rows.length, alreadyClaimed: false };
}

export async function importLegacyForUser(userId) {
  const status = await getLegacyImportStatus(userId);
  if (!status.count) return 0;
  const rows = await readRows(LEGACY_DB);
  const store = expenseStoreForUser(userId);
  const existing = await store.getAllLocalExpenses({ includeDeleted: true });
  const ids = new Set(existing.map((row) => row.local_id));
  const now = new Date().toISOString();
  const converted = rows.filter((row) => !ids.has(row.local_id)).map((row) => ({
    ...row,
    remote_id: null, // Never carry another account's remote row ID into new account
    deleted: false,
    sync_status: 'pending_create',
    updated_at: now,
  }));
  await store.bulkSaveLocalExpenses(converted);
  await metaWrite(LEGACY_DB, 'expenseflow_migrated_owner', userId);
  // Imported data is copied. The original v1 database is retained for recovery.
  return converted.length;
}
