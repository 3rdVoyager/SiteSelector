"""Scrape pricing pages and emit a JSON file for the GitHub Pages frontend.

This first scaffold keeps storage simple by writing local JSON instead of using a database.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

from pydantic import BaseModel, Field


ROOT = Path(__file__).resolve().parents[1]
OUTPUT_FILE = ROOT / "docs" / "data" / "pricing-data.json"
TARGETS_FILE = Path(__file__).resolve().parent / "config" / "targets.json"


@dataclass
class ScrapeResult:
    platform: str
    category: str
    starting_price: str
    summary: str
    best_for: list[str]


class Target(BaseModel):
    platform: str = Field(..., min_length=1)
    url: str = Field(..., min_length=1)
    category: str = Field(default="Unknown")


def load_targets() -> list[Target]:
    if not TARGETS_FILE.exists():
        return []

    return [Target.model_validate(item) for item in json.loads(TARGETS_FILE.read_text(encoding="utf-8"))]


def scrape_target(target: Target) -> ScrapeResult:
    """Placeholder for the Playwright + LLM pipeline.

    Replace this with:
    - Playwright rendering
    - raw text extraction
    - LLM structured parsing
    - validation and write-through to JSON
    """

    return ScrapeResult(
        platform=target.platform,
        category=target.category,
        starting_price="TBD",
        summary=f"Scrape output for {target.platform} has not been wired up yet.",
        best_for=["Placeholder data"],
    )


def build_payload(results: Iterable[ScrapeResult]) -> dict:
    return {
        "generated_at": datetime.now(timezone.utc).date().isoformat(),
        "platforms": [asdict(result) for result in results],
    }


def main() -> None:
    targets = load_targets()
    results = [scrape_target(target) for target in targets]
    payload = build_payload(results)
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Wrote {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
