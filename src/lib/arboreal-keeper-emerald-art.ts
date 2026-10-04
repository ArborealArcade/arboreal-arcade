import type { CSSProperties } from "react";
import type { KeeperLifeStage, KeeperPhase, KeeperSpeciesId } from "@/lib/arboreal-keeper-species";

// Use shipped species artwork until the full atlas is available.
const EMERALD_ART_BASE = "/hatchery/animals/emerald-tree-boas";
function emeraldImageForAsset(asset: EmeraldArt) {
  if (asset.speciesId === "northern_emerald_tree_boa") {
    return `${EMERALD_ART_BASE}/northern/northern-sprite.webp`;
  }
  return asset.stage === "neonate"
    ? `${EMERALD_ART_BASE}/amazon-basin/neonate-sprite.webp`
    : `${EMERALD_ART_BASE}/amazon-basin/later-sprite.webp`;
}

type EmeraldSpeciesId = Extract<KeeperSpeciesId, "northern_emerald_tree_boa" | "amazon_basin_emerald_tree_boa">;
type EmeraldArt = {
  id: string;
  speciesId: EmeraldSpeciesId;
  stage: KeeperLifeStage;
  phase: KeeperPhase;
  cell: number;
  neonateColor?: string;
  weight?: number;
};

export const EMERALD_ART: EmeraldArt[] = [
  { id: "etb-northern-neonate-red-01-v3", speciesId: "northern_emerald_tree_boa", stage: "neonate", phase: "standard", neonateColor: "red", cell: 0 },
  { id: "etb-northern-neonate-red-02-v3", speciesId: "northern_emerald_tree_boa", stage: "neonate", phase: "standard", neonateColor: "red", cell: 1 },
  { id: "etb-northern-neonate-red-03-v3", speciesId: "northern_emerald_tree_boa", stage: "neonate", phase: "standard", neonateColor: "red", cell: 3 },
  { id: "etb-northern-anaconda-neonate-v3", speciesId: "northern_emerald_tree_boa", stage: "neonate", phase: "anaconda", neonateColor: "green", cell: 2 },
  { id: "etb-northern-anaconda-subadult-v3", speciesId: "northern_emerald_tree_boa", stage: "subadult", phase: "anaconda", cell: 2 },
  { id: "etb-northern-subadult-01-v3", speciesId: "northern_emerald_tree_boa", stage: "subadult", phase: "standard", cell: 4 },
  { id: "etb-northern-subadult-02-v3", speciesId: "northern_emerald_tree_boa", stage: "subadult", phase: "standard", cell: 5 },
  { id: "etb-northern-adult-rare-01-v3", speciesId: "northern_emerald_tree_boa", stage: "adult", phase: "standard", cell: 6, weight: 6 },
  { id: "etb-northern-adult-common-01-v3", speciesId: "northern_emerald_tree_boa", stage: "adult", phase: "standard", cell: 8, weight: 47 },
  { id: "etb-northern-adult-common-02-v3", speciesId: "northern_emerald_tree_boa", stage: "adult", phase: "standard", cell: 9, weight: 47 },
  { id: "etb-northern-anaconda-adult-v3", speciesId: "northern_emerald_tree_boa", stage: "adult", phase: "anaconda", cell: 7 },
  { id: "etb-basin-neonate-01-v3", speciesId: "amazon_basin_emerald_tree_boa", stage: "neonate", phase: "standard", cell: 10 },
  { id: "etb-basin-neonate-02-v3", speciesId: "amazon_basin_emerald_tree_boa", stage: "neonate", phase: "standard", cell: 11 },
  { id: "etb-basin-neonate-03-v3", speciesId: "amazon_basin_emerald_tree_boa", stage: "neonate", phase: "standard", cell: 12 },
  { id: "etb-basin-neonate-04-v3", speciesId: "amazon_basin_emerald_tree_boa", stage: "neonate", phase: "standard", cell: 13 },
  { id: "etb-basin-neonate-05-v3", speciesId: "amazon_basin_emerald_tree_boa", stage: "neonate", phase: "standard", cell: 14 },
  { id: "etb-basin-subadult-01-v3", speciesId: "amazon_basin_emerald_tree_boa", stage: "subadult", phase: "standard", cell: 15 },
  { id: "etb-basin-subadult-02-v3", speciesId: "amazon_basin_emerald_tree_boa", stage: "subadult", phase: "standard", cell: 16 },
  { id: "etb-basin-adult-01-v3", speciesId: "amazon_basin_emerald_tree_boa", stage: "adult", phase: "standard", cell: 17 },
  { id: "etb-basin-adult-02-v3", speciesId: "amazon_basin_emerald_tree_boa", stage: "adult", phase: "standard", cell: 18 },
  { id: "etb-basin-adult-03-v3", speciesId: "amazon_basin_emerald_tree_boa", stage: "adult", phase: "standard", cell: 19 },
];

const BY_ID = new Map(EMERALD_ART.map((asset) => [asset.id, asset]));

function emeraldStyleForAsset(asset: EmeraldArt): CSSProperties {
  return {
    backgroundImage: `url("${emeraldImageForAsset(asset)}")`,
    backgroundRepeat: "no-repeat",
    backgroundSize: "contain",
    backgroundPosition: "center",
  };
}

export function emeraldArtStyle(assetId: string | null | undefined): CSSProperties | null {
  if (!assetId) return null;
  const asset = BY_ID.get(assetId);
  return asset ? emeraldStyleForAsset(asset) : null;
}

export function emeraldArtStyleForAnimal(
  speciesId: EmeraldSpeciesId,
  stage: KeeperLifeStage,
  phase: KeeperPhase,
  neonateColor: string | null | undefined,
  assetId: string | null | undefined,
): CSSProperties | null {
  const exact = assetId ? BY_ID.get(assetId) : undefined;
  if (exact && exact.speciesId === speciesId && exact.stage === stage && exact.phase === phase) {
    return emeraldStyleForAsset(exact);
  }

  let pool = EMERALD_ART.filter(
    (asset) => asset.speciesId === speciesId && asset.stage === stage && asset.phase === phase,
  );
  if (neonateColor) {
    const colorPool = pool.filter((asset) => !asset.neonateColor || asset.neonateColor === neonateColor);
    if (colorPool.length) pool = colorPool;
  }
  const fallback = pool[0];
  return fallback ? emeraldStyleForAsset(fallback) : null;
}

export function emeraldArtForAnimal(
  speciesId: EmeraldSpeciesId,
  stage: KeeperLifeStage,
  phase: KeeperPhase,
  neonateColor: string | null,
  random: () => number,
) {
  let pool = EMERALD_ART.filter((asset) => asset.speciesId === speciesId && asset.stage === stage && asset.phase === phase);
  if (neonateColor) {
    const colorPool = pool.filter((asset) => !asset.neonateColor || asset.neonateColor === neonateColor);
    if (colorPool.length) pool = colorPool;
  }
  if (!pool.length) return null;
  const weighted = pool.some((asset) => asset.weight);
  if (weighted) {
    const total = pool.reduce((sum, asset) => sum + (asset.weight ?? 0), 0);
    let roll = random() * total;
    for (const asset of pool) {
      roll -= asset.weight ?? 0;
      if (roll < 0) return asset;
    }
  }
  return pool[Math.floor(random() * pool.length)] ?? pool[0] ?? null;
}
