import type { Placement, Rotation, TileSpec, Orientation } from '../types';
import type { PlacedTile } from '../../tiles/types';
import { validateConnections } from '../../game/ConnectionValidator';
import { GENERATED_TILES } from '../../tiles/TileBuilder';

/**
 * CUBE-BASED 3D PUZZLE GENERATOR
 *
 * Think of the world as cubes. Each cube has 6 faces.
 * Each face can have a tile. Adjacent cubes share a face.
 *
 * Face -> Tile position mapping:
 * - Top face (y+)    -> flat tile at (x, y, z)
 * - Bottom face (y-) -> flat tile at (x, y-1, z) [shared with cube below's top]
 * - Right face (x+)  -> vertical-x at (x, y, z)
 * - Left face (x-)   -> vertical-x at (x-1, y, z) [shared with cube left's right]
 * - Back face (z+)   -> vertical-z at (x, y, z)
 * - Front face (z-)  -> vertical-z at (x, y, z-1) [shared with cube front's back]
 */

const ROTATIONS: Rotation[] = [0, 90, 180, 270];

interface Cube {
  x: number;
  y: number;
  z: number;
}

interface TilePosition {
  x: number;
  y: number;
  z: number;
  orientation: Orientation;
  isExterior: boolean;  // true if on boundary of shape
  exteriorEdge?: 'top' | 'bottom' | 'left' | 'right';  // which edge faces outside
}

export interface CubePuzzle {
  cubes: Cube[];
  placements: Placement[];
  inventory: TileSpec[];
}

/**
 * Generate a puzzle from connected cubes.
 */
export function buildCubePuzzle(config: {
  cubeCount: { min: number; max: number };
  tilePool?: string[];
  maxAttempts?: number;
}): CubePuzzle | null {
  const maxAttempts = config.maxAttempts ?? 100;
  const pool = config.tilePool ?? GENERATED_TILES.map(t => t.id);
  const targetCount = randomInt(config.cubeCount.min, config.cubeCount.max);

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // 1. Generate connected cubes
    const cubes = generateCubes(targetCount);
    console.log(`[CubeBuilder] Attempt ${attempt + 1}: ${cubes.length} cubes`);

    // 2. Get all tile positions from cube faces
    const positions = getCubePositions(cubes);
    console.log(`[CubeBuilder] ${positions.length} tile positions (${positions.filter(p => p.isExterior).length} exterior)`);

    // 3. Fill positions with tiles
    const placements = fillPositions(positions, pool);

    if (placements && placements.length === positions.length) {
      // 4. Verify network is closed
      const tiles = placements.map(toPlacedTile);
      const result = validateConnections(tiles);

      if (result.valid) {
        console.log(`[CubeBuilder] SUCCESS! ${placements.length} tiles, closed network`);
        return {
          cubes,
          placements,
          inventory: extractInventory(placements)
        };
      } else {
        console.log(`[CubeBuilder] Filled but ${result.openConnectors.length} open`);
      }
    }
  }

  return null;
}

/**
 * Generate connected cubes using random growth.
 * Gravity rule: cubes at y > 0 must have a cube directly below.
 */
function generateCubes(count: number): Cube[] {
  const cubes: Cube[] = [{ x: 0, y: 0, z: 0 }];
  const cubeSet = new Set(['0,0,0']);

  // Directions with gravity consideration
  const horizontalDirs: [number, number, number][] = [
    [1, 0, 0], [-1, 0, 0],
    [0, 0, 1], [0, 0, -1]
  ];

  let attempts = 0;
  const maxAttempts = count * 100;

  while (cubes.length < count && attempts < maxAttempts) {
    attempts++;

    // Pick random existing cube
    const base = cubes[Math.floor(Math.random() * cubes.length)];

    // 70% horizontal, 30% vertical (to get more interesting shapes)
    const goVertical = Math.random() < 0.3;

    let newCube: Cube;
    if (goVertical) {
      // Try going up (needs support) or down
      const goUp = Math.random() < 0.5;
      if (goUp) {
        newCube = { x: base.x, y: base.y + 1, z: base.z };
      } else {
        // Going down - check there's nothing below already
        newCube = { x: base.x, y: base.y - 1, z: base.z };
      }
    } else {
      // Horizontal movement
      const dir = horizontalDirs[Math.floor(Math.random() * 4)];
      newCube = { x: base.x + dir[0], y: base.y, z: base.z + dir[2] };
    }

    const key = `${newCube.x},${newCube.y},${newCube.z}`;

    // Check if position is free
    if (cubeSet.has(key)) continue;

    // Gravity rule: if y > 0, must have support (cube below)
    if (newCube.y > 0) {
      const belowKey = `${newCube.x},${newCube.y - 1},${newCube.z}`;
      if (!cubeSet.has(belowKey)) continue; // No support
    }

    cubes.push(newCube);
    cubeSet.add(key);
  }

  return cubes;
}

