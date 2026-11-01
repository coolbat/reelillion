import { useEffect, useRef, useState } from "preact/hooks";
import { creditFinale } from "../lib/credits";

/** A small, original post-credits scene. It never gates results or touches a clock. */
export default function PostCredits({
  score,
  sessionKey,
  reducedMotion = false,
}: {
  score: number;
  sessionKey: string;
  reducedMotion?: boolean;
}) {
  const finale = creditFinale(score, true);
  const [playing, setPlaying] = useState(false);
  const [reduced, setReduced] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  function stop() {
    setPlaying(false);
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }
  function play() {
    stop();
    if (!reduced && !reducedMotion) {
      setPlaying(true);
      timers.current.push(setTimeout(() => setPlaying(false), 3200));
    }
  }
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(media.matches);
    const change = () => {
      setReduced(media.matches);
      if (media.matches) stop();
    };
    media.addEventListener("change", change);
    if (reducedMotion) stop();
    if (finale !== "none" && !media.matches && !reducedMotion) {
      let seen = false;
      try {
        seen =
          localStorage.getItem(`reelillion:finale:${sessionKey}`) === "seen";
        localStorage.setItem(`reelillion:finale:${sessionKey}`, "seen");
      } catch {
        /* A skippable scene also works without storage. */
      }
      if (!seen) {
        setPlaying(true);
        timers.current.push(setTimeout(() => setPlaying(false), 3200));
      }
    }
    return () => {
      media.removeEventListener("change", change);
      timers.current.forEach(clearTimeout);
    };
  }, [sessionKey, finale, reducedMotion]);
  if (finale === "none")
    return (
      <p class="screen-wrap-line">
        <span aria-hidden="true">— ✦ —</span> THAT’S A WRAP. TOMORROW, A NEW
        REEL.
      </p>
    );
  return (
    <aside
      class={`post-credits ${playing ? "post-credits--playing" : ""} ${finale === "perfect" ? "post-credits--perfect" : ""}`}
      aria-label={
        finale === "perfect"
          ? "Perfect-score post-credits scene unlocked"
          : "Post-credits scene unlocked"
      }
    >
      <svg
        class="post-credits-popcorn"
        viewBox="0 0 56 60"
        shape-rendering="crispEdges"
        aria-hidden="true"
      >
        <path fill="#e9c581" d="M8 16h4V8h8V4h8v4h8V4h8v8h4v12H8z" />
        <path fill="#f5efdf" d="M12 12h8V8h8v8h4v-4h8v8h4v8H12z" />
        <path fill="#b65454" d="M8 24h40l-6 32H14z" />
        <path
          fill="#f5efdf"
          d="M15 24h6l2 32h-6zM30 24h6l-2 32h-6zM42 24h5l-6 32h-5z"
        />
        <path fill="#e9c581" d="M7 22h42v5H7zM13 54h30v4H13z" />
        {finale === "perfect" && (
          <path fill="#e9c581" d="M26 0h4v8h-4zM0 12h4v4H0zM52 8h4v4h-4z" />
        )}
      </svg>
      <div class="post-credits-copy">
        <span class="post-credits-kicker">
          {playing
            ? "ONE MORE THING…"
            : finale === "perfect"
              ? "THE PERFECT CUT · 700 / 700"
              : "POST-CREDITS SCENE UNLOCKED"}
        </span>
        <strong>
          {finale === "perfect"
            ? "No notes. Perfect picture."
            : "You’re still here?"}
        </strong>
        <p>
          {finale === "perfect"
            ? "Even the popcorn gave you a standing ovation."
            : "The popcorn stayed for you, too."}
        </p>
      </div>
      {reduced || reducedMotion ? (
        <span class="post-credits-control">Scene shown · motion reduced</span>
      ) : (
        <button class="post-credits-control" onClick={playing ? stop : play}>
          {playing ? "Skip animation" : "Replay scene ↻"}
        </button>
      )}
    </aside>
  );
}
