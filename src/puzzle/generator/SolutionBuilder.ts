// Solution Builder - generates valid pipe network solutions
//
// Strategy: Build lines of tiles (cap - straights - cap) or rectangular loops
// Uses the SAME rotation logic as the game's ConnectionValidator

import type { Solution, Placement, GenerationConfig } from '../types';
import { GENERATED_TILES } from '../../tiles/TileBuilder';
import type { TileConfig, ConnectorPos } from '../../tiles/TileBuilder';
import { validateConnections } from '../../game/ConnectionValidator';
import type { PlacedTile } from '../../tiles/types';

// Convert Placement to PlacedTile for validation
function placementToPlacedTile(p: Placement): PlacedTile {
  const definition = GENERATED_TILES.find(t => t.id === p.tileId);
  if (!definition) throw new Error(`Unknown tile: ${p.tileId}`);
  return {
    definition,
    position: p.cell,
    rotation: p.rotation,
    flipped: p.flipped,
    orientation: p.orientation
  };
}

// Validate a solution using the game's actual connection logic
function validateSolution(placements: Placement[]): boolean {
  try {
    const tiles = placements.map(placementToPlacedTile);
    const result = validateConnections(tiles);
    return result.valid;
  } catch {
    return false;
  }
}

// Connector position type
type ConnPos = 'left' | 'middle' | 'right';
type Edge = 'top' | 'right' | 'bottom' | 'left';

// Map from world direction to which original config edge faces that direction after rotation
// For counterclockwise rotation:
// - 0°:   top→top, right→right, bottom→bottom, left→left
// - 90°:  top→right, right→bottom, bottom→left, left→top
// - 180°: top→bottom, right→left, bottom→top, left→right
// - 270°: top→left, right→top, bottom→right, left→bottom
function getOriginalEdge(worldEdge: Edge, rotation: number): Edge {
  const edges: Edge[] = ['top', 'right', 'bottom', 'left'];
  const worldIdx = edges.indexOf(worldEdge);
  const steps = ((rotation / 90) % 4 + 4) % 4; // normalize to 0-3
  // Counterclockwise rotation: world edge N comes from original edge (N + steps) % 4
  const originalIdx = (worldIdx + steps) % 4;
  return edges[originalIdx];
}

// Get what's on a world-direction edge after applying rotation to a tile config
function getWorldEdgeConnector(config: TileConfig, worldEdge: Edge, rotation: number): ConnectorPos {
  const originalEdge = getOriginalEdge(worldEdge, rotation);
  return config[originalEdge];
}

// Get what's on a world-direction edge after applying rotation AND flip
// Flip mirrors the tile vertically, which swaps left↔right positions on top/bottom edges
// and swaps which edge is top vs bottom
function getWorldEdgeConnectorWithFlip(config: TileConfig, worldEdge: Edge, rotation: number, flipped: boolean): ConnectorPos {
  if (!flipped) {
    return getWorldEdgeConnector(config, worldEdge, rotation);
  }

  // When flipped, top↔bottom swap in world space, and positions on those edges mirror
  // For vertical edges (left/right), the edge stays but position mirrors
  let effectiveWorldEdge = worldEdge;
  if (worldEdge === 'top') effectiveWorldEdge = 'bottom';
  else if (worldEdge === 'bottom') effectiveWorldEdge = 'top';

  const pos = getWorldEdgeConnector(config, effectiveWorldEdge, rotation);
  if (pos === null) return null;

  // Flip mirrors positions: left↔right
  if (pos === 'left') return 'right';
  if (pos === 'right') return 'left';
  return 'middle';
}

// Get the matching connector position on the opposite edge in world space
// When adjacent tiles meet, positions mirror based on world coords:
// - right tile's 'left' position matches left tile's 'right' position
// - top tile's 'left' position matches bottom tile's 'right' position
// etc.
function getMirrorPos(pos: ConnPos): ConnPos {
  if (pos === 'left') return 'right';
  if (pos === 'right') return 'left';
  return 'middle';
}

