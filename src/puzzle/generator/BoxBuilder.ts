import type { Placement, Rotation, TileSpec } from '../types';
import type { PlacedTile } from '../../tiles/types';
import { validateConnections, getTileConnectors } from '../../game/ConnectionValidator';
import { GENERATED_TILES } from '../../tiles/TileBuilder';

/**
 * BOX BUILDER
 *
 * Build a simple 3D box: floor + 4 walls + ceiling
 * This is the simplest closed 3D structure.
 *
 * Structure for a 1x1 box at origin:
 * - Floor: flat at (0, 0, 0)
 * - Left wall: vertical-x at (-1, 0, 0)
 * - Right wall: vertical-x at (0, 0, 0)
 * - Front wall: vertical-z at (0, 0, -1)
 * - Back wall: vertical-z at (0, 0, 0)
 * - Ceiling: flat at (0, 1, 0)
 */

const ROTATIONS: Rotation[] = [0, 90, 180, 270];

export interface BoxPuzzle {
  placements: Placement[];
  inventory: TileSpec[];
}

type Position = {
  x: number;
  y: number;
  z: number;
  orientation: 'flat' | 'vertical-x' | 'vertical-z';
};


/**
 * Test function: place floor + 2 walls step by step
 *
 * Simpler approach: find tiles that work together, checking all connector overlaps.
 */
