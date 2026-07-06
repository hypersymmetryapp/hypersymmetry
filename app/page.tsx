import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function Landing() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/app");

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 text-center" style={{ background: "#000" }}>
      <h1 className="font-mono font-bold text-4xl sm:text-5xl text-white tracking-tight">
        hypersymmetry
      </h1>
      <p className="font-mono text-stone-400 mt-3 text-sm sm:text-base">making data easier</p>

      <span className="mt-6 text-[10px] font-mono uppercase tracking-widest text-stone-500 border border-stone-700 rounded-full px-3 py-1">
        alpha build — more coming soon
      </span>

      <div className="flex items-center gap-3 mt-10">
        <Link
          href="/signup"
          className="font-sans text-sm px-5 py-2 rounded-md bg-white text-black font-medium hover:bg-stone-200 transition-colors"
        >
          Sign up
        </Link>
        <Link
          href="/login"
          className="font-sans text-sm px-5 py-2 rounded-md border border-stone-700 text-stone-200 hover:bg-stone-900 transition-colors"
        >
          Sign in
        </Link>
      </div>

      <div className="fixed bottom-6 left-0 right-0 flex items-center justify-center gap-3 font-mono text-xs text-stone-600">
        <a href="mailto:team@hypersymmetry.io" className="hover:text-stone-300 transition-colors">
          team@hypersymmetry.io
        </a>
        <span>·</span>
        <a
          href="https://x.com/hypersymmetryio"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-stone-300 transition-colors"
        >
          @hypersymmetryio
        </a>
      </div>
    </div>
  );
}