// Build a horizontal line: [cap]→[straights]→[cap]
function buildLine(length: number, startX: number, startZ: number): Placement[] | null {
  if (length < 2) return null;

  const placements: Placement[] = [];
  let lastOutgoingPos: ConnPos | null = null;

  for (let i = 0; i < length; i++) {
    const x = startX + i;

    // Bounds check
    if (x < 0 || x > 9) return null;

    if (i === 0) {
      // Start cap: only RIGHT connector
      const startTile = findStartTile('right');
      if (!startTile) {
        console.log(`buildLine: no start tile`);
        return null;
      }
      placements.push({
        cell: { x, y: 0, z: startZ },
        orientation: 'flat',
        tileId: startTile.tileId,
        rotation: startTile.rotation as 0 | 90 | 180 | 270,
        flipped: startTile.flipped
      });
      lastOutgoingPos = startTile.outgoingPos;
    } else if (i === length - 1) {
      // End cap: only LEFT connector (must match previous tile's right)
      const inPos = getMirrorPos(lastOutgoingPos!);
      const tile = findTileWithIncoming('left', inPos, null);
      if (!tile) {
        console.log(`buildLine: no end cap for left:${inPos}`);
        return null;
      }
      placements.push({
        cell: { x, y: 0, z: startZ },
        orientation: 'flat',
        tileId: tile.tileId,
        rotation: tile.rotation as 0 | 90 | 180 | 270,
        flipped: tile.flipped
      });
    } else {
      // Straight: LEFT (incoming) and RIGHT (outgoing) connectors
      const inPos = getMirrorPos(lastOutgoingPos!);
      const tile = findTileWithIncoming('left', inPos, 'right');
      if (!tile) {
        console.log(`buildLine: no straight for left:${inPos} -> right`);
        return null;
      }
      placements.push({
        cell: { x, y: 0, z: startZ },
        orientation: 'flat',
        tileId: tile.tileId,
        rotation: tile.rotation as 0 | 90 | 180 | 270,
        flipped: tile.flipped
      });
      lastOutgoingPos = tile.outgoingPos;
    }
  }

  return placements;
}

// Build a vertical line: [cap]↓[straights]↓[cap]
function buildVerticalLine(length: number, startX: number, startZ: number): Placement[] | null {
  if (length < 2) return null;

  const placements: Placement[] = [];
  let lastOutgoingPos: ConnPos | null = null;

  for (let i = 0; i < length; i++) {
    const z = startZ + i;

    // Bounds check
    if (z < 0 || z > 9) return null;

    if (i === 0) {
      // Start cap: only BOTTOM connector
      const startTile = findStartTile('bottom');
      if (!startTile) {
        console.log(`buildVerticalLine: no start tile`);
        return null;
      }
      placements.push({
        cell: { x: startX, y: 0, z },
        orientation: 'flat',
        tileId: startTile.tileId,
        rotation: startTile.rotation as 0 | 90 | 180 | 270,
        flipped: startTile.flipped
      });
      lastOutgoingPos = startTile.outgoingPos;
    } else if (i === length - 1) {
      // End cap: only TOP connector (must match previous tile's bottom)
      const inPos = getMirrorPos(lastOutgoingPos!);
      const tile = findTileWithIncoming('top', inPos, null);
      if (!tile) {
        console.log(`buildVerticalLine: no end cap for top:${inPos}`);
        return null;
      }
      placements.push({
        cell: { x: startX, y: 0, z },
        orientation: 'flat',
        tileId: tile.tileId,
        rotation: tile.rotation as 0 | 90 | 180 | 270,
        flipped: tile.flipped
      });
    } else {
      // Straight: TOP (incoming) and BOTTOM (outgoing) connectors
      const inPos = getMirrorPos(lastOutgoingPos!);
      const tile = findTileWithIncoming('top', inPos, 'bottom');
      if (!tile) {
        console.log(`buildVerticalLine: no straight for top:${inPos} -> bottom`);
        return null;
      }
      placements.push({
        cell: { x: startX, y: 0, z },
        orientation: 'flat',
        tileId: tile.tileId,
        rotation: tile.rotation as 0 | 90 | 180 | 270,
        flipped: tile.flipped
      });
      lastOutgoingPos = tile.outgoingPos;
    }
  }

  return placements;
}

