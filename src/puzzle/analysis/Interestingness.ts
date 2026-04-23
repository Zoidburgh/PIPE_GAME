// Interestingness scoring for puzzles

import type {
  Puzzle,
  Solution,
  InterestingnessScore,
  InterestingnessComponents,
  SolveTrace
} from '../types';

// Weights for each component
const WEIGHTS: Record<keyof InterestingnessComponents, number> = {
  solutionUniqueness: 0.25,
  searchDepth: 0.20,
  redHerrings: 0.18,
  spatialComplexity: 0.15,
  tileInteraction: 0.12,
  constraintBalance: 0.10
};

// Score solution uniqueness (1-3 solutions = best)
export function scoreSolutionUniqueness(solutionCount: number): number {
  if (solutionCount === 0) return 0;
  if (solutionCount === 1) return 100;
  if (solutionCount === 2) return 90;
  if (solutionCount === 3) return 80;
  if (solutionCount <= 5) return 60;
  if (solutionCount <= 10) return 40;
  if (solutionCount <= 20) return 20;
  return Math.max(0, 10 - solutionCount / 10);
}

// Score search depth (some backtracking = good puzzle)
export function scoreSearchDepth(trace: SolveTrace | undefined): number {
  if (!trace) return 50;  // Unknown, assume medium

  const { maxBacktrackDepth, totalBacktracks } = trace;

  // No backtracking = too easy
  if (totalBacktracks === 0) return 20;

  // Some backtracking is good
  if (maxBacktrackDepth <= 2) return 40;
  if (maxBacktrackDepth <= 4) return 70;
  if (maxBacktrackDepth <= 6) return 90;
  if (maxBacktrackDepth <= 8) return 100;
  if (maxBacktrackDepth <= 12) return 80;

  // Too much backtracking = too hard
  return 50;
}

// Score red herrings (plausible wrong moves)
export function scoreRedHerrings(_puzzle: Puzzle, trace: SolveTrace | undefined): number {
  if (!trace) return 50;

  // Use backtrack count as proxy for dead ends
  const backtracks = trace.totalBacktracks;

  if (backtracks === 0) return 30;  // No false paths
  if (backtracks <= 2) return 50;
  if (backtracks <= 5) return 80;
  if (backtracks <= 10) return 100;
  if (backtracks <= 20) return 70;
  return 40;  // Too many dead ends
}

// Score spatial complexity
export function scoreSpatialComplexity(solutions: Solution[]): number {
  if (solutions.length === 0) return 0;

  const solution = solutions[0];
  let score = 0;

  // Check height usage
  const heights = new Set(solution.placements.map(p => p.cell.y));
  score += Math.min(heights.size * 20, 40);  // +20 per height level, max 40

  // Check spread in X and Z
  const xs = solution.placements.map(p => p.cell.x);
  const zs = solution.placements.map(p => p.cell.z);
  const xSpread = Math.max(...xs) - Math.min(...xs) + 1;
  const zSpread = Math.max(...zs) - Math.min(...zs) + 1;

  // Prefer roughly square layouts
  const aspectRatio = Math.min(xSpread, zSpread) / Math.max(xSpread, zSpread);
  score += aspectRatio * 30;  // Max 30 for square

  // Check for vertical tiles
  const verticalCount = solution.placements.filter(p => p.orientation !== 'flat').length;
  score += Math.min(verticalCount * 10, 30);  // Max 30 for verticals

  return Math.min(score, 100);
}

// Score tile interaction (how tiles constrain each other)
export function scoreTileInteraction(puzzle: Puzzle): number {
  // Count unique tile types
  const uniqueTiles = new Set(puzzle.tiles.map(t => t.tileId)).size;
  const totalTiles = puzzle.tiles.reduce((sum, t) => sum + t.count, 0);

  if (totalTiles <= 1) return 30;

  // Ratio of unique to total - higher variety is interesting
  // But even 2 types can be interesting if they interact well
  const varietyRatio = uniqueTiles / totalTiles;

  // 2+ types is fine, more variety is a slight bonus
  if (uniqueTiles === 1) return 20;  // Single type can be boring
  if (uniqueTiles === 2) return 60 + varietyRatio * 20;
  if (uniqueTiles >= 3) return 70 + varietyRatio * 30;

  return 50;
}

// Score constraint balance
export function scoreConstraintBalance(puzzle: Puzzle, trace: SolveTrace | undefined): number {
  if (!trace) return 50;

  const { nodesExplored } = trace;
  const tiles = puzzle.tiles.reduce((sum, t) => sum + t.count, 0);

  if (tiles === 0) return 0;

  // Ratio of exploration to puzzle size
  const explorationRatio = nodesExplored / tiles;

  // Moderate exploration is ideal
  if (explorationRatio < 1.5) return 30;  // Too constrained
  if (explorationRatio < 3) return 60;
  if (explorationRatio < 6) return 100;
  if (explorationRatio < 12) return 80;
  if (explorationRatio < 25) return 60;
  return 40;  // Too loose
}

// Compute full interestingness score
export function computeInterestingness(
  puzzle: Puzzle,
  solutions: Solution[],
  trace?: SolveTrace
): InterestingnessScore {
  const components: InterestingnessComponents = {
    solutionUniqueness: scoreSolutionUniqueness(solutions.length),
    searchDepth: scoreSearchDepth(trace),
    redHerrings: scoreRedHerrings(puzzle, trace),
    spatialComplexity: scoreSpatialComplexity(solutions),
    tileInteraction: scoreTileInteraction(puzzle),
    constraintBalance: scoreConstraintBalance(puzzle, trace)
  };

  // Weighted sum
  let total = 0;
  for (const [key, weight] of Object.entries(WEIGHTS)) {
    total += components[key as keyof InterestingnessComponents] * weight;
  }

  return { total, components };
}

// Quick interestingness estimate without full solve
export function quickInterestingnessEstimate(puzzle: Puzzle): number {
  let score = 50;  // Base score

  const totalTiles = puzzle.tiles.reduce((sum, t) => sum + t.count, 0);
  const uniqueTiles = puzzle.tiles.length;

  // Size bonus
  if (totalTiles >= 4 && totalTiles <= 8) score += 10;
  if (totalTiles > 8) score += 5;

  // Variety bonus
  if (uniqueTiles >= 2) score += 10;
  if (uniqueTiles >= 3) score += 10;

  // Fixed placements (for 'complete' mode)
  if (puzzle.fixedPlacements.length > 0) {
    const fixedRatio = puzzle.fixedPlacements.length / totalTiles;
    if (fixedRatio > 0.2 && fixedRatio < 0.8) score += 10;
  }

  return Math.min(score, 100);
}
