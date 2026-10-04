import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://arcade.arborealplanet.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "Arboreal Arcade", template: "%s · Arboreal Arcade" },
  description:
    "Play Arboreal Keeper, Snake Poker, Reptile Trivia, Canopy Hunter and other reptile-themed games in the Arboreal Arcade.",
  applicationName: "Arboreal Arcade",
  openGraph: {
    title: "Arboreal Arcade",
    description:
      "Play Arboreal Keeper, Snake Poker, Reptile Trivia, Canopy Hunter and other reptile-themed games in the Arboreal Arcade.",
    siteName: "Arboreal Arcade",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Arboreal Arcade",
    description:
      "Play Arboreal Keeper, Snake Poker, Reptile Trivia, Canopy Hunter and other reptile-themed games in the Arboreal Arcade.",
  },
  appleWebApp: {
    capable: true,
    title: "Arboreal Arcade",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#06100c",
  colorScheme: "dark",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
      <body>{children}</body>
    </html>
  );
}