export function testTwoTiles(): Placement[] | null {
  const cx = 3, cz = 3;
  const pool = [...GENERATED_TILES.map(t => t.id)];
  shuffleArray(pool);

  // Position 0: floor at (3, 0, 3)
  const floorPos = { x: cx, y: 0, z: cz, orientation: 'flat' as const };
  // Position 1: left wall (vertical-x) at (2, 0, 3) - plane at wx=3
  const wall1Pos = { x: cx - 1, y: 0, z: cz, orientation: 'vertical-x' as const };
  // Position 2: front wall (vertical-z) at (3, 0, 2) - plane at wz=3
  const wall2Pos = { x: cx, y: 0, z: cz - 1, orientation: 'vertical-z' as const };

  // ========== STEP 1: Find a 4-way floor tile ==========
  let floorPlacement: Placement | null = null;
  for (const tileId of pool) {
    for (const rotation of ROTATIONS) {
      for (const flipped of [false, true]) {
        const placement: Placement = {
          cell: { x: floorPos.x, y: floorPos.y, z: floorPos.z },
          orientation: floorPos.orientation,
          tileId,
          rotation,
          flipped
        };
        const tile = toPlacedTile(placement);
        const connectors = getTileConnectors(tile);
        const edges = new Set(connectors.map(c => c.edge));
        if (edges.size >= 4) {
          floorPlacement = placement;
          break;
        }
      }
      if (floorPlacement) break;
    }
    if (floorPlacement) break;
  }

  if (!floorPlacement) {
    console.log('[Test] No 4-way floor tile found');
    return null;
  }

  const floorTile = toPlacedTile(floorPlacement);
  const floorConnectors = getTileConnectors(floorTile);
  console.log('[Test] Floor connectors:');
  for (const c of floorConnectors) {
    console.log(`  ${c.edge} ${c.pos} at (${c.wx.toFixed(2)}, ${c.wy.toFixed(2)}, ${c.wz.toFixed(2)})`);
  }

  // ========== STEP 2: Find wall1 that connects to floor ==========
  // Wall1 is vertical-x at (2,0,3), plane at wx=3
  // Wall1's right edge is at wx=3 (since vertical-x: wx = x+1 for right edge)
  // Wait no - vertical-x at (2,0,3): center at (3, 0.5, 3.5)
  // right edge localX=+0.5: wx = 2 + 1 = 3, wz = 3.5 + rx
  // left edge localX=-0.5: wx = 2 + 1 = 3, wz = 3.5 - rx
  // Actually for vertical-x: wx = x+1, wy = y+0.5+ry, wz = z+0.5+rx
  // So ALL connectors have wx=3 (the plane), wy and wz vary

  let wall1Placement: Placement | null = null;
  for (const tileId of pool) {
    for (const rotation of ROTATIONS) {
      for (const flipped of [false, true]) {
        const placement: Placement = {
          cell: { x: wall1Pos.x, y: wall1Pos.y, z: wall1Pos.z },
          orientation: wall1Pos.orientation,
          tileId,
          rotation,
          flipped
        };
        const tile = toPlacedTile(placement);
        const w1Connectors = getTileConnectors(tile);

        // Check if ANY wall1 connector matches ANY floor connector
        let foundMatch = false;
        for (const wc of w1Connectors) {
          for (const fc of floorConnectors) {
            const posMatch = Math.abs(wc.wx - fc.wx) < 0.01 &&
                            Math.abs(wc.wy - fc.wy) < 0.01 &&
                            Math.abs(wc.wz - fc.wz) < 0.01;
            if (posMatch) {
              const typeMatch =
                (wc.pos === 'middle' && fc.pos === 'middle') ||
                (wc.pos === 'left' && fc.pos === 'right') ||
                (wc.pos === 'right' && fc.pos === 'left');
              if (typeMatch) {
                foundMatch = true;
                break;
              }
            }
          }
          if (foundMatch) break;
        }

        if (foundMatch) {
          wall1Placement = placement;
          break;
        }
      }
      if (wall1Placement) break;
    }
    if (wall1Placement) break;
  }

  if (!wall1Placement) {
    console.log('[Test] No wall1 found that connects to floor');
    return null;
  }

  const wall1Tile = toPlacedTile(wall1Placement);
  const wall1Connectors = getTileConnectors(wall1Tile);
  console.log('[Test] Wall1 connectors:');
  for (const c of wall1Connectors) {
    console.log(`  ${c.edge} ${c.pos} at (${c.wx.toFixed(2)}, ${c.wy.toFixed(2)}, ${c.wz.toFixed(2)})`);
  }

  // ========== STEP 3: Find wall2 that connects to BOTH floor AND wall1 ==========
  // Wall2 is vertical-z at (3,0,2), plane at wz=3
  // vertical-z: wx = x+0.5-rx, wy = y+0.5+ry, wz = z+1 = 3
  // So wall2's plane is at wz=3
  // The corner where wall1 and wall2 meet is at wx=3, wz=3

  // Wall1's connectors are all at wx=3 (the vertical-x plane)
  // Wall2's connectors are all at wz=3 (the vertical-z plane)
  // The corner line is where wx=3 AND wz=3 - this is the vertical edge
  // At the corner, wall1 has connectors with some wy, wz=something
  // Wait - wall1 is at z=3, so its wz values are around 3 + something

  // Let me find wall1's corner connector: the one closest to wz=3
  const wall1AtCorner = wall1Connectors.filter(c => Math.abs(c.wz - 3.0) < 0.2);
  console.log('[Test] Wall1 connectors near corner (wz~3):');
  for (const c of wall1AtCorner) {
    console.log(`  ${c.edge} ${c.pos} at (${c.wx.toFixed(2)}, ${c.wy.toFixed(2)}, ${c.wz.toFixed(2)})`);
  }

  let wall2Placement: Placement | null = null;
  let wall2Debug: string[] = [];

  for (const tileId of pool) {
    for (const rotation of ROTATIONS) {
      for (const flipped of [false, true]) {
        const placement: Placement = {
          cell: { x: wall2Pos.x, y: wall2Pos.y, z: wall2Pos.z },
          orientation: wall2Pos.orientation,
          tileId,
          rotation,
          flipped
        };
        const tile = toPlacedTile(placement);
        const w2Connectors = getTileConnectors(tile);

        // Check 1: wall2 must connect to floor (at least one match)
        let connectsToFloor = false;
        for (const wc of w2Connectors) {
          for (const fc of floorConnectors) {
            const posMatch = Math.abs(wc.wx - fc.wx) < 0.01 &&
                            Math.abs(wc.wy - fc.wy) < 0.01 &&
                            Math.abs(wc.wz - fc.wz) < 0.01;
            if (posMatch) {
              const typeMatch =
                (wc.pos === 'middle' && fc.pos === 'middle') ||
                (wc.pos === 'left' && fc.pos === 'right') ||
                (wc.pos === 'right' && fc.pos === 'left');
              if (typeMatch) {
                connectsToFloor = true;
                break;
              }
            }
          }
          if (connectsToFloor) break;
        }

        if (!connectsToFloor) continue;

        // Check 2: for every wall2 connector that overlaps a wall1 connector position,
        // they must have matching types
        let cornerOk = true;
        let hasCornerConnection = false;

        for (const w2c of w2Connectors) {
          for (const w1c of wall1Connectors) {
            const posMatch = Math.abs(w2c.wx - w1c.wx) < 0.01 &&
                            Math.abs(w2c.wy - w1c.wy) < 0.01 &&
                            Math.abs(w2c.wz - w1c.wz) < 0.01;
            if (posMatch) {
              // Found overlapping connectors - check type match
              const typeMatch =
                (w2c.pos === 'middle' && w1c.pos === 'middle') ||
                (w2c.pos === 'left' && w1c.pos === 'right') ||
                (w2c.pos === 'right' && w1c.pos === 'left');

              if (typeMatch) {
                hasCornerConnection = true;
              } else {
                cornerOk = false;
                wall2Debug.push(`${tileId} r${rotation} f${flipped}: mismatch at (${w2c.wx.toFixed(2)},${w2c.wy.toFixed(2)},${w2c.wz.toFixed(2)}) w2=${w2c.pos} w1=${w1c.pos}`);
              }
            }
          }
        }

        if (connectsToFloor && cornerOk && hasCornerConnection) {
          console.log(`[Test] Found wall2: ${tileId} rot=${rotation} flip=${flipped}`);
          wall2Placement = placement;
          break;
        }
      }
      if (wall2Placement) break;
    }
    if (wall2Placement) break;
  }

  if (!wall2Placement) {
    console.log('[Test] No wall2 found that connects to both floor and wall1');
    console.log('[Test] Some mismatches found:');
    for (const d of wall2Debug.slice(0, 10)) {
      console.log(`  ${d}`);
    }
    return null;
  }

  const wall2Tile = toPlacedTile(wall2Placement);
  const wall2Connectors = getTileConnectors(wall2Tile);
  console.log('[Test] Wall2 connectors:');
  for (const c of wall2Connectors) {
    console.log(`  ${c.edge} ${c.pos} at (${c.wx.toFixed(2)}, ${c.wy.toFixed(2)}, ${c.wz.toFixed(2)})`);
  }

  // Final validation
  const allTiles = [floorTile, wall1Tile, wall2Tile];
  const result = validateConnections(allTiles);

  console.log(`[Test] FINAL: ${result.connectedPairs.length} connections, ${result.openConnectors.length} open`);
  for (const [a, b] of result.connectedPairs) {
    console.log(`  Connected: (${a.wx.toFixed(2)},${a.wy.toFixed(2)},${a.wz.toFixed(2)}) ${a.pos} <-> ${b.pos}`);
  }
  for (const oc of result.openConnectors) {
    const tileIdx = allTiles.indexOf(oc.tile);
    console.log(`  Open: tile${tileIdx} ${oc.pos} at (${oc.wx.toFixed(2)}, ${oc.wy.toFixed(2)}, ${oc.wz.toFixed(2)})`);
  }

  return [floorPlacement, wall1Placement, wall2Placement];
}

