"use client";

import { ArborealKeeperProgressionStrip } from "@/components/ArborealKeeperProgressionStrip";
import { ArborealKeeperSpeciesPrograms } from "@/components/ArborealKeeperSpeciesPrograms";

export function ArborealKeeperProgramHub() {
  return (
    <section className="mt-4 border-y border-white/[.055] bg-[#030806] py-4 sm:py-5">
      <div className="mx-auto max-w-[1500px] px-3 sm:px-5">
        <div className="overflow-hidden rounded-[28px] border border-emerald-300/10 bg-[#05100b] shadow-[0_24px_70px_rgba(0,0,0,.24)]">
          <div className="border-b border-white/[.055] p-4 sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <div className="text-[9px] font-black uppercase tracking-[.19em] text-emerald-200/52">Arboreal Keeper</div>
                <h1 className="mt-2 text-2xl font-semibold tracking-[-.04em] text-white sm:text-3xl">Your Green Tree Python program</h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-white/44">
                  Manage your Green Tree Python breeding program, progression and collection from one place.
                </p>
              </div>
              <div className="rounded-full border border-white/[.06] bg-black/20 px-3 py-1.5 text-[9px] font-black uppercase tracking-[.13em] text-white/38">
                Individual housing
              </div>
            </div>
          </div>

          <div className="p-4 sm:p-5">
            <ArborealKeeperProgressionStrip />
            <ArborealKeeperSpeciesPrograms />
          </div>
        </div>
      </div>
    </section>
  );
}
