# Puzzle Generation & Evaluation Plan

## Overview

Generate puzzles by **searching the puzzle space** and using a **solver to verify uniqueness and measure difficulty**. The key insight: we don't build solutions forward (which creates trivial puzzles), we define puzzle parameters and ask "does exactly one solution exist?"

---

## Architecture

```
┌─────────────────┐     ┌─────────────┐     ┌──────────────┐
│ Puzzle Generator│────>│   Solver    │────>│  Evaluator   │
│ (creates specs) │     │ (finds all  │     │ (scores      │
│                 │     │  solutions) │     │  difficulty) │
└─────────────────┘     └─────────────┘     └──────────────┘
         │                    │                    │
         v                    v                    v
   Puzzle Spec          Solution(s)           Quality Score
   - bounds             - placements          - uniqueness
   - tile inventory     - count               - forced moves
   - fixed tiles        - search stats        - backtrack depth
```

---

## Phase 1: Core Solver

The solver is the foundation. Everything else depends on it working correctly.

### 1.1 Solver Requirements

- **Input**: Puzzle spec (bounds, available tiles, fixed tile placements)
- **Output**: All valid solutions (or first N), plus search statistics
- **Correctness**: Must respect the existing compatibility matrix and connection rules

### 1.2 Solver Algorithm: Constraint Propagation + Backtracking

```
function solve(puzzle):
    state = initialize(puzzle)

    while not complete(state):
        # Propagate constraints (reduce possibilities)
        changed = propagate(state)

        if contradiction(state):
            return UNSOLVABLE

        if not changed:
            # Must guess - pick cell with fewest options (MRV heuristic)
            cell, options = pickBranchingCell(state)

            for option in options:
                result = solve(state.with(cell, option))
                if result.success:
                    solutions.add(result)
                    if solutions.count >= limit:
                        return solutions

            return solutions  # May be empty

    return [state.solution]
```

### 1.3 Constraint Propagation Rules

For each empty cell, track which (tile, orientation) pairs are still valid:

1. **Adjacency constraint**: A tile variant is only valid if compatible with all placed neighbors (use precomputed compatibility matrix)
2. **Inventory constraint**: Can only use tiles that remain in the inventory
3. **Boundary constraint**: Connectors cannot point outside the puzzle bounds
4. **Closed network constraint**: The final solution must form a closed network (no dangling connectors)

### 1.4 Search Statistics to Collect

Track these during solving for difficulty evaluation:

- `solutionCount` - Total solutions found
- `nodesExplored` - Total states visited
- `backtracks` - Times we hit a dead end and backed up
- `maxDepth` - Deepest point in search tree
- `forcedMoves` - Cells where only one option remained after propagation
- `propagationPruning` - Options eliminated by constraint propagation

---

## Phase 2: Puzzle Generator

Generate puzzle specifications, not solutions.

### 2.1 Generation Parameters

```typescript
interface GenerationParams {
    bounds: { width: number, height: number, depth: number }
    tileCount: { min: number, max: number }
    allowedTileTypes: TileId[]
    allow3D: boolean  // vertical orientations
    symmetry?: 'none' | 'rotational' | 'mirror'
}
```

### 2.2 Generation Strategies

**Strategy A: Random Inventory**
1. Pick random tile count within range
2. Randomly select tiles from allowed types
3. Pass to solver to check if valid puzzle exists

**Strategy B: Template-Based**
1. Define shape templates (L-shape, cross, spiral, etc.)
2. Fill template with compatible tiles
3. Remove some tiles to create the puzzle inventory

**Strategy C: Reduction from Solution**
1. Generate a random valid closed network
2. "Unplace" all tiles to create inventory
3. Verify exactly one solution exists
4. If multiple solutions, add a "fixed" hint tile

### 2.3 Validity Requirements

A puzzle spec is valid if:
- At least one solution exists
- Few solutions (1-3) - keeps the puzzle focused without being overly constrained
- Solution uses all tiles in inventory (no leftovers)

---

## Phase 3: Puzzle Evaluator

Score puzzles to find the most interesting ones.

### 3.1 Primary Quality Metrics

| Metric | Formula | Weight | Reasoning |
|--------|---------|--------|-----------|
| Solution Count | `1-3 solutions` | Filter | Few solutions = focused puzzle, 1 is ideal but 2-3 can be interesting |
| Forced Move Ratio | `forcedMoves / totalMoves` | 0.3 | Low ratio = more deduction required |
| Backtrack Depth | `log(backtracks + 1)` | 0.3 | More backtracks = harder to brute force |
| Search Efficiency | `1 - (nodesExplored / maxPossibleNodes)` | 0.2 | Pruning effectiveness |
| Elegance | subjective | 0.1 | Sometimes fewer tile types = cleaner puzzle |
| Spatial Complexity | `usedLayers > 1 ? 1.5 : 1.0` | 0.1 | 3D puzzles are more complex |

**Note on Tile Variety**: More variety isn't always better. A puzzle using only 2-3 tile types can be more elegant and focused than one using every tile. The goal is interesting decisions, not maximizing diversity.