/**
 * Build a 3D box puzzle with backtracking.
 */
export function buildBox(config?: {
  tilePool?: string[];
  maxBacktracks?: number;
}): BoxPuzzle | null {
  const pool = config?.tilePool ?? GENERATED_TILES.map(t => t.id);
  const maxBacktracks = config?.maxBacktracks ?? 10000;

  // Define all 6 positions of the box (centered around x=3, z=3)
  const cx = 3, cz = 3;
  const positions: Position[] = [
    // Floor
    { x: cx, y: 0, z: cz, orientation: 'flat' },
    // Walls (at y=0, they connect floor at y=0 to ceiling at y=1)
    { x: cx - 1, y: 0, z: cz, orientation: 'vertical-x' }, // left
    { x: cx, y: 0, z: cz, orientation: 'vertical-x' },  // right
    { x: cx, y: 0, z: cz - 1, orientation: 'vertical-z' }, // front
    { x: cx, y: 0, z: cz, orientation: 'vertical-z' },  // back
    // Ceiling
    { x: cx, y: 1, z: cz, orientation: 'flat' },
  ];

  console.log(`[BoxBuilder] Building 6-tile box with backtracking`);

  const result = solveWithBacktracking(positions, pool, maxBacktracks);

  if (result) {
    // Verify with ConnectionValidator
    const tiles = result.map(toPlacedTile);
    const validation = validateConnections(tiles);

    if (validation.valid) {
      console.log(`[BoxBuilder] SUCCESS! Closed network.`);
    } else {
      console.log(`[BoxBuilder] Filled but ${validation.openConnectors.length} open connectors`);
    }

    // Return result either way so user can visualize it
    return {
      placements: result,
      inventory: extractInventory(result)
    };
  }

  console.log(`[BoxBuilder] Failed - no solution found`);
  return null;
}

