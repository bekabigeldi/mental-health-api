import hashlib
import json
import os
import sqlite3
import statistics
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from ml_model import AssessmentFeatures, RiskPredictor


BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "mental_health.db"
predictor = RiskPredictor()
ADMIN_EMAIL = os.getenv("MENTAL_HEALTH_ADMIN_EMAIL", "admin@mentalhealth.local")
ADMIN_PASSWORD = os.getenv("MENTAL_HEALTH_ADMIN_PASSWORD", "Admin123!")
ADMIN_SESSIONS: set[str] = set()

app = FastAPI(title="AI Early Warning System API", version="2.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class RegisterRequest(BaseModel):
    email: str = Field(min_length=5, max_length=120)
    password: str = Field(min_length=4, max_length=128)


class LoginRequest(BaseModel):
    email: str = Field(min_length=5, max_length=120)
    password: str = Field(min_length=4, max_length=128)


class MoodRequest(BaseModel):
    user_id: int
    mood: int = Field(ge=1, le=10)
    stress: int = Field(ge=1, le=10)
    sleep: float = Field(ge=0, le=24)
    energy: int = Field(ge=1, le=10)
    note: str = Field(default="", max_length=500)


class QuestionnaireRequest(BaseModel):
    user_id: int
    phq9_answers: list[int] = Field(min_length=9, max_length=9)
    gad7_answers: list[int] = Field(min_length=7, max_length=7)


class JournalRequest(BaseModel):
    user_id: int
    text: str = Field(min_length=0, max_length=2000)


class FeedbackRequest(BaseModel):
    user_id: int
    category: str = Field(min_length=2, max_length=80)
    message: str = Field(min_length=4, max_length=1000)


class AdminLoginRequest(BaseModel):
    email: str = Field(min_length=5, max_length=120)
    password: str = Field(min_length=4, max_length=128)


class UserResponse(BaseModel):
    user_id: int
    email: str
    is_anonymous: bool


NEGATIVE_TERMS = {
    "tired": 0.35,
    "exhausted": 0.5,
    "hopeless": 0.8,
    "empty": 0.6,
    "anxious": 0.5,
    "panic": 0.7,
    "stressed": 0.45,
    "overwhelmed": 0.55,
    "sad": 0.45,
    "alone": 0.45,
    "burnout": 0.7,
    "burned out": 0.7,
    "nothing": 0.25,
    "worthless": 0.85,
    "can't": 0.3,
    "cannot": 0.3,
    "cry": 0.4,
    "numb": 0.55,
    "afraid": 0.45,
}
POSITIVE_TERMS = {
    "calm": 0.35,
    "grateful": 0.4,
    "better": 0.3,
    "hopeful": 0.45,
    "stable": 0.35,
    "focused": 0.25,
    "relaxed": 0.35,
    "good": 0.2,
    "support": 0.2,
    "rested": 0.3,
}
SYPMTOM_GROUPS = {
    "sleep": ["sleep", "insomnia", "rest", "awake"],
    "stress": ["stress", "overwhelmed", "pressure", "panic"],
    "mood": ["sad", "empty", "hopeless", "cry", "numb"],
    "energy": ["tired", "exhausted", "burnout", "drained"],
}


def get_connection() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH, check_same_thread=False)
    connection.row_factory = sqlite3.Row
    return connection


def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode("utf-8")).hexdigest()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_iso_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None


def ensure_column(cursor: sqlite3.Cursor, table: str, column: str, definition: str) -> None:
    columns = [row["name"] for row in cursor.execute(f"PRAGMA table_info({table})").fetchall()]
    if column not in columns:
        cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")


def create_tables() -> None:
    connection = get_connection()
    cursor = connection.cursor()

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            is_anonymous INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT ''
        )
        """
    )
    ensure_column(cursor, "users", "created_at", "TEXT NOT NULL DEFAULT ''")
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS mood_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            mood INTEGER NOT NULL,
            stress INTEGER NOT NULL,
            sleep REAL NOT NULL,
            note TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
        """
    )
    ensure_column(cursor, "mood_entries", "energy", "INTEGER NOT NULL DEFAULT 5")

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS questionnaire_responses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            phq9_total INTEGER NOT NULL,
            gad7_total INTEGER NOT NULL,
            phq9_answers TEXT NOT NULL,
            gad7_answers TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS journal_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            text TEXT NOT NULL,
            sentiment_label TEXT NOT NULL,
            sentiment_score REAL NOT NULL,
            distress_score REAL NOT NULL,
            symptom_flags_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS risk_assessments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            risk_score REAL NOT NULL,
            risk_level TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
        """
    )
    ensure_column(cursor, "risk_assessments", "classifier_score", "REAL NOT NULL DEFAULT 0")
    ensure_column(cursor, "risk_assessments", "trend_score", "REAL NOT NULL DEFAULT 0")
    ensure_column(cursor, "risk_assessments", "text_score", "REAL NOT NULL DEFAULT 0")
    ensure_column(cursor, "risk_assessments", "questionnaire_score", "REAL NOT NULL DEFAULT 0")
    ensure_column(cursor, "risk_assessments", "explanations_json", "TEXT NOT NULL DEFAULT '[]'")
    ensure_column(cursor, "risk_assessments", "alert_type", "TEXT")
    ensure_column(cursor, "risk_assessments", "alert_message", "TEXT")

    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            risk_assessment_id INTEGER,
            alert_type TEXT NOT NULL,
            severity TEXT NOT NULL,
            message TEXT NOT NULL,
            is_read INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id),
            FOREIGN KEY (risk_assessment_id) REFERENCES risk_assessments (id)
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS recommendations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            risk_assessment_id INTEGER NOT NULL,
            title TEXT NOT NULL,
            content TEXT NOT NULL,
            category TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id),
            FOREIGN KEY (risk_assessment_id) REFERENCES risk_assessments (id)
        )
        """
    )
    cursor.execute(
        """
        CREATE TABLE IF NOT EXISTS feedback_submissions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            category TEXT NOT NULL,
            message TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id)
        )
        """
    )

    connection.commit()
    connection.close()


