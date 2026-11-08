// src/lib/pet-diffusion.ts
import {
  runPetRadianceSimulation,
  PetBehaviorProfile,
  RadianceCell,
} from '@/lib/engine/pet-diffusion';

export type { RadianceCell };
export type BehaviorProfile = 'INDOOR_CAT' | 'SPOOKED_DOG' | 'FRIENDLY_DOG';

export function simulatePetDiffusion(
  originLat: number,
  originLng: number,
  elapsedMinutes: number,
  profile: BehaviorProfile,
  isRaining: boolean,
  sightings: { lat: number; lng: number }[] = []
): RadianceCell[] {
  const mappedProfile: PetBehaviorProfile =
    profile === 'INDOOR_CAT'
      ? 'SHY_CAT'
      : profile === 'SPOOKED_DOG'
        ? 'SPOOKED_DOG'
        : 'CURIOUS_DOG';

  const latestSighting =
    sightings.length > 0 ? sightings[sightings.length - 1] : null;

  return runPetRadianceSimulation({
    originLat,
    originLng,
    elapsedMinutes,
    profile: mappedProfile,
    isStorming: isRaining,
    sightingOverride: latestSighting,
  });
}