// Find a tile with exactly two connectors on specified world edges (for corners/straights in loops)
// Tries both flipped and non-flipped variants
function findTileWithTwoConnectors(
  worldEdge1: Edge,
  edge1Pos: ConnPos | null, // null = any position
  worldEdge2: Edge,
  edge2Pos: ConnPos | null  // null = any position
): { tileId: string; rotation: number; flipped: boolean; pos1: ConnPos; pos2: ConnPos } | null {
  const shuffled = [...GENERATED_TILES].sort(() => Math.random() - 0.5);
  const rotations = [0, 90, 180, 270].sort(() => Math.random() - 0.5);
  const flips = [false, true].sort(() => Math.random() - 0.5);
  const allEdges: Edge[] = ['top', 'right', 'bottom', 'left'];

  for (const tile of shuffled) {
    for (const rotation of rotations) {
      for (const flipped of flips) {
        // Get connectors on world edges
        const pos1 = getWorldEdgeConnectorWithFlip(tile.config, worldEdge1, rotation, flipped);
        const pos2 = getWorldEdgeConnectorWithFlip(tile.config, worldEdge2, rotation, flipped);

        // Must have connectors on both world edges
        if (pos1 === null) continue;
        if (pos2 === null) continue;

        // Check positions if specified
        if (edge1Pos !== null && pos1 !== edge1Pos) continue;
        if (edge2Pos !== null && pos2 !== edge2Pos) continue;

        // Must NOT have connectors on other world edges
        let valid = true;
        for (const worldEdge of allEdges) {
          if (worldEdge === worldEdge1 || worldEdge === worldEdge2) continue;
          if (getWorldEdgeConnectorWithFlip(tile.config, worldEdge, rotation, flipped) !== null) {
            valid = false;
            break;
          }
        }

        if (valid) {
          return {
            tileId: tile.id,
            rotation,
            flipped,
            pos1: pos1 as ConnPos,
            pos2: pos2 as ConnPos
          };
        }
      }
    }
  }

  return null;
}

// Build a rectangular loop (perimeter = 2w + 2h - 4 tiles)
function buildRectangle(width: number, height: number, startX: number, startZ: number): Placement[] | null {
  if (width < 2 || height < 2) return null;

  // Check bounds
  if (startX + width - 1 > 9 || startZ + height - 1 > 9) return null;
  if (startX < 0 || startZ < 0) return null;

  const placements: Placement[] = [];

  // Build path clockwise: top-left → right along top → down right side → left along bottom → up left side
  // Path structure: each element has the edges that connect to previous/next tiles
  type PathStep = {
    x: number;
    z: number;
    inEdge: 'top' | 'right' | 'bottom' | 'left'; // edge connecting to previous
    outEdge: 'top' | 'right' | 'bottom' | 'left'; // edge connecting to next
  };

  const path: PathStep[] = [];

  // Top edge (left to right)
  for (let i = 0; i < width; i++) {
    const x = startX + i;
    const z = startZ;
    if (i === 0) {
      // Top-left corner: incoming from bottom (last tile wraps), outgoing right
      path.push({ x, z, inEdge: 'bottom', outEdge: 'right' });
    } else if (i === width - 1) {
      // Top-right corner: incoming left, outgoing bottom
      path.push({ x, z, inEdge: 'left', outEdge: 'bottom' });
    } else {
      // Top edge straight: incoming left, outgoing right
      path.push({ x, z, inEdge: 'left', outEdge: 'right' });
    }
  }

  // Right edge (top to bottom, skip corners already added)
  for (let i = 1; i < height - 1; i++) {
    const x = startX + width - 1;
    const z = startZ + i;
    // Right edge straight: incoming top, outgoing bottom
    path.push({ x, z, inEdge: 'top', outEdge: 'bottom' });
  }

  // Bottom-right corner
  if (height > 1) {
    const x = startX + width - 1;
    const z = startZ + height - 1;
    path.push({ x, z, inEdge: 'top', outEdge: 'left' });
  }

  // Bottom edge (right to left, skip corners)
  for (let i = width - 2; i >= 1; i--) {
    const x = startX + i;
    const z = startZ + height - 1;
    // Bottom edge straight: incoming right, outgoing left
    path.push({ x, z, inEdge: 'right', outEdge: 'left' });
  }

  // Bottom-left corner
  if (width > 1 && height > 1) {
    const x = startX;
    const z = startZ + height - 1;
    path.push({ x, z, inEdge: 'right', outEdge: 'top' });
  }

  // Left edge (bottom to top, skip corners)
  for (let i = height - 2; i >= 1; i--) {
    const x = startX;
    const z = startZ + i;
    // Left edge straight: incoming bottom, outgoing top
    path.push({ x, z, inEdge: 'bottom', outEdge: 'top' });
  }

  if (path.length === 0) return null;

  // Now find tiles with proper connector positions
  // Track the position that each tile outputs on its outEdge
  const outgoingPositions: ConnPos[] = [];

  for (let i = 0; i < path.length; i++) {
    const step = path[i];
    const prevIdx = (i - 1 + path.length) % path.length;

    let inPos: ConnPos | null = null;
    if (i > 0) {
      // Previous tile's outgoing position → this tile's incoming position (mirrored)
      inPos = getMirrorPos(outgoingPositions[prevIdx]);
    }
    // For the first tile, we don't know inPos yet (it depends on the last tile)
    // We'll pick any tile and then verify the loop closes

    const tile = findTileWithTwoConnectors(step.inEdge, inPos, step.outEdge, null);
    if (!tile) {
      console.log(`buildRectangle: no tile at ${i} for ${step.inEdge}:${inPos} -> ${step.outEdge}`);
      return null;
    }

    placements.push({
      cell: { x: step.x, y: 0, z: step.z },
      orientation: 'flat',
      tileId: tile.tileId,
      rotation: tile.rotation as 0 | 90 | 180 | 270,
      flipped: tile.flipped
    });

    outgoingPositions.push(tile.pos2); // pos2 is the outEdge position
  }

  // Verify the loop closes: last tile's outgoing should match first tile's incoming
  const lastOutPos = outgoingPositions[outgoingPositions.length - 1];
  const firstInPos = getMirrorPos(lastOutPos);

  // Get the first tile's config to check its incoming world edge position
  const firstTile = GENERATED_TILES.find(t => t.id === placements[0].tileId)!;
  const firstInWorldEdge = path[0].inEdge;
  const firstActualInPos = getWorldEdgeConnectorWithFlip(firstTile.config, firstInWorldEdge, placements[0].rotation, placements[0].flipped) as ConnPos;

  if (firstActualInPos !== firstInPos) {
    // Loop doesn't close - try to rebuild with different first tile
    console.log(`buildRectangle: loop doesn't close (${firstActualInPos} vs ${firstInPos}), retrying`);
    return null;
  }

  return placements;
}

