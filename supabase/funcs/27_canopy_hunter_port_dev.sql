CREATE OR REPLACE FUNCTION public.canopy_hunter_port_dev()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.canopy_hunter_port_devs x
       WHERE x.user_id = auth.uid()
     );
$$;
REVOKE ALL ON FUNCTION public.canopy_hunter_port_dev() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.canopy_hunter_port_dev() TO authenticated;

-- True when the signed-in user has unlimited snake housing spaces.
