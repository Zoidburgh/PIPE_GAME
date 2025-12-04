// Puzzle System - Public API
//
// This module provides tools for generating and solving pipe puzzles.
//
// Key features:
// - Generate puzzles with configurable difficulty and size
// - Solve puzzles and count solutions
// - Analyze puzzle quality (interestingness, cheese detection)
// - Two puzzle modes: "arrange" (place given tiles) and "complete" (fill gaps)

// Re-export types
export type {
  Puzzle,
  Solution,
  Placement,
  TileSpec,
  Bounds,
  Vec3,
  Orientation,
  Rotation,
  GenerationConfig,
  SolverOptions,
  SolverResult,
  PuzzleAnalysis,
  InterestingnessScore,
  CheeseIssue,
  DifficultyLevel
} from './types';

// Solver API
export { solve, countSolutions, hasUniqueSolution, isSolvable } from './solver';

// Generator API
export { generatePuzzle, generatePuzzles, generatePuzzleWithSolution, buildSolution, buildSolutions } from './generator';
export type { PuzzleWithSolution } from './generator';

// Analysis API
export { analyzePuzzle, computeInterestingness, detectCheese, isTrivialPuzzle } from './analysis';

// Precompute API (for advanced use)
export {
  getTileRecords,
  getVariants,
  getTileVariants,
  getTileConfig,
  getAllTileIds,
  getConnectorCount
} from './precompute';

// Utility functions
import type { Puzzle, GenerationConfig, PuzzleAnalysis } from './types';
import { generatePuzzle as _generatePuzzle, generatePuzzles as _generatePuzzles } from './generator';
import { analyzePuzzle as _analyzePuzzle } from './analysis';

// Find interesting puzzles matching criteria
export function findInterestingPuzzles(
  config: GenerationConfig,
  count: number,
  minInterestingness: number = 50
): Array<{ puzzle: Puzzle; analysis: PuzzleAnalysis }> {
  const results: Array<{ puzzle: Puzzle; analysis: PuzzleAnalysis }> = [];
  const maxAttempts = count * 10;

  for (let i = 0; i < maxAttempts && results.length < count; i++) {
    const puzzle = _generatePuzzle(config);
    if (!puzzle) continue;

    const analysis = _analyzePuzzle(puzzle);

    if (analysis.solvable && analysis.interestingness.total >= minInterestingness) {
      results.push({ puzzle, analysis });
    }
  }

  // Sort by interestingness
  results.sort((a, b) => b.analysis.interestingness.total - a.analysis.interestingness.total);

  return results;
}

// Generate a puzzle set for a level progression
export function generatePuzzleSet(
  baseConfig: Partial<GenerationConfig>,
  sizes: { small: number; medium: number; large: number }
): Puzzle[] {
  const puzzles: Puzzle[] = [];

  // Small puzzles (3-5 tiles)
  const smallConfig: GenerationConfig = {
    size: { min: 3, max: 5 },
    mode: 'arrange',
    allow3D: false,
    ...baseConfig
  };
  for (let i = 0; i < sizes.small; i++) {
    const puzzle = _generatePuzzle(smallConfig);
    if (puzzle) puzzles.push(puzzle);
  }

  // Medium puzzles (6-10 tiles)
  const mediumConfig: GenerationConfig = {
    size: { min: 6, max: 10 },
    mode: 'arrange',
    allow3D: baseConfig.allow3D ?? true,
    ...baseConfig
  };
  for (let i = 0; i < sizes.medium; i++) {
    const puzzle = _generatePuzzle(mediumConfig);
    if (puzzle) puzzles.push(puzzle);
  }

  // Large puzzles (10+ tiles)
  const largeConfig: GenerationConfig = {
    size: { min: 10, max: 15 },
    mode: 'arrange',
    allow3D: baseConfig.allow3D ?? true,
    ...baseConfig
  };
  for (let i = 0; i < sizes.large; i++) {
    const puzzle = _generatePuzzle(largeConfig);
    if (puzzle) puzzles.push(puzzle);
  }

  return puzzles;
}

// Quick validation check for a puzzle
export function isValidPuzzle(puzzle: Puzzle): boolean {
  // Basic structure checks
  if (!puzzle.tiles || puzzle.tiles.length === 0) return false;
  if (!puzzle.gridBounds) return false;

  // Ensure grid bounds are reasonable
  const { min, max } = puzzle.gridBounds;
  if (min.x > max.x || min.y > max.y || min.z > max.z) return false;

  // Ensure fixed placements are within bounds
  for (const p of puzzle.fixedPlacements) {
    if (p.cell.x < min.x || p.cell.x > max.x) return false;
    if (p.cell.y < min.y || p.cell.y > max.y) return false;
    if (p.cell.z < min.z || p.cell.z > max.z) return false;
  }

  return true;
}