def get_user_or_404(user_id: int) -> sqlite3.Row:
    connection = get_connection()
    user = connection.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    connection.close()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def row_to_dict(row: sqlite3.Row | None) -> dict[str, Any] | None:
    if row is None:
        return None
    return {key: row[key] for key in row.keys()}


def assert_admin_token(x_admin_token: str | None) -> None:
    if not x_admin_token or x_admin_token not in ADMIN_SESSIONS:
        raise HTTPException(status_code=401, detail="Admin authorization required")


def analyze_journal_text(text: str) -> dict[str, Any]:
    lowered = text.lower()
    negative_score = sum(weight for term, weight in NEGATIVE_TERMS.items() if term in lowered)
    positive_score = sum(weight for term, weight in POSITIVE_TERMS.items() if term in lowered)
    token_count = max(len(lowered.split()), 1)

    raw_balance = (positive_score - negative_score) / max(1.0, token_count / 6.0)
    sentiment_score = max(-1.0, min(1.0, raw_balance))
    distress_score = min(1.0, negative_score / 2.6)

    if sentiment_score <= -0.18 or distress_score >= 0.5:
        label = "negative"
    elif sentiment_score >= 0.12:
        label = "positive"
    else:
        label = "neutral"

    symptom_flags = {
        category: any(keyword in lowered for keyword in keywords)
        for category, keywords in SYPMTOM_GROUPS.items()
    }

    return {
        "sentiment_label": label,
        "sentiment_score": round(sentiment_score, 2),
        "distress_score": round(distress_score, 2),
        "symptom_flags": symptom_flags,
    }


def fetch_recent_moods(connection: sqlite3.Connection, user_id: int, limit: int = 7) -> list[sqlite3.Row]:
    return connection.execute(
        """
        SELECT * FROM mood_entries
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT ?
        """,
        (user_id, limit),
    ).fetchall()


def compute_trend_features(entries: list[sqlite3.Row]) -> dict[str, float]:
    if not entries:
        return {"recent_avg_mood": 5.0, "trend_delta": 0.0, "volatility": 0.0, "decline_streak": 0}

    ordered = list(reversed(entries))
    moods = [float(entry["mood"]) for entry in ordered]
    recent_avg_mood = statistics.fmean(moods)
    latest_mood = moods[-1]
    previous_window = moods[:-1] if len(moods) > 1 else moods
    previous_avg = statistics.fmean(previous_window) if previous_window else latest_mood
    trend_delta = latest_mood - previous_avg
    volatility = min(1.0, (statistics.pstdev(moods) / 3.0) if len(moods) > 1 else 0.0)

    decline_streak = 0
    for index in range(len(moods) - 1, 0, -1):
        if moods[index] < moods[index - 1]:
            decline_streak += 1
        else:
            break

    return {
        "recent_avg_mood": round(recent_avg_mood, 2),
        "trend_delta": round(trend_delta, 2),
        "volatility": round(volatility, 2),
        "decline_streak": decline_streak,
    }


