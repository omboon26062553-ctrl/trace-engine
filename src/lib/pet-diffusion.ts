// src/lib/pet-diffusion.ts

export type BehaviorProfile = 'INDOOR_CAT' | 'SPOOKED_DOG' | 'FRIENDLY_DOG';

export interface RadianceCell {
  lat: number;
  lng: number;
  probability: number; // 0.0 to 1.0
  isCorridor: boolean;
}

export interface VectorConeInfo {
  bearingDeg: number;
  speedMetersPerMin: number;
  hasDirection: boolean;
}

// คำนวณมุมทิศทาง (Bearing) จากจุด T0 ไปจุดที่พบเห็นล่าสุด
export function computeDirectionalVector(
  origin: { lat: number; lng: number },
  sightings: { lat: number; lng: number }[],
  elapsedMinutes: number
): VectorConeInfo {
  if (!sightings || sightings.length === 0) {
    return { bearingDeg: 0, speedMetersPerMin: 0, hasDirection: false };
  }
  const latest = sightings[sightings.length - 1];
  const dLat = latest.lat - origin.lat;
  const dLng = latest.lng - origin.lng;
  const distMeters = Math.sqrt(dLat * dLat + dLng * dLng) * 111320;
  const rad = Math.atan2(dLng, dLat);
  const bearingDeg = (rad * (180 / Math.PI) + 360) % 360;

  return {
    bearingDeg: Math.round(bearingDeg),
    speedMetersPerMin: Number((distMeters / Math.max(5, elapsedMinutes)).toFixed(1)),
    hasDirection: distMeters > 5,
  };
}

export function simulatePetDiffusion(
  originLat: number,
  originLng: number,
  elapsedMinutes: number,
  profile: BehaviorProfile,
  isRaining: boolean,
  sightings: { lat: number; lng: number }[] = [],
  clearedZones: { lat: number; lng: number }[] = []
): RadianceCell[] {
  const cells: RadianceCell[] = [];

  // จุดศูนย์กลางล่าสุด (หากมีคนแจ้งจุดพบเห็น ให้ย้าย Anchor มายังจุดล่าสุด)
  const anchor =
    sightings.length > 0 ? sightings[sightings.length - 1] : { lat: originLat, lng: originLng };

  // เวกเตอร์ทิศทางการวิ่งหนี (Forward-Bias Velocity Vector)
  const hasVector = sightings.length > 0;
  const vecLat = hasVector ? anchor.lat - originLat : 0;
  const vecLng = hasVector ? anchor.lng - originLng : 0;
  const vecMag = Math.sqrt(vecLat * vecLat + vecLng * vecLng);

  // พารามิเตอร์ตามสายพันธุ์และสภาพอากาศ
  const baseRadiusDeg =
    profile === 'INDOOR_CAT'
      ? 0.0014 + (elapsedMinutes / 240) * 0.0015
      : profile === 'SPOOKED_DOG'
        ? 0.0025 + (elapsedMinutes / 240) * 0.0038
        : 0.0020 + (elapsedMinutes / 240) * 0.0026;

  const weatherMultiplier = isRaining ? 0.68 : 1.0; // ฝนตกสัตว์จะหยุดซ่อนตัวใต้ชายคา
  const maxRadius = baseRadiusDeg * weatherMultiplier;

  const gridSteps = 8; // สร้างตาราง Cellular Automata 17x17 รอบจุด Anchor
  const stepSize = maxRadius / gridSteps;

  for (let gx = -gridSteps; gx <= gridSteps; gx++) {
    for (let gy = -gridSteps; gy <= gridSteps; gy++) {
      const dLat = gx * stepSize;
      const dLng = gy * stepSize;
      const dist = Math.sqrt(dLat * dLat + dLng * dLng);

      if (dist > maxRadius) continue;

      const cellLat = anchor.lat + dLat;
      const cellLng = anchor.lng + dLng;

      // 1. Negative Space Carving: ตัดพื้นที่สีเทาที่อาสาสมัครเดินสำรวจแล้วไม่พบออกทันที (P = 0)
      const isInsideClearedZone = clearedZones.some((cz) => {
        const cDist = Math.sqrt(
          Math.pow(cellLat - cz.lat, 2) + Math.pow(cellLng - cz.lng, 2)
        );
        return cDist < 0.0011; // รัศมีเคลียร์พื้นที่ ~120 เมตร
      });
      if (isInsideClearedZone) continue;

      // 2. Street Corridor & Building Perimeter Constraint (บังคับเกาะตามแนวแกนซอยและขอบอาคาร)
      const isAlongStreetAxis = Math.abs(gx) <= 1 || Math.abs(gy) <= 1 || Math.abs(gx) === Math.abs(gy);
      const corridorWeight =
        profile === 'INDOOR_CAT'
          ? gx % 2 === 0 && gy % 2 === 0
            ? 1.25 // แมวซ่อนตามมุมตึก
            : 0.45
          : isAlongStreetAxis
            ? 1.35 // สุนัขวิ่งตามแนวถนนและตรอกซอย
            : 0.35;

      // 3. Directional Velocity Cone (เพิ่มความน่าจะเป็นในทิศทางที่สัตว์กำลังมุ่งหน้า)
      let directionalMultiplier = 1.0;
      if (hasVector && vecMag > 0.0001 && dist > 0) {
        const dot = (dLat * vecLat + dLng * vecLng) / (dist * vecMag); // cos(theta) in [-1, 1]
        directionalMultiplier = dot > 0.2 ? 1.45 + dot * 0.5 : 0.35;
      }

      // 4. Distance Decay
      const normDist = dist / maxRadius;
      const baseProb =
        profile === 'INDOOR_CAT'
          ? Math.exp(-normDist * 2.4)
          : Math.exp(-normDist * 1.5);

      const finalProb = Math.min(
        0.98,
        baseProb * corridorWeight * directionalMultiplier * (isRaining ? 1.2 : 1.0)
      );

      if (finalProb > 0.14) {
        cells.push({
          lat: cellLat,
          lng: cellLng,
          probability: Number(finalProb.toFixed(2)),
          isCorridor: isAlongStreetAxis,
        });
      }
    }
  }

  return cells.sort((a, b) => b.probability - a.probability);
}
