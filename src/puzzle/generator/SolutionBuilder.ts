// Solution Builder - generates valid pipe network solutions via random walk

import type {
  Solution,
  Placement,
  GenerationConfig,
  Vec3,
  Orientation,
  TileVariant,
  LocalConnector
} from '../types';
import { getTileRecords, getVariant, getTileVariants, getAllTileIds } from '../precompute';

// Random number utilities
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Open connector - a connector that needs to be matched
interface OpenConnector {
  cell: Vec3;
  orientation: Orientation;
  connector: LocalConnector;
  worldPos: Vec3;  // Absolute world position
}

// Builder state
interface BuilderState {
  placements: Placement[];
  placedCells: Set<string>;  // "x,y,z,orientation"
  openConnectors: OpenConnector[];
  usedTiles: Map<string, number>;  // tileId -> count used
  config: GenerationConfig;
}

// Get world position of a connector
function getConnectorWorldPos(cell: Vec3, connector: LocalConnector): Vec3 {
  return {
    x: cell.x + connector.worldOffset.x,
    y: cell.y + connector.worldOffset.y,
    z: cell.z + connector.worldOffset.z
  };
}

// Check if a position is within grid bounds (0-9 for x,z, 0-4 for y)
function isValidPosition(pos: Vec3, config: GenerationConfig): boolean {
  if (pos.x < 0 || pos.x > 9) return false;
  if (pos.z < 0 || pos.z > 9) return false;
  if (pos.y < 0) return false;
  if (pos.y > (config.maxHeight ?? 4)) return false;
  if (!config.allow3D && pos.y > 0) return false;
  return true;
}

// Check if an orientation is allowed by config
function isOrientationAllowed(orientation: Orientation, config: GenerationConfig): boolean {
  if (!config.allow3D && orientation !== 'flat') return false;
  return true;
}

// Check if a cell/orientation slot is occupied
function isOccupied(state: BuilderState, cell: Vec3, orientation: Orientation): boolean {
  return state.placedCells.has(`${cell.x},${cell.y},${cell.z},${orientation}`);
}

// Add a placement to the state
function addPlacement(state: BuilderState, placement: Placement, variant: TileVariant): void {
  state.placements.push(placement);
  state.placedCells.add(`${placement.cell.x},${placement.cell.y},${placement.cell.z},${placement.orientation}`);

  // Update used tiles count
  const count = state.usedTiles.get(placement.tileId) ?? 0;
  state.usedTiles.set(placement.tileId, count + 1);

  // Update open connectors
  // First, remove any connectors that match this placement's connectors
  const newConnectors: OpenConnector[] = [];

  for (const conn of variant.connectors) {
    const worldPos = getConnectorWorldPos(placement.cell, conn);
    newConnectors.push({
      cell: placement.cell,
      orientation: placement.orientation,
      connector: conn,
      worldPos
    });
  }

  // Check for matching connectors
  const tolerance = 0.01;
  const remainingOpen: OpenConnector[] = [];
  const matchedNew = new Set<number>();

  for (const existing of state.openConnectors) {
    let matched = false;
    for (let i = 0; i < newConnectors.length; i++) {
      if (matchedNew.has(i)) continue;

      const newConn = newConnectors[i];
      if (
        Math.abs(existing.worldPos.x - newConn.worldPos.x) < tolerance &&
        Math.abs(existing.worldPos.y - newConn.worldPos.y) < tolerance &&
        Math.abs(existing.worldPos.z - newConn.worldPos.z) < tolerance
      ) {
        matched = true;
        matchedNew.add(i);
        break;
      }
    }

    if (!matched) {
      remainingOpen.push(existing);
    }
  }

  // Add unmatched new connectors to open list
  for (let i = 0; i < newConnectors.length; i++) {
    if (!matchedNew.has(i)) {
      remainingOpen.push(newConnectors[i]);
    }
  }

  state.openConnectors = remainingOpen;
}

// Find cell position that would place a connector at a target world position
function findCellForConnector(connector: LocalConnector, targetWorldPos: Vec3): Vec3 {
  return {
    x: targetWorldPos.x - connector.worldOffset.x,
    y: targetWorldPos.y - connector.worldOffset.y,
    z: targetWorldPos.z - connector.worldOffset.z
  };
}

