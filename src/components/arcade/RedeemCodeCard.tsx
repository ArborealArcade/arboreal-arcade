"use client";

import { useState } from "react";
import Link from "next/link";
import { addTokens } from "@/lib/arcade";

type RedeemResult = {
  ok?: boolean;
  kind?: string;
  amount?: number | null;
  value?: string | null;
  label?: string;
  error?: string;
};

/**
 * Event code redemption card for the Arcade page. Players enter a code the
 * owner hands out during events; the server (redeem_event_code RPC) enforces
 * one claim per account, active windows, and claim caps, then grants the
 * reward — Keeper cash/enclosures land in the cloud save, token rewards are
 * credited to the local arcade wallet here after the claim is recorded.
 */
export function RedeemCodeCard() {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [needsSignIn, setNeedsSignIn] = useState(false);

  async function redeem(event: React.FormEvent) {
    event.preventDefault();
    const entered = code.trim();
    if (!entered || busy) return;
    setBusy(true);
    setNotice(null);
    setNeedsSignIn(false);
    try {
      const response = await fetch("/api/arcade/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: entered }),
      });
      const result = (await response.json().catch(() => null)) as RedeemResult | null;
      if (response.status === 401) {
        setNeedsSignIn(true);
        setNotice({ tone: "err", text: "Sign in to redeem — event codes are one per keeper account." });
        return;
      }
      if (!result?.ok) {
        setNotice({ tone: "err", text: result?.error || "That code could not be redeemed." });
        return;
      }
      const label = result.label || "Event reward";
      if (result.kind === "tokens" && typeof result.amount === "number" && result.amount > 0) {
        addTokens(result.amount, `Event code — ${label}`, true);
        setNotice({ tone: "ok", text: `🎉 ${label} — ${result.amount} arcade tokens added to your wallet.` });
      } else if (result.kind === "cash") {
        setNotice({ tone: "ok", text: `🎉 ${label} — added to your Arboreal Keeper cash. Open the Keeper to see it.` });
      } else if (result.kind === "enclosure") {
        setNotice({ tone: "ok", text: `🎉 ${label} — your new enclosure is waiting in Arboreal Keeper.` });
      } else {
        setNotice({ tone: "ok", text: `🎉 ${label} — claimed!` });
      }
      setCode("");
    } catch {
      setNotice({ tone: "err", text: "Could not reach the arcade. Please try again." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-3xl border border-amber-200/15 bg-gradient-to-b from-amber-200/[.06] to-transparent p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-lg font-semibold text-white">Redeem an event code</h3>
        <span className="text-[10px] font-bold uppercase tracking-[.16em] text-amber-100/50">One per keeper</span>
      </div>
      <p className="mt-2 max-w-xl text-sm leading-6 text-white/50">
        Got a code from an Arboreal Planet event? Enter it here for Keeper cash, arcade tokens, or a bonus enclosure.
      </p>
      <form onSubmit={redeem} className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input
          value={code}
          onChange={(event) => setCode(event.target.value.toUpperCase())}
          placeholder="ENTER CODE"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={60}
          className="w-full flex-1 rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm font-bold uppercase tracking-[.2em] text-amber-50 placeholder:text-white/25 focus:border-amber-200/40 focus:outline-none"
        />
        <button
          type="submit"
          disabled={busy || !code.trim()}
          className="shrink-0 rounded-2xl bg-amber-300 px-5 py-3 text-sm font-black text-black transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Checking…" : "Redeem"}
        </button>
      </form>
      {notice ? (
        <p
          role="status"
          className={`mt-3 text-sm leading-6 ${notice.tone === "ok" ? "text-emerald-200" : "text-red-200"}`}
        >
          {notice.text}{" "}
          {needsSignIn ? (
            <Link href="/login" className="font-bold text-amber-100 underline underline-offset-4">
              Sign in
            </Link>
          ) : null}
        </p>
      ) : null}
    </div>
  );
}
