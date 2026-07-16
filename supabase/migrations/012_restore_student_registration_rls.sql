-- Restore the RLS rules needed by public student registration.
-- The frontend uses the anon/publishable key for student self-registration,
-- while authenticated admins still manage existing student records.

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.students TO authenticated;
GRANT SELECT, INSERT ON public.students TO anon;

DROP POLICY IF EXISTS "Anyone can register students" ON public.students;
DROP POLICY IF EXISTS "Anyone can read students" ON public.students;
DROP POLICY IF EXISTS "Admins manage students" ON public.students;

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
