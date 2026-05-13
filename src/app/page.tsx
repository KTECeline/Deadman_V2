"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, useInView, type Variants } from "framer-motion";
import {
  Lock,
  Clock,
  Heart,
  Shield,
  Link as LinkIcon,
  Bot,
  MessageCircle,
  Wallet,
  Send,
  ToggleRight,
  CheckCircle,
  ChevronRight,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSwitches } from "@/lib/switches-store";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

/* ------------------------------------------------------------------ */
/*  Animation variants                                                 */
/* ------------------------------------------------------------------ */

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay: i * 0.15, ease: "easeOut" },
  }),
};

const staggerContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.15 } },
};

const scaleIn: Variants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: (i: number = 0) => ({
    opacity: 1,
    scale: 1,
    transition: { duration: 0.5, delay: i * 0.12, ease: "easeOut" },
  }),
};

/* ------------------------------------------------------------------ */
/*  Scroll-triggered section wrapper                                   */
/* ------------------------------------------------------------------ */

function Section({
  children,
  className,
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-80px" });
  return (
    <motion.section
      ref={ref}
      id={id}
      initial="hidden"
      animate={inView ? "visible" : "hidden"}
      variants={staggerContainer}
      className={cn("relative w-full", className)}
    >
      {children}
    </motion.section>
  );
}

/* ================================================================== */
/*  PAGE                                                               */
/* ================================================================== */

export default function Home() {
  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <Navbar />
      <Hero />
      <HowItWorks />
      <TrustSection />
      <FinalCta />
      <Footer />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  1. NAVBAR                                                          */
/* ------------------------------------------------------------------ */

function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const { telegramConnected, connectTelegram, disconnectTelegram } = useSwitches();
  const [telegramToast, setTelegramToast] = useState(false);
  const { connected } = useWallet();
  const { setVisible } = useWalletModal();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <nav
        className={cn(
          "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
          scrolled
            ? "bg-card/60 backdrop-blur-xl shadow-lg shadow-black/20"
            : "bg-transparent"
        )}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold text-gradient select-none">
            Dead Man&apos;s Switch
          </Link>
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (telegramConnected) {
                  disconnectTelegram();
                } else {
                  connectTelegram();
                  setTelegramToast(true);
                  setTimeout(() => setTelegramToast(false), 3000);
                }
              }}
              className={cn(
                "hidden sm:inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors",
                telegramConnected
                  ? "bg-success/10 text-success border border-success/20"
                  : "border border-white/[0.12] text-secondary hover:text-white hover:border-white/[0.25]"
              )}
            >
              {telegramConnected ? <Check className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />}
              {telegramConnected ? "Telegram Connected" : "Connect Telegram"}
            </button>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-solana-gradient text-sm font-semibold text-white transition-transform hover:scale-105 active:scale-95"
            >
              Launch App
            </Link>
          </div>
        </div>
      </nav>

      {/* Telegram toast */}
      {telegramToast && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          className="fixed top-20 right-4 z-50 bg-[#141821] border border-success/20 shadow-2xl shadow-black/50 px-5 py-3 rounded-xl flex items-center gap-3"
        >
          <Check className="w-5 h-5 text-success" />
          <div>
            <p className="text-sm font-medium text-white">Telegram Connected</p>
            <p className="text-xs text-secondary">You&apos;ll receive warnings before your switch executes.</p>
          </div>
        </motion.div>
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  2. HERO                                                            */
/* ------------------------------------------------------------------ */

function Hero() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true });
  const { connected } = useWallet();
  const { setVisible } = useWalletModal();

  return (
    <section
      ref={ref}
      className="relative pt-32 pb-20 sm:pt-40 sm:pb-28 lg:pt-48 lg:pb-36 overflow-hidden"
    >
      {/* Ambient glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-accent/15 rounded-full blur-[180px] pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-[400px] h-[400px] bg-accent-cyan/10 rounded-full blur-[140px] pointer-events-none" />

      <motion.div
        initial="hidden"
        animate={inView ? "visible" : "hidden"}
        variants={staggerContainer}
        className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center"
      >
        <motion.h1
          variants={fadeUp}
          custom={0}
          className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight tracking-tight"
        >
          Your wallet.{" "}
          <span className="text-gradient">Your final wish.</span>
          <br />
          Executed automatically.
        </motion.h1>

        <motion.p
          variants={fadeUp}
          custom={1}
          className="mt-6 text-lg sm:text-xl text-secondary max-w-2xl mx-auto leading-relaxed"
        >
          Set up a dead man&apos;s switch for your Solana assets. If you go
          silent, your crypto goes where you want it to.
        </motion.p>

        <motion.div variants={fadeUp} custom={2} className="mt-10">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2.5 px-8 py-4 rounded-full bg-solana-gradient text-lg font-semibold text-white transition-transform hover:scale-105 active:scale-95 shadow-lg shadow-accent/20"
          >
            Go to Dashboard
            <ChevronRight className="w-5 h-5" />
          </Link>
        </motion.div>

        <motion.div
          variants={fadeUp}
          custom={3}
          className="mt-16 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl mx-auto"
        >
          {[
            { icon: Shield, value: "-- SOL", label: "Protected" },
            { icon: ToggleRight, value: "0", label: "Switches Active" },
            { icon: CheckCircle, value: "0", label: "Executed" },
          ].map((stat) => (
            <div
              key={stat.label}
              className="glass-hover p-5 flex flex-col items-center gap-2"
            >
              <stat.icon className="w-5 h-5 text-accent-cyan" />
              <p className="text-2xl font-bold text-white">{stat.value}</p>
              <p className="text-xs text-muted uppercase tracking-wider">
                {stat.label}
              </p>
            </div>
          ))}
        </motion.div>
      </motion.div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  3. HOW IT WORKS                                                    */
/* ------------------------------------------------------------------ */

function HowItWorks() {
  const steps = [
    {
      icon: Lock,
      title: "Lock Your Assets",
      desc: "Deposit SOL into a secure on-chain vault controlled by your smart contract.",
    },
    {
      icon: Clock,
      title: "Set Your Timer",
      desc: "Choose how long your silence means something\u2019s wrong. 30, 60, 90, or 180 days.",
    },
    {
      icon: Heart,
      title: "Protect Your People",
      desc: "Your assets transfer automatically to the wallet you choose. No middleman.",
    },
  ];

  return (
    <Section className="py-20 sm:py-28">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.h2
          variants={fadeUp}
          custom={0}
          className="text-3xl sm:text-4xl font-bold text-center mb-4"
        >
          How It Works
        </motion.h2>
        <motion.p
          variants={fadeUp}
          custom={1}
          className="text-secondary text-center max-w-xl mx-auto mb-14"
        >
          Three simple steps to protect the people you love.
        </motion.p>

        <div className="grid sm:grid-cols-3 gap-6">
          {steps.map((step, i) => (
            <motion.div
              key={step.title}
              variants={scaleIn}
              custom={i}
              className="glass-hover p-8 flex flex-col items-center text-center"
            >
              <div className="w-14 h-14 rounded-full bg-solana-gradient flex items-center justify-center mb-5">
                <step.icon className="w-6 h-6 text-white" />
              </div>
              <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
              <p className="text-secondary text-sm leading-relaxed">
                {step.desc}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/*  4. TRUST SECTION                                                   */
/* ------------------------------------------------------------------ */

function TrustSection() {
  const features = [
    {
      icon: Shield,
      title: "Non-custodial",
      desc: "Your keys, your crypto. Always.",
    },
    {
      icon: LinkIcon,
      title: "On-chain Execution",
      desc: "Every action is verifiable on Solana.",
    },
    {
      icon: Bot,
      title: "Agent Monitored",
      desc: "A tireless agent watches and executes.",
    },
    {
      icon: MessageCircle,
      title: "Telegram Warnings",
      desc: "You\u2019ll be warned before anything executes.",
    },
  ];

  return (
    <Section className="py-20 sm:py-28 bg-background-alt">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.h2
          variants={fadeUp}
          custom={0}
          className="text-3xl sm:text-4xl font-bold text-center mb-4"
        >
          Built on Trust, Not Promises
        </motion.h2>
        <motion.p
          variants={fadeUp}
          custom={1}
          className="text-secondary text-center max-w-xl mx-auto mb-14"
        >
          Security isn&apos;t a feature. It&apos;s the foundation.
        </motion.p>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((f, i) => (
            <motion.div
              key={f.title}
              variants={scaleIn}
              custom={i}
              className="glass-hover p-7 text-center"
            >
              <div className="w-12 h-12 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center mx-auto mb-4">
                <f.icon className="w-5 h-5 text-accent-cyan" />
              </div>
              <h3 className="font-semibold mb-1">{f.title}</h3>
              <p className="text-secondary text-sm">{f.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/*  5. FINAL CTA                                                       */
/* ------------------------------------------------------------------ */

function FinalCta() {
  return (
    <Section className="py-24 sm:py-36 relative overflow-hidden">
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-[600px] h-[600px] bg-accent/10 rounded-full blur-[180px]" />
      </div>
      <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <motion.h2
          variants={fadeUp}
          custom={0}
          className="text-3xl sm:text-5xl font-bold leading-tight mb-6"
        >
          Ready to Write Your{" "}
          <span className="text-gradient">Final Instructions</span>?
        </motion.h2>
        <motion.p
          variants={fadeUp}
          custom={1}
          className="text-secondary text-lg mb-10"
        >
          It takes less than 2 minutes.
        </motion.p>
        <motion.div variants={fadeUp} custom={2}>
          <Link
            href="/create"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-solana-gradient font-semibold text-white text-lg transition-transform hover:scale-105 active:scale-95"
          >
            Get Started
            <ChevronRight className="w-5 h-5" />
          </Link>
        </motion.div>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/*  6. FOOTER                                                          */
/* ------------------------------------------------------------------ */

function Footer() {
  return (
    <footer className="py-10 border-t border-white/[0.06]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <span className="text-gradient font-bold select-none">
          Dead Man&apos;s Switch
        </span>
        <span className="text-muted text-sm">
          &copy; {new Date().getFullYear()} Dead Man&apos;s Switch. All rights
          reserved.
        </span>
      </div>
    </footer>
  );
}
