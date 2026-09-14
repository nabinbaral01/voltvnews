-- The consent-free view tally, by day.
--
-- Post.viewCount answers "how many reads has this article had, ever". This
-- answers "how many page loads did the site get on Tuesday" without waiting
-- for the nightly rollup and without needing a cookie: a hit lands here the
-- moment it arrives, keyed only by day and path. Nothing about the reader is
-- stored, so it counts everyone the analytics rows cannot.
CREATE TABLE "DailyHit" (
  "day"    DATE NOT NULL,
  "path"   TEXT NOT NULL,
  "postId" TEXT,
  "views"  INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "DailyHit_pkey" PRIMARY KEY ("day", "path")
);

-- The traffic chart: one sum per day.
CREATE INDEX "DailyHit_day_idx" ON "DailyHit" ("day");
-- Top articles in a window.
CREATE INDEX "DailyHit_postId_day_idx" ON "DailyHit" ("postId", "day");
