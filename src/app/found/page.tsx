// src/app/found/page.tsx
'use client';

import React, { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Camera, ShieldCheck, Radar, MapPin, Sparkles, CheckCircle2 } from 'lucide-react';

function FinderPortalContent() {
  const searchParams = useSearchParams();
  const tagId = searchParams.get('tag') || 'UNREGISTERED-TAG';
  const bounty = searchParams.get('bounty') || '500 THB';

  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [summary, setSummary] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setErrorMsg(null);

    let lat = 13.7385;
    let lng = 100.5355;

    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) =>
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 4000 })
      );
      lat = pos.coords.latitude;
      lng = pos.coords.longitude;
    } catch {
      // Fallback coordinate if GPS permission is declined
    }

    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = reader.result as string;
        const res = await fetch('/api/verify-item', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: base64,
            mimeType: file.type || 'image/jpeg',
            lat,
            lng,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to scan item');

        setSummary(data.public_payload?.public_summary || 'Item logged into Private Vault.');
        setUploadSuccess(true);
      } catch (err: unknown) {
        setErrorMsg(err instanceof Error ? err.message : 'Upload error');
      } finally {
        setIsUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="min-h-screen bg-[#0B0C10] text-slate-100 font-mono flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md border border-[#00F0FF]/30 bg-[#141720] rounded-lg p-6 space-y-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <Radar className="w-6 h-6 text-[#00F0FF] animate-pulse" />
            <div>
              <h1 className="text-sm font-bold text-[#00F0FF]">TRACE // ZERO-INSTALL FINDER</h1>
              <p className="text-[11px] text-slate-400">TAG ID: {tagId}</p>
            </div>
          </div>
          <span className="px-2.5 py-1 text-xs font-bold bg-[#FFB800]/20 border border-[#FFB800] text-[#FFB800] rounded">
            BOUNTY: {bounty}
          </span>
        </div>

        {!uploadSuccess ? (
          <>
            <div className="p-3.5 bg-[#0B0C10] border border-slate-800 rounded text-xs text-slate-300 space-y-1.5">
              <p className="text-[#00F0FF] font-bold flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4" />
                <span>SAMARITAN PRIVACY SHIELD ACTIVE</span>
              </p>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                No app install or login required. Snap a quick photo of the found item. Gemini AI will automatically redact sensitive details and ping the owner with your GPS drop coordinate.
              </p>
            </div>

            <label className="w-full py-6 px-4 border-2 border-dashed border-[#00F0FF] hover:bg-[#00F0FF]/10 bg-[#0B0C10] rounded-lg flex flex-col items-center justify-center cursor-pointer transition">
              <Camera className="w-8 h-8 text-[#00F0FF] mb-2" />
              <span className="text-xs font-bold text-[#00F0FF]">
                TAP TO SNAP PHOTO OF FOUND ITEM
              </span>
              <span className="text-[10px] text-slate-500 mt-1">
                AUTOMATIC GPS + GEMINI VAULT ENCRYPTION
              </span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleCapture}
                className="hidden"
              />
            </label>

            {isUploading && (
              <div className="p-3 border border-[#00F0FF]/40 bg-[#0B0C10] rounded text-xs text-[#00F0FF] flex items-center justify-center gap-2">
                <Sparkles className="w-4 h-4 animate-spin" />
                <span>ENCRYPTING & LOGGING TO POSTGIS VAULT...</span>
              </div>
            )}

            {errorMsg && (
              <div className="p-3 border border-[#FF2A54] bg-[#FF2A54]/10 rounded text-xs text-[#FF2A54]">
                {errorMsg}
              </div>
            )}
          </>
        ) : (
          <div className="p-4 border border-emerald-400 bg-emerald-950/30 rounded space-y-3 text-xs">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
              <CheckCircle2 className="w-5 h-5" />
              <span>RECOVERY PING TRANSMITTED!</span>
            </div>
            <p className="text-slate-300 leading-relaxed">{summary}</p>
            <div className="p-2.5 bg-black/50 rounded border border-emerald-500/30 text-[11px] text-emerald-200 flex items-center gap-2">
              <MapPin className="w-4 h-4 shrink-0 text-[#00F0FF]" />
              <span>
                The owner has been notified. Once they pass the Private Vault challenge, safe handoff instructions for your {bounty} reward will unlock here.
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function FinderPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0B0C10]" />}>
      <FinderPortalContent />
    </Suspense>
  );
}