// Check if a cell position is valid (integer coordinates within bounds)
function isValidCell(cell: Vec3, config: GenerationConfig): boolean {
  // Cell coordinates should be integers
  if (Math.abs(cell.x - Math.round(cell.x)) > 0.01) return false;
  if (Math.abs(cell.y - Math.round(cell.y)) > 0.01) return false;
  if (Math.abs(cell.z - Math.round(cell.z)) > 0.01) return false;

  const rounded: Vec3 = {
    x: Math.round(cell.x),
    y: Math.round(cell.y),
    z: Math.round(cell.z)
  };

  return isValidPosition(rounded, config);
}

// Find tiles that can connect to an open connector
function findMatchingTiles(
  state: BuilderState,
  openConn: OpenConnector,
  config: GenerationConfig
): Array<{ placement: Placement; variant: TileVariant }> {
  const results: Array<{ placement: Placement; variant: TileVariant }> = [];
  const tilePool = config.tilePool ?? getAllTileIds();

  for (const tileId of tilePool) {
    const variants = getTileVariants(tileId);

    for (const variant of variants) {
      // Skip orientations not allowed by config
      if (!isOrientationAllowed(variant.orientation, config)) continue;

      // Check each connector in this variant
      for (const conn of variant.connectors) {
        // What cell would place this connector at the target position?
        const cell = findCellForConnector(conn, openConn.worldPos);

        if (!isValidCell(cell, config)) continue;

        const roundedCell: Vec3 = {
          x: Math.round(cell.x),
          y: Math.round(cell.y),
          z: Math.round(cell.z)
        };

        // Check if slot is already occupied
        if (isOccupied(state, roundedCell, variant.orientation)) continue;

        // Check support rules for non-ground tiles
        if (!checkSupportRules(state, roundedCell, variant.orientation)) continue;

        const placement: Placement = {
          cell: roundedCell,
          orientation: variant.orientation,
          tileId: variant.tileId,
          rotation: variant.rotation,
          flipped: variant.flipped
        };

        results.push({ placement, variant });
      }
    }
  }

  return results;
}

// Check support rules
function checkSupportRules(state: BuilderState, cell: Vec3, orientation: Orientation): boolean {
  if (cell.y === 0) return true;  // Ground level always OK

  if (orientation === 'flat') {
    // Flat tiles above ground need vertical support
    // Simplified: just require at least one vertical tile below
    // Full rule: need 2+ vertical supports at corners/edges
    return true;  // Relaxed for generation, will be validated later
  }

  if (orientation === 'vertical-x' || orientation === 'vertical-z') {
    // Vertical tiles need flat tile at y-1
    const key = `${cell.x},${cell.y - 1},${cell.z},flat`;
    return state.placedCells.has(key);
  }

  return true;
}

// Select a tile weighted by preferences - prioritize closing connectors
function selectTileWeighted(
  candidates: Array<{ placement: Placement; variant: TileVariant }>,
  state: BuilderState,
  _config: GenerationConfig
): { placement: Placement; variant: TileVariant } | null {
  if (candidates.length === 0) return null;

  const tolerance = 0.01;

  // Score candidates by how many existing open connectors they close
  const scored = candidates.map(c => {
    let closesCount = 0;
    let newOpenCount = 0;

    for (const conn of c.variant.connectors) {
      const worldPos = getConnectorWorldPos(c.placement.cell, conn);
      let matchesOpen = false;
      for (const openConn of state.openConnectors) {
        if (
          Math.abs(worldPos.x - openConn.worldPos.x) < tolerance &&
          Math.abs(worldPos.y - openConn.worldPos.y) < tolerance &&
          Math.abs(worldPos.z - openConn.worldPos.z) < tolerance
        ) {
          matchesOpen = true;
          closesCount++;
          break;
        }
      }
      if (!matchesOpen) {
        newOpenCount++;
      }
    }

    // Net impact: positive = closes more than opens, good for closing loops
    const netClose = closesCount - newOpenCount;
    return { candidate: c, closesCount, newOpenCount, netClose };
  });

  // Weight: heavily prefer tiles that close connectors
  const weights: number[] = scored.map(s => {
    let weight = 1.0;

    // Big bonus for closing existing connectors
    weight += s.closesCount * 3;

    // Bonus for net positive closing (forms loops)
    if (s.netClose > 0) weight += s.netClose * 2;

    // Small penalty for creating many new opens
    weight = Math.max(0.1, weight - s.newOpenCount * 0.3);

    // Variety bonus
    const used = state.usedTiles.get(s.candidate.placement.tileId) ?? 0;
    weight /= (used + 1);

    return weight;
  });

  // Weighted random selection
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * totalWeight;

  for (let i = 0; i < scored.length; i++) {
    r -= weights[i];
    if (r <= 0) return scored[i].candidate;
  }

  return scored[scored.length - 1].candidate;
}

