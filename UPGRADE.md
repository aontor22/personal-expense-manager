# Safe upgrade from v1 to v2

This release is designed to keep the existing `public.expenses` table, anonymous Supabase Auth workflow, IndexedDB records, sync states and report/backup features.

## Recommended rollout

1. In the current live app, download a JSON backup.
2. In Supabase SQL Editor, run `supabase/security-upgrade.sql` once. Do not run `schema.sql` as the normal migration for the existing production database.
3. Keep **Allow anonymous sign-ins** enabled.
4. Keep the same Vercel environment variables: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (publishable key only).
5. Deploy v2 to a Vercel Preview first.
6. Test add, edit, delete, month filtering, budget, online sync, offline add/reconnect sync, PDF, Excel, CSV, JSON backup and JSON restore.
7. After the preview passes, promote/deploy to Production.

## Existing data

The migration does not delete, rename or recreate the `expenses` table. It adds/refreshes authorization policies, grants, indexes, non-destructive constraints and the update timestamp trigger.

## `.env`

The returned v2 ZIP intentionally does not contain your real `.env`. Keep credentials in local `.env` and Vercel Environment Variables. Never place a Supabase secret/service-role key in the browser app.
