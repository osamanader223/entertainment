-- ---------------------------------------------------------------------
-- Loyalty points: tier rename (vip -> diamond) + atomic award function
-- ---------------------------------------------------------------------

-- Postgres can't rename enum values easily if in use; add 'diamond' and migrate.
-- We keep 'vip' in the enum to avoid breaking existing rows/constraints, but all
-- new application logic (src/lib/loyalty.ts, src/lib/offers.ts) uses
-- silver/gold/platinum/diamond.
alter type public.loyalty_tier add value if not exists 'diamond';

commit;

update public.loyalty_accounts set tier = 'diamond' where tier = 'vip';
update public.rewards set min_tier = 'diamond' where min_tier = 'vip';
update public.offers set min_tier = 'diamond' where min_tier = 'vip';

-- Ensure every existing customer has a loyalty account (backfill).
-- Accounts get created on first point-earning event going forward via
-- loyalty_award_points(), but existing customers should see a Silver
-- account immediately on /dashboard/loyalty rather than a blank state.
insert into public.loyalty_accounts (tenant_id, customer_id, points_balance, lifetime_points_earned, tier)
select distinct r.tenant_id, r.user_id, 0, 0, 'silver'
from public.user_tenant_roles r
where r.role = 'customer'
on conflict (tenant_id, customer_id) do nothing;

-- ---------------------------------------------------------------------
-- Atomically award loyalty points: creates the account if missing,
-- updates balance/lifetime/tier/streak, writes a ledger row + activity
-- log entry, and is idempotent per (reference_type, reference_id, reason).
-- ---------------------------------------------------------------------
create or replace function public.loyalty_award_points(
  p_tenant_id uuid,
  p_customer_id uuid,
  p_points int,
  p_reason text,
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_actor_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_account public.loyalty_accounts;
  v_existing_ledger public.loyalty_ledger;
  v_previous_tier public.loyalty_tier;
  v_new_tier public.loyalty_tier;
  v_new_lifetime int;
  v_new_streak int;
  v_ledger_id uuid;
  v_today date := current_date;
begin
  if p_points <= 0 then
    raise exception 'loyalty_award_points points must be positive';
  end if;

  -- Idempotency: a prior award for this exact reference already happened.
  if p_reference_type is not null and p_reference_id is not null then
    select l.* into v_existing_ledger
    from public.loyalty_ledger l
    join public.loyalty_accounts a on a.id = l.account_id
    where a.tenant_id = p_tenant_id
      and a.customer_id = p_customer_id
      and l.reference_type = p_reference_type
      and l.reference_id = p_reference_id
      and l.reason = p_reason
      and l.delta_points > 0
    limit 1;

    if v_existing_ledger.id is not null then
      select * into v_account from public.loyalty_accounts where id = v_existing_ledger.account_id;
      return jsonb_build_object(
        'points_awarded', 0,
        'new_balance', v_account.points_balance,
        'new_lifetime', v_account.lifetime_points_earned,
        'previous_tier', v_account.tier,
        'new_tier', v_account.tier,
        'tier_up', false,
        'already_awarded', true
      );
    end if;
  end if;

  -- Upsert + lock the loyalty account
  insert into public.loyalty_accounts (tenant_id, customer_id, points_balance, lifetime_points_earned, tier)
  values (p_tenant_id, p_customer_id, 0, 0, 'silver')
  on conflict (tenant_id, customer_id) do nothing;

  select * into v_account
  from public.loyalty_accounts
  where tenant_id = p_tenant_id and customer_id = p_customer_id
  for update;

  v_previous_tier := v_account.tier;
  v_new_lifetime := v_account.lifetime_points_earned + p_points;

  v_new_tier := case
    when v_new_lifetime >= 3000 then 'diamond'::public.loyalty_tier
    when v_new_lifetime >= 1000 then 'platinum'::public.loyalty_tier
    when v_new_lifetime >= 250 then 'gold'::public.loyalty_tier
    else 'silver'::public.loyalty_tier
  end;

  -- Streak: consecutive-day visit tracking
  if v_account.last_visit_date is null or v_account.last_visit_date < v_today - 1 then
    v_new_streak := 1;
  elsif v_account.last_visit_date = v_today - 1 then
    v_new_streak := v_account.current_streak_days + 1;
  else
    -- last_visit_date = today already: same-day repeat award, streak unchanged
    v_new_streak := v_account.current_streak_days;
  end if;

  update public.loyalty_accounts
  set points_balance = points_balance + p_points,
      lifetime_points_earned = v_new_lifetime,
      tier = v_new_tier,
      current_streak_days = v_new_streak,
      longest_streak_days = greatest(longest_streak_days, v_new_streak),
      last_visit_date = v_today
  where id = v_account.id
  returning * into v_account;

  insert into public.loyalty_ledger
    (tenant_id, account_id, delta_points, reason, reference_type, reference_id, created_by)
  values
    (p_tenant_id, v_account.id, p_points, p_reason, p_reference_type, p_reference_id, p_actor_id)
  returning id into v_ledger_id;

  insert into public.activity_log
    (tenant_id, actor_id, action, entity_type, entity_id, after)
  values
    (p_tenant_id, p_actor_id, 'loyalty.points_awarded', 'loyalty_account', v_account.id,
     jsonb_build_object('points', p_points, 'new_tier', v_new_tier, 'tier_up', v_new_tier <> v_previous_tier));

  return jsonb_build_object(
    'points_awarded', p_points,
    'new_balance', v_account.points_balance,
    'new_lifetime', v_account.lifetime_points_earned,
    'previous_tier', v_previous_tier,
    'new_tier', v_new_tier,
    'tier_up', v_new_tier <> v_previous_tier,
    'already_awarded', false
  );
end;
$$;

revoke execute on function public.loyalty_award_points from public;
grant execute on function public.loyalty_award_points to service_role;
