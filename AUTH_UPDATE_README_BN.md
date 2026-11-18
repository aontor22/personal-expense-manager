# ExpenseFlow — Email + Google Authentication (Full Project Update)

এই ZIP তোমার দেওয়া `ExpenseFlow-Source.zip` থেকে তৈরি; শুধু isolated kit নয়, অ্যাপের মধ্যে authentication যুক্ত করা হয়েছে।

## কী যুক্ত হয়েছে

- `/` = public SEO landing page; `/features.html`, `robots.txt`, `sitemap.xml`, Google verification HTML অপরিবর্তিত।
- `/app` = account-only private expense dashboard; `X-Robots-Tag: noindex` and no-store headers।
- Email/password account creation, sign-in, logout; email confirmation and password reset।
- Google sign-in এবং signed-in account-এ Google identity link করার UI।
- Anonymous guest mode, guest থেকে email বা Google permanent account-এ upgrade (সম্ভব হলে একই Supabase user ID)।
- প্রতি Supabase user ID-তে আলাদা IndexedDB (`personal_expense_manager_db_user_<id>`) ও monthly budget key।
- আগে থেকে থাকা IndexedDB ডাটার জন্য user-confirmed *Restore my old expenses* banner; পুরোনো ডাটাবেস ডিলিট হবে না।
- আগের add/edit/delete, budget, analytics, sync, JSON/PDF/Excel/CSV functions বজায় আছে।

## নিরাপদ deployment (Codespaces)

**প্রথমে** LIVE ExpenseFlow app → Backup → JSON export করে নিজের কাছে রাখো।

1. GitHub Codespaces-এ project root-এ ZIP upload করো।
2. আগে branch-এ uncommitted changes থাকলে save/commit বা inspect করো।
3. `git switch main && git pull --ff-only origin main` (main protected; direct push করবে না)।
4. `git switch -c feat/expenseflow-auth`
5. `unzip -o ExpenseFlow-Auth-Complete.zip` (ZIP-এ root থেকে files আছে, source root-এ extract করো; `.env` নেই)।
6. `npm ci`
7. `npm run verify`
8. `git status --short && git diff --check`
9. `git add src tests package.json vercel.json AUTH_UPDATE_README_BN.md` (অন্য changed files review করে stage করো; `.env` বা secret add করবে না)।
10. `git commit -m "Add ExpenseFlow email and Google authentication"`
11. `git push -u origin feat/expenseflow-auth` এবং `main`-এ Pull Request তৈরি করো। CI PASS হলেই merge। Vercel Ready হলে browser-এ smoke test করো।

**Important:** user-supplied archive থেকে আগের source files (`src/App.jsx`, `src/lib/idb.js`, `src/lib/sync.js` etc.) বদলেছে। Extract করার আগে backup আছে নিশ্চিত হও। PR-এ file diff review করো।

## Supabase Dashboard (required)

Authentication → Providers:
- Email enabled; confirm email enabled (recommended).
- Google enabled: Google Cloud থেকে Client ID ও Client Secret Supabase Dashboard-এ রাখবে। **Vite frontend, ZIP, git বা chat-এ secret রাখবে না।**
- Anonymous sign-ins ON if guest mode দরকার।
- Authentication → Settings → **Enable manual linking** (Google account কে existing guest account-এর সাথে `linkIdentity` করতে; option naming can vary)।
- Authentication → URL Configuration:
  - Site URL: `https://personal-expense-manager-six.vercel.app`
  - Redirect URLs: `https://personal-expense-manager-six.vercel.app/**`
  - Local development: `http://localhost:5173/**` (যদি প্রয়োজন হয়)

Google Cloud → OAuth client:
- Authorized JS origin: `https://personal-expense-manager-six.vercel.app`
- Authorized redirect URI: Supabase Dashboard-এর **exact Callback URL**: `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback` (actual project ref দিয়ে বসাতে হবে)

