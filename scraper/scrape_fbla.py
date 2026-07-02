"""
PodiumPrep — FBLA Data Pipeline
Scrapes roleplay scenarios and rubrics from public FBLA sources.
Run manually or via GitHub Actions on a schedule.

Sources:
  - teachfbla.org         → sample roleplay scenario PDFs
  - fbla.org              → official rating sheets PDF (all rubrics)
  - State chapter sites   → additional practice scenarios
"""

import re
import json
import time
import requests
import fitz  # PyMuPDF
from pathlib import Path
from bs4 import BeautifulSoup
from datetime import datetime

# ── Config ────────────────────────────────────────────────────────────────────

OUTPUT_DIR = Path(__file__).parent / "data"
OUTPUT_DIR.mkdir(exist_ok=True)

HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; PodiumPrep-Bot/1.0)"}

# Known public PDF sources — extend this list as more are discovered
SCENARIO_SOURCES = [
    # teachfbla.org sample role plays
    {
        "url": "https://teachfbla.org/wp-content/uploads/2019/08/Sample-Role-Play-Help-Desk.pdf",
        "event": "Help Desk",
        "year": "2019",
        "source": "teachfbla.org",
    },
    {
        "url": "https://teachfbla.org/wp-content/uploads/2019/08/Sample-Role-Play-Sports-Entertainment-Management.pdf",
        "event": "Sports & Entertainment Management",
        "year": "2019",
        "source": "teachfbla.org",
    },
]

# Official FBLA rubrics PDF (publicly accessible, updated each year)
RUBRIC_SOURCES = [
    {
        "url": "https://www.fbla.org/media/2022/08/2022-23-High-School-Rating-Sheets-All-8.30.22.pdf",
        "year": "2022-23",
        "source": "fbla.org",
    },
]

# State chapter sites to crawl for additional PDFs
STATE_SITES = [
    "https://nebraskafbla.org",
    "https://wafbla.org",
    "https://teachfbla.org",
]

# All roleplay events (used for tagging + UI dropdown)
ROLEPLAY_EVENTS = [
    "Banking & Financial Systems",
    "Business Management",
    "Client Service",
    "Customer Service",
    "Entrepreneurship",
    "Help Desk",
    "Hospitality & Event Management",
    "International Business",
    "Introduction to Event Planning",
    "Marketing",
    "Network Design",
    "Sales Presentation",
    "Sports & Entertainment Management",
]


# ── PDF Parsing ───────────────────────────────────────────────────────────────

def extract_text_from_pdf_url(url: str) -> str:
    """Download a PDF from a URL and extract its text."""
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15)
        resp.raise_for_status()
        doc = fitz.open(stream=resp.content, filetype="pdf")
        text = "\n".join(page.get_text() for page in doc)
        doc.close()
        return text.strip()
    except Exception as e:
        print(f"  ✗ Failed to fetch {url}: {e}")
        return ""


def parse_scenario_from_text(text: str, event: str) -> dict:
    """
    Extract structured fields from raw scenario PDF text.
    Looks for standard FBLA scenario sections.
    """
    scenario = {
        "event": event,
        "background": "",
        "situation": "",
        "tasks": [],
        "performance_indicators": [],
        "role_instructions": "",
        "raw_text": text,
    }

    # Extract background
    bg_match = re.search(r"Background\s*\n(.*?)(?=Situation|Tasks|$)", text, re.DOTALL | re.IGNORECASE)
    if bg_match:
        scenario["background"] = bg_match.group(1).strip()

    # Extract situation
    sit_match = re.search(r"Situation\s*\n(.*?)(?=Tasks|Performance Indicators|$)", text, re.DOTALL | re.IGNORECASE)
    if sit_match:
        scenario["situation"] = sit_match.group(1).strip()

    # Extract tasks
    tasks_match = re.search(r"Tasks?\s*\n(.*?)(?=Performance Indicators|PARTICIPANT|$)", text, re.DOTALL | re.IGNORECASE)
    if tasks_match:
        raw_tasks = tasks_match.group(1).strip()
        scenario["tasks"] = [t.strip() for t in raw_tasks.split("\n") if t.strip()]

    # Extract performance indicators
    pi_match = re.search(r"PERFORMANCE INDICATORS?\s*\n(.*?)(?=CASE STUDY|Background|$)", text, re.DOTALL | re.IGNORECASE)
    if pi_match:
        raw_pis = pi_match.group(1).strip()
        scenario["performance_indicators"] = [
            p.strip("•– ").strip()
            for p in raw_pis.split("\n")
            if p.strip() and len(p.strip()) > 5
        ]

    # Extract participant role instructions
    role_match = re.search(r"You (?:are|will play)(.*?)(?=\n\n|Tasks|$)", text, re.DOTALL | re.IGNORECASE)
    if role_match:
        scenario["role_instructions"] = role_match.group(0).strip()

    return scenario


def parse_rubrics_from_text(text: str) -> dict:
    """
    Parse the FBLA rating sheets PDF into per-event rubric structures.
    Returns a dict keyed by event name.
    """
    rubrics = {}

    # Split by HIGH SCHOOL - [EVENT NAME] headers
    event_sections = re.split(r"HIGH SCHOOL\s*[-–]\s*([A-Z &]+)\n", text)

    # event_sections = [preamble, event1_name, event1_text, event2_name, event2_text, ...]
    for i in range(1, len(event_sections) - 1, 2):
        raw_name = event_sections[i].strip().title()
        section_text = event_sections[i + 1]

        criteria = []

        # Find rating rows: rows with point ranges like "0  1-5  6-10  11-15"
        rows = re.findall(
            r"([A-Z][^\n]{10,80})\n.*?(\d+)\s+(\d+[-–]\d+)\s+(\d+[-–]\d+)\s+(\d+[-–]\d+)",
            section_text,
            re.DOTALL,
        )
        for row in rows:
            criterion_text = row[0].strip()
            # Skip boilerplate table headers
            if any(skip in criterion_text for skip in ["Not\nDemonstrated", "Points", "Tie"]):
                continue
            criteria.append({
                "criterion": criterion_text,
                "not_demonstrated": 0,
                "below_expectations": row[2],
                "meets_expectations": row[3],
                "exceeds_expectations": row[4],
            })

        if criteria:
            rubrics[raw_name] = {
                "event": raw_name,
                "criteria": criteria,
                "raw_section": section_text[:500],  # keep first 500 chars for debugging
            }

    return rubrics


