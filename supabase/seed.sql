-- =====================================================================
-- BOLOS ALLEY OS — Seed data (run AFTER migrations)
-- Creates a demo tenant "Bolos Alley Jeddah" with everything wired up.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Demo tenant
-- ---------------------------------------------------------------------
insert into public.tenants (id, slug, display_name, legal_name, country_code, currency, timezone, default_locale, status, plan_tier)
values (
  '11111111-1111-1111-1111-111111111111',
  'bolos-jeddah',
  'Bolos Alley Jeddah',
  'Bolos Entertainment LLC',
  'SA', 'SAR', 'Asia/Riyadh', 'ar', 'active', 'pro'
) on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Demo branch
-- ---------------------------------------------------------------------
insert into public.branches (id, tenant_id, code, display_name, city, region, country_code, phone, whatsapp_number)
values (
  '22222222-2222-2222-2222-222222222222',
  '11111111-1111-1111-1111-111111111111',
  'JED-01', 'Jeddah - Main Hall',
  'Jeddah', 'Makkah', 'SA',
  '+966500000000', '+966500000000'
) on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Game types
-- ---------------------------------------------------------------------
insert into public.game_types (id, tenant_id, category, code, display_name_ar, display_name_en, icon, min_players, max_players, default_duration_min, supports_player_count, sort_order) values
  ('33333333-3333-3333-3333-333333333301', '11111111-1111-1111-1111-111111111111', 'billiard',  'pool',     'بلياردو',    'Pool',      '🎱', 1, 4, 60, false, 1),
  ('33333333-3333-3333-3333-333333333302', '11111111-1111-1111-1111-111111111111', 'bowling',   'bowling',  'بولينج',     'Bowling',   '🎳', 1, 6, 60, true,  2),
  ('33333333-3333-3333-3333-333333333303', '11111111-1111-1111-1111-111111111111', 'ping_pong', 'ping_pong','تنس طاولة',  'Ping Pong', '🏓', 2, 4, 30, false, 3),
  ('33333333-3333-3333-3333-333333333304', '11111111-1111-1111-1111-111111111111', 'foosball',  'foosball', 'فوزبول',     'Foosball',  '⚽', 2, 4, 30, false, 4),
  ('33333333-3333-3333-3333-333333333305', '11111111-1111-1111-1111-111111111111', 'ps5',       'ps5',      'بلايستيشن 5','PS5',       '🎮', 1, 4, 60, false, 5),
  ('33333333-3333-3333-3333-333333333306', '11111111-1111-1111-1111-111111111111', 'vr',        'vr',       'واقع افتراضي','VR',       '🥽', 1, 2, 30, false, 6),
  ('33333333-3333-3333-3333-333333333307', '11111111-1111-1111-1111-111111111111', 'karaoke',   'karaoke',  'كاريوكي',    'Karaoke',   '🎤', 1, 8, 60, false, 7)
on conflict (tenant_id, code) do nothing;

-- ---------------------------------------------------------------------
-- Stations (the 14 from your PDF: 4 pool, 4 bowling, 2 ping-pong, 2 foosball, 2 PS5)
-- ---------------------------------------------------------------------
do $$
declare
  v_tenant uuid := '11111111-1111-1111-1111-111111111111';
  v_branch uuid := '22222222-2222-2222-2222-222222222222';
  v_pool uuid     := '33333333-3333-3333-3333-333333333301';
  v_bowling uuid  := '33333333-3333-3333-3333-333333333302';
  v_ping uuid     := '33333333-3333-3333-3333-333333333303';
  v_foos uuid     := '33333333-3333-3333-3333-333333333304';
  v_ps5 uuid      := '33333333-3333-3333-3333-333333333305';
  i int;
