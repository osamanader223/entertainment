'use server';

import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { normalizePhone } from '@/lib/utils';

const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2, 'auth.invalidFullName'),
  phone: z.string().trim().min(1, 'auth.invalidPhone'),
  preferredLocale: z.enum(['en', 'ar']),
});

export async function updateProfileAction(raw: {
  fullName: string;
  phone: string;
  preferredLocale: string;
}) {
  const ctx = await requireAuth('/dashboard/profile');

  const parsed = updateProfileSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false as const, error: 'invalid' as const };
  }

  const normalizedPhone = normalizePhone(parsed.data.phone, 'SA');
  if (!normalizedPhone) {
    return { ok: false as const, error: 'invalid_phone' as const };
  }

  const supabase = await createClient();

  if (normalizedPhone !== ctx.profile?.phone) {
    const { data: phoneTaken, error: rpcError } = await supabase.rpc(
      'is_phone_registered',
      { p_phone: normalizedPhone, p_exclude_user_id: ctx.userId } as never
    );
    if (rpcError) {
      console.error('[profile] is_phone_registered check unavailable:', rpcError.message);
    } else if (phoneTaken) {
      return { ok: false as const, error: 'duplicate_phone' as const };
    }
  }

  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: parsed.data.fullName,
      phone: normalizedPhone,
      preferred_locale: parsed.data.preferredLocale,
    } as never)
    .eq('id', ctx.userId);

  if (error) {
    return { ok: false as const, error: 'server' as const };
  }
  return { ok: true as const };
}
