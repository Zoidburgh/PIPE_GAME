import type { PlacedTile } from '../tiles/types';
import type { TileConfig, ConnectorPos } from '../tiles/TileBuilder';
import { GENERATED_TILES } from '../tiles/TileBuilder';

// A connector point in 3D space with its position type
interface ConnectorPoint {
  // World grid position (can be fractional for edge positions)
  wx: number;
  wy: number;
  wz: number;
  // Which tile this belongs to
  tile: PlacedTile;
  // Position on the tile edge (left/middle/right)
  pos: ConnectorPos;
  // Which edge of the tile
  edge: 'top' | 'right' | 'bottom' | 'left';
}

// Get the tile config for a placed tile
function getTileConfig(tile: PlacedTile): TileConfig | null {
  const genTile = GENERATED_TILES.find(t => t.id === tile.definition.id);
  return genTile?.config || null;
}

// Rotate an edge based on tile rotation (0, 90, 180, 270)
function rotateEdge(edge: 'top' | 'right' | 'bottom' | 'left', rotation: number): 'top' | 'right' | 'bottom' | 'left' {
  const edges: Array<'top' | 'right' | 'bottom' | 'left'> = ['top', 'right', 'bottom', 'left'];
  const idx = edges.indexOf(edge);
  const rotSteps = Math.round(rotation / 90) % 4;
  return edges[(idx + rotSteps) % 4];
}

// Flip connector position if tile is flipped
function flipConnectorPos(pos: ConnectorPos, flipped: boolean): ConnectorPos {
  if (!flipped || pos === 'middle' || pos === null) return pos;
  return pos === 'left' ? 'right' : 'left';
}

// Get world position for a connector on a placed tile
//
// APPROACH:
// 1. Get connector position in local 2D tile coords (from TileBuilder's pixel positions)
// 2. Apply flip (vertical mirror = negate Y)
// 3. Apply rotation (2D rotation in tile plane)
// 4. Transform to 3D grid coords based on orientation
//
function getConnectorWorldPos(
  tile: PlacedTile,
  edge: 'top' | 'right' | 'bottom' | 'left',
  pos: ConnectorPos
): { wx: number; wy: number; wz: number } | null {
  if (pos === null) return null;

  const { x, y, z } = tile.position;

  // Step 1: Get local 2D position on tile surface
  // Tile is centered at origin, goes from -0.5 to +0.5
  // TileBuilder uses cornerOffset = 0.18 from center for left/right positions
  //
  // From TileBuilder's pixel coords converted to local mesh coords:
  // - Top edge (y=+0.5): left at x=-0.18, right at x=+0.18
  // - Bottom edge (y=-0.5): left at x=+0.18, right at x=-0.18 (reversed!)
  // - Right edge (x=+0.5): left at y=+0.18, right at y=-0.18
  // - Left edge (x=-0.5): left at y=-0.18, right at y=+0.18

  const posOffset = pos === 'left' ? -0.18 : pos === 'middle' ? 0 : 0.18;

  let localX: number, localY: number;
  switch (edge) {
    case 'top':    localX = posOffset;  localY = 0.5; break;
    case 'bottom': localX = -posOffset; localY = -0.5; break;
    case 'right':  localX = 0.5;        localY = -posOffset; break;
    case 'left':   localX = -0.5;       localY = posOffset; break;
    default: return null;
  }

  // Step 2: Apply flip
  // Flip shows the vertically-mirrored texture, so connectors move to opposite Y
  if (tile.flipped) {
    localY = -localY;
  }

  // Step 3: Apply rotation (counterclockwise, matching Three.js convention)
  const rotRad = (tile.rotation * Math.PI) / 180;
  const cos = Math.cos(rotRad);
  const sin = Math.sin(rotRad);
  const rx = localX * cos - localY * sin;
  const ry = localX * sin + localY * cos;

  // Step 4: Transform to grid coordinates based on orientation
  // Each orientation maps local (X, Y) to different world axes

  if (tile.orientation === 'flat') {
    // Flat tile lies on XZ plane at height y
    // After mesh.rotation.set(-PI/2, 0, 0): local +Y -> world -Z
    // Tile center at grid (x+0.5, y, z+0.5)
    return {
      wx: x + 0.5 + rx,
      wy: y,
      wz: z + 0.5 - ry
    };
  } else if (tile.orientation === 'vertical-x') {
    // Vertical-X stands on +X edge of cell, faces -X direction
    // After mesh.rotation.set(0, -PI/2, 0): local +X -> world +Z, local +Y -> world +Y
    // Tile plane at x+1, center at grid (x+1, y+0.5, z+0.5)
    return {
      wx: x + 1,
      wy: y + 0.5 + ry,
      wz: z + 0.5 + rx
    };
  } else if (tile.orientation === 'vertical-z') {
    // Vertical-Z stands on +Z edge of cell, faces -Z direction
    // After mesh.rotation.set(0, PI, 0): local +X -> world -X, local +Y -> world +Y
    // Tile plane at z+1, center at grid (x+0.5, y+0.5, z+1)
    return {
      wx: x + 0.5 - rx,
      wy: y + 0.5 + ry,
      wz: z + 1
    };
  }

  return null;
}

