-- =====================================================================
-- BOLOS ALLEY OS — Migration 00001
-- Core multi-tenancy: tenants, branches, profiles, roles
-- =====================================================================

-- Enable required extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";
create extension if not exists "citext";

-- ---------------------------------------------------------------------
-- Enum: app-wide role hierarchy
-- ---------------------------------------------------------------------
create type public.app_role as enum (
  'super_admin',   -- Bolos platform owner (cross-tenant)
  'tenant_admin',  -- Entertainment business owner
  'manager',       -- Branch manager
  'staff',         -- Floor staff / cashier
  'customer'       -- End user
);

create type public.tenant_status as enum ('trial', 'active', 'suspended', 'cancelled');
create type public.branch_status as enum ('active', 'maintenance', 'closed');

-- ---------------------------------------------------------------------
-- Tenants: each entertainment business (white-label ready)
-- ---------------------------------------------------------------------
create table public.tenants (
  id uuid primary key default uuid_generate_v4(),
  slug citext unique not null,                  -- e.g. "bolos-jeddah-group"
  display_name text not null,
  legal_name text,
  vat_number text,
  cr_number text,                                -- Saudi Commercial Registration
  country_code text not null default 'SA',
  currency text not null default 'SAR',
  timezone text not null default 'Asia/Riyadh',
  default_locale text not null default 'ar',    -- ar | en
  status public.tenant_status not null default 'trial',
  -- Branding (white-label)
  brand_primary_color text default '#D4AF37',   -- gold from your PDF
  brand_accent_color text default '#1E40AF',
  brand_danger_color text default '#DC2626',
  logo_url text,
  -- Plan
  plan_tier text not null default 'starter',    -- starter | pro | enterprise
  trial_ends_at timestamptz default (now() + interval '14 days'),
  -- Settings JSON (flexible)
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_tenants_status on public.tenants(status);
create index idx_tenants_slug on public.tenants(slug);

-- ---------------------------------------------------------------------
-- Branches: physical locations under a tenant
-- ---------------------------------------------------------------------
create table public.branches (
  id uuid primary key default uuid_generate_v4(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  code text not null,                            -- e.g. "JED-01"
  display_name text not null,
  address_line text,
  city text,
  region text,
  country_code text default 'SA',
  lat numeric(10,7),
  lng numeric(10,7),
  phone text,
  whatsapp_number text,
  opens_at time default '14:00',
  closes_at time default '02:00',
  status public.branch_status not null default 'active',
  -- IFTTT / smart-lights config (matches your PDF feature)
  ifttt_webhook_key text,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create index idx_branches_tenant on public.branches(tenant_id);
create index idx_branches_status on public.branches(status);

-- ---------------------------------------------------------------------
-- Profiles: extends auth.users with app data
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  -- Identity
  full_name text,
  display_name text,
  phone text,                                    -- E.164: +9665XXXXXXXX
  phone_verified boolean not null default false,
  email citext,
  email_verified boolean not null default false,
  avatar_url text,
  preferred_locale text default 'ar',
  -- Customer fields (nullable for non-customers)
  date_of_birth date,
  gender text check (gender in ('male','female','other') or gender is null),
  -- Marketing consent (Saudi PDPL compliance)
  marketing_whatsapp_consent boolean not null default false,
  marketing_sms_consent boolean not null default false,
  marketing_email_consent boolean not null default false,
  -- Lifecycle
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_profiles_phone on public.profiles(phone);
create index idx_profiles_email on public.profiles(email);

-- ---------------------------------------------------------------------
-- User roles per tenant (a user can have different roles in different tenants)
-- ---------------------------------------------------------------------
create table public.user_tenant_roles (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete cascade, -- null = tenant-wide
  role public.app_role not null,
  is_active boolean not null default true,
  granted_at timestamptz not null default now(),
  granted_by uuid references public.profiles(id),
  unique (user_id, tenant_id, branch_id, role)
);

create index idx_utr_user on public.user_tenant_roles(user_id);
create index idx_utr_tenant on public.user_tenant_roles(tenant_id);
create index idx_utr_branch on public.user_tenant_roles(branch_id);
create index idx_utr_active on public.user_tenant_roles(is_active) where is_active = true;

-- ---------------------------------------------------------------------
-- Super-admins (platform-level, cross-tenant)
-- Stored separately so we don't pollute user_tenant_roles
-- ---------------------------------------------------------------------
create table public.platform_admins (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  granted_at timestamptz not null default now(),
  notes text
);

-- ---------------------------------------------------------------------
-- Trigger: auto-create profile on auth.users insert
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, phone, full_name)
  values (
    new.id,
    new.email,
    new.phone,
    coalesce(new.raw_user_meta_data->>'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- Trigger: updated_at autotouch
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_tenants_touch before update on public.tenants
  for each row execute function public.touch_updated_at();
create trigger trg_branches_touch before update on public.branches
  for each row execute function public.touch_updated_at();
create trigger trg_profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
