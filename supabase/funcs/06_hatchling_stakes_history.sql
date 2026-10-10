CREATE OR REPLACE FUNCTION public.hatchling_stakes_history(p_limit int DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'wager_id', w.id, 'mode', w.mode, 'game', w.game, 'state', w.state,
      'rule_version', w.rule_version, 'created_at', w.created_at,
      'player_asset', (SELECT asset_key FROM public.hatchling_stakes_wager_entries e
                       WHERE e.wager_id = w.id AND e.actor = auth.uid()),
      'npc_asset', w.npc_asset_key,
      'winner', s.winner, 'player_score', s.player_score, 'target', s.target_score,
      'hands_played', s.hands_played,
      'player_is_winner', s.winner = auth.uid()
    ) ORDER BY w.created_at DESC)
    FROM public.hatchling_stakes_wagers w
    LEFT JOIN public.hatchling_stakes_game_sessions s ON s.wager_id = w.id
    WHERE w.creator = auth.uid()
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100)
  ), '[]'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public.hatchling_stakes_history(int) FROM public;
GRANT EXECUTE ON FUNCTION public.hatchling_stakes_history(int) TO authenticated;

-- Public session projection for the wager creator: everything EXCEPT the shoe.
-- The browser never learns undealt cards.
