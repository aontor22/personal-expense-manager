const DB_NAME = 'personal_expense_manager_db';
const DB_VERSION = 1;
const EXPENSE_STORE = 'expenses';
const META_STORE = 'meta';

function openExpenseDB() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB is unavailable in this browser.'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

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

    request.onblocked = () => reject(new Error('Local database upgrade is blocked by another open tab. Close other app tabs and reload.'));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error || new Error('Could not open the local database.'));
  });
}

function txStore(db, storeName, mode = 'readonly') {
  const tx = db.transaction(storeName, mode);
  return { tx, store: tx.objectStore(storeName) };
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function completeTx(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Local database transaction was aborted.'));
  });
}

export function generateLocalId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const random = globalThis.crypto?.getRandomValues
    ? Array.from(globalThis.crypto.getRandomValues(new Uint32Array(4)), (n) => n.toString(16)).join('')
    : Math.random().toString(16).slice(2);
  return `local_${Date.now()}_${random}`;
}

export async function getAllLocalExpenses({ includeDeleted = false } = {}) {
  const db = await openExpenseDB();
  try {
    const { store } = txStore(db, EXPENSE_STORE);
    const rows = await requestToPromise(store.getAll());
    return rows
      .filter((item) => includeDeleted || !item.deleted)
      .sort((a, b) => new Date(b.expense_date) - new Date(a.expense_date));
  } finally {
    db.close();
  }
}

export async function saveLocalExpense(expense) {
  const db = await openExpenseDB();
  try {
    const { tx, store } = txStore(db, EXPENSE_STORE, 'readwrite');
    store.put(expense);
    await completeTx(tx);
    return expense;
  } finally {
    db.close();
  }
}

export async function bulkSaveLocalExpenses(expenses) {
  if (!expenses.length) return;
  const db = await openExpenseDB();
  try {
    const { tx, store } = txStore(db, EXPENSE_STORE, 'readwrite');
    expenses.forEach((expense) => store.put(expense));
    await completeTx(tx);
  } finally {
    db.close();
  }
}

export async function getLocalExpense(localId) {
  const db = await openExpenseDB();
  try {
    const { store } = txStore(db, EXPENSE_STORE);
    return await requestToPromise(store.get(localId));
  } finally {
    db.close();
  }
}

export async function deleteLocalExpense(localId) {
  const db = await openExpenseDB();
  try {
    const { tx, store } = txStore(db, EXPENSE_STORE, 'readwrite');
    store.delete(localId);
    await completeTx(tx);
  } finally {
    db.close();
  }
}

export async function clearLocalExpenses() {
  const db = await openExpenseDB();
  try {
    const { tx, store } = txStore(db, EXPENSE_STORE, 'readwrite');
    store.clear();
    await completeTx(tx);
  } finally {
    db.close();
  }
}

export async function getPendingLocalExpenses() {
  const all = await getAllLocalExpenses({ includeDeleted: true });
  return all.filter((item) => item.sync_status && item.sync_status !== 'synced');
}

export async function setMeta(key, value) {
  const db = await openExpenseDB();
  try {
    const { tx, store } = txStore(db, META_STORE, 'readwrite');
    store.put({ key, value });
    await completeTx(tx);
  } finally {
    db.close();
  }
}

export async function getMeta(key) {
  const db = await openExpenseDB();
  try {
    const { store } = txStore(db, META_STORE);
    const row = await requestToPromise(store.get(key));
    return row?.value;
  } finally {
    db.close();
  }
}
