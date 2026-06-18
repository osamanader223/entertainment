import 'server-only';
import type { Database } from '@/types/database';

type GameCategory = Database['public']['Enums']['game_category'];
type LightStatus = 'on' | 'off';
export type LightSequence = 'PAUSE' | 'END' | 'START';

interface LightStation {
  code: string;
  gameCategory: GameCategory;
}

/** Maps a game category to its IFTTT event prefix (matches the venue's existing Applets). */
const CATEGORY_EVENT_PREFIX: Record<GameCategory, string> = {
  billiard: 'Pool',
  bowling: 'bowling',
  ping_pong: 'ping',
  foosball: 'foos',
  ps5: 'ps5',
  karaoke: 'karaoke',
  vr: 'vr',
  arcade: 'arcade',
  other: 'other',
};

/** "POOL-01" -> 1, "BOWL-03" -> 3 */
function parseStationNumber(code: string): number {
  const match = code.match(/(\d+)\s*$/);
  return match ? parseInt(match[1], 10) : 0;
}

/**
 * Build the IFTTT event name for a station's smart light, matching the
 * production venue's naming convention: Pool tables use "Pool{N}_{ON|OFF}"
 * (uppercase), every other game type uses "{prefix}{N}_{on|off}" (lowercase).
 */
export function getLightEventName(station: LightStation, status: LightStatus): string {
  const number = parseStationNumber(station.code);
  const prefix = CATEGORY_EVENT_PREFIX[station.gameCategory] ?? station.gameCategory;
  const statusToken = prefix === 'Pool' ? status.toUpperCase() : status;
  return `${prefix}${number}_${statusToken}`;
}

/**
 * Fire an IFTTT Maker Webhook event. Best-effort: smart-light failures must
 * never break a booking, session, or cashier flow, so this never throws.
 */
export async function fireIftttEvent(eventName: string, webhookKey: string): Promise<void> {
  try {
    await fetch(`https://maker.ifttt.com/trigger/${eventName}/with/key/${webhookKey}`, {
      method: 'POST',
    });
  } catch {
    // smart-light failures are non-fatal
  }
}

export async function setStationLight(
  station: LightStation,
  status: LightStatus,
  webhookKey: string
): Promise<void> {
  await fireIftttEvent(getLightEventName(station, status), webhookKey);
}

const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Concurrency guard: keyed by station code, the value is the timestamp of the
 * most recently started sequence for that station. A newer sequence aborts
 * any older in-flight sequence by winning this check before each fire.
 */
const activeSequences = new Map<string, number>();

function isActive(stationCode: string, sequenceId: number): boolean {
  return activeSequences.get(stationCode) === sequenceId;
}

/**
 * Run a cinematic light sequence for a station. Intended to be fired with
 * `void runLightSequence(...)` — callers must not await this.
 *
 * - START: turn on immediately, no blink.
 * - PAUSE: off -> on -> off -> on (settles on), 2s between each step.
 * - END: off -> on -> off -> (10s) -> on.
 */
export async function runLightSequence(
  station: LightStation,
  sequence: LightSequence,
  webhookKey: string
): Promise<void> {
  const sequenceId = Date.now();
  activeSequences.set(station.code, sequenceId);

  const fire = async (status: LightStatus): Promise<boolean> => {
    if (!isActive(station.code, sequenceId)) return false;
    await setStationLight(station, status, webhookKey);
    return true;
  };

  switch (sequence) {
    case 'START':
      await fire('on');
      break;

    case 'PAUSE':
      if (!(await fire('off'))) return;
      await delay(2000);
      if (!(await fire('on'))) return;
      await delay(2000);
      if (!(await fire('off'))) return;
      await delay(2000);
      await fire('on');
      break;

    case 'END':
      if (!(await fire('off'))) return;
      await delay(2000);
      if (!(await fire('on'))) return;
      await delay(2000);
      if (!(await fire('off'))) return;
      await delay(10000);
      await fire('on');
      break;
  }
}
