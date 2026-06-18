-- =====================================================================
-- BOLOS ALLEY OS — Migration 00005
-- Row Level Security (RLS) — multi-tenant isolation
--
-- Security model:
--   - super_admin (platform_admins): sees everything
--   - tenant_admin / manager / staff: scoped to their tenant (+ branch for branch-scoped roles)
--   - customer: sees only their own data
-- =====================================================================

-- ---------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER so they bypass RLS to evaluate roles)
-- ---------------------------------------------------------------------

-- Is the current auth user a platform super-admin?
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.platform_admins where user_id = auth.uid()
  );
$$;

-- Does the current auth user have any active role in this tenant?
create or replace function public.is_tenant_member(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_tenant_roles
    where user_id = auth.uid()
      and tenant_id = p_tenant_id
      and is_active = true
  ) or public.is_super_admin();
$$;

-- Does the current auth user have at least manager-level role in this tenant?
create or replace function public.is_tenant_manager(p_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_tenant_roles
    where user_id = auth.uid()
      and tenant_id = p_tenant_id
      and is_active = true
      and role in ('tenant_admin','manager')
  ) or public.is_super_admin();
$$;

-- Does the current auth user have staff-or-above role in this branch?
create or replace function public.has_branch_access(p_branch_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_tenant_roles utr
    join public.branches b on b.tenant_id = utr.tenant_id
    where utr.user_id = auth.uid()
      and utr.is_active = true
      and b.id = p_branch_id
      and utr.role in ('tenant_admin','manager','staff')
      and (utr.branch_id is null or utr.branch_id = p_branch_id)
  ) or public.is_super_admin();
$$;

-- ---------------------------------------------------------------------
-- Enable RLS on all tenant-scoped tables
-- ---------------------------------------------------------------------
alter table public.tenants               enable row level security;
alter table public.branches              enable row level security;
alter table public.profiles              enable row level security;
alter table public.user_tenant_roles     enable row level security;
alter table public.platform_admins       enable row level security;
alter table public.game_types            enable row level security;
alter table public.stations              enable row level security;
alter table public.pricing_rules         enable row level security;
alter table public.bookings              enable row level security;
alter table public.sessions              enable row level security;
alter table public.frozen_balances       enable row level security;
alter table public.queue_tickets         enable row level security;
alter table public.payments              enable row level security;
alter table public.loyalty_accounts      enable row level security;
alter table public.loyalty_ledger        enable row level security;
alter table public.badges                enable row level security;
alter table public.badge_awards          enable row level security;
alter table public.rewards               enable row level security;
alter table public.reward_redemptions    enable row level security;
alter table public.offers                enable row level security;
alter table public.behavior_events       enable row level security;
alter table public.customer_insights     enable row level security;
alter table public.notifications         enable row level security;
alter table public.activity_log          enable row level security;

-- ---------------------------------------------------------------------
-- TENANTS
-- ---------------------------------------------------------------------
create policy "tenants_select_member" on public.tenants
  for select using (public.is_tenant_member(id));

create policy "tenants_update_admin" on public.tenants
  for update using (public.is_tenant_manager(id));

create policy "tenants_insert_super" on public.tenants
  for insert with check (public.is_super_admin());

create policy "tenants_delete_super" on public.tenants
  for delete using (public.is_super_admin());

-- ---------------------------------------------------------------------
-- BRANCHES
-- ---------------------------------------------------------------------
create policy "branches_select_member" on public.branches
  for select using (public.is_tenant_member(tenant_id));

create policy "branches_insert_manager" on public.branches
  for insert with check (public.is_tenant_manager(tenant_id));

create policy "branches_update_manager" on public.branches
  for update using (public.is_tenant_manager(tenant_id));

create policy "branches_delete_manager" on public.branches
  for delete using (public.is_tenant_manager(tenant_id));

-- ---------------------------------------------------------------------
-- PROFILES — users see their own; staff see customers in their tenant
-- ---------------------------------------------------------------------
create policy "profiles_self_select" on public.profiles
  for select using (id = auth.uid() or public.is_super_admin());

create policy "profiles_self_update" on public.profiles
  for update using (id = auth.uid() or public.is_super_admin());

-- Staff can read profiles of customers who have bookings/sessions in their tenant
create policy "profiles_staff_read_customers" on public.profiles
  for select using (
    exists (
      select 1 from public.bookings b
      where b.customer_id = profiles.id
        and public.is_tenant_member(b.tenant_id)
    )
    or exists (
      select 1 from public.sessions s
      where s.customer_id = profiles.id
        and public.is_tenant_member(s.tenant_id)
    )
  );