Vercel Environment Variables (আগেরই থাকলে নতুন করে লাগবে না):
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — browser-safe anon/publishable key, **never service_role**

Existing database `public.expenses`-এ per-user RLS ঠিক আছে নিশ্চিত করো। এখানে নতুন SQL migration লাগে না; schema বা existing records drop করবে না। `supabase/security-upgrade.sql` আগের validated RLS migration, দরকার না হলে production-এ পুনরায় চালাতে হবে না।

## পুরোনো data কীভাবে recover করবে

প্রথমবার `/app`-এ ঢুকে আগের anonymous Supabase session থাকলে সেটি আগের মতোই থাকবে। কিন্তু পুরোনো unscoped IndexedDB rows নিরাপত্তার জন্য নিজে থেকে কোনো নতুন user account-এর কাছে দেখাবে না।

**Old browser expenses found** banner দেখালে, ডাটাগুলো তোমারই হলে **Restore my old expenses** বেছে নাও। এতে old DB থেকে active rows *copy* হয়ে বর্তমান user-এর scoped IndexedDB-তে যাবে; original DB মুছে যাবে না। Imported rows পরের sync-এ চলতি Supabase account-এর cloud rows হিসেবে আপলোড হবে।

Guest account-এ data থাকলে Sign in with অন্য account করার আগে *Connect Google* বা *Save with email* ব্যবহার করাই নিরাপদ। অন্য account-এ যেতে চাইলে JSON backup এর warning থাকবে। ব্রাউজার/site data clear করলে guest account অপ্রাপ্য হতে পারে।

**ব্রাউজারের IndexedDB account-অনুযায়ী UI-তে আলাদা রাখা হয়েছে, কিন্তু ডিভাইসে encrypted-at-rest storage নয়। Shared computer-এর browser storage অন্য কোনো local user/devtools থেকেও accessible হতে পারে।** সংবেদনশীল data হলে shared browser ব্যবহার করো না।

## Tests এবং release checklist

Code-side:
```bash
npm ci
npm run verify
npm audit --omit=dev --audit-level=high
```

Production smoke tests (Google/Supabase credentials লাগবে; এখানে execute করা হয়নি):
1. নতুন Email Sign Up → email confirmation → logout → password login।
2. Google login → logout → Google login (same account, same records)।
3. Guest expense create → Account → Connect Google (same user UUID), record preserved।
4. Guest → Save with email → verify → set password → login again, records preserved।
5. Account A-তে expenses add → logout → Account B → Account A-র data hidden; A-তে আবার login করে records recover।
6. Offline expense add → reconnect → single cloud sync, no duplicate।
7. Old unscoped DB banner → deliberate import → JSON export total compare।
8. `/app` noindex, `/` public; `robots.txt`, `sitemap.xml`, `features.html`, existing `googleaed5d75e3e7e6e43.html` HTTP200।
9. Reset password email → password update → sign in আবার।
10. Mobile/desktop responsive screens; CSV/Excel/PDF/JSON backup, budget, charts unchanged।

Unit tests: `npm test` (22 tests in this update). Actual `npm run build` and live OAuth end-to-end tests **Codespaces-এ করতে হবে**; this environment could not finish dependency installation (network-blocked npm).

## Changed files

- `src/AuthShell.jsx` (public landing, auth gate, guest, legacy migration UX)
- `src/auth-shell.css`
- `src/expenseflow-auth/{ExpenseFlowAuth.jsx,ExpenseFlowAuth.css,auth-operations.mjs}`
- `src/App.jsx` (user-scoped existing dashboard + account button)
- `src/lib/{idb.js,sync.js,supabase.js}` (data isolation; OAuth callback)
- `src/main.jsx` (mount AuthShell)
- `vercel.json` (private-route rewrite and noindex)
- `package.json` (`npm test`, `npm run verify` scripts)
- `tests/*.test.mjs`

No OAuth credentials or production data are included.
