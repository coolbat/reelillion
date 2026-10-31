# First application release — 2026-10-31

## Source, checks and automatic release

- Repository: <https://github.com/coolbat/reelillion>.
- First application commit: `61b6c3d5ad00a6ac5557670105c0dbdf6c9ca805`.
- Required GitHub Actions check: [Quality, run 41153602890](https://github.com/coolbat/reelillion/actions/runs/41153602890), success for that exact SHA. All 23 tests, types, catalogue checks, static build and Wrangler dry run passed at that commit.
- [Cloudflare Git build d8315962-6ead-4b2c-9b0d-365c0c27fd7e](https://dash.cloudflare.com/a8076357128d3e8be7dca72dbda3e8bf/workers/services/view/reelillion/production/builds/d8315962-6ead-4b2c-9b0d-365c0c27fd7e) was triggered by the Git push. Its log confirms `GitHub Actions Quality passed for this exact commit. 61b6c3d5ad00a6ac5557670105c0dbdf6c9ca805` before any remote D1 migration or Worker deployment.
- Tracked migration `0001_game.sql`: eight commands applied by that automated build at 2026-10-31 09:06:58 +08:00.
- Application Worker version: `4104fda9-2114-4382-87e3-66da2a6d7b2c`; 100% deployment. Successful build completion: 09:07:15 +08:00.
- Both `reelillion.com` and `www.reelillion.com` were attached as custom domains by the Git build. No local production deploy or manual asset upload was used.

The initial integration build was stopped by an overly strict environment guard because the first connection lacked the push-event SHA variable. The fix uses Cloudflare's documented `WORKERS_CI=1` and `CI=true` to identify the build environment. The independent gate still always resolves the actual Git checkout SHA and verifies its GitHub Actions check and check-suite SHA. Local shells remain rejected. Later documentation, test or data-tool commits are separate checked releases; the application acceptance below records this first working runtime.

## Domain and HTTPS

- Registrar: Spaceship; only `reelillion.com` was changed.
- Authoritative nameservers: `gerardo.ns.cloudflare.com`, `ullis.ns.cloudflare.com`, saved in Spaceship and observed through public DNS.
- The registrar listed no custom business DNS records. The two discovered parking A records (`54.149.79.189`, `34.216.117.25`) were preserved under `_parking-backup-1.reelillion.com` and `_parking-backup-2.reelillion.com` so the original configuration remains recoverable.
- `https://reelillion.com/` and `https://www.reelillion.com/`: HTTP 200, valid HTTPS, canonical metadata points at the apex.
- `/api/health`: HTTP 200, D1 query passed, 4,994 movies and 69 prompts.
- `/api/daily`: HTTP 200, seven public prompts, no answer-set IDs; New York date and reset timestamp correct.
- `/sitemap.xml`: HTTP 200, XML; an unknown page: HTTP 404 with the custom design.

## Production user flow and artifact identity

Acceptance on 2026-10-31 09:08 +08:00 created a Practice session, with 40 seconds per prompt. An unrecognized invented title was rejected without using the answer opportunity; seven qualifying film titles locked successfully. Total 190/700, seven stored rounds, and a second independent results read returned the same locked result. Practice returned no daily percentile and did not contribute acceptance choices to Daily rarity counts.

The production bytes of `Layout.CWnjcGVm.css`, `Game.D5Iw5Vpc.js` and `client.CX_ebh7M.js` matched the locally built artifacts. This ties the observed UI to the checked source in addition to Cloudflare's build SHA and deployment record.

Screenshots, raw build log and a redacted JSON acceptance report are saved locally in ignored `artifacts/`; no device/session identifiers, runtime database contents or credentials are committed.

## Browser review and remaining limits

[Three design review rounds](browser-review.md) covered 390px, 768px and 1440px, including actual gameplay. Representative content, archive empty state, pack, comparison, privacy and 404 pages were checked at 390px with no document overflow.

- Physical iOS/Android devices, VoiceOver/NVDA and native share-sheet delivery to a recipient are **unverified**. No message was sent.
- A real past-day archive in production cannot be exercised on the launch date; the SQLite integration test simulates the next day and checks historical scoring, isolation and date boundaries.
- Independent human editorial review and a 50–100-player score calibration remain pending. Of 4,994 films, 135 have measured annual pageviews and 4,859 use an explicit Wikidata sitelink fallback. Those weights are estimates, never real player counts.
- Payments, advertisement unlocks, old paid history, dedicated paid Unlimited and the five fully playable packs are not connected. Their pages label them as in development; general Practice is free.
- Rarest Answers reverse publication, outreach, directory submissions and retention measurement have not been performed by this repository release.

## Follow-up data and clock corrections

A production-browser answer exposed a systematic direct-class discovery filter: legal anime-film subclasses such as *Spirited Away* were missing. The corrected source uses film and animated-film class ancestry, adds 35 sourced international features, covers a 50-film regression manifest and removes five Wikidata short films even where their recorded runtime was 40 minutes or more. The resulting snapshot has 5,024 movies and the same 69 prompt IDs and daily schedule. Of these, 134 have measured annual pageviews; 4,890 have explicitly tagged fallback estimates. No additional pageview requests or production D1 edits were made for this correction. Original Daily locked scores are preserved.

The API also returns `serverNow`. The client aligns its countdown to that clock and caps it at the selected allowance, avoiding an apparent 41-second opening caused by a small client/server clock difference. Tests cover clock offsets up to twenty minutes in both directions; the stored server deadline remains the authority.

The complete final commit, CI run, Cloudflare Git build, Worker version, source/asset match and final production acceptance are collected by the release owner in the local ignored release artifacts after that follow-up commit is deployed. An added fixture proves that finalization refuses foreign/stale movie facts without overwriting the catalogue, and simulated-next-day SQL tests cover Archive scoring and statistics isolation.
