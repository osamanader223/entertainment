'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { PublicVenueState } from '@/lib/venue';

const POLL_INTERVAL_MS = 10_000;

export function useLiveVenueState(branchCode: string, initial?: PublicVenueState) {
  const [state, setState] = useState<PublicVenueState | null>(initial ?? null);
  const [isStale, setIsStale] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const branchIdRef = useRef<string | null>(initial?.branch.id ?? null);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch(`/api/public/venue/${encodeURIComponent(branchCode)}`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        setError(`HTTP ${res.status}`);
        return;
      }
      const next = (await res.json()) as PublicVenueState;
      setState(next);
      branchIdRef.current = next.branch.id;
      setIsStale(false);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'unknown');
    }
  }, [branchCode]);

  // Initial fetch if no SSR data
  useEffect(() => {
    if (!initial) void refetch();
  }, [initial, refetch]);

  // Poll periodically as fallback
  useEffect(() => {
    const id = setInterval(() => {
      setIsStale(true);
      void refetch();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refetch]);

  // Realtime: refetch when sessions, stations, or queue_tickets change for this branch
  useEffect(() => {
    if (!branchIdRef.current) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`venue:${branchIdRef.current}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sessions', filter: `branch_id=eq.${branchIdRef.current}` },
        () => void refetch()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'stations', filter: `branch_id=eq.${branchIdRef.current}` },
        () => void refetch()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'queue_tickets', filter: `branch_id=eq.${branchIdRef.current}` },
        () => void refetch()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refetch]);

  return { state, isStale, error, refetch };
}
