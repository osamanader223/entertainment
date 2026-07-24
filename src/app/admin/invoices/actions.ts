'use server';

import { z } from 'zod';
import { requireAuth, userHasAnyRole } from '@/lib/auth';
import { issueInvoiceForPayment, issueCreditNote, listInvoices, listUninvoicedPayments } from '@/lib/invoices';

const DEMO_TENANT_ID = '11111111-1111-1111-1111-111111111111';
const DEMO_BRANCH_ID = '22222222-2222-2222-2222-222222222222';
const ADMIN_ROLES = ['manager', 'tenant_admin'] as const;

async function requireAdminCtx() {
  const ctx = await requireAuth();
  if (!userHasAnyRole(ctx, [...ADMIN_ROLES]) && !ctx.isSuperAdmin) throw new Error('Forbidden');
  return ctx;
}

export async function listInvoicesAction() {
  try {
    await requireAdminCtx();
    const invoices = await listInvoices(DEMO_TENANT_ID);
    return { ok: true as const, invoices };
  } catch (err) {
    return { ok: false as const, error: String(err) };
  }
}

export async function listUninvoicedPaymentsAction() {
  try {
    await requireAdminCtx();
    const payments = await listUninvoicedPayments(DEMO_TENANT_ID, DEMO_BRANCH_ID);
    return { ok: true as const, payments };
  } catch (err) {
    return { ok: false as const, error: String(err) };
  }
}

const retrySchema = z.object({ paymentId: z.string().uuid(), sessionId: z.string().uuid().optional() });

export async function retryInvoiceIssuanceAction(input: { paymentId: string; sessionId?: string }) {
  try {
    const ctx = await requireAdminCtx();
    const parsed = retrySchema.parse(input);
    const result = await issueInvoiceForPayment({
      tenantId: DEMO_TENANT_ID,
      branchId: DEMO_BRANCH_ID,
      paymentId: parsed.paymentId,
      sessionId: parsed.sessionId,
      issuedBy: ctx.userId,
    });
    return { ok: true as const, result };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
  }
}

const creditNoteSchema = z.object({ invoiceId: z.string().uuid() });

export async function issueCreditNoteAction(input: { invoiceId: string }) {
  try {
    const ctx = await requireAdminCtx();
    const parsed = creditNoteSchema.parse(input);
    const result = await issueCreditNote({
      tenantId: DEMO_TENANT_ID,
      branchId: DEMO_BRANCH_ID,
      originalInvoiceId: parsed.invoiceId,
      issuedBy: ctx.userId,
    });
    return { ok: true as const, result };
  } catch (err) {
    return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
  }
}
