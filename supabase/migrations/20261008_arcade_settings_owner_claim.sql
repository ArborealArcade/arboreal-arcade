-- Owner writes to arcade_settings trust the user_role claim carried in the
-- Arcade JWT (minted by Planet's server, which is the source of truth for
-- roles; the Arcade never syncs user rows into public.profiles).
-- Replaces the profiles-table role check from 20261008_arcade_settings.sql.
-- Revoke/grants from that migration are unchanged.

DROP POLICY IF EXISTS arcade_settings_owner_insert ON public.arcade_settings;
CREATE POLICY arcade_settings_owner_insert ON public.arcade_settings
  FOR INSERT TO authenticated
  WITH CHECK ((auth.jwt() ->> 'user_role') = 'owner');

DROP POLICY IF EXISTS arcade_settings_owner_update ON public.arcade_settings;
CREATE POLICY arcade_settings_owner_update ON public.arcade_settings
  FOR UPDATE TO authenticated
  USING ((auth.jwt() ->> 'user_role') = 'owner')
  WITH CHECK ((auth.jwt() ->> 'user_role') = 'owner');

DROP POLICY IF EXISTS arcade_settings_owner_delete ON public.arcade_settings;
CREATE POLICY arcade_settings_owner_delete ON public.arcade_settings
  FOR DELETE TO authenticated
  USING ((auth.jwt() ->> 'user_role') = 'owner');
