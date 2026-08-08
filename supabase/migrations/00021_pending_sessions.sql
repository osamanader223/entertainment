-- =====================================================================
-- BOLOS ALLEY OS — Migration 00021
-- Sessions get a 'pending' state: added to a basket and paid, but the
-- timer/lights have not started yet. See src/lib/sessions.ts:
-- startPendingSession for the moment the clock actually begins.
--
-- Lifecycle: pending (added to basket, no timer) -> active (Start
-- tapped, timer runs) -> ended (unchanged).
-- =====================================================================

alter type public.session_status add value if not exists 'pending';
