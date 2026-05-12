/**
 * Claude-powered Telegram Q&A onboarding.
 * Walks owners through a 6-step conversation to configure their switch,
 * then generates a deep-link prefill URL they open in the browser to sign.
 *
 * Also handles the beneficiary /claim flow (wallet collection).
 */
import Groq from "groq-sdk";
import {
  getConversation,
  setConversation,
  clearConversation,
  generateAuthCode,
  verifyClaimCode,
  ConversationData,
  ConversationStep,
} from "./bot-state";

const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

// ── Prompts for each step ─────────────────────────────────────────────────────

const STEP_PROMPTS: Record<ConversationStep, string> = {
  use_case:
    "You are an assistant helping set up a Dead Man's Switch on Solana. " +
    "Ask the user in one friendly sentence: what this switch is for. " +
    "Examples: send SOL to my daughter if I'm inactive, recurring $2 weekly to my kid's wallet, pause DeFi positions if I don't check in.",
  grace_period:
    "Ask in one sentence: how many days of inactivity should pass before the switch triggers. " +
    "Suggest common values: 30, 60, 90 days.",
  amount:
    "Ask in one sentence: how much SOL they want to lock in the switch.",
  beneficiary_name:
    "Ask in one sentence: the name of the beneficiary (just for their reference, can be a nickname).",
  beneficiary_email:
    "Ask in one sentence: the beneficiary's email address. Explain it will be used to notify them when the switch fires.",
  confirm:
    "Show the full summary and ask the user to confirm with yes or no.",
  claim_wallet:
    "Ask the user in one friendly sentence: do they have a Solana wallet address they want to receive their funds at? " +
    "If yes, ask them to paste it. If no, tell them they can create a free wallet at " + APP_URL + "/wallet and come back.",
  idle: "",
};

// ── Parse user reply with Claude ─────────────────────────────────────────────

async function parseReply(
  step: ConversationStep,
  userMessage: string,
  data: ConversationData
): Promise<{ value: any; valid: boolean; feedback?: string }> {
  const systemPrompt =
    `You are parsing a user reply in a Dead Man's Switch onboarding chat. ` +
    `Current step: "${step}". ` +
    `Respond with JSON only: { "value": <extracted value>, "valid": true/false, "feedback": "<short message if invalid>" }. ` +
    `Rules: ` +
    (step === "grace_period" ? `Extract a number of days (integer 1-365). ` : "") +
    (step === "amount" ? `Extract a SOL amount (positive number). ` : "") +
    (step === "beneficiary_email" ? `Validate it looks like an email. ` : "") +
    (step === "confirm" ? `Return { value: true/false, valid: true } based on yes/no. ` : "") +
    (step === "claim_wallet"
      ? `If user provides a Solana address (base58, 32-44 chars), return { value: <address>, valid: true }. ` +
        `If they say no or don't have one, return { value: null, valid: true }. `
      : "") +
    `For other steps, any non-empty string is valid, return it as value.`;

  const response = await client.chat.completions.create({
    model: "llama3-8b-8192",
    max_tokens: 128,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
  });

  try {
    const text = (response.choices[0].message.content ?? "").trim();
    const json = text.startsWith("{") ? text : text.slice(text.indexOf("{"));
    return JSON.parse(json);
  } catch {
    return { value: userMessage.trim(), valid: true };
  }
}

// ── Compose bot message for each step ────────────────────────────────────────

async function composeQuestion(step: ConversationStep, data: ConversationData): Promise<string> {
  if (step === "confirm") {
    return (
      `📋 *Here's your switch summary:*\n\n` +
      `*Use case:* ${data.useCase}\n` +
      `*Trigger:* ${data.graceDays} days of inactivity\n` +
      `*Amount:* ${data.amountSol} SOL\n` +
      `*Beneficiary:* ${data.beneficiaryName} \\(${data.beneficiaryEmail}\\)\n\n` +
      `Reply *yes* to confirm and get your setup link, or *no* to start over\\.`
    );
  }

  if (step === "idle") return "";

  const prompt = STEP_PROMPTS[step];
  const response = await client.chat.completions.create({
    model: "llama3-8b-8192",
    max_tokens: 80,
    messages: [
      { role: "system", content: "You are a friendly assistant. Reply in one short sentence only. No markdown, no emoji unless natural." },
      { role: "user", content: prompt },
    ],
  });

  return (response.choices[0].message.content ?? "").trim();
}