// Get all connector points for a placed tile
export function getTileConnectors(tile: PlacedTile): ConnectorPoint[] {
  const config = getTileConfig(tile);
  if (!config) return [];

  const connectors: ConnectorPoint[] = [];
  const edges: Array<'top' | 'right' | 'bottom' | 'left'> = ['top', 'right', 'bottom', 'left'];

  for (const edge of edges) {
    const pos = config[edge];
    if (pos === null) continue;

    const worldPos = getConnectorWorldPos(tile, edge, pos);
    if (worldPos) {
      connectors.push({
        ...worldPos,
        tile,
        pos,
        edge
      });
    }
  }

  return connectors;
}

// Check if two connector points are at the same location (within tolerance)
function connectorsMatch(a: ConnectorPoint, b: ConnectorPoint): boolean {
  const tolerance = 0.01;
  return (
    Math.abs(a.wx - b.wx) < tolerance &&
    Math.abs(a.wy - b.wy) < tolerance &&
    Math.abs(a.wz - b.wz) < tolerance
  );
}

// Validate all connections on the board
export function validateConnections(tiles: PlacedTile[]): {
  valid: boolean;
  openConnectors: ConnectorPoint[];
  connectedPairs: [ConnectorPoint, ConnectorPoint][];
} {
  // Get all connectors from all tiles
  const allConnectors: ConnectorPoint[] = [];
  for (const tile of tiles) {
    allConnectors.push(...getTileConnectors(tile));
  }

  const connectedPairs: [ConnectorPoint, ConnectorPoint][] = [];
  const connectedSet = new Set<ConnectorPoint>();

  // Find all matching connector pairs
  for (let i = 0; i < allConnectors.length; i++) {
    for (let j = i + 1; j < allConnectors.length; j++) {
      if (allConnectors[i].tile !== allConnectors[j].tile &&
          connectorsMatch(allConnectors[i], allConnectors[j])) {
        connectedPairs.push([allConnectors[i], allConnectors[j]]);
        connectedSet.add(allConnectors[i]);
        connectedSet.add(allConnectors[j]);
      }
    }
  }

  // Find open (unconnected) connectors
  const openConnectors = allConnectors.filter(c => !connectedSet.has(c));

  // Check if all tiles are connected (graph connectivity)
  const allConnected = tiles.length <= 1 || checkGraphConnectivity(tiles, connectedPairs);

  return {
    valid: openConnectors.length === 0 && allConnected,
    openConnectors,
    connectedPairs
  };
}

// Check if all tiles form one connected graph
function checkGraphConnectivity(
  tiles: PlacedTile[],
  pairs: [ConnectorPoint, ConnectorPoint][]
): boolean {
  if (tiles.length === 0) return true;

  // Build adjacency map
  const adjacent = new Map<PlacedTile, Set<PlacedTile>>();
  for (const tile of tiles) {
    adjacent.set(tile, new Set());
  }

  for (const [a, b] of pairs) {
    adjacent.get(a.tile)?.add(b.tile);
    adjacent.get(b.tile)?.add(a.tile);
  }

  // BFS from first tile
  const visited = new Set<PlacedTile>();
  const queue: PlacedTile[] = [tiles[0]];
  visited.add(tiles[0]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const neighbors = adjacent.get(current) || new Set();

    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  return visited.size === tiles.length;
}

// Get validation result for current board state
export function checkWinCondition(
  flatTiles: Map<string, PlacedTile>,
  edgeTilesX: Map<string, PlacedTile>,
  edgeTilesZ: Map<string, PlacedTile>
): { won: boolean; openConnectors: ConnectorPoint[]; message: string } {
  const allTiles = [
    ...flatTiles.values(),
    ...edgeTilesX.values(),
    ...edgeTilesZ.values()
  ];

  if (allTiles.length === 0) {
    return { won: false, openConnectors: [], message: 'Place some tiles!' };
  }

  const result = validateConnections(allTiles);

  if (result.valid) {
    return { won: true, openConnectors: [], message: 'You win! All pipes connected!' };
  }

  if (result.openConnectors.length > 0) {
    return {
      won: false,
      openConnectors: result.openConnectors,
      message: `${result.openConnectors.length} open connector(s)`
    };
  }

  return { won: false, openConnectors: [], message: 'Tiles not all connected' };
}
