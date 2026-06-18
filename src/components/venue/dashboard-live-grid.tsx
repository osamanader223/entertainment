'use client';

import { LiveStationGrid } from './live-station-grid';
import type { PublicVenueState } from '@/lib/venue';
import { confirmStationSessionEndedAction } from '@/app/(dashboard)/dashboard/actions';
import { toast } from 'sonner';
import { useT } from '@/i18n/context';

export function DashboardLiveGrid({
  branchCode,
  initial,
  canEndSessions,
}: {
  branchCode: string;
  initial?: PublicVenueState;
  canEndSessions: boolean;
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
    <LiveStationGrid
      branchCode={branchCode}
      initial={initial}
      onStationConfirmEnd={canEndSessions ? onConfirmEnd : undefined}
    />
  );
}