// ── Encode prefill data for the create page ───────────────────────────────────

function buildDeepLink(_chatId: string, data: ConversationData, authCode: string): string {
  const prefill = Buffer.from(
    JSON.stringify({
      useCase: data.useCase,
      graceDays: data.graceDays,
      amountSol: data.amountSol,
      beneficiaryName: data.beneficiaryName,
      beneficiaryEmail: data.beneficiaryEmail,
    })
  ).toString("base64url");

  return `${APP_URL}/create?prefill=${prefill}&tgCode=${authCode}`;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Start a new onboarding conversation for this chatId.
 * Returns the first question to send.
 */
export async function startConversation(chatId: string): Promise<string> {
  setConversation(chatId, "use_case", {});
  const question = await composeQuestion("use_case", {});
  return `👋 Let's set up your Dead Man's Switch\\.\n\n${question}`;
}

/**
 * Handle a message in an active conversation.
 * Returns the next message to send back to the user.
 * Returns null if no active conversation (caller should ignore or show help).
 */
export async function handleConversationMessage(
  chatId: string,
  userMessage: string
): Promise<string | null> {
  const conv = getConversation(chatId);
  if (!conv || conv.step === "idle") return null;

  const { step, data } = conv;

  // ── Claim flow ─────────────────────────────────────────────────────────────
  if (step === "claim_wallet") {
    const parsed = await parseReply("claim_wallet", userMessage, data);
    if (parsed.value) {
      // They provided an address — return it as signal to caller
      clearConversation(chatId);
      return `__CLAIM_WALLET__${data.claimCode}__${parsed.value}`;
    } else {
      clearConversation(chatId);
      return (
        `No problem\\! Create a free wallet at ${APP_URL}/wallet — sign in with your email, takes 30 seconds\\.\n\n` +
        `Once you have a wallet address, message me: \`/claim ${data.claimCode}\``
      );
    }
  }

  // ── Onboarding flow ────────────────────────────────────────────────────────
  const parsed = await parseReply(step, userMessage, data);

  if (!parsed.valid) {
    return parsed.feedback
      ? escapeMarkdown(parsed.feedback)
      : "I didn't quite get that — could you try again?";
  }

  const updatedData = { ...data };

  switch (step) {
    case "use_case":       updatedData.useCase = parsed.value; break;
    case "grace_period":   updatedData.graceDays = parsed.value; break;
    case "amount":         updatedData.amountSol = parsed.value; break;
    case "beneficiary_name":  updatedData.beneficiaryName = parsed.value; break;
    case "beneficiary_email": updatedData.beneficiaryEmail = parsed.value; break;
    case "confirm": {
      if (!parsed.value) {
        clearConversation(chatId);
        return "Okay, starting over\\. Send /start whenever you\\'re ready\\.";
      }
      // Generate deep link
      const authCode = generateAuthCode(chatId);
      const link = buildDeepLink(chatId, updatedData, authCode);
      clearConversation(chatId);
      return (
        `✅ *Perfect\\!*\n\n` +
        `Open this link to connect your Phantom wallet and create your switch on\\-chain:\n\n` +
        `[Set up my switch](${link})\n\n` +
        `The link expires in 15 minutes\\.`
      );
    }
  }

  const NEXT_STEP: Record<ConversationStep, ConversationStep> = {
    use_case: "grace_period",
    grace_period: "amount",
    amount: "beneficiary_name",
    beneficiary_name: "beneficiary_email",
    beneficiary_email: "confirm",
    confirm: "idle",
    claim_wallet: "idle",
    idle: "idle",
  };

  const nextStep = NEXT_STEP[step];
  setConversation(chatId, nextStep, updatedData);

  const nextQuestion = await composeQuestion(nextStep, updatedData);
  return nextQuestion;
}

/**
 * Start the /claim flow for a beneficiary.
 * Returns the first message asking if they have a wallet.
 */
export async function startClaimConversation(chatId: string, claimCode: string): Promise<string | null> {
  const claim = verifyClaimCode(claimCode);
  if (!claim) {
    return "That claim code is invalid or has already been used\\.";
  }

  setConversation(chatId, "claim_wallet", { claimCode, switchId: claim.switchId });
  const question = await composeQuestion("claim_wallet", {});
  return question;
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, "\\$&");
}
