-- ============================================================================
-- Hatchery save-routes port — full Keeper/Breeder game state in the Arcade DB
-- Extracted 2026-10-08 from Planet's live project (Arboreal-planet-2); these
-- objects were created directly in Planet's database and never committed.
-- Auth model: NO auth.users FKs (the Arcade never copies auth users; Planet
-- UUIDs arrive as the JWT sub and auth.uid() resolves from the Arcade JWT).
-- Every table: revoke-first, RLS + policies, minimal grants.
-- One deliberate fix vs Planet: chondro_player_market.status now allows
-- 'withdrawn' — Planet's reclaim RPC sets it, but Planet's check constraint
-- only allowed active/sold, so reclaim could never succeed there.
-- ============================================================================

-- ----------------------------------------------------------------------------

-- §1 chondro_game_saves: add version (Planet reads/writes it; Arcade lacked it)
-- ----------------------------------------------------------------------------
ALTER TABLE public.chondro_game_saves
  ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;

ALTER TABLE public.chondro_game_saves ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chondro_game_saves_own_insert ON public.chondro_game_saves;
CREATE POLICY chondro_game_saves_own_insert ON public.chondro_game_saves
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS chondro_game_saves_own_update ON public.chondro_game_saves;
CREATE POLICY chondro_game_saves_own_update ON public.chondro_game_saves
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

REVOKE ALL ON TABLE public.chondro_game_saves FROM public, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.chondro_game_saves TO authenticated;

-- ----------------------------------------------------------------------------
-- §2 profiles: directory columns for the breeder facility/social views
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username text,
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS avatar_url text;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Breeder directory: any signed-in player can read the public directory
-- columns (id, username, display_name, avatar_url). The table carries no
-- private data in the Arcade (Planet remains the profile source of truth).
DROP POLICY IF EXISTS profiles_directory_select ON public.profiles;
CREATE POLICY profiles_directory_select ON public.profiles
  FOR SELECT TO authenticated
  USING (true);

