# Persistence milestone (BE1)

The starter uses a process-local, lock-guarded event store so it runs with no database setup. Replace `SimulationStore` with SQLite-backed atomic journey/event transactions before claiming production-like recovery guarantees. Document migration and run concurrency tests. In-memory data is lost on restart.
