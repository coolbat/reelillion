import { useEffect, useState } from 'preact/hooks';

type Entry = { date: string; number: number; label: string };
const launchDate = '2026-10-30';

function recentGames(now = new Date()): Entry[] {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const value = (name: string) => parts.find((part) => part.type === name)?.value ?? '';
  const today = new Date(`${value('year')}-${value('month')}-${value('day')}T12:00:00Z`);
  const launch = new Date(`${launchDate}T12:00:00Z`).getTime();
  const entries: Entry[] = [];
  for (let offset = 1; offset <= 7; offset++) {
    const day = new Date(today.getTime() - offset * 86_400_000);
    const date = day.toISOString().slice(0, 10);
    if (date < launchDate) continue;
    entries.push({ date, number: Math.round((day.getTime() - launch) / 86_400_000) + 1, label: new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' }).format(day) });
  }
  return entries;
}

export default function Archive() {
  const [entries, setEntries] = useState<Entry[] | null>(null);
  useEffect(() => setEntries(recentGames()), []);
  if (entries === null) return <p role="status" class="archive-status">Checking the screening schedule…</p>;
  if (!entries.length) return <div class="archive-empty"><span aria-hidden="true" class="archive-empty-icon">↶</span><h2>The first encore is tomorrow.</h2><p>Our first Daily screening is October 30, 2026. Past games will appear here after midnight in New York.</p><a class="button button-secondary" href="/">Play today's game <span aria-hidden="true">↗</span></a></div>;
  return <div class="archive-list">{entries.map((entry) => <a key={entry.date} class="archive-entry" href={`/?mode=archive&date=${entry.date}`}><span class="archive-number">No. {String(entry.number).padStart(3, '0')}</span><span class="archive-date">{entry.label}</span><span class="archive-action">Replay <span aria-hidden="true">↗</span></span></a>)}</div>;
}
