 "use client";

import dynamic from "next/dynamic";

const HomeClient = dynamic(() => import("@/components/HomeClient"), {
  ssr: false,
  loading: () => (
    <main className="min-h-screen bg-[#0b0d10] text-white">
      <div className="flex min-h-screen items-center justify-center">
        <div className="rounded-2xl border border-white/10 bg-white/[0.035] px-5 py-4 text-sm text-slate-300">
          Loading workspace...
        </div>
      </div>
    </main>
  ),
});

export default function Page() {
  return <HomeClient />;
}
