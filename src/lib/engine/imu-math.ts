// src/lib/engine/imu-math.ts

export type TransitMode = 'WALKING' | 'VEHICLE' | 'STATIONARY';

export interface TelemetryPoint {
    id: string;
    lat: number;
    lng: number;
    timestamp: number; // Unix timestamp in ms
    accelMagnitude: number; // m/s^2 (9.81 = baseline 1G)
    gyroRate: number; // rad/s
    transitMode: TransitMode;
}

export interface ScoredTrajectoryNode extends TelemetryPoint {
    dwellScore: number;
    jerkScore: number;
    transitScore: number;
    dropProbability: number; // Clamped [0, 1]
    isGhostVectorOrigin: boolean; // True if item likely stayed inside a moving vehicle
    anomalyReason: string;
}

export interface EngineWeights {
    w1_dwell: number;
    w2_jerk: number;
    w3_transit: number;
}

const DEFAULT_WEIGHTS: EngineWeights = {
    w1_dwell: 0.30,
    w2_jerk: 0.45,
    w3_transit: 0.25,
};

/**
 * Calculates distance in meters between two GPS coordinates (Haversine formula)
 */
export function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371e3;
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Pillar 1 Core Engine: Filters trajectory to [t0, t1] and computes P_drop(p_i)
 */
export function evaluateTrajectoryDropProbability(
    rawPoints: TelemetryPoint[],
    t0: number,
    t1: number,
    weights: EngineWeights = DEFAULT_WEIGHTS
): ScoredTrajectoryNode[] {
    const windowPoints = rawPoints
        .filter((p) => p.timestamp >= t0 && p.timestamp <= t1)
        .sort((a, b) => a.timestamp - b.timestamp);

    if (windowPoints.length === 0) return [];

    return windowPoints.map((pt, idx) => {
        const prev = idx > 0 ? windowPoints[idx - 1] : pt;
        const dtSec = Math.max(1, (pt.timestamp - prev.timestamp) / 1000);
        const distMeters = haversineMeters(prev.lat, prev.lng, pt.lat, pt.lng);

        // 1. Dwell Time Score: High when user pauses in a small radius (< 4 meters)
        const velocity = distMeters / dtSec;
        const dwellScore = velocity < 0.6 ? Math.min(1, dtSec / 45) : 0.1;

        // 2. Jerk / Acceleration Spike Score: Derivative of acceleration + rotational fumble
        const deltaAccel = Math.abs(pt.accelMagnitude - prev.accelMagnitude);
        const rawJerk = deltaAccel / dtSec;
        const jerkScore = Math.min(1, (rawJerk * 0.7 + pt.gyroRate * 0.3) / 12.0);

        // 3. Transit Transition Score: Exiting a vehicle or standing up abruptly
        let transitScore = 0;
        let isGhostVectorOrigin = false;
        if (prev.transitMode !== pt.transitMode) {
            transitScore = 0.85;
            if (prev.transitMode === 'VEHICLE' && pt.transitMode === 'WALKING') {
                transitScore = 1.0; // Highest risk: pockets empty when stepping out of cab/car
                isGhostVectorOrigin = true;
            }
        }

        // Weighted Formula: P_drop(p_i) = w1(Dwell) + w2(Jerk) + w3(Transit)
        const rawProbability =
            weights.w1_dwell * dwellScore +
            weights.w2_jerk * jerkScore +
            weights.w3_transit * transitScore;

        const dropProbability = Number(Math.min(1, Math.max(0, rawProbability)).toFixed(3));

        // Tactical Telemetry Diagnostic Label
        const reasons: string[] = [];
        if (isGhostVectorOrigin) reasons.push('VEHICLE_EGRESS_HANDOFF');
        if (jerkScore > 0.65) reasons.push('HIGH_G_JERK_SPIKE');
        if (dwellScore > 0.65) reasons.push('EXTENDED_MICRO_DWELL');
        if (reasons.length === 0) reasons.push('NOMINAL_TRANSIT');

        return {
            ...pt,
            dwellScore: Number(dwellScore.toFixed(2)),
            jerkScore: Number(jerkScore.toFixed(2)),
            transitScore: Number(transitScore.toFixed(2)),
            dropProbability,
            isGhostVectorOrigin,
            anomalyReason: reasons.join(' + '),
        };
    });
}

/**
 * Generates realistic demo telemetry around Bangkok (Chulalongkorn / Samyan area)
 * so you can test the MapLibre dashboard immediately.
 */
export function generateMockBangkokTrajectory(): {
    points: TelemetryPoint[];
    t0: number;
    t1: number;
} {
    const now = Date.now();
    const baseLat = 13.7367;
    const baseLng = 100.5331;

    const mockSteps: Array<Partial<TelemetryPoint> & { dLat: number; dLng: number; dtMin: number }> = [
        { dLat: 0.0000, dLng: 0.0000, dtMin: -30, accelMagnitude: 9.8, gyroRate: 0.2, transitMode: 'VEHICLE' },
        { dLat: 0.0012, dLng: 0.0015, dtMin: -25, accelMagnitude: 10.1, gyroRate: 0.4, transitMode: 'VEHICLE' },
        // Anomaly 1: Stepping out of Taxi at Samyan Mitrtown (Transit Handoff + Jerk spike)
        { dLat: 0.0024, dLng: 0.0031, dtMin: -20, accelMagnitude: 21.4, gyroRate: 4.8, transitMode: 'WALKING' },
        { dLat: 0.0029, dLng: 0.0034, dtMin: -16, accelMagnitude: 10.5, gyroRate: 0.9, transitMode: 'WALKING' },
        // Anomaly 2: Stopping at coffee kiosk / digging in bag (High Dwell + Moderate Jerk)
        { dLat: 0.0030, dLng: 0.0035, dtMin: -12, accelMagnitude: 16.8, gyroRate: 3.6, transitMode: 'STATIONARY' },
        { dLat: 0.0038, dLng: 0.0042, dtMin: -7, accelMagnitude: 10.2, gyroRate: 0.6, transitMode: 'WALKING' },
        { dLat: 0.0045, dLng: 0.0050, dtMin: -2, accelMagnitude: 9.9, gyroRate: 0.3, transitMode: 'WALKING' },
    ];

    const points: TelemetryPoint[] = mockSteps.map((step, i) => ({
        id: `NODE-0${i + 1}`,
        lat: baseLat + step.dLat,
        lng: baseLng + step.dLng,
        timestamp: now + step.dtMin * 60 * 1000,
        accelMagnitude: step.accelMagnitude!,
        gyroRate: step.gyroRate!,
        transitMode: step.transitMode!,
    }));

    return {
        points,
        t0: now - 35 * 60 * 1000,
        t1: now,
    };
}