-- First-use creation: a signed-in player may create/refresh their own row.
-- The API upserts id + role (from the Planet-issued JWT's user_role claim)
-- on every authenticated call, so Planet stays the role source of truth.
DROP POLICY IF EXISTS profiles_own_insert ON public.profiles;
CREATE POLICY profiles_own_insert ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS profiles_own_update ON public.profiles;
CREATE POLICY profiles_own_update ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

REVOKE ALL ON TABLE public.profiles FROM public, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO authenticated;

-- ----------------------------------------------------------------------------
-- §3 chondro_breeder_identities — one-time breeder initials claim
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chondro_breeder_identities (
  user_id uuid PRIMARY KEY,
  initials text NOT NULL CHECK (initials ~ '^[A-Z]{2,5}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (initials)
);

ALTER TABLE public.chondro_breeder_identities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS breeder_initials_visible ON public.chondro_breeder_identities;
CREATE POLICY breeder_initials_visible ON public.chondro_breeder_identities
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS breeder_claim_own_initials ON public.chondro_breeder_identities;
CREATE POLICY breeder_claim_own_initials ON public.chondro_breeder_identities
  FOR INSERT TO authenticated
  WITH CHECK (user_id = ( SELECT auth.uid() AS uid));

REVOKE ALL ON TABLE public.chondro_breeder_identities FROM public, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.chondro_breeder_identities TO authenticated;

-- ----------------------------------------------------------------------------
-- §4 chondro_breeder_friendships
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chondro_breeder_friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL,
  addressee_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (requester_id <> addressee_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS chondro_breeder_friendships_pair_unique
  ON public.chondro_breeder_friendships (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));
CREATE INDEX IF NOT EXISTS chondro_breeder_friendships_requester_idx
  ON public.chondro_breeder_friendships (requester_id);
CREATE INDEX IF NOT EXISTS chondro_breeder_friendships_addressee_idx
  ON public.chondro_breeder_friendships (addressee_id);

ALTER TABLE public.chondro_breeder_friendships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS breeders_see_own_friendships ON public.chondro_breeder_friendships;
CREATE POLICY breeders_see_own_friendships ON public.chondro_breeder_friendships
  FOR SELECT TO authenticated
  USING ((( SELECT auth.uid() AS uid) = requester_id) OR (( SELECT auth.uid() AS uid) = addressee_id));

DROP POLICY IF EXISTS breeders_send_own_requests ON public.chondro_breeder_friendships;
CREATE POLICY breeders_send_own_requests ON public.chondro_breeder_friendships
  FOR INSERT TO authenticated
  WITH CHECK ((( SELECT auth.uid() AS uid) = requester_id) AND (requester_id <> addressee_id) AND (status = 'pending'::text));

DROP POLICY IF EXISTS breeders_accept_requests ON public.chondro_breeder_friendships;
CREATE POLICY breeders_accept_requests ON public.chondro_breeder_friendships
  FOR UPDATE TO authenticated
  USING (( SELECT auth.uid() AS uid) = addressee_id)
  WITH CHECK ((( SELECT auth.uid() AS uid) = addressee_id) AND (status = 'accepted'::text));

DROP POLICY IF EXISTS breeders_remove_own_friendships ON public.chondro_breeder_friendships;
CREATE POLICY breeders_remove_own_friendships ON public.chondro_breeder_friendships
  FOR DELETE TO authenticated
  USING ((( SELECT auth.uid() AS uid) = requester_id) OR (( SELECT auth.uid() AS uid) = addressee_id));

REVOKE ALL ON TABLE public.chondro_breeder_friendships FROM public, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.chondro_breeder_friendships TO authenticated;

-- ----------------------------------------------------------------------------
-- §5 chondro_breeder_showcase
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chondro_breeder_showcase (
  owner_id uuid NOT NULL,
  snake_id text NOT NULL CHECK (char_length(snake_id) BETWEEN 1 AND 160),
  snake jsonb NOT NULL CHECK (jsonb_typeof(snake) = 'object'),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (owner_id, snake_id)
);

ALTER TABLE public.chondro_breeder_showcase ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS showcase_view ON public.chondro_breeder_showcase;
CREATE POLICY showcase_view ON public.chondro_breeder_showcase
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS showcase_publish_own ON public.chondro_breeder_showcase;
CREATE POLICY showcase_publish_own ON public.chondro_breeder_showcase
  FOR INSERT TO authenticated
  WITH CHECK (( SELECT auth.uid() AS uid) = owner_id);

DROP POLICY IF EXISTS showcase_update_own ON public.chondro_breeder_showcase;
CREATE POLICY showcase_update_own ON public.chondro_breeder_showcase
  FOR UPDATE TO authenticated
  USING (( SELECT auth.uid() AS uid) = owner_id)
  WITH CHECK (( SELECT auth.uid() AS uid) = owner_id);

DROP POLICY IF EXISTS showcase_unpublish_own ON public.chondro_breeder_showcase;
CREATE POLICY showcase_unpublish_own ON public.chondro_breeder_showcase
  FOR DELETE TO authenticated
  USING (( SELECT auth.uid() AS uid) = owner_id);

REVOKE ALL ON TABLE public.chondro_breeder_showcase FROM public, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.chondro_breeder_showcase TO authenticated;

-- ----------------------------------------------------------------------------
-- §6 chondro_breeder_spaces
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chondro_breeder_spaces (
  user_id uuid PRIMARY KEY,
  space_name text NOT NULL DEFAULT 'My Chondro Room' CHECK (char_length(space_name) BETWEEN 1 AND 60),
  tagline text NOT NULL DEFAULT '' CHECK (char_length(tagline) <= 140),
  theme text NOT NULL DEFAULT 'canopy' CHECK (theme IN ('canopy', 'moss', 'mist', 'ember', 'ocean', 'night')),
  layout text NOT NULL DEFAULT 'gallery' CHECK (layout IN ('gallery', 'spotlight', 'compact')),
  program_focus text NOT NULL DEFAULT 'mixed' CHECK (program_focus IN ('locality', 'traits', 'mixed', 'designer')),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chondro_breeder_spaces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS spaces_visible ON public.chondro_breeder_spaces;
CREATE POLICY spaces_visible ON public.chondro_breeder_spaces
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS spaces_create_own ON public.chondro_breeder_spaces;
CREATE POLICY spaces_create_own ON public.chondro_breeder_spaces
  FOR INSERT TO authenticated
  WITH CHECK (( SELECT auth.uid() AS uid) = user_id);

DROP POLICY IF EXISTS spaces_update_own ON public.chondro_breeder_spaces;
CREATE POLICY spaces_update_own ON public.chondro_breeder_spaces
  FOR UPDATE TO authenticated
  USING (( SELECT auth.uid() AS uid) = user_id)
  WITH CHECK (( SELECT auth.uid() AS uid) = user_id);

REVOKE ALL ON TABLE public.chondro_breeder_spaces FROM public, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.chondro_breeder_spaces TO authenticated;

-- ----------------------------------------------------------------------------
-- §7 chondro_breeder_lines
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chondro_breeder_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  name text NOT NULL CHECK (char_length(name) BETWEEN 2 AND 60),
  focus text NOT NULL DEFAULT '' CHECK (char_length(focus) <= 160),
  founder_snake_id text NOT NULL CHECK (char_length(founder_snake_id) BETWEEN 1 AND 160),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS chondro_breeder_lines_owner_name_unique
  ON public.chondro_breeder_lines (owner_id, lower(name));
CREATE INDEX IF NOT EXISTS chondro_breeder_lines_owner_idx
  ON public.chondro_breeder_lines (owner_id);

ALTER TABLE public.chondro_breeder_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lines_view ON public.chondro_breeder_lines;
CREATE POLICY lines_view ON public.chondro_breeder_lines
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS lines_create_own ON public.chondro_breeder_lines;
CREATE POLICY lines_create_own ON public.chondro_breeder_lines
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS lines_update_own ON public.chondro_breeder_lines;
CREATE POLICY lines_update_own ON public.chondro_breeder_lines
  FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS lines_delete_own ON public.chondro_breeder_lines;
CREATE POLICY lines_delete_own ON public.chondro_breeder_lines
  FOR DELETE TO authenticated
  USING (auth.uid() = owner_id);

REVOKE ALL ON TABLE public.chondro_breeder_lines FROM public, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.chondro_breeder_lines TO authenticated;

-- ----------------------------------------------------------------------------
-- §8 chondro_conservation_contributions
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chondro_conservation_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  snake_id text NOT NULL,
  subspecies text NOT NULL CHECK (subspecies IN ('Morelia azurea azurea', 'Morelia azurea pulcher', 'Morelia azurea utaraensis', 'Morelia viridis')),
  phenotype_score numeric NOT NULL DEFAULT 0 CHECK (phenotype_score BETWEEN 0 AND 100),
  generation integer NOT NULL DEFAULT 1 CHECK (generation >= 1),
  locality_ancestry jsonb NOT NULL DEFAULT '{}'::jsonb,
  contributed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, snake_id)
);

ALTER TABLE public.chondro_conservation_contributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conservation_read_own ON public.chondro_conservation_contributions;
CREATE POLICY conservation_read_own ON public.chondro_conservation_contributions
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS conservation_insert_own ON public.chondro_conservation_contributions;
CREATE POLICY conservation_insert_own ON public.chondro_conservation_contributions
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

REVOKE ALL ON TABLE public.chondro_conservation_contributions FROM public, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.chondro_conservation_contributions TO authenticated;

-- ----------------------------------------------------------------------------
-- §9 chondro_player_market
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chondro_player_market (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snake_id text NOT NULL,
  seller_id uuid NOT NULL,
  buyer_id uuid,
  snake jsonb NOT NULL CHECK (jsonb_typeof(snake) = 'object'),
  price integer NOT NULL CHECK (price BETWEEN 1 AND 10000000),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'sold', 'withdrawn')),
  listed_at timestamptz NOT NULL DEFAULT now(),
  sold_at timestamptz,
  payout_claimed_at timestamptz,
  sale_channel text,
  original_price integer
);

