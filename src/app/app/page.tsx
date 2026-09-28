import type { Metadata } from "next";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { Dashboard } from "@/components/app/Dashboard";
import { WalletButton } from "@/components/app/WalletButton";

export const metadata: Metadata = {
  title: "App",
  description: "Your claimable rewards, current multiplier and time to the next milestone — read from the STAYR rewards contract.",
};

export default function AppPage() {
  return (
    <>
      <Nav action={<WalletButton />} />
      <main className="flex-1">
        <Dashboard />
      </main>
      <Footer />
    </>
  );
}
