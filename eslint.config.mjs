import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: [
      "src/components/ChondroBreederGame.tsx",
      "src/components/ChondroBreederGameV3.tsx",
      "src/components/ChondroShowsPanel.tsx",
      "src/components/ChondroRealtimeProgression.tsx",
      "src/components/ChondroRoomExpansionPanel.tsx",
    ],
    rules: {
      "react-hooks/purity": "off",
    },
  },
  {
    files: [
      "src/components/ChondroBreederSocial.tsx",
      "src/components/ChondroBreederFacility.tsx",
      "src/components/ChondroBreederExpandedShop.tsx",
      "src/components/ChondroBreederLines.tsx",
      "src/components/ChondroConservationPartnerships.tsx",
      "src/components/ChondroCareerSystemsPanel.tsx",
      "src/components/ChondroFavoritesMarketPanel.tsx",
      "src/components/ChondroShowsPanel.tsx",
      "src/components/ChondroTraitFocusPanel.tsx",
      "src/components/ChondroRealtimeProgression.tsx",
      "src/components/ChondroRoomExpansionPanel.tsx",
      "src/components/AdminGtpPedigreeReports.tsx",
      "src/components/GtpBreederConfirmations.tsx",
      "src/components/GtpFamilyTreeMaker.tsx",
      "src/components/GtpFamilyTreeMakerV2.tsx",
      "src/components/GtpPairingClutchManager.tsx",
      "src/components/GtpPairingRecords.tsx",
      "src/components/GtpPedigreeCloudSync.tsx",
      "src/components/GtpPedigreePublishing.tsx",
      "src/components/GtpPedigreeTransfers.tsx",
      "src/components/GtpPublicLineageDatabase.tsx",
      "src/components/GtpRegisteredParentLinker.tsx",
    ],
    rules: {
      "react-hooks/set-state-in-effect": "off",
      "react-hooks/exhaustive-deps": "off",
      "react/no-unescaped-entities": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Compiled test output (tsc -> node --test); never linted.
    ".test-dist/**",
  ]),
]);

export default eslintConfig;