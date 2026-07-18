import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { SLOT_MINUTES } from '@/lib/slots';

export interface GameDurationParams {
  baseMinutes: number;
  minutesPerPlayerPerGame: number;
  minMinutes: number;
  maxMinutes: number;
}

// Matches game_duration_params' own column defaults (migration 00014) —
// used when a game type has no row yet.
const DEFAULT_PARAMS: GameDurationParams = {
  baseMinutes: 10,
  minutesPerPlayerPerGame: 9,
  minMinutes: 20,
  maxMinutes: 180,
};

export async function getGameDurationParams(tenantId: string, gameTypeId: string): Promise<GameDurationParams> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('game_duration_params')
    .select('base_minutes, minutes_per_player_per_game, min_minutes, max_minutes')
    .eq('tenant_id', tenantId)
    .eq('game_type_id', gameTypeId)
    .maybeSingle();

  const row = data as unknown as {
    base_minutes: number;
    minutes_per_player_per_game: number;
    min_minutes: number;
    max_minutes: number;
  } | null;
  if (!row) return DEFAULT_PARAMS;

  return {
    baseMinutes: row.base_minutes,
    minutesPerPlayerPerGame: Number(row.minutes_per_player_per_game),
    minMinutes: row.min_minutes,
    maxMinutes: row.max_minutes,
  };
}

export interface ComputeBowlingDurationResult {
  /** Clamped + rounded to a 30-min slot boundary — what actually gets booked. */
  durationMinutes: number;
  /** The raw, unclamped/unrounded prediction — recorded for the learning engine. */
  predicted: number;
}

// TODO(learning-engine): once enough sessions have actual_duration_minutes,
// fit base_minutes/minutes_per_player_per_game from real data instead of
// the manually-tuned admin defaults this formula currently uses.
export async function computeBowlingDuration(input: {
  tenantId: string;
  gameTypeId: string;
  playerCount: number;
  gameCount: 1 | 2;
}): Promise<ComputeBowlingDurationResult> {
  const params = await getGameDurationParams(input.tenantId, input.gameTypeId);

  const predicted = params.baseMinutes + input.playerCount * input.gameCount * params.minutesPerPlayerPerGame;
  const clamped = Math.min(params.maxMinutes, Math.max(params.minMinutes, predicted));
  // Slots are SLOT_MINUTES wide — a booking must occupy whole slots or the
  // cinema-style grid breaks, so round up rather than down (never under-book).
  const durationMinutes = Math.ceil(clamped / SLOT_MINUTES) * SLOT_MINUTES;

  return { durationMinutes, predicted: Math.round(predicted) };
}
