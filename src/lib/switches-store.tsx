/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, LAMPORTS_PER_SOL, SystemProgram } from "@solana/web3.js";
import { getTelegramBotUrl } from "@/lib/telegram";
import { useProgram, findSwitchPda } from "@/lib/program";
import {
  getSwitchTitle,
  setSwitchTitle,
  getBeneficiaryName,
  setBeneficiaryName,
} from "@/lib/switch-names";

/* ------------------------------------------------------------------ */
/*  Types                                                               */
/* ------------------------------------------------------------------ */

export type SwitchStatus = "active" | "warning" | "critical" | "executed";

export interface SwitchData {
  id: number;
  pda: string;
  title: string;
  beneficiaryName: string;
  beneficiaryAddress: string;
  beneficiaryShort: string;
  amount: number;
  amountLabel: string;
  triggerCondition: string;
  triggerDays: number;
  status: SwitchStatus;
  daysRemaining: number;
  lastCheckIn: string;
  createdAt: string;
  timeline: { label: string; detail: string; completed: boolean }[];
  activity: { text: string; time: string }[];
}

export interface ActivityItem {
  text: string;
  time: string;
  icon: "check" | "plus" | "edit" | "cancel";
  color: string;
}

export interface SwitchUpdate {
  title?: string;
  beneficiaryName?: string;
  beneficiaryAddress?: string;
  amount?: number;
  triggerDays?: number;
}