/**
 * Get all tile positions from cube faces.
 * Shared faces between cubes are interior (need to connect both sides).
 * Boundary faces are exterior (need NULL on outside edge).
 */
function getCubePositions(cubes: Cube[]): TilePosition[] {
  const cubeSet = new Set(cubes.map(c => `${c.x},${c.y},${c.z}`));
  const positionMap = new Map<string, TilePosition>();

  for (const cube of cubes) {
    // Top face -> flat at (x, y, z)
    const topKey = `${cube.x},${cube.y},${cube.z},flat`;
    if (!positionMap.has(topKey)) {
      const hasAbove = cubeSet.has(`${cube.x},${cube.y + 1},${cube.z}`);
      positionMap.set(topKey, {
        x: cube.x, y: cube.y, z: cube.z,
        orientation: 'flat',
        isExterior: !hasAbove,
        exteriorEdge: hasAbove ? undefined : 'top'  // top of flat = up
      });
    }

    // Bottom face -> flat at (x, y-1, z) - this is shared with cube below's top
    // Only add if there's no cube below (otherwise it's the cube below's top)
    const hasBelow = cubeSet.has(`${cube.x},${cube.y - 1},${cube.z}`);
    if (!hasBelow) {
      const bottomKey = `${cube.x},${cube.y - 1},${cube.z},flat`;
      if (!positionMap.has(bottomKey)) {
        positionMap.set(bottomKey, {
          x: cube.x, y: cube.y - 1, z: cube.z,
          orientation: 'flat',
          isExterior: true,
          exteriorEdge: 'bottom'
        });
      }
    }

    // Right face -> vertical-x at (x, y-1, z)
    // vertical-x at y-1 spans from y-1 to y, connecting bottom flat (y-1) and top flat (y)
    const rightKey = `${cube.x},${cube.y - 1},${cube.z},vertical-x`;
    if (!positionMap.has(rightKey)) {
      const hasRight = cubeSet.has(`${cube.x + 1},${cube.y},${cube.z}`);
      positionMap.set(rightKey, {
        x: cube.x, y: cube.y - 1, z: cube.z,
        orientation: 'vertical-x',
        isExterior: !hasRight,
        exteriorEdge: hasRight ? undefined : 'right'
      });
    }

    // Left face -> vertical-x at (x-1, y-1, z)
    const hasLeft = cubeSet.has(`${cube.x - 1},${cube.y},${cube.z}`);
    if (!hasLeft) {
      const leftKey = `${cube.x - 1},${cube.y - 1},${cube.z},vertical-x`;
      if (!positionMap.has(leftKey)) {
        positionMap.set(leftKey, {
          x: cube.x - 1, y: cube.y - 1, z: cube.z,
          orientation: 'vertical-x',
          isExterior: true,
          exteriorEdge: 'left'
        });
      }
    }

    // Back face -> vertical-z at (x, y-1, z)
    const backKey = `${cube.x},${cube.y - 1},${cube.z},vertical-z`;
    if (!positionMap.has(backKey)) {
      const hasBack = cubeSet.has(`${cube.x},${cube.y},${cube.z + 1}`);
      positionMap.set(backKey, {
        x: cube.x, y: cube.y - 1, z: cube.z,
        orientation: 'vertical-z',
        isExterior: !hasBack,
        exteriorEdge: hasBack ? undefined : 'bottom'  // bottom of vertical-z = +z direction
      });
    }

    // Front face -> vertical-z at (x, y-1, z-1)
    const hasFront = cubeSet.has(`${cube.x},${cube.y},${cube.z - 1}`);
    if (!hasFront) {
      const frontKey = `${cube.x},${cube.y - 1},${cube.z - 1},vertical-z`;
      if (!positionMap.has(frontKey)) {
        positionMap.set(frontKey, {
          x: cube.x, y: cube.y - 1, z: cube.z - 1,
          orientation: 'vertical-z',
          isExterior: true,
          exteriorEdge: 'top'  // top of vertical-z = -z direction
        });
      }
    }
  }

  return Array.from(positionMap.values());
}

