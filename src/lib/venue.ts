import { createClient } from '@/lib/supabase/server';

export interface PublicStation {
  id: string;
  code: string;
  display_name: string;
  game_type_code: string;
  game_type_name_ar: string;
  game_type_name_en: string;
  icon: string | null;
  status: 'available' | 'occupied' | 'reserved' | 'maintenance' | 'cleaning';
  position_x: number | null;
  position_y: number | null;
  estimated_free_at: string | null;
}

export interface PublicQueueGroup {
  game_type_code: string;
  game_type_name_ar: string;
  game_type_name_en: string;
  icon: string | null;
  waiting_count: number;
  called_count: number;
  now_serving_ticket: number | null;
}

export interface PublicVenueState {
  branch: {
    id: string;
    code: string;
    display_name: string;
    city: string | null;
    opens_at: string;
    closes_at: string;
    queue_policy: Record<string, unknown>;
  };
  summary: {
    total_stations: number;
    available_count: number;
    occupied_count: number;
    maintenance_count: number;
  };
  stations: PublicStation[];
  queue: PublicQueueGroup[];
  fetched_at: string;
}

/**
 * Resolve a branch by its public code (e.g. "JED-01" → uuid).
 * Anyone (even unauthenticated) can call this — only active branches are returned.
 */
export async function resolveBranchByCode(code: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_public_branch_by_code', {
    p_branch_code: code,
  });
  if (error || !data) return null;
  return data as string;
}

/**
 * Fetch the public venue state — completely anonymized.
 * Safe to call without auth.
 */
export async function getPublicVenueState(branchId: string): Promise<PublicVenueState | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_public_venue_state', {
    p_branch_id: branchId,
  });
  if (error || !data) return null;
  const result = data as PublicVenueState | { error: string };
  if ('error' in result) return null;
  return result;
}
