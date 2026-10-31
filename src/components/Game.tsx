import { useEffect, useRef, useState } from "preact/hooks";
import type { AnswerResult, PublicMovie, PublicPrompt } from "../lib/game";
import { theme } from "../config";
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
    if (session?.completed && !results) {
      void loadResults(session);
    }
  }, [session?.completed]);
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
  async function start() {
    if (busy.current) return;
    busy.current = true;
    setLoading(true);
    setError("");
    try {
      const s = await api<Session>("/api/start", {
        deviceId: device,
        mode,
        date: mode === "archive" ? archiveDate : undefined,
        accessible,
      });
      setSession(alignClock(s));
      setInput("");
      setResults(null);
      setNow(Date.now());
      if (mode === "daily")
        remember(`reelillion:daily:${s.date}`, {
          sessionId: s.sessionId,
          completed: s.completed,
        });
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
    return `${theme.brand} #${s.number} 🎬 ${results.total}/700${s.accessible ? " ⏱" : ""}${s.mode !== "daily" ? ` · ${s.mode === "practice" ? "Practice" : "Archive"}` : ""}\n${s.answers.map((a) => a.emoji).join("")}\n${results.percentile !== null ? `Top ${Math.max(1, 100 - results.percentile)}% today · ` : ""}${s.mode === "daily" ? `🔥 ${streak} day${streak === 1 ? "" : "s"}` : "Practice or archive · no daily stats"}\nreelillion.com`;
  }
  async function share(isChallenge = false) {
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
      payload = `Think you know a rarer film? My ${s.accessible ? "extra-time " : ""}Reelillion score: ${results.total}/700.\n${url}`;
    }
    try {
      if (navigator.share) {
        await navigator.share({
          title: "Reelillion — one in a Reelillion",
          text: payload,
        });
        setShareStatus(
          isChallenge
            ? "Challenge shared. Your friend has a screening to catch."
            : "Your score has left the cutting room.",
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
    inputRef.current?.focus();
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
  const openMenu = () => {
    document.getElementById("main")?.scrollIntoView({
      behavior: matchMedia("(prefers-reduced-motion:reduce)").matches
        ? "instant"
        : "smooth",
      block: "start",
    });
  };
  if (results) {
    return (
      <section class="game-shell" aria-label="Your results">
        <div class="results-heading">
          <p class="eyebrow">
            THAT’S A WRAP · {results.session.mode.toUpperCase()} #
            {results.session.number}
          </p>
          <h1 id="results-title" tabIndex={-1}>
            {results.total >= 500
              ? "A taste for the unexpected."
              : results.total >= 250
                ? "You’ve seen a few things."
                : "Every film lover starts somewhere."}
          </h1>
          <div class="total-score">
            {results.total}
            <small> / 700</small>
          </div>
          <div
            class="result-emojis"
            aria-label={results.session.answers.map((a) => a.tier).join(", ")}
          >
            {results.session.answers.map((a) => a.emoji).join("")}
          </div>
          <p class="streak-line">
            {results.session.mode === "daily"
              ? `🔥 ${streak} day${streak === 1 ? "" : "s"} in a row`
              : "An encore screening · no streak or daily stats"}
            {results.session.accessible ? " · ⏱ Extra time" : ""}
            {results.percentile !== null
              ? ` · Top ${Math.max(1, 100 - results.percentile)}% today`
              : ""}
          </p>
          {challenge &&
            challenge.date === results.session.date &&
            results.session.mode !== "practice" && (
              <div class="challenge-banner">
                Your friend: {challenge.score}/700
                {challenge.accessible ? " · ⏱ Extra time" : ""} · You:{" "}
                {results.total}/700 ·{" "}
                {results.total > challenge.score
                  ? "You take the final bow."
                  : results.total === challenge.score
                    ? "A double feature. You tied."
                    : "There’s always the next screening."}
              </div>
            )}
          <div class="share-buttons">
            <button class="button" onClick={() => share()}>
              Share your score <span>↗</span>
            </button>
            <button class="button button-secondary" onClick={() => share(true)}>
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
          <p class="share-note">
            All the bragging rights. None of the spoilers.
          </p>
        </div>
        <div class="result-rounds">
          <div class="section-heading">
            <div>
              <p class="eyebrow">THE POST-CREDITS SCENE</p>
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
                        No recorded choices yet. The audience is still arriving.
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
            ? "Today’s audience is still growing. We’ll show a percentile after 20 completed daily games."
            : ""}
        </p>
        <div class="results-footer">
          <p>
            New daily screening in{" "}
            <strong>
              {daily ? nextCountdown(daily.resetAt, now) : "a few hours"}
            </strong>{" "}
            · Midnight in New York
          </p>
          <a href="/?mode=practice" class="button button-secondary">
            Stay for an encore →
          </a>
          <p>
            <a href="/archive/">Explore the archive</a> ·{" "}
            <a href="/packs/">Find your film club</a>
          </p>
        </div>
      </section>
    );
  }
  if (session) {
    const prompt = session.prompts[session.currentIndex];
    return (
      <section class="game-shell" aria-label="Movie game">
        <div class="game-topbar">
          <span class="game-mode">
            {session.mode === "daily"
              ? "THE DAILY SCREENING"
              : session.mode === "archive"
                ? "FROM THE ARCHIVE"
                : "AN ENCORE · PRACTICE"}{" "}
            #{session.number}
            {session.accessible ? " · ⏱" : ""}
          </span>
          <span class="game-score">
            YOUR SCORE <b>{roundScore}</b>
            <span class="muted"> / 700</span>
          </span>
        </div>
        <div class="scene-strip" aria-label="Round progress">
          {session.prompts.map((p, i) => (
            <div
              key={p.id}
              class={`scene-cell ${i === session.currentIndex ? "current" : ""} ${session.answers.some((a) => a.index === i) ? "done" : ""}`}
              aria-current={i === session.currentIndex ? "step" : undefined}
            >
              <span class="scene-holes" />
              {session.answers.find((a) => a.index === i)?.emoji || `0${i + 1}`}
            </div>
          ))}
        </div>
        <div class="round-panel">
          <div class="round-meta">
            <span class="round-category">
              SCENE 0{session.currentIndex + 1} / {prompt.category}
            </span>
            <span
              class={`timer ${seconds <= 5 && !answer ? "low" : ""}`}
              aria-label={
                answer ? "Answer locked" : `${seconds} seconds remaining`
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
              {answer ? "✓" : `${seconds}s`}
            </span>
          </div>
          <h1>{prompt.text}</h1>
          <p class="prompt-hint">
            {prompt.description ||
              "One feature film. Make it an unexpected one."}
          </p>
          <form
            class="answer-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (input.trim()) void submit();
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
                placeholder="Your movie title…"
                value={input}
                disabled={!!answer || loading || seconds === 0}
                maxLength={150}
                autoComplete="off"
                spellcheck={false}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={!!(showSuggestions && suggestions.length)}
                aria-controls="movie-suggestions"
                aria-activedescendant={
                  selected >= 0 ? `movie-option-${selected}` : undefined
                }
                onInput={(e) => {
                  setInput(e.currentTarget.value);
                  setShowSuggestions(true);
                  setError("");
                }}
                onKeyDown={keyDown}
              />
              {!answer && showSuggestions && suggestions.length > 0 && (
                <div class="suggestions" id="movie-suggestions" role="listbox">
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
              disabled={!!answer || loading || !input.trim() || seconds === 0}
              type="submit"
            >
              {loading ? "Checking…" : answer ? "Locked ✓" : "Lock it in →"}
            </button>
          </form>
          {!answer && (
            <div class="round-bottom">
              <p>
                Suggestions match titles, not the prompt.
                <br />A recognized wrong answer scores zero.
              </p>
              <button
                class="skip-button"
                disabled={loading}
                onClick={() => submit("")}
              >
                Skip this scene ↗
              </button>
            </div>
          )}
          {error && (
            <div class="error-message" role="alert">
              {error}
              {seconds === 0 && !answer && (
                <button class="plain-button" onClick={() => submit("")}>
                  Retry saving this scene →
                </button>
              )}
            </div>
          )}
          {answer && (
            <div class="feedback" aria-live="polite">
              <div class="feedback-content">
                <span class="feedback-emoji">{answer.emoji}</span>
                <div>
                  <strong>
                    {answer.status === "correct"
                      ? `${answer.tier} · +${answer.points}`
                      : answer.status === "incorrect"
                        ? "Not this time."
                        : answer.status === "abandoned"
                          ? "This scene closed."
                          : answer.status === "timeout"
                            ? "Cut! Time’s up."
                            : "On to the next scene."}
                  </strong>
                  <p>
                    {answer.status === "correct"
                      ? `${answer.movie?.title} (${answer.movie?.year})`
                      : answer.example
                        ? `One that fits: ${answer.example.title} (${answer.example.year}).`
                        : "No points for this scene. The next one is a fresh start."}
                    {answer.status === "correct" && (
                      <>
                        <br />
                        Rarity estimate locked. Your next scene awaits.
                      </>
                    )}
                  </p>
                </div>
              </div>
              <button
                class="button"
                disabled={loading}
                onClick={() =>
                  session.completed ? loadResults(session) : next()
                }
              >
                {loading
                  ? "Loading…"
                  : session.currentIndex === 6
                    ? "Roll credits →"
                    : "Next scene →"}
              </button>
            </div>
          )}
        </div>
        <p class="game-undertext">
          {session.accessible
            ? "Extra time · 40 seconds per scene."
            : "20 seconds per scene. No points for speed."}{" "}
          {session.mode === "daily"
            ? "One scored screening per day. Leaving mid-scene forfeits that answer."
            : "This screening won’t affect your daily score or streak."}
        </p>
        {session.completed && error && (
          <button class="button" onClick={() => loadResults(session)}>
            Retry the credits →
          </button>
        )}
      </section>
    );
  }
  return (
    <>
      {mode !== "daily" && (
        <div class="mode-banner">
          {mode === "practice"
            ? "ENCORE SCREENING · A free practice round. No daily stats or streaks."
            : `FROM THE ARCHIVE · ${archiveDate}. Historical answers; no streak.`}
        </div>
      )}
      {challenge && (
        <div
          class="challenge-banner"
          style={{ marginTop: 25, marginBottom: -10 }}
        >
          A friend scored {challenge.score}/700
          {challenge.accessible ? " with extra time" : ""}. Your seat is
          waiting.
        </div>
      )}
      <section class="hero" aria-labelledby="hero-title">
        <div class="hero-copy">
          <div class="showing-label">
            <span class="live-dot" />{" "}
            {mode === "daily"
              ? "NOW SHOWING"
              : mode === "practice"
                ? "THE ENCORE"
                : "BACK BY REQUEST"}{" "}
            <span class="showing-date">
              {daily
                ? `${todayLabel(mode === "archive" ? archiveDate : daily.date)} · SCREENING #${daily.number}`
                : "SEVEN SCENES · EVERY DAY"}
            </span>
          </div>
          <h1 id="hero-title">
            Good films.
            <br />
            Great minds.
            <br />
            <em>Rare answers.</em>
          </h1>
          <p class="hero-description">
            The daily movie game where the obvious answer isn’t the best one.
            How deep does your film knowledge go?
          </p>
          <button
            class="button hero-cta"
            onClick={() => {
              openMenu();
              void start();
            }}
            disabled={loading || !device || (!daily && !error) || !storageOK}
          >
            <span>
              <span class="play-triangle">▶</span>
              {loading
                ? "Taking your seat…"
                : mode === "practice"
                  ? "Play an encore"
                  : mode === "archive"
                    ? "Play this screening"
                    : hasDaily
                      ? "Your daily screening"
                      : "Play today’s game"}
            </span>
            <span class="cta-arrow">↗</span>
          </button>
          <p class="hero-fine">
            <span>✧</span> Free to play <span>·</span> No sign-up <span>·</span>{" "}
            About 3 minutes
          </p>
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
            Extra time? Take 40 seconds per scene.
          </button>
          {!storageOK && (
            <div class="error-message" role="alert">
              Allow local storage in your browser to save your daily screening
              and keep your streak.
            </div>
          )}
          {error && (
            <div class="error-message" role="alert">
              {error}{" "}
              <button class="plain-button" onClick={() => location.reload()}>
                Try again
              </button>
            </div>
          )}
        </div>
        <div class="hero-art">
          <img
            src="/images/projector.svg"
            alt="A mint green film projector with coral reels, an Admit One ticket and a seven-scene clapperboard"
            width="600"
            height="560"
            fetchPriority="high"
          />
          <span class="art-caption">FOR THE LOVE OF THE LESS OBVIOUS.</span>
        </div>
        <span class="hero-side-note">AN ORIGINAL REELILLION PRODUCTION</span>
      </section>
      <div class="quick-rules" aria-label="At a glance">
        <div class="quick-rule">
          <span class="quick-icon">▤</span>
          <span>
            <strong>7 movie prompts</strong> A new reel, every day
          </span>
        </div>
        <span class="rule-divider" />
        <div class="quick-rule">
          <span class="quick-icon">◷</span>
          <span>
            <strong>20 seconds each</strong> Trust your inner film buff
          </span>
        </div>
        <span class="rule-divider" />
        <div class="quick-rule">
          <span class="quick-icon">✧</span>
          <span>
            <strong>Rarer is better</strong> Find your cult classic
          </span>
        </div>
      </div>
    </>
  );
}