/**
 * Build a larger 3D box (width x depth floor, 4 walls, ceiling)
 */
export function buildLargeBox(config: {
  width: number;
  depth: number;
  tilePool?: string[];
  maxBacktracks?: number;
}): BoxPuzzle | null {
  const { width, depth } = config;
  const pool = config.tilePool ?? GENERATED_TILES.map(t => t.id);
  const maxBacktracks = config.maxBacktracks ?? 50000;

  const positions: Position[] = [];

  // Floor tiles
  for (let x = 0; x < width; x++) {
    for (let z = 0; z < depth; z++) {
      positions.push({ x, y: 0, z, orientation: 'flat' });
    }
  }

  // Wall tiles (vertical-x on left and right edges)
  for (let z = 0; z < depth; z++) {
    positions.push({ x: -1, y: 0, z, orientation: 'vertical-x' }); // left wall
    positions.push({ x: width - 1, y: 0, z, orientation: 'vertical-x' }); // right wall
  }

  // Wall tiles (vertical-z on front and back edges)
  for (let x = 0; x < width; x++) {
    positions.push({ x, y: 0, z: -1, orientation: 'vertical-z' }); // front wall
    positions.push({ x, y: 0, z: depth - 1, orientation: 'vertical-z' }); // back wall
  }

  // Ceiling tiles
  for (let x = 0; x < width; x++) {
    for (let z = 0; z < depth; z++) {
      positions.push({ x, y: 1, z, orientation: 'flat' });
    }
  }

  const totalTiles = positions.length;
  console.log(`[BoxBuilder] Building ${width}x${depth} box (${totalTiles} tiles)`);

  const result = solveWithBacktracking(positions, pool, maxBacktracks);

  if (result) {
    const tiles = result.map(toPlacedTile);
    const validation = validateConnections(tiles);

    if (validation.valid) {
      console.log(`[BoxBuilder] SUCCESS! Closed network with ${totalTiles} tiles.`);
      return {
        placements: result,
        inventory: extractInventory(result)
      };
    } else {
      console.log(`[BoxBuilder] Filled but ${validation.openConnectors.length} open connectors`);
    }
  }

  console.log(`[BoxBuilder] Failed after ${maxBacktracks} backtracks`);
  return null;
}

/**
 * Solve using iterative backtracking.
 */