export interface NewSwitchInput {
  title: string;
  beneficiaryName: string;
  beneficiaryAddress: string;
  amount: number;
  triggerDays: number;
  telegramHandle?: string;
  beneficiaryEmail?: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                             */
/* ------------------------------------------------------------------ */

function shorten(addr: string): string {
  if (!addr || addr.length < 8) return addr;
  return `${addr.slice(0, 4)}...${addr.slice(-4)}`;
}

function relativeTime(unixSeconds: number): string {
  const diff = Math.floor(Date.now() / 1000) - unixSeconds;
  if (diff < 120) return "Just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  const days = Math.floor(diff / 86400);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function toSwitchData(account: any, publicKey: PublicKey): SwitchData {
  const switchId: number = account.switchId.toNumber();
  const intervalSeconds: number = account.checkInInterval.toNumber();
  const lastCheckInTs: number = account.lastCheckIn.toNumber();
  const lockedLamports: number = account.lockedAmount.toNumber();

  const triggerDays = Math.max(1, Math.round(intervalSeconds / 86400));
  const nowSeconds = Math.floor(Date.now() / 1000);
  const elapsedDays = (nowSeconds - lastCheckInTs) / 86400;
  const daysRemaining = Math.max(0, Math.floor(triggerDays - elapsedDays));

  const beneficiaryAddress = account.beneficiary.toBase58();
  const pdaAddress = publicKey.toBase58();
  const amount = lockedLamports / LAMPORTS_PER_SOL;

  const lastActivity = Buffer.from(account.lastActivityType as number[])
    .toString("utf8")
    .replace(/\0/g, "")
    .trim();

  const status: SwitchStatus =
    daysRemaining <= 7
      ? "critical"
      : daysRemaining <= 30
      ? "warning"
      : "active";

  const title = getSwitchTitle(pdaAddress, `Switch #${switchId}`);
  const beneficiaryName = getBeneficiaryName(
    beneficiaryAddress,
    shorten(beneficiaryAddress)
  );
  const lastCheckInStr = relativeTime(lastCheckInTs);

  return {
    id: switchId,
    pda: pdaAddress,
    title,
    beneficiaryName,
    beneficiaryAddress,
    beneficiaryShort: shorten(beneficiaryAddress),
    amount,
    amountLabel: `${amount} SOL`,
    triggerCondition: `${triggerDays} days of inactivity`,
    triggerDays,
    status,
    daysRemaining,
    lastCheckIn: lastCheckInStr,
    createdAt: "On-chain",
    timeline: [
      { label: "Switch Created", detail: "On-chain", completed: true },
      { label: "Vault Funded", detail: `${amount} SOL deposited`, completed: true },
      {
        label: "Last Check-in",
        detail: lastActivity
          ? `${lastCheckInStr} — ${lastActivity}`
          : lastCheckInStr,
        completed: true,
      },
      {
        label: "Trigger",
        detail: daysRemaining > 0 ? `In ${daysRemaining} days` : "Triggered",
        completed: false,
      },
      { label: "Execution", detail: "Pending", completed: false },
    ],
    activity: [
      lastActivity
        ? { text: `Heartbeat: ${lastActivity}`, time: lastCheckInStr }
        : { text: "Checked in successfully", time: lastCheckInStr },
      { text: "Switch created on-chain", time: "On-chain" },
    ],
  };
}

/* ------------------------------------------------------------------ */
/*  Context                                                             */
/* ------------------------------------------------------------------ */

interface SwitchesContextValue {
  switches: SwitchData[];
  globalActivity: ActivityItem[];
  loading: boolean;
  telegramConnected: boolean;
  connectTelegram: () => void;
  disconnectTelegram: () => void;
  checkIn: (id: number) => void;
  cancelSwitch: (id: number) => void;
  getSwitch: (id: number) => SwitchData | undefined;
  updateSwitch: (id: number, updates: SwitchUpdate) => void;
  addSwitch: (input: NewSwitchInput) => Promise<{ sig: string; switchId: number }>;
  refresh: () => Promise<void>;
}

const SwitchesContext = createContext<SwitchesContextValue | null>(null);

export function useSwitches() {
  const ctx = useContext(SwitchesContext);
  if (!ctx) throw new Error("useSwitches must be used within SwitchesProvider");
  return ctx;
}

/* ------------------------------------------------------------------ */
/*  Provider                                                            */
/* ------------------------------------------------------------------ */

const DEMO_SWITCHES: SwitchData[] = [
  {
    id: 99,
    pda: "demo_triggered_99",
    title: "Emergency Fund to Sarah",
    beneficiaryName: "Sarah",
    beneficiaryAddress: "7xK3mPFq8VbNzR4tJkYdW9sGhL2cXeUfHnA5vQ1f9Qm",
    beneficiaryShort: "7xK3...f9Qm",
    amount: 0.05,
    amountLabel: "0.05 SOL",
    triggerCondition: "10 seconds of inactivity",
    triggerDays: 0,
    status: "executed",
    daysRemaining: 0,
    lastCheckIn: "91 days ago",
    createdAt: "120 days ago",
    timeline: [
      { label: "Switch Created", detail: "120 days ago", completed: true },
      { label: "Vault Funded", detail: "0.05 SOL deposited", completed: true },
      { label: "Last Check-in", detail: "91 days ago — dex_swap", completed: true },
      { label: "Trigger", detail: "Triggered", completed: true },
      { label: "Execution", detail: "Executed — funds sent to beneficiary", completed: true },
    ],
    activity: [
      { text: "Switch executed — 0.05 SOL sent to Sarah", time: "Just now" },
      { text: "Trigger conditions met — 90 days inactive", time: "1 day ago" },
      { text: "Heartbeat: dex_swap", time: "91 days ago" },
      { text: "Switch created on-chain", time: "120 days ago" },
    ],
  },
];

export function SwitchesProvider({ children }: { children: ReactNode }) {
  const { program, wallet } = useProgram();
  const [switches, setSwitches] = useState<SwitchData[]>(DEMO_SWITCHES);
  const [globalActivity, setGlobalActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [telegramConnected, setTelegramConnected] = useState(false);

  const connectTelegram = useCallback(() => {
    window.open(getTelegramBotUrl(), "_blank");
    setTelegramConnected(true);
  }, []);
  const disconnectTelegram = useCallback(() => setTelegramConnected(false), []);

  /* ---- fetch all Switch PDAs for connected wallet ---- */
  const fetchSwitches = useCallback(async (): Promise<void> => {
    if (!program || !wallet.publicKey) {
      setSwitches((prev) => prev.length === 0 ? DEMO_SWITCHES : prev);
      return;
    }
    setLoading(true);
    try {
      const accounts: { account: any; publicKey: PublicKey }[] = await (
        program.account as any
      )["switch"].all([
        {
          memcmp: {
            offset: 8, // skip 8-byte discriminator; owner is the first field
            bytes: wallet.publicKey.toBase58(),
          },
        },
      ]);

      const data = accounts
        .map(({ account, publicKey }) => toSwitchData(account, publicKey))
        .sort((a, b) => b.id - a.id);

      setSwitches(data);
      setGlobalActivity(
        data
          .flatMap((s) =>
            s.activity.map((a) => ({
              text: a.text,
              time: a.time,
              icon: "check" as const,
              color: "text-success",
            }))
          )
          .slice(0, 10)
      );
    } catch (err) {
      console.error("[switches-store] fetchSwitches error:", err);
    } finally {
      setLoading(false);
    }
  }, [program, wallet.publicKey]);

  useEffect(() => {
    fetchSwitches();
  }, [fetchSwitches]);

  /* ---- addSwitch — calls createSwitch on-chain, or creates mock if no wallet ---- */
  const addSwitch = useCallback(
    async (input: NewSwitchInput): Promise<{ sig: string; switchId: number }> => {
      /* ---- Mock mode: no wallet connected — auto-execute & generate claim code ---- */
      if (!program || !wallet.publicKey) {
        const mockId = Math.floor(Math.random() * 2 ** 32);
        const mockPda = `mock_${mockId}`;
        const title = input.title || `Switch #${mockId}`;

        const mockSwitch: SwitchData = {
          id: mockId,
          pda: mockPda,
          title,
          beneficiaryName: input.beneficiaryName || shorten(input.beneficiaryAddress),
          beneficiaryAddress: input.beneficiaryAddress,
          beneficiaryShort: shorten(input.beneficiaryAddress),
          amount: input.amount,
          amountLabel: `${input.amount} SOL`,
          triggerCondition: "Triggered (demo)",
          triggerDays: 0,
          status: "executed",
          daysRemaining: 0,
          lastCheckIn: "Just now",
          createdAt: "Just now",
          timeline: [
            { label: "Switch Created", detail: "Demo mode", completed: true },
            { label: "Vault Funded", detail: `${input.amount} SOL deposited`, completed: true },
            { label: "Last Check-in", detail: "Just now", completed: true },
            { label: "Trigger", detail: "Triggered", completed: true },
            { label: "Execution", detail: "Executed — awaiting beneficiary claim", completed: true },
          ],
          activity: [
            { text: `Switch executed — ${input.amount} SOL awaiting claim`, time: "Just now" },
            { text: "Trigger conditions met (demo)", time: "Just now" },
            { text: "Switch created (demo mode)", time: "Just now" },
          ],
        };

        setSwitchTitle(mockPda, title);
        if (input.beneficiaryName) {
          setBeneficiaryName(input.beneficiaryAddress, input.beneficiaryName);
        }

        setSwitches((prev) => [mockSwitch, ...prev]);
        setGlobalActivity((prev) => [
          { text: `${title} executed (demo)`, time: "Just now", icon: "check" as const, color: "text-success" },
          ...prev,
        ]);

        // Generate claim code via API
        try {
          const res = await fetch("/api/demo-claim", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              switchId: mockId,
              amount: input.amount,
              beneficiaryEmail: input.beneficiaryEmail || "",
              beneficiaryName: input.beneficiaryName || "Beneficiary",
              ownerName: input.title || "Someone",
            }),
          });
          const data = await res.json();
          if (data.claimUrl) {
            return { sig: `demo_claim:${data.code}`, switchId: mockId };
          }
        } catch {
          // Non-fatal
        }

        return { sig: `mock_tx_${mockId}`, switchId: mockId };
      }

      /* ---- Real on-chain mode ---- */
      const switchId = new anchor.BN(Math.floor(Math.random() * 2 ** 32));
      // NEXT_PUBLIC_DEMO_TRIGGER_SECONDS overrides on-chain interval for live demos
      const demoSecs = process.env.NEXT_PUBLIC_DEMO_TRIGGER_SECONDS
        ? parseInt(process.env.NEXT_PUBLIC_DEMO_TRIGGER_SECONDS)
        : null;
      const checkInInterval = new anchor.BN(demoSecs ?? input.triggerDays * 86400);
      const lockedAmount = new anchor.BN(
        Math.floor(input.amount * LAMPORTS_PER_SOL)
      );
      const beneficiary = new PublicKey(input.beneficiaryAddress);
      const watcher =
        process.env.NEXT_PUBLIC_AGENT_WATCHER
          ? new PublicKey(process.env.NEXT_PUBLIC_AGENT_WATCHER)
          : wallet.publicKey;

      const pda = findSwitchPda(wallet.publicKey, switchId);

      const tx: string = await (program.methods as any)
        .createSwitch(switchId, checkInInterval, lockedAmount, beneficiary, watcher)
        .accounts({
          switch: pda,
          owner: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc();

      setSwitchTitle(
        pda.toBase58(),
        input.title || `Switch #${switchId.toNumber()}`
      );
      if (input.beneficiaryName) {
        setBeneficiaryName(input.beneficiaryAddress, input.beneficiaryName);
      }

      setGlobalActivity((prev) => [
        {
          text: `${input.title || "New switch"} created`,
          time: "Just now",
          icon: "plus",
          color: "text-success",
        },
        ...prev,
      ]);

      await fetchSwitches();

      if (input.beneficiaryEmail) {
        await fetch("/api/register-switch-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            switchId: switchId.toNumber(),
            beneficiaryEmail: input.beneficiaryEmail,
            beneficiaryName: input.beneficiaryName,
          }),
        });
      }

