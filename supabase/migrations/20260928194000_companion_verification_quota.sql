-- Service-only, durable verification budgets. Anonymous user sessions are
-- supported, so a project-wide ceiling also bounds account rotation.
CREATE TABLE public.companion_verification_quota (
  subject text NOT NULL,
  window_start timestamptz NOT NULL,
  window_seconds integer NOT NULL,
  requests integer NOT NULL DEFAULT 0,
  PRIMARY KEY (subject, window_start, window_seconds)
);
ALTER TABLE public.companion_verification_quota ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.companion_verification_quota FROM anon, authenticated;
CREATE INDEX companion_verification_quota_expiry ON public.companion_verification_quota (window_start);

CREATE OR REPLACE FUNCTION public.consume_companion_verification_quota(caller_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  bucket timestamptz;
  quota record;
  used integer;
BEGIN
  IF caller_id IS NULL THEN RETURN false; END IF;
  -- Serialize the short counter transaction so concurrent requests cannot
  -- pass a check together, and no budget is consumed on a denied attempt.
  PERFORM pg_catalog.pg_advisory_xact_lock(728391004);
  DELETE FROM public.companion_verification_quota WHERE window_start < now() - interval '2 hours';
  FOR quota IN SELECT * FROM (VALUES
    (caller_id::text, 60, 3), (caller_id::text, 3600, 30),
    ('global', 60, 30), ('global', 3600, 300)
  ) AS limits(subject, seconds, maximum) LOOP
    bucket := to_timestamp(floor(extract(epoch FROM now()) / quota.seconds) * quota.seconds);
    SELECT requests INTO used FROM public.companion_verification_quota
      WHERE subject = quota.subject AND window_start = bucket AND window_seconds = quota.seconds;
    IF coalesce(used, 0) >= quota.maximum THEN RETURN false; END IF;
  END LOOP;
  FOR quota IN SELECT * FROM (VALUES
    (caller_id::text, 60), (caller_id::text, 3600), ('global', 60), ('global', 3600)
  ) AS limits(subject, seconds) LOOP
    bucket := to_timestamp(floor(extract(epoch FROM now()) / quota.seconds) * quota.seconds);
    INSERT INTO public.companion_verification_quota AS q (subject, window_start, window_seconds, requests)
      VALUES (quota.subject, bucket, quota.seconds, 1)
      ON CONFLICT (subject, window_start, window_seconds) DO UPDATE SET requests = q.requests + 1;
  END LOOP;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.consume_companion_verification_quota(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_companion_verification_quota(uuid) TO service_role;