/**
 * Fill positions with tiles, ensuring connectivity.
 */
function fillPositions(positions: TilePosition[], pool: string[]): Placement[] | null {
  const placements: Placement[] = [];
  const filled = new Set<string>();
  const remaining = [...positions];

  // Start with a random position
  shuffleArray(remaining);
  const startPos = remaining.shift()!;

  // Place first tile
  const firstPlacement = findTileForPosition(startPos, [], pool, positions);
  if (!firstPlacement) {
    console.log(`[CubeBuilder] No valid first tile`);
    return null;
  }

  placements.push(firstPlacement);
  filled.add(posKey(startPos));

  // Fill remaining positions
  let maxIter = positions.length * 50;
  while (remaining.length > 0 && maxIter-- > 0) {
    // Find positions adjacent to filled ones
    const adjacent = remaining.filter(pos =>
      isAdjacentToAny(pos, placements)
    );

    if (adjacent.length === 0) {
      // Check if remaining positions are disconnected
      if (remaining.length > 0) {
        console.log(`[CubeBuilder] Disconnected positions remaining: ${remaining.length}`);
        return null;
      }
      break;
    }

    // Pick one and try to fill it
    const pos = adjacent[Math.floor(Math.random() * adjacent.length)];
    const placement = findTileForPosition(pos, placements, pool, positions);

    if (placement) {
      placements.push(placement);
      filled.add(posKey(pos));
      const idx = remaining.findIndex(p => posKey(p) === posKey(pos));
      remaining.splice(idx, 1);
    } else {
      // Can't place here - might need backtracking
      // For now, just fail and retry
      console.log(`[CubeBuilder] Can't fill position at (${pos.x},${pos.y},${pos.z}) ${pos.orientation}`);
      return null;
    }
  }

  return placements.length === positions.length ? placements : null;
}

/**
 * Find a tile that works for a position.
 * Must match connector TYPES with adjacent tiles, not just have connectors.
 */
function findTileForPosition(
  pos: TilePosition,
  existing: Placement[],
  pool: string[],
  allPositions: TilePosition[]
): Placement | null {
  // Get required connector types for each edge (what the adjacent tile expects)
  const edgeRequirements = getEdgeRequirements(pos, existing);

  // Figure out which edges face outside the shape (need NULL)
  const nullEdges = getExteriorEdges(pos, allPositions);

  const shuffled = [...pool];
  shuffleArray(shuffled);

  for (const tileId of shuffled) {
    for (const rotation of shuffledRotations()) {
      for (const flipped of [false, true]) {
        const placement: Placement = {
          cell: { x: pos.x, y: pos.y, z: pos.z },
          orientation: pos.orientation,
          tileId,
          rotation,
          flipped
        };

        const edges = getTileEdges(toPlacedTile(placement));

        let valid = true;

        // Check edge requirements - must have MATCHING connector type
        for (const [edge, requiredType] of edgeRequirements) {
          const ourType = edges[edge];
          if (!connectorsMatch(ourType, requiredType)) {
            valid = false;
            break;
          }
        }
        if (!valid) continue;

        // Check exterior edges have NULL
        for (const edge of nullEdges) {
          if (edges[edge] !== null) {
            valid = false;
            break;
          }
        }
        if (!valid) continue;

        // Passed all checks
        return placement;
      }
    }
  }

  return null;
}