function solveWithBacktracking(
  positions: Position[],
  pool: string[],
  maxBacktracks: number
): Placement[] | null {
  // For each position, generate all valid candidate placements
  // A placement is valid if:
  // 1. Exterior edges have NULL connectors
  // 2. Interior edges connect properly to already-placed neighbors

  const n = positions.length;
  const placements: (Placement | null)[] = new Array(n).fill(null);

  // Precompute which positions are adjacent to which
  const adjacency = computeAdjacency(positions);

  // Precompute exterior edges for each position
  const exteriorEdges = positions.map(pos => getExteriorEdges(pos, positions));

  // Debug: show what we computed
  console.log(`[BoxBuilder] Positions:`);
  for (let i = 0; i < n; i++) {
    const p = positions[i];
    const adj = adjacency.get(i) || [];
    const ext = Array.from(exteriorEdges[i]);
    console.log(`  ${i}: (${p.x},${p.y},${p.z}) ${p.orientation} - ext:[${ext}] adj:[${adj.map(a => a.idx).join(',')}]`);
  }

  // Stack: current index and which candidate we're trying
  let idx = 0;
  const candidateIndices: number[] = new Array(n).fill(0);
  const candidateLists: (Placement[] | null)[] = new Array(n).fill(null);

  let backtracks = 0;

  while (idx < n && backtracks < maxBacktracks) {
    const pos = positions[idx];

    // Generate candidates for this position if not already done
    if (candidateLists[idx] === null) {
      candidateLists[idx] = generateCandidates(
        pos,
        idx,
        placements,
        adjacency,
        exteriorEdges[idx],
        pool
      );
      if (candidateLists[idx]!.length === 0 && backtracks < 5) {
        console.log(`[BoxBuilder] No candidates for pos ${idx} (${pos.x},${pos.y},${pos.z}) ${pos.orientation}`);
        // Show what tiles are already placed
        for (let i = 0; i < idx; i++) {
          if (placements[i]) {
            const p = placements[i]!;
            const tile = GENERATED_TILES.find(t => t.id === p.tileId);
            console.log(`  Existing tile ${i}: ${tile?.name} at (${p.cell.x},${p.cell.y},${p.cell.z}) ${p.orientation}`);
          }
        }
      }
      shuffleArray(candidateLists[idx]!);
      candidateIndices[idx] = 0;
    }

    const candidates = candidateLists[idx]!;

    // Try next candidate
    if (candidateIndices[idx] < candidates.length) {
      placements[idx] = candidates[candidateIndices[idx]];
      candidateIndices[idx]++;
      idx++;
    } else {
      // No more candidates, backtrack
      backtracks++;
      placements[idx] = null;
      candidateLists[idx] = null;
      candidateIndices[idx] = 0;
      idx--;

      if (idx < 0) {
        // Exhausted all options
        return null;
      }
    }
  }

  if (idx === n) {
    console.log(`[BoxBuilder] Solution found after ${backtracks} backtracks`);
    // Debug: show what was placed
    for (let i = 0; i < n; i++) {
      const p = placements[i]!;
      const tile = GENERATED_TILES.find(t => t.id === p.tileId);
      console.log(`  ${i}: ${tile?.name} rot=${p.rotation} flip=${p.flipped}`);
    }
    // Debug: show open connectors
    const tiles = placements.map(p => toPlacedTile(p!));
    const result = validateConnections(tiles);
    console.log(`  Open connectors: ${result.openConnectors.length}`);
    for (const oc of result.openConnectors) {
      const tileIdx = tiles.indexOf(oc.tile);
      console.log(`    Tile ${tileIdx} at (${oc.wx.toFixed(2)}, ${oc.wy.toFixed(2)}, ${oc.wz.toFixed(2)})`);
    }
    return placements as Placement[];
  }

  return null;
}

/**
 * Compute which positions are adjacent to which.
 */
function computeAdjacency(positions: Position[]): Map<number, Array<{ idx: number; ourEdge: string; theirEdge: string }>> {
  const adj = new Map<number, Array<{ idx: number; ourEdge: string; theirEdge: string }>>();

  for (let i = 0; i < positions.length; i++) {
    adj.set(i, []);
  }

  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      const connection = getConnection(positions[i], positions[j]);
      if (connection) {
        adj.get(i)!.push({ idx: j, ourEdge: connection.edge1, theirEdge: connection.edge2 });
        adj.get(j)!.push({ idx: i, ourEdge: connection.edge2, theirEdge: connection.edge1 });
      }
    }
  }

  return adj;
}

/**
 * Determine if two positions are adjacent and which edges connect.
 */