def build_ai_guidance(
    *,
    risk_level: str,
    risk_score: float,
    mood: int,
    stress: int,
    sleep: float,
    energy: int,
    phq9_total: int,
    gad7_total: int,
    distress_score: float,
    sentiment_label: str,
    trend_delta: float,
    volatility: float,
    decline_streak: int,
    explanations: list[str],
    questionnaire_due: bool,
) -> dict[str, Any]:
    driver_tags: list[str] = []
    risk_drivers: list[str] = []

    def add_driver(tag: str, sentence: str) -> None:
        if tag not in driver_tags:
            driver_tags.append(tag)
            risk_drivers.append(sentence)

    if mood <= 4:
        add_driver("low-mood", "Mood ratings are low and suggest reduced emotional stability right now.")
    elif mood <= 6:
        add_driver("soft-mood-drop", "Mood is below the user's stronger baseline and should be watched over the next few days.")
    if stress >= 7:
        add_driver("high-stress", "Stress remains elevated and is likely pushing the current risk upward.")
    if sleep < 6:
        add_driver("low-sleep", "Sleep is below a restorative range and may be amplifying vulnerability.")
    if energy <= 4:
        add_driver("low-energy", "Low energy may indicate cumulative strain or incomplete recovery.")
    if phq9_total >= 17:
        add_driver("phq-severity", "Depression screening responses are in a clinically meaningful range.")
    if gad7_total >= 17:
        add_driver("gad-severity", "Anxiety screening responses are elevated and contribute to the risk picture.")
    if distress_score >= 0.5 or sentiment_label == "negative":
        add_driver("journal-distress", "Journal language suggests increased emotional distress or negative tone.")
    if trend_delta <= -1.0 or decline_streak >= 2:
        add_driver("downward-trend", "Recent check-ins show a downward pattern compared with the personal baseline.")
    if volatility >= 0.45:
        add_driver("instability", "Recent entries are more variable than usual, which may signal instability.")
    if questionnaire_due:
        add_driver("screening-due", "A scheduled screening update is due and would improve the quality of the current interpretation.")

    if not risk_drivers and explanations:
        risk_drivers.extend(explanations[:3])
    if not risk_drivers:
        risk_drivers.append("Current indicators appear relatively stable compared with recent check-ins.")

    primary_tags = driver_tags[:3]
    if risk_level == "HIGH":
        summary = "Current signals suggest elevated mental health risk and a worsening short-term pattern that deserves prompt attention."
    elif risk_level == "MEDIUM":
        summary = "Current signals suggest moderate emotional strain, with enough concern to justify closer follow-up."
    else:
        summary = "Current signals look comparatively stable, though continued monitoring is still appropriate."

    if primary_tags:
        focus_text = {
            "low-mood": "lower mood",
            "soft-mood-drop": "reduced mood",
            "high-stress": "elevated stress",
            "low-sleep": "reduced sleep",
            "low-energy": "lower energy",
            "phq-severity": "screening severity",
            "gad-severity": "anxiety-related strain",
            "journal-distress": "distress in journal language",
            "downward-trend": "a recent downward trend",
            "instability": "instability across entries",
            "screening-due": "an overdue screening update",
        }
        summary += " The main contributing signals are " + ", ".join(focus_text[tag] for tag in primary_tags) + "."

    today_actions: list[str] = []
    if stress >= 7:
        today_actions.append("Reduce unnecessary cognitive load today and take one short reset break before returning to demanding tasks.")
    if sleep < 6:
        today_actions.append("Prioritize a calmer evening routine and protect the next sleep window as much as possible.")
    if mood <= 4 or energy <= 4:
        today_actions.append("Keep today's goals smaller and choose one grounding or restorative activity that feels realistic.")
    if distress_score >= 0.5 or sentiment_label == "negative":
        today_actions.append("Write down the main stressors in concrete terms and avoid staying alone with vague overwhelm.")
    if not today_actions:
        today_actions.append("Maintain the routines that are currently helping, especially sleep, pacing, and short recovery breaks.")

    follow_up_actions = [
        "Repeat a short check-in within the next 24 hours so the system can confirm whether this pattern is temporary or sustained.",
    ]
    if trend_delta <= -1.0 or decline_streak >= 2:
        follow_up_actions.append("Watch whether mood continues to decline across the next 2 to 3 entries, because continued deterioration increases concern.")
    if questionnaire_due:
        follow_up_actions.append("Complete the full questionnaire when prompted so the next assessment has stronger screening evidence.")
    if phq9_total >= 17 or gad7_total >= 17:
        follow_up_actions.append("If these symptoms remain at a similar level this week, consider speaking with a counselor, clinician, or trusted support person.")
    elif risk_level != "LOW":
        follow_up_actions.append("If distress does not ease over the next few days, consider reaching out for structured support rather than waiting longer.")

    if risk_level == "HIGH":
        escalation_note = "If distress becomes intense, functioning drops sharply, or the person feels unsafe, urgent professional or emergency support should be contacted immediately."
    elif risk_level == "MEDIUM":
        escalation_note = "If symptoms intensify, sleep remains poor, or the downward pattern continues, professional support is recommended soon."
    else:
        escalation_note = "No immediate escalation signal is visible, but professional support is still appropriate whenever the person feels unable to cope alone."

    monitoring_focus = []
    if mood <= 6:
        monitoring_focus.append("mood recovery")
    if stress >= 6:
        monitoring_focus.append("stress reduction")
    if sleep < 7:
        monitoring_focus.append("sleep stabilization")
    if decline_streak >= 1:
        monitoring_focus.append("short-term trend")
    if not monitoring_focus:
        monitoring_focus.append("routine stability")

    return {
        "summary": summary,
        "risk_drivers": risk_drivers[:5],
        "today_actions": today_actions[:3],
        "follow_up_actions": follow_up_actions[:3],
        "escalation_note": escalation_note,
        "monitoring_focus": monitoring_focus[:4],
        "report_label": f"{risk_level.title()} Risk Guidance",
        "risk_score_percent": round(risk_score * 100),
    }


def build_ai_guidance_from_features(
    result: Any,
    features: AssessmentFeatures,
    *,
    questionnaire_due: bool,
) -> dict[str, Any]:
    sentiment_label = "negative" if features.sentiment_score < -0.15 else "positive" if features.sentiment_score > 0.2 else "neutral"
    return build_ai_guidance(
        risk_level=result.risk_level,
        risk_score=result.risk_score,
        mood=features.mood,
        stress=features.stress,
        sleep=features.sleep,
        energy=features.energy,
        phq9_total=features.phq9_total,
        gad7_total=features.gad7_total,
        distress_score=features.distress_score,
        sentiment_label=sentiment_label,
        trend_delta=features.trend_delta,
        volatility=features.volatility,
        decline_streak=features.decline_streak,
        explanations=result.explanations,
        questionnaire_due=questionnaire_due,
    )


def build_ai_guidance_from_snapshot(
    assessment: dict[str, Any] | None,
    latest_mood: sqlite3.Row | None,
    latest_questionnaire: sqlite3.Row | None,
    latest_journal: sqlite3.Row | None,
    summary: dict[str, Any],
    questionnaire_status: dict[str, Any],
) -> dict[str, Any] | None:
    if not assessment or not latest_mood:
        return None

    return build_ai_guidance(
        risk_level=assessment.get("risk_level") or "LOW",
        risk_score=float(assessment.get("risk_score") or 0.0),
        mood=int(latest_mood["mood"]),
        stress=int(latest_mood["stress"]),
        sleep=float(latest_mood["sleep"]),
        energy=int(latest_mood["energy"]),
        phq9_total=int((latest_questionnaire["phq9_total"] if latest_questionnaire else 0) or 0),
        gad7_total=int((latest_questionnaire["gad7_total"] if latest_questionnaire else 0) or 0),
        distress_score=float((latest_journal["distress_score"] if latest_journal else 0.0) or 0.0),
        sentiment_label=str((latest_journal["sentiment_label"] if latest_journal else "neutral") or "neutral"),
        trend_delta=float(summary.get("trend_delta") or 0.0),
        volatility=float(summary.get("volatility_index") or 0.0),
        decline_streak=int(summary.get("decline_streak") or 0),
        explanations=list(assessment.get("explanations") or []),
        questionnaire_due=bool(questionnaire_status.get("due_now")),
    )