// Build a solution via random walk
export function buildSolution(config: GenerationConfig): Solution | null {
  // KEY INSIGHT: Closed loops on a grid MUST have EVEN number of tiles!
  // (You go right as many times as left, up as many as down)
  // So we adjust the target to be even for better success.

  // First, try the loop generator for even sizes (most reliable)
  const loopResult = tryBuildLoop(config);
  if (loopResult) {
    console.log(`buildSolution (loop) succeeded with ${loopResult.placements.length} tiles`);
    return loopResult;
  }

  // Fallback: try random walk (less reliable, but might work for complex configs)
  const maxAttempts = 100;
  let stats = { notClosed: 0, tooSmall: 0 };

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Prefer even target sizes (more likely to close)
    let targetSize = randomInt(config.size.min, config.size.max);
    if (targetSize % 2 !== 0 && targetSize < config.size.max) {
      targetSize++;  // Round up to even
    }

    const result = tryBuildSolution(config, targetSize);
    if (!result) {
      stats.notClosed++;
      continue;
    }
    if (result.placements.length < config.size.min) {
      stats.tooSmall++;
      continue;
    }
    console.log(`buildSolution (random) succeeded after ${attempt + 1} attempts`, stats);
    return result;
  }

  console.log(`buildSolution failed after ${maxAttempts} attempts:`, stats);
  return null;
}

// Try to build a loop of the target size
function tryBuildLoop(config: GenerationConfig): Solution | null {
  const targetMin = config.size.min;
  const targetMax = config.size.max;

  // Collect all possible loop configurations
  const loopConfigs: Array<{type: string, params: number[], size: number}> = [];

  // Rectangular loops: perimeter = 2*w + 2*h - 4
  for (let w = 2; w <= 5; w++) {
    for (let h = 2; h <= 5; h++) {
      const size = 2 * w + 2 * h - 4;
      if (size >= targetMin && size <= targetMax) {
        loopConfigs.push({type: 'rect', params: [w, h], size});
      }
    }
  }

  // For odd sizes, use "line" structure: cap - straights - cap
  // Line of length N needs N tiles total
  for (let len = targetMin; len <= targetMax; len++) {
    if (len >= 2) {
      loopConfigs.push({type: 'line', params: [len], size: len});
    }
  }

  // Shuffle and try each
  loopConfigs.sort(() => Math.random() - 0.5);

  for (const cfg of loopConfigs) {
    let result: Solution | null = null;
    if (cfg.type === 'rect') {
      result = buildRectangularLoop(config, cfg.params[0], cfg.params[1]);
    } else if (cfg.type === 'line') {
      result = buildLineSolution(config, cfg.params[0]);
    }
    if (result) return result;
  }

  return null;
}

// Build a line solution: cap - straights - cap
function buildLineSolution(config: GenerationConfig, length: number): Solution | null {
  if (length < 2) return null;

  const startX = 4;
  const startZ = 5;
  const placements: Placement[] = [];
  const tilePool = config.tilePool ?? getAllTileIds();

  for (let i = 0; i < length; i++) {
    const cell: Vec3 = {x: startX + i, y: 0, z: startZ};
    const isStart = i === 0;
    const isEnd = i === length - 1;

    let needs: {top: boolean, right: boolean, bottom: boolean, left: boolean};

    if (isStart) {
      // Start cap: only connect to the right
      needs = {top: false, right: true, bottom: false, left: false};
    } else if (isEnd) {
      // End cap: only connect to the left
      needs = {top: false, right: false, bottom: false, left: true};
    } else {
      // Middle: straight piece connecting left and right
      needs = {top: false, right: true, bottom: false, left: true};
    }

    const matchingTile = findTileForLoop(tilePool, needs, config);
    if (!matchingTile) {
      return null;
    }

    placements.push({
      cell,
      orientation: 'flat',
      tileId: matchingTile.tileId,
      rotation: matchingTile.rotation as 0 | 90 | 180 | 270,
      flipped: matchingTile.flipped
    });
  }

  return { placements };
}

