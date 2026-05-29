"""Scrape target pages and emit JSON for the SiteSelector frontend.

The scraper keeps the pipeline simple:
- Use Playwright to render and extract each target page.
- Optionally call the OpenAI API when `OPENAI_API_KEY` is available.
- Fall back to deterministic heuristics when no API key is set.
- Write the final normalized records to `docs/data/pricing-data.json`.
"""

from __future__ import annotations

import argparse
import asyncio
import html
import json
import os
import re
import textwrap
import urllib.error
import urllib.request
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse
from typing import Any

try:  # Optional dependency.
    from playwright.async_api import TimeoutError as PlaywrightTimeoutError
    from playwright.async_api import async_playwright
except ImportError:  # pragma: no cover - exercised when Playwright is not installed.
    PlaywrightTimeoutError = TimeoutError
    async_playwright = None


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT_FILE = ROOT / "docs" / "data" / "pricing-data.json"
DEFAULT_TARGETS_FILE = Path(__file__).resolve().parent / "config" / "targets.json"
DEFAULT_OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
DEFAULT_TIMEOUT_MS = 45_000


@dataclass(slots=True)
class Target:
    name: str
    url: str
    category: str = "Unknown"
    kind: str = "platform"
    price_hint: str | None = None
    ownership: str | None = None
    cost_tier: str | None = None


@dataclass(slots=True)
class ScrapedPlatform:
    name: str
    category: str
    kind: str
    price: str
    summary: str
    best_for: list[str]
    ownership: str
    cost_tier: str


@dataclass
class PageSnapshot:
    title: str
    url: str
    text: str


class TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._chunks: list[str] = []
        self._skip_stack = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag in {"script", "style", "noscript"}:
            self._skip_stack += 1

    def handle_endtag(self, tag: str) -> None:
        if tag in {"script", "style", "noscript"} and self._skip_stack > 0:
            self._skip_stack -= 1
        if tag in {"p", "br", "li", "div", "section", "article", "header", "footer", "h1", "h2", "h3", "h4", "h5", "h6"}:
            self._chunks.append("\n")

    def handle_data(self, data: str) -> None:
        if self._skip_stack == 0 and data.strip():
            self._chunks.append(data)

    def text(self) -> str:
        combined = " ".join(self._chunks)
        combined = html.unescape(combined)
        combined = re.sub(r"[ \t]+", " ", combined)
        combined = re.sub(r"\n\s*\n", "\n\n", combined)
        return combined.strip()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Scrape site pricing pages into JSON.")
    parser.add_argument("--targets", type=Path, default=DEFAULT_TARGETS_FILE, help="Path to the targets JSON file.")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT_FILE, help="Path to the output JSON file.")
    parser.add_argument("--timeout-ms", type=int, default=DEFAULT_TIMEOUT_MS, help="Navigation timeout in milliseconds.")
    parser.add_argument("--headless", action=argparse.BooleanOptionalAction, default=True, help="Run browser headless.")
    return parser.parse_args()


def load_targets(targets_file: Path) -> list[Target]:
    if not targets_file.exists():
        raise FileNotFoundError(f"Targets file not found: {targets_file}")

    raw_targets = json.loads(targets_file.read_text(encoding="utf-8"))
    if not isinstance(raw_targets, list):
        raise ValueError("Targets file must contain a JSON array.")

    targets: list[Target] = []
    for item in raw_targets:
        if not isinstance(item, dict):
            raise ValueError(f"Invalid target entry: {item!r}")

        name = str(item.get("name") or item.get("platform") or "").strip()
        url = str(item.get("url") or "").strip()
        category = str(item.get("category") or "Unknown").strip() or "Unknown"
        kind = str(item.get("kind") or "platform").strip() or "platform"

        parsed_url = urlparse(url)
        if not name or not url or parsed_url.scheme not in {"http", "https"} or not parsed_url.netloc:
            raise ValueError(f"Invalid target entry: {item!r}")

        targets.append(
            Target(
                name=name,
                url=url,
                category=category,
                kind=kind,
                price_hint=item.get("price_hint") or item.get("priceHint"),
                ownership=item.get("ownership"),
                cost_tier=item.get("cost_tier") or item.get("costTier"),
            )
        )

    return targets


