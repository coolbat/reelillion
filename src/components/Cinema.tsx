import type { ComponentChildren } from "preact";
import "../styles/cinema.css";

interface CinemaProps {
  children: ComponentChildren;
  phase: "ready" | "playing" | "results";
  score: number;
  modeLabel: string;
}

/** Original, deliberately low-resolution theatre scenery. It never moves the form. */
function AudienceSeats() {
  const rows = [
    {
      count: 18,
      step: 58,
      width: 40,
      height: 45,
      x: 30,
      y: 8,
      back: "#32415c",
      edge: "#50617c",
      arm: "#25344f",
    },
    {
      count: 15,
      step: 70,
      width: 52,
      height: 61,
      x: 35,
      y: 45,
      back: "#263650",
      edge: "#3b4c69",
      arm: "#1d2b44",
    },
    {
      count: 12,
      step: 88,
      width: 68,
      height: 77,
      x: 30,
      y: 91,
      back: "#192943",
      edge: "#30405a",
      arm: "#101f37",
    },
  ];
  return (
    <svg
      class="cinema-seats"
      viewBox="0 0 1100 180"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
      shape-rendering="crispEdges"
    >
      {rows.map((row, rowIndex) => (
        <g key={rowIndex}>
          {Array.from({ length: row.count }, (_, i) => {
            const aisle = i >= row.count / 2 ? 20 : -20;
            const x = row.x + row.step * i + aisle;
            const y = row.y;
            return (
              <g key={i}>
                <path
                  d={`M${x + 8} ${y}h${row.width - 16}v4h4v4h4v${row.height - 8}h-${row.width}V${y + 8}h4v-4h4z`}
                  fill={row.back}
                />
                <path
                  d={`M${x + 8} ${y}h${row.width - 16}v4H${x + 8}zM${x + 4} ${y + 4}h4v4h-4zM${x + row.width - 8} ${y + 4}h4v4h-4z`}
                  fill={row.edge}
                />
                <rect
                  x={x - 4}
                  y={y + row.height - 20}
                  width="8"
                  height="31"
                  fill={row.arm}
                />
                <rect
                  x={x + row.width - 4}
                  y={y + row.height - 20}
                  width="8"
                  height="31"
                  fill={row.arm}
                />
                <rect
                  x={x + 5}
                  y={y + row.height - 7}
                  width={row.width - 10}
                  height="8"
                  fill={row.arm}
                />
                {rowIndex === 0 && (i === 3 || i === 13) && (
                  <path
                    d={`M${x + 12} ${y + 4}h12v-7h-3v-4h-6v4h-3z`}
                    fill="#9c7d73"
                  />
                )}
              </g>
            );
          })}
        </g>
      ))}
      <path d="M531 180h38l-7-92h-24z" fill="#101a2d" />
      <path
        d="M548 162h4v8h-4zM548 134h4v8h-4zM548 106h4v8h-4z"
        fill="#bd9a66"
        opacity=".55"
      />
    </svg>
  );
}

export default function Cinema({
  children,
  phase,
  score,
  modeLabel,
}: CinemaProps) {
  return (
    <section
      class={`cinema cinema--${phase}`}
      aria-label={`${modeLabel} in the Reelillion cinema`}
      data-score={score}
    >
      <div class="cinema-marquee" aria-hidden="true">
        <span class="cinema-marquee-rule" />
        <span>THE REELILLION PICTURE HOUSE</span>
        <span class="cinema-marquee-rule" />
      </div>
      <div class="cinema-stage">
        <div class="cinema-wall cinema-wall--left" aria-hidden="true">
          <div class="cinema-sconce">
            <i />
            <i />
            <i />
          </div>
          <span class="cinema-exit">
            EXIT<span>←</span>
          </span>
        </div>
        <div class="cinema-wall cinema-wall--right" aria-hidden="true">
          <div class="cinema-sconce">
            <i />
            <i />
            <i />
          </div>
          <span class="cinema-exit">
            EXIT<span>→</span>
          </span>
        </div>
        <div class="cinema-curtain cinema-curtain--left" aria-hidden="true" />
        <div class="cinema-curtain cinema-curtain--right" aria-hidden="true" />
        <div class="cinema-pelmet" aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
          <span />
        </div>
        <div class="cinema-screen-frame">
          <div class="cinema-screen">
            <div class="cinema-screen-content">{children}</div>
          </div>
        </div>
        <div class="cinema-stage-lip" aria-hidden="true" />
      </div>
      <div class="cinema-auditorium" aria-hidden="true">
        <AudienceSeats />
      </div>
      <p class="cinema-house-note">
        FOR EVERYONE WHO STAYS UNTIL THE VERY END.
      </p>
    </section>
  );
}
