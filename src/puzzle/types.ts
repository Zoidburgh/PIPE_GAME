// Puzzle system types
import type { TileConfig, ConnectorPos } from '../tiles/TileBuilder';

// ============= Basic Types =============

export type Orientation = 'flat' | 'vertical-x' | 'vertical-z';
export type Rotation = 0 | 90 | 180 | 270;
export type Edge = 'top' | 'right' | 'bottom' | 'left';
export type DifficultyLevel = 'easy' | 'medium' | 'hard' | 'expert';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

// Cell key format: "x,y,z"
export type CellKey = string;
// Cell+orientation key format: "x,y,z,orientation"
export type CellOrientationKey = string;
// Variant key format: "tileId:rotation:flipped:orientation"
export type VariantKey = string;
// Connector signature format: "edge:position:orientation"
export type ConnectorSignature = string;

// ============= Tile Variant Types =============

// A specific configuration of a tile (rotation, flip, orientation applied)
export interface TileVariant {
  tileId: string;
  rotation: Rotation;
  flipped: boolean;
  orientation: Orientation;
  // Pre-computed connectors in local coordinates
  connectors: LocalConnector[];
  // Unique signature for this variant
  key: VariantKey;
}

// Connector in local tile coordinates (before world transform)
export interface LocalConnector {
  edge: Edge;
  position: ConnectorPos;
  // Offset from cell origin in world units
  worldOffset: Vec3;
}

// ============= Placement Types =============

export interface Placement {
  cell: Vec3;
  orientation: Orientation;
  tileId: string;
  rotation: Rotation;
  flipped: boolean;
}

export interface Bounds {
  min: Vec3;
  max: Vec3;
}

// ============= Puzzle Types =============

export interface TileSpec {
  tileId: string;
  count: number;
}

export interface Puzzle {
  mode: 'arrange' | 'complete';
  // Tiles available to place
  tiles: TileSpec[];
  // Already placed tiles (for 'complete' mode)
  fixedPlacements: Placement[];
  // Grid boundaries
  gridBounds: Bounds;
  // Optional starting hint
  hint?: Placement;
  // Metadata
  metadata?: PuzzleMetadata;
}

export interface PuzzleMetadata {
  id: string;
  name?: string;
  difficulty: DifficultyLevel;
  category: 'flat' | '3d' | 'mixed';
  size: 'small' | 'medium' | 'large';
  createdAt?: Date;
}

// ============= Solution Types =============

export interface Solution {
  placements: Placement[];
  metadata?: SolutionMetadata;
}

export interface SolutionMetadata {
  solveTimeMs?: number;
  backtracks?: number;
  searchDepth?: number;
  canonical?: string;
}

// ============= Solver Types =============

export interface SolverOptions {
  mode?: 'first' | 'count' | 'all';  // defaults to 'first'
  maxSolutions?: number;
  timeoutMs?: number;
  trace?: boolean;
}

export interface SolveTrace {
  maxBacktrackDepth: number;
  totalBacktracks: number;
  nodesExplored: number;
  propagationCalls: number;
}

export interface SolverResult {
  solutions: Solution[];
  solutionCount: number;
  trace?: SolveTrace;
  timedOut: boolean;
}

// ============= Generator Types =============

export interface GenerationConfig {
  size: { min: number; max: number };
  mode: 'arrange' | 'complete';
  difficulty?: DifficultyLevel;
  allow3D: boolean;
  maxHeight?: number;
  tilePool?: string[];  // Restrict to specific tile IDs
  requireUniqueSolution?: boolean;
  minInterestingness?: number;
  // Network complexity options
  allowEndCaps?: boolean;   // If false, only generate closed loops (default: true)
  allow3Way?: boolean;      // Allow 3-way junction tiles (default: false)
  allow4Way?: boolean;      // Allow 4-way junction tiles (default: false)
}

// ============= Analysis Types =============

export interface PuzzleAnalysis {
  solvable: boolean;
  solutionCount: number;
  uniqueSolutions: number;  // Excluding equivalent solutions
  difficulty: DifficultyLevel;
  interestingness: InterestingnessScore;
  issues: CheeseIssue[];
  trace?: SolveTrace;
}

export interface InterestingnessScore {
  total: number;  // 0-100
  components: InterestingnessComponents;
}

export interface InterestingnessComponents {
  solutionUniqueness: number;
  searchDepth: number;
  redHerrings: number;
  spatialComplexity: number;
  tileInteraction: number;
  constraintBalance: number;
}

export interface CheeseIssue {
  type: 'line' | 'single_type' | 'no_paths' | 'forced_move' | 'trivial';
  description: string;
}

// ============= Pre-computed Data Types =============

export interface TileRecord {
  id: string;
  config: TileConfig;
  variants: TileVariant[];
  symmetryOrder: number;  // How many unique rotations (1, 2, or 4)
}

export interface TileDatabase {
  // All tiles indexed by ID
  tiles: Map<string, TileRecord>;
  // All variants for quick lookup
  variants: Map<VariantKey, TileVariant>;
  // Which variants can be adjacent in each direction
  compatibility: CompatibilityMatrix;
  // Lookup by connector: which variants have connector at position
  variantsByConnector: Map<ConnectorSignature, Set<VariantKey>>;
}

export interface CompatibilityMatrix {
  // For each variant, map of direction -> compatible variant keys
  data: Map<VariantKey, Map<Direction, Set<VariantKey>>>;
}

// Direction in 3D space
export type Direction = 'posX' | 'negX' | 'posY' | 'negY' | 'posZ' | 'negZ';

// ============= Utility Types =============

export function cellKey(x: number, y: number, z: number): CellKey {
  return `${x},${y},${z}`;
}

export function cellOrientationKey(x: number, y: number, z: number, o: Orientation): CellOrientationKey {
  return `${x},${y},${z},${o}`;
}

export function variantKey(tileId: string, rotation: Rotation, flipped: boolean, orientation: Orientation): VariantKey {
  return `${tileId}:${rotation}:${flipped}:${orientation}`;
}

export function connectorSignature(edge: Edge, position: ConnectorPos, orientation: Orientation): ConnectorSignature {
  return `${edge}:${position}:${orientation}`;
}

export function parseCell(key: CellKey): Vec3 {
  const [x, y, z] = key.split(',').map(Number);
  return { x, y, z };
}

export function parseCellOrientation(key: CellOrientationKey): { cell: Vec3; orientation: Orientation } {
  const parts = key.split(',');
  return {
    cell: { x: Number(parts[0]), y: Number(parts[1]), z: Number(parts[2]) },
    orientation: parts[3] as Orientation
  };
}
