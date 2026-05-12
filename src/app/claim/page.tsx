"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Wallet, ExternalLink, Loader2, AlertCircle, Check, Lock } from "lucide-react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import DashboardLayout from "@/components/layout/DashboardLayout";

interface ClaimDetails {
  switchId: string;
  beneficiaryEmail: string;
  expiresAt: number;
}

function ClaimPageInner() {
  const searchParams = useSearchParams();
  const code = searchParams.get("code") ?? "";
  const { publicKey } = useWallet();

  const [details, setDetails] = useState<ClaimDetails | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [manualAddress, setManualAddress] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [txSig, setTxSig] = useState<string | null>(null);

  // Fetch switch details from the claim code
  useEffect(() => {
    if (!code) { setLoadError("No claim code provided."); return; }
    fetch(`/api/claim?code=${encodeURIComponent(code)}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setLoadError(d.error); return; }
        setDetails(d);
      })
      .catch(() => setLoadError("Failed to load claim details."));
  }, [code]);

  const handleClaim = useCallback(async () => {
    const walletAddress = publicKey?.toBase58() ?? manualAddress.trim();
    if (!walletAddress || !code) return;

    setClaiming(true);
    setClaimError(null);
    try {
      const res = await fetch("/api/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, walletAddress }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Claim failed");
      setTxSig(data.signature);
    } catch (err: any) {
      setClaimError(err.message);
    } finally {
      setClaiming(false);
    }
  }, [code, publicKey, manualAddress]);

  const walletAddress = publicKey?.toBase58() ?? manualAddress.trim();
  const canClaim = !!walletAddress && !!details && !txSig;

  if (txSig) {
    return (
      <DashboardLayout>
        <div className="max-w-lg mx-auto py-16 text-center">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 200, damping: 15 }}
            className="w-20 h-20 rounded-full mx-auto mb-6 flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, rgba(153,69,255,0.3), rgba(20,241,149,0.3))" }}
          >
            <Check className="w-10 h-10 text-[#14F195]" />
          </motion.div>
          <h1 className="text-3xl font-bold mb-3">
            <span className="text-gradient">Funds Received</span>
          </h1>
          <p className="text-secondary mb-8">The SOL has been transferred to your wallet.</p>
          <div className="glass px-5 py-3 rounded-xl mb-8 inline-flex items-center gap-2">
            <span className="text-muted text-sm">tx:</span>
            <span className="font-mono text-sm text-white">{txSig.slice(0, 8)}...{txSig.slice(-8)}</span>
            <a href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-3.5 h-3.5 text-accent hover:text-accent-cyan transition-colors" />
            </a>
          </div>
          <Link href="/" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-solana-gradient text-white font-semibold">
            Done
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="max-w-lg mx-auto py-8">
        <div className="mb-8 text-center">
          <div className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
            style={{ background: "linear-gradient(135deg, rgba(153,69,255,0.2), rgba(20,241,149,0.2))" }}>
            <Lock className="w-8 h-8 text-accent" />
          </div>
          <h1 className="text-3xl font-bold mb-2">Claim Your Inheritance</h1>
          <p className="text-secondary">Someone left SOL for you. Enter a wallet address to receive it.</p>
        </div>

        <AnimatePresence mode="wait">
          {loadError ? (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="glass p-6 rounded-2xl flex items-start gap-3 border border-red-500/20"
            >
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-white font-medium">Unable to load claim</p>
                <p className="text-secondary text-sm mt-1">{loadError}</p>
              </div>
            </motion.div>
          ) : !details ? (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-accent mx-auto" />
              <p className="text-muted mt-3 text-sm">Loading claim details...</p>
            </motion.div>
          ) : (
            <motion.div key="form" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="glass p-6 sm:p-8 rounded-2xl space-y-6">

              {/* Amount card */}
              <div className="bg-white/[0.03] border border-white/[0.08] rounded-xl p-5 text-center">
                <p className="text-sm text-muted mb-1">Waiting for you</p>
                <p className="text-4xl font-bold text-[#14F195]">SOL</p>
                <p className="text-xs text-muted mt-2">Switch #{details.switchId}</p>
              </div>

              <div className="h-px bg-white/[0.06]" />

              {/* Wallet connect */}
              <div>
                <p className="text-sm font-semibold text-white mb-3">Receive to</p>
                {publicKey ? (
                  <div className="glass flex items-center gap-3 px-4 py-3 rounded-xl border border-[#14F195]/20">
                    <Check className="w-4 h-4 text-[#14F195] shrink-0" />
                    <span className="font-mono text-sm text-white">{publicKey.toBase58().slice(0, 16)}...{publicKey.toBase58().slice(-8)}</span>
                  </div>
                ) : (
                  <>
                    <div className="mb-3">
                      <WalletMultiButton className="!w-full !justify-center !rounded-xl !bg-white/[0.06] !border !border-white/[0.1] !text-white hover:!bg-white/[0.1] !transition-colors" />
                    </div>
                    <div className="flex items-center gap-3 my-4">
                      <div className="flex-1 h-px bg-white/[0.06]" />
                      <span className="text-xs text-muted">or enter manually</span>
                      <div className="flex-1 h-px bg-white/[0.06]" />
                    </div>
                    <div className="glass flex items-center gap-3 px-4 py-3 rounded-xl focus-within:border-accent/40 transition-colors">
                      <Wallet className="w-4 h-4 text-muted shrink-0" />
                      <input
                        value={manualAddress}
                        onChange={e => setManualAddress(e.target.value)}
                        placeholder="Paste your Solana wallet address..."
                        className="flex-1 bg-transparent text-white text-sm font-mono placeholder-muted/50 focus:outline-none"
                      />
                    </div>
                  </>
                )}
              </div>

              <AnimatePresence>
                {claimError && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="flex items-start gap-2 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{claimError}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              <motion.button
                onClick={handleClaim}
                disabled={!canClaim || claiming}
                whileHover={canClaim && !claiming ? { scale: 1.01 } : {}}
                whileTap={canClaim && !claiming ? { scale: 0.99 } : {}}
                className={`w-full py-4 rounded-xl font-semibold text-base flex items-center justify-center gap-2.5 transition-all duration-300 ${
                  canClaim && !claiming
                    ? "bg-solana-gradient text-white shadow-lg shadow-accent/20 cursor-pointer"
                    : "bg-white/[0.04] text-muted cursor-not-allowed"
                }`}
              >
                {claiming ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Claiming on-chain...</>
                ) : (
                  <><Lock className="w-5 h-5" /> Claim SOL</>
                )}
              </motion.button>

              <p className="text-xs text-muted text-center">
                Don&apos;t have a wallet?{" "}
                <a
                  href={`${process.env.NEXT_PUBLIC_APP_URL ?? ""}/wallet`}
                  className="text-accent hover:underline"
                >
                  Create a free one here
                </a>
                {" "}— takes 30 seconds.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </DashboardLayout>
  );
}

export default function ClaimPage() {
  return (
    <Suspense>
      <ClaimPageInner />
    </Suspense>
  );
}
