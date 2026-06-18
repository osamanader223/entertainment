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

export const signupSchema = z
  .object({
    fullName: z.string().trim().min(2, 'Name too short').max(80),
    email: emailSchema,
    phone: phoneSchema,
    password: z.string().min(8, 'Password must be ≥ 8 characters'),
    confirmPassword: z.string(),
    marketingConsent: z.boolean().default(false),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const verifyOtpSchema = z.object({
  phone: phoneSchema,
  token: otpSchema,
});

export type LoginPhoneInput = z.infer<typeof loginPhoneSchema>;
export type LoginEmailInput = z.infer<typeof loginEmailSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