// Build a closed rectangular loop
function buildRectangularLoop(config: GenerationConfig, width: number, height: number): Solution | null {
  // Create the path of cells around the rectangle perimeter
  // Starting from top-left, going clockwise
  const startX = 4;  // Start near center of grid
  const startZ = 4;
  const path: Vec3[] = [];

  // Top edge (left to right)
  for (let x = 0; x < width; x++) {
    path.push({x: startX + x, y: 0, z: startZ});
  }
  // Right edge (top to bottom, skip first as it's the corner)
  for (let z = 1; z < height; z++) {
    path.push({x: startX + width - 1, y: 0, z: startZ + z});
  }
  // Bottom edge (right to left, skip first as it's the corner)
  for (let x = width - 2; x >= 0; x--) {
    path.push({x: startX + x, y: 0, z: startZ + height - 1});
  }
  // Left edge (bottom to top, skip first and last as they're corners)
  for (let z = height - 2; z >= 1; z--) {
    path.push({x: startX, y: 0, z: startZ + z});
  }

  // Now find tiles for each position in the path
  // Each cell needs to connect to previous and next cell in the loop
  const placements: Placement[] = [];
  const tilePool = config.tilePool ?? getAllTileIds();

  for (let i = 0; i < path.length; i++) {
    const cell = path[i];
    const prevCell = path[(i - 1 + path.length) % path.length];
    const nextCell = path[(i + 1) % path.length];

    // Determine what edges need connectors
    const needsConnector: {top: boolean, right: boolean, bottom: boolean, left: boolean} = {
      top: false, right: false, bottom: false, left: false
    };

    // Check prev direction
    if (prevCell.x < cell.x) needsConnector.left = true;
    else if (prevCell.x > cell.x) needsConnector.right = true;
    else if (prevCell.z < cell.z) needsConnector.top = true;
    else if (prevCell.z > cell.z) needsConnector.bottom = true;

    // Check next direction
    if (nextCell.x < cell.x) needsConnector.left = true;
    else if (nextCell.x > cell.x) needsConnector.right = true;
    else if (nextCell.z < cell.z) needsConnector.top = true;
    else if (nextCell.z > cell.z) needsConnector.bottom = true;

    // Find a tile variant that has connectors on exactly these edges
    const matchingTile = findTileForLoop(tilePool, needsConnector, config);
    if (!matchingTile) {
      return null;  // Can't find a tile for this position
    }

    placements.push({
      cell,
      orientation: 'flat',
      tileId: matchingTile.tileId,
      rotation: matchingTile.rotation as 0 | 90 | 180 | 270,
      flipped: matchingTile.flipped
    });
  }

  return { placements };
}

// Find a tile that connects on the required edges with MATCHING positions
function findTileForLoop(
  tilePool: string[],
  needs: {top: boolean, right: boolean, bottom: boolean, left: boolean},
  _config: GenerationConfig
): {tileId: string, rotation: number, flipped: boolean} | null {
  const records = getTileRecords();

  // Shuffle tile pool for variety
  const shuffled = [...tilePool].sort(() => Math.random() - 0.5);

  for (const tileId of shuffled) {
    const rec = records.get(tileId);
    if (!rec) continue;

    // Try all rotations
    for (let rotation = 0; rotation < 360; rotation += 90) {
      for (const flipped of [false, true]) {
        // Get the effective config after rotation/flip
        const effConfig = getEffectiveConfig(rec.config, rotation, flipped);

        // Check if this config has connectors where needed and NOT where not needed
        // IMPORTANT: Only accept 'mid' position connectors - they always match!
        const hasTop = effConfig.top === 'mid';
        const hasRight = effConfig.right === 'mid';
        const hasBottom = effConfig.bottom === 'mid';
        const hasLeft = effConfig.left === 'mid';

        // Also check for any connector (for "no connector needed" check)
        const hasAnyTop = effConfig.top !== null;
        const hasAnyRight = effConfig.right !== null;
        const hasAnyBottom = effConfig.bottom !== null;
        const hasAnyLeft = effConfig.left !== null;

        // Must have 'mid' connector on required edges
        if (needs.top && !hasTop) continue;
        if (needs.right && !hasRight) continue;
        if (needs.bottom && !hasBottom) continue;
        if (needs.left && !hasLeft) continue;

        // Must NOT have ANY connector on non-required edges
        if (!needs.top && hasAnyTop) continue;
        if (!needs.right && hasAnyRight) continue;
        if (!needs.bottom && hasAnyBottom) continue;
        if (!needs.left && hasAnyLeft) continue;

        // Found a match!
        return {tileId, rotation, flipped};
      }
    }
  }

  return null;
}

