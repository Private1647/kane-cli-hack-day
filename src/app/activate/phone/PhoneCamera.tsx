"use client";

import { useState } from "react";
import HumanCameraCheckpoint from "../HumanCameraCheckpoint";

export default function PhoneCamera({ token }: { token: string }) {
  const [done, setDone] = useState<string | null>(null);
  if (done !== null) {
    return (
      <div role="status" className="border border-hairline bg-surface p-5 font-plex text-sm text-bright">
        <p className="font-pixel text-[10px] uppercase tracking-[0.2em] text-lightgray">Photo saved</p>
        <p className="mt-2">All done here. Go back to your computer{done ? `; your receipt is ${done}` : ""}.</p>
      </div>
    );
  }
  return <HumanCameraCheckpoint fields={{ handoff: token }} onDone={(r) => setDone(r.receipt_code ?? "")} />;
}
