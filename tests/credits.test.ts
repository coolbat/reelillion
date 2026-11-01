import test from "node:test";
import assert from "node:assert/strict";
import {
  CREDIT_MILESTONES,
  buildCreditsShare,
  creditFinale,
  creditOffset,
  creditPosition,
} from "../src/lib/credits";

test("the opening frame and every cumulative credit boundary are deterministic", () => {
  assert.equal(CREDIT_MILESTONES.length, 11);
  assert.equal(creditPosition(0).id, "opening");
  for (let i = 1; i < CREDIT_MILESTONES.length; i++) {
    const milestone = CREDIT_MILESTONES[i];
    assert.equal(creditPosition(milestone.minimum).id, milestone.id);
    assert.equal(creditPosition(milestone.minimum - 1).id, CREDIT_MILESTONES[i - 1].id);
    assert.equal(creditPosition(milestone.minimum).label, milestone.label);
  }
  assert.equal(creditPosition(435).label, "Key Grip");
  assert.equal(creditPosition(435).next?.label, "Best Boy");
  assert.equal(creditPosition(435).remaining, 55);
  assert.equal(creditPosition(600).next, null);
  assert.equal(creditPosition(700).label, "Post-Credits Scene");
});

test("scores clamp safely and continuous travel preserves zero, ten and hundred-point differences", () => {
  assert.equal(creditPosition(-1).score, 0);
  assert.equal(creditPosition(Number.NaN).score, 0);
  assert.equal(creditPosition(Number.POSITIVE_INFINITY).score, 0);
  assert.equal(creditPosition(800).score, 700);
  assert.equal(creditPosition(70.8).score, 70);
  assert.equal(creditPosition(700).progress, 1);
  assert.equal(creditOffset(210) - creditOffset(200), 6);
  assert.equal(creditOffset(300) - creditOffset(200), 60);
  assert.equal(creditOffset(210) - creditOffset(210), 0);
});

test("post-credits rewards require a completed game and preserve the perfect ending", () => {
  assert.equal(creditFinale(600, false), "none");
  assert.equal(creditFinale(700, false), "none");
  assert.equal(creditFinale(599, true), "none");
  assert.equal(creditFinale(600, true), "standard");
  assert.equal(creditFinale(699, true), "standard");
  assert.equal(creditFinale(700, true), "perfect");
});

const answers = ["🎞️", "🎟️", "📼", "🎞️", "🏆", "🍿", "📼"].map((emoji) => ({
  emoji,
  movie: { title: "Spoiler title must never be shared" },
}));

test("sharing includes one final milestone, seven answer icons and truthful mode/time without movie spoilers", () => {
  const share = buildCreditsShare({ number: 12, total: 435, answers, mode: "daily", accessible: false, percentile: 80, streak: 2 });
  assert.ok(share.startsWith("🎬 Reelillion #12\nI made it to Key Grip.\n435 / 700 · Daily · 20s\n"));
  assert.ok(share.includes("🎞️🎟️📼🎞️🏆🍿📼"));
  assert.ok(share.includes("Top 20% today · 🔥 2 days"));
  assert.ok(share.endsWith("reelillion.com"));
  assert.ok(!share.includes("Spoiler title"));
  assert.equal(buildCreditsShare({ number: 12, total: 100, answers: answers.slice(0, 1), mode: "daily", accessible: false }), "");
});

test("archive, practice, zero and perfect shares remain unambiguous", () => {
  for (const mode of ["archive", "practice"] as const) {
    const share = buildCreditsShare({ number: 12, total: 700, answers, mode, accessible: true, percentile: 99, streak: 100 });
    assert.ok(share.includes("I made it to the Post-Credits Scene."));
    assert.ok(share.includes(mode === "archive" ? "Archive · 40s ⏱" : "Practice · 40s ⏱"));
    assert.ok(share.includes("Perfect cut ✦"));
    assert.ok(share.includes("No daily stats or streak"));
    assert.ok(!share.includes("Top "));
    assert.ok(!share.includes("100 days"));
  }
  const zero = buildCreditsShare({ number: 12, total: 0, answers, mode: "daily", accessible: false });
  assert.ok(zero.includes("Still at the Opening frame."));
  assert.ok(!zero.includes("Lead Actor"));
  assert.ok(!zero.includes("Top "));
});
