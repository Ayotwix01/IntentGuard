"""
Deterministic policy engine.

This is the "hard guardrail" layer: pure rule checks with no AI involved.
Even if every other layer in the system is fooled, these checks are the
floor that can't be talked around by clever phrasing.

For the hackathon MVP this lives in-memory. In a real system these rules
would be mirrored on-chain (e.g. in a smart contract / account module) so
they hold even if this backend is compromised.
"""

import time
from collections import defaultdict
from app.models import Transaction, Policy

# --- Simple in-memory velocity tracking ---------------------------------
# Maps a recipient address -> list of timestamps of allowed transactions.
# This resets whenever the process restarts, which is fine for a demo.
_transaction_log: dict[str, list[float]] = defaultdict(list)

ONE_HOUR_SECONDS = 60 * 60


def _prune_old_entries(timestamps: list[float], now: float) -> list[float]:
    """Keep only timestamps from within the last hour."""
    return [t for t in timestamps if now - t <= ONE_HOUR_SECONDS]


def check_amount(transaction: Transaction, policy: Policy) -> bool:
    """Transaction must not exceed the max allowed amount."""
    return transaction.amount <= policy.max_amount


def check_recipient(transaction: Transaction, policy: Policy) -> bool:
    """Transaction must go to the single approved recipient address.

    Comparison is case-insensitive since addresses are often copy-pasted
    with inconsistent casing.
    """
    return transaction.recipient.strip().lower() == policy.approved_recipient.strip().lower()


def check_velocity(transaction: Transaction, policy: Policy) -> bool:
    """Transaction must not exceed the max transactions per hour for this recipient."""
    now = time.time()
    key = transaction.recipient.strip().lower()
    _transaction_log[key] = _prune_old_entries(_transaction_log[key], now)
    return len(_transaction_log[key]) < policy.max_transactions_per_hour


def record_transaction(transaction: Transaction) -> None:
    """Call this only when a transaction is actually allowed through,
    so the velocity counter reflects real approved activity."""
    now = time.time()
    key = transaction.recipient.strip().lower()
    _transaction_log[key].append(now)


def run_policy_checks(transaction: Transaction, policy: Policy) -> dict[str, bool]:
    """Run every deterministic check and return a dict of results."""
    return {
        "amount_check": check_amount(transaction, policy),
        "recipient_check": check_recipient(transaction, policy),
        "velocity_check": check_velocity(transaction, policy),
    }
