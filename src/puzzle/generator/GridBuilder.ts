import type { Placement, Rotation, TileSpec } from '../types';
import type { PlacedTile } from '../../tiles/types';
import { validateConnections } from '../../game/ConnectionValidator';
import { GENERATED_TILES } from '../../tiles/TileBuilder';

/**
 * SIMPLE GRID BUILDER
 *
 * Just build a 2D grid of flat tiles. Get this working first.
 */

const ROTATIONS: Rotation[] = [0, 90, 180, 270];

export interface GridPuzzle {
  placements: Placement[];
  inventory: TileSpec[];
}

export function buildGridPuzzle(config: {
  width: number;
  height: number;
  tilePool?: string[];
  maxAttempts?: number;
}): GridPuzzle | null {
  const { width, height } = config;
  const maxAttempts = config.maxAttempts ?? 200;
  const pool = config.tilePool ?? GENERATED_TILES.map(t => t.id);

  console.log(`[GridBuilder] Building ${width}x${height} grid (${width * height} tiles)`);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const placements = tryBuildGrid(width, height, pool);

    if (placements) {
      const tiles = placements.map(toPlacedTile);
      const result = validateConnections(tiles);

      if (result.valid) {
        console.log(`[GridBuilder] SUCCESS on attempt ${attempt + 1}!`);
        return {
          placements,
          inventory: extractInventory(placements)
        };
      } else {
        if (attempt % 20 === 0) {
          console.log(`[GridBuilder] Attempt ${attempt + 1}: filled but ${result.openConnectors.length} open`);
        }
      }
    }
  }

  console.log(`[GridBuilder] Failed after ${maxAttempts} attempts`);
  return null;
}

function tryBuildGrid(width: number, height: number, pool: string[]): Placement[] | null {
  const placements: Placement[] = [];
  const grid: (Placement | null)[][] = [];

  // Initialize empty grid
  for (let z = 0; z < height; z++) {
    grid[z] = [];
    for (let x = 0; x < width; x++) {
      grid[z][x] = null;
    }
  }

  // Fill grid position by position
  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      const placement = findTileForCell(x, z, width, height, grid, pool);
      if (!placement) {
        return null; // Can't fill this cell
      }
      grid[z][x] = placement;
      placements.push(placement);
    }
  }

  return placements;
}

function findTileForCell(
  x: number,
  z: number,
  width: number,
  height: number,
  grid: (Placement | null)[][],
  pool: string[]
): Placement | null {
  // Determine which edges are on the boundary (need NULL connectors)
  const needNullTop = z === 0;
  const needNullBottom = z === height - 1;
  const needNullLeft = x === 0;
  const needNullRight = x === width - 1;

  // Get neighbors we need to connect to
  const neighbors: { dir: 'top' | 'bottom' | 'left' | 'right'; tile: PlacedTile }[] = [];

  if (z > 0 && grid[z - 1][x]) {
    neighbors.push({ dir: 'top', tile: toPlacedTile(grid[z - 1][x]!) });
  }
  if (x > 0 && grid[z][x - 1]) {
    neighbors.push({ dir: 'left', tile: toPlacedTile(grid[z][x - 1]!) });
  }

  // Try tiles
  const shuffledPool = [...pool];
  shuffleArray(shuffledPool);

  for (const tileId of shuffledPool) {
    const shuffledRotations = [...ROTATIONS];
    shuffleArray(shuffledRotations);

    for (const rotation of shuffledRotations) {
      for (const flipped of [false, true]) {
        const placement: Placement = {
          cell: { x, y: 0, z },
          orientation: 'flat',
          tileId,
          rotation,
          flipped
        };

        if (isValidForCell(placement, needNullTop, needNullBottom, needNullLeft, needNullRight, neighbors)) {
          return placement;
        }
      }
    }
  }

  return null;
}

function isValidForCell(
  placement: Placement,
  needNullTop: boolean,
  needNullBottom: boolean,
  needNullLeft: boolean,
  needNullRight: boolean,
  neighbors: { dir: 'top' | 'bottom' | 'left' | 'right'; tile: PlacedTile }[]
): boolean {
  const tile = toPlacedTile(placement);
  const connectors = getTileEdges(tile);

  // Check boundary constraints
  if (needNullTop && connectors.top !== null) return false;
  if (needNullBottom && connectors.bottom !== null) return false;
  if (needNullLeft && connectors.left !== null) return false;
  if (needNullRight && connectors.right !== null) return false;

  // Check neighbor connections
  for (const { dir, tile: neighborTile } of neighbors) {
    const neighborConnectors = getTileEdges(neighborTile);

    // Our edge must match neighbor's opposite edge
    if (dir === 'top') {
      // Our top connects to neighbor's bottom
      if (!connectorsMatch(connectors.top, neighborConnectors.bottom)) return false;
    } else if (dir === 'left') {
      // Our left connects to neighbor's right
      if (!connectorsMatch(connectors.left, neighborConnectors.right)) return false;
    }
  }

  return true;
}

interface EdgeConnectors {
  top: ConnectorType | null;
  right: ConnectorType | null;
  bottom: ConnectorType | null;
  left: ConnectorType | null;
}

type ConnectorType = 'left' | 'middle' | 'right';

function getTileEdges(tile: PlacedTile): EdgeConnectors {
  const def = GENERATED_TILES.find(t => t.id === tile.definition.id);
  if (!def) {
    return { top: null, right: null, bottom: null, left: null };
  }

  // Get base connectors from tile config
  const config = def.config;
  let edges: EdgeConnectors = {
    top: config.top || null,
    right: config.right || null,
    bottom: config.bottom || null,
    left: config.left || null
  };

  // Apply flip (vertical flip - mirrors top/bottom, like ConnectionValidator)
  if (tile.flipped) {
    // Swap top and bottom edges
    const oldTop = edges.top;
    const oldBottom = edges.bottom;

    // Helper to flip connector positions
    const flipPos = (p: ConnectorType | null): ConnectorType | null =>
      p === 'left' ? 'right' : p === 'right' ? 'left' : p;

    // Top becomes flipped bottom, bottom becomes flipped top
    edges.top = flipPos(oldBottom);
    edges.bottom = flipPos(oldTop);

    // Left/right edges stay but positions flip
    edges.left = flipPos(edges.left);
    edges.right = flipPos(edges.right);
  }

  // Apply rotation (counterclockwise, matching ConnectionValidator)
  const rotations = ((tile.rotation / 90) % 4 + 4) % 4;
  for (let i = 0; i < rotations; i++) {
    edges = {
      top: edges.right,    // CCW: what was on right is now on top
      right: edges.bottom,
      bottom: edges.left,
      left: edges.top
    };
  }

  return edges;
}

function connectorsMatch(a: ConnectorType | null, b: ConnectorType | null): boolean {
  // Both must be non-null to connect
  if (a === null || b === null) return false;

  // middle-middle: always connects
  if (a === 'middle' && b === 'middle') return true;

  // left-right or right-left: connects (offset connectors meet when tiles face each other)
  if ((a === 'left' && b === 'right') || (a === 'right' && b === 'left')) return true;

  // Same offset direction doesn't connect (both left or both right)
  return false;
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

function shuffleArray<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}
