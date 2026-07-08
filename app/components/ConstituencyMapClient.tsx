"use client";

import dynamic from "next/dynamic";

/** Leaflet touches `window` at import time, so this must never render on the server. */
export const ConstituencyMapNoSSR = dynamic(
  () => import("./ConstituencyMap").then((m) => m.ConstituencyMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[360px] items-center justify-center text-text-secondary">
        Loading map…
      </div>
    ),
  }
);
