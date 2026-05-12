"use client";

import { useState, useCallback, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Lock,
  Wallet,
  Info,
  Bot,
  AtSign,
  ExternalLink,
  ArrowRight,
  Loader2,
  Check,
  AlertCircle,
  Link2,
} from "lucide-react";
import Link from "next/link";
import DashboardLayout from "@/components/layout/DashboardLayout";
import { cn } from "@/lib/utils";
import { useSwitches } from "@/lib/switches-store";
import { resolveSolName } from "@/lib/sns";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL } from "@solana/web3.js";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/*  Animated Checkmark                                                 */
/* ------------------------------------------------------------------ */

function AnimatedCheckmark() {
  return (
    <motion.div
      className="relative w-24 h-24 mx-auto mb-6"
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.2 }}
    >
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          background: "linear-gradient(135deg, rgba(153,69,255,0.3), rgba(20,241,149,0.3))",
        }}
        animate={{ scale: [1, 1.2, 1], opacity: [0.6, 0.2, 0.6] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
      />
      <svg viewBox="0 0 100 100" className="w-full h-full">
        <motion.circle
          cx="50" cy="50" r="45" fill="none" stroke="url(#sGrad)" strokeWidth="3" strokeLinecap="round"
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
          transition={{ duration: 0.8, ease: "easeInOut", delay: 0.3 }}
        />
        <motion.path
          d="M30 52 L44 66 L70 36" fill="none" stroke="url(#sGrad)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"
          initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
          transition={{ duration: 0.5, ease: "easeOut", delay: 1 }}
        />
        <defs>
          <linearGradient id="sGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#9945FF" />
            <stop offset="100%" stopColor="#14F195" />
          </linearGradient>
        </defs>
      </svg>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

function CreateSwitchPageInner() {
  const { addSwitch } = useSwitches();
  const { connection } = useConnection();
  const { publicKey } = useWallet();
  const searchParams = useSearchParams();

  const [switchTitle, setSwitchTitle] = useState("");
  const [days, setDays] = useState(90);
  const [demoMode, setDemoMode] = useState(false);
  const [beneficiaryAddress, setBeneficiaryAddress] = useState("");
  const [beneficiaryName, setBeneficiaryName] = useState("");
  const [beneficiaryEmail, setBeneficiaryEmail] = useState("");
  const [amount, setAmount] = useState("5");
  const [telegramMode, setTelegramMode] = useState<"bot" | "manual" | null>(null);
  const [telegramHandle, setTelegramHandle] = useState("");
  const [tgLinked, setTgLinked] = useState(false);
  const [resolvedBeneficiaryAddress, setResolvedBeneficiaryAddress] = useState("");
  const [solNameStatus, setSolNameStatus] = useState<"idle" | "resolving" | "resolved" | "error">("idle");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);

  useEffect(() => {
    if (!publicKey) { setWalletBalance(null); return; }
    connection.getBalance(publicKey)
      .then((lamports) => setWalletBalance(lamports / LAMPORTS_PER_SOL))
      .catch(() => setWalletBalance(null));
  }, [publicKey, connection]);

  // Parse ?prefill= deep-link from Telegram bot
  useEffect(() => {
    const prefill = searchParams.get("prefill");
    if (!prefill) return;
    try {
      const decoded = JSON.parse(Buffer.from(prefill, "base64url").toString("utf-8"));
      if (decoded.graceDays) setDays(decoded.graceDays);
      if (decoded.amountSol) setAmount(String(decoded.amountSol));
      if (decoded.beneficiaryName) setBeneficiaryName(decoded.beneficiaryName);
      if (decoded.beneficiaryEmail) setBeneficiaryEmail(decoded.beneficiaryEmail);
      if (decoded.useCase) setSwitchTitle(decoded.useCase);
      setTelegramMode("bot");
    } catch { /* invalid prefill — ignore */ }
  }, [searchParams]);

  // Link Telegram once wallet is connected and tgCode is present
  useEffect(() => {
    const tgCode = searchParams.get("tgCode");
    if (!tgCode || !publicKey || tgLinked) return;
    fetch("/api/tg-auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tgCode, walletPubkey: publicKey.toBase58() }),
    })
      .then(r => r.json())
      .then(d => { if (d.success) setTgLinked(true); })
      .catch(() => {});
  }, [publicKey, searchParams, tgLinked]);

  const handleBeneficiaryBlur = useCallback(async () => {
    const val = beneficiaryAddress.trim();
    if (!val.toLowerCase().endsWith(".sol")) {
      setResolvedBeneficiaryAddress(val);
      setSolNameStatus("idle");
      return;
    }
    setSolNameStatus("resolving");
    const resolved = await resolveSolName(val);
    if (resolved) {
      setResolvedBeneficiaryAddress(resolved);
      setSolNameStatus("resolved");
    } else {
      setResolvedBeneficiaryAddress("");
      setSolNameStatus("error");
    }
  }, [beneficiaryAddress]);

  const parsedAmount = parseFloat(amount) || 0;
  const effectiveBeneficiary = resolvedBeneficiaryAddress || beneficiaryAddress;
  const canSubmit =
    !!publicKey &&
    effectiveBeneficiary.trim().length > 0 &&
    solNameStatus !== "resolving" &&
    solNameStatus !== "error" &&
    parsedAmount > 0 &&
    !submitting;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const sig = await addSwitch({
        title:
          switchTitle.trim() ||
          (beneficiaryName
            ? `Transfer to ${beneficiaryName}`
            : `Switch ${Date.now().toString(36).slice(-4)}`),
        beneficiaryName: beneficiaryName || (beneficiaryAddress.endsWith(".sol") ? beneficiaryAddress : "Unknown"),
        beneficiaryAddress: effectiveBeneficiary,
        amount: parsedAmount,
        triggerDays: demoMode ? days / 1440 : days,
        telegramHandle: telegramMode === "manual" ? telegramHandle : undefined,
      });
      setTxSignature(sig);
      setSuccess(true);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Transaction failed. Please try again.";
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, addSwitch, switchTitle, beneficiaryName, beneficiaryAddress, effectiveBeneficiary, parsedAmount, days, demoMode, telegramMode, telegramHandle]);

  const handleReset = useCallback(() => {
    setSwitchTitle("");
    setDays(90);
    setBeneficiaryAddress("");
    setBeneficiaryName("");
    setResolvedBeneficiaryAddress("");
    setSolNameStatus("idle");
    setAmount("5");
    setTelegramMode(null);
    setTelegramHandle("");
    setSuccess(false);
    setTxSignature(null);
    setSubmitError(null);
  }, []);

  return (
    <DashboardLayout>
      <div className="max-w-2xl mx-auto py-4 md:py-8">
        {/* Back */}
        {!success && (
          <button
            onClick={() => window.history.back()}
            className="inline-flex items-center gap-2 text-sm text-secondary hover:text-white transition-colors mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        )}

        <AnimatePresence mode="wait">
          {!success ? (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
            >
              {/* Header */}
              <div className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight">
                  Create Your Switch
                </h1>
                <p className="mt-1 text-secondary">
                  Set up your dead man&apos;s switch in a few simple steps.
                </p>
              </div>

              {/* Form Card */}
              <div className="glass p-6 sm:p-8 rounded-2xl space-y-8">
                {/* ---- Section 0: Switch Title ---- */}
                <div>
                  <label className="text-sm font-semibold text-white mb-3 block">
                    Switch Name
                  </label>
                  <input
                    value={switchTitle}
                    onChange={(e) => setSwitchTitle(e.target.value)}
                    placeholder="e.g. Emergency Family Transfer"
                    className="w-full glass px-4 py-3 rounded-xl bg-transparent text-white text-base placeholder-muted/50 focus:outline-none focus:border-accent/40 transition-colors"
                  />
                  <p className="mt-2 text-xs text-muted">Give your switch a name so you can identify it later.</p>
                </div>

                {/* Divider */}
                <div className="h-px bg-white/[0.06]" />

                {/* ---- Section 1: Inactivity Period ---- */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-sm font-semibold text-white">
                      If I go silent for...
                    </label>
                    <button
                      type="button"
                      onClick={() => { setDemoMode((d) => !d); setDays(demoMode ? 90 : 2); }}
                      className={cn(
                        "text-xs px-2.5 py-1 rounded-full border transition-colors",
                        demoMode
                          ? "border-accent text-accent bg-accent/10"
                          : "border-white/10 text-muted hover:text-white"
                      )}
                    >
                      {demoMode ? "\u26a1 Demo mode" : "Demo mode"}
                    </button>
                  </div>
                  <div className="flex items-center gap-4">
                    <input
                      type="range"
                      min={demoMode ? 1 : 1}
                      max={demoMode ? 10 : 90}
                      value={days}
                      onChange={(e) => setDays(Number(e.target.value))}
                      className="flex-1 h-2 rounded-full appearance-none bg-white/[0.06] cursor-pointer accent-accent [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-solana-gradient [&::-webkit-slider-thumb]:shadow-lg [&::-webkit-slider-thumb]:shadow-accent/30 [&::-webkit-slider-thumb]:cursor-pointer"
                    />
                    <div className="glass px-4 py-2.5 rounded-xl flex items-baseline gap-1 min-w-[90px] justify-center">
                      <span className="text-xl font-bold text-white">{days}</span>
                      <span className="text-sm text-muted">{demoMode ? "min" : "days"}</span>
                    </div>
                  </div>
                  <p className="mt-3 text-xs text-muted leading-relaxed">
                    {demoMode
                      ? `Switch fires after ${days} minute${days === 1 ? "" : "s"} of inactivity. For demo purposes only.`
                      : days <= 14
                        ? `If you don\u2019t check in for ${days} days, your switch will trigger. This is a very short period \u2014 use with caution.`
                        : days <= 30
                          ? `If you don\u2019t check in for ${days} days, your switch will trigger. Best for active traders.`
                          : days <= 60
                            ? `If you don\u2019t check in for ${days} days, your switch will trigger. A balanced choice.`
                            : `If you don\u2019t check in for ${days} days, your switch will trigger. Recommended for most users.`}
                  </p>
                </div>

                {/* Divider */}
                <div className="h-px bg-white/[0.06]" />

                {/* ---- Section 2: Beneficiary ---- */}
                <div>
                  <label className="text-sm font-semibold text-white mb-3 block">
                    Send my assets to
                  </label>
                  <div className={cn(
                    "glass flex items-center gap-3 px-4 py-3 rounded-xl focus-within:border-accent/40 transition-colors mb-1",
                    solNameStatus === "error" && "border-danger/40"
                  )}>
                    <Wallet className="w-4 h-4 text-muted shrink-0" />
                    <input
                      value={beneficiaryAddress}
                      onChange={(e) => {
                        setBeneficiaryAddress(e.target.value);
                        if (solNameStatus !== "idle") {
                          setSolNameStatus("idle");
                          setResolvedBeneficiaryAddress("");
                        }
                      }}
                      onBlur={handleBeneficiaryBlur}
                      placeholder="Wallet address or .sol name"
                      className="flex-1 bg-transparent text-white text-sm font-mono placeholder-muted/50 focus:outline-none"
                    />
                    {solNameStatus === "resolving" && (
                      <Loader2 className="w-4 h-4 text-muted animate-spin shrink-0" />
                    )}
                    {solNameStatus === "resolved" && (
                      <Check className="w-4 h-4 text-success shrink-0" />
                    )}
                    {solNameStatus === "error" && (
                      <AlertCircle className="w-4 h-4 text-danger shrink-0" />
                    )}
                  </div>
                  {solNameStatus === "resolved" && (
                    <p className="text-xs text-success mb-3 px-1">
                      ✓ Resolves to {resolvedBeneficiaryAddress.slice(0, 6)}...{resolvedBeneficiaryAddress.slice(-4)}
                    </p>
                  )}
                  {solNameStatus === "error" && (
                    <p className="text-xs text-danger mb-3 px-1">Domain not found on Solana</p>
                  )}
                  {solNameStatus === "idle" && <div className="mb-3" />}
                  <div className="glass flex items-center gap-3 px-4 py-3 rounded-xl focus-within:border-accent/40 transition-colors mb-3">
                    <AtSign className="w-4 h-4 text-muted shrink-0" />
                    <input
                      value={beneficiaryName}
                      onChange={(e) => setBeneficiaryName(e.target.value)}
                      placeholder="Beneficiary name (optional)"
                      className="flex-1 bg-transparent text-white text-sm placeholder-muted/50 focus:outline-none"
                    />
                  </div>
                  <div className="glass flex items-center gap-3 px-4 py-3 rounded-xl focus-within:border-accent/40 transition-colors">
                    <span className="text-muted text-xs shrink-0">@</span>
                    <input
                      value={beneficiaryEmail}
                      onChange={(e) => setBeneficiaryEmail(e.target.value)}
                      placeholder="Beneficiary email (for claim notification)"
                      type="email"
                      className="flex-1 bg-transparent text-white text-sm placeholder-muted/50 focus:outline-none"
                    />
                  </div>
                  {tgLinked && (
                    <div className="flex items-center gap-2 mt-3 text-xs text-[#14F195]">
                      <Link2 className="w-3.5 h-3.5" />
                      Telegram linked — you&apos;ll receive alerts in the bot.
                    </div>
                  )}
                </div>

                {/* Divider */}
                <div className="h-px bg-white/[0.06]" />

                {/* ---- Section 3: Amount ---- */}
                <div>
                  <label className="text-sm font-semibold text-white mb-3 block">
                    Amount to protect
                  </label>
                  <div className="glass flex items-center px-4 py-3 rounded-xl focus-within:border-accent/40 transition-colors">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="flex-1 bg-transparent text-white text-lg font-semibold focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="text-muted font-medium ml-2">SOL</span>
                  </div>
                  <p className="mt-2 text-xs text-muted">
                    Wallet Balance:{" "}
                    {walletBalance !== null
                      ? `${walletBalance.toFixed(3)} SOL`
                      : publicKey
                      ? "Loading..."
                      : "Connect wallet"}
                  </p>
                </div>

                {/* Divider */}
                <div className="h-px bg-white/[0.06]" />

                {/* ---- Section 4: Telegram ---- */}
                <div>
                  <label className="text-sm font-semibold text-white mb-1 block">
                    Notify me via Telegram
                  </label>
                  <p className="text-xs text-muted mb-4">
                    You&apos;ll receive a warning before your switch executes.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      onClick={() => setTelegramMode("bot")}
                      className={cn(
                        "glass p-4 rounded-xl text-left transition-all duration-200 flex items-start gap-3",
                        telegramMode === "bot"
                          ? "border-accent/40 bg-accent/5"
                          : "hover:border-white/[0.15]"
                      )}
                    >
                      <Bot className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-white">Connect Telegram Bot</p>
                        <p className="text-xs text-muted mt-0.5">Auto-connect via bot</p>
                      </div>
                    </button>
                    <button
                      onClick={() => setTelegramMode("manual")}
                      className={cn(
                        "glass p-4 rounded-xl text-left transition-all duration-200 flex items-start gap-3",
                        telegramMode === "manual"
                          ? "border-accent/40 bg-accent/5"
                          : "hover:border-white/[0.15]"
                      )}
                    >
                      <AtSign className="w-5 h-5 text-accent shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-white">Enter handle manually</p>
                        <p className="text-xs text-muted mt-0.5">Type your @username</p>
                      </div>
                    </button>
                  </div>

                  <AnimatePresence>
                    {telegramMode === "manual" && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="glass flex items-center gap-3 px-4 py-3 rounded-xl mt-3 focus-within:border-accent/40 transition-colors">
                          <span className="text-muted text-sm">@</span>
                          <input
                            value={telegramHandle}
                            onChange={(e) => setTelegramHandle(e.target.value)}
                            placeholder="your_username"
                            className="flex-1 bg-transparent text-white text-sm placeholder-muted/50 focus:outline-none"
                          />
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <AnimatePresence>
                    {telegramMode === "bot" && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="flex items-center gap-2 mt-3 text-xs text-success">
                          <Check className="w-3.5 h-3.5" />
                          Telegram bot connected!
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Divider */}
                <div className="h-px bg-white/[0.06]" />

                {/* ---- Summary ---- */}
                <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-4 flex items-start gap-3">
                  <Info className="w-4 h-4 text-accent-cyan shrink-0 mt-0.5" />
                  <p className="text-sm text-secondary leading-relaxed">
                    If you fail to check in for{" "}
                    <span className="text-white font-semibold">
                      {days} {demoMode ? "minutes" : "days"}
                    </span>,{" "}
                    <span className="text-white font-semibold">
                      {parsedAmount || "..."} SOL
                    </span>{" "}
                    will automatically transfer to{" "}
                    <span className="text-white font-semibold">
                      {beneficiaryName ||
                        (beneficiaryAddress.toLowerCase().endsWith(".sol")
                          ? beneficiaryAddress
                          : beneficiaryAddress
                          ? `${beneficiaryAddress.slice(0, 6)}...${beneficiaryAddress.slice(-4)}`
                          : "...")}
                    </span>
                    .
                  </p>
                </div>

                {/* ---- Error ---- */}
                <AnimatePresence>
                  {submitError && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="flex items-start gap-2 rounded-xl bg-danger/10 border border-danger/20 px-4 py-3 text-sm text-danger"
                    >
                      <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{submitError}</span>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* ---- Submit ---- */}
                <motion.button
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  whileHover={canSubmit ? { scale: 1.01 } : {}}
                  whileTap={canSubmit ? { scale: 0.99 } : {}}
                  className={cn(
                    "w-full py-4 rounded-xl font-semibold text-base flex items-center justify-center gap-2.5 transition-all duration-300",
                    canSubmit
                      ? "bg-solana-gradient text-white shadow-lg shadow-accent/20 cursor-pointer"
                      : "bg-card-alt text-muted cursor-not-allowed"
                  )}
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Creating on-chain...
                    </>
                  ) : !publicKey ? (
                    <>
                      <Wallet className="w-5 h-5" />
                      Connect Wallet to Continue
                    </>
                  ) : (
                    <>
                      <Lock className="w-5 h-5" />
                      Create Switch &amp; Lock Assets
                    </>
                  )}
                </motion.button>
              </div>
            </motion.div>
          ) : (
            /* ---- Success Screen ---- */
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5 }}
              className="flex flex-col items-center justify-center min-h-[60vh] text-center"
            >
              <AnimatedCheckmark />

              <motion.h1
                className="text-3xl md:text-4xl font-bold mb-3"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.2 }}
              >
                <span className="text-gradient">Switch Created Successfully</span>
              </motion.h1>

              <motion.p
                className="text-secondary text-lg mb-8"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.4 }}
              >
                Your assets are now protected.
              </motion.p>

              {txSignature && (
                <motion.div
                  className="glass px-5 py-3 rounded-xl mb-6 inline-flex items-center gap-2"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.6 }}
                >
                  <span className="text-muted text-sm">tx:</span>
                  <span className="font-mono text-sm text-white">
                    {txSignature.slice(0, 8)}...{txSignature.slice(-8)}
                  </span>
                  <a
                    href={`https://explorer.solana.com/tx/${txSignature}?cluster=devnet`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-accent hover:text-accent-cyan transition-colors" />
                  </a>
                </motion.div>
              )}

              <motion.div
                className="flex flex-col sm:flex-row gap-3"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.8 }}
              >
                <Link
                  href="/switches"
                  className="inline-flex items-center gap-2 px-8 py-3.5 rounded-xl bg-solana-gradient font-semibold text-white shadow-lg shadow-accent/20 hover:scale-105 active:scale-95 transition-transform"
                >
                  View All Switches
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <button
                  onClick={handleReset}
                  className="glass-hover px-8 py-3.5 rounded-xl font-semibold text-secondary hover:text-white"
                >
                  Create Another
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </DashboardLayout>
  );
}

export default function CreateSwitchPage() {
  return (
    <Suspense>
      <CreateSwitchPageInner />
    </Suspense>
  );
}
