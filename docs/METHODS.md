# Analysis methods

Runline reports evidence, not diagnoses. All calculations are inspectable in `lib/intelligence.ts` and `lib/running.ts`.

## Training history

Seven-day and preceding seven-day distance sums use calendar dates. Only available records are counted; missing uploads are not rest days. Changes are descriptive, not a safe-load prescription. The engine reports 28-day coverage alongside comparisons.

A selected run is compared with up to 20 earlier runs within 10% of its distance and with the same moving/elapsed time basis. At least two comparators are required. The baseline is their median pace. Routes, elevation, weather and effort are not matched, so a faster pace does not prove fitness improvement.

## Pacing and recovery

Pacing uses full-kilometre splits. Equal-sized first and last groups are compared, omitting the middle split when the count is odd. Incomplete coverage is explicit. Values outside 70–140% of median split pace are flagged for review, not automatically removed or interpreted as physiological events.

Recovery context uses check-ins no more than two days old relative to the analysis date. Resting-heart-rate context needs at least three prior observations within fourteen days. Self-reported fatigue and soreness remain subjective. The app does not prescribe treatment, diagnose injury or generate a medical readiness score.

## Race scenarios

Riegel uses `T2 = T1 × (D2 / D1)^1.06`. This is an equivalent-performance scenario. A training run is not necessarily a maximal effort and extrapolating to a marathon adds substantial uncertainty. The app does not present the result as a confidence interval. See [research on recreational race predictions](https://pubmed.ncbi.nlm.nih.gov/27570626/).

## Imports

Strava pages are read without account cookies. Only supported HTTPS hosts and activity/share paths are allowed; every redirect is validated. The reader stops at denial or a login wall and ignores script payloads. Missing measurements remain missing. Public page formats can change.

OCR can confuse units, digits and layout. GPS imports use point geometry and elapsed timestamps, not provider moving-time algorithms. Review all drafts before saving.