def create_recommendations(
    guidance: dict[str, Any] | None,
) -> list[dict[str, str]]:
    if not guidance:
        return []

    recs: list[dict[str, str]] = [
        {
            "category": "summary",
            "title": "Professional summary",
            "content": guidance["summary"],
        }
    ]

    for action in guidance.get("today_actions", [])[:2]:
        recs.append(
            {
                "category": "today",
                "title": "What to do today",
                "content": action,
            }
        )

    if guidance.get("follow_up_actions"):
        recs.append(
            {
                "category": "follow-up",
                "title": "What to monitor next",
                "content": guidance["follow_up_actions"][0],
            }
        )

    if guidance.get("escalation_note"):
        recs.append(
            {
                "category": "safety",
                "title": "When to seek help",
                "content": guidance["escalation_note"],
            }
        )

    return recs[:5]


def build_assessment_payload(connection: sqlite3.Connection, user_id: int) -> tuple[AssessmentFeatures, dict[str, Any]]:
    latest_mood = connection.execute(
        """
        SELECT * FROM mood_entries
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 1
        """,
        (user_id,),
    ).fetchone()
    if not latest_mood:
        raise HTTPException(status_code=400, detail="Mood check-in is required before assessment")

    latest_questionnaire = connection.execute(
        """
        SELECT * FROM questionnaire_responses
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 1
        """,
        (user_id,),
    ).fetchone()
    latest_journal = connection.execute(
        """
        SELECT * FROM journal_entries
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 1
        """,
        (user_id,),
    ).fetchone()

    recent_moods = fetch_recent_moods(connection, user_id)
    trend = compute_trend_features(recent_moods)

    features = AssessmentFeatures(
        mood=int(latest_mood["mood"]),
        stress=int(latest_mood["stress"]),
        sleep=float(latest_mood["sleep"]),
        energy=int(latest_mood["energy"]),
        phq9_total=int(latest_questionnaire["phq9_total"]) if latest_questionnaire else 0,
        gad7_total=int(latest_questionnaire["gad7_total"]) if latest_questionnaire else 0,
        sentiment_score=float(latest_journal["sentiment_score"]) if latest_journal else 0.0,
        distress_score=float(latest_journal["distress_score"]) if latest_journal else 0.0,
        recent_avg_mood=float(trend["recent_avg_mood"]),
        trend_delta=float(trend["trend_delta"]),
        volatility=float(trend["volatility"]),
        decline_streak=int(trend["decline_streak"]),
    )

    context = {
        "latest_mood": row_to_dict(latest_mood),
        "latest_questionnaire": row_to_dict(latest_questionnaire),
        "latest_journal": row_to_dict(latest_journal),
        "trend": trend,
    }
    return features, context


def questionnaire_status_payload(connection: sqlite3.Connection, user_id: int) -> dict[str, Any]:
    latest_questionnaire = connection.execute(
        """
        SELECT *
        FROM questionnaire_responses
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 1
        """,
        (user_id,),
    ).fetchone()

    if not latest_questionnaire:
        return {
            "due_now": True,
            "reason": "first-time",
            "days_until_due": 0,
            "last_completed_at": None,
            "cadence_days": 30,
            "message": "You have not completed the deeper screening yet. Taking it now can unlock a richer risk profile, stronger pattern detection, and more personalized guidance.",
        }

    last_completed_at = parse_iso_datetime(latest_questionnaire["created_at"])
    if last_completed_at is None:
        return {
            "due_now": True,
            "reason": "unknown-last-date",
            "days_until_due": 0,
            "last_completed_at": latest_questionnaire["created_at"],
            "cadence_days": 30,
            "message": "Your last deeper screening could not be dated clearly, so refreshing it now would improve the quality of your next assessment.",
        }

    next_due_at = last_completed_at + timedelta(days=30)
    now = datetime.now(timezone.utc)
    due_now = now >= next_due_at
    remaining = max(0, (next_due_at.date() - now.date()).days)
    reason = "monthly" if due_now else "recently-completed"

    return {
        "due_now": due_now,
        "reason": reason,
        "days_until_due": 0 if due_now else remaining,
        "last_completed_at": latest_questionnaire["created_at"],
        "cadence_days": 30,
        "message": (
            "A fresh deeper screening is recommended now. Completing it can reveal changes in emotional strain, stress patterns, and overall risk more clearly."
            if due_now
            else "You can refresh the deeper questionnaire anytime. Your last one is still current, but a new response may reveal subtle shifts in mood, stress, and recovery before they become obvious."
        ),
    }


def store_assessment(connection: sqlite3.Connection, user_id: int, result: Any) -> int:
    timestamp = utc_now()
    cursor = connection.cursor()
    cursor.execute(
        """
        INSERT INTO risk_assessments (
            user_id,
            risk_score,
            risk_level,
            classifier_score,
            trend_score,
            text_score,
            questionnaire_score,
            explanations_json,
            alert_type,
            alert_message,
            created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            user_id,
            result.risk_score,
            result.risk_level,
            result.classifier_score,
            result.trend_score,
            result.text_score,
            result.questionnaire_score,
            json.dumps(result.explanations),
            result.alert_type,
            result.alert_message,
            timestamp,
        ),
    )
    assessment_id = cursor.lastrowid

    if result.alert_type and result.alert_message:
        cursor.execute(
            """
            INSERT INTO alerts (user_id, risk_assessment_id, alert_type, severity, message, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                assessment_id,
                result.alert_type,
                result.risk_level,
                result.alert_message,
                timestamp,
            ),
        )

    connection.commit()
    return assessment_id


