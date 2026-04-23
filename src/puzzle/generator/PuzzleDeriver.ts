// Puzzle Deriver - converts solutions into puzzles

import type {
  Solution,
  Puzzle,
  Placement,
  TileSpec,
  Bounds,
  GenerationConfig,
  DifficultyLevel
} from '../types';

// Compute tight bounds around placements
function computeBounds(placements: Placement[]): Bounds {
  if (placements.length === 0) {
    return { min: { x: 0, y: 0, z: 0 }, max: { x: 0, y: 0, z: 0 } };
  }

  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (const p of placements) {
    minX = Math.min(minX, p.cell.x);
    minY = Math.min(minY, p.cell.y);
    minZ = Math.min(minZ, p.cell.z);
    maxX = Math.max(maxX, p.cell.x);
    maxY = Math.max(maxY, p.cell.y);
    maxZ = Math.max(maxZ, p.cell.z);
  }

  // Add some padding
  return {
    min: { x: Math.max(0, minX - 1), y: Math.max(0, minY), z: Math.max(0, minZ - 1) },
    max: { x: Math.min(9, maxX + 1), y: Math.min(4, maxY + 1), z: Math.min(9, maxZ + 1) }
  };
}

// Convert placements to tile specs (count of each tile type)
function placementsToTileSpecs(placements: Placement[]): TileSpec[] {
  const counts = new Map<string, number>();

  for (const p of placements) {
    const count = counts.get(p.tileId) ?? 0;
    counts.set(p.tileId, count + 1);
  }

  return Array.from(counts.entries()).map(([tileId, count]) => ({ tileId, count }));
}

// Select a hint tile - prefer constrained tiles that give a good starting point
function selectHintTile(placements: Placement[]): Placement | null {
  if (placements.length === 0) return null;

  // For now, just pick a tile near the center
  const centerX = placements.reduce((sum, p) => sum + p.cell.x, 0) / placements.length;
  const centerZ = placements.reduce((sum, p) => sum + p.cell.z, 0) / placements.length;

  let best: Placement | null = null;
  let bestDist = Infinity;

  for (const p of placements) {
    const dist = Math.abs(p.cell.x - centerX) + Math.abs(p.cell.z - centerZ);
    if (dist < bestDist) {
      bestDist = dist;
      best = p;
    }
  }

  return best;
}

// Derive an "arrange tiles" puzzle from a solution
// Player gets the tiles and must figure out how to place them
export function deriveArrangePuzzle(solution: Solution, includeHint: boolean = true): Puzzle {
  const tiles = placementsToTileSpecs(solution.placements);
  const bounds = computeBounds(solution.placements);
  const hint = includeHint ? selectHintTile(solution.placements) : undefined;

  return {
    mode: 'arrange',
    tiles,
    fixedPlacements: hint ? [hint] : [],
    gridBounds: bounds,
    hint: hint ?? undefined
  };
}

// Derive a "complete grid" puzzle from a solution
// Some tiles are fixed, player must fill in the rest
export function deriveCompletePuzzle(
  solution: Solution,
  difficulty: DifficultyLevel = 'medium'
): Puzzle {
  // Determine how many tiles to remove based on difficulty
  const removeRatio = difficultyToRemoveRatio(difficulty);
  const removeCount = Math.max(1, Math.floor(solution.placements.length * removeRatio));

  // Select tiles to remove
  const toRemove = selectTilesToRemove(solution.placements, removeCount);
  const removeSet = new Set(toRemove);

  // Split into fixed and missing
  const fixedPlacements = solution.placements.filter(p => !removeSet.has(p));
  const missingTiles = placementsToTileSpecs(toRemove);

  const bounds = computeBounds(solution.placements);

  return {
    mode: 'complete',
    tiles: missingTiles,
    fixedPlacements,
    gridBounds: bounds,
    metadata: {
      id: generatePuzzleId(),
      difficulty,
      category: solution.placements.some(p => p.orientation !== 'flat') ? '3d' : 'flat',
      size: categorizePuzzleSize(solution.placements.length)
    }
  };
}

// Map difficulty to fraction of tiles to remove
function difficultyToRemoveRatio(difficulty: DifficultyLevel): number {
  switch (difficulty) {
    case 'easy': return 0.2;
    case 'medium': return 0.4;
    case 'hard': return 0.6;
    case 'expert': return 0.8;
    default: return 0.4;
  }
}

// Select which tiles to remove for the puzzle
function selectTilesToRemove(placements: Placement[], count: number): Placement[] {
  if (count >= placements.length) {
    return [...placements];
  }

  // Score each placement for removal
  const scored = placements.map((p, idx) => ({
    placement: p,
    index: idx,
    score: scoreForRemoval(p, placements)
  }));

  // Sort by score descending (higher = better to remove)
  scored.sort((a, b) => b.score - a.score);

  // Take top N
  return scored.slice(0, count).map(s => s.placement);
}

// Score a placement for removal (higher = better candidate to remove)
function scoreForRemoval(placement: Placement, allPlacements: Placement[]): number {
  let score = 0;

  // Prefer removing tiles that are not at corners/edges of the network
  const neighbors = countNeighbors(placement, allPlacements);
  if (neighbors >= 2) score += 2;  // Has multiple neighbors, less critical

  // Prefer removing non-ground tiles (more interesting)
  if (placement.cell.y > 0) score += 1;

  // Avoid removing the only tile of a type
  const sameType = allPlacements.filter(p => p.tileId === placement.tileId);
  if (sameType.length > 1) score += 1;

  // Add some randomness
  score += Math.random() * 0.5;

  return score;
}

// Count how many placements are adjacent to this one
function countNeighbors(placement: Placement, allPlacements: Placement[]): number {
  let count = 0;
  const { x, y, z } = placement.cell;

  for (const p of allPlacements) {
    if (p === placement) continue;

    const dx = Math.abs(p.cell.x - x);
    const dy = Math.abs(p.cell.y - y);
    const dz = Math.abs(p.cell.z - z);

    // Adjacent if exactly one coordinate differs by 1
    if ((dx === 1 && dy === 0 && dz === 0) ||
        (dx === 0 && dy === 1 && dz === 0) ||
        (dx === 0 && dy === 0 && dz === 1)) {
      count++;
    }
  }

  return count;
}

// Categorize puzzle size
function categorizePuzzleSize(tileCount: number): 'small' | 'medium' | 'large' {
  if (tileCount <= 5) return 'small';
  if (tileCount <= 10) return 'medium';
  return 'large';
}

// Generate a unique puzzle ID
function generatePuzzleId(): string {
  return `puzzle_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Derive puzzle based on config
export function derivePuzzle(solution: Solution, config: GenerationConfig): Puzzle {
  if (config.mode === 'complete') {
    return deriveCompletePuzzle(solution, config.difficulty ?? 'medium');
  } else {
    return deriveArrangePuzzle(solution, true);
  }
}
