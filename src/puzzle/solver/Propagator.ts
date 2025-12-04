// AC-3 Constraint Propagation
// Prunes domains based on tile adjacency constraints

import type {
  CellOrientationKey,
  VariantKey,
  Orientation,
  Direction,
  Vec3
} from '../types';
import { cellOrientationKey, parseCellOrientation } from '../types';
import { SolverState } from './SolverState';
import { getCompatibleVariants } from '../precompute';

// Map from orientation to relevant neighbor directions
const ORIENTATION_DIRECTIONS: Record<Orientation, Direction[]> = {
  'flat': ['posX', 'negX', 'posZ', 'negZ'],
  'vertical-x': ['posY', 'negY', 'posZ', 'negZ'],
  'vertical-z': ['posX', 'negX', 'posY', 'negY']
};

// Direction vectors
const DIRECTION_OFFSETS: Record<Direction, Vec3> = {
  posX: { x: 1, y: 0, z: 0 },
  negX: { x: -1, y: 0, z: 0 },
  posY: { x: 0, y: 1, z: 0 },
  negY: { x: 0, y: -1, z: 0 },
  posZ: { x: 0, y: 0, z: 1 },
  negZ: { x: 0, y: 0, z: -1 }
};

// Get neighbor cell in a direction
function getNeighborCell(cell: Vec3, direction: Direction): Vec3 {
  const offset = DIRECTION_OFFSETS[direction];
  return {
    x: cell.x + offset.x,
    y: cell.y + offset.y,
    z: cell.z + offset.z
  };
}

// Check if cell is within bounds
function isInBounds(cell: Vec3, state: SolverState): boolean {
  const { min, max } = state.bounds;
  return (
    cell.x >= min.x && cell.x <= max.x &&
    cell.y >= min.y && cell.y <= max.y &&
    cell.z >= min.z && cell.z <= max.z
  );
}

// Get compatible variants from a domain in a direction
function getCompatibleFromDomain(domain: Set<VariantKey>, direction: Direction): Set<VariantKey> {
  const result = new Set<VariantKey>();

  for (const vKey of domain) {
    const compatible = getCompatibleVariants(vKey, direction);
    for (const c of compatible) {
      result.add(c);
    }
  }

  return result;
}

// Intersect two sets
function intersectSets<T>(a: Set<T>, b: Set<T>): Set<T> {
  const result = new Set<T>();
  for (const item of a) {
    if (b.has(item)) {
      result.add(item);
    }
  }
  return result;
}

export interface PropagationResult {
  success: boolean;  // false if contradiction found
  changes: number;   // number of domain reductions
}

// AC-3 constraint propagation
export function propagate(state: SolverState): PropagationResult {
  let changes = 0;

  // Queue of (cell, orientation) pairs to process
  const queue: CellOrientationKey[] = [];
  const inQueue = new Set<CellOrientationKey>();

  // Initialize queue with all non-empty domains
  for (const [key, domain] of state.domains) {
    if (domain.size > 0 && domain.size < 100) {  // Skip huge domains initially
      queue.push(key);
      inQueue.add(key);
    }
  }

  while (queue.length > 0) {
    const currentKey = queue.shift()!;
    inQueue.delete(currentKey);

    const { cell, orientation } = parseCellOrientation(currentKey);
    const currentDomain = state.getDomain(cell.x, cell.y, cell.z, orientation);

    if (currentDomain.size === 0) {
      return { success: false, changes };
    }

    // Get directions relevant for this orientation
    const directions = ORIENTATION_DIRECTIONS[orientation];

    for (const dir of directions) {
      const neighborCell = getNeighborCell(cell, dir);

      if (!isInBounds(neighborCell, state)) continue;

      // For each orientation the neighbor could have
      const neighborOrientations = getNeighborOrientations(orientation, dir);

      for (const nOrientation of neighborOrientations) {
        const neighborKey = cellOrientationKey(
          neighborCell.x, neighborCell.y, neighborCell.z, nOrientation
        );

        const neighborDomain = state.getDomain(
          neighborCell.x, neighborCell.y, neighborCell.z, nOrientation
        );

        if (neighborDomain.size === 0) continue;

        // Get what's compatible with current domain in this direction
        const compatibleFromCurrent = getCompatibleFromDomain(currentDomain, dir);

        // Intersect with neighbor's current domain
        const newNeighborDomain = intersectSets(neighborDomain, compatibleFromCurrent);

        // If domain reduced, update and re-queue
        if (newNeighborDomain.size < neighborDomain.size) {
          changes++;

          if (newNeighborDomain.size === 0) {
            return { success: false, changes };
          }

          state.setDomain(
            neighborCell.x, neighborCell.y, neighborCell.z,
            nOrientation, newNeighborDomain
          );

          if (!inQueue.has(neighborKey)) {
            queue.push(neighborKey);
            inQueue.add(neighborKey);
          }
        }
      }
    }
  }

  return { success: true, changes };
}

