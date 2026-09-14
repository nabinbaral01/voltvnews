-- Backfill for one article's uncounted views.
--
-- "Avengers: The Kang Dynasty's Full Story Plan and Script Leaked!" went out
-- on 14 September 2026, before views were counted for every reader. Until the
-- fix that evening the site only counted readers who had accepted analytics
-- cookies, and recorded 50; the editor's own figure for the same period, from
-- the channels the post was shared on, is 900. Nothing was stored for the
-- other 850, so they are restored here as a number, not as rows.
--
-- The counter already holds the 50, so it moves by 850. The day tally held
-- none of them (it did not exist yet), so 14 September gets the full 900.
-- Both then read 900 for the pre-fix period plus everything counted since.
-- A database without this post (local, demo) is left untouched.
UPDATE "Post"
SET "viewCount" = "viewCount" + 850
WHERE "slug" = 'avengers-the-kang-dynastys-full-story-plan-and-script-leaked';

INSERT INTO "DailyHit" ("day", "path", "postId", "views")
SELECT DATE '2026-09-14', '/marvel/' || p."slug", p."id", 900
FROM "Post" p
WHERE p."slug" = 'avengers-the-kang-dynastys-full-story-plan-and-script-leaked'
ON CONFLICT ("day", "path") DO UPDATE SET "views" = "DailyHit"."views" + EXCLUDED."views";
