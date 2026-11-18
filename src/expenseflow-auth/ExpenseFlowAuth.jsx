import React, { useEffect, useState } from 'react';
import {
  finishEmailUpgrade, isAnonymousUser, registerEmail,
  requestPasswordReset, signInEmail, signInGoogle, signOut, updatePassword
} from './auth-operations.mjs';
import './ExpenseFlowAuth.css';

function Field({ label, ...props }) {
  return <label className="efa-field"><span>{label}</span><input {...props} /></label>;
}

/**
 * Authentication UI for ExpenseFlow.
 * Props:
 *  supabase          - EXISTING shared Supabase client used for expense data
 *  onBeforeSwitch    - async (currentUser) => ...; MUST preserve/segregate IndexedDB
 *                      and sync data BEFORE switching or signing out
 *  onAuthenticated   - callback after successfully signing in
 *  onClose           - optional callback when used as a dialog
 *
 * Integrate into the existing app only after user-specific IndexedDB and
 * Supabase RLS behavior are reviewed. Does not change finance records itself.
 */
export default function ExpenseFlowAuth({ supabase, onBeforeSwitch, onAuthenticated, onClose, initialMode }) {
  const [mode, setMode] = useState(initialMode || (onClose ? 'account' : 'sign-in'));
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const redirectTo = `${window.location.origin}/app`;
  const isGuest = isAnonymousUser(user);
  const needsSignupPassword = mode === 'sign-up' && !isGuest;

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data }) => {
      if (active) { setUser(data?.user ?? null); setLoading(false); }
    }).catch(err => { if (active) { setError(err?.message ?? 'Unable to load account.'); setLoading(false); } });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      setUser(session?.user ?? null);
      if (event === 'PASSWORD_RECOVERY') setMode('new-password');
    });
    return () => { active = false; data?.subscription?.unsubscribe(); };
  }, [supabase]);

  const changeMode = next => { setMode(next); setError(''); setNotice(''); setPassword(''); setConfirm(''); };
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setError(''); setNotice(''); setBusy(true);
    try {
      if ((needsSignupPassword || ['new-password', 'set-password'].includes(mode)) && password !== confirm) {
        throw new Error('Passwords do not match.');
      }
      let result;
      if (mode === 'sign-in') result = await signInEmail(supabase, { email, password, beforeSwitch: onBeforeSwitch });
      else if (mode === 'sign-up') result = await registerEmail(supabase, { email, password, redirectTo });
      else if (mode === 'forgot') result = await requestPasswordReset(supabase, { email, redirectTo });
      else if (mode === 'set-password') result = await finishEmailUpgrade(supabase, password);
      else if (mode === 'new-password') result = await updatePassword(supabase, password);
      setNotice(result?.message || 'Success.');
      if (result?.status === 'upgrade-email-sent' && user?.id) {
        sessionStorage.setItem('expenseflow_pending_upgrade', user.id);
      }
      if (result?.status === 'signed-in') onAuthenticated?.();
      if (result?.status === 'password-updated') {
        const wasRecovery = mode === 'new-password';
        setMode('account'); setPassword(''); setConfirm('');
        if (wasRecovery) onAuthenticated?.();
      }
    } catch (err) { setError(err?.message ?? 'Authentication failed.'); }
    finally { setBusy(false); }
  }
  async function google(intent) {
    setBusy(true); setError(''); setNotice('');
    try {
      await signInGoogle(supabase, { redirectTo, beforeSwitch: onBeforeSwitch, intent });
      setNotice('Redirecting to Google…');
    } catch (err) { setError(err?.message ?? 'Google authentication failed.'); }
    finally { setBusy(false); }
  }
  async function logout() {
    setBusy(true); setError('');
    try { await signOut(supabase, { beforeSwitch: onBeforeSwitch }); changeMode('sign-in'); }
    catch (err) { setError(err?.message ?? 'Could not sign out.'); }
    finally { setBusy(false); }
  }
  const isAccount = mode === 'account';
  const title = ({'sign-in':'Welcome back','sign-up':isGuest?'Save your guest account':'Create your account','forgot':'Reset password','set-password':'Set account password','new-password':'Choose a new password','account':'Your account'})[mode];
  return <section className="efa-wrap" aria-label="ExpenseFlow account">
    <div className="efa-card">
      <header className="efa-heading">
        <div className="efa-mark" aria-hidden="true">E</div>
        <div><div className="efa-brand">ExpenseFlow</div><div className="efa-kicker">Your finances. Your account.</div></div>
        {onClose && <button type="button" className="efa-close" onClick={onClose} aria-label="Close authentication">×</button>}
      </header>
      <h2>{title}</h2>
      <p className="efa-lead">{loading?'Checking account…':isGuest?'You have a guest account. Connect Google or verify an email to keep the same Supabase account ID.':'Secure access to your expense tracker.'}</p>
      {error && <p className="efa-alert efa-error" role="alert">{error}</p>}
      {notice && <p className="efa-alert efa-info" role="status">{notice}</p>}
      {!loading && isAccount && <div className="efa-stack">
        <p className="efa-account">{user?.email || (isGuest ? 'Guest account' : 'Not signed in')}</p>
        {isGuest && <p className="efa-hint">To keep your guest data, connect Google or verify an email address. After verifying your email, return here to set a password. Do not switch accounts without a backup.</p>}
        {user && <button className="efa-google" disabled={busy} onClick={() => google('link')} type="button"><span aria-hidden="true">G</span> Connect Google to this account</button>}
        {isGuest && <button className="efa-secondary" onClick={() => changeMode(user.email ? 'set-password' : 'sign-up')} type="button">{user.email ? 'Finish setting a password' : 'Save with email'}</button>}
        {user?.email && !isGuest && <button className="efa-secondary" onClick={() => changeMode('set-password')} type="button">Set / change password</button>}
        <button className="efa-secondary" disabled={busy} onClick={logout} type="button">Sign out (after backup)</button>
      </div>}
      {!loading && !isAccount && <>
        <form className="efa-stack" onSubmit={submit}>
          {['sign-in','sign-up','forgot'].includes(mode) && <Field label="Email address" type="email" inputMode="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" />}
          {(['sign-in','set-password','new-password'].includes(mode) || needsSignupPassword) && <Field label="Password" type="password" autoComplete={mode==='sign-in'?'current-password':'new-password'} minLength={mode==='sign-in'?1:10} maxLength={128} required value={password} onChange={e=>setPassword(e.target.value)} placeholder="Enter your password" />}
          {(needsSignupPassword || ['set-password','new-password'].includes(mode)) && <Field label="Confirm password" type="password" autoComplete="new-password" minLength={10} maxLength={128} required value={confirm} onChange={e=>setConfirm(e.target.value)} placeholder="Repeat password" />}
          {mode==='sign-in' && <button className="efa-text" type="button" onClick={()=>changeMode('forgot')}>Forgot your password?</button>}
          <button className="efa-primary" disabled={busy || loading} type="submit">{busy?'Please wait…':({'sign-in':'Sign in','sign-up':isGuest?'Send verification email':'Create account','forgot':'Send reset email','set-password':'Save password','new-password':'Update password'})[mode]}</button>
        </form>
        {['sign-in','sign-up'].includes(mode) && <><div className="efa-divider"><span>or</span></div>
          {isGuest && <button className="efa-google" disabled={busy} onClick={()=>google('link')} type="button"><span aria-hidden="true">G</span> Connect Google and keep my data</button>}
          <button className="efa-google" disabled={busy} onClick={()=>google('sign-in')} type="button"><span aria-hidden="true">G</span> Continue with Google {isGuest?'(different account)':''}</button>
        </>}
        <div className="efa-footer">
          {mode==='sign-in' && <button className="efa-text" type="button" onClick={()=>changeMode('sign-up')}>Don't have an account? Sign up</button>}
          {mode==='sign-up' && <button className="efa-text" type="button" onClick={()=>changeMode('sign-in')}>Already registered? Sign in</button>}
          {!['sign-in','sign-up'].includes(mode) && <button className="efa-text" type="button" onClick={()=>changeMode('sign-in')}>Back to sign in</button>}
          {user && <button className="efa-text" type="button" onClick={()=>changeMode('account')}>Account options</button>}
        </div>
      </>}
      {!loading && !isGuest && user && !isAccount && <button type="button" className="efa-text efa-account-link" onClick={()=>changeMode('account')}>Manage signed-in account</button>}
      <p className="efa-privacy">Your passwords are handled by Supabase Auth, not stored by this interface.</p>
    </div>
  </section>;
}
