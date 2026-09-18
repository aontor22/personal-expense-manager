# ExpenseFlow — Personal Expense Manager v2

Offline-first personal monthly expense tracker with Supabase cloud sync, IndexedDB local storage, analytics, PDF/Excel/CSV reports and JSON backup/restore.

This v2 upgrade preserves the existing expense workflow and data model while hardening security, sync behavior and the UI.

## Existing core functionality preserved

- Add, edit and delete expenses
- Monthly categories and payment methods
- Monthly budget tracking
- Search and category filters
- Monthly and overall analytics
- PDF, Excel and CSV downloads
- JSON backup and restore
- IndexedDB offline-first storage
- Supabase cloud sync
- Automatic sync when internet returns
- PWA offline shell
- Anonymous Supabase Auth + per-user RLS

## v2 additions

- New responsive visual design with light/dark mode
- Daily, category and payment-method analytics
- Safer delete confirmation and status toasts
- Import validation and file-size/row limits
- CSV/Excel formula-injection protection
- Same-origin-only service-worker caching (Supabase/API responses are never cached)
- Explicit Supabase grants + hardened RLS migration
- Database input-length constraints and query indexes
- Sync timeout protection and explicit user-scoped cloud reads/deletes
- Vercel CSP and security headers
- `.env` ignored by Git; only `.env.example` is distributed
- Pinned top-level package versions instead of floating `latest` dependencies
- Moved XLSX generation to the official SheetJS `xlsx@0.20.3` tarball from the SheetJS CDN, avoiding the vulnerable npm-registry `xlsx@0.18.5` release while preserving the existing export format

## Important upgrade steps for your existing live app

### 1. Back up first

From the current app, download **Backup JSON**. Do not delete your current Supabase project or `expenses` table.

### 2. Upgrade the existing Supabase database

Open Supabase **SQL Editor** and run:

```text
supabase/security-upgrade.sql
```

This migration keeps your existing rows. It rebuilds the same per-user RLS rules, explicitly revokes unauthenticated table access, grants CRUD only to `authenticated`, adds indexes, and adds non-destructive input constraints.

Do **not** run `schema.sql` over your existing production project as your normal upgrade path; `schema.sql` is intended for a fresh Supabase project.

### 3. Keep Anonymous Sign-ins enabled

Supabase Dashboard:

```text
Authentication → Sign In / Providers → Allow anonymous sign-ins → ON
```

The app still uses the same anonymous-auth model, so existing user/session behavior is preserved.

### 4. Environment variables

Copy `.env.example` to `.env` for local development:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-publishable-key
```

Use only the Supabase publishable/anon browser key. Never place a `secret` or `service_role` key in a `VITE_*` variable.

For Vercel, keep the same two variables under **Project Settings → Environment Variables** and redeploy.

## Run locally

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
npm run preview
```

## Fresh Supabase setup

For a brand-new database only:

1. Create a Supabase project.
2. Open SQL Editor.
3. Run `supabase/schema.sql`.
4. Enable Anonymous Sign-ins.
5. Configure the two `VITE_SUPABASE_*` variables.

## Offline behavior

Every expense write goes to IndexedDB first. If Supabase is configured and the browser is online, pending local records sync to the user's RLS-protected cloud rows. If the browser is offline or cloud sync fails, the local records remain available and are retried later.

The service worker caches only same-origin static app assets. Supabase, authentication and other cross-origin responses are intentionally excluded from Cache Storage.

## Anonymous-user limitation

An anonymous Supabase account is tied to the browser session. If a user clears browser/site data, signs out, or moves to another device, they cannot recover that anonymous identity automatically. Add email/password, magic-link or OAuth account linking later if cross-device recovery becomes a requirement.

## Security notes

See `SECURITY.md` for the v2 security review and deployment checklist.