def store_recommendations(
    connection: sqlite3.Connection,
    user_id: int,
    risk_assessment_id: int,
    recommendations: list[dict[str, str]],
) -> None:
    cursor = connection.cursor()
    for rec in recommendations:
        cursor.execute(
            """
            INSERT INTO recommendations (
                user_id,
                risk_assessment_id,
                title,
                content,
                category,
                created_at
            )
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                risk_assessment_id,
                rec["title"],
                rec["content"],
                rec["category"],
                utc_now(),
            ),
        )
    connection.commit()


def latest_assessment_payload(connection: sqlite3.Connection, user_id: int) -> dict[str, Any] | None:
    assessment = connection.execute(
        """
        SELECT *
        FROM risk_assessments
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 1
        """,
        (user_id,),
    ).fetchone()
    if not assessment:
        return None

    payload = row_to_dict(assessment) or {}
    payload["explanations"] = json.loads(payload.get("explanations_json") or "[]")
    payload.pop("explanations_json", None)
    return payload


def latest_questionnaire_payload(connection: sqlite3.Connection, user_id: int) -> dict[str, Any] | None:
    questionnaire = connection.execute(
        """
        SELECT *
        FROM questionnaire_responses
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 1
        """,
        (user_id,),
    ).fetchone()
    return row_to_dict(questionnaire)


def weekly_summary(connection: sqlite3.Connection, user_id: int) -> dict[str, Any]:
    moods = fetch_recent_moods(connection, user_id, limit=7)
    trend = compute_trend_features(moods)
    risk_rows = connection.execute(
        """
        SELECT risk_score, risk_level, created_at
        FROM risk_assessments
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 7
        """,
        (user_id,),
    ).fetchall()

    avg_stress = round(statistics.fmean([row["stress"] for row in moods]), 2) if moods else 0
    avg_sleep = round(statistics.fmean([row["sleep"] for row in moods]), 2) if moods else 0
    avg_risk = round(statistics.fmean([row["risk_score"] for row in risk_rows]), 2) if risk_rows else 0
    return {
        "avg_mood": trend["recent_avg_mood"],
        "avg_stress": avg_stress,
        "avg_sleep": avg_sleep,
        "avg_risk": avg_risk,
        "volatility_index": trend["volatility"],
        "trend_delta": trend["trend_delta"],
        "decline_streak": trend["decline_streak"],
    }


def admin_user_snapshot(connection: sqlite3.Connection, user_row: sqlite3.Row) -> dict[str, Any]:
    user_id = user_row["id"]
    latest_mood = connection.execute(
        """
        SELECT mood, stress, sleep, energy, created_at
        FROM mood_entries
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 1
        """,
        (user_id,),
    ).fetchone()
    latest_assessment = connection.execute(
        """
        SELECT risk_score, risk_level, alert_type, created_at
        FROM risk_assessments
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 1
        """,
        (user_id,),
    ).fetchone()
    latest_questionnaire = latest_questionnaire_payload(connection, user_id)
    latest_journal = connection.execute(
        """
        SELECT sentiment_label, distress_score, created_at
        FROM journal_entries
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 1
        """,
        (user_id,),
    ).fetchone()
    entries_count = connection.execute(
        "SELECT COUNT(*) AS count FROM mood_entries WHERE user_id = ?",
        (user_id,),
    ).fetchone()
    unread_alerts = connection.execute(
        "SELECT COUNT(*) AS count FROM alerts WHERE user_id = ? AND is_read = 0",
        (user_id,),
    ).fetchone()
    questionnaire_status = questionnaire_status_payload(connection, user_id)

    return {
        "user_id": user_id,
        "email": user_row["email"],
        "is_anonymous": bool(user_row["is_anonymous"]),
        "created_at": user_row["created_at"],
        "entries_count": entries_count["count"] if entries_count else 0,
        "unread_alerts": unread_alerts["count"] if unread_alerts else 0,
        "latest_mood": row_to_dict(latest_mood),
        "latest_assessment": row_to_dict(latest_assessment),
        "latest_questionnaire": latest_questionnaire,
        "latest_journal": row_to_dict(latest_journal),
        "questionnaire_status": questionnaire_status,
    }


@app.on_event("startup")
def startup() -> None:
    create_tables()


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "AI Early Warning System API is running"}


@app.post("/register", response_model=UserResponse)
def register(payload: RegisterRequest) -> UserResponse:
    connection = get_connection()
    cursor = connection.cursor()
    try:
        cursor.execute(
            """
            INSERT INTO users (email, password_hash, is_anonymous, created_at)
            VALUES (?, ?, 0, ?)
            """,
            (payload.email.lower().strip(), hash_password(payload.password), utc_now()),
        )
        connection.commit()
    except sqlite3.IntegrityError as exc:
        connection.close()
        raise HTTPException(status_code=400, detail="Email already exists") from exc

    user_id = cursor.lastrowid
    connection.close()
    return UserResponse(user_id=user_id, email=payload.email.lower().strip(), is_anonymous=False)


@app.post("/login", response_model=UserResponse)
def login(payload: LoginRequest) -> UserResponse:
    connection = get_connection()
    user = connection.execute(
        """
        SELECT * FROM users
        WHERE email = ? AND is_anonymous = 0
        """,
        (payload.email.lower().strip(),),
    ).fetchone()
    connection.close()

    if not user or user["password_hash"] != hash_password(payload.password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    return UserResponse(user_id=user["id"], email=user["email"], is_anonymous=bool(user["is_anonymous"]))


@app.post("/anonymous", response_model=UserResponse)
def create_anonymous_user() -> UserResponse:
    anonymous_email = f"anon-{uuid.uuid4().hex[:10]}@anonymous.local"
    connection = get_connection()
    cursor = connection.cursor()
    cursor.execute(
        """
        INSERT INTO users (email, password_hash, is_anonymous, created_at)
        VALUES (?, ?, 1, ?)
        """,
        (anonymous_email, "", utc_now()),
    )
    connection.commit()
    user_id = cursor.lastrowid
    connection.close()
    return UserResponse(user_id=user_id, email=anonymous_email, is_anonymous=True)


@app.post("/mood")
def submit_mood(payload: MoodRequest) -> dict[str, Any]:
    get_user_or_404(payload.user_id)
    connection = get_connection()
    cursor = connection.cursor()
    cursor.execute(
        """
        INSERT INTO mood_entries (user_id, mood, stress, sleep, energy, note, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            payload.user_id,
            payload.mood,
            payload.stress,
            payload.sleep,
            payload.energy,
            payload.note.strip(),
            utc_now(),
        ),
    )
    connection.commit()
    entry_id = cursor.lastrowid
    connection.close()
    return {"entry_id": entry_id, "status": "saved"}


