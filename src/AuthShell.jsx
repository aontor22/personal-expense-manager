import React, { useCallback, useEffect, useState } from 'react';
import { ArrowRight, Cloud, FileBarChart2, LockKeyhole, ShieldCheck, Wallet, CloudOff, TrendingUp } from 'lucide-react';
import App from './App.jsx';
import ExpenseFlowAuth from './expenseflow-auth/ExpenseFlowAuth.jsx';
import { isAnonymousUser } from './expenseflow-auth/auth-operations.mjs';
import { expenseStoreForUser, getLegacyImportStatus, importLegacyForUser } from './lib/idb';
import { isSupabaseConfigured, supabase } from './lib/supabase';
import { syncNow } from './lib/sync';
import { exportJSON } from './lib/exporters';
import './auth-shell.css';

const APP_ROUTE = '/app';
const isAppRoute = () => location.pathname === APP_ROUTE || location.pathname === `${APP_ROUTE}/`;

function PublicHomepage() {
  return <div className="ef-public">
    <header className="ef-public-header">
      <a className="ef-public-brand" href="/" aria-label="ExpenseFlow home"><span className="ef-public-logo"><Wallet size={22} /></span><strong>ExpenseFlow</strong></a>
      <nav aria-label="Main navigation"><a href="/features.html">Features</a><a className="ef-public-login" href={APP_ROUTE}>Open dashboard <ArrowRight size={15}/></a></nav>
    </header>
    <main>
      <section className="ef-public-hero">
        <span className="ef-public-eyebrow"><ShieldCheck size={15}/> Personal finance, simplified</span>
        <h1>Keep your expenses clear. Keep your money in view.</h1>
        <p>Track daily spending, plan monthly budgets, and understand where your money goes with a beautifully simple expense tracker. Sign in with email or Google, or start as a guest.</p>
        <div className="ef-public-actions"><a className="ef-public-primary" href={APP_ROUTE}>Start tracking <ArrowRight size={18}/></a><a className="ef-public-secondary" href="/features.html">Explore features</a></div>
        <span className="ef-public-footnote"><LockKeyhole size={14}/> Private accounts · Supabase cloud sync · Offline-first records</span>
      </section>
      <section className="ef-public-features" aria-label="Product features">
        <article><span><Wallet size={23}/></span><h2>Track daily expenses</h2><p>Save transactions by category, date and payment method.</p></article>
        <article><span><TrendingUp size={23}/></span><h2>Plan monthly budgets</h2><p>Review progress, charts, spending patterns and summaries.</p></article>
        <article><span><CloudOff size={23}/></span><h2>Offline and cloud-ready</h2><p>Local-first storage with optional account-protected Supabase sync.</p></article>
        <article><span><FileBarChart2 size={23}/></span><h2>Export your records</h2><p>Back up or download reports as JSON, PDF, Excel and CSV.</p></article>
      </section>
    </main>
    <footer className="ef-public-footer">ExpenseFlow · <a href="/features.html">Features & how it works</a></footer>
  </div>;
}

function OfflineSetup() {
  return <div className="ef-status-page"><Wallet size={36}/><h1>Authentication setup needed</h1><p>Configure <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in Vercel to use Email or Google Sign In.</p><a href="/">Return to homepage</a></div>;
}

