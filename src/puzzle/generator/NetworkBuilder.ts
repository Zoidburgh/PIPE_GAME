import type { Placement, Orientation, Rotation, TileSpec } from '../types';
import type { PlacedTile } from '../../tiles/types';
import { validateConnections, getTileConnectors } from '../../game/ConnectionValidator';
import { GENERATED_TILES } from '../../tiles/TileBuilder';

// ============= Types =============

interface OpenConnector {
  wx: number;  // world position
  wy: number;
  wz: number;
  fromTileIndex: number;  // which placed tile this comes from
}

interface NetworkState {
  placements: Placement[];
  openConnectors: OpenConnector[];
}

// ============= Network Builder =============

const ROTATIONS: Rotation[] = [0, 90, 180, 270];

/**
 * Build a closed network by growing from a starting tile.
 * Uses backtracking to find configurations that close properly.
 */
export function buildNetwork(config: {
  targetSize: { min: number; max: number };
  tilePool?: string[];
  maxAttempts?: number;
  allow3D?: boolean;
}): { placements: Placement[]; inventory: TileSpec[] } | null {
  const maxAttempts = config.maxAttempts ?? 100;
  const targetMin = config.targetSize.min;
  const targetMax = config.targetSize.max;
  const pool = config.tilePool ?? GENERATED_TILES.map(t => t.id);
  const allow3D = config.allow3D ?? false;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const result = tryBuildNetwork(targetMin, targetMax, pool, allow3D);
    if (result) {
      console.log(`[NetworkBuilder] SUCCESS after ${attempt + 1} attempts! ${result.length} tiles`);
      return {
        placements: result,
        inventory: extractInventory(result)
      };
    }
  }

  console.log(`[NetworkBuilder] FAILED after ${maxAttempts} attempts`);
  return null;
}

function tryBuildNetwork(
  targetMin: number,
  targetMax: number,
  pool: string[],
  allow3D: boolean
): Placement[] | null {
  // Start with a random tile at origin
  const startTile = pool[Math.floor(Math.random() * pool.length)];
  const startPlacement: Placement = {
    cell: { x: 0, y: 0, z: 0 },
    orientation: 'flat',
    tileId: startTile,
    rotation: ROTATIONS[Math.floor(Math.random() * 4)],
    flipped: Math.random() < 0.5
  };

  const state: NetworkState = {
    placements: [startPlacement],
    openConnectors: getOpenConnectors([startPlacement])
  };

  // Grow the network
  const targetSize = randomInt(targetMin, targetMax);

  if (growNetwork(state, targetSize, pool, allow3D)) {
    return state.placements;
  }

  return null;
}

/**
 * Grow the network using backtracking.
 * Returns true if we successfully reach target size with no open connectors.
 */
function growNetwork(
  state: NetworkState,
  targetSize: number,
  pool: string[],
  allow3D: boolean
): boolean {
  // Base case: reached target size
  if (state.placements.length >= targetSize) {
    // Check if network is closed
    const tiles = state.placements.map(placementToPlacedTile);
    const result = validateConnections(tiles);
    return result.valid;
  }

  // If no open connectors and not at target, we're stuck
  if (state.openConnectors.length === 0) {
    return false;
  }

  // Pick an open connector to extend from
  const connectorIdx = Math.floor(Math.random() * state.openConnectors.length);
  const connector = state.openConnectors[connectorIdx];

  // Find positions adjacent to this connector where we could place a tile
  const candidates = findCandidatePlacements(connector, state, pool, allow3D);
  shuffleArray(candidates);

  for (const candidate of candidates) {
    // Check if position is already occupied
    if (isPositionOccupied(candidate, state.placements)) {
      continue;
    }

    // Place the tile
    state.placements.push(candidate);
    state.openConnectors = getOpenConnectors(state.placements);

    // Recurse
    if (growNetwork(state, targetSize, pool, allow3D)) {
      return true;
    }

    // Backtrack
    state.placements.pop();
    state.openConnectors = getOpenConnectors(state.placements);
  }

  return false;
}

