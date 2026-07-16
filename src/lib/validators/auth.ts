import { z } from 'zod';
import { normalizePhone } from '@/lib/utils';

export const phoneSchema = z
  .string()
  .trim()
  .min(8, 'Phone too short')
  .transform((v, ctx) => {
    const normalized = normalizePhone(v, 'SA');
    if (!normalized) {
      ctx.addIssue({ code: 'custom', message: 'Invalid phone number' });
      return z.NEVER;
    }
    return normalized;
  });

export const emailSchema = z.string().trim().toLowerCase().email('Invalid email');

export const otpSchema = z
  .string()
  .trim()
  .regex(/^\d{6}$/, 'OTP must be 6 digits');

export const loginPhoneSchema = z.object({
  phone: phoneSchema,
});

export const loginEmailSchema = z.object({
  email: emailSchema,
  password: z.string().min(8, 'Password must be ≥ 8 characters'),
});

// Dedicated signup field schemas — separate from the shared phoneSchema/
// emailSchema above (used by login/verify) so the signup form can show
// translated (i18n key, not raw English) error copy without touching the
// error messages login/verify already rely on.
export const signupSchema = z.object({
  fullName: z.string().trim().min(2, 'auth.invalidFullName'),
  email: z.string().trim().toLowerCase().email('auth.invalidEmail'),
  phone: z
    .string()
    .trim()
    .min(1, 'auth.invalidPhone')
    .transform((v, ctx) => {
      const normalized = normalizePhone(v, 'SA');
      if (!normalized) {
        ctx.addIssue({ code: 'custom', message: 'auth.invalidPhone' });
        return z.NEVER;
      }
      return normalized;
    }),
  password: z.string().min(8, 'auth.passwordTooShort'),
});

export const verifyOtpSchema = z.object({
  phone: phoneSchema,
  token: otpSchema,
});

export type LoginPhoneInput = z.infer<typeof loginPhoneSchema>;
export type LoginEmailInput = z.infer<typeof loginEmailSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
