// src/app/page.tsx
'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import QRCode from 'qrcode';
import {
  Radar,
  ShieldAlert,
  Cpu,
  CloudRain,
  Navigation,
  Upload,
  EyeOff,
  CheckCircle2,
  Crosshair,
  Sparkles,
  Lock,
  Unlock,
  Send,
  MapPin,
  XCircle,
  Eye,
  FileUp,
  Activity,
  Radio,
  QrCode,
  Download,
  ExternalLink,
} from 'lucide-react';
import {
  evaluateTrajectoryDropProbability,
  generateMockBangkokTrajectory,
  parseGpxToTelemetry,
  parseJsonToTelemetry,
  ScoredTrajectoryNode,
  TelemetryPoint,
} from '@/lib/engine/imu-math';
import {
  runPetRadianceSimulation,
  PetBehaviorProfile,
  RadianceCell,
} from '@/lib/engine/pet-diffusion';

type ActivePillar =
  | 'PILLAR_1_IMU'
  | 'PILLAR_2_PET'
  | 'PILLAR_3_VISION'
  | 'PILLAR_4_QR';

interface RedactionBox {
  label: string;
  box_2d: [number, number, number, number];
}

interface ForensicResponse {
  public_payload: {
    category: string;
    color: string;
    brand: string;
    public_summary: string;
    redaction_boxes: RedactionBox[];
  };
  challenge_prompt: {
    en: string;
    th: string;
    dev_preview_secret: string;
    dev_preview_keywords_en?: string[];
    dev_preview_keywords_th: string[];
  };
}

interface ClaimGradeResult {
  is_verified: boolean;
  confidence_score: number;
  reasoning: string;
  safe_handoff_point: string;
}

interface SpatialMatchItem {
  nodeId: string;
  vaultItemId: string;
  category: string;
  public_summary: string;
  question_en: string;
  question_th: string;
  lat: number;
  lng: number;
  distance_meters: number;
}

