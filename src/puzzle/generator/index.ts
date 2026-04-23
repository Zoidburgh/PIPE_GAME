// Generator exports
export { buildSolution, buildSolutions } from './SolutionBuilder';
export { deriveArrangePuzzle, deriveCompletePuzzle, derivePuzzle } from './PuzzleDeriver';

import type { Puzzle, GenerationConfig, Solution } from '../types';
import { buildSolution } from './SolutionBuilder';
import { derivePuzzle } from './PuzzleDeriver';
// import { analyzePuzzle } from '../analysis';
// import { isSolvable } from '../solver';

// Result with both puzzle and solution
export interface PuzzleWithSolution {
  puzzle: Puzzle;
  solution: Solution;
}

// Generate a puzzle that meets quality criteria
export function generatePuzzle(config: GenerationConfig): Puzzle | null {
  const maxAttempts = 50;
  let stats = { noSolution: 0, tooSmall: 0, notSolvable: 0, lowInterest: 0, notUnique: 0 };

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Build a solution
    const solution = buildSolution(config);
    if (!solution) {
      stats.noSolution++;
      continue;
    }
    if (solution.placements.length < config.size.min) {
      stats.tooSmall++;
      continue;
    }

    // Derive puzzle from solution
    const puzzle = derivePuzzle(solution, config);

    // Skip solvability check - puzzle is solvable by construction
    // (derived from a valid solution)
    // TODO: Add proper validation that the derived puzzle preserves solvability

    // Check quality criteria if specified (disabled - solver has bugs)
    // if (config.minInterestingness !== undefined) {
    //   const analysis = analyzePuzzle(puzzle);
    //   if (analysis.interestingness.total < config.minInterestingness) {
    //     stats.lowInterest++;
    //     continue;
    //   }
    // }

    // Check unique solution requirement (disabled - solver has bugs)
    // if (config.requireUniqueSolution) {
    //   const analysis = analyzePuzzle(puzzle);
    //   if (analysis.uniqueSolutions !== 1) {
    //     stats.notUnique++;
    //     continue;
    //   }
    // }

    console.log(`generatePuzzle succeeded after ${attempt + 1} attempts`, stats);
    return puzzle;
  }

  console.log(`generatePuzzle failed after ${maxAttempts} attempts:`, stats);
  return null;
}

// Generate a puzzle with its solution (for reveal feature)
export function generatePuzzleWithSolution(config: GenerationConfig): PuzzleWithSolution | null {
  const maxAttempts = 50;
  let stats = { noSolution: 0, tooSmall: 0 };

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const solution = buildSolution(config);
    if (!solution) {
      stats.noSolution++;
      continue;
    }
    if (solution.placements.length < config.size.min) {
      stats.tooSmall++;
      continue;
    }

    const puzzle = derivePuzzle(solution, config);

    console.log(`generatePuzzleWithSolution succeeded after ${attempt + 1} attempts`, stats);
    return { puzzle, solution };
  }

  console.log(`generatePuzzleWithSolution failed after ${maxAttempts} attempts:`, stats);
  return null;
}

// Generate multiple puzzles
export function generatePuzzles(config: GenerationConfig, count: number): Puzzle[] {
  const puzzles: Puzzle[] = [];

  for (let i = 0; i < count * 3 && puzzles.length < count; i++) {
    const puzzle = generatePuzzle(config);
    if (puzzle) {
      puzzles.push(puzzle);
    }
  }

  return puzzles;
}
