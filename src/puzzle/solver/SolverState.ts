// Solver state representation
// Tracks domains (possible variants for each cell), placements, and tile availability

import type {
  Puzzle,
  Placement,
  VariantKey,
  CellOrientationKey,
  CellKey,
  Vec3,
  Orientation,
  Bounds,
  Solution
} from '../types';
import { cellOrientationKey, cellKey, parseCellOrientation, variantKey } from '../types';
import { getTileVariants } from '../precompute';
import { UnionFind } from '../utils/UnionFind';

export class SolverState {
  // Domain: for each (cell, orientation) slot, which variants are possible
  domains: Map<CellOrientationKey, Set<VariantKey>>;

  // Current placements
  placements: Map<CellOrientationKey, Placement>;

  // Available tiles (how many of each can still be placed)
  availableTiles: Map<string, number>;

  // Grid bounds
  bounds: Bounds;

  // Connectivity tracking
  connectivity: UnionFind<CellKey>;

  // Track which cells have any placement
  occupiedCells: Set<CellKey>;

  constructor(puzzle: Puzzle) {
    this.domains = new Map();
    this.placements = new Map();
    this.availableTiles = new Map();
    this.connectivity = new UnionFind();
    this.occupiedCells = new Set();
    this.bounds = puzzle.gridBounds;

    // Initialize available tiles from puzzle
    for (const spec of puzzle.tiles) {
      this.availableTiles.set(spec.tileId, spec.count);
    }

    // Initialize domains for all cells within bounds
    this.initializeDomains(puzzle);

    // Apply fixed placements
    for (const placement of puzzle.fixedPlacements) {
      this.applyPlacement(placement, true);
    }
  }

  private initializeDomains(puzzle: Puzzle): void {
    const { min, max } = this.bounds;
    const orientations: Orientation[] = ['flat', 'vertical-x', 'vertical-z'];

    // Get all tile IDs we can use
    const tileIds = puzzle.tiles.map(t => t.tileId);

    for (let x = min.x; x <= max.x; x++) {
      for (let y = min.y; y <= max.y; y++) {
        for (let z = min.z; z <= max.z; z++) {
          for (const orientation of orientations) {
            const key = cellOrientationKey(x, y, z, orientation);
            const domain = new Set<VariantKey>();

            // Add all variants of available tiles
            for (const tileId of tileIds) {
              const variants = getTileVariants(tileId);
              for (const variant of variants) {
                if (variant.orientation === orientation) {
                  domain.add(variant.key);
                }
              }
            }

            this.domains.set(key, domain);
          }
        }
      }
    }
  }

  // Apply a placement (reduces domains, updates availability)
  applyPlacement(placement: Placement, isFixed: boolean = false): boolean {
    const { cell, orientation, tileId, rotation, flipped } = placement;
    const key = cellOrientationKey(cell.x, cell.y, cell.z, orientation);
    const vKey = variantKey(tileId, rotation, flipped, orientation);

    // Check if this variant is in the domain
    const domain = this.domains.get(key);
    if (!domain || !domain.has(vKey)) {
      return false;
    }

    // Check tile availability
    const available = this.availableTiles.get(tileId) ?? 0;
    if (available <= 0 && !isFixed) {
      return false;
    }

    // Apply the placement
    this.placements.set(key, placement);

    // Reduce domain to just this variant
    this.domains.set(key, new Set([vKey]));

    // Update availability
    if (!isFixed) {
      this.availableTiles.set(tileId, available - 1);
    }

    // Track occupied cell
    const cKey = cellKey(cell.x, cell.y, cell.z);
    this.occupiedCells.add(cKey);
    this.connectivity.add(cKey);

    return true;
  }

  // Remove a placement (restore domains would be complex, so we use cloning instead)
  // This is mainly for reference - actual backtracking uses clone()

  // Check if a cell/orientation slot is placed
  isPlaced(x: number, y: number, z: number, orientation: Orientation): boolean {
    const key = cellOrientationKey(x, y, z, orientation);
    return this.placements.has(key);
  }

