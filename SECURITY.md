# Security review — ExpenseFlow v2

## Threat model

This is a browser-based personal finance tracker. Expense data exists in two places:

1. IndexedDB on the user's device for offline-first operation.
2. Supabase Postgres for cloud sync, protected by Supabase Auth and Row Level Security.

The frontend intentionally contains a Supabase **publishable** key. That key is not a secret; authorization must be enforced by database grants and RLS. Never place a Supabase secret/service-role key in this project.

## Changes in v2

### Database authorization

- `anon` table privileges are explicitly revoked.
- `authenticated` gets only select/insert/update/delete on `public.expenses`.
- Separate RLS policies enforce `auth.uid() = user_id` for all four CRUD operations.
- Cloud pulls and deletes additionally include an explicit `user_id` filter as defense in depth.
- RLS is enabled and forced on `public.expenses`.

### Input and import boundaries

- Title, note, amount, date, category and payment method are validated before local writes.
- JSON restore is limited to 5 MB and 10,000 rows.
- Imported amount/date values are validated before any bulk insert.
- Database constraints bound text fields for new/updated rows.

### Export safety

CSV/Excel text cells beginning with formula-control characters (`=`, `+`, `-`, `@`, tab, carriage return) are prefixed before export to reduce spreadsheet formula injection risk.

### Service worker / offline cache

The previous worker could consider every GET request for caching. v2 caches only same-origin static assets. Supabase, authentication and all cross-origin responses are never written to Cache Storage.

### Browser headers

`vercel.json` adds:

- Content-Security-Policy
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Referrer-Policy
- Permissions-Policy
- Cross-Origin-Opener-Policy

The CSP permits Supabase HTTPS/WSS connections and blocks objects/frames and unexpected resource origins.

### Secrets and builds

- `.env` and `.env.*` are Git-ignored.
- `.env.example` contains placeholders only.
- Top-level dependency versions are pinned instead of floating on `latest`.
- The known-vulnerable npm-registry `xlsx@0.18.5` dependency was replaced with the official SheetJS `xlsx@0.20.3` tarball from the SheetJS CDN.

## Deployment checklist

- [ ] Run `supabase/security-upgrade.sql` on the existing Supabase project.
- [ ] Confirm Anonymous Sign-ins remains enabled.
- [ ] Confirm only the publishable/anon key is used in Vercel.
- [ ] Confirm no `.env` file is committed to Git.
- [ ] Deploy and verify CSP does not report blocked required resources.
- [ ] Add a test expense and confirm it appears in Supabase.
- [ ] Edit it, delete it, refresh, then verify sync in both directions.
- [ ] Switch offline, add an expense, reconnect, and verify it syncs.
- [ ] Download CSV/Excel/PDF/JSON and open each file.
- [ ] Keep a JSON backup before database migrations.

## Remaining design limitation

Anonymous Auth preserves the original no-login experience but is not a recoverable multi-device identity. For long-term personal-finance use, an optional account-linking flow (email magic link or OAuth) is the logical next security/recovery improvement, but it is intentionally not part of this update because it would change a core workflow.
