// Puzzle System - Types and Precompute only
// Generator and solver have been deleted - to be rebuilt

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
