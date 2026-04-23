// Generate all tile variants with pre-computed connector positions
import { GENERATED_TILES, type TileConfig, type ConnectorPos } from '../../tiles/TileBuilder';
import type {
  TileVariant,
  TileRecord,
  LocalConnector,
  Orientation,
  Rotation,
  Edge,
  Vec3,
  VariantKey
} from '../types';
import { variantKey } from '../types';

const ROTATIONS: Rotation[] = [0, 90, 180, 270];
const ORIENTATIONS: Orientation[] = ['flat', 'vertical-x', 'vertical-z'];
const EDGES: Edge[] = ['top', 'right', 'bottom', 'left'];

// Corner offset from center (matches TileBuilder's 0.18 for 128px tiles, normalized to unit tile)
const CORNER_OFFSET = 0.18;

// Get the position offset for a connector position
function getPositionOffset(pos: ConnectorPos): number {
  if (pos === 'left') return -CORNER_OFFSET;
  if (pos === 'middle') return 0;
  if (pos === 'right') return CORNER_OFFSET;
  return 0;
}

// Compute local 2D position for a connector on an edge (before rotation/flip)
// Tile is centered at origin, from -0.5 to +0.5
function getLocalPosition(edge: Edge, pos: ConnectorPos): { localX: number; localY: number } | null {
  if (pos === null) return null;

  const posOffset = getPositionOffset(pos);

  switch (edge) {
    case 'top':    return { localX: posOffset,  localY: 0.5 };
    case 'bottom': return { localX: -posOffset, localY: -0.5 };
    case 'right':  return { localX: 0.5,        localY: -posOffset };
    case 'left':   return { localX: -0.5,       localY: posOffset };
    default: return null;
  }
}

// Apply flip transformation (vertical mirror = negate Y)
function applyFlip(localX: number, localY: number, flipped: boolean): { x: number; y: number } {
  if (flipped) {
    return { x: localX, y: -localY };
  }
  return { x: localX, y: localY };
}

// Apply rotation (counterclockwise, matching Three.js convention)
function applyRotation(x: number, y: number, rotation: Rotation): { x: number; y: number } {
  const rotRad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rotRad);
  const sin = Math.sin(rotRad);
  return {
    x: x * cos - y * sin,
    y: x * sin + y * cos
  };
}

// Transform from local 2D to world 3D offset based on orientation
// Returns offset from cell origin (not absolute world position)
function localToWorldOffset(rx: number, ry: number, orientation: Orientation): Vec3 {
  switch (orientation) {
    case 'flat':
      // Flat tile lies on XZ plane at height y
      // Tile center at (0.5, 0, 0.5) relative to cell origin
      return {
        x: 0.5 + rx,
        y: 0,
        z: 0.5 - ry
      };

    case 'vertical-x':
      // Vertical-X stands on +X edge of cell, faces -X direction
      // Tile plane at x+1, center at (1, 0.5, 0.5)
      return {
        x: 1,
        y: 0.5 + ry,
        z: 0.5 + rx
      };

    case 'vertical-z':
      // Vertical-Z stands on +Z edge of cell, faces -Z direction
      // Tile plane at z+1, center at (0.5, 0.5, 1)
      return {
        x: 0.5 - rx,
        y: 0.5 + ry,
        z: 1
      };

    default:
      return { x: 0, y: 0, z: 0 };
  }
}

// Compute world offset for a connector on a tile variant
function computeConnectorWorldOffset(
  edge: Edge,
  pos: ConnectorPos,
  rotation: Rotation,
  flipped: boolean,
  orientation: Orientation
): Vec3 | null {
  // Step 1: Get local 2D position
  const local = getLocalPosition(edge, pos);
  if (!local) return null;

  // Step 2: Apply flip
  const flipped2D = applyFlip(local.localX, local.localY, flipped);

  // Step 3: Apply rotation
  const rotated = applyRotation(flipped2D.x, flipped2D.y, rotation);

  // Step 4: Transform to 3D world offset
  return localToWorldOffset(rotated.x, rotated.y, orientation);
}

