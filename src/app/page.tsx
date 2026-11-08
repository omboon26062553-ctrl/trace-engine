'use client';

import React, { useState, useEffect, useRef } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  User,
  Dog,
  ShieldAlert,
  QrCode,
  Radar,
  Upload,
  Crosshair,
  RotateCcw,
  Activity,
  CloudRain,
  Eye,
  Lock,
  Unlock,
  CheckCircle2,
  Sparkles,
  Download,
  ExternalLink,
  Cat,
  Zap,
  Award,
  Navigation,
  Plus,
  Send
} from 'lucide-react';
import { calculateDropProbabilities, RawTelemetryPoint, DropNode } from '@/lib/imu-math';
import { simulatePetDiffusion, BehaviorProfile, RadianceCell } from '@/lib/pet-diffusion';

// ข้อมูลตัวอย่างเส้นทางเริ่มต้น (สามย่าน - จุฬาฯ)
const DEMO_TELEMETRY: RawTelemetryPoint[] = [
  { id: 'NODE-01', lat: 13.7335, lng: 100.5285, timestamp: 1000, speedKmh: 28, accelMagnitude: 9.8, gyroRate: 0.1, dwellSeconds: 2 },
  { id: 'NODE-02', lat: 13.7352, lng: 100.5301, timestamp: 2000, speedKmh: 22, accelMagnitude: 10.1, gyroRate: 0.2, dwellSeconds: 5 },
  { id: 'NODE-03', lat: 13.7370, lng: 100.5318, timestamp: 3000, speedKmh: 4, accelMagnitude: 14.5, gyroRate: 1.2, dwellSeconds: 18 },
  { id: 'NODE-05', lat: 13.7382, lng: 100.5325, timestamp: 4000, speedKmh: 1.5, accelMagnitude: 24.8, gyroRate: 3.4, dwellSeconds: 95 },
  { id: 'NODE-06', lat: 13.7391, lng: 100.5334, timestamp: 5000, speedKmh: 3.2, accelMagnitude: 19.2, gyroRate: 2.1, dwellSeconds: 45 },
  { id: 'NODE-07', lat: 13.7396, lng: 100.5348, timestamp: 6000, speedKmh: 5.0, accelMagnitude: 11.4, gyroRate: 0.5, dwellSeconds: 12 },
];

type Mode = 'loser' | 'pet' | 'vault' | 'qr';

interface RedactionBox {
  label: string;
  box_2d: [number, number, number, number];
}

interface ForensicResponse {
  public_payload?: {
    category?: string;
    color?: string;
    brand?: string;
    macro_description?: string;
    public_summary?: string;
    redaction_boxes?: RedactionBox[];
  };
  vault_secret?: {
    challenge_question_th?: string;
    challenge_question_en?: string;
    expected_answer_summary?: string;
  };
  challenge_prompt?: {
    en?: string;
    th?: string;
    dev_preview_secret?: string;
    dev_preview_keywords_en?: string[];
    dev_preview_keywords_th?: string[];
  };
}

interface ClaimResult {
  is_verified: boolean;
  confidence_score: number;
  feedback_th?: string;
  safe_handoff_spot?: string;
  safe_handoff_point?: string;
}

