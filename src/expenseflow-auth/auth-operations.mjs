/**
 * ExpenseFlow authentication operations.
 * Always pass the app's EXISTING Supabase client: do not create a second client.
 * No passwords, tokens, or API secrets are written to localStorage here.
 */
export function publicAuthRedirect(origin) {
  const base = new URL(origin);
  if (!['https:', 'http:'].includes(base.protocol)) throw new Error('Invalid site URL');
  return `${base.origin}/`;
}

export function isAnonymousUser(user) {
  return Boolean(user?.is_anonymous ?? user?.app_metadata?.provider === 'anonymous');
}

export function validateEmail(value) {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) && value.length <= 254;
}

export function validatePassword(value) {
  return typeof value === 'string' && value.length >= 10 && value.length <= 128;
}

function assertValidEmail(email) {
  if (!validateEmail(email)) throw new Error('Enter a valid email address.');
  return email.trim().toLowerCase();
}
function assertValidPassword(password) {
  if (!validatePassword(password)) throw new Error('Use a password between 10 and 128 characters.');
}
function unwrap(result) {
  if (result?.error) throw result.error;
  return result?.data ?? null;
}

/** Email registration. For anonymous users, first links email to SAME user ID.
 * After confirmation email is verified, call finishEmailUpgrade(password).
 */
export async function registerEmail(supabase, { email, password, redirectTo }) {
  const validEmail = assertValidEmail(email);
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr && userErr.status !== 400) throw userErr;
  const current = userData?.user;
  if (current && isAnonymousUser(current)) {
    unwrap(await supabase.auth.updateUser({ email: validEmail }, { emailRedirectTo: redirectTo }));
    return { status: 'upgrade-email-sent', message: 'Check your email, confirm the address, then return and use Set password. Your existing Supabase user ID is preserved.' };
  }
  if (current) throw new Error('Already signed in. Sign out first if you want to register a different account.');
  assertValidPassword(password);
  const data = unwrap(await supabase.auth.signUp({ email: validEmail, password, options: { emailRedirectTo: redirectTo } }));
  return { status: data?.session ? 'signed-in' : 'confirmation-sent', message: data?.session ? 'Account created.' : 'Check your email for a confirmation link.' };
}

export async function finishEmailUpgrade(supabase, password) {
  assertValidPassword(password);
  const user = unwrap(await supabase.auth.getUser())?.user;
  if (!user?.email) throw new Error('Verify your email address before setting your password.');
  unwrap(await supabase.auth.updateUser({ password }));
  return { status: 'password-updated', message: 'Password saved. You can now sign in with your email.' };
}

/** Switching accounts must be preceded by a host-app backup/isolation check. */
export async function signInEmail(supabase, { email, password, beforeSwitch }) {
  const validEmail = assertValidEmail(email);
  if (!password) throw new Error('Enter your password.');
  const current = unwrap(await supabase.auth.getSession())?.session?.user;
  if (current) {
    if (typeof beforeSwitch !== 'function') throw new Error('Account switching is blocked until ExpenseFlow data isolation/backup has been configured.');
    await beforeSwitch(current);
  }
  unwrap(await supabase.auth.signInWithPassword({ email: validEmail, password }));
  return { status: 'signed-in' };
}

export async function signInGoogle(supabase, { redirectTo, beforeSwitch, intent = 'sign-in' }) {
  const user = unwrap(await supabase.auth.getSession())?.session?.user;
  if (intent === 'link' && user) {
    const response = unwrap(await supabase.auth.linkIdentity({ provider: 'google', options: { redirectTo } }));
    // Supabase linkIdentity returns an authorization URL. Unlike signInWithOAuth,
    // identity-linking may not automatically navigate the browser.
    if (response?.url && typeof window !== 'undefined') window.location.assign(response.url);
    return { status: 'redirecting', message: 'Connecting Google to your current ExpenseFlow account.' };
  }
  if (user) {
    if (typeof beforeSwitch !== 'function') throw new Error('Account switching is blocked until ExpenseFlow data isolation/backup has been configured. Use Connect Google to preserve an anonymous account.');
    await beforeSwitch(user);
  }
  unwrap(await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } }));
  return { status: 'redirecting' };
}

export async function requestPasswordReset(supabase, { email, redirectTo }) {
  const validEmail = assertValidEmail(email);
  unwrap(await supabase.auth.resetPasswordForEmail(validEmail, { redirectTo }));
  return { status: 'reset-sent', message: 'If this address has an account, a password-reset email will be sent.' };
}

export async function updatePassword(supabase, password) {
  assertValidPassword(password);
  unwrap(await supabase.auth.updateUser({ password }));
  return { status: 'password-updated', message: 'Your password has been updated.' };
}

export async function signOut(supabase, { beforeSwitch }) {
  const current = unwrap(await supabase.auth.getSession())?.session?.user;
  if (current) {
    if (typeof beforeSwitch !== 'function') throw new Error('Sign-out is blocked until ExpenseFlow data isolation and backup have been configured.');
    await beforeSwitch(current);
  }
  unwrap(await supabase.auth.signOut());
  return { status: 'signed-out' };
}
