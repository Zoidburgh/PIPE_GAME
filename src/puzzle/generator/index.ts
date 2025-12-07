import type { TileSpec, Bounds, Placement, Solution } from '../types';
import { getAllTileIds } from '../precompute';
import { solve } from '../solver';

// Re-export shape generator
export { generateShape, generateShapePuzzle, findFittingTiles } from './ShapeGenerator';
export type { ShapePosition, ShapePuzzle } from './ShapeGenerator';

// Re-export network builder
export { buildNetwork } from './NetworkBuilder';

// Re-export solution builder
export { buildPuzzle } from './SolutionBuilder';
export type { BuiltPuzzle } from './SolutionBuilder';

// Re-export simple filler
export { fillShape } from './SimpleFiller';
export type { FilledPuzzle } from './SimpleFiller';

// Re-export cube builder
export { buildCubePuzzle } from './CubeBuilder';
export type { CubePuzzle } from './CubeBuilder';

// Re-export grid builder
export { buildGridPuzzle } from './GridBuilder';
export type { GridPuzzle } from './GridBuilder';

// Re-export box builder (3D with backtracking)
export { buildBox, buildLargeBox, testTwoTiles } from './BoxBuilder';
export type { BoxPuzzle } from './BoxBuilder';

// ============= Configuration =============

export interface GeneratorConfig {
  // How many tiles in the puzzle
  tileCount: { min: number; max: number };
  // Optional: restrict to specific tile IDs (defaults to all)
  tilePool?: string[];
  // Grid size constraints
  gridSize?: { min: number; max: number };
  // Allow 3D (vertical tiles)?
  allow3D?: boolean;
  // Max attempts before giving up
  maxAttempts?: number;
  // Solution count requirements
  minSolutions?: number;
  maxSolutions?: number;
}

export interface PuzzleSpec {
  bounds: Bounds;
  inventory: TileSpec[];
  fixedTiles: Placement[];
}

export interface GeneratedPuzzle {
  spec: PuzzleSpec;
  solutions: Solution[];
  attempts: number;
}

// ============= Step 2.1: Random Inventory =============

/**
 * Pick random tiles from the pool.
 */
export function randomInventory(config: {
  tileCount: { min: number; max: number };
  tilePool?: string[];
}): TileSpec[] {
  const pool = config.tilePool ?? getAllTileIds();

  if (pool.length === 0) {
    throw new Error('No tiles in pool');
  }

  // Pick random total count
  const totalCount = randomInt(config.tileCount.min, config.tileCount.max);

  // Build inventory by randomly picking tiles
  const counts = new Map<string, number>();

  for (let i = 0; i < totalCount; i++) {
    const tileId = pool[randomInt(0, pool.length - 1)];
    counts.set(tileId, (counts.get(tileId) || 0) + 1);
  }

  // Convert to TileSpec array
  const inventory: TileSpec[] = [];
  for (const [tileId, count] of counts) {
    inventory.push({ tileId, count });
  }

  return inventory;
}

// ============= Step 2.2: Bounds Calculator =============

/**
 * Calculate bounds that can fit the given inventory.
 */
export function boundsForInventory(
  inventory: TileSpec[],
  options?: { allow3D?: boolean; gridSize?: { min: number; max: number } }
): Bounds {
  const totalTiles = inventory.reduce((sum, spec) => sum + spec.count, 0);
  const allow3D = options?.allow3D ?? false;
  const minSize = options?.gridSize?.min ?? 2;
  const maxSize = options?.gridSize?.max ?? 6;

  // Calculate grid dimensions to fit tiles
  // For flat-only: need width * depth >= totalTiles
  // For 3D: more complex, but start simple

  if (!allow3D) {
    // 2D grid: find smallest square-ish dimensions
    const size = Math.max(minSize, Math.ceil(Math.sqrt(totalTiles)));
    const clampedSize = Math.min(size, maxSize);

    return {
      min: { x: 0, y: 0, z: 0 },
      max: { x: clampedSize - 1, y: 0, z: clampedSize - 1 }
    };
  } else {
    // 3D: add some height
    const baseSize = Math.max(minSize, Math.ceil(Math.cbrt(totalTiles)));
    const clampedSize = Math.min(baseSize, maxSize);
    const height = Math.min(2, Math.ceil(totalTiles / (clampedSize * clampedSize)));

    return {
      min: { x: 0, y: 0, z: 0 },
      max: { x: clampedSize - 1, y: height - 1, z: clampedSize - 1 }
    };
  }
}

// ============= Step 2.3: Generate Single Puzzle =============

/**
 * Generate a puzzle with the given config.
 * Returns null if no valid puzzle found within maxAttempts.
 */
export function generatePuzzle(config: GeneratorConfig): GeneratedPuzzle | null {
  const maxAttempts = config.maxAttempts ?? 50;
  const minSolutions = config.minSolutions ?? 1;
  const maxSolutions = config.maxSolutions ?? 3;

  console.log(`[Generator] Starting with maxAttempts=${maxAttempts}`);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    // Generate random inventory
    const inventory = randomInventory({
      tileCount: config.tileCount,
      tilePool: config.tilePool
    });

    // Calculate bounds
    const bounds = boundsForInventory(inventory, {
      allow3D: config.allow3D,
      gridSize: config.gridSize
    });

    const totalTiles = inventory.reduce((sum, s) => sum + s.count, 0);
    console.log(`[Generator] Attempt ${attempt}: ${totalTiles} tiles, bounds ${bounds.max.x+1}x${bounds.max.z+1}`);

    // Try to solve - shorter timeout per attempt
    const result = solve(bounds, inventory, [], {
      maxSolutions: maxSolutions + 1,
      timeoutMs: 2000  // 2 seconds max per attempt
    });

    console.log(`[Generator] Attempt ${attempt}: ${result.solutionCount} solutions, ${result.trace?.nodesExplored ?? 0} nodes`);

    // Check if valid puzzle (1-3 solutions by default)
    if (result.solutionCount >= minSolutions && result.solutionCount <= maxSolutions) {
      console.log(`[Generator] SUCCESS after ${attempt} attempts!`);
      return {
        spec: {
          bounds,
          inventory,
          fixedTiles: []
        },
        solutions: result.solutions,
        attempts: attempt
      };
    }
  }

  console.log(`[Generator] FAILED after ${maxAttempts} attempts`);
  return null;
}

// ============= Step 2.4: Batch Generation =============

/**
 * Generate multiple puzzles.
 */
export function generatePuzzles(
  config: GeneratorConfig,
  count: number
): GeneratedPuzzle[] {
  const puzzles: GeneratedPuzzle[] = [];

  for (let i = 0; i < count * 3 && puzzles.length < count; i++) {
    const puzzle = generatePuzzle(config);
    if (puzzle) {
      puzzles.push(puzzle);
    }
  }

  return puzzles;
}

// ============= Utilities =============

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
