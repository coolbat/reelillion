export function alignClock<T extends object>(
  session: T & { serverNow?: number },
  receivedAt = Date.now(),
) {
  return {
    ...session,
    clockOffset: Number.isFinite(session.serverNow)
      ? session.serverNow! - receivedAt
      : 0,
  };
}

export function roundSeconds(
  session: { deadline: number; secondsPerRound: number; clockOffset?: number },
  now = Date.now(),
) {
  return Math.max(
    0,
    Math.min(
      session.secondsPerRound,
      Math.ceil((session.deadline - (now + (session.clockOffset || 0))) / 1000),
    ),
  );
}
