# Reelillion catalogue and popularity priors

The deployment reads a versioned snapshot, not a live third-party API. `src/data/metadata.json` records the exact fetch time, measured/fallback coverage and caveats. `src/data/provenance.json` records the SPARQL query and answer count for every source prompt, including sources rejected for having fewer than 30 answers.

## Sources and permissions

- Title, year, running time, cast, studio, genre, country, award and English Wikipedia sitelink facts come from the [Wikidata Query Service](https://query.wikidata.org/). Wikidata structured facts are [CC0](https://www.wikidata.org/wiki/Wikidata:Licensing).
- Familiarity weights use the sum of twelve complete months of English Wikipedia `all-access/user` article pageviews, October 2025–September 2026, retrieved from the [Wikimedia Analytics API](https://doc.wikimedia.org/generated-data-platform/aqs/analytics-api/reference/page-views.html). Its metrics are [CC0](https://doc.wikimedia.org/generated-data-platform/aqs/analytics-api/documentation/access-policy.html).
- No IMDb, TMDB, movie posters, frames or Wikipedia prose are imported. English Wikipedia links let players check each fact at its owning source. The short prompt descriptions are written for this project.

## Scope and validation

Every admitted film has an English Wikipedia sitelink, a Wikidata film classification, a release year between 1888 and 2026, and a recorded runtime of at least 40 minutes. Television series, miniseries and episode classes are excluded. A film can be animated or documentary. Television feature films may qualify; series and individual episodes do not.

Cast prompts include both onscreen cast (`P161`) and voice-acting (`P725`) credits. The launch source review caught *Toy Story* missing from the Tom Hanks prompt when only onscreen credits were used; `voice-credits.json` retains the separate full actor voice-credit query results, and a regression test checks that example.

Every admitted prompt has at least 30 distinct answers. Cast filmographies are fetched up to 500 titles; broad conditions are bounded to 240 titles ranked by the number of Wikidata sitelinks. The snapshot is therefore a supported catalogue, not an exhaustive list of every qualifying film. An absent title must get an unknown-title retry rather than be falsely claimed not to fit a prompt.

The drama condition was narrowed to movies released before 2000 after the initial full-catalogue pass produced 2,522 answers. The launch validator rejects any prompt above 2,000 answers as well as any below 30. No arbitrary cap is applied to an accepted prompt's known qualifying answers.

`node scripts/data-validate.mjs` checks references, duplicate identifiers, minimum answer counts, metadata and sourced weights. It writes:

- `src/data/quality.json`: answer count, expected top-three share, smallest prior and measured coverage for each prompt.
- `src/data/schedule.json`: the first 30 daily sets, 30 October–28 November 2026 (New York dates).

`tests/data-catalog.test.ts` also checks a year of deterministic daily sets, rolling 30-day actor nonrepetition and date handling. These are automated checks. Independent human editorial review and a 50–100-player scoring calibration have not been performed.

## Daily selection

`getDailyPrompts(date)` receives a `YYYY-MM-DD` date already calculated in `America/New_York`. It chooses seven distinct categories in this order: studio, decade, genre, country of origin, running time, cast, award. The actor pool has at least 30 different people; sequential rotation prevents an actor recurring inside any 30-day window. Other pools rotate independently. The function works across UTC, New York daylight-saving changes, year boundaries and dates before the launch epoch.

The committed 30-day file is review evidence; the date function is the single runtime selection authority. Beyond those 30 days it continues the deterministic rotation. New prompts should be added and reviewed before the pool becomes repetitive. Full holiday themes and separate seven-round themed packs are not claimed by this catalogue.

## What a weight means

For a prompt, a film's initial share is its weight divided by the total weight of all supported answers. Successful annual pageview requests supply the raw view count. If a request fails, the explicitly tagged `wikidata-sitelinks-fallback` weight is `medianMeasuredAnnualViews × (sitelinks / 30)²`, floored at one. `weightSource`, `annualPageviews` and `pageviewMonths` remain on each movie record so no estimated value can be mistaken for a measured count.

These are cold-start estimates of familiarity. They are **not player counts or observed answer percentages**. The backend blends them with actual D1 submissions using the documented 200-answer prior. Scores should identify estimated rarity until real player evidence exists. Pageviews cannot establish player score percentiles; percentile labels need actual completed daily sessions.

The pageview source omits redirects, may be influenced by current events, and does not measure the probability that a player recalls a film for a specific prompt. Sitelinks are a fallback familiarity signal. Runtime versions, release-year conventions and genre assignments can differ; running-time prompts explicitly use the longest runtime in the snapshot. The cold-start score distribution remains uncalibrated.

The launch fetch encountered an explicit HTTP 429 from Wikimedia. Requests were stopped. This snapshot has **135 movies with all twelve measured monthly view counts and 4,859 movies with a labelled sitelink fallback**; the monthly observations are retained in `src/data/pageviews.json`. No fallback is represented as a measured pageview total. Broad discovery queries are bounded, but a separate full-catalogue facts pass checks genre, country, studio and award membership for every known movie so an already recognised movie is not rejected just for missing a discovery query's top rows. Those facts are retained in `src/data/facts.json` and on each movie.

Source classification can be surprising: Wikidata includes horror classifications for *Gravity* and *Apocalypse Now*, and animation-related subtypes for *Avatar*. These source-defined edge cases are accepted rather than silently overridden. They need editorial review before claiming a calibrated or universally agreed genre taxonomy.

## Refresh

Run the complete refresh and validation sequence on a development branch:

```sh
python3 scripts/data-refresh.py
node scripts/data-validate.mjs
npm test
npm run check
npm run build
```

The single `data-refresh.py` entry point discovers seed movies using both `P161` onscreen and `P725` voice credits; calls `enrich_catalogue` to fetch facts for **every movie ID in that new catalogue**, including IDs added during this refresh; writes a replacement `facts.json`; and reconstructs broad-condition memberships from the full catalogue. The bounded top-240 discovery rows are not the final legal-answer set. It then fetches popularity observations, automatically runs `data-voice-credits.py` to refresh the independent voice-credit audit and merge all known matching movies, and runs `data-finalize.py` for aliases, restricted drama membership, recovered studio prompts, final metadata and provenance. A failure in either child step fails the entry point. Do not validate or publish a partially written snapshot from a failed run.

`data-finalize.py` is an **offline recovery/normalisation tool, not a facts refresher**. It rejects a `facts.json` whose movie-ID set differs from `movies.json`, so an older facts file cannot silently cover newly introduced entities. To recover after a facts-fetch failure, rerun `data-refresh.py`; the finalizer cannot invent the missing facts. To recover only after the full facts pass has completed, run `python3 scripts/data-voice-credits.py` followed by `python3 scripts/data-finalize.py`, then repeat the validation sequence above. The voice step may access Wikidata; the finalizer only reads existing facts and successful cached pageview responses.

The fetcher identifies itself with a User-Agent, caches requests in ignored `/.data-cache/`, and resumes cached responses. Pageview fetches are sequential and stop further uncached requests on HTTP 429. Delete the relevant `wd-*.json` cache entries when a genuinely fresh Wikidata read is required; new batch IDs produce distinct cache keys, but unchanged batches otherwise reuse their cached source snapshot. Remove the relevant pageview entries to refetch those observations. Review `metadata.json`, rejected sources and `quality.json` before committing a new snapshot. Network access is required only for refresh, not for ordinary builds or gameplay. No new bulk fetch was performed while repairing this entry point; the orchestration and missing-facts guard were verified with isolated fixtures/static checks, and a complete new network refresh remains unverified.

The script's fixed pageview window is intentional for a reproducible launch prior. Update the start/end dates together when preparing a new annual snapshot. Production D1 player data must never be committed to Git or overwritten by this generator.
