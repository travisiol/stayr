import Link from "next/link";
import { Nav } from "@/components/Nav";
import { Footer } from "@/components/Footer";

export default function NotFound() {
  return (
    <>
      <Nav />
      <main className="flex flex-1 flex-col items-start justify-center">
        <div className="mx-auto w-full max-w-[1200px] px-5 py-24 sm:px-8">
        <p className="eyebrow">404</p>
        <h1 className="display-md mt-3 text-[clamp(34px,5vw,56px)]">Nothing here yet.</h1>
        <p className="lede mt-4">The page you asked for does not exist.</p>
        <Link href="/" className="btn btn-primary mt-8">
          Back to STAYR
        </Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
