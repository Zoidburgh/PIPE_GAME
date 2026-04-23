// Cheese Detector - identifies trivial or exploitable puzzle solutions

import type { Puzzle, Solution, CheeseIssue } from '../types';

// Check if all placements are in a single line
function isLinearSolution(solution: Solution): boolean {
  if (solution.placements.length <= 2) return true;  // Too small to judge

  const placements = solution.placements;

  // Check if all same X
  const allSameX = placements.every(p => p.cell.x === placements[0].cell.x);
  if (allSameX) return true;

  // Check if all same Z
  const allSameZ = placements.every(p => p.cell.z === placements[0].cell.z);
  if (allSameZ) return true;

  // Check if all same Y (flat line)
  const allSameY = placements.every(p => p.cell.y === placements[0].cell.y);

  // Check if diagonal (x increases as z increases)
  if (allSameY) {
    const sorted = [...placements].sort((a, b) => a.cell.x - b.cell.x);
    const isDiagonal = sorted.every((p, i) => {
      if (i === 0) return true;
      return p.cell.z === sorted[i - 1].cell.z + 1 || p.cell.z === sorted[i - 1].cell.z - 1;
    });
    if (isDiagonal && placements.length <= 4) return true;
  }

  return false;
}

// Check if solution uses only one tile type
function usesSingleTileType(solution: Solution): boolean {
  if (solution.placements.length <= 1) return false;  // Single tile is OK

  const types = new Set(solution.placements.map(p => p.tileId));
  return types.size === 1;
}

// Check if solution is too small
function isTooSmall(solution: Solution): boolean {
  return solution.placements.length < 3;
}

// Check if solution has no meaningful paths (just endpoints)
function hasNoMeaningfulPaths(_solution: Solution): boolean {
  // Would need to analyze tile configs
  // For now, return false
  return false;
}

// Detect all cheese issues in a solution
export function detectCheese(_puzzle: Puzzle, solution: Solution): CheeseIssue[] {
  const issues: CheeseIssue[] = [];

  if (isLinearSolution(solution)) {
    issues.push({
      type: 'line',
      description: 'Solution is a straight line'
    });
  }

  if (usesSingleTileType(solution) && solution.placements.length > 2) {
    issues.push({
      type: 'single_type',
      description: 'Uses only one tile type'
    });
  }

  if (isTooSmall(solution)) {
    issues.push({
      type: 'trivial',
      description: 'Solution has too few tiles'
    });
  }

  if (hasNoMeaningfulPaths(solution)) {
    issues.push({
      type: 'no_paths',
      description: 'No meaningful pipe paths'
    });
  }

  return issues;
}

// Check if a puzzle is trivial (easy to identify before solving)
export function isTrivialPuzzle(puzzle: Puzzle): { trivial: boolean; reason?: string } {
  const totalTiles = puzzle.tiles.reduce((sum, t) => sum + t.count, 0);

  // Very small puzzles are trivial
  if (totalTiles <= 2) {
    return { trivial: true, reason: 'Too few tiles' };
  }

  // All tiles are the same type and only 1 type
  if (puzzle.tiles.length === 1 && totalTiles > 1) {
    return { trivial: true, reason: 'All tiles are identical' };
  }

  return { trivial: false };
}

// Check if any solution in a set is cheesy
export function anySolutionIsCheesy(puzzle: Puzzle, solutions: Solution[]): boolean {
  for (const solution of solutions) {
    const issues = detectCheese(puzzle, solution);
    if (issues.length > 0) return true;
  }
  return false;
}

// Check if ALL solutions are cheesy (puzzle is fundamentally flawed)
export function allSolutionsAreCheesy(puzzle: Puzzle, solutions: Solution[]): boolean {
  if (solutions.length === 0) return false;

  for (const solution of solutions) {
    const issues = detectCheese(puzzle, solution);
    if (issues.length === 0) return false;  // At least one good solution
  }
  return true;
}

// Get cheese severity (0-100, higher = more cheese)
export function getCheeseSeverity(issues: CheeseIssue[]): number {
  if (issues.length === 0) return 0;

  let severity = 0;

  for (const issue of issues) {
    switch (issue.type) {
      case 'line':
        severity += 40;
        break;
      case 'single_type':
        severity += 30;
        break;
      case 'trivial':
        severity += 50;
        break;
      case 'no_paths':
        severity += 20;
        break;
      case 'forced_move':
        severity += 25;
        break;
    }
  }

  return Math.min(severity, 100);
}
