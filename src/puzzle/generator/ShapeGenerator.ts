import type { Placement, Orientation, Rotation, TileSpec } from '../types';
import type { PlacedTile } from '../../tiles/types';
import { validateConnections } from '../../game/ConnectionValidator';
import { GENERATED_TILES } from '../../tiles/TileBuilder';

// ============= Types =============

export interface ShapePosition {
  x: number;
  y: number;
  z: number;
  orientation: Orientation;
}

function posKey(p: ShapePosition): string {
  return `${p.x},${p.y},${p.z},${p.orientation}`;
}

// ============= Shape Generation =============

/**
 * Generate a random connected shape using polyomino-style growth.
 * Starts with one flat tile and grows by adding adjacent positions.
 */
export function generateShape(config: {
  size: { min: number; max: number };
  allow3D?: boolean;
  startFlat?: boolean;
}): ShapePosition[] {
  const shape: ShapePosition[] = [];
  const occupied = new Set<string>();

  const targetSize = randomInt(config.size.min, config.size.max);
  const allow3D = config.allow3D ?? false;

  // Start with one flat tile at origin
  const start: ShapePosition = { x: 0, y: 0, z: 0, orientation: 'flat' };
  shape.push(start);
  occupied.add(posKey(start));

  while (shape.length < targetSize) {
    // Get all valid adjacent positions not yet in shape
    const candidates = getAdjacentCandidates(shape, occupied, allow3D);

    if (candidates.length === 0) {
      // Dead end - can't grow more
      console.log(`[ShapeGen] Can't grow beyond ${shape.length} tiles`);
      break;
    }

    // Pick random candidate
    const next = candidates[randomInt(0, candidates.length - 1)];
    shape.push(next);
    occupied.add(posKey(next));
  }

  return shape;
}

/**
 * Get all positions adjacent to the current shape that aren't occupied.
 * Filters out positions that would violate support rules.
 */
function getAdjacentCandidates(
  shape: ShapePosition[],
  occupied: Set<string>,
  allow3D: boolean
): ShapePosition[] {
  const candidates: ShapePosition[] = [];
  const seen = new Set<string>();

  for (const pos of shape) {
    // Get neighbors based on orientation
    const neighbors = getNeighbors(pos, allow3D);

    for (const neighbor of neighbors) {
      const key = posKey(neighbor);
      if (!occupied.has(key) && !seen.has(key)) {
        // Check if this position satisfies support rules
        if (isPositionSupported(neighbor, occupied)) {
          candidates.push(neighbor);
          seen.add(key);
        }
      }
    }
  }

  return candidates;
}

/**
 * Check if a position satisfies the layer support rules.
 * - Flat tiles at y=0: always valid
 * - Flat tiles at y>0: need at least 2 vertical supports from y-1 level
 * - Vertical tiles at y>0: need a flat tile below at y-1 level
 */
function isPositionSupported(pos: ShapePosition, occupied: Set<string>): boolean {
  // Ground level is always supported
  if (pos.y === 0) return true;

  if (pos.orientation === 'flat') {
    // Need at least 2 vertical tile supports from y-1 level
    let supportCount = 0;

    // Left: vertical-x at (x-1, y-1, z)
    if (occupied.has(posKey({ x: pos.x - 1, y: pos.y - 1, z: pos.z, orientation: 'vertical-x' }))) {
      supportCount++;
    }
    // Right: vertical-x at (x, y-1, z)
    if (occupied.has(posKey({ x: pos.x, y: pos.y - 1, z: pos.z, orientation: 'vertical-x' }))) {
      supportCount++;
    }
    // Front: vertical-z at (x, y-1, z-1)
    if (occupied.has(posKey({ x: pos.x, y: pos.y - 1, z: pos.z - 1, orientation: 'vertical-z' }))) {
      supportCount++;
    }
    // Back: vertical-z at (x, y-1, z)
    if (occupied.has(posKey({ x: pos.x, y: pos.y - 1, z: pos.z, orientation: 'vertical-z' }))) {
      supportCount++;
    }

    return supportCount >= 2;
  }

  if (pos.orientation === 'vertical-x' || pos.orientation === 'vertical-z') {
    // Need a flat tile below at y-1 level
    return occupied.has(posKey({ x: pos.x, y: pos.y - 1, z: pos.z, orientation: 'flat' }));
  }

  return true;
}

/**
 * Get all neighboring positions for a given position.
 */
