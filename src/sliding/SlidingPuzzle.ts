import { GENERATED_TILES, renderTileFromConfig } from '../tiles/TileBuilder';
import type { GeneratedTile, TileConfig, ConnectorPos } from '../tiles/TileBuilder';

export interface SlidingTile {
  tileId: string;
  rotation: number; // 0, 90, 180, 270
  flipped: boolean; // horizontally mirrored
}

export interface SlidingPuzzleState {
  grid: (SlidingTile | null)[][]; // null = empty space
  rows: number;
  cols: number;
  emptyPos: { row: number; col: number };
  moveCount: number;
  optimalMoves: number; // minimum moves to solve (set when shuffling)
  mode: 'edit' | 'play';
  solvedState: (SlidingTile | null)[][] | null; // saved when shuffling
}

// Flip a connector position (left <-> right, middle stays)
function flipConnectorPos(pos: ConnectorPos): ConnectorPos {
  if (pos === 'left') return 'right';
  if (pos === 'right') return 'left';
  return pos; // null or 'middle' unchanged
}

// Get transformed config (for connection checking)
// Applies flip first (horizontal mirror), then rotation
export function getTransformedConfig(config: TileConfig, rotation: number, flipped: boolean): TileConfig {
  let { top, right, bottom, left } = config;

  // Apply horizontal flip first
  // Flipping swaps left<->right edges and flips positions within top/bottom
  if (flipped) {
    const newTop = flipConnectorPos(top);
    const newRight = left; // right edge was left edge
    const newBottom = flipConnectorPos(bottom);
    const newLeft = right; // left edge was right edge
    top = newTop;
    right = newRight;
    bottom = newBottom;
    left = newLeft;
  }

  // Then apply rotation
  const steps = ((rotation % 360) + 360) % 360 / 90;
  for (let i = 0; i < steps; i++) {
    const newTop = left;
    const newRight = top;
    const newBottom = right;
    const newLeft = bottom;
    top = newTop;
    right = newRight;
    bottom = newBottom;
    left = newLeft;
  }

  return { top, right, bottom, left };
}

// Legacy function for compatibility
export function getRotatedConfig(config: TileConfig, rotation: number): TileConfig {
  return getTransformedConfig(config, rotation, false);
}

// Check if two adjacent tiles connect properly
export function tilesConnect(
  tile1: SlidingTile | null,
  tile2: SlidingTile | null,
  direction: 'right' | 'down'
): boolean {
  if (!tile1 || !tile2) return true; // empty space always "connects"

  const config1 = GENERATED_TILES.find(t => t.id === tile1.tileId)?.config;
  const config2 = GENERATED_TILES.find(t => t.id === tile2.tileId)?.config;
  if (!config1 || !config2) return false;

  const transformed1 = getTransformedConfig(config1, tile1.rotation, tile1.flipped);
  const transformed2 = getTransformedConfig(config2, tile2.rotation, tile2.flipped);

  if (direction === 'right') {
    // tile1's right edge must match tile2's left edge
    return transformed1.right === transformed2.left;
  } else {
    // tile1's bottom edge must match tile2's top edge
    return transformed1.bottom === transformed2.top;
  }
}

// Check if entire grid is solved (all connections valid, no open connectors on edges)
export function checkSolved(state: SlidingPuzzleState): { solved: boolean; errors: string[] } {
  const errors: string[] = [];
  const { grid, rows, cols } = state;

  // Check horizontal connections
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols - 1; col++) {
      if (!tilesConnect(grid[row][col], grid[row][col + 1], 'right')) {
        errors.push(`Mismatch at (${row},${col}) -> (${row},${col + 1})`);
      }
    }
  }

  // Check vertical connections
  for (let row = 0; row < rows - 1; row++) {
    for (let col = 0; col < cols; col++) {
      if (!tilesConnect(grid[row][col], grid[row + 1][col], 'down')) {
        errors.push(`Mismatch at (${row},${col}) -> (${row + 1},${col})`);
      }
    }
  }

  // Check edges - no open connectors pointing outward
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const tile = grid[row][col];
      if (!tile) continue;

      const config = GENERATED_TILES.find(t => t.id === tile.tileId)?.config;
      if (!config) continue;

      const transformed = getTransformedConfig(config, tile.rotation, tile.flipped);

      // Check boundary edges
      if (row === 0 && transformed.top !== null) {
        errors.push(`Open connector at top edge (${row},${col})`);
      }
      if (row === rows - 1 && transformed.bottom !== null) {
        errors.push(`Open connector at bottom edge (${row},${col})`);
      }
      if (col === 0 && transformed.left !== null) {
        errors.push(`Open connector at left edge (${row},${col})`);
      }
      if (col === cols - 1 && transformed.right !== null) {
        errors.push(`Open connector at right edge (${row},${col})`);
      }
    }
  }

  return { solved: errors.length === 0, errors };
}

