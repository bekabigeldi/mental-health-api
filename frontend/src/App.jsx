import { useEffect, useState } from "react";
import {
  BrowserRouter,
  Link,
  NavLink,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
const SESSION_KEY = "mental-health-session";
const ADMIN_SESSION_KEY = "mental-health-admin-session";

const authFormDefaults = { email: "", password: "" };
const moodDefaults = { mood: 6, stress: 5, sleep: 7, energy: 6, note: "" };
const phqQuestions = [
  "Little interest or pleasure in doing things",
  "Feeling down, depressed, or hopeless",
  "Trouble falling or staying asleep, or sleeping too much",
  "Feeling tired or having little energy",
  "Poor appetite or overeating",
  "Feeling bad about yourself",
  "Trouble concentrating",
  "Moving or speaking noticeably slower or faster",
  "Thoughts that life feels heavy or hard to carry",
];
const gadQuestions = [
  "Feeling nervous or anxious",
  "Not being able to stop worrying",
  "Worrying too much about different things",
  "Trouble relaxing",
  "Being so restless that it is hard to sit still",
  "Becoming easily annoyed or irritable",
  "Feeling afraid as if something awful might happen",
];
const navItems = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/check-in", label: "Check-In" },
  { to: "/risk-result", label: "Risk Result" },
  { to: "/insights", label: "Insights" },
  { to: "/history", label: "History" },
  { to: "/wellness", label: "Wellness" },
  { to: "/settings", label: "Settings" },
];

function getStoredSession() {
  const raw = localStorage.getItem(SESSION_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

function saveSession(session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function getStoredAdminSession() {
  const raw = localStorage.getItem(ADMIN_SESSION_KEY);
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    localStorage.removeItem(ADMIN_SESSION_KEY);
    return null;
  }
}

function saveAdminSession(session) {
  localStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session));
}

function clearAdminSession() {
  localStorage.removeItem(ADMIN_SESSION_KEY);
}

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.detail || "Request failed");
  }
  return payload;
}

function formatDate(value) {
  if (!value) {
    return "No data yet";
  }
  return new Date(value).toLocaleString();
}

function normalizePercent(value) {
  return Math.max(0, Math.min(100, Math.round((value || 0) * 100)));
}

function averageValue(items, accessor, digits = 1) {
  if (!items?.length) {
    return 0;
  }

  const total = items.reduce((sum, item) => sum + (Number(accessor(item)) || 0), 0);
  return Number((total / items.length).toFixed(digits));
}

function buildAdminMiniStats(adminDetail) {
  if (!adminDetail) {
    return null;
  }

  const history = adminDetail.history || [];
  const assessments = adminDetail.assessments || [];
  const alerts = adminDetail.alerts || [];
  const feedback = adminDetail.feedback || [];
  const recentHistory = history.slice(0, 7);
  const recentAssessments = assessments.slice(0, 7);
  const chronologicalHistory = [...history].reverse();
  const firstMood = chronologicalHistory[0]?.mood || 0;
  const lastMood = chronologicalHistory.at(-1)?.mood || 0;

  return {
    moodAverage: averageValue(recentHistory, (item) => item.mood, 1),
    stressAverage: averageValue(recentHistory, (item) => item.stress, 1),
    sleepAverage: averageValue(recentHistory, (item) => item.sleep, 1),
    energyAverage: averageValue(recentHistory, (item) => item.energy, 1),
    riskAverage: averageValue(recentAssessments, (item) => normalizePercent(item.risk_score), 0),
    highRiskCount: assessments.filter((item) => item.risk_level === "HIGH").length,
    mediumRiskCount: assessments.filter((item) => item.risk_level === "MEDIUM").length,
    alertsCount: alerts.length,
    unreadAlerts: alerts.filter((item) => !item.is_read).length,
    feedbackCount: feedback.length,
    latestJournalDistress: normalizePercent(adminDetail.user?.latest_journal?.distress_score),
    moodDelta: Number((lastMood - firstMood).toFixed(1)),
  };
}

function scoreTone(level) {
  if (level === "HIGH") {
    return "from-[#f6ab68] to-[#f5821f]";
  }
  if (level === "MEDIUM") {
    return "from-[#f1dd94] to-[#d6bc62]";
  }
  return "from-[#c8daa0] to-[#a5bc63]";
}

function riskToneText(level) {
  if (level === "HIGH") {
    return "text-[#cf6d16]";
  }
  if (level === "MEDIUM") {
    return "text-[#9b7f19]";
  }
  return "text-[#6e8640]";
}

function currentSectionLabel(pathname) {
  if (pathname === "/admin") {
    return "Admin";
  }

  return navItems.find((item) => item.to === pathname)?.label || "Mental Health App";
}

function severityBadge(level) {
  if (level === "HIGH") {
    return "bg-[#f7d7b2] text-[#c76415]";
  }
  if (level === "MEDIUM") {
    return "bg-[#efe2b8] text-[#8d781f]";
  }
  return "bg-[#e2edc6] text-[#6a833c]";
}

