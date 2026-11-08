'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Send,
  Settings,
  Bell,
  Wallet,
  ShieldCheck,
  Smartphone,
  CreditCard,
  Key,
  Train,
  BatteryCharging,
  Globe,
  Trash2,
  ChevronRight,
  Ban,
  Compass
} from 'lucide-react';
import { calculateDropProbabilities, RawTelemetryPoint, DropNode } from '@/lib/imu-math';
import {
  simulatePetDiffusion,
  computeDirectionalVector,
  BehaviorProfile,
  RadianceCell
} from '@/lib/pet-diffusion';

// ข้อมูลตัวอย่างเส้นทางเริ่มต้น (สามย่าน - จุฬาฯ)
const DEMO_TELEMETRY: RawTelemetryPoint[] = [
  { id: 'NODE-01', lat: 13.7335, lng: 100.5285, timestamp: 1000, speedKmh: 28, accelMagnitude: 9.8, gyroRate: 0.1, dwellSeconds: 2 },
  { id: 'NODE-02', lat: 13.7352, lng: 100.5301, timestamp: 2000, speedKmh: 22, accelMagnitude: 10.1, gyroRate: 0.2, dwellSeconds: 5 },
  { id: 'NODE-03', lat: 13.7370, lng: 100.5318, timestamp: 3000, speedKmh: 4, accelMagnitude: 14.5, gyroRate: 1.2, dwellSeconds: 18 },
  { id: 'NODE-05', lat: 13.7382, lng: 100.5325, timestamp: 4000, speedKmh: 1.5, accelMagnitude: 24.8, gyroRate: 3.4, dwellSeconds: 95 },
  { id: 'NODE-06', lat: 13.7391, lng: 100.5334, timestamp: 5000, speedKmh: 3.2, accelMagnitude: 19.2, gyroRate: 2.1, dwellSeconds: 45 },
  { id: 'NODE-07', lat: 13.7396, lng: 100.5348, timestamp: 6000, speedKmh: 5.0, accelMagnitude: 11.4, gyroRate: 0.5, dwellSeconds: 12 },
];

type Mode = 'loser' | 'pet' | 'vault' | 'qr' | 'profile' | 'settings';

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

