import { useEffect, useRef, useState } from "preact/hooks";
import type { AnswerResult, PublicMovie, PublicPrompt } from "../lib/game";
import { puzzleNumber } from "../lib/game";
import Cinema from "./Cinema";
import Credits from "./Credits";
import PostCredits from "./PostCredits";
import { buildCreditsShare, creditPosition } from "../lib/credits";
import "../styles/gameplay.css";
import { alignClock, roundSeconds } from "../lib/timing";

type Mode = "daily" | "archive" | "practice";
interface Daily {
  date: string;
  number: number;
  resetAt: string;
  prompts: PublicPrompt[];
  scoringBasis: string;
}
interface Session {
  sessionId: string;
  date: string;
  number: number;
  mode: Mode;
  accessible: boolean;
  secondsPerRound: number;
  prompts: PublicPrompt[];
  currentIndex: number;
  deadline: number;
  serverNow?: number;
  clockOffset?: number;
  answers: AnswerResult[];
  completed: boolean;
  scoringBasis: string;
}
interface Results {
  session: Session;
  total: number;
  percentile: number | null;
  participants: number;
  rounds: {
    prompt: PublicPrompt;
    answer: AnswerResult;
    common: PublicMovie[];
    rare: PublicMovie[];
    nobody: (PublicMovie & { wiki?: string; description?: string }) | null;
  }[];
  scoringBasis: string;
}
function saved<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch {
    return fallback;
  }
}
function remember(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* A blocked store is reported when starting a daily game. */
  }
}
async function api<T>(
  path: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal,
  });
  let data: T & { error?: string };
  try {
    data = (await response.json()) as T & { error?: string };
  } catch {
    throw new Error(
      "The screening is temporarily unavailable. Please try again shortly.",
    );
  }
  if (!response.ok)
    throw new Error(
      data.error || "The projector needs a moment. Please try again.",
    );
  return data as T;
}
function todayLabel(date: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  })
    .format(new Date(`${date}T12:00:00Z`))
    .toUpperCase();
}
function priorDay(date: string) {
  return new Date(Date.parse(`${date}T12:00:00Z`) - 86400000)
    .toISOString()
    .slice(0, 10);
}
function nextCountdown(resetAt: string, now: number) {
  const s = Math.max(0, Math.floor((Date.parse(resetAt) - now) / 1000));
  return `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export default function Game() {
  const [daily, setDaily] = useState<Daily | null>(null),
    [session, setSession] = useState<Session | null>(null),
    [results, setResults] = useState<Results | null>(null);
  const [mode, setMode] = useState<Mode>("daily"),
    [archiveDate, setArchiveDate] = useState(""),
    [accessible, setAccessible] = useState(false),
    [device, setDevice] = useState("");
  const [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [input, setInput] = useState(""),
    [suggestions, setSuggestions] = useState<PublicMovie[]>([]),
    [selected, setSelected] = useState(-1),
    [showSuggestions, setShowSuggestions] = useState(true),
    [now, setNow] = useState(Date.now());
  const [streak, setStreak] = useState(0),
    [hasDaily, setHasDaily] = useState(false),
    [shareStatus, setShareStatus] = useState(""),
    [shareFallback, setShareFallback] = useState(""),
    [challenge, setChallenge] = useState<{
      score: number;
      date: string;
      accessible: boolean;
    } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null),
    busy = useRef(false),
    mounted = useRef(true),
    timeoutAttempted = useRef("");
  const [storageOK, setStorageOK] = useState(true);
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    setReducedMotion(saved("reelillion:reduce-motion", false));
  }, []);
  useEffect(() => {
    mounted.current = true;
    let id = saved<string>("reelillion:device", "");
    if (!id) {
      id = crypto.randomUUID();
      remember("reelillion:device", id);
    }
    setDevice(id);
    setStorageOK(saved("reelillion:device", "") === id);
    const params = new URLSearchParams(location.search);
    let requested = params.get("mode");
    let date = params.get("date") || "";
    const challengeScore = Number(params.get("score")),
      challengeDate = params.get("challenge");
    if (
      challengeDate &&
      /^\d{4}-\d{2}-\d{2}$/.test(challengeDate) &&
      Number.isInteger(challengeScore) &&
      challengeScore >= 0 &&
      challengeScore <= 700
    ) {
      setChallenge({
        score: challengeScore,
        date: challengeDate,
        accessible: params.get("extra") === "1",
      });
      setAccessible(params.get("extra") === "1");
    }
    if (requested === "practice") {
      setMode("practice");
    } else if (requested === "archive" && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setMode("archive");
      setArchiveDate(date);
    }
    api<Daily>("/api/daily")
      .then((data) => {
        if (!mounted.current) return;
        setDaily(data);
        if (challengeDate && challengeDate < data.date) {
          setMode("archive");
          setArchiveDate(challengeDate);
        }
        setHasDaily(!!saved(`reelillion:daily:${data.date}`, null));
      })
      .catch((e) => setError(e.message));
    const log = saved<{ date: string; count: number }>("reelillion:streak", {
      date: "",
      count: 0,
    });
    setStreak(log.count);
    const timer = window.setInterval(() => setNow(Date.now()), 250);
    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (
      !session ||
      session.completed ||
      session.answers.some((a) => a.index === session.currentIndex) ||
      input.trim().length < 3
    ) {
      setSuggestions([]);
      return;
    }
    const abort = new AbortController();
    const delay = setTimeout(() => {
      api<{ movies: PublicMovie[] }>(
        `/api/search?q=${encodeURIComponent(input.trim())}`,
        undefined,
        abort.signal,
      )
        .then((data) => {
          setSuggestions(data.movies);
          setSelected(-1);
        })
        .catch(() => {
          setSuggestions([]);
        });
    }, 180);
    return () => {
      abort.abort();
      clearTimeout(delay);
    };
  }, [input, session?.currentIndex, session?.answers.length]);
  const answer = session?.answers.find((a) => a.index === session.currentIndex);
  const seconds = session ? roundSeconds(session, now) : 20;
  useEffect(() => {
    if (session && !answer && !session.completed && seconds === 0 && !loading) {
      const round = `${session.sessionId}:${session.currentIndex}`;
      if (timeoutAttempted.current !== round) {
        timeoutAttempted.current = round;
        void submit("");
      }
    }
  }, [seconds, session?.sessionId, session?.currentIndex, answer, loading]);
  useEffect(() => {
    if (session && !answer && !loading) {
      inputRef.current?.focus({ preventScroll: true });
    }
  }, [session?.currentIndex, session?.sessionId, loading]);
  useEffect(() => {
    if (results) {
      document.getElementById("results-title")?.focus({ preventScroll: true });
      document
        .getElementById("main")
        ?.scrollIntoView({ behavior: "instant", block: "start" });
    }
  }, [!!results]);
  async function loadResults(s: Session) {
    setLoading(true);
    setError("");
    try {
      const data = await api<Results>(
        `/api/results?sessionId=${encodeURIComponent(s.sessionId)}&deviceId=${encodeURIComponent(device)}`,
      );
      setResults(data);
      if (s.mode === "daily") {
        const prior = saved<{ date: string; count: number }>(
          "reelillion:streak",
          { date: "", count: 0 },
        );
        let count =
          prior.date === s.date
            ? prior.count
            : prior.date === priorDay(s.date)
              ? prior.count + 1
              : 1;
        if (s.date >= prior.date) {
          remember("reelillion:streak", { date: s.date, count });
        } else {
          count = prior.count;
        }
        remember(`reelillion:daily:${s.date}`, {
          sessionId: s.sessionId,
          completed: true,
        });
        setStreak(count);
        setHasDaily(true);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  async function start(requestedMode: Mode = mode) {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    setError("");
    try {
      const s = await api<Session>("/api/start", {
        deviceId: device,
        mode: requestedMode,
        date: requestedMode === "archive" ? archiveDate : undefined,
        accessible,
      });
      setMode(requestedMode);
      setShareStatus("");
      setShareFallback("");
      setSession(alignClock(s));
      setInput("");
      setResults(null);
      setNow(Date.now());
      if (requestedMode === "daily")
        remember(`reelillion:daily:${s.date}`, {
          sessionId: s.sessionId,
          completed: s.completed,
        });
      if (s.completed) await loadResults(s);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }
  async function submit(value = input) {
    if (!session || busy.current || answer) return;
    busy.current = true;
    setLoading(true);
    setError("");
    setSuggestions([]);
    try {
      const data = await api<{
        recognized: boolean;
        message?: string;
        session: Session;
      }>("/api/answer", {
        sessionId: session.sessionId,
        deviceId: device,
        index: session.currentIndex,
        answer: value,
      });
      setSession(alignClock(data.session));
      if (!data.recognized) {
        setError(
          data.message ||
            "We don’t know that one. Try another title while the clock is running.",
        );
        setShowSuggestions(false);
      }
      setNow(Date.now());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }
  async function next() {
    if (!session || busy.current) return;
    busy.current = true;
    setLoading(true);
    setError("");
    try {
      const s = await api<Session>("/api/next", {
        sessionId: session.sessionId,
        deviceId: device,
      });
      setInput("");
      setSuggestions([]);
      setSelected(-1);
      setShowSuggestions(true);
      setSession(alignClock(s));
      setNow(Date.now());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      busy.current = false;
      setLoading(false);
    }
  }
  function shareText() {
    if (!results) return "";
    const s = results.session;
    return buildCreditsShare({
      number: s.number,
      total: results.total,
      answers: s.answers,
      mode: s.mode,
      accessible: s.accessible,
      percentile: results.percentile,
      streak,
    });
  }
  async function share(isChallenge = false, copyOnly = false) {
    if (!results) return;
    const text = shareText();
    let payload = text;
    if (isChallenge) {
      const s = results.session;
      const url = new URL("https://reelillion.com/");
      url.searchParams.set("challenge", s.date);
      url.searchParams.set("score", String(results.total));
      if (s.accessible) url.searchParams.set("extra", "1");
      if (s.mode === "practice") {
        setShareStatus(
          "Practice sets are random. Start a daily game to challenge a friend to the same prompts.",
        );
        return;
      }
      payload = `I made it to ${creditPosition(results.total).label} in Reelillion. Can you roll further? ${results.total}/700 · ${s.accessible ? "40s" : "20s"}.\n${url}`;
    }
    try {
      if (navigator.share && !copyOnly) {
        await navigator.share({
          title: "Reelillion — one in a Reelillion",
          text: payload,
        });
        setShareStatus(
          isChallenge
            ? "Challenge shared. Your friend has a screening to catch."
            : "Your credits are ready to share.",
        );
      } else {
        await navigator.clipboard.writeText(payload);
        setShareStatus(
          isChallenge
            ? "Challenge link copied. Send it to your film friend."
            : "Score copied. Paste it anywhere.",
        );
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setShareFallback(payload);
        setShareStatus("Select and copy your spoiler-free card below.");
      }
    }
  }
  function choose(movie: PublicMovie) {
    setInput(`${movie.title} (${movie.year})`);
    setSuggestions([]);
    setShowSuggestions(false);
    inputRef.current?.focus({ preventScroll: true });
  }
  function keyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      setShowSuggestions(false);
      return;
    }
    if (suggestions.length && showSuggestions) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelected((selected + 1) % suggestions.length);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelected((selected - 1 + suggestions.length) % suggestions.length);
      } else if (event.key === "Enter" && selected >= 0) {
        event.preventDefault();
        choose(suggestions[selected]);
      }
    }
  }
  const roundScore =
    session?.answers.reduce((sum, a) => sum + a.points, 0) || 0;
  const phase = results ? "results" : session ? "playing" : "ready";
  const score = results?.total ?? roundScore;
  const position = creditPosition(score);
  const activeMode = session?.mode ?? mode;
  const readyNumber =
    mode === "archive" && archiveDate
      ? puzzleNumber(archiveDate)
      : daily?.number;
  const modeLabel =
    activeMode === "daily"
      ? "Daily"
      : activeMode === "archive"
        ? "Archive"
        : "Practice";
  const prompt = session?.prompts[session.currentIndex];
  const continueRound = () =>
    session?.completed ? loadResults(session) : next();

  return (
    <>
      <div class={reducedMotion ? "cinema-motion-reduced" : undefined}>
        <Cinema phase={phase} score={score} modeLabel={modeLabel}>
          <div class={`screen-program screen-program--${phase}`}>
            <div class="screen-program-label">
              <span>
                <i /> {modeLabel.toUpperCase()} REEL{" "}
                {session
                  ? `#${session.number}`
                  : readyNumber
                    ? `#${readyNumber}`
                    : "…"}
              </span>
              <span>
                {session
                  ? session.accessible
                    ? "40 SEC"
                    : "20 SEC"
                  : "A REELILLION ORIGINAL"}
              </span>
            </div>
            {phase !== "ready" && (
              <Credits
                score={score}
                phase={phase}
                answers={session?.answers}
                compact
                reducedMotion={reducedMotion}
              />
            )}

            {results ? (
              <section class="screen-results" aria-label="Your results">
                <p class="eyebrow">
                  {position.id === "opening"
                    ? "THE CREDITS ARE JUST BEGINNING"
                    : "YOU MADE IT TO"}
                </p>
                <h1 id="results-title" tabIndex={-1}>
                  {position.label}
                  <span class="pixel-spark" aria-hidden="true">
                    ✦
                  </span>
                </h1>
                <p class="screen-result-score">
                  <strong>{results.total}</strong>
                  <span>/ 700</span>
                </p>
                <div
                  class="result-emojis"
                  aria-label={results.session.answers
                    .map((a) => a.tier)
                    .join(", ")}
                >
                  {results.session.answers.map((a) => a.emoji).join("")}
                </div>
                <p class="streak-line">
                  {results.session.mode === "daily"
                    ? `🔥 ${streak} day${streak === 1 ? "" : "s"} in a row`
                    : `${modeLabel} · no daily stats or streak`}
                  {results.session.accessible
                    ? " · ⏱ 40 seconds"
                    : " · 20 seconds"}
                  {results.percentile !== null
                    ? ` · Top ${Math.max(1, 100 - results.percentile)}% today`
                    : ""}
                </p>
                {challenge &&
                  challenge.date === results.session.date &&
                  results.session.mode !== "practice" && (
                    <p class="screen-challenge">
                      Friend: {challenge.score}/700
                      {challenge.accessible ? " · 40s" : " · 20s"} · You:{" "}
                      {results.total}/700 ·{" "}
                      {results.total > challenge.score
                        ? "You stayed longer."
                        : results.total === challenge.score
                          ? "A double feature. You tied."
                          : "There’s always tomorrow’s reel."}
                    </p>
                  )}
                <PostCredits
                  score={results.total}
                  sessionKey={results.session.sessionId}
                  reducedMotion={reducedMotion}
                />
                <div class="share-buttons">
                  <button class="button" onClick={() => share()}>
                    Share my credits <span>↗</span>
                  </button>
                  <button
                    class="button button-secondary"
                    onClick={() => share(true)}
                  >
                    Challenge a friend <span>→</span>
                  </button>
                </div>
                <div class="share-status" role="status">
                  {shareStatus}
                </div>
                {shareFallback && (
                  <textarea
                    class="share-text"
                    aria-label="Copy your share card"
                    readOnly
                    value={shareFallback}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                )}
                <button
                  class="screen-text-button copy-credits"
                  onClick={() => share(false, true)}
                >
                  Copy result
                </button>
                <p class="share-note">
                  Seven answers. No spoilers. All the closing-credit glory.
                </p>
                <button
                  class="screen-text-button"
                  disabled={loading}
                  onClick={() => start("practice")}
                >
                  {loading
                    ? "Threading the next reel…"
                    : "Play a practice reel →"}
                </button>
                {error && (
                  <div class="error-message" role="alert">
                    {error}
                  </div>
                )}
              </section>
            ) : session && prompt ? (
              <section class="screen-game" aria-label="Movie game">
                <div class="scene-strip" aria-label="Seven-question progress">
                  {session.prompts.map((p, i) => (
                    <div
                      key={p.id}
                      class={`scene-cell ${i === session.currentIndex ? "current" : ""} ${session.answers.some((a) => a.index === i) ? "done" : ""}`}
                      aria-current={
                        i === session.currentIndex ? "step" : undefined
                      }
                    >
                      {session.answers.find((a) => a.index === i)?.emoji ||
                        `0${i + 1}`}
                    </div>
                  ))}
                </div>
                <div class="round-panel">
                  <div class="round-meta">
                    <span class="round-category">
                      QUESTION {session.currentIndex + 1} / 7{" "}
                      <span>· {prompt.category}</span>
                    </span>
                    <span
                      class={`timer ${seconds <= 5 && !answer ? "low" : ""}`}
                      aria-label={
                        answer
                          ? "Answer locked"
                          : `${seconds} seconds remaining`
                      }
                    >
                      <svg viewBox="0 0 28 28" aria-hidden="true">
                        <circle
                          cx="14"
                          cy="14"
                          r="11"
                          fill="none"
                          stroke="#ffffff24"
                          stroke-width="2"
                        />
                        <circle
                          cx="14"
                          cy="14"
                          r="11"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                          pathLength="100"
                          stroke-dasharray={`${answer ? 0 : (seconds / session.secondsPerRound) * 100} 100`}
                        />
                      </svg>
                      {answer ? "LOCKED" : `${seconds}s`}
                    </span>
                  </div>
                  <div class="screen-question">
                    <h1>{prompt.text}</h1>
                    <p class="prompt-hint">
                      {prompt.description ||
                        "One feature film. Make it an unexpected one."}
                    </p>
                  </div>
                  <form
                    class="answer-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (answer) void continueRound();
                      else if (input.trim()) void submit();
                    }}
                  >
                    <div class="input-wrap">
                      <label class="sr-only" for="movie-answer">
                        Your movie title
                      </label>
                      <input
                        ref={inputRef}
                        id="movie-answer"
                        class="answer-input"
                        placeholder="Name a movie…"
                        value={input}
                        disabled={!!answer || loading || seconds === 0}
                        maxLength={150}
                        autoComplete="off"
                        spellcheck={false}
                        role="combobox"
                        aria-autocomplete="list"
                        aria-expanded={
                          !!(showSuggestions && suggestions.length)
                        }
                        aria-controls="movie-suggestions"
                        aria-activedescendant={
                          selected >= 0 && showSuggestions && suggestions.length
                            ? `movie-option-${selected}`
                            : undefined
                        }
                        onInput={(e) => {
                          setInput(e.currentTarget.value);
                          setShowSuggestions(true);
                          setError("");
                        }}
                        onKeyDown={keyDown}
                      />
                      {!answer && showSuggestions && suggestions.length > 0 && (
                        <div
                          class="suggestions"
                          id="movie-suggestions"
                          role="listbox"
                        >
                          {suggestions.map((movie, i) => (
                            <button
                              type="button"
                              role="option"
                              id={`movie-option-${i}`}
                              aria-selected={i === selected}
                              tabIndex={-1}
                              key={movie.id}
                              onClick={() => choose(movie)}
                            >
                              {movie.title}
                              <small>{movie.year}</small>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      class="button submit-answer"
                      disabled={
                        loading || (!answer && (!input.trim() || seconds === 0))
                      }
                      type="submit"
                    >
                      {loading
                        ? answer
                          ? "Loading…"
                          : "Checking…"
                        : answer
                          ? session.currentIndex === 6
                            ? "See my credits →"
                            : "Next question →"
                          : "Lock it in →"}
                    </button>
                  </form>
                  <div class="round-response" aria-live="polite">
                    {error ? (
                      <div class="error-message" role="alert">
                        {error}
                        {seconds === 0 && !answer && (
                          <button
                            class="plain-button"
                            onClick={() => submit("")}
                          >
                            Retry saving this answer →
                          </button>
                        )}
                      </div>
                    ) : answer ? (
                      <div
                        class={`feedback ${answer.points > 0 ? "feedback--correct" : "feedback--zero"}`}
                      >
                        <span class="feedback-emoji">{answer.emoji}</span>
                        <div>
                          <strong>
                            {answer.status === "correct"
                              ? `${answer.tier} · +${answer.points}`
                              : answer.status === "incorrect"
                                ? "Not a match · +0"
                                : answer.status === "timeout"
                                  ? "Time’s up · +0"
                                  : answer.status === "abandoned"
                                    ? "This question closed · +0"
                                    : "Question skipped · +0"}
                          </strong>
                          <p>
                            {answer.status === "correct"
                              ? `${answer.movie?.title} (${answer.movie?.year})`
                              : answer.example
                                ? `One that fits: ${answer.example.title} (${answer.example.year}).`
                                : "Your credits stay here. Keep going."}
                          </p>
                        </div>
                      </div>
                    ) : (
                      <div class="round-bottom">
                        <p>
                          Suggestions match titles, not the question.
                          <br />
                          Rarer answers roll the credits further.
                        </p>
                        <button
                          class="skip-button"
                          disabled={loading}
                          onClick={() => submit("")}
                        >
                          Skip question ↗
                        </button>
                      </div>
                    )}
                  </div>
                  <p class="screen-round-note">
                    {session.mode === "daily"
                      ? "One Daily reel per device. Leaving a live question forfeits it."
                      : `${modeLabel} reel · no daily score or streak.`}{" "}
                    No speed bonus.
                  </p>
                </div>
              </section>
            ) : (
              <section class="screen-ready" aria-labelledby="screen-title">
                <div class="screen-countdown-mark" aria-hidden="true">
                  <span>7</span>
                  <i />
                  <b>
                    QUESTIONS
                    <br />
                    ONE FINAL SCENE
                  </b>
                </div>
                <h1 id="screen-title">
                  How far into the
                  <br />
                  <em>credits can you go?</em>
                </h1>
                <p class="screen-premise">
                  Name a movie nobody else thinks of.
                  <br />
                  Rarer answers roll the credits further.
                </p>
                <div class="screen-rules" aria-label="Game rules">
                  <span>7 QUESTIONS</span>
                  <i>✦</i>
                  <span>{accessible ? "40" : "20"} SECONDS EACH</span>
                  <i>✦</i>
                  <span>RARER IS BETTER</span>
                </div>
                <button
                  class="button screen-start"
                  onClick={() => {
                    void start();
                  }}
                  disabled={
                    loading || !device || (!daily && !error) || !storageOK
                  }
                >
                  {loading
                    ? "Taking your seat…"
                    : mode === "practice"
                      ? "Start practice ▶"
                      : mode === "archive"
                        ? "Play this reel ▶"
                        : hasDaily
                          ? "Your daily credits ▶"
                          : "Play today’s reel ▶"}
                </button>
                <div class="screen-ready-options">
                  <button
                    type="button"
                    class="extra-time"
                    disabled={!device}
                    role="switch"
                    aria-checked={accessible}
                    onClick={() => setAccessible(!accessible)}
                  >
                    <span class="switch-track">
                      <span />
                    </span>{" "}
                    Extra time · 40 seconds
                  </button>
                  <button
                    class="screen-text-button"
                    disabled={loading}
                    onClick={() => {
                      setMode(mode === "practice" ? "daily" : "practice");
                      setError("");
                    }}
                  >
                    {mode === "practice"
                      ? "Back to Daily"
                      : "Warm up in Practice"}
                  </button>
                </div>
                <p class="screen-admission">
                  FREE ADMISSION <span>·</span> NO SIGN-UP <span>·</span>{" "}
                  {mode === "archive"
                    ? archiveDate
                    : daily
                      ? `${todayLabel(daily.date)} · REEL #${daily.number}`
                      : "A NEW REEL EVERY DAY"}
                </p>
                {mode !== "daily" && (
                  <p class="screen-mode-note">
                    {mode === "practice"
                      ? "Practice uses random prompts. Your Daily reel stays yours."
                      : `Archive · ${archiveDate}. Historical answers, no daily streak.`}
                  </p>
                )}
                {challenge && (
                  <p class="screen-challenge">
                    A friend reached {creditPosition(challenge.score).label} ·{" "}
                    {challenge.score}/700
                    {challenge.accessible ? " · 40s" : " · 20s"}. Can you roll
                    further?
                  </p>
                )}
                {!storageOK && (
                  <div class="error-message" role="alert">
                    Allow local storage to save your Daily reel and streak.
                  </div>
                )}
                {error && (
                  <div class="error-message" role="alert">
                    {error}{" "}
                    <button
                      class="plain-button"
                      onClick={() => location.reload()}
                    >
                      Try again
                    </button>
                  </div>
                )}
              </section>
            )}
          </div>
        </Cinema>
      </div>
      <div class="cinema-motion-setting">
        <button
          type="button"
          aria-pressed={reducedMotion}
          onClick={() => {
            const next = !reducedMotion;
            setReducedMotion(next);
            remember("reelillion:reduce-motion", next);
          }}
        >
          {reducedMotion ? "Motion reduced" : "Reduce motion"}
        </button>
      </div>
      <nav class="cinema-shortcuts" aria-label="More screenings">
        <a href="/archive/">
          ARCHIVE <span>↶</span>
        </a>
        <a href="/how-to-play/">
          HOW TO PLAY <span>?</span>
        </a>
        <a href="/packs/">
          FILM CLUBS <span>✦</span>
        </a>
      </nav>
      {results && (
        <section
          class="credits-discoveries"
          aria-label="Films from your screening"
        >
          <div class="result-rounds">
            <div class="section-heading">
              <div>
                <p class="eyebrow">AFTER THE SCREENING</p>
                <h2>Your seven moments.</h2>
              </div>
            </div>
            {results.rounds.map((round, index) => (
              <article class="result-round" key={round.prompt.id}>
                <div class="result-round-header">
                  <h3>
                    <span class="muted">0{index + 1} / </span>
                    {round.prompt.text}
                  </h3>
                  <b>+{round.answer.points}</b>
                </div>
                <p class="result-answer">
                  {round.answer.emoji}{" "}
                  <strong>
                    {round.answer.movie
                      ? `${round.answer.movie.title} (${round.answer.movie.year})`
                      : round.answer.status === "timeout"
                        ? "Time ran out"
                        : round.answer.status === "abandoned"
                          ? "Screening interrupted"
                          : "Scene skipped"}
                  </strong>{" "}
                  · {round.answer.tier}
                  {round.answer.playerShare !== null
                    ? ` · ${(round.answer.playerShare * 100).toFixed(1)}% of eligible players chose this`
                    : ""}
                </p>
                <details>
                  <summary>See the films you might have missed</summary>
                  <div class="discovery-grid">
                    <div>
                      <h4>Audience favorites</h4>
                      {round.common.length ? (
                        <ul>
                          {round.common.map((m) => (
                            <li>
                              {m.title} ({m.year})
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p>
                          No recorded choices yet. The audience is still
                          arriving.
                        </p>
                      )}
                    </div>
                    <div>
                      <h4>Rarest discoveries</h4>
                      {round.rare.length ? (
                        <ul>
                          {round.rare.map((m) => (
                            <li>
                              {m.title} ({m.year})
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p>
                          Play today and help discover tomorrow’s cult classics.
                        </p>
                      )}
                    </div>
                    <div>
                      <h4>The one nobody said</h4>
                      {round.nobody ? (
                        <p>
                          <a
                            href={
                              round.nobody.wiki ||
                              `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(round.nobody.title + " " + round.nobody.year)}`
                            }
                            target="_blank"
                            rel="noopener"
                          >
                            {round.nobody.title} ({round.nobody.year}) ↗
                          </a>
                          <br />
                          {round.nobody.description ||
                            "A valid answer from this scene, with no eligible daily choices so far."}
                        </p>
                      ) : (
                        <p>Every film in the catalog has had its moment.</p>
                      )}
                    </div>
                  </div>
                </details>
              </article>
            ))}
          </div>

          <p class="game-undertext">
            {results.scoringBasis}{" "}
            {results.participants < 20
              ? "A Daily percentile appears after 20 completed daily games."
              : ""}
          </p>
          <div class="results-footer">
            <p>
              New Daily reel in{" "}
              <strong>
                {daily ? nextCountdown(daily.resetAt, now) : "a few hours"}
              </strong>{" "}
              · Midnight in New York
            </p>
            <p>
              <a href="/archive/">Explore previous reels</a> ·{" "}
              <a href="/packs/">Find your film club</a>
            </p>
          </div>
        </section>
      )}
    </>
  );
}
