"use client";
import { useRef, useState } from "react";
import { setStopDone, textPhoto, uploadPhoto } from "@/lib/data";
import { toast } from "./Shell";

/**
 * One tap: camera opens → photo saved on the job/stop → stop marked delivered → photo texted automatically.
 */
export default function PhotoButton({ jobId, stopId, markDone = true, label = "📷 Delivered + photo", className = "btn green block", onDone, allowPick = false }: {
  jobId: string; stopId: string | null; markDone?: boolean; label?: string; className?: string; onDone?: () => void; allowPick?: boolean;
}) {
  const cam = useRef<HTMLInputElement>(null);
  const pick = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function handle(files: FileList | null) {
    if (!files || !files.length) return;
    try {
      const ids: string[] = [];
      for (let i = 0; i < files.length; i++) {
        setBusy(`Saving photo${files.length > 1 ? ` ${i + 1}/${files.length}` : ""}…`);
        ids.push(await uploadPhoto(files[i], jobId, stopId));
      }
      if (markDone && stopId) await setStopDone(stopId, jobId, true);
      if (markDone && stopId) {
        setBusy("Texting photo…");
        const r = await textPhoto(ids);
        toast(r.ok ? "✓ " + r.message : "⚠️ " + r.message);
      } else {
        toast("✓ Photo saved");
      }
    } catch (e: any) {
      toast("Photo not saved: " + (e.message || "error") + ". Try again.");
    }
    setBusy(null);
    if (cam.current) cam.current.value = "";
    if (pick.current) pick.current.value = "";
    onDone?.();
  }

  return (
    <>
      <input ref={cam} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handle(e.target.files)} />
      <input ref={pick} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handle(e.target.files)} />
      <button type="button" className={className} disabled={!!busy} onClick={() => cam.current?.click()}>{busy || label}</button>
      {allowPick && !busy && (
        <button type="button" className="link" onClick={() => pick.current?.click()}>or choose a photo already on the phone</button>
      )}
    </>
  );
}