function getNeighbors(pos: ShapePosition, allow3D: boolean): ShapePosition[] {
  const neighbors: ShapePosition[] = [];

  if (pos.orientation === 'flat') {
    // Flat tile can connect to:
    // - Adjacent flat tiles (same Y, ±X or ±Z)
    // - Vertical tiles on its edges

    // Adjacent flats
    neighbors.push({ x: pos.x - 1, y: pos.y, z: pos.z, orientation: 'flat' });
    neighbors.push({ x: pos.x + 1, y: pos.y, z: pos.z, orientation: 'flat' });
    neighbors.push({ x: pos.x, y: pos.y, z: pos.z - 1, orientation: 'flat' });
    neighbors.push({ x: pos.x, y: pos.y, z: pos.z + 1, orientation: 'flat' });

    if (allow3D) {
      // Vertical-X on left and right edges
      neighbors.push({ x: pos.x - 1, y: pos.y, z: pos.z, orientation: 'vertical-x' }); // left edge
      neighbors.push({ x: pos.x, y: pos.y, z: pos.z, orientation: 'vertical-x' }); // right edge

      // Vertical-Z on front and back edges
      neighbors.push({ x: pos.x, y: pos.y, z: pos.z - 1, orientation: 'vertical-z' }); // front edge
      neighbors.push({ x: pos.x, y: pos.y, z: pos.z, orientation: 'vertical-z' }); // back edge

      // Flat tiles above/below via vertical connections
      neighbors.push({ x: pos.x, y: pos.y + 1, z: pos.z, orientation: 'flat' });
      if (pos.y > 0) {
        neighbors.push({ x: pos.x, y: pos.y - 1, z: pos.z, orientation: 'flat' });
      }
    }
  } else if (pos.orientation === 'vertical-x') {
    // Vertical-X connects to flats on either side and verticals above/below
    neighbors.push({ x: pos.x, y: pos.y, z: pos.z, orientation: 'flat' }); // flat to left
    neighbors.push({ x: pos.x + 1, y: pos.y, z: pos.z, orientation: 'flat' }); // flat to right

    if (allow3D) {
      // Vertical-X above/below
      neighbors.push({ x: pos.x, y: pos.y + 1, z: pos.z, orientation: 'vertical-x' });
      if (pos.y > 0) {
        neighbors.push({ x: pos.x, y: pos.y - 1, z: pos.z, orientation: 'vertical-x' });
      }
    }
  } else if (pos.orientation === 'vertical-z') {
    // Vertical-Z connects to flats on either side
    neighbors.push({ x: pos.x, y: pos.y, z: pos.z, orientation: 'flat' }); // flat in front
    neighbors.push({ x: pos.x, y: pos.y, z: pos.z + 1, orientation: 'flat' }); // flat behind

    if (allow3D) {
      neighbors.push({ x: pos.x, y: pos.y + 1, z: pos.z, orientation: 'vertical-z' });
      if (pos.y > 0) {
        neighbors.push({ x: pos.x, y: pos.y - 1, z: pos.z, orientation: 'vertical-z' });
      }
    }
  }

  // Filter out negative coordinates (keep it simple)
  return neighbors.filter(n => n.x >= 0 && n.y >= 0 && n.z >= 0);
}

// ============= Tile Fitting =============

const ROTATIONS: Rotation[] = [0, 90, 180, 270];

/**
 * Find all tile variants that could fit a specific slot in the shape.
 * The tile must have connectors where neighbors exist and null where they don't.
 */
export function findFittingTiles(
  slot: ShapePosition,
  shape: ShapePosition[],
  tilePool?: string[]
): Placement[] {
  const occupied = new Set(shape.map(posKey));
  const fittingPlacements: Placement[] = [];

  // Get which directions have neighbors vs edges
  const neighborInfo = getSlotNeighborInfo(slot, occupied);

  // Try each tile
  const tilesToTry = tilePool ?? GENERATED_TILES.map(t => t.id);

  for (const tileId of tilesToTry) {
    const tileConfig = GENERATED_TILES.find(t => t.id === tileId)?.config;
    if (!tileConfig) continue;

    // Try each rotation and flip
    for (const rotation of ROTATIONS) {
      for (const flipped of [false, true]) {
        // Check if this variant fits the slot
        if (variantFitsSlot(tileConfig, rotation, flipped, slot.orientation, neighborInfo)) {
          fittingPlacements.push({
            cell: { x: slot.x, y: slot.y, z: slot.z },
            orientation: slot.orientation,
            tileId,
            rotation,
            flipped
          });
        }
      }
    }
  }

  return fittingPlacements;
}

interface NeighborInfo {
  top: boolean;    // has neighbor in "top" direction
  right: boolean;
  bottom: boolean;
  left: boolean;
}

