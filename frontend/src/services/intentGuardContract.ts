export type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

export const HSK_TESTNET = {
  chainId: 133,
  chainIdHex: "0x85",
  chainName: "HashKey Chain Testnet",
  nativeCurrency: { name: "HSK", symbol: "HSK", decimals: 18 },
  rpcUrl: "https://testnet.hsk.xyz",
  explorerUrl: "https://testnet-explorer.hskchain.net",
} as const;

export const POLICY_CONTRACT_ADDRESS = (import.meta.env.VITE_POLICY_CONTRACT_ADDRESS || "").trim();
export const DEPLOYED_POLICY_CONTRACT_ADDRESS = "0x68dBEF47315Add780D40d830EEFB2c8206E385BD";

export const INTENT_GUARD_POLICY_ABI = [
  { type: "function", name: "approvedRecipient", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "maxAmount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "velocityLimit", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "windowStart", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "transactionsInWindow", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "isTransactionAllowed",
    stateMutability: "view",
    inputs: [{ name: "recipient", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "authorizeTransaction",
    stateMutability: "nonpayable",
    inputs: [{ name: "recipient", type: "address" }, { name: "amount", type: "uint256" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "updatePolicy",
    stateMutability: "nonpayable",
    inputs: [
      { name: "newApprovedRecipient", type: "address" },
      { name: "newMaxAmount", type: "uint256" },
      { name: "newVelocityLimit", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

const SELECTORS = {
  approvedRecipient: "0xf0c9cdba",
  maxAmount: "0x5f48f393",
  velocityLimit: "0xe08d1259",
  windowStart: "0xb0c2783a",
  transactionsInWindow: "0xcd3641e7",
  isTransactionAllowed: "0x7450c5a6",
  authorizeTransaction: "0x18cdebc0",
} as const;

export type WalletState = {
  address: string | null;
  chainId: number | null;
};

export type OnChainPolicy = {
  approvedRecipient: string;
  maxAmount: bigint;
  velocityLimit: bigint;
  windowStart: bigint;
  transactionsInWindow: bigint;
};

export class TransactionConfirmationUnavailableError extends Error {
  constructor() {
    super("Transaction submitted, but confirmation is temporarily unavailable.");
    this.name = "TransactionConfirmationUnavailableError";
  }
}

function getInjectedProvider(): Eip1193Provider {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error("No browser wallet detected. Install MetaMask or another injected EVM wallet.");
  }
  return window.ethereum;
}

function parseChainId(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const parsed = Number.parseInt(value, 16);
  return Number.isFinite(parsed) ? parsed : null;
}

function decodeAddress(value: unknown): string {
  if (typeof value !== "string" || value.length < 42) throw new Error("Invalid address returned by the policy contract.");
  return `0x${value.slice(-40)}`;
}

function decodeUint256(value: unknown): bigint {
  if (typeof value !== "string") throw new Error("Invalid number returned by the policy contract.");
  return BigInt(value);
}

function encodeAddress(address: string): string {
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) throw new Error("Enter a valid EVM address before using the contract.");
  return address.slice(2).toLowerCase().padStart(64, "0");
}

function encodeUint256(value: number): string {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("The contract authorization amount must be a whole number.");
  return BigInt(value).toString(16).padStart(64, "0");
}

function requireContractAddress(): string {
  if (!/^0x[a-fA-F0-9]{40}$/.test(POLICY_CONTRACT_ADDRESS)) {
    throw new Error("The deployed policy contract address is not configured.");
  }
  if (POLICY_CONTRACT_ADDRESS.toLowerCase() !== DEPLOYED_POLICY_CONTRACT_ADDRESS.toLowerCase()) {
    throw new Error(`VITE_POLICY_CONTRACT_ADDRESS must be ${DEPLOYED_POLICY_CONTRACT_ADDRESS} for HSK Testnet.`);
  }
  return POLICY_CONTRACT_ADDRESS;
}

async function requestAccounts(provider: Eip1193Provider, method: "eth_accounts" | "eth_requestAccounts") {
  const accounts = await provider.request({ method });
  return Array.isArray(accounts) && typeof accounts[0] === "string" ? accounts[0] : null;
}

export async function getWalletState(): Promise<WalletState> {
  const provider = getInjectedProvider();
  const [address, chainIdHex] = await Promise.all([
    requestAccounts(provider, "eth_accounts"),
    provider.request({ method: "eth_chainId" }),
  ]);
  return { address, chainId: parseChainId(chainIdHex) };
}

export async function connectWallet(): Promise<WalletState> {
  const provider = getInjectedProvider();
  const address = await requestAccounts(provider, "eth_requestAccounts");
  const chainId = parseChainId(await provider.request({ method: "eth_chainId" }));
  return { address, chainId };
}

export function subscribeToWalletChanges(listener: () => void) {
  const provider = getInjectedProvider();
  const handleChange = () => listener();
  provider.on?.("accountsChanged", handleChange);
  provider.on?.("chainChanged", handleChange);
  return () => {
    provider.removeListener?.("accountsChanged", handleChange);
    provider.removeListener?.("chainChanged", handleChange);
  };
}

export async function switchToHskTestnet(): Promise<void> {
  const provider = getInjectedProvider();
  try {
    await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: HSK_TESTNET.chainIdHex }] });
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
    if (code !== 4902) throw error;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [{
        chainId: HSK_TESTNET.chainIdHex,
        chainName: HSK_TESTNET.chainName,
        nativeCurrency: HSK_TESTNET.nativeCurrency,
        rpcUrls: [HSK_TESTNET.rpcUrl],
        blockExplorerUrls: [HSK_TESTNET.explorerUrl],
      }],
    });
  }
}

