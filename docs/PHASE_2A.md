# Phase 2A — Architecture Lands

This drop adds the unified public/private architecture: anonymized live venue state, wallet system, and prepaid-queue schema. Cashier UI and the full booking/queue flow land in Phase 2B.

## What's new

### Database
- `00006_wallet_and_public_state.sql`
  - `wallets` + `wallet_ledger` (store credit + immutable audit)
  - `get_public_venue_state(branch_id)` SQL function — anonymized, no PII, callable by `anon` role
  - `wallet_credit` + `wallet_debit` RPC (atomic, service-role only)
  - Queue tickets gain prepayment fields (`held_payment_id`, `paid_amount_cents`, etc.)
  - Profiles gain `walk_in_created` + `phone_lookup_consent` for the phone-first identity flow
  - Branches gain `queue_policy` JSONB for per-venue tuning

### Backend
- `src/lib/wallet.ts` — `getWalletBalance`, `creditWallet`, `debitWallet`, `getWalletLedger`
- `src/lib/venue.ts` — `getPublicVenueState`, `resolveBranchByCode`
- `src/app/api/public/venue/[branchCode]/route.ts` — public endpoint, no auth, 5s edge cache

### Frontend
- `src/hooks/useLiveVenueState.ts` — polling + Supabase Realtime subscription
- `src/components/venue/station-card.tsx` — live ticking timer per occupied station
- `src/components/venue/live-station-grid.tsx` — grouped by game type, queue depth, summary bar
- `src/app/(public)/v/[branchCode]/page.tsx` — the public "departure board" (no auth)
- Updated `dashboard/page.tsx` — wallet card + embedded live grid

## How to test

After running `supabase db reset` to apply migration 00006:

### 1. Public live view (no login)
Open `http://localhost:3000/v/JED-01` — you'll see the anonymized live grid. No auth required.

### 2. Customer dashboard (logged in)
Sign in at `/login` — the dashboard now shows your wallet balance + the same live grid. Tapping a free station or queue chip routes you to the booking flow (Phase 2B).

### 3. Test the wallet
From Supabase Studio (`http://localhost:54323` → SQL editor):

```sql
-- Give yourself 100 SAR in store credit
select public.wallet_credit(
  p_tenant_id    => '11111111-1111-1111-1111-111111111111',
  p_customer_id  => (select id from auth.users where email = 'you@example.com'),
  p_amount_cents => 10000,
  p_kind         => 'credit_admin',
  p_reason       => 'Welcome bonus'
);
```

Refresh `/dashboard` — your wallet card now shows **100.00 SAR**.

### 4. Test the realtime sync
With `/v/JED-01` open in one tab, run this in SQL editor:

```sql
-- Simulate a session starting on POOL-01
insert into public.sessions (tenant_id, branch_id, station_id, customer_label, planned_duration_seconds)
select tenant_id, branch_id, id, 'Demo player', 3600
from public.stations where code = 'POOL-01';
```

The public page should flip POOL-01 to **Busy** with a 60:00 timer ticking down — within 2-3 seconds, no refresh needed.

## What's still to come (Phase 2B)

- Cashier UI (`/cashier`) with phone-pad lookup and walk-in entry
- Customer booking flow with wallet-payment support
- Queue join flow (debits wallet, creates queue ticket, schedules notification)
- Session timer component with pause / extend / freeze
- Cancellation flow that issues store credit

## Architecture rationale

**Why a SECURITY DEFINER function for the public state?** RLS is row-level — you can't say "everyone can see *some* columns of `sessions` but not others." A SQL function lets us craft the exact JSON shape we want to expose, with `security definer` bypassing RLS to read what it needs but returning only stripped data. Cleaner than a view + grant trick, and easier to evolve.

**Why store wallet ops as RPC functions?** The credit/debit operation must be atomic — update balance + insert ledger row in one transaction, or both fail. Doing this from a Next.js server action with two separate Supabase queries risks a partial write. A `plpgsql` function with `for update` row lock gives us ACID for free.

**Why is the wallet ledger append-only?** Forensics. If a customer ever disputes a balance, we need an immutable trail. `revoke update, delete from public` enforces it at the database level — no application bug can corrupt history.