### 3.2 Difficulty Tiers

Based on composite score:

- **Easy** (0.0 - 0.3): High forced move ratio, few backtracks
- **Medium** (0.3 - 0.6): Mixed forced/deduced moves
- **Hard** (0.6 - 0.8): Low forced moves, significant backtracking
- **Expert** (0.8 - 1.0): Requires deep lookahead, many decision points

### 3.3 Anti-Patterns to Detect and Reject

- **Trivial**: All moves are forced (no decisions)
- **Too Ambiguous**: More than 3 solutions (unfocused)
- **Disconnected**: Solution has isolated components
- **Degenerate**: Single tile or straight line only

---

## Phase 4: Search Loop

Tie it all together to find the best puzzles.

### 4.1 Main Generation Loop

```
function findBestPuzzles(params, targetCount, maxAttempts):
    candidates = []

    for i in range(maxAttempts):
        spec = generatePuzzleSpec(params)

        solverResult = solve(spec, solutionLimit=4)

        if solverResult.solutionCount == 0 or solverResult.solutionCount > 3:
            continue  # Skip unsolvable or too-ambiguous puzzles

        score = evaluate(spec, solverResult)

        if score > minimumThreshold:
            candidates.add((spec, score))

        if candidates.length >= targetCount * 10:
            break  # Enough candidates

    # Return top puzzles by score
    return candidates.sortByScore().take(targetCount)
```

### 4.2 Adaptive Generation

Track which parameters produce good puzzles:

- If too many puzzles have multiple solutions, reduce tile count
- If too many puzzles are trivial, increase tile variety
- If no valid puzzles found, relax constraints

---

## Implementation Order

1. **Solver core** - Backtracking search that finds solutions
2. **Constraint propagation** - Prune invalid options early
3. **Solution verification** - Integrate with ConnectionValidator
4. **Basic generator** - Random inventory approach
5. **Evaluator** - Score puzzles by solver statistics
6. **Search loop** - Generate many, keep the best
7. **UI integration** - Hook back into Game.ts

---

## Phase 1 Detailed Steps (Solver)

### Step 1.1: Solver Types & State

Create the basic type definitions and state structure.

**File**: `src/puzzle/solver/types.ts`

```typescript
interface SolverState {
  bounds: Bounds;
  placed: Map<string, Placement>;     // "x,y,z,orientation" -> placement
  remainingTiles: TileSpec[];         // tiles left to place
  stats: SolverStats;
}

interface SolverStats {
  nodesExplored: number;
  backtracks: number;
  maxDepth: number;
  forcedMoves: number;
}

interface SolverResult {
  solutions: Placement[][];
  stats: SolverStats;
}
```

**Test**:
- Import types in a test file, create a SolverState object
- Verify TypeScript compiles without errors
- `npm run build` passes

---

### Step 1.2: Cell Enumeration

Function to enumerate all valid cell positions within bounds.

**File**: `src/puzzle/solver/cells.ts`

```typescript
function* enumerateCells(bounds: Bounds): Generator<{x,y,z,orientation}>
```

**Test**:
```typescript
// In console or test file:
const cells = [...enumerateCells({width:2, height:1, depth:2})];
console.log(cells.length); // Should be 2*1*2*3 = 12 for flat + edges
// Verify no duplicates, all positions valid
```

---

### Step 1.3: Variant Lookup Integration

Connect solver to the precomputed tile variants.

**File**: `src/puzzle/solver/variants.ts`

```typescript
function getPlacementOptions(tileSpec: TileSpec): Placement[]
// Returns all valid (rotation, flip) combinations for a tile
```

**Test**:
```typescript
const opts = getPlacementOptions({tileId: 'straight', count: 1});
console.log(opts.length); // Should match expected variant count for straight
// Verify rotations are 0, 90, 180, 270
// Verify flip is true/false
```

---

### Step 1.4: Compatibility Check

Function to check if a placement is compatible with neighbors.

**File**: `src/puzzle/solver/compatibility.ts`

```typescript
function isCompatible(
  placement: Placement,
  neighbors: Map<string, Placement>,
  bounds: Bounds
): boolean
```

**Test**:
```typescript
// Place a straight tile, check if another straight next to it is compatible
// Place two tiles that DON'T connect, verify returns false
// Place tile at edge of bounds, verify boundary check works
```

---

### Step 1.5: Basic Backtracking Search

Core recursive search without optimizations.

**File**: `src/puzzle/solver/Solver.ts`

```typescript
function solve(puzzle: PuzzleSpec, limit: number = 10): SolverResult
```

Algorithm:
1. Pick next cell to fill (simple order: iterate through cells)
2. Pick next tile from remaining inventory
3. Try all placement options (rotation/flip)
4. If compatible with neighbors, recurse
5. If no tiles left and all placed, found solution
6. Backtrack if stuck