# ── Web Crawler ───────────────────────────────────────────────────────────────

def discover_pdf_links(base_url: str) -> list[str]:
    """
    Crawl a state chapter site to find PDF links that likely contain
    FBLA roleplay scenarios.
    """
    try:
        resp = requests.get(base_url, headers=HEADERS, timeout=10)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")

        pdf_links = []
        for a in soup.find_all("a", href=True):
            href = a["href"]
            text = a.get_text(strip=True).lower()

            # Only grab links that look like roleplay/scenario PDFs
            if href.endswith(".pdf") and any(
                kw in text or kw in href.lower()
                for kw in ["role", "scenario", "case", "sample", "practice", "rating", "rubric"]
            ):
                full_url = href if href.startswith("http") else base_url.rstrip("/") + "/" + href.lstrip("/")
                pdf_links.append(full_url)

        return list(set(pdf_links))
    except Exception as e:
        print(f"  ✗ Could not crawl {base_url}: {e}")
        return []


def detect_event_from_text(text: str) -> str:
    """Try to detect which FBLA event a scenario belongs to."""
    text_lower = text.lower()
    for event in ROLEPLAY_EVENTS:
        if event.lower() in text_lower:
            return event
    return "Unknown"


# ── Main Pipeline ─────────────────────────────────────────────────────────────

def run_pipeline():
    print("\n🚀 PodiumPrep Data Pipeline Starting...")
    print(f"   Timestamp: {datetime.now().isoformat()}\n")

    all_scenarios = []
    all_rubrics = {}

    # ── Step 1: Fetch known scenario PDFs ─────────────────────────────────────
    print("📄 Step 1: Fetching known scenario PDFs...")
    for source in SCENARIO_SOURCES:
        print(f"  → {source['event']} ({source['year']})")
        text = extract_text_from_pdf_url(source["url"])
        if text:
            scenario = parse_scenario_from_text(text, source["event"])
            scenario["year"] = source["year"]
            scenario["source_url"] = source["url"]
            scenario["scraped_at"] = datetime.now().isoformat()
            all_scenarios.append(scenario)
            print(f"    ✓ Parsed scenario ({len(text)} chars)")
        time.sleep(1)  # be polite

    # ── Step 2: Crawl state sites for more PDFs ────────────────────────────────
    print("\n🌐 Step 2: Crawling state chapter sites...")
    for site in STATE_SITES:
        print(f"  → {site}")
        links = discover_pdf_links(site)
        print(f"    Found {len(links)} roleplay-related PDFs")
        for link in links[:5]:  # cap at 5 per site to avoid hammering
            # Skip if we already have this URL
            if any(s["source_url"] == link for s in all_scenarios):
                continue
            text = extract_text_from_pdf_url(link)
            if text and len(text) > 200:
                event = detect_event_from_text(text)
                scenario = parse_scenario_from_text(text, event)
                scenario["year"] = "unknown"
                scenario["source_url"] = link
                scenario["scraped_at"] = datetime.now().isoformat()
                all_scenarios.append(scenario)
                print(f"    ✓ {event} — {link.split('/')[-1]}")
            time.sleep(1)

    # ── Step 3: Fetch and parse rubrics ───────────────────────────────────────
    print("\n📊 Step 3: Fetching rubrics...")
    for source in RUBRIC_SOURCES:
        print(f"  → {source['year']} rating sheets")
        text = extract_text_from_pdf_url(source["url"])
        if text:
            rubrics = parse_rubrics_from_text(text)
            for event, rubric in rubrics.items():
                rubric["year"] = source["year"]
                rubric["source_url"] = source["url"]
                all_rubrics[event] = rubric
            print(f"    ✓ Parsed {len(rubrics)} event rubrics")

    # ── Step 4: Save to JSON ───────────────────────────────────────────────────
    print("\n💾 Step 4: Saving data...")

    scenarios_path = OUTPUT_DIR / "scenarios.json"
    with open(scenarios_path, "w") as f:
        json.dump(all_scenarios, f, indent=2)
    print(f"  ✓ {len(all_scenarios)} scenarios → {scenarios_path}")

    rubrics_path = OUTPUT_DIR / "rubrics.json"
    with open(rubrics_path, "w") as f:
        json.dump(all_rubrics, f, indent=2)
    print(f"  ✓ {len(all_rubrics)} rubrics → {rubrics_path}")

    # Summary manifest
    manifest = {
        "last_updated": datetime.now().isoformat(),
        "scenario_count": len(all_scenarios),
        "rubric_count": len(all_rubrics),
        "events_with_scenarios": list({s["event"] for s in all_scenarios}),
        "events_with_rubrics": list(all_rubrics.keys()),
    }
    with open(OUTPUT_DIR / "manifest.json", "w") as f:
        json.dump(manifest, f, indent=2)

    print(f"\n✅ Pipeline complete!")
    print(f"   {len(all_scenarios)} scenarios, {len(all_rubrics)} rubrics")
    return manifest


if __name__ == "__main__":
    run_pipeline()
