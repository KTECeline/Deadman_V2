import { Resend } from "resend";

let _resend: Resend | null = null;
function client() {
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

const FROM = process.env.RESEND_FROM_EMAIL ?? "Dead Man's Switch <notify@deadmansswitch.xyz>";
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export async function sendClaimEmail(
  to: string,
  ownerName: string,
  amountSol: number,
  claimCode: string
): Promise<void> {
  const claimUrl = `${APP_URL}/claim?code=${claimCode}`;

  await client().emails.send({
    from: FROM,
    to,
    subject: `${ownerName} left you ${amountSol} SOL`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0d0d0d;color:#fff;border-radius:16px">
        <h1 style="font-size:24px;font-weight:700;margin-bottom:8px">You have a pending inheritance</h1>
        <p style="color:#aaa;margin-bottom:24px">
          <strong style="color:#fff">${ownerName}</strong> set up a Dead Man's Switch and designated you as their beneficiary.
          Since they have not been active, their switch has fired.
        </p>
        <div style="background:#1a1a1a;border-radius:12px;padding:20px;margin-bottom:24px">
          <p style="margin:0 0 4px;color:#aaa;font-size:13px">Amount waiting for you</p>
          <p style="margin:0;font-size:32px;font-weight:700;color:#14F195">${amountSol} SOL</p>
        </div>
        <p style="color:#aaa;margin-bottom:20px">
          You don't need a crypto wallet to claim — just click the button below and follow the steps.
          Takes under 2 minutes.
        </p>
        <a href="${claimUrl}" style="display:inline-block;padding:14px 28px;background:linear-gradient(135deg,#9945FF,#14F195);color:#fff;font-weight:600;border-radius:10px;text-decoration:none;font-size:15px">
          Claim Your SOL
        </a>
        <p style="color:#555;font-size:12px;margin-top:24px">
          Or paste this link in your browser:<br/>
          <span style="color:#9945FF">${claimUrl}</span>
        </p>
        <p style="color:#555;font-size:11px;margin-top:16px">
          You can also claim via Telegram — message <strong>@${process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME ?? "deadmansswitch_bot"}</strong> with:<br/>
          <code style="background:#1a1a1a;padding:2px 6px;border-radius:4px">/claim ${claimCode}</code>
        </p>
      </div>
    `,
  });

  console.log(`[email] Claim email sent to ${to} (code: ${claimCode})`);
}

export async function sendActivationEmail(to: string, appUrl: string): Promise<void> {
  await client().emails.send({
    from: FROM,
    to,
    subject: "Your Dead Man's Switch is now active",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;background:#0d0d0d;color:#fff;border-radius:16px">
        <h1 style="font-size:22px;font-weight:700;margin-bottom:8px">Your switch is live</h1>
        <p style="color:#aaa">
          Payment confirmed. Your Dead Man's Switch is now active and monitoring your wallet.
          The agent will reset your timer automatically whenever it sees on-chain activity from your wallet.
        </p>
        <a href="${appUrl}/switches" style="display:inline-block;margin-top:20px;padding:12px 24px;background:linear-gradient(135deg,#9945FF,#14F195);color:#fff;font-weight:600;border-radius:10px;text-decoration:none">
          View Your Dashboard
        </a>
      </div>
    `,
  });
}
