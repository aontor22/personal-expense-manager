-- ExpenseFlow v2 security upgrade for an EXISTING database.
-- Designed to preserve existing rows and app behavior.
-- Run once in Supabase SQL Editor, then verify the expenses table still contains your data.

begin;

alter table public.expenses enable row level security;
alter table public.expenses force row level security;

-- Keep browser API permissions explicit and minimal.
revoke all on table public.expenses from anon;
grant select, insert, update, delete on table public.expenses to authenticated;

-- Rebuild the same per-user RLS model currently used by the app.
drop policy if exists "Users can read own expenses" on public.expenses;
drop policy if exists "Users can insert own expenses" on public.expenses;
drop policy if exists "Users can update own expenses" on public.expenses;
drop policy if exists "Users can delete own expenses" on public.expenses;

create policy "Users can read own expenses"
on public.expenses for select to authenticated
using ((select auth.uid()) = user_id);

create policy "Users can insert own expenses"
on public.expenses for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "Users can update own expenses"
on public.expenses for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "Users can delete own expenses"
on public.expenses for delete to authenticated
using ((select auth.uid()) = user_id);

-- Query indexes for user-scoped monthly/category reads.
create index if not exists expenses_user_date_idx on public.expenses (user_id, expense_date desc);
create index if not exists expenses_user_category_idx on public.expenses (user_id, category);

-- Add input-boundary checks without scanning/rejecting old data.
-- NOT VALID still protects every new or updated row; validate later after reviewing legacy rows.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'expenses_local_id_length' and conrelid = 'public.expenses'::regclass) then
    alter table public.expenses add constraint expenses_local_id_length check (char_length(local_id) between 1 and 128) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'expenses_title_length' and conrelid = 'public.expenses'::regclass) then
    alter table public.expenses add constraint expenses_title_length check (char_length(btrim(title)) between 1 and 120) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'expenses_category_length' and conrelid = 'public.expenses'::regclass) then
    alter table public.expenses add constraint expenses_category_length check (char_length(category) between 1 and 80) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'expenses_payment_method_length' and conrelid = 'public.expenses'::regclass) then
    alter table public.expenses add constraint expenses_payment_method_length check (payment_method is null or char_length(payment_method) <= 40) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'expenses_note_length' and conrelid = 'public.expenses'::regclass) then
    alter table public.expenses add constraint expenses_note_length check (note is null or char_length(note) <= 500) not valid;
  end if;
end $$;

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

commit;
