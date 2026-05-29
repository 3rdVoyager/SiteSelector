# SiteSelector

SiteSelector helps small organizations compare website stacks, estimate costs, and understand the tradeoffs between all-in-one builders and modular setups.

## Current structure

- `docs/` is the GitHub Pages site root.
- `docs/index.html` contains the questionnaire UI and results panel.
- `docs/app.js` loads local pricing data and shows a simple recommendation.
- `docs/data/pricing-data.json` is the local data file the scraper will update.
- `scripts/scrape.py` renders targets with Playwright and writes normalized JSON.
- `scripts/config/targets.json` lists the first pricing targets and hints.

## Next steps

1. Run `scripts/scrape.py` to refresh `docs/data/pricing-data.json`.
2. Set `OPENAI_API_KEY` in your terminal if you want API-based normalization.
3. Expand the target list and add more comparison rows as new sites are added.

## Scraper

```powershell
$env:OPENAI_API_KEY = "your-key-here"
python scripts/scrape.py
```

If `OPENAI_API_KEY` is not set, the scraper still runs and uses deterministic heuristics.
If Playwright is not installed, it falls back to simple HTTP fetching and HTML parsing.