// Get valid slides (tiles adjacent to empty space)
export function getValidSlides(state: SlidingPuzzleState): { row: number; col: number }[] {
  const { emptyPos, rows, cols, grid } = state;
  const valid: { row: number; col: number }[] = [];

  const directions = [
    { dr: -1, dc: 0 }, // above
    { dr: 1, dc: 0 },  // below
    { dr: 0, dc: -1 }, // left
    { dr: 0, dc: 1 },  // right
  ];

  for (const { dr, dc } of directions) {
    const row = emptyPos.row + dr;
    const col = emptyPos.col + dc;
    if (row >= 0 && row < rows && col >= 0 && col < cols && grid[row][col]) {
      valid.push({ row, col });
    }
  }

  return valid;
}

// Slide a tile into the empty space (returns new state)
// Every slide rotates the tile 90° clockwise
export function slideTile(
  state: SlidingPuzzleState,
  fromRow: number,
  fromCol: number
): SlidingPuzzleState | null {
  const { emptyPos, grid } = state;

  // Check if adjacent to empty
  const dr = Math.abs(fromRow - emptyPos.row);
  const dc = Math.abs(fromCol - emptyPos.col);
  if (dr + dc !== 1) return null; // not adjacent

  const tile = grid[fromRow][fromCol];
  if (!tile) return null;

  // Create new grid
  const newGrid = grid.map(row => [...row]);

  // Move tile to empty space, rotate 90° clockwise
  newGrid[emptyPos.row][emptyPos.col] = {
    tileId: tile.tileId,
    rotation: (tile.rotation + 90) % 360,
    flipped: tile.flipped
  };
  newGrid[fromRow][fromCol] = null;

  return {
    ...state,
    grid: newGrid,
    emptyPos: { row: fromRow, col: fromCol },
    moveCount: state.moveCount + 1
  };
}

// Shuffle by applying random valid slides (guarantees solvability)
// Returns state with optimalMoves set to the number of shuffle moves
export function shufflePuzzle(state: SlidingPuzzleState, moves: number): SlidingPuzzleState {
  let current = { ...state, solvedState: state.grid.map(row => row.map(t => t ? { ...t } : null)) };
  let lastMove: { row: number; col: number } | null = null;
  let actualMoves = 0;

  for (let i = 0; i < moves; i++) {
    const validSlides = getValidSlides(current);

    // Filter out the reverse of the last move to avoid back-and-forth
    const filtered = validSlides.filter(
      pos => !lastMove || pos.row !== lastMove.row || pos.col !== lastMove.col
    );

    const candidates = filtered.length > 0 ? filtered : validSlides;
    const chosen = candidates[Math.floor(Math.random() * candidates.length)];

    // Remember the empty position before slide (this is where the tile will go)
    lastMove = { row: current.emptyPos.row, col: current.emptyPos.col };

    const newState = slideTile(current, chosen.row, chosen.col);
    if (newState) {
      current = newState;
      actualMoves++;
    }
  }

  current.moveCount = 0;
  current.optimalMoves = actualMoves; // solving in reverse takes same number of moves
  current.mode = 'play';
  return current;
}

// Create empty puzzle state
export function createEmptyState(rows: number, cols: number): SlidingPuzzleState {
  const grid: (SlidingTile | null)[][] = [];
  for (let row = 0; row < rows; row++) {
    grid.push(new Array(cols).fill(null));
  }

  return {
    grid,
    rows,
    cols,
    emptyPos: { row: rows - 1, col: cols - 1 }, // bottom-right
    moveCount: 0,
    optimalMoves: 0,
    mode: 'edit',
    solvedState: null
  };
}

// Render a tile to canvas with rotation and optional flip
export function renderTileWithRotation(
  tileId: string,
  rotation: number,
  size: number,
  flipped: boolean = false
): HTMLCanvasElement {
  const tile = GENERATED_TILES.find(t => t.id === tileId);
  if (!tile) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    return canvas;
  }

  // Render base tile
  const base = renderTileFromConfig(tile.config, size, false);

  if (rotation === 0 && !flipped) return base;

  // Create transformed canvas
  const transformed = document.createElement('canvas');
  transformed.width = size;
  transformed.height = size;
  const ctx = transformed.getContext('2d')!;

  ctx.translate(size / 2, size / 2);

  // Apply flip first (horizontal mirror)
  if (flipped) {
    ctx.scale(-1, 1);
  }

  // Then rotation
  ctx.rotate((rotation * Math.PI) / 180);

  ctx.translate(-size / 2, -size / 2);
  ctx.drawImage(base, 0, 0);

  return transformed;
}