begin
  for i in 1..4 loop
    insert into public.stations (tenant_id, branch_id, game_type_id, code, display_name, position_x, position_y)
    values (v_tenant, v_branch, v_pool, 'POOL-0'||i, 'Pool '||i, i, 1)
    on conflict (branch_id, code) do nothing;
  end loop;
  for i in 1..4 loop
    insert into public.stations (tenant_id, branch_id, game_type_id, code, display_name, position_x, position_y)
    values (v_tenant, v_branch, v_bowling, 'BOWL-0'||i, 'Bowling Lane '||i, i, 2)
    on conflict (branch_id, code) do nothing;
  end loop;
  for i in 1..2 loop
    insert into public.stations (tenant_id, branch_id, game_type_id, code, display_name, position_x, position_y)
    values (v_tenant, v_branch, v_ping, 'PING-0'||i, 'Ping Pong '||i, i, 3)
    on conflict (branch_id, code) do nothing;
  end loop;
  for i in 1..2 loop
    insert into public.stations (tenant_id, branch_id, game_type_id, code, display_name, position_x, position_y)
    values (v_tenant, v_branch, v_foos, 'FOOS-0'||i, 'Foosball '||i, i, 4)
    on conflict (branch_id, code) do nothing;
  end loop;
  for i in 1..2 loop
    insert into public.stations (tenant_id, branch_id, game_type_id, code, display_name, position_x, position_y)
    values (v_tenant, v_branch, v_ps5, 'PS5-0'||i, 'PS5 Room '||i, i, 5)
    on conflict (branch_id, code) do nothing;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Pricing rules (sample)
-- ---------------------------------------------------------------------
insert into public.pricing_rules (tenant_id, game_type_id, name, unit, amount_cents) values
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333301', 'Pool — Standard',     'per_hour',         5000),  -- 50 SAR/hr
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333302', 'Bowling — Per Game',  'per_player_hour',  3000),  -- 30 SAR/player-game
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333303', 'Ping Pong — Standard','per_hour',         4000),
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333304', 'Foosball — Standard', 'per_hour',         4000),
  ('11111111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333305', 'PS5 — Standard',      'per_hour',         6000)
on conflict do nothing;

-- ---------------------------------------------------------------------
-- Badges
-- ---------------------------------------------------------------------
insert into public.badges (tenant_id, code, name_ar, name_en, description, icon) values
  ('11111111-1111-1111-1111-111111111111', 'first_visit',  'الزيارة الأولى',    'First Visit',  'Welcome to Bolos Alley!',       '🎯'),
  ('11111111-1111-1111-1111-111111111111', 'streak_7',     'سلسلة 7 أيام',     '7-Day Streak', 'Visited 7 days in a row',       '🔥'),
  ('11111111-1111-1111-1111-111111111111', 'pool_pro',     'محترف البلياردو',  'Pool Pro',     '20 pool sessions',              '🎱'),
  ('11111111-1111-1111-1111-111111111111', 'bowling_king', 'ملك البولينج',     'Bowling King', '20 bowling games',              '🎳'),
  ('11111111-1111-1111-1111-111111111111', 'vip_member',   'عضو VIP',          'VIP Member',   'Reached VIP tier',              '👑')
on conflict (tenant_id, code) do nothing;

-- ---------------------------------------------------------------------
-- Rewards catalog
-- ---------------------------------------------------------------------
insert into public.rewards (tenant_id, name_ar, name_en, description, cost_points, min_tier) values
  ('11111111-1111-1111-1111-111111111111', 'ساعة بلياردو مجانية',    'Free 1hr Pool',         'Redeem for one hour of pool',  500,  'silver'),
  ('11111111-1111-1111-1111-111111111111', 'لعبة بولينج مجانية',     'Free Bowling Game',     'One free game of bowling',     400,  'silver'),
  ('11111111-1111-1111-1111-111111111111', '30 دقيقة PS5 مجانية',     'Free 30min PS5',        '30 minutes of PS5 gaming',     350,  'silver'),
  ('11111111-1111-1111-1111-111111111111', 'مشروب مجاني',            'Free Drink',            'Any drink from the bar',       150,  'silver'),
  ('11111111-1111-1111-1111-111111111111', 'يوم VIP كامل',           'Full VIP Day',          'All-day access, all games',    3000, 'gold')
on conflict do nothing;

-- ---------------------------------------------------------------------
-- Sample offers
-- ---------------------------------------------------------------------
insert into public.offers (tenant_id, code, name, description, discount_type, discount_value, is_active) values
  ('11111111-1111-1111-1111-111111111111', 'WELCOME10',   'Welcome 10%',     '10% off first booking',        'percent',       10, true),
  ('11111111-1111-1111-1111-111111111111', 'TUESDAY2X',   'Tuesday 2x Pts',  'Double loyalty points on Tue', 'double_points', 2,  true),
  ('11111111-1111-1111-1111-111111111111', 'BOWL15',      'Bowling 15 SAR',  '15 SAR off bowling',           'fixed',         1500, true)
on conflict (tenant_id, code) do nothing;
