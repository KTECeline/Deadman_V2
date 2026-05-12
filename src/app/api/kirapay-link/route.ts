import { NextRequest, NextResponse } from "next/server";
import { createPaymentLink } from "../../../../agent/kirapay";

export async function POST(req: NextRequest) {
  try {
    const { switchId, ownerWallet } = await req.json();

    if (!switchId || !ownerWallet) {
      return NextResponse.json({ error: "switchId and ownerWallet are required" }, { status: 400 });
    }

    if (!process.env.KIRAPAY_API_KEY) {
      return NextResponse.json({ error: "KIRAPAY_API_KEY not configured" }, { status: 500 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? new URL(req.url).origin;

    const link = await createPaymentLink(
      switchId,
      ownerWallet,
      1,
      `${appUrl}/switches`
    );

    return NextResponse.json({ checkoutUrl: link.checkoutUrl, linkId: link.id, code: link.code });
  } catch (err: any) {
    console.error("[kirapay-link]", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
