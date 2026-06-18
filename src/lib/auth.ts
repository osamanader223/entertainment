import 'server-only';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Database } from '@/types/database';

export type AppRole = Database['public']['Enums']['app_role'];

export interface AuthContext {
  userId: string;
  email: string | null;
  phone: string | null;
  profile: Database['public']['Tables']['profiles']['Row'] | null;
  roles: Array<{
    tenant_id: string;
    branch_id: string | null;
    role: AppRole;
  }>;
  isSuperAdmin: boolean;
}

/**
 * Returns the current authenticated user with profile + roles,
 * or null if not signed in.
 */
export async function getAuthContext(): Promise<AuthContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: roles }, { data: superRow }] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    supabase
      .from('user_tenant_roles')
      .select('tenant_id, branch_id, role')
      .eq('user_id', user.id)
      .eq('is_active', true),
    supabase.from('platform_admins').select('user_id').eq('user_id', user.id).maybeSingle(),
  ]);

  return {
    userId: user.id,
    email: user.email ?? null,
    phone: user.phone ?? null,
    profile: profile ?? null,
    roles: roles ?? [],
    isSuperAdmin: !!superRow,
  };
}

/** Throws redirect to /login if no user. */
export async function requireAuth(redirectTo?: string): Promise<AuthContext> {
  const ctx = await getAuthContext();
  if (!ctx) {
    const target = redirectTo
      ? `/login?redirect=${encodeURIComponent(redirectTo)}`
      : '/login';
    redirect(target);
  }
  return ctx;
}

/** Throws redirect if user does not hold at least one of the required roles in given tenant. */
export async function requireRole(
  tenantId: string,
  roles: AppRole[],
  redirectTo = '/dashboard'
): Promise<AuthContext> {
  const ctx = await requireAuth();
  if (ctx.isSuperAdmin) return ctx;
  const hasRole = ctx.roles.some(
    (r) => r.tenant_id === tenantId && roles.includes(r.role)
  );
  if (!hasRole) redirect(redirectTo);
  return ctx;
}

/** Returns true if user has the given role in any tenant. */
export function userHasAnyRole(ctx: AuthContext, roles: AppRole[]): boolean {
  if (ctx.isSuperAdmin) return true;
  return ctx.roles.some((r) => roles.includes(r.role));
}
