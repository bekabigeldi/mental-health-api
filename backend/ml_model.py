from dataclasses import dataclass
from typing import List

import numpy as np

try:
    from sklearn.linear_model import LogisticRegression
except ImportError:  # pragma: no cover - fallback is intentional for lightweight demos
    LogisticRegression = None


@dataclass
class AssessmentFeatures:
    mood: int
    stress: int
    sleep: float
    energy: int
    phq9_total: int
    gad7_total: int
    sentiment_score: float
    distress_score: float
    recent_avg_mood: float
    trend_delta: float
    volatility: float
    decline_streak: int


@dataclass
class RiskResult:
    risk_score: float
    risk_level: str
    classifier_score: float
    trend_score: float
    text_score: float
    questionnaire_score: float
    explanations: List[str]
    alert_type: str | None
    alert_message: str | None


class RiskPredictor:
    def __init__(self) -> None:
        self.model = None
        self._train_model()

    def _train_model(self) -> None:
        if LogisticRegression is None:
            return

        rng = np.random.default_rng(42)
        mood = rng.integers(1, 11, size=2500)
        stress = rng.integers(1, 11, size=2500)
        sleep = rng.uniform(3.0, 10.0, size=2500).round(1)
        energy = rng.integers(1, 11, size=2500)
        phq9_total = rng.integers(9, 46, size=2500)
        gad7_total = rng.integers(7, 36, size=2500)
        sentiment_score = rng.uniform(-1.0, 1.0, size=2500).round(3)
        distress_score = rng.uniform(0.0, 1.0, size=2500).round(3)
        recent_avg_mood = np.clip(mood + rng.normal(0, 1.3, size=2500), 1, 10).round(2)
        trend_delta = rng.uniform(-4.0, 4.0, size=2500).round(3)
        volatility = rng.uniform(0.0, 1.0, size=2500).round(3)
        decline_streak = rng.integers(0, 6, size=2500)

        weighted_signal = (
            (11 - mood) * 0.12
            + stress * 0.09
            + np.clip(7 - sleep, 0, None) * 0.14
            + (11 - energy) * 0.11
            + (phq9_total / 45.0) * 2.2
            + (gad7_total / 35.0) * 1.4
            + distress_score * 2.2
            + np.clip(-trend_delta, 0, None) * 0.35
            + volatility * 1.5
            + decline_streak * 0.35
            - np.clip(sentiment_score, 0, None) * 0.9
            + rng.normal(0, 0.8, size=2500)
        )

        labels = np.where(weighted_signal >= 7.8, 2, np.where(weighted_signal >= 4.7, 1, 0))
        features = np.column_stack(
            (
                mood,
                stress,
                sleep,
                energy,
                phq9_total,
                gad7_total,
                sentiment_score,
                distress_score,
                recent_avg_mood,
                trend_delta,
                volatility,
                decline_streak,
            )
        )

        self.model = LogisticRegression(max_iter=1200)
        self.model.fit(features, labels)

    def predict(self, features: AssessmentFeatures) -> RiskResult:
        questionnaire_score = min(
            1.0,
            ((features.phq9_total / 45.0) * 0.62) + ((features.gad7_total / 35.0) * 0.38),
        )
        text_score = min(
            1.0,
            (features.distress_score * 0.75)
            + (max(0.0, -features.sentiment_score) * 0.25),
        )
        trend_score = min(
            1.0,
            (
                max(0.0, -features.trend_delta) / 4.0
                + features.volatility * 0.55
                + min(features.decline_streak, 4) / 4.0 * 0.45
            )
            / 1.8,
        )

        if self.model is not None:
            vector = np.array(
                [
                    [
                        features.mood,
                        features.stress,
                        features.sleep,
                        features.energy,
                        features.phq9_total,
                        features.gad7_total,
                        features.sentiment_score,
                        features.distress_score,
                        features.recent_avg_mood,
                        features.trend_delta,
                        features.volatility,
                        features.decline_streak,
                    ]
                ],
                dtype=float,
            )
            probabilities = self.model.predict_proba(vector)[0]
            classifier_score = float((probabilities[1] + (probabilities[2] * 2.0)) / 2.0)
        else:
            classifier_score = self._rule_based_classifier(features)

        risk_score = min(
            1.0,
            (classifier_score * 0.48)
            + (questionnaire_score * 0.24)
            + (text_score * 0.13)
            + (trend_score * 0.15),
        )

        if (
            risk_score >= 0.73
            or features.phq9_total >= 29
            or (features.mood <= 3 and features.stress >= 8)
            or (trend_score >= 0.62 and text_score >= 0.55)
        ):
            risk_level = "HIGH"
            risk_score = max(risk_score, 0.76)
        elif risk_score >= 0.43 or features.phq9_total >= 17 or features.gad7_total >= 17:
            risk_level = "MEDIUM"
            risk_score = max(risk_score, 0.48)
        else:
            risk_level = "LOW"
            risk_score = min(risk_score, 0.39)

        explanations = self._build_explanations(features, questionnaire_score, text_score, trend_score)
        alert_type, alert_message = self._build_alert(risk_level, features, trend_score)

        return RiskResult(
            risk_score=round(risk_score, 2),
            risk_level=risk_level,
            classifier_score=round(classifier_score, 2),
            trend_score=round(trend_score, 2),
            text_score=round(text_score, 2),
            questionnaire_score=round(questionnaire_score, 2),
            explanations=explanations,
            alert_type=alert_type,
            alert_message=alert_message,
        )

    def _rule_based_classifier(self, features: AssessmentFeatures) -> float:
        score = (
            ((11 - features.mood) / 10.0) * 0.24
            + (features.stress / 10.0) * 0.16
            + (max(0.0, 8.0 - features.sleep) / 8.0) * 0.12
            + ((11 - features.energy) / 10.0) * 0.12
            + (features.phq9_total / 45.0) * 0.18
            + (features.gad7_total / 35.0) * 0.10
            + features.distress_score * 0.08
        )
        return min(1.0, score)

    def _build_explanations(
        self,
        features: AssessmentFeatures,
        questionnaire_score: float,
        text_score: float,
        trend_score: float,
    ) -> List[str]:
        explanations: List[str] = []

        if features.mood <= 4:
            explanations.append("Low self-reported mood is one of the strongest contributors to the current risk.")
        if features.stress >= 7:
            explanations.append("Stress levels are elevated and are increasing the screening score.")
        if features.sleep < 6:
            explanations.append("Reduced sleep can amplify emotional vulnerability and warning signals.")
        if features.phq9_total >= 17 or features.gad7_total >= 17:
            explanations.append("Questionnaire severity is in a clinically meaningful range and raises concern.")
        if text_score >= 0.5:
            explanations.append("Journal language shows negative emotional tone and distress-related cues.")
        if trend_score >= 0.45:
            explanations.append("Recent check-ins suggest deterioration from the user's short-term baseline.")
        if questionnaire_score < 0.3 and text_score < 0.35 and trend_score < 0.35:
            explanations.append("Current indicators remain relatively stable compared with recent entries.")

        return explanations[:4]

    def _build_alert(
        self,
        risk_level: str,
        features: AssessmentFeatures,
        trend_score: float,
    ) -> tuple[str | None, str | None]:
        if risk_level == "HIGH":
            return (
                "high-risk",
                "High risk detected. Consider reaching out to a trusted person or mental health professional soon.",
            )
        if trend_score >= 0.55 and features.decline_streak >= 2:
            return (
                "downward-trend",
                "Your recent pattern shows a sustained decline. Repeat the check-in tomorrow and monitor closely.",
            )
        if features.sleep < 5 and features.stress >= 8:
            return (
                "sleep-stress",
                "Very low sleep together with high stress may indicate rising vulnerability.",
            )
        return None, None
