CREATE TABLE IF NOT EXISTS ride_journeys (
    id text PRIMARY KEY,
    payload jsonb NOT NULL,
    last_tick timestamptz
);

CREATE TABLE IF NOT EXISTS ride_booking_slots (
    rider_id uuid PRIMARY KEY,
    journey_id text NOT NULL REFERENCES ride_journeys(id)
);

CREATE TABLE IF NOT EXISTS ride_events (
    journey_id text NOT NULL REFERENCES ride_journeys(id),
    seq int NOT NULL,
    event_id text NOT NULL,
    type text NOT NULL,
    ride_id text,
    ts timestamptz NOT NULL,
    payload jsonb NOT NULL,
    PRIMARY KEY (journey_id, seq)
);

CREATE TABLE IF NOT EXISTS ride_idempotency (
    journey_id text NOT NULL REFERENCES ride_journeys(id),
    operation text NOT NULL,
    key text NOT NULL,
    request_hash text NOT NULL,
    response jsonb NOT NULL,
    PRIMARY KEY (journey_id, operation, key),
    UNIQUE (journey_id, key)
);
