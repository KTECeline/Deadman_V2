"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Shield,
  FileText,
  Bot,
  ExternalLink,
  Copy,
  Check,
  Plus,
  ChevronRight,
} from "lucide-react";
import Link from "next/link";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { cn, formatCountdown } from "@/lib/utils";
import { useSwitches } from "@/lib/switches-store";

/* ------------------------------------------------------------------ */
/*  Animation                                                          */
/* ------------------------------------------------------------------ */

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: "easeOut" as const },
  }),
};

/* ------------------------------------------------------------------ */
/*  Agent Activity Log                                                 */
/* ------------------------------------------------------------------ */

const baseAgentActivity = [
  { text: "Agent monitoring started", time: "On-chain", dot: "bg-success" },
  { text: "Heartbeat detected — wallet active", time: "Recently", dot: "bg-success" },
  { text: "No activity detected — monitoring continues", time: "Just now", dot: "bg-muted" },
];

function buildAgentActivity(switchActivity: { text: string; time: string }[]) {
  const mapped = switchActivity.map((a) => {
    if (a.text.toLowerCase().includes("check"))
      return { text: "Check-in recorded on-chain", time: a.time, dot: "bg-success" };
    if (a.text.toLowerCase().includes("heartbeat"))
      return { text: "Heartbeat detected on-chain", time: a.time, dot: "bg-success" };
    if (a.text.toLowerCase().includes("funded"))
      return { text: "Vault funded — assets locked", time: a.time, dot: "bg-success" };
    if (a.text.toLowerCase().includes("created"))
      return { text: "Switch created — agent deployed", time: a.time, dot: "bg-success" };
    return { text: a.text, time: a.time, dot: "bg-muted" };
  });
  return [...mapped, ...baseAgentActivity];
}

/* ------------------------------------------------------------------ */
/*  Copy PDA button                                                    */
/* ------------------------------------------------------------------ */

function CopyPdaButton({ pda }: { pda: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(pda);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="inline-flex items-center gap-1.5 text-xs text-secondary hover:text-white transition-colors"
    >
      {copied ? (
        <Check className="w-3.5 h-3.5 text-success" />
      ) : (
        <Copy className="w-3.5 h-3.5" />
      )}
      {copied ? "Copied!" : "Copy PDA"}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function DashboardPage() {
  const { switches, loading } = useSwitches();
  const sw = switches[0] ?? null;

  /* ---- Loading ---- */
  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <motion.div
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="text-secondary"
          >
            Loading your switches…
          </motion.div>
        </div>
      </DashboardLayout>
    );
  }

  /* ---- Empty State ---- */
  if (!sw) {
    return (
      <DashboardLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
          >
            <Shield className="w-16 h-16 text-muted mx-auto mb-6" />
            <h1 className="text-2xl font-bold mb-2">No Active Switch</h1>
            <p className="text-secondary mb-8 max-w-sm mx-auto">
              Create your first dead man&apos;s switch to protect your assets.
            </p>
            <Link
              href="/create"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-solana-gradient text-white font-semibold hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" />
              Create Switch
            </Link>
          </motion.div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <motion.div initial="hidden" animate="visible" className="space-y-8 max-w-5xl mx-auto">

        {/* ---- Your Switches (latest 3) ---- */}
        <motion.div variants={fadeUp} custom={3.5}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-lg">Your Switches</h3>
            <Link
              href="/switches"
              className="text-sm text-accent hover:text-accent-cyan transition-colors inline-flex items-center gap-1"
            >
              View More <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {switches.slice(0, 3).map((s) => {
              const isWarn = s.status === "warning" || s.status === "critical";
              return (
                <Link key={s.id} href={`/switch/${s.id}`}>
                  <motion.div
                    whileHover={{ y: -3 }}
                    className={cn(
                      "p-5 rounded-2xl cursor-pointer transition-all",
                      isWarn ? "glass-glow-yellow" : "glass-glow-green"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <h4 className="font-semibold text-sm leading-tight">{s.title}</h4>
                      <span
                        className={cn(
                          "shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium",
                          isWarn
                            ? "bg-warning/10 text-warning border border-warning/20"
                            : "bg-success/10 text-success border border-success/20"
                        )}
                      >
                        {s.status === "critical" ? "Triggered" : isWarn ? "Warning" : "Active"}
                      </span>
                    </div>
                    <div className="space-y-1.5 text-xs text-secondary">
                      <p>
                        <span className="text-muted">To:</span>{" "}
                        {s.beneficiaryName} ({s.beneficiaryShort})
                      </p>
                      <p>
                        <span className="text-muted">Amount:</span>{" "}
                        <span className="text-white font-medium">{s.amountLabel}</span>
                      </p>
                    </div>
                    <p
                      className={cn(
                        "text-xs font-medium mt-3",
                        isWarn ? "text-warning" : "text-success"
                      )}
                    >
                      {formatCountdown(s.daysRemaining)}
                    </p>
                  </motion.div>
                </Link>
              );
            })}
          </div>
        </motion.div>

        {/* ---- cNFT Instruction Card ---- */}
        <motion.div variants={fadeUp} custom={4} className="glass p-6 rounded-2xl">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-5 h-5 text-accent" />
            <h3 className="font-semibold">Your Instruction Scroll</h3>
          </div>
          <p className="text-sm text-secondary mb-5">
            A compressed NFT recording your switch instructions, stored on-chain.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5">
            <div className="bg-white/[0.02] rounded-xl p-3">
              <p className="text-xs text-muted mb-1">Switch PDA</p>
              <p className="text-sm font-mono text-white truncate">
                {sw.pda.slice(0, 8)}…{sw.pda.slice(-4)}
              </p>
            </div>
            <div className="bg-white/[0.02] rounded-xl p-3">
              <p className="text-xs text-muted mb-1">Amount Locked</p>
              <p className="text-sm text-white font-medium">{sw.amountLabel}</p>
            </div>
            <div className="bg-white/[0.02] rounded-xl p-3">
              <p className="text-xs text-muted mb-1">Status</p>
              <p className="text-sm text-success font-medium">Active</p>
            </div>
          </div>
          <div className="flex gap-3">
            <a
              href={`https://explorer.solana.com/address/${sw.pda}?cluster=devnet`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-secondary hover:text-white transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              View on Explorer
            </a>
            <CopyPdaButton pda={sw.pda} />
          </div>
        </motion.div>

        {/* ---- Agent Activity Log ---- */}
        <motion.div variants={fadeUp} custom={5} className="glass p-6 rounded-2xl">
          <div className="flex items-center gap-2 mb-5">
            <Bot className="w-5 h-5 text-accent" />
            <h3 className="font-semibold">Agent Activity</h3>
          </div>
          <ul className="space-y-4">
            {buildAgentActivity(sw.activity).map((item, i) => (
              <li key={i} className="flex items-start gap-3 text-sm">
                <span className={cn("mt-1.5 h-2.5 w-2.5 rounded-full shrink-0", item.dot)} />
                <div className="flex flex-1 items-center justify-between gap-2">
                  <span className="text-secondary">{item.text}</span>
                  <span className="shrink-0 text-xs text-muted">{item.time}</span>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-xs text-muted">
            Activity derived from on-chain switch account data.
          </p>
        </motion.div>
      </motion.div>
    </DashboardLayout>
  );
}
