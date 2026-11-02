# TCP Keyword Radar v2

Expanded dashboard for credit repair, credit score, mortgage, auto finance and 2026 and used car models.

## What is here

- 4,847 seeds across 9 categories.
- Every seed has Bing autocomplete and Bing top 10.
- 26,686 keywords with closest live page and overlap prefilter.
- 1,190 page ideas, each judged against 6 closest live pages and the 24 converted pages.
- 729 ready pages after dedupe, strict site-hit filtering and demand filters.
- A Google PAA sample for high-priority mortgage and auto seeds.

## Files

- `index.html`, `styles.css`, `app.js`: static dashboard.
- `data/meta.js`: counts and limits.
- `data/seeds.js`: seed-level SERP and autocomplete metadata.
- `data/keywords.js`: keyword table, loaded on first use.
- `data/ideas.js`: page ideas, loaded on first use.
- `data/converted.js`: the 24 converted pages and their top 10.
- `data/opportunities.csv`: 729 ready pages.

## Run

Open `index.html`. The data files are plain scripts, so it works from `file://` or any static host.

Method and limits are in the dashboard's Method tab.
