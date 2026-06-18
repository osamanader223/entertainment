import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

/**
 * SERVER-ONLY. Uses the service-role key — bypasses RLS.
 * Use sparingly: webhooks (Moyasar, WhatsApp), cron tasks, trusted edge fns.
 * Never import this from a client component.
 */
let _admin: ReturnType<typeof createClient<Database>> | null = null;

export function createAdminClient() {
  if (typeof window !== 'undefined') {
    throw new Error('createAdminClient() must not be called from the browser.');
  }
  if (_admin) return _admin;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL');
  }

  _admin = createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _admin;
}
