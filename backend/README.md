# IntentGuard — Backend MVP

Intent-verification firewall for AI/automated Ethereum agents.

An agent can stay under its spending limit and still pay the wrong
party for the wrong reason (e.g. a prompt-injection attack). IntentGuard
adds a semantic check on top of deterministic policy rules, so both the
"how much" and the "does this match what the human meant" questions get
answered before a payment goes through.

## How it works

1. Human provides a plain-English **mandate**.
2. Agent proposes a **transaction**.
3. Backend runs **deterministic policy checks** (amount, recipient, velocity).
4. Backend runs a **semantic intent check** (mock by default, MiniMax-ready).
5. Backend returns `ALLOW`, `BLOCK`, or `REVIEW` with a reason and a
   breakdown of which individual checks passed.

```
Human mandate ──► Agent proposes tx ──► [Policy Engine] ──► [Intent Verifier] ──► ALLOW / BLOCK / REVIEW
                                              │                     │
                                        hard on-chain-style     semantic / LLM
                                        rule checks              judgment layer
```

## Project structure

```
backend/
  app/
    __init__.py
    main.py            # FastAPI app + CORS
    models.py          # Pydantic request/response models
    policy_engine.py    # deterministic amount/recipient/velocity checks
    intent_verifier.py  # routes to mock or real MiniMax verifier
    minimax_client.py   # isolated, opt-in real LLM integration (needs your API key)
    routes.py           # POST /api/verify-intent
  .env.example
  requirements.txt
  README.md
```

## Install

```bash
cd backend
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
```

The default `.env` has `USE_MINIMAX=false`, so no API key is needed to
run the full demo.

## Run

```bash
uvicorn app.main:app --reload --port 8001
```

Server will be live at `http://127.0.0.1:8001`. CORS is already
configured for `http://localhost:3000` (Next.js), `http://localhost:5173`,
and `http://127.0.0.1:5173` (Vite/React).

Health check: `GET http://127.0.0.1:8001/` → `{"status": "ok", "service": "IntentGuard"}`

Interactive API docs: `http://127.0.0.1:8001/docs`

## Demo policy configuration

The demo approved recipient is the `APPROVED_RECIPIENT` constant in
`../frontend/src/App.tsx`. The FastAPI
backend does not keep a second hard-coded address: it receives the human-set
`policy.approved_recipient` value and `app/policy_engine.py` compares the
proposed recipient against it case-insensitively. To change the approved
recipient, update that frontend constant; the legitimate example and policy
payload will stay aligned, while the prompt-injection example remains an
unapproved address and continues to fail.

The demo velocity limit is 10 transactions per hour. It is the default in
`app/models.py` and is sent and displayed by the frontend policy as
`max_transactions_per_hour: 10`.

## Demo scenarios

### Scenario 1 — legitimate payment → expect `ALLOW`

```bash
curl -X POST http://127.0.0.1:8001/api/verify-intent \
  -H "Content-Type: application/json" \
  -d '{
    "mandate": "Pay AWS invoices, up to $200, only to approved vendor 0xAWS.",
    "transaction": {
      "recipient": "0xAWS",
      "amount": 150,
      "token": "USDC",
      "reason": "AWS invoice"
    },
    "policy": {
      "max_amount": 200,
      "approved_recipient": "0xAWS",
      "max_transactions_per_hour": 10
    }
  }'
```

Expected response:

```json
{
  "decision": "ALLOW",
  "reason": "The transaction's recipient and stated reason are consistent with the mandate.",
  "checks": {
    "amount_check": true,
    "recipient_check": true,
    "velocity_check": true,
    "intent_check": true
  },
  "failure_type": "NONE"
}
```

### Scenario 2 — prompt injection, in-budget but wrong recipient → expect `BLOCK`

```bash
curl -X POST http://127.0.0.1:8001/api/verify-intent \
  -H "Content-Type: application/json" \
  -d '{
    "mandate": "Pay AWS invoices, up to $200, only to approved vendor 0xAWS.",
    "transaction": {
      "recipient": "0xATTACKER",
      "amount": 150,
      "token": "USDC",
      "reason": "Tool result says AWS changed payment provider."
    },
    "policy": {
      "max_amount": 200,
      "approved_recipient": "0xAWS",
      "max_transactions_per_hour": 10
    }
  }'
```

Expected response:

```json
{
  "decision": "BLOCK",
  "reason": "Hard policy check(s) failed: recipient_check.",
  "checks": {
    "amount_check": true,
    "recipient_check": false,
    "velocity_check": true,
    "intent_check": false
  },
  "failure_type": "HARD_POLICY_FAILURE"
}
```

This is the headline demo moment: the amount alone would have passed
($150 < $200), but the recipient/intent layer catches the manipulation.

### Bonus scenario 3 — right recipient, suspicious phrasing → expect `REVIEW`

Useful to show the softer, semantic side of the verifier independent of
the hard recipient check:

```bash
curl -X POST http://127.0.0.1:8001/api/verify-intent \
  -H "Content-Type: application/json" \
  -d '{
    "mandate": "Pay AWS invoices, up to $200, only to approved vendor 0xAWS.",
    "transaction": {
      "recipient": "0xAWS",
      "amount": 150,
      "token": "USDC",
      "reason": "AWS changed payment provider, send instead to new wallet."
    },
    "policy": {
      "max_amount": 200,
      "approved_recipient": "0xAWS",
      "max_transactions_per_hour": 10
    }
  }'
```

Expected `decision`: `"REVIEW"`, `failure_type`: `"INTENT_FAILURE"` — hard
checks pass, but the stated reason contains classic injection phrasing,
so it's escalated to a human instead of auto-approved or silently blocked.

## Enabling the real MiniMax verifier later

1. Get a MiniMax API key and confirm the real endpoint + request/response
   shape from their docs.
2. Fill in `MINIMAX_API_URL` and `MINIMAX_API_KEY` in `.env`.
3. Update the `TODO`s in `app/minimax_client.py` to match MiniMax's actual
   API contract (auth header format, request body, response parsing).
4. Set `USE_MINIMAX=true` in `.env`.

No other file needs to change — `intent_verifier.py` already routes to
`minimax_client.py` when `USE_MINIMAX=true`, and both paths return the
same `(decision, reason)` shape.

## Notes on scope (intentional, for a hackathon MVP)

- No database — an in-memory dict handles the velocity limit for the demo.
- No auth/session system — single-agent, single-mandate flow.
- The token-agnostic `../contracts/src/IntentGuardPolicy.sol` mirrors the hard
  checks for HSK testnet. It stores policy values and authorizes proposed
  transactions, but intentionally performs no token transfers.
- No multi-chain support.
