// Puzzle System - Types, Precompute, and Solver

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
  DifficultyLevel
} from './types';

// Precompute API
export {
  getTileRecords,
  getVariants,
  getTileVariants,
  getTileConfig,
  getAllTileIds,
  getConnectorCount
} from './precompute';

// Solver API
export {
  solve,
  enumeratePositions,
  isValidSolution
} from './solver';
