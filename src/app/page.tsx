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
  Map as MapIcon,
  LocateFixed,
  MousePointerClick,
  RotateCcw,
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

type MapStyleMode = 'STREET_LIGHT' | 'TACTICAL_DARK';

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

const MAP_STYLES: Record<MapStyleMode, string> = {
  STREET_LIGHT: 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json',
  TACTICAL_DARK: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
};

export default function TraceTelemetryDashboard() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [activePillar, setActivePillar] = useState<ActivePillar>('PILLAR_1_IMU');
  const [mapStyleMode, setMapStyleMode] = useState<MapStyleMode>('STREET_LIGHT');

  // Pillar 1 State
  const [rawPoints, setRawPoints] = useState<TelemetryPoint[]>([]);
  const [scoredNodes, setScoredNodes] = useState<ScoredTrajectoryNode[]>([]);
  const [selectedNode, setSelectedNode] = useState<ScoredTrajectoryNode | null>(null);
  const [trajectorySource, setTrajectorySource] = useState<string>('เส้นทางตัวอย่าง: สามย่าน - จุฬาฯ');
  const [isRecordingImu, setIsRecordingImu] = useState<boolean>(false);
  const [isClickToAddNode, setIsClickToAddNode] = useState<boolean>(false);
  const livePointsRef = useRef<TelemetryPoint[]>([]);
  const [spatialMatches, setSpatialMatches] = useState<SpatialMatchItem[]>([]);
  const [isCheckingRadar, setIsCheckingRadar] = useState<boolean>(false);

  // Pillar 2 State
  const [petOrigin, setPetOrigin] = useState<{ lat: number; lng: number }>({
    lat: 13.7385,
    lng: 100.5355,
  });
  const [petClickMode, setPetClickMode] = useState<'MOVE_ORIGIN' | 'SIGHTING'>('SIGHTING');
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

  // Pillar 4 State
  const [tagId, setTagId] = useState<string>('TRC-8842-BKK');
  const [bountyAmount, setBountyAmount] = useState<string>('500 THB');
  const [ownerNote, setOwnerNote] = useState<string>('สแกนเพื่อแจ้งพิกัดของหาย รับรางวัลทันที');
  const [qrMode, setQrMode] = useState<'LOCKSCREEN' | 'STICKER'>('LOCKSCREEN');
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Initialize Demo Trajectory
  const resetDemoTrajectory = useCallback(() => {
    const mock = generateMockBangkokTrajectory();
    setRawPoints(mock.points);
    const evaluated = evaluateTrajectoryDropProbability(mock.points, mock.t0, mock.t1);
    setScoredNodes(evaluated);
    setTrajectorySource('เส้นทางตัวอย่าง: สามย่าน - จุฬาฯ');
    const highest = [...evaluated].sort((a, b) => b.dropProbability - a.dropProbability)[0];
    setSelectedNode(highest || null);
    mapRef.current?.flyTo({ center: [100.5355, 13.7385], zoom: 15.5 });
  }, []);

  useEffect(() => {
    resetDemoTrajectory();
  }, [resetDemoTrajectory]);

  useEffect(() => {
    const cells = runPetRadianceSimulation({
      originLat: petOrigin.lat,
      originLng: petOrigin.lng,
      elapsedMinutes,
      profile: petProfile,
      isStorming,
      sightingOverride: sightingCoord,
    });
    setRadianceCells(cells);
  }, [petOrigin, petProfile, elapsedMinutes, isStorming, sightingCoord]);

  // Locate User's Real GPS Position
  const handleLocateMe = () => {
    if (!navigator.geolocation) {
      alert('เบราว์เซอร์ของคุณไม่รองรับการดึงพิกัด GPS');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        mapRef.current?.flyTo({ center: [longitude, latitude], zoom: 16.5 });
        if (activePillar === 'PILLAR_2_PET') {
          setPetOrigin({ lat: latitude, lng: longitude });
          setSightingCoord(null);
        }
      },
      () => {
        alert('ไม่สามารถดึงพิกัดได้ กรุณากดอนุญาตการเข้าถึงตำแหน่ง (Location Permission)');
      },
      { enableHighAccuracy: true, timeout: 6000 }
    );
  };

  // Switch Map Style
  const toggleMapStyle = () => {
    const nextMode: MapStyleMode =
      mapStyleMode === 'STREET_LIGHT' ? 'TACTICAL_DARK' : 'STREET_LIGHT';
    setMapStyleMode(nextMode);
    if (mapRef.current) {
      mapRef.current.setStyle(MAP_STYLES[nextMode]);
    }
  };

  // Handle Cold-Start .GPX / .JSON Upload
  const handleTrajectoryUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = file.name.toLowerCase().endsWith('.json')
        ? parseJsonToTelemetry(text)
        : parseGpxToTelemetry(text);

      setRawPoints(parsed.points);
      const evaluated = evaluateTrajectoryDropProbability(parsed.points, parsed.t0, parsed.t1);
      setScoredNodes(evaluated);
      setTrajectorySource(`ไฟล์นำเข้า: ${file.name}`);

      if (evaluated.length > 0) {
        const highest = [...evaluated].sort((a, b) => b.dropProbability - a.dropProbability)[0];
        setSelectedNode(highest);
        mapRef.current?.flyTo({ center: [highest.lng, highest.lat], zoom: 15.8 });
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'ไม่สามารถอ่านไฟล์พิกัดได้');
    }
  };

  // Live Smartphone IMU + GPS Recording
  const toggleLiveImuRecording = () => {
    if (isRecordingImu) {
      setIsRecordingImu(false);
      return;
    }

    setIsRecordingImu(true);
    setTrajectorySource('บันทึกเซนเซอร์มือถือสด (Live IMU)');
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
            lat: pos.coords.latitude + (Math.random() - 0.5) * 0.00015,
            lng: pos.coords.longitude + (Math.random() - 0.5) * 0.00015,
            timestamp: Date.now(),
            accelMagnitude: latestAccel,
            gyroRate: latestGyro,
            transitMode: (pos.coords.speed ?? 0) > 4 ? 'VEHICLE' : 'WALKING',
          };
          livePointsRef.current = [...livePointsRef.current, pt];
          const pts = livePointsRef.current;
          setRawPoints(pts);
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
          setRawPoints(pts);
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

  // Run PostGIS Spatial Intersection Radar
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
    const isLight = mapStyleMode === 'STREET_LIGHT';

    if (activePillar === 'PILLAR_1_IMU' && scoredNodes.length > 0) {
      ctx.beginPath();
      ctx.strokeStyle = isLight ? '#0284C7' : '#00F0FF';
      ctx.lineWidth = 3.5;
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
          ctx.strokeStyle = '#E11D48';
          ctx.lineWidth = 2.5;
          ctx.moveTo(x, y);
          ctx.lineTo(x + 75, y - 55);
          ctx.stroke();

          ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
          ctx.fillRect(x + 10, y - 74, 210, 18);
          ctx.fillStyle = '#FDA4AF';
          ctx.font = 'bold 11px sans-serif';
          ctx.fillText('[จุดเสี่ยง] ลืมของบนยานพาหนะ (Ghost Vector)', x + 15, y - 61);
          ctx.restore();
        }

        if (isHighRisk) {
          ctx.beginPath();
          ctx.arc(x, y, 24 * pt.dropProbability + 8, 0, Math.PI * 2);
          ctx.fillStyle =
            pt.dropProbability > 0.7 ? 'rgba(225, 29, 72, 0.28)' : 'rgba(245, 158, 11, 0.25)';
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(x, y, isHighRisk ? 8 : 5.5, 0, Math.PI * 2);
        ctx.fillStyle =
          pt.dropProbability > 0.7 ? '#E11D48' : isHighRisk ? '#F59E0B' : '#0284C7';
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.stroke();

        const labelText = `${pt.id}: โอกาสตก ${(pt.dropProbability * 100).toFixed(0)}%`;
        ctx.font = 'bold 11px sans-serif';
        const textWidth = ctx.measureText(labelText).width;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
        ctx.fillRect(x + 10, y - 9, textWidth + 10, 18);
        ctx.fillStyle = '#F8FAFC';
        ctx.fillText(labelText, x + 15, y + 4);
      });

      spatialMatches.forEach((match) => {
        const { x, y } = map.project([match.lng, match.lat]);
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, 28, 0, Math.PI * 2);
        ctx.strokeStyle = '#10B981';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.fillStyle = 'rgba(16, 185, 129, 0.28)';
        ctx.fill();

        const matchLabel = `[พบของตรงพิกัด] ${match.category} (ห่าง ${match.distance_meters} ม.)`;
        ctx.font = 'bold 11px sans-serif';
        const mw = ctx.measureText(matchLabel).width;
        ctx.fillStyle = 'rgba(6, 78, 59, 0.92)';
        ctx.fillRect(x + 12, y - 30, mw + 12, 20);
        ctx.fillStyle = '#A7F3D0';
        ctx.fillText(matchLabel, x + 18, y - 16);
        ctx.restore();
      });
    }

    if (activePillar === 'PILLAR_2_PET' && radianceCells.length > 0) {
      radianceCells.forEach((cell) => {
        const { x, y } = map.project([cell.lng, cell.lat]);
        const radius = Math.max(14, Math.min(36, map.getZoom() * 2.0));

        const grad = ctx.createRadialGradient(x, y, 2, x, y, radius);
        if (cell.probability > 0.65) {
          grad.addColorStop(0, `rgba(225, 29, 72, ${cell.probability * 0.65})`);
          grad.addColorStop(1, 'rgba(225, 29, 72, 0)');
        } else {
          grad.addColorStop(0, `rgba(245, 158, 11, ${cell.probability * 0.55})`);
          grad.addColorStop(1, 'rgba(2, 132, 199, 0)');
        }

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
      });

      const center = sightingCoord ?? petOrigin;
      const { x, y } = map.project([center.lng, center.lat]);
      ctx.beginPath();
      ctx.arc(x, y, 8, 0, Math.PI * 2);
      ctx.fillStyle = '#0284C7';
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.stroke();

      const originLabel = sightingCoord
        ? '[จุดพบเห็นล่าสุด] บีบวงรัศมีเรดาร์แล้ว'
        : '[จุดเริ่มต้น] สัตว์เลี้ยงหลุดหาย (T=0)';
      ctx.font = 'bold 12px sans-serif';
      const ow = ctx.measureText(originLabel).width;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(x + 12, y - 10, ow + 12, 22);
      ctx.fillStyle = '#38BDF8';
      ctx.fillText(originLabel, x + 18, y + 5);
    }
  }, [
    activePillar,
    scoredNodes,
    radianceCells,
    sightingCoord,
    spatialMatches,
    mapStyleMode,
    petOrigin,
  ]);

  // Initialize MapLibre Instance (once on mount)
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLES.STREET_LIGHT,
      center: [100.5355, 13.7385],
      zoom: 15.5,
      pitch: 20,
    });

    map.addControl(new maplibregl.NavigationControl(), 'bottom-right');
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Bind Canvas Telemetry Renderer to Map Camera Events
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    map.on('move', renderTelemetryCanvas);
    map.on('zoom', renderTelemetryCanvas);
    map.on('styledata', renderTelemetryCanvas);
    map.on('load', renderTelemetryCanvas);

    if (map.loaded()) {
      renderTelemetryCanvas();
    }

    return () => {
      map.off('move', renderTelemetryCanvas);
      map.off('zoom', renderTelemetryCanvas);
      map.off('styledata', renderTelemetryCanvas);
      map.off('load', renderTelemetryCanvas);
    };
  }, [renderTelemetryCanvas]);

  // Resize map when switching back to Pillar 1 or 2
  useEffect(() => {
    if (activePillar === 'PILLAR_1_IMU' || activePillar === 'PILLAR_2_PET') {
      mapRef.current?.resize();
      renderTelemetryCanvas();
    }
  }, [activePillar, renderTelemetryCanvas]);

  // Interactive Map Click Handler
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleMapClick = (e: maplibregl.MapMouseEvent) => {
      const { lat, lng } = e.lngLat;

      if (activePillar === 'PILLAR_1_IMU' && isClickToAddNode) {
        const nextIdx = rawPoints.length + 1;
        const newPt: TelemetryPoint = {
          id: `PIN-${String(nextIdx).padStart(2, '0')}`,
          lat,
          lng,
          timestamp: Date.now() + nextIdx * 60000,
          accelMagnitude: 21.4,
          gyroRate: 4.5,
          transitMode: 'WALKING',
        };
        const updated = [...rawPoints, newPt];
        setRawPoints(updated);
        const evaluated = evaluateTrajectoryDropProbability(
          updated,
          updated[0].timestamp - 1000,
          newPt.timestamp + 1000
        );
        setScoredNodes(evaluated);
        setSelectedNode(evaluated[evaluated.length - 1]);
        setTrajectorySource('เส้นทางกำหนดเองบนแผนที่จริง');
      } else if (activePillar === 'PILLAR_2_PET') {
        if (petClickMode === 'MOVE_ORIGIN') {
          setPetOrigin({ lat, lng });
          setSightingCoord(null);
        } else {
          setSightingCoord({ lat, lng });
        }
      }
    };

    map.on('click', handleMapClick);
    return () => {
      map.off('click', handleMapClick);
    };
  }, [activePillar, isClickToAddNode, rawPoints, petClickMode]);

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

  // Pillar 4 QR Shield Canvas
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
      ctx.fillStyle = '#0B0C10';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

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

      ctx.strokeStyle = '#00F0FF';
      ctx.lineWidth = 3;
      ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);

      ctx.fillStyle = '#00F0FF';
      ctx.font = 'bold 18px sans-serif';
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

        ctx.strokeStyle = '#FFB800';
        ctx.lineWidth = 2;
        ctx.strokeRect(qrX - 8, qrY - 8, qrSize + 16, qrSize + 16);
        ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

        const badgeY = isLockscreen ? 690 : 395;
        ctx.fillStyle = 'rgba(255, 184, 0, 0.16)';
        ctx.fillRect(60, badgeY - 26, canvas.width - 120, 40);
        ctx.strokeStyle = '#FFB800';
        ctx.strokeRect(60, badgeY - 26, canvas.width - 120, 40);

        ctx.fillStyle = '#FFB800';
        ctx.font = 'bold 17px sans-serif';
        ctx.fillText(`รางวัลนำส่งคืน (BOUNTY): ${bountyAmount}`, canvas.width / 2, badgeY);

        ctx.fillStyle = '#E2E8F0';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText(ownerNote, canvas.width / 2, badgeY + 45);

        ctx.fillStyle = '#64748B';
        ctx.font = '11px sans-serif';
        ctx.fillText(
          'ไม่ต้องโหลดแอป • สแกนด้วยกล้องมือถือเพื่อแจ้งพิกัดของหายทันที',
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
    <div className="min-h-screen bg-[#0B0C10] text-slate-100 font-sans flex flex-col">
      {/* Top Navigation Bar */}
      <header className="border-b border-[#00F0FF]/20 bg-[#141720] px-5 py-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Radar className="w-7 h-7 text-[#00F0FF] animate-pulse" />
          <div>
            <h1 className="text-base md:text-lg font-bold tracking-wide text-[#00F0FF]">
              TRACE // ระบบพิกัดกู้คืนของหายและจำลองรัศมีสัตว์เลี้ยงด้วย AI
            </h1>
            <p className="text-xs text-slate-400">
              โหมดข้อมูล: {trajectorySource} • ฐานข้อมูลพิกัด PostGIS 30m พร้อมใช้งาน
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setActivePillar('PILLAR_1_IMU')}
            className={`px-3 py-2 text-xs font-bold rounded-md border transition cursor-pointer ${activePillar === 'PILLAR_1_IMU'
              ? 'bg-[#00F0FF]/20 border-[#00F0FF] text-[#00F0FF]'
              : 'border-slate-700 text-slate-300 hover:border-slate-500'
              }`}
          >
            วิเคราะห์จุดทำของตก (Lost Item)
          </button>
          <button
            onClick={() => setActivePillar('PILLAR_2_PET')}
            className={`px-3 py-2 text-xs font-bold rounded-md border transition cursor-pointer ${activePillar === 'PILLAR_2_PET'
              ? 'bg-[#FFB800]/20 border-[#FFB800] text-[#FFB800]'
              : 'border-slate-700 text-slate-300 hover:border-slate-500'
              }`}
          >
            จำลองรัศมีสัตว์เลี้ยงหาย (Lost Pet)
          </button>
          <button
            onClick={() => setActivePillar('PILLAR_3_VISION')}
            className={`px-3 py-2 text-xs font-bold rounded-md border transition cursor-pointer ${activePillar === 'PILLAR_3_VISION'
              ? 'bg-[#FF2A54]/20 border-[#FF2A54] text-[#FF2A54]'
              : 'border-slate-700 text-slate-300 hover:border-slate-500'
              }`}
          >
            แจ้งเจอของ & ยืนยันเจ้าของ (AI Vault)
          </button>
          <button
            onClick={() => setActivePillar('PILLAR_4_QR')}
            className={`px-3 py-2 text-xs font-bold rounded-md border transition flex items-center gap-1.5 cursor-pointer ${activePillar === 'PILLAR_4_QR'
              ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
              : 'border-slate-700 text-slate-300 hover:border-slate-500'
              }`}
          >
            <QrCode className="w-4 h-4" />
            <span>สร้าง QR ป้องกันของหาย</span>
          </button>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 relative overflow-hidden">
        {/* Left Control Panel */}
        <aside className="lg:col-span-4 bg-[#141720] border-r border-[#00F0FF]/20 p-5 overflow-y-auto space-y-4 max-h-[calc(100vh-72px)]">
          {activePillar === 'PILLAR_1_IMU' && (
            <>
              <div className="border border-[#00F0FF]/30 bg-[#0B0C10] p-4 rounded-lg space-y-3">
                <div className="flex items-center justify-between text-xs font-bold text-[#00F0FF]">
                  <span>ขั้นตอนที่ 1: เลือกวิธีนำเข้าเส้นทางของคุณ</span>
                  <Cpu className="w-4 h-4" />
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  ระบบคำนวณโอกาสทำของตก (<code className="text-[#00F0FF]">P_drop</code>) จากจุดที่หยุดนิ่งชั่วขณะ แรงกระตุกเซนเซอร์มือถือ และจังหวะก้าวลงจากยานพาหนะ
                </p>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setIsClickToAddNode(!isClickToAddNode)}
                    className={`py-2 px-2.5 rounded border text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${isClickToAddNode
                      ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300'
                      : 'border-[#00F0FF]/40 bg-[#141720] text-[#00F0FF] hover:border-[#00F0FF]'
                      }`}
                  >
                    <MousePointerClick className="w-4 h-4" />
                    <span>{isClickToAddNode ? 'คลิกแผนที่เพื่อปักหมุด...' : 'ปักหมุดเส้นทางเอง'}</span>
                  </button>

                  <button
                    onClick={resetDemoTrajectory}
                    className="py-2 px-2.5 rounded border border-slate-700 hover:border-slate-500 bg-[#141720] text-slate-300 text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>รีเซ็ตเส้นทางตัวอย่าง</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center justify-center gap-1.5 py-2 px-2.5 rounded border border-slate-700 hover:border-[#00F0FF] bg-[#141720] text-slate-200 text-xs font-bold cursor-pointer transition">
                    <FileUp className="w-4 h-4 text-[#00F0FF]" />
                    <span>อัปโหลด .GPX / .JSON</span>
                    <input
                      type="file"
                      accept=".gpx,.json,.xml"
                      onChange={handleTrajectoryUpload}
                      className="hidden"
                    />
                  </label>

                  <button
                    onClick={toggleLiveImuRecording}
                    className={`flex items-center justify-center gap-1.5 py-2 px-2.5 rounded border text-xs font-bold transition cursor-pointer ${isRecordingImu
                      ? 'border-[#FF2A54] bg-[#FF2A54]/20 text-[#FF2A54] animate-pulse'
                      : 'border-amber-500/40 hover:border-amber-400 bg-[#141720] text-amber-300'
                      }`}
                  >
                    <Activity className="w-4 h-4" />
                    <span>{isRecordingImu ? 'กำลังบันทึกเซนเซอร์...' : 'บันทึกเซนเซอร์มือถือสด'}</span>
                  </button>
                </div>

                <button
                  onClick={runSpatialIntersectionRadar}
                  disabled={isCheckingRadar}
                  className="w-full py-2.5 px-3 rounded bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400 text-emerald-300 text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <Radio className={`w-4 h-4 ${isCheckingRadar ? 'animate-spin' : ''}`} />
                  <span>
                    {isCheckingRadar
                      ? 'กำลังสแกนฐานข้อมูล PostGIS...'
                      : 'สแกนหาของที่คนเก็บได้ใกล้จุดเสี่ยง (<30 เมตร)'}
                  </span>
                </button>
              </div>

              {spatialMatches.length > 0 && (
                <div className="p-3.5 border border-emerald-400 bg-emerald-950/30 rounded-lg space-y-2 text-xs">
                  <div className="text-emerald-400 font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>พบสิ่งของในระบบตรงกับเส้นทางของคุณ ({spatialMatches.length} รายการ)</span>
                  </div>
                  {spatialMatches.map((m) => (
                    <div
                      key={m.vaultItemId}
                      className="p-2.5 bg-black/50 rounded border border-emerald-500/30 space-y-1"
                    >
                      <div className="flex justify-between font-bold text-emerald-300">
                        <span>{m.category} (ใกล้จุด {m.nodeId})</span>
                        <span>ห่าง {m.distance_meters} เมตร</span>
                      </div>
                      <p className="text-xs text-slate-300">{m.public_summary}</p>
                      <button
                        onClick={() => setActivePillar('PILLAR_3_VISION')}
                        className="text-xs text-[#00F0FF] underline font-bold pt-1 cursor-pointer"
                      >
                        → ไปยังหน้าตอบคำถามยืนยันตัวตนเพื่อรับของคืน
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                <h2 className="text-xs font-bold text-slate-300">
                  รายการจุดเสี่ยงทำของตกตามเส้นทาง ({scoredNodes.length} จุด) — คลิกเพื่อดูบนแผนที่
                </h2>
                {scoredNodes.map((node) => (
                  <div
                    key={node.id}
                    onClick={() => {
                      setSelectedNode(node);
                      mapRef.current?.flyTo({ center: [node.lng, node.lat], zoom: 16.5 });
                    }}
                    className={`p-3 rounded-lg border cursor-pointer transition ${selectedNode?.id === node.id
                      ? 'border-[#00F0FF] bg-[#00F0FF]/10'
                      : 'border-slate-800 bg-[#0B0C10]/80 hover:border-slate-600'
                      }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#00F0FF]">จุดพิกัด {node.id}</span>
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded ${node.dropProbability > 0.7
                          ? 'bg-[#FF2A54]/20 text-[#FF2A54]'
                          : node.dropProbability > 0.45
                            ? 'bg-[#FFB800]/20 text-[#FFB800]'
                            : 'bg-slate-800 text-slate-300'
                          }`}
                      >
                        โอกาสของตก {(node.dropProbability * 100).toFixed(1)}%
                      </span>
                    </div>
                    <p className="text-xs text-amber-300 mt-1">{node.anomalyReason}</p>
                    <div className="grid grid-cols-3 gap-2 mt-2 text-[11px] text-slate-400">
                      <div>หยุดนิ่ง: {node.dwellScore}</div>
                      <div>แรงกระตุก: {node.jerkScore}</div>
                      <div>เปลี่ยนพาหนะ: {node.transitScore}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {activePillar === 'PILLAR_2_PET' && (
            <div className="space-y-4">
              <div className="border border-[#FFB800]/40 bg-[#0B0C10] p-4 rounded-lg space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-[#FFB800]">
                  <span>จำลองรัศมีการเคลื่อนที่ของสัตว์เลี้ยง (Cellular Automata)</span>
                  <Navigation className="w-4 h-4" />
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  คำนวณความน่าจะเป็นที่สัตว์เลี้ยงจะหลบซ่อนตามภูมิประเทศจริง เลือกโหมดคลิกแผนที่ด้านล่างเพื่อย้ายจุดเริ่มต้น หรือแจ้งเบาะแสจุดที่พบเห็นล่าสุด:
                </p>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    onClick={() => setPetClickMode('MOVE_ORIGIN')}
                    className={`py-2 px-2 rounded border text-xs font-bold cursor-pointer ${petClickMode === 'MOVE_ORIGIN'
                      ? 'border-[#00F0FF] bg-[#00F0FF]/20 text-[#00F0FF]'
                      : 'border-slate-700 bg-[#141720] text-slate-300'
                      }`}
                  >
                    คลิกแผนที่เพื่อตั้งจุดที่หาย
                  </button>
                  <button
                    onClick={() => setPetClickMode('SIGHTING')}
                    className={`py-2 px-2 rounded border text-xs font-bold cursor-pointer ${petClickMode === 'SIGHTING'
                      ? 'border-[#FFB800] bg-[#FFB800]/20 text-[#FFB800]'
                      : 'border-slate-700 bg-[#141720] text-slate-300'
                      }`}
                  >
                    คลิกแผนที่เพื่อแจ้งจุดพบเห็น
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-300 block">
                  เลือกพฤติกรรมของสัตว์เลี้ยง
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'SHY_CAT', label: 'แมวขี้กลัว (ซ่อนตัว)' },
                    { id: 'SPOOKED_DOG', label: 'สุนัขตื่นตกใจ (วิ่งเร็ว)' },
                    { id: 'CURIOUS_DOG', label: 'สุนัขเชื่อง (เดินตามซอย)' },
                  ].map((item) => (
                    <button
                      key={item.id}
                      onClick={() => setPetProfile(item.id as PetBehaviorProfile)}
                      className={`py-2.5 px-2 text-xs rounded border font-bold cursor-pointer ${petProfile === item.id
                        ? 'border-[#FFB800] bg-[#FFB800]/20 text-[#FFB800]'
                        : 'border-slate-800 bg-[#0B0C10] text-slate-300'
                        }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-slate-300">เวลาที่ผ่านไปหลังจากหลุดหาย</span>
                  <span className="text-[#00F0FF]">{elapsedMinutes} นาที</span>
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
                className={`w-full py-2.5 px-3 rounded border text-xs font-bold flex items-center justify-center gap-2 transition cursor-pointer ${isStorming
                  ? 'border-[#00F0FF] bg-[#00F0FF]/20 text-[#00F0FF]'
                  : 'border-slate-800 bg-[#0B0C10] text-slate-300'
                  }`}
              >
                <CloudRain className="w-4 h-4" />
                {isStorming
                  ? 'โหมดฝนตก/ฟ้าร้อง: เปิดใช้งาน (สัตว์วิ่งหาที่หลบฝน 2 เท่า)'
                  : 'จำลองสภาพอากาศฝนตก / ฟ้าร้อง'}
              </button>

              {sightingCoord && (
                <button
                  onClick={() => setSightingCoord(null)}
                  className="w-full py-2 rounded border border-[#FF2A54] bg-[#FF2A54]/15 text-[#FF2A54] text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Crosshair className="w-4 h-4" />
                  รีเซ็ตกลับไปยังจุดเริ่มต้นที่สัตว์เลี้ยงหาย
                </button>
              )}
            </div>
          )}

          {activePillar === 'PILLAR_3_VISION' && (
            <div className="space-y-4">
              <div className="border border-[#FF2A54]/40 bg-[#0B0C10] p-4 rounded-lg space-y-1.5">
                <div className="flex items-center justify-between text-xs font-bold text-[#FF2A54]">
                  <span>ระบบ AI เบลอข้อมูลสำคัญ & ยืนยันความเป็นเจ้าของ</span>
                  <ShieldAlert className="w-4 h-4" />
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  1. ผู้พบของอัปโหลดรูปสิ่งของที่เก็บได้<br />
                  2. Gemini AI เบลอตำหนิลับ/ข้อมูลบัตรบนหน้าสาธารณะอัตโนมัติ<br />
                  3. เจ้าของตัวจริงตอบคำถามท้าทายด้านล่างเพื่อปลดล็อกจุดนัดรับ
                </p>
              </div>

              <label className="flex flex-col items-center justify-center border-2 border-dashed border-[#00F0FF]/50 hover:border-[#00F0FF] bg-[#0B0C10] rounded-lg p-5 cursor-pointer transition">
                <Upload className="w-6 h-6 text-[#00F0FF] mb-1.5" />
                <span className="text-xs text-[#00F0FF] font-bold">
                  ขั้นตอนที่ 1: อัปโหลดรูปสิ่งของที่พบ (JPG / PNG)
                </span>
                <span className="text-[11px] text-slate-400 mt-0.5">
                  ทดสอบด้วยรูปกระเป๋าสตางค์ บัตร หรือสิ่งของที่มีโลโก้/ตำหนิ
                </span>
                <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
              </label>

              {isScanning && (
                <div className="p-3.5 border border-[#00F0FF]/30 bg-[#0B0C10] rounded-lg text-xs text-[#00F0FF] flex items-center gap-3">
                  <Sparkles className="w-4 h-4 animate-spin shrink-0" />
                  <span>Gemini AI กำลังแยกตำหนิลับและเบลอข้อมูลสำคัญ...</span>
                </div>
              )}

              {scanError && (
                <div className="p-3 border border-[#FF2A54] bg-[#FF2A54]/10 rounded text-xs text-[#FF2A54]">
                  เกิดข้อผิดพลาด: {scanError}
                </div>
              )}

              {forensicData && (
                <div className="space-y-3 text-xs">
                  <div className="p-3.5 border border-emerald-500/40 bg-emerald-950/20 rounded-lg space-y-1">
                    <div className="flex items-center gap-2 text-emerald-400 font-bold mb-1">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>ข้อมูลทั่วไปที่แสดงต่อสาธารณะ (Public Macro Tags)</span>
                    </div>
                    <p><strong>หมวดหมู่:</strong> {forensicData.public_payload.category}</p>
                    <p><strong>สี:</strong> {forensicData.public_payload.color}</p>
                    <p><strong>แบรนด์:</strong> {forensicData.public_payload.brand}</p>
                    <p className="mt-1 text-slate-300">{forensicData.public_payload.public_summary}</p>
                  </div>

                  <form
                    onSubmit={handleGradeClaim}
                    className="p-3.5 border border-[#FFB800]/50 bg-[#0B0C10] rounded-lg space-y-3"
                  >
                    <div className="flex items-center justify-between text-[#FFB800] font-bold">
                      <div className="flex items-center gap-2">
                        <Lock className="w-4 h-4" />
                        <span>ขั้นตอนที่ 2: ตอบคำถามยืนยันความเป็นเจ้าของ</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowDevSpoilers(!showDevSpoilers)}
                        className="text-[11px] text-slate-400 hover:text-[#00F0FF] flex items-center gap-1 underline cursor-pointer"
                      >
                        <Eye className="w-3 h-3" />
                        {showDevSpoilers ? 'ซ่อนเฉลย' : 'ดูเฉลยในตู้นิรภัย (สำหรับกรรมการ)'}
                      </button>
                    </div>

                    <div className="space-y-1.5 text-slate-200 bg-[#141720] p-3 rounded border border-slate-800">
                      <p><strong>คำถาม (TH):</strong> {forensicData.challenge_prompt.th}</p>
                      <p className="text-slate-400"><strong>EN:</strong> {forensicData.challenge_prompt.en}</p>
                    </div>

                    {showDevSpoilers && (
                      <div className="p-2.5 bg-slate-900 border border-slate-700 rounded text-[11px] text-slate-300 space-y-1">
                        <p><strong>ความลับที่ถูกเบลอไว้:</strong> {forensicData.challenge_prompt.dev_preview_secret}</p>
                        <p><strong>คำสำคัญ (TH):</strong> {forensicData.challenge_prompt.dev_preview_keywords_th?.join(', ')}</p>
                        <p><strong>คำสำคัญ (EN):</strong> {forensicData.challenge_prompt.dev_preview_keywords_en?.join(', ')}</p>
                      </div>
                    )}

                    <div className="space-y-2">
                      <input
                        type="text"
                        value={claimantAnswer}
                        onChange={(e) => setClaimantAnswer(e.target.value)}
                        placeholder="พิมพ์คำตอบภาษาไทย หรือ ภาษาอังกฤษ..."
                        className="w-full bg-[#141720] border border-slate-700 focus:border-[#00F0FF] rounded px-3 py-2 text-xs text-white outline-none"
                      />
                      <button
                        type="submit"
                        disabled={isGrading || !claimantAnswer.trim()}
                        className="w-full py-2.5 px-3 rounded bg-[#00F0FF] hover:bg-[#00F0FF]/90 disabled:opacity-40 text-[#0B0C10] font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                        {isGrading ? 'กำลังตรวจคำตอบด้วย Gemini AI...' : 'ส่งคำตอบเพื่อปลดล็อกภาพและจุดนัดรับ'}
                      </button>
                    </div>
                  </form>

                  {claimResult && (
                    <div
                      className={`p-4 rounded-lg border space-y-2.5 ${claimResult.is_verified
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
                              ? 'ยืนยันเจ้าของสำเร็จ! ปลดล็อกภาพจริงแล้ว'
                              : 'คำตอบไม่ตรงกับข้อมูลในตู้นิรภัย'}
                          </span>
                        </div>
                        <span className="text-[11px] px-2 py-0.5 rounded bg-black/40">
                          ความแม่นยำ {claimResult.confidence_score}%
                        </span>
                      </div>

                      <p className="text-xs leading-relaxed">{claimResult.reasoning}</p>

                      {claimResult.is_verified && (
                        <div className="pt-2.5 border-t border-emerald-500/30 space-y-1.5">
                          <div className="flex items-center gap-1.5 text-[#00F0FF] font-bold text-xs">
                            <MapPin className="w-4 h-4" />
                            <span>Samaritan Shield // จุดนัดรับปลอดภัยที่มีกล้องวงจรปิด (CCTV)</span>
                          </div>
                          <p className="text-xs text-slate-200 bg-black/40 p-2.5 rounded border border-[#00F0FF]/30">
                            <strong>จุดนัดรับแนะนำ:</strong> {claimResult.safe_handoff_point}
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
              <div className="border border-emerald-400/40 bg-[#0B0C10] p-4 rounded-lg space-y-1">
                <div className="flex items-center justify-between text-emerald-300 font-bold">
                  <span>สร้างภาพพักหน้าจอ & สติกเกอร์ QR ป้องกันของหาย</span>
                  <QrCode className="w-4 h-4" />
                </div>
                <p className="text-slate-300 leading-relaxed">
                  เมื่อผู้พบของสแกน QR นี้ด้วยกล้องมือถือ จะเข้าสู่หน้าเว็บแจ้งพิกัดและถ่ายรูปส่งเข้าตู้นิรภัย AI ทันทีโดยไม่ต้องติดตั้งแอป
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setQrMode('LOCKSCREEN')}
                  className={`py-2 px-3 rounded border font-bold cursor-pointer ${qrMode === 'LOCKSCREEN'
                    ? 'border-[#00F0FF] bg-[#00F0FF]/15 text-[#00F0FF]'
                    : 'border-slate-800 bg-[#0B0C10] text-slate-400'
                    }`}
                >
                  ภาพหน้าจอล็อกมือถือ
                </button>
                <button
                  onClick={() => setQrMode('STICKER')}
                  className={`py-2 px-3 rounded border font-bold cursor-pointer ${qrMode === 'STICKER'
                    ? 'border-[#FFB800] bg-[#FFB800]/15 text-[#FFB800]'
                    : 'border-slate-800 bg-[#0B0C10] text-slate-400'
                    }`}
                >
                  สติกเกอร์ติดสิ่งของ
                </button>
              </div>

              <div className="space-y-1.5">
                <label className="block text-slate-300 font-bold">รหัสประจำสิ่งของ (Tag ID)</label>
                <input
                  type="text"
                  value={tagId}
                  onChange={(e) => setTagId(e.target.value)}
                  className="w-full bg-[#0B0C10] border border-slate-700 rounded px-3 py-2 text-white"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-slate-300 font-bold">รางวัลนำส่งคืน (Bounty)</label>
                <input
                  type="text"
                  value={bountyAmount}
                  onChange={(e) => setBountyAmount(e.target.value)}
                  className="w-full bg-[#0B0C10] border border-slate-700 rounded px-3 py-2 text-white"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-slate-300 font-bold">ข้อความบนป้าย</label>
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
                <span>ดาวน์โหลดรูปภาพ QR (.PNG)</span>
              </button>

              <a
                href={`/found?tag=${encodeURIComponent(tagId)}&bounty=${encodeURIComponent(bountyAmount)}`}
                target="_blank"
                rel="noreferrer"
                className="w-full py-2.5 px-4 rounded border border-[#00F0FF]/50 hover:border-[#00F0FF] text-[#00F0FF] font-bold flex items-center justify-center gap-2 transition"
              >
                <ExternalLink className="w-4 h-4" />
                <span>ทดสอบเปิดหน้าเว็บผู้พบของ (/found)</span>
              </a>
            </div>
          )}
        </aside>

        {/* Right Main Viewport */}
        <main className="lg:col-span-8 relative min-h-[560px] bg-[#0B0C10]">
          {(activePillar === 'PILLAR_1_IMU' || activePillar === 'PILLAR_2_PET') && (
            <div className="absolute top-4 left-4 right-4 z-10 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
              <div className="bg-slate-900/90 backdrop-blur border border-slate-700 px-3.5 py-2 rounded-lg shadow-lg text-xs text-slate-200 pointer-events-auto">
                {activePillar === 'PILLAR_1_IMU' ? (
                  isClickToAddNode ? (
                    <span className="text-emerald-300 font-bold">
                      [โหมดปักหมุดทำงานอยู่] คลิกจุดไหนก็ได้บนแผนที่เพื่อเพิ่มพิกัดทำของตก
                    </span>
                  ) : (
                    <span>
                      <strong>คำแนะนำ:</strong> คลิกการ์ดด้านซ้ายเพื่อซูมดูจุดเสี่ยง หรือกดปุ่ม <strong>"ปักหมุดเส้นทางเอง"</strong>
                    </span>
                  )
                ) : (
                  <span>
                    <strong>คำแนะนำ:</strong> คลิกบนแผนที่เพื่อ{' '}
                    <strong className="text-[#FFB800]">
                      {petClickMode === 'MOVE_ORIGIN'
                        ? 'ตั้งจุดเริ่มต้นที่สัตว์เลี้ยงหาย'
                        : 'แจ้งจุดที่มีคนพบเห็นสัตว์เลี้ยงล่าสุด'}
                    </strong>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 pointer-events-auto">
                <button
                  onClick={handleLocateMe}
                  className="bg-slate-900/90 hover:bg-slate-800 text-[#00F0FF] border border-[#00F0FF]/50 px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-lg cursor-pointer transition"
                >
                  <LocateFixed className="w-4 h-4" />
                  <span>พิกัดปัจจุบันของฉัน</span>
                </button>

                <button
                  onClick={toggleMapStyle}
                  className="bg-slate-900/90 hover:bg-slate-800 text-white border border-slate-600 px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-lg cursor-pointer transition"
                >
                  <MapIcon className="w-4 h-4 text-[#FFB800]" />
                  <span>
                    {mapStyleMode === 'STREET_LIGHT'
                      ? 'สลับเป็นโหมดเรดาร์มืด'
                      : 'สลับเป็นแผนที่ถนนจริง'}
                  </span>
                </button>
              </div>
            </div>
          )}

          <div
            ref={mapContainerRef}
            className={`absolute inset-0 w-full h-full min-h-[560px] ${activePillar === 'PILLAR_1_IMU' || activePillar === 'PILLAR_2_PET'
              ? 'block'
              : 'hidden'
              }`}
          />
          <canvas
            ref={overlayCanvasRef}
            className={`pointer-events-none absolute inset-0 w-full h-full ${activePillar === 'PILLAR_1_IMU' || activePillar === 'PILLAR_2_PET'
              ? 'block'
              : 'hidden'
              }`}
          />

          {activePillar === 'PILLAR_3_VISION' && (
            <div className="w-full h-full min-h-[560px] flex flex-col items-center justify-center p-6 bg-[#0B0C10]">
              {imageSrc ? (
                <div className="space-y-3 max-w-full">
                  <div
                    className={`text-xs flex items-center gap-2 font-bold ${claimResult?.is_verified ? 'text-emerald-400' : 'text-[#FF2A54]'
                      }`}
                  >
                    {claimResult?.is_verified ? (
                      <>
                        <Unlock className="w-4 h-4" />
                        <span>ยืนยันตัวตนเจ้าของสำเร็จ // เปิดเผยภาพต้นฉบับแล้ว</span>
                      </>
                    ) : (
                      <>
                        <EyeOff className="w-4 h-4" />
                        <span>ภาพสำหรับแสดงต่อสาธารณะ (AI เบลอตำหนิลับและข้อมูลสำคัญแล้ว)</span>
                      </>
                    )}
                  </div>
                  <canvas
                    ref={redactCanvasRef}
                    className="max-h-[480px] w-auto border border-[#00F0FF]/30 rounded-lg shadow-lg"
                  />
                </div>
              ) : (
                <div className="text-center text-slate-400 text-xs space-y-2 max-w-sm">
                  <ShieldAlert className="w-12 h-12 mx-auto text-[#00F0FF]/60" />
                  <p className="font-bold text-sm text-slate-200">
                    ยังไม่มีรูปภาพสิ่งของในหน้าต่างตรวจสอบ
                  </p>
                  <p>
                    กดปุ่ม <strong>"อัปโหลดรูปสิ่งของที่พบ"</strong> ด้านซ้ายมือ เพื่อให้ Gemini Vision AI ตรวจจับตำหนิและสร้างกรอบเบลออัตโนมัติ
                  </p>
                </div>
              )}
            </div>
          )}

          {activePillar === 'PILLAR_4_QR' && (
            <div className="w-full h-full min-h-[560px] flex flex-col items-center justify-center p-6 bg-[#0B0C10]">
              <canvas
                ref={qrCanvasRef}
                className="max-h-[520px] w-auto border border-emerald-400/40 rounded-lg shadow-2xl"
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}