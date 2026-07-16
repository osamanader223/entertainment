-- ---------------------------------------------------------------------
-- Pre-signup / pre-save phone availability check.
--
-- Anonymous signups need to know whether a phone is already taken before
-- an account exists at all, and profiles_self_select's RLS policy only
-- lets a user read their OWN row — so a plain client-side lookup can never
-- see whether someone ELSE already has a given phone. This function
-- exposes only a boolean (never any profile data) via SECURITY DEFINER,
-- the same pattern already used by get_public_venue_state /
-- get_public_branch_by_code for anonymous-safe reads.
--
-- Deliberately split from the unique index (00013) — this function is
-- purely additive and safe to apply immediately; the index will fail if
-- duplicate phones still exist (see 00013's header).
-- ---------------------------------------------------------------------
create or replace function public.is_phone_registered(p_phone text, p_exclude_user_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where phone = p_phone
      and (p_exclude_user_id is null or id <> p_exclude_user_id)
  );
$$;

grant execute on function public.is_phone_registered(text, uuid) to anon, authenticated;
