-- Clear stale generation claims from nugget_cache.
--
-- A `status='generating'` row is a lock, not content. A client claims a
-- track before generating so a second client waits instead of paying for
-- duplicate Exa/Gemini work, and the claim is released when generation
-- finishes (the server upserts status='ready' over it) or fails (the
-- client deletes it).
--
-- Twelve claims were never released — the oldest dates to 2026-05-15.
-- Any listener who lands on one of those tracks polls the row, waits out
-- the timeout, and sees nothing. Pete hit this on "Turnover — Humming"
-- (claimed 2026-07-30) and reported that the researching state never
-- resolved and no facts appeared.
--
-- Deleting them is safe and self-healing. A claim row holds no facts
-- (`nuggets` is '[]'), so nothing cached is lost — the next listener
-- regenerates from scratch, which is what would have happened had the
-- claim been released properly.
--
-- Bounded by age so this can never delete a claim that is legitimately
-- in flight: generation completes in roughly 15-60s, so anything older
-- than an hour is abandoned by definition.
--
-- This clears the backlog but does not stop new claims from leaking.
-- Whatever path drops them — a tab closed mid-generation, an unhandled
-- failure between claim and release — still needs finding, and the
-- durable fix is a server-side TTL or reaping stale claims on read
-- rather than trusting a client to clean up after itself.

DELETE FROM public.nugget_cache
 WHERE status = 'generating'
   AND created_at < now() - interval '1 hour';
