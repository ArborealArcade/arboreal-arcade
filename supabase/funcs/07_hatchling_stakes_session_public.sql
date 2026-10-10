CREATE OR REPLACE FUNCTION public.hatchling_stakes_session_public(p_wager_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_creator uuid;
BEGIN
  SELECT w.creator INTO v_creator FROM public.hatchling_stakes_wagers w WHERE w.id = p_wager_id;
  IF NOT FOUND OR v_creator <> auth.uid() THEN
    RAISE EXCEPTION 'wager not found';
  END IF;
  RETURN (
    SELECT jsonb_build_object(
      'wager_id', w.id,
      'wager_state', w.state,
      'mode', w.mode,
      'game', w.game,
      'rule_version', w.rule_version,
      'npc_asset_key', w.npc_asset_key,
      'npc_name', (SELECT a.trait_snapshot->>'name'
                  FROM public.hatchling_stakes_animals a WHERE a.asset_key = w.npc_asset_key),
      'tier', (SELECT e.snapshot->>'tier' FROM public.hatchling_stakes_wager_entries e
               WHERE e.wager_id = w.id AND e.actor = auth.uid()),
      'player_asset_key', (SELECT e.asset_key FROM public.hatchling_stakes_wager_entries e
                           WHERE e.wager_id = w.id AND e.actor = auth.uid()),
      'player_asset_name', (SELECT e.snapshot->'snapshot'->>'name'
                            FROM public.hatchling_stakes_wager_entries e
                            WHERE e.wager_id = w.id AND e.actor = auth.uid()),
      'session_state', s.state,
      'player_score', s.player_score,
      'target_score', s.target_score,
      'hands_played', s.hands_played,
      'base_bet', s.base_bet,
      'winner', s.winner,
      'current_hand', s.current_hand,
      'transcript', s.transcript,
      'seed_commitment', s.seed_commitment
    )
    FROM public.hatchling_stakes_wagers w
    JOIN public.hatchling_stakes_game_sessions s ON s.wager_id = w.id
    WHERE w.id = p_wager_id
  );
END;
$$;
REVOKE ALL ON FUNCTION public.hatchling_stakes_session_public(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.hatchling_stakes_session_public(uuid) TO authenticated;

-- Store/replace the in-progress hand (trusted game service only, creator-scoped).