/**
 * Determine which edges of a slot have neighbors in the shape.
 *
 * For flat tiles: top=-Z, right=+X, bottom=+Z, left=-X
 * For vertical-x: left=flat at (x,y,z), right=flat at (x+1,y,z), top/bottom=vertical-x above/below
 * For vertical-z: top=flat at (x,y,z), bottom=flat at (x,y,z+1), left/right=vertical-z above/below
 */
function getSlotNeighborInfo(slot: ShapePosition, occupied: Set<string>): NeighborInfo {
  if (slot.orientation === 'flat') {
    return {
      top: occupied.has(posKey({ ...slot, z: slot.z - 1, orientation: 'flat' })) ||
           occupied.has(posKey({ ...slot, z: slot.z - 1, orientation: 'vertical-z' })),
      bottom: occupied.has(posKey({ ...slot, z: slot.z + 1, orientation: 'flat' })) ||
              occupied.has(posKey({ ...slot, orientation: 'vertical-z' })),
      left: occupied.has(posKey({ ...slot, x: slot.x - 1, orientation: 'flat' })) ||
            occupied.has(posKey({ ...slot, x: slot.x - 1, orientation: 'vertical-x' })),
      right: occupied.has(posKey({ ...slot, x: slot.x + 1, orientation: 'flat' })) ||
             occupied.has(posKey({ ...slot, orientation: 'vertical-x' })),
    };
  }

  if (slot.orientation === 'vertical-x') {
    // Vertical-X stands between (x,y,z) and (x+1,y,z)
    // left connects to flat at (x,y,z), right connects to flat at (x+1,y,z)
    // top/bottom connect to vertical-x above/below
    return {
      left: occupied.has(posKey({ x: slot.x, y: slot.y, z: slot.z, orientation: 'flat' })),
      right: occupied.has(posKey({ x: slot.x + 1, y: slot.y, z: slot.z, orientation: 'flat' })),
      top: occupied.has(posKey({ x: slot.x, y: slot.y + 1, z: slot.z, orientation: 'vertical-x' })),
      bottom: slot.y === 0 ? false : occupied.has(posKey({ x: slot.x, y: slot.y - 1, z: slot.z, orientation: 'vertical-x' })),
    };
  }

  if (slot.orientation === 'vertical-z') {
    // Vertical-Z stands between (x,y,z) and (x,y,z+1)
    // top connects to flat at (x,y,z), bottom connects to flat at (x,y,z+1)
    // left/right connect to vertical-z above/below
    return {
      top: occupied.has(posKey({ x: slot.x, y: slot.y, z: slot.z, orientation: 'flat' })),
      bottom: occupied.has(posKey({ x: slot.x, y: slot.y, z: slot.z + 1, orientation: 'flat' })),
      left: occupied.has(posKey({ x: slot.x, y: slot.y + 1, z: slot.z, orientation: 'vertical-z' })),
      right: slot.y === 0 ? false : occupied.has(posKey({ x: slot.x, y: slot.y - 1, z: slot.z, orientation: 'vertical-z' })),
    };
  }

  return { top: false, right: false, bottom: false, left: false };
}

/**
 * Check if a tile variant fits a slot's neighbor requirements.
 * Tile must have connector where neighbor exists, null where edge of shape.
 */
function variantFitsSlot(
  config: { top: string | null; right: string | null; bottom: string | null; left: string | null },
  rotation: Rotation,
  flipped: boolean,
  _orientation: Orientation,
  neighbors: NeighborInfo
): boolean {
  // Get rotated/flipped connector configuration
  const rotated = getRotatedConfig(config, rotation, flipped);

  // Check each edge: if neighbor exists, need connector; if no neighbor, need null
  if (neighbors.top && rotated.top === null) return false;
  if (!neighbors.top && rotated.top !== null) return false;
  if (neighbors.right && rotated.right === null) return false;
  if (!neighbors.right && rotated.right !== null) return false;
  if (neighbors.bottom && rotated.bottom === null) return false;
  if (!neighbors.bottom && rotated.bottom !== null) return false;
  if (neighbors.left && rotated.left === null) return false;
  if (!neighbors.left && rotated.left !== null) return false;

  return true;
}

/**
 * Get the connector configuration after rotation and flip.
 */
