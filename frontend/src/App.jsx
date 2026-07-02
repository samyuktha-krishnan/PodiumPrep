import { useState, useEffect, useRef } from "react";

// ── Design tokens ─────────────────────────────────────────────────────────────
// Deep navy + electric blue + warm white — feels like a competition stage
// Display: "Syne" (geometric, confident), Body: "Inter"

const API = "http://localhost:8000";

// ── Screens ───────────────────────────────────────────────────────────────────
// 1. EventSelect  → pick your event
// 2. ScenarioView → read the scenario (10 min timer)
// 3. Roleplay     → chat with AI judge (5 min timer)
// 4. Results      → score + coaching breakdown

export default function App() {
  const [screen, setScreen] = useState("select");
  const [events, setEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [scenario, setScenario] = useState(null);
  const [rubric, setRubric] = useState(null);
  const [transcript, setTranscript] = useState("");
  const [duration, setDuration] = useState(0);
  const [results, setResults] = useState(null);

  useEffect(() => {
    fetch(`${API}/events`)
      .then((r) => r.json())
      .then((d) => setEvents(d.events))
      .catch(() =>
        setEvents([
          "Help Desk",
          "Sports & Entertainment Management",
          "Entrepreneurship",
        ])
      );
  }, []);

  const startEvent = async (event) => {
    setSelectedEvent(event);
    const [scenRes, rubRes] = await Promise.all([
      fetch(`${API}/scenario/${encodeURIComponent(event)}`).then((r) => r.json()),
      fetch(`${API}/rubric/${encodeURIComponent(event)}`).then((r) => r.json()),
    ]);
    setScenario(scenRes);
    setRubric(rubRes);
    setScreen("scenario");
  };

  const finishRoleplay = (fullTranscript, durationSecs) => {
    setTranscript(fullTranscript);
    setDuration(durationSecs);
    setScreen("scoring");
    scoreRoleplay(fullTranscript, durationSecs);
  };

  const scoreRoleplay = async (tx, dur) => {
    const res = await fetch(`${API}/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event: selectedEvent,
        scenario,
        transcript: tx,
        duration_seconds: dur,
      }),
    });
    const data = await res.json();
    setResults(data);
    setScreen("results");
  };

  return (
    <div style={styles.shell}>
      <style>{globalCss}</style>
      {screen === "select" && (
        <EventSelect events={events} onSelect={startEvent} />
      )}
      {screen === "scenario" && (
        <ScenarioView
          scenario={scenario}
          event={selectedEvent}
          onReady={() => setScreen("roleplay")}
        />
      )}
      {screen === "roleplay" && (
        <RoleplayChat
          event={selectedEvent}
          scenario={scenario}
          onFinish={finishRoleplay}
        />
      )}
      {screen === "scoring" && <ScoringScreen />}
      {screen === "results" && results && (
        <Results
          results={results}
          event={selectedEvent}
          onRetry={() => {
            setScreen("scenario");
            setResults(null);
          }}
          onNewEvent={() => setScreen("select")}
        />
      )}
    </div>
  );
}

// ── Event Select ──────────────────────────────────────────────────────────────
function EventSelect({ events, onSelect }) {
  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <div style={styles.logo}>🎤 PodiumPrep</div>
        <p style={styles.tagline}>FBLA roleplay practice, powered by AI</p>
      </header>

      <div style={styles.eventGrid}>
        <h2 style={styles.sectionTitle}>Choose your event</h2>
        <div style={styles.grid}>
          {events.map((e) => (
            <button key={e} style={styles.eventCard} onClick={() => onSelect(e)}
              onMouseEnter={(el) => (el.currentTarget.style.borderColor = "#4F8EF7")}
              onMouseLeave={(el) => (el.currentTarget.style.borderColor = "#2a2a4a")}>
              <span style={styles.eventIcon}>{eventIcon(e)}</span>
              <span style={styles.eventName}>{e}</span>
              <span style={styles.eventArrow}>→</span>
            </button>
          ))}
        </div>
        <p style={styles.hint}>
          Scenarios sourced from official FBLA published materials · Rubrics updated monthly
        </p>
      </div>
    </div>
  );
}

// ── Scenario View ─────────────────────────────────────────────────────────────
function ScenarioView({ scenario, event, onReady }) {
  const [timeLeft, setTimeLeft] = useState(10 * 60);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    if (!started) return;
    if (timeLeft <= 0) { onReady(); return; }
    const t = setTimeout(() => setTimeLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [started, timeLeft]);

  const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div style={styles.page}>
      <div style={styles.scenarioContainer}>
        <div style={styles.scenarioHeader}>
          <div>
            <div style={styles.eventBadge}>{event}</div>
            <h1 style={styles.scenarioTitle}>Read your scenario</h1>
          </div>
          {started && (
            <div style={{ ...styles.timer, color: timeLeft < 60 ? "#f97316" : "#4F8EF7" }}>
              {fmt(timeLeft)}
            </div>
          )}
        </div>

        <div style={styles.scenarioCard}>
          {scenario?.background && (
            <section style={styles.scenarioSection}>
              <h3 style={styles.scenarioSectionTitle}>Background</h3>
              <p style={styles.scenarioText}>{scenario.background}</p>
            </section>
          )}
          {scenario?.situation && (
            <section style={styles.scenarioSection}>
              <h3 style={styles.scenarioSectionTitle}>Situation</h3>
              <p style={styles.scenarioText}>{scenario.situation}</p>
            </section>
          )}
          {scenario?.tasks?.length > 0 && (
            <section style={styles.scenarioSection}>
              <h3 style={styles.scenarioSectionTitle}>Your Tasks</h3>
              <ul style={styles.taskList}>
                {scenario.tasks.map((t, i) => (
                  <li key={i} style={styles.taskItem}>{t}</li>
                ))}
              </ul>
            </section>
          )}
          {scenario?.performance_indicators?.length > 0 && (
            <section style={styles.scenarioSection}>
              <h3 style={styles.scenarioSectionTitle}>Performance Indicators</h3>
              <ul style={styles.piList}>
                {scenario.performance_indicators.map((pi, i) => (
                  <li key={i} style={styles.piItem}>{pi}</li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div style={styles.scenarioFooter}>
          <p style={styles.hint}>You have 10 minutes to review · 5 minutes to present</p>
          {!started ? (
            <button style={styles.primaryBtn} onClick={() => setStarted(true)}>
              Start prep timer →
            </button>
          ) : (
            <button style={styles.primaryBtn} onClick={onReady}>
              I'm ready to present →
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Roleplay Chat ─────────────────────────────────────────────────────────────
function RoleplayChat({ event, scenario, onFinish }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [timeLeft, setTimeLeft] = useState(5 * 60);
  const [started, setStarted] = useState(false);
  const startTime = useRef(null);
  const bottomRef = useRef(null);

  useEffect(() => {
    if (!started) return;
    if (timeLeft <= 0) { handleFinish(); return; }
    const t = setTimeout(() => setTimeLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [started, timeLeft]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const startRoleplay = async () => {
    setStarted(true);
    startTime.current = Date.now();
    setLoading(true);
    const res = await fetch(`${API}/judge/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event,
        scenario,
        conversation_history: [],
        user_message: "[START ROLEPLAY - introduce yourself and the scenario]",
      }),
    });
    const data = await res.json();
    setMessages([{ role: "judge", content: data.message }]);
    setLoading(false);
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    const newHistory = [...messages, { role: "user", content: userMsg }];
    setMessages(newHistory);
    setLoading(true);

    const apiHistory = newHistory.map((m) => ({
      role: m.role === "judge" ? "assistant" : "user",
      content: m.content,
    }));

    const res = await fetch(`${API}/judge/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event,
        scenario,
        conversation_history: apiHistory.slice(0, -1),
        user_message: userMsg,
      }),
    });
    const data = await res.json();
    setMessages([...newHistory, { role: "judge", content: data.message }]);
    setLoading(false);
  };

  const handleFinish = () => {
    const dur = Math.round((Date.now() - startTime.current) / 1000);
    const tx = messages
      .map((m) => `${m.role === "judge" ? "Judge" : "Competitor"}: ${m.content}`)
      .join("\n\n");
    onFinish(tx, dur);
  };

  const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div style={styles.chatShell}>
      <div style={styles.chatHeader}>
        <div>
          <span style={styles.eventBadge}>{event}</span>
          <span style={styles.chatSubtitle}> · Live Roleplay</span>
        </div>
        {started && (
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ ...styles.timer, color: timeLeft < 60 ? "#f97316" : "#4F8EF7" }}>
              {fmt(timeLeft)}
            </div>
            <button style={styles.endBtn} onClick={handleFinish}>
              End & Score
            </button>
          </div>
        )}
      </div>

      <div style={styles.chatMessages}>
        {!started && (
          <div style={styles.startPrompt}>
            <div style={styles.startIcon}>🎭</div>
            <h2 style={styles.startTitle}>Ready to present?</h2>
            <p style={styles.startDesc}>
              The AI judge will introduce the scenario and play your examiner.
              Respond naturally — as you would in a real FBLA competition.
            </p>
            <button style={styles.primaryBtn} onClick={startRoleplay}>
              Begin roleplay →
            </button>
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} style={m.role === "judge" ? styles.judgeMessage : styles.userMessage}>
            <div style={styles.messageLabel}>
              {m.role === "judge" ? "🧑‍⚖️ Judge" : "You"}
            </div>
            <div style={m.role === "judge" ? styles.judgeBubble : styles.userBubble}>
              {m.content}
            </div>
          </div>
        ))}

        {loading && (
          <div style={styles.judgeMessage}>
            <div style={styles.messageLabel}>🧑‍⚖️ Judge</div>
            <div style={styles.judgeBubble}>
              <span style={styles.typing}>● ● ●</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {started && (
        <div style={styles.chatInputRow}>
          <textarea
            style={styles.chatInput}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder="Type your response... (Enter to send)"
            rows={3}
          />
          <button style={styles.sendBtn} onClick={sendMessage} disabled={loading}>
            Send →
          </button>
        </div>
      )}
    </div>
  );
}

// ── Scoring Screen ────────────────────────────────────────────────────────────
function ScoringScreen() {
  return (
    <div style={{ ...styles.page, justifyContent: "center", alignItems: "center" }}>
      <div style={styles.scoringCard}>
        <div style={styles.scoringSpinner}>⚖️</div>
        <h2 style={styles.scoringTitle}>Scoring your roleplay...</h2>
        <p style={styles.hint}>Evaluating against the official FBLA rubric</p>
      </div>
    </div>
  );
}

// ── Results ───────────────────────────────────────────────────────────────────
function Results({ results, event, onRetry, onNewEvent }) {
  const score = results.total_score;
  const color = score >= 80 ? "#22c55e" : score >= 60 ? "#4F8EF7" : "#f97316";

  return (
    <div style={styles.page}>
      <div style={styles.resultsContainer}>
        <div style={styles.resultsHeader}>
          <div style={styles.eventBadge}>{event}</div>
          <h1 style={styles.resultsTitle}>Your Score</h1>
          <div style={{ ...styles.scoreBig, color }}>{score}<span style={styles.scoreMax}>/100</span></div>
        </div>

        {results.overall_coaching && (
          <div style={styles.coachingCard}>
            <h3 style={styles.coachingTitle}>💡 Key coaching</h3>
            <p style={styles.coachingText}>{results.overall_coaching}</p>
          </div>
        )}

        <div style={styles.twoCol}>
          <div style={styles.strengthsCard}>
            <h3 style={styles.cardTitle}>✅ Strengths</h3>
            {results.strengths?.map((s, i) => <p key={i} style={styles.listItem}>• {s}</p>)}
          </div>
          <div style={styles.improvCard}>
            <h3 style={styles.cardTitle}>📈 Improve on</h3>
            {results.areas_for_improvement?.map((s, i) => <p key={i} style={styles.listItem}>• {s}</p>)}
          </div>
        </div>

        <div style={styles.criteriaSection}>
          <h3 style={styles.sectionTitle}>Criterion-by-criterion breakdown</h3>
          {results.criteria_scores?.map((c, i) => (
            <div key={i} style={styles.criterionRow}>
              <div style={styles.criterionHeader}>
                <span style={styles.criterionText}>{c.criterion}</span>
                <span style={{ ...styles.criterionScore, color: c.score / c.max_points >= 0.8 ? "#22c55e" : c.score / c.max_points >= 0.6 ? "#4F8EF7" : "#f97316" }}>
                  {c.score}/{c.max_points}
                </span>
              </div>
              <div style={styles.barTrack}>
                <div style={{ ...styles.barFill, width: `${(c.score / c.max_points) * 100}%`, background: c.score / c.max_points >= 0.8 ? "#22c55e" : c.score / c.max_points >= 0.6 ? "#4F8EF7" : "#f97316" }} />
              </div>
              <p style={styles.criterionFeedback}>{c.feedback}</p>
            </div>
          ))}
        </div>

        {results.pacing_feedback && (
          <div style={styles.pacingCard}>
            <span style={styles.pacingLabel}>🎙 Delivery</span>
            <p style={styles.pacingText}>{results.pacing_feedback}</p>
            {results.filler_word_count > 0 && (
              <p style={styles.fillerCount}>Filler words detected: ~{results.filler_word_count}</p>
            )}
          </div>
        )}

        <div style={styles.resultsActions}>
          <button style={styles.secondaryBtn} onClick={onRetry}>Try again →</button>
          <button style={styles.primaryBtn} onClick={onNewEvent}>New event →</button>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function eventIcon(event) {
  const map = {
    "Help Desk": "💻", "Entrepreneurship": "🚀",
    "Sports & Entertainment Management": "🏟️",
    "Marketing": "📣", "Business Management": "📊",
    "International Business": "🌐", "Banking & Financial Systems": "🏦",
    "Sales Presentation": "🤝", "Customer Service": "⭐",
  };
  return map[event] || "📋";
}

// ── Styles ────────────────────────────────────────────────────────────────────
const globalCss = `
  @import url('https://fonts.googleapis.com/css2?family=Syne:wght@600;700;800&family=Inter:wght@400;500;600&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: #0d0d1a; color: #e8e8f0; font-family: 'Inter', sans-serif; }
  textarea:focus, button:focus { outline: 2px solid #4F8EF7; outline-offset: 2px; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
  @keyframes spin { to { transform: rotate(360deg); } }
`;

const styles = {
  shell: { minHeight: "100vh", background: "#0d0d1a" },
  page: { maxWidth: 860, margin: "0 auto", padding: "40px 24px" },

  // Header
  header: { textAlign: "center", marginBottom: 48, paddingTop: 24 },
  logo: { fontFamily: "Syne, sans-serif", fontSize: 32, fontWeight: 800, color: "#fff", letterSpacing: -1 },
  tagline: { color: "#8888aa", marginTop: 8, fontSize: 16 },

  // Event grid
  eventGrid: {},
  sectionTitle: { fontFamily: "Syne, sans-serif", fontSize: 20, fontWeight: 700, color: "#fff", marginBottom: 20 },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 },
  eventCard: {
    display: "flex", alignItems: "center", gap: 12,
    background: "#13132a", border: "1px solid #2a2a4a",
    borderRadius: 12, padding: "16px 20px", cursor: "pointer",
    transition: "border-color 0.15s, background 0.15s",
    color: "#e8e8f0", textAlign: "left",
  },
  eventIcon: { fontSize: 22, flexShrink: 0 },
  eventName: { flex: 1, fontSize: 15, fontWeight: 500, fontFamily: "Inter, sans-serif" },
  eventArrow: { color: "#4a4a7a", fontSize: 18 },
  hint: { color: "#555577", fontSize: 13, marginTop: 20 },

  // Scenario
  scenarioContainer: { maxWidth: 720, margin: "0 auto" },
  scenarioHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 },
  eventBadge: { background: "#1a1a3a", border: "1px solid #3a3a6a", borderRadius: 6, padding: "4px 12px", fontSize: 13, color: "#8888cc", fontWeight: 500 },
  scenarioTitle: { fontFamily: "Syne, sans-serif", fontSize: 26, fontWeight: 700, color: "#fff", marginTop: 8 },
  timer: { fontFamily: "Syne, sans-serif", fontSize: 36, fontWeight: 800, letterSpacing: -2, transition: "color 0.5s" },
  scenarioCard: { background: "#13132a", border: "1px solid #2a2a4a", borderRadius: 16, padding: 32, marginBottom: 24 },
  scenarioSection: { marginBottom: 28 },
  scenarioSectionTitle: { fontSize: 12, fontWeight: 600, color: "#4F8EF7", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 },
  scenarioText: { color: "#c8c8e0", lineHeight: 1.7, fontSize: 15 },
  taskList: { paddingLeft: 20 },
  taskItem: { color: "#c8c8e0", lineHeight: 1.7, fontSize: 15, marginBottom: 8 },
  piList: { listStyle: "none", paddingLeft: 0 },
  piItem: { color: "#9898b8", fontSize: 14, lineHeight: 1.6, marginBottom: 6, paddingLeft: 16, position: "relative" },
  scenarioFooter: { textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 12 },

  // Buttons
  primaryBtn: {
    background: "#4F8EF7", color: "#fff", border: "none",
    borderRadius: 10, padding: "14px 28px", fontSize: 15, fontWeight: 600,
    cursor: "pointer", transition: "opacity 0.15s",
  },
  secondaryBtn: {
    background: "transparent", color: "#8888cc", border: "1px solid #2a2a4a",
    borderRadius: 10, padding: "14px 28px", fontSize: 15, fontWeight: 600,
    cursor: "pointer",
  },
  endBtn: {
    background: "#1a1a3a", color: "#f97316", border: "1px solid #f97316",
    borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer",
  },

  // Chat
  chatShell: { display: "flex", flexDirection: "column", height: "100vh", maxWidth: 760, margin: "0 auto" },
  chatHeader: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "20px 24px", borderBottom: "1px solid #2a2a4a", flexShrink: 0 },
  chatSubtitle: { color: "#8888aa", fontSize: 14 },
  chatMessages: { flex: 1, overflowY: "auto", padding: "24px", display: "flex", flexDirection: "column", gap: 20 },
  startPrompt: { margin: "auto", textAlign: "center", maxWidth: 400, display: "flex", flexDirection: "column", alignItems: "center", gap: 16 },
  startIcon: { fontSize: 48 },
  startTitle: { fontFamily: "Syne, sans-serif", fontSize: 24, fontWeight: 700, color: "#fff" },
  startDesc: { color: "#8888aa", lineHeight: 1.6, fontSize: 15 },
  judgeMessage: { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6, maxWidth: "80%" },
  userMessage: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, maxWidth: "80%", alignSelf: "flex-end" },
  messageLabel: { fontSize: 12, color: "#555577", fontWeight: 600 },
  judgeBubble: { background: "#13132a", border: "1px solid #2a2a4a", borderRadius: "4px 16px 16px 16px", padding: "12px 16px", color: "#c8c8e0", fontSize: 15, lineHeight: 1.6 },
  userBubble: { background: "#1a2a5a", border: "1px solid #3a4a9a", borderRadius: "16px 4px 16px 16px", padding: "12px 16px", color: "#e8e8f0", fontSize: 15, lineHeight: 1.6 },
  typing: { color: "#4F8EF7", animation: "pulse 1.2s ease-in-out infinite", letterSpacing: 4 },
  chatInputRow: { display: "flex", gap: 12, padding: "16px 24px", borderTop: "1px solid #2a2a4a", flexShrink: 0 },
  chatInput: { flex: 1, background: "#13132a", border: "1px solid #2a2a4a", borderRadius: 10, padding: "12px 16px", color: "#e8e8f0", fontSize: 15, resize: "none", fontFamily: "Inter, sans-serif" },
  sendBtn: { background: "#4F8EF7", color: "#fff", border: "none", borderRadius: 10, padding: "0 20px", fontSize: 15, fontWeight: 600, cursor: "pointer", alignSelf: "flex-end", height: 44 },

  // Scoring
  scoringCard: { textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 16 },
  scoringSpinner: { fontSize: 48, animation: "spin 2s linear infinite" },
  scoringTitle: { fontFamily: "Syne, sans-serif", fontSize: 24, fontWeight: 700, color: "#fff" },

  // Results
  resultsContainer: { maxWidth: 720, margin: "0 auto" },
  resultsHeader: { textAlign: "center", marginBottom: 32 },
  resultsTitle: { fontFamily: "Syne, sans-serif", fontSize: 28, fontWeight: 800, color: "#fff", marginTop: 12, marginBottom: 8 },
  scoreBig: { fontFamily: "Syne, sans-serif", fontSize: 72, fontWeight: 800, letterSpacing: -4, lineHeight: 1 },
  scoreMax: { fontSize: 28, color: "#555577", fontWeight: 600 },
  coachingCard: { background: "#13132a", border: "1px solid #2a3a5a", borderLeft: "4px solid #4F8EF7", borderRadius: 12, padding: 24, marginBottom: 24 },
  coachingTitle: { fontSize: 14, fontWeight: 600, color: "#4F8EF7", marginBottom: 10 },
  coachingText: { color: "#c8c8e0", lineHeight: 1.7, fontSize: 15 },
  twoCol: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 32 },
  strengthsCard: { background: "#0d2a1a", border: "1px solid #1a4a2a", borderRadius: 12, padding: 20 },
  improvCard: { background: "#2a1a0d", border: "1px solid #4a2a1a", borderRadius: 12, padding: 20 },
  cardTitle: { fontSize: 14, fontWeight: 600, color: "#fff", marginBottom: 12 },
  listItem: { color: "#c8c8e0", fontSize: 14, lineHeight: 1.6, marginBottom: 8 },
  criteriaSection: { marginBottom: 32 },
  criterionRow: { background: "#13132a", border: "1px solid #2a2a4a", borderRadius: 10, padding: 16, marginBottom: 12 },
  criterionHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 },
  criterionText: { color: "#c8c8e0", fontSize: 14, fontWeight: 500, flex: 1, paddingRight: 16 },
  criterionScore: { fontFamily: "Syne, sans-serif", fontSize: 18, fontWeight: 700, flexShrink: 0 },
  barTrack: { height: 6, background: "#2a2a4a", borderRadius: 3, marginBottom: 10, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: 3, transition: "width 0.6s ease" },
  criterionFeedback: { color: "#8888aa", fontSize: 13, lineHeight: 1.5 },
  pacingCard: { background: "#1a1a2a", border: "1px solid #2a2a4a", borderRadius: 12, padding: 20, marginBottom: 32 },
  pacingLabel: { fontSize: 12, fontWeight: 600, color: "#8888aa", textTransform: "uppercase", letterSpacing: 1 },
  pacingText: { color: "#c8c8e0", fontSize: 14, lineHeight: 1.6, marginTop: 8 },
  fillerCount: { color: "#f97316", fontSize: 13, marginTop: 6 },
  resultsActions: { display: "flex", gap: 12, justifyContent: "center" },
};