      return { sig: tx, switchId: switchId.toNumber() };
    },
    [program, wallet.publicKey, fetchSwitches]
  );

  /* ---- checkIn — calls check_in on-chain, optimistic update ---- */
  const checkIn = useCallback(
    (id: number): void => {
      if (!program || !wallet.publicKey) return;
      const sw = switches.find((s) => s.id === id);
      if (!sw) return;

      // Optimistic update
      setSwitches((prev) =>
        prev.map((s) =>
          s.id !== id
            ? s
            : {
                ...s,
                daysRemaining: s.triggerDays,
                status: "active" as SwitchStatus,
                lastCheckIn: "Just now",
                activity: [
                  { text: "Checked in successfully", time: "Just now" },
                  ...s.activity,
                ],
              }
        )
      );
      setGlobalActivity((prev) => [
        {
          text: `Checked in for ${sw.title}`,
          time: "Just now",
          icon: "check",
          color: "text-success",
        },
        ...prev,
      ]);

      // Fire on-chain (fire and forget; revert on failure)
      (program.methods as any)
        .checkIn(new anchor.BN(id))
        .accounts({ switch: new PublicKey(sw.pda), owner: wallet.publicKey })
        .rpc()
        .catch((err: any) => {
          console.error("[checkIn] tx failed:", err);
          fetchSwitches();
        });
    },
    [program, wallet.publicKey, switches, fetchSwitches]
  );

  /* ---- cancelSwitch — calls cancel on-chain, optimistic remove ---- */
  const cancelSwitch = useCallback(
    (id: number): void => {
      if (!program || !wallet.publicKey) return;
      const sw = switches.find((s) => s.id === id);
      if (!sw) return;

      // Optimistic remove
      setSwitches((prev) => prev.filter((s) => s.id !== id));
      setGlobalActivity((prev) => [
        {
          text: `${sw.title} cancelled`,
          time: "Just now",
          icon: "cancel",
          color: "text-danger",
        },
        ...prev,
      ]);

      // Fire on-chain
      (program.methods as any)
        .cancel(new anchor.BN(id))
        .accounts({
          switch: new PublicKey(sw.pda),
          owner: wallet.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .rpc()
        .catch((err: any) => {
          console.error("[cancelSwitch] tx failed:", err);
          fetchSwitches();
        });
    },
    [program, wallet.publicKey, switches, fetchSwitches]
  );

  const getSwitch = useCallback(
    (id: number) => switches.find((s) => s.id === id),
    [switches]
  );

  /* ---- updateSwitch — local only (no update instruction in program) ---- */
  const updateSwitch = useCallback(
    (id: number, updates: SwitchUpdate) => {
      setSwitches((prev) =>
        prev.map((s) => {
          if (s.id !== id) return s;
          const u = { ...s };
          if (updates.title !== undefined) {
            u.title = updates.title;
            setSwitchTitle(s.pda, updates.title);
          }
          if (updates.beneficiaryName !== undefined) {
            u.beneficiaryName = updates.beneficiaryName;
            setBeneficiaryName(s.beneficiaryAddress, updates.beneficiaryName);
          }
          if (updates.beneficiaryAddress !== undefined) {
            u.beneficiaryAddress = updates.beneficiaryAddress;
            u.beneficiaryShort = shorten(updates.beneficiaryAddress);
          }
          if (updates.amount !== undefined) {
            u.amount = updates.amount;
            u.amountLabel = `${updates.amount} SOL`;
          }
          if (updates.triggerDays !== undefined) {
            u.triggerDays = updates.triggerDays;
            u.triggerCondition = `${updates.triggerDays} days of inactivity`;
          }
          u.activity = [
            { text: "Display settings updated", time: "Just now" },
            ...u.activity,
          ];
          return u;
        })
      );
    },
    []
  );

  return (
    <SwitchesContext.Provider
      value={{
        switches,
        globalActivity,
        loading,
        telegramConnected,
        connectTelegram,
        disconnectTelegram,
        checkIn,
        cancelSwitch,
        getSwitch,
        updateSwitch,
        addSwitch,
        refresh: fetchSwitches,
      }}
    >
      {children}
    </SwitchesContext.Provider>
  );
}