// Get tile config after rotation and flip
function getEffectiveConfig(
  config: {top: string | null, right: string | null, bottom: string | null, left: string | null},
  rotation: number,
  flipped: boolean
): {top: string | null, right: string | null, bottom: string | null, left: string | null} {
  let edges = [config.top, config.right, config.bottom, config.left];

  // Apply flip (horizontal flip swaps left-right)
  if (flipped) {
    edges = [edges[0], edges[3], edges[2], edges[1]];
  }

  // Apply rotation (each 90 degrees rotates edges clockwise)
  const steps = Math.round(rotation / 90) % 4;
  for (let i = 0; i < steps; i++) {
    edges = [edges[3], edges[0], edges[1], edges[2]];
  }

  return {top: edges[0], right: edges[1], bottom: edges[2], left: edges[3]};
}

function tryBuildSolution(config: GenerationConfig, targetSize: number): Solution | null {
  const state: BuilderState = {
    placements: [],
    placedCells: new Set(),
    openConnectors: [],
    usedTiles: new Map(),
    config
  };

  // Place seed tile at center
  const seedTileId = selectSeedTile(config);
  const seedVariants = getTileVariants(seedTileId)
    .filter(v => isOrientationAllowed(v.orientation, config))
    .filter(v => v.orientation === 'flat');  // Seed always flat for simplicity

  if (seedVariants.length === 0) return null;

  const seedVariant = randomChoice(seedVariants);
  const seedPlacement: Placement = {
    cell: { x: 5, y: 0, z: 5 },
    orientation: 'flat',
    tileId: seedTileId,
    rotation: seedVariant.rotation,
    flipped: seedVariant.flipped
  };

  addPlacement(state, seedPlacement, seedVariant);

  // Grow the network
  let stuckCount = 0;
  const maxStuck = 10;

  while (state.placements.length < targetSize && stuckCount < maxStuck) {
    if (state.openConnectors.length === 0) {
      // No open connectors - network is closed
      break;
    }

    // Select an open connector to extend
    const openConn = randomChoice(state.openConnectors);

    // Find matching tiles
    const candidates = findMatchingTiles(state, openConn, config);

    if (candidates.length === 0) {
      stuckCount++;
      // Remove this connector from open list (can't extend it)
      state.openConnectors = state.openConnectors.filter(c => c !== openConn);
      continue;
    }

    stuckCount = 0;

    // Select and place a tile
    const selected = selectTileWeighted(candidates, state, config);
    if (!selected) continue;

    const variant = getVariant(selected.variant.key);
    if (!variant) continue;

    addPlacement(state, selected.placement, variant);
  }

  // Try to close open connectors (but respect max size limit)
  const maxExtraTiles = Math.max(0, config.size.max - state.placements.length);
  closeOpenConnectors(state, maxExtraTiles);

  // IMPORTANT: Only return solution if network is fully closed (no open connectors)
  if (state.openConnectors.length > 0) {
    return null;  // Network not closed, reject this solution
  }

  return { placements: state.placements };
}

