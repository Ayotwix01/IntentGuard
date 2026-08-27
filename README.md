# IntentGuard

IntentGuard is an AI-agent payment safety layer. AI agents can initiate
payments, but prompts or other instructions can manipulate the payment intent
or redirect funds to an unintended recipient. IntentGuard combines semantic
intent verification with deterministic amount, recipient, and velocity checks
before authorization.

IntentGuard includes controlled demo inputs, backend verification, and a live
testnet policy connection. It never transfers HSK or USDC automatically.

## How it works

**Backend verification** — FastAPI receives the proposed transaction, runs
semantic intent verification against the mandate, and applies deterministic
recipient, amount, and velocity checks.

**On-chain policy** — `IntentGuardPolicy` is deployed on HSK Chain Testnet.
The frontend connects to MetaMask, reads the live policy directly from the
contract, and can submit `authorizeTransaction()` as an authorization-only
test. That action records authorization against the policy and does not move
HSK or USDC.

The **Simulate legitimate payment** and **Simulate prompt injection** buttons
provide controlled inputs for demonstrating the firewall; they do not mean
the deployed policy is simulation-only.

## Project locations

- FastAPI backend: `backend`
- React/Vite dashboard: `frontend`
- Foundry policy contract: `contracts/src/IntentGuardPolicy.sol`
- Foundry deployment script: `contracts/script/DeployIntentGuard.s.sol`

## Policy configuration

The FastAPI endpoint keeps the existing API shape. The approved recipient is
the `policy.approved_recipient` field in each `POST /api/verify-intent` request;
the backend compares it case-insensitively in `app/policy_engine.py` and never
allows a different transaction recipient. The dashboard starts with the demo
address in `frontend/src/App.tsx`, but the **User policy** panel lets the presenter edit
the mandate, maximum amount, recipient, and velocity before verification.

The velocity default is **10 transactions per hour** in the backend model,
dashboard, examples, and contract deployment environment. Only successful
`ALLOW` results are counted by the in-memory backend counter.

## Run the demo

Backend:

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8001
```

Frontend, in another terminal:

```bash
cd frontend
pnpm install
cp .env.example .env
pnpm dev
```

Open `http://localhost:5173`. The dashboard displays **HashKey Chain Testnet** by
default. Use **Simulate legitimate payment** for `ALLOW`, **Simulate prompt
injection** for an in-budget wrong-recipient `BLOCKED`, and **Test amount
limit** for an over-limit `BLOCKED`. The amount field treats the next typed
number as a replacement, so typing `200` after focus does not produce `0200`.

## HSK testnet policy contract

`IntentGuardPolicy` stores the approved recipient, maximum amount, and
transactions-per-hour limit. Its `updatePolicy` function is owner-only, and
`authorizeTransaction` only checks and records authorization; it does not move
ETH or tokens. The contract is intentionally token-agnostic for this demo.

No deployment happens automatically. HashKey's official network information is
documented at <https://docs.hsk.xyz/docs/Build-on-HashKey-Chain/network-info>.
The verified testnet settings are:

- Network: `HashKey Chain Testnet`
- Chain ID: `133`
- RPC URL: `https://testnet.hsk.xyz`
- Native token: `HSK`
- Explorer: `https://testnet-explorer.hskchain.net`
- Deployed IntentGuardPolicy: `0x68dBEF47315Add780D40d830EEFB2c8206E385BD`
- Deployed contract page: <https://testnet-explorer.hskchain.net/address/0x68dBEF47315Add780D40d830EEFB2c8206E385BD>

The public contract address is configured in `frontend/.env` and
`frontend/.env.example` as `VITE_POLICY_CONTRACT_ADDRESS`. Public addresses
are safe to expose; never place a private key, seed phrase, or wallet
credential in frontend configuration.

Create a local root `.env` from `.env.example`, fill in the deployment values,
and run this from `contracts`:

```bash
cp ../.env.example ../.env
set -a; source ../.env; set +a
forge script script/DeployIntentGuard.s.sol:DeployIntentGuard \
  --rpc-url "$HSK_TESTNET_RPC_URL" \
  --chain-id 133 \
  --private-key "$PRIVATE_KEY" \
  --broadcast
```

Use a test wallet and test HSK only. Never commit `.env`, a private key, or
mainnet credentials.

Record the public deployment details in
`contracts/DEPLOYMENT_RECORD.example.md` (copy it to a separate local record
if desired). Never add a private key to that record.

To change an already deployed contract policy, the owner can call the
owner-only update function with the same test-wallet key:

```bash
cast send "$POLICY_CONTRACT_ADDRESS" \
  "updatePolicy(address,uint256,uint256)" \
  "$APPROVED_RECIPIENT" "$MAX_AMOUNT" "$MAX_TRANSACTIONS_PER_HOUR" \
  --rpc-url "$HSK_TESTNET_RPC_URL" \
  --private-key "$PRIVATE_KEY"
```

The dashboard policy panel remains the source for each verification request;
the contract call is a separate owner-controlled on-chain update.

After deployment, verify the network, bytecode, stored policy, and receipt:

```bash
cd contracts
set -a; source ../.env; set +a
cast chain-id --rpc-url "$HSK_TESTNET_RPC_URL"                 # expect 133
cast code "$POLICY_CONTRACT_ADDRESS" --rpc-url "$HSK_TESTNET_RPC_URL"
cast call "$POLICY_CONTRACT_ADDRESS" "approvedRecipient()(address)" --rpc-url "$HSK_TESTNET_RPC_URL"
cast call "$POLICY_CONTRACT_ADDRESS" "maxAmount()(uint256)" --rpc-url "$HSK_TESTNET_RPC_URL"
cast call "$POLICY_CONTRACT_ADDRESS" "velocityLimit()(uint256)" --rpc-url "$HSK_TESTNET_RPC_URL"
cast receipt "$DEPLOYMENT_TRANSACTION_HASH" --rpc-url "$HSK_TESTNET_RPC_URL"
```

The frontend shows **Testnet deployed** when `VITE_POLICY_CONTRACT_ADDRESS` is
present; otherwise it shows **Testnet deployment pending**. Connect MetaMask or another
injected EVM wallet, switch it to HSK Chain Testnet when prompted, then use
**Check On-Chain Policy** to read the live contract values. The
**Authorize on-chain (no transfer)** action only calls the policy contract
after backend verification returns `ALLOW`; it does not transfer HSK or USDC.

### Wallet setup

1. Install MetaMask and select a test wallet.
2. Start the frontend:

```bash
cd frontend
cp .env.example .env
pnpm dev
```

3. Click **Connect Wallet**. If the wallet is on another chain, click
   **Switch to HSK Testnet** and approve the network change.
4. Click **Check On-Chain Policy** to read the approved recipient, maximum
   amount, velocity limit, and current one-hour transaction count.

Build output and ABI are generated at:

- `contracts/out/IntentGuardPolicy.sol/IntentGuardPolicy.json`
- `contracts/broadcast/DeployIntentGuard.s.sol/133/`

## Mainnet migration

Do not reuse the testnet deployment. For HashKey Chain Mainnet, use the
official settings: chain ID `177`, RPC URL `https://mainnet.hsk.xyz`, native
token `HSK`, and explorer `https://explorer.hsk.xyz`. Change only the local RPC,
chain ID, wallet, and deployment-record values; the Solidity contract and
deployment script do not need to change.

## Checks

Backend API checks:

```bash
cd backend
source venv/bin/activate
python3 - <<'PY'
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)
base = {
    "mandate": "Pay AWS invoices up to $200, only to the approved AWS vendor.",
    "transaction": {"recipient": "0xAWS", "amount": 150, "token": "USDC", "reason": "AWS invoice payment"},
    "policy": {"max_amount": 200, "approved_recipient": "0xAWS", "max_transactions_per_hour": 10},
}
assert client.post("/api/verify-intent", json=base).json()["decision"] == "ALLOW"
wrong_recipient = {**base, "transaction": {**base["transaction"], "recipient": "0xATTACKER"}}
assert client.post("/api/verify-intent", json=wrong_recipient).json()["decision"] == "BLOCK"
over_limit = {**base, "transaction": {**base["transaction"], "amount": 300}}
assert client.post("/api/verify-intent", json=over_limit).json()["decision"] == "BLOCK"
for _ in range(9):
    assert client.post("/api/verify-intent", json=base).json()["decision"] == "ALLOW"
assert client.post("/api/verify-intent", json=base).json()["decision"] == "BLOCK"
print("backend scenarios passed")
PY
```

Frontend and contract checks:

```bash
cd frontend
pnpm typecheck
pnpm build
cd ../contracts
forge build
forge test
```

## Current limitation and roadmap

The authorization layer is demonstrated on-chain, but `IntentGuardPolicy` does
not execute an ERC20 payment transfer. A future version will connect the
authorization layer to a real payment executor or agent wallet after policy
approval.

On-chain authorization is deployed and integrated with MetaMask on HSK
Testnet. During testing, MetaMask's HSK RPC provider intermittently returned
`-32002 eth_getBlockByNumber` errors before returning a transaction hash. The
authorization contract itself compiles and passes all automated tests.