CREATE INDEX IF NOT EXISTS chondro_player_market_active_listed_idx
  ON public.chondro_player_market (listed_at DESC) WHERE (status = 'active');
CREATE UNIQUE INDEX IF NOT EXISTS chondro_player_market_one_active_snake_idx
  ON public.chondro_player_market (snake_id) WHERE (status = 'active');
CREATE INDEX IF NOT EXISTS chondro_player_market_seller_idx
  ON public.chondro_player_market (seller_id);
CREATE INDEX IF NOT EXISTS chondro_player_market_buyer_idx
  ON public.chondro_player_market (buyer_id);

ALTER TABLE public.chondro_player_market ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS market_visible_listings ON public.chondro_player_market;
CREATE POLICY market_visible_listings ON public.chondro_player_market
  FOR SELECT TO authenticated
  USING ((status = 'active'::text) OR (seller_id = ( SELECT auth.uid() AS uid)) OR (buyer_id = ( SELECT auth.uid() AS uid)));

DROP POLICY IF EXISTS market_list_own ON public.chondro_player_market;
CREATE POLICY market_list_own ON public.chondro_player_market
  FOR INSERT TO authenticated
  WITH CHECK ((seller_id = ( SELECT auth.uid() AS uid)) AND (buyer_id IS NULL) AND (status = 'active'::text));

REVOKE ALL ON TABLE public.chondro_player_market FROM public, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.chondro_player_market TO authenticated;

-- ----------------------------------------------------------------------------
-- §10 chondro_account_grants — one-time bonus ledger (bonus RPC's dupe guard)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chondro_account_grants (
  user_id uuid NOT NULL,
  grant_key text NOT NULL,
  amount integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, grant_key)
);

ALTER TABLE public.chondro_account_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS account_grants_read_own ON public.chondro_account_grants;
CREATE POLICY account_grants_read_own ON public.chondro_account_grants
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