**Test**:
```typescript
// Trivial puzzle: 2 straight tiles in a 2x1 space
const puzzle = {
  bounds: {width:2, height:1, depth:1},
  inventory: [{tileId:'straight', count:2}],
  fixedTiles: []
};
const result = solve(puzzle);
console.log(result.solutions.length); // Should be >= 1
console.log(result.stats); // Should show nodes explored, etc.
```

---

### Step 1.6: Solution Verification

Verify solutions using ConnectionValidator.

**File**: `src/puzzle/solver/verify.ts`

```typescript
function verifySolution(placements: Placement[]): boolean
// Converts to PlacedTile[], calls validateConnections()
```

**Test**:
```typescript
// Take a solution from Step 1.5
// Call verifySolution() - should return true
// Manually create invalid placement array
// Call verifySolution() - should return false
```

---

### Step 1.7: Integration & Export

Export solver from puzzle module, add logging.

**File**: `src/puzzle/solver/index.ts`

```typescript
export { solve } from './Solver';
export { verifySolution } from './verify';
export type { SolverState, SolverResult, SolverStats } from './types';
```

**Test**:
```typescript
// In browser console:
import { solve } from './puzzle';
const result = solve(testPuzzle);
// Verify works end-to-end
// Time a solve: console.time('solve'); solve(puzzle); console.timeEnd('solve');
```

---

### Step 1.8: Stats Collection

Track detailed statistics during search.

Update `Solver.ts` to increment:
- `nodesExplored` on each recursive call
- `backtracks` when returning without solution
- `maxDepth` tracking deepest recursion
- `forcedMoves` when only one option available

**Test**:
```typescript
const result = solve(puzzle);
console.log(result.stats);
// nodesExplored should be > 0
// For trivial puzzle, backtracks might be 0
// For harder puzzle, backtracks should be > 0
```

---

### Summary: Phase 1 Milestones

| Step | Deliverable | Success Criteria |
|------|-------------|------------------|
| 1.1 | Types | TypeScript compiles |
| 1.2 | Cell enum | Correct count, no dupes |
| 1.3 | Variants | Matches precompute output |
| 1.4 | Compat check | Rejects invalid neighbors |
| 1.5 | Backtracker | Finds solution for trivial puzzle |
| 1.6 | Verification | ConnectionValidator confirms solutions |
| 1.7 | Export | Importable from main code |
| 1.8 | Stats | Tracks search metrics |

After Phase 1: We have a working solver that finds solutions and collects difficulty metrics. Ready for Phase 2 (Generator).

---

## Testing Strategy

### Unit Tests
- Solver finds known solutions for hand-crafted puzzles
- Solver correctly reports "no solution" for impossible specs
- Propagation eliminates provably invalid options

### Integration Tests
- Generated puzzles are actually solvable
- Solutions pass ConnectionValidator
- Difficulty scores correlate with human perception

### Invariants
- Every returned puzzle has exactly one solution
- Solution uses all tiles in inventory
- Solution forms a closed network

---

## Using Existing Code

### From precompute/
- `CompatibilityBuilder.getCompatibility(variantA, variantB, direction)` - Core adjacency check
- `VariantGenerator.getVariants(tileId)` - All orientations of a tile

### From ConnectionValidator (src/game/ConnectionValidator.ts)

The existing validator handles all the complex world-space connector matching:

```typescript
validateConnections(tiles: PlacedTile[]): {
  valid: boolean;           // true = closed loop (no open connectors + all connected)
  openConnectors: [];       // unmatched connectors
  connectedPairs: [];       // matched connector pairs
}
```

**Usage in solver**:
1. **Fast path (during search)**: Use precomputed compatibility matrix to prune invalid placements
2. **Verification (on complete solutions)**: Call `validateConnections()` to confirm closed network

This avoids duplicating the rotation/flip/orientation logic that's already working correctly.

---

## Fixed Tiles & Hint System

### Fixed Tiles

Puzzles can have 0 or more pre-placed, locked tiles:

```typescript
interface PuzzleSpec {
  bounds: Bounds;
  inventory: TileSpec[];      // tiles player must place
  fixedTiles: Placement[];    // pre-placed, locked (can be empty)
}
```

**Usage**:
- **Easy puzzles**: Start with more fixed tiles (fewer decisions for player)
- **Hard puzzles**: 0-1 fixed tiles (figure it out yourself)
- **Forcing uniqueness**: If puzzle has multiple solutions, add fixed tile to constrain

### Progressive Hint System

When player is stuck, they can request hints:

1. Player requests hint
2. System picks one tile from the known solution
3. That tile gets placed and locked (becomes fixed)
4. Remaining puzzle is now simpler

**Hint selection strategy**:
- Prefer tiles that eliminate the most ambiguity
- Or prefer tiles that unlock "forced moves"
- Or just pick randomly from remaining solution tiles

This means the solver must store at least one complete solution to provide hints from.

---

## Open Questions

1. How to handle puzzles where orientation matters vs. just placement?
2. Performance target: how many puzzles/second should we generate?
3. Should difficulty be player-adaptive based on solve times?