type ConnectorType = 'left' | 'middle' | 'right' | null;

/**
 * Check if two connectors match (can connect).
 */
function connectorsMatch(a: ConnectorType, b: ConnectorType): boolean {
  if (a === null || b === null) return false;
  if (a === 'middle' && b === 'middle') return true;
  if ((a === 'left' && b === 'right') || (a === 'right' && b === 'left')) return true;
  return false;
}

/**
 * Get what connector type is needed on each edge to match existing adjacent tiles.
 */
function getEdgeRequirements(
  pos: TilePosition,
  existing: Placement[]
): Map<'top' | 'right' | 'bottom' | 'left', ConnectorType> {
  const requirements = new Map<'top' | 'right' | 'bottom' | 'left', ConnectorType>();

  for (const p of existing) {
    const connection = getConnectingEdgeWithType(pos, p);
    if (connection) {
      requirements.set(connection.ourEdge, connection.theirType);
    }
  }

  return requirements;
}

/**
 * Given a new position and an existing placement, determine which edge of the
 * new position connects to the existing tile, and what connector type that tile has there.
 */
function getConnectingEdgeWithType(
  newPos: TilePosition,
  existing: Placement
): { ourEdge: 'top' | 'right' | 'bottom' | 'left'; theirType: ConnectorType } | null {
  const ourEdge = getConnectingEdge(newPos, existing);
  if (!ourEdge) return null;

  // Get the existing tile's edges
  const theirEdges = getTileEdges(toPlacedTile(existing));

  // Determine which edge of the existing tile faces us
  const theirEdge = getOppositeEdge(ourEdge, newPos, existing);
  if (!theirEdge) return null;

  return { ourEdge, theirType: theirEdges[theirEdge] };
}

/**
 * Get the opposite edge on the existing tile that faces our edge.
 */
function getOppositeEdge(
  ourEdge: 'top' | 'right' | 'bottom' | 'left',
  _newPos: TilePosition,
  _existing: Placement
): 'top' | 'right' | 'bottom' | 'left' | null {
  // For same-orientation adjacent tiles, edges are opposite
  // For different orientations, it depends on the specific configuration
  // Simplified: assume opposite edge for now
  switch (ourEdge) {
    case 'top': return 'bottom';
    case 'bottom': return 'top';
    case 'left': return 'right';
    case 'right': return 'left';
  }
}

/**
 * Get which edges of a position face outside the shape (need NULL connectors).
 */
