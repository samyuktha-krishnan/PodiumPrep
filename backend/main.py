"""
PodiumPrep — FastAPI Backend
Serves scenarios, rubrics, and AI-powered scoring/coaching via Claude.
"""

import json
import random
import os
from pathlib import Path
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import anthropic

# ── Load environment variables from .env ──────────────────────────────────────
load_dotenv()

api_key = os.environ.get("ANTHROPIC_API_KEY")
if not api_key:
    raise RuntimeError("ANTHROPIC_API_KEY is not set. Copy backend/.env.example to backend/.env and add your key.")

# ── Rate limiter setup ────────────────────────────────────────────────────────
# Uses the requester's IP address as the key
limiter = Limiter(key_func=get_remote_address)

app = FastAPI(title="PodiumPrep API", version="1.0.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "https://podiumprep.app"],
    allow_methods=["*"],
    allow_headers=["*"],
)

DATA_DIR = Path(__file__).parent.parent / "scraper" / "data"
client = anthropic.Anthropic(api_key=api_key)


# ── Data Loading ──────────────────────────────────────────────────────────────

def load_scenarios() -> list[dict]:
    path = DATA_DIR / "scenarios.json"
    if not path.exists():
        return []
    return json.loads(path.read_text())

def load_rubrics() -> dict:
    path = DATA_DIR / "rubrics.json"
    if not path.exists():
        return {}
    return json.loads(path.read_text())


# ── Request/Response Models ───────────────────────────────────────────────────

class ScoreRequest(BaseModel):
    event: str
    scenario: dict
    transcript: str
    duration_seconds: int

class JudgeMessageRequest(BaseModel):
    event: str
    scenario: dict
    conversation_history: list[dict]
    user_message: str


# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/events")
@limiter.limit("60/minute")
def get_events(request: Request):
    """Return all unique events that have at least one scenario."""
    scenarios = load_scenarios()
    events = sorted({s["event"] for s in scenarios})
    return {"events": events}

@app.get("/scenario/{event}")
@limiter.limit("30/minute")
def get_scenario(request: Request, event: str, year: str = None):
    """Return a random scenario for the given event."""
    scenarios = load_scenarios()
    matches = [s for s in scenarios if s["event"].lower() == event.lower()]
    if year:
        matches = [s for s in matches if s.get("year") == year]
    if not matches:
        raise HTTPException(status_code=404, detail=f"No scenarios found for event: {event}")
    return random.choice(matches)

@app.get("/rubric/{event}")
@limiter.limit("30/minute")
def get_rubric(request: Request, event: str):
    """Return the scoring rubric for a given event."""
    rubrics = load_rubrics()
    rubric = rubrics.get(event) or next(
        (r for k, r in rubrics.items() if k.lower() == event.lower()), None
    )
    if not rubric:
        raise HTTPException(status_code=404, detail=f"No rubric found for event: {event}")
    return rubric

@app.post("/judge/message")
@limiter.limit("30/minute")        # max 30 judge messages per minute per IP
def judge_message(request: Request, req: JudgeMessageRequest):
    """Returns the AI judge's next message in the roleplay conversation."""
    system_prompt = f"""You are a FBLA competition judge running a roleplay for the {req.event} event.

Scenario context:
{json.dumps(req.scenario, indent=2)}

Your role:
- Play the examiner/customer/client described in this scenario
- Be realistic: ask follow-up questions, push back on weak answers, react to what the competitor says
- Keep responses concise (2-4 sentences) — this is a live roleplay, not an essay
- Don't break character or give hints
- If this is the first message, introduce yourself and present the scenario situation naturally
- After 4-5 exchanges, you can wrap up by saying "Thank you, that concludes our roleplay."

Stay in character throughout."""

    messages = req.conversation_history + [{"role": "user", "content": req.user_message}]

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=300,
        system=system_prompt,
        messages=messages,
    )
    return {"message": response.content[0].text}

@app.post("/score")
@limiter.limit("5/minute; 20/hour")   # scoring is expensive — strict limit
def score_roleplay(request: Request, req: ScoreRequest):
    """Score a completed roleplay against the official FBLA rubric."""
    rubrics = load_rubrics()
    rubric = rubrics.get(req.event) or next(
        (r for k, r in rubrics.items() if k.lower() == req.event.lower()), None
    )
    if not rubric:
        raise HTTPException(status_code=404, detail=f"No rubric found for: {req.event}")

    criteria_text = "\n".join(
        f"- {c['criterion']} (max {c['max_points']} pts)"
        for c in rubric["criteria"]
    )

    prompt = f"""You are an expert FBLA judge scoring a competitor's roleplay for the {req.event} event.

SCENARIO:
{json.dumps(req.scenario, indent=2)}

OFFICIAL RUBRIC CRITERIA:
{criteria_text}

COMPETITOR'S RESPONSE (transcript):
{req.transcript}

DURATION: {req.duration_seconds} seconds

Please evaluate the competitor and respond with a JSON object in this exact format:
{{
  "total_score": <number out of 100>,
  "criteria_scores": [
    {{
      "criterion": "<criterion text>",
      "score": <points earned>,
      "max_points": <max points>,
      "feedback": "<1-2 sentences: what they did well or poorly on this criterion>"
    }}
  ],
  "strengths": ["<strength 1>", "<strength 2>", "<strength 3>"],
  "areas_for_improvement": ["<area 1>", "<area 2>", "<area 3>"],
  "overall_coaching": "<2-3 sentences of the most important coaching advice>",
  "filler_word_count": <estimated count of um/uh/like from transcript>,
  "pacing_feedback": "<brief comment on speaking pace and confidence>"
}}

Be honest but constructive. Base scores strictly on the rubric criteria."""

    response = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1500,
        messages=[{"role": "user", "content": prompt}],
    )

    raw = response.content[0].text
    clean = raw.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()

    try:
        result = json.loads(clean)
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="Failed to parse AI scoring response")

    return result

@app.get("/health")
def health():
    scenarios = load_scenarios()
    rubrics = load_rubrics()
    return {
        "status": "ok",
        "scenarios_loaded": len(scenarios),
        "rubrics_loaded": len(rubrics),
    }