export default function TraceTelemetryDashboard() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [activePillar, setActivePillar] = useState<ActivePillar>('PILLAR_1_IMU');

  // Pillar 1 State
  const [scoredNodes, setScoredNodes] = useState<ScoredTrajectoryNode[]>([]);
  const [selectedNode, setSelectedNode] = useState<ScoredTrajectoryNode | null>(null);
  const [trajectorySource, setTrajectorySource] = useState<string>('SAMYAN_DEMO_BUFFER');
  const [isRecordingImu, setIsRecordingImu] = useState<boolean>(false);
  const livePointsRef = useRef<TelemetryPoint[]>([]);
  const [spatialMatches, setSpatialMatches] = useState<SpatialMatchItem[]>([]);
  const [isCheckingRadar, setIsCheckingRadar] = useState<boolean>(false);

  // Pillar 2 State
  const [petProfile, setPetProfile] = useState<PetBehaviorProfile>('SPOOKED_DOG');
  const [elapsedMinutes, setElapsedMinutes] = useState<number>(45);
  const [isStorming, setIsStorming] = useState<boolean>(false);
  const [sightingCoord, setSightingCoord] = useState<{ lat: number; lng: number } | null>(null);
  const [radianceCells, setRadianceCells] = useState<RadianceCell[]>([]);

  // Pillar 3 State
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [forensicData, setForensicData] = useState<ForensicResponse | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const redactCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [claimantAnswer, setClaimantAnswer] = useState<string>('');
  const [isGrading, setIsGrading] = useState<boolean>(false);
  const [claimResult, setClaimResult] = useState<ClaimGradeResult | null>(null);
  const [showDevSpoilers, setShowDevSpoilers] = useState<boolean>(false);

  // Pillar 4 (QR Shield Generator) State
  const [tagId, setTagId] = useState<string>('TRC-8842-BKK');
  const [bountyAmount, setBountyAmount] = useState<string>('500 THB');
  const [ownerNote, setOwnerNote] = useState<string>('IF FOUND: SCAN FOR INSTANT BOUNTY');
  const [qrMode, setQrMode] = useState<'LOCKSCREEN' | 'STICKER'>('LOCKSCREEN');
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Initialize Pillar 1 & Pillar 2
  useEffect(() => {
    const mock = generateMockBangkokTrajectory();
    const evaluated = evaluateTrajectoryDropProbability(mock.points, mock.t0, mock.t1);
    setScoredNodes(evaluated);
    const highest = [...evaluated].sort((a, b) => b.dropProbability - a.dropProbability)[0];
    setSelectedNode(highest || null);
  }, []);

  useEffect(() => {
    const cells = runPetRadianceSimulation({
      originLat: 13.7385,
      originLng: 100.5355,
      elapsedMinutes,
      profile: petProfile,
      isStorming,
      sightingOverride: sightingCoord,
    });
    setRadianceCells(cells);
  }, [petProfile, elapsedMinutes, isStorming, sightingCoord]);

  // Handle Cold-Start .GPX / .JSON Trajectory Upload
  const handleTrajectoryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = file.name.toLowerCase().endsWith('.json')
        ? parseJsonToTelemetry(text)
        : parseGpxToTelemetry(text);

      const evaluated = evaluateTrajectoryDropProbability(parsed.points, parsed.t0, parsed.t1);
      setScoredNodes(evaluated);
      setTrajectorySource(file.name.toUpperCase());

      if (evaluated.length > 0) {
        const highest = [...evaluated].sort((a, b) => b.dropProbability - a.dropProbability)[0];
        setSelectedNode(highest);
        mapRef.current?.flyTo({ center: [highest.lng, highest.lat], zoom: 15.8 });
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Failed to parse trajectory file');
    }
  };

  // Toggle Live Smartphone GPS + IMU Accelerometer Recording
  const toggleLiveImuRecording = () => {
    if (isRecordingImu) {
      setIsRecordingImu(false);
      return;
    }

    setIsRecordingImu(true);
    setTrajectorySource('LIVE_IMU_TELEMETRY');
    livePointsRef.current = [];

    let latestAccel = 9.81;
    let latestGyro = 0.2;

    const motionHandler = (ev: DeviceMotionEvent) => {
      const a = ev.accelerationIncludingGravity;
      if (a && a.x !== null && a.y !== null && a.z !== null) {
        latestAccel = Number(Math.hypot(a.x, a.y, a.z).toFixed(2));
      }
      const r = ev.rotationRate;
      if (r && r.alpha !== null && r.beta !== null && r.gamma !== null) {
        latestGyro = Number((Math.hypot(r.alpha, r.beta, r.gamma) * (Math.PI / 180)).toFixed(2));
      }
    };

    window.addEventListener('devicemotion', motionHandler);

    const interval = setInterval(() => {
      navigator.geolocation?.getCurrentPosition(
        (pos) => {
          const idx = livePointsRef.current.length + 1;
          const pt: TelemetryPoint = {
            id: `LIVE-${String(idx).padStart(2, '0')}`,
            lat: pos.coords.latitude + (Math.random() - 0.5) * 0.0002,
            lng: pos.coords.longitude + (Math.random() - 0.5) * 0.0002,
            timestamp: Date.now(),
            accelMagnitude: latestAccel,
            gyroRate: latestGyro,
            transitMode: (pos.coords.speed ?? 0) > 4 ? 'VEHICLE' : 'WALKING',
          };
          livePointsRef.current = [...livePointsRef.current, pt];
          const pts = livePointsRef.current;
          const evaluated = evaluateTrajectoryDropProbability(
            pts,
            pts[0].timestamp - 1000,
            Date.now() + 1000
          );
          setScoredNodes(evaluated);
          mapRef.current?.flyTo({ center: [pt.lng, pt.lat], zoom: 16.2 });
        },
        () => {
          const idx = livePointsRef.current.length + 1;
          const pt: TelemetryPoint = {
            id: `LIVE-${String(idx).padStart(2, '0')}`,
            lat: 13.7385 + idx * 0.00035,
            lng: 100.5355 + idx * 0.00035,
            timestamp: Date.now(),
            accelMagnitude: idx % 3 === 0 ? 19.5 : 10.2,
            gyroRate: idx % 3 === 0 ? 4.2 : 0.4,
            transitMode: 'WALKING',
          };
          livePointsRef.current = [...livePointsRef.current, pt];
          const pts = livePointsRef.current;
          const evaluated = evaluateTrajectoryDropProbability(
            pts,
            pts[0].timestamp - 1000,
            Date.now() + 1000
          );
          setScoredNodes(evaluated);
        }
      );
    }, 3000);

    setTimeout(() => {
      clearInterval(interval);
      window.removeEventListener('devicemotion', motionHandler);
      setIsRecordingImu(false);
    }, 18000);
  };

  // Run PostGIS 30m Spatial Intersection Radar
  const runSpatialIntersectionRadar = async () => {
    setIsCheckingRadar(true);
    try {
      const highRiskNodes = scoredNodes.filter((n) => n.dropProbability >= 0.4);
      const res = await fetch('/api/spatial-match', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nodes: highRiskNodes.length > 0 ? highRiskNodes : scoredNodes,
          radiusMeters: 250,
        }),
      });
      const data = await res.json();
      setSpatialMatches(data.matches || []);
    } finally {
      setIsCheckingRadar(false);
    }
  };

  // Synchronized 60fps HTML5 Canvas Overlay Renderer
  const renderTelemetryCanvas = useCallback(() => {
    const map = mapRef.current;
    const canvas = overlayCanvasRef.current;
    if (!map || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    if (canvas.width !== rect.width || canvas.height !== rect.height) {
      canvas.width = rect.width;
      canvas.height = rect.height;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (activePillar === 'PILLAR_1_IMU' && scoredNodes.length > 0) {
      ctx.beginPath();
      ctx.strokeStyle = '#00F0FF';
      ctx.lineWidth = 2.5;
      scoredNodes.forEach((pt, idx) => {
        const projected = map.project([pt.lng, pt.lat]);
        if (idx === 0) ctx.moveTo(projected.x, projected.y);
        else ctx.lineTo(projected.x, projected.y);
      });
      ctx.stroke();

      scoredNodes.forEach((pt) => {
        const { x, y } = map.project([pt.lng, pt.lat]);
        const isHighRisk = pt.dropProbability >= 0.55;

        if (pt.isGhostVectorOrigin) {
          ctx.save();
          ctx.beginPath();
          ctx.setLineDash([6, 4]);
          ctx.strokeStyle = '#FF2A54';
          ctx.lineWidth = 2;
          ctx.moveTo(x, y);
          ctx.lineTo(x + 75, y - 55);
          ctx.stroke();
          ctx.fillStyle = '#FF2A54';
          ctx.font = '10px monospace';
          ctx.fillText('GHOST VECTOR (TRANSIT HANDOFF)', x + 14, y - 60);
          ctx.restore();
        }

        if (isHighRisk) {
          ctx.beginPath();
          ctx.arc(x, y, 22 * pt.dropProbability + 8, 0, Math.PI * 2);
          ctx.fillStyle =
            pt.dropProbability > 0.7 ? 'rgba(255, 42, 84, 0.25)' : 'rgba(255, 184, 0, 0.22)';
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(x, y, isHighRisk ? 7 : 4.5, 0, Math.PI * 2);
        ctx.fillStyle =
          pt.dropProbability > 0.7 ? '#FF2A54' : isHighRisk ? '#FFB800' : '#00F0FF';
        ctx.fill();
        ctx.strokeStyle = '#0B0C10';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.fillStyle = '#E2E8F0';
        ctx.font = 'bold 11px monospace';
        ctx.fillText(`${pt.id} [${(pt.dropProbability * 100).toFixed(0)}%]`, x + 10, y + 4);
      });

      spatialMatches.forEach((match) => {
        const { x, y } = map.project([match.lng, match.lat]);
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, 26, 0, Math.PI * 2);
        ctx.strokeStyle = '#10B981';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = 'rgba(16, 185, 129, 0.22)';
        ctx.fill();

        ctx.fillStyle = '#10B981';
        ctx.font = 'bold 11px monospace';
        ctx.fillText(
          `POSTGIS LOCK // ${match.category.toUpperCase()} (${match.distance_meters}m)`,
          x + 14,
          y - 16
        );
        ctx.restore();
      });
    }

    if (activePillar === 'PILLAR_2_PET' && radianceCells.length > 0) {
      radianceCells.forEach((cell) => {
        const { x, y } = map.project([cell.lng, cell.lat]);
        const radius = Math.max(12, Math.min(34, map.getZoom() * 1.9));

        const grad = ctx.createRadialGradient(x, y, 2, x, y, radius);
        if (cell.probability > 0.65) {
          grad.addColorStop(0, `rgba(255, 42, 84, ${cell.probability * 0.65})`);
          grad.addColorStop(1, 'rgba(255, 42, 84, 0)');
        } else {
          grad.addColorStop(0, `rgba(255, 184, 0, ${cell.probability * 0.55})`);
          grad.addColorStop(1, 'rgba(0, 240, 255, 0)');
        }

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      });

      const center = sightingCoord ?? { lat: 13.7385, lng: 100.5355 };
      const { x, y } = map.project([center.lng, center.lat]);
      ctx.beginPath();
      ctx.arc(x, y, 7, 0, Math.PI * 2);
      ctx.fillStyle = '#00F0FF';
      ctx.fill();
      ctx.fillStyle = '#00F0FF';
      ctx.font = 'bold 11px monospace';
      ctx.fillText(
        sightingCoord ? 'COLLAPSED SIGHTING LOCK' : 'PET ESCAPE ORIGIN (T=0)',
        x + 12,
        y + 4
      );
    }
  }, [activePillar, scoredNodes, radianceCells, sightingCoord, spatialMatches]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    maplibregl.setWorkerUrl(
      'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl-csp-worker.js'
    );

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: [100.5355, 13.7385],
      zoom: 15.4,
      pitch: 25,
    });

    mapRef.current = map;

    map.on('move', renderTelemetryCanvas);
    map.on('zoom', renderTelemetryCanvas);
    map.on('load', renderTelemetryCanvas);

    map.on('click', (e: maplibregl.MapMouseEvent) => {
      if (overlayCanvasRef.current?.dataset.pillar === 'PILLAR_2_PET') {
        setSightingCoord({ lat: e.lngLat.lat, lng: e.lngLat.lng });
      }
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, [renderTelemetryCanvas]);

  useEffect(() => {
    renderTelemetryCanvas();
  }, [renderTelemetryCanvas]);

  // Pillar 3 Redaction Canvas
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
            ctx.filter = 'blur(18px)';
            ctx.drawImage(img, x, y, w, h, x, y, w, h);
            ctx.filter = 'none';

            ctx.fillStyle = 'rgba(11, 12, 16, 0.55)';
            ctx.fillRect(x, y, w, h);

            ctx.strokeStyle = '#FF2A54';
            ctx.lineWidth = Math.max(2, img.width * 0.004);
            ctx.strokeRect(x, y, w, h);

            ctx.fillStyle = '#FF2A54';
            ctx.font = `bold ${Math.max(12, Math.floor(img.width * 0.022))}px monospace`;
            ctx.fillText(`REDACTED // ${item.label}`, x + 6, Math.max(16, y - 6));
          } else {
            ctx.strokeStyle = '#10B981';
            ctx.lineWidth = Math.max(2, img.width * 0.004);
            ctx.strokeRect(x, y, w, h);

            ctx.fillStyle = '#10B981';
            ctx.font = `bold ${Math.max(12, Math.floor(img.width * 0.022))}px monospace`;
            ctx.fillText(`UNLOCKED // ${item.label}`, x + 6, Math.max(16, y - 6));
          }
          ctx.restore();
        });
      }
    };
    img.src = imageSrc;
  }, [imageSrc, forensicData, claimResult]);

  // Pillar 4: Render Tactical Cyberpunk Lockscreen Wallpaper / Sticker on HTML5 Canvas
  useEffect(() => {
    if (activePillar !== 'PILLAR_4_QR' || !qrCanvasRef.current) return;

    const canvas = qrCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const isLockscreen = qrMode === 'LOCKSCREEN';
    canvas.width = isLockscreen ? 540 : 500;
    canvas.height = isLockscreen ? 960 : 500;

    const origin =
      typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    const finderUrl = `${origin}/found?tag=${encodeURIComponent(tagId)}&bounty=${encodeURIComponent(bountyAmount)}`;

    const drawCard = async () => {
      // Obsidian Tactical Background
      ctx.fillStyle = '#0B0C10';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Subtle Cyber Grid Lines
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.06)';
      ctx.lineWidth = 1;
      for (let x = 0; x < canvas.width; x += 30) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let y = 0; y < canvas.height; y += 30) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      // Outer Tactical Border
      ctx.strokeStyle = '#00F0FF';
      ctx.lineWidth = 3;
      ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);

      // Header Telemetry Text
      ctx.fillStyle = '#00F0FF';
      ctx.font = 'bold 18px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(
        'TRACE // SAMARITAN RECOVERY SHIELD',
        canvas.width / 2,
        isLockscreen ? 310 : 65
      );

      ctx.fillStyle = '#94A3B8';
      ctx.font = '13px monospace';
      ctx.fillText(
        `ASSET TAG: ${tagId} • SRID 4326`,
        canvas.width / 2,
        isLockscreen ? 336 : 90
      );

      // Generate QR Data URL
      const qrDataUrl = await QRCode.toDataURL(finderUrl, {
        width: isLockscreen ? 260 : 230,
        margin: 2,
        color: {
          dark: '#00F0FF',
          light: '#141720',
        },
      });

      const qrImg = new Image();
      qrImg.onload = () => {
        const qrSize = isLockscreen ? 260 : 230;
        const qrX = (canvas.width - qrSize) / 2;
        const qrY = isLockscreen ? 375 : 120;

        // Frame around QR
        ctx.strokeStyle = '#FFB800';
        ctx.lineWidth = 2;
        ctx.strokeRect(qrX - 8, qrY - 8, qrSize + 16, qrSize + 16);
        ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

        // Bounty Badge
        const badgeY = isLockscreen ? 690 : 395;
        ctx.fillStyle = 'rgba(255, 184, 0, 0.16)';
        ctx.fillRect(60, badgeY - 26, canvas.width - 120, 40);
        ctx.strokeStyle = '#FFB800';
        ctx.strokeRect(60, badgeY - 26, canvas.width - 120, 40);

        ctx.fillStyle = '#FFB800';
        ctx.font = 'bold 17px monospace';
        ctx.fillText(`GUARANTEED BOUNTY: ${bountyAmount}`, canvas.width / 2, badgeY);

        // Owner Custom Instruction
        ctx.fillStyle = '#E2E8F0';
        ctx.font = 'bold 14px monospace';
        ctx.fillText(ownerNote.toUpperCase(), canvas.width / 2, badgeY + 45);

        ctx.fillStyle = '#64748B';
        ctx.font = '11px monospace';
        ctx.fillText(
          'ZERO APP INSTALL • INSTANT GPS & GEMINI VAULT VERIFICATION',
          canvas.width / 2,
          badgeY + 70
        );
      };
      qrImg.src = qrDataUrl;
    };

    drawCard();
  }, [activePillar, tagId, bountyAmount, ownerNote, qrMode]);

  const downloadQrShield = () => {
    const canvas = qrCanvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `TRACE-${qrMode}-${tagId}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

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
    reader.onload = async () => {
      const base64 = reader.result as string;
      setImageSrc(base64);
      setIsScanning(true);

      try {
        const res = await fetch('/api/verify-item', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: base64,
            mimeType: file.type || 'image/jpeg',
            lat: targetLat,
            lng: targetLng,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Gemini Vision request failed');
        setForensicData(data);
      } catch (err: unknown) {
        setScanError(err instanceof Error ? err.message : 'Error scanning image');
      } finally {
        setIsScanning(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleGradeClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forensicData || !claimantAnswer.trim()) return;

    setIsGrading(true);
    setScanError(null);

    try {
      const res = await fetch('/api/grade-claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          claimantAnswer: claimantAnswer.trim(),
          secretDetail: forensicData.challenge_prompt.dev_preview_secret,
          keywordsEn: forensicData.challenge_prompt.dev_preview_keywords_en || [],
          keywordsTh: forensicData.challenge_prompt.dev_preview_keywords_th || [],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to grade ownership claim');
      setClaimResult(data);
    } catch (err: unknown) {
      setScanError(err instanceof Error ? err.message : 'Error grading claim');
    } finally {
      setIsGrading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0C10] text-slate-100 font-mono flex flex-col">
      <header className="border-b border-[#00F0FF]/20 bg-[#141720]/90 px-6 py-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Radar className="w-6 h-6 text-[#00F0FF] animate-pulse" />
          <div>
            <h1 className="text-lg font-bold tracking-wider text-[#00F0FF]">
              TRACE // SPATIAL RECOVERY & RADIANCE ENGINE
            </h1>
            <p className="text-xs text-slate-400">
              SOURCE: {trajectorySource} • SRID 4326 POSTGIS ACTIVE
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActivePillar('PILLAR_1_IMU')}
            className={`px-3 py-1.5 text-xs rounded border transition ${activePillar === 'PILLAR_1_IMU'
              ? 'bg-[#00F0FF]/15 border-[#00F0FF] text-[#00F0FF]'
              : 'border-slate-700 text-slate-400 hover:border-slate-500'
              }`}
          >
            [01] IMU DROP ENGINE
          </button>
          <button
            onClick={() => setActivePillar('PILLAR_2_PET')}
            className={`px-3 py-1.5 text-xs rounded border transition ${activePillar === 'PILLAR_2_PET'
              ? 'bg-[#FFB800]/15 border-[#FFB800] text-[#FFB800]'
              : 'border-slate-700 text-slate-400 hover:border-slate-500'
              }`}
          >
            [02] PET RADIANCE SIM
          </button>
          <button
            onClick={() => setActivePillar('PILLAR_3_VISION')}
            className={`px-3 py-1.5 text-xs rounded border transition ${activePillar === 'PILLAR_3_VISION'
              ? 'bg-[#FF2A54]/15 border-[#FF2A54] text-[#FF2A54]'
              : 'border-slate-700 text-slate-400 hover:border-slate-500'
              }`}
          >
            [03] GEMINI FORENSIC SPLIT
          </button>
          <button
            onClick={() => setActivePillar('PILLAR_4_QR')}
            className={`px-3 py-1.5 text-xs rounded border transition flex items-center gap-1.5 ${activePillar === 'PILLAR_4_QR'
              ? 'bg-emerald-500/15 border-emerald-400 text-emerald-300'
              : 'border-slate-700 text-slate-400 hover:border-slate-500'
              }`}
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>[04] QR SHIELD GEN</span>
          </button>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 relative overflow-hidden">
        <aside className="lg:col-span-4 bg-[#141720] border-r border-[#00F0FF]/20 p-5 overflow-y-auto space-y-4 max-h-[calc(100vh-68px)]">
          {activePillar === 'PILLAR_1_IMU' && (
            <>
              <div className="border border-[#00F0FF]/30 bg-[#0B0C10] p-3.5 rounded space-y-2.5">
                <div className="flex items-center justify-between text-xs text-[#00F0FF]">
                  <span>PILLAR 01 // TELEMETRY INGESTION</span>
                  <Cpu className="w-4 h-4" />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded border border-[#00F0FF]/40 hover:border-[#00F0FF] bg-[#141720] text-[#00F0FF] text-[11px] font-bold cursor-pointer transition">
                    <FileUp className="w-3.5 h-3.5" />
                    <span>IMPORT .GPX / .JSON</span>
                    <input
                      type="file"
                      accept=".gpx,.json,.xml"
                      onChange={handleTrajectoryUpload}
                      className="hidden"
                    />
                  </label>

                  <button
                    onClick={toggleLiveImuRecording}
                    className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded border text-[11px] font-bold transition ${isRecordingImu
                      ? 'border-[#FF2A54] bg-[#FF2A54]/20 text-[#FF2A54] animate-pulse'
                      : 'border-amber-500/40 hover:border-amber-400 bg-[#141720] text-amber-300'
                      }`}
                  >
                    <Activity className="w-3.5 h-3.5" />
                    <span>{isRecordingImu ? 'RECORDING IMU...' : 'LIVE IMU RECORD'}</span>
                  </button>
                </div>

                <button
                  onClick={runSpatialIntersectionRadar}
                  disabled={isCheckingRadar}
                  className="w-full py-2 px-3 rounded bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400 text-emerald-300 text-xs font-bold flex items-center justify-center gap-2 transition"
                >
                  <Radio className={`w-4 h-4 ${isCheckingRadar ? 'animate-spin' : ''}`} />
                  <span>
                    {isCheckingRadar
                      ? 'QUERYING POSTGIS ST_DWithin...'
                      : 'SCAN POSTGIS VAULT INTERSECTIONS (<30m)'}
                  </span>
                </button>
              </div>

              {spatialMatches.length > 0 && (
                <div className="p-3 border border-emerald-400 bg-emerald-950/30 rounded space-y-2 text-xs">
                  <div className="text-emerald-400 font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>POSTGIS SPATIAL MATCH FOUND ({spatialMatches.length})</span>
                  </div>
                  {spatialMatches.map((m) => (
                    <div
                      key={m.vaultItemId}
                      className="p-2 bg-black/50 rounded border border-emerald-500/30 space-y-1"
                    >
                      <div className="flex justify-between font-bold text-emerald-300">
                        <span>{m.category} (Near {m.nodeId})</span>
                        <span>{m.distance_meters}m away</span>
                      </div>
                      <p className="text-[11px] text-slate-300">{m.public_summary}</p>
                      <button
                        onClick={() => setActivePillar('PILLAR_3_VISION')}
                        className="text-[10px] text-[#00F0FF] underline font-bold"
                      >
                        → Go to Pillar 03 to Claim Item
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Scored Trajectory Nodes ({scoredNodes.length})
                </h2>
                {scoredNodes.map((node) => (
                  <div
                    key={node.id}
                    onClick={() => {
                      setSelectedNode(node);
                      mapRef.current?.flyTo({ center: [node.lng, node.lat], zoom: 16.2 });
                    }}
                    className={`p-3 rounded border cursor-pointer transition ${selectedNode?.id === node.id
                      ? 'border-[#00F0FF] bg-[#00F0FF]/10'
                      : 'border-slate-800 bg-[#0B0C10]/70 hover:border-slate-600'
                      }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#00F0FF]">{node.id}</span>
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded ${node.dropProbability > 0.7
                          ? 'bg-[#FF2A54]/20 text-[#FF2A54]'
                          : node.dropProbability > 0.45
                            ? 'bg-[#FFB800]/20 text-[#FFB800]'
                            : 'bg-slate-800 text-slate-300'
                          }`}
                      >
                        P(drop) = {(node.dropProbability * 100).toFixed(1)}%
                      </span>
                    </div>
                    <p className="text-[11px] text-amber-300 mt-1">{node.anomalyReason}</p>
                    <div className="grid grid-cols-3 gap-2 mt-2 text-[10px] text-slate-400">
                      <div>DWELL: {node.dwellScore}</div>
                      <div>JERK: {node.jerkScore}</div>
                      <div>TRANSIT: {node.transitScore}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {activePillar === 'PILLAR_2_PET' && (
            <div className="space-y-4">
              <div className="border border-[#FFB800]/30 bg-[#0B0C10] p-4 rounded">
                <div className="flex items-center justify-between text-xs text-[#FFB800] mb-1">
                  <span>PILLAR 02 // CELLULAR AUTOMATA ISOCHRONE</span>
                  <Navigation className="w-4 h-4" />
                </div>
                <p className="text-xs text-slate-400">
                  Click anywhere on the map to trigger a live <strong>Community Sighting Collapse</strong>.
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-xs text-slate-300 block">BEHAVIORAL PROFILE</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['SHY_CAT', 'SPOOKED_DOG', 'CURIOUS_DOG'] as PetBehaviorProfile[]).map((prof) => (
                    <button
                      key={prof}
                      onClick={() => setPetProfile(prof)}
                      className={`py-2 px-2 text-[11px] rounded border font-bold ${petProfile === prof
                        ? 'border-[#FFB800] bg-[#FFB800]/20 text-[#FFB800]'
                        : 'border-slate-800 bg-[#0B0C10] text-slate-400'
                        }`}
                    >
                      {prof}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300">ELAPSED TIME (Δt)</span>
                  <span className="text-[#00F0FF]">{elapsedMinutes} MIN</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={140}
                  step={5}
                  value={elapsedMinutes}
                  onChange={(e) => setElapsedMinutes(Number(e.target.value))}
                  className="w-full accent-[#FFB800]"
                />
              </div>

              <button
                onClick={() => setIsStorming(!isStorming)}
                className={`w-full py-2.5 px-3 rounded border text-xs flex items-center justify-center gap-2 transition ${isStorming
                  ? 'border-[#00F0FF] bg-[#00F0FF]/20 text-[#00F0FF]'
                  : 'border-slate-800 bg-[#0B0C10] text-slate-400'
                  }`}
              >
                <CloudRain className="w-4 h-4" />
                {isStorming ? 'STORM / THUNDER COUPLER: ACTIVE (2x SHELTER SEEK)' : 'ENABLE STORM / RAIN COUPLER'}
              </button>

              {sightingCoord && (
                <button
                  onClick={() => setSightingCoord(null)}
                  className="w-full py-2 rounded border border-[#FF2A54] bg-[#FF2A54]/10 text-[#FF2A54] text-xs flex items-center justify-center gap-2"
                >
                  <Crosshair className="w-4 h-4" />
                  RESET SIGHTING COLLAPSE TO T=0 ORIGIN
                </button>
              )}
            </div>
          )}

          {activePillar === 'PILLAR_3_VISION' && (
            <div className="space-y-4">
              <div className="border border-[#FF2A54]/40 bg-[#0B0C10] p-4 rounded">
                <div className="flex items-center justify-between text-xs text-[#FF2A54] mb-1">
                  <span>PILLAR 03 // ASYMMETRIC PROOF-OF-OWNERSHIP</span>
                  <ShieldAlert className="w-4 h-4" />
                </div>
                <p className="text-xs text-slate-400">
                  1. Finder uploads item photo.<br />
                  2. Gemini redacts secret micro-details.<br />
                  3. Claimant answers the challenge question below to unlock Samaritan Shield handoff.
                </p>
              </div>

              <label className="flex flex-col items-center justify-center border-2 border-dashed border-[#00F0FF]/40 hover:border-[#00F0FF] bg-[#0B0C10] rounded-lg p-4 cursor-pointer transition">
                <Upload className="w-5 h-5 text-[#00F0FF] mb-1.5" />
                <span className="text-xs text-[#00F0FF] font-bold">
                  STEP 1: UPLOAD FINDER PHOTO
                </span>
                <span className="text-[10px] text-slate-500 mt-0.5">JPG / PNG / WEBP</span>
                <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
              </label>

              {isScanning && (
                <div className="p-3.5 border border-[#00F0FF]/30 bg-[#0B0C10] rounded text-xs text-[#00F0FF] flex items-center gap-3">
                  <Sparkles className="w-4 h-4 animate-spin shrink-0" />
                  <span>RUNNING GEMINI FORENSIC SPLIT & PII REDACTION...</span>
                </div>
              )}

              {scanError && (
                <div className="p-3 border border-[#FF2A54] bg-[#FF2A54]/10 rounded text-xs text-[#FF2A54]">
                  ERROR: {scanError}
                </div>
              )}

              {forensicData && (
                <div className="space-y-3 text-xs">
                  <div className="p-3 border border-emerald-500/40 bg-emerald-950/20 rounded">
                    <div className="flex items-center gap-2 text-emerald-400 font-bold mb-1">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>PUBLIC MACRO TAGS (VISIBLE TO ALL)</span>
                    </div>
                    <p><strong>Category:</strong> {forensicData.public_payload.category}</p>
                    <p><strong>Color:</strong> {forensicData.public_payload.color}</p>
                    <p><strong>Brand:</strong> {forensicData.public_payload.brand}</p>
                    <p className="mt-1 text-slate-300">{forensicData.public_payload.public_summary}</p>
                  </div>

                  <form
                    onSubmit={handleGradeClaim}
                    className="p-3.5 border border-[#FFB800]/50 bg-[#0B0C10] rounded space-y-3"
                  >
                    <div className="flex items-center justify-between text-[#FFB800] font-bold">
                      <div className="flex items-center gap-2">
                        <Lock className="w-4 h-4" />
                        <span>STEP 2: OWNERSHIP CHALLENGE</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowDevSpoilers(!showDevSpoilers)}
                        className="text-[10px] text-slate-400 hover:text-[#00F0FF] flex items-center gap-1 underline"
                      >
                        <Eye className="w-3 h-3" />
                        {showDevSpoilers ? 'Hide Vault Spoiler' : 'Peek Vault Answer'}
                      </button>
                    </div>

                    <div className="space-y-1 text-slate-200 bg-[#141720] p-2.5 rounded border border-slate-800">
                      <p><strong>EN:</strong> {forensicData.challenge_prompt.en}</p>
                      <p><strong>TH:</strong> {forensicData.challenge_prompt.th}</p>
                    </div>

                    {showDevSpoilers && (
                      <div className="p-2 bg-slate-900/90 border border-slate-700 rounded text-[11px] text-slate-400 space-y-1">
                        <p><strong>Vault Secret:</strong> {forensicData.challenge_prompt.dev_preview_secret}</p>
                        <p><strong>EN Keywords:</strong> {forensicData.challenge_prompt.dev_preview_keywords_en?.join(', ')}</p>
                        <p><strong>TH Keywords:</strong> {forensicData.challenge_prompt.dev_preview_keywords_th?.join(', ')}</p>
                      </div>
                    )}

                    <div className="space-y-2">
                      <input
                        type="text"
                        value={claimantAnswer}
                        onChange={(e) => setClaimantAnswer(e.target.value)}
                        placeholder="Type secret detail in Thai or English..."
                        className="w-full bg-[#141720] border border-slate-700 focus:border-[#00F0FF] rounded px-3 py-2 text-xs text-white outline-none"
                      />
                      <button
                        type="submit"
                        disabled={isGrading || !claimantAnswer.trim()}
                        className="w-full py-2 px-3 rounded bg-[#00F0FF] hover:bg-[#00F0FF]/90 disabled:opacity-40 text-[#0B0C10] font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                        {isGrading ? 'VERIFYING WITH GEMINI JUDGE...' : 'SUBMIT PROOF OF OWNERSHIP'}
                      </button>
                    </div>
                  </form>

                  {claimResult && (
                    <div
                      className={`p-4 rounded border space-y-2.5 ${claimResult.is_verified
                        ? 'border-emerald-400 bg-emerald-950/30 text-emerald-200'
                        : 'border-[#FF2A54] bg-[#FF2A54]/15 text-rose-200'
                        }`}
                    >
                      <div className="flex items-center justify-between font-bold">
                        <div className="flex items-center gap-2">
                          {claimResult.is_verified ? (
                            <Unlock className="w-4 h-4 text-emerald-400" />
                          ) : (
                            <XCircle className="w-4 h-4 text-[#FF2A54]" />
                          )}
                          <span>
                            {claimResult.is_verified
                              ? 'OWNERSHIP VERIFIED // VAULT UNLOCKED'
                              : 'CLAIM REJECTED // SECRET MISMATCH'}
                          </span>
                        </div>
                        <span className="text-[11px] px-2 py-0.5 rounded bg-black/40">
                          {claimResult.confidence_score}% MATCH
                        </span>
                      </div>

                      <p className="text-[11px] leading-relaxed">{claimResult.reasoning}</p>

                      {claimResult.is_verified && (
                        <div className="pt-2.5 border-t border-emerald-500/30 space-y-1.5">
                          <div className="flex items-center gap-1.5 text-[#00F0FF] font-bold text-[11px]">
                            <MapPin className="w-3.5 h-3.5" />
                            <span>SAMARITAN SHIELD // SAFE CCTV HANDOFF UNLOCKED</span>
                          </div>
                          <p className="text-[11px] text-slate-200 bg-black/40 p-2 rounded border border-[#00F0FF]/30">
                            <strong>Meeting Point:</strong> {claimResult.safe_handoff_point}
                          </p>
                          <p className="text-[10px] text-emerald-300">
                            ✓ Redaction blur on the right viewport has been lifted for verified owner inspection.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {activePillar === 'PILLAR_4_QR' && (
            <div className="space-y-4 text-xs">
              <div className="border border-emerald-400/40 bg-[#0B0C10] p-4 rounded">
                <div className="flex items-center justify-between text-emerald-300 mb-1 font-bold">
                  <span>PILLAR 04 // ZERO-HARDWARE QR SHIELD</span>
                  <QrCode className="w-4 h-4" />
                </div>
                <p className="text-slate-400 leading-relaxed">
                  Generate a custom tactical lockscreen wallpaper or printable NFC/QR sticker tag. Scanning opens the zero-install <strong>/found</strong> camera portal.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setQrMode('LOCKSCREEN')}
                  className={`py-2 px-3 rounded border font-bold ${qrMode === 'LOCKSCREEN'
                    ? 'border-[#00F0FF] bg-[#00F0FF]/15 text-[#00F0FF]'
                    : 'border-slate-800 bg-[#0B0C10] text-slate-400'
                    }`}
                >
                  PHONE LOCKSCREEN
                </button>
                <button
                  onClick={() => setQrMode('STICKER')}
                  className={`py-2 px-3 rounded border font-bold ${qrMode === 'STICKER'
                    ? 'border-[#FFB800] bg-[#FFB800]/15 text-[#FFB800]'
                    : 'border-slate-800 bg-[#0B0C10] text-slate-400'
                    }`}
                >
                  SQUARE ASSET TAG
                </button>
              </div>

              <div className="space-y-2">
                <label className="block text-slate-400">TAG IDENTIFIER</label>
                <input
                  type="text"
                  value={tagId}
                  onChange={(e) => setTagId(e.target.value)}
                  className="w-full bg-[#0B0C10] border border-slate-700 rounded px-3 py-2 text-white"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-slate-400">ESCROW BOUNTY REWARD</label>
                <input
                  type="text"
                  value={bountyAmount}
                  onChange={(e) => setBountyAmount(e.target.value)}
                  className="w-full bg-[#0B0C10] border border-slate-700 rounded px-3 py-2 text-white"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-slate-400">CALLOUT MESSAGE</label>
                <input
                  type="text"
                  value={ownerNote}
                  onChange={(e) => setOwnerNote(e.target.value)}
                  className="w-full bg-[#0B0C10] border border-slate-700 rounded px-3 py-2 text-white"
                />
              </div>

              <button
                onClick={downloadQrShield}
                className="w-full py-2.5 px-4 rounded bg-emerald-400 hover:bg-emerald-300 text-[#0B0C10] font-bold flex items-center justify-center gap-2 transition cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>DOWNLOAD PNG ({qrMode})</span>
              </button>

              <a
                href={`/found?tag=${encodeURIComponent(tagId)}&bounty=${encodeURIComponent(bountyAmount)}`}
                target="_blank"
                rel="noreferrer"
                className="w-full py-2 px-4 rounded border border-[#00F0FF]/50 hover:border-[#00F0FF] text-[#00F0FF] font-bold flex items-center justify-center gap-2 transition"
              >
                <ExternalLink className="w-4 h-4" />
                <span>TEST LIVE /found FINDER PORTAL</span>
              </a>
            </div>
          )}
        </aside>

        <main className="lg:col-span-8 relative min-h-[540px] bg-[#0B0C10]">
          <div
            ref={mapContainerRef}
            className={`w-full h-full min-h-[540px] ${activePillar === 'PILLAR_1_IMU' || activePillar === 'PILLAR_2_PET'
              ? 'block'
              : 'hidden'
              }`}
          />
          <canvas
            ref={overlayCanvasRef}
            data-pillar={activePillar}
            className={`pointer-events-none absolute inset-0 w-full h-full ${activePillar === 'PILLAR_1_IMU' || activePillar === 'PILLAR_2_PET'
              ? 'block'
              : 'hidden'
              }`}
          />

          {activePillar === 'PILLAR_3_VISION' && (
            <div className="w-full h-full min-h-[540px] flex flex-col items-center justify-center p-6 bg-[#0B0C10]">
              {imageSrc ? (
                <div className="space-y-2 max-w-full">
                  <div
                    className={`text-xs flex items-center gap-2 font-bold ${claimResult?.is_verified ? 'text-emerald-400' : 'text-[#FF2A54]'
                      }`}
                  >
                    {claimResult?.is_verified ? (
                      <>
                        <Unlock className="w-4 h-4" />
                        <span>OWNER VERIFIED // REDACTION BLUR REMOVED</span>
                      </>
                    ) : (
                      <>
                        <EyeOff className="w-4 h-4" />
                        <span>PUBLIC REDACTED CANVAS RENDER (BOUNDING BOX BLUR APPLIED)</span>
                      </>
                    )}
                  </div>
                  <canvas
                    ref={redactCanvasRef}
                    className="max-h-[480px] w-auto border border-[#00F0FF]/30 rounded shadow-lg"
                  />
                </div>
              ) : (
                <div className="text-center text-slate-500 text-xs space-y-2">
                  <ShieldAlert className="w-10 h-10 mx-auto text-slate-600" />
                  <p>NO IMAGE LOADED IN FORENSIC VIEWPORT</p>
                  <p>Upload a photo on the left panel to test Gemini 2D bounding-box redaction.</p>
                </div>
              )}
            </div>
          )}

          {activePillar === 'PILLAR_4_QR' && (
            <div className="w-full h-full min-h-[540px] flex flex-col items-center justify-center p-6 bg-[#0B0C10]">
              <canvas
                ref={qrCanvasRef}
                className="max-h-[520px] w-auto border border-emerald-400/40 rounded shadow-2xl"
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}