-- Allow trigger-created insert (handled by SECURITY DEFINER fn already, but explicit policy is safer)
create policy "profiles_self_insert" on public.profiles
  for insert with check (id = auth.uid());

-- ---------------------------------------------------------------------
-- USER_TENANT_ROLES
-- ---------------------------------------------------------------------
create policy "utr_self_or_manager_read" on public.user_tenant_roles
  for select using (user_id = auth.uid() or public.is_tenant_manager(tenant_id));

create policy "utr_manager_write" on public.user_tenant_roles
  for insert with check (public.is_tenant_manager(tenant_id));

create policy "utr_manager_update" on public.user_tenant_roles
  for update using (public.is_tenant_manager(tenant_id));

create policy "utr_manager_delete" on public.user_tenant_roles
  for delete using (public.is_tenant_manager(tenant_id));

-- ---------------------------------------------------------------------
-- PLATFORM_ADMINS
-- ---------------------------------------------------------------------
create policy "platform_admins_super_only" on public.platform_admins
  for all using (public.is_super_admin()) with check (public.is_super_admin());

-- ---------------------------------------------------------------------
-- GAME_TYPES, STATIONS, PRICING — tenant members read; managers write
-- ---------------------------------------------------------------------
create policy "game_types_member_read" on public.game_types
  for select using (public.is_tenant_member(tenant_id) or is_active);

create policy "game_types_manager_write" on public.game_types
  for all using (public.is_tenant_manager(tenant_id))
  with check (public.is_tenant_manager(tenant_id));

create policy "stations_member_read" on public.stations
  for select using (public.is_tenant_member(tenant_id));

create policy "stations_manager_write" on public.stations
  for all using (public.is_tenant_manager(tenant_id))
  with check (public.is_tenant_manager(tenant_id));

create policy "pricing_member_read" on public.pricing_rules
  for select using (public.is_tenant_member(tenant_id));

create policy "pricing_manager_write" on public.pricing_rules
  for all using (public.is_tenant_manager(tenant_id))
  with check (public.is_tenant_manager(tenant_id));

-- ---------------------------------------------------------------------
-- BOOKINGS — customer sees own; staff sees branch-scoped
-- ---------------------------------------------------------------------
create policy "bookings_customer_self" on public.bookings
  for select using (customer_id = auth.uid());

create policy "bookings_staff_branch" on public.bookings
  for select using (public.has_branch_access(branch_id));

create policy "bookings_customer_create" on public.bookings
  for insert with check (
    customer_id = auth.uid() or public.has_branch_access(branch_id)
  );

create policy "bookings_customer_update" on public.bookings
  for update using (
    (customer_id = auth.uid() and status in ('pending','confirmed'))
    or public.has_branch_access(branch_id)
  );

create policy "bookings_staff_delete" on public.bookings
  for delete using (public.is_tenant_manager(tenant_id));

-- ---------------------------------------------------------------------
-- SESSIONS — customer reads own; staff manages on their branch
-- ---------------------------------------------------------------------
create policy "sessions_customer_self" on public.sessions
  for select using (customer_id = auth.uid());

create policy "sessions_staff_branch" on public.sessions
  for select using (public.has_branch_access(branch_id));

create policy "sessions_staff_write" on public.sessions
  for all using (public.has_branch_access(branch_id))
  with check (public.has_branch_access(branch_id));

-- ---------------------------------------------------------------------
-- FROZEN BALANCES
-- ---------------------------------------------------------------------
create policy "frozen_customer_self" on public.frozen_balances
  for select using (customer_id = auth.uid());

create policy "frozen_staff_branch" on public.frozen_balances
  for all using (public.has_branch_access(branch_id))
  with check (public.has_branch_access(branch_id));

-- ---------------------------------------------------------------------
-- QUEUE TICKETS
-- ---------------------------------------------------------------------
create policy "queue_customer_self" on public.queue_tickets
  for select using (customer_id = auth.uid());

create policy "queue_staff_branch" on public.queue_tickets
  for all using (public.has_branch_access(branch_id))
  with check (public.has_branch_access(branch_id));

-- ---------------------------------------------------------------------
-- PAYMENTS
-- ---------------------------------------------------------------------
create policy "payments_customer_self" on public.payments
  for select using (customer_id = auth.uid());

