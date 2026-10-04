import { ArcadeTransition } from "@/components/ArcadeTransition";

export default async function ArcadeEntryPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const requested = (await searchParams).next;
  const destination = requested === "/arcade/chondro-breeder" ? "/arcade/chondro-breeder" : "/arcade";
  return <ArcadeTransition destination={destination} />;
}
