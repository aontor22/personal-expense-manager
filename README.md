# Personal Expense Manager

Offline-first personal monthly expense tracker with Supabase cloud sync, IndexedDB local database, analytics, PDF, Excel, CSV and JSON backup.

## Features

- Add, edit and delete personal expenses
- Categories for Jatayat, Basha Vara, Utility, Bua Bill, Meal, Grocery, Snacks, Phone Load, Game Topup and more
- Monthly budget tracking
- Monthly and overall analytics
- Category pie chart and daily spending chart
- PDF report download
- Excel report download
- CSV report download
- JSON backup and restore
- IndexedDB offline storage
- Supabase cloud database sync
- Auto-sync when internet comes back
- PWA service worker for offline app shell after first visit

## Run locally

```bash
npm install
npm run dev
```

## Build for production

```bash
npm run build
npm run preview
```

## Supabase setup

1. Create a new Supabase project.
2. Go to SQL Editor.
3. Run `supabase/schema.sql`.
4. Enable Anonymous Sign-ins from Supabase Dashboard:
   - Authentication
   - Sign In / Providers
   - Anonymous Sign-ins
5. Copy `.env.example` to `.env`.
6. Add your Supabase project URL and anon key:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

7. Restart the dev server.

## Offline behavior

The app uses IndexedDB as the first write database. Every new expense is saved locally first. If Supabase is configured and the internet is available, the app pushes pending local records to Supabase. If the internet is not available, records stay in the local sync queue. When the browser comes online again, the app automatically syncs pending changes.

## Deployment on Vercel

1. Push this folder to GitHub.
2. Import the repo into Vercel.
3. Add environment variables in Vercel:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
4. Deploy.

## Notes

- Anonymous sign-in keeps data private per browser session as long as browser storage is not cleared.
- For a production multi-device login system, add email/password or Google login later.
- The app still works without Supabase, but then it runs as local-only mode.
