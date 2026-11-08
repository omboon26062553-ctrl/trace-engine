// src/lib/imu-math.ts

export interface RawTelemetryPoint {
  id: string;
  lat: number;
  lng: number;
  timestamp: number;
  speedKmh: number;
  accelMagnitude: number;
  gyroRate: number;
  dwellSeconds: number;
}

export interface DropNode extends RawTelemetryPoint {
  dropProbability: number;
  anomalyType: 'VEHICLE_ALIGHTING_SPIKE' | 'EXTENDED_DWELL' | 'JERK_ANOMALY' | 'NOMINAL';
}

export function calculateDropProbabilities(points: RawTelemetryPoint[]): DropNode[] {
  if (!points || points.length === 0) return [];

  return points.map((pt, idx) => {
    const prev = idx > 0 ? points[idx - 1] : pt;

    // 1. Dwell Score
    const dwellScore = Math.min(1, pt.dwellSeconds / 90);

    // 2. Kinematic Jerk & Rotational Spike Score
    const accelDelta = Math.abs(pt.accelMagnitude - 9.81);
    const jerkScore = Math.min(1, (accelDelta * 0.7 + pt.gyroRate * 2.2) / 18);

    // 3. Vehicle Alighting / Speed Transition Score
    const isAlighting = prev.speedKmh >= 15 && pt.speedKmh <= 6;
    const transitScore = isAlighting ? 1.0 : pt.speedKmh < 4 ? 0.35 : 0.05;

    const rawProb = 0.35 * dwellScore + 0.4 * jerkScore + 0.25 * transitScore;
    const dropProbability = Number(Math.min(0.98, Math.max(0.05, rawProb)).toFixed(3));

    let anomalyType: DropNode['anomalyType'] = 'NOMINAL';
    if (isAlighting || (pt.accelMagnitude > 20 && pt.dwellSeconds > 60)) {
      anomalyType = 'VEHICLE_ALIGHTING_SPIKE';
    } else if (pt.dwellSeconds >= 30) {
      anomalyType = 'EXTENDED_DWELL';
    } else if (pt.accelMagnitude >= 14) {
      anomalyType = 'JERK_ANOMALY';
    }

    return {
      ...pt,
      dropProbability,
      anomalyType,
    };
  });
}