REVOKE ALL ON TABLE public.chondro_account_grants FROM public, anon, authenticated;
GRANT SELECT ON TABLE public.chondro_account_grants TO authenticated;

-- ----------------------------------------------------------------------------
-- §11 chondro_conservation_market_intakes — purebreds acquired via settlement
-- Written only by settle_chondro_market_cycle() (SECURITY DEFINER); no direct
-- player access. RLS enabled with no policies = deny by default.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chondro_conservation_market_intakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  market_listing_id uuid NOT NULL UNIQUE
    REFERENCES public.chondro_player_market(id) ON DELETE CASCADE,
  snake_id text NOT NULL,
  subspecies text NOT NULL,
  phenotype_score numeric NOT NULL DEFAULT 0,
  generation integer NOT NULL DEFAULT 1,
  locality_ancestry jsonb NOT NULL DEFAULT '{}'::jsonb,
  acquired_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.chondro_conservation_market_intakes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.chondro_conservation_market_intakes FROM public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- §12 RPCs (bodies transcribed from Planet's live database, 2026-10-08)
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.buy_chondro_player_market_listing(p_listing_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_buyer uuid := auth.uid();
  v_listing public.chondro_player_market%rowtype;
  v_state jsonb;
  v_cash numeric;
  v_capacity integer;
  v_colony_count integer;
begin
  if v_buyer is null then raise exception 'Sign in required'; end if;

  select * into v_listing
  from public.chondro_player_market
  where id = p_listing_id and status = 'active'
  for update;

  if not found then raise exception 'This snake is no longer available'; end if;
  if v_listing.seller_id = v_buyer then raise exception 'You cannot buy your own snake'; end if;

  select state into v_state
  from public.chondro_game_saves
  where user_id = v_buyer
  for update;

  if v_state is null then raise exception 'Start Chondro Breeder before buying from players'; end if;

  v_cash := coalesce((v_state ->> 'cash')::numeric, 0);
  v_capacity := coalesce((v_state -> 'enclosures' ->> 'Chondro Dojo Bin')::integer, 0)
              + coalesce((v_state -> 'enclosures' ->> 'PVC Arboreal')::integer, 0);
  v_colony_count := jsonb_array_length(coalesce(v_state -> 'colony', '[]'::jsonb));

  if v_cash < v_listing.price then raise exception 'Not enough game cash'; end if;
  if v_colony_count >= v_capacity then raise exception 'Buy an enclosure before adding this snake'; end if;

  update public.chondro_game_saves
  set state = jsonb_set(
        jsonb_set(v_state, '{cash}', to_jsonb(v_cash - v_listing.price), true),
        '{colony}',
        coalesce(v_state -> 'colony', '[]'::jsonb) || jsonb_build_array(v_listing.snake),
        true
      ),
      updated_at = now()
  where user_id = v_buyer;

  update public.chondro_player_market
  set status = 'sold', buyer_id = v_buyer, sold_at = now()
  where id = v_listing.id;

  return jsonb_build_object('listingId', v_listing.id, 'snake', v_listing.snake, 'price', v_listing.price);
end;
$function$;

CREATE OR REPLACE FUNCTION public.chondro_conservation_status()
 RETURNS TABLE(subspecies text, contribution_count bigint, stewardship_score numeric, import_multiplier numeric, phenotype_bonus integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  with subspecies_list(subspecies) as (
    values
      ('Morelia azurea azurea'::text),
      ('Morelia azurea pulcher'::text),
      ('Morelia azurea utaraensis'::text),
      ('Morelia viridis'::text)
  ), direct_counts as (
    select c.subspecies, count(*)::bigint as n
    from public.chondro_conservation_contributions c
    group by c.subspecies
  ), market_counts as (
    select c.subspecies, count(*)::bigint as n
    from public.chondro_conservation_market_intakes c
    group by c.subspecies
  ), counts as (
    select
      s.subspecies,
      coalesce(d.n, 0)::bigint + coalesce(m.n, 0)::bigint as contribution_count
    from subspecies_list s
    left join direct_counts d using (subspecies)
    left join market_counts m using (subspecies)
  ), scored as (
    select
      counts.subspecies,
      counts.contribution_count,
      least(100::numeric, round((21.7 * ln(1 + counts.contribution_count::numeric))::numeric, 1)) as stewardship_score
    from counts
  )
  select
    scored.subspecies,
    scored.contribution_count,
    scored.stewardship_score,
    round((1 + scored.stewardship_score * 0.006)::numeric, 3) as import_multiplier,
    floor(scored.stewardship_score / 12.5)::integer as phenotype_bonus
  from scored
  order by scored.subspecies;
$function$;

CREATE OR REPLACE FUNCTION public.chondro_contribute_animal(p_snake_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_uid uuid := auth.uid();
  v_state jsonb;
  v_snake jsonb;
  v_subspecies text;
  v_ancestry numeric;
  v_new_colony jsonb;
  v_active_clutch jsonb;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  select state into v_state
  from public.chondro_game_saves
  where user_id = v_uid
  for update;

  if v_state is null then
    raise exception 'Game save not found';
  end if;

  select elem into v_snake
  from jsonb_array_elements(coalesce(v_state->'colony','[]'::jsonb)) elem
  where elem->>'id' = p_snake_id
  limit 1;

  if v_snake is null then
    raise exception 'Animal not found in colony';
  end if;

  if coalesce(v_snake->>'classification','') <> 'Pure' then
    raise exception 'Only pure subspecies animals qualify';
  end if;

  v_subspecies := v_snake->>'subspecies';
  if v_subspecies not in ('Morelia azurea azurea','Morelia azurea pulcher','Morelia azurea utaraensis','Morelia viridis') then
    raise exception 'Unsupported subspecies';
  end if;

  begin
    v_ancestry := coalesce((v_snake->'ancestry'->>v_subspecies)::numeric, 0);
  exception when others then
    v_ancestry := 0;
  end;

  if v_ancestry < 99.9 then
    raise exception 'Animal must be at least 99.9%% pure for its subspecies';
  end if;

  v_active_clutch := v_state->'clutch';
  if v_active_clutch is not null and v_active_clutch <> 'null'::jsonb and (
    v_active_clutch->'dam'->>'id' = p_snake_id or
    v_active_clutch->'sire'->>'id' = p_snake_id
  ) then
    raise exception 'Animal is part of an active clutch';
  end if;

  insert into public.chondro_conservation_contributions (
    user_id, snake_id, subspecies, phenotype_score, generation, locality_ancestry
  ) values (
    v_uid,
    p_snake_id,
    v_subspecies,
    greatest(0, least(100, coalesce((v_snake->>'phenotypeScore')::numeric, 0))),
    greatest(1, coalesce((v_snake->>'generation')::integer, 1)),
    coalesce(v_snake->'localityAncestry','{}'::jsonb)
  );

  select coalesce(jsonb_agg(elem), '[]'::jsonb) into v_new_colony
  from jsonb_array_elements(coalesce(v_state->'colony','[]'::jsonb)) elem
  where elem->>'id' <> p_snake_id;

  v_state := jsonb_set(v_state, '{colony}', v_new_colony, true);
  if v_state->>'damId' = p_snake_id then v_state := jsonb_set(v_state, '{damId}', '""'::jsonb, true); end if;
  if v_state->>'sireId' = p_snake_id then v_state := jsonb_set(v_state, '{sireId}', '""'::jsonb, true); end if;

  update public.chondro_game_saves
  set state = v_state, updated_at = now()
  where user_id = v_uid;

  return jsonb_build_object(
    'ok', true,
    'snakeId', p_snake_id,
    'subspecies', v_subspecies,
    'phenotypeScore', coalesce((v_snake->>'phenotypeScore')::numeric, 0)
  );
end;
$function$;

-- Reads auth.users for handle matching; the Arcade's auth.users is empty by
-- design, so the profile-username match is what grants the bonus here.
CREATE OR REPLACE FUNCTION public.claim_arborealsbybunn_chondro_bonus()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'auth'
AS $function$
declare
  uid uuid := auth.uid();
  profile_handle text;
  email_handle text;
  meta_username text;
  meta_user_name text;
  meta_preferred text;
  current_state jsonb;
  current_cash numeric;
  inserted_user uuid;
begin
  if uid is null then
    return 0;
  end if;

  select lower(coalesce(p.username, ''))
    into profile_handle
  from public.profiles p
  where p.id = uid;

  select
    lower(split_part(coalesce(u.email, ''), '@', 1)),
    lower(coalesce(u.raw_user_meta_data->>'username', '')),
    lower(coalesce(u.raw_user_meta_data->>'user_name', '')),
    lower(coalesce(u.raw_user_meta_data->>'preferred_username', ''))
  into email_handle, meta_username, meta_user_name, meta_preferred
  from auth.users u
  where u.id = uid;

  if 'arborealsbybunn' <> all(array[
    coalesce(profile_handle, ''),
    coalesce(email_handle, ''),
    coalesce(meta_username, ''),
    coalesce(meta_user_name, ''),
    coalesce(meta_preferred, '')
  ]) then
    return 0;
  end if;

  select state
    into current_state
  from public.chondro_game_saves
  where user_id = uid
  for update;

  if current_state is null then
    return 0;
  end if;

  insert into public.chondro_account_grants(user_id, grant_key, amount)
  values (uid, 'arborealsbybunn_2026_09_08_bonus', 10000)
  on conflict (user_id, grant_key) do nothing
  returning user_id into inserted_user;

  if inserted_user is null then
    return 0;
  end if;

  current_cash := coalesce((current_state->>'cash')::numeric, 0);

  update public.chondro_game_saves
  set state = jsonb_set(current_state, '{cash}', to_jsonb(current_cash + 10000), true),
      updated_at = now()
  where user_id = uid;

  return 10000;
end;
$function$;

CREATE OR REPLACE FUNCTION public.claim_chondro_market_proceeds()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_seller uuid := auth.uid();
  v_state jsonb;
  v_total numeric := 0;
  v_count integer := 0;
  v_sales jsonb := '[]'::jsonb;
begin
  if v_seller is null then raise exception 'Sign in required'; end if;

  select state into v_state
  from public.chondro_game_saves
  where user_id = v_seller
  for update;
  if v_state is null then raise exception 'Game save not found'; end if;

  perform 1
  from public.chondro_player_market
  where seller_id = v_seller
    and status = 'sold'
    and payout_claimed_at is null
  for update;

  select
    count(*),
    coalesce(sum(price), 0),
    coalesce(jsonb_agg(jsonb_build_object(
      'id', snake_id,
      'name', coalesce(snake ->> 'name', 'Unnamed snake'),
      'value', price,
      'season', coalesce((v_state ->> 'season')::integer, 1)
    ) order by sold_at, id), '[]'::jsonb)
  into v_count, v_total, v_sales
  from public.chondro_player_market
  where seller_id = v_seller
    and status = 'sold'
    and payout_claimed_at is null;

  if v_count = 0 then
    return jsonb_build_object('claimedCount', 0, 'total', 0);
  end if;

  v_state := jsonb_set(
    v_state,
    '{cash}',
    to_jsonb(coalesce((v_state ->> 'cash')::numeric, 0) + v_total),
    true
  );
  v_state := jsonb_set(
    v_state,
    '{sales}',
    v_sales || coalesce(v_state -> 'sales', '[]'::jsonb),
    true
  );

  update public.chondro_game_saves
  set state = v_state, updated_at = now()
  where user_id = v_seller;

  update public.chondro_player_market
  set payout_claimed_at = now()
  where seller_id = v_seller
    and status = 'sold'
    and payout_claimed_at is null;

  return jsonb_build_object('claimedCount', v_count, 'total', v_total);
end;
$function$;

CREATE OR REPLACE FUNCTION public.keeper_has_unlimited_spaces()
 RETURNS boolean
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select auth.uid() is not null
    and exists (
      select 1
      from public.keeper_unlimited_spaces
      where user_id = auth.uid()
    );
$function$;

CREATE OR REPLACE FUNCTION public.list_chondro_snake_for_player_market(p_snake_id text, p_price integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_seller uuid := auth.uid();
  v_state jsonb;
  v_snake jsonb;
  v_colony jsonb;
  v_listing_id uuid;
begin
  if v_seller is null then raise exception 'Sign in required'; end if;
  if p_price < 1 or p_price > 10000000 then raise exception 'Invalid sale value'; end if;

  select state into v_state
  from public.chondro_game_saves
  where user_id = v_seller
  for update;
  if v_state is null then raise exception 'Game save not found'; end if;

  if p_snake_id = any(
    select jsonb_array_elements_text(coalesce(v_state -> 'favoriteIds', '[]'::jsonb))
  ) then
    raise exception 'Favorite snakes must be unfavorited before they can be sold';
  end if;

  select animal into v_snake
  from jsonb_array_elements(coalesce(v_state -> 'colony', '[]'::jsonb)) as animal
  where animal ->> 'id' = p_snake_id
  limit 1;
  if v_snake is null then raise exception 'Snake is no longer in your colony'; end if;
  if v_snake ->> 'nidoStatus' = 'Positive' then raise exception 'Nido-positive snakes cannot enter the player market'; end if;

  select coalesce(jsonb_agg(animal), '[]'::jsonb) into v_colony
  from jsonb_array_elements(coalesce(v_state -> 'colony', '[]'::jsonb)) as animal
  where animal ->> 'id' <> p_snake_id;

  insert into public.chondro_player_market (snake_id, seller_id, snake, price)
  values (p_snake_id, v_seller, v_snake, p_price)
  returning id into v_listing_id;

  v_state := jsonb_set(v_state, '{colony}', v_colony, true);

  update public.chondro_game_saves
  set state = v_state, updated_at = now()
  where user_id = v_seller;

  return jsonb_build_object('listingId', v_listing_id, 'snake', v_snake, 'price', p_price);
end;
$function$;

CREATE OR REPLACE FUNCTION public.reclaim_chondro_player_market_listing(p_listing_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_user uuid := auth.uid();
  v_listing public.chondro_player_market%rowtype;
  v_state jsonb;
  v_capacity integer;
  v_colony_count integer;
  v_colony jsonb;
begin
  if v_user is null then raise exception 'Sign in required'; end if;

  select * into v_listing
  from public.chondro_player_market
  where id = p_listing_id and status = 'active'
  for update;

  if not found then raise exception 'This listing is no longer active'; end if;
  if v_listing.seller_id <> v_user then raise exception 'You can only reclaim your own snake'; end if;

  select state into v_state
  from public.chondro_game_saves
  where user_id = v_user
  for update;
  if v_state is null then raise exception 'Game save not found'; end if;

  v_capacity := coalesce((v_state -> 'enclosures' ->> 'Chondro Dojo Bin')::integer, 0)
              + coalesce((v_state -> 'enclosures' ->> 'PVC Arboreal')::integer, 0);
  v_colony_count := jsonb_array_length(coalesce(v_state -> 'colony', '[]'::jsonb));

  if v_colony_count >= v_capacity then raise exception 'Buy an enclosure before reclaiming this snake'; end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(v_state -> 'colony', '[]'::jsonb)) animal
    where animal ->> 'id' = v_listing.snake_id
  ) then raise exception 'This snake is already in your colony'; end if;

  v_colony := coalesce(v_state -> 'colony', '[]'::jsonb) || jsonb_build_array(v_listing.snake);
  v_state := jsonb_set(v_state, '{colony}', v_colony, true);

  update public.chondro_game_saves
  set state = v_state, updated_at = now()
  where user_id = v_user;

  update public.chondro_player_market
  set status = 'withdrawn', buyer_id = null, sold_at = now(), payout_claimed_at = null
  where id = v_listing.id;

  return jsonb_build_object('listingId', v_listing.id, 'snake', v_listing.snake, 'price', v_listing.price);
end;
$function$;

CREATE OR REPLACE FUNCTION public.list_chondro_clutch_for_player_market(p_clutch jsonb, p_holdback_ids text[], p_sale_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_seller uuid := auth.uid();
  v_state jsonb;
  v_offspring jsonb;
  v_item jsonb;
  v_snake jsonb;
  v_listings jsonb := '[]'::jsonb;
  v_total integer := 0;
  v_price integer;
  v_snake_id text;
  v_listing_id uuid;
  v_expected_sales integer;
  v_actual_sales integer;
begin
  if v_seller is null then raise exception 'Sign in required'; end if;
  if jsonb_typeof(p_clutch) <> 'object'
     or jsonb_typeof(p_clutch -> 'offspring') <> 'array' then
    raise exception 'Invalid clutch';
  end if;

  v_offspring := p_clutch -> 'offspring';
  if jsonb_array_length(v_offspring) < 1 or jsonb_array_length(v_offspring) > 20 then
    raise exception 'Invalid clutch size';
  end if;
  if jsonb_typeof(p_sale_items) <> 'array' then
    raise exception 'Invalid sale list';
  end if;

  select state into v_state
  from public.chondro_game_saves
  where user_id = v_seller
  for update;
  if v_state is null then raise exception 'Game save not found'; end if;

  v_expected_sales := (
    select count(*)
    from jsonb_array_elements(v_offspring) as animal
    where not ((animal ->> 'id') = any(coalesce(p_holdback_ids, array[]::text[])))
  );
  v_actual_sales := jsonb_array_length(p_sale_items);
  if v_actual_sales <> v_expected_sales then
    raise exception 'Every unheld offspring must be included exactly once';
  end if;

  for v_item in select value from jsonb_array_elements(p_sale_items)
  loop
    v_snake_id := left(coalesce(v_item ->> 'snakeId', ''), 160);
    v_price := coalesce((v_item ->> 'price')::integer, 0);
    if v_snake_id = '' or v_price < 1 or v_price > 10000000 then
      raise exception 'Invalid sale item';
    end if;
    if v_snake_id = any(coalesce(p_holdback_ids, array[]::text[])) then
      raise exception 'A holdback cannot be listed';
    end if;
    if (select count(*) from jsonb_array_elements(p_sale_items) item where item ->> 'snakeId' = v_snake_id) <> 1 then
      raise exception 'Duplicate offspring in sale list';
    end if;

    select animal into v_snake
    from jsonb_array_elements(v_offspring) as animal
    where animal ->> 'id' = v_snake_id
    limit 1;
    if v_snake is null then raise exception 'Sale item is not part of this clutch'; end if;
    if v_snake ->> 'nidoStatus' = 'Positive' then raise exception 'Nido-positive snakes cannot enter the player market'; end if;

    insert into public.chondro_player_market (snake_id, seller_id, snake, price)
    values (v_snake_id, v_seller, v_snake, v_price)
    returning id into v_listing_id;

    v_total := v_total + v_price;
    v_listings := v_listings || jsonb_build_array(jsonb_build_object(
      'listingId', v_listing_id,
      'snakeId', v_snake_id,
      'price', v_price
    ));
  end loop;

  return jsonb_build_object(
    'listedCount', v_actual_sales,
    'total', v_total,
    'listings', v_listings
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.settle_chondro_market_cycle()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_listing public.chondro_player_market%rowtype;
  v_subspecies text;
  v_ancestry numeric;
  v_is_pure boolean;
  v_payout integer;
  v_pet_count integer := 0;
  v_conservation_count integer := 0;
  v_total_payout integer := 0;
begin
  if auth.uid() is null then raise exception 'Sign in required'; end if;

  perform pg_advisory_xact_lock(8240260910);

  for v_listing in
    select *
    from public.chondro_player_market
    where status = 'active'
      and listed_at <= now() - interval '48 hours'
    order by listed_at
    for update skip locked
  loop
    v_subspecies := coalesce(v_listing.snake ->> 'subspecies', '');
    begin
      v_ancestry := coalesce((v_listing.snake -> 'ancestry' ->> v_subspecies)::numeric, 0);
    exception when others then
      v_ancestry := 0;
    end;

    v_is_pure := coalesce(v_listing.snake ->> 'classification', '') = 'Pure'
      and v_subspecies in ('Morelia azurea azurea','Morelia azurea pulcher','Morelia azurea utaraensis','Morelia viridis')
      and v_ancestry >= 99.9;

    v_payout := greatest(1, round(v_listing.price * 0.85));

    update public.chondro_player_market
    set status = 'sold',
        buyer_id = null,
        sold_at = now(),
        original_price = coalesce(original_price, v_listing.price),
        price = v_payout,
        sale_channel = case when v_is_pure then 'conservation' else 'npc_pet' end
    where id = v_listing.id;

    if v_is_pure then
      insert into public.chondro_conservation_market_intakes (
        market_listing_id, snake_id, subspecies, phenotype_score, generation, locality_ancestry
      ) values (
        v_listing.id,
        v_listing.snake_id,
        v_subspecies,
        greatest(0, least(100, coalesce((v_listing.snake ->> 'phenotypeScore')::numeric, 0))),
        greatest(1, coalesce((v_listing.snake ->> 'generation')::integer, 1)),
        coalesce(v_listing.snake -> 'localityAncestry', '{}'::jsonb)
      ) on conflict (market_listing_id) do nothing;
      v_conservation_count := v_conservation_count + 1;
    else
      v_pet_count := v_pet_count + 1;
    end if;

    v_total_payout := v_total_payout + v_payout;
  end loop;

  return jsonb_build_object(
    'clearedCount', v_pet_count + v_conservation_count,
    'petSales', v_pet_count,
    'conservationAcquisitions', v_conservation_count,
    'sellerPayoutTotal', v_total_payout,
    'payoutRate', 0.85
  );
end;
$function$;

-- Revoke-first, minimal grants: every RPC is SECURITY DEFINER (or RLS-gated)
-- and callable by any signed-in Arcade player.
DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'buy_chondro_player_market_listing',
    'chondro_conservation_status',
    'chondro_contribute_animal',
    'claim_arborealsbybunn_chondro_bonus',
    'claim_chondro_market_proceeds',
    'keeper_has_unlimited_spaces',
    'list_chondro_snake_for_player_market',
    'reclaim_chondro_player_market_listing',
    'list_chondro_clutch_for_player_market',
    'settle_chondro_market_cycle'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I FROM public, anon, authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I TO authenticated', fn);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- §13 Verification
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  missing text[];
BEGIN
  SELECT array_agg(t)
  INTO missing
  FROM (VALUES
    ('chondro_breeder_identities'), ('chondro_breeder_friendships'),
    ('chondro_breeder_showcase'), ('chondro_breeder_spaces'),
    ('chondro_breeder_lines'), ('chondro_conservation_contributions'),
    ('chondro_player_market'), ('chondro_account_grants'),
    ('chondro_conservation_market_intakes')
  ) AS v(t)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = v.t
  );
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'hatchery port: missing tables: %', array_to_string(missing, ', ');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'chondro_game_saves' AND column_name = 'version'
  ) THEN
    RAISE EXCEPTION 'hatchery port: chondro_game_saves.version missing';
  END IF;
  RAISE NOTICE 'hatchery port: all 9 tables + game_saves.version present';
END $$;
