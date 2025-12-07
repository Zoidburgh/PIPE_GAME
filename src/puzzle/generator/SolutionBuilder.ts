import type { Placement, Rotation, TileSpec } from '../types';
import type { PlacedTile } from '../../tiles/types';
import { validateConnections } from '../../game/ConnectionValidator';
import { GENERATED_TILES } from '../../tiles/TileBuilder';
import { generateShape, type ShapePosition } from './ShapeGenerator';

// ============= Solution Builder =============
//
// Strategy:
// 1. Generate a shape (flat + vertical positions)
// 2. Start with one tile at one position
// 3. Add tiles one by one - each MUST connect to existing network
// 4. Use ConnectionValidator to verify actual connections
// 5. Backtrack if stuck

const ROTATIONS: Rotation[] = [0, 90, 180, 270];

export interface BuiltPuzzle {
  shape: ShapePosition[];
  placements: Placement[];
  inventory: TileSpec[];
}

/**
 * Build a puzzle by filling a shape with connected tiles.
 */
export function buildPuzzle(config: {
  size: { min: number; max: number };
  allow3D?: boolean;
  tilePool?: string[];
  maxAttempts?: number;
}): BuiltPuzzle | null {
  const maxAttempts = config.maxAttempts ?? 100;
  const pool = config.tilePool ?? GENERATED_TILES.map(t => t.id);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Generate a shape
    const shape = generateShape({
      size: config.size,
      allow3D: config.allow3D ?? false
    });

    console.log(`[SolutionBuilder] Attempt ${attempt + 1}: shape with ${shape.length} slots`);

    // Try to fill it with connected tiles
    const placements = fillShapeConnected(shape, pool);

    if (placements) {
      // Verify final network is closed
      const tiles = placements.map(placementToPlacedTile);
      const result = validateConnections(tiles);

      if (result.valid) {
        console.log(`[SolutionBuilder] SUCCESS! ${placements.length} tiles, closed network`);
        return {
          shape,
          placements,
          inventory: extractInventory(placements)
        };
      } else {
        console.log(`[SolutionBuilder] Network not closed: ${result.openConnectors.length} open`);
      }
    }
  }

  console.log(`[SolutionBuilder] FAILED after ${maxAttempts} attempts`);
  return null;
}

/**
 * Fill a shape with tiles using iterative backtracking.
 * Uses most-constrained-variable heuristic for efficiency.
 */
function fillShapeConnected(shape: ShapePosition[], pool: string[]): Placement[] | null {
  const MAX_NODES = 50000; // Limit exploration

  // Check if two slots are adjacent
  function areSlotsAdjacent(a: ShapePosition, b: { x: number; y: number; z: number; orientation: string }): boolean {
    // Same cell, different orientation - can connect
    if (a.x === b.x && a.y === b.y && a.z === b.z && a.orientation !== b.orientation) {
      return true;
    }

    // Flat tiles adjacent horizontally
    if (a.orientation === 'flat' && b.orientation === 'flat' && a.y === b.y) {
      const dx = Math.abs(a.x - b.x);
      const dz = Math.abs(a.z - b.z);
      return (dx === 1 && dz === 0) || (dx === 0 && dz === 1);
    }

    // Flat and vertical-x adjacent
    if (a.orientation === 'flat' && b.orientation === 'vertical-x') {
      return a.y === b.y && a.z === b.z && (a.x === b.x || a.x === b.x + 1);
    }
    if (a.orientation === 'vertical-x' && b.orientation === 'flat') {
      return a.y === b.y && a.z === b.z && (b.x === a.x || b.x === a.x + 1);
    }

    // Flat and vertical-z adjacent
    if (a.orientation === 'flat' && b.orientation === 'vertical-z') {
      return a.y === b.y && a.x === b.x && (a.z === b.z || a.z === b.z + 1);
    }
    if (a.orientation === 'vertical-z' && b.orientation === 'flat') {
      return a.y === b.y && a.x === b.x && (b.z === a.z || b.z === a.z + 1);
    }

    return false;
  }

  function isAdjacentToNetwork(slot: ShapePosition, placements: Placement[]): boolean {
    for (const p of placements) {
      if (areSlotsAdjacent(slot, { x: p.cell.x, y: p.cell.y, z: p.cell.z, orientation: p.orientation })) {
        return true;
      }
    }
    return false;
  }

  // Try multiple times with different random choices
  for (let attempt = 0; attempt < 10; attempt++) {
    const result = tryFillIterative(shape, pool, MAX_NODES, isAdjacentToNetwork);
    if (result) {
      return result;
    }
  }

  return null;
}