@app.post("/questionnaire")
def submit_questionnaire(payload: QuestionnaireRequest) -> dict[str, Any]:
    get_user_or_404(payload.user_id)

    if any(answer < 1 or answer > 5 for answer in payload.phq9_answers + payload.gad7_answers):
        raise HTTPException(status_code=400, detail="Questionnaire answers must be between 1 and 5")

    phq_total = int(sum(payload.phq9_answers))
    gad_total = int(sum(payload.gad7_answers))

    connection = get_connection()
    cursor = connection.cursor()
    cursor.execute(
        """
        INSERT INTO questionnaire_responses (
            user_id,
            phq9_total,
            gad7_total,
            phq9_answers,
            gad7_answers,
            created_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            payload.user_id,
            phq_total,
            gad_total,
            json.dumps(payload.phq9_answers),
            json.dumps(payload.gad7_answers),
            utc_now(),
        ),
    )
    connection.commit()
    response_id = cursor.lastrowid
    connection.close()

    return {
        "response_id": response_id,
        "phq9_total": phq_total,
        "gad7_total": gad_total,
    }


@app.get("/questionnaire/status/{user_id}")
def get_questionnaire_status(user_id: int) -> dict[str, Any]:
    get_user_or_404(user_id)
    connection = get_connection()
    status = questionnaire_status_payload(connection, user_id)
    connection.close()
    return status


@app.post("/journal")
def submit_journal(payload: JournalRequest) -> dict[str, Any]:
    get_user_or_404(payload.user_id)
    analysis = analyze_journal_text(payload.text)

    connection = get_connection()
    cursor = connection.cursor()
    cursor.execute(
        """
        INSERT INTO journal_entries (
            user_id,
            text,
            sentiment_label,
            sentiment_score,
            distress_score,
            symptom_flags_json,
            created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            payload.user_id,
            payload.text.strip(),
            analysis["sentiment_label"],
            analysis["sentiment_score"],
            analysis["distress_score"],
            json.dumps(analysis["symptom_flags"]),
            utc_now(),
        ),
    )
    connection.commit()
    journal_id = cursor.lastrowid
    connection.close()

    return {"journal_id": journal_id, **analysis}


@app.post("/assess/{user_id}")
def assess_user(user_id: int) -> dict[str, Any]:
    get_user_or_404(user_id)
    connection = get_connection()
    features, context = build_assessment_payload(connection, user_id)
    result = predictor.predict(features)
    assessment_id = store_assessment(connection, user_id, result)
    questionnaire_status = questionnaire_status_payload(connection, user_id)
    guidance = build_ai_guidance_from_features(
        result,
        features,
        questionnaire_due=bool(questionnaire_status.get("due_now")),
    )
    recommendations = create_recommendations(guidance)
    store_recommendations(connection, user_id, assessment_id, recommendations)
    connection.close()

    return {
        "assessment_id": assessment_id,
        "risk_score": result.risk_score,
        "risk_level": result.risk_level,
        "classifier_score": result.classifier_score,
        "trend_score": result.trend_score,
        "text_score": result.text_score,
        "questionnaire_score": result.questionnaire_score,
        "explanations": result.explanations,
        "alert_type": result.alert_type,
        "alert_message": result.alert_message,
        "guidance": guidance,
        "context": context,
    }


@app.get("/risk/{user_id}")
def get_risk(user_id: int) -> dict[str, Any]:
    get_user_or_404(user_id)
    connection = get_connection()
    payload = latest_assessment_payload(connection, user_id)
    if not payload:
        connection.close()
        raise HTTPException(status_code=404, detail="No assessment found for this user yet")

    latest_mood = connection.execute(
        """
        SELECT * FROM mood_entries
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 1
        """,
        (user_id,),
    ).fetchone()
    latest_questionnaire = connection.execute(
        """
        SELECT * FROM questionnaire_responses
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 1
        """,
        (user_id,),
    ).fetchone()
    latest_journal = connection.execute(
        """
        SELECT * FROM journal_entries
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 1
        """,
        (user_id,),
    ).fetchone()
    summary = weekly_summary(connection, user_id)
    questionnaire_status = questionnaire_status_payload(connection, user_id)
    payload["guidance"] = build_ai_guidance_from_snapshot(
        payload,
        latest_mood,
        latest_questionnaire,
        latest_journal,
        summary,
        questionnaire_status,
    )
    connection.close()
    return payload


@app.get("/history/{user_id}")
def get_history(user_id: int) -> dict[str, Any]:
    get_user_or_404(user_id)
    connection = get_connection()
    entries = connection.execute(
        """
        SELECT
            m.id,
            m.mood,
            m.stress,
            m.sleep,
            m.energy,
            m.note,
            m.created_at,
            (
                SELECT r.risk_level
                FROM risk_assessments r
                WHERE r.user_id = m.user_id
                  AND r.created_at >= m.created_at
                ORDER BY r.created_at ASC, r.id ASC
                LIMIT 1
            ) AS risk_level,
            (
                SELECT r.risk_score
                FROM risk_assessments r
                WHERE r.user_id = m.user_id
                  AND r.created_at >= m.created_at
                ORDER BY r.created_at ASC, r.id ASC
                LIMIT 1
            ) AS risk_score
        FROM mood_entries m
        WHERE m.user_id = ?
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT 14
        """,
        (user_id,),
    ).fetchall()
    connection.close()

    return {"items": [row_to_dict(entry) for entry in entries]}


