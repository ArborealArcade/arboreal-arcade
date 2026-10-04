import { ARBOREAL_KEEPER_SPECIES_BY_ID } from "@/lib/arboreal-keeper-species";


export function ArborealKeeperSpeciesPrograms() {
  const species = ARBOREAL_KEEPER_SPECIES_BY_ID.green_tree_python;


  return (
    <section className="mt-4 rounded-[28px] border border-white/[.065] bg-[#030806] p-4 shadow-[0_20px_60px_rgba(0,0,0,.22)] sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[9px] font-black uppercase tracking-[.18em] text-emerald-200/50">Breeding program</div>
          <h2 className="mt-2 text-xl font-semibold tracking-[-.035em] text-white sm:text-2xl">Green Tree Pythons</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-white/45">
            The Arboreal Keeper game starts with the Green Tree Python program. Northern Emerald Tree Boas unlock at Keeper Level 8, and Amazon Basin Emerald Tree Boas unlock at Keeper Level 18.
          </p>
        </div>
        <div className="shrink-0 rounded-full border border-emerald-300/10 bg-emerald-300/[.04] px-3 py-1.5 text-[9px] font-black uppercase tracking-[.14em] text-emerald-100/55">
          Level {species.unlockLevel}
        </div>
      </div>


      <article className="mt-5 rounded-[24px] border border-emerald-300/12 bg-[#07110d] p-4">
        <div className="text-[9px] font-black uppercase tracking-[.14em] text-emerald-100/45">{species.scientificName}</div>
        <div className="mt-2 text-lg font-semibold text-white/82">{species.displayName}</div>
        <div className="mt-2 text-xs leading-5 text-white/40">
          Egg-laying · advanced care · locality, phenotype and lineage-focused breeding.
        </div>
      </article>
    </section>
  );
}
