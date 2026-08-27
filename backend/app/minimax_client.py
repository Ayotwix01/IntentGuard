"""
MiniMax-M3 client — isolated integration point for the real LLM-based
intent verifier.

This file is intentionally NOT called by default anywhere in the app.
`intent_verifier.py` uses a deterministic mock instead so the whole
project runs without any API key. When a MiniMax API key/endpoint is
available, wire this function in from `intent_verifier.py` and the rest
of the app doesn't need to change at all — that's the whole point of
isolating it here.

TODO(you): before enabling this file, fill in:
  1. MINIMAX_API_URL   — the real MiniMax chat/completions endpoint.
  2. MINIMAX_API_KEY   — loaded from .env (see .env.example).
  3. The request body shape MiniMax expects (model name, message format,
     any required headers like Authorization: Bearer <key>).
  4. How to parse the response back into plain text.

Do NOT trust this file's request/response shapes yet — they are placeholders
until you've confirmed the real MiniMax API contract from their docs.
"""

import os
import httpx

# TODO: confirm the real endpoint URL from MiniMax's docs.
MINIMAX_API_URL = os.getenv("MINIMAX_API_URL", "https://api.minimax.example/v1/chat/completions")
MINIMAX_API_KEY = os.getenv("MINIMAX_API_KEY", "")

INTENT_JUDGE_SYSTEM_PROMPT = """You are a strict payment intent auditor.
You will be given a human's plain-English mandate and a proposed on-chain
transaction. Decide if the transaction genuinely matches what the human
intended — not just whether it fits within numeric limits.

Respond with exactly one word: ALLOW, BLOCK, or REVIEW, followed by a
short one-sentence reason on the next line."""


async def verify_intent_with_minimax(mandate: str, transaction_summary: str) -> tuple[str, str]:
    """
    Call the real MiniMax API to semantically judge a transaction against
    a mandate. Returns (decision, reason).

    NOT wired in by default. Raises if MINIMAX_API_KEY is missing so it
    fails loudly instead of silently misbehaving during a demo.
    """
    if not MINIMAX_API_KEY:
        raise RuntimeError(
            "MINIMAX_API_KEY is not set. Add it to your .env file before "
            "calling verify_intent_with_minimax(). See .env.example."
        )

    headers = {
        # TODO: confirm auth header format required by MiniMax.
        "Authorization": f"Bearer {MINIMAX_API_KEY}",
        "Content-Type": "application/json",
    }

    # TODO: confirm the exact request body MiniMax expects (model name,
    # message roles, temperature, etc). This is a reasonable OpenAI-style
    # guess, not a confirmed contract.
    payload = {
        "model": "MiniMax-M3",
        "messages": [
            {"role": "system", "content": INTENT_JUDGE_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": f"MANDATE:\n{mandate}\n\nPROPOSED TRANSACTION:\n{transaction_summary}",
            },
        ],
        "temperature": 0,
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.post(MINIMAX_API_URL, headers=headers, json=payload)
        response.raise_for_status()
        data = response.json()

    # TODO: confirm the real response shape and adjust this parsing.
    raw_text: str = data["choices"][0]["message"]["content"].strip()

    lines = raw_text.splitlines()
    decision = lines[0].strip().upper() if lines else "REVIEW"
    reason = lines[1].strip() if len(lines) > 1 else "No reason provided by model."

    if decision not in {"ALLOW", "BLOCK", "REVIEW"}:
        decision = "REVIEW"

    return decision, reason