function getConnection(a: Position, b: Position): { edge1: string; edge2: string } | null {
  // Same orientation, adjacent cells
  if (a.orientation === 'flat' && b.orientation === 'flat' && a.y === b.y) {
    if (a.x === b.x - 1 && a.z === b.z) return { edge1: 'right', edge2: 'left' };
    if (a.x === b.x + 1 && a.z === b.z) return { edge1: 'left', edge2: 'right' };
    if (a.z === b.z - 1 && a.x === b.x) return { edge1: 'bottom', edge2: 'top' };
    if (a.z === b.z + 1 && a.x === b.x) return { edge1: 'top', edge2: 'bottom' };
  }

  // Flat and vertical-x connection
  // vertical-x at (x, y, z) connects to:
  // - flat at (x, y, z) via flat's right edge and vertical's bottom edge
  // - flat at (x+1, y, z) via flat's left edge and vertical's bottom edge
  // - flat at (x, y+1, z) via flat's right edge and vertical's top edge
  // - flat at (x+1, y+1, z) via flat's left edge and vertical's top edge
  if (a.orientation === 'flat' && b.orientation === 'vertical-x') {
    if (a.z === b.z) {
      if (a.x === b.x && a.y === b.y) return { edge1: 'right', edge2: 'bottom' };
      if (a.x === b.x + 1 && a.y === b.y) return { edge1: 'left', edge2: 'bottom' };
      if (a.x === b.x && a.y === b.y + 1) return { edge1: 'right', edge2: 'top' };
      if (a.x === b.x + 1 && a.y === b.y + 1) return { edge1: 'left', edge2: 'top' };
    }
  }
  if (a.orientation === 'vertical-x' && b.orientation === 'flat') {
    const rev = getConnection(b, a);
    if (rev) return { edge1: rev.edge2, edge2: rev.edge1 };
  }

  // Flat and vertical-z connection
  // vertical-z at (x, y, z) connects to:
  // - flat at (x, y, z) via flat's bottom edge and vertical's bottom edge
  // - flat at (x, y, z+1) via flat's top edge and vertical's bottom edge
  // - flat at (x, y+1, z) via flat's bottom edge and vertical's top edge
  // - flat at (x, y+1, z+1) via flat's top edge and vertical's top edge
  if (a.orientation === 'flat' && b.orientation === 'vertical-z') {
    if (a.x === b.x) {
      if (a.z === b.z && a.y === b.y) return { edge1: 'bottom', edge2: 'bottom' };
      if (a.z === b.z + 1 && a.y === b.y) return { edge1: 'top', edge2: 'bottom' };
      if (a.z === b.z && a.y === b.y + 1) return { edge1: 'bottom', edge2: 'top' };
      if (a.z === b.z + 1 && a.y === b.y + 1) return { edge1: 'top', edge2: 'top' };
    }
  }
  if (a.orientation === 'vertical-z' && b.orientation === 'flat') {
    const rev = getConnection(b, a);
    if (rev) return { edge1: rev.edge2, edge2: rev.edge1 };
  }

  // Vertical-x to vertical-x (stacked or side by side)
  if (a.orientation === 'vertical-x' && b.orientation === 'vertical-x') {
    if (a.x === b.x && a.z === b.z) {
      if (a.y === b.y - 1) return { edge1: 'top', edge2: 'bottom' };
      if (a.y === b.y + 1) return { edge1: 'bottom', edge2: 'top' };
    }
  }

  // Vertical-z to vertical-z (stacked or side by side)
  if (a.orientation === 'vertical-z' && b.orientation === 'vertical-z') {
    if (a.x === b.x && a.z === b.z) {
      if (a.y === b.y - 1) return { edge1: 'top', edge2: 'bottom' };
      if (a.y === b.y + 1) return { edge1: 'bottom', edge2: 'top' };
    }
  }

  return null;
}

/**
 * Get which edges of a position face outside the shape (need NULL).
 */
function getExteriorEdges(pos: Position, allPositions: Position[]): Set<string> {
  const exterior = new Set<string>();
  const edges = ['top', 'right', 'bottom', 'left'];

  for (const edge of edges) {
    let hasNeighbor = false;
    for (const other of allPositions) {
      if (other === pos) continue;
      const conn = getConnection(pos, other);
      if (conn && conn.edge1 === edge) {
        hasNeighbor = true;
        break;
      }
    }
    if (!hasNeighbor) {
      exterior.add(edge);
    }
  }

  return exterior;
}

/**
 * Generate all valid placement candidates for a position.
 *
 * CORRECT APPROACH:
 * 1. Get all open connectors from existing tiles that this new position could satisfy
 * 2. For each tile/rotation/flip combo, check if it satisfies ALL required connections
 *    and doesn't create mismatches
 */
