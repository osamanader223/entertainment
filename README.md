# BOLOS ALLEY OS â€” Entertainment Venue Operating System

> Multi-tenant SaaS for billiard, bowling, PS5, VR, karaoke & more.
> Built with Next.js 15, Supabase, TypeScript, TailwindCSS, shadcn/ui.

---

## âœ… Phase 1 â€” Foundation (this drop)

What's in this codebase:

- **Multi-tenant database** â€” tenants â†’ branches â†’ stations â†’ bookings â†’ sessions, all isolated by Row-Level Security.
- **Full schema** for: profiles, roles, game types, stations, pricing rules, bookings, live sessions, queue tickets, frozen balances, payments ledger, loyalty accounts/ledger/badges/rewards, marketing offers, AI behavior events, customer insights, notifications outbox, append-only activity log.
- **Authentication** â€” phone OTP, email/password, Google OAuth, role-based access (`super_admin` / `tenant_admin` / `manager` / `staff` / `customer`).
- **Next.js 15 app** with App Router, Server Components, Tailwind dark theme, RTL/LTR (Arabic + English), shadcn/ui primitives, Framer Motion ready.
- **Seed data** for a demo tenant "Bolos Alley Jeddah" with 14 stations matching your PDF (4 pool, 4 bowling, 2 ping-pong, 2 foosball, 2 PS5).

What's coming:

