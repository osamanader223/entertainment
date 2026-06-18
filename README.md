# BOLOS ALLEY OS — Entertainment Venue Operating System

> Multi-tenant SaaS for billiard, bowling, PS5, VR, karaoke & more.
> Built with Next.js 15, Supabase, TypeScript, TailwindCSS, shadcn/ui.

---

## ✅ Phase 1 — Foundation (this drop)

What's in this codebase:

- **Multi-tenant database** — tenants → branches → stations → bookings → sessions, all isolated by Row-Level Security.
- **Full schema** for: profiles, roles, game types, stations, pricing rules, bookings, live sessions, queue tickets, frozen balances, payments ledger, loyalty accounts/ledger/badges/rewards, marketing offers, AI behavior events, customer insights, notifications outbox, append-only activity log.
- **Authentication** — phone OTP, email/password, Google OAuth, role-based access (`super_admin` / `tenant_admin` / `manager` / `staff` / `customer`).
- **Next.js 15 app** with App Router, Server Components, Tailwind dark theme, RTL/LTR (Arabic + English), shadcn/ui primitives, Framer Motion ready.
- **Seed data** for a demo tenant "Bolos Alley Jeddah" with 14 stations matching your PDF (4 pool, 4 bowling, 2 ping-pong, 2 foosball, 2 PS5).

What's coming:

