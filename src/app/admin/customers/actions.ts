'use server';

import { z } from 'zod';
import { requireAuth, userHasAnyRole } from '@/lib/auth';
import {
  listCustomers,
  updateCustomerProfile,
  addCustomerNote,
  listCustomerNotes,
} from '@/lib/customers';

const DEMO_TENANT_ID = '11111111-1111-1111-1111-111111111111';
// Unlike offers/pricing (manager+), staff can see customers — they serve them.
const CRM_ROLES = ['staff', 'manager', 'tenant_admin'] as const;

async function requireCrmCtx() {
  const ctx = await requireAuth();
  if (!userHasAnyRole(ctx, [...CRM_ROLES]) && !ctx.isSuperAdmin) {
    throw new Error('Forbidden');
  }
  return ctx;
}

const listSchema = z.object({
  search: z.string().max(120).optional(),
  sortBy: z.enum(['recent', 'spend', 'visits', 'name', 'tier']).optional(),
  tierFilter: z.string().optional(),
  page: z.number().int().min(1).optional(),
});

export async function listCustomersAction(input: {
  search?: string;
  sortBy?: 'recent' | 'spend' | 'visits' | 'name' | 'tier';
  tierFilter?: string;
  page?: number;
}) {
  try {
    await requireCrmCtx();
    const parsed = listSchema.parse(input);
    const result = await listCustomers({ tenantId: DEMO_TENANT_ID, ...parsed });
    return { ok: true as const, ...result };
  } catch (err) {
    return { ok: false as const, error: String(err) };
  }
}

const updateProfileSchema = z.object({
  customerId: z.string().uuid(),
  fullName: z.string().trim().min(1).max(120).optional(),
  marketingWhatsappConsent: z.boolean().optional(),
});

export async function updateCustomerProfileAction(input: {
  customerId: string;
  fullName?: string;
  marketingWhatsappConsent?: boolean;
}) {
  try {
    const ctx = await requireCrmCtx();
    const parsed = updateProfileSchema.parse(input);
    await updateCustomerProfile({ tenantId: DEMO_TENANT_ID, actorId: ctx.userId, ...parsed });
    return { ok: true as const };
  } catch (err) {
    return { ok: false as const, error: String(err) };
  }
}

const addNoteSchema = z.object({
  customerId: z.string().uuid(),
  note: z.string().trim().min(1).max(1000),
});

export async function addCustomerNoteAction(input: { customerId: string; note: string }) {
  try {
    const ctx = await requireCrmCtx();
    const parsed = addNoteSchema.parse(input);
    const result = await addCustomerNote({ tenantId: DEMO_TENANT_ID, actorId: ctx.userId, ...parsed });
    return { ok: true as const, noteId: result.noteId };
  } catch (err) {
    return { ok: false as const, error: String(err) };
  }
}

const customerIdSchema = z.object({ customerId: z.string().uuid() });

export async function listCustomerNotesAction(customerId: string) {
  try {
    await requireCrmCtx();
    const parsed = customerIdSchema.parse({ customerId });
    const notes = await listCustomerNotes(DEMO_TENANT_ID, parsed.customerId);
    return { ok: true as const, notes };
  } catch (err) {
    return { ok: false as const, error: String(err) };
  }
}
