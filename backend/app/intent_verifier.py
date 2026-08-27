"""
Intent verification layer — the semantic/"soft" guardrail.

This is the novel part of IntentGuard: even a transaction that passes
every deterministic policy check (amount, recipient, velocity) can still
be checked here for whether it actually matches what the human meant.

Two implementations live behind the same interface:
  - verify_intent_mock()      -> deterministic, no API key needed, used by default.
  - verify_intent_with_minimax() in minimax_client.py -> real LLM judge, opt-in.

`USE_MINIMAX` (env var) controls which one routes.py effectively uses.
Because both return the same (decision, reason) shape, swapping providers
later requires no changes anywhere else in the app.
"""

import os
import re
from app.models import Transaction
from app.minimax_client import verify_intent_with_minimax

USE_MINIMAX = os.getenv("USE_MINIMAX", "false").lower() == "true"


def _mandated_max_amount(mandate: str) -> float | None:
    match = re.search(
        r"\b(?:up\s+to|max(?:imum)?(?:\s+amount)?|not\s+more\s+than)\s*\$?\s*([\d,]+(?:\.\d+)?)",
        mandate,
        re.IGNORECASE,
    )
    if not match:
        return None
    return float(match.group(1).replace(",", ""))


def verify_intent_mock(mandate: str, transaction: Transaction, recipient_check: bool) -> tuple[str, str]:
    """
    Deterministic stand-in for an LLM judge, good enough to drive the
    hackathon demo scenarios without any external API.

    Logic:
      - If the recipient doesn't match the mandate's approved party,
        that's a clear intent violation -> BLOCK.
      - If the mandate states a maximum amount and the transaction exceeds it,
        that's a clear intent violation -> BLOCK.
      - If the stated reason contains language suggesting the agent was
        told to deviate from the mandate (classic prompt-injection
        phrasing), flag it -> BLOCK, even if the recipient happened to match.
      - Otherwise, the transaction is consistent with the mandate -> ALLOW.
    """
    reason_lower = transaction.reason.lower()

    suspicious_phrases = [
        "changed payment provider",
        "changed their address",
        "new wallet",
        "updated bank",
        "ignore previous",
        "different address",
        "actually send",
        "send instead",
    ]

    if not recipient_check:
        return (
            "BLOCK",
            "Recipient does not match the address approved in the human's mandate.",
        )

    mandated_max_amount = _mandated_max_amount(mandate)
    if mandated_max_amount is not None and transaction.amount > mandated_max_amount:
        return (
            "BLOCK",
            f"Transaction amount exceeds the ${mandated_max_amount:g} maximum in the human's mandate.",
        )

    if any(phrase in reason_lower for phrase in suspicious_phrases):
        return (
            "REVIEW",
            "The transaction reason contains language typical of a manipulated "
            "or injected instruction. Escalating for human review.",
        )

    return (
        "ALLOW",
        "The transaction's recipient and stated reason are consistent with the mandate.",
    )


async def verify_intent(mandate: str, transaction: Transaction, recipient_check: bool) -> tuple[str, str]:
    """
    Single entry point routes.py calls. Picks mock or real MiniMax based
    on the USE_MINIMAX env var, without the caller needing to know which.
    """
    if USE_MINIMAX:
        transaction_summary = (
            f"recipient={transaction.recipient}, amount={transaction.amount} "
            f"{transaction.token}, reason=\"{transaction.reason}\""
        )
        return await verify_intent_with_minimax(mandate, transaction_summary)

    return verify_intent_mock(mandate, transaction, recipient_check)
