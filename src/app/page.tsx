import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";
import { Hero } from "@/components/landing/Hero";
import { Mechanism } from "@/components/landing/Mechanism";
import { Example } from "@/components/landing/Example";
import { Transparency } from "@/components/landing/Transparency";
import { Verify } from "@/components/landing/Verify";
import { FinalCta } from "@/components/landing/FinalCta";

export default function LandingPage() {
  return (
    <>
      <Nav />
      <main className="flex-1">
        <Hero />
        <Mechanism />
        <Example />
        <Transparency />
        <Verify />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