// Generate all connectors for a tile variant
function generateConnectors(
  config: TileConfig,
  rotation: Rotation,
  flipped: boolean,
  orientation: Orientation
): LocalConnector[] {
  const connectors: LocalConnector[] = [];

  for (const edge of EDGES) {
    const pos = config[edge];
    if (pos === null) continue;

    const worldOffset = computeConnectorWorldOffset(edge, pos, rotation, flipped, orientation);
    if (worldOffset) {
      connectors.push({
        edge,
        position: pos,
        worldOffset
      });
    }
  }

  return connectors;
}

// Generate a signature for a variant's connector pattern (for symmetry detection)
function getConnectorSignature(connectors: LocalConnector[]): string {
  // Sort and stringify connector positions for comparison
  const sorted = connectors
    .map(c => `${c.worldOffset.x.toFixed(4)},${c.worldOffset.y.toFixed(4)},${c.worldOffset.z.toFixed(4)}`)
    .sort();
  return sorted.join('|');
}

// Generate all unique variants for a single tile
function generateTileVariants(tileId: string, config: TileConfig): TileVariant[] {
  const variants: TileVariant[] = [];
  const seenSignatures = new Set<string>();

  for (const orientation of ORIENTATIONS) {
    for (const rotation of ROTATIONS) {
      for (const flipped of [false, true]) {
        const connectors = generateConnectors(config, rotation, flipped, orientation);
        const signature = `${orientation}:${getConnectorSignature(connectors)}`;

        // Skip duplicate connector patterns (symmetry)
        if (seenSignatures.has(signature)) continue;
        seenSignatures.add(signature);

        const key = variantKey(tileId, rotation, flipped, orientation);

        variants.push({
          tileId,
          rotation,
          flipped,
          orientation,
          connectors,
          key
        });
      }
    }
  }

  return variants;
}

// Generate tile records for all tiles
export function generateAllTileRecords(): Map<string, TileRecord> {
  const records = new Map<string, TileRecord>();

  for (const tile of GENERATED_TILES) {
    const variants = generateTileVariants(tile.id, tile.config);

    // Calculate symmetry order (how many rotations produce unique patterns)
    // Max possible = 24 (4 rotations × 2 flips × 3 orientations)
    // If symmetry exists, fewer unique variants
    const symmetryOrder = 24 / variants.length;

    records.set(tile.id, {
      id: tile.id,
      config: tile.config,
      variants,
      symmetryOrder
    });
  }

  return records;
}

// Get all variants as a flat map
export function getAllVariants(records: Map<string, TileRecord>): Map<VariantKey, TileVariant> {
  const variants = new Map<VariantKey, TileVariant>();

  for (const record of records.values()) {
    for (const variant of record.variants) {
      variants.set(variant.key, variant);
    }
  }

  return variants;
}

// Export pre-computed data
let _tileRecords: Map<string, TileRecord> | null = null;
let _allVariants: Map<VariantKey, TileVariant> | null = null;

export function getTileRecords(): Map<string, TileRecord> {
  if (!_tileRecords) {
    _tileRecords = generateAllTileRecords();
  }
  return _tileRecords;
}

export function getVariants(): Map<VariantKey, TileVariant> {
  if (!_allVariants) {
    _allVariants = getAllVariants(getTileRecords());
  }
  return _allVariants;
}

// Get a specific variant
export function getVariant(key: VariantKey): TileVariant | undefined {
  return getVariants().get(key);
}

// Get all variants for a tile
export function getTileVariants(tileId: string): TileVariant[] {
  const record = getTileRecords().get(tileId);
  return record?.variants ?? [];
}

// Get tile config
export function getTileConfig(tileId: string): TileConfig | undefined {
  const record = getTileRecords().get(tileId);
  return record?.config;
}

// Get all tile IDs
export function getAllTileIds(): string[] {
  return GENERATED_TILES.map(t => t.id);
}

// Get connector count for a tile
export function getConnectorCount(tileId: string): number {
  const config = getTileConfig(tileId);
  if (!config) return 0;
  return EDGES.filter(e => config[e] !== null).length;
}
