'use server';

import { requireAuth } from '@/lib/auth';
import { getCustomerOffers } from '@/lib/offers';

const DEMO_TENANT_ID = '11111111-1111-1111-1111-111111111111';

export async function getCustomerOffersAction() {
  try {
    const ctx = await requireAuth();
    const result = await getCustomerOffers({ tenantId: DEMO_TENANT_ID, customerId: ctx.userId });
    return { ok: true as const, ...result };
  } catch (err) {
    return { ok: false as const, error: String(err) };
  }
}