- **Phase 2** â€” Real-time station grid, live timers, booking flow, smart queue (your PDF's "14-station one-touch" + bowling tickets).
- **Phase 3** â€” Moyasar (Mada + Apple Pay + Visa).
- **Phase 4** â€” AI WhatsApp agent (OpenAI + WhatsApp Cloud API) + customer analytics.
- **Phase 5** â€” Admin dashboard (financial, marketing, IFTTT smart-lights integration).
- **Phase 6** â€” White-label branding, Vercel production deploy.

---

## ðŸš€ Quick Start

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

After signing up your own account, mark yourself as super-admin (from Supabase Studio â†’ SQL editor):

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

## ðŸ— Architecture

```
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  Next.js 15 (App Router, Server Components, Edge-ready)    â”‚
â”‚  â”œâ”€ /            Landing                                   â”‚
â”‚  â”œâ”€ /login       Phone OTP / Email / Google                â”‚
â”‚  â”œâ”€ /signup      Email + phone + PDPL consent              â”‚
â”‚  â”œâ”€ /verify      6-digit OTP                               â”‚
â”‚  â”œâ”€ /dashboard   Role-aware shell                          â”‚
â”‚  â””â”€ /auth/*      OAuth callback, signout                   â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
                          â”‚
                          â–¼
â”Œâ”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”
â”‚  Supabase                                                  â”‚
â”‚  â”œâ”€ Auth (Phone, Email, OAuth)                             â”‚
â”‚  â”œâ”€ Postgres (5 migrations, ~25 tables)                    â”‚
â”‚  â”‚   â”œâ”€ RLS on every table                                 â”‚
â”‚  â”‚   â”œâ”€ Helper fns: is_super_admin, is_tenant_member,      â”‚
â”‚  â”‚   â”‚   is_tenant_manager, has_branch_access              â”‚
â”‚  â”‚   â””â”€ Triggers: profile auto-create, updated_at,         â”‚
â”‚  â”‚       session ends_at, station status sync              â”‚
â”‚  â”œâ”€ Realtime (for Phase 2 station grid)                    â”‚
â”‚  â”œâ”€ Storage (for branding logos, etc.)                     â”‚
â”‚  â””â”€ Edge Functions (for Phase 3-4 webhooks)                â”‚
â””â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”˜
```

### Multi-tenancy model

- **Tenant** = an entertainment business (e.g. "Bolos Jeddah Group"). White-label colors, plan, locale, timezone all per-tenant.
- **Branch** = a physical location under a tenant (e.g. "Bolos Jeddah - Main").
- **User roles** are scoped: a user can be `staff` at branch A, `manager` at branch B, and a `customer` of tenant C â€” all simultaneously.
- **RLS** enforces tenant + branch isolation at the database layer. Even if app code has a bug, customers can't see other customers' data.

### Saudi-specific defaults

- Currency: SAR (stored as halalas = integer cents)
- Timezone: Asia/Riyadh
- Locale: Arabic default, English available
- Phone: E.164 with `+966` default
- VAT & CR number fields on tenants
- PDPL marketing consent fields on profiles

---

## ðŸ“‚ Folder Structure

```
bolos-alley-os/
â”œâ”€â”€ src/
â”‚   â”œâ”€â”€ app/
â”‚   â”‚   â”œâ”€â”€ (auth)/           Auth pages (login, signup, verify)
â”‚   â”‚   â”œâ”€â”€ (dashboard)/      Dashboard pages (requires auth)
â”‚   â”‚   â”œâ”€â”€ auth/             OAuth callback + signout routes
â”‚   â”‚   â”œâ”€â”€ layout.tsx        Root layout (RTL/LTR, dark theme)
â”‚   â”‚   â”œâ”€â”€ page.tsx          Landing
â”‚   â”‚   â””â”€â”€ globals.css       Tailwind + theme tokens
â”‚   â”œâ”€â”€ components/
â”‚   â”‚   â”œâ”€â”€ ui/               shadcn primitives
â”‚   â”‚   â”œâ”€â”€ auth/             LoginForm, SignupForm, VerifyOtpForm
â”‚   â”‚   â””â”€â”€ ...
â”‚   â”œâ”€â”€ lib/
â”‚   â”‚   â”œâ”€â”€ supabase/         client.ts, server.ts, middleware.ts, admin.ts
â”‚   â”‚   â”œâ”€â”€ validators/       Zod schemas
â”‚   â”‚   â”œâ”€â”€ utils/            cn, formatMoney, formatDuration, normalizePhone
â”‚   â”‚   â””â”€â”€ auth.ts           Server auth helpers (getAuthContext, requireRole)
â”‚   â”œâ”€â”€ types/
â”‚   â”‚   â””â”€â”€ database.ts       Generated Supabase types
â”‚   â””â”€â”€ middleware.ts         Session refresh + route protection
â”œâ”€â”€ supabase/
â”‚   â”œâ”€â”€ migrations/
â”‚   â”‚   â”œâ”€â”€ 00001_core_tenancy.sql
â”‚   â”‚   â”œâ”€â”€ 00002_venue_catalog.sql
â”‚   â”‚   â”œâ”€â”€ 00003_bookings_sessions_queue.sql
â”‚   â”‚   â”œâ”€â”€ 00004_payments_loyalty_ai.sql
â”‚   â”‚   â””â”€â”€ 00005_rls_policies.sql
â”‚   â”œâ”€â”€ seed.sql              Demo tenant + 14 stations
â”‚   â””â”€â”€ config.toml
â”œâ”€â”€ package.json
â”œâ”€â”€ tsconfig.json
â”œâ”€â”€ tailwind.config.ts
â”œâ”€â”€ next.config.mjs
â””â”€â”€ .env.example
```

---

## ðŸ” Security model (RLS)

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

## ðŸ§ª Smoke test

After step 6:

1. Go to http://localhost:3000 â†’ see landing
2. Click **Get Started** â†’ fill signup form â†’ submit
3. Check the local Inbucket (http://localhost:54324) for the confirmation email
4. Confirm â†’ sign in â†’ land on `/dashboard`
5. Check Supabase Studio (http://localhost:54323) â†’ `profiles` table â†’ your row exists (auto-created by trigger)

---

## ðŸ“¦ Next session â€” what to ask for

To continue:

> "Continue to Phase 2 â€” build the real-time station grid, booking flow, and queue system"

Or jump ahead:

> "Skip to Phase 3 â€” Moyasar payments with Apple Pay"
> "Skip to Phase 4 â€” AI WhatsApp agent"

---

Built for serious entertainment venues in Saudi Arabia & the GCC. ðŸ‡¸ðŸ‡¦
/ /   d e p l o y   t r i g g e r  
 / /   d e p l o y   t r i g g e r  
 