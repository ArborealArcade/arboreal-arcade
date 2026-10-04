"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { addTokens, getTokenBalance } from "@/lib/arcade";
import { BAILOUT_THRESHOLD, BAILOUT_TOPUP, CONVERT_KEEP_MIN, CONVERT_MAX, CONVERT_RATE } from "@/components/poker/useBankroll";
import { playSfx, unlockAudio } from "@/lib/poker/sfx";

const CHUNKS = [500, 1000, 2500];

interface Props {
  balance: number;
  loading: boolean;
  signedIn: boolean | null;
  convert: (amount: number) => Promise<number>;
  claimBailout: () => Promise<number>;
}

export function PokerCashier({ balance, loading, signedIn, convert, claimBailout }: Props) {
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState<number | null>(null);
  const [bailoutBusy, setBailoutBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [tokenBalance, setTokenBalance] = useState(() => getTokenBalance());

  useEffect(() => {
    const sync = () => setTokenBalance(getTokenBalance());
    window.addEventListener("arcade-balance", sync);
    return () => window.removeEventListener("arcade-balance", sync);
  }, []);

  const doConvert = async (amount: number) => {
    setMsg(null);
    setBusy(amount);
    try {
      unlockAudio();
      await convert(amount);
      const tokens = Math.floor(amount / CONVERT_RATE);
      addTokens(tokens, `Poker cashier — converted ${amount.toLocaleString()} lifesap`);
      playSfx("win");
      setMsg({ ok: true, text: `Converted ${amount.toLocaleString()} lifesap → +${tokens} 🪙 tokens.` });
      setCustom("");
    } catch (e) {
      playSfx("lose");
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Conversion failed." });
    } finally {
      setBusy(null);
    }
  };

  const customAmount = Math.floor(Number(custom));
  const customValid =
    Number.isFinite(customAmount) &&
    customAmount > 0 &&
    customAmount % CONVERT_RATE === 0 &&
    customAmount <= CONVERT_MAX &&
    balance - customAmount >= CONVERT_KEEP_MIN;

  const busted = signedIn === true && !loading && balance < BAILOUT_THRESHOLD;

  const doBailout = async () => {
    setMsg(null);
    setBailoutBusy(true);
    try {
      unlockAudio();
      await claimBailout();
      playSfx("win");
      setMsg({ ok: true, text: `Bailout claimed — back up to ${BAILOUT_TOPUP} lifesap. Get back on the felt!` });
    } catch (e) {
      playSfx("lose");
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Bailout failed." });
    } finally {
      setBailoutBusy(false);
    }
  };

  return (
    <div className="mt-4 rounded-2xl border border-amber-200/15 bg-black/45 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-amber-100">💱 Cashier — lifesap → arcade tokens</h2>
        <p className="text-xs text-emerald-100/60">
          {CONVERT_RATE} lifesap = 1 🪙 · you hold {tokenBalance.toLocaleString()} 🪙 · keeps{" "}
          {CONVERT_KEEP_MIN} in your stack
        </p>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {signedIn ? (
          <>
            {CHUNKS.map((c) => {
              const afford = !loading && balance - c >= CONVERT_KEEP_MIN;
              return (
                <button
                  key={c}
                  disabled={!afford || busy !== null}
                  onClick={() => void doConvert(c)}
                  className="rounded-full border border-amber-200/25 bg-amber-950/40 px-4 py-1.5 text-xs font-bold text-amber-100 transition hover:border-amber-200/60 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  {busy === c ? "Converting…" : `${c.toLocaleString()} → ${c / CONVERT_RATE} 🪙`}
                </button>
              );
            })}
            <div className="flex items-center gap-2">
              <input
                value={custom}
                onChange={(e) => setCustom(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder={`Custom (×${CONVERT_RATE})`}
                inputMode="numeric"
                className="w-32 rounded-full border border-emerald-200/20 bg-black/60 px-3 py-1.5 text-xs text-emerald-100 placeholder:text-emerald-100/30"
              />
              <button
                disabled={!customValid || busy !== null}
                onClick={() => void doConvert(customAmount)}
                className="rounded-full bg-emerald-500 px-4 py-1.5 text-xs font-bold text-black transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-35"
              >
                {busy === customAmount ? "…" : `Convert${customValid ? ` → ${customAmount / CONVERT_RATE} 🪙` : ""}`}
              </button>
            </div>
          </>
        ) : (
          <Link
            href="/enter"
            onClick={() => {
              unlockAudio();
              playSfx("click");
            }}
            className="rounded-full bg-emerald-500 px-4 py-1.5 text-xs font-bold text-black transition hover:bg-emerald-400"
          >
            Sign in to convert lifesap
          </Link>
        )}
      </div>
      {busted && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-red-300/25 bg-red-950/40 p-3">
          <p className="text-xs text-red-100/90">
            Busted! Claim today&apos;s bailout to get back in the game.
          </p>
          <button
            disabled={bailoutBusy}
            onClick={() => void doBailout()}
            className="rounded-full bg-emerald-500 px-4 py-1.5 text-xs font-bold text-black transition hover:bg-emerald-400 disabled:opacity-50"
          >
            {bailoutBusy ? "Claiming…" : `Claim ${BAILOUT_TOPUP} lifesap`}
          </button>
        </div>
      )}
      {msg && (
        <p className={`mt-2 text-xs ${msg.ok ? "text-emerald-300" : "text-red-300"}`}>{msg.text}</p>
      )}
      <p className="mt-2 text-[11px] text-emerald-100/40">
        Tokens spend across the whole arcade — Keeper expeditions, permits, and more.
      </p>
    </div>
  );
}
