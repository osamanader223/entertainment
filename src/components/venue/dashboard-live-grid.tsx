'use client';

import { NeonStationGrid } from './neon-station-grid';
import type { PublicVenueState } from '@/lib/venue';
import { confirmStationSessionEndedAction } from '@/app/(dashboard)/dashboard/actions';
import { toast } from 'sonner';
import { useT } from '@/i18n/context';

export function DashboardLiveGrid({
  branchCode,
  initial,
  canEndSessions,
  hourlyPriceCentsByGameTypeCode,
  gameTypeIdByCode,
}: {
  branchCode: string;
  initial?: PublicVenueState;
  canEndSessions: boolean;
  hourlyPriceCentsByGameTypeCode: Record<string, number | null>;
  gameTypeIdByCode: Record<string, string>;
}) {
  const { t } = useT();

  const onConfirmEnd = async (stationId: string) => {
    const res = await confirmStationSessionEndedAction(stationId);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    if (res.alreadyEnded) {
      toast.info(t('venue.sessionAlreadyEnded'));
      return;
    }
    toast.success(t('venue.sessionEnded'));
  };

  return (
    <NeonStationGrid
      branchCode={branchCode}
      initial={initial}
      hourlyPriceCentsByGameTypeCode={hourlyPriceCentsByGameTypeCode}
      gameTypeIdByCode={gameTypeIdByCode}
      onStationConfirmEnd={canEndSessions ? onConfirmEnd : undefined}
    />
  );
}