// Select a good seed tile - ALWAYS prefer 2-connector tiles for easier loop closure
function selectSeedTile(config: GenerationConfig): string {
  const tilePool = config.tilePool ?? getAllTileIds();
  const records = getTileRecords();

  // Always prefer 2-connector tiles - they form chains that can close into loops
  const twoConnector = tilePool.filter(id => {
    const rec = records.get(id);
    if (!rec) return false;
    const connCount = ['top', 'right', 'bottom', 'left']
      .filter(e => rec.config[e as keyof typeof rec.config] !== null).length;
    return connCount === 2;
  });

  if (twoConnector.length > 0) {
    return randomChoice(twoConnector);
  }

  // Fallback: any tile with connectors
  const valid = tilePool.filter(id => {
    const rec = records.get(id);
    if (!rec) return false;
    const connCount = ['top', 'right', 'bottom', 'left']
      .filter(e => rec.config[e as keyof typeof rec.config] !== null).length;
    return connCount >= 2;
  });

  return valid.length > 0 ? randomChoice(valid) : randomChoice(tilePool);
}

// Try to close remaining open connectors
function closeOpenConnectors(state: BuilderState, maxExtraTiles: number = 10): void {
  const maxIterations = 50;  // More iterations to try harder
  let iterations = 0;
  let tilesAdded = 0;
  const tolerance = 0.01;

  while (state.openConnectors.length > 0 && iterations < maxIterations && tilesAdded < maxExtraTiles) {
    iterations++;

    // First, check if any open connectors already match each other
    let foundMatch = false;
    for (let i = 0; i < state.openConnectors.length && !foundMatch; i++) {
      for (let j = i + 1; j < state.openConnectors.length && !foundMatch; j++) {
        const a = state.openConnectors[i];
        const b = state.openConnectors[j];

        if (
          Math.abs(a.worldPos.x - b.worldPos.x) < tolerance &&
          Math.abs(a.worldPos.y - b.worldPos.y) < tolerance &&
          Math.abs(a.worldPos.z - b.worldPos.z) < tolerance
        ) {
          // These match! Remove both
          state.openConnectors = state.openConnectors.filter(
            (_c, idx) => idx !== i && idx !== j
          );
          foundMatch = true;
        }
      }
    }
    if (foundMatch) continue;

    // Try to place tiles that close connectors
    if (state.openConnectors.length === 0) break;

    const openConn = state.openConnectors[0];
    const candidates = findMatchingTiles(state, openConn, state.config)
      .filter(c => isOrientationAllowed(c.variant.orientation, state.config));

    if (candidates.length === 0) {
      // No tile can connect here - this attempt is doomed
      break;
    }

    // Score each candidate by how many connectors it closes vs creates
    const scoredCandidates = candidates.map(c => {
      const variant = c.variant;
      let closesCount = 0;
      let newOpenCount = 0;

      for (const conn of variant.connectors) {
        const worldPos = getConnectorWorldPos(c.placement.cell, conn);
        let matchesOpen = false;
        for (const other of state.openConnectors) {
          if (
            Math.abs(worldPos.x - other.worldPos.x) < tolerance &&
            Math.abs(worldPos.y - other.worldPos.y) < tolerance &&
            Math.abs(worldPos.z - other.worldPos.z) < tolerance
          ) {
            matchesOpen = true;
            closesCount++;
            break;
          }
        }
        if (!matchesOpen) {
          newOpenCount++;
        }
      }

      // Score: prioritize closing more, penalize creating new opens
      const score = closesCount * 2 - newOpenCount;
      return { candidate: c, score, closesCount, newOpenCount };
    });

    // Sort by score descending
    scoredCandidates.sort((a, b) => b.score - a.score);

    // Best candidate: closes most, creates fewest new opens
    const best = scoredCandidates[0];

    // Only place if it's actually helpful (closes at least one)
    if (best.closesCount > 0) {
      const variant = getVariant(best.candidate.variant.key);
      if (variant) {
        addPlacement(state, best.candidate.placement, variant);
        tilesAdded++;
      }
    } else {
      // No helpful tile found - this connector can't be closed
      break;
    }
  }
}

// Generate multiple solutions
export function buildSolutions(config: GenerationConfig, count: number): Solution[] {
  const solutions: Solution[] = [];

  for (let i = 0; i < count * 3 && solutions.length < count; i++) {
    const sol = buildSolution(config);
    if (sol) {
      solutions.push(sol);
    }
  }

  return solutions;
}
