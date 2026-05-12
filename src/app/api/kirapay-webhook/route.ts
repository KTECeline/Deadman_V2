import { NextRequest, NextResponse } from "next/server";
import { getTransaction, parseCustomOrderId } from "../../../../agent/kirapay";

/**
 * KiraPay sends POST events here for transaction lifecycle.
 * Events: transaction.created | transaction.succeeded | transaction.refund
 *
 * On transaction.succeeded:
 *   - Parse customOrderId to get switch ID + owner wallet
 *   - Send Telegram activation notification to owner
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { event, data } = body as {
      event: "transaction.created" | "transaction.succeeded" | "transaction.refund";
      data: {
        _id: string;
        status: string;
        hash: string;
        price?: number;
        settlementAmount?: number;
        sender?: string;
        recipient?: string;
      };
    };

    console.log(`[kirapay-webhook] Event: ${event} | TX: ${data._id}`);

    if (event === "transaction.succeeded") {
      // Fetch full details to get customOrderId from summary
      let customOrderId: string | undefined;
      try {
        const tx = await getTransaction(data._id);
        customOrderId = tx.customOrderId;
      } catch {
        console.warn("[kirapay-webhook] Could not fetch TX details for customOrderId");
      }

      if (customOrderId) {
        const parsed = parseCustomOrderId(customOrderId);
        if (parsed) {
          console.log(
            `[kirapay-webhook] Switch ${parsed.switchId} activated for owner ${parsed.ownerWallet}`
          );

          // Notify owner via Telegram if bot token is configured
          const token = process.env.TELEGRAM_BOT_TOKEN;
          if (token) {
            // Broadcast — in full multi-user mode this would look up chatId from SQLite
            await sendActivationNotice(token, parsed.switchId, data.settlementAmount ?? data.price ?? 1);
          }
        }
      }
    }

    return NextResponse.json({ received: true });
  } catch (err: any) {
    console.error("[kirapay-webhook] Error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function sendActivationNotice(token: string, switchId: string, amount: number) {
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!chatId) return;

  const text =
    `✅ *Switch Activated*\n\n` +
    `Payment of $${amount} received via KiraPay\\.\n` +
    `Switch \\#${switchId} is now live and monitoring your wallet\\.`;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "MarkdownV2" }),
  }).catch(() => {});
}