// Find a tile that has a specific incoming position and ANY outgoing position
// Returns the tile AND the actual outgoing position it has
// Tries both flipped and non-flipped variants to find matching positions
function findTileWithIncoming(
  incomingWorldEdge: Edge,
  incomingPos: ConnPos,
  outgoingWorldEdge: Edge | null
): { tileId: string; rotation: number; flipped: boolean; outgoingPos: ConnPos | null } | null {
  const shuffled = [...GENERATED_TILES].sort(() => Math.random() - 0.5);
  const rotations = [0, 90, 180, 270].sort(() => Math.random() - 0.5);
  const flips = [false, true].sort(() => Math.random() - 0.5);
  const allEdges: Edge[] = ['top', 'right', 'bottom', 'left'];

  for (const tile of shuffled) {
    for (const rotation of rotations) {
      for (const flipped of flips) {
        // Check incoming world edge has the right position
        const inPos = getWorldEdgeConnectorWithFlip(tile.config, incomingWorldEdge, rotation, flipped);
        if (inPos !== incomingPos) continue;

        // Check outgoing edge
        let outPos: ConnectorPos = null;
        if (outgoingWorldEdge !== null) {
          outPos = getWorldEdgeConnectorWithFlip(tile.config, outgoingWorldEdge, rotation, flipped);
          if (outPos === null) continue;
        }

        // Check other world edges are closed (no connectors)
        let valid = true;
        for (const worldEdge of allEdges) {
          if (worldEdge === incomingWorldEdge) continue;
          if (worldEdge === outgoingWorldEdge) continue;
          if (getWorldEdgeConnectorWithFlip(tile.config, worldEdge, rotation, flipped) !== null) {
            valid = false;
            break;
          }
        }

        if (valid) {
          console.log(`findTileWithIncoming: found ${tile.name} rot=${rotation} flip=${flipped} inPos=${inPos} outPos=${outPos}`);
          return { tileId: tile.id, rotation, flipped, outgoingPos: outPos as ConnPos | null };
        }
      }
    }
  }

  return null;
}

