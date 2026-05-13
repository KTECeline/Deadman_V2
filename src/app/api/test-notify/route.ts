import { NextRequest, NextResponse } from "next/server";
import { Resend } from "resend";

export async function POST(req: NextRequest) {
  const { chatId, email } = await req.json();
  const results: Record<string, string> = {};

  if (chatId) {
    try {
      const token = process.env.TELEGRAM_BOT_TOKEN;
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: "⚠️ Test warning from DeadSwitch — your agent is live!",
        }),
      });
      const data = await res.json();
      results.telegram = data.ok ? "sent" : `error: ${JSON.stringify(data)}`;
    } catch (e: any) {
      results.telegram = `error: ${e.message}`;
    }
  }

  if (email) {
    try {
      const resend = new Resend(process.env.RESEND_API_KEY);
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL ?? "notify@deadmansswitch.xyz",
        to: email,
        subject: "DeadSwitch test email",
        text: "Test email from DeadSwitch — your notifications are working!",
      });
      results.email = "sent";
    } catch (e: any) {
      results.email = `error: ${e.message}`;
    }
  }

  return NextResponse.json(results);
}