async def scrape_snapshot(page, target: Target, timeout_ms: int) -> PageSnapshot:
    await page.goto(str(target.url), wait_until="domcontentloaded", timeout=timeout_ms)

    try:
        await page.wait_for_load_state("networkidle", timeout=timeout_ms // 2)
    except PlaywrightTimeoutError:
        pass

    title = (await page.title()).strip()
    text = await page.locator("body").inner_text(timeout=timeout_ms)
    cleaned_text = re.sub(r"\n{3,}", "\n\n", text).strip()

    return PageSnapshot(title=title or target.name, url=str(page.url), text=cleaned_text)


def truncate_text(text: str, limit: int = 280) -> str:
    compact = re.sub(r"\s+", " ", text).strip()
    if len(compact) <= limit:
        return compact
    return compact[: limit - 1].rstrip() + "…"


def html_snapshot_from_url(url: str, timeout_ms: int) -> PageSnapshot:
    request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (SiteSelector scraper)"})
    with urllib.request.urlopen(request, timeout=max(10, timeout_ms // 1000)) as response:
        raw_html = response.read().decode("utf-8", errors="replace")

    title_match = re.search(r"<title[^>]*>(.*?)</title>", raw_html, flags=re.IGNORECASE | re.DOTALL)
    title = html.unescape(title_match.group(1).strip()) if title_match else url

    extractor = TextExtractor()
    extractor.feed(raw_html)
    text = extractor.text()
    return PageSnapshot(title=title, url=url, text=text)


def infer_kind(target: Target, snapshot: PageSnapshot) -> str:
    if target.kind and target.kind != "platform":
        return target.kind

    haystack = f"{target.name} {target.category} {snapshot.title} {snapshot.text}".lower()
    if any(keyword in haystack for keyword in ["domain", "registrar", "dns"]):
        return "registrar"
    if any(keyword in haystack for keyword in ["forms", "submit", "payment", "donation", "booking", "schedule"]):
        return "integration"
    if any(keyword in haystack for keyword in ["hosting", "pages", "deploy", "static"]):
        return "hosting"
    if any(keyword in haystack for keyword in ["cms", "blog", "publish", "editor"]):
        return "cms"
    if any(keyword in haystack for keyword in ["builder", "website builder", "all-in-one"]):
        return "builder"
    return target.kind


def infer_price(target: Target, snapshot: PageSnapshot) -> str:
    if target.price_hint:
        return target.price_hint

    text = snapshot.text.lower()
    price_patterns = [
        r"\$\d+(?:\.\d+)?(?:\s*[-–]\s*\$?\d+(?:\.\d+)?)?\s*/\s*(?:mo|month|yr|year)",
        r"\$\d+(?:\.\d+)?\s*(?:one-time|one time)",
        r"\$0(?:\s*[-–]\s*\$\d+(?:\.\d+)?)?\s*/\s*mo",
    ]
    for pattern in price_patterns:
        match = re.search(pattern, text)
        if match:
            return match.group(0).replace(" month", "/mo").replace(" year", "/yr")

    if any(keyword in text for keyword in ["free", "$0", "no cost"]):
        return "$0/mo"

    if any(keyword in text for keyword in ["enterprise", "custom quote"]):
        return "Custom quote"

    if infer_kind(target, snapshot) == "registrar":
        return "$10-$25/yr"

    if infer_kind(target, snapshot) == "hosting":
        return "$0-$20/mo"

    if infer_kind(target, snapshot) == "integration":
        return "$0-$29/mo"

    return "See site pricing"


def infer_ownership(target: Target, snapshot: PageSnapshot) -> str:
    if target.ownership:
        return target.ownership

    kind = infer_kind(target, snapshot)
    if kind in {"hosting", "registrar"}:
        return "High"
    if kind in {"cms", "builder"}:
        return "Medium"
    return "Medium"


def infer_cost_tier(price: str) -> str:
    text = price.lower()
    if any(keyword in text for keyword in ["free", "$0", "no cost"]):
        return "free"
    if any(keyword in text for keyword in ["one-time", "low"]):
        return "low"
    if any(keyword in text for keyword in ["custom quote", "enterprise"]):
        return "enterprise"
    if any(keyword in text for keyword in ["usage", "transaction"]):
        return "usage"
    return "starter"


def infer_best_for(target: Target, snapshot: PageSnapshot) -> list[str]:
    haystack = f"{target.name} {target.category} {snapshot.title} {snapshot.text}".lower()
    buckets: list[str] = []

    mapping = [
        ("design", "Design-led sites"),
        ("blog", "Blogs"),
        ("news", "News and updates"),
        ("membership", "Memberships"),
        ("donation", "Donations"),
        ("payment", "Payments"),
        ("booking", "Bookings"),
        ("schedule", "Bookings"),
        ("form", "Forms"),
        ("static", "Static sites"),
        ("domain", "Domains"),
        ("docs", "Docs sites"),
        ("small", "Small organizations"),
    ]

    for keyword, label in mapping:
        if keyword in haystack and label not in buckets:
            buckets.append(label)

    if not buckets:
        buckets.extend([
            "Fast launches",
            "Small teams",
            "Simple workflows",
        ])

    return buckets[:3]


def build_local_record(target: Target, snapshot: PageSnapshot) -> ScrapedPlatform:
    kind = infer_kind(target, snapshot)
    price = infer_price(target, snapshot)
    summary_source = snapshot.text or snapshot.title or target.name

    return ScrapedPlatform(
        name=snapshot.title or target.name,
        category=target.category,
        kind=kind,
        price=price,
        summary=truncate_text(summary_source),
        best_for=infer_best_for(target, snapshot),
        ownership=infer_ownership(target, snapshot),
        cost_tier=target.cost_tier or infer_cost_tier(price),
    )


def call_openai_api(snapshot: PageSnapshot, target: Target, api_key: str, model: str) -> dict[str, Any] | None:
    system_prompt = (
        "You extract normalized website platform records for a comparison dashboard. "
        "Return only valid JSON with these keys: name, category, kind, price, summary, best_for, ownership, cost_tier. "
        "best_for must be an array of 1-3 short strings. Keep the summary concise and factual. "
        "Use the target metadata and page text to infer the record."
    )
    user_prompt = textwrap.dedent(
        f"""
        Target metadata:
        - name: {target.name}
        - url: {target.url}
        - category: {target.category}
        - kind: {target.kind}
        - price_hint: {target.price_hint or ""}
        - ownership: {target.ownership or ""}
        - cost_tier: {target.cost_tier or ""}

        Page title:
        {snapshot.title}

        Page text:
        {truncate_text(snapshot.text, 5000)}
        """
    ).strip()

    payload = json.dumps(
        {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.2,
            "response_format": {"type": "json_object"},
        }
    ).encode("utf-8")

    request = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=payload,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            response_payload = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError):
        return None

    choices = response_payload.get("choices") or []
    if not choices:
        return None

    content = choices[0].get("message", {}).get("content", "")
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        return None


def normalize_llm_record(record: dict[str, Any], fallback: ScrapedPlatform) -> ScrapedPlatform:
    best_for = record.get("best_for")
    if isinstance(best_for, str):
        best_for = [best_for]
    if not isinstance(best_for, list):
        best_for = fallback.best_for

    normalized = {
        "name": str(record.get("name") or fallback.name),
        "category": str(record.get("category") or fallback.category),
        "kind": str(record.get("kind") or fallback.kind),
        "price": str(record.get("price") or fallback.price),
        "summary": truncate_text(str(record.get("summary") or fallback.summary)),
        "best_for": [str(item) for item in best_for if str(item).strip()][:3] or fallback.best_for,
        "ownership": str(record.get("ownership") or fallback.ownership),
        "cost_tier": str(record.get("cost_tier") or fallback.cost_tier),
    }

    return ScrapedPlatform(**normalized)


async def scrape_target(page, target: Target, timeout_ms: int, api_key: str | None, model: str) -> ScrapedPlatform:
    snapshot = await scrape_snapshot(page, target, timeout_ms)
    local_record = build_local_record(target, snapshot)

    if not api_key:
        return local_record

    llm_record = call_openai_api(snapshot, target, api_key, model)
    if not llm_record:
        return local_record

    return normalize_llm_record(llm_record, local_record)


def build_payload(results: list[ScrapedPlatform]) -> dict[str, Any]:
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "platforms": [asdict(result) for result in results],
    }


async def run_scrape(targets: list[Target], timeout_ms: int, headless: bool, api_key: str | None, model: str) -> list[ScrapedPlatform]:
    results: list[ScrapedPlatform] = []

    if async_playwright is None:
        print("Playwright not installed; using built-in HTTP fallback.")
        for target in targets:
            print(f"Scraping {target.name} ...")
            try:
                snapshot = html_snapshot_from_url(target.url, timeout_ms)
                local_record = build_local_record(target, snapshot)
                if api_key:
                    llm_record = call_openai_api(snapshot, target, api_key, model)
                    results.append(normalize_llm_record(llm_record, local_record) if llm_record else local_record)
                else:
                    results.append(local_record)
            except Exception as error:  # noqa: BLE001
                print(f"  ! Failed, using fallback record: {error}")
                results.append(build_local_record(target, PageSnapshot(title=target.name, url=str(target.url), text=target.category)))

        return results

    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=headless)
        page = await browser.new_page(viewport={"width": 1440, "height": 1200})

        try:
            for target in targets:
                print(f"Scraping {target.name} ...")
                try:
                    result = await scrape_target(page, target, timeout_ms, api_key, model)
                except Exception as error:  # noqa: BLE001
                    print(f"  ! Failed, using fallback record: {error}")
                    result = build_local_record(target, PageSnapshot(title=target.name, url=str(target.url), text=target.category))
                results.append(result)
        finally:
            await page.close()
            await browser.close()

    return results


def main() -> None:
    args = parse_args()
    targets = load_targets(args.targets)
    api_key = os.environ.get("OPENAI_API_KEY")
    model = os.environ.get("OPENAI_MODEL", DEFAULT_OPENAI_MODEL)

    results = asyncio.run(run_scrape(targets, args.timeout_ms, args.headless, api_key, model))
    payload = build_payload(results)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {args.output}")


if __name__ == "__main__":
    main()