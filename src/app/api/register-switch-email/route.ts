import { NextRequest, NextResponse } from "next/server";
import { registerSwitchEmail } from "../../../../agent/bot-state";

export async function POST(req: NextRequest) {
  try {
    const { switchId, beneficiaryEmail, beneficiaryName } = await req.json();
    if (!switchId || !beneficiaryEmail) {
      return NextResponse.json({ error: "switchId and beneficiaryEmail required" }, { status: 400 });
    }
    registerSwitchEmail(String(switchId), beneficiaryEmail, beneficiaryName);
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
