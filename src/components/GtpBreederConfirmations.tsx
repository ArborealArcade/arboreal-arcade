"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Animal = { id: string; registryCode?: string; name: string; breederId?: string; visibility?: "private" | "public" };
type Confirmation = {
  request_id: string;
  animal_id: string;
  registry_code: string | null;
  animal_name: string;
  requester_username: string | null;
  requester_display_name: string | null;
  breeder_username: string | null;
  breeder_display_name: string | null;
  confirmation_status: string;
  created_at: string;
};

export function GtpBreederConfirmations() {
  const [animals, setAnimals] = useState<Animal[]>([]);
  const [requests, setRequests] = useState<Confirmation[]>([]);
  const [animalId, setAnimalId] = useState("");
  const [producerUsername, setProducerUsername] = useState("");
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [checkFailed, setCheckFailed] = useState(false);
  const [status, setStatus] = useState("Checking producer confirmations…");
  const [busy, setBusy] = useState(false);

  async function load() {
    setCheckFailed(false);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    try {
      const [animalsResponse, requestsResponse] = await Promise.all([
        fetch("/api/genetics/pedigree", { cache: "no-store", signal: controller.signal }),
        fetch("/api/genetics/pedigree/confirmations", { cache: "no-store", signal: controller.signal }),
      ]);
      if (animalsResponse.status === 401 || requestsResponse.status === 401) {
        setSignedIn(false);
        setStatus("Sign in to request or respond to producer confirmations.");
        return;
      }
      const animalData = await animalsResponse.json().catch(() => null) as { animals?: Animal[]; error?: string } | null;
      const requestData = await requestsResponse.json().catch(() => null) as { requests?: Confirmation[]; error?: string } | null;
      if (!animalsResponse.ok) throw new Error(animalData?.error || "Could not load your pedigree animals.");
      if (!requestsResponse.ok) throw new Error(requestData?.error || "Could not load confirmation requests.");
      const nextAnimals = Array.isArray(animalData?.animals) ? animalData.animals : [];
      const nextRequests = Array.isArray(requestData?.requests) ? requestData.requests : [];
      setAnimals(nextAnimals);
      setRequests(nextRequests);
      setSignedIn(true);
      if (!animalId && nextAnimals.length) setAnimalId(nextAnimals[0].id);
      const pending = nextRequests.filter((request) => request.confirmation_status === "pending").length;
      setStatus(pending ? `${pending} pending producer confirmation request${pending === 1 ? "" : "s"}.` : "No pending producer confirmations.");
    } catch (error) {
      setSignedIn(null);
      if (error instanceof DOMException && error.name === "AbortError") {
        setStatus("The sign-in check timed out. Check your connection and try again.");
      } else {
        setStatus(error instanceof Error ? error.message : "Could not load producer confirmations.");
      }
      setCheckFailed(true);
    } finally {
      window.clearTimeout(timeout);
    }
  }

  useEffect(() => { void load(); }, []);

  const ownIds = useMemo(() => new Set(animals.map((animal) => animal.id)), [animals]);
  const incoming = requests.filter((request) => request.confirmation_status === "pending" && !ownIds.has(request.animal_id));
  const outgoing = requests.filter((request) => request.confirmation_status === "pending" && ownIds.has(request.animal_id));
  const history = requests.filter((request) => request.confirmation_status !== "pending").slice(0, 14);

  async function createRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!animalId || !producerUsername.trim()) return;
    setBusy(true);
    setStatus("Sending producer confirmation request…");
    try {
      const response = await fetch("/api/genetics/pedigree/confirmations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ animalId, breederUsername: producerUsername.trim() }),
      });
      const data = await response.json().catch(() => null) as { error?: string; detail?: unknown } | null;
      if (!response.ok) throw new Error(data?.error || "Could not send confirmation request.");
      setProducerUsername("");
      await load();
      setStatus("Producer confirmation request sent. You can request another co-producer separately if needed.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not send confirmation request.");
    } finally {
      setBusy(false);
    }
  }

  async function act(requestId: string, action: "confirm" | "decline" | "cancel") {
    setBusy(true);
    try {
      const response = await fetch("/api/genetics/pedigree/confirmations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, action }),
      });
      const data = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(data?.error || "Could not update confirmation request.");
      await load();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not update confirmation request.");
    } finally {
      setBusy(false);
    }
  }

  return <section className="panel rounded-[26px] p-5 sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-4"><div><div className="section-kicker">Producer confirmation</div><h2 className="mt-2 text-xl font-semibold text-white/80">Ask a producer or co-producer to confirm the record.</h2><p className="mt-2 max-w-3xl text-xs leading-5 text-white/40">Each producer must actively confirm from their own Arboreal Planet account. An animal can have multiple confirmed producers for partnerships or co-produced clutches. Producer confirmation does not transfer ownership and does not independently prove geographic locality.</p></div><span className="rounded-full border border-white/[.08] px-3 py-1.5 text-[10px] font-bold text-white/42">{signedIn ? "ACCOUNT LINKED" : signedIn === false ? "SIGN IN REQUIRED" : checkFailed ? "CHECK FAILED" : "CHECKING"}</span></div>
    {checkFailed ? (
      <div role="alert" className="mt-4 rounded-xl border border-red-300/20 bg-red-500/[.07] p-3">
        <p className="text-xs font-bold text-red-100/85">Couldn&apos;t check your sign-in status.</p>
        <p className="mt-1 text-xs leading-5 text-white/45">{status}</p>
        <button type="button" onClick={() => void load()} className="mt-3 rounded-xl border border-white/[.12] px-4 py-2 text-xs font-bold text-white/75 transition hover:border-white/25 hover:text-white">Retry</button>
      </div>
    ) : (
      <div role="status" className="mt-4 rounded-xl border border-white/[.06] bg-black/10 p-3 text-xs text-white/45">{status}</div>
    )}

    {signedIn === false ? <Link href="/login?next=/genetics" className="primary-action mt-4 inline-block !min-h-0 !px-4 !py-2.5 !text-xs">Sign in</Link> : signedIn ? <>
      <form onSubmit={createRequest} className="mt-5 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
        <label className="text-[10px] font-bold uppercase tracking-[.1em] text-white/28">Your animal<select value={animalId} onChange={(event) => setAnimalId(event.target.value)} className="mt-2 w-full rounded-xl border border-white/[.08] bg-[#08130e] p-3 text-xs normal-case tracking-normal text-white/65">{animals.length ? animals.map((animal) => <option key={animal.id} value={animal.id}>{animal.name}{animal.registryCode ? ` · ${animal.registryCode}` : ""}</option>) : <option value="">No cloud pedigree animals</option>}</select></label>
        <label className="text-[10px] font-bold uppercase tracking-[.1em] text-white/28">Producer username<input value={producerUsername} onChange={(event) => setProducerUsername(event.target.value)} placeholder="@username" className="mt-2 w-full rounded-xl border border-white/[.08] bg-black/20 p-3 text-sm normal-case tracking-normal text-white/70" /></label>
        <button disabled={busy || !animals.length || !producerUsername.trim()} className="self-end rounded-xl bg-emerald-300 px-4 py-3 text-xs font-black text-[#06100c] disabled:opacity-35">Request confirmation</button>
      </form>
      <p className="mt-2 text-[10px] leading-5 text-white/25">For a co-produced animal, send a separate request to each producer account. There is no fixed producer limit.</p>

      {incoming.length ? <div className="mt-6"><div className="text-[10px] font-black uppercase tracking-[.13em] text-amber-200/60">Requests for you to confirm</div><div className="mt-3 grid gap-3 md:grid-cols-2">{incoming.map((request) => <div key={request.request_id} className="panel-soft rounded-2xl p-4"><div className="font-semibold text-white/68">{request.animal_name}</div><div className="mt-1 font-mono text-[10px] text-emerald-200/45">{request.registry_code}</div><div className="mt-3 text-xs text-white/38">Requested by {request.requester_display_name || request.requester_username || "keeper"}</div><div className="mt-4 flex gap-2"><button disabled={busy} onClick={() => void act(request.request_id, "confirm")} className="rounded-xl bg-emerald-300 px-3 py-2 text-[10px] font-black text-[#06100c] disabled:opacity-35">Confirm I produced / co-produced this animal</button><button disabled={busy} onClick={() => void act(request.request_id, "decline")} className="rounded-xl border border-white/[.08] px-3 py-2 text-[10px] font-bold text-white/48 disabled:opacity-35">Decline</button></div></div>)}</div></div> : null}

      {outgoing.length ? <div className="mt-6"><div className="text-[10px] font-black uppercase tracking-[.13em] text-white/30">Waiting for producer</div><div className="mt-3 space-y-2">{outgoing.map((request) => <div key={request.request_id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[.055] p-3 text-xs"><div><span className="font-semibold text-white/58">{request.animal_name}</span><span className="ml-2 text-white/28">→ @{request.breeder_username || "producer"}</span></div><button disabled={busy} onClick={() => void act(request.request_id, "cancel")} className="text-[10px] font-bold text-red-200/55 disabled:opacity-35">Cancel request</button></div>)}</div></div> : null}

      {history.length ? <details className="mt-5 rounded-2xl border border-white/[.055] p-4"><summary className="cursor-pointer text-xs font-semibold text-white/45">Confirmation history</summary><div className="mt-3 space-y-2">{history.map((request) => <div key={request.request_id} className="flex justify-between gap-3 text-xs text-white/35"><span>{request.animal_name} · {request.breeder_display_name || request.breeder_username || "producer"}</span><span className="uppercase">{request.confirmation_status}</span></div>)}</div></details> : null}
    </> : null}
  </section>;
}