function getExteriorEdges(
  pos: TilePosition,
  allPositions: TilePosition[]
): Array<'top' | 'right' | 'bottom' | 'left'> {
  const edges: Array<'top' | 'right' | 'bottom' | 'left'> = [];

  // Check each direction to see if there's an adjacent position
  if (pos.orientation === 'flat') {
    // Top edge (z-1 direction) - connects to flat at z-1 OR vertical-z
    // vertical-z at (x, y-1, z-1) connects via top edge, vertical-z at (x, y, z-1) connects via bottom edge
    if (!hasAdjacentPosition(pos, 0, 0, -1, allPositions) &&
        !hasVerticalZAt(pos.x, pos.y - 1, pos.z - 1, allPositions) &&
        !hasVerticalZAt(pos.x, pos.y, pos.z - 1, allPositions)) {
      edges.push('top');
    }
    // Bottom edge (z+1 direction) - connects to flat at z+1 OR vertical-z
    // vertical-z at (x, y-1, z) connects via top edge, vertical-z at (x, y, z) connects via bottom edge
    if (!hasAdjacentPosition(pos, 0, 0, 1, allPositions) &&
        !hasVerticalZAt(pos.x, pos.y - 1, pos.z, allPositions) &&
        !hasVerticalZAt(pos.x, pos.y, pos.z, allPositions)) {
      edges.push('bottom');
    }
    // Left edge (x-1 direction) - connects to flat or vertical-x
    // vertical-x at (x-1, y-1, z) connects via top edge, vertical-x at (x-1, y, z) connects via bottom edge
    if (!hasAdjacentPosition(pos, -1, 0, 0, allPositions) &&
        !hasVerticalXAt(pos.x - 1, pos.y - 1, pos.z, allPositions) &&
        !hasVerticalXAt(pos.x - 1, pos.y, pos.z, allPositions)) {
      edges.push('left');
    }
    // Right edge (x+1 direction) - connects to flat or vertical-x at same cell
    // vertical-x at (x, y-1, z) connects via top edge, vertical-x at (x, y, z) connects via bottom edge
    if (!hasAdjacentPosition(pos, 1, 0, 0, allPositions) &&
        !hasVerticalXAt(pos.x, pos.y - 1, pos.z, allPositions) &&
        !hasVerticalXAt(pos.x, pos.y, pos.z, allPositions)) {
      edges.push('right');
    }
  } else if (pos.orientation === 'vertical-x') {
    // Vertical-x bottom edge at y connects to flat at y (via flat's right edge)
    // Vertical-x top edge at y+1 connects to flat at y+1 (via flat's right edge)
    if (!hasFlatAt(pos.x, pos.y, pos.z, allPositions) &&
        !hasFlatAt(pos.x + 1, pos.y, pos.z, allPositions)) {
      edges.push('bottom');
    }
    // Top edge connects to flat at y+1 or vertical-x above
    if (!hasFlatAt(pos.x, pos.y + 1, pos.z, allPositions) &&
        !hasFlatAt(pos.x + 1, pos.y + 1, pos.z, allPositions) &&
        !hasVerticalXAt(pos.x, pos.y + 1, pos.z, allPositions)) {
      edges.push('top');
    }
    // Left/right edges of vertical-x face z direction
    // Also connects to vertical-z at same y level
    if (!hasVerticalXAt(pos.x, pos.y, pos.z - 1, allPositions) &&
        !hasVerticalZAt(pos.x, pos.y, pos.z - 1, allPositions)) {
      edges.push('left');
    }
    if (!hasVerticalXAt(pos.x, pos.y, pos.z + 1, allPositions) &&
        !hasVerticalZAt(pos.x, pos.y, pos.z, allPositions)) {
      edges.push('right');
    }
  } else if (pos.orientation === 'vertical-z') {
    // Vertical-z bottom edge at y connects to flat at y (via flat's bottom edge)
    // Vertical-z top edge at y+1 connects to flat at y+1 (via flat's bottom edge)
    if (!hasFlatAt(pos.x, pos.y, pos.z, allPositions) &&
        !hasFlatAt(pos.x, pos.y, pos.z + 1, allPositions)) {
      edges.push('bottom');
    }
    // Top edge connects to flat at y+1 or vertical-z above
    if (!hasFlatAt(pos.x, pos.y + 1, pos.z, allPositions) &&
        !hasFlatAt(pos.x, pos.y + 1, pos.z + 1, allPositions) &&
        !hasVerticalZAt(pos.x, pos.y + 1, pos.z, allPositions)) {
      edges.push('top');
    }
    // Left/right edges of vertical-z face x direction
    // Also connects to vertical-x at same y level
    if (!hasVerticalZAt(pos.x - 1, pos.y, pos.z, allPositions) &&
        !hasVerticalXAt(pos.x - 1, pos.y, pos.z, allPositions)) {
      edges.push('left');
    }
    if (!hasVerticalZAt(pos.x + 1, pos.y, pos.z, allPositions) &&
        !hasVerticalXAt(pos.x, pos.y, pos.z, allPositions)) {
      edges.push('right');
    }
  }

  return edges;
}

function hasAdjacentPosition(pos: TilePosition, dx: number, dy: number, dz: number, allPositions: TilePosition[]): boolean {
  return allPositions.some(p =>
    p.x === pos.x + dx && p.y === pos.y + dy && p.z === pos.z + dz && p.orientation === pos.orientation
  );
}

