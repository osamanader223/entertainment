'use server';

import { signupSchema } from '@/lib/validators/auth';
import { createClient } from '@/lib/supabase/server';

/**
 * Server-side re-validation of the signup form — the client already
 * validates with the same schema, but that alone isn't trusted. Also
 * re-normalizes the phone number server-side rather than trusting
 * whatever the client already computed, and checks phone availability
 * (an anonymous request can't see this via RLS, so it goes through the
 * is_phone_registered() SECURITY DEFINER function instead).
 *
 * Fails OPEN on the phone-availability check specifically: if the
 * is_phone_registered() function isn't deployed yet (migration
 * 00012_profile_phone_uniqueness.sql not applied), a broken duplicate
 * check must never block every signup — it just skips the check.
 */
export async function validateSignupAction(raw: {
  fullName: string;
  email: string;
  phone: string;
  password: string;
}) {
  const parsed = signupSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false as const, duplicatePhone: false as const };
  }

  const supabase = await createClient();
  const { data: phoneTaken, error } = await supabase.rpc(
    'is_phone_registered',
    { p_phone: parsed.data.phone } as never
  );
  if (error) {
    console.error('[signup] is_phone_registered check unavailable (migration 00012 applied?):', error.message);
  } else if (phoneTaken) {
    return { ok: false as const, duplicatePhone: true as const };
  }

  return { ok: true as const, duplicatePhone: false as const, data: parsed.data };
}
