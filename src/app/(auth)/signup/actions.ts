'use server';

import { z } from 'zod';
import { signupSchema } from '@/lib/validators/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { lookupCustomerByPhone } from '@/lib/cashier';

/**
 * Server-side re-validation of the signup form — the client already
 * validates with the same schema, but that alone isn't trusted. Also
 * re-normalizes the phone number server-side rather than trusting
 * whatever the client already computed.
 *
 * Distinguishes THREE outcomes for the phone, not just taken/free:
 *   - free                                -> proceed with a normal signup.
 *   - taken by a CREDENTIAL-LESS profile  -> claimable: true (a walk-in —
 *     see claimWalkInAccountAction below), not a hard block.
 *   - taken by a profile that already has an email -> duplicatePhone: true,
 *     blocks as before.
 *
 * Fails OPEN on the phone-availability check specifically: if
 * lookupCustomerByPhone can't run (e.g. migration not applied yet), a
 * broken duplicate check must never block every signup — it just skips it.
 */
export async function validateSignupAction(raw: {
  fullName: string;
  email: string;
  phone: string;
  password: string;
}) {
  const parsed = signupSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false as const, duplicatePhone: false as const, claimable: false as const };
  }

  try {
    const existing = await lookupCustomerByPhone(parsed.data.phone);
    if (existing) {
      const admin = createAdminClient();
      const { data: profile } = await admin.from('profiles').select('email').eq('id', existing.id).maybeSingle();
      if (profile && !profile.email) {
        // A walk-in with no login credentials yet — offer the claim flow
        // instead of blocking the signup outright.
        return { ok: false as const, duplicatePhone: false as const, claimable: true as const, walkInProfileId: existing.id };
      }
      return { ok: false as const, duplicatePhone: true as const, claimable: false as const };
    }
  } catch (err) {
    console.error('[signup] phone lookup unavailable, skipping duplicate check:', err instanceof Error ? err.message : err);
  }

  return { ok: true as const, duplicatePhone: false as const, claimable: false as const, data: parsed.data };
}

const claimSchema = z.object({
  phone: z.string(),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8),
  fullName: z.string().trim().min(2),
});

/**
 * Attaches real web-login credentials (email + password) to an EXISTING
 * credential-less walk-in profile, found by phone — converting it into a
 * web-accessible account WITHOUT creating a second profile. Wallet,
 * loyalty, and session history all stay put because they're keyed by the
 * same profile id throughout.
 */
export async function claimWalkInAccountAction(raw: { phone: string; email: string; password: string; fullName: string }) {
  const parsed = claimSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }

  const existing = await lookupCustomerByPhone(parsed.data.phone);
  if (!existing) {
    return { ok: false as const, error: 'walk_in_not_found' };
  }

  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('email').eq('id', existing.id).maybeSingle();
  if (profile?.email) {
    // Already claimed (or was never a walk-in) — don't silently overwrite
    // someone else's credentials.
    return { ok: false as const, error: 'already_has_credentials' };
  }

  // TODO(otp): insert phone verification here before attaching credentials
  // (verify parsed.data.phone belongs to whoever is submitting this form,
  // e.g. an SMS OTP challenge) — no SMS/OTP service is wired yet, so for
  // now the phone match alone is trusted, same trust level as the rest of
  // the cashier's phone-first flow.

  const { error: updateAuthError } = await admin.auth.admin.updateUserById(existing.id, {
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.fullName },
  });
  if (updateAuthError) {
    return { ok: false as const, error: updateAuthError.message };
  }

  const { error: updateProfileError } = await admin
    .from('profiles')
    .update({ email: parsed.data.email, full_name: parsed.data.fullName } as never)
    .eq('id', existing.id);
  if (updateProfileError) {
    return { ok: false as const, error: updateProfileError.message };
  }

  return { ok: true as const };
}