function hasFlatAt(x: number, y: number, z: number, allPositions: TilePosition[]): boolean {
  return allPositions.some(p => p.x === x && p.y === y && p.z === z && p.orientation === 'flat');
}

function hasVerticalXAt(x: number, y: number, z: number, allPositions: TilePosition[]): boolean {
  return allPositions.some(p => p.x === x && p.y === y && p.z === z && p.orientation === 'vertical-x');
}

function hasVerticalZAt(x: number, y: number, z: number, allPositions: TilePosition[]): boolean {
  return allPositions.some(p => p.x === x && p.y === y && p.z === z && p.orientation === 'vertical-z');
}

/**
 * Given a new position and an existing placement, determine which edge of the
 * new position would connect to the existing tile.
 *
 * Based on ConnectionValidator.ts world position calculations:
 * - Flat at (x,y,z): right edge at (x+1, y, z+0.5)
 * - Vertical-x at (x,y,z): bottom edge at (x+1, y, z+0.5)
 */
function getConnectingEdge(
  newPos: TilePosition,
  existing: Placement
): 'top' | 'right' | 'bottom' | 'left' | null {
  const ep = existing.cell;
  const eo = existing.orientation;

  // Same cell, different orientation
  if (newPos.x === ep.x && newPos.y === ep.y && newPos.z === ep.z) {
    if (newPos.orientation === 'flat' && eo === 'vertical-x') {
      // Flat's right edge connects to vertical-x's bottom
      return 'right';
    }
    if (newPos.orientation === 'vertical-x' && eo === 'flat') {
      // Vertical-x's bottom connects to flat's right
      return 'bottom';
    }
    if (newPos.orientation === 'flat' && eo === 'vertical-z') {
      // Flat's bottom edge connects to vertical-z's bottom
      return 'bottom';
    }
    if (newPos.orientation === 'vertical-z' && eo === 'flat') {
      return 'bottom';
    }
  }

  // Flat tiles horizontally adjacent
  if (newPos.orientation === 'flat' && eo === 'flat' && newPos.y === ep.y) {
    if (newPos.x === ep.x + 1 && newPos.z === ep.z) return 'left';   // new is right of existing
    if (newPos.x === ep.x - 1 && newPos.z === ep.z) return 'right';  // new is left of existing
    if (newPos.z === ep.z + 1 && newPos.x === ep.x) return 'top';    // new is behind existing
    if (newPos.z === ep.z - 1 && newPos.x === ep.x) return 'bottom'; // new is in front
  }

  // Flat and vertical-x in adjacent cells
  if (newPos.orientation === 'flat' && eo === 'vertical-x') {
    // Vertical-x at (x,y,z) has bottom edge at (x+1, y, z+0.5)
    // This matches flat at (x,y,z)'s right edge at (x+1, y, z+0.5)
    // So flat at same position connects via right, flat at (x+1) connects via left
    if (newPos.x === ep.x && newPos.y === ep.y && newPos.z === ep.z) return 'right';
    if (newPos.x === ep.x + 1 && newPos.y === ep.y && newPos.z === ep.z) return 'left';
  }
  if (newPos.orientation === 'vertical-x' && eo === 'flat') {
    if (newPos.x === ep.x && newPos.y === ep.y && newPos.z === ep.z) return 'bottom';
    if (newPos.x === ep.x - 1 && newPos.y === ep.y && newPos.z === ep.z) return 'bottom';
  }

  // Flat and vertical-z
  if (newPos.orientation === 'flat' && eo === 'vertical-z') {
    if (newPos.x === ep.x && newPos.y === ep.y && newPos.z === ep.z) return 'bottom';
    if (newPos.x === ep.x && newPos.y === ep.y && newPos.z === ep.z + 1) return 'top';
  }
  if (newPos.orientation === 'vertical-z' && eo === 'flat') {
    if (newPos.x === ep.x && newPos.y === ep.y && newPos.z === ep.z) return 'bottom';
    if (newPos.x === ep.x && newPos.y === ep.y && newPos.z === ep.z - 1) return 'bottom';
  }

  // Vertical tiles stacked (y differs)
  if (newPos.orientation === 'vertical-x' && eo === 'vertical-x' &&
      newPos.x === ep.x && newPos.z === ep.z) {
    if (newPos.y === ep.y + 1) return 'bottom'; // new above existing
    if (newPos.y === ep.y - 1) return 'top';    // new below existing
  }

  return null;
}