@app.get("/alerts/{user_id}")
def get_alerts(user_id: int) -> dict[str, Any]:
    get_user_or_404(user_id)
    connection = get_connection()
    alerts = connection.execute(
        """
        SELECT *
        FROM alerts
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 8
        """,
        (user_id,),
    ).fetchall()
    connection.close()
    return {"items": [row_to_dict(alert) for alert in alerts]}


@app.get("/recommendations/{user_id}")
def get_recommendations(user_id: int) -> dict[str, Any]:
    get_user_or_404(user_id)
    connection = get_connection()
    recommendations = connection.execute(
        """
        SELECT *
        FROM recommendations
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 8
        """,
        (user_id,),
    ).fetchall()
    connection.close()
    return {"items": [row_to_dict(rec) for rec in recommendations]}


@app.get("/insights/{user_id}")
def get_insights(user_id: int) -> dict[str, Any]:
    get_user_or_404(user_id)
    connection = get_connection()
    summary = weekly_summary(connection, user_id)
    latest_assessment = latest_assessment_payload(connection, user_id)
    latest_journal = connection.execute(
        """
        SELECT *
        FROM journal_entries
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 1
        """,
        (user_id,),
    ).fetchone()
    trend_points = connection.execute(
        """
        SELECT
            m.created_at,
            m.mood,
            m.stress,
            m.sleep,
            (
                SELECT r.risk_score
                FROM risk_assessments r
                WHERE r.user_id = m.user_id
                  AND r.created_at >= m.created_at
                ORDER BY r.created_at ASC, r.id ASC
                LIMIT 1
            ) AS risk_score
        FROM mood_entries m
        WHERE m.user_id = ?
        ORDER BY m.created_at DESC, m.id DESC
        LIMIT 7
        """,
        (user_id,),
    ).fetchall()
    connection.close()

    return {
        "summary": summary,
        "latest_assessment": latest_assessment,
        "journal": row_to_dict(latest_journal),
        "trend_points": [row_to_dict(point) for point in reversed(trend_points)],
        "deviation_detected": summary["trend_delta"] <= -1.0 or summary["decline_streak"] >= 2,
    }


@app.get("/dashboard/{user_id}")
def get_dashboard(user_id: int) -> dict[str, Any]:
    user = get_user_or_404(user_id)
    connection = get_connection()
    latest_mood = connection.execute(
        """
        SELECT * FROM mood_entries
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 1
        """,
        (user_id,),
    ).fetchone()
    latest_questionnaire = connection.execute(
        """
        SELECT * FROM questionnaire_responses
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 1
        """,
        (user_id,),
    ).fetchone()
    latest_journal = connection.execute(
        """
        SELECT * FROM journal_entries
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 1
        """,
        (user_id,),
    ).fetchone()
    assessment = latest_assessment_payload(connection, user_id)
    alerts = connection.execute(
        """
        SELECT * FROM alerts
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 3
        """,
        (user_id,),
    ).fetchall()
    recommendations = connection.execute(
        """
        SELECT * FROM recommendations
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 4
        """,
        (user_id,),
    ).fetchall()
    history = connection.execute(
        """
        SELECT mood, stress, sleep, created_at
        FROM mood_entries
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 5
        """,
        (user_id,),
    ).fetchall()
    summary = weekly_summary(connection, user_id)
    questionnaire_status = questionnaire_status_payload(connection, user_id)
    guidance = build_ai_guidance_from_snapshot(
        assessment,
        latest_mood,
        latest_questionnaire,
        latest_journal,
        summary,
        questionnaire_status,
    )
    connection.close()

    return {
        "user": {
            "user_id": user["id"],
            "email": user["email"],
            "is_anonymous": bool(user["is_anonymous"]),
        },
        "latest_mood": row_to_dict(latest_mood),
        "latest_questionnaire": row_to_dict(latest_questionnaire),
        "latest_journal": row_to_dict(latest_journal),
        "latest_assessment": assessment,
        "guidance": guidance,
        "questionnaire_status": questionnaire_status,
        "alerts": [row_to_dict(alert) for alert in alerts],
        "recommendations": [row_to_dict(rec) for rec in recommendations],
        "history_preview": [row_to_dict(item) for item in history],
        "summary": summary,
    }


@app.post("/feedback")
def submit_feedback(payload: FeedbackRequest) -> dict[str, Any]:
    get_user_or_404(payload.user_id)
    connection = get_connection()
    cursor = connection.cursor()
    cursor.execute(
        """
        INSERT INTO feedback_submissions (user_id, category, message, created_at)
        VALUES (?, ?, ?, ?)
        """,
        (payload.user_id, payload.category.strip(), payload.message.strip(), utc_now()),
    )
    connection.commit()
    feedback_id = cursor.lastrowid
    connection.close()
    return {"feedback_id": feedback_id, "status": "received"}


@app.post("/admin/login")
def admin_login(payload: AdminLoginRequest) -> dict[str, Any]:
    if payload.email.strip().lower() != ADMIN_EMAIL.lower() or payload.password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="Invalid admin credentials")

    token = uuid.uuid4().hex
    ADMIN_SESSIONS.add(token)
    return {
        "admin_email": ADMIN_EMAIL,
        "admin_token": token,
    }


