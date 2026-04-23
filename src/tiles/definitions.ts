import type { TileDefinition } from './types';

// Based on your tile set image, here are the tile definitions
// Connection points: corners are at edges, mid-points are center of edges

// Edge positions (normalized)
const TOP = { x: 0, y: 1 };
const BOTTOM = { x: 0, y: -1 };
const LEFT = { x: -1, y: 0 };
const RIGHT = { x: 1, y: 0 };
const TOP_LEFT = { x: -0.7, y: 1 };
const TOP_RIGHT = { x: 0.7, y: 1 };
const BOTTOM_LEFT = { x: -0.7, y: -1 };
const BOTTOM_RIGHT = { x: 0.7, y: -1 };
const LEFT_TOP = { x: -1, y: 0.7 };
const LEFT_BOTTOM = { x: -1, y: -0.7 };
const RIGHT_TOP = { x: 1, y: 0.7 };
const RIGHT_BOTTOM = { x: 1, y: -0.7 };

export const TILE_DEFINITIONS: TileDefinition[] = [
  // Row 1 - Green pipes
  {
    id: 'green-loop-double',
    name: 'Double Loop',
    color: 'green',
    connections: [
      { ...TOP_LEFT, type: 'black' },
      { ...TOP_RIGHT, type: 'orange' },
    ],
    paths: [{ from: 0, to: 0, controlPoints: [{ x: -0.3, y: 0 }, { x: -0.3, y: 0.5 }] }],
  },
  {
    id: 'green-cross-twist',
    name: 'Cross Twist',
    color: 'green',
    connections: [
      { ...TOP_LEFT, type: 'black' },
      { ...TOP_RIGHT, type: 'black' },
      { ...BOTTOM_LEFT, type: 'orange' },
      { ...BOTTOM_RIGHT, type: 'orange' },
    ],
    paths: [
      { from: 0, to: 3 },
      { from: 1, to: 2 },
    ],
  },
  {
    id: 'green-loop-cross',
    name: 'Loop Cross',
    color: 'green',
    connections: [
      { ...TOP, type: 'black' },
      { ...BOTTOM_LEFT, type: 'orange' },
      { ...BOTTOM_RIGHT, type: 'orange' },
    ],
    paths: [
      { from: 0, to: 1 },
      { from: 0, to: 2 },
    ],
  },
  {
    id: 'green-s-curve',
    name: 'S Curve',
    color: 'green',
    connections: [
      { ...TOP_LEFT, type: 'black' },
      { ...TOP_RIGHT, type: 'black' },
      { ...BOTTOM_LEFT, type: 'orange' },
      { ...BOTTOM_RIGHT, type: 'orange' },
    ],
    paths: [
      { from: 0, to: 2, controlPoints: [{ x: -0.5, y: 0 }] },
      { from: 1, to: 3, controlPoints: [{ x: 0.5, y: 0 }] },
    ],
  },
  {
    id: 'green-snake',
    name: 'Snake',
    color: 'green',
    connections: [
      { ...LEFT_TOP, type: 'black' },
      { ...RIGHT_BOTTOM, type: 'orange' },
    ],
    paths: [
      { from: 0, to: 1, controlPoints: [{ x: 0, y: 0.3 }, { x: 0, y: -0.3 }] },
    ],
  },

  // Row 2 - Green pipes continued
  {
    id: 'green-bulge-double',
    name: 'Double Bulge',
    color: 'green',
    connections: [
      { ...TOP_LEFT, type: 'black' },
      { ...TOP_RIGHT, type: 'black' },
      { ...BOTTOM_LEFT, type: 'orange' },
      { ...BOTTOM_RIGHT, type: 'orange' },
    ],
    paths: [
      { from: 0, to: 2 },
      { from: 1, to: 3 },
    ],
    decorations: 'waves',
  },
  {
    id: 'green-boot-pair',
    name: 'Boot Pair',
    color: 'green',
    connections: [
      { ...TOP_LEFT, type: 'black' },
      { ...TOP_RIGHT, type: 'black' },
      { ...BOTTOM_LEFT, type: 'orange' },
      { ...BOTTOM_RIGHT, type: 'orange' },
    ],
    paths: [
      { from: 0, to: 2 },
      { from: 1, to: 3 },
    ],
  },
  {
    id: 'green-twist-pair',
    name: 'Twist Pair',
    color: 'green',
    connections: [
      { ...TOP_LEFT, type: 'black' },
      { ...TOP_RIGHT, type: 'orange' },
      { ...BOTTOM_LEFT, type: 'orange' },
      { ...BOTTOM_RIGHT, type: 'orange' },
    ],
    paths: [
      { from: 0, to: 2 },
      { from: 1, to: 3 },
    ],
  },
  {
    id: 'green-flower-double',
    name: 'Flower Double',
    color: 'green',
    connections: [
      { ...TOP, type: 'black' },
      { ...BOTTOM_LEFT, type: 'orange' },
      { ...BOTTOM_RIGHT, type: 'orange' },
    ],
    paths: [
      { from: 0, to: 1 },
      { from: 0, to: 2 },
    ],
    decorations: 'flower',
  },
  {
    id: 'blue-flower-vase',
    name: 'Flower Vase',
    color: 'blue',
    connections: [
      { ...TOP, type: 'black' },
    ],
    paths: [],
    decorations: 'flower',
  },

  // Row 3 - Blue pipes
  {
    id: 'blue-loop',
    name: 'Blue Loop',
    color: 'blue',
    connections: [
      { ...TOP, type: 'orange' },
      { ...BOTTOM, type: 'orange' },
    ],
    paths: [
      { from: 0, to: 1, controlPoints: [{ x: -0.5, y: 0 }] },
    ],
  },
  {
    id: 'blue-splash',
    name: 'Blue Splash',
    color: 'blue',
    connections: [
      { ...TOP, type: 'black' },
      { ...BOTTOM_LEFT, type: 'orange' },
      { ...BOTTOM_RIGHT, type: 'orange' },
    ],
    paths: [
      { from: 0, to: 1 },
      { from: 0, to: 2 },
    ],
  },
  {
    id: 'blue-cross',
    name: 'Blue Cross',
    color: 'blue',
    connections: [
      { ...TOP, type: 'black' },
      { ...LEFT, type: 'orange' },
      { ...BOTTOM, type: 'orange' },
    ],
    paths: [
      { from: 0, to: 1 },
      { from: 0, to: 2 },
    ],
  },
  {
    id: 'blue-wave-double',
    name: 'Wave Double',
    color: 'blue',
    connections: [
      { ...LEFT_TOP, type: 'black' },
      { ...LEFT_BOTTOM, type: 'black' },
      { ...RIGHT_TOP, type: 'black' },
      { ...RIGHT_BOTTOM, type: 'black' },
    ],
    paths: [
      { from: 0, to: 2 },
      { from: 1, to: 3 },
    ],
    decorations: 'waves',
  },
  {
    id: 'blue-branch',
    name: 'Blue Branch',
    color: 'blue',
    connections: [
      { ...LEFT, type: 'black' },
      { ...RIGHT_TOP, type: 'black' },
      { ...RIGHT_BOTTOM, type: 'black' },
    ],
    paths: [
      { from: 0, to: 1 },
      { from: 0, to: 2 },
    ],
    decorations: 'waves',
  },

  // Row 4 - Orange pipes
  {
    id: 'orange-cross-4',
    name: 'Orange 4-way',
    color: 'orange',
    connections: [
      { ...TOP, type: 'black' },
      { ...RIGHT, type: 'black' },
      { ...BOTTOM, type: 'black' },
      { ...LEFT, type: 'black' },
    ],
    paths: [
      { from: 0, to: 2 },
      { from: 1, to: 3 },
    ],
  },
  {
    id: 'orange-x-cross',
    name: 'Orange X Cross',
    color: 'orange',
    connections: [
      { ...TOP_LEFT, type: 'black' },
      { ...TOP_RIGHT, type: 'black' },
      { ...BOTTOM_LEFT, type: 'orange' },
      { ...BOTTOM_RIGHT, type: 'black' },
    ],
    paths: [
      { from: 0, to: 3 },
      { from: 1, to: 2 },
    ],
  },
];

export function getTileById(id: string): TileDefinition | undefined {
  return TILE_DEFINITIONS.find(t => t.id === id);
}