function getRotatedConfig(
  config: { top: string | null; right: string | null; bottom: string | null; left: string | null },
  rotation: Rotation,
  flipped: boolean
): { top: string | null; right: string | null; bottom: string | null; left: string | null } {
  let { top, right, bottom, left } = config;

  // Apply flip first (vertical mirror)
  if (flipped) {
    [top, bottom] = [bottom, top];
  }

  // Apply rotation (counterclockwise)
  const rotations = rotation / 90;
  for (let i = 0; i < rotations; i++) {
    [top, right, bottom, left] = [right, bottom, left, top];
  }

  return { top, right, bottom, left };
}

// ============= Shape-Based Puzzle Generation =============

export interface ShapePuzzle {
  shape: ShapePosition[];
  inventory: TileSpec[];
  solution: Placement[];
}

/**
 * Generate a puzzle by:
 * 1. Creating a random shape
 * 2. Finding tiles that fit each slot
 * 3. Building a valid solution
 * 4. Extracting the inventory
 */
export function generateShapePuzzle(config: {
  size: { min: number; max: number };
  allow3D?: boolean;
  tilePool?: string[];
  maxShapeAttempts?: number;
}): ShapePuzzle | null {
  const maxAttempts = config.maxShapeAttempts ?? 50;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Generate random shape
    const shape = generateShape({
      size: config.size,
      allow3D: config.allow3D
    });

    console.log(`[ShapeGen] Attempt ${attempt + 1}: shape with ${shape.length} slots`);

    // Try to fill the shape with tiles
    const solution = fillShape(shape, config.tilePool);

    if (solution) {
      // Verify it's a valid closed network
      const tiles = solution.map(placementToPlacedTile);
      const result = validateConnections(tiles);

      if (result.valid) {
        // Extract inventory from solution
        const inventory = extractInventory(solution);

        console.log(`[ShapeGen] SUCCESS! Shape: ${shape.length}, Inventory: ${inventory.length} tile types`);

        return { shape, inventory, solution };
      } else {
        console.log(`[ShapeGen] Solution invalid: ${result.openConnectors.length} open connectors`);
      }
    } else {
      console.log(`[ShapeGen] Could not fill shape`);
    }
  }

  return null;
}

/**
 * Try to fill a shape with tiles using backtracking.
 */
function fillShape(shape: ShapePosition[], tilePool?: string[]): Placement[] | null {
  const solution: Placement[] = [];

  function backtrack(slotIndex: number): boolean {
    if (slotIndex >= shape.length) {
      return true; // All slots filled
    }

    const slot = shape[slotIndex];
    const fittingTiles = findFittingTiles(slot, shape, tilePool);

    // Shuffle to add randomness
    shuffleArray(fittingTiles);

    for (const placement of fittingTiles) {
      solution.push(placement);

      // Check partial validity (connectors match so far)
      if (isPartiallyValid(solution)) {
        if (backtrack(slotIndex + 1)) {
          return true;
        }
      }

      solution.pop();
    }

    return false;
  }

  if (backtrack(0)) {
    return solution;
  }

  return null;
}

/**
 * Check if current partial solution has matching connectors.
 * All placed tiles must form one connected component.
 */
function isPartiallyValid(placements: Placement[]): boolean {
  if (placements.length <= 1) return true;

  const tiles = placements.map(placementToPlacedTile);
  const result = validateConnections(tiles);

  // Build connectivity graph and check all tiles are reachable from first
  const adjacency = new Map<PlacedTile, Set<PlacedTile>>();
  for (const tile of tiles) {
    adjacency.set(tile, new Set());
  }
  for (const [a, b] of result.connectedPairs) {
    adjacency.get(a.tile)!.add(b.tile);
    adjacency.get(b.tile)!.add(a.tile);
  }

  // BFS from first tile
  const visited = new Set<PlacedTile>();
  const queue = [tiles[0]];
  visited.add(tiles[0]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const neighbor of adjacency.get(current) || []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  // All tiles must be reachable (one connected component)
  return visited.size === tiles.length;
}

function placementToPlacedTile(p: Placement): PlacedTile {
  return {
    definition: { id: p.tileId, name: p.tileId },
    position: { x: p.cell.x, y: p.cell.y, z: p.cell.z },
    rotation: p.rotation,
    flipped: p.flipped,
    orientation: p.orientation
  };
}

function extractInventory(solution: Placement[]): TileSpec[] {
  const counts = new Map<string, number>();
  for (const p of solution) {
    counts.set(p.tileId, (counts.get(p.tileId) || 0) + 1);
  }

  const inventory: TileSpec[] = [];
  for (const [tileId, count] of counts) {
    inventory.push({ tileId, count });
  }
  return inventory;
}

// ============= Utilities =============

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function shuffleArray<T>(array: T[]): void {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}
