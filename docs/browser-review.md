# Browser acceptance — 2026-10-31 (Asia/Shanghai)

The initial visual direction draws on the focused game entry and thematic progression of Krillion and Cosmillion. Reelillion uses its own movie-projector illustration, film-strip progress, ticket and clapperboard, typography, copy and five movie-specific rarity tiers. No movie posters or film stills are used.

Test surface: real in-app browser, local Wrangler/workerd + persistent local D1 at `http://127.0.0.1:8787/`. Static production output was rebuilt after edits. Three design review rounds were used; no fourth design iteration is planned.

## Round 1

- **Extra time control, home:** the first checkbox interaction occurred during client hydration and the initial state reset. Changed it to an explicit switch with a visible track, keyboard activation and a disabled pre-hydration state. This makes the state and readiness clear.
- **Round timer:** SVG circles inherited a black fill. Added `fill="none"` to both circles so the timer reads as a ring.
- **Active game, below the panel:** the full explanation and FAQ continued below the time-sensitive question. Hide these sections while a game or results are active, keeping the footer and full standalone rules accessible.
- **Hero illustration, ticket:** the long top ticket label crowded the seat label. Shortened the original illustration’s label.

## Round 2

- **768px hero, right illustration:** the 125% image width extended the document to 785px. Constrain the tablet illustration to its grid column and remove its translation. This prevents horizontal scrolling while retaining the drawing.
- **Score and share copy:** cold-start estimates originally named Wikipedia alone although many weights use Wikidata sitelinks. Updated the public explanation to name both sources and distinguish observed choices.
- **Results transition:** completing the last scene retained the prior scroll position. Focus the results title and scroll the main region to its start so the total score is presented first.

## Round 3

- **390px:** hero, mobile navigation, active question, feedback and results fit the viewport; document width equals viewport width. Answer input and primary actions remain fully usable. The filmstrip and questions wrap without clipping.
- **768px:** document width equals 768px after the illustration fix. Keyboard activation sets the Extra time switch to `aria-checked=true`; opening a game returns the server’s 40-second deadline.
- **1440px:** desktop header, split hero, quick rules, explanatory content and footer fit without overflow. Typography and spacing retain the shared hierarchy.
- **Played interactions:** unknown film -> explanatory error and a retry in the same round; three-character all-catalog autocomplete; ArrowDown/Enter title selection; successful title -> locked answer and points; explicit next scene; skip; seven-round completion; result discoveries; daily/practice labeling. No browser error or warning was observed in the game test.
- **Server tests:** real local workerd + D1 smoke test additionally waited through an actual 20-second timeout, checked duplicate answer idempotency, daily uniqueness/resume forfeiture, wrong title locking, 40-second practice, ownership and cross-origin rejection.

Local screenshots are saved under ignored `artifacts/`: desktop, tablet, mobile home; mobile/tablet game; mobile results; and Spaceship nameserver confirmation. Final production screenshots and acceptance belong to the release evidence.

## Limits

- Native OS share-sheet completion to another person is not performed; no message was sent. The share payload is spoiler-free, with clipboard and manual text fallbacks implemented.
- Physical iOS/Android devices, VoiceOver/NVDA and a 50–100-person playtest remain unverified. The browser supports keyboard paths and reduced-motion CSS, but this is not an assistive-technology certification.
- Independent human editorial approval and real-player rarity calibration remain pending. The catalog states its data-source limits.
- Dedicated paid Unlimited, full theme packs and payments are outside the playable Daily MVP and are clearly labeled as in development.
