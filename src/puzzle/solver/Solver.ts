import type { Placement, Bounds, Vec3, Orientation, Rotation, TileSpec, SolverResult, SolveTrace, Solution } from '../types';
import type { PlacedTile } from '../../tiles/types';
import { validateConnections } from '../../game/ConnectionValidator';

// ============= Position Enumeration =============

interface Position {
  cell: Vec3;
  orientation: Orientation;
}

function positionKey(pos: Position): string {
  return `${pos.cell.x},${pos.cell.y},${pos.cell.z},${pos.orientation}`;
}

/**
 * Enumerate all valid tile positions within bounds.
 */
function* enumeratePositions(bounds: Bounds): Generator<Position> {
  for (let y = bounds.min.y; y <= bounds.max.y; y++) {
    for (let z = bounds.min.z; z <= bounds.max.z; z++) {
      for (let x = bounds.min.x; x <= bounds.max.x; x++) {
        yield { cell: { x, y, z }, orientation: 'flat' };
        if (x < bounds.max.x) {
          yield { cell: { x, y, z }, orientation: 'vertical-x' };
        }
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
  occupiedPositions: Set<string>;
  remainingTiles: Map<string, number>;
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

function isValidSolution(placements: Placement[]): boolean {
  if (placements.length === 0) return false;
  const tiles = placements.map(placementToPlacedTile);
  const result = validateConnections(tiles);
  return result.valid;
}

/**
 * Get positions adjacent to currently placed tiles.
 * This focuses the search on connected placements.
 */
function getAdjacentPositions(
  placed: Placement[],
  allPositions: Position[],
  occupiedPositions: Set<string>
): Position[] {
  if (placed.length === 0) {
    // OPTIMIZATION: For first tile, just use first flat position
    // Since tiles are interchangeable, we don't need to try all positions
    const firstFlat = allPositions.find(p => p.orientation === 'flat');
    return firstFlat ? [firstFlat] : [allPositions[0]];
  }

  // Get open connectors and find positions near them
  const tiles = placed.map(placementToPlacedTile);
  const result = validateConnections(tiles);

  // Find positions that could satisfy open connectors
  const candidatePositions: Position[] = [];
  const seen = new Set<string>();

  for (const connector of result.openConnectors) {
    // For each open connector, find nearby positions
    for (const pos of allPositions) {
      const key = positionKey(pos);
      if (occupiedPositions.has(key) || seen.has(key)) continue;

      // Check if this position is near the connector
      const dx = Math.abs(pos.cell.x + 0.5 - connector.wx);
      const dy = Math.abs(pos.cell.y + 0.5 - connector.wy);
      const dz = Math.abs(pos.cell.z + 0.5 - connector.wz);

      // Position is adjacent if within ~1.5 units
      if (dx <= 1.5 && dy <= 1.5 && dz <= 1.5) {
        candidatePositions.push(pos);
        seen.add(key);
      }
    }
  }

  // If no candidates found, return all unoccupied (fallback)
  if (candidatePositions.length === 0) {
    return allPositions.filter(p => !occupiedPositions.has(positionKey(p)));
  }

  return candidatePositions;
}

export interface SolveOptions {
  maxSolutions?: number;
  timeoutMs?: number;
  dedupeRotations?: boolean;  // Only count canonical solutions (eliminates rotational duplicates)
}

export function solve(
  bounds: Bounds,
  tiles: TileSpec[],
  fixedPlacements: Placement[] = [],
  options: SolveOptions = {}
): SolverResult {
  const maxSolutions = options.maxSolutions || 10;
  const startTime = Date.now();
  const timeoutMs = options.timeoutMs || 30000;
  const dedupeRotations = options.dedupeRotations ?? true;  // Default: dedupe

  // Initialize state
  const state: SolverState = {
    placed: [...fixedPlacements],
    occupiedPositions: new Set(),
    remainingTiles: new Map(),
    trace: {
      maxBacktrackDepth: 0,
      totalBacktracks: 0,
      nodesExplored: 0,
      propagationCalls: 0
    }
  };

  // Mark fixed placements as occupied
  for (const p of fixedPlacements) {
    state.occupiedPositions.add(positionKey({ cell: p.cell, orientation: p.orientation }));
  }

  // Build inventory
  for (const spec of tiles) {
    state.remainingTiles.set(spec.tileId, spec.count);
  }

  const solutions: Solution[] = [];
  const allPositions = [...enumeratePositions(bounds)];

  function search(depth: number): boolean {
    if (Date.now() - startTime > timeoutMs) {
      return true;
    }

    state.trace.nodesExplored++;
    state.trace.maxBacktrackDepth = Math.max(state.trace.maxBacktrackDepth, depth);

    // If no tiles remaining, check if valid solution
    if (!hasRemainingTiles(state)) {
      if (isValidSolution(state.placed)) {
        solutions.push({ placements: [...state.placed] });
        return solutions.length >= maxSolutions;
      }
      state.trace.totalBacktracks++;
      return false;
    }

    // OPTIMIZATION: Only try positions adjacent to existing tiles
    const candidatePositions = getAdjacentPositions(state.placed, allPositions, state.occupiedPositions);

    // Try placing each remaining tile at candidate positions
    for (const [tileId, count] of state.remainingTiles) {
      if (count <= 0) continue;

      for (const pos of candidatePositions) {
        const posKey = positionKey(pos);
        if (state.occupiedPositions.has(posKey)) continue;

        let variants = getVariants(tileId, pos);
        // OPTIMIZATION: For first tile, only try canonical orientation (eliminates symmetric duplicates)
        if (dedupeRotations && state.placed.length === 0) {
          variants = variants.filter(v => v.rotation === 0 && !v.flipped);
        }

        for (const variant of variants) {
          // Place tile
          useTile(state, tileId);
          state.placed.push(variant);
          state.occupiedPositions.add(posKey);

          const done = search(depth + 1);

          // Backtrack
          state.placed.pop();
          state.occupiedPositions.delete(posKey);
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
