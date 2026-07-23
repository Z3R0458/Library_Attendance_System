-- Complete RLS policies needed by the current frontend.
-- This is useful when wiring a fresh Supabase project.

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auto_logout_logs ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT ON public.students TO anon;
GRANT SELECT, INSERT ON public.attendance TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.students TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.attendance TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT SELECT ON public.auto_logout_logs TO authenticated;

DROP POLICY IF EXISTS "Anyone can register students" ON public.students;
DROP POLICY IF EXISTS "Anyone can read students" ON public.students;
DROP POLICY IF EXISTS "Admins manage students" ON public.students;
DROP POLICY IF EXISTS "Anyone can read attendance" ON public.attendance;
DROP POLICY IF EXISTS "Anyone can insert attendance" ON public.attendance;
DROP POLICY IF EXISTS "Admins manage attendance" ON public.attendance;
DROP POLICY IF EXISTS "Admins read settings" ON public.app_settings;
DROP POLICY IF EXISTS "Admins manage settings" ON public.app_settings;
DROP POLICY IF EXISTS "Admins read auto_logout_logs" ON public.auto_logout_logs;

CREATE POLICY "Anyone can register students"
  ON public.students FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Anyone can read students"
  ON public.students FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Admins manage students"
  ON public.students FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anyone can read attendance"
  ON public.attendance FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Anyone can insert attendance"
  ON public.attendance FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "Admins manage attendance"
  ON public.attendance FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admins read settings"
  ON public.app_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins manage settings"
  ON public.app_settings FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admins read auto_logout_logs"
  ON public.auto_logout_logs FOR SELECT
  TO authenticated
  USING (true);
