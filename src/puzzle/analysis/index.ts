// Analysis exports
export {
  computeInterestingness,
  quickInterestingnessEstimate,
  scoreSolutionUniqueness,
  scoreSearchDepth,
  scoreRedHerrings,
  scoreSpatialComplexity,
  scoreTileInteraction,
  scoreConstraintBalance
} from './Interestingness';

export {
  detectCheese,
  isTrivialPuzzle,
  anySolutionIsCheesy,
  allSolutionsAreCheesy,
  getCheeseSeverity
} from './CheeseDetector';

import type { Puzzle, PuzzleAnalysis, DifficultyLevel } from '../types';
import { solve } from '../solver';
import { computeInterestingness } from './Interestingness';
import { detectCheese, isTrivialPuzzle } from './CheeseDetector';

// Estimate difficulty level from solve trace
function estimateDifficulty(
  solutionCount: number,
  totalTiles: number,
  maxDepth: number
): DifficultyLevel {
  // Single solution + deep search = harder
  const depthFactor = maxDepth / Math.max(totalTiles, 1);

  if (solutionCount === 0) return 'expert';  // Impossible
  if (solutionCount >= 10) return 'easy';  // Many solutions = easier

  if (depthFactor < 0.5) return 'easy';
  if (depthFactor < 1.0) return 'medium';
  if (depthFactor < 2.0) return 'hard';
  return 'expert';
}

// Full puzzle analysis
export function analyzePuzzle(puzzle: Puzzle): PuzzleAnalysis {
  // Check if trivially bad
  const trivialCheck = isTrivialPuzzle(puzzle);
  if (trivialCheck.trivial) {
    return {
      solvable: true,
      solutionCount: 1,
      uniqueSolutions: 1,
      difficulty: 'easy',
      interestingness: { total: 0, components: {
        solutionUniqueness: 0,
        searchDepth: 0,
        redHerrings: 0,
        spatialComplexity: 0,
        tileInteraction: 0,
        constraintBalance: 0
      }},
      issues: [{ type: 'trivial', description: trivialCheck.reason! }]
    };
  }

  // Solve with trace
  const result = solve(puzzle, {
    mode: 'all',
    maxSolutions: 50,
    timeoutMs: 30000,
    trace: true
  });

  if (result.solutionCount === 0) {
    return {
      solvable: false,
      solutionCount: 0,
      uniqueSolutions: 0,
      difficulty: 'expert',
      interestingness: { total: 0, components: {
        solutionUniqueness: 0,
        searchDepth: 0,
        redHerrings: 0,
        spatialComplexity: 0,
        tileInteraction: 0,
        constraintBalance: 0
      }},
      issues: [],
      trace: result.trace
    };
  }

  // Compute interestingness
  const interestingness = computeInterestingness(puzzle, result.solutions, result.trace);

  // Detect cheese in solutions
  const allIssues: Set<string> = new Set();
  for (const sol of result.solutions) {
    const issues = detectCheese(puzzle, sol);
    for (const issue of issues) {
      allIssues.add(JSON.stringify(issue));
    }
  }
  const issues = [...allIssues].map(s => JSON.parse(s));

  // Estimate difficulty
  const totalTiles = puzzle.tiles.reduce((sum, t) => sum + t.count, 0);
  const difficulty = estimateDifficulty(
    result.solutionCount,
    totalTiles,
    result.trace?.maxBacktrackDepth ?? 0
  );

  // Count unique solutions (simplified - just use count for now)
  // Full equivalence checking would compare canonical forms
  const uniqueSolutions = result.solutionCount;

  return {
    solvable: true,
    solutionCount: result.solutionCount,
    uniqueSolutions,
    difficulty,
    interestingness,
    issues,
    trace: result.trace
  };
}

// Quick analysis without full solve
export function quickAnalysis(puzzle: Puzzle): Partial<PuzzleAnalysis> {
  const trivialCheck = isTrivialPuzzle(puzzle);

  return {
    solvable: undefined,  // Unknown without solving
    difficulty: trivialCheck.trivial ? 'easy' : undefined,
    issues: trivialCheck.trivial ? [{ type: 'trivial', description: trivialCheck.reason! }] : []
  };
}
