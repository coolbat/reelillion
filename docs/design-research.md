# Reelillion design research

Initial review: October 31, 2026. The sections below retain the original MVP design rationale. The November 1, 2026 v1.3 update at the end supersedes the homepage presentation with the approved end-credits and pixel-cinema direction; its product authority is [requirements-v1.3.md](requirements-v1.3.md).

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

## v1.3 — end credits inside an original pixel cinema

Updated November 1, 2026 (Asia/Shanghai), after the user approved the end-credits concept and required the first screen to be the game interface itself. This section replaces the original side-by-side marketing hero as the homepage's design direction.

### References rechecked

The integration owner reopened [Krillion](https://krillion.io/) and [Cosmillion](https://cosmillion.com/) in the embedded browser on November 1, 2026. Their useful shared pattern is a single themed scene with a central, immediately available start action. Krillion establishes underwater depth around the play area; Cosmillion establishes space and launch imagery around its primary action. Both make the setting and the rare-answer premise visible before starting.

Reelillion borrows that clarity and continuous scene, while drawing its own cinema interior. No competitor images, sprites, layout code, rocket, submarine or scenery are reused. The scene is not a decorative illustration beside the game: its central screen contains the ready state, question, answer feedback and final result. Starting a game updates that screen in place without a separate destination or an extra entrance step. The timer starts only after the player chooses to play.

### Visual system

- A large, dark central screen is the visual anchor. Original pixel curtains, warm brass-colored lamps, stepped screen trim, EXIT signs and three rows of navy seats establish an unmistakable cinema around it.
- The retained navy and cream palette connects the update to the original brand. Coral is used for the curtains, headline emphasis and main action; warm gold marks lamps, small architectural accents and important score moments. The scenery frames the game without obscuring text or suggestions.
- Self-hosted Silkscreen supplies the wordmark, selected controls and decorative pixel labels. DM Sans and Space Grotesk carry readable instructions, questions, input text and longer content. Font license files remain beside the local font assets. Important rules use readable text rather than the smallest decorative pixel size.
- The ready screen states the rare-answer premise and seven-question format, with **Play today's reel** as the action. It replaces the ambiguous initial **Roll the credits** button; the credits wording remains appropriate as the game's theme and result language.
- Screen height follows its contents instead of forcing a widescreen aspect ratio. Narrow layouts keep the question and controls usable; desktop spacing is compact enough for the surrounding seat rows to remain visible in a normal-height window.

### Motion and progression

The film-production roles are game milestones along a cumulative score axis, not a hierarchy of workers or a claim about a universal credit order. The existing seven questions and five per-answer rarity bands remain intact. A rarer valid answer moves farther along the separate credits stage; a zero-point answer does not move it.

Only that bounded stage scrolls during answer settlement. The page, question area and input remain stable, and the player explicitly starts the next timed question. System reduced-motion preferences and the in-game motion control replace moving transitions with static state changes. A strong completed score unlocks the short post-credits scene; a perfect score receives its special variation. These visual rewards derive from stored scores and do not change scoring or server deadlines.

### Social preview and review evidence

The original [social-credits.svg](../public/images/social-credits.svg) and its rendered [social.png](../public/images/social.png) now use the cinema and credits presentation so the shared page preview matches the game. They contain original shapes and text, with no film poster or still.

The second-round desktop and mobile screenshots (`round2-home-1440.jpg` and `round2-home-390.jpg`, held in local release artifacts) show the revised readable rule line, clearer start action and more compact theatre composition. The 1440px image includes the full seat rows; the 390px image keeps the complete start control, timing option and seats within the captured view. No additional blocking visual defect was identified from those two static images. Final 390/768/1440px interaction, motion and lifecycle acceptance remains the integration owner's consolidated browser review; screenshots alone are not evidence for those behaviors.
