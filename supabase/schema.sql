-- Personal Expense Manager Supabase schema
-- Run this in Supabase SQL Editor.
-- Then enable Anonymous Sign-ins from: Authentication > Sign In / Providers > Anonymous Sign-ins.

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
  unique (user_id, local_id)
);

alter table public.expenses enable row level security;

create policy "Users can read own expenses"
on public.expenses
for select
to authenticated
using (auth.uid() = user_id);

create policy "Users can insert own expenses"
on public.expenses
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "Users can update own expenses"
on public.expenses
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own expenses"
on public.expenses
for delete
to authenticated
using (auth.uid() = user_id);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_expenses_updated_at on public.expenses;
create trigger set_expenses_updated_at
before update on public.expenses
for each row
execute function public.set_updated_at();
