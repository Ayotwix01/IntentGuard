"""
API routes for IntentGuard.

This file is deliberately thin: it just orchestrates the two guardrail
layers (deterministic policy_engine + semantic intent_verifier) and
shapes the combined result into VerifyIntentResponse.
"""

from fastapi import APIRouter, HTTPException
from app.models import VerifyIntentRequest, VerifyIntentResponse, Checks
from app import policy_engine
from app.intent_verifier import verify_intent

router = APIRouter()


@router.post("/api/verify-intent", response_model=VerifyIntentResponse)
async def verify_intent_endpoint(payload: VerifyIntentRequest) -> VerifyIntentResponse:
    try:
        transaction = payload.transaction
        policy = payload.policy

        # --- Layer 1: hard, deterministic policy checks -------------------
        policy_results = policy_engine.run_policy_checks(transaction, policy)
        hard_checks_passed = all(policy_results.values())

        # --- Layer 2: semantic intent check --------------------------------
        # We still run this even if a hard check already failed, so the
        # response can show the full picture (useful for the demo UI).
        intent_decision, intent_reason = await verify_intent(
            mandate=payload.mandate,
            transaction=transaction,
            recipient_check=policy_results["recipient_check"],
        )
        intent_check_passed = intent_decision == "ALLOW"

        # --- Combine into a single final decision --------------------------
        if not hard_checks_passed:
            failed = [name for name, ok in policy_results.items() if not ok]
            decision = "BLOCK"
            reason = f"Hard policy check(s) failed: {', '.join(failed)}."
            failure_type = "HARD_POLICY_FAILURE"
        elif intent_decision == "ALLOW":
            decision = "ALLOW"
            reason = intent_reason
            failure_type = "NONE"
        else:
            # intent_decision is BLOCK or REVIEW while hard checks passed
            decision = intent_decision
            reason = intent_reason
            failure_type = "INTENT_FAILURE"

        # Only count the transaction toward velocity limits if it actually went through.
        if decision == "ALLOW":
            policy_engine.record_transaction(transaction)

        return VerifyIntentResponse(
            decision=decision,
            reason=reason,
            checks=Checks(
                amount_check=policy_results["amount_check"],
                recipient_check=policy_results["recipient_check"],
                velocity_check=policy_results["velocity_check"],
                intent_check=intent_check_passed,
            ),
            failure_type=failure_type,
        )

    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001 - top-level safety net for a hackathon demo
        raise HTTPException(status_code=500, detail=f"Internal error: {exc}") from exc
