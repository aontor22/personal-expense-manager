import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Activity,
  AlertTriangle,
  Banknote,
  Bus,
  CalendarDays,
  Check,
  ChevronDown,
  Cloud,
  Database,
  Download,
  FileDown,
  FileSpreadsheet,
  Filter,
  Gamepad2,
  GraduationCap,
  HeartPulse,
  Home,
  Landmark,
  Moon,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  ReceiptText,
  RefreshCcw,
  RotateCcw,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Sun,
  Trash2,
  TrendingDown,
  TrendingUp,
  Upload,
  Utensils,
  Wallet,
  WifiOff,
  X,
  Zap,
} from 'lucide-react';
import {
  bulkSaveLocalExpenses,
  deleteLocalExpense,
  generateLocalId,
  getAllLocalExpenses,
  getLocalExpense,
  saveLocalExpense,
} from './lib/idb';
import { isSupabaseConfigured } from './lib/supabase';
import { syncNow } from './lib/sync';
import { exportCSV, exportExcel, exportJSON, exportPDF, formatBDT } from './lib/exporters';

const categories = [
  'Jatayat',
  'Basha Vara',
  'Utility',
  'Bua Bill',
  'Meal',
  'Grocery & Products',
  'Snacks & Drinks',
  'Phone Load',
  'Game Topup',
  'Health',
  'Education',
  'Other',
];