create policy "payments_staff_tenant" on public.payments
  for select using (public.is_tenant_member(tenant_id));

create policy "payments_staff_write" on public.payments
  for insert with check (
    customer_id = auth.uid() or public.is_tenant_member(tenant_id)
  );

create policy "payments_manager_update" on public.payments
  for update using (public.is_tenant_manager(tenant_id));

-- ---------------------------------------------------------------------
-- LOYALTY
-- ---------------------------------------------------------------------
create policy "loyalty_customer_self" on public.loyalty_accounts
  for select using (customer_id = auth.uid());

create policy "loyalty_staff_tenant" on public.loyalty_accounts
  for select using (public.is_tenant_member(tenant_id));

create policy "loyalty_manager_write" on public.loyalty_accounts
  for all using (public.is_tenant_manager(tenant_id))
  with check (public.is_tenant_manager(tenant_id));

create policy "loyalty_ledger_read" on public.loyalty_ledger
  for select using (
    public.is_tenant_member(tenant_id)
    or exists (
      select 1 from public.loyalty_accounts la
      where la.id = loyalty_ledger.account_id and la.customer_id = auth.uid()
    )
  );

create policy "loyalty_ledger_insert" on public.loyalty_ledger
  for insert with check (public.is_tenant_member(tenant_id));

-- ---------------------------------------------------------------------
-- BADGES / REWARDS / OFFERS — tenant-visible
-- ---------------------------------------------------------------------
create policy "badges_read" on public.badges
  for select using (public.is_tenant_member(tenant_id) or is_active);
create policy "badges_manage" on public.badges
  for all using (public.is_tenant_manager(tenant_id))
  with check (public.is_tenant_manager(tenant_id));

create policy "badge_awards_self" on public.badge_awards
  for select using (customer_id = auth.uid() or public.is_tenant_member(tenant_id));
create policy "badge_awards_staff_write" on public.badge_awards
  for all using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));

create policy "rewards_read" on public.rewards
  for select using (public.is_tenant_member(tenant_id) or is_active);
create policy "rewards_manage" on public.rewards
  for all using (public.is_tenant_manager(tenant_id))
  with check (public.is_tenant_manager(tenant_id));

create policy "redemptions_self" on public.reward_redemptions
  for select using (customer_id = auth.uid() or public.is_tenant_member(tenant_id));
create policy "redemptions_customer_create" on public.reward_redemptions
  for insert with check (
    customer_id = auth.uid() or public.is_tenant_member(tenant_id)
  );
create policy "redemptions_staff_update" on public.reward_redemptions
  for update using (public.is_tenant_member(tenant_id));

create policy "offers_read" on public.offers
  for select using (public.is_tenant_member(tenant_id) or is_active);
create policy "offers_manage" on public.offers
  for all using (public.is_tenant_manager(tenant_id))
  with check (public.is_tenant_manager(tenant_id));

-- ---------------------------------------------------------------------
-- AI / BEHAVIOR / INSIGHTS
-- ---------------------------------------------------------------------
create policy "behavior_self_read" on public.behavior_events
  for select using (customer_id = auth.uid() or public.is_tenant_member(tenant_id));
create policy "behavior_staff_insert" on public.behavior_events
  for insert with check (public.is_tenant_member(tenant_id));

create policy "insights_self_read" on public.customer_insights
  for select using (customer_id = auth.uid() or public.is_tenant_member(tenant_id));
create policy "insights_staff_write" on public.customer_insights
  for all using (public.is_tenant_manager(tenant_id))
  with check (public.is_tenant_manager(tenant_id));

-- ---------------------------------------------------------------------
-- NOTIFICATIONS
-- ---------------------------------------------------------------------
create policy "notifications_self_read" on public.notifications
  for select using (customer_id = auth.uid() or public.is_tenant_member(tenant_id));
create policy "notifications_tenant_write" on public.notifications
  for all using (public.is_tenant_member(tenant_id))
  with check (public.is_tenant_member(tenant_id));

-- ---------------------------------------------------------------------
-- ACTIVITY LOG — read-only for managers; system inserts via service role
-- ---------------------------------------------------------------------
create policy "activity_log_manager_read" on public.activity_log
  for select using (public.is_tenant_manager(tenant_id));

create policy "activity_log_member_insert" on public.activity_log
  for insert with check (public.is_tenant_member(tenant_id));
-- No update/delete policy = locked (append-only) for non-service-role users