/**
 * Get which edges of a placed tile have connectors.
 */
function getTileEdges(tile: PlacedTile): Record<'top' | 'right' | 'bottom' | 'left', 'left' | 'middle' | 'right' | null> {
  const def = GENERATED_TILES.find(t => t.id === tile.definition.id);
  if (!def) {
    return { top: null, right: null, bottom: null, left: null };
  }

  const config = def.config;
  let edges = {
    top: config.top || null,
    right: config.right || null,
    bottom: config.bottom || null,
    left: config.left || null
  };

  // Apply flip (vertical flip - mirrors top/bottom, like ConnectionValidator)
  if (tile.flipped) {
    // Helper to flip connector positions
    const flipPos = (p: 'left' | 'middle' | 'right' | null): 'left' | 'middle' | 'right' | null =>
      p === 'left' ? 'right' : p === 'right' ? 'left' : p;

    // Swap top and bottom edges, and flip all positions
    const oldTop = edges.top;
    const oldBottom = edges.bottom;
    edges.top = flipPos(oldBottom);
    edges.bottom = flipPos(oldTop);
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

function isAdjacentToAny(pos: TilePosition, placements: Placement[]): boolean {
  for (const p of placements) {
    if (arePositionsAdjacent(pos, p)) {
      return true;
    }
  }
  return false;
}

function arePositionsAdjacent(pos: TilePosition, placement: Placement): boolean {
  const p = placement.cell;
  const o = placement.orientation;

  // Same cell, different orientation - always adjacent
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

  // Flat tiles adjacent vertically (stacked)
  if (pos.orientation === 'flat' && o === 'flat') {
    if (pos.x === p.x && pos.z === p.z && Math.abs(pos.y - p.y) === 1) {
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

  // Vertical-x tiles stacked or side by side
  if (pos.orientation === 'vertical-x' && o === 'vertical-x') {
    if (pos.x === p.x && pos.z === p.z && Math.abs(pos.y - p.y) === 1) {
      return true;
    }
    if (pos.x === p.x && pos.y === p.y && Math.abs(pos.z - p.z) === 1) {
      return true;
    }
  }

  // Vertical-z tiles stacked or side by side
  if (pos.orientation === 'vertical-z' && o === 'vertical-z') {
    if (pos.z === p.z && pos.y === p.y && Math.abs(pos.x - p.x) === 1) {
      return true;
    }
    if (pos.z === p.z && pos.x === p.x && Math.abs(pos.y - p.y) === 1) {
      return true;
    }
  }

  // Vertical-x and vertical-z at same cell
  if (pos.orientation === 'vertical-x' && o === 'vertical-z') {
    if (pos.y === p.y && (
      (pos.x === p.x && pos.z === p.z) ||
      (pos.x === p.x && pos.z === p.z + 1) ||
      (pos.x + 1 === p.x && pos.z === p.z) ||
      (pos.x + 1 === p.x && pos.z === p.z + 1)
    )) {
      return true;
    }
  }
  if (pos.orientation === 'vertical-z' && o === 'vertical-x') {
    if (pos.y === p.y && (
      (pos.x === p.x && pos.z === p.z) ||
      (pos.x === p.x + 1 && pos.z === p.z) ||
      (pos.x === p.x && pos.z + 1 === p.z) ||
      (pos.x === p.x + 1 && pos.z + 1 === p.z)
    )) {
      return true;
    }
  }

  return false;
}

function posKey(p: TilePosition | { x: number; y: number; z: number; orientation: Orientation }): string {
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

function shuffleArray<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function shuffledRotations(): Rotation[] {
  const r = [...ROTATIONS];
  shuffleArray(r);
  return r;
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