// Get which orientations a neighbor might have based on direction
// Flat tiles connect to flat tiles horizontally
// Vertical tiles can connect to flat tiles at edges
function getNeighborOrientations(orientation: Orientation, direction: Direction): Orientation[] {
  switch (orientation) {
    case 'flat':
      // Flat tiles in XZ plane
      if (direction === 'posX' || direction === 'negX') {
        return ['flat', 'vertical-x'];  // Can connect to flat or vertical-x at edge
      }
      if (direction === 'posZ' || direction === 'negZ') {
        return ['flat', 'vertical-z'];  // Can connect to flat or vertical-z at edge
      }
      break;

    case 'vertical-x':
      // Vertical-X in YZ plane
      if (direction === 'posY' || direction === 'negY') {
        return ['vertical-x', 'flat'];  // Connect to vertical-x above/below or flat
      }
      if (direction === 'posZ' || direction === 'negZ') {
        return ['vertical-x'];  // Only connect to other vertical-x
      }
      break;

    case 'vertical-z':
      // Vertical-Z in XY plane
      if (direction === 'posX' || direction === 'negX') {
        return ['vertical-z'];  // Only connect to other vertical-z
      }
      if (direction === 'posY' || direction === 'negY') {
        return ['vertical-z', 'flat'];  // Connect to vertical-z above/below or flat
      }
      break;
  }

  return [];
}

// Propagate support constraints for vertical tiles
// Vertical tiles at y > 0 need a flat tile at y-1
export function propagateSupportConstraints(state: SolverState): PropagationResult {
  let changes = 0;
  const { min, max } = state.bounds;

  for (let x = min.x; x <= max.x; x++) {
    for (let y = min.y + 1; y <= max.y; y++) {  // Skip ground level
      for (let z = min.z; z <= max.z; z++) {
        // Check vertical-x tiles
        const vxDomain = state.getDomain(x, y, z, 'vertical-x');
        if (vxDomain.size > 0) {
          // Need flat tile at y-1
          const belowFlat = state.getDomain(x, y - 1, z, 'flat');
          if (belowFlat.size === 0 && !state.isPlaced(x, y - 1, z, 'flat')) {
            // No support possible - clear domain
            state.setDomain(x, y, z, 'vertical-x', new Set());
            changes++;
          }
        }

        // Check vertical-z tiles
        const vzDomain = state.getDomain(x, y, z, 'vertical-z');
        if (vzDomain.size > 0) {
          // Need flat tile at y-1
          const belowFlat = state.getDomain(x, y - 1, z, 'flat');
          if (belowFlat.size === 0 && !state.isPlaced(x, y - 1, z, 'flat')) {
            // No support possible - clear domain
            state.setDomain(x, y, z, 'vertical-z', new Set());
            changes++;
          }
        }

        // Check flat tiles at this level (need 2+ vertical supports from y-1)
        // This is complex to propagate - skip for now, check at placement time
      }
    }
  }

  return { success: true, changes };
}

// Full propagation with all constraint types
export function fullPropagate(state: SolverState): PropagationResult {
  let totalChanges = 0;
  let iterations = 0;
  const maxIterations = 100;

  while (iterations < maxIterations) {
    iterations++;

    // AC-3 propagation
    const ac3Result = propagate(state);
    if (!ac3Result.success) {
      return { success: false, changes: totalChanges + ac3Result.changes };
    }
    totalChanges += ac3Result.changes;

    // Support constraints
    const supportResult = propagateSupportConstraints(state);
    totalChanges += supportResult.changes;

    // If no changes, we're done
    if (ac3Result.changes === 0 && supportResult.changes === 0) {
      break;
    }
  }

  return { success: true, changes: totalChanges };
}
