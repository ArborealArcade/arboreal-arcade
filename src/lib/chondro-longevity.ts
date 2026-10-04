import type { BreedingProject } from "@/lib/chondro-progression";

export const CHONDRO_LONG_TERM_PROJECTS: BreedingProject[] = [
  {
    id: "yellow-blue-pulcher-90",
    name: "Pulcher Yellow × Blue Line",
    description: "Produce a pure Morelia azurea pulcher with both Yellow Retention and Blue at 90% or better.",
    rewardCash: 32000,
    rewardReputation: 900,
    target: {
      subspecies: "Morelia azurea pulcher",
      classification: "Pure",
      traits: { yellowRetention: 90, blueStripe: 90 },
    },
  },
  {
    id: "white-black-viridis-90",
    name: "Viridis White × Black Line",
    description: "Produce a pure Morelia viridis with both High White and High Black at 90% or better.",
    rewardCash: 32000,
    rewardReputation: 900,
    target: {
      subspecies: "Morelia viridis",
      classification: "Pure",
      traits: { highWhite: 90, highBlack: 90 },
    },
  },
  {
    id: "utaraensis-blue-white-95",
    name: "Extreme Utaraensis Project",
    description: "Produce a pure Morelia azurea utaraensis with Blue and High White at 95% or better.",
    rewardCash: 45000,
    rewardReputation: 1250,
    target: {
      subspecies: "Morelia azurea utaraensis",
      classification: "Pure",
      traits: { blueStripe: 95, highWhite: 95 },
    },
  },
  {
    id: "azurea-black-yellow-95",
    name: "Extreme Azurea Project",
    description: "Produce a pure Morelia azurea azurea with High Black and Yellow Retention at 95% or better.",
    rewardCash: 45000,
    rewardReputation: 1250,
    target: {
      subspecies: "Morelia azurea azurea",
      classification: "Pure",
      traits: { highBlack: 95, yellowRetention: 95 },
    },
  },
  {
    id: "f5-pure-program",
    name: "F5 Foundation Line",
    description: "Carry a pure breeding line to generation 5 or later.",
    rewardCash: 60000,
    rewardReputation: 1500,
    target: { classification: "Pure", generationAtLeast: 5 },
  },
  {
    id: "f7-red-line",
    name: "Seven-Generation Red Line",
    description: "Produce a generation 7 or later red neonate and keep the project going long enough to establish a true legacy line.",
    rewardCash: 90000,
    rewardReputation: 2200,
    target: { generationAtLeast: 7, neonateColor: "Red" },
  },
  {
    id: "elite-five-trait-85",
    name: "Five-Trait Masterpiece",
    description: "Produce an animal with every tracked trait at 85% or higher.",
    rewardCash: 125000,
    rewardReputation: 3000,
    target: {
      traits: {
        highBlack: 85,
        highWhite: 85,
        blueStripe: 85,
        yellowRetention: 85,
        blotches: 85,
      },
    },
  },
];
