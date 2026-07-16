'use client';

import { useRouter } from 'next/navigation';
import { useCallback } from 'react';
import { toast } from 'sonner';
import type { PublicVenueState, PublicStation } from '@/lib/venue';
import { PublicStationGrid } from '@/components/venue/public-station-grid';
import { useT } from '@/i18n/context';

interface Props {
  branchCode: string;
  initial?: PublicVenueState;
  hourlyPriceCentsByGameTypeCode: Record<string, number | null>;
}

export function PublicLiveGrid({ branchCode, initial, hourlyPriceCentsByGameTypeCode }: Props) {
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

  const onJoinQueue = useCallback(
    (gameTypeCode: string, gameTypeNameAr: string, gameTypeNameEn: string) => {
      const gameTypeName = locale === 'ar' ? (gameTypeNameAr || gameTypeNameEn) : gameTypeNameEn;
      toast.info(t('venue.signInToJoinQueue', { gameType: gameTypeName }));
      router.push(
        `/login?redirect=${encodeURIComponent(`/dashboard/queue?branch=${branchCode}&intent=queue:${gameTypeCode}`)}`
      );
    },
    [branchCode, router, t, locale]
  );

  return (
    <PublicStationGrid
      branchCode={branchCode}
      initial={initial}
      hourlyPriceCentsByGameTypeCode={hourlyPriceCentsByGameTypeCode}
      onStationSelect={onStationSelect}
      onJoinQueue={onJoinQueue}
    />
  );
}
