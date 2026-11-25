"""RideRescue simulation API. No live commercial ride integrations."""

import asyncio
import os
import re
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool

from app.routes.journeys import router
from app.schemas.errors import ErrorEnvelope, ErrorPayload, SimulationError
from app.simulation.durable import HOSTED, tracking
from app.simulation.engine import store


def advance_rider_pickups() -> None:
    with store.lock:
        for journey in store.sessions.values():
            if not journey.deterministic and tracking(journey):
                journey.tick(1)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    if HOSTED:
        yield
        return

    async def run_clock() -> None:
        while True:
            await asyncio.sleep(5)
            await run_in_threadpool(advance_rider_pickups)

    clock = asyncio.create_task(run_clock())
    try:
        yield
    finally:
        clock.cancel()
        with suppress(asyncio.CancelledError):
            await clock


app = FastAPI(
    title="RideRescue Simulation API",
    version="0.1.0",
    description="Synthetic cab-provider simulation for a hackathon. No real bookings.",
    lifespan=lifespan,
)
origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware, allow_origins=origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"]
)
app.include_router(router)

if HOSTED:
    public_api = {
        "GET": re.compile(r"/(?:health|api/v1/(?:locations|journeys/journey_[a-f0-9]{12}(?:/events)?))"),
        "POST": re.compile(
            r"/api/v1/(?:intent/parse|journeys(?:/journey_[a-f0-9]{12}/"
            r"(?:book|cancel|rescue/approve|pickup/confirm|driver-message))?)"
        ),
    }

    @app.middleware("http")
    async def public_routes(request: Request, call_next):
        pattern = public_api.get(request.method)
        if not pattern or not pattern.fullmatch(request.url.path):
            return JSONResponse({"error": {"message": "Route unavailable."}}, status_code=404)
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        return response


@app.exception_handler(SimulationError)
async def simulation_error_handler(request: Request, exc: SimulationError):
    return JSONResponse(
        status_code=exc.status,
        content=ErrorEnvelope(
            error=ErrorPayload(code=exc.code, message=str(exc), retryable=exc.retryable)
        ).model_dump(mode="json"),
    )


@app.get("/health")
def health():
    return {"status": "ok", "version": "0.1.0", "simulation_only": True}


@app.websocket("/ws/journeys/{journey_id}")
async def journey_stream(websocket: WebSocket, journey_id: str):
    if HOSTED:
        await websocket.close(code=4404)
        return

    def pending_events(after_seq: int):
        with store.lock:
            journey = store.get(journey_id)
            return journey.list_events(after_seq)

    await websocket.accept()
    try:
        try:
            last_seq = max(0, int(websocket.query_params.get("since_seq", "0")))
        except ValueError:
            await websocket.close(code=4400)
            return
        while True:
            pending = await run_in_threadpool(pending_events, last_seq)
            for event in pending:
                await websocket.send_json(event.model_dump(mode="json"))
                last_seq = event.seq
            try:
                message = await asyncio.wait_for(websocket.receive(), timeout=0.5)
            except TimeoutError:
                continue
            if message["type"] == "websocket.disconnect":
                return
    except (WebSocketDisconnect, asyncio.CancelledError):
        return
    except SimulationError:
        await websocket.close(code=4404)