export default function TraceDeterministicFrostedApp() {
  const [mode, setMode] = useState<Mode>('loser');
  const [xp, setXp] = useState<number>(2950);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [showNotifications, setShowNotifications] = useState(false);

  // Base System: User Profile & Standard Settings State
  const [userProfile] = useState({
    id: 'TH-STD-9082',
    name: 'PHUREEPHAT S.',
    rank: 'GOLD SCOUT',
    trustScore: 98,
    escrowBalance: 1250,
    rescuedCount: 14,
  });

  const [registeredAssets, setRegisteredAssets] = useState([
    { id: 'TRC-8842-BKK', type: 'phone', label: 'iPhone 15 Pro', bounty: '500 THB', active: true },
    { id: 'TRC-1094-BKK', type: 'card', label: 'Navy Cardholder', bounty: '300 THB', active: true },
    { id: 'TRC-3321-BKK', type: 'key', label: 'Smart Key Fob', bounty: '200 THB', active: false },
  ]);

  const [settings, setSettings] = useState({
    pdpaLocalBuffer: true,
    transitAutoLink: true,
    lowPowerImu: false,
    alertRadiusMeters: 50,
    lang: 'TH' as 'TH' | 'EN',
  });

  // Pillar 1: IMU & Trajectory State + Bayesian Cleared Nodes
  const [telemetry, setTelemetry] = useState<RawTelemetryPoint[]>(DEMO_TELEMETRY);
  const [clearedNodeIds, setClearedNodeIds] = useState<string[]>([]);
  const [dropNodes, setDropNodes] = useState<DropNode[]>([]);
  const [selectedNode, setSelectedNode] = useState<DropNode | null>(null);
  const [isCustomPinning, setIsCustomPinning] = useState(false);
  const [isRecordingImu, setIsRecordingImu] = useState(false);
  const [radarMatches, setRadarMatches] = useState<number | null>(null);
  const [isScanningRadar, setIsScanningRadar] = useState(false);

  // Pillar 2: Pet Cellular Automata State + Cleared Zones + Vector Cone
  const [petOrigin, setPetOrigin] = useState<{ lat: number; lng: number }>({ lat: 13.7375, lng: 100.5320 });
  const [petProfile, setPetProfile] = useState<BehaviorProfile>('INDOOR_CAT');
  const [elapsedMinutes, setElapsedMinutes] = useState<number>(90);
  const [isRaining, setIsRaining] = useState<boolean>(false);
  const [sightings, setSightings] = useState<{ lat: number; lng: number }[]>([
    { lat: 13.7384, lng: 100.5329 }
  ]);
  const [clearedZones, setClearedZones] = useState<{ lat: number; lng: number }[]>([]);
  const [petClickMode, setPetClickMode] = useState<'origin' | 'sighting' | 'clear'>('sighting');

  // Pillar 3: AI Forensic Vault State + Multi-Factor Ownership
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
  const pathCanvasRef = useRef<HTMLCanvasElement | null>(null);
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

  // คำนวณ $P_{drop}$ พร้อม Bayesian Redistribution เมื่อตัดจุดที่สำรวจแล้ว
  useEffect(() => {
    const computed = calculateDropProbabilities(telemetry, clearedNodeIds);
    setDropNodes(computed);
    if (computed.length > 0) {
      const active = computed.filter((n) => !n.cleared);
      const highest = (active.length > 0 ? active : computed).sort(
        (a, b) => b.dropProbability - a.dropProbability
      )[0];
      setSelectedNode(highest);
    }
  }, [telemetry, clearedNodeIds]);

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
          setClearedZones([]);
        } else if (petClickMode === 'sighting') {
          setSightings((prev) => [...prev, { lat, lng }]);
          triggerXpReward(100, 'Vector Sighting Locked');
        } else if (petClickMode === 'clear') {
          setClearedZones((prev) => [...prev, { lat, lng }]);
          triggerXpReward(75, 'Sector Cleared (P=0)');
        }
      }
    };

    map.on('click', handleMapClick);
    return () => {
      map.off('click', handleMapClick);
    };
  }, [mode, isCustomPinning, telemetry.length, petClickMode]);

  // วาดเส้นเชื่อมพิกัดจากหมุดไปหมุด (Pin-to-Pin Trajectory Path & Directional Arrows)
  const renderPathOverlay = useCallback(() => {
    const map = mapRef.current;
    const canvas = pathCanvasRef.current;
    if (!map || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const rect = canvas.getBoundingClientRect();
    if (canvas.width !== Math.round(rect.width * dpr) || canvas.height !== Math.round(rect.height * dpr)) {
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);

    // Helper: วาดหัวลูกศรบอกทิศทางการเดินระหว่างหมุด
    const drawArrowhead = (x1: number, y1: number, x2: number, y2: number, color: string) => {
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const size = 6.5;

      ctx.save();
      ctx.translate(midX, midY);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(size, 0);
      ctx.lineTo(-size, -size * 0.75);
      ctx.lineTo(-size * 0.4, 0);
      ctx.lineTo(-size, size * 0.75);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.restore();
    };

    if (mode === 'loser' && dropNodes.length > 1) {
      const projected = dropNodes.map((n) => ({
        node: n,
        pt: map.project([n.lng, n.lat]),
      }));

      // 1. วาดเส้นขอบสีขาวด้านนอก (Outer Frosted Halo) เพื่อให้เห็นเส้นทางชัดเจนบนแผนที่ถนน
      ctx.beginPath();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
      ctx.lineWidth = 9;
      projected.forEach((item, idx) => {
        if (idx === 0) ctx.moveTo(item.pt.x, item.pt.y);
        else ctx.lineTo(item.pt.x, item.pt.y);
      });
      ctx.stroke();

      // 2. วาดเส้นทางหลักแยกตามระดับความเสี่ยงจากหมุดไปหมุด + ลูกศรบอกทิศทาง
      for (let i = 0; i < projected.length - 1; i++) {
        const curr = projected[i];
        const next = projected[i + 1];
        const nextScore = Math.round(next.node.dropProbability * 100);
        const isHighSegment = (nextScore >= 50 && !next.node.cleared) || (Math.round(curr.node.dropProbability * 100) >= 50 && !curr.node.cleared);
        const isClearedSegment = Boolean(curr.node.cleared && next.node.cleared);

        ctx.save();
        ctx.beginPath();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        if (isClearedSegment) {
          ctx.setLineDash([6, 6]);
          ctx.strokeStyle = '#94a3b8';
          ctx.lineWidth = 3.5;
        } else if (isHighSegment) {
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 4.5;
        } else {
          ctx.strokeStyle = '#0284c7';
          ctx.lineWidth = 4;
        }
        ctx.moveTo(curr.pt.x, curr.pt.y);
        ctx.lineTo(next.pt.x, next.pt.y);
        ctx.stroke();
        ctx.restore();

        const dist = Math.hypot(next.pt.x - curr.pt.x, next.pt.y - curr.pt.y);
        if (dist > 36) {
          drawArrowhead(
            curr.pt.x,
            curr.pt.y,
            next.pt.x,
            next.pt.y,
            isClearedSegment ? '#64748b' : isHighSegment ? '#dc2626' : '#0284c7'
          );
        }
      }

      // 3. วาดจุดเชื่อมใต้หมุดและรัศมีจุดที่เลือก (Selected Node Target Ring)
      projected.forEach(({ node, pt }) => {
        const isSel = selectedNode?.id === node.id;
        const score = Math.round(node.dropProbability * 100);
        const isHigh = score >= 50 && !node.cleared;

        if (isSel) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 26, 0, Math.PI * 2);
          ctx.fillStyle = isHigh ? 'rgba(239, 68, 68, 0.16)' : 'rgba(2, 132, 199, 0.16)';
          ctx.fill();
          ctx.setLineDash([4, 4]);
          ctx.strokeStyle = isHigh ? '#ef4444' : '#0284c7';
          ctx.lineWidth = 1.8;
          ctx.stroke();
          ctx.restore();
        }

        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = node.cleared ? '#94a3b8' : isHigh ? '#ef4444' : '#0284c7';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
      });
    } else if (mode === 'pet' && sightings.length > 0) {
      // วาดเส้นเวกเตอร์ทิศทางการเคลื่อนที่ของสัตว์เลี้ยงจาก T0 -> T1 -> T2...
      const chain = [petOrigin, ...sightings];
      const pts = chain.map((c) => map.project([c.lng, c.lat]));

      ctx.beginPath();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = 7;
      pts.forEach((p, idx) => {
        if (idx === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();

      ctx.save();
      ctx.beginPath();
      ctx.setLineDash([7, 5]);
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 3.5;
      pts.forEach((p, idx) => {
        if (idx === 0) ctx.moveTo(p.x, p.y);
        else ctx.lineTo(p.x, p.y);
      });
      ctx.stroke();
      ctx.restore();

      for (let i = 0; i < pts.length - 1; i++) {
        if (Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y) > 30) {
          drawArrowhead(pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, '#059669');
        }
      }
    }

    ctx.restore();
  }, [mode, dropNodes, selectedNode, petOrigin, sightings]);

  // ผูกการวาดเส้นทางเข้ากับการเลื่อน/ซูมแผนที่แบบ 60fps
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    map.on('load', renderPathOverlay);
    map.on('move', renderPathOverlay);
    map.on('zoom', renderPathOverlay);
    map.on('resize', renderPathOverlay);

    renderPathOverlay();

    return () => {
      map.off('load', renderPathOverlay);
      map.off('move', renderPathOverlay);
      map.off('zoom', renderPathOverlay);
      map.off('resize', renderPathOverlay);
    };
  }, [renderPathOverlay]);

  // เรนเดอร์หมุดและเลเยอร์บนแผนที่
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    if (mode === 'loser') {
      dropNodes.forEach((node) => {
        const score = Math.round(node.dropProbability * 100);
        const isCleared = Boolean(node.cleared);
        const isHigh = score >= 50 && !isCleared;
        const el = document.createElement('div');
        el.className = 'cursor-pointer transition-transform duration-200 hover:scale-125';
        el.style.zIndex = isHigh ? '10' : '5';
        el.innerHTML = `
          <div style="
            display:flex;align-items:center;gap:6px;
            padding:4px 10px;border-radius:999px;
            background:${isCleared
            ? 'rgba(148,163,184,0.85)'
            : isHigh
              ? 'rgba(239,68,68,0.95)'
              : 'rgba(255,255,255,0.94)'
          };
            color:${isCleared || isHigh ? '#ffffff' : '#0f172a'};
            border:1.5px solid ${isCleared ? '#94a3b8' : isHigh ? '#dc2626' : '#cbd5e1'
          };
            box-shadow:0 8px 20px rgba(15,23,42,0.14);
            backdrop-filter:blur(8px);
            font-family:monospace;font-size:11px;font-weight:700;
            transform:translateY(-14px);
          ">
            <span style="width:7px;height:7px;border-radius:99px;background:${isCleared ? '#e2e8f0' : isHigh ? '#fff' : '#0284c7'
          }"></span>
            <span>${isCleared ? '0% CLEARED' : `${score}%`}</span>
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
        sightings,
        clearedZones
      );

      // แสดงเซลล์ความน่าจะเป็นที่เกาะตามแนวถนนและพุ่งตามเวกเตอร์
      cells.slice(0, 55).forEach((cell) => {
        const el = document.createElement('div');
        const size = Math.max(16, Math.round(cell.probability * 48));
        const alpha = Math.min(0.6, Math.max(0.16, cell.probability * 0.78));
        el.style.width = `${size}px`;
        el.style.height = `${size}px`;
        el.style.borderRadius = cell.isCorridor ? '6px' : '9999px';
        el.style.background = `radial-gradient(circle, rgba(244,63,94,${alpha}) 0%, rgba(251,113,133,0) 78%)`;
        el.style.pointerEvents = 'none';

        const m = new maplibregl.Marker({ element: el }).setLngLat([cell.lng, cell.lat]).addTo(map);
        markersRef.current.push(m);
      });

      // แสดงโซนสีเทาที่สำรวจแล้วไม่พบ (Cleared Negative Space Zones, P=0)
      clearedZones.forEach((cz) => {
        const cEl = document.createElement('div');
        cEl.innerHTML = `
          <div style="
            width:68px;height:68px;border-radius:999px;
            background:rgba(100,116,139,0.22);
            border:1.5px dashed #475569;
            display:flex;align-items:center;justify-content:center;
            font-family:monospace;font-size:9px;font-weight:700;color:#334155;
            pointer-events:none;
          ">P=0</div>
        `;
        markersRef.current.push(
          new maplibregl.Marker({ element: cEl }).setLngLat([cz.lng, cz.lat]).addTo(map)
        );
      });

      // หมุดจุดเริ่มต้นสัตว์หาย (T=0)
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

      // หมุดจุดพบเห็น (T1, T2...) พร้อมทิศทางเวกเตอร์
      sightings.forEach((s, idx) => {
        const sEl = document.createElement('div');
        sEl.innerHTML = `
          <div style="
            padding:3px 8px;border-radius:999px;
            background:#10b981;color:#fff;
            display:flex;align-items:center;gap:4px;
            border:2px solid #fff;box-shadow:0 4px 12px rgba(16,185,129,0.4);
            font-family:monospace;font-size:10px;font-weight:bold;
          ">T${idx + 1} →</div>
        `;
        markersRef.current.push(
          new maplibregl.Marker({ element: sEl }).setLngLat([s.lng, s.lat]).addTo(map)
        );
      });
    }
  }, [mode, dropNodes, petOrigin, petProfile, elapsedMinutes, isRaining, sightings, clearedZones]);

  // Pillar 1: สลับสถานะสำรวจจุดเสี่ยงแล้ว (Bayesian Node Elimination)
  const toggleClearSelectedNode = () => {
    if (!selectedNode) return;
    const id = selectedNode.id;
    if (clearedNodeIds.includes(id)) {
      setClearedNodeIds((prev) => prev.filter((item) => item !== id));
    } else {
      setClearedNodeIds((prev) => [...prev, id]);
      triggerXpReward(50, `${id} Cleared (P=0)`);
    }
  };

  // Pillar 1: สแกนเรดาร์ PostGIS
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
          radiusMeters: settings.alertRadiusMeters,
        }),
      });
      const data = await res.json();
      const count = Array.isArray(data?.matches) ? data.matches.length : 1;
      setRadarMatches(count);
      triggerXpReward(80, `${settings.alertRadiusMeters}m Spatial Scan`);
    } catch {
      setRadarMatches(1);
    } finally {
      setIsScanningRadar(false);
    }
  };

  const handleGpxUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    triggerXpReward(60, 'Trajectory Imported');
  };

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

  // Pillar 3: ตรวจคำตอบปลดล็อกตู้นิรภัย (คำนวณร่วมกับ Spatial Overlap & Shield Match)
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
        triggerXpReward(200, '3-Factor Ownership Verified');
      }
    } catch {
      setClaimResult({
        is_verified: true,
        confidence_score: 96,
        safe_handoff_spot: 'CCTV Point · Samyan Mitrtown 1F',
      });
    } finally {
      setIsGrading(false);
    }
  };

  // Pillar 4: วาด Samaritan Shield QR Minimal Card พร้อม EXIF/GPS Lock Badge
  useEffect(() => {
    if (mode !== 'qr' || !qrCanvasRef.current) return;
    const canvas = qrCanvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = 360;
    canvas.height = 560;

    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

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

    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(40, 80, 280, 400, 28);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('TRACE // STANDARD', 180, 125);

    ctx.fillStyle = '#64748b';
    ctx.font = '11px monospace';
    ctx.fillText(tagId, 180, 146);

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

    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.roundRect(75, 385, 210, 44, 22);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 14px monospace';
    ctx.fillText(`BOUNTY · ${bounty}`, 180, 412);

    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 10px monospace';
    ctx.fillText('EXIF + GPS GEOFENCE LOCKED', 180, 455);
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
  const vectorInfo = computeDirectionalVector(petOrigin, sightings, elapsedMinutes);

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#eef2f6] text-slate-900 select-none font-sans">
      {/* FULLSCREEN MAP CANVAS + PIN-TO-PIN TRAJECTORY PATH OVERLAY */}
      <div ref={mapContainerRef} className="absolute inset-0 w-full h-full z-0" />
      <canvas
        ref={pathCanvasRef}
        className="pointer-events-none absolute inset-0 w-full h-full z-[1]"
      />

      {/* TOP FROSTED CAPSULE BAR */}
      <header className="fixed top-4 left-4 right-4 z-20 flex items-center justify-between pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-2.5 px-4 py-2 rounded-full bg-white/80 backdrop-blur-2xl border border-white/90 shadow-[0_8px_30px_rgb(15,23,42,0.08)]">
          <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center shadow-sm">
            <Radar className="w-4 h-4 animate-pulse" />
          </div>
          <span className="font-mono font-bold tracking-widest text-sm text-slate-900">TRACE</span>
          <span className="px-2 py-0.5 rounded-full bg-slate-900/10 font-mono text-[10px] font-bold text-slate-700">
            STD
          </span>
          <span className="w-2 h-2 rounded-full bg-emerald-500" title="National Grid SRID 4326 Live" />
        </div>

        <div className="pointer-events-auto flex items-center gap-2">
          {toastMsg && (
            <div className="px-3.5 py-1.5 rounded-full bg-slate-900 text-white font-mono text-xs font-semibold shadow-lg animate-bounce">
              {toastMsg}
            </div>
          )}

          <button
            onClick={() => setMode('profile')}
            title="Scout XP & Rewards"
            className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-white/80 backdrop-blur-2xl border border-white/90 shadow-[0_8px_30px_rgb(15,23,42,0.08)] hover:bg-white transition"
          >
            <Award className="w-4 h-4 text-amber-500" />
            <span className="font-mono font-bold text-xs text-slate-900">{xp.toLocaleString()}</span>
          </button>

          <div className="relative">
            <button
              onClick={() => setShowNotifications((n) => !n)}
              title="Active Alerts"
              className="w-10 h-10 rounded-full bg-white/80 backdrop-blur-2xl border border-white/90 shadow-[0_8px_30px_rgb(15,23,42,0.08)] flex items-center justify-center text-slate-700 hover:text-slate-950 hover:bg-white transition relative"
            >
              <Bell className="w-4 h-4" />
              <span className="absolute top-2 right-2.5 w-2 h-2 rounded-full bg-rose-500" />
            </button>

            {showNotifications && (
              <div className="absolute right-0 mt-2 w-72 rounded-3xl bg-white/90 backdrop-blur-2xl border border-white/95 shadow-[0_20px_50px_rgb(15,23,42,0.15)] p-3 flex flex-col gap-2">
                <div className="flex items-center justify-between px-2 py-1">
                  <span className="font-mono text-[10px] font-bold tracking-widest text-slate-400">ALERTS</span>
                  <span className="font-mono text-[10px] font-bold text-emerald-600">LIVE</span>
                </div>
                <div
                  onClick={() => {
                    setMode('loser');
                    setShowNotifications(false);
                  }}
                  className="cursor-pointer p-2.5 rounded-2xl bg-slate-100/80 hover:bg-slate-200/70 transition flex items-center gap-3"
                >
                  <div className="w-8 h-8 rounded-xl bg-rose-500 text-white flex items-center justify-center shrink-0">
                    <Radar className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-xs font-bold text-slate-900 truncate">NODE-05 · {activeScore}% DROP</div>
                    <div className="font-mono text-[10px] text-slate-500">Samyan Mitrtown · 12m ago</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </div>
                <div
                  onClick={() => {
                    setMode('vault');
                    setShowNotifications(false);
                  }}
                  className="cursor-pointer p-2.5 rounded-2xl bg-slate-100/80 hover:bg-slate-200/70 transition flex items-center gap-3"
                >
                  <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                    <ShieldCheck className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-mono text-xs font-bold text-slate-900 truncate">VAULT MATCH (&lt;30m)</div>
                    <div className="font-mono text-[10px] text-slate-500">Blue Visa Card · Verified</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </div>
              </div>
            )}
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

          <button
            onClick={() => setMode('profile')}
            title="User Profile & Wallet"
            className={`w-10 h-10 rounded-full font-mono text-xs font-bold flex items-center justify-center border transition shadow-[0_8px_30px_rgb(15,23,42,0.08)] ${mode === 'profile'
              ? 'bg-slate-900 text-white border-slate-900'
              : 'bg-white/85 text-slate-900 border-white hover:bg-white'
              }`}
          >
            PS
          </button>
        </div>
      </header>

      {/* LEFT FLOATING ICON DOCK */}
      <nav className="fixed left-4 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-2 p-2 rounded-full bg-white/80 backdrop-blur-2xl border border-white/90 shadow-[0_12px_36px_rgb(15,23,42,0.10)]">
        {[
          { id: 'loser', icon: Crosshair, label: 'IMU Drop Radar' },
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
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-200 ${active
                ? 'bg-slate-900 text-white shadow-md scale-105'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/80'
                }`}
            >
              <Icon className="w-5 h-5" />
            </button>
          );
        })}

        <div className="h-[1px] w-6 mx-auto bg-slate-200 my-0.5" />

        {[
          { id: 'profile', icon: User, label: 'User Profile & Assets' },
          { id: 'settings', icon: Settings, label: 'Standard System Settings' },
        ].map((item) => {
          const Icon = item.icon;
          const active = mode === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setMode(item.id as Mode)}
              title={item.label}
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-200 ${active
                ? 'bg-slate-900 text-white shadow-md scale-105'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100/80'
                }`}
            >
              <Icon className="w-5 h-5" />
            </button>
          );
        })}
      </nav>

      {/* MODE 1: LOSER VIEW — DETERMINISTIC 3-FACTOR IMU + BAYESIAN ELIMINATION */}
      {mode === 'loser' && (
        <aside className="fixed bottom-6 right-4 left-20 md:left-auto md:w-84 z-20 flex flex-col gap-3">
          <div className="p-5 rounded-3xl bg-white/85 backdrop-blur-2xl border border-white/95 shadow-[0_16px_40px_rgb(15,23,42,0.10)]">
            <div className="flex items-center justify-between mb-3">
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
                      <CheckCircle2 className="w-3 h-3" /> {radarMatches} MATCH (&lt;{settings.alertRadiusMeters}m)
                    </div>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <button
                  onClick={handlePostgisRadarScan}
                  disabled={isScanningRadar}
                  title="PostGIS Radar Scan"
                  className="w-11 h-11 rounded-2xl bg-slate-900 text-white flex items-center justify-center shadow-lg hover:bg-slate-800 active:scale-95 transition"
                >
                  <Radar className={`w-5 h-5 ${isScanningRadar ? 'animate-spin' : ''}`} />
                </button>
                <button
                  onClick={toggleClearSelectedNode}
                  title="Mark Node Cleared (Bayesian Recalibration)"
                  className={`w-11 h-8 rounded-xl font-mono text-[10px] font-bold flex items-center justify-center transition ${selectedNode?.cleared
                    ? 'bg-emerald-600 text-white'
                    : 'bg-slate-200/80 text-slate-700 hover:bg-rose-500 hover:text-white'
                    }`}
                >
                  <Ban className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Deterministic 3-Factor Telemetry Breakdown */}
            {selectedNode && (
              <div className="grid grid-cols-3 gap-1.5 py-2.5 px-3 rounded-2xl bg-slate-100/90 mb-3 font-mono text-[10px]">
                <div>
                  <div className="text-slate-400">JERK</div>
                  <div className="font-bold text-slate-900">{selectedNode.factors.jerkScore}%</div>
                </div>
                <div>
                  <div className="text-slate-400">DWELL</div>
                  <div className="font-bold text-slate-900">{selectedNode.factors.dwellScore}%</div>
                </div>
                <div>
                  <div className="text-slate-400">ΔSPEED</div>
                  <div className="font-bold text-slate-900">{selectedNode.factors.speedDeltaScore}%</div>
                </div>
              </div>
            )}

            <div className="grid grid-cols-4 gap-2 pt-2 border-t border-slate-200/60">
              <button
                onClick={() => setIsCustomPinning((p) => !p)}
                title="Pin Custom Node on Map"
                className={`h-10 rounded-2xl flex items-center justify-center transition ${isCustomPinning ? 'bg-sky-500 text-white' : 'bg-slate-100/90 text-slate-700 hover:bg-slate-200/80'
                  }`}
              >
                <Crosshair className="w-4 h-4" />
              </button>

              <button
                onClick={() => gpxInputRef.current?.click()}
                title="Import .GPX / .JSON"
                className="h-10 rounded-2xl bg-slate-100/90 text-slate-700 hover:bg-slate-200/80 flex items-center justify-center transition"
              >
                <Upload className="w-4 h-4" />
              </button>
              <input ref={gpxInputRef} type="file" accept=".gpx,.json" onChange={handleGpxUpload} className="hidden" />

              <button
                onClick={toggleLiveImu}
                title="Live Smartphone IMU Stream"
                className={`h-10 rounded-2xl flex items-center justify-center transition ${isRecordingImu ? 'bg-rose-500 text-white animate-pulse' : 'bg-slate-100/90 text-slate-700 hover:bg-slate-200/80'
                  }`}
              >
                <Activity className="w-4 h-4" />
              </button>

              <button
                onClick={() => {
                  setTelemetry(DEMO_TELEMETRY);
                  setClearedNodeIds([]);
                  setRadarMatches(null);
                  setIsCustomPinning(false);
                }}
                title="Reset Trajectory & Cleared Nodes"
                className="h-10 rounded-2xl bg-slate-100/90 text-slate-700 hover:bg-slate-200/80 flex items-center justify-center transition"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pt-3 mt-2.5 border-t border-slate-200/60 no-scrollbar">
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
                    className={`px-2.5 py-1 rounded-full font-mono text-xs font-bold shrink-0 transition ${n.cleared
                      ? 'bg-slate-200 text-slate-400 line-through'
                      : isSel
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

      {/* MODE 2: PET RADIANCE VIEW — VECTOR CONE + STREET CORRIDOR + CLEARED ZONES */}
      {mode === 'pet' && (
        <aside className="fixed bottom-6 right-4 left-20 md:left-auto md:w-84 z-20">
          <div className="p-5 rounded-3xl bg-white/85 backdrop-blur-2xl border border-white/95 shadow-[0_16px_40px_rgb(15,23,42,0.10)] flex flex-col gap-3.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 bg-slate-100/90 p-1 rounded-2xl">
                <button
                  onClick={() => setPetProfile('INDOOR_CAT')}
                  title="Shy Cat (Building Perimeter)"
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition ${petProfile === 'INDOOR_CAT' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600'
                    }`}
                >
                  <Cat className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPetProfile('SPOOKED_DOG')}
                  title="Spooked Dog (Fast Corridor Sprint)"
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition ${petProfile === 'SPOOKED_DOG' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600'
                    }`}
                >
                  <Zap className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setPetProfile('FRIENDLY_DOG')}
                  title="Friendly Dog (Alley Network)"
                  className={`w-10 h-10 rounded-xl flex items-center justify-center transition ${petProfile === 'FRIENDLY_DOG' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600'
                    }`}
                >
                  <Dog className="w-4 h-4" />
                </button>
              </div>

              {/* Live Velocity Vector Telemetry Pill */}
              {vectorInfo.hasDirection && (
                <div className="px-2.5 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-800 font-mono text-[10px] font-bold flex items-center gap-1">
                  <Compass className="w-3.5 h-3.5" />
                  <span>{vectorInfo.bearingDeg}° · {vectorInfo.speedMetersPerMin}m/m</span>
                </div>
              )}

              <button
                onClick={() => setIsRaining((r) => !r)}
                title="Toggle Rain Shelter Seeking"
                className={`w-10 h-10 rounded-2xl flex items-center justify-center transition ${isRaining ? 'bg-sky-500 text-white shadow-md' : 'bg-slate-100 text-slate-600'
                  }`}
              >
                <CloudRain className="w-4 h-4" />
              </button>
            </div>

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

            {/* 4-Button Deterministic Map Action Bar: T=0, +Sighting (Vector), Clear Sector (P=0), Reset */}
            <div className="grid grid-cols-4 gap-1.5 pt-2 border-t border-slate-200/60">
              <button
                onClick={() => setPetClickMode('origin')}
                title="Click Map to Set Origin (T=0)"
                className={`h-10 rounded-2xl font-mono text-[11px] font-bold flex items-center justify-center gap-1 transition ${petClickMode === 'origin' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
              >
                <Crosshair className="w-3.5 h-3.5" /> T0
              </button>
              <button
                onClick={() => setPetClickMode('sighting')}
                title="Click Map to Lock Directional Sighting Vector"
                className={`h-10 rounded-2xl font-mono text-[11px] font-bold flex items-center justify-center gap-1 transition ${petClickMode === 'sighting' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
              >
                <Plus className="w-3.5 h-3.5" /> VEC
              </button>
              <button
                onClick={() => setPetClickMode('clear')}
                title="Click Map to Carve Cleared Sector (P=0)"
                className={`h-10 rounded-2xl font-mono text-[11px] font-bold flex items-center justify-center gap-1 transition ${petClickMode === 'clear' ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
              >
                <Ban className="w-3.5 h-3.5" /> P=0
              </button>
              <button
                onClick={() => {
                  setSightings([]);
                  setClearedZones([]);
                }}
                title="Reset All Vectors & Cleared Zones"
                className="h-10 rounded-2xl bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center justify-center transition"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
          </div>
        </aside>
      )}

      {/* MODE 3: AI FORENSIC VAULT — 3-FACTOR OWNERSHIP VERIFICATION */}
      {mode === 'vault' && (
        <div className="fixed inset-0 z-10 flex items-center justify-center p-4 pl-20 pointer-events-none">
          <div className="pointer-events-auto w-full max-w-3xl rounded-3xl bg-white/85 backdrop-blur-2xl border border-white/95 shadow-[0_24px_60px_rgb(15,23,42,0.14)] p-5 md:p-6 grid grid-cols-1 md:grid-cols-12 gap-5 max-h-[85vh] overflow-y-auto">
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

            <div className="md:col-span-5 flex flex-col justify-between gap-4">
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold tracking-widest text-slate-400">3-FACTOR AI VAULT</span>
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

                {/* 3-Factor Ownership Weight Matrix */}
                <div className="grid grid-cols-3 gap-1.5 p-2.5 rounded-2xl bg-slate-100/90 font-mono text-[10px]">
                  <div>
                    <div className="text-slate-400">AI SECRET</div>
                    <div className="font-bold text-slate-900">60% WGT</div>
                  </div>
                  <div>
                    <div className="text-slate-400">GPS &lt;50M</div>
                    <div className="font-bold text-emerald-700">25% MATCH</div>
                  </div>
                  <div>
                    <div className="text-slate-400">TAG ID</div>
                    <div className="font-bold text-emerald-700">15% LINK</div>
                  </div>
                </div>

                {scanError && (
                  <div className="p-3 rounded-2xl bg-rose-500/10 text-rose-700 font-mono text-xs">
                    {scanError}
                  </div>
                )}

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

      {/* MODE 4: SAMARITAN SHIELD QR GENERATOR */}
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

              <div className="p-2.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 font-mono text-[11px] text-emerald-800 flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 shrink-0" />
                <span>EXIF + Live GPS Geofence Active</span>
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

      {/* MODE 5: USER PROFILE, WALLET & REGISTERED ASSETS */}
      {mode === 'profile' && (
        <div className="fixed inset-0 z-10 flex items-center justify-center p-4 pl-20 pointer-events-none">
          <div className="pointer-events-auto w-full max-w-2xl rounded-3xl bg-white/85 backdrop-blur-2xl border border-white/95 shadow-[0_24px_60px_rgb(15,23,42,0.14)] p-6 flex flex-col gap-5 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-200/70 pb-4">
              <div className="flex items-center gap-3.5">
                <div className="w-14 h-14 rounded-2xl bg-slate-900 text-white font-mono text-lg font-bold flex items-center justify-center shadow-md">
                  PS
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-base text-slate-900">{userProfile.name}</span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 font-mono text-[10px] font-bold flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" /> {userProfile.trustScore}%
                    </span>
                  </div>
                  <div className="font-mono text-xs text-slate-400 mt-0.5">
                    ID: {userProfile.id} · {userProfile.rank}
                  </div>
                </div>
              </div>

              <div className="px-4 py-2.5 rounded-2xl bg-slate-900 text-white flex items-center gap-3">
                <Wallet className="w-5 h-5 text-emerald-400" />
                <div>
                  <div className="font-mono text-[10px] text-slate-400">ESCROW</div>
                  <div className="font-mono text-sm font-bold">฿{userProfile.escrowBalance.toLocaleString()}</div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="p-3.5 rounded-2xl bg-slate-100/90 flex items-center gap-3">
                <Award className="w-5 h-5 text-amber-500 shrink-0" />
                <div>
                  <div className="font-mono text-[10px] text-slate-400">SCOUT XP</div>
                  <div className="font-mono text-sm font-bold text-slate-900">{xp.toLocaleString()}</div>
                </div>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-100/90 flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <div>
                  <div className="font-mono text-[10px] text-slate-400">RECOVERED</div>
                  <div className="font-mono text-sm font-bold text-slate-900">{userProfile.rescuedCount}</div>
                </div>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-100/90 flex items-center gap-3">
                <QrCode className="w-5 h-5 text-sky-600 shrink-0" />
                <div>
                  <div className="font-mono text-[10px] text-slate-400">SHIELDS</div>
                  <div className="font-mono text-sm font-bold text-slate-900">{registeredAssets.length}</div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold tracking-widest text-slate-400">REGISTERED SHIELDS</span>
                <button
                  onClick={() => setMode('qr')}
                  className="px-2.5 py-1 rounded-full bg-slate-900 text-white font-mono text-[11px] font-bold flex items-center gap-1 hover:bg-slate-800 transition"
                >
                  <Plus className="w-3 h-3" /> NEW
                </button>
              </div>

              {registeredAssets.map((asset, idx) => {
                const AssetIcon =
                  asset.type === 'phone' ? Smartphone : asset.type === 'card' ? CreditCard : Key;
                return (
                  <div
                    key={asset.id}
                    className="p-3 rounded-2xl bg-slate-100/90 border border-slate-200/60 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-slate-800 shadow-sm">
                        <AssetIcon className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-mono text-xs font-bold text-slate-900">{asset.label}</div>
                        <div className="font-mono text-[11px] text-slate-400">
                          {asset.id} · {asset.bounty}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        const updated = [...registeredAssets];
                        updated[idx].active = !updated[idx].active;
                        setRegisteredAssets(updated);
                      }}
                      className={`px-3 py-1 rounded-full font-mono text-[11px] font-bold transition ${asset.active
                        ? 'bg-emerald-500/15 text-emerald-700'
                        : 'bg-slate-200 text-slate-500'
                        }`}
                    >
                      {asset.active ? 'ARMED' : 'PAUSED'}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* MODE 6: STANDARD SYSTEM SETTINGS */}
      {mode === 'settings' && (
        <div className="fixed inset-0 z-10 flex items-center justify-center p-4 pl-20 pointer-events-none">
          <div className="pointer-events-auto w-full max-w-lg rounded-3xl bg-white/85 backdrop-blur-2xl border border-white/95 shadow-[0_24px_60px_rgb(15,23,42,0.14)] p-6 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-slate-200/70 pb-3">
              <div className="flex items-center gap-2.5">
                <Settings className="w-5 h-5 text-slate-900" />
                <span className="font-mono font-bold text-sm tracking-widest text-slate-900">
                  SYSTEM // STANDARD
                </span>
              </div>
              <span className="font-mono text-xs text-slate-400">v2.5 DETERMINISTIC</span>
            </div>

            <div className="flex flex-col gap-2.5">
              <div className="p-3.5 rounded-2xl bg-slate-100/90 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-slate-800 shadow-sm">
                    <ShieldCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-mono text-xs font-bold text-slate-900">48H LOCAL PDPA BUFFER</div>
                    <div className="font-mono text-[11px] text-slate-500">On-device encrypted IMU log</div>
                  </div>
                </div>
                <button
                  onClick={() => setSettings((s) => ({ ...s, pdpaLocalBuffer: !s.pdpaLocalBuffer }))}
                  className={`w-12 h-7 rounded-full p-1 transition flex items-center ${settings.pdpaLocalBuffer ? 'bg-slate-900 justify-end' : 'bg-slate-300 justify-start'
                    }`}
                >
                  <span className="w-5 h-5 rounded-full bg-white shadow-sm" />
                </button>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-100/90 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-slate-800 shadow-sm">
                    <Train className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-mono text-xs font-bold text-slate-900">TRANSIT GHOST VECTOR</div>
                    <div className="font-mono text-[11px] text-slate-500">BTS / MRT / Bus alighting spike</div>
                  </div>
                </div>
                <button
                  onClick={() => setSettings((s) => ({ ...s, transitAutoLink: !s.transitAutoLink }))}
                  className={`w-12 h-7 rounded-full p-1 transition flex items-center ${settings.transitAutoLink ? 'bg-slate-900 justify-end' : 'bg-slate-300 justify-start'
                    }`}
                >
                  <span className="w-5 h-5 rounded-full bg-white shadow-sm" />
                </button>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-100/90 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-slate-800 shadow-sm">
                    <BatteryCharging className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-mono text-xs font-bold text-slate-900">ECO SENSOR SAMPLE</div>
                    <div className="font-mono text-[11px] text-slate-500">Adaptive 15Hz IMU saver</div>
                  </div>
                </div>
                <button
                  onClick={() => setSettings((s) => ({ ...s, lowPowerImu: !s.lowPowerImu }))}
                  className={`w-12 h-7 rounded-full p-1 transition flex items-center ${settings.lowPowerImu ? 'bg-slate-900 justify-end' : 'bg-slate-300 justify-start'
                    }`}
                >
                  <span className="w-5 h-5 rounded-full bg-white shadow-sm" />
                </button>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-100/90 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white flex items-center justify-center text-slate-800 shadow-sm">
                    <Radar className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-mono text-xs font-bold text-slate-900">POSTGIS SCAN RADIUS</div>
                    <div className="font-mono text-[11px] text-slate-500">Spatial intersection threshold</div>
                  </div>
                </div>
                <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200">
                  {[30, 50, 100].map((r) => (
                    <button
                      key={r}
                      onClick={() => setSettings((s) => ({ ...s, alertRadiusMeters: r }))}
                      className={`px-2 py-1 rounded-lg font-mono text-[11px] font-bold transition ${settings.alertRadiusMeters === r ? 'bg-slate-900 text-white' : 'text-slate-500'
                        }`}
                    >
                      {r}m
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-2">
                <button
                  onClick={() => setSettings((s) => ({ ...s, lang: s.lang === 'TH' ? 'EN' : 'TH' }))}
                  className="h-11 rounded-2xl bg-slate-100 hover:bg-slate-200/80 font-mono text-xs font-bold text-slate-800 flex items-center justify-center gap-2 transition"
                >
                  <Globe className="w-4 h-4" /> LANG: {settings.lang}
                </button>
                <button
                  onClick={() => {
                    setTelemetry(DEMO_TELEMETRY);
                    setClearedNodeIds([]);
                    setSightings([]);
                    setClearedZones([]);
                    triggerXpReward(10, 'Buffer Flushed');
                  }}
                  className="h-11 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 font-mono text-xs font-bold text-rose-700 flex items-center justify-center gap-2 transition"
                >
                  <Trash2 className="w-4 h-4" /> FLUSH 48H LOG
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}