- **Phase 2** — Real-time station grid, live timers, booking flow, smart queue (your PDF's "14-station one-touch" + bowling tickets).
- **Phase 3** — Moyasar (Mada + Apple Pay + Visa).
- **Phase 4** — AI WhatsApp agent (OpenAI + WhatsApp Cloud API) + customer analytics.
- **Phase 5** — Admin dashboard (financial, marketing, IFTTT smart-lights integration).
- **Phase 6** — White-label branding, Vercel production deploy.

---

## 🚀 Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Set up Supabase (local)

```bash
# Install Supabase CLI if you don't have it
npm install -g supabase

# Start local Supabase (Postgres + Auth + Storage + Studio)
npx supabase start
```

This prints the local URL + anon key + service role key. Copy them.

### 3. Configure environment

```bash
cp .env.example .env.local
# Fill in NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY
```

### 4. Apply migrations + seed

```bash
npx supabase db reset
# This will run all 5 migrations + seed.sql
```

### 5. Generate TypeScript types

```bash
npm run db:types
```

### 6. Run

```bash
npm run dev
```

Open http://localhost:3000

### 7. Create your super-admin

After signing up your own account, mark yourself as super-admin (from Supabase Studio → SQL editor):

```sql
insert into public.platform_admins (user_id)
values ((select id from auth.users where email = 'you@example.com'));
```

Then assign yourself as `tenant_admin` of the demo tenant:

```sql
insert into public.user_tenant_roles (user_id, tenant_id, role, is_active)
values (
  (select id from auth.users where email = 'you@example.com'),
  '11111111-1111-1111-1111-111111111111',
  'tenant_admin',
  true
);
```

---

## 🏗 Architecture

```
┌────────────────────────────────────────────────────────────┐
│  Next.js 15 (App Router, Server Components, Edge-ready)    │
│  ├─ /            Landing                                   │
│  ├─ /login       Phone OTP / Email / Google                │
│  ├─ /signup      Email + phone + PDPL consent              │
│  ├─ /verify      6-digit OTP                               │
│  ├─ /dashboard   Role-aware shell                          │
│  └─ /auth/*      OAuth callback, signout                   │
└────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌────────────────────────────────────────────────────────────┐
│  Supabase                                                  │
│  ├─ Auth (Phone, Email, OAuth)                             │
│  ├─ Postgres (5 migrations, ~25 tables)                    │
│  │   ├─ RLS on every table                                 │
│  │   ├─ Helper fns: is_super_admin, is_tenant_member,      │
│  │   │   is_tenant_manager, has_branch_access              │
│  │   └─ Triggers: profile auto-create, updated_at,         │
│  │       session ends_at, station status sync              │
│  ├─ Realtime (for Phase 2 station grid)                    │
│  ├─ Storage (for branding logos, etc.)                     │
│  └─ Edge Functions (for Phase 3-4 webhooks)                │
└────────────────────────────────────────────────────────────┘
```

### Multi-tenancy model

- **Tenant** = an entertainment business (e.g. "Bolos Jeddah Group"). White-label colors, plan, locale, timezone all per-tenant.
- **Branch** = a physical location under a tenant (e.g. "Bolos Jeddah - Main").
- **User roles** are scoped: a user can be `staff` at branch A, `manager` at branch B, and a `customer` of tenant C — all simultaneously.
- **RLS** enforces tenant + branch isolation at the database layer. Even if app code has a bug, customers can't see other customers' data.

### Saudi-specific defaults

- Currency: SAR (stored as halalas = integer cents)
- Timezone: Asia/Riyadh
- Locale: Arabic default, English available
- Phone: E.164 with `+966` default
- VAT & CR number fields on tenants
- PDPL marketing consent fields on profiles

---

## 📂 Folder Structure

```
bolos-alley-os/
├── src/
│   ├── app/
│   │   ├── (auth)/           Auth pages (login, signup, verify)
│   │   ├── (dashboard)/      Dashboard pages (requires auth)
│   │   ├── auth/             OAuth callback + signout routes
│   │   ├── layout.tsx        Root layout (RTL/LTR, dark theme)
│   │   ├── page.tsx          Landing
│   │   └── globals.css       Tailwind + theme tokens
│   ├── components/
│   │   ├── ui/               shadcn primitives
│   │   ├── auth/             LoginForm, SignupForm, VerifyOtpForm
│   │   └── ...
│   ├── lib/
│   │   ├── supabase/         client.ts, server.ts, middleware.ts, admin.ts
│   │   ├── validators/       Zod schemas
│   │   ├── utils/            cn, formatMoney, formatDuration, normalizePhone
│   │   └── auth.ts           Server auth helpers (getAuthContext, requireRole)
│   ├── types/
│   │   └── database.ts       Generated Supabase types
│   └── middleware.ts         Session refresh + route protection
├── supabase/
│   ├── migrations/
│   │   ├── 00001_core_tenancy.sql
│   │   ├── 00002_venue_catalog.sql
│   │   ├── 00003_bookings_sessions_queue.sql
│   │   ├── 00004_payments_loyalty_ai.sql
│   │   └── 00005_rls_policies.sql
│   ├── seed.sql              Demo tenant + 14 stations
│   └── config.toml
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.mjs
└── .env.example
```

---

## 🔐 Security model (RLS)

Every tenant-scoped table has policies that enforce:

| Role | Can read | Can write |
|---|---|---|
| `customer` | Own profile, own bookings/sessions/payments, own loyalty | Own profile, create own booking |
| `staff` | All data for their branch | Sessions, bookings, queue, payments on their branch |
| `manager` | All data for their tenant | Most operational data + station/pricing/rewards config |
| `tenant_admin` | Everything in their tenant | Everything in their tenant |
| `super_admin` | Everything | Everything |

Policies live in `supabase/migrations/00005_rls_policies.sql`.

---

## 🧪 Smoke test

After step 6:

1. Go to http://localhost:3000 → see landing
2. Click **Get Started** → fill signup form → submit
3. Check the local Inbucket (http://localhost:54324) for the confirmation email
4. Confirm → sign in → land on `/dashboard`
5. Check Supabase Studio (http://localhost:54323) → `profiles` table → your row exists (auto-created by trigger)

---

## 📦 Next session — what to ask for

To continue:

> "Continue to Phase 2 — build the real-time station grid, booking flow, and queue system"

Or jump ahead:

> "Skip to Phase 3 — Moyasar payments with Apple Pay"
> "Skip to Phase 4 — AI WhatsApp agent"

---

Built for serious entertainment venues in Saudi Arabia & the GCC. 🇸🇦
