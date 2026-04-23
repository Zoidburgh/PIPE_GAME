// Backtracking search with MRV (Minimum Remaining Values) heuristic

import type {
  Solution,
  SolverOptions,
  SolverResult,
  SolveTrace,
  Puzzle,
  Placement,
  VariantKey,
  CellOrientationKey,
  Orientation
} from '../types';
import { parseCellOrientation } from '../types';
import { SolverState, createSolverState } from './SolverState';
// import { fullPropagate } from './Propagator';  // Disabled - needs rework for arrange mode
import { getVariant } from '../precompute';

interface SearchContext {
  options: SolverOptions;
  solutions: Solution[];
  trace: SolveTrace;
  startTime: number;
  currentDepth: number;
}

// Select the cell/orientation with minimum remaining values (MRV heuristic)
function selectMRV(state: SolverState): { key: CellOrientationKey; domain: Set<VariantKey> } | null {
  let bestKey: CellOrientationKey | null = null;
  let bestDomain: Set<VariantKey> | null = null;
  let bestSize = Infinity;

  for (const [key, domain] of state.domains) {
    // Skip already-placed slots
    if (state.placements.has(key)) continue;

    // Skip empty domains (should have been caught by propagation)
    if (domain.size === 0) continue;

    // Find smallest non-trivial domain
    if (domain.size < bestSize) {
      bestKey = key;
      bestDomain = domain;
      bestSize = domain.size;
    }
  }

  if (bestKey && bestDomain) {
    return { key: bestKey, domain: bestDomain };
  }

  return null;
}

// Convert variant key to placement
function variantToPlacement(
  vKey: VariantKey,
  cell: { x: number; y: number; z: number },
  orientation: Orientation
): Placement | null {
  const variant = getVariant(vKey);
  if (!variant) return null;

  return {
    cell,
    orientation,
    tileId: variant.tileId,
    rotation: variant.rotation,
    flipped: variant.flipped
  };
}

// Check if timed out
function isTimedOut(ctx: SearchContext): boolean {
  if (!ctx.options.timeoutMs) return false;
  return Date.now() - ctx.startTime > ctx.options.timeoutMs;
}

// Check if we should stop searching
function shouldStop(ctx: SearchContext): boolean {
  if (isTimedOut(ctx)) return true;

  const maxSolutions = ctx.options.maxSolutions ?? Infinity;
  if (ctx.solutions.length >= maxSolutions) return true;

  if (ctx.options.mode === 'first' && ctx.solutions.length > 0) return true;

  return false;
}

// Recursive backtracking search
function search(state: SolverState, ctx: SearchContext): void {
  ctx.trace.nodesExplored++;
  ctx.currentDepth++;
  ctx.trace.maxBacktrackDepth = Math.max(ctx.trace.maxBacktrackDepth, ctx.currentDepth);

  // Check stopping conditions
  if (shouldStop(ctx)) {
    ctx.currentDepth--;
    return;
  }

  // Skip propagation for now - just check basic validity
  // ctx.trace.propagationCalls++;
  // const propResult = fullPropagate(state);
  // if (!propResult.success) {
  //   ctx.trace.totalBacktracks++;
  //   ctx.currentDepth--;
  //   return;
  // }

  // Check if solved
  if (state.isSolved()) {
    ctx.solutions.push(state.toSolution());
    ctx.currentDepth--;
    return;
  }

  // Select variable (cell/orientation) using MRV
  const selection = selectMRV(state);

  if (!selection) {
    // No unplaced slots with valid domains
    // Check if we've placed all tiles
    if (state.getTotalRemainingTiles() === 0) {
      ctx.solutions.push(state.toSolution());
    }
    ctx.currentDepth--;
    return;
  }

  const { key, domain } = selection;
  const { cell, orientation } = parseCellOrientation(key);

  // Order values by LCV (least constraining value) - simplified version
  // Just sort by how many tiles of this type are available (prefer more available)
  const orderedVariants = orderVariants([...domain], state);

  // Try each value
  for (const vKey of orderedVariants) {
    if (shouldStop(ctx)) break;

    const variant = getVariant(vKey);
    if (!variant) continue;

    // Check tile availability
    if (state.getRemainingCount(variant.tileId) <= 0) continue;

    // Clone state and apply placement
    const newState = state.clone();
    const placement = variantToPlacement(vKey, cell, orientation);

    if (!placement) continue;

    const success = newState.applyPlacement(placement);
    if (!success) continue;

    // Recurse
    search(newState, ctx);
  }

  ctx.currentDepth--;
}

// Order variants by availability (prefer tiles with more copies available)
function orderVariants(variants: VariantKey[], state: SolverState): VariantKey[] {
  return variants.sort((a, b) => {
    const vA = getVariant(a);
    const vB = getVariant(b);
    if (!vA || !vB) return 0;

    const availA = state.getRemainingCount(vA.tileId);
    const availB = state.getRemainingCount(vB.tileId);

    // Prefer tiles with more copies (less constraining to use)
    return availB - availA;
  });
}

// Main solve function
export function solve(puzzle: Puzzle, options: SolverOptions = {}): SolverResult {
  const defaultOptions: SolverOptions = {
    mode: 'first',
    maxSolutions: options.mode === 'all' ? 1000 : 1,
    timeoutMs: 30000,  // 30 second default timeout
    trace: false,
    ...options
  };

  const state = createSolverState(puzzle);

  const ctx: SearchContext = {
    options: defaultOptions,
    solutions: [],
    trace: {
      maxBacktrackDepth: 0,
      totalBacktracks: 0,
      nodesExplored: 0,
      propagationCalls: 0
    },
    startTime: Date.now(),
    currentDepth: 0
  };

  // Skip initial propagation for now - it's too aggressive for arrange mode
  // Just start searching directly
  search(state, ctx);

  return {
    solutions: ctx.solutions,
    solutionCount: ctx.solutions.length,
    trace: defaultOptions.trace ? ctx.trace : undefined,
    timedOut: isTimedOut(ctx)
  };
}

// Count solutions (more efficient than getting all)
export function countSolutions(puzzle: Puzzle, max: number = 1000): number {
  const result = solve(puzzle, {
    mode: 'count',
    maxSolutions: max,
    timeoutMs: 60000
  });

  return result.solutionCount;
}

// Check if puzzle has exactly one solution
export function hasUniqueSolution(puzzle: Puzzle): boolean {
  const result = solve(puzzle, {
    mode: 'count',
    maxSolutions: 2,
    timeoutMs: 30000
  });

  return result.solutionCount === 1;
}

// Check if puzzle is solvable
export function isSolvable(puzzle: Puzzle, debug: boolean = false): boolean {
  if (debug) {
    console.log('isSolvable check:', puzzle);
    console.log('  Tiles:', puzzle.tiles);
    console.log('  Fixed:', puzzle.fixedPlacements);
    console.log('  Bounds:', puzzle.gridBounds);
  }

  const result = solve(puzzle, {
    mode: 'first',
    maxSolutions: 1,
    timeoutMs: 30000,
    trace: debug
  });

  if (debug) {
    console.log('  Result:', result.solutionCount, 'solutions');
    if (result.trace) {
      console.log('  Trace:', result.trace);
    }
  }

  return result.solutionCount > 0;
}