interface StackFrame {
  remaining: ShapePosition[];
  placements: Placement[];
  slotIdx: number;      // which adjacent slot we're trying
  candidateIdx: number; // which candidate for that slot
  adjacentSlots: ShapePosition[];
  candidatesPerSlot: Map<string, Placement[]>;
}

function tryFillIterative(
  shape: ShapePosition[],
  pool: string[],
  maxNodes: number,
  isAdjacentToNetwork: (slot: ShapePosition, placements: Placement[]) => boolean
): Placement[] | null {
  let nodesExplored = 0;
  let maxDepth = 0;

  // Initialize stack with first frame
  const stack: StackFrame[] = [];

  // Get candidates for first slot (any slot works for first tile)
  const shuffledShape = [...shape];
  shuffleArray(shuffledShape);

  const firstCandidates = new Map<string, Placement[]>();
  for (const slot of shuffledShape) {
    const candidates = getAllValidPlacements(slot, [], shape, pool);
    if (candidates.length > 0) {
      shuffleArray(candidates);
      firstCandidates.set(posKey(slot), candidates);
    }
  }

  // Pick slot with fewest candidates (MCV heuristic)
  let bestSlot: ShapePosition | null = null;
  let bestCount = Infinity;
  for (const slot of shuffledShape) {
    const count = firstCandidates.get(posKey(slot))?.length ?? 0;
    if (count > 0 && count < bestCount) {
      bestCount = count;
      bestSlot = slot;
    }
  }

  if (!bestSlot) {
    console.log(`[tryFill] No valid first placement found`);
    return null;
  }

  console.log(`[tryFill] Starting with slot at (${bestSlot.x},${bestSlot.y},${bestSlot.z}) ${bestSlot.orientation}, ${bestCount} candidates`);

  stack.push({
    remaining: shuffledShape,
    placements: [],
    slotIdx: 0,
    candidateIdx: 0,
    adjacentSlots: [bestSlot],
    candidatesPerSlot: firstCandidates
  });

  while (stack.length > 0) {
    nodesExplored++;
    if (nodesExplored > maxNodes) {
      console.log(`[tryFill] Hit node limit. maxDepth=${maxDepth}/${shape.length}`);
      return null; // Give up
    }

    // Track max depth reached
    if (stack.length > maxDepth) {
      maxDepth = stack.length;
      if (maxDepth % 3 === 0) {
        console.log(`[tryFill] Depth ${maxDepth}/${shape.length}, nodes=${nodesExplored}`);
      }
    }

    const frame = stack[stack.length - 1];

    // Check if done with this frame's options
    if (frame.slotIdx >= frame.adjacentSlots.length) {
      stack.pop();
      continue;
    }

    const slot = frame.adjacentSlots[frame.slotIdx];
    const candidates = frame.candidatesPerSlot.get(posKey(slot)) ?? [];

    if (frame.candidateIdx >= candidates.length) {
      // Move to next slot
      frame.slotIdx++;
      frame.candidateIdx = 0;
      continue;
    }

    const placement = candidates[frame.candidateIdx];
    frame.candidateIdx++;

    // Make new state with this placement
    const newPlacements = [...frame.placements, placement];
    const newRemaining = frame.remaining.filter(s => posKey(s) !== posKey(slot));

    // Check if done
    if (newRemaining.length === 0) {
      const tiles = newPlacements.map(placementToPlacedTile);
      const result = validateConnections(tiles);
      console.log(`[tryFill] Filled all ${shape.length} slots! valid=${result.valid}, open=${result.openConnectors.length}`);
      if (result.valid) {
        return newPlacements;
      }
      continue; // Try next candidate
    }

    // Find adjacent unfilled slots
    const adjacent = newRemaining.filter(s =>
      isAdjacentToNetwork(s, newPlacements)
    );

    if (adjacent.length === 0) {
      continue; // Dead end - shape disconnected
    }

    // Get candidates for each adjacent slot
    const newCandidatesPerSlot = new Map<string, Placement[]>();
    for (const adjSlot of adjacent) {
      const adjCandidates = getAllValidPlacements(adjSlot, newPlacements, shape, pool);
      if (adjCandidates.length > 0) {
        shuffleArray(adjCandidates);
        newCandidatesPerSlot.set(posKey(adjSlot), adjCandidates);
      }
    }

    // Sort by fewest candidates (MCV)
    const sortedAdjacent = adjacent
      .filter(s => newCandidatesPerSlot.has(posKey(s)))
      .sort((a, b) =>
        (newCandidatesPerSlot.get(posKey(a))?.length ?? 0) -
        (newCandidatesPerSlot.get(posKey(b))?.length ?? 0)
      );

    if (sortedAdjacent.length === 0) {
      continue; // No valid placements for any adjacent slot
    }

    // Push new frame
    stack.push({
      remaining: newRemaining,
      placements: newPlacements,
      slotIdx: 0,
      candidateIdx: 0,
      adjacentSlots: sortedAdjacent,
      candidatesPerSlot: newCandidatesPerSlot
    });
  }

  return null;
}

