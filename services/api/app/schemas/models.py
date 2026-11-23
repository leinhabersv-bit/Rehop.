"""Compatibility exports for the original schema module."""

from app.schemas.enums import Provider as Provider
from app.schemas.errors import ErrorEnvelope as ErrorEnvelope
from app.schemas.errors import ErrorPayload as ErrorPayload
from app.schemas.requests import ActionRequest as ActionRequest
from app.schemas.requests import ApprovalRequest as ApprovalRequest
from app.schemas.requests import BookRequest as BookRequest
from app.schemas.requests import DriverMessageRequest as DriverMessageRequest
from app.schemas.requests import JourneyCreate as JourneyCreate
from app.schemas.requests import Location as Location
from app.schemas.requests import ParseIntentRequest as ParseIntentRequest
from app.schemas.requests import QuoteRequest as QuoteRequest
from app.schemas.requests import RecoveryPolicy as RecoveryPolicy
from app.schemas.requests import TickRequest as TickRequest
