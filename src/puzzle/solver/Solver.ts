import type { Placement, Bounds, Vec3, Orientation, Rotation, TileSpec, SolverResult, SolveTrace, Solution } from '../types';
import type { PlacedTile } from '../../tiles/types';
import { validateConnections } from '../../game/ConnectionValidator';

// ============= Position Enumeration =============

interface Position {
  cell: Vec3;
  orientation: Orientation;
}

/**
 * Enumerate all valid tile positions within bounds.
 * - Flat tiles: on each cell floor
 * - Vertical-X tiles: on +X edges
 * - Vertical-Z tiles: on +Z edges
 */
function* enumeratePositions(bounds: Bounds): Generator<Position> {
  for (let y = bounds.min.y; y <= bounds.max.y; y++) {
    for (let z = bounds.min.z; z <= bounds.max.z; z++) {
      for (let x = bounds.min.x; x <= bounds.max.x; x++) {
        // Flat tile at this cell
        yield { cell: { x, y, z }, orientation: 'flat' };

        // Vertical-X on +X edge (not on max X boundary)
        if (x < bounds.max.x) {
          yield { cell: { x, y, z }, orientation: 'vertical-x' };
        }

        // Vertical-Z on +Z edge (not on max Z boundary)
        if (z < bounds.max.z) {
          yield { cell: { x, y, z }, orientation: 'vertical-z' };
        }
      }
    }
  }
}

// ============= Tile Variants =============

const ROTATIONS: Rotation[] = [0, 90, 180, 270];
const FLIPS = [false, true];

/**
 * Get all rotation/flip variants for placing a tile at a position.
 */
function getVariants(tileId: string, pos: Position): Placement[] {
  const variants: Placement[] = [];
  for (const rotation of ROTATIONS) {
    for (const flipped of FLIPS) {
      variants.push({
        cell: pos.cell,
        orientation: pos.orientation,
        tileId,
        rotation,
        flipped
      });
    }
  }
  return variants;
}

// ============= Conversion =============

function placementToPlacedTile(p: Placement): PlacedTile {
  return {
    definition: { id: p.tileId, name: p.tileId },
    position: { x: p.cell.x, y: p.cell.y, z: p.cell.z },
    rotation: p.rotation,
    flipped: p.flipped,
    orientation: p.orientation
  };
}

// ============= Solver =============

interface SolverState {
  placed: Placement[];
  remainingTiles: Map<string, number>;  // tileId -> count remaining
  trace: SolveTrace;
}

function hasRemainingTiles(state: SolverState): boolean {
  for (const count of state.remainingTiles.values()) {
    if (count > 0) return true;
  }
  return false;
}

function useTile(state: SolverState, tileId: string): boolean {
  const count = state.remainingTiles.get(tileId) || 0;
  if (count <= 0) return false;
  state.remainingTiles.set(tileId, count - 1);
  return true;
}

function returnTile(state: SolverState, tileId: string): void {
  const count = state.remainingTiles.get(tileId) || 0;
  state.remainingTiles.set(tileId, count + 1);
}

/**
 * Check if current placements form a valid closed network.
 */
function isValidSolution(placements: Placement[]): boolean {
  if (placements.length === 0) return false;
  const tiles = placements.map(placementToPlacedTile);
  const result = validateConnections(tiles);
  return result.valid;
}

/**
 * Check for position conflicts (two tiles in same spot).
 */
function hasPositionConflict(placements: Placement[], newPlacement: Placement): boolean {
  for (const p of placements) {
    if (p.cell.x === newPlacement.cell.x &&
        p.cell.y === newPlacement.cell.y &&
        p.cell.z === newPlacement.cell.z &&
        p.orientation === newPlacement.orientation) {
      return true;
    }
  }
  return false;
}

export interface SolveOptions {
  maxSolutions?: number;
  timeoutMs?: number;
}

/**
 * Solve a puzzle: find arrangements of tiles that form a closed network.
 */
export function solve(
  bounds: Bounds,
  tiles: TileSpec[],
  fixedPlacements: Placement[] = [],
  options: SolveOptions = {}
): SolverResult {
  const maxSolutions = options.maxSolutions || 10;
  const startTime = Date.now();
  const timeoutMs = options.timeoutMs || 30000;

  // Initialize state
  const state: SolverState = {
    placed: [...fixedPlacements],
    remainingTiles: new Map(),
    trace: {
      maxBacktrackDepth: 0,
      totalBacktracks: 0,
      nodesExplored: 0,
      propagationCalls: 0
    }
  };

  // Build inventory
  for (const spec of tiles) {
    state.remainingTiles.set(spec.tileId, spec.count);
  }

  const solutions: Solution[] = [];
  const positions = [...enumeratePositions(bounds)];

  function search(depth: number): boolean {
    // Check timeout
    if (Date.now() - startTime > timeoutMs) {
      return true; // Stop searching
    }

    state.trace.nodesExplored++;
    state.trace.maxBacktrackDepth = Math.max(state.trace.maxBacktrackDepth, depth);

    // If no tiles remaining, check if valid solution
    if (!hasRemainingTiles(state)) {
      if (isValidSolution(state.placed)) {
        solutions.push({
          placements: [...state.placed]
        });
        return solutions.length >= maxSolutions;
      }
      state.trace.totalBacktracks++;
      return false;
    }

    // Try placing each remaining tile at each position
    for (const [tileId, count] of state.remainingTiles) {
      if (count <= 0) continue;

      for (const pos of positions) {
        // Skip if position already occupied
        if (hasPositionConflict(state.placed, { ...pos, tileId, rotation: 0, flipped: false } as Placement)) {
          continue;
        }

        // Try each variant
        for (const variant of getVariants(tileId, pos)) {
          // Use tile from inventory
          useTile(state, tileId);
          state.placed.push(variant);

          // Recurse
          const done = search(depth + 1);

          // Backtrack
          state.placed.pop();
          returnTile(state, tileId);

          if (done) return true;
        }
      }
    }

    state.trace.totalBacktracks++;
    return false;
  }

  search(0);

  return {
    solutions,
    solutionCount: solutions.length,
    trace: state.trace,
    timedOut: Date.now() - startTime > timeoutMs
  };
}

// Export for testing
export { enumeratePositions, placementToPlacedTile, isValidSolution };
