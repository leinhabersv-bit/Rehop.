CREATE TABLE IF NOT EXISTS ride_journeys (
    id text PRIMARY KEY,
    payload jsonb NOT NULL,
    last_tick timestamptz
);

CREATE TABLE IF NOT EXISTS ride_booking_slots (
    rider_id uuid PRIMARY KEY,
    journey_id text NOT NULL REFERENCES ride_journeys(id)
);