// Find a start tile (only outgoing connector, no incoming)
// Tries both flipped and non-flipped variants
function findStartTile(
  outgoingWorldEdge: Edge
): { tileId: string; rotation: number; flipped: boolean; outgoingPos: ConnPos } | null {
  const shuffled = [...GENERATED_TILES].sort(() => Math.random() - 0.5);
  const rotations = [0, 90, 180, 270].sort(() => Math.random() - 0.5);
  const flips = [false, true].sort(() => Math.random() - 0.5);
  const allEdges: Edge[] = ['top', 'right', 'bottom', 'left'];

  for (const tile of shuffled) {
    for (const rotation of rotations) {
      for (const flipped of flips) {
        // Check: must have connector on outgoing world edge
        const outPos = getWorldEdgeConnectorWithFlip(tile.config, outgoingWorldEdge, rotation, flipped);
        if (outPos === null) continue;

        // Check: all other world edges must be closed
        let valid = true;
        for (const worldEdge of allEdges) {
          if (worldEdge === outgoingWorldEdge) continue;
          if (getWorldEdgeConnectorWithFlip(tile.config, worldEdge, rotation, flipped) !== null) {
            valid = false;
            break;
          }
        }

        if (valid) {
          console.log(`findStartTile: found ${tile.name} rot=${rotation} flip=${flipped} outPos=${outPos}`);
          return { tileId: tile.id, rotation, flipped, outgoingPos: outPos as ConnPos };
        }
      }
    }
  }

  return null;
}

// Build a random snake/zigzag path with proper connector matching
function buildSnake(length: number, startX: number, startZ: number): Placement[] | null {
  if (length < 2) return null;

  const placements: Placement[] = [];
  const occupied = new Set<string>();

  let x = startX;
  let z = startZ;
  let lastDir: 'right' | 'left' | 'down' | 'up' | null = null;

  // First pass: determine the path and directions
  const path: Array<{
    x: number;
    z: number;
    fromDir: 'right' | 'left' | 'down' | 'up' | null;
    toDir: 'right' | 'left' | 'down' | 'up' | null;
  }> = [];

  for (let i = 0; i < length; i++) {
    if (x < 0 || x > 9 || z < 0 || z > 9) return null;
    if (occupied.has(`${x},${z}`)) return null;
    occupied.add(`${x},${z}`);

    const fromDir = lastDir;
    let toDir: 'right' | 'left' | 'down' | 'up' | null = null;

    if (i < length - 1) {
      // Get valid directions
      const dirs: Array<'right' | 'left' | 'down' | 'up'> = [];
      if (lastDir !== 'left' && x + 1 <= 9 && !occupied.has(`${x + 1},${z}`)) dirs.push('right');
      if (lastDir !== 'right' && x - 1 >= 0 && !occupied.has(`${x - 1},${z}`)) dirs.push('left');
      if (lastDir !== 'up' && z + 1 <= 9 && !occupied.has(`${x},${z + 1}`)) dirs.push('down');
      if (lastDir !== 'down' && z - 1 >= 0 && !occupied.has(`${x},${z - 1}`)) dirs.push('up');

      if (dirs.length === 0) return null;
      toDir = dirs[Math.floor(Math.random() * dirs.length)];
    }

    path.push({ x, z, fromDir, toDir });

    if (toDir) {
      if (toDir === 'right') x++;
      else if (toDir === 'left') x--;
      else if (toDir === 'down') z++;
      else if (toDir === 'up') z--;
      lastDir = toDir;
    }
  }

  // Map direction to edge
  const dirToOutgoing = (dir: 'right' | 'left' | 'down' | 'up'): 'top' | 'right' | 'bottom' | 'left' => {
    if (dir === 'right') return 'right';
    if (dir === 'left') return 'left';
    if (dir === 'down') return 'bottom';
    return 'top';
  };

  const dirToIncoming = (dir: 'right' | 'left' | 'down' | 'up'): 'top' | 'right' | 'bottom' | 'left' => {
    // If we came FROM the right, we enter on our LEFT
    if (dir === 'right') return 'left';
    if (dir === 'left') return 'right';
    if (dir === 'down') return 'top';
    return 'bottom';
  };

  // Second pass: find tiles with proper connector positions
  let lastOutgoingPos: ConnPos | null = null;

  for (let i = 0; i < path.length; i++) {
    const p = path[i];

    if (i === 0) {
      // First tile: no incoming, just outgoing
      if (p.toDir === null) return null; // Single tile path, shouldn't happen
      const outEdge = dirToOutgoing(p.toDir);
      const startTile = findStartTile(outEdge);
      if (!startTile) {
        console.log(`buildSnake: no start tile for outgoing edge ${outEdge}`);
        return null;
      }
      placements.push({
        cell: { x: p.x, y: 0, z: p.z },
        orientation: 'flat',
        tileId: startTile.tileId,
        rotation: startTile.rotation as 0 | 90 | 180 | 270,
        flipped: startTile.flipped
      });
      lastOutgoingPos = startTile.outgoingPos;
    } else {
      // Middle or end tile: has incoming from previous
      if (p.fromDir === null || lastOutgoingPos === null) return null;

      const inEdge = dirToIncoming(p.fromDir);
      const inPos = getMirrorPos(lastOutgoingPos);
      const outEdge = p.toDir !== null ? dirToOutgoing(p.toDir) : null;

      const tile = findTileWithIncoming(inEdge, inPos, outEdge);
      if (!tile) {
        console.log(`buildSnake: no tile at ${i} for in=${inEdge}:${inPos}, out=${outEdge}`);
        return null;
      }

      placements.push({
        cell: { x: p.x, y: 0, z: p.z },
        orientation: 'flat',
        tileId: tile.tileId,
        rotation: tile.rotation as 0 | 90 | 180 | 270,
        flipped: tile.flipped
      });
      lastOutgoingPos = tile.outgoingPos;
    }
  }

  return placements;
}

