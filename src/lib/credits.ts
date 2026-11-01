import { theme } from "../config";

export const MAX_CREDITS_SCORE = 700;
export const POST_CREDITS_SCORE = 600;

export interface CreditMilestone {
  readonly id: string;
  readonly label: string;
  readonly minimum: number;
}

/** Game-world signposts, not an industry credit order or a hierarchy of jobs. */
export const CREDIT_MILESTONES = [
  { id: "opening", label: "Opening frame", minimum: 0 },
  { id: "lead-actor", label: "Lead Actor", minimum: 1 },
  { id: "supporting-actor", label: "Supporting Actor", minimum: 70 },
  { id: "director", label: "Director", minimum: 140 },
  { id: "screenwriter", label: "Screenwriter", minimum: 210 },
  { id: "cinematographer", label: "Cinematographer", minimum: 280 },
  { id: "gaffer", label: "Gaffer", minimum: 350 },
  { id: "key-grip", label: "Key Grip", minimum: 420 },
  { id: "best-boy", label: "Best Boy", minimum: 490 },
  { id: "catering", label: "Catering", minimum: 560 },
  { id: "post-credits", label: "Post-Credits Scene", minimum: 600 },
] as const satisfies readonly CreditMilestone[];

export function normalizeCreditsScore(score: number): number {
  return Number.isFinite(score)
    ? Math.min(MAX_CREDITS_SCORE, Math.max(0, Math.floor(score)))
    : 0;
}

/** A continuous score axis: a 100-point answer travels ten times as far as 10. */
export function creditOffset(score: number): number {
  return normalizeCreditsScore(score) * 0.6;
}

export function creditPosition(input: number) {
  const score = normalizeCreditsScore(input);
  let index = 0;
  for (let i = 1; i < CREDIT_MILESTONES.length; i++) {
    if (score >= CREDIT_MILESTONES[i].minimum) index = i;
  }
  const milestone = CREDIT_MILESTONES[index];
  const next: CreditMilestone | null = CREDIT_MILESTONES[index + 1] ?? null;
  return {
    ...milestone,
    index,
    score,
    next,
    remaining: next ? next.minimum - score : 0,
    progress: score / MAX_CREDITS_SCORE,
    offset: creditOffset(score),
  };
}

/** Reaching 600 during question six cannot trigger a completed-game reward. */
export function creditFinale(score: number, completed: boolean) {
  if (!completed || normalizeCreditsScore(score) < POST_CREDITS_SCORE)
    return "none" as const;
  return normalizeCreditsScore(score) === MAX_CREDITS_SCORE
    ? ("perfect" as const)
    : ("standard" as const);
}

export interface CreditsShare {
  number: number;
  total: number;
  answers: readonly { emoji: string }[];
  mode: "daily" | "archive" | "practice";
  accessible: boolean;
  percentile?: number | null;
  streak?: number;
}

export function buildCreditsShare(input: CreditsShare): string {
  // Never represent an unfinished screening as a seven-question result.
  if (input.answers.length !== 7) return "";
  const position = creditPosition(input.total);
  const mode =
    input.mode === "daily"
      ? "Daily"
      : input.mode === "archive"
        ? "Archive"
        : "Practice";
  const destination =
    position.id === "opening"
      ? "Still at the Opening frame."
      : `I made it to ${position.id === "post-credits" ? "the " : ""}${position.label}.`;
  const stats: string[] = [];
  if (input.mode === "daily") {
    if (
      typeof input.percentile === "number" &&
      Number.isFinite(input.percentile)
    ) {
      const percentile = Math.min(100, Math.max(0, input.percentile));
      stats.push(`Top ${Math.max(1, 100 - percentile)}% today`);
    }
    if (typeof input.streak === "number" && input.streak > 0) {
      const count = Math.floor(input.streak);
      stats.push(`🔥 ${count} day${count === 1 ? "" : "s"}`);
    }
  } else {
    stats.push("No daily stats or streak");
  }
  return [
    `🎬 ${theme.brand} #${input.number}`,
    destination,
    `${position.score} / ${MAX_CREDITS_SCORE} · ${mode} · ${input.accessible ? "40s ⏱" : "20s"}${position.score === MAX_CREDITS_SCORE ? " · Perfect cut ✦" : ""}`,
    input.answers.map((answer) => answer.emoji).join(""),
    ...(stats.length ? [stats.join(" · ")] : []),
    theme.domain,
  ].join("\n");
}
