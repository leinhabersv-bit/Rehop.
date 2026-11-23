"""RideRescue simulation API. No live commercial ride integrations."""

import asyncio
import os

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.routes.journeys import router
from app.schemas.errors import ErrorEnvelope, ErrorPayload, SimulationError
from app.simulation.engine import store

app = FastAPI(
    title="RideRescue Simulation API",
    version="0.1.0",
    description="Synthetic cab-provider simulation for a hackathon. No real bookings.",
)
origins = [o.strip() for o in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware, allow_origins=origins, allow_credentials=True, allow_methods=["*"], allow_headers=["*"]
)
app.include_router(router)


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
    await websocket.accept()
    try:
        with store.lock:
            store.get(journey_id)
        last_seq = max(0, int(websocket.query_params.get("since_seq", "0")))
        while True:
            with store.lock:
                journey = store.get(journey_id)
                pending = [e for e in journey.events if e.seq > last_seq]
            for event in pending:
                await websocket.send_json(event.model_dump(mode="json"))
                last_seq = event.seq
            await asyncio.sleep(0.5)
    except (WebSocketDisconnect, asyncio.CancelledError):
        return
    except SimulationError:
        await websocket.close(code=4404)
