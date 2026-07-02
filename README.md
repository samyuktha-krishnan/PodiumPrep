# 🎤 PodiumPrep
**AI-powered FBLA roleplay coach** — practice competitive events with an AI judge, get scored against official rubrics, and receive targeted coaching.

## What it does
1. **Pick your event** — Business Management, Help Desk, Entrepreneurship, and more
2. **Read the scenario** — real FBLA-sourced case studies with a 10-minute prep timer
3. **Roleplay with an AI judge** — the AI plays your examiner in real time
4. **Get scored** — criterion-by-criterion breakdown against the official FBLA rubric
5. **Receive coaching** — specific, actionable feedback on what to improve

## Tech Stack
| Layer | Tech |
|---|---|
| Frontend | React + Vite |
| Backend | Python + FastAPI |
| AI scoring & judge | Claude API (claude-sonnet-4-6) |
| Speech-to-text | OpenAI Whisper *(coming in Phase 3)* |
| Data pipeline | Playwright + PyMuPDF + BeautifulSoup |
| Database | Firebase Firestore *(migration from JSON in Phase 2)* |
| Auto-updates | GitHub Actions (monthly cron) |
| Deploy | Vercel (frontend) + Railway (backend) |

## Project Structure
```
podiumprep/
├── scraper/
│   ├── scrape_fbla.py        # Main data pipeline
│   └── data/
│       ├── scenarios.json    # Scraped roleplay scenarios
│       ├── rubrics.json      # Official FBLA rubrics
│       └── manifest.json     # Last updated, counts
├── backend/
│   ├── main.py               # FastAPI server
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── App.jsx           # Full React app
│   │   └── main.jsx
│   ├── index.html
│   └── package.json
└── .github/
    └── workflows/
        └── update-data.yml   # Monthly auto-scrape
```

## Local Setup

### 1. Clone and install
```bash
git clone https://github.com/yourusername/podiumprep
cd podiumprep
```

### 2. Backend
```bash
cd backend
pip install -r requirements.txt
python -m playwright install chromium

export ANTHROPIC_API_KEY=your_key_here
uvicorn main:app --reload
# Server runs at http://localhost:8000
```

### 3. Frontend
```bash
cd frontend
npm install
npm run dev
# App runs at http://localhost:5173
```

### 4. Run the scraper
```bash
cd scraper
python scrape_fbla.py
```

## GitHub Actions (auto-updates)
The workflow in `.github/workflows/update-data.yml` runs the scraper on the 1st of every month and commits updated scenario/rubric data automatically.

No config needed — it uses the built-in `GITHUB_TOKEN`.

## Roadmap
- [x] Phase 1 — Data pipeline + seeded scenarios/rubrics
- [x] Phase 2 — Core app (event select, scenario view, AI judge, scoring)
- [ ] Phase 3 — Voice mode (Whisper transcription, filler word detection, live pace indicator)
- [ ] Phase 4 — Firebase migration, user accounts, session history, progress charts
- [ ] Phase 5 — Deploy to Vercel + Railway, custom domain

## Adding more scenarios
To add a new source, append to `SCENARIO_SOURCES` in `scraper/scrape_fbla.py`:
```python
{
    "url": "https://example.com/path/to/scenario.pdf",
    "event": "Marketing",
    "year": "2024",
    "source": "example.com",
}
```
Then run `python scrape_fbla.py`.
