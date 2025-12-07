import type { Placement, Rotation, TileSpec } from '../types';
import type { PlacedTile } from '../../tiles/types';
import { validateConnections } from '../../game/ConnectionValidator';
import { GENERATED_TILES } from '../../tiles/TileBuilder';
import { generateShape, type ShapePosition } from './ShapeGenerator';

const ROTATIONS: Rotation[] = [0, 90, 180, 270];

export interface FilledPuzzle {
  shape: ShapePosition[];
  placements: Placement[];
  inventory: TileSpec[];
}

/**
 * Simple approach:
 * 1. Generate shape
 * 2. Place one tile at random position
 * 3. Fill adjacent positions one by one, each must connect
 * 4. Check if closed at the end
 */
export function fillShape(config: {
  size: { min: number; max: number };
  allow3D?: boolean;
  tilePool?: string[];
  maxAttempts?: number;
}): FilledPuzzle | null {
  const maxAttempts = config.maxAttempts ?? 100;
  const pool = config.tilePool ?? GENERATED_TILES.map(t => t.id);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // 1. Generate shape
    const shape = generateShape({
      size: config.size,
      allow3D: config.allow3D ?? false
    });

    console.log(`[SimpleFiller] Attempt ${attempt + 1}: shape with ${shape.length} positions`);

    // 2. Try to fill it
    const placements = tryFill(shape, pool);

    if (placements && placements.length === shape.length) {
      // 3. Check if closed
      const tiles = placements.map(toPlacedTile);
      const result = validateConnections(tiles);

      if (result.valid) {
        console.log(`[SimpleFiller] SUCCESS! Closed network with ${placements.length} tiles`);
        return {
          shape,
          placements,
          inventory: extractInventory(placements)
        };
      } else {
        console.log(`[SimpleFiller] Filled but ${result.openConnectors.length} open connectors`);
      }
    } else {
      console.log(`[SimpleFiller] Could not fill shape`);
    }
  }

  return null;
}

function tryFill(shape: ShapePosition[], pool: string[]): Placement[] | null {
  const placements: Placement[] = [];
  const filled = new Set<string>();

  // Pick random starting position
  const startIdx = Math.floor(Math.random() * shape.length);
  const startPos = shape[startIdx];

  // Place random tile at start
  const startTile = pool[Math.floor(Math.random() * pool.length)];
  const startRotation = ROTATIONS[Math.floor(Math.random() * 4)];
  const startFlipped = Math.random() < 0.5;

  placements.push({
    cell: { x: startPos.x, y: startPos.y, z: startPos.z },
    orientation: startPos.orientation,
    tileId: startTile,
    rotation: startRotation,
    flipped: startFlipped
  });
  filled.add(posKey(startPos));

  // Fill remaining positions
  let iterations = 0;
  const maxIterations = shape.length * 100;

  while (filled.size < shape.length && iterations < maxIterations) {
    iterations++;

    // Find unfilled positions adjacent to network
    const adjacent = shape.filter(pos =>
      !filled.has(posKey(pos)) && isAdjacentToFilled(pos, placements)
    );

    if (adjacent.length === 0) {
      // Check if there are unfilled but disconnected positions
      const unfilled = shape.filter(pos => !filled.has(posKey(pos)));
      if (unfilled.length > 0) {
        // Shape is disconnected, can't fill
        return null;
      }
      break;
    }

    // Pick random adjacent position
    const pos = adjacent[Math.floor(Math.random() * adjacent.length)];

    // Find a tile that connects to existing network
    const placement = findConnectingTile(pos, placements, pool);

    if (placement) {
      placements.push(placement);
      filled.add(posKey(pos));
    } else {
      // No tile works here - this shape might not be fillable
      // Try a different random path by reshuffling
      return null;
    }
  }

  return placements;
}

function findConnectingTile(
  pos: ShapePosition,
  existing: Placement[],
  pool: string[]
): Placement | null {
  // Try random tiles until one connects
  const shuffledPool = [...pool];
  shuffleArray(shuffledPool);

  for (const tileId of shuffledPool) {
    const shuffledRotations = [...ROTATIONS];
    shuffleArray(shuffledRotations);

    for (const rotation of shuffledRotations) {
      for (const flipped of [false, true]) {
        const placement: Placement = {
          cell: { x: pos.x, y: pos.y, z: pos.z },
          orientation: pos.orientation,
          tileId,
          rotation,
          flipped
        };

        // Check if this connects to existing network
        const allPlacements = [...existing, placement];
        const tiles = allPlacements.map(toPlacedTile);
        const result = validateConnections(tiles);

        // New tile must have at least one connection to existing tiles
        const newTile = tiles[tiles.length - 1];
        const hasConnection = result.connectedPairs.some(
          ([a, b]) => a.tile === newTile || b.tile === newTile
        );

        if (hasConnection) {
          return placement;
        }
      }
    }
  }

  return null;
}

function isAdjacentToFilled(pos: ShapePosition, placements: Placement[]): boolean {
  for (const p of placements) {
    if (areAdjacent(pos, p)) {
      return true;
    }
  }
  return false;
}

function areAdjacent(pos: ShapePosition, placement: Placement): boolean {
  const p = placement.cell;
  const o = placement.orientation;

  // Same cell, different orientation
  if (pos.x === p.x && pos.y === p.y && pos.z === p.z && pos.orientation !== o) {
    return true;
  }

  // Flat tiles adjacent horizontally
  if (pos.orientation === 'flat' && o === 'flat' && pos.y === p.y) {
    const dx = Math.abs(pos.x - p.x);
    const dz = Math.abs(pos.z - p.z);
    if ((dx === 1 && dz === 0) || (dx === 0 && dz === 1)) {
      return true;
    }
  }

  // Flat and vertical-x
  if (pos.orientation === 'flat' && o === 'vertical-x') {
    if (pos.y === p.y && pos.z === p.z && (pos.x === p.x || pos.x === p.x + 1)) {
      return true;
    }
  }
  if (pos.orientation === 'vertical-x' && o === 'flat') {
    if (pos.y === p.y && pos.z === p.z && (p.x === pos.x || p.x === pos.x + 1)) {
      return true;
    }
  }

  // Flat and vertical-z
  if (pos.orientation === 'flat' && o === 'vertical-z') {
    if (pos.y === p.y && pos.x === p.x && (pos.z === p.z || pos.z === p.z + 1)) {
      return true;
    }
  }
  if (pos.orientation === 'vertical-z' && o === 'flat') {
    if (pos.y === p.y && pos.x === p.x && (p.z === pos.z || p.z === pos.z + 1)) {
      return true;
    }
  }

  return false;
}

function posKey(p: ShapePosition): string {
  return `${p.x},${p.y},${p.z},${p.orientation}`;
}

function toPlacedTile(p: Placement): PlacedTile {
  const def = GENERATED_TILES.find(t => t.id === p.tileId);
  return {
    definition: def ? { id: def.id, name: def.name } : { id: p.tileId, name: p.tileId },
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
  return Array.from(counts.entries()).map(([tileId, count]) => ({ tileId, count }));
}

function shuffleArray<T>(array: T[]): void {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}
