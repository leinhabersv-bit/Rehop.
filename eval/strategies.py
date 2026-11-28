"""Three deterministic strategies for the simulated paired benchmark."""

from app.intelligence.decision import Decision
from app.intelligence.interface import DefaultIntelligence
from app.intelligence.risk import assess
from app.schemas.enums import DecisionType, RideState

MANUAL_REBOOK_DELAY_SEC = 180


class NoRecovery(DefaultIntelligence):
    def decide(self, context):
        if (
            context.active_ride is None
            and context.last_ride
            and context.last_ride.state == RideState.DRIVER_CANCELLED
        ):
            selected = next(iter(context.ranked_backups), None)
            return Decision(
                DecisionType.REQUEST_APPROVAL if selected else DecisionType.STOP,
                ["SIMULATED_MANUAL_REBOOK"],
                super().decide(context).numbers,
                selected,
            )
        return Decision(
            DecisionType.MONITOR,
            ["SIMULATED_WAIT"],
            super().decide(context).numbers,
            None,
        )


class SimpleRule(DefaultIntelligence):
    def assess(self, history, ride, now, need_by, chat_signal, tracker):
        features, _ = super().assess(history, ride, now, need_by, chat_signal, tracker)
        risk = assess(
            stationary_duration_s=features.stationary_duration_s,
            eta_delta_s=features.eta_delta_s_120s,
            distance_to_pickup_m=features.distance_to_pickup_m,
            gps_age_s=features.gps_age_s,
            gps_quality=features.gps_quality,
        )
        self.latest_features = features
        return features, risk

    def rank_backups(self, quotes, **context):
        ranked = super().rank_backups(quotes, **context)
        ranked.quotes.sort(key=lambda q: (q.estimated_fare_inr, q.provider.value))
        return ranked

    def decide(self, context):
        features = context.features or getattr(self, "latest_features", None)
        if context.active_ride and features:
            candidate = next(iter(context.ranked_backups), None)
            if features.stationary_duration_s > 120 and candidate:
                return Decision(
                    DecisionType.REQUEST_APPROVAL,
                    ["SIMULATED_STATIONARY_120S"],
                    super().decide(context).numbers,
                    candidate,
                )
            return Decision(
                DecisionType.MONITOR,
                ["SIMULATED_SIMPLE_WAIT"],
                super().decide(context).numbers,
                None,
            )
        return super().decide(context)


STRATEGIES = {"B0": NoRecovery, "B1": SimpleRule, "B2": DefaultIntelligence}
