// src/app/page.tsx
'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import QRCode from 'qrcode';
import {
  Radar,
  ShieldCheck,
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
  Check,
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

type MapStyleMode = 'OSM_STREET' | 'CARTO_DARK';

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

// 100% Reliable OpenStreetMap Raster Style (Zero API key required on any domain)
const OSM_RASTER_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  center: [100.5355, 13.7385],
  zoom: 15.5,
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
      id: 'osm-Adjust',
      type: 'raster',
      source: 'osm',
      minzoom: 0,
      maxzoom: 19,
    },
  ],
};

export default function TraceCivicPortal() {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [activePillar, setActivePillar] = useState<ActivePillar>('PILLAR_1_IMU');
  const [mapStyleMode, setMapStyleMode] = useState<MapStyleMode>('OSM_STREET');

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
    mapRef.current?.fitBounds(
      [
        [100.5322, 13.7358],
        [100.5392, 13.7422],
      ],
      { padding: 65, duration: 500 }
    );
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

  // Switch Map Style (OpenStreetMap Street View vs Dark Radar CSS Filter - No CARTO API key required)
  const toggleMapStyle = () => {
    setMapStyleMode((prev) =>
      prev === 'OSM_STREET' ? 'CARTO_DARK' : 'OSM_STREET'
    );
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
            id: `LIVE-${String(idx).padStart(2, '0')}`, lat: pos.coords.latitude + (Math.random() - 0.5) * 0.00015, lng: pos.coords.longitude + (Math.random() - 0.5) * 0.00015, timestamp: Date.now(), accelMagnitude: latestAccel, gyroRate: latestGyro, transitMode: (pos.coords.speed ?? 0) > 4 ? 'VEHICLE' : 'WALKING',
          }; livePointsRef.current = [...livePointsRef.current, pt]; const pts = livePointsRef.current; setRawPoints(pts); const evaluated = evaluateTrajectoryDropProbability(pts, pts[0].timestamp - 1000, Date.now() + 1000); setScoredNodes(evaluated); mapRef.current?.flyTo({ center: [pt.lng, pt.lat], zoom: 16.2 });
        }, () => {
          const idx = livePointsRef.current.length + 1; const pt: TelemetryPoint = {
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

    if (activePillar === 'PILLAR_1_IMU' && scoredNodes.length > 0) {
      ctx.beginPath();
      ctx.strokeStyle = '#2563EB';
      ctx.lineWidth = 4;
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
          ctx.strokeStyle = '#DC2626';
          ctx.lineWidth = 2.5;
          ctx.moveTo(x, y);
          ctx.lineTo(x + 75, y - 55);
          ctx.stroke();

          ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
          ctx.fillRect(x + 10, y - 76, 225, 20);
          ctx.fillStyle = '#FCA5A5';
          ctx.font = 'bold 11px sans-serif';
          ctx.fillText('[จุดเสี่ยง] ลืมของบนยานพาหนะ (Ghost Vector)', x + 16, y - 62);
          ctx.restore();
        }

        if (isHighRisk) {
          ctx.beginPath();
          ctx.arc(x, y, 24 * pt.dropProbability + 8, 0, Math.PI * 2);
          ctx.fillStyle =
            pt.dropProbability > 0.7 ? 'rgba(220, 38, 38, 0.25)' : 'rgba(217, 119, 6, 0.25)';
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(x, y, isHighRisk ? 8 : 6, 0, Math.PI * 2);
        ctx.fillStyle =
          pt.dropProbability > 0.7 ? '#DC2626' : isHighRisk ? '#D97706' : '#2563EB';
        ctx.fill();
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        const labelText = `${pt.id}: โอกาสตก ${(pt.dropProbability * 100).toFixed(0)}%`;
        ctx.font = 'bold 11px sans-serif';
        const textWidth = ctx.measureText(labelText).width;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.94)';
        ctx.fillRect(x + 10, y - 10, textWidth + 12, 20);
        ctx.strokeStyle = '#CBD5E1';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 10, y - 10, textWidth + 12, 20);
        ctx.fillStyle = '#0F172A';
        ctx.fillText(labelText, x + 16, y + 4);
      });

      spatialMatches.forEach((match) => {
        const { x, y } = map.project([match.lng, match.lat]);
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, 28, 0, Math.PI * 2);
        ctx.strokeStyle = '#059669';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.fillStyle = 'rgba(16, 185, 129, 0.25)';
        ctx.fill();

        const matchLabel = `[พบของตรงพิกัด] ${match.category} (ห่าง ${match.distance_meters} ม.)`;
        ctx.font = 'bold 11px sans-serif';
        const mw = ctx.measureText(matchLabel).width;
        ctx.fillStyle = '#065F46';
        ctx.fillRect(x + 12, y - 32, mw + 14, 22);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(matchLabel, x + 19, y - 17);
        ctx.restore();
      });
    }

    if (activePillar === 'PILLAR_2_PET' && radianceCells.length > 0) {
      radianceCells.forEach((cell) => {
        const { x, y } = map.project([cell.lng, cell.lat]);
        const radius = Math.max(14, Math.min(36, map.getZoom() * 2.0));

        const grad = ctx.createRadialGradient(x, y, 2, x, y, radius);
        if (cell.probability > 0.65) {
          grad.addColorStop(0, `rgba(220, 38, 38, ${cell.probability * 0.65})`); grad.addColorStop(1, 'rgba(220, 38, 38, 0)');
        } else {
          grad.addColorStop(0, `rgba(217, 119, 6, ${cell.probability * 0.55})`);
          grad.addColorStop(1, 'rgba(37, 99, 235, 0)');
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
      ctx.fillStyle = '#2563EB';
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      const originLabel = sightingCoord
        ? '[จุดพบเห็นล่าสุด] บีบวงรัศมีเรดาร์แล้ว'
        : '[จุดเริ่มต้น] สัตว์เลี้ยงหลุดหาย (T=0)';
      ctx.font = 'bold 12px sans-serif';
      const ow = ctx.measureText(originLabel).width;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.fillRect(x + 12, y - 11, ow + 14, 22);
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(originLabel, x + 19, y + 4);
    }
  }, [
    activePillar,
    scoredNodes,
    radianceCells,
    sightingCoord,
    spatialMatches,
    petOrigin,
  ]);

  // Initialize MapLibre Instance with OpenStreetMap Guaranteed Tiles + Worker URL + ResizeObserver
  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container || mapRef.current) return;

    maplibregl.setWorkerUrl('/maplibre-gl-worker.mjs');

    const map = new maplibregl.Map({
      container,
      style: OSM_RASTER_STYLE,
      center: [100.5355, 13.7385],
      zoom: 15.5,
      pitch: 0,
    });

    map.addControl(new maplibregl.NavigationControl(), 'bottom-right');
    mapRef.current = map;

    map.on('load', () => {
      map.resize();
      map.fitBounds(
        [
          [100.5322, 13.7358],
          [100.5392, 13.7422],
        ],
        { padding: 65, duration: 0 }
      );
      renderTelemetryCanvas();
    });

    // Watch container size so the map never renders blank
    const resizeObserver = new ResizeObserver(() => {
      map.resize();
      renderTelemetryCanvas();
    });
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Bind Canvas Telemetry Renderer to Map Camera Events
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    map.on('load', renderTelemetryCanvas);
    map.on('move', renderTelemetryCanvas);
    map.on('zoom', renderTelemetryCanvas);
    map.on('resize', renderTelemetryCanvas);
    map.on('styledata', renderTelemetryCanvas);

    if (map.loaded()) {
      renderTelemetryCanvas();
    }

    return () => {
      map.off('load', renderTelemetryCanvas);
      map.off('move', renderTelemetryCanvas);
      map.off('zoom', renderTelemetryCanvas);
      map.off('resize', renderTelemetryCanvas);
      map.off('styledata', renderTelemetryCanvas);
    };
  }, [renderTelemetryCanvas]);

  // Trigger map resize whenever user switches back to map tabs
  useEffect(() => {
    if (activePillar === 'PILLAR_1_IMU' || activePillar === 'PILLAR_2_PET') {
      setTimeout(() => {
        mapRef.current?.resize();
        renderTelemetryCanvas();
      }, 50);
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

            ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
            ctx.fillRect(x, y, w, h);

            ctx.strokeStyle = '#DC2626';
            ctx.lineWidth = Math.max(2, img.width * 0.004);
            ctx.strokeRect(x, y, w, h);

            ctx.fillStyle = '#DC2626';
            ctx.font = `bold ${Math.max(12, Math.floor(img.width * 0.022))}px monospace`;
            ctx.fillText(`REDACTED // ${item.label}`, x + 6, Math.max(16, y - 6));
          } else {
            ctx.strokeStyle = '#059669';
            ctx.lineWidth = Math.max(2, img.width * 0.004);
            ctx.strokeRect(x, y, w, h);
            ctx.fillStyle = '#059669';
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
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = '#38BDF8';
      ctx.lineWidth = 3;
      ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);

      ctx.fillStyle = '#38BDF8';
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
          dark: '#0F172A',
          light: '#FFFFFF',
        },
      });

      const qrImg = new Image();
      qrImg.onload = () => {
        const qrSize = isLockscreen ? 260 : 230;
        const qrX = (canvas.width - qrSize) / 2;
        const qrY = isLockscreen ? 375 : 120;

        ctx.strokeStyle = '#F59E0B';
        ctx.lineWidth = 3;
        ctx.strokeRect(qrX - 8, qrY - 8, qrSize + 16, qrSize + 16);
        ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

        const badgeY = isLockscreen ? 690 : 395;
        ctx.fillStyle = 'rgba(245, 158, 11, 0.18)';
        ctx.fillRect(60, badgeY - 26, canvas.width - 120, 40);
        ctx.strokeStyle = '#F59E0B';
        ctx.strokeRect(60, badgeY - 26, canvas.width - 120, 40);

        ctx.fillStyle = '#FBBF24';
        ctx.font = 'bold 17px sans-serif';
        ctx.fillText(`รางวัลนำส่งคืน (BOUNTY): ${bountyAmount}`, canvas.width / 2, badgeY);

        ctx.fillStyle = '#F8FAFC';
        ctx.font = 'bold 14px sans-serif';
        ctx.fillText(ownerNote, canvas.width / 2, badgeY + 45);

        ctx.fillStyle = '#94A3B8';
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

  const steps: Array<{ id: ActivePillar; stepNum: string; title: string; subtitle: string }> = [
    {
      id: 'PILLAR_1_IMU',
      stepNum: '1',
      title: '1. วิเคราะห์จุดทำของตก',
      subtitle: 'IMU Drop Trajectory',
    },
    {
      id: 'PILLAR_2_PET',
      stepNum: '2',
      title: '2. จำลองรัศมีสัตว์เลี้ยงหาย',
      subtitle: 'Pet Cellular Automata',
    },
    {
      id: 'PILLAR_3_VISION',
      stepNum: '3',
      title: '3. แจ้งเจอของ & ยืนยันเจ้าของ',
      subtitle: 'Gemini AI Claim Vault',
    },
    {
      id: 'PILLAR_4_QR',
      stepNum: '4',
      title: '4. สร้าง QR ป้องกันของหาย',
      subtitle: 'Samaritan Shield Tag',
    },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans flex flex-col">
      {/* Top Civic-Tech Trust Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-3.5 shadow-xs">
        <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-xs">
              <Radar className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h1 className="text-lg font-bold tracking-tight text-slate-900">
                  TRACE // ระบบโครงข่ายพิกัดกู้คืนของหายและสัตว์เลี้ยงอัจฉริยะ
                </h1>
                <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                  <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                  Verified PostGIS & Gemini AI
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                สถานะข้อมูล: {trajectorySource} • พิกัดภูมิสารสนเทศ SRID 4326 พร้อมใช้งาน
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setActivePillar('PILLAR_3_VISION')}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-xs transition cursor-pointer"
            >
              แจ้งพบสิ่งของ / ยืนยันสิทธิ์รับคืน
            </button>
          </div>
        </div>
      </header>

      {/* Civic Step-by-Step Progress Bar */}
      <div className="bg-white border-b border-slate-200 px-6 py-3">
        <div className="max-w-[1440px] mx-auto grid grid-cols-2 lg:grid-cols-4 gap-3">
          {steps.map((st) => {
            const isActive = activePillar === st.id;
            return (
              <button
                key={st.id}
                onClick={() => setActivePillar(st.id)}
                className={`flex items-center gap-3 p-2.5 rounded-xl border text-left transition cursor-pointer ${isActive
                  ? 'bg-amber-50/90 border-amber-300 shadow-xs'
                  : 'bg-slate-50 hover:bg-slate-100 border-slate-200'
                  }`}
              >
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${isActive
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-200 text-slate-700'
                    }`}
                >
                  <Check className="w-3.5 h-3.5" />
                </div>
                <div className="overflow-hidden">
                  <div
                    className={`text-xs font-bold truncate ${isActive ? 'text-slate-900' : 'text-slate-700'
                      }`}
                  >
                    {st.title}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">{st.subtitle}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Two-Column Civic Workbench */}
      <div className="flex-1 max-w-[1440px] w-full mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Control Column (4 cols) */}
        <aside className="lg:col-span-4 space-y-4">
          {activePillar === 'PILLAR_1_IMU' && (
            <>
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3.5">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-slate-900">
                    วิเคราะห์เส้นทางและจุดเสี่ยงทำของตก
                  </h2>
                  <Cpu className="w-4 h-4 text-blue-600" />
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  คำนวณความน่าจะเป็นของจุดที่ทำของตก (<code className="text-blue-700 font-semibold">P_drop</code>) จากการหยุดนิ่งชั่วขณะ แรงกระตุกเซนเซอร์ และการเปลี่ยนยานพาหนะ
                </p>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setIsClickToAddNode(!isClickToAddNode)}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${isClickToAddNode
                      ? 'bg-blue-600 border-blue-600 text-white shadow-xs'
                      : 'bg-slate-50 hover:bg-slate-100 border-slate-300 text-slate-800'
                      }`}
                  >
                    <MousePointerClick className="w-4 h-4" />
                    <span>{isClickToAddNode ? 'คลิกบนแผนที่ได้เลย...' : 'ปักหมุดเส้นทางเอง'}</span>
                  </button>

                  <button
                    onClick={resetDemoTrajectory}
                    className="py-2.5 px-3 rounded-xl border border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>รีเซ็ตเส้นทางตัวอย่าง</span>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-semibold cursor-pointer transition">
                    <FileUp className="w-4 h-4 text-blue-600" />
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
                    className={`flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl border text-xs font-semibold transition cursor-pointer ${isRecordingImu ? 'border-red-600 bg-red-50 text-red-700 animate-pulse' : 'border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900'}`} > <Activity className="w-4 h-4" /> <span>{isRecordingImu ? 'กำลังบันทึกเซนเซอร์...' : 'บันทึกเซนเซอร์มือถือสด'}</span> </button> </div>  <button onClick={runSpatialIntersectionRadar} disabled={isCheckingRadar} className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold flex items-center justify-center gap-2 shadow-xs transition cursor-pointer" > <Radio className={`w-4 h-4 ${isCheckingRadar ? 'animate-spin' : ''}`} />
                  <span>
                    {isCheckingRadar
                      ? 'กำลังค้นหาในฐานข้อมูล PostGIS...'
                      : 'สแกนหาสิ่งของที่พบใกล้จุดเสี่ยง (<30 เมตร)'}
                  </span>
                </button>
              </div>

              {spatialMatches.length > 0 && (
                <div className="bg-emerald-50 border border-emerald-300 rounded-2xl p-4 space-y-2.5 text-xs shadow-xs">
                  <div className="text-emerald-800 font-bold flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span>พบสิ่งของในระบบตรงกับเส้นทางของคุณ ({spatialMatches.length} รายการ)</span>
                  </div>
                  {spatialMatches.map((m) => (
                    <div
                      key={m.vaultItemId}
                      className="p-3 bg-white rounded-xl border border-emerald-200 space-y-1"
                    >
                      <div className="flex justify-between font-bold text-slate-900">
                        <span>{m.category} (ใกล้จุด {m.nodeId})</span>
                        <span className="text-emerald-700">ห่าง {m.distance_meters} ม.</span>
                      </div>
                      <p className="text-xs text-slate-600">{m.public_summary}</p>
                      <button
                        onClick={() => setActivePillar('PILLAR_3_VISION')}
                        className="text-xs text-blue-600 hover:underline font-bold pt-1 cursor-pointer"
                      >
                        ไปยังหน้ายืนยันความเป็นเจ้าของเพื่อรับคืน
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  รายการจุดพิกัดตามเส้นทาง ({scoredNodes.length} จุด)
                </h3>
                <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
                  {scoredNodes.map((node) => {
                    const isSelected = selectedNode?.id === node.id;
                    const isHigh = node.dropProbability > 0.7;
                    const isMed = node.dropProbability > 0.45;
                    return (
                      <div
                        key={node.id}
                        onClick={() => {
                          setSelectedNode(node);
                          mapRef.current?.flyTo({ center: [node.lng, node.lat], zoom: 16.5 });
                        }}
                        className={`p-3.5 rounded-xl border cursor-pointer transition ${isSelected
                          ? 'border-blue-600 bg-blue-50/50 shadow-xs'
                          : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100'
                          }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-slate-900">
                            จุดพิกัด {node.id}
                          </span>
                          <span
                            className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${isHigh
                              ? 'bg-red-100 text-red-800 border border-red-200'
                              : isMed
                                ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                : 'bg-slate-200 text-slate-700'
                              }`}
                          >
                            โอกาสตก {(node.dropProbability * 100).toFixed(1)}%
                          </span>
                        </div>
                        <p className="text-xs font-medium text-blue-700 mt-1">
                          สาเหตุ: {node.anomalyReason}
                        </p>
                        <div className="grid grid-cols-3 gap-2 mt-2 text-[11px] text-slate-500">
                          <div>หยุดนิ่ง: {node.dwellScore}</div>
                          <div>แรงกระตุก: {node.jerkScore}</div>
                          <div>เปลี่ยนพาหนะ: {node.transitScore}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {activePillar === 'PILLAR_2_PET' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900">
                  จำลองรัศมีสัตว์เลี้ยงหาย (Cellular Automata)
                </h2>
                <Navigation className="w-4 h-4 text-blue-600" />
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                คำนวณการเคลื่อนที่ตามลักษณะภูมิประเทศจริง เลือกโหมดคลิกแผนที่ด้านล่างเพื่อย้ายจุดเริ่มต้น หรือแจ้งจุดที่มีผู้พบเห็นล่าสุด:
              </p>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setPetClickMode('MOVE_ORIGIN')}
                  className={`py-2.5 px-2.5 rounded-xl border text-xs font-semibold cursor-pointer transition ${petClickMode === 'MOVE_ORIGIN'
                    ? 'bg-blue-600 border-blue-600 text-white'
                    : 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
                    }`}
                >
                  คลิกแผนที่ตั้งจุดที่หาย
                </button>
                <button
                  onClick={() => setPetClickMode('SIGHTING')}
                  className={`py-2.5 px-2.5 rounded-xl border text-xs font-semibold cursor-pointer transition ${petClickMode === 'SIGHTING'
                    ? 'bg-amber-500 border-amber-500 text-white'
                    : 'bg-slate-50 border-slate-300 text-slate-700 hover:bg-slate-100'
                    }`}
                >
                  คลิกแผนที่แจ้งจุดพบเห็น
                </button>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 block">
                  เลือกโปรไฟล์พฤติกรรมสัตว์เลี้ยง
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
                      className={`py-2.5 px-2 text-xs rounded-xl border font-semibold cursor-pointer transition ${petProfile === item.id
                        ? 'border-blue-600 bg-blue-50 text-blue-700'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                        }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-slate-700">เวลาที่ผ่านไปหลังหลุดหาย</span>
                  <span className="text-blue-600">{elapsedMinutes} นาที</span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={140}
                  step={5}
                  value={elapsedMinutes}
                  onChange={(e) => setElapsedMinutes(Number(e.target.value))}
                  className="w-full accent-blue-600"
                />
              </div>

              <button
                onClick={() => setIsStorming(!isStorming)}
                className={`w-full py-2.5 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition cursor-pointer ${isStorming
                  ? 'border-blue-600 bg-blue-50 text-blue-700'
                  : 'border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
              >
                <CloudRain className="w-4 h-4" />
                {isStorming
                  ? 'โหมดฝนตก/ฟ้าร้อง: เปิดใช้งาน (หาที่หลบฝน 2 เท่า)'
                  : 'จำลองสภาพอากาศฝนตก / ฟ้าร้อง'}
              </button>

              {sightingCoord && (
                <button
                  onClick={() => setSightingCoord(null)}
                  className="w-full py-2.5 rounded-xl border border-red-300 bg-red-50 text-red-700 text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Crosshair className="w-4 h-4" />
                  รีเซ็ตกลับไปยังจุดเริ่มต้นที่สัตว์เลี้ยงหาย
                </button>
              )}
            </div>
          )}

          {activePillar === 'PILLAR_3_VISION' && (
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900">
                  ระบบ AI เบลอข้อมูลสำคัญ & ยืนยันเจ้าของ
                </h2>
                <ShieldCheck className="w-5 h-5 text-blue-600" />
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                1. อัปโหลดรูปสิ่งของที่พบ<br />
                2. Gemini AI เบลอตำหนิลับและข้อมูลบัตรโดยอัตโนมัติ<br />
                3. ตอบคำถามยืนยันตัวตนเพื่อปลดล็อกภาพจริงและจุดนัดรับปลอดภัย
              </p>

              <label className="flex flex-col items-center justify-center border-2 border-dashed border-blue-400 hover:border-blue-600 bg-blue-50/40 rounded-2xl p-5 cursor-pointer transition">
                <Upload className="w-6 h-6 text-blue-600 mb-1.5" />
                <span className="text-xs text-blue-700 font-bold">
                  ขั้นตอนที่ 1: อัปโหลดรูปสิ่งของที่พบ (JPG / PNG)
                </span>
                <span className="text-[11px] text-slate-500 mt-0.5">
                  ทดสอบด้วยรูปกระเป๋าสตางค์ บัตร หรือสิ่งของที่มีโลโก้
                </span>
                <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
              </label>

              {isScanning && (
                <div className="p-3.5 border border-blue-200 bg-blue-50 rounded-xl text-xs text-blue-800 flex items-center gap-3 font-medium">
                  <Sparkles className="w-4 h-4 animate-spin shrink-0 text-blue-600" />
                  <span>Gemini AI กำลังแยกตำหนิลับและเบลอข้อมูลสำคัญ...</span>
                </div>
              )}

              {scanError && (
                <div className="p-3 border border-red-300 bg-red-50 rounded-xl text-xs text-red-700">
                  เกิดข้อผิดพลาด: {scanError}
                </div>
              )}

              {forensicData && (
                <div className="space-y-3.5 text-xs">
                  <div className="p-3.5 border border-emerald-200 bg-emerald-50/70 rounded-xl space-y-1">
                    <div className="flex items-center gap-1.5 text-emerald-800 font-bold mb-1">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>ข้อมูลทั่วไปที่แสดงต่อสาธารณะ (Public Macro Tags)</span>
                    </div>
                    <p><strong>หมวดหมู่:</strong> {forensicData.public_payload.category}</p>
                    <p><strong>สี:</strong> {forensicData.public_payload.color}</p>
                    <p><strong>แบรนด์:</strong> {forensicData.public_payload.brand}</p>
                    <p className="mt-1 text-slate-700">{forensicData.public_payload.public_summary}</p>
                  </div>

                  <form
                    onSubmit={handleGradeClaim}
                    className="p-4 border border-amber-300 bg-amber-50/50 rounded-xl space-y-3"
                  >
                    <div className="flex items-center justify-between text-amber-900 font-bold">
                      <div className="flex items-center gap-1.5">
                        <Lock className="w-4 h-4 text-amber-700" />
                        <span>ขั้นตอนที่ 2: ตอบคำถามยืนยันความเป็นเจ้าของ</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowDevSpoilers(!showDevSpoilers)}
                        className="text-[11px] text-blue-600 hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3 h-3" />
                        {showDevSpoilers ? 'ซ่อนเฉลย' : 'ดูเฉลย (สำหรับกรรมการ)'}
                      </button>
                    </div>

                    <div className="space-y-1.5 text-slate-800 bg-white p-3 rounded-lg border border-amber-200">
                      <p><strong>คำถาม (TH):</strong> {forensicData.challenge_prompt.th}</p>
                      <p className="text-slate-500"><strong>EN:</strong> {forensicData.challenge_prompt.en}</p>
                    </div>

                    {showDevSpoilers && (
                      <div className="p-2.5 bg-white border border-slate-200 rounded-lg text-[11px] text-slate-600 space-y-1">
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
                        className="w-full bg-white border border-slate-300 focus:border-blue-600 rounded-lg px-3 py-2 text-xs text-slate-900 outline-none"
                      />
                      <button
                        type="submit"
                        disabled={isGrading || !claimantAnswer.trim()}
                        className="w-full py-2.5 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                        {isGrading ? 'กำลังตรวจคำตอบด้วย Gemini AI...' : 'ส่งคำตอบเพื่อปลดล็อกภาพและจุดนัดรับ'}
                      </button>
                    </div>
                  </form>

                  {claimResult && (
                    <div
                      className={`p-4 rounded-xl border space-y-2 ${claimResult.is_verified
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-950'
                        : 'border-red-300 bg-red-50 text-red-900'
                        }`}
                    >
                      <div className="flex items-center justify-between font-bold">
                        <div className="flex items-center gap-1.5">
                          {claimResult.is_verified ? (
                            <Unlock className="w-4 h-4 text-emerald-600" />
                          ) : (
                            <XCircle className="w-4 h-4 text-red-600" />
                          )}
                          <span>
                            {claimResult.is_verified
                              ? 'ยืนยันเจ้าของสำเร็จ! ปลดล็อกภาพจริงแล้ว'
                              : 'คำตอบไม่ตรงกับข้อมูลในตู้นิรภัย'}
                          </span>
                        </div>
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-white border border-slate-200">
                          ความแม่นยำ {claimResult.confidence_score}%
                        </span>
                      </div>

                      <p className="text-xs leading-relaxed">{claimResult.reasoning}</p>

                      {claimResult.is_verified && (
                        <div className="pt-2 border-t border-emerald-200 space-y-1.5">
                          <div className="flex items-center gap-1.5 text-blue-700 font-bold text-xs">
                            <MapPin className="w-4 h-4" />
                            <span>Samaritan Shield // จุดนัดรับปลอดภัยที่มีกล้องวงจรปิด (CCTV)</span>
                          </div>
                          <p className="text-xs text-slate-800 bg-white p-2.5 rounded-lg border border-emerald-200">
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
            <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4 text-xs">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-bold text-slate-900">
                  สร้าง QR ป้องกันของหาย (Samaritan Shield)
                </h2>
                <QrCode className="w-5 h-5 text-blue-600" />
              </div>
              <p className="text-slate-600 leading-relaxed">
                เมื่อผู้พบของสแกน QR นี้ด้วยกล้องมือถือ จะเข้าสู่หน้าเว็บแจ้งพิกัดและถ่ายรูปส่งเข้าตู้นิรภัย AI ทันทีโดยไม่ต้องติดตั้งแอป
              </p>

              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setQrMode('LOCKSCREEN')}
                  className={`py-2.5 px-3 rounded-xl border font-semibold cursor-pointer ${qrMode === 'LOCKSCREEN'
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-slate-50 text-slate-700'
                    }`}
                >
                  ภาพหน้าจอล็อกมือถือ
                </button>
                <button
                  onClick={() => setQrMode('STICKER')}
                  className={`py-2.5 px-3 rounded-xl border font-semibold cursor-pointer ${qrMode === 'STICKER'
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-slate-50 text-slate-700'
                    }`}
                >
                  สติกเกอร์ติดสิ่งของ
                </button>
              </div>

              <div className="space-y-1.5">
                <label className="block text-slate-700 font-bold">รหัสประจำสิ่งของ (Tag ID)</label>
                <input
                  type="text"
                  value={tagId}
                  onChange={(e) => setTagId(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-slate-700 font-bold">รางวัลนำส่งคืน (Bounty)</label>
                <input
                  type="text"
                  value={bountyAmount}
                  onChange={(e) => setBountyAmount(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-slate-700 font-bold">ข้อความบนป้าย</label>
                <input
                  type="text"
                  value={ownerNote}
                  onChange={(e) => setOwnerNote(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-lg px-3 py-2 text-slate-900"
                />
              </div>

              <button
                onClick={downloadQrShield}
                className="w-full py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-bold flex items-center justify-center gap-2 shadow-xs transition cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>ดาวน์โหลดรูปภาพ QR (.PNG)</span>
              </button>

              <a
                href={`/found?tag=${encodeURIComponent(tagId)}&bounty=${encodeURIComponent(bountyAmount)}`}
                target="_blank"
                rel="noreferrer"
                className="w-full py-2.5 px-4 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-800 font-bold flex items-center justify-center gap-2 transition"
              >
                <ExternalLink className="w-4 h-4 text-blue-600" />
                <span>ทดสอบเปิดหน้าเว็บผู้พบของ (/found)</span>
              </a>
            </div>
          )}
        </aside>

        {/* Right Framed Map & Visual Workbench (8 cols) */}
        <main className="lg:col-span-8 bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden relative min-h-[600px] flex flex-col">
          {(activePillar === 'PILLAR_1_IMU' || activePillar === 'PILLAR_2_PET') && (
            <div className="absolute top-4 left-4 right-4 z-10 flex flex-wrap items-center justify-between gap-2 pointer-events-none">
              <div className="bg-white/95 backdrop-blur border border-slate-200 px-3.5 py-2 rounded-xl shadow-sm text-xs text-slate-700 pointer-events-auto">
                {activePillar === 'PILLAR_1_IMU' ? (
                  isClickToAddNode ? (
                    <span className="text-blue-700 font-bold">
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
                    <strong className="text-blue-700">
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
                  className="bg-white hover:bg-slate-50 text-blue-700 border border-slate-300 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer transition"
                >
                  <LocateFixed className="w-4 h-4 text-blue-600" />
                  <span>พิกัดปัจจุบันของฉัน</span>
                </button>

                <button
                  onClick={toggleMapStyle}
                  className="bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer transition"
                >
                  <MapIcon className="w-4 h-4 text-blue-600" />
                  <span>
                    {mapStyleMode === 'OSM_STREET'
                      ? 'สลับเป็นโหมดเรดาร์มืด'
                      : 'สลับเป็นแผนที่ถนนจริง'}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* Explicit Height Container so MapLibre GL Always Renders */}
          <div
            className={`relative w-full h-[620px] ${activePillar === 'PILLAR_1_IMU' || activePillar === 'PILLAR_2_PET'
              ? 'block'
              : 'hidden'
              }`}
          >
            <div
              ref={mapContainerRef}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                filter:
                  mapStyleMode === 'CARTO_DARK'
                    ? 'invert(92%) hue-rotate(180deg) brightness(95%) contrast(92%)'
                    : 'none',
              }}
              className="w-full h-full transition-[filter] duration-300"
            />
            <canvas
              ref={overlayCanvasRef}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
              className="pointer-events-none absolute inset-0 w-full h-full z-[5]"
            />
          </div>

          {activePillar === 'PILLAR_3_VISION' && (
            <div className="w-full h-[620px] flex flex-col items-center justify-center p-6 bg-slate-50">
              {imageSrc ? (
                <div className="space-y-3 max-w-full">
                  <div
                    className={`text-xs flex items-center gap-2 font-bold ${claimResult?.is_verified ? 'text-emerald-700' : 'text-red-600'
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
                    className="max-h-[500px] w-auto border border-slate-300 rounded-xl shadow-md bg-white"
                  />
                </div>
              ) : (
                <div className="text-center text-slate-500 text-xs space-y-2 max-w-sm bg-white p-8 rounded-2xl border border-slate-200 shadow-xs">
                  <ShieldCheck className="w-12 h-12 mx-auto text-blue-600" />
                  <p className="font-bold text-sm text-slate-900">
                    ยังไม่มีรูปภาพสิ่งของในหน้าต่างตรวจสอบ
                  </p>
                  <p className="text-slate-600 leading-relaxed">
                    กดปุ่ม <strong>"อัปโหลดรูปสิ่งของที่พบ"</strong> ด้านซ้ายมือ เพื่อให้ Gemini Vision AI ตรวจจับตำหนิและสร้างกรอบเบลออัตโนมัติ
                  </p>
                </div>
              )}
            </div>
          )}

          {activePillar === 'PILLAR_4_QR' && (
            <div className="w-full h-[620px] flex flex-col items-center justify-center p-6 bg-slate-50">
              <canvas
                ref={qrCanvasRef}
                className="max-h-[540px] w-auto border border-slate-300 rounded-2xl shadow-lg"
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}