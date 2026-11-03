// src/lib/engine/pet-diffusion.ts

export type PetBehaviorProfile = 'SHY_CAT' | 'SPOOKED_DOG' | 'CURIOUS_DOG';

export type TerrainType = 'STANDARD' | 'GREEN_PARK' | 'DENSE_COVER' | 'WATER_CANAL' | 'HIGHWAY_BARRIER';

export interface RadianceCell {
    row: number;
    col: number;
    lat: number;
    lng: number;
    probability: number; // Normalized [0, 1] for heatmap rendering
    terrain: TerrainType;
}

export interface SimulationConfig {
    originLat: number;
    originLng: number;
    elapsedMinutes: number;
    profile: PetBehaviorProfile;
    isStorming?: boolean; // Weather coupler improvisation
    sightingOverride?: { lat: number; lng: number } | null;
}

const GRID_SIZE = 25; // 25x25 Cellular Automata matrix
const CELL_SIZE_DEGREES = 0.00035; // ~38 meters per cell

/**
 * Assigns deterministic synthetic terrain around the origin so the CA grid
 * visibly reacts to parks, canals, and highway barriers.
 */
function classifyCellTerrain(row: number, col: number): TerrainType {
    if (row === 6 || row === 7) return 'WATER_CANAL'; // Horizontal canal barrier
    if (col === 19) return 'HIGHWAY_BARRIER'; // Vertical loud highway
    if (row >= 14 && row <= 19 && col >= 4 && col <= 10) return 'GREEN_PARK'; // Park attractor
    if ((row + col) % 5 === 0) return 'DENSE_COVER'; // High-density building cover
    return 'STANDARD';
}

/**
 * Returns terrain permeability multiplier based on pet profile & weather state
 */
function getTerrainMultiplier(
    terrain: TerrainType,
    profile: PetBehaviorProfile,
    isStorming: boolean
): number {
    if (terrain === 'WATER_CANAL') return 0.05; // Near-impassable barrier

    switch (profile) {
        case 'SHY_CAT':
            if (terrain === 'DENSE_COVER') return 1.65;
            if (terrain === 'HIGHWAY_BARRIER') return 0.08;
            if (terrain === 'GREEN_PARK') return 0.6;
            return 0.75;

        case 'SPOOKED_DOG':
            if (isStorming && terrain === 'DENSE_COVER') return 1.85; // Seeks shelter during thunder
            if (terrain === 'HIGHWAY_BARRIER') return 0.15;
            if (terrain === 'STANDARD') return 1.35; // Fast along linear road corridors
            return 1.0;

        case 'CURIOUS_DOG':
            if (terrain === 'GREEN_PARK') return 1.5; // Spec requirement: 1.5x green zone weight
            if (terrain === 'HIGHWAY_BARRIER') return 0.35;
            return 1.1;
    }
}

/**
 * Pillar 2 Core Engine: 2D Cellular Automata Isochrone Diffusion
 */
export function runPetRadianceSimulation(config: SimulationConfig): RadianceCell[] {
    const centerLat = config.sightingOverride ? config.sightingOverride.lat : config.originLat;
    const centerLng = config.sightingOverride ? config.sightingOverride.lng : config.originLng;
    const half = Math.floor(GRID_SIZE / 2);

    // Initialize 2D probability state grids
    let grid: number[][] = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0));
    const terrainGrid: TerrainType[][] = Array.from({ length: GRID_SIZE }, (_, r) =>
        Array.from({ length: GRID_SIZE }, (__, c) => classifyCellTerrain(r, c))
    );

    // Seed escape origin (or collapsed community sighting coordinate)
    grid[half][half] = 1.0;

    // Determine CA step count and diffusion rate from profile & elapsed time
    const baseRate =
        config.profile === 'SHY_CAT' ? 0.08 : config.profile === 'SPOOKED_DOG' ? 0.24 : 0.16;
    const stormBoost = config.isStorming && config.profile === 'SPOOKED_DOG' ? 1.35 : 1.0;
    const diffusionRate = Math.min(0.35, baseRate * stormBoost);

    const steps = Math.min(28, Math.max(2, Math.floor(config.elapsedMinutes / 5)));

    // Run Cellular Automata Moore Neighborhood (8-direction) diffusion steps
    for (let step = 0; step < steps; step++) {
        const nextGrid = grid.map((row) => [...row]);

        for (let r = 1; r < GRID_SIZE - 1; r++) {
            for (let c = 1; c < GRID_SIZE - 1; c++) {
                if (grid[r][c] <= 0.001) continue;

                const neighbors = [
                    [r - 1, c],
                    [r + 1, c],
                    [r, c - 1],
                    [r, c + 1],
                    [r - 1, c - 1],
                    [r - 1, c + 1],
                    [r + 1, c - 1],
                    [r + 1, c + 1],
                ];

                for (const [nr, nc] of neighbors) {
                    const terrainWeight = getTerrainMultiplier(
                        terrainGrid[nr][nc],
                        config.profile,
                        Boolean(config.isStorming)
                    );
                    const transfer = grid[r][c] * (diffusionRate / 8) * terrainWeight;
                    nextGrid[nr][nc] += transfer;
                }

                // Shy cats retain high probability near hiding spots close to origin
                const retention = config.profile === 'SHY_CAT' ? 0.88 : 0.72;
                nextGrid[r][c] *= retention;
            }
        }
        grid = nextGrid;
    }

    // Normalize matrix to [0, 1] for tactical HTML5 Canvas rendering
    let maxVal = 0.0001;
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            if (grid[r][c] > maxVal) maxVal = grid[r][c];
        }
    }

    const cells: RadianceCell[] = [];
    for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
            const normProb = Number((grid[r][c] / maxVal).toFixed(3));
            if (normProb < 0.04) continue; // Cull negligible outer noise

            cells.push({
                row: r,
                col: c,
                lat: centerLat + (r - half) * CELL_SIZE_DEGREES,
                lng: centerLng + (c - half) * CELL_SIZE_DEGREES,
                probability: normProb,
                terrain: terrainGrid[r][c],
            });
        }
    }

    return cells;
}