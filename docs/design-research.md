# Reelillion design research

Reviewed October 31, 2026. Product authority: the root requirements document, v1.0 with v1.1 rules and v1.2 theme configuration.

## Audience and purpose

The main audience is English-speaking film fans arriving on phones from a shared result. The first page must explain the rare-answer premise quickly and give one obvious action: start today's seven-question game. Film knowledge is the entertainment; posters, stills and trailers are not required and are outside the data and licensing scope.

## Reference observations

| Source | Observed characteristic | Reelillion interpretation |
| --- | --- | --- |
| [Krillion](https://krillion.io/) | Themed underwater experience, a primary Daily action, menu access to archive/unlimited/packs. The browser reference showed a pale blue surface shifting into deep navy water, coral highlights and pixel-art details. | Use deep navy as the screening-room foundation and coral for the main action. Give the game an ownable cinema setting; do not reuse underwater assets, depth mechanics or text. |
| [Cosmillion](https://cosmillion.com/) | Themed space experience, seven timed prompts, rare-answer scoring, an immediate launch action and a compact explanation of ranks. The browser reference showed navy, warm off-white, coral and illustrated pixel details. | Keep the first-screen premise concise, with a warm ticket-like start area and a score ladder that uses original film terminology. Borrow clarity and playful feedback, not rocket art or rank names. |
| [Framed](https://framed.wtf/) | Image-led film identification, Classic up to six frames, additional One Frame/TitleShot/Poster modes and archive navigation. | Keep the film audience and daily ritual in mind. Our main interaction remains textual recall; no copyrighted film stills or confusing imitation of Framed's game. |
| [MovieGrid](https://moviegrid.io/) | Visible category intersections include genre, title range, release range and actors; several modes and an archive are visible. | Make written conditions easy to scan and distinguish a title suggestion from a valid answer. A suggestion must never certify that it meets the prompt. |

Primary pages were checked with browser/web tools. Framed and MovieGrid comparisons are included in the category pages with direct creator links. Competitor prices, user numbers and private business claims are not asserted.

## Direction

- An independent retro screening room: deep navy `#101c36`, warm cream `#f5efdf`, coral `#f27665` and restrained mint `#afd5c4`.
- Space Grotesk display typography paired with DM Sans body copy. Short headers, strong display/body contrast, comfortable paragraphs and consistent spacing.
- Original film/reel/ticket language rather than the underwater or space metaphors of the references. No film posters or screenshots.
- A quiet page around one lively playable centerpiece. Hover, pressed, focus, countdown and answer feedback should make states understandable. Motion must respect `prefers-reduced-motion`.
- Content pages use editorial hierarchy and separated rows; theme collections are identified as in development until each has a complete validated question set.

## Content and feature boundaries

- Daily reset uses `America/New_York`; launch date is October 30, 2026 in that timezone, aligned with root's current implementation decision.
- Recent archive is generated in the browser from the actual Eastern date. It excludes today, future dates and pre-launch dates; no fake history is rendered.
- General practice is available; dedicated paid Unlimited and the five theme packs are in development. There is no checkout, claimed purchase flow or misleading pack-specific start link.
- Scores use a clearly labeled popularity prior while actual player data is small. Estimated rarity and observed player choice percentages must remain distinct.
- No invented participation count, percentile, testimonials or bestseller labels.
- The game site's category pages do not reveal today's answers. Result sharing is spoiler-free.

## Source issue discovered

`https://moviedle.app/` currently redirects to `https://www.moviedle.app/` and serves gambling content, not a verifiable movie game. It is excluded from outbound recommendations. The Cine2Nerdle primary page returned no readable content through the web reader; its detailed mechanics are not asserted in the published comparison. These limits are preferable to recommending stale or unverifiable links.

## Validation to be completed by integration owner

Inspect real pages at 390px, 768px and 1440px. Verify overflow, keyboard focus, mobile navigation, game lifecycle states and all links. Content pages have not independently completed the final browser review at the time of this draft; the root agent owns consolidated review evidence.