function generateCandidates(
  pos: Position,
  _posIdx: number,
  currentPlacements: (Placement | null)[],
  _adjacency: Map<number, Array<{ idx: number; ourEdge: string; theirEdge: string }>>,
  _exteriorEdges: Set<string>,
  pool: string[]
): Placement[] {
  const candidates: Placement[] = [];

  // Get currently placed tiles
  const existingTiles = currentPlacements
    .filter((p): p is Placement => p !== null)
    .map(toPlacedTile);

  // First tile: needs connectors on all 4 edges for a closed box
  // (or at least enough edges to connect to adjacent positions)
  if (existingTiles.length === 0) {
    for (const tileId of pool) {
      for (const rotation of ROTATIONS) {
        for (const flipped of [false, true]) {
          const placement: Placement = {
            cell: { x: pos.x, y: pos.y, z: pos.z },
            orientation: pos.orientation,
            tileId,
            rotation,
            flipped
          };
          const newTile = toPlacedTile(placement);
          const connectors = getTileConnectors(newTile);

          // For a box, the floor/ceiling need 4 connectors (one per wall)
          // Check that we have connectors on all 4 edges
          const edges = new Set(connectors.map(c => c.edge));
          if (edges.size >= 4) {
            candidates.push(placement);
          }
        }
      }
    }
    // Debug: show where first tile's connectors will be
    if (candidates.length > 0) {
      const firstCandidate = toPlacedTile(candidates[0]);
      const conns = getTileConnectors(firstCandidate);
      console.log(`[BoxBuilder] First tile candidate connectors (${conns.length} total):`);
      for (const c of conns) {
        console.log(`  ${c.edge} ${c.pos} at (${c.wx.toFixed(2)}, ${c.wy.toFixed(2)}, ${c.wz.toFixed(2)})`);
      }
    } else {
      console.log(`[BoxBuilder] WARNING: No 4-way tiles found for first position!`);
    }
    return candidates;
  }

  // Get all open connectors from existing tiles
  const existingResult = validateConnections(existingTiles);
  const openConnectors = existingResult.openConnectors;

  // Debug: show open connectors we're trying to satisfy
  if (existingTiles.length === 1) {
    console.log(`[BoxBuilder] Open connectors from first tile:`);
    for (const oc of openConnectors) {
      console.log(`  ${oc.edge} ${oc.pos} at (${oc.wx.toFixed(2)}, ${oc.wy.toFixed(2)}, ${oc.wz.toFixed(2)})`);
    }
    console.log(`[BoxBuilder] Looking for tile at pos (${pos.x}, ${pos.y}, ${pos.z}) ${pos.orientation}`);
  }

  // For each tile configuration, check if it works
  for (const tileId of pool) {
    for (const rotation of ROTATIONS) {
      for (const flipped of [false, true]) {
        const placement: Placement = {
          cell: { x: pos.x, y: pos.y, z: pos.z },
          orientation: pos.orientation,
          tileId,
          rotation,
          flipped
        };

        const newTile = toPlacedTile(placement);
        const newConnectors = getTileConnectors(newTile);

        // Skip tiles with no connectors
        if (newConnectors.length === 0) continue;

        // Check each connector on the new tile
        let valid = true;
        let hasAtLeastOneConnection = false;

        for (const nc of newConnectors) {
          // Find if there's an open connector at this position
          const matchingOpen = openConnectors.find(oc =>
            Math.abs(nc.wx - oc.wx) < 0.01 &&
            Math.abs(nc.wy - oc.wy) < 0.01 &&
            Math.abs(nc.wz - oc.wz) < 0.01
          );

          if (matchingOpen) {
            // There's an existing open connector here - check if positions match
            // For connectors to match: middle-middle, left-right, right-left
            const positionsMatch =
              (nc.pos === 'middle' && matchingOpen.pos === 'middle') ||
              (nc.pos === 'left' && matchingOpen.pos === 'right') ||
              (nc.pos === 'right' && matchingOpen.pos === 'left');

            if (!positionsMatch) {
              // Mismatch! This tile doesn't work
              valid = false;
              break;
            }
            hasAtLeastOneConnection = true;
          }
          // If no matching open connector, this connector will be open (fine for now)
        }

        // Also check: does the new tile leave any existing open connectors unsatisfied
        // where we COULD have satisfied them?
        // Actually, we just need to make sure we don't create mismatches.
        // Open connectors that aren't at our position are fine.

        if (valid && hasAtLeastOneConnection) {
          candidates.push(placement);
        }
      }
    }
  }

  return candidates;
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
