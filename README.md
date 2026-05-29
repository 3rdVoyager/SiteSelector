# SiteSelector

SiteSelector helps small organizations compare website stacks, estimate costs, and understand the tradeoffs between all-in-one builders and modular setups.

## Current structure

- `docs/` is the GitHub Pages site root.
- `docs/index.html` contains the questionnaire UI and results panel.
- `docs/app.js` loads local pricing data and shows a simple recommendation.
- `docs/data/pricing-data.json` is the local data file the scraper will update.
- `scripts/scrape.py` is the Python scaffold for scraping and JSON generation.
- `scripts/config/targets.json` lists the first pricing targets.

## Next steps

1. Wire `scripts/scrape.py` to Playwright and real extraction logic.
2. Expand `docs/data/pricing-data.json` with richer tier and feature data.
3. Add comparison views and a more detailed recommendation engine.
