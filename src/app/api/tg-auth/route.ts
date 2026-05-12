import { NextRequest, NextResponse } from "next/server";
import { verifyAuthCode } from "../../../../agent/bot-state";

/**
 * Called by the create page after the user connects their Phantom wallet.
 * Links the Telegram chat_id to their Solana wallet so the agent can
 * send per-switch notifications to the right person.
 *
 * Body: { tgCode: string, walletPubkey: string }
 */
export async function POST(req: NextRequest) {
  try {
    const { tgCode, walletPubkey } = await req.json();

    if (!tgCode || !walletPubkey) {
      return NextResponse.json({ error: "tgCode and walletPubkey are required" }, { status: 400 });
    }

    const chatId = verifyAuthCode(tgCode, walletPubkey);

    if (!chatId) {
      return NextResponse.json(
        { error: "Invalid or expired Telegram auth code. Please restart the bot with /start." },
        { status: 401 }
      );
    }

    console.log(`[tg-auth] Linked wallet ${walletPubkey} to chat ${chatId}`);
    return NextResponse.json({ success: true, chatId });
  } catch (err: any) {
    console.error("[tg-auth]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
