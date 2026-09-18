-- ExpenseFlow / Personal Expense Manager — fresh Supabase schema
-- Run this only for a NEW project.
-- Existing installations should run security-upgrade.sql instead.
-- Then enable Anonymous Sign-ins: Authentication > Sign In / Providers.

create extension if not exists pgcrypto;

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  local_id text not null,
  title text not null,
  amount numeric(12,2) not null check (amount >= 0),
  category text not null,
  payment_method text default 'Cash',
  expense_date date not null,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expenses_user_local_unique unique (user_id, local_id),
  constraint expenses_local_id_length check (char_length(local_id) between 1 and 128),
  constraint expenses_title_length check (char_length(btrim(title)) between 1 and 120),
  constraint expenses_category_length check (char_length(category) between 1 and 80),
  constraint expenses_payment_method_length check (payment_method is null or char_length(payment_method) <= 40),
  constraint expenses_note_length check (note is null or char_length(note) <= 500)
);

create index if not exists expenses_user_date_idx on public.expenses (user_id, expense_date desc);
create index if not exists expenses_user_category_idx on public.expenses (user_id, category);

alter table public.expenses enable row level security;
alter table public.expenses force row level security;

-- Explicit API grants: anonymous visitors get no table access. Anonymous Auth users
-- receive the authenticated role after sign-in and are restricted by RLS below.
revoke all on table public.expenses from anon;
grant select, insert, update, delete on table public.expenses to authenticated;

-- Recreate policies so this file remains repeatable for development environments.
drop policy if exists "Users can read own expenses" on public.expenses;
drop policy if exists "Users can insert own expenses" on public.expenses;
drop policy if exists "Users can update own expenses" on public.expenses;
drop policy if exists "Users can delete own expenses" on public.expenses;

create policy "Users can read own expenses"
on public.expenses
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert own expenses"
on public.expenses
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update own expenses"
on public.expenses
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete own expenses"
on public.expenses
for delete
to authenticated
using ((select auth.uid()) = user_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_expenses_updated_at on public.expenses;
create trigger set_expenses_updated_at
before update on public.expenses
for each row
execute function public.set_updated_at();
