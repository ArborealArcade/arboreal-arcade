CREATE OR REPLACE FUNCTION public.canopy_hunter_is_exempt()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.canopy_hunter_exemptions WHERE user_id = auth.uid()
  );
$$;
REVOKE ALL ON FUNCTION public.canopy_hunter_is_exempt() FROM public;
GRANT EXECUTE ON FUNCTION public.canopy_hunter_is_exempt() TO authenticated;

-- True when the signed-in user may see the Canopy Hunter river port stop.
