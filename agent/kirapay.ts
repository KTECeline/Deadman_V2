const BASE = "https://api.kira-pay.com/api";

function headers() {
  return {
    "Content-Type": "application/json",
    "x-api-key": process.env.KIRAPAY_API_KEY ?? "",
  };
}

export interface KiraPayLink {
  id: string;
  code: string;
  checkoutUrl: string;
  name: string;
  amount: number;
}

export interface KiraPayTransaction {
  id: string;
  status: "Success" | "Pending" | "Failed";
  hash: string;
  settlementAmount: number;
  customOrderId?: string;
}

/**
 * Create a KiraPay checkout link.
 * customOrderId format: "switch-{switchId}-{ownerWallet}" — used in webhook to
 * identify which switch was activated.
 */
export async function createPaymentLink(
  switchId: string | bigint,
  ownerWallet: string,
  amountUsd: number = 1,
  redirectUrl?: string
): Promise<KiraPayLink> {
  const settlementAddress = process.env.KIRAPAY_SETTLEMENT_ADDRESS;
  if (!settlementAddress) throw new Error("KIRAPAY_SETTLEMENT_ADDRESS is not set");

  const res = await fetch(`${BASE}/link/generate`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      name: "Dead Man's Switch — Activation Fee",
      amount: amountUsd,
      originalPrice: amountUsd,
      tokenOut: { address: settlementAddress },
      customOrderId: `switch-${switchId}-${ownerWallet}`,
      redirectUrl: redirectUrl ?? `${process.env.NEXT_PUBLIC_APP_URL}/switches`,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`KiraPay createPaymentLink failed: ${res.status} ${err}`);
  }

  const json = await res.json();
  const data = json.data ?? json;

  return {
    id: data._id ?? data.id,
    code: data.code,
    checkoutUrl: data.checkoutUrl ?? data.url ?? `https://pay.kira-pay.com/${data.code}`,
    name: data.name,
    amount: data.amount ?? amountUsd,
  };
}

/**
 * Fetch full transaction details by ID (authenticated).
 */
export async function getTransaction(txId: string): Promise<KiraPayTransaction> {
  const res = await fetch(`${BASE}/wallet/transactions/${txId}`, {
    headers: headers(),
  });

  if (!res.ok) throw new Error(`KiraPay getTransaction failed: ${res.status}`);

  const json = await res.json();
  const data = json.data ?? json;

  return {
    id: data._id ?? data.id,
    status: data.status,
    hash: data.hash,
    settlementAmount: data.settlementAmount,
    customOrderId: data.summary?.customOrderId,
  };
}

/**
 * Check transaction status by hash — no auth required.
 */
export async function getTransactionStatus(hash: string): Promise<"Success" | "Pending" | "Failed"> {
  const res = await fetch(`${BASE}/wallet/transactions/status/${hash}`);
  if (!res.ok) throw new Error(`KiraPay status check failed: ${res.status}`);
  const json = await res.json();
  return (json.data?.status ?? json.status) as "Success" | "Pending" | "Failed";
}

/**
 * Register a webhook URL to receive transaction lifecycle events.
 * Skipped automatically if the URL is localhost (KiraPay requires a public URL).
 * Requires KIRAPAY_WEBHOOK_SECRET (min 6 chars) in env.
 */
export async function registerWebhook(webhookUrl: string): Promise<void> {
  if (webhookUrl.includes("localhost") || webhookUrl.includes("127.0.0.1")) {
    console.log("[kirapay] Skipping webhook registration — localhost URL not accepted by KiraPay. Set KIRAPAY_WEBHOOK_URL to your public deploy URL.");
    return;
  }

  const secret = process.env.KIRAPAY_WEBHOOK_SECRET;
  if (!secret || secret.length < 6) {
    console.warn("[kirapay] KIRAPAY_WEBHOOK_SECRET missing or too short (min 6 chars) — skipping webhook registration.");
    return;
  }

  const res = await fetch(`${BASE}/webhooks`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ url: webhookUrl, secret }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`[kirapay] Failed to register webhook: ${res.status} ${err}`);
    return;
  }

  console.log(`[kirapay] Webhook registered: ${webhookUrl}`);
}

/**
 * Parse switch metadata from a customOrderId.
 * Format: "switch-{switchId}-{ownerWallet}"
 */
export function parseCustomOrderId(customOrderId: string): { switchId: string; ownerWallet: string } | null {
  const match = customOrderId.match(/^switch-(\d+)-([A-Za-z0-9]+)$/);
  if (!match) return null;
  return { switchId: match[1], ownerWallet: match[2] };
}
