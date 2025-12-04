// Build compatibility matrix for tile variants
// Determines which tile variants can be adjacent in each direction

import type {
  TileVariant,
  LocalConnector,
  Direction,
  VariantKey,
  Orientation,
  Vec3,
  CompatibilityMatrix
} from '../types';
import { getVariants } from './VariantGenerator';

// Tolerance for matching connector positions
const TOLERANCE = 0.01;

// Direction vectors in world space
const DIRECTION_VECTORS: Record<Direction, Vec3> = {
  posX: { x: 1, y: 0, z: 0 },
  negX: { x: -1, y: 0, z: 0 },
  posY: { x: 0, y: 1, z: 0 },
  negY: { x: 0, y: -1, z: 0 },
  posZ: { x: 0, y: 0, z: 1 },
  negZ: { x: 0, y: 0, z: -1 }
};

// Opposite directions
const OPPOSITE_DIRECTION: Record<Direction, Direction> = {
  posX: 'negX',
  negX: 'posX',
  posY: 'negY',
  negY: 'posY',
  posZ: 'negZ',
  negZ: 'posZ'
};

// Get the directions relevant for a given orientation
// Flat tiles connect horizontally (posX, negX, posZ, negZ)
// Vertical tiles can connect vertically and horizontally
function getRelevantDirections(orientation: Orientation): Direction[] {
  switch (orientation) {
    case 'flat':
      return ['posX', 'negX', 'posZ', 'negZ'];
    case 'vertical-x':
      return ['posY', 'negY', 'posZ', 'negZ'];
    case 'vertical-z':
      return ['posX', 'negX', 'posY', 'negY'];
    default:
      return [];
  }
}

// Check if a connector is on the boundary facing a given direction
function connectorFacesDirection(connector: LocalConnector, direction: Direction, orientation: Orientation): boolean {
  const offset = connector.worldOffset;
  const threshold = 0.4; // Connectors are at 0.5 from center

  switch (orientation) {
    case 'flat':
      // Flat tiles: connectors on edges at y=0
      if (direction === 'posX') return offset.x > threshold;
      if (direction === 'negX') return offset.x < 1 - threshold;
      if (direction === 'posZ') return offset.z > threshold;
      if (direction === 'negZ') return offset.z < 1 - threshold;
      break;

    case 'vertical-x':
      // Vertical-X: at x=1, extends in Y and Z
      if (direction === 'posY') return offset.y > threshold;
      if (direction === 'negY') return offset.y < 1 - threshold;
      if (direction === 'posZ') return offset.z > threshold;
      if (direction === 'negZ') return offset.z < 1 - threshold;
      break;

    case 'vertical-z':
      // Vertical-Z: at z=1, extends in X and Y
      if (direction === 'posX') return offset.x > threshold;
      if (direction === 'negX') return offset.x < 1 - threshold;
      if (direction === 'posY') return offset.y > threshold;
      if (direction === 'negY') return offset.y < 1 - threshold;
      break;
  }

  return false;
}

// Get connectors facing a specific direction
function getConnectorsFacingDirection(variant: TileVariant, direction: Direction): LocalConnector[] {
  return variant.connectors.filter(c => connectorFacesDirection(c, direction, variant.orientation));
}

// Check if two connectors match when variants are adjacent in given direction
// Connector from variant1 facing direction should match connector from variant2 facing opposite
function connectorsMatch(
  conn1: LocalConnector,
  _variant1Orientation: Orientation,
  conn2: LocalConnector,
  _variant2Orientation: Orientation,
  direction: Direction
): boolean {
  const dirVec = DIRECTION_VECTORS[direction];

  // Position where connector would be in world space (relative to cell origin)
  // For variant1 at (0,0,0), connector is at conn1.worldOffset
  // For variant2 at (dirVec), connector is at dirVec + conn2.worldOffset

  // They match if the connector positions are the same
  const pos1 = conn1.worldOffset;
  const pos2 = {
    x: dirVec.x + conn2.worldOffset.x,
    y: dirVec.y + conn2.worldOffset.y,
    z: dirVec.z + conn2.worldOffset.z
  };

  return (
    Math.abs(pos1.x - pos2.x) < TOLERANCE &&
    Math.abs(pos1.y - pos2.y) < TOLERANCE &&
    Math.abs(pos1.z - pos2.z) < TOLERANCE
  );
}