/**
 * Find all tile placements that could connect to the given open connector.
 */
function findCandidatePlacements(
  connector: OpenConnector,
  state: NetworkState,
  pool: string[],
  _allow3D: boolean
): Placement[] {
  const candidates: Placement[] = [];

  // The connector is at (wx, wy, wz)
  // We need to find adjacent cell positions where a tile could have a matching connector

  // For flat tiles, connectors are at cell edges
  // A connector at world position (wx, wy, wz) could be matched by tiles in adjacent cells

  // Possible cell positions that could have a connector at this world position
  const possibleCells = getPossibleCellsForConnector(connector.wx, connector.wy, connector.wz);

  for (const cell of possibleCells) {
    // Skip if this cell is already occupied
    if (state.placements.some(p =>
      p.cell.x === cell.x && p.cell.y === cell.y && p.cell.z === cell.z && p.orientation === cell.orientation
    )) {
      continue;
    }

    // Try each tile in the pool
    for (const tileId of pool) {
      for (const rotation of ROTATIONS) {
        for (const flipped of [false, true]) {
          const placement: Placement = {
            cell: { x: cell.x, y: cell.y, z: cell.z },
            orientation: cell.orientation,
            tileId,
            rotation,
            flipped
          };

          // Check if this placement has a connector at the target position
          if (hasConnectorAt(placement, connector.wx, connector.wy, connector.wz)) {
            candidates.push(placement);
          }
        }
      }
    }
  }

  return candidates;
}

/**
 * Get cell positions that could have a connector at the given world position.
 */
function getPossibleCellsForConnector(
  wx: number, wy: number, wz: number
): Array<{ x: number; y: number; z: number; orientation: Orientation }> {
  const cells: Array<{ x: number; y: number; z: number; orientation: Orientation }> = [];

  // For flat tiles at y level, connectors are at cell edges
  // A connector at (wx, wy, wz) with wy close to an integer y means it's on a flat tile at y
  const y = Math.round(wy);

  // The connector could be on the edge of cells:
  // - If wx is close to an integer, it's on an X edge
  // - If wz is close to an integer, it's on a Z edge

  // Check cells around this position
  const cellX = Math.floor(wx);
  const cellZ = Math.floor(wz);

  // The cell containing this point
  cells.push({ x: cellX, y, z: cellZ, orientation: 'flat' });

  // Adjacent cells that might have connectors reaching this point
  cells.push({ x: cellX - 1, y, z: cellZ, orientation: 'flat' });
  cells.push({ x: cellX + 1, y, z: cellZ, orientation: 'flat' });
  cells.push({ x: cellX, y, z: cellZ - 1, orientation: 'flat' });
  cells.push({ x: cellX, y, z: cellZ + 1, orientation: 'flat' });

  return cells;
}

/**
 * Check if a placement has a connector at the given world position.
 */
function hasConnectorAt(placement: Placement, wx: number, wy: number, wz: number): boolean {
  const tile = placementToPlacedTile(placement);
  const connectors = getTileConnectors(tile);

  const tolerance = 0.01;
  for (const c of connectors) {
    if (
      Math.abs(c.wx - wx) < tolerance &&
      Math.abs(c.wy - wy) < tolerance &&
      Math.abs(c.wz - wz) < tolerance
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Get all open connectors from the current placements.
 */
function getOpenConnectors(placements: Placement[]): OpenConnector[] {
  const tiles = placements.map(placementToPlacedTile);
  const result = validateConnections(tiles);

  return result.openConnectors.map(c => ({
    wx: c.wx,
    wy: c.wy,
    wz: c.wz,
    fromTileIndex: placements.findIndex(p =>
      p.cell.x === c.tile.position.x &&
      p.cell.y === c.tile.position.y &&
      p.cell.z === c.tile.position.z
    )
  }));
}

function isPositionOccupied(placement: Placement, placements: Placement[]): boolean {
  return placements.some(p =>
    p.cell.x === placement.cell.x &&
    p.cell.y === placement.cell.y &&
    p.cell.z === placement.cell.z &&
    p.orientation === placement.orientation
  );
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
