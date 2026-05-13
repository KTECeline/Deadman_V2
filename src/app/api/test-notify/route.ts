import { NextRequest, NextResponse } from "next/server";
import { sendWarning } from "../../../../agent/telegram";
import { sendClaimEmail } from "../../../../agent/email";

export async function POST(req: NextRequest) {
  const { chatId, email } = await req.json();
  const results: Record<string, string> = {};

  if (chatId) {
    try {
      await sendWarning(chatId, "TEST123", 1, { amountSol: 0.5, beneficiaryName: "Test Beneficiary" });
      results.telegram = "sent";
    } catch (e: any) {
      results.telegram = `error: ${e.message}`;
    }
  }

  if (email) {
    try {
      await sendClaimEmail(email, "TestOwner", 0.5, "TESTCODE123");
      results.email = "sent";
    } catch (e: any) {
      results.email = `error: ${e.message}`;
    }
  }

  return NextResponse.json(results);
}
