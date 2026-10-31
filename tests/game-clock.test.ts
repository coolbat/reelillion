import test from "node:test";
import assert from "node:assert/strict";
import { alignClock, roundSeconds } from "../src/lib/timing";

test("client clock skew does not shorten or extend the displayed server round", () => {
  for (const skew of [-1_200_000, -500, 0, 500, 1_200_000]) {
    const session = alignClock(
      { serverNow: 10_000, deadline: 50_000, secondsPerRound: 40 },
      10_000 + skew,
    );
    assert.equal(roundSeconds(session, 10_000 + skew), 40);
    assert.equal(roundSeconds(session, 25_000 + skew), 25);
    assert.equal(roundSeconds(session, 50_000 + skew), 0);
  }
});

test("a round never displays above its allowance and remains compatible with older API responses", () => {
  assert.equal(roundSeconds({ deadline: 40_500, secondsPerRound: 40 }, 0), 40);
  assert.equal(roundSeconds({ deadline: 20_500, secondsPerRound: 20 }, 0), 20);
  assert.equal(
    roundSeconds(alignClock({ deadline: 20_000, secondsPerRound: 20 }, 0), 0),
    20,
  );
  assert.equal(roundSeconds({ deadline: 1, secondsPerRound: 20 }, 2), 0);
});
