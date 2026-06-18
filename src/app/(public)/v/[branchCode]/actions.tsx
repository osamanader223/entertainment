'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { toast } from 'sonner';
import type { PublicVenueState, PublicStation, PublicQueueGroup } from '@/lib/venue';
import { LiveStationGrid } from '@/components/venue/live-station-grid';
import { useT } from '@/i18n/context';

interface Props {
  branchCode: string;
  initial?: PublicVenueState;
}

export function PublicLiveGrid({ branchCode, initial }: Props) {
  const { t, locale } = useT();
  const router = useRouter();

  const onStationSelect = useCallback(
    (station: PublicStation) => {
      toast.info(t('venue.signInToReserve', { station: station.display_name }));
      router.push(
        `/login?redirect=${encodeURIComponent(`/dashboard/book?branch=${branchCode}&intent=book:${station.id}`)}`
      );
    },
    [branchCode, router, t]
  );

  const onQueueJoin = useCallback(
    (group: PublicQueueGroup) => {
      const gameTypeName = locale === 'ar'
        ? (group.game_type_name_ar || group.game_type_name_en)
        : group.game_type_name_en;
      toast.info(t('venue.signInToJoinQueue', { gameType: gameTypeName }));
      router.push(
        `/login?redirect=${encodeURIComponent(`/dashboard/queue?branch=${branchCode}&intent=queue:${group.game_type_code}`)}`
      );
    },
    [branchCode, router, t, locale]
  );

  return (
    <LiveStationGrid
      branchCode={branchCode}
      initial={initial}
      onStationSelect={onStationSelect}
      onQueueJoin={onQueueJoin}
    />
  );
}
