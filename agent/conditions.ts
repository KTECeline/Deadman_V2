import { SwitchAccount } from "./types";

export interface ConditionResult {
  shouldExecute: boolean;
  reason: string;
  elapsedSeconds: number;
  remainingSeconds: number;
}

export function evaluateTimeCondition(account: SwitchAccount): ConditionResult {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const elapsedSeconds = nowSeconds - account.lastCheckIn;
  // DEMO_TRIGGER_SECONDS overrides the on-chain interval for quick demos
  const effectiveInterval = process.env.DEMO_TRIGGER_SECONDS
    ? parseInt(process.env.DEMO_TRIGGER_SECONDS)
    : account.checkInInterval;
  const remainingSeconds = effectiveInterval - elapsedSeconds;
  const shouldExecute = elapsedSeconds >= effectiveInterval;

  const reason = shouldExecute
    ? `Inactive for ${elapsedSeconds}s — interval of ${account.checkInInterval}s exceeded`
    : `Last activity ${elapsedSeconds}s ago — ${remainingSeconds}s remaining`;

  return { shouldExecute, reason, elapsedSeconds, remainingSeconds };
}

export function formatDeadline(account: SwitchAccount): string {
  const deadlineTs = account.lastCheckIn + account.checkInInterval;
  return new Date(deadlineTs * 1000).toISOString();
}
