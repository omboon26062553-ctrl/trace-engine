// src/lib/imu-math.ts

export interface RawTelemetryPoint {
  id: string;
  lat: number;
  lng: number;
  timestamp: number;
  speedKmh: number;
  accelMagnitude: number; // m/s^2 (normal gravity ~9.8)
  gyroRate: number;       // rad/s
  dwellSeconds: number;
}

export interface DropNode extends RawTelemetryPoint {
  dropProbability: number; // 0.0 to 1.0
  anomalyType: 'VEHICLE_ALIGHTING_SPIKE' | 'HIGH_JERK_IMPACT' | 'EXTENDED_IDLE_DWELL' | 'NOMINAL_TRANSIT';
  cleared?: boolean;
  factors: {
    jerkScore: number;       // 0-100
    dwellScore: number;      // 0-100
    speedDeltaScore: number; // 0-100
  };
}

export function calculateDropProbabilities(
  points: RawTelemetryPoint[],
  clearedIds: string[] = []
): DropNode[] {
  if (!points || points.length === 0) return [];

  const rawNodes: DropNode[] = points.map((pt, idx) => {
    const isCleared = clearedIds.includes(pt.id);
    if (isCleared) {
      return {
        ...pt,
        dropProbability: 0,
        anomalyType: 'NOMINAL_TRANSIT',
        cleared: true,
        factors: { jerkScore: 0, dwellScore: 0, speedDeltaScore: 0 },
      };
    }

    // 1. Jerk & Gyro Impact Score (0 - 100)
    const netAccel = Math.max(0, Math.abs(pt.accelMagnitude - 9.8));
    const jerkNorm = Math.min(1, (netAccel / 18.0) * 0.7 + (pt.gyroRate / 4.0) * 0.3);
    const jerkScore = Math.round(jerkNorm * 100);

    // 2. Dwell Time Score (0 - 100)
    const dwellNorm = Math.min(1, pt.dwellSeconds / 110.0);
    const dwellScore = Math.round(dwellNorm * 100);

    // 3. Speed Transition Delta (Ghost Vector: Vehicle -> Walk)
    const prevSpeed = idx > 0 ? points[idx - 1].speedKmh : pt.speedKmh;
    const speedDrop = Math.max(0, prevSpeed - pt.speedKmh);
    const isAlighting = prevSpeed >= 15 && pt.speedKmh <= 5;
    const speedDeltaNorm = isAlighting
      ? Math.min(1, 0.75 + speedDrop / 40)
      : Math.min(1, speedDrop / 30);
    const speedDeltaScore = Math.round(speedDeltaNorm * 100);

    // Weighted Composite Score (Deterministic Formula)
    const composite =
      jerkNorm * 0.45 +
      dwellNorm * 0.35 +
      speedDeltaNorm * 0.20;

    let anomalyType: DropNode['anomalyType'] = 'NOMINAL_TRANSIT';
    if (isAlighting || speedDeltaScore >= 65) {
      anomalyType = 'VEHICLE_ALIGHTING_SPIKE';
    } else if (jerkScore >= 55) {
      anomalyType = 'HIGH_JERK_IMPACT';
    } else if (dwellScore >= 40) {
      anomalyType = 'EXTENDED_IDLE_DWELL';
    }

    return {
      ...pt,
      dropProbability: Number(Math.min(0.95, Math.max(0.02, composite)).toFixed(2)),
      anomalyType,
      cleared: false,
      factors: {
        jerkScore,
        dwellScore,
        speedDeltaScore,
      },
    };
  });

  // Bayesian Redistribution: หากมีจุดที่ถูกสำรวจแล้วไม่พบ (Cleared) ให้กระจายน้ำหนักไปยังจุดที่ยังไม่สำรวจ
  if (clearedIds.length > 0) {
    const activeNodes = rawNodes.filter((n) => !n.cleared);
    const clearedBoost = 1 + clearedIds.length * 0.12;
    activeNodes.forEach((n) => {
      n.dropProbability = Number(Math.min(0.98, n.dropProbability * clearedBoost).toFixed(2));
    });
  }

  return rawNodes;
}
