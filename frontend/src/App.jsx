import { useEffect, useRef, useState } from "react";
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
const screeningQuestions = [
  ...phqQuestions.map((question, index) => ({
    group: "Mood and emotional strain",
    key: `phq-${index}`,
    question,
    source: "phq9_answers",
    index,
  })),
  ...gadQuestions.map((question, index) => ({
    group: "Stress and anxiety pattern",
    key: `gad-${index}`,
    question,
    source: "gad7_answers",
    index,
  })),
];
const screeningScale = [
  { value: 1, label: "Strongly Disagree", tone: "border-[#ff8c88] bg-[#fff0f0]" },
  { value: 2, label: "Disagree", tone: "border-[#ffb47f] bg-[#fff5ec]" },
  { value: 3, label: "Neutral", tone: "border-[#c7d0d5] bg-[#f7fafb]" },
  { value: 4, label: "Agree", tone: "border-[#63c978] bg-[#edf9ef]" },
  { value: 5, label: "Strongly Agree", tone: "border-[#00c799] bg-[#e9fbf6]" },
];
const focusOptions = ["Rest", "Focus", "Study", "Workload", "Social", "Movement"];
const soundscapes = [
  { id: "rain", title: "Rain Garden", subtitle: "Soft rain-inspired ambient chords", frequency: 174 },
  { id: "stream", title: "Mountain Stream", subtitle: "Light flowing tones for decompression", frequency: 220 },
  { id: "night", title: "Night Wind", subtitle: "Low-noise calm for evening recovery", frequency: 136 },
  { id: "forest", title: "Forest Dawn", subtitle: "Warm morning texture for gentle focus", frequency: 196 },
];
const BREATHING_SESSION_SECONDS = 60;
const breathingCycle = [
  {
    label: "Breathe In",
    duration: 4,
    instruction: "Slow inhale through the nose",
    className: "breathing-orb--inhale",
  },
  {
    label: "Hold",
    duration: 2,
    instruction: "Keep the breath soft",
    className: "breathing-orb--hold",
  },
  {
    label: "Breathe Out",
    duration: 6,
    instruction: "Long relaxed exhale",
    className: "breathing-orb--exhale",
  },
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

function getBreathingPhase(elapsedSeconds) {
  const totalCycle = breathingCycle.reduce((sum, item) => sum + item.duration, 0);
  let cursor = elapsedSeconds % totalCycle;

  for (const phase of breathingCycle) {
    if (cursor < phase.duration) {
      return {
        ...phase,
        remainingInPhase: phase.duration - cursor,
      };
    }
    cursor -= phase.duration;
  }

  return {
    ...breathingCycle[0],
    remainingInPhase: breathingCycle[0].duration,
  };
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

function calcStreak(historyItems) {
  if (!historyItems?.length) return 0;
  const toDay = (d) => Math.floor(new Date(d).getTime() / 86400000);
  const days = [...new Set(historyItems.map((item) => toDay(item.created_at)))].sort((a, b) => b - a);
  if (days[0] < toDay(new Date()) - 1) return 0;
  let streak = 1;
  for (let i = 1; i < days.length; i++) {
    if (days[i - 1] - days[i] === 1) streak++;
    else break;
  }
  return streak;
}

function calcBaseline(historyItems) {
  const recent = (historyItems || []).slice(0, 7);
  if (recent.length < 2) return null;
  return {
    mood: averageValue(recent, (item) => item.mood, 1),
    stress: averageValue(recent, (item) => item.stress, 1),
    sleep: averageValue(recent, (item) => item.sleep, 1),
    energy: averageValue(recent, (item) => item.energy, 1),
  };
}

function calcConsistency(historyItems) {
  if (!historyItems?.length) return 0;
  const toDay = (d) => Math.floor(new Date(d).getTime() / 86400000);
  const today = toDay(new Date());
  const days = new Set(historyItems.map((item) => toDay(item.created_at)));
  let count = 0;
  for (let i = 0; i < 7; i++) {
    if (days.has(today - i)) count++;
  }
  return Math.round((count / 7) * 100);
}

function scoreTone(level) {
  if (level === "HIGH") {
    return "from-[#e07070] to-[#c75454]";
  }
  if (level === "MEDIUM") {
    return "from-[#E8B97A] to-[#C9953A]";
  }
  return "from-[#5BA898] to-[#4E7FA8]";
}

function riskToneText(level) {
  if (level === "HIGH") {
    return "text-[#b03030]";
  }
  if (level === "MEDIUM") {
    return "text-[#9a6310]";
  }
  return "text-[#2e7065]";
}

function currentSectionLabel(pathname) {
  if (pathname === "/admin") {
    return "Admin";
  }

  return navItems.find((item) => item.to === pathname)?.label || "MindTrack";
}

function severityBadge(level) {
  if (level === "HIGH") {
    return "bg-[#fde8e8] text-[#b03030]";
  }
  if (level === "MEDIUM") {
    return "bg-[#fef3dc] text-[#9a6310]";
  }
  return "bg-[#ddf0ec] text-[#2e7065]";
}

function AppShell({ session, statusMessage, onLogout }) {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-canvas px-4 py-4 text-ink sm:px-6">
      <div className="mx-auto grid max-w-7xl gap-6 xl:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="h-fit rounded-[2rem] bg-sidebar p-5 text-white shadow-panel xl:sticky xl:top-4">
          <div className="rounded-[1.6rem] bg-white/8 p-5">
            <MindTrackLogo tone="dark" />
            <h1 className="mt-4 font-display text-4xl leading-none">Your wellness space</h1>
            <p className="mt-3 text-sm text-white/72">
              Gentle daily check-ins and steady awareness for long-term wellbeing.
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
            <p className="text-xs uppercase tracking-[0.3em] text-white/62">Current page</p>
            <p className="mt-2 text-lg font-semibold">
              {currentSectionLabel(location.pathname)}
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
                <p className="text-xs uppercase tracking-[0.35em] text-ink/40">Wellness Dashboard</p>
                <h2 className="mt-2 font-display text-4xl sm:text-5xl">Mental Health Monitoring</h2>
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
    <div className="flex min-h-screen flex-col items-center justify-center bg-canvas px-4 py-12 text-ink sm:px-6">
      <div className="mx-auto w-full max-w-4xl">
        <section className="relative overflow-hidden rounded-[2.4rem] bg-gradient-to-br from-sidebar via-[#3A6A8A] to-primary p-10 text-white shadow-panel sm:p-14">
          <div className="absolute left-[-60px] top-[-60px] h-48 w-48 rounded-full bg-white/6" />
          <div className="absolute right-[-40px] bottom-[-40px] h-56 w-56 rounded-full bg-white/5 blur-2xl" />
          <div className="relative text-center">
            <div className="mb-8 flex justify-center">
              <MindTrackLogo tone="hero" />
            </div>
            <h1 className="font-display text-5xl leading-[1.05] sm:text-6xl">
              Take care of your mind,<br />one day at a time.
            </h1>
            <p className="mx-auto mt-5 max-w-lg text-base leading-7 text-white/80">
              Track your mood, reflect on your day, and notice patterns over time. Private, simple, and always at your pace.
            </p>
            <div className="mt-10 flex flex-wrap justify-center gap-3">
              <Link
                className="rounded-full bg-white px-8 py-3.5 text-sm font-semibold text-ink transition hover:brightness-95"
                to="/auth"
              >
                Get Started
              </Link>
              <Link
                className="rounded-full border border-white/25 px-8 py-3.5 text-sm font-semibold text-white transition hover:bg-white/10"
                to="/auth"
              >
                Sign In
              </Link>
            </div>
          </div>
        </section>

        <div className="mt-6 grid gap-4 sm:grid-cols-3" id="journey">
          <WelcomeStep number="01" title="Check In" text="Share how you're feeling — mood, sleep, stress, energy." color="bg-soft" />
          <WelcomeStep number="02" title="Reflect" text="Write a few lines. Journaling helps reveal what's weighing on you." color="bg-calm/60" />
          <WelcomeStep number="03" title="Notice Patterns" text="See trends over time and get supportive guidance." color="bg-sand" />
        </div>
      </div>
    </div>
  );
}

function AuthPage({ authMode, setAuthMode, authForm, setAuthForm, authLoading, onAuthSubmit, onAnonymous }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10 text-ink sm:px-6">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center text-center">
          <MindTrackLogo />
          <h1 className="mt-3 font-display text-4xl">Welcome back</h1>
          <p className="mt-2 text-sm text-ink/55">Sign in or create an account to continue.</p>
        </div>

        <section className="rounded-[2rem] bg-white p-6 shadow-panel sm:p-8">
          <div className="mb-6 flex rounded-full bg-canvas p-1">
            <button
              className={`flex-1 rounded-full px-4 py-2.5 text-sm font-semibold transition ${
                authMode === "login" ? "bg-primary text-white shadow-sm" : "text-ink/60"
              }`}
              onClick={() => setAuthMode("login")}
              type="button"
            >
              Sign In
            </button>
            <button
              className={`flex-1 rounded-full px-4 py-2.5 text-sm font-semibold transition ${
                authMode === "register" ? "bg-primary text-white shadow-sm" : "text-ink/60"
              }`}
              onClick={() => setAuthMode("register")}
              type="button"
            >
              Create Account
            </button>
          </div>

          <form className="space-y-4" onSubmit={onAuthSubmit}>
            <FormField
              label="Email"
              onChange={(value) => setAuthForm((current) => ({ ...current, email: value }))}
              placeholder="you@example.com"
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
              {authLoading ? "Please wait..." : authMode === "register" ? "Create Account" : "Sign In"}
            </button>
          </form>

          <div className="my-5 flex items-center gap-3 text-xs text-ink/30">
            <span className="h-px flex-1 bg-line" />
            or
            <span className="h-px flex-1 bg-line" />
          </div>

          <button
            className="w-full rounded-[1.2rem] border border-line bg-sand px-5 py-3 text-sm font-semibold text-ink transition hover:border-primary/30 hover:bg-soft disabled:cursor-not-allowed disabled:opacity-60"
            disabled={authLoading}
            onClick={onAnonymous}
            type="button"
          >
            Try without an account
          </button>

          <p className="mt-5 text-center text-xs text-ink/40">
            For personal wellness tracking only — not a clinical service.
          </p>
        </section>

        <div className="mt-5 text-center">
          <Link className="text-sm text-ink/50 hover:text-ink" to="/">
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}

function DashboardPage({ data, history, pageLoading, onSeedDemo }) {
  const assessment = data?.latest_assessment;
  const score = normalizePercent(assessment?.risk_score);
  const questionnaireStatus = data?.questionnaire_status;
  const guidance = data?.guidance;
  const historyItems = history?.items || [];
  const streak = calcStreak(historyItems);
  const consistency = calcConsistency(historyItems);
  const baseline = calcBaseline(historyItems);
  const latestMood = data?.latest_mood;
  const isHighRisk = assessment?.risk_level === "HIGH";

  return (
    <div className="space-y-6">
      {isHighRisk && (
        <div className="rounded-2xl border border-[#f5c6c6] bg-[#fff5f5] p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#b03030]">Safety Notice</p>
              <p className="mt-2 text-sm leading-6 text-ink/75">
                Your current screening shows elevated risk signals. You don&apos;t need to face this alone.
                Reaching out to someone you trust — a friend, counselor, or helpline — can make a real difference.
              </p>
            </div>
            <div className="flex shrink-0 flex-col gap-2 text-right text-xs text-ink/50">
              <span>Crisis line (KZ): <strong className="text-ink">150</strong></span>
              <span>WHO helpline: <strong className="text-ink">+7 727 272-22-77</strong></span>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl bg-white px-5 py-4 shadow-panel">
          <p className="text-xs uppercase tracking-[0.3em] text-ink/42">Check-In Streak</p>
          <p className="mt-2 text-3xl font-semibold text-primary">{streak}</p>
          <p className="mt-1 text-sm text-ink/55">{streak === 1 ? "day" : "days"} in a row</p>
        </div>
        <div className="rounded-xl bg-white px-5 py-4 shadow-panel">
          <p className="text-xs uppercase tracking-[0.3em] text-ink/42">Weekly Consistency</p>
          <p className="mt-2 text-3xl font-semibold text-primary-soft">{consistency}%</p>
          <p className="mt-1 text-sm text-ink/55">last 7 days</p>
        </div>
        {baseline && latestMood ? (
          <div className="rounded-xl bg-white px-5 py-4 shadow-panel">
            <p className="text-xs uppercase tracking-[0.3em] text-ink/42">vs Your Baseline</p>
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
              <BaselineDelta label="Mood" current={latestMood.mood} base={baseline.mood} />
              <BaselineDelta label="Stress" current={latestMood.stress} base={baseline.stress} invert />
              <BaselineDelta label="Sleep" current={latestMood.sleep} base={baseline.sleep} />
              <BaselineDelta label="Energy" current={latestMood.energy} base={baseline.energy} />
            </div>
          </div>
        ) : (
          <div className="rounded-xl bg-white px-5 py-4 shadow-panel">
            <p className="text-xs uppercase tracking-[0.3em] text-ink/42">Personal Baseline</p>
            <p className="mt-3 text-sm text-ink/50">Available after 2+ check-ins.</p>
          </div>
        )}
      </div>

      {questionnaireStatus && (
        <div className="rounded-[1.6rem] border border-line bg-white px-5 py-4 shadow-sm">
          <p className="text-xs uppercase tracking-[0.35em] text-ink/45">Deeper screening</p>
          <div className="mt-2 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <p className="text-sm leading-6 text-ink/68">{questionnaireStatus.message}</p>
            <span
              className={`inline-flex rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.25em] ${
                questionnaireStatus.due_now ? "bg-[#fde8e8] text-[#b03030]" : "bg-[#ddf0ec] text-[#2e7065]"
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

          <Card title="Support Plan" eyebrow="AI Guidance">
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
                  <div className="rounded-[1.4rem] bg-[#EAF2FF] px-4 py-4" key={alert.id}>
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

          <Card title="Recommendation queue" eyebrow="Support Plan">
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
  const [form, setForm] = useState({
    ...moodDefaults,
    phq9_answers: Array(9).fill(null),
    gad7_answers: Array(7).fill(null),
    includeQuestionnaire: Boolean(questionnaireStatus?.due_now),
    focus: "Rest",
    text: "",
  });
  const [screeningStep, setScreeningStep] = useState(0);
  const [validationMessage, setValidationMessage] = useState("");
  const activeQuestion = screeningQuestions[screeningStep];
  const answeredCount = screeningQuestions.filter((item) => form[item.source][item.index] !== null).length;
  const progressPercent = Math.round((answeredCount / screeningQuestions.length) * 100);

  useEffect(() => {
    setForm((current) => ({
      ...current,
      includeQuestionnaire: current.includeQuestionnaire || Boolean(questionnaireStatus?.due_now),
    }));
  }, [questionnaireStatus?.due_now]);

  async function handleSubmit(event) {
    event.preventDefault();
    setValidationMessage("");

    if (form.includeQuestionnaire) {
      const missingIndex = screeningQuestions.findIndex((item) => form[item.source][item.index] === null);
      if (missingIndex >= 0) {
        setScreeningStep(missingIndex);
        setValidationMessage(`Please answer statement ${missingIndex + 1} before submitting the deeper screening.`);
        return;
      }
    }

    await onSubmit(form);
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <section className="rounded-[2rem] bg-white p-6 shadow-panel">
        <p className="text-xs uppercase tracking-[0.35em] text-ink/45">Step 1</p>
        <h3 className="mt-3 font-display text-4xl">Daily mood check-in</h3>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="grid gap-4">
            <SliderCard
              accent="bg-soft text-primary"
              label="Mood"
              value={form.mood}
              onChange={(value) => setForm((current) => ({ ...current, mood: value }))}
            />
            <SliderCard
              accent="bg-soft text-primary-soft"
              label="Energy"
              value={form.energy}
              onChange={(value) => setForm((current) => ({ ...current, energy: value }))}
            />
            <FocusSelector
              options={focusOptions}
              value={form.focus}
              onChange={(value) => setForm((current) => ({ ...current, focus: value }))}
            />
          </div>

          <div className="grid gap-4">
            <SliderCard
              accent="bg-calm/55 text-primary"
              label="Stress"
              value={form.stress}
              onChange={(value) => setForm((current) => ({ ...current, stress: value }))}
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
                  className="min-h-[124px] w-full rounded-[1.1rem] border border-line bg-white px-4 py-3 outline-none transition focus:border-primary"
                  onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))}
                  placeholder="Describe what stood out today..."
                  value={form.note}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] bg-white p-6 shadow-panel">
        <p className="text-xs uppercase tracking-[0.35em] text-ink/45">Step 2</p>
        <h3 className="mt-3 font-display text-4xl">Deeper screening</h3>
        <div className="mt-4 rounded-[1.5rem] bg-gradient-to-r from-[#EAF2FF] to-[#EEF3F9] px-5 py-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-semibold text-ink">Want a deeper check-in?</p>
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
          Use the 1 to 5 scale below, where 1 means "not like me today" and 5 means "very true for me lately".
        </div>

        {form.includeQuestionnaire ? (
          <div className="mt-6 space-y-6">
            <QuestionnaireFlow
              activeQuestion={activeQuestion}
              answeredCount={answeredCount}
              onAnswer={(value) => {
                setValidationMessage("");
                setForm((current) => ({
                  ...current,
                  [activeQuestion.source]: current[activeQuestion.source].map((item, currentIndex) =>
                    currentIndex === activeQuestion.index ? (item === value ? null : value) : item,
                  ),
                }));
              }}
              onNext={() => setScreeningStep((current) => Math.min(current + 1, screeningQuestions.length - 1))}
              onPrevious={() => setScreeningStep((current) => Math.max(current - 1, 0))}
              progressPercent={progressPercent}
              selectedValue={form[activeQuestion.source][activeQuestion.index]}
              step={screeningStep}
              total={screeningQuestions.length}
              validationMessage={validationMessage}
            />
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
          <div className="rounded-[1.7rem] bg-gradient-to-br from-[#EAF2FF] to-[#E8F2EF] p-6">
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
              {submitLoading ? "Calculating your assessment..." : "Submit & View Results"}
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

  if (!assessment) {
    return (
      <div className="rounded-[2rem] bg-white p-8 text-center shadow-panel">
        <div className="mx-auto flex max-w-2xl flex-col items-center">
          <MindTrackLogo />
          <p className="mt-8 text-xs uppercase tracking-[0.35em] text-ink/45">Risk Result</p>
          <h3 className="mt-3 font-display text-4xl">No assessment yet</h3>
          <p className="mt-4 max-w-lg text-sm leading-6 text-ink/62">
            Complete a check-in first so MindTrack can calculate a fresh risk result and build a support plan.
          </p>
          <Link
            className="mt-7 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-white transition hover:brightness-95"
            to="/check-in"
          >
            Start Check-In
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
    {assessment?.risk_level === "HIGH" && (
      <div className="rounded-2xl border border-[#f5c6c6] bg-[#fff5f5] p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#b03030]">Reach out — you don&apos;t have to manage this alone</p>
        <p className="mt-2 text-sm leading-6 text-ink/70">
          These results suggest elevated distress. Speaking with someone you trust — a counselor, doctor,
          or crisis line — is a meaningful next step.
        </p>
        <div className="mt-3 flex flex-wrap gap-3 text-xs text-ink/55">
          <span>Crisis line (KZ): <strong className="text-ink">150</strong></span>
          <span>WHO: <strong className="text-ink">+7 727 272-22-77</strong></span>
          <span>Text a trusted person today.</span>
        </div>
      </div>
    )}
    <div className="grid gap-6 xl:grid-cols-[0.92fr_1.08fr]">
      <section className="space-y-6">
        <div className="rounded-2xl bg-white p-6 shadow-panel">
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
        <Card title="Support Plan" eyebrow="AI Guidance">
          <ProfessionalGuidance guidance={guidance} />
        </Card>

        <Card title="Explainable factors" eyebrow="Key Signals">
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
    </div>
  );
}

function InsightsPage({ insights, history }) {
  const historyItems = history?.items || [];
  const weekItems = historyItems.slice(0, 7);
  const streak = calcStreak(historyItems);
  const baseline = calcBaseline(historyItems);
  const consistency = calcConsistency(historyItems);
  const avgMood = averageValue(weekItems, (item) => item.mood, 1);
  const avgStress = averageValue(weekItems, (item) => item.stress, 1);
  const avgSleep = averageValue(weekItems, (item) => item.sleep, 1);
  const bestDay = weekItems.reduce((best, item) => (!best || item.mood > best.mood ? item : best), null);
  const worstDay = weekItems.reduce((worst, item) => (!worst || item.mood < worst.mood ? item : worst), null);

  return (
    <div className="space-y-6">
      {weekItems.length >= 2 && (
        <div className="rounded-2xl bg-gradient-to-br from-sidebar to-primary p-6 text-white shadow-panel">
          <p className="text-xs uppercase tracking-[0.35em] text-white/65">Weekly Report</p>
          <h3 className="mt-2 font-display text-3xl">7-Day Summary</h3>
          <div className="mt-5 grid gap-4 sm:grid-cols-4">
            <StatBlock label="Avg Mood" value={`${avgMood}/10`} />
            <StatBlock label="Avg Stress" value={`${avgStress}/10`} />
            <StatBlock label="Avg Sleep" value={`${avgSleep}h`} />
            <StatBlock label="Consistency" value={`${consistency}%`} />
          </div>
          {(bestDay || worstDay) && (
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              {bestDay && (
                <div className="rounded-xl bg-white/10 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.25em] text-white/62">Best day</p>
                  <p className="mt-1 text-sm font-semibold">Mood {bestDay.mood}/10</p>
                  <p className="text-xs text-white/55">{formatDate(bestDay.created_at)}</p>
                </div>
              )}
              {worstDay && worstDay !== bestDay && (
                <div className="rounded-xl bg-white/10 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.25em] text-white/62">Hardest day</p>
                  <p className="mt-1 text-sm font-semibold">Mood {worstDay.mood}/10</p>
                  <p className="text-xs text-white/55">{formatDate(worstDay.created_at)}</p>
                </div>
              )}
            </div>
          )}
          {streak > 0 && (
            <p className="mt-4 text-sm text-white/72">
              {streak}-day check-in streak — keep the habit going.
            </p>
          )}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Card title="Weekly trend" eyebrow="Insights">
          <TrendChart points={insights?.trend_points || []} />
        </Card>

        <Card title="Pattern scan" eyebrow="Deviation Detection">
          <div className="space-y-4">
            <MiniMetric label="Trend Delta" value={insights?.summary?.trend_delta || 0} suffix="" />
            <MiniMetric label="Decline Streak" value={insights?.summary?.decline_streak || 0} suffix=" days" />
            <MiniMetric
              label="Deviation Flag"
              value={insights?.deviation_detected ? "Detected" : "Stable"}
              suffix=""
            />
            {baseline && (
              <div className="grid grid-cols-2 gap-3">
                <MiniMetric label="Baseline Mood" value={baseline.mood} suffix="/10" />
                <MiniMetric label="Baseline Stress" value={baseline.stress} suffix="/10" />
                <MiniMetric label="Baseline Sleep" value={baseline.sleep} suffix="h" />
                <MiniMetric label="Baseline Energy" value={baseline.energy} suffix="/10" />
              </div>
            )}
            <div className="rounded-xl bg-canvas px-4 py-4 text-sm leading-6 text-ink/65">
              {insights?.deviation_detected
                ? "The short-term pattern deviates from your recent baseline and may need closer attention."
                : "No significant downward deviation in the recent pattern."}
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
              <div className="rounded-xl bg-canvas px-4 py-4 text-sm leading-6 text-ink/65">
                {insights.journal.text}
              </div>
            </div>
          ) : (
            <EmptyState text="Journal-based insight appears after the first reflection." />
          )}
        </Card>

        <Card title="Recent timeline" eyebrow="History Preview">
          <div className="space-y-3">
            {historyItems.slice(0, 6).map((item) => (
              <div className="rounded-xl bg-canvas px-4 py-4" key={item.id}>
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
  const [remaining, setRemaining] = useState(BREATHING_SESSION_SECONDS);
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const phase = getBreathingPhase(elapsed);
  const completedPercent = Math.round(((BREATHING_SESSION_SECONDS - remaining) / BREATHING_SESSION_SECONDS) * 100);

  useEffect(() => {
    if (!running) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      setRemaining((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          setRunning(false);
          return 0;
        }
        return current - 1;
      });
      setElapsed((current) => current + 1);
    }, 1000);

    return () => window.clearInterval(timer);
  }, [running]);

  function toggleBreathing() {
    if (remaining === 0) {
      setRemaining(BREATHING_SESSION_SECONDS);
      setElapsed(0);
      setRunning(true);
      return;
    }

    setRunning((current) => !current);
  }

  function resetBreathing() {
    setRunning(false);
    setRemaining(BREATHING_SESSION_SECONDS);
    setElapsed(0);
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
      <section className="space-y-6">
        <div className="rounded-[2rem] bg-gradient-to-br from-[#6fae8d] to-[#4E7FA8] p-6 text-white shadow-panel">
          <p className="text-xs uppercase tracking-[0.35em] text-white/65">Breathing Exercise</p>
          <div className="mt-6 flex flex-col items-center gap-5">
            <div className={`breathing-orb ${running ? phase.className : ""}`}>
              <div className="breathing-orb__inner">
                <p className="text-sm uppercase tracking-[0.25em] text-white/65">{remaining}s</p>
                <p className="mt-1 text-2xl font-semibold">{remaining === 0 ? "Complete" : phase.label}</p>
                <p className="mt-2 text-center text-xs text-white/62">{remaining === 0 ? "Nice work" : phase.instruction}</p>
              </div>
            </div>
            <div className="w-full max-w-sm">
              <div className="h-2 overflow-hidden rounded-full bg-white/20">
                <div className="h-full rounded-full bg-white transition-all" style={{ width: `${completedPercent}%` }} />
              </div>
              <div className="mt-4 flex justify-center gap-3">
                <button
                  className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-ink transition hover:brightness-95"
                  onClick={toggleBreathing}
                  type="button"
                >
                  {running ? "Pause" : remaining === 0 ? "Restart" : "Start"}
                </button>
                <button
                  className="rounded-full border border-white/25 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                  onClick={resetBreathing}
                  type="button"
                >
                  Reset
                </button>
              </div>
            </div>
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
          <SoundscapePlayer />
        </Card>

        <Card title="Reset routine" eyebrow="Aftercare">
          <div className="grid gap-3">
            <FeatureCard title="One minute" text="Use the breathing timer before submitting a stressful check-in." />
            <FeatureCard title="Three minutes" text="Add a soundscape and write one sentence about the strongest trigger." />
            <FeatureCard title="Tonight" text="Choose one small recovery action that protects sleep and energy." />
          </div>
        </Card>
      </section>
    </div>
  );
}

function SettingsPage({ session, onFeedback }) {
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [privacyMode, setPrivacyMode] = useState(true);
  const [reminderTime, setReminderTime] = useState("20:30");
  const [checkInGoal, setCheckInGoal] = useState("5");
  const [language, setLanguage] = useState("English");
  const [feedback, setFeedback] = useState({ category: "Performance", message: "" });
  const [submitting, setSubmitting] = useState(false);

  async function handleFeedbackSubmit(event) {
    event.preventDefault();
    if (!feedback.message.trim()) {
      return;
    }
    setSubmitting(true);
    try {
      await onFeedback(feedback);
      setFeedback((current) => ({ ...current, message: "" }));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
      <section className="space-y-6">
        <Card title="Profile summary" eyebrow="Account">
          <div className="rounded-[1.5rem] bg-canvas p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold">{session.is_anonymous ? "Anonymous Session" : session.email}</p>
                <p className="mt-1 text-sm text-ink/55">User #{session.user_id}</p>
              </div>
              <span className="w-fit rounded-full bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-primary">
                {session.is_anonymous ? "Private mode" : "Signed in"}
              </span>
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              <MiniMetric label="Goal" value={checkInGoal} suffix="/week" />
              <MiniMetric label="Reminder" value={reminderTime} suffix="" />
              <MiniMetric label="Language" value={language} suffix="" />
            </div>
          </div>
        </Card>

        <Card title="Notification settings" eyebrow="Preferences">
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="rounded-[1.4rem] bg-canvas px-4 py-4">
                <span className="block text-sm font-semibold">Reminder time</span>
                <input
                  className="mt-3 w-full rounded-[1rem] border border-line bg-white px-4 py-3 outline-none transition focus:border-primary"
                  onChange={(event) => setReminderTime(event.target.value)}
                  type="time"
                  value={reminderTime}
                />
              </label>
              <label className="rounded-[1.4rem] bg-canvas px-4 py-4">
                <span className="block text-sm font-semibold">Weekly check-in goal</span>
                <select
                  className="mt-3 w-full rounded-[1rem] border border-line bg-white px-4 py-3 outline-none transition focus:border-primary"
                  onChange={(event) => setCheckInGoal(event.target.value)}
                  value={checkInGoal}
                >
                  <option value="3">3 days</option>
                  <option value="5">5 days</option>
                  <option value="7">Every day</option>
                </select>
              </label>
            </div>
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

        <Card title="Privacy and localization" eyebrow="Personalization">
          <div className="space-y-4">
            <ToggleRow
              description="Hide sensitive notes in shared presentation moments."
              enabled={privacyMode}
              label="Privacy screen"
              onToggle={() => setPrivacyMode((current) => !current)}
            />
            <label className="block rounded-[1.4rem] bg-canvas px-4 py-4">
              <span className="block text-sm font-semibold">Interface language</span>
              <select
                className="mt-3 w-full rounded-[1rem] border border-line bg-white px-4 py-3 outline-none transition focus:border-primary"
                onChange={(event) => setLanguage(event.target.value)}
                value={language}
              >
                <option>English</option>
                <option>Russian</option>
                <option>Kazakh</option>
              </select>
            </label>
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

        <Card title="Connected signals" eyebrow="Ecosystem">
          <div className="grid gap-4 md:grid-cols-2">
            <DeviceCard device="Smart Watch" status="Connect" />
            <DeviceCard device="Sleep Patch" status="Preview" />
            <DeviceCard device="Mini ECG" status="Preview" />
            <DeviceCard device="BP Monitor" status="Preview" />
          </div>
        </Card>

        <Card title="Safety note" eyebrow="Clinical Boundary">
          <div className="rounded-[1.4rem] bg-[#EAF2FF] px-4 py-4 text-sm leading-7 text-ink/68">
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
        <Card title="Users under observation" eyebrow="Admin Triage">
          <div className="space-y-3">
            {(adminOverview?.users || []).length === 0 ? (
              <EmptyState text="No user data is available yet." />
            ) : (
              [...adminOverview.users]
                .sort((a, b) => {
                  const score = (u) =>
                    (u.latest_assessment?.risk_level === "HIGH" ? 4 : u.latest_assessment?.risk_level === "MEDIUM" ? 2 : 0) +
                    (u.questionnaire_status?.due_now ? 2 : 0) +
                    (u.unread_alerts || 0);
                  return score(b) - score(a);
                })
                .map((user) => (
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
                        user.questionnaire_status?.due_now ? "bg-[#fde8e8] text-[#b03030]" : "bg-[#ddf0ec] text-[#2e7065]"
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
                    <div className="rounded-[1.4rem] bg-[#EAF2FF] px-4 py-4" key={`${item.created_at}-${index}`}>
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
          <p className="text-xs uppercase tracking-[0.35em] text-ink/40">MindTrack Admin</p>
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

function MindTrackLogo({ tone = "light" }) {
  const textClass = tone === "dark" || tone === "hero" ? "text-white" : "text-ink";
  const subTextClass = tone === "dark" || tone === "hero" ? "text-white/58" : "text-ink/45";
  const markClass = tone === "hero" ? "bg-white/12 ring-white/18" : tone === "dark" ? "bg-white/10 ring-white/15" : "bg-white ring-line";

  return (
    <div className="inline-flex items-center gap-3">
      <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ring-1 ${markClass}`}>
        <svg aria-hidden="true" className="h-8 w-8" viewBox="0 0 48 48">
          <circle cx="24" cy="24" fill={tone === "light" ? "#E8F2EF" : "rgba(255,255,255,0.18)"} r="21" />
          <path
            d="M12 27 C17 18, 25 18, 30 27 C33 32, 39 30, 41 23"
            fill="none"
            stroke={tone === "light" ? "#4E7FA8" : "#FFFFFF"}
            strokeLinecap="round"
            strokeWidth="3.4"
          />
          <path
            d="M22 29 C21 20, 27 14, 35 14 C35 22, 30 29, 22 29Z"
            fill={tone === "light" ? "#68A898" : "rgba(255,255,255,0.72)"}
          />
          <path
            d="M18 29 L22 29 L25 22 L29 34 L33 26 L37 26"
            fill="none"
            stroke={tone === "light" ? "#1B2A3B" : "#FFFFFF"}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2.4"
          />
        </svg>
      </div>
      <div className="text-left">
        <p className={`font-display text-xl font-semibold leading-none ${textClass}`}>MindTrack</p>
        <p className={`mt-1 text-xs uppercase tracking-[0.28em] ${subTextClass}`}>AI Wellness</p>
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
    <div className={`rounded-2xl ${color} p-5 shadow-sm`}>
      <p className="text-xs uppercase tracking-[0.35em] text-ink/42">{number}</p>
      <h3 className="mt-4 text-xl font-semibold">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-ink/65">{text}</p>
    </div>
  );
}

function FeatureCard({ title, text }) {
  return (
    <div className="rounded-xl bg-canvas p-5">
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-3 text-sm leading-6 text-ink/64">{text}</p>
    </div>
  );
}

function Card({ eyebrow, title, children }) {
  return (
    <section className="rounded-2xl bg-white p-6 shadow-panel">
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
    <div className="rounded-xl bg-canvas px-4 py-4">
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
          <span className="h-2.5 w-2.5 rounded-full bg-[#68A898]" />
          Mood
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#4E7FA8]" />
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
        <polyline fill="none" points={moodLine.join(" ")} stroke="#68A898" strokeLinecap="round" strokeWidth="4" />
        <polyline fill="none" points={stressLine.join(" ")} stroke="#4E7FA8" strokeLinecap="round" strokeWidth="4" />
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
    level === "HIGH" ? "#c75454" : level === "MEDIUM" ? "#C9953A" : "#4E7FA8";

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
    <div className="rounded-xl bg-canvas p-5">
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

function FocusSelector({ options, value, onChange }) {
  return (
    <div className="rounded-xl bg-canvas p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold">Today's focus</p>
          <p className="mt-1 text-sm text-ink/58">Pick the main context for this check-in.</p>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-primary">{value}</span>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            className={`rounded-full border px-4 py-2 text-sm font-semibold transition ${
              value === option
                ? "border-primary bg-primary text-white"
                : "border-line bg-white text-ink/66 hover:border-primary/35"
            }`}
            key={option}
            onClick={() => onChange(option)}
            type="button"
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}

function QuestionnaireFlow({
  activeQuestion,
  answeredCount,
  onAnswer,
  onNext,
  onPrevious,
  progressPercent,
  selectedValue,
  step,
  total,
  validationMessage,
}) {
  return (
    <div className="overflow-hidden rounded-[1.7rem] border border-line bg-[#f8fbfd]">
      <div className="flex items-center justify-between gap-4 border-b border-line bg-white px-5 py-4">
        <button
          className="flex h-11 w-11 items-center justify-center rounded-full border border-line text-2xl leading-none text-ink/58 transition hover:border-primary/40 hover:text-primary disabled:opacity-30"
          disabled={step === 0}
          onClick={onPrevious}
          type="button"
        >
          {"<"}
        </button>
        <div className="flex-1">
          <div className="flex items-center justify-between gap-3 text-sm font-semibold text-ink/58">
            <span>{progressPercent}%</span>
            <span>
              Step {step + 1} of {total}
            </span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-canvas">
            <div className="h-full rounded-full bg-[#007d47] transition-all" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      </div>

      <div className="px-5 py-8 sm:px-8">
        <p className="text-center text-xs uppercase tracking-[0.35em] text-ink/42">{activeQuestion.group}</p>
        <h4 className="mx-auto mt-4 max-w-3xl text-center font-display text-3xl leading-tight text-ink sm:text-4xl">
          Choose how accurately each statement reflects you.
        </h4>
        <p className="mx-auto mt-4 max-w-2xl text-center text-base leading-7 text-ink/62">
          {activeQuestion.question}
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-5">
          {screeningScale.map((item) => {
            const selected = selectedValue === item.value;
            return (
              <button
                className="group flex min-h-[132px] flex-col items-center justify-start gap-3 rounded-[1.3rem] px-2 py-4 text-center transition hover:bg-white"
                key={item.value}
                onClick={() => onAnswer(item.value)}
                type="button"
              >
                <span
                  className={`h-20 w-20 rounded-full border-[3px] transition ${item.tone} ${
                    selected ? "scale-105 shadow-[0_12px_28px_rgba(27,42,59,0.16)] ring-4 ring-primary/12" : "group-hover:scale-105"
                  }`}
                />
                <span className="max-w-[112px] text-sm font-semibold leading-5 text-ink">{item.label}</span>
              </button>
            );
          })}
        </div>

        {validationMessage && (
          <div className="mx-auto mt-6 max-w-2xl rounded-[1.2rem] border border-[#efb0a8] bg-[#fff2f0] px-4 py-3 text-center text-sm font-semibold text-[#a84236]">
            {validationMessage}
          </div>
        )}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink/55">
            Answered {answeredCount} of {total}. Tap the same circle again to clear it.
          </p>
          <button
            className="rounded-full bg-primary px-6 py-3 text-sm font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-45"
            disabled={step === total - 1}
            onClick={onNext}
            type="button"
          >
            Next Statement
          </button>
        </div>
      </div>
    </div>
  );
}

function BaselineDelta({ label, current, base, invert = false }) {
  const diff = Number((current - base).toFixed(1));
  const positive = invert ? diff < 0 : diff > 0;
  const neutral = diff === 0;
  const color = neutral ? "text-ink/45" : positive ? "text-[#2e7065]" : "text-[#b03030]";
  const arrow = neutral ? "" : diff > 0 ? " ↑" : " ↓";
  return (
    <span className={`text-xs font-medium ${color}`}>
      {label}: {diff > 0 ? "+" : ""}{diff}{arrow}
    </span>
  );
}

function EmptyState({ text }) {
  return <div className="rounded-[1.4rem] bg-canvas px-4 py-6 text-sm leading-6 text-ink/58">{text}</div>;
}

function ProfessionalGuidance({ guidance }) {
  const [openSections, setOpenSections] = useState({
    summary: true,
    drivers: false,
    today: true,
    monitor: false,
    safety: false,
  });

  if (!guidance) {
    return <EmptyState text="Complete a full assessment to generate a structured professional guidance report." />;
  }

  function toggleSection(section) {
    setOpenSections((current) => ({ ...current, [section]: !current[section] }));
  }

  return (
    <div className="space-y-3">
      <AccordionSection
        accent="bg-[#fff8f0]"
        isOpen={openSections.summary}
        onToggle={() => toggleSection("summary")}
        title={guidance.report_label || "AI Guidance"}
      >
        <p className="text-base leading-7 text-ink/72">{guidance.summary}</p>
      </AccordionSection>
      <AccordionSection
        isOpen={openSections.drivers}
        onToggle={() => toggleSection("drivers")}
        title="Key Risk Drivers"
      >
        <GuidanceList items={guidance.risk_drivers} />
      </AccordionSection>
      <AccordionSection
        accent="bg-soft/60"
        isOpen={openSections.today}
        onToggle={() => toggleSection("today")}
        title="What To Do Today"
      >
        <GuidanceList items={guidance.today_actions} />
      </AccordionSection>
      <AccordionSection
        accent="bg-[#f4eee6]"
        isOpen={openSections.monitor}
        onToggle={() => toggleSection("monitor")}
        title="What To Monitor Next"
      >
        <GuidanceList items={guidance.follow_up_actions} />
      </AccordionSection>
      {guidance.escalation_note && (
        <AccordionSection
          accent="bg-[#EAF2FF]"
          isOpen={openSections.safety}
          onToggle={() => toggleSection("safety")}
          title="When To Seek Help"
        >
          <p className="text-sm leading-6 text-ink/68">{guidance.escalation_note}</p>
        </AccordionSection>
      )}
    </div>
  );
}

function AccordionSection({ accent = "bg-canvas", children, isOpen, onToggle, title }) {
  return (
    <div className={`rounded-xl ${accent} px-4 py-4`}>
      <button
        className="flex w-full items-center justify-between gap-4 text-left"
        onClick={onToggle}
        type="button"
      >
        <span className="text-sm font-semibold text-ink/72">{title}</span>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white text-base font-semibold text-primary shadow-sm">
          {isOpen ? "−" : "+"}
        </span>
      </button>
      {isOpen && <div className="mt-4">{children}</div>}
    </div>
  );
}

function GuidanceList({ items }) {
  if (!items?.length) {
    return <p className="text-sm leading-6 text-ink/58">No specific signal is available yet.</p>;
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <p className="text-sm leading-6 text-ink/68" key={item}>
          {item}
        </p>
      ))}
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
        <rect fill="#EEF3F9" height={height} rx="20" width={width} />
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
        <polyline fill="none" points={moodPoints.join(" ")} stroke="#68A898" strokeLinecap="round" strokeWidth="4" />
        <polyline fill="none" points={riskPoints.join(" ")} stroke="#4E7FA8" strokeLinecap="round" strokeWidth="4" />
        {points.map((point, index) => {
          const x = padding + (index * (width - padding * 2)) / Math.max(points.length - 1, 1);
          const moodY = height - padding - ((point.mood || 0) / 10) * (height - padding * 2);
          const riskY = height - padding - ((point.risk_score || 0) / 1) * (height - padding * 2);
          return (
            <g key={point.created_at}>
              <circle cx={x} cy={moodY} fill="#68A898" r="5" />
              <circle cx={x} cy={riskY} fill="#4E7FA8" r="5" />
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

function SoundscapePlayer() {
  const [activeTrack, setActiveTrack] = useState(soundscapes[0].id);
  const [playing, setPlaying] = useState(false);
  const [volume, setVolume] = useState(0.45);
  const [audioMessage, setAudioMessage] = useState("");
  const audioRef = useRef(null);
  const active = soundscapes.find((track) => track.id === activeTrack) || soundscapes[0];

  function stopAudio() {
    const current = audioRef.current;
    if (!current) {
      return;
    }

    current.nodes.forEach((node) => {
      try {
        node.stop();
      } catch {
        // Some audio nodes may already be stopped.
      }
    });
    current.context.close().catch(() => {});
    audioRef.current = null;
  }

  function startAudio(track = active) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
      setAudioMessage("Audio is not supported in this browser.");
      return;
    }

    stopAudio();
    const context = new AudioContext();
    const master = context.createGain();
    master.gain.value = volume * 0.16;
    master.connect(context.destination);

    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900;
    filter.Q.value = 0.6;
    filter.connect(master);

    const frequencies = [track.frequency, track.frequency * 1.5, track.frequency * 2.01];
    const oscillators = frequencies.map((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = index === 1 ? "triangle" : "sine";
      oscillator.frequency.value = frequency;
      gain.gain.value = index === 0 ? 0.6 : 0.24;
      oscillator.connect(gain);
      gain.connect(filter);
      oscillator.start();
      return oscillator;
    });

    const lfo = context.createOscillator();
    const lfoGain = context.createGain();
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = volume * 0.035;
    lfo.connect(lfoGain);
    lfoGain.connect(master.gain);
    lfo.start();

    audioRef.current = { context, master, nodes: [...oscillators, lfo] };
    setAudioMessage("");
  }

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.master.gain.setTargetAtTime(
        volume * 0.16,
        audioRef.current.context.currentTime,
        0.05,
      );
    }
  }, [volume]);

  useEffect(() => () => stopAudio(), []);

  function togglePlayback() {
    if (playing) {
      stopAudio();
      setPlaying(false);
      return;
    }

    startAudio(active);
    setPlaying(true);
  }

  function selectTrack(track) {
    setActiveTrack(track.id);
    if (playing) {
      startAudio(track);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-[1.6rem] bg-canvas p-5">
        <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-ink/42">Now selected</p>
            <h4 className="mt-2 text-2xl font-semibold">{active.title}</h4>
            <p className="mt-2 text-sm text-ink/62">{active.subtitle}</p>
          </div>
          <div className="sound-bars" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center">
          <button
            className="rounded-full bg-primary px-6 py-3 text-sm font-semibold text-white transition hover:brightness-95"
            onClick={togglePlayback}
            type="button"
          >
            {playing ? "Pause Music" : "Play Music"}
          </button>
          <label className="flex flex-1 items-center gap-3 text-sm font-semibold text-ink/62">
            Volume
            <input
              className="range-thumb h-2 flex-1 cursor-pointer appearance-none rounded-full bg-white"
              max="1"
              min="0"
              onChange={(event) => setVolume(Number(event.target.value))}
              step="0.05"
              type="range"
              value={volume}
            />
          </label>
        </div>
        {audioMessage && <p className="mt-3 text-sm font-semibold text-[#a84236]">{audioMessage}</p>}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {soundscapes.map((track) => (
          <SoundCard
            active={activeTrack === track.id}
            key={track.id}
            onSelect={() => selectTrack(track)}
            playing={playing && activeTrack === track.id}
            subtitle={track.subtitle}
            title={track.title}
          />
        ))}
      </div>
    </div>
  );
}

function SoundCard({ active, onSelect, playing, title, subtitle }) {
  return (
    <button
      className={`rounded-[1.5rem] border p-5 text-left transition ${
        active ? "border-primary bg-[#EAF2FF]" : "border-line bg-canvas hover:border-primary/35"
      }`}
      onClick={onSelect}
      type="button"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-base font-semibold">{title}</h4>
          <p className="mt-2 text-sm leading-6 text-ink/62">{subtitle}</p>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${playing ? "bg-primary text-white" : "bg-white text-primary"}`}>
          {playing ? "Live" : active ? "Ready" : "Select"}
        </span>
      </div>
    </button>
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
        <Route element={<DashboardPage data={dashboardData} history={historyData} onSeedDemo={onSeedDemo} pageLoading={pageLoading} />} path="/dashboard" />
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
      return false;
    }

    setSubmitLoading(true);
    setStatusMessage("");
    try {
      const noteParts = [form.note.trim()];
      if (form.focus) {
        noteParts.push(`Focus: ${form.focus}`);
      }

      await apiRequest("/mood", {
        method: "POST",
        body: JSON.stringify({
          user_id: session.user_id,
          mood: Number(form.mood),
          stress: Number(form.stress),
          sleep: Number(form.sleep),
          energy: Number(form.energy),
          note: noteParts.filter(Boolean).join(" | "),
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
      navigate("/risk-result");
      return true;
    } catch (error) {
      setStatusMessage(error.message);
      return false;
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
