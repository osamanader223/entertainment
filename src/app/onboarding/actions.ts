'use server';

import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { normalizePhone } from '@/lib/utils';

const onboardingSchema = z.object({
  fullName: z.string().trim().min(2, 'auth.invalidFullName'),
  phone: z.string().trim().min(1, 'auth.invalidPhone'),
});

export async function completeOnboardingAction(raw: { fullName: string; phone: string }) {
  const ctx = await requireAuth('/onboarding');

  const parsed = onboardingSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false as const, error: 'invalid' as const };
  }

  const normalizedPhone = normalizePhone(parsed.data.phone, 'SA');
  if (!normalizedPhone) {
    return { ok: false as const, error: 'invalid_phone' as const };
  }

  const supabase = await createClient();

  // Same fail-open pattern as signup: a missing is_phone_registered()
  // function (migration not applied yet) must never block onboarding.
  const { data: phoneTaken, error: rpcError } = await supabase.rpc(
    'is_phone_registered',
    { p_phone: normalizedPhone, p_exclude_user_id: ctx.userId } as never
  );
  if (rpcError) {
    console.error('[onboarding] is_phone_registered check unavailable:', rpcError.message);
  } else if (phoneTaken) {
    return { ok: false as const, error: 'duplicate_phone' as const };
  }

  const { error } = await supabase
    .from('profiles')
    .update({ full_name: parsed.data.fullName, phone: normalizedPhone } as never)
    .eq('id', ctx.userId);
  if (error) {
    return { ok: false as const, error: 'server' as const };
  }

  return { ok: true as const };
}
