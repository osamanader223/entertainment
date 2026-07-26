-- =====================================================================
-- BOLOS ALLEY OS — Migration 00018
-- Bug fix: split-payment cart settlement was producing multiple invoices.
--
-- Root cause: invoices.source_cart_id already exists (00017) and
-- issueInvoiceForCart already issues exactly once per cart (checked before
-- 00017 shipped). The actual bug is in listUninvoicedPayments (see
-- src/lib/invoices.ts): it flags any captured 'session' payment with no
-- invoice pointing at it via source_payment_id as needing one. A cart
-- settlement's individual tender rows (one payments row per split line —
-- e.g. cash 2 SAR + card 40 SAR) are intentionally never invoiced
-- individually — the ONE cart-level invoice covers all of them via
-- source_cart_id — but listUninvoicedPayments didn't know that, so it
-- surfaced those tender rows on /admin/invoices' "uninvoiced payments" retry
-- panel, and each manual retry created its own extra invoice.
--
-- This migration is the database-level belt-and-suspenders half of the fix
-- (the code half excludes cart tenders from that list in the first place).
-- =====================================================================

create unique index if not exists uq_one_invoice_per_cart
  on public.invoices(source_cart_id)
  where source_cart_id is not null;