/**
 * Parses Google Maps Timeline or custom JSON coordinate arrays into TelemetryPoint[]
 */
export function parseJsonToTelemetry(jsonText: string): {
    points: TelemetryPoint[];
    t0: number;
    t1: number;
} {
    const raw = JSON.parse(jsonText);
    const arr = Array.isArray(raw) ? raw : raw.semanticSegments || raw.locations || [];

    if (!Array.isArray(arr) || arr.length === 0) {
        throw new Error('No valid coordinate array found in JSON file.');
    }

    const points: TelemetryPoint[] = arr.slice(0, 60).map((item, idx) => {
        const lat = Number(item.lat ?? item.latitude ?? (item.latitudeE7 ? item.latitudeE7 / 1e7 : 13.7367));
        const lng = Number(item.lng ?? item.longitude ?? (item.longitudeE7 ? item.longitudeE7 / 1e7 : 100.5331));
        const timestamp = item.timestamp ? new Date(item.timestamp).getTime() : Date.now() - (60 - idx) * 30000;

        return {
            id: `JSON-${String(idx + 1).padStart(2, '0')}`,
            lat,
            lng,
            timestamp,
            accelMagnitude: Number(item.accelMagnitude ?? (idx % 4 === 0 ? 18.4 : 10.1)),
            gyroRate: Number(item.gyroRate ?? (idx % 4 === 0 ? 3.9 : 0.5)),
            transitMode: (item.transitMode as TransitMode) || (idx < 2 ? 'VEHICLE' : 'WALKING'),
        };
    });

    return {
        points,
        t0: points[0].timestamp,
        t1: points[points.length - 1].timestamp,
    };
}

/**
 * Parses standard GPX (<trkpt> / <wpt>) XML files into TelemetryPoint[]
 */
export function parseGpxToTelemetry(xmlText: string): {
    points: TelemetryPoint[];
    t0: number;
    t1: number;
} {
    const trkptRegex = /<(?:trkpt|wpt)[^>]*lat=["']([^"']+)["'][^>]*lon=["']([^"']+)["'][^>]*>([\s\S]*?)<\/(?:trkpt|wpt)>|<(?:trkpt|wpt)[^>]*lon=["']([^"']+)["'][^>]*lat=["']([^"']+)["'][^>]*>([\s\S]*?)<\/(?:trkpt|wpt)>/gi;
    const selfClosingRegex = /<(?:trkpt|wpt)[^>]*lat=["']([^"']+)["'][^>]*lon=["']([^"']+)["'][^>]*\/>/gi;

    const rawMatches: Array<{ lat: number; lng: number; timeStr?: string }> = [];
    let match: RegExpExecArray | null;

    while ((match = trkptRegex.exec(xmlText)) !== null) {
        const lat = parseFloat(match[1] ?? match[5]);
        const lng = parseFloat(match[2] ?? match[4]);
        const inner = match[3] ?? match[6] ?? '';
        const timeMatch = inner.match(/<time>([^<]+)<\/time>/i);
        if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
            rawMatches.push({ lat, lng, timeStr: timeMatch?.[1] });
        }
    }

    if (rawMatches.length === 0) {
        while ((match = selfClosingRegex.exec(xmlText)) !== null) {
            const lat = parseFloat(match[1]);
            const lng = parseFloat(match[2]);
            if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
                rawMatches.push({ lat, lng });
            }
        }
    }

    if (rawMatches.length === 0) {
        throw new Error('No valid <trkpt> or <wpt> coordinates found in GPX file.');
    }

    const sampled = rawMatches.slice(0, 60);
    const points: TelemetryPoint[] = sampled.map((pt, idx) => {
        const parsedTime = pt.timeStr ? new Date(pt.timeStr).getTime() : NaN;
        const timestamp = !Number.isNaN(parsedTime)
            ? parsedTime
            : Date.now() - (sampled.length - idx) * 30000;

        const prev = idx > 0 ? sampled[idx - 1] : pt;
        const dist = idx > 0 ? haversineMeters(prev.lat, prev.lng, pt.lat, pt.lng) : 0;
        const transitMode: TransitMode = dist > 80 ? 'VEHICLE' : dist < 3 && idx > 0 ? 'STATIONARY' : 'WALKING';

        return {
            id: `GPX-${String(idx + 1).padStart(2, '0')}`,
            lat: pt.lat,
            lng: pt.lng,
            timestamp,
            accelMagnitude: idx % 4 === 0 ? 19.2 : 10.1,
            gyroRate: idx % 4 === 0 ? 4.1 : 0.5,
            transitMode,
        };
    });

    return {
        points,
        t0: points[0].timestamp,
        t1: points[points.length - 1].timestamp,
    };
}