function describeError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null) {
    const details = error as { message?: unknown; code?: unknown; data?: { message?: unknown } };
    if (typeof details.message === "string") return details.code ? `${details.message} (code ${details.code})` : details.message;
    if (typeof details.data?.message === "string") return details.data.message;
  }
  return String(error);
}

function rpcErrorCode(error: unknown) {
  if (typeof error !== "object" || error === null) return undefined;
  const details = error as { code?: unknown; data?: { code?: unknown; originalError?: { code?: unknown } } };
  return details.code ?? details.data?.code ?? details.data?.originalError?.code;
}

function isTemporaryRpcError(error: unknown) {
  const code = rpcErrorCode(error);
  if (code === -32002) return true;
  const message = describeError(error).toLowerCase();
  return /too many errors|temporarily unavailable|timeout|timed out|network|fetch failed|429|502|503|504/.test(message);
}

function delay(milliseconds: number) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
}

async function requestWithRetries<T>(request: () => Promise<T>, attempts = 3): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await request();
    } catch (error) {
      lastError = error;
      if (!isTemporaryRpcError(error) || attempt === attempts - 1) throw error;
      await delay(500 * 2 ** attempt);
    }
  }
  throw lastError;
}

async function requestPublicRpc(method: string, params: unknown[]) {
  const response = await fetch(HSK_TESTNET.rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const payload = (await response.json()) as { result?: unknown; error?: { code?: number; message?: string } };
  if (payload.error) throw new Error(`${payload.error.message || "RPC error"} (${payload.error.code ?? "unknown code"})`);
  return payload.result;
}

async function getReadRequest() {
  let publicRpcError: unknown;
  try {
    const chainId = parseChainId(await requestPublicRpc("eth_chainId", []));
    if (chainId !== HSK_TESTNET.chainId) throw new Error(`RPC returned chain ID ${chainId ?? "unknown"}; expected ${HSK_TESTNET.chainId}`);
    return (data: string) => requestPublicRpc("eth_call", [{ to: requireContractAddress(), data }, "latest"]);
  } catch (error) {
    publicRpcError = error;
  }

  try {
    const provider = getInjectedProvider();
    const chainId = parseChainId(await provider.request({ method: "eth_chainId" }));
    if (chainId !== HSK_TESTNET.chainId) throw new Error(`Wallet provider returned chain ID ${chainId ?? "unknown"}; expected ${HSK_TESTNET.chainId}`);
    return (data: string) => provider.request({ method: "eth_call", params: [{ to: requireContractAddress(), data }, "latest"] });
  } catch (error) {
    throw new Error(`Unable to read HSK Testnet contract: public RPC: ${describeError(publicRpcError)}; injected provider: ${describeError(error)}`);
  }
}

export async function readOnChainPolicy(): Promise<OnChainPolicy> {
  const read = await getReadRequest();
  const [approvedRecipient, maxAmount, velocityLimit, windowStart, transactionsInWindow] = await Promise.all([
    read(SELECTORS.approvedRecipient),
    read(SELECTORS.maxAmount),
    read(SELECTORS.velocityLimit),
    read(SELECTORS.windowStart),
    read(SELECTORS.transactionsInWindow),
  ]);
  return {
    approvedRecipient: decodeAddress(approvedRecipient),
    maxAmount: decodeUint256(maxAmount),
    velocityLimit: decodeUint256(velocityLimit),
    windowStart: decodeUint256(windowStart),
    transactionsInWindow: decodeUint256(transactionsInWindow),
  };
}

export async function isOnChainTransactionAllowed(recipient: string, amount: number): Promise<boolean> {
  const read = await getReadRequest();
  const data = `${SELECTORS.isTransactionAllowed}${encodeAddress(recipient)}${encodeUint256(amount)}`;
  const result = await read(data);
  return decodeUint256(result) === 1n;
}

export async function authorizeOnChainTransaction(recipient: string, amount: number): Promise<string> {
  const provider = getInjectedProvider();
  const state = await getWalletState();
  if (!state.address) throw new Error("Connect a wallet before authorizing on-chain.");
  if (state.chainId !== HSK_TESTNET.chainId) throw new Error("Switch your wallet to HSK Chain Testnet first.");
  const data = `${SELECTORS.authorizeTransaction}${encodeAddress(recipient)}${encodeUint256(amount)}`;
  console.info("[IntentGuard] Requesting MetaMask authorization transaction", {
    from: state.address,
    to: requireContractAddress(),
    chainId: HSK_TESTNET.chainId,
    recipient,
    amount,
  });
  const result = await provider.request({
    method: "eth_sendTransaction",
    params: [{ from: state.address, to: requireContractAddress(), data }],
  });
  if (typeof result !== "string") throw new Error("The wallet did not return a transaction hash.");
  console.info("[IntentGuard] MetaMask returned transaction hash", result);
  return result;
}

export async function waitForTransactionReceipt(transactionHash: string, timeoutMs = 120_000): Promise<void> {
  const walletProvider = getInjectedProvider();
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt += 1;
    console.info("[IntentGuard] Receipt polling attempt", { attempt, transactionHash, provider: "wallet" });
    let walletReceipt: { status?: string } | null = null;
    try {
      walletReceipt = await requestWithRetries(
        () => walletProvider.request({ method: "eth_getTransactionReceipt", params: [transactionHash] }) as Promise<{ status?: string } | null>,
      );
    } catch {
      console.warn("[IntentGuard] Receipt temporary failure", { attempt, transactionHash, provider: "wallet" });
    }
    if (walletReceipt) {
      if (walletReceipt.status === "0x0") throw new Error("The authorization transaction reverted on HSK Chain Testnet.");
      if (walletReceipt.status === "0x1") {
        console.info("[IntentGuard] Receipt success", { attempt, transactionHash, provider: "wallet" });
        return;
      }
    }

    let publicReceipt: { status?: string } | null = null;
    try {
      publicReceipt = await requestWithRetries(
        () => requestPublicRpc("eth_getTransactionReceipt", [transactionHash]) as Promise<{ status?: string } | null>,
      );
    } catch {
      console.warn("[IntentGuard] Receipt temporary failure", { attempt, transactionHash, provider: "hsk-rpc" });
    }
    if (publicReceipt) {
      if (publicReceipt.status === "0x0") throw new Error("The authorization transaction reverted on HSK Chain Testnet.");
      if (publicReceipt.status === "0x1") {
        console.info("[IntentGuard] Receipt success", { attempt, transactionHash, provider: "hsk-rpc" });
        return;
      }
    }

    await delay(2_000);
  }
  throw new TransactionConfirmationUnavailableError();
}
