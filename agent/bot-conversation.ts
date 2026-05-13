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

let _groq: Groq | null = null;
function client(): Groq {
  if (!_groq) _groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return _groq;
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

// ── Parse user reply with Claude ─────────────────────────────────────────────

async function parseReply(
  step: ConversationStep,
  userMessage: string
): Promise<{ value: string | number | boolean | null; valid: boolean; feedback?: string }> {
  const msg = userMessage.trim();

  // Free-text steps — accept anything the user types, no LLM needed
  if (step === "use_case" || step === "beneficiary_name") {
    return { value: msg || "unspecified", valid: true };
  }

  // Structured steps — use LLM to extract and validate
  const systemPrompt =
    `You are extracting structured data from a user reply in a Dead Man's Switch onboarding chat. ` +
    `Respond with JSON only, no explanation: { "value": <extracted>, "valid": true/false, "feedback": "<one friendly sentence if invalid>" }. ` +
    (step === "grace_period"
      ? `Extract the number of days as an integer (1-365). If the user says something like "3 months" convert it. If no number is found, set valid: false and ask them to give a number of days.`
      : step === "amount"
      ? `Extract the SOL amount as a number. Accept values like "5 SOL", "0.5", "half a SOL" (≈0.5). If no valid amount, set valid: false.`
      : step === "beneficiary_email"
      ? `Validate the email address format. If valid set valid: true. If not an email, set valid: false with friendly feedback.`
      : step === "confirm"
      ? `User is confirming or rejecting. Return { value: true, valid: true } for yes/confirm, { value: false, valid: true } for no/cancel.`
      : step === "claim_wallet"
      ? `If the user provides a Solana base58 address (32-44 chars, no spaces), return { value: "<address>", valid: true }. If they say no or don't have one, return { value: null, valid: true }.`
      : `Return { value: "${msg}", valid: true }.`);

  const response = await client().chat.completions.create({
    model: "llama-3.1-8b-instant",
    max_tokens: 128,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: msg },
    ],
  });

  try {
    const text = (response.choices[0].message.content ?? "").trim();
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) return { value: msg, valid: true };
    return JSON.parse(text.slice(jsonStart, jsonEnd + 1));
  } catch {
    return { value: msg, valid: true };
  }
}

// ── Hardcoded questions for each step ────────────────────────────────────────

const STEP_QUESTIONS: Partial<Record<ConversationStep, string>> = {
  use_case:
    "What's this switch for? \\(e\\.g\\. send SOL to my daughter if I'm inactive, pause DeFi if I don't check in\\)",
  grace_period:
    "How many days of inactivity before the switch triggers? \\(common values: 30, 60, 90\\)",
  amount: "How much SOL do you want to lock in?",
  beneficiary_name: "What's the beneficiary's name? \\(just a nickname for your reference\\)",
  beneficiary_email:
    "What's the beneficiary's email address? \\(they'll be notified when the switch fires\\)",
  claim_wallet:
    `Do you have a Solana wallet address to receive the funds? Paste it below, or say *no* and I'll help you create one at ${APP_URL}/wallet`,
};

// ── Compose bot message for each step ────────────────────────────────────────

function composeQuestion(step: ConversationStep, data: ConversationData): string {
  if (step === "confirm") {
    return (
      `📋 *Here's your switch summary:*\n\n` +
      `*Use case:* ${escapeMarkdown(String(data.useCase ?? ""))}\n` +
      `*Trigger:* ${escapeMarkdown(String(data.graceDays ?? ""))} days of inactivity\n` +
      `*Amount:* ${escapeMarkdown(String(data.amountSol ?? ""))} SOL\n` +
      `*Beneficiary:* ${escapeMarkdown(String(data.beneficiaryName ?? ""))} \\(${escapeMarkdown(String(data.beneficiaryEmail ?? ""))}\\)\n\n` +
      `Reply *yes* to confirm and get your setup link, or *no* to start over\\.`
    );
  }

  if (step === "idle") return "";

  return STEP_QUESTIONS[step] ?? "";
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
  const question = composeQuestion("use_case", {});
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
    const parsed = await parseReply("claim_wallet", userMessage);
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
  const parsed = await parseReply(step, userMessage);

  if (!parsed.valid) {
    return parsed.feedback
      ? escapeMarkdown(parsed.feedback)
      : "I didn't quite get that — could you try again?";
  }

  const updatedData = { ...data };

  switch (step) {
    case "use_case":       updatedData.useCase = String(parsed.value ?? ""); break;
    case "grace_period":   updatedData.graceDays = Number(parsed.value); break;
    case "amount":         updatedData.amountSol = Number(parsed.value); break;
    case "beneficiary_name":  updatedData.beneficiaryName = String(parsed.value ?? ""); break;
    case "beneficiary_email": updatedData.beneficiaryEmail = String(parsed.value ?? ""); break;
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
        `Open this link in your browser to connect Phantom and create your switch on\\-chain:\n\n` +
        `\`${link}\`\n\n` +
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

  const nextQuestion = composeQuestion(nextStep, updatedData);
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
  const question = composeQuestion("claim_wallet", {});
  return question;
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+=|{}.!-]/g, "\\$&");
}