function shuffleArray<T>(array: T[]): void {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

/**
 * Get all valid tile placements for a slot.
 */
function getAllValidPlacements(
  slot: ShapePosition,
  existingPlacements: Placement[],
  shape: ShapePosition[],
  pool: string[]
): Placement[] {
  const candidates: Placement[] = [];

  for (const tileId of pool) {
    for (const rotation of ROTATIONS) {
      for (const flipped of [false, true]) {
        const placement: Placement = {
          cell: { x: slot.x, y: slot.y, z: slot.z },
          orientation: slot.orientation,
          tileId,
          rotation,
          flipped
        };

        if (isValidPlacement(placement, existingPlacements, shape)) {
          candidates.push(placement);
        }
      }
    }
  }

  return candidates;
}


/**
 * Check if a placement is valid:
 * 1. Connects to existing network (if any tiles exist)
 * 2. Connectors pointing outside the shape must be NULL
 */
function isValidPlacement(
  placement: Placement,
  existingPlacements: Placement[],
  shape: ShapePosition[]
): boolean {
  const allPlacements = [...existingPlacements, placement];
  const tiles = allPlacements.map(placementToPlacedTile);
  const result = validateConnections(tiles);

  // Check that this tile's open connectors are only pointing to unfilled shape positions
  // If they point outside the shape entirely, this tile is invalid
  const newTile = tiles[tiles.length - 1];
  const shapeSet = new Set(shape.map(posKey));

  // Get open connectors from the new tile
  const newTileOpenConnectors = result.openConnectors.filter(c => c.tile === newTile);

  for (const openConn of newTileOpenConnectors) {
    // Find all possible shape positions this connector could connect to
    const targetPositions = findTargetPositions(openConn, placement);

    if (targetPositions.length === 0) {
      // Can't determine any targets - skip check
      continue;
    }

    // Check if ANY of the possible targets is in the shape
    const hasValidTarget = targetPositions.some(pos => {
      const key = `${pos.x},${pos.y},${pos.z},${pos.orientation}`;
      return shapeSet.has(key);
    });

    // If no target is in shape, this connector points outside - tile is invalid
    if (!hasValidTarget) {
      return false;
    }
  }

  // For first tile, just check boundary constraints above
  if (existingPlacements.length === 0) {
    return true;
  }

  // New tile must connect to existing network
  const hasConnection = result.connectedPairs.some(
    ([a, b]) => a.tile === newTile || b.tile === newTile
  );

  return hasConnection;
}

/**
 * Find all positions an open connector could connect to.
 * Returns multiple options since a connector could match flat or vertical tiles.
 */
function findTargetPositions(
  connector: { wx: number; wy: number; wz: number },
  fromPlacement: Placement
): ShapePosition[] {
  const targets: ShapePosition[] = [];
  const { wx, wz } = connector;
  const { x, y, z } = fromPlacement.cell;

  if (fromPlacement.orientation === 'flat') {
    // Determine which edge this connector is on
    const dx = wx - (x + 0.5);
    const dz = wz - (z + 0.5);

    if (Math.abs(dx) > Math.abs(dz)) {
      // Left or right edge
      if (dx < 0) {
        // Left edge - could connect to:
        // - flat tile at (x-1, y, z)
        // - vertical-x tile at (x-1, y, z) (which sits at boundary between x-1 and x)
        targets.push({ x: x - 1, y, z, orientation: 'flat' });
        targets.push({ x: x - 1, y, z, orientation: 'vertical-x' });
      } else {
        // Right edge - could connect to:
        // - flat tile at (x+1, y, z)
        // - vertical-x tile at (x, y, z) (which sits at boundary between x and x+1)
        targets.push({ x: x + 1, y, z, orientation: 'flat' });
        targets.push({ x, y, z, orientation: 'vertical-x' });
      }
    } else {
      // Top or bottom edge
      if (dz < 0) {
        // Top edge (negative Z) - could connect to:
        // - flat tile at (x, y, z-1)
        // - vertical-z tile at (x, y, z-1)
        targets.push({ x, y, z: z - 1, orientation: 'flat' });
        targets.push({ x, y, z: z - 1, orientation: 'vertical-z' });
      } else {
        // Bottom edge (positive Z) - could connect to:
        // - flat tile at (x, y, z+1)
        // - vertical-z tile at (x, y, z)
        targets.push({ x, y, z: z + 1, orientation: 'flat' });
        targets.push({ x, y, z, orientation: 'vertical-z' });
      }
    }
  } else if (fromPlacement.orientation === 'vertical-x') {
    // Vertical-x tile sits at boundary between x and x+1
    // Left side connects to flat at x, right side to flat at x+1
    const dx = wx - (x + 0.5);
    if (dx < 0) {
      targets.push({ x, y, z, orientation: 'flat' });
    } else {
      targets.push({ x: x + 1, y, z, orientation: 'flat' });
    }
    // Top/bottom connectors on vertical-x (if any) - vertical tiles going up/down
    // For now, simplified
  } else if (fromPlacement.orientation === 'vertical-z') {
    // Vertical-z tile sits at boundary between z and z+1
    const dz = wz - (z + 0.5);
    if (dz < 0) {
      targets.push({ x, y, z, orientation: 'flat' });
    } else {
      targets.push({ x, y, z: z + 1, orientation: 'flat' });
    }
  }

  return targets;
}


function posKey(p: ShapePosition): string {
  return `${p.x},${p.y},${p.z},${p.orientation}`;
}

function placementToPlacedTile(p: Placement): PlacedTile {
  const tileDef = GENERATED_TILES.find(t => t.id === p.tileId);
  return {
    definition: tileDef ? { id: tileDef.id, name: tileDef.name } : { id: p.tileId, name: p.tileId },
    position: { x: p.cell.x, y: p.cell.y, z: p.cell.z },
    rotation: p.rotation,
    flipped: p.flipped,
    orientation: p.orientation
  };
}

function extractInventory(placements: Placement[]): TileSpec[] {
  const counts = new Map<string, number>();
  for (const p of placements) {
    counts.set(p.tileId, (counts.get(p.tileId) || 0) + 1);
  }

  const inventory: TileSpec[] = [];
  for (const [tileId, count] of counts) {
    inventory.push({ tileId, count });
  }
  return inventory;
}