export default function AuthShell() {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(!isSupabaseConfigured);
  const [error, setError] = useState('');
  const [busyGuest, setBusyGuest] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [recoverPassword, setRecoverPassword] = useState(false);
  const [legacy, setLegacy] = useState({ count: 0 });
  const [migrating, setMigrating] = useState(false);
  const [upgradeReminder, setUpgradeReminder] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let mounted = true;
    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      if (event === 'PASSWORD_RECOVERY') setRecoverPassword(true);
      setReady(true);
    });
    supabase.auth.getSession().then(({ data: current, error: authError }) => {
      if (!mounted) return;
      if (authError) setError(authError.message);
      setSession(current?.session ?? null);
      setReady(true);
    }).catch((err) => { if (mounted) { setError(err.message); setReady(true); } });
    return () => { mounted = false; data.subscription.unsubscribe(); };
  }, []);

  const userId = session?.user?.id;
  useEffect(() => {
    if (!userId || !isAppRoute()) return;
    const pending = sessionStorage.getItem('expenseflow_pending_upgrade');
    if (pending === userId && !isAnonymousUser(session?.user)) setUpgradeReminder(true);
    let active = true;
    getLegacyImportStatus(userId).then((result) => { if (active) setLegacy(result); })
      .catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [userId]);

  useEffect(() => {
    if (!isAppRoute()) return;
    const meta = document.querySelector('meta[name="robots"]');
    const old = meta?.content;
    if (meta) meta.content = 'noindex,nofollow';
    document.title = 'My Expenses | ExpenseFlow';
    return () => { if (meta && old) meta.content = old; };
  }, []);

  const beforeSwitch = useCallback(async (currentUser) => {
    if (!currentUser?.id) return;
    const store = expenseStoreForUser(currentUser.id);
    if (isAnonymousUser(currentUser)) {
      const rows = await store.getAllLocalExpenses();
      const legacyStatus = await getLegacyImportStatus(currentUser.id);
      if (rows.length || legacyStatus.count) {
        const proceed = window.confirm('This is a guest account. Signing into another account can make guest data inaccessible. Connect Google or register with email to keep this guest account. To change accounts instead, you must download a JSON backup first. Download a backup and continue?');
        if (!proceed) throw new Error('Account change cancelled. Your guest data is safe.');
        if (legacyStatus.count) throw new Error('Please first import your old browser expenses using the recovery banner, then try again.');
        exportJSON(rows, 'expenseflow-guest-backup-before-switch');
        if (!window.confirm('Your guest JSON backup was requested. Make sure it downloaded successfully. Switch accounts now?')) {
          throw new Error('Account change cancelled.');
        }
      }
    }
    // Writes stay in this immutable, account-specific local store, even if cloud is offline.
    if (navigator.onLine) await syncNow(currentUser.id);
  }, []);

  async function createGuest() {
    if (!supabase || busyGuest) return;
    setBusyGuest(true);
    setError('');
    try {
      const { data, error: authError } = await supabase.auth.signInAnonymously();
      if (authError) throw authError;
      if (!data?.user?.id) throw new Error('Could not create a guest session.');
    } catch (err) { setError(err.message || 'Guest mode unavailable.'); }
    finally { setBusyGuest(false); }
  }
  async function importOldData() {
    if (!userId || migrating) return;
    if (!window.confirm('Import the old local expenses into this signed-in account? Choose this only if the old records belong to you. An original copy will remain on this browser.')) return;
    setMigrating(true);
    setError('');
    try {
      const count = await importLegacyForUser(userId);
      const budget = localStorage.getItem('monthly_budget');
      if (budget !== null && !localStorage.getItem(`monthly_budget:user:${userId}`)) {
        localStorage.setItem(`monthly_budget:user:${userId}`, budget);
      }
      setLegacy({ count: 0 });
      if (count) location.reload();
    } catch (err) { setError(err.message || 'Unable to import the old data.'); }
    finally { setMigrating(false); }
  }

  if (!isAppRoute()) return <PublicHomepage />;
  if (!isSupabaseConfigured) return <OfflineSetup />;
  if (!ready) return <div className="ef-status-page" role="status"><Cloud size={29}/><p>Checking your secure session…</p></div>;
  if (!session?.user || recoverPassword) return <div className="ef-auth-view">
    {error && <div className="ef-auth-top-error" role="alert">{error}</div>}
    <ExpenseFlowAuth key={recoverPassword ? 'recovery' : 'signin'} supabase={supabase} initialMode={recoverPassword ? 'new-password' : 'sign-in'} onBeforeSwitch={beforeSwitch} onAuthenticated={() => setRecoverPassword(false)} />
    {!recoverPassword && <div className="ef-guest-choice"><span>Not ready to create an account?</span><button type="button" onClick={createGuest} disabled={busyGuest}>{busyGuest ? 'Starting guest session…' : 'Continue as guest'}</button></div>}
  </div>;

  return <>
    {error && <div className="ef-auth-top-error" role="alert">{error}<button type="button" onClick={() => setError('')}>Dismiss</button></div>}
    {upgradeReminder && <div className="ef-legacy-banner"><div><strong>Finish securing your email account</strong><p>Your email is now linked. Set an account password to use email sign-in on other devices.</p></div><button type="button" onClick={() => { setAccountOpen(true); setUpgradeReminder(false); sessionStorage.removeItem('expenseflow_pending_upgrade'); }}>Set password</button></div>}
    {legacy.count > 0 && <div className="ef-legacy-banner"><div><strong>Old browser expenses found</strong><p>These records are still in the previous local database, not yet attached to your current account. Only import them if they belong to you.</p></div><button type="button" disabled={migrating} onClick={importOldData}>{migrating ? 'Importing…' : 'Restore my old expenses'}</button></div>}
    <App key={userId} user={session.user} onOpenAccount={() => setAccountOpen(true)} />
    {accountOpen && <div className="ef-account-overlay" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) setAccountOpen(false); }}><div className="ef-account-modal" role="dialog" aria-modal="true" aria-label="Account settings"><ExpenseFlowAuth supabase={supabase} onClose={() => setAccountOpen(false)} onBeforeSwitch={beforeSwitch} onAuthenticated={() => setAccountOpen(false)}/></div></div>}
  </>;
}
