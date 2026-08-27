export type IntentRequest = {
  mandate: string;
  transaction: {
    recipient: string;
    amount: number;
    token: string;
    reason: string;
  };
  policy: {
    max_amount: number;
    approved_recipient: string;
    max_transactions_per_hour: number;
  };
};

export type CheckStatus = "PASS" | "FAIL";
export type FinalDecision = "ALLOWED" | "BLOCKED" | "REVIEW";

export type VerificationResult = {
  amount_policy: CheckStatus;
  recipient_policy: CheckStatus;
  velocity_policy: CheckStatus;
  intent_verification: CheckStatus;
  final_decision: FinalDecision;
  explanation: string;
  timestamp: string;
  metadata: {
    request_id: string;
    transaction_hash: string;
    network: string;
    duration_ms: number;
  };
};

const NETWORK_NAME = import.meta.env.VITE_NETWORK_NAME || "HashKey Chain Testnet";

export async function verifyIntent(request: IntentRequest): Promise<VerificationResult> {
  const apiUrl = import.meta.env.VITE_API_URL || "http://127.0.0.1:8001";
  const startedAt = performance.now();
  const response = await fetch(`${apiUrl}/api/verify-intent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    let detail = `Verification failed with status ${response.status}.`;
    try {
      const body = (await response.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
    }
    throw new Error(detail);
  }

  const backendResult = (await response.json()) as {
    decision: "ALLOW" | "BLOCK" | "REVIEW";
    reason: string;
    checks: {
      amount_check: boolean;
      recipient_check: boolean;
      velocity_check: boolean;
      intent_check: boolean;
    };
  };
  const now = new Date();
  const entropy = Math.random().toString(16).slice(2, 10);
  const duration = Math.max(1, Math.round(performance.now() - startedAt));

  return {
    amount_policy: backendResult.checks.amount_check ? "PASS" : "FAIL",
    recipient_policy: backendResult.checks.recipient_check ? "PASS" : "FAIL",
    velocity_policy: backendResult.checks.velocity_check ? "PASS" : "FAIL",
    intent_verification: backendResult.checks.intent_check ? "PASS" : "FAIL",
    final_decision:
      backendResult.decision === "ALLOW"
        ? "ALLOWED"
        : backendResult.decision === "BLOCK"
          ? "BLOCKED"
          : "REVIEW",
    explanation: backendResult.reason,
    timestamp: now.toISOString(),
    metadata: {
      request_id: `ig_${now.getTime().toString(36)}_${entropy}`,
      transaction_hash: `0x${entropy}${Math.random().toString(16).slice(2, 18)}`,
      network: NETWORK_NAME,
      duration_ms: duration,
    },
  };
}