// Check if two variants can be adjacent in the given direction
// Both variants must have matching connectors, or both have no connectors facing that direction
function variantsCompatible(variant1: TileVariant, variant2: TileVariant, direction: Direction): boolean {
  const conns1 = getConnectorsFacingDirection(variant1, direction);
  const conns2 = getConnectorsFacingDirection(variant2, OPPOSITE_DIRECTION[direction]);

  // If neither has connectors in this direction, they're compatible (no connection needed)
  if (conns1.length === 0 && conns2.length === 0) {
    return true;
  }

  // If one has connectors and other doesn't, incompatible (open connector)
  if (conns1.length === 0 || conns2.length === 0) {
    return false;
  }

  // Both have connectors - they must all match
  // For now, assume each direction has at most one connector per variant
  // (This is true for most tile configurations)
  if (conns1.length !== conns2.length) {
    return false;
  }

  // Check each connector pair matches
  for (const c1 of conns1) {
    let matched = false;
    for (const c2 of conns2) {
      if (connectorsMatch(c1, variant1.orientation, c2, variant2.orientation, direction)) {
        matched = true;
        break;
      }
    }
    if (!matched) return false;
  }

  return true;
}

// Build the full compatibility matrix
export function buildCompatibilityMatrix(): CompatibilityMatrix {
  const variants = getVariants();
  const data = new Map<VariantKey, Map<Direction, Set<VariantKey>>>();

  // Initialize
  for (const variant of variants.values()) {
    const dirMap = new Map<Direction, Set<VariantKey>>();
    for (const dir of getRelevantDirections(variant.orientation)) {
      dirMap.set(dir, new Set());
    }
    data.set(variant.key, dirMap);
  }

  // Check all pairs
  const variantList = [...variants.values()];

  for (const v1 of variantList) {
    const dirs = getRelevantDirections(v1.orientation);

    for (const v2 of variantList) {
      // Check compatibility in each direction
      for (const dir of dirs) {
        if (variantsCompatible(v1, v2, dir)) {
          data.get(v1.key)!.get(dir)!.add(v2.key);
        }
      }
    }
  }

  return { data };
}

// Index variants by connector signature for fast lookup
export function buildConnectorIndex(): Map<string, Set<VariantKey>> {
  const variants = getVariants();
  const index = new Map<string, Set<VariantKey>>();

  for (const variant of variants.values()) {
    for (const conn of variant.connectors) {
      // Create signature based on world offset position
      const sig = `${conn.worldOffset.x.toFixed(3)},${conn.worldOffset.y.toFixed(3)},${conn.worldOffset.z.toFixed(3)}`;

      if (!index.has(sig)) {
        index.set(sig, new Set());
      }
      index.get(sig)!.add(variant.key);
    }
  }

  return index;
}

// Cached instances
let _compatibilityMatrix: CompatibilityMatrix | null = null;
let _connectorIndex: Map<string, Set<VariantKey>> | null = null;

export function getCompatibilityMatrix(): CompatibilityMatrix {
  if (!_compatibilityMatrix) {
    _compatibilityMatrix = buildCompatibilityMatrix();
  }
  return _compatibilityMatrix;
}

export function getConnectorIndex(): Map<string, Set<VariantKey>> {
  if (!_connectorIndex) {
    _connectorIndex = buildConnectorIndex();
  }
  return _connectorIndex;
}

// Get compatible variants for a given variant in a direction
export function getCompatibleVariants(variantKey: VariantKey, direction: Direction): Set<VariantKey> {
  const matrix = getCompatibilityMatrix();
  return matrix.data.get(variantKey)?.get(direction) ?? new Set();
}

// Get all variants that have a connector at a specific world offset
export function getVariantsWithConnectorAt(worldOffset: Vec3): Set<VariantKey> {
  const index = getConnectorIndex();
  const sig = `${worldOffset.x.toFixed(3)},${worldOffset.y.toFixed(3)},${worldOffset.z.toFixed(3)}`;
  return index.get(sig) ?? new Set();
}