@app.get("/admin/overview")
def admin_overview(x_admin_token: str | None = Header(default=None)) -> dict[str, Any]:
    assert_admin_token(x_admin_token)
    connection = get_connection()
    total_users = connection.execute("SELECT COUNT(*) AS count FROM users").fetchone()["count"]
    total_entries = connection.execute("SELECT COUNT(*) AS count FROM mood_entries").fetchone()["count"]
    total_assessments = connection.execute("SELECT COUNT(*) AS count FROM risk_assessments").fetchone()["count"]
    total_alerts = connection.execute("SELECT COUNT(*) AS count FROM alerts").fetchone()["count"]
    high_risk_users = connection.execute(
        """
        SELECT COUNT(*) AS count
        FROM (
            SELECT user_id, risk_level
            FROM risk_assessments
            WHERE id IN (
                SELECT MAX(id)
                FROM risk_assessments
                GROUP BY user_id
            )
            AND risk_level = 'HIGH'
        )
        """
    ).fetchone()["count"]
    average_risk_row = connection.execute("SELECT AVG(risk_score) AS avg_risk FROM risk_assessments").fetchone()
    due_questionnaires = 0
    users = connection.execute("SELECT * FROM users ORDER BY id ASC").fetchall()
    snapshots = []
    for user in users:
        snapshot = admin_user_snapshot(connection, user)
        snapshots.append(snapshot)
        if snapshot["questionnaire_status"]["due_now"]:
            due_questionnaires += 1

    connection.close()
    return {
        "summary": {
            "total_users": total_users,
            "total_entries": total_entries,
            "total_assessments": total_assessments,
            "total_alerts": total_alerts,
            "high_risk_users": high_risk_users,
            "average_risk_score": round(float(average_risk_row["avg_risk"] or 0), 2),
            "questionnaires_due": due_questionnaires,
        },
        "users": snapshots,
    }


@app.get("/admin/users")
def admin_users(x_admin_token: str | None = Header(default=None)) -> dict[str, Any]:
    assert_admin_token(x_admin_token)
    connection = get_connection()
    users = connection.execute("SELECT * FROM users ORDER BY created_at DESC, id DESC").fetchall()
    payload = [admin_user_snapshot(connection, user) for user in users]
    connection.close()
    return {"items": payload}


@app.get("/admin/user/{user_id}")
def admin_user_detail(user_id: int, x_admin_token: str | None = Header(default=None)) -> dict[str, Any]:
    assert_admin_token(x_admin_token)
    user = get_user_or_404(user_id)
    connection = get_connection()
    snapshot = admin_user_snapshot(connection, user)
    history_rows = connection.execute(
        """
        SELECT mood, stress, sleep, energy, note, created_at
        FROM mood_entries
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 30
        """,
        (user_id,),
    ).fetchall()
    assessments = connection.execute(
        """
        SELECT risk_score, risk_level, classifier_score, trend_score, text_score, questionnaire_score, created_at
        FROM risk_assessments
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 20
        """,
        (user_id,),
    ).fetchall()
    alerts = connection.execute(
        """
        SELECT severity, alert_type, message, created_at, is_read
        FROM alerts
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 20
        """,
        (user_id,),
    ).fetchall()
    feedback = connection.execute(
        """
        SELECT category, message, created_at
        FROM feedback_submissions
        WHERE user_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT 10
        """,
        (user_id,),
    ).fetchall()
    connection.close()

    return {
        "user": snapshot,
        "history": [row_to_dict(row) for row in history_rows],
        "assessments": [row_to_dict(row) for row in assessments],
        "alerts": [row_to_dict(row) for row in alerts],
        "feedback": [row_to_dict(row) for row in feedback],
    }


@app.get("/demo/seed/{user_id}")
def seed_demo_data(user_id: int) -> dict[str, Any]:
    get_user_or_404(user_id)
    connection = get_connection()
    cursor = connection.cursor()

    base = datetime.now(timezone.utc) - timedelta(days=5)
    samples = [
        {"mood": 7, "stress": 4, "sleep": 7.5, "energy": 7, "note": "Managed the workload well."},
        {"mood": 6, "stress": 5, "sleep": 6.5, "energy": 6, "note": "A little more tired than usual."},
        {"mood": 5, "stress": 6, "sleep": 6.0, "energy": 5, "note": "Felt pressure building through the day."},
        {"mood": 4, "stress": 7, "sleep": 5.5, "energy": 4, "note": "Hard to focus and stay calm."},
        {"mood": 3, "stress": 8, "sleep": 4.5, "energy": 3, "note": "Overwhelmed and mentally drained."},
    ]

    for index, sample in enumerate(samples):
        timestamp = (base + timedelta(days=index)).isoformat()
        cursor.execute(
            """
            INSERT INTO mood_entries (user_id, mood, stress, sleep, energy, note, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                sample["mood"],
                sample["stress"],
                sample["sleep"],
                sample["energy"],
                sample["note"],
                timestamp,
            ),
        )

    cursor.execute(
        """
        INSERT INTO questionnaire_responses (
            user_id, phq9_total, gad7_total, phq9_answers, gad7_answers, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            user_id,
            15,
            13,
            json.dumps([2, 2, 2, 1, 2, 2, 1, 1, 2]),
            json.dumps([2, 2, 2, 2, 2, 2, 1]),
            utc_now(),
        ),
    )
    journal_analysis = analyze_journal_text(
        "I feel overwhelmed, exhausted and anxious. It has been hard to sleep and hard to recover."
    )
    cursor.execute(
        """
        INSERT INTO journal_entries (
            user_id, text, sentiment_label, sentiment_score, distress_score, symptom_flags_json, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            user_id,
            "I feel overwhelmed, exhausted and anxious. It has been hard to sleep and hard to recover.",
            journal_analysis["sentiment_label"],
            journal_analysis["sentiment_score"],
            journal_analysis["distress_score"],
            json.dumps(journal_analysis["symptom_flags"]),
            utc_now(),
        ),
    )
    connection.commit()
    connection.close()

    result = assess_user(user_id)
    return {"status": "seeded", "assessment": result}
