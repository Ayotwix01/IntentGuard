"""
Pydantic models for IntentGuard.

These define the exact request/response shapes the frontend and backend agree on.
Keeping everything in one file makes it easy to see the whole "API contract" at a glance.
"""

from typing import Optional, Literal
from pydantic import BaseModel, Field, field_validator

DEFAULT_MAX_TRANSACTIONS_PER_HOUR = 10


class Transaction(BaseModel):
    """A single proposed on-chain payment the agent wants to make."""

    recipient: str = Field(..., min_length=1, description="Destination wallet address, e.g. 0xABC...")
    amount: float = Field(..., gt=0, description="Amount of the payment, must be positive")
    token: str = Field(..., min_length=1, description="Token symbol, e.g. USDC")
    reason: str = Field(..., min_length=1, description="Agent-provided justification for the payment")

    @field_validator("recipient")
    @classmethod
    def recipient_must_not_be_blank(cls, value: str) -> str:
        cleaned_value = value.strip()
        if not cleaned_value:
            raise ValueError("recipient must not be blank")
        return cleaned_value


class Policy(BaseModel):
    """Deterministic, human-set rules the transaction must obey no matter what."""

    max_amount: float = Field(..., gt=0, description="Maximum allowed amount per transaction")
    approved_recipient: str = Field(..., min_length=1, description="The only address this agent may pay")
    max_transactions_per_hour: int = Field(
        default=DEFAULT_MAX_TRANSACTIONS_PER_HOUR,
        gt=0,
        description="Simple velocity limit for the demo",
    )

    @field_validator("approved_recipient")
    @classmethod
    def approved_recipient_must_not_be_blank(cls, value: str) -> str:
        cleaned_value = value.strip()
        if not cleaned_value:
            raise ValueError("approved_recipient must not be blank")
        return cleaned_value


class VerifyIntentRequest(BaseModel):
    """The full payload sent to POST /api/verify-intent."""

    mandate: str = Field(..., description="Plain-English instruction from the human")
    transaction: Transaction
    policy: Policy


class Checks(BaseModel):
    """Breakdown of which individual checks passed or failed."""

    amount_check: bool
    recipient_check: bool
    velocity_check: bool
    intent_check: bool


Decision = Literal["ALLOW", "BLOCK", "REVIEW"]


class VerifyIntentResponse(BaseModel):
    """What we send back to the frontend after evaluating a transaction."""

    decision: Decision
    reason: str
    checks: Checks
    # Extra debug info that's genuinely useful for a live demo — safe to ignore in the UI.
    failure_type: Optional[Literal["HARD_POLICY_FAILURE", "INTENT_FAILURE", "NONE"]] = None
