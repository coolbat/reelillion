import { useEffect, useRef, useState } from "preact/hooks";
import { CREDIT_MILESTONES, creditPosition } from "../lib/credits";
import "../styles/credits.css";

interface Props {
  score: number;
  phase: "ready" | "playing" | "results";
  answers?: readonly { points: number; emoji: string }[];
  compact?: boolean;
  reducedMotion?: boolean;
}

const rollRows = [
  ...CREDIT_MILESTONES.slice(1).map((milestone) => ({
    ...milestone,
    offset: milestone.minimum === 1 ? 0 : milestone.minimum * 0.6,
  })),
  {
    id: "perfect-cut",
    label: "One in a Reelillion",
    minimum: 700,
    offset: 420,
  },
];

/** Presentation only: this component cannot submit answers or advance a round. */
export default function Credits({
  score,
  phase,
  compact = false,
  reducedMotion = false,
}: Props) {
  const position = creditPosition(score);
  const stage = useRef<HTMLElement>(null);
  const previous = useRef(position.score);
  const [rolling, setRolling] = useState(false);
  const [systemReduced, setSystemReduced] = useState(false);
  const reduced = reducedMotion || systemReduced;

  useEffect(() => {
    const query = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setSystemReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const moved = position.score > previous.current;
    previous.current = position.score;
    if (!moved || reduced) {
      setRolling(false);
      return;
    }
    setRolling(true);
    const finish = window.setTimeout(() => setRolling(false), 680);
    return () => window.clearTimeout(finish);
  }, [position.score, reduced]);

  function skipRoll() {
    stage.current
      ?.getAnimations({ subtree: true })
      .forEach((animation) => animation.finish());
    setRolling(false);
  }

  return (
    <section
      ref={stage}
      class={`credits-stage ${compact ? "credits-stage-compact" : ""}`}
      data-phase={phase}
      data-credit={position.id}
      data-reduced-motion={reduced ? "true" : "false"}
      aria-label="End-credits progress"
    >
      <div class="credits-heading">
        <span class="credits-kicker">THE CREDITS</span>
        <strong class="credits-current" aria-live="polite">
          <span>{position.label}</span>
          {position.id !== "opening" && <small class="credits-you">YOU</small>}
        </strong>
        <span class="credits-score">
          {position.score}
          <small> / 700</small>
        </span>
      </div>
      <div class="credits-window" aria-hidden="true">
        <span class="credits-cursor">▸</span>
        {position.score === 0 && (
          <span class="credits-opening">AN ORIGINAL REELILLION PRODUCTION</span>
        )}
        <div
          class="credits-track"
          style={{ transform: `translate3d(0, ${26 - position.offset}px, 0)` }}
        >
          {rollRows.map((row) => (
            <div
              key={row.id}
              class={`credits-row ${position.score >= row.minimum ? "credits-row-reached" : ""} ${row.minimum === 700 ? "credits-row-perfect" : ""}`}
              style={{ top: `${row.offset}px` }}
            >
              <span>{row.label}</span>
              <i />
              <b>{position.score >= row.minimum ? "YOU" : "…"}</b>
            </div>
          ))}
        </div>
      </div>
      <div class="credits-footer">
        <span>
          {position.next ? (
            <>
              Next: <b>{position.next.label}</b> · {position.remaining} pts away
            </>
          ) : position.score < 700 ? (
            <>
              Post-credits reached · <b>{700 - position.score} pts</b> to a
              perfect cut
            </>
          ) : (
            <>
              <b>Perfect cut.</b> You stayed until the very end.
            </>
          )}
        </span>
        <button
          type="button"
          class="credits-skip"
          onClick={skipRoll}
          disabled={!rolling || reduced}
          aria-label="Skip credits animation"
          style={{ visibility: rolling && !reduced ? "visible" : "hidden" }}
        >
          Skip roll »
        </button>
      </div>
      <div
        class="credits-meter"
        role="progressbar"
        aria-label="Cumulative credits score"
        aria-valuemin={0}
        aria-valuemax={700}
        aria-valuenow={position.score}
        aria-valuetext={`${position.label}, ${position.score} of 700 points`}
      >
        <span style={{ transform: `scaleX(${position.progress})` }} />
      </div>
    </section>
  );
}