function AppShell({ session, statusMessage, onLogout }) {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-canvas px-4 py-4 text-ink sm:px-6">
      <div className="mx-auto grid max-w-7xl gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="h-fit rounded-[2rem] bg-sidebar p-5 text-white shadow-panel xl:sticky xl:top-4">
          <div className="rounded-[1.6rem] bg-white/8 p-5">
            <p className="text-xs uppercase tracking-[0.4em] text-white/60">Mental Health AI</p>
            <h1 className="mt-4 font-display text-4xl leading-none">Calm early warning</h1>
            <p className="mt-3 text-sm text-white/72">
              Gentle monitoring, steady check-ins, and calmer awareness without overwhelming the user.
            </p>
          </div>

          <div className="mt-6 flex items-center gap-3 rounded-[1.4rem] bg-white/8 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-sm font-bold text-ink">
              {session.is_anonymous ? "AN" : session.email.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {session.is_anonymous ? "Anonymous Session" : session.email}
              </p>
              <p className="text-xs text-white/60">User #{session.user_id}</p>
            </div>
          </div>

          <nav className="mt-6 grid gap-2">
            {navItems.map((item) => (
              <NavLink
                className={({ isActive }) =>
                  `rounded-[1.2rem] px-4 py-3 text-sm font-medium transition ${
                    isActive
                      ? "bg-white text-ink shadow-sm"
                      : "text-white/72 hover:bg-white/10 hover:text-white"
                  }`
                }
                key={item.to}
                to={item.to}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="mt-6 rounded-[1.4rem] bg-white/8 p-4">
            <p className="text-xs uppercase tracking-[0.3em] text-white/62">Showing now</p>
            <p className="mt-2 text-lg font-semibold">
              {currentSectionLabel(location.pathname)}
            </p>
            <p className="mt-2 text-sm text-white/72">
              Calm visual language with softer contrast and less emotional overstimulation.
            </p>
          </div>

          <button
            className="mt-6 w-full rounded-[1.2rem] border border-white/15 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            onClick={onLogout}
            type="button"
          >
            Logout
          </button>
        </aside>

        <main className="space-y-6">
          <header className="rounded-[2rem] bg-sand/96 p-5 shadow-panel backdrop-blur">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-ink/40">AI Early Warning System</p>
                <h2 className="mt-2 font-display text-4xl sm:text-5xl">Mental Health Risk Detection</h2>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link
                  className="rounded-full bg-primary px-5 py-3 text-sm font-semibold text-white transition hover:brightness-95"
                  to="/check-in"
                >
                  Daily Check-In
                </Link>
                <Link
                  className="rounded-full border border-ink/10 bg-white px-5 py-3 text-sm font-semibold text-ink transition hover:border-ink/25"
                  to="/insights"
                >
                  View Insights
                </Link>
              </div>
            </div>
            {statusMessage && (
              <div className="mt-4 rounded-[1.4rem] border border-line bg-white/90 px-4 py-3 text-sm shadow-sm">
                {statusMessage}
              </div>
            )}
          </header>

          <Outlet />
        </main>
      </div>
    </div>
  );
}

function WelcomePage() {
  return (
    <div className="min-h-screen bg-canvas px-4 py-6 text-ink sm:px-6">
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="relative overflow-hidden rounded-[2.4rem] bg-gradient-to-br from-[#4c596a] via-[#7b6d60] to-primary p-8 text-white shadow-panel sm:p-10">
          <div className="absolute left-[-60px] top-[-50px] h-44 w-44 rounded-full bg-white/10" />
          <div className="absolute right-[-40px] top-24 h-52 w-52 rounded-full bg-primary-soft/20 blur-2xl" />
          <div className="absolute bottom-[-50px] left-1/3 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
          <div className="relative">
            <p className="inline-flex rounded-full border border-white/20 px-4 py-2 text-xs uppercase tracking-[0.35em] text-white/74">
              Early Warning Platform
            </p>
            <h1 className="mt-6 max-w-2xl font-display text-6xl leading-[0.88] sm:text-7xl">
              Support calm monitoring without overwhelming the user.
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-white/82">
              A calmer web platform for daily mood tracking, AI risk insights, journal analysis, trend
              detection, and supportive next-step guidance.
            </p>

            <div className="mt-10 grid gap-4 sm:grid-cols-3">
              <InfoPill title="Daily" value="Check-In" tone="bg-white/10" />
              <InfoPill title="AI" value="Risk Insights" tone="bg-white/10" />
              <InfoPill title="Personal" value="History" tone="bg-white/10" />
            </div>

            <div className="mt-10 flex flex-wrap gap-3">
              <Link
                className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-ink transition hover:brightness-95"
                to="/auth"
              >
                Enter Platform
              </Link>
              <a
                className="rounded-full border border-white/18 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                href="#journey"
              >
                Explore Flow
              </a>
            </div>
          </div>
        </section>

        <section className="grid gap-6">
          <div className="rounded-[2.2rem] bg-sand p-7 shadow-panel">
            <p className="text-xs uppercase tracking-[0.35em] text-ink/45">Approach</p>
            <blockquote className="mt-6 max-w-md font-display text-5xl leading-[1.02] text-ink">
              “Less friction, more continuity.”
            </blockquote>
            <p className="mt-5 text-sm leading-6 text-ink/60">
              The platform avoids intense colors and avoids forcing long questionnaires every day.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3" id="journey">
            <WelcomeStep number="01" title="Observe" text="Mood, stress, sleep, energy, and notes." color="bg-calm/50" />
            <WelcomeStep number="02" title="Understand" text="AI risk scoring with clear, explainable factors." color="bg-soft" />
            <WelcomeStep number="03" title="Reflect" text="Review history, patterns, and supportive suggestions." color="bg-[#f4eee6]" />
          </div>

          <div className="rounded-[2.2rem] bg-white p-6 shadow-panel">
            <p className="text-xs uppercase tracking-[0.35em] text-ink/45">What this version shows</p>
            <ul className="mt-4 space-y-3 text-sm text-ink/70">
              <li>Low-friction daily check-ins with a calmer visual style</li>
              <li>AI-assisted risk screening with explainable signals</li>
              <li>Personal history and insight views for ongoing self-monitoring</li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}

function AuthPage({ authMode, setAuthMode, authForm, setAuthForm, authLoading, onAuthSubmit, onAnonymous }) {
  return (
    <div className="min-h-screen bg-canvas px-4 py-6 text-ink sm:px-6">
      <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_0.94fr]">
        <section className="rounded-[2.4rem] bg-white p-8 shadow-panel sm:p-10">
          <p className="text-xs uppercase tracking-[0.35em] text-ink/45">Welcome</p>
          <h1 className="mt-4 font-display text-6xl leading-[0.9]">
            Personalize mental health monitoring with low-friction AI support.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-ink/68">
            Sign in to save your progress, or continue anonymously for a quick check-in and private risk view.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <FeatureCard title="Daily Check-In" text="Short daily input for mood, stress, sleep, and energy." />
            <FeatureCard title="AI Risk Result" text="A clearer risk score with explanations and alert signals." />
            <FeatureCard title="Personal History" text="Track patterns, trends, and supportive recommendations over time." />
          </div>
        </section>

        <section className="rounded-[2.4rem] bg-sand p-6 shadow-panel sm:p-8">
          <div className="mb-6 flex rounded-full bg-white p-1 shadow-sm">
            <button
              className={`flex-1 rounded-full px-4 py-3 text-sm font-semibold transition ${
                authMode === "login" ? "bg-primary text-white" : "text-ink/70"
              }`}
              onClick={() => setAuthMode("login")}
              type="button"
            >
              Login
            </button>
            <button
              className={`flex-1 rounded-full px-4 py-3 text-sm font-semibold transition ${
                authMode === "register" ? "bg-primary text-white" : "text-ink/70"
              }`}
              onClick={() => setAuthMode("register")}
              type="button"
            >
              Register
            </button>
          </div>

          <form className="space-y-4" onSubmit={onAuthSubmit}>
            <FormField
              label="Email"
              onChange={(value) => setAuthForm((current) => ({ ...current, email: value }))}
              placeholder="student@example.com"
              type="email"
              value={authForm.email}
            />
            <FormField
              label="Password"
              onChange={(value) => setAuthForm((current) => ({ ...current, password: value }))}
              placeholder="Enter your password"
              type="password"
              value={authForm.password}
            />
            <button
              className="w-full rounded-[1.2rem] bg-primary px-5 py-3 text-sm font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={authLoading}
              type="submit"
            >
              {authLoading ? "Please wait..." : authMode === "register" ? "Create Account" : "Login"}
            </button>
          </form>

          <div className="my-6 flex items-center gap-3 text-xs uppercase tracking-[0.3em] text-ink/35">
            <span className="h-px flex-1 bg-ink/10" />
            or
            <span className="h-px flex-1 bg-ink/10" />
          </div>

          <button
            className="w-full rounded-[1.2rem] bg-soft px-5 py-3 text-sm font-semibold text-ink transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={authLoading}
            onClick={onAnonymous}
            type="button"
          >
            Continue in Anonymous Mode
          </button>

          <p className="mt-5 text-sm text-ink/55">
            This app provides AI-supported screening and is not a substitute for clinical diagnosis.
          </p>
        </section>
      </div>
    </div>
  );
}

function DashboardPage({ data, pageLoading, onSeedDemo }) {
  const assessment = data?.latest_assessment;
  const score = normalizePercent(assessment?.risk_score);
  const questionnaireStatus = data?.questionnaire_status;
  const guidance = data?.guidance;

  return (
    <div className="space-y-6">
      {questionnaireStatus && (
        <div className="rounded-[1.6rem] border border-line bg-white px-5 py-4 shadow-sm">
          <p className="text-xs uppercase tracking-[0.35em] text-ink/45">Deeper screening</p>
          <div className="mt-2 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <p className="text-sm leading-6 text-ink/68">{questionnaireStatus.message}</p>
            <span
              className={`inline-flex rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] ${
                questionnaireStatus.due_now ? "bg-[#f7d7b2] text-[#c76415]" : "bg-[#e2edc6] text-[#6a833c]"
              }`}
            >
              {questionnaireStatus.due_now ? "Recommended Now" : "Available Anytime"}
            </span>
          </div>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <section className={`rounded-[2rem] bg-gradient-to-br ${scoreTone(assessment?.risk_level)} p-6 text-white shadow-panel`}>
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-white/65">Current Screening Result</p>
              <h3 className="mt-3 font-display text-5xl">{assessment?.risk_level || "NO DATA"}</h3>
              <p className="mt-4 max-w-xl text-sm leading-6 text-white/78">
                Hybrid score based on daily signals, journal tone, recent trend detection, and the latest
                available questionnaire if it is still valid.
              </p>
            </div>
            <button
              className="rounded-full border border-white/18 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              onClick={onSeedDemo}
              type="button"
            >
              Load Demo Data
            </button>
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-3">
            <StatBlock label="Score" value={`${score}/100`} />
            <StatBlock label="Trend" value={`${normalizePercent(assessment?.trend_score)}%`} />
            <StatBlock label="Text Distress" value={`${normalizePercent(assessment?.text_score)}%`} />
          </div>
        </section>

        <section className="rounded-[2rem] bg-white p-6 shadow-panel">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-ink/45">Risk Ring</p>
              <h3 className="mt-3 font-display text-3xl">Overall Risk Score</h3>
            </div>
            {pageLoading && <span className="text-sm text-ink/45">Refreshing...</span>}
          </div>

          <div className="mt-6 flex flex-col items-center justify-center gap-4 rounded-[1.8rem] bg-canvas p-6">
            <MetricRing percent={score} level={assessment?.risk_level || "LOW"} />
            <p className={`text-lg font-semibold ${riskToneText(assessment?.risk_level)}`}>
              {assessment?.alert_type ? "Alert active" : "Stable monitoring"}
            </p>
            <p className="text-center text-sm text-ink/60">
              Last updated {formatDate(assessment?.created_at)}
            </p>
          </div>
        </section>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="space-y-6">
          <Card title="Short Weekly Summary" eyebrow="Signals">
            <div className="grid gap-4 sm:grid-cols-2">
              <MiniMetric label="Average Mood" value={data?.summary?.avg_mood || 0} suffix="/10" />
              <MiniMetric label="Average Stress" value={data?.summary?.avg_stress || 0} suffix="/10" />
              <MiniMetric label="Average Sleep" value={data?.summary?.avg_sleep || 0} suffix="h" />
              <MiniMetric label="Volatility Index" value={normalizePercent(data?.summary?.volatility_index) || 0} suffix="%" />
            </div>
          </Card>

          <Card title="Professional summary" eyebrow="AI Guidance">
            <ProfessionalGuidance guidance={guidance} />
          </Card>
        </section>

        <section className="space-y-6">
          <Card title="Alerts" eyebrow="Early Warning">
            <div className="space-y-3">
              {(data?.alerts || []).length === 0 ? (
                <EmptyState text="No active alerts yet. Alerts appear when elevated risk or a downward pattern is detected." />
              ) : (
                data.alerts.map((alert) => (
                  <div className="rounded-[1.4rem] bg-[#fff4ea] px-4 py-4" key={alert.id}>
                    <div className="flex items-center justify-between gap-3">
                      <p className={`text-sm font-semibold uppercase tracking-[0.2em] ${riskToneText(alert.severity)}`}>
                        {alert.severity}
                      </p>
                      <p className="text-xs text-ink/45">{formatDate(alert.created_at)}</p>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-ink/68">{alert.message}</p>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card title="Guidance breakdown" eyebrow="Support Plan">
            <div className="grid gap-3">
              {(data?.recommendations || []).length === 0 ? (
                <EmptyState text="Recommendations appear after the first complete assessment." />
              ) : (
                data.recommendations.map((rec) => (
                  <div className="rounded-[1.4rem] bg-canvas px-4 py-4" key={rec.id}>
                    <p className="text-xs uppercase tracking-[0.3em] text-ink/40">{rec.category}</p>
                    <h4 className="mt-2 text-sm font-semibold">{rec.title}</h4>
                    <p className="mt-2 text-sm leading-6 text-ink/65">{rec.content}</p>
                  </div>
                ))
              )}
            </div>
          </Card>
        </section>
      </div>
    </div>
  );
}

function CheckInPage({ onSubmit, submitLoading, questionnaireStatus }) {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    ...moodDefaults,
    phq9_answers: Array(9).fill(3),
    gad7_answers: Array(7).fill(3),
    includeQuestionnaire: Boolean(questionnaireStatus?.due_now),
    text: "",
  });

  useEffect(() => {
    setForm((current) => ({
      ...current,
      includeQuestionnaire: current.includeQuestionnaire || Boolean(questionnaireStatus?.due_now),
    }));
  }, [questionnaireStatus?.due_now]);

  async function handleSubmit(event) {
    event.preventDefault();
    await onSubmit(form);
    navigate("/risk-result");
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <section className="rounded-[2rem] bg-white p-6 shadow-panel">
        <p className="text-xs uppercase tracking-[0.35em] text-ink/45">Step 1</p>
        <h3 className="mt-3 font-display text-4xl">Daily mood check-in</h3>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <SliderCard
            accent="bg-soft text-primary"
            label="Mood"
            value={form.mood}
            onChange={(value) => setForm((current) => ({ ...current, mood: value }))}
          />
          <SliderCard
            accent="bg-calm/55 text-primary"
            label="Stress"
            value={form.stress}
            onChange={(value) => setForm((current) => ({ ...current, stress: value }))}
          />
          <SliderCard
            accent="bg-soft text-[#6a833c]"
            label="Energy"
            value={form.energy}
            onChange={(value) => setForm((current) => ({ ...current, energy: value }))}
          />
          <div className="rounded-[1.7rem] bg-canvas p-5">
            <FormField
              label="Sleep Hours"
              onChange={(value) => setForm((current) => ({ ...current, sleep: Number(value) }))}
              placeholder="7"
              step="0.5"
              type="number"
              value={form.sleep}
            />
            <div className="mt-4">
              <label className="mb-3 block text-sm font-semibold">Quick note</label>
              <textarea
                className="min-h-[100px] w-full rounded-[1.1rem] border border-line bg-white px-4 py-3 outline-none transition focus:border-primary"
                onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
                placeholder="Describe what stood out today..."
                value={form.note}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] bg-white p-6 shadow-panel">
        <p className="text-xs uppercase tracking-[0.35em] text-ink/45">Step 2</p>
        <h3 className="mt-3 font-display text-4xl">Deeper screening</h3>
        <div className="mt-4 rounded-[1.5rem] bg-gradient-to-r from-[#fff4ea] to-[#f2f0e8] px-5 py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-ink">Want a richer AI reading?</p>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/68">
                {questionnaireStatus?.message ||
                  "Taking the deeper screening gives the system more context and can reveal hidden stress patterns, emotional strain, and early changes before they become obvious."}
              </p>
            </div>
            <button
              className={`rounded-full px-5 py-3 text-sm font-semibold transition ${
                form.includeQuestionnaire ? "bg-primary text-white hover:brightness-95" : "bg-white text-ink hover:border-ink/15"
              }`}
              onClick={(event) => {
                event.preventDefault();
                setForm((current) => ({ ...current, includeQuestionnaire: !current.includeQuestionnaire }));
              }}
              type="button"
            >
              {form.includeQuestionnaire ? "Skip For Now" : "Take Deeper Screening"}
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-[1.5rem] bg-canvas px-5 py-4 text-sm leading-6 text-ink/68">
          Use the 1 to 5 scale below, where 1 means “not like me today” and 5 means “very true for me lately”.
        </div>

        {form.includeQuestionnaire ? (
          <div className="mt-6 space-y-6">
            <p className="max-w-3xl text-sm leading-6 text-ink/64">
              Completing this section is optional, but it helps the platform produce a more accurate risk profile,
              sharper explanations, and stronger personalized guidance.
            </p>
            <div className="grid gap-6 xl:grid-cols-2">
              <QuestionBlock
                answers={form.phq9_answers}
                onChange={(index, value) =>
                  setForm((current) => ({
                    ...current,
                    phq9_answers: current.phq9_answers.map((item, currentIndex) =>
                      currentIndex === index ? value : item,
                    ),
                  }))
                }
                title="Mood and emotional strain"
                questions={phqQuestions}
              />
              <QuestionBlock
                answers={form.gad7_answers}
                onChange={(index, value) =>
                  setForm((current) => ({
                    ...current,
                    gad7_answers: current.gad7_answers.map((item, currentIndex) =>
                      currentIndex === index ? value : item,
                    ),
                  }))
                }
                title="Stress and anxiety pattern"
                questions={gadQuestions}
              />
            </div>
          </div>
        ) : (
          <div className="mt-6 rounded-[1.5rem] border border-line bg-white px-5 py-5">
            <p className="text-sm font-semibold text-ink">Quick mode is active for today.</p>
            <p className="mt-2 text-sm leading-6 text-ink/64">
              You can still continue with the short daily check-in now, or unlock the deeper screening any time if
              you want a more detailed interpretation of your current state.
            </p>
          </div>
        )}
      </section>

      <section className="rounded-[2rem] bg-white p-6 shadow-panel">
        <p className="text-xs uppercase tracking-[0.35em] text-ink/45">Step 3</p>
        <h3 className="mt-3 font-display text-4xl">Journal reflection</h3>
        <div className="mt-6 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
          <div className="rounded-[1.7rem] bg-gradient-to-br from-[#fff4ea] to-[#f4ede5] p-6">
            <p className="text-xs uppercase tracking-[0.3em] text-ink/45">Prompt</p>
            <p className="mt-4 text-sm leading-7 text-ink/68">
              Write freely about how you feel, what is causing pressure, whether you feel supported, and
              whether sleep or energy changed this week.
            </p>
          </div>
          <div className="rounded-[1.7rem] bg-canvas p-5">
            <textarea
              className="min-h-[220px] w-full rounded-[1.2rem] border border-line bg-white px-4 py-4 outline-none transition focus:border-primary"
              onChange={(event) => setForm((current) => ({ ...current, text: event.target.value }))}
              placeholder="Example: I felt overwhelmed and exhausted this week. It was hard to sleep and my stress kept building before deadlines."
              value={form.text}
            />
            <button
              className="mt-5 w-full rounded-[1.3rem] bg-primary px-5 py-4 text-base font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={submitLoading}
              type="submit"
            >
              {submitLoading ? "Calculating your assessment..." : "Generate AI Risk Assessment"}
            </button>
          </div>
        </div>
      </section>
    </form>
  );
}

function RiskResultPage({ data }) {
  const assessment = data?.latest_assessment;
  const mood = data?.latest_mood;
  const questionnaire = data?.latest_questionnaire;
  const journal = data?.latest_journal;
  const guidance = data?.guidance;

  return (
    <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
      <section className="space-y-6">
        <div className="rounded-[2rem] bg-white p-6 shadow-panel">
          <p className="text-xs uppercase tracking-[0.35em] text-ink/45">Risk Result</p>
          <div className="mt-6 flex flex-col items-center gap-4 rounded-[1.8rem] bg-canvas p-6 text-center">
            <MetricRing percent={normalizePercent(assessment?.risk_score)} level={assessment?.risk_level || "LOW"} />
            <p className={`text-3xl font-semibold ${riskToneText(assessment?.risk_level)}`}>
              {assessment?.risk_level || "NO DATA"}
            </p>
            <p className="max-w-md text-sm leading-6 text-ink/64">
              This score estimates current vulnerability and warning patterns. It should support awareness,
              not replace a clinician's evaluation.
            </p>
          </div>
        </div>

        <div className="rounded-[2rem] bg-white p-6 shadow-panel">
          <p className="text-xs uppercase tracking-[0.35em] text-ink/45">Component Breakdown</p>
          <div className="mt-5 space-y-4">
            <BreakdownBar label="Classifier" value={assessment?.classifier_score} />
            <BreakdownBar label="Questionnaire Severity" value={assessment?.questionnaire_score} />
            <BreakdownBar label="Journal Distress" value={assessment?.text_score} />
            <BreakdownBar label="Trend Shift" value={assessment?.trend_score} />
          </div>
        </div>
      </section>

      <section className="space-y-6">
        <Card title="Professional guidance" eyebrow="Interpretation">
          <ProfessionalGuidance guidance={guidance} />
        </Card>

        <Card title="Explainable factors" eyebrow="AI Drivers">
          <div className="space-y-3">
            {(assessment?.explanations || []).length === 0 ? (
              <EmptyState text="Run a complete check-in to generate explainable factors." />
            ) : (
              assessment.explanations.map((item) => (
                <div className="rounded-[1.4rem] bg-canvas px-4 py-4 text-sm leading-6 text-ink/65" key={item}>
                  {item}
                </div>
              ))
            )}
          </div>
        </Card>

        <Card title="Latest inputs" eyebrow="Assessment Context">
          <div className="grid gap-4 md:grid-cols-2">
            <MiniMetric label="Mood" value={mood?.mood || 0} suffix="/10" />
            <MiniMetric label="Stress" value={mood?.stress || 0} suffix="/10" />
            <MiniMetric label="Sleep" value={mood?.sleep || 0} suffix="h" />
            <MiniMetric label="Energy" value={mood?.energy || 0} suffix="/10" />
            <MiniMetric label="Mood Screen" value={questionnaire?.phq9_total || 0} suffix="/45" />
            <MiniMetric label="Stress Screen" value={questionnaire?.gad7_total || 0} suffix="/35" />
          </div>
          {journal?.text && (
            <div className="mt-5 rounded-[1.4rem] bg-canvas px-4 py-4 text-sm leading-6 text-ink/64">
              <p className="mb-2 text-xs uppercase tracking-[0.3em] text-ink/40">
                Journal tone: {journal.sentiment_label}
              </p>
              {journal.text}
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}

function InsightsPage({ insights, history }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card title="Weekly trend dashboard" eyebrow="Insights">
          <TrendChart points={insights?.trend_points || []} />
        </Card>

        <Card title="Behavior pattern scan" eyebrow="Deviation Detection">
          <div className="space-y-4">
            <MiniMetric label="Trend Delta" value={insights?.summary?.trend_delta || 0} suffix="" />
            <MiniMetric label="Decline Streak" value={insights?.summary?.decline_streak || 0} suffix=" days" />
            <MiniMetric
              label="Deviation Flag"
              value={insights?.deviation_detected ? "Detected" : "Stable"}
              suffix=""
            />
            <div className="rounded-[1.4rem] bg-canvas px-4 py-4 text-sm leading-6 text-ink/65">
              {insights?.deviation_detected
                ? "The short-term pattern deviates from the user's recent baseline and may need closer monitoring."
                : "No significant downward deviation is visible in the recent pattern."}
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Card title="Latest journal signal" eyebrow="NLP Layer">
          {insights?.journal ? (
            <div className="space-y-4">
              <div className="flex gap-3">
                <MiniMetric label="Sentiment" value={insights.journal.sentiment_label} suffix="" />
                <MiniMetric label="Distress" value={normalizePercent(insights.journal.distress_score)} suffix="%" />
              </div>
              <div className="rounded-[1.4rem] bg-canvas px-4 py-4 text-sm leading-6 text-ink/65">
                {insights.journal.text}
              </div>
            </div>
          ) : (
            <EmptyState text="Journal-based insight appears after the first reflection." />
          )}
        </Card>

        <Card title="Recent assessment timeline" eyebrow="History Preview">
          <div className="space-y-3">
            {(history?.items || []).slice(0, 6).map((item) => (
              <div className="rounded-[1.4rem] bg-canvas px-4 py-4" key={item.id}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold">{formatDate(item.created_at)}</p>
                  <p className={`text-xs font-bold uppercase tracking-[0.25em] ${riskToneText(item.risk_level)}`}>
                    {item.risk_level || "Pending"}
                  </p>
                </div>
                <p className="mt-2 text-sm text-ink/64">
                  Mood {item.mood}, Stress {item.stress}, Sleep {item.sleep}h, Energy {item.energy}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function HistoryPage({ history }) {
  return (
    <Card title="Full history" eyebrow="Timeline">
      <div className="space-y-3">
        {(history?.items || []).length === 0 ? (
          <EmptyState text="No history yet. Complete your first screening to create a timeline." />
        ) : (
          history.items.map((item) => (
            <div className="rounded-[1.5rem] bg-canvas px-4 py-4" key={item.id}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold">{formatDate(item.created_at)}</p>
                <p className={`text-xs font-bold uppercase tracking-[0.25em] ${riskToneText(item.risk_level)}`}>
                  {item.risk_level || "Pending"}
                </p>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-4">
                <MiniMetric label="Mood" value={item.mood} suffix="/10" />
                <MiniMetric label="Stress" value={item.stress} suffix="/10" />
                <MiniMetric label="Sleep" value={item.sleep} suffix="h" />
                <MiniMetric label="Energy" value={item.energy} suffix="/10" />
              </div>
              <p className="mt-4 text-sm leading-6 text-ink/64">{item.note || "No note added."}</p>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}

function WellnessPage() {
  const [seconds, setSeconds] = useState(60);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState("Breathe In");

  useEffect(() => {
    if (!running) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setSeconds((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          setRunning(false);
          return 60;
        }
        return current - 1;
      });
      setPhase((current) => (current === "Breathe In" ? "Breathe Out" : "Breathe In"));
    }, 4000);

    return () => window.clearInterval(timer);
  }, [running]);

  return (
    <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
      <section className="space-y-6">
        <div className="rounded-[2rem] bg-[#abc36a] p-6 text-white shadow-panel">
          <p className="text-xs uppercase tracking-[0.35em] text-white/65">Breathing Exercise</p>
          <div className="mt-6 flex flex-col items-center gap-5">
            <div className={`breathing-orb ${running ? "breathing-orb--active" : ""}`}>
              <div className="breathing-orb__inner">
                <p className="text-sm uppercase tracking-[0.25em] text-white/65">{seconds}s</p>
                <p className="mt-1 text-2xl font-semibold">{phase}</p>
              </div>
            </div>
            <button
              className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-ink transition hover:brightness-95"
              onClick={() => setRunning((current) => !current)}
              type="button"
            >
              {running ? "Pause Exercise" : "Start Exercise"}
            </button>
          </div>
        </div>

        <Card title="Quick recovery tools" eyebrow="Mindful Support">
          <div className="grid gap-4 md:grid-cols-3">
            <FeatureCard title="Body Scan" text="5-minute reset to reduce overload and muscle tension." />
            <FeatureCard title="Grounding" text="A 5-4-3-2-1 exercise for when anxiety spikes." />
            <FeatureCard title="Reflect" text="Write a two-sentence journal note after your reset." />
          </div>
        </Card>
      </section>

      <section className="space-y-6">
        <Card title="Soundscapes" eyebrow="Recovery Audio">
          <div className="grid gap-4 md:grid-cols-2">
            <SoundCard title="Rain Garden" subtitle="Soft rain and leaves" />
            <SoundCard title="Mountain Stream" subtitle="Flowing water and calm air" />
            <SoundCard title="Night Wind" subtitle="Low-noise focus ambience" />
            <SoundCard title="Forest Birds" subtitle="Gentle nature stimulation" />
          </div>
        </Card>

        <Card title="Why this page exists" eyebrow="Product Story">
          <div className="rounded-[1.4rem] bg-canvas px-4 py-4 text-sm leading-7 text-ink/65">
            The project should not only predict risk. It should also help the user respond in calmer, low-friction
            ways that fit a daily routine.
          </div>
        </Card>
      </section>
    </div>
  );
}

function SettingsPage({ session, onFeedback }) {
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [feedback, setFeedback] = useState({ category: "Performance", message: "" });
  const [submitting, setSubmitting] = useState(false);

  async function handleFeedbackSubmit(event) {
    event.preventDefault();
    if (!feedback.message.trim()) {
      return;
    }
    setSubmitting(true);
    await onFeedback(feedback);
    setFeedback((current) => ({ ...current, message: "" }));
    setSubmitting(false);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
      <section className="space-y-6">
        <Card title="Profile summary" eyebrow="Account">
          <div className="rounded-[1.5rem] bg-canvas p-5">
            <p className="text-sm font-semibold">{session.is_anonymous ? "Anonymous Session" : session.email}</p>
            <p className="mt-1 text-sm text-ink/55">
              Use the quick daily check-in when you want speed, or open the deeper screening any time you want more detailed insight.
            </p>
          </div>
        </Card>

        <Card title="Notification settings" eyebrow="Preferences">
          <div className="space-y-4">
            <ToggleRow
              description="Show reminders for the daily check-in."
              enabled={notificationsEnabled}
              label="Daily reminders"
              onToggle={() => setNotificationsEnabled((current) => !current)}
            />
            <ToggleRow
              description="Enable ambient audio in wellness sessions."
              enabled={soundEnabled}
              label="Sound support"
              onToggle={() => setSoundEnabled((current) => !current)}
            />
          </div>
        </Card>

        <Card title="Linked devices" eyebrow="Ecosystem">
          <div className="grid gap-4 md:grid-cols-2">
            <DeviceCard device="Smart Watch" status="Connect" />
            <DeviceCard device="Sleep Patch" status="Connect" />
            <DeviceCard device="Mini ECG" status="Preview" />
            <DeviceCard device="BP Monitor" status="Preview" />
          </div>
        </Card>
      </section>

      <section className="space-y-6">
        <Card title="Feedback" eyebrow="Help Improve">
          <form className="space-y-4" onSubmit={handleFeedbackSubmit}>
            <select
              className="w-full rounded-[1.2rem] border border-line bg-canvas px-4 py-3 outline-none"
              onChange={(event) => setFeedback((current) => ({ ...current, category: event.target.value }))}
              value={feedback.category}
            >
              <option>Performance</option>
              <option>UI/UX</option>
              <option>Support</option>
              <option>Loading</option>
            </select>
            <textarea
              className="min-h-[220px] w-full rounded-[1.2rem] border border-line bg-canvas px-4 py-4 outline-none"
              onChange={(event) => setFeedback((current) => ({ ...current, message: event.target.value }))}
              placeholder="Share what could be improved in the platform."
              value={feedback.message}
            />
            <button
              className="w-full rounded-[1.3rem] bg-primary px-5 py-4 text-base font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={submitting}
              type="submit"
            >
              {submitting ? "Sending..." : "Submit Feedback"}
            </button>
          </form>
        </Card>

        <Card title="Safety note" eyebrow="Clinical Boundary">
          <div className="rounded-[1.4rem] bg-[#fff4ea] px-4 py-4 text-sm leading-7 text-ink/68">
            The platform is designed for risk screening and early warning support. It should not be used as a
            standalone diagnosis. If distress feels urgent or overwhelming, a licensed professional or local
            emergency support should be contacted directly.
          </div>
        </Card>
      </section>
    </div>
  );
}

function AdminLoginPage({ adminForm, adminLoading, onChange, onSubmit }) {
  return (
    <Card title="Admin access" eyebrow="Restricted">
      <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="rounded-[1.5rem] bg-canvas p-5">
          <p className="text-sm font-semibold">Separate admin account</p>
          <p className="mt-3 text-sm leading-6 text-ink/64">
            Admin monitoring is protected by its own credentials and is separate from user sessions.
          </p>
        </div>
        <form className="space-y-4" onSubmit={onSubmit}>
          <FormField
            label="Admin Email"
            onChange={(value) => onChange((current) => ({ ...current, email: value }))}
            placeholder="admin@mentalhealth.local"
            type="email"
            value={adminForm.email}
          />
          <FormField
            label="Admin Password"
            onChange={(value) => onChange((current) => ({ ...current, password: value }))}
            placeholder="Enter admin password"
            type="password"
            value={adminForm.password}
          />
          <button
            className="w-full rounded-[1.3rem] bg-primary px-5 py-4 text-base font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={adminLoading}
            type="submit"
          >
            {adminLoading ? "Signing in..." : "Open Admin Monitor"}
          </button>
        </form>
      </div>
    </Card>
  );
}

function AdminPage({ adminOverview, adminDetail, onSelectUser, adminLoading, isAuthenticated, adminForm, onAdminFormChange, onAdminLogin }) {
  if (!isAuthenticated) {
    return (
      <AdminLoginPage
        adminForm={adminForm}
        adminLoading={adminLoading}
        onChange={onAdminFormChange}
        onSubmit={onAdminLogin}
      />
    );
  }

  const miniStats = buildAdminMiniStats(adminDetail);

  return (
    <div className="space-y-6">
      <Card title="Population overview" eyebrow="Admin Analytics">
        <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          <MiniMetric label="Users" value={adminOverview?.summary?.total_users || 0} suffix="" />
          <MiniMetric label="Entries" value={adminOverview?.summary?.total_entries || 0} suffix="" />
          <MiniMetric label="Assessments" value={adminOverview?.summary?.total_assessments || 0} suffix="" />
          <MiniMetric label="High Risk" value={adminOverview?.summary?.high_risk_users || 0} suffix="" />
          <MiniMetric label="Alerts" value={adminOverview?.summary?.total_alerts || 0} suffix="" />
          <MiniMetric label="Questionnaires Due" value={adminOverview?.summary?.questionnaires_due || 0} suffix="" />
        </div>
      </Card>

      <div className={`grid gap-6 ${adminDetail ? "xl:grid-cols-[0.84fr_1.16fr]" : "xl:grid-cols-[1.04fr_0.96fr]"}`}>
        <Card title="Users under observation" eyebrow="Admin Table">
          <div className="space-y-3">
            {(adminOverview?.users || []).length === 0 ? (
              <EmptyState text="No user data is available yet." />
            ) : (
              adminOverview.users.map((user) => (
                <button
                  className="w-full rounded-[1.5rem] bg-canvas px-4 py-4 text-left transition hover:bg-[#f2e7d9]"
                  key={user.user_id}
                  onClick={() => onSelectUser(user.user_id)}
                  type="button"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">{user.email}</p>
                      <p className="mt-1 text-xs text-ink/50">
                        Entries {user.entries_count} | Alerts {user.unread_alerts}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.25em] ${severityBadge(user.latest_assessment?.risk_level)}`}>
                        {user.latest_assessment?.risk_level || "No Risk"}
                      </span>
                      <span className={`rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.25em] ${
                        user.questionnaire_status?.due_now ? "bg-[#f7d7b2] text-[#c76415]" : "bg-[#e2edc6] text-[#6a833c]"
                      }`}>
                        {user.questionnaire_status?.due_now ? "Questionnaire Due" : "Questionnaire OK"}
                      </span>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </Card>

        <Card title="Selected profile overview" eyebrow="Detail Panel">
          {adminLoading ? (
            <EmptyState text="Loading user detail..." />
          ) : adminDetail ? (
            <div className="space-y-5">
              <div className="rounded-[1.4rem] bg-canvas px-4 py-4">
                <p className="text-sm font-semibold">{adminDetail.user.email}</p>
                <p className="mt-1 text-sm text-ink/60">Created {formatDate(adminDetail.user.created_at)}</p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <MiniMetric
                  label="Latest Risk"
                  value={adminDetail.user.latest_assessment?.risk_level || "None"}
                  suffix=""
                />
                <MiniMetric
                  label="Questionnaire"
                  value={adminDetail.user.questionnaire_status?.due_now ? "Due" : "Current"}
                  suffix=""
                />
              </div>

              <div className="rounded-[1.6rem] border border-line bg-white p-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.35em] text-ink/45">Mini dashboard</p>
                    <h4 className="mt-2 font-display text-2xl">Behavior and risk snapshot</h4>
                  </div>
                  <p className="text-sm text-ink/55">
                    A focused statistical view of recent behavior, warning patterns, and response history.
                  </p>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <MiniMetric label="Avg Mood 7d" value={miniStats?.moodAverage || 0} suffix="/10" />
                  <MiniMetric label="Avg Stress 7d" value={miniStats?.stressAverage || 0} suffix="/10" />
                  <MiniMetric label="Avg Sleep 7d" value={miniStats?.sleepAverage || 0} suffix="h" />
                  <MiniMetric label="Avg Energy 7d" value={miniStats?.energyAverage || 0} suffix="/10" />
                  <MiniMetric label="Avg Risk 7d" value={miniStats?.riskAverage || 0} suffix="/100" />
                  <MiniMetric label="High Risk Count" value={miniStats?.highRiskCount || 0} suffix="" />
                  <MiniMetric label="Alerts Raised" value={miniStats?.alertsCount || 0} suffix="" />
                  <MiniMetric label="Journal Distress" value={miniStats?.latestJournalDistress || 0} suffix="%" />
                </div>

                <div className="mt-5 grid gap-3 lg:grid-cols-3">
                  <div className="rounded-[1.3rem] bg-canvas px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.25em] text-ink/45">Mood Change</p>
                    <p className="mt-2 text-2xl font-semibold">
                      {miniStats?.moodDelta > 0 ? "+" : ""}
                      {miniStats?.moodDelta || 0}
                    </p>
                    <p className="mt-1 text-sm text-ink/58">First vs latest recorded mood</p>
                  </div>
                  <div className="rounded-[1.3rem] bg-canvas px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.25em] text-ink/45">Medium Risk</p>
                    <p className="mt-2 text-2xl font-semibold">{miniStats?.mediumRiskCount || 0}</p>
                    <p className="mt-1 text-sm text-ink/58">Assessments marked medium risk</p>
                  </div>
                  <div className="rounded-[1.3rem] bg-canvas px-4 py-4">
                    <p className="text-xs uppercase tracking-[0.25em] text-ink/45">Unread Alerts</p>
                    <p className="mt-2 text-2xl font-semibold">{miniStats?.unreadAlerts || 0}</p>
                    <p className="mt-1 text-sm text-ink/58">Signals that may need follow-up</p>
                  </div>
                </div>

                <div className="mt-5">
                  <AdminMiniTrend assessments={adminDetail.assessments} history={adminDetail.history} />
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-2">
                <div className="rounded-[1.4rem] bg-canvas px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.3em] text-ink/45">Screening cadence</p>
                  <p className="mt-2 text-sm leading-6 text-ink/64">
                    {adminDetail.user.questionnaire_status?.message || "No questionnaire cadence data."}
                  </p>
                </div>
                <div className="rounded-[1.4rem] bg-canvas px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.3em] text-ink/45">Admin summary</p>
                  <p className="mt-2 text-sm leading-6 text-ink/64">
                    {miniStats?.sleepAverage < 6
                      ? "Sleep average is below 6 hours and may be contributing to elevated risk."
                      : miniStats?.stressAverage >= 7
                        ? "Stress has remained elevated across recent entries and should be monitored closely."
                        : miniStats?.highRiskCount > 0
                          ? "High-risk assessments are present in this profile and deserve manual review."
                          : "Recent signals look more stable, but ongoing monitoring is still recommended."}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs uppercase tracking-[0.35em] text-ink/45">Recent assessments</p>
                {(adminDetail.assessments || []).slice(0, 4).map((item, index) => (
                  <div className="rounded-[1.4rem] bg-canvas px-4 py-4" key={`${item.created_at}-${index}`}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold">{formatDate(item.created_at)}</p>
                      <span className={`rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.25em] ${severityBadge(item.risk_level)}`}>
                        {item.risk_level}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-ink/65">
                      Score {normalizePercent(item.risk_score)}/100 | Trend {normalizePercent(item.trend_score)}% |
                      Text {normalizePercent(item.text_score)}%
                    </p>
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                <p className="text-xs uppercase tracking-[0.35em] text-ink/45">Recent alerts</p>
                {(adminDetail.alerts || []).length === 0 ? (
                  <EmptyState text="No alerts have been raised for this user yet." />
                ) : (
                  adminDetail.alerts.slice(0, 4).map((item, index) => (
                    <div className="rounded-[1.4rem] bg-[#fff4ea] px-4 py-4" key={`${item.created_at}-${index}`}>
                      <div className="flex items-center justify-between gap-3">
                        <p className={`text-xs font-semibold uppercase tracking-[0.25em] ${riskToneText(item.severity)}`}>
                          {item.severity}
                        </p>
                        <p className="text-xs text-ink/45">{formatDate(item.created_at)}</p>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-ink/64">{item.message}</p>
                    </div>
                  ))
                )}
              </div>

              <div className="space-y-3">
                <p className="text-xs uppercase tracking-[0.35em] text-ink/45">Recent feedback</p>
                {(adminDetail.feedback || []).length === 0 ? (
                  <EmptyState text="No feedback from this user yet." />
                ) : (
                  adminDetail.feedback.slice(0, 3).map((item, index) => (
                    <div className="rounded-[1.4rem] bg-canvas px-4 py-4" key={`${item.created_at}-${index}`}>
                      <p className="text-xs uppercase tracking-[0.25em] text-ink/45">{item.category}</p>
                      <p className="mt-2 text-sm leading-6 text-ink/65">{item.message}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <EmptyState text="Select a user from the left side to inspect risk, cadence, feedback, and history." />
          )}
        </Card>
      </div>
    </div>
  );
}

function AdminStandalonePage(props) {
  return (
    <div className="min-h-screen bg-canvas px-4 py-6 text-ink sm:px-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-[2rem] bg-sand/96 p-5 shadow-panel backdrop-blur">
          <p className="text-xs uppercase tracking-[0.35em] text-ink/40">AI Early Warning System</p>
          <h1 className="mt-2 font-display text-4xl sm:text-5xl">Admin Monitoring Console</h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-ink/64">
            Restricted access for reviewing user trends, screening cadence, alerts, and elevated-risk profiles.
          </p>
        </header>

        <AdminPage {...props} />
      </div>
    </div>
  );
}

function FormField({ label, type, value, onChange, placeholder, step }) {
  return (
    <div>
      <label className="mb-2 block text-sm font-semibold">{label}</label>
      <input
        className="w-full rounded-[1.2rem] border border-line bg-white px-4 py-3 outline-none transition focus:border-primary"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={type !== "number"}
        step={step}
        type={type}
        value={value}
      />
    </div>
  );
}

function InfoPill({ title, value, tone }) {
  return (
    <div className={`rounded-[1.7rem] ${tone} p-5 backdrop-blur`}>
      <p className="text-xs uppercase tracking-[0.25em] text-white/65">{title}</p>
      <p className="mt-3 text-4xl font-semibold">{value}</p>
    </div>
  );
}

function WelcomeStep({ number, title, text, color }) {
  return (
    <div className={`rounded-[1.9rem] ${color} p-5 shadow-sm`}>
      <p className="text-xs uppercase tracking-[0.35em] text-ink/42">{number}</p>
      <h3 className="mt-4 text-xl font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-ink/65">{text}</p>
    </div>
  );
}

function FeatureCard({ title, text }) {
  return (
    <div className="rounded-[1.6rem] bg-canvas p-5">
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-ink/64">{text}</p>
    </div>
  );
}

function Card({ eyebrow, title, children }) {
  return (
    <section className="rounded-[2rem] bg-white p-6 shadow-panel">
      <p className="text-xs uppercase tracking-[0.35em] text-ink/45">{eyebrow}</p>
      <h3 className="mt-3 font-display text-3xl">{title}</h3>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function StatBlock({ label, value }) {
  return (
    <div className="rounded-[1.5rem] bg-white/12 px-4 py-5">
      <p className="text-xs uppercase tracking-[0.3em] text-white/62">{label}</p>
      <p className="mt-3 text-3xl font-semibold">{value}</p>
    </div>
  );
}

function MiniMetric({ label, value, suffix }) {
  return (
    <div className="rounded-[1.4rem] bg-canvas px-4 py-4">
      <p className="text-xs uppercase tracking-[0.3em] text-ink/42">{label}</p>
      <p className="mt-2 text-xl font-semibold">
        {value}
        <span className="text-sm font-medium text-ink/45">{suffix}</span>
      </p>
    </div>
  );
}

function AdminMiniTrend({ history, assessments }) {
  const historyPoints = [...(history || [])].reverse().slice(-10);
  const assessmentPoints = [...(assessments || [])].reverse().slice(-10);

  if (!historyPoints.length) {
    return <EmptyState text="Mini dashboard trend will appear after several user check-ins are available." />;
  }

  const width = 520;
  const height = 180;
  const padding = 18;
  const moodLine = historyPoints.map((point, index) => {
    const x = padding + (index * (width - padding * 2)) / Math.max(historyPoints.length - 1, 1);
    const y = height - padding - ((point.mood || 0) / 10) * (height - padding * 2);
    return `${x},${y}`;
  });
  const stressLine = historyPoints.map((point, index) => {
    const x = padding + (index * (width - padding * 2)) / Math.max(historyPoints.length - 1, 1);
    const y = height - padding - ((point.stress || 0) / 10) * (height - padding * 2);
    return `${x},${y}`;
  });
  const riskLine =
    assessmentPoints.length > 1
      ? assessmentPoints.map((point, index) => {
          const x = padding + (index * (width - padding * 2)) / Math.max(assessmentPoints.length - 1, 1);
          const y = height - padding - (Number(point.risk_score || 0) * (height - padding * 2));
          return `${x},${y}`;
        })
      : [];

  return (
    <div className="rounded-[1.5rem] bg-canvas p-4">
      <div className="mb-4 flex flex-wrap gap-4 text-xs uppercase tracking-[0.25em] text-ink/50">
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#a5bc63]" />
          Mood
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#f5821f]" />
          Stress
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#6f8aa0]" />
          Risk
        </span>
      </div>
      <svg className="w-full" viewBox={`0 0 ${width} ${height}`}>
        <rect fill="#ffffff" height={height} rx="24" width={width} />
        {[0.25, 0.5, 0.75].map((level) => (
          <line
            key={level}
            stroke="rgba(52,64,85,0.08)"
            strokeDasharray="5 6"
            strokeWidth="1"
            x1={padding}
            x2={width - padding}
            y1={height - padding - level * (height - padding * 2)}
            y2={height - padding - level * (height - padding * 2)}
          />
        ))}
        <polyline fill="none" points={moodLine.join(" ")} stroke="#a5bc63" strokeLinecap="round" strokeWidth="4" />
        <polyline fill="none" points={stressLine.join(" ")} stroke="#f5821f" strokeLinecap="round" strokeWidth="4" />
        {riskLine.length > 1 && (
          <polyline fill="none" points={riskLine.join(" ")} stroke="#6f8aa0" strokeLinecap="round" strokeWidth="4" />
        )}
      </svg>
      <p className="mt-3 text-sm leading-6 text-ink/62">
        Last 10 observations for mood and stress, with recent assessment risk overlay when available.
      </p>
    </div>
  );
}

function MetricRing({ percent, level }) {
  const safePercent = Math.max(0, Math.min(100, percent));
  const ringColor =
    level === "HIGH" ? "#f5821f" : level === "MEDIUM" ? "#d6bc62" : "#a5bc63";

  return (
    <div
      className="metric-ring"
      style={{
        background: `conic-gradient(${ringColor} ${safePercent * 3.6}deg, rgba(51, 65, 85, 0.08) 0deg)`,
      }}
    >
      <div className="metric-ring__inner">
        <p className="text-5xl font-semibold">{safePercent}</p>
        <p className="mt-1 text-sm uppercase tracking-[0.3em] text-ink/45">Risk Score</p>
      </div>
    </div>
  );
}

function BreakdownBar({ label, value }) {
  const percent = normalizePercent(value);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm font-medium">
        <span>{label}</span>
        <span>{percent}%</span>
      </div>
      <div className="h-3 rounded-full bg-canvas">
        <div className="h-3 rounded-full bg-gradient-to-r from-primary to-primary-soft" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

function SliderCard({ label, value, accent, onChange }) {
  return (
    <div className="rounded-[1.7rem] bg-canvas p-5">
      <div className="mb-4 flex items-center justify-between">
        <label className="text-sm font-semibold">{label}</label>
        <span className={`rounded-full px-3 py-1 text-sm font-semibold ${accent}`}>{value}/10</span>
      </div>
      <input
        className="range-thumb h-2 w-full cursor-pointer appearance-none rounded-full bg-white"
        max="10"
        min="1"
        onChange={(event) => onChange(Number(event.target.value))}
        type="range"
        value={value}
      />
    </div>
  );
}

function QuestionBlock({ title, questions, answers, onChange }) {
  return (
    <div className="rounded-[1.7rem] bg-canvas p-5">
      <p className="text-sm font-semibold">{title}</p>
      <div className="mt-4 space-y-3">
        {questions.map((question, index) => (
          <div className="rounded-[1.2rem] bg-white p-4" key={question}>
            <p className="text-sm leading-6 text-ink/68">{question}</p>
            <div className="mt-3 grid grid-cols-5 gap-2">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  className={`rounded-full px-3 py-2 text-sm font-semibold transition ${
                    answers[index] === value ? "bg-primary text-white" : "bg-canvas text-ink/65 hover:bg-primary/10"
                  }`}
                  key={value}
                  onClick={(event) => {
                    event.preventDefault();
                    onChange(index, value);
                  }}
                  type="button"
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ text }) {
  return <div className="rounded-[1.4rem] bg-canvas px-4 py-6 text-sm leading-6 text-ink/58">{text}</div>;
}

function GuidanceSection({ title, items, tone = "bg-canvas" }) {
  if (!items?.length) {
    return null;
  }

  return (
    <div className={`rounded-[1.4rem] ${tone} px-4 py-4`}>
      <p className="text-xs uppercase tracking-[0.3em] text-ink/42">{title}</p>
      <div className="mt-3 space-y-2">
        {items.map((item) => (
          <p className="text-sm leading-6 text-ink/68" key={item}>
            {item}
          </p>
        ))}
      </div>
    </div>
  );
}

function ProfessionalGuidance({ guidance }) {
  if (!guidance) {
    return <EmptyState text="Complete a full assessment to generate a structured professional guidance report." />;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-[1.5rem] bg-[#fff8f0] px-5 py-5">
        <p className="text-xs uppercase tracking-[0.35em] text-ink/42">{guidance.report_label || "AI Guidance"}</p>
        <p className="mt-3 text-base leading-7 text-ink/72">{guidance.summary}</p>
      </div>

      <GuidanceSection items={guidance.risk_drivers} title="Key Risk Drivers" />
      <GuidanceSection items={guidance.today_actions} title="What To Do Today" tone="bg-soft/60" />
      <GuidanceSection items={guidance.follow_up_actions} title="What To Monitor Next" tone="bg-[#f4eee6]" />

      {guidance.escalation_note && (
        <div className="rounded-[1.4rem] bg-[#fff4ea] px-4 py-4">
          <p className="text-xs uppercase tracking-[0.3em] text-ink/42">When To Seek Help</p>
          <p className="mt-3 text-sm leading-6 text-ink/68">{guidance.escalation_note}</p>
        </div>
      )}
    </div>
  );
}

function TrendChart({ points }) {
  if (!points.length) {
    return <EmptyState text="Trend chart will appear after several check-ins are available." />;
  }

  const width = 560;
  const height = 220;
  const padding = 24;
  const moodPoints = points.map((point, index) => {
    const x = padding + (index * (width - padding * 2)) / Math.max(points.length - 1, 1);
    const y = height - padding - ((point.mood || 0) / 10) * (height - padding * 2);
    return `${x},${y}`;
  });
  const riskPoints = points.map((point, index) => {
    const x = padding + (index * (width - padding * 2)) / Math.max(points.length - 1, 1);
    const y = height - padding - ((point.risk_score || 0) / 1) * (height - padding * 2);
    return `${x},${y}`;
  });

  return (
    <div>
      <svg className="w-full" viewBox={`0 0 ${width} ${height}`}>
        <rect fill="#f7f1e8" height={height} rx="28" width={width} />
        {[0.25, 0.5, 0.75].map((level) => (
          <line
            key={level}
            stroke="rgba(51,65,85,0.09)"
            strokeDasharray="5 6"
            strokeWidth="1"
            x1={padding}
            x2={width - padding}
            y1={height - padding - level * (height - padding * 2)}
            y2={height - padding - level * (height - padding * 2)}
          />
        ))}
        <polyline fill="none" points={moodPoints.join(" ")} stroke="#a5bc63" strokeLinecap="round" strokeWidth="4" />
        <polyline fill="none" points={riskPoints.join(" ")} stroke="#f5821f" strokeLinecap="round" strokeWidth="4" />
        {points.map((point, index) => {
          const x = padding + (index * (width - padding * 2)) / Math.max(points.length - 1, 1);
          const moodY = height - padding - ((point.mood || 0) / 10) * (height - padding * 2);
          const riskY = height - padding - ((point.risk_score || 0) / 1) * (height - padding * 2);
          return (
            <g key={point.created_at}>
              <circle cx={x} cy={moodY} fill="#a5bc63" r="5" />
              <circle cx={x} cy={riskY} fill="#f5821f" r="5" />
            </g>
          );
        })}
      </svg>
      <div className="mt-4 flex flex-wrap gap-4 text-sm text-ink/62">
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-primary-soft" />
          Mood
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-primary" />
          Risk score
        </span>
      </div>
    </div>
  );
}

function SoundCard({ title, subtitle }) {
  return (
    <div className="rounded-[1.6rem] bg-canvas p-5">
      <div className="sound-bars">
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
      <h4 className="mt-4 text-base font-semibold">{title}</h4>
      <p className="mt-2 text-sm text-ink/62">{subtitle}</p>
      <button className="mt-4 rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink" type="button">
        Play Preview
      </button>
    </div>
  );
}

function ToggleRow({ label, description, enabled, onToggle }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[1.4rem] bg-canvas px-4 py-4">
      <div>
        <p className="text-sm font-semibold">{label}</p>
        <p className="mt-1 text-sm text-ink/58">{description}</p>
      </div>
      <button
        className={`relative h-8 w-16 rounded-full transition ${enabled ? "bg-primary-soft" : "bg-ink/15"}`}
        onClick={onToggle}
        type="button"
      >
        <span
          className={`absolute top-1 h-6 w-6 rounded-full bg-white transition ${enabled ? "left-9" : "left-1"}`}
        />
      </button>
    </div>
  );
}

function DeviceCard({ device, status }) {
  return (
    <div className="rounded-[1.5rem] bg-canvas p-5">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white text-sm font-bold text-ink">
        {device
          .split(" ")
          .map((part) => part[0])
          .join("")}
      </div>
      <h4 className="mt-4 text-base font-semibold">{device}</h4>
      <button className="mt-4 rounded-full bg-white px-4 py-2 text-sm font-semibold text-ink" type="button">
        {status}
      </button>
    </div>
  );
}

function AppRoutes({
  session,
  authMode,
  setAuthMode,
  authForm,
  setAuthForm,
  authLoading,
  statusMessage,
  pageLoading,
  submitLoading,
  dashboardData,
  insightsData,
  historyData,
  adminOverview,
  adminDetail,
  adminAuthenticated,
  adminForm,
  adminLoading,
  onAuthSubmit,
  onAnonymous,
  onLogout,
  onCheckInSubmit,
  onSeedDemo,
  onFeedback,
  onSelectAdminUser,
  onAdminFormChange,
  onAdminLogin,
}) {
  return (
    <Routes>
      <Route element={!session ? <WelcomePage /> : <Navigate replace to="/dashboard" />} path="/" />
      <Route
        element={
          session ? (
            <Navigate replace to="/dashboard" />
          ) : (
            <AuthPage
              authForm={authForm}
              authLoading={authLoading}
              authMode={authMode}
              onAnonymous={onAnonymous}
              onAuthSubmit={onAuthSubmit}
              setAuthForm={setAuthForm}
              setAuthMode={setAuthMode}
            />
          )
        }
        path="/auth"
      />
      <Route
        element={
          <AdminStandalonePage
            adminDetail={adminDetail}
            adminForm={adminForm}
            adminLoading={adminLoading}
            adminOverview={adminOverview}
            isAuthenticated={adminAuthenticated}
            onAdminFormChange={onAdminFormChange}
            onAdminLogin={onAdminLogin}
            onSelectUser={onSelectAdminUser}
          />
        }
        path="/admin"
      />
      <Route
        element={
          session ? (
            <AppShell onLogout={onLogout} session={session} statusMessage={statusMessage} />
          ) : (
            <Navigate replace to="/auth" />
          )
        }
      >
        <Route element={<DashboardPage data={dashboardData} onSeedDemo={onSeedDemo} pageLoading={pageLoading} />} path="/dashboard" />
        <Route
          element={
            <CheckInPage
              onSubmit={onCheckInSubmit}
              questionnaireStatus={dashboardData?.questionnaire_status}
              submitLoading={submitLoading}
            />
          }
          path="/check-in"
        />
        <Route element={<RiskResultPage data={dashboardData} />} path="/risk-result" />
        <Route element={<InsightsPage history={historyData} insights={insightsData} />} path="/insights" />
        <Route element={<HistoryPage history={historyData} />} path="/history" />
        <Route element={<WellnessPage />} path="/wellness" />
        <Route element={<SettingsPage onFeedback={onFeedback} session={session} />} path="/settings" />
      </Route>
      <Route element={<Navigate replace to={session ? "/dashboard" : "/"} />} path="*" />
    </Routes>
  );
}

export default function App() {
  const navigate = useNavigate();
  const [session, setSession] = useState(() => getStoredSession());
  const [adminSession, setAdminSession] = useState(() => getStoredAdminSession());
  const [authMode, setAuthMode] = useState("login");
  const [authForm, setAuthForm] = useState(authFormDefaults);
  const [adminForm, setAdminForm] = useState({ email: "", password: "" });
  const [dashboardData, setDashboardData] = useState(null);
  const [insightsData, setInsightsData] = useState(null);
  const [historyData, setHistoryData] = useState({ items: [] });
  const [adminOverview, setAdminOverview] = useState(null);
  const [adminDetail, setAdminDetail] = useState(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(false);

  useEffect(() => {
    if (!session?.user_id) {
      return;
    }
    loadAppData(session.user_id);
  }, [session?.user_id]);

  useEffect(() => {
    if (!adminSession?.admin_token) {
      setAdminOverview(null);
      setAdminDetail(null);
      return;
    }

    loadAdminOverview();
  }, [adminSession?.admin_token]);

  async function loadAdminOverview() {
    try {
      const overview = await apiRequest("/admin/overview", {
        headers: {
          "x-admin-token": adminSession?.admin_token || "",
        },
      });
      setAdminOverview(overview);
    } catch (error) {
      if ((error.message || "").toLowerCase().includes("admin")) {
        clearAdminSession();
        setAdminSession(null);
      }
      setAdminOverview(null);
      setAdminDetail(null);
      setStatusMessage(
        (error.message || "").toLowerCase().includes("admin")
          ? "Admin session expired. Please sign in again."
          : error.message || "Could not load admin analytics.",
      );
    }
  }

  async function loadAppData(userId) {
    setPageLoading(true);
    try {
      const [dashboard, insights, history, overview] = await Promise.all([
        apiRequest(`/dashboard/${userId}`),
        apiRequest(`/insights/${userId}`).catch(() => null),
        apiRequest(`/history/${userId}`).catch(() => ({ items: [] })),
        adminSession?.admin_token
          ? apiRequest("/admin/overview", {
              headers: {
                "x-admin-token": adminSession.admin_token,
              },
            }).catch(() => null)
          : Promise.resolve(null),
      ]);
      setDashboardData(dashboard);
      setInsightsData(insights);
      setHistoryData(history);
      setAdminOverview(overview);
    } catch (error) {
      setStatusMessage(error.message || "Could not load application data.");
    } finally {
      setPageLoading(false);
    }
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setAuthLoading(true);
    setStatusMessage("");
    try {
      const path = authMode === "register" ? "/register" : "/login";
      const payload = await apiRequest(path, {
        method: "POST",
        body: JSON.stringify(authForm),
      });
      setSession(payload);
      saveSession(payload);
      setAuthForm(authFormDefaults);
      setStatusMessage(authMode === "register" ? "Account created successfully." : "Welcome back.");
      navigate("/dashboard");
    } catch (error) {
      setStatusMessage(error.message);
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleAnonymousMode() {
    setAuthLoading(true);
    setStatusMessage("");
    try {
      const payload = await apiRequest("/anonymous", { method: "POST" });
      setSession(payload);
      saveSession(payload);
      setStatusMessage("Anonymous session started.");
      navigate("/dashboard");
    } catch (error) {
      setStatusMessage(error.message);
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleCheckInSubmit(form) {
    if (!session?.user_id) {
      return;
    }

    setSubmitLoading(true);
    setStatusMessage("");
    try {
      await apiRequest("/mood", {
        method: "POST",
        body: JSON.stringify({
          user_id: session.user_id,
          mood: Number(form.mood),
          stress: Number(form.stress),
          sleep: Number(form.sleep),
          energy: Number(form.energy),
          note: form.note.trim(),
        }),
      });

      if (form.includeQuestionnaire) {
        await apiRequest("/questionnaire", {
          method: "POST",
          body: JSON.stringify({
            user_id: session.user_id,
            phq9_answers: form.phq9_answers.map(Number),
            gad7_answers: form.gad7_answers.map(Number),
          }),
        });
      }

      if (form.text.trim()) {
        await apiRequest("/journal", {
          method: "POST",
          body: JSON.stringify({
            user_id: session.user_id,
            text: form.text.trim(),
          }),
        });
      }

      await apiRequest(`/assess/${session.user_id}`, { method: "POST" });
      await loadAppData(session.user_id);
      setStatusMessage("AI risk assessment updated successfully.");
    } catch (error) {
      setStatusMessage(error.message);
    } finally {
      setSubmitLoading(false);
    }
  }

  async function handleSeedDemo() {
    if (!session?.user_id) {
      return;
    }
    try {
      await apiRequest(`/demo/seed/${session.user_id}`);
      await loadAppData(session.user_id);
      setStatusMessage("Demo data loaded. The app now shows a fuller narrative for presentation.");
    } catch (error) {
      setStatusMessage(error.message);
    }
  }

  async function handleFeedback(feedback) {
    if (!session?.user_id) {
      return;
    }
    try {
      await apiRequest("/feedback", {
        method: "POST",
        body: JSON.stringify({
          user_id: session.user_id,
          category: feedback.category,
          message: feedback.message,
        }),
      });
      setStatusMessage("Feedback submitted.");
      await loadAppData(session.user_id);
    } catch (error) {
      setStatusMessage(error.message);
    }
  }

  async function handleSelectAdminUser(userId) {
    setAdminLoading(true);
    try {
      const detail = await apiRequest(`/admin/user/${userId}`, {
        headers: {
          "x-admin-token": adminSession?.admin_token || "",
        },
      });
      setAdminDetail(detail);
    } catch (error) {
      if ((error.message || "").toLowerCase().includes("admin")) {
        clearAdminSession();
        setAdminSession(null);
        setAdminOverview(null);
        setAdminDetail(null);
        setStatusMessage("Admin session expired. Please sign in again.");
      } else {
        setStatusMessage(error.message);
      }
    } finally {
      setAdminLoading(false);
    }
  }

  async function handleAdminLogin(event) {
    event.preventDefault();
    setAdminLoading(true);
    try {
      const payload = await apiRequest("/admin/login", {
        method: "POST",
        body: JSON.stringify(adminForm),
      });
      setAdminSession(payload);
      saveAdminSession(payload);
      setAdminForm({ email: "", password: "" });
      const overview = await apiRequest("/admin/overview", {
        headers: {
          "x-admin-token": payload.admin_token,
        },
      });
      setAdminOverview(overview);
      setStatusMessage("Admin access granted.");
    } catch (error) {
      setStatusMessage(error.message);
    } finally {
      setAdminLoading(false);
    }
  }

  function handleLogout() {
    clearSession();
    clearAdminSession();
    setSession(null);
    setAdminSession(null);
    setDashboardData(null);
    setInsightsData(null);
    setHistoryData({ items: [] });
    setAdminOverview(null);
    setAdminDetail(null);
    setStatusMessage("Session cleared.");
    navigate("/");
  }

  return (
    <AppRoutes
      adminDetail={adminDetail}
      adminAuthenticated={Boolean(adminSession?.admin_token)}
      adminForm={adminForm}
      adminLoading={adminLoading}
      adminOverview={adminOverview}
      authForm={authForm}
      authLoading={authLoading}
      authMode={authMode}
      dashboardData={dashboardData}
      historyData={historyData}
      insightsData={insightsData}
      onAnonymous={handleAnonymousMode}
      onAuthSubmit={handleAuthSubmit}
      onCheckInSubmit={handleCheckInSubmit}
      onFeedback={handleFeedback}
      onLogout={handleLogout}
      onAdminFormChange={setAdminForm}
      onAdminLogin={handleAdminLogin}
      onSeedDemo={handleSeedDemo}
      onSelectAdminUser={handleSelectAdminUser}
      pageLoading={pageLoading}
      session={session}
      setAuthForm={setAuthForm}
      setAuthMode={setAuthMode}
      statusMessage={statusMessage}
      submitLoading={submitLoading}
    />
  );
}

export function RootApp() {
  return (
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );
}