// Main entry point
export function buildSolution(config: GenerationConfig): Solution | null {
  const minSize = config.size.min;
  const maxSize = config.size.max;

  // Generate random starting position (leave room for puzzle)
  const startX = Math.floor(Math.random() * 5) + 2; // 2-6
  const startZ = Math.floor(Math.random() * 5) + 2; // 2-6

  // Collect valid configurations for our size range
  const options: Array<{ type: 'line' | 'vline' | 'rect' | 'snake'; params: number[] }> = [];

  // Snakes - random walk, works for any size
  for (let len = minSize; len <= maxSize; len++) {
    options.push({ type: 'snake', params: [len] });
    options.push({ type: 'snake', params: [len] }); // Add twice for more variety
  }

  // Lines (horizontal) - only for sizes that fit
  for (let len = minSize; len <= Math.min(maxSize, 10); len++) {
    if (startX + len - 1 <= 9) {
      options.push({ type: 'line', params: [len] });
    }
  }

  // Lines (vertical) - only for sizes that fit
  for (let len = minSize; len <= Math.min(maxSize, 10); len++) {
    if (startZ + len - 1 <= 9) {
      options.push({ type: 'vline', params: [len] });
    }
  }

  // Rectangles (perimeter = 2w + 2h - 4) - only even sizes
  for (let w = 2; w <= 6; w++) {
    for (let h = 2; h <= 6; h++) {
      const size = 2 * w + 2 * h - 4;
      if (size >= minSize && size <= maxSize) {
        if (startX + w - 1 <= 9 && startZ + h - 1 <= 9) {
          options.push({ type: 'rect', params: [w, h] });
        }
      }
    }
  }

  if (options.length === 0) {
    console.log('buildSolution: no valid options for size', minSize, '-', maxSize);
    return null;
  }

  // Shuffle and try each option
  options.sort(() => Math.random() - 0.5);

  for (const opt of options) {
    let placements: Placement[] | null = null;

    if (opt.type === 'line') {
      placements = buildLine(opt.params[0], startX, startZ);
    } else if (opt.type === 'vline') {
      placements = buildVerticalLine(opt.params[0], startX, startZ);
    } else if (opt.type === 'rect') {
      placements = buildRectangle(opt.params[0], opt.params[1], startX, startZ);
    } else if (opt.type === 'snake') {
      placements = buildSnake(opt.params[0], startX, startZ);
    }

    if (placements && placements.length >= minSize && placements.length <= maxSize) {
      // Validate using the game's actual connection logic
      if (validateSolution(placements)) {
        console.log(`buildSolution: ${opt.type} succeeded with ${placements.length} tiles at (${startX},${startZ})`);
        return { placements };
      } else {
        console.log(`buildSolution: ${opt.type} built ${placements.length} tiles but validation failed`);
      }
    }
  }

  console.log('buildSolution: all options failed');
  return null;
}

// Build multiple solutions (for variety)
export function buildSolutions(config: GenerationConfig, count: number): Solution[] {
  const solutions: Solution[] = [];
  const maxAttempts = count * 5;

  for (let i = 0; i < maxAttempts && solutions.length < count; i++) {
    const solution = buildSolution(config);
    if (solution) {
      solutions.push(solution);
    }
  }

  return solutions;
}