const paymentMethods = ['Cash', 'bKash', 'Nagad', 'Card', 'Bank', 'Other'];
const chartColors = ['#6d5dfc', '#16a34a', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#eab308', '#ec4899', '#14b8a6', '#64748b', '#a855f7', '#f97316'];
const MAX_TITLE_LENGTH = 120;
const MAX_NOTE_LENGTH = 500;
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const MAX_IMPORT_ROWS = 10000;

const categoryIconMap = {
  Jatayat: Bus,
  'Basha Vara': Home,
  Utility: Zap,
  'Bua Bill': ReceiptText,
  Meal: Utensils,
  'Grocery & Products': ShoppingBag,
  'Snacks & Drinks': Sparkles,
  'Phone Load': Phone,
  'Game Topup': Gamepad2,
  Health: HeartPulse,
  Education: GraduationCap,
  Other: MoreHorizontal,
};

function toLocalISODate(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function todayDate() {
  return toLocalISODate();
}

function currentMonth() {
  return toLocalISODate().slice(0, 7);
}

function previousMonth(monthValue) {
  const [year, month] = monthValue.split('-').map(Number);
  const date = new Date(year, month - 2, 1);
  return toLocalISODate(date).slice(0, 7);
}

function emptyForm() {
  return {
    title: '',
    amount: '',
    category: 'Meal',
    payment_method: 'Cash',
    expense_date: todayDate(),
    note: '',
  };
}

function monthLabel(monthValue) {
  if (!monthValue) return '';
  const [year, month] = monthValue.split('-').map(Number);
  return new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric' }).format(new Date(year, month - 1, 1));
}

function isValidDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const date = new Date(`${value}T00:00:00`);
  return !Number.isNaN(date.getTime());
}

function sanitizeText(value, maxLength) {
  return String(value ?? '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, maxLength);
}

function StatCard({ icon: Icon, eyebrow, value, helper, tone = 'violet' }) {
  return (
    <article className={`stat-card tone-${tone}`}>
      <div className="stat-icon"><Icon size={20} /></div>
      <div className="stat-copy">
        <p>{eyebrow}</p>
        <h3>{value}</h3>
        {helper ? <span>{helper}</span> : null}
      </div>
    </article>
  );
}

function EmptyState({ title, text }) {
  return (
    <div className="empty-state">
      <div className="empty-icon"><ReceiptText size={20} /></div>
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}

function App() {
  const [expenses, setExpenses] = useState([]);
  const [form, setForm] = useState(emptyForm());
  const [editingId, setEditingId] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth());
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [query, setQuery] = useState('');
  const [monthlyBudget, setMonthlyBudget] = useState(() => Number(localStorage.getItem('monthly_budget') || 15000));
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [syncMessage, setSyncMessage] = useState('Ready');
  const [isSyncing, setIsSyncing] = useState(false);
  const [toast, setToast] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [theme, setTheme] = useState(() => localStorage.getItem('expense_theme') || 'light');
  const restoreInputRef = useRef(null);
  const syncLockRef = useRef(false);

  async function loadExpenses() {
    const rows = await getAllLocalExpenses();
    setExpenses(rows);
  }

  function notify(message, tone = 'success') {
    setToast({ message, tone });
  }

  async function runSync({ quiet = false } = {}) {
    if (syncLockRef.current) return;
    syncLockRef.current = true;
    setIsSyncing(true);
    try {
      const result = await syncNow();
      setSyncMessage(result.message);
      await loadExpenses();
      if (!quiet) notify(result.message, result.ok ? 'success' : 'warning');
    } finally {
      syncLockRef.current = false;
      setIsSyncing(false);
    }
  }

  useEffect(() => {
    let mounted = true;
    loadExpenses().then(() => {
      if (mounted && navigator.onLine && isSupabaseConfigured) runSync({ quiet: true });
    });

    function handleOnline() {
      setIsOnline(true);
      if (isSupabaseConfigured) runSync({ quiet: true });
    }

    function handleOffline() {
      setIsOnline(false);
      setSyncMessage('Offline mode active. Data will sync later.');
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      mounted = false;
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('monthly_budget', String(Number.isFinite(monthlyBudget) ? monthlyBudget : 0));
  }, [monthlyBudget]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('expense_theme', theme);
  }, [theme]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 4200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const pendingCount = expenses.filter((item) => item.sync_status && item.sync_status !== 'synced').length;

  const monthlyExpenses = useMemo(
    () => expenses.filter((item) => item.expense_date?.startsWith(selectedMonth)),
    [expenses, selectedMonth]
  );

  const previousMonthExpenses = useMemo(() => {
    const prev = previousMonth(selectedMonth);
    return expenses.filter((item) => item.expense_date?.startsWith(prev));
  }, [expenses, selectedMonth]);

  const filteredExpenses = useMemo(() => {
    const q = query.trim().toLowerCase();
    return monthlyExpenses.filter((item) => {
      const text = `${item.title} ${item.category} ${item.note || ''} ${item.payment_method || ''}`.toLowerCase();
      const queryMatch = !q || text.includes(q);
      const categoryMatch = categoryFilter === 'All' || item.category === categoryFilter;
      return queryMatch && categoryMatch;
    });
  }, [monthlyExpenses, query, categoryFilter]);

  const totalSpent = monthlyExpenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const previousTotal = previousMonthExpenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const overallTotal = expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const budget = Math.max(0, Number(monthlyBudget || 0));
  const remaining = budget - totalSpent;
  const budgetUsedRaw = budget > 0 ? (totalSpent / budget) * 100 : 0;
  const budgetUsedPercent = Math.min(Math.max(budgetUsedRaw, 0), 100);
  const differenceFromLastMonth = totalSpent - previousTotal;
  const comparisonPercent = previousTotal > 0 ? (differenceFromLastMonth / previousTotal) * 100 : null;
  const averageExpense = monthlyExpenses.length ? totalSpent / monthlyExpenses.length : 0;
  const largestExpense = monthlyExpenses.reduce((largest, item) => Number(item.amount || 0) > Number(largest?.amount || 0) ? item : largest, null);

  const categoryData = useMemo(() => {
    return categories
      .map((category) => ({
        category,
        amount: monthlyExpenses
          .filter((item) => item.category === category)
          .reduce((sum, item) => sum + Number(item.amount || 0), 0),
      }))
      .filter((item) => item.amount > 0)
      .sort((a, b) => b.amount - a.amount);
  }, [monthlyExpenses]);

  const dailyData = useMemo(() => {
    const data = {};
    monthlyExpenses.forEach((item) => {
      const day = item.expense_date.slice(8, 10);
      if (!data[day]) data[day] = { day, amount: 0 };
      data[day].amount += Number(item.amount || 0);
    });
    return Object.values(data).sort((a, b) => Number(a.day) - Number(b.day));
  }, [monthlyExpenses]);

  const paymentData = useMemo(() => {
    return paymentMethods
      .map((method) => ({
        method,
        amount: monthlyExpenses
          .filter((item) => (item.payment_method || 'Cash') === method)
          .reduce((sum, item) => sum + Number(item.amount || 0), 0),
      }))
      .filter((item) => item.amount > 0)
      .sort((a, b) => b.amount - a.amount);
  }, [monthlyExpenses]);

  const topCategory = categoryData[0];

  async function handleSubmit(event) {
    event.preventDefault();

    const title = sanitizeText(form.title, MAX_TITLE_LENGTH);
    const note = sanitizeText(form.note, MAX_NOTE_LENGTH);
    const amount = Number(form.amount);

    if (!title) {
      notify('Please add an expense title.', 'warning');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0 || amount > 999999999.99) {
      notify('Enter a valid amount greater than 0.', 'warning');
      return;
    }
    if (!categories.includes(form.category) || !paymentMethods.includes(form.payment_method) || !isValidDate(form.expense_date)) {
      notify('Please check category, payment method and date.', 'warning');
      return;
    }

    const now = new Date().toISOString();

    if (editingId) {
      const existing = await getLocalExpense(editingId);
      if (!existing) {
        notify('This expense could not be found locally.', 'warning');
        return;
      }
      await saveLocalExpense({
        ...existing,
        title,
        amount,
        category: form.category,
        payment_method: form.payment_method,
        expense_date: form.expense_date,
        note,
        updated_at: now,
        sync_status: existing.remote_id ? 'pending_update' : 'pending_create',
      });
      notify('Expense updated.');
    } else {
      await saveLocalExpense({
        local_id: generateLocalId(),
        remote_id: null,
        title,
        amount,
        category: form.category,
        payment_method: form.payment_method,
        expense_date: form.expense_date,
        note,
        created_at: now,
        updated_at: now,
        sync_status: isSupabaseConfigured ? 'pending_create' : 'local_only',
        deleted: false,
      });
      notify('Expense saved.');
    }

    setForm(emptyForm());
    setEditingId(null);
    await loadExpenses();
    if (navigator.onLine && isSupabaseConfigured) await runSync({ quiet: true });
  }

  function handleEdit(item) {
    setEditingId(item.local_id);
    setForm({
      title: item.title,
      amount: String(item.amount),
      category: item.category,
      payment_method: item.payment_method || 'Cash',
      expense_date: item.expense_date,
      note: item.note || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function confirmDelete() {
    const item = deleteTarget;
    if (!item) return;
    setDeleteTarget(null);

    if (item.remote_id && isSupabaseConfigured) {
      await saveLocalExpense({
        ...item,
        deleted: true,
        sync_status: 'pending_delete',
        updated_at: new Date().toISOString(),
      });
    } else {
      await deleteLocalExpense(item.local_id);
    }

    await loadExpenses();
    notify('Expense deleted.');
    if (navigator.onLine && isSupabaseConfigured) await runSync({ quiet: true });
  }

  async function handleRestore(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      if (file.size > MAX_IMPORT_BYTES) throw new Error('Backup file is too large. Maximum size is 5 MB.');
      const text = await file.text();
      const payload = JSON.parse(text);
      const rows = Array.isArray(payload) ? payload : payload?.expenses;
      if (!Array.isArray(rows)) throw new Error('This JSON file does not contain an expenses array.');
      if (rows.length > MAX_IMPORT_ROWS) throw new Error(`Backup contains too many rows. Maximum is ${MAX_IMPORT_ROWS}.`);

      const now = new Date().toISOString();
      const cleanRows = rows.map((item, index) => {
        const amount = Number(item?.amount);
        const expenseDate = item?.expense_date || item?.date || todayDate();
        if (!Number.isFinite(amount) || amount <= 0 || amount > 999999999.99) {
          throw new Error(`Invalid amount in backup row ${index + 1}.`);
        }
        if (!isValidDate(expenseDate)) throw new Error(`Invalid date in backup row ${index + 1}.`);

        return {
          local_id: generateLocalId(),
          remote_id: null,
          title: sanitizeText(item?.title || 'Imported expense', MAX_TITLE_LENGTH) || 'Imported expense',
          amount,
          category: categories.includes(item?.category) ? item.category : 'Other',
          payment_method: paymentMethods.includes(item?.payment_method) ? item.payment_method : 'Cash',
          expense_date: expenseDate,
          note: sanitizeText(item?.note || '', MAX_NOTE_LENGTH),
          created_at: now,
          updated_at: now,
          sync_status: isSupabaseConfigured ? 'pending_create' : 'local_only',
          deleted: false,
        };
      });

      await bulkSaveLocalExpenses(cleanRows);
      await loadExpenses();
      setSyncMessage(`Imported ${cleanRows.length} records.`);
      notify(`Imported ${cleanRows.length} records.`);
      if (navigator.onLine && isSupabaseConfigured) await runSync({ quiet: true });
    } catch (error) {
      notify(error.message || 'Could not restore this backup.', 'warning');
    }
  }

  const budgetState = budget === 0 ? 'neutral' : budgetUsedRaw > 100 ? 'danger' : budgetUsedRaw >= 80 ? 'warning' : 'good';

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark"><Wallet size={23} /></div>
          <div>
            <strong>ExpenseFlow</strong>
            <span>Personal finance, simplified</span>
          </div>
        </div>
        <div className="topbar-actions">
          <div className={`connection-chip ${isOnline ? 'is-online' : 'is-offline'}`}>
            <span className="connection-dot" />
            {isOnline ? 'Online' : 'Offline'}
          </div>
          <button className="icon-btn" type="button" aria-label="Toggle color theme" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </header>

      <section className="hero-panel">
        <div className="hero-copy">
          <span className="eyebrow"><Sparkles size={14} /> Offline-first expense intelligence</span>
          <h1>Know exactly where your money goes.</h1>
          <p>Track daily khoroch, understand your monthly pattern, stay inside budget and keep everything safely synced with Supabase.</p>
          <div className="hero-actions">
            <button className="primary-btn" type="button" onClick={() => document.getElementById('expense-form-card')?.scrollIntoView({ behavior: 'smooth' })}>
              <Plus size={17} /> Add expense
            </button>
            <button className="secondary-btn" type="button" onClick={() => runSync()} disabled={isSyncing || !isOnline || !isSupabaseConfigured}>
              <RefreshCcw size={17} className={isSyncing ? 'spin' : ''} /> {isSyncing ? 'Syncing…' : 'Sync now'}
            </button>
          </div>
        </div>

        <div className="hero-visual" aria-label="Selected month spending overview">
          <div className="hero-orb">
            <span>{monthLabel(selectedMonth)}</span>
            <strong>{formatBDT(totalSpent)}</strong>
            <small>{monthlyExpenses.length} transactions</small>
          </div>
          <div className="floating-card floating-security"><ShieldCheck size={17} /> RLS protected</div>
          <div className="floating-card floating-offline"><WifiOff size={17} /> Offline ready</div>
        </div>
      </section>

      <section className="status-strip" aria-label="Cloud and sync status">
        <div><Database size={16} /><strong>{isSupabaseConfigured ? 'Supabase connected' : 'Local-only mode'}</strong><span>{isSupabaseConfigured ? 'Cloud sync is configured' : 'Add environment variables for cloud sync'}</span></div>
        <div><Cloud size={16} /><strong>{pendingCount === 0 ? 'Everything synced' : `${pendingCount} pending`}</strong><span>{syncMessage}</span></div>
        <div><ShieldCheck size={16} /><strong>Offline-first storage</strong><span>Every change is saved locally before sync</span></div>
      </section>

      <section className="stats-grid">
        <StatCard icon={Wallet} eyebrow="Spent this month" value={formatBDT(totalSpent)} helper={`${monthlyExpenses.length} entries in ${monthLabel(selectedMonth)}`} tone="violet" />
        <StatCard icon={budgetState === 'danger' ? AlertTriangle : Landmark} eyebrow="Budget remaining" value={formatBDT(remaining)} helper={budget === 0 ? 'Set a monthly budget to track progress' : `${budgetUsedRaw.toFixed(0)}% of ${formatBDT(budget)} used`} tone={budgetState === 'danger' ? 'red' : budgetState === 'warning' ? 'amber' : 'green'} />
        <StatCard icon={differenceFromLastMonth > 0 ? TrendingUp : TrendingDown} eyebrow="vs previous month" value={formatBDT(Math.abs(differenceFromLastMonth))} helper={comparisonPercent === null ? 'No previous month baseline' : `${Math.abs(comparisonPercent).toFixed(1)}% ${differenceFromLastMonth > 0 ? 'higher' : 'lower'} spending`} tone={differenceFromLastMonth > 0 ? 'amber' : 'cyan'} />
        <StatCard icon={CalendarDays} eyebrow="Lifetime spending" value={formatBDT(overallTotal)} helper={`${expenses.length} saved entries`} tone="blue" />
      </section>

      <section className="workspace-grid">
        <article className="card form-card" id="expense-form-card">
          <div className="section-title">
            <div>
              <span className="section-kicker">Quick entry</span>
              <h2>{editingId ? 'Update expense' : 'Add a new expense'}</h2>
              <p>It is stored on this device first, then synced automatically when cloud access is available.</p>
            </div>
            <div className="section-icon"><ReceiptText size={19} /></div>
          </div>

          <form onSubmit={handleSubmit} className="expense-form" noValidate>
            <label>
              <span>Expense title</span>
              <input maxLength={MAX_TITLE_LENGTH} autoComplete="off" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Bus fare" />
            </label>

            <label>
              <span>Amount (BDT)</span>
              <div className="input-with-icon"><Banknote size={16} /><input type="number" inputMode="decimal" min="0.01" max="999999999.99" step="0.01" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0.00" /></div>
            </label>

            <label>
              <span>Category</span>
              <div className="select-wrap"><select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{categories.map((category) => <option key={category}>{category}</option>)}</select><ChevronDown size={15} /></div>
            </label>

            <label>
              <span>Payment method</span>
              <div className="select-wrap"><select value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}>{paymentMethods.map((method) => <option key={method}>{method}</option>)}</select><ChevronDown size={15} /></div>
            </label>

            <label>
              <span>Date</span>
              <input type="date" required value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
            </label>

            <label className="full">
              <span>Note <em>optional</em></span>
              <textarea maxLength={MAX_NOTE_LENGTH} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Anything useful about this expense…" />
              <small className="field-counter">{form.note.length}/{MAX_NOTE_LENGTH}</small>
            </label>

            <div className="form-actions full">
              <button type="submit" className="primary-btn"><Plus size={18} />{editingId ? 'Save changes' : 'Add expense'}</button>
              {editingId ? <button type="button" className="secondary-btn" onClick={() => { setEditingId(null); setForm(emptyForm()); }}><X size={17} />Cancel edit</button> : null}
            </div>
          </form>
        </article>

        <aside className="card report-card">
          <div className="section-title compact">
            <div><span className="section-kicker">Monthly control</span><h2>Budget & reports</h2></div>
            <div className="section-icon"><FileSpreadsheet size={19} /></div>
          </div>

          <div className="settings-stack">
            <label><span>Report month</span><input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} /></label>
            <label><span>Monthly budget</span><div className="input-with-icon"><Wallet size={16} /><input type="number" min="0" step="1" value={monthlyBudget} onChange={(e) => setMonthlyBudget(Math.max(0, Number(e.target.value) || 0))} /></div></label>
          </div>

          <div className="budget-block">
            <div className="budget-heading"><span>Budget progress</span><strong className={`budget-state ${budgetState}`}>{budget === 0 ? 'Not set' : `${budgetUsedRaw.toFixed(0)}%`}</strong></div>
            <div className={`budget-bar ${budgetState}`}><span style={{ width: `${budgetUsedPercent}%` }} /></div>
            <div className="budget-meta"><span>Spent {formatBDT(totalSpent)}</span><span>{remaining >= 0 ? `${formatBDT(remaining)} left` : `${formatBDT(Math.abs(remaining))} over`}</span></div>
          </div>

          <div className="insight-list">
            <div><span>Top category</span><strong>{topCategory ? topCategory.category : 'No data'}</strong></div>
            <div><span>Average entry</span><strong>{formatBDT(averageExpense)}</strong></div>
            <div><span>Largest expense</span><strong>{largestExpense ? formatBDT(largestExpense.amount) : formatBDT(0)}</strong></div>
          </div>

          <div className="download-grid">
            <button onClick={() => exportPDF(filteredExpenses, `${selectedMonth}-monthly-expense-report`)}><FileDown size={16} /><span>PDF</span></button>
            <button onClick={() => exportExcel(filteredExpenses, `${selectedMonth}-monthly-expense-report`)}><FileSpreadsheet size={16} /><span>Excel</span></button>
            <button onClick={() => exportCSV(filteredExpenses, `${selectedMonth}-monthly-expense-report`)}><Download size={16} /><span>CSV</span></button>
            <button onClick={() => exportJSON(expenses, 'expense-manager-backup')}><Database size={16} /><span>Backup</span></button>
            <button onClick={() => exportPDF(expenses, 'overall-expense-report')}><FileDown size={16} /><span>Overall PDF</span></button>
            <button onClick={() => exportExcel(expenses, 'overall-expense-report')}><FileSpreadsheet size={16} /><span>Overall Excel</span></button>
            <button className="restore-trigger" type="button" onClick={() => restoreInputRef.current?.click()}><Upload size={16} /><span>Restore JSON</span></button>
            <input ref={restoreInputRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={handleRestore} />
          </div>
        </aside>
      </section>

      <section className="analytics-header">
        <div><span className="section-kicker">Analytics</span><h2>Your spending story</h2><p>Patterns for {monthLabel(selectedMonth)} based on your saved expenses.</p></div>
        <div className="analytics-summary"><Activity size={17} /><span>{monthlyExpenses.length} transactions</span></div>
      </section>

      <section className="analytics-grid">
        <article className="card chart-card chart-wide">
          <div className="section-title compact"><div><h3>Daily spending</h3><p>How your spending moved through the month.</p></div><div className="chart-value">{formatBDT(totalSpent)}</div></div>
          <div className="chart-box">
            {dailyData.length ? (
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={dailyData} margin={{ top: 10, right: 10, left: -12, bottom: 0 }}>
                  <defs><linearGradient id="amountGradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#6d5dfc" stopOpacity={0.38} /><stop offset="95%" stopColor="#6d5dfc" stopOpacity={0.02} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="4 6" vertical={false} stroke="var(--chart-grid)" />
                  <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fill: 'var(--muted)', fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--muted)', fontSize: 12 }} tickFormatter={(value) => value >= 1000 ? `${Math.round(value / 1000)}k` : value} />
                  <Tooltip contentStyle={{ borderRadius: 14, border: '1px solid var(--border)', background: 'var(--surface-strong)', color: 'var(--text)' }} formatter={(value) => formatBDT(value)} labelFormatter={(day) => `Day ${day}`} />
                  <Area type="monotone" dataKey="amount" stroke="#6d5dfc" fill="url(#amountGradient)" strokeWidth={3} />
                </AreaChart>
              </ResponsiveContainer>
            ) : <EmptyState title="No daily data yet" text="Add an expense for this month to start the chart." />}
          </div>
        </article>

        <article className="card chart-card">
          <div className="section-title compact"><div><h3>Category split</h3><p>Where the money went.</p></div></div>
          <div className="chart-box donut-box">
            {categoryData.length ? (
              <>
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart><Pie data={categoryData} dataKey="amount" nameKey="category" innerRadius={62} outerRadius={92} paddingAngle={4} cornerRadius={7}>{categoryData.map((_, index) => <Cell key={index} fill={chartColors[index % chartColors.length]} />)}</Pie><Tooltip contentStyle={{ borderRadius: 14, border: '1px solid var(--border)', background: 'var(--surface-strong)', color: 'var(--text)' }} formatter={(value) => formatBDT(value)} /></PieChart>
                </ResponsiveContainer>
                <div className="legend-stack">{categoryData.slice(0, 5).map((item, index) => <div key={item.category}><span className="legend-dot" style={{ background: chartColors[index % chartColors.length] }} /><span>{item.category}</span><strong>{formatBDT(item.amount)}</strong></div>)}</div>
              </>
            ) : <EmptyState title="No category data" text="Your category breakdown will appear here." />}
          </div>
        </article>

        <article className="card chart-card">
          <div className="section-title compact"><div><h3>Payment mix</h3><p>Cash vs digital spending.</p></div></div>
          <div className="chart-box">
            {paymentData.length ? (
              <ResponsiveContainer width="100%" height={290}>
                <BarChart data={paymentData} layout="vertical" margin={{ top: 0, right: 10, left: 12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="4 6" horizontal={false} stroke="var(--chart-grid)" />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: 'var(--muted)', fontSize: 11 }} tickFormatter={(value) => value >= 1000 ? `${Math.round(value / 1000)}k` : value} />
                  <YAxis dataKey="method" type="category" width={56} axisLine={false} tickLine={false} tick={{ fill: 'var(--muted)', fontSize: 11 }} />
                  <Tooltip cursor={{ fill: 'var(--hover)' }} contentStyle={{ borderRadius: 14, border: '1px solid var(--border)', background: 'var(--surface-strong)', color: 'var(--text)' }} formatter={(value) => formatBDT(value)} />
                  <Bar dataKey="amount" fill="#14b8a6" radius={[0, 8, 8, 0]} maxBarSize={24} />
                </BarChart>
              </ResponsiveContainer>
            ) : <EmptyState title="No payment data" text="Payment method analytics will appear here." />}
          </div>
        </article>
      </section>

      <section className="card records-card">
        <div className="section-title records-heading">
          <div><span className="section-kicker">Ledger</span><h2>Expense records</h2><p>Search, filter, edit and delete entries from {monthLabel(selectedMonth)}.</p></div>
          <div className="record-count">{filteredExpenses.length}<span>shown</span></div>
        </div>

        <div className="filter-row">
          <div className="search-box"><Search size={17} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search title, note, method…" aria-label="Search expenses" /></div>
          <div className="select-box"><Filter size={16} /><select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} aria-label="Filter by category"><option>All</option>{categories.map((category) => <option key={category}>{category}</option>)}</select><ChevronDown size={14} /></div>
        </div>

        <div className="table-wrap">
          <table>
            <thead><tr><th>Date</th><th>Expense</th><th>Category</th><th>Method</th><th className="amount-col">Amount</th><th>Sync</th><th aria-label="Actions" /></tr></thead>
            <tbody>
              {filteredExpenses.length ? filteredExpenses.map((item) => {
                const CategoryIcon = categoryIconMap[item.category] || MoreHorizontal;
                return (
                  <tr key={item.local_id}>
                    <td><span className="date-cell">{item.expense_date}</span></td>
                    <td><div className="expense-cell"><strong>{item.title}</strong>{item.note ? <small>{item.note}</small> : null}</div></td>
                    <td><span className="category-pill"><CategoryIcon size={14} />{item.category}</span></td>
                    <td><span className="method-pill">{item.payment_method || 'Cash'}</span></td>
                    <td className="amount-col"><strong>{formatBDT(item.amount)}</strong></td>
                    <td><span className={`sync-badge ${item.sync_status || 'local'}`}><span />{(item.sync_status || 'local').replaceAll('_', ' ')}</span></td>
                    <td><div className="row-actions"><button type="button" title="Edit expense" aria-label={`Edit ${item.title}`} onClick={() => handleEdit(item)}><Pencil size={15} /></button><button type="button" className="danger-action" title="Delete expense" aria-label={`Delete ${item.title}`} onClick={() => setDeleteTarget(item)}><Trash2 size={15} /></button></div></td>
                  </tr>
                );
              }) : <tr><td colSpan="7"><EmptyState title="No matching expenses" text="Change the month or filters, or add a new expense." /></td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="app-footer">
        <div><RotateCcw size={17} /><span>Offline-first: IndexedDB keeps local writes safe until Supabase sync is available.</span></div>
        <div><ShieldCheck size={17} /><span>Cloud rows are protected by Supabase Row Level Security.</span></div>
      </footer>

      {deleteTarget ? (
        <div className="modal-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setDeleteTarget(null); }}>
          <div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-title">
            <div className="modal-icon"><Trash2 size={20} /></div>
            <h3 id="delete-title">Delete this expense?</h3>
            <p><strong>{deleteTarget.title}</strong> · {formatBDT(deleteTarget.amount)}. This will be removed locally and from Supabase on the next successful sync.</p>
            <div className="modal-actions"><button className="secondary-btn" type="button" onClick={() => setDeleteTarget(null)}>Cancel</button><button className="danger-btn" type="button" onClick={confirmDelete}><Trash2 size={16} />Delete expense</button></div>
          </div>
        </div>
      ) : null}

      {toast ? <div className={`toast ${toast.tone}`} role="status"><div>{toast.tone === 'success' ? <Check size={17} /> : <AlertTriangle size={17} />}</div><span>{toast.message}</span><button type="button" aria-label="Dismiss notification" onClick={() => setToast(null)}><X size={15} /></button></div> : null}
    </main>
  );
}

export default App;