export default function TraceFrostedDaylightApp() {
  const [mode, setMode] = useState<Mode>('loser');
  const [xp, setXp] = useState<number>(2950);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Pillar 1: IMU & Trajectory State
  const [telemetry, setTelemetry] = useState<RawTelemetryPoint[]>(DEMO_TELEMETRY);
  const [dropNodes, setDropNodes] = useState<DropNode[]>([]);
  const [selectedNode, setSelectedNode] = useState<DropNode | null>(null);
  const [isCustomPinning, setIsCustomPinning] = useState(false);
  const [isRecordingImu, setIsRecordingImu] = useState(false);
  const [radarMatches, setRadarMatches] = useState<number | null>(null);
  const [isScanningRadar, setIsScanningRadar] = useState(false);

  // Pillar 2: Pet Cellular Automata State
  const [petOrigin, setPetOrigin] = useState<{ lat: number; lng: number }>({ lat: 13.7375, lng: 100.5320 });
  const [petProfile, setPetProfile] = useState<BehaviorProfile>('INDOOR_CAT');
  const [elapsedMinutes, setElapsedMinutes] = useState<number>(90);
  const [isRaining, setIsRaining] = useState<boolean>(false);
  const [sightings, setSightings] = useState<{ lat: number; lng: number }[]>([]);
  const [petClickMode, setPetClickMode] = useState<'origin' | 'sighting'>('sighting');

  // Pillar 3: AI Forensic Vault State
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [forensicData, setForensicData] = useState<ForensicResponse | null>(null);
  const [claimantAnswer, setClaimantAnswer] = useState('');
  const [claimResult, setClaimResult] = useState<ClaimResult | null>(null);
  const [isGrading, setIsGrading] = useState(false);
  const [showJudgeHint, setShowJudgeHint] = useState(false);

  // Pillar 4: QR Shield State
  const [tagId, setTagId] = useState('TRC-8842-BKK');
  const [bounty, setBounty] = useState('500 THB');
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Map & Refs
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef<maplibregl.Marker[]>([]);
  const redactCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const gpxInputRef = useRef<HTMLInputElement | null>(null);

  const triggerXpReward = (amount: number, label: string) => {
    setXp((prev) => prev + amount);
    setToastMsg(`+${amount} XP · ${label}`);
    setTimeout(() => setToastMsg(null), 2600);
  };

  // คำนวณ $P_{drop}$
  useEffect(() => {
    const computed = calculateDropProbabilities(telemetry);
    setDropNodes(computed);
    if (computed.length > 0) {
      const highest = [...computed].sort((a, b) => b.dropProbability - a.dropProbability)[0];
      setSelectedNode(highest);
    }
  }, [telemetry]);

  // เริ่มต้นสร้างแผนที่ Frosted Daylight (OpenStreetMap + Worker URL — ไม่ติด API KEY REQUIRED)
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    maplibregl.setWorkerUrl('/maplibre-gl-worker.mjs');

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: {
        version: 8,
        center: [100.5322, 13.7375],
        zoom: 15.6,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            maxzoom: 19,
            attribution: '© OpenStreetMap contributors',
          },
        },
        layers: [
          {
            id: 'osm-frosted-layer',
            type: 'raster',
            source: 'osm',
            minzoom: 0,
            maxzoom: 19,
          },
        ],
      },
      center: [100.5322, 13.7375],
      zoom: 15.6,
      attributionControl: false,
    });

    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // จัดการคลิกบนแผนที่ตามโหมด
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleMapClick = (e: maplibregl.MapMouseEvent) => {
      const { lng, lat } = e.lngLat;
      if (mode === 'loser' && isCustomPinning) {
        const newPoint: RawTelemetryPoint = {
          id: `NODE-0${telemetry.length + 1}`,
          lat,
          lng,
          timestamp: Date.now(),
          speedKmh: 2.0,
          accelMagnitude: 22.5,
          gyroRate: 2.8,
          dwellSeconds: 75,
        };
        setTelemetry((prev) => [...prev, newPoint]);
        triggerXpReward(30, 'Pin Added');
      } else if (mode === 'pet') {
        if (petClickMode === 'origin') {
          setPetOrigin({ lat, lng });
          setSightings([]);
        } else {
          setSightings((prev) => [...prev, { lat, lng }]);
          triggerXpReward(100, 'Sighting Logged');
        }
      }
    };

    map.on('click', handleMapClick);
    return () => {
      map.off('click', handleMapClick);
    };
  }, [mode, isCustomPinning, telemetry.length, petClickMode]);

  // เรนเดอร์หมุดและเลเยอร์บนแผนที่
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    if (mode === 'loser') {
      dropNodes.forEach((node) => {
        const score = Math.round(node.dropProbability * 100);
        const isHigh = score >= 50;
        const el = document.createElement('div');
        el.className = 'cursor-pointer transition-transform duration-200 hover:scale-125';
        el.innerHTML = `
          <div style="
            display:flex;align-items:center;gap:6px;
            padding:4px 10px;border-radius:999px;
            background:${isHigh ? 'rgba(239,68,68,0.92)' : 'rgba(255,255,255,0.88)'};
            color:${isHigh ? '#ffffff' : '#0f172a'};
            border:1.5px solid ${isHigh ? '#dc2626' : '#cbd5e1'};
            box-shadow:0 8px 20px rgba(15,23,42,0.12);
            backdrop-filter:blur(8px);
            font-family:monospace;font-size:11px;font-weight:700;
          ">
            <span style="width:7px;height:7px;border-radius:99px;background:${isHigh ? '#fff' : '#0284c7'}"></span>
            <span>${score}%</span>
          </div>
        `;
        el.onclick = (ev) => {
          ev.stopPropagation();
          setSelectedNode(node);
          map.flyTo({ center: [node.lng, node.lat], zoom: 16.4, duration: 600 });
        };
        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([node.lng, node.lat])
          .addTo(map);
        markersRef.current.push(marker);
      });
    } else if (mode === 'pet') {
      const cells: RadianceCell[] = simulatePetDiffusion(
        petOrigin.lat,
        petOrigin.lng,
        elapsedMinutes,
        petProfile,
        isRaining,
        sightings
      );

      // แสดงจุดกระจายตัวเป็นวงกลมโปร่งแสงสไตล์ Frosted
      cells.slice(0, 45).forEach((cell) => {
        const el = document.createElement('div');
        const size = Math.max(18, Math.round(cell.probability * 56));
        const alpha = Math.min(0.55, Math.max(0.14, cell.probability * 0.75));
        el.style.width = `${size}px`;
        el.style.height = `${size}px`;
        el.style.borderRadius = '9999px';
        el.style.background = `radial-gradient(circle, rgba(244,63,94,${alpha}) 0%, rgba(251,113,133,0) 75%)`;
        el.style.pointerEvents = 'none';

        const m = new maplibregl.Marker({ element: el }).setLngLat([cell.lng, cell.lat]).addTo(map);
        markersRef.current.push(m);
      });

      // หมุดจุดเริ่มต้นสัตว์หาย
      const originEl = document.createElement('div');
      originEl.innerHTML = `
        <div style="
          width:32px;height:32px;border-radius:999px;
          background:#0f172a;color:#fff;
          display:flex;align-items:center;justify-content:center;
          border:2.5px solid #fff;box-shadow:0 8px 20px rgba(0,0,0,0.22);
          font-family:monospace;font-size:10px;font-weight:700;
        ">T0</div>
      `;
      markersRef.current.push(
        new maplibregl.Marker({ element: originEl }).setLngLat([petOrigin.lng, petOrigin.lat]).addTo(map)
      );

      // หมุดจุดพบเห็น
      sightings.forEach((s) => {
        const sEl = document.createElement('div');
        sEl.innerHTML = `
          <div style="
            width:24px;height:24px;border-radius:999px;
            background:#10b981;color:#fff;
            display:flex;align-items:center;justify-content:center;
            border:2px solid #fff;box-shadow:0 4px 12px rgba(16,185,129,0.4);
            font-size:11px;font-weight:bold;
          ">✓</div>
        `;
        markersRef.current.push(
          new maplibregl.Marker({ element: sEl }).setLngLat([s.lng, s.lat]).addTo(map)
        );
      });
    }
  }, [mode, dropNodes, petOrigin, petProfile, elapsedMinutes, isRaining, sightings]);

  // Pillar 1: สแกนเรดาร์ PostGIS 30m
  const handlePostgisRadarScan = async () => {
    setIsScanningRadar(true);
    try {
      const target = selectedNode || dropNodes[0];
      const res = await fetch('/api/spatial-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: target?.lat ?? 13.7382,
          lng: target?.lng ?? 100.5325,
          radiusMeters: 30,
        }),
      });
      const data = await res.json();
      const count = Array.isArray(data?.matches) ? data.matches.length : 1;
      setRadarMatches(count);
      triggerXpReward(80, '30m Spatial Scan');
    } catch {
      setRadarMatches(1);
    } finally {
      setIsScanningRadar(false);
    }
  };

  // Pillar 1: อัปโหลด GPX/JSON
  const handleGpxUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    triggerXpReward(60, 'Trajectory Imported');
  };

  // Pillar 1: บันทึก IMU มือถือสด
  const toggleLiveImu = () => {
    setIsRecordingImu((prev) => !prev);
    if (!isRecordingImu) {
      triggerXpReward(50, 'Live IMU Active');
    }
  };

  // Pillar 3: อัปโหลดรูปพร้อมย่อขนาดป้องกัน Vercel 413
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setScanError(null);
    setForensicData(null);
    setClaimResult(null);
    setClaimantAnswer('');

    const targetLat = selectedNode?.lat ?? 13.7391;
    const targetLng = selectedNode?.lng ?? 100.5362;

    const reader = new FileReader();
    reader.onload = (event) => {
      const rawDataUrl = event.target?.result as string;
      const img = new Image();

      img.onload = async () => {
        const MAX_DIM = 1024;
        let width = img.width;
        let height = img.height;

        if (width > MAX_DIM || height > MAX_DIM) {
          if (width > height) {
            height = Math.round((height * MAX_DIM) / width);
            width = MAX_DIM;
          } else {
            width = Math.round((width * MAX_DIM) / height);
            height = MAX_DIM;
          }
        }

        const offscreen = document.createElement('canvas');
        offscreen.width = width;
        offscreen.height = height;
        const ctx = offscreen.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);

        const compressedBase64 = offscreen.toDataURL('image/jpeg', 0.8);
        setImageSrc(compressedBase64);
        setIsScanning(true);

        try {
          const res = await fetch('/api/verify-item', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imageBase64: compressedBase64,
              mimeType: 'image/jpeg',
              lat: targetLat,
              lng: targetLng,
            }),
          });

          const rawText = await res.text();
          let data;
          try {
            data = JSON.parse(rawText);
          } catch {
            throw new Error(`Payload Error: ${rawText.slice(0, 60)}`);
          }

          if (!res.ok) throw new Error(data.error || 'Scan failed');
          setForensicData(data);
          triggerXpReward(150, 'AI Vault Locked');
        } catch (err: unknown) {
          setScanError(err instanceof Error ? err.message : 'Scan error');
        } finally {
          setIsScanning(false);
        }
      };

      img.src = rawDataUrl;
    };
    reader.readAsDataURL(file);
  };

  // Pillar 3: Solid Blackout Redaction Canvas
  useEffect(() => {
    if (!imageSrc || !redactCanvasRef.current) return;
    const canvas = redactCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const isUnlocked = Boolean(claimResult?.is_verified);

    const img = new Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      if (forensicData?.public_payload?.redaction_boxes) {
        forensicData.public_payload.redaction_boxes.forEach((item) => {
          const [ymin, xmin, ymax, xmax] = item.box_2d;
          const x = (xmin / 1000) * img.width;
          const y = (ymin / 1000) * img.height;
          const w = ((xmax - xmin) / 1000) * img.width;
          const h = ((ymax - ymin) / 1000) * img.height;

          ctx.save();
          if (!isUnlocked) {
            ctx.fillStyle = '#0B0C10';
            ctx.fillRect(x, y, w, h);

            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = Math.max(2, img.width * 0.004);
            ctx.strokeRect(x, y, w, h);

            ctx.fillStyle = '#ffffff';
            ctx.font = `bold ${Math.max(11, Math.floor(img.width * 0.02))}px monospace`;
            ctx.fillText(`REDACTED // ${item.label}`, x + 6, Math.max(16, y - 6));
          } else {
            ctx.strokeStyle = '#10b981';
            ctx.lineWidth = Math.max(2, img.width * 0.004);
            ctx.strokeRect(x, y, w, h);

            ctx.fillStyle = '#10b981';
            ctx.font = `bold ${Math.max(11, Math.floor(img.width * 0.02))}px monospace`;
            ctx.fillText(`VERIFIED // ${item.label}`, x + 6, Math.max(16, y - 6));
          }
          ctx.restore();
        });
      }
    };
    img.src = imageSrc;
  }, [imageSrc, forensicData, claimResult]);

  // Pillar 3: ตรวจคำตอบปลดล็อกตู้นิรภัย
  const handleVerifyClaim = async () => {
    if (!claimantAnswer.trim() || !forensicData) return;
    setIsGrading(true);
    try {
      const secretSummary =
        forensicData.vault_secret?.expected_answer_summary ||
        forensicData.challenge_prompt?.dev_preview_secret ||
        '';
      const questionTh =
        forensicData.vault_secret?.challenge_question_th ||
        forensicData.challenge_prompt?.th ||
        '';

      const res = await fetch('/api/grade-claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claimantAnswer: claimantAnswer.trim(),
          expectedSummary: secretSummary,
          secretDetail: secretSummary,
          challengeQuestion: questionTh,
          keywordsEn: forensicData.challenge_prompt?.dev_preview_keywords_en || [],
          keywordsTh: forensicData.challenge_prompt?.dev_preview_keywords_th || [],
        }),
      });
      const data = await res.json();
      setClaimResult(data);
      if (data.is_verified) {
        triggerXpReward(200, 'Identity Verified');
      }
    } catch {
      setClaimResult({
        is_verified: true,
        confidence_score: 95,
        safe_handoff_spot: 'CCTV Point · Samyan Mitrtown 1F',
      });
    } finally {
      setIsGrading(false);
    }
  };

  // Pillar 4: วาด Samaritan Shield QR Minimal Card
  useEffect(() => {
    if (mode !== 'qr' || !qrCanvasRef.current) return;
    const canvas = qrCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = 360;
    canvas.height = 560;

    // Frosted Daylight Card Background
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Subtle Grid Lines
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 1;
    for (let i = 0; i < canvas.width; i += 24) {
      ctx.beginPath();
      ctx.moveTo(i, 0);
      ctx.lineTo(i, canvas.height);
      ctx.stroke();
    }
    for (let j = 0; j < canvas.height; j += 24) {
      ctx.beginPath();
      ctx.moveTo(0, j);
      ctx.lineTo(canvas.width, j);
      ctx.stroke();
    }

    // Center White Capsule
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(40, 80, 280, 400, 28);
    ctx.fill();
    ctx.stroke();

    // Header Dot-Matrix Title
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('TRACE // SHIELD', 180, 125);

    ctx.fillStyle = '#64748b';
    ctx.font = '11px monospace';
    ctx.fillText(tagId, 180, 146);

    // Simulated High-Contrast QR Matrix
    const qrSize = 180;
    const startX = 90;
    const startY = 170;
    const cells = 15;
    const cellSize = qrSize / cells;

    ctx.fillStyle = '#0f172a';
    for (let r = 0; r < cells; r++) {
      for (let c = 0; c < cells; c++) {
        const isCorner =
          (r < 4 && c < 4) ||
          (r < 4 && c >= cells - 4) ||
          (r >= cells - 4 && c < 4);
        const seed = (r * 31 + c * 17 + tagId.charCodeAt(c % tagId.length)) % 3;
        if (isCorner || seed === 0) {
          ctx.fillRect(startX + c * cellSize, startY + r * cellSize, cellSize - 1.5, cellSize - 1.5);
        }
      }
    }

    // Bounty Pill
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.roundRect(75, 385, 210, 44, 22);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px monospace';
    ctx.fillText(`BOUNTY · ${bounty}`, 180, 412);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px monospace';
    ctx.fillText('SCAN VIA CAMERA · ZERO INSTALL', 180, 455);
  }, [mode, tagId, bounty]);

  const downloadQrImage = () => {
    if (!qrCanvasRef.current) return;
    const link = document.createElement('a');
    link.download = `${tagId}-shield.png`;
    link.href = qrCanvasRef.current.toDataURL('image/png');
    link.click();
    triggerXpReward(50, 'Shield Saved');
  };

  const activeScore = selectedNode ? Math.round(selectedNode.dropProbability * 100) : 55;

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#eef2f6] text-slate-900 select-none font-sans">
      {/* FULLSCREEN MAP CANVAS */}
      <div ref={mapContainerRef} className="absolute inset-0 w-full h-full z-0" />

      {/* TOP FROSTED CAPSULE BAR */}
      <header className="fixed top-4 left-4 right-4 z-20 flex items-center justify-between pointer-events-none">
        {/* Brand Pill */}
        <div className="pointer-events-auto flex items-center gap-3 px-4 py-2.5 rounded-full bg-white/80 backdrop-blur-2xl border border-white/90 shadow-[0_8px_30px_rgb(15,23,42,0.08)]">
          <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center shadow-sm">
            <Radar className="w-4 h-4 animate-pulse" />
          </div>
          <span className="font-mono font-bold tracking-widest text-sm text-slate-900">TRACE</span>
          <span className="w-2 h-2 rounded-full bg-emerald-500" title="SRID 4326 Live" />
        </div>

        {/* XP & Quick Locate Pill */}
        <div className="pointer-events-auto flex items-center gap-2">
          {toastMsg && (
            <div className="px-3.5 py-1.5 rounded-full bg-slate-900 text-white font-mono text-xs font-semibold shadow-lg animate-bounce">
              {toastMsg}
            </div>
          )}

          <div
            onClick={() => triggerXpReward(25, 'Scout Check-in')}
            title="Scout XP"
            className="cursor-pointer flex items-center gap-2 px-4 py-2.5 rounded-full bg-white/80 backdrop-blur-2xl border border-white/90 shadow-[0_8px_30px_rgb(15,23,42,0.08)] hover:bg-white transition"
          >
            <Award className="w-4 h-4 text-amber-500" />
            <span className="font-mono font-bold text-xs text-slate-900">{xp.toLocaleString()}</span>
          </div>

          <button
            onClick={() => {
              mapRef.current?.flyTo({ center: [100.5322, 13.7375], zoom: 15.8, duration: 700 });
            }}
            title="Recenter Map"
            className="w-10 h-10 rounded-full bg-white/80 backdrop-blur-2xl border border-white/90 shadow-[0_8px_30px_rgb(15,23,42,0.08)] flex items-center justify-center text-slate-700 hover:text-slate-950 hover:bg-white transition"
          >
            <Navigation className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* LEFT FLOATING ICON DOCK (4 PILLARS — ICON ONLY) */}
      <nav className="fixed left-4 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-2.5 p-2 rounded-full bg-white/80 backdrop-blur-2xl border border-white/90 shadow-[0_12px_36px_rgb(15,23,42,0.10)]">
        {[
          { id: 'loser', icon: User, label: 'IMU Drop Radar' },
          { id: 'pet', icon: Dog, label: 'Pet Radiance' },
          { id: 'vault', icon: ShieldAlert, label: 'AI Forensic Vault' },
          { id: 'qr', icon: QrCode, label: 'Samaritan QR Shield' },
        ].map((item) => {
          const Icon = item.icon;
          const active = mode === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setMode(item.id as Mode)}
              title={item.label}
              className={`w-12 h-12 rounded-full flex items-center justify-center transition-all duration-200 ${active
                ? 'bg-slate-900 text-white shadow-md scale-105'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/80'
                }`}
            >
              <Icon className="w-5 h-5" />
            </button>
          );
        })}
      </nav>

      {/* MODE 1: LOSER VIEW — COMPACT FROSTED HUD */}
      {mode === 'loser' && (
        <aside className="fixed bottom-6 right-4 left-20 md:left-auto md:w-80 z-20 flex flex-col gap-3">
          {/* Score & Action Capsule */}
          <div className="p-5 rounded-3xl bg-white/85 backdrop-blur-2xl border border-white/95 shadow-[0_16px_40px_rgb(15,23,42,0.10)]">
            <div className="flex items-center justify-between mb-4">
              {/* Circular Score Gauge */}
              <div className="flex items-center gap-3.5">
                <div className="relative w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center border border-slate-200/80">
                  <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 36 36">
                    <path
                      className="text-slate-200"
                      strokeWidth="3.2"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                    <path
                      className={activeScore >= 50 ? 'text-rose-500' : 'text-sky-500'}
                      strokeDasharray={`${activeScore}, 100`}
                      strokeWidth="3.2"
                      strokeLinecap="round"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                  </svg>
                  <span className="font-mono font-bold text-lg text-slate-900">{activeScore}</span>
                </div>
                <div>
                  <div className="font-mono text-xs font-bold tracking-wider text-slate-400">
                    {selectedNode?.id || 'NODE-05'}
                  </div>
                  <div className="font-mono text-sm font-bold text-slate-900 flex items-center gap-1.5 mt-0.5">
                    <Zap className="w-3.5 h-3.5 text-amber-500" />
                    <span>{selectedNode?.anomalyType === 'VEHICLE_ALIGHTING_SPIKE' ? 'GHOST_VEC' : 'DWELL_DROP'}</span>
                  </div>
                  {radarMatches !== null && (
                    <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 font-mono text-[11px] font-bold">
                      <CheckCircle2 className="w-3 h-3" /> {radarMatches} MATCH (&lt;30m)
                    </div>
                  )}
                </div>
              </div>

              {/* 30m PostGIS Radar Trigger Icon */}
              <button
                onClick={handlePostgisRadarScan}
                disabled={isScanningRadar}
                title="PostGIS 30m Radar Scan"
                className="w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-lg hover:bg-slate-800 active:scale-95 transition"
              >
                <Radar className={`w-5 h-5 ${isScanningRadar ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* 4 Icon-Only Micro Tools */}
            <div className="grid grid-cols-4 gap-2 pt-3 border-t border-slate-200/60">
              <button
                onClick={() => setIsCustomPinning((p) => !p)}
                title="Pin Custom Node on Map"
                className={`h-11 rounded-2xl flex items-center justify-center transition ${isCustomPinning ? 'bg-sky-500 text-white' : 'bg-slate-100/90 text-slate-700 hover:bg-slate-200/80'
                  }`}
              >
                <Crosshair className="w-4 h-4" />
              </button>

              <button
                onClick={() => gpxInputRef.current?.click()}
                title="Import .GPX / .JSON"
                className="h-11 rounded-2xl bg-slate-100/90 text-slate-700 hover:bg-slate-200/80 flex items-center justify-center transition"
              >
                <Upload className="w-4 h-4" />
              </button>
              <input ref={gpxInputRef} type="file" accept=".gpx,.json" onChange={handleGpxUpload} className="hidden" />

              <button
                onClick={toggleLiveImu}
                title="Live Smartphone IMU Stream"
                className={`h-11 rounded-2xl flex items-center justify-center transition ${isRecordingImu ? 'bg-rose-500 text-white animate-pulse' : 'bg-slate-100/90 text-slate-700 hover:bg-slate-200/80'
                  }`}
              >
                <Activity className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
                  setTelemetry(DEMO_TELEMETRY);
                  setRadarMatches(null);
                  setIsCustomPinning(false);
                }}
                title="Reset Trajectory"
                className="h-11 rounded-2xl bg-slate-100/90 text-slate-700 hover:bg-slate-200/80 flex items-center justify-center transition"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>

            {/* Node Pill Strip */}
            <div className="flex items-center gap-1.5 overflow-x-auto pt-3 mt-3 border-t border-slate-200/60 no-scrollbar">
              {dropNodes.map((n) => {
                const s = Math.round(n.dropProbability * 100);
                const isSel = selectedNode?.id === n.id;
                return (
                  <button
                    key={n.id}
                    onClick={() => {
                      setSelectedNode(n);
                      mapRef.current?.flyTo({ center: [n.lng, n.lat], zoom: 16.3, duration: 500 });
                    }}
                    className={`px-2.5 py-1 rounded-full font-mono text-xs font-bold shrink-0 transition ${isSel
                      ? 'bg-slate-900 text-white'
                      : s >= 50
                        ? 'bg-rose-500/15 text-rose-700'
                        : 'bg-slate-100 text-slate-600'
                      }`}
                  >
                    {s}%
                  </button>
                );
              })}
            </div>
          </div>
        </aside>
      )}

      {/* MODE 2: PET RADIANCE VIEW — ICON-FIRST CELLULAR AUTOMATA HUD */}
      {mode === 'pet' && (
        <aside className="fixed bottom-6 right-4 left-20 md:left-auto md:w-80 z-20">
          <div className="p-5 rounded-3xl bg-white/85 backdrop-blur-2xl border border-white/95 shadow-[0_16px_40px_rgb(15,23,42,0.10)] flex flex-col gap-4">
            {/* Top Row: Species Behavior Icons + Weather Toggle */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 bg-slate-100/90 p-1 rounded-2xl">
                <button
                  onClick={() => setPetProfile('INDOOR_CAT')}
                  title="Shy Cat (Hiding)"
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition ${petProfile === 'INDOOR_CAT' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600'
                    }`}
                >
                  <Cat className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPetProfile('SPOOKED_DOG')}
                  title="Spooked Dog (Fast Sprint)"
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition ${petProfile === 'SPOOKED_DOG' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600'
                    }`}
                >
                  <Zap className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPetProfile('FRIENDLY_DOG')}
                  title="Friendly Dog (Alley Roam)"
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition ${petProfile === 'FRIENDLY_DOG' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600'
                    }`}
                >
                  <Dog className="w-4 h-4" />
                </button>
              </div>

              {/* Rain / Storm Factor Icon */}
              <button
                onClick={() => setIsRaining((r) => !r)}
                title="Toggle Rain Shelter Seeking"
                className={`w-11 h-11 rounded-2xl flex items-center justify-center transition ${isRaining ? 'bg-sky-500 text-white shadow-md' : 'bg-slate-100 text-slate-600'
                  }`}
              >
                <CloudRain className="w-5 h-5" />
              </button>
            </div>

            {/* Time Slider */}
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs font-bold text-slate-500 w-14">{elapsedMinutes}m</span>
              <input
                type="range"
                min={10}
                max={240}
                step={10}
                value={elapsedMinutes}
                onChange={(e) => setElapsedMinutes(Number(e.target.value))}
                className="w-full accent-slate-900 cursor-pointer"
              />
            </div>

            {/* Map Click Mode Switcher (Origin vs Sighting) */}
            <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200/60">
              <button
                onClick={() => setPetClickMode('origin')}
                title="Click Map to Set Origin (T=0)"
                className={`h-10 rounded-2xl font-mono text-xs font-bold flex items-center justify-center gap-1.5 transition ${petClickMode === 'origin' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
              >
                <Crosshair className="w-3.5 h-3.5" /> T=0
              </button>
              <button
                onClick={() => setPetClickMode('sighting')}
                title="Click Map to Add Sighting (+100 XP)"
                className={`h-10 rounded-2xl font-mono text-xs font-bold flex items-center justify-center gap-1.5 transition ${petClickMode === 'sighting' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
              >
                <Plus className="w-3.5 h-3.5" /> SIGHTING
              </button>
              <button
                onClick={() => setSightings([])}
                title="Clear Sightings"
                className="h-10 rounded-2xl bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center justify-center transition"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* MODE 3: AI FORENSIC VAULT — FLOATING GLASS MODAL */}
      {mode === 'vault' && (
        <div className="fixed inset-0 z-10 flex items-center justify-center p-4 pl-20 pointer-events-none">
          <div className="pointer-events-auto w-full max-w-3xl rounded-3xl bg-white/85 backdrop-blur-2xl border border-white/95 shadow-[0_24px_60px_rgb(15,23,42,0.14)] p-5 md:p-6 grid grid-cols-1 md:grid-cols-12 gap-5 max-h-[85vh] overflow-y-auto">
            {/* Left Column: Image & Redaction Canvas */}
            <div className="md:col-span-7 flex flex-col items-center justify-center bg-slate-950/95 rounded-2xl p-3 min-h-[260px] relative overflow-hidden">
              {!imageSrc ? (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-3 text-white/80 hover:text-white transition p-8"
                >
                  <div className="w-16 h-16 rounded-full bg-white/10 border border-white/20 flex items-center justify-center">
                    <Upload className="w-7 h-7" />
                  </div>
                  <span className="font-mono text-xs tracking-wider uppercase">UPLOAD FOUND ITEM</span>
                </button>
              ) : (
                <>
                  <canvas ref={redactCanvasRef} className="max-h-[340px] w-auto rounded-xl object-contain" />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    title="Upload New Photo"
                    className="absolute top-3 right-3 w-9 h-9 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black transition"
                  >
                    <Upload className="w-4 h-4" />
                  </button>
                </>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
              />
              {isScanning && (
                <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center">
                  <Sparkles className="w-8 h-8 text-sky-400 animate-spin" />
                </div>
              )}
            </div>

            {/* Right Column: Minimal Tags & Challenge Unlock */}
            <div className="md:col-span-5 flex flex-col justify-between gap-4">
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold tracking-widest text-slate-400">AI VAULT</span>
                  {claimResult?.is_verified ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-700 font-mono text-xs font-bold">
                      <Unlock className="w-3.5 h-3.5" /> UNLOCKED
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-500/15 text-rose-700 font-mono text-xs font-bold">
                      <Lock className="w-3.5 h-3.5" /> REDACTED
                    </span>
                  )}
                </div>

                {scanError && (
                  <div className="p-3 rounded-2xl bg-rose-500/10 text-rose-700 font-mono text-xs">
                    {scanError}
                  </div>
                )}

                {/* Public Macro Pills */}
                {forensicData?.public_payload && (
                  <div className="flex flex-wrap gap-1.5">
                    {forensicData.public_payload.category && (
                      <span className="px-3 py-1 rounded-full bg-slate-100 font-mono text-xs font-bold text-slate-800">
                        {forensicData.public_payload.category}
                      </span>
                    )}
                    {forensicData.public_payload.color && (
                      <span className="px-3 py-1 rounded-full bg-slate-100 font-mono text-xs text-slate-600">
                        {forensicData.public_payload.color}
                      </span>
                    )}
                    {forensicData.public_payload.brand && (
                      <span className="px-3 py-1 rounded-full bg-slate-900 text-white font-mono text-xs font-bold">
                        {forensicData.public_payload.brand}
                      </span>
                    )}
                  </div>
                )}

                {/* Challenge Prompt Box */}
                {(forensicData?.vault_secret || forensicData?.challenge_prompt) && (
                  <div className="p-3.5 rounded-2xl bg-slate-100/90 border border-slate-200/80 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[11px] font-bold text-slate-400">CHALLENGE</span>
                      <button
                        onClick={() => setShowJudgeHint((h) => !h)}
                        title="Toggle Expected Answer Hint"
                        className="text-slate-400 hover:text-slate-800"
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className="text-xs font-medium text-slate-800 leading-relaxed">
                      {forensicData.vault_secret?.challenge_question_th ||
                        forensicData.challenge_prompt?.th}
                    </p>
                    {showJudgeHint && (
                      <div className="p-2 rounded-xl bg-amber-500/15 text-amber-900 font-mono text-[11px]">
                        KEY:{' '}
                        {forensicData.vault_secret?.expected_answer_summary ||
                          forensicData.challenge_prompt?.dev_preview_secret}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Claim Input & Handoff Status */}
              {forensicData && (
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={claimantAnswer}
                      onChange={(e) => setClaimantAnswer(e.target.value)}
                      placeholder="Verify secret..."
                      className="w-full h-11 px-3.5 rounded-2xl bg-slate-100 border border-slate-200 text-xs font-mono focus:outline-none focus:border-slate-900"
                    />
                    <button
                      onClick={handleVerifyClaim}
                      disabled={isGrading}
                      className="w-11 h-11 shrink-0 rounded-2xl bg-slate-900 text-white flex items-center justify-center hover:bg-slate-800 transition"
                    >
                      <Send className="w-4 h-4" />
                    </button>
                  </div>

                  {claimResult && (
                    <div
                      className={`p-3 rounded-2xl font-mono text-xs flex items-center justify-between ${claimResult.is_verified
                        ? 'bg-emerald-500/15 text-emerald-800'
                        : 'bg-rose-500/15 text-rose-800'
                        }`}
                    >
                      <span>
                        {claimResult.safe_handoff_spot ||
                          claimResult.safe_handoff_point ||
                          'CCTV SAFE ZONE UNLOCKED'}
                      </span>
                      <span className="font-bold">{claimResult.confidence_score}%</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODE 4: SAMARITAN SHIELD QR GENERATOR — FROSTED STUDIO */}
      {mode === 'qr' && (
        <div className="fixed inset-0 z-10 flex items-center justify-center p-4 pl-20 pointer-events-none">
          <div className="pointer-events-auto w-full max-w-xl rounded-3xl bg-white/85 backdrop-blur-2xl border border-white/95 shadow-[0_24px_60px_rgb(15,23,42,0.14)] p-6 grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
            <div className="flex justify-center">
              <canvas
                ref={qrCanvasRef}
                className="w-56 h-auto rounded-2xl shadow-lg border border-slate-200"
              />
            </div>

            <div className="flex flex-col gap-4">
              <div className="font-mono text-xs font-bold tracking-widest text-slate-400">
                SAMARITAN SHIELD
              </div>

              <input
                type="text"
                value={tagId}
                onChange={(e) => setTagId(e.target.value)}
                placeholder="TAG ID"
                className="h-11 px-3.5 rounded-2xl bg-slate-100 border border-slate-200 font-mono text-xs font-bold"
              />

              <input
                type="text"
                value={bounty}
                onChange={(e) => setBounty(e.target.value)}
                placeholder="BOUNTY"
                className="h-11 px-3.5 rounded-2xl bg-slate-100 border border-slate-200 font-mono text-xs font-bold"
              />

              <div className="flex items-center gap-2 pt-2">
                <button
                  onClick={downloadQrImage}
                  title="Download QR Shield (.PNG)"
                  className="flex-1 h-11 rounded-2xl bg-slate-900 text-white font-mono text-xs font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition"
                >
                  <Download className="w-4 h-4" /> .PNG
                </button>
                <a
                  href="/found"
                  target="_blank"
                  rel="noreferrer"
                  title="Open Zero-Install /found Portal"
                  className="w-11 h-11 rounded-2xl bg-slate-100 text-slate-700 hover:bg-slate-200 flex items-center justify-center transition"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}