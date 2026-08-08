-- =====================================================================
-- BOLOS ALLEY OS — Migration 00020
-- Fix phone-format mismatch in is_phone_registered().
--
-- Same root cause as the cashier walk-in lookup bug (see
-- src/lib/cashier.ts:lookupCustomerByPhone): Supabase Auth stores
-- auth.users.phone WITHOUT a leading '+', and handle_new_user copies that
-- bare-digit value straight into profiles.phone for any account created
-- via admin.auth.admin.createUser({ phone }) — i.e. every walk-in. This
-- function compared with a plain '=', so a signup could fail to detect a
-- phone already used by a walk-in (and vice versa). Now strips a leading
-- '+' from both sides before comparing.
-- =====================================================================

create or replace function public.is_phone_registered(p_phone text, p_exclude_user_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where regexp_replace(phone, '^\+', '') = regexp_replace(p_phone, '^\+', '')
      and (p_exclude_user_id is null or id <> p_exclude_user_id)
  );
$$;
