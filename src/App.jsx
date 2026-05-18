import React, { useEffect, useMemo, useState } from 'react';
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
  CalendarDays,
  Cloud,
  CloudOff,
  Database,
  Download,
  FileDown,
  FileSpreadsheet,
  Filter,
  Pencil,
  Plus,
  RefreshCcw,
  RotateCcw,
  Search,
  Trash2,
  Upload,
  Wallet,
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
const chartColors = ['#2563eb', '#16a34a', '#f97316', '#dc2626', '#7c3aed', '#0891b2', '#ca8a04', '#be123c', '#0f766e', '#4b5563', '#9333ea', '#ea580c'];

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

function previousMonth(monthValue) {
  const [year, month] = monthValue.split('-').map(Number);
  const date = new Date(year, month - 2, 1);
  return date.toISOString().slice(0, 7);
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

function StatCard({ icon: Icon, title, value, helper }) {
  return (
    <div className="stat-card">
      <div className="stat-icon"><Icon size={20} /></div>
      <div>
        <p>{title}</p>
        <h3>{value}</h3>
        {helper ? <span>{helper}</span> : null}
      </div>
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

  async function loadExpenses() {
    const rows = await getAllLocalExpenses();
    setExpenses(rows);
  }

  async function runSync() {
    setIsSyncing(true);
    const result = await syncNow();
    setSyncMessage(result.message);
    await loadExpenses();
    setIsSyncing(false);
  }

  useEffect(() => {
    loadExpenses().then(() => {
      if (navigator.onLine && isSupabaseConfigured) runSync();
    });

    function handleOnline() {
      setIsOnline(true);
      if (isSupabaseConfigured) runSync();
    }

    function handleOffline() {
      setIsOnline(false);
      setSyncMessage('Offline mode active. Data will sync later.');
    }

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    localStorage.setItem('monthly_budget', String(monthlyBudget || 0));
  }, [monthlyBudget]);

  const pendingCount = expenses.filter((item) => item.sync_status && item.sync_status !== 'synced').length;

  const monthlyExpenses = useMemo(() => {
    return expenses.filter((item) => item.expense_date?.startsWith(selectedMonth));
  }, [expenses, selectedMonth]);

  const previousMonthExpenses = useMemo(() => {
    const prev = previousMonth(selectedMonth);
    return expenses.filter((item) => item.expense_date?.startsWith(prev));
  }, [expenses, selectedMonth]);

  const filteredExpenses = useMemo(() => {
    return monthlyExpenses.filter((item) => {
      const text = `${item.title} ${item.category} ${item.note || ''} ${item.payment_method || ''}`.toLowerCase();
      const queryMatch = text.includes(query.toLowerCase());
      const categoryMatch = categoryFilter === 'All' || item.category === categoryFilter;
      return queryMatch && categoryMatch;
    });
  }, [monthlyExpenses, query, categoryFilter]);

  const totalSpent = monthlyExpenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const previousTotal = previousMonthExpenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const overallTotal = expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const remaining = Number(monthlyBudget || 0) - totalSpent;
  const budgetUsedPercent = monthlyBudget > 0 ? Math.min((totalSpent / monthlyBudget) * 100, 100) : 0;
  const differenceFromLastMonth = totalSpent - previousTotal;

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

  const topCategory = categoryData[0];

  async function handleSubmit(event) {
    event.preventDefault();
    if (!form.title.trim() || !form.amount || Number(form.amount) <= 0) return;

    const now = new Date().toISOString();

    if (editingId) {
      const existing = await getLocalExpense(editingId);
      if (!existing) return;
      await saveLocalExpense({
        ...existing,
        title: form.title.trim(),
        amount: Number(form.amount),
        category: form.category,
        payment_method: form.payment_method,
        expense_date: form.expense_date,
        note: form.note.trim(),
        updated_at: now,
        sync_status: existing.remote_id ? 'pending_update' : 'pending_create',
      });
    } else {
      await saveLocalExpense({
        local_id: generateLocalId(),
        remote_id: null,
        title: form.title.trim(),
        amount: Number(form.amount),
        category: form.category,
        payment_method: form.payment_method,
        expense_date: form.expense_date,
        note: form.note.trim(),
        created_at: now,
        updated_at: now,
        sync_status: isSupabaseConfigured ? 'pending_create' : 'local_only',
        deleted: false,
      });
    }

    setForm(emptyForm());
    setEditingId(null);
    await loadExpenses();
    if (navigator.onLine && isSupabaseConfigured) await runSync();
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

  async function handleDelete(localId) {
    const item = await getLocalExpense(localId);
    if (!item) return;

    if (item.remote_id && isSupabaseConfigured) {
      await saveLocalExpense({
        ...item,
        deleted: true,
        sync_status: 'pending_delete',
        updated_at: new Date().toISOString(),
      });
    } else {
      await deleteLocalExpense(localId);
    }

    await loadExpenses();
    if (navigator.onLine && isSupabaseConfigured) await runSync();
  }

  async function handleRestore(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    const text = await file.text();
    const payload = JSON.parse(text);
    const rows = Array.isArray(payload) ? payload : payload.expenses || [];
    const now = new Date().toISOString();

    const cleanRows = rows.map((item) => ({
      local_id: generateLocalId(),
      remote_id: null,
      title: item.title || 'Imported expense',
      amount: Number(item.amount || 0),
      category: categories.includes(item.category) ? item.category : 'Other',
      payment_method: item.payment_method || 'Cash',
      expense_date: item.expense_date || item.date || todayDate(),
      note: item.note || '',
      created_at: now,
      updated_at: now,
      sync_status: isSupabaseConfigured ? 'pending_create' : 'local_only',
      deleted: false,
    }));

    await bulkSaveLocalExpenses(cleanRows);
    await loadExpenses();
    setSyncMessage(`Imported ${cleanRows.length} records.`);
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <span className="eyebrow">Offline first personal finance app</span>
          <h1>Personal Expense Manager</h1>
          <p>
            Track monthly khoroch like meal, jatayat, rent, utility, snacks, phone load and game topup with reports, charts and cloud sync.
          </p>
        </div>
        <div className="status-panel">
          <div className={`status-pill ${isOnline ? 'online' : 'offline'}`}>
            {isOnline ? <Cloud size={16} /> : <CloudOff size={16} />}
            {isOnline ? 'Online' : 'Offline'}
          </div>
          <div className="status-pill neutral">
            <Database size={16} />
            {isSupabaseConfigured ? 'Supabase connected' : 'Local only'}
          </div>
          <button onClick={runSync} disabled={isSyncing || !isOnline} className="sync-btn">
            <RefreshCcw size={16} className={isSyncing ? 'spin' : ''} />
            {isSyncing ? 'Syncing' : 'Sync Now'}
          </button>
        </div>
      </section>

      <section className="grid stats-grid">
        <StatCard icon={Wallet} title="This Month" value={formatBDT(totalSpent)} helper={`${monthlyExpenses.length} entries`} />
        <StatCard icon={Activity} title="Budget Left" value={formatBDT(remaining)} helper={`${budgetUsedPercent.toFixed(0)}% budget used`} />
        <StatCard icon={CalendarDays} title="Overall Total" value={formatBDT(overallTotal)} helper={`${expenses.length} lifetime entries`} />
        <StatCard icon={Database} title="Sync Queue" value={String(pendingCount)} helper={syncMessage} />
      </section>

      <section className="content-grid">
        <div className="card form-card">
          <div className="section-title">
            <div>
              <h2>{editingId ? 'Update Expense' : 'Add New Expense'}</h2>
              <p>Save data offline first. Cloud sync will happen when internet is available.</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="expense-form">
            <label>
              Expense Title
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Example: Cold drinks" />
            </label>

            <label>
              Amount
              <input type="number" min="0" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="Example: 80" />
            </label>

            <label>
              Category
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                {categories.map((category) => <option key={category}>{category}</option>)}
              </select>
            </label>

            <label>
              Payment Method
              <select value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}>
                {paymentMethods.map((method) => <option key={method}>{method}</option>)}
              </select>
            </label>

            <label>
              Date
              <input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} />
            </label>

            <label className="full">
              Note
              <textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Optional note" />
            </label>

            <div className="form-actions full">
              <button type="submit" className="primary-btn">
                <Plus size={18} />
                {editingId ? 'Update Expense' : 'Add Expense'}
              </button>
              {editingId ? (
                <button type="button" className="ghost-btn" onClick={() => { setEditingId(null); setForm(emptyForm()); }}>
                  Cancel Edit
                </button>
              ) : null}
            </div>
          </form>
        </div>

        <div className="card report-card">
          <div className="section-title">
            <div>
              <h2>Report Settings</h2>
              <p>Select month and download reports.</p>
            </div>
          </div>

          <div className="settings-stack">
            <label>
              Month
              <input type="month" value={selectedMonth} onChange={(e) => setSelectedMonth(e.target.value)} />
            </label>
            <label>
              Monthly Budget
              <input type="number" min="0" value={monthlyBudget} onChange={(e) => setMonthlyBudget(Number(e.target.value))} />
            </label>
          </div>

          <div className="budget-bar">
            <span style={{ width: `${budgetUsedPercent}%` }} />
          </div>

          <div className="mini-summary">
            <p>Top category: <strong>{topCategory ? `${topCategory.category} - ${formatBDT(topCategory.amount)}` : 'N/A'}</strong></p>
            <p>Previous month difference: <strong>{formatBDT(differenceFromLastMonth)}</strong></p>
          </div>

          <div className="download-grid">
            <button onClick={() => exportPDF(filteredExpenses, `${selectedMonth}-monthly-expense-report`)}><FileDown size={16} /> PDF</button>
            <button onClick={() => exportExcel(filteredExpenses, `${selectedMonth}-monthly-expense-report`)}><FileSpreadsheet size={16} /> Excel</button>
            <button onClick={() => exportCSV(filteredExpenses, `${selectedMonth}-monthly-expense-report`)}><Download size={16} /> CSV</button>
            <button onClick={() => exportJSON(expenses, 'expense-manager-backup')}><Download size={16} /> Backup</button>
            <button onClick={() => exportPDF(expenses, 'overall-expense-report')}><FileDown size={16} /> Overall PDF</button>
            <button onClick={() => exportExcel(expenses, 'overall-expense-report')}><FileSpreadsheet size={16} /> Overall Excel</button>
            <label className="restore-btn">
              <Upload size={16} /> Restore JSON
              <input type="file" accept="application/json" onChange={handleRestore} />
            </label>
          </div>
        </div>
      </section>

      <section className="chart-grid">
        <div className="card chart-card">
          <div className="section-title">
            <div>
              <h2>Category Analytics</h2>
              <p>See where most of your money goes.</p>
            </div>
          </div>
          <div className="chart-box">
            {categoryData.length ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={categoryData} dataKey="amount" nameKey="category" innerRadius={60} outerRadius={100} paddingAngle={3}>
                    {categoryData.map((_, index) => <Cell key={index} fill={chartColors[index % chartColors.length]} />)}
                  </Pie>
                  <Tooltip formatter={(value) => formatBDT(value)} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : <div className="empty-state">No data for this month yet.</div>}
          </div>
        </div>

        <div className="card chart-card">
          <div className="section-title">
            <div>
              <h2>Daily Spending</h2>
              <p>Track daily spending pattern for the selected month.</p>
            </div>
          </div>
          <div className="chart-box">
            {dailyData.length ? (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={dailyData}>
                  <defs>
                    <linearGradient id="amountGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563eb" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="#2563eb" stopOpacity={0.03} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="day" />
                  <YAxis />
                  <Tooltip formatter={(value) => formatBDT(value)} />
                  <Area type="monotone" dataKey="amount" stroke="#2563eb" fill="url(#amountGradient)" strokeWidth={3} />
                </AreaChart>
              </ResponsiveContainer>
            ) : <div className="empty-state">No daily data yet.</div>}
          </div>
        </div>
      </section>

      <section className="card">
        <div className="section-title table-heading">
          <div>
            <h2>Expense Records</h2>
            <p>Search, filter, edit and delete your monthly records.</p>
          </div>
          <div className="filter-row">
            <div className="search-box">
              <Search size={16} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search expense" />
            </div>
            <div className="select-box">
              <Filter size={16} />
              <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}>
                <option>All</option>
                {categories.map((category) => <option key={category}>{category}</option>)}
              </select>
            </div>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Title</th>
                <th>Category</th>
                <th>Method</th>
                <th>Amount</th>
                <th>Sync</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredExpenses.length ? filteredExpenses.map((item) => (
                <tr key={item.local_id}>
                  <td>{item.expense_date}</td>
                  <td>
                    <strong>{item.title}</strong>
                    {item.note ? <small>{item.note}</small> : null}
                  </td>
                  <td>{item.category}</td>
                  <td>{item.payment_method || 'Cash'}</td>
                  <td>{formatBDT(item.amount)}</td>
                  <td><span className={`sync-badge ${item.sync_status}`}>{item.sync_status || 'local'}</span></td>
                  <td>
                    <div className="row-actions">
                      <button onClick={() => handleEdit(item)}><Pencil size={15} /></button>
                      <button onClick={() => handleDelete(item.local_id)}><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="7"><div className="empty-state">No expenses found for this filter.</div></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card bottom-note">
        <RotateCcw size={18} />
        <p>
          Offline workflow: every entry is saved to IndexedDB first. When Supabase is configured and internet returns, pending entries are pushed to Supabase and cloud records are pulled back to the local database.
        </p>
      </section>
    </main>
  );
}

export default App;
