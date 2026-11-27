from hypothesis import settings
from hypothesis import strategies as st
from hypothesis.stateful import RuleBasedStateMachine, initialize, invariant, precondition, rule

from app.domain.errors import SimulationError
from app.domain.invariants import check_invariants
from app.domain.state_machine import ACTIVE_RIDE_STATES, TERMINAL_JOURNEY_STATES
from app.schemas.enums import OpStatus
from app.schemas.requests import InjectRequest, JourneyCreate, RecoveryPolicy
from app.services.journey_service import JourneyService
from app.simulation.durable import StoredSession
from app.simulation.engine import LOCATIONS, Session


class RecoveryMachine(RuleBasedStateMachine):
    @initialize(auto=st.booleans(), attempts=st.integers(0, 4), stalled=st.booleans())
    def start(self, auto, attempts, stalled):
        request = JourneyCreate(
            pickup=LOCATIONS[0],
            dropoff=LOCATIONS[1],
            policy=RecoveryPolicy(
                auto_rebook_on_confirmed_driver_cancel=auto, max_recovery_attempts=attempts
            ),
        )
        self.j = Session(request, scenario="S03")
        self.j.book(self.j.quotes[0].quote_id, "book")
        if stalled:
            self.j.tick(25)
        self.service = JourneyService()
        self.terminal_seq = None

    @rule(steps=st.sampled_from([1, 8, 20]))
    def tick(self, steps):
        self.j.tick(steps)

    @precondition(
        lambda self: self.j.ride and self.j.ride.state == "DRIVER_EN_ROUTE" and self.j.state != "RECONCILING"
    )
    @rule()
    def driver_cancel(self):
        self.service._apply_injection(self.j, InjectRequest(kind="DRIVER_CANCEL", params={}))

    @precondition(lambda self: self.j.pending_backup is not None)
    @rule(approved=st.booleans())
    def approve_or_reject(self, approved):
        self.j.approve_switch(approved, f"approval-{self.j.version}")

    @precondition(lambda self: self.j.state not in TERMINAL_JOURNEY_STATES)
    @rule()
    def stop(self):
        try:
            self.j.cancel(f"stop-{self.j.version}")
        except SimulationError as error:
            assert error.code == "CANCEL_UNCONFIRMED"

    @precondition(lambda self: self.j.ride and self.j.state in {"MONITORING", "AWAITING_APPROVAL"})
    @rule()
    def board(self):
        if self.j.ride.state == "DRIVER_EN_ROUTE":
            self.service._arrive(self.j)
        self.j.confirm_pickup("board")

    @rule(cancel=st.booleans(), result=st.sampled_from([OpStatus.UNKNOWN, OpStatus.FAILED]))
    def force(self, cancel, result):
        j = self.j
        provider = (
            j.ride.provider
            if cancel and j.ride
            else j.pending_backup.provider
            if j.pending_backup
            else j.quotes[2].provider
        )
        self.service._apply_injection(
            j,
            InjectRequest(
                kind="FORCE_CANCEL_RESULT" if cancel else "FORCE_CONFIRM_RESULT",
                params={"provider": provider, "result": result},
            ),
        )

    @rule()
    def reload(self):
        self.j = StoredSession.model_validate_json(
            StoredSession.model_validate(vars(self.j)).model_dump_json()
        ).restore()

    @invariant()
    def safety(self):
        j = self.j
        check_invariants(j.snapshot())
        assert sum(s in ACTIVE_RIDE_STATES for p in j.provider_states.values() for s in p.rides.values()) <= 1
        if self.terminal_seq is not None:
            assert not any(
                e.type in {"RIDE_CONFIRMED", "RECOVERY_STARTED", "RIDE_CANCEL_REQUESTED"}
                for e in j.events[self.terminal_seq :]
            )
        if j.state in TERMINAL_JOURNEY_STATES and self.terminal_seq is None:
            self.terminal_seq = j.last_seq()
        active = None
        uncertain = False
        confirmed_cancellations = set()
        previous_confirmed = None
        for e in j.events:
            if e.type == "RECONCILIATION_REQUIRED":
                uncertain = True
            elif e.type == "RECONCILED":
                uncertain = False
            elif e.type in {"DRIVER_CANCELLED", "RIDE_CANCEL_CONFIRMED"}:
                assert active == e.ride_id or uncertain
                confirmed_cancellations.add(e.ride_id)
                active = None
            elif e.type == "RECOVERY_STARTED":
                assert active is None and not uncertain
            elif e.type == "RIDE_CONFIRMED":
                assert active is None and not uncertain
                if e.payload["replacement"]:
                    assert previous_confirmed in confirmed_cancellations
                previous_confirmed = active = e.ride_id
                assert (
                    next(
                        q
                        for q in j.quotes
                        if q.quote_id == e.model_dump(mode="json")["payload"]["ride"]["quote_id"]
                    ).estimated_fare_inr
                    <= j.policy.max_total_fare_inr
                )


TestRecovery = RecoveryMachine.TestCase
TestRecovery.settings = settings(max_examples=300, stateful_step_count=30, deadline=None)