  // Check if any orientation at a cell is placed
  isCellOccupied(x: number, y: number, z: number): boolean {
    return this.occupiedCells.has(cellKey(x, y, z));
  }

  // Get domain for a cell/orientation
  getDomain(x: number, y: number, z: number, orientation: Orientation): Set<VariantKey> {
    const key = cellOrientationKey(x, y, z, orientation);
    return this.domains.get(key) ?? new Set();
  }

  // Set domain (for constraint propagation)
  setDomain(x: number, y: number, z: number, orientation: Orientation, domain: Set<VariantKey>): void {
    const key = cellOrientationKey(x, y, z, orientation);
    this.domains.set(key, domain);
  }

  // Get remaining tile count
  getRemainingCount(tileId: string): number {
    return this.availableTiles.get(tileId) ?? 0;
  }

  // Get total remaining tiles to place
  getTotalRemainingTiles(): number {
    let total = 0;
    for (const count of this.availableTiles.values()) {
      total += count;
    }
    return total;
  }

  // Check if solved (all tiles placed)
  isSolved(): boolean {
    return this.getTotalRemainingTiles() === 0;
  }

  // Check if any domain is empty (contradiction)
  hasContradiction(): boolean {
    // Only check domains for cells that still need to be filled
    // A domain can be empty if it's already placed (domain = singleton of placed variant)
    for (const [key, domain] of this.domains) {
      if (domain.size === 0) {
        // Check if this slot is placed
        if (!this.placements.has(key)) {
          return true;
        }
      }
    }
    return false;
  }

  // Get all unplaced slots with their domains
  getUnplacedSlots(): Array<{ key: CellOrientationKey; domain: Set<VariantKey>; cell: Vec3; orientation: Orientation }> {
    const result: Array<{ key: CellOrientationKey; domain: Set<VariantKey>; cell: Vec3; orientation: Orientation }> = [];

    for (const [key, domain] of this.domains) {
      if (!this.placements.has(key) && domain.size > 0) {
        const { cell, orientation } = parseCellOrientation(key);
        result.push({ key, domain, cell, orientation });
      }
    }

    return result;
  }

  // Clone the state for backtracking
  clone(): SolverState {
    const copy = Object.create(SolverState.prototype) as SolverState;

    // Deep clone domains
    copy.domains = new Map();
    for (const [key, domain] of this.domains) {
      copy.domains.set(key, new Set(domain));
    }

    // Clone placements
    copy.placements = new Map(this.placements);

    // Clone available tiles
    copy.availableTiles = new Map(this.availableTiles);

    // Clone bounds (immutable, can share reference)
    copy.bounds = this.bounds;

    // Clone connectivity
    copy.connectivity = this.connectivity.clone();

    // Clone occupied cells
    copy.occupiedCells = new Set(this.occupiedCells);

    return copy;
  }

  // Extract solution from current state
  toSolution(): Solution {
    const placements: Placement[] = [];

    for (const placement of this.placements.values()) {
      placements.push({ ...placement });
    }

    return { placements };
  }

  // Connect two cells (for connectivity tracking when connectors match)
  connectCells(cell1: Vec3, cell2: Vec3): void {
    const key1 = cellKey(cell1.x, cell1.y, cell1.z);
    const key2 = cellKey(cell2.x, cell2.y, cell2.z);
    this.connectivity.add(key1);
    this.connectivity.add(key2);
    this.connectivity.union(key1, key2);
  }

  // Check if all placed tiles are connected
  isFullyConnected(): boolean {
    if (this.occupiedCells.size <= 1) return true;
    return this.connectivity.componentCount === 1;
  }

  // Get number of connected components
  getComponentCount(): number {
    return this.connectivity.componentCount;
  }
}

// Create initial state from puzzle
export function createSolverState(puzzle: Puzzle): SolverState {
  return new SolverState(puzzle);
}
