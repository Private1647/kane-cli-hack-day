import { hackathon } from "@/data/hackathon";

export default function Footer() {
  return (
    <footer className="border-t border-white/10 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-sm text-zinc-500 sm:flex-row">
        <p>
          © {hackathon.year} {hackathon.name}. All rights reserved.
        </p>
        <div className="flex gap-6">
          <a href="#" className="hover:text-white">Code of conduct</a>
          <a href="#" className="hover:text-white">Contact</a>
          <a href="#" className="hover:text-white">Twitter</a>
        </div>
      </div>
    </footer>
  );
}
