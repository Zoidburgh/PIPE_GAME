// Connection points on a tile
// Positions are relative to tile center, normalized -1 to 1
export type ConnectionPoint = {
  x: number;  // -1 (left) to 1 (right)
  y: number;  // -1 (bottom) to 1 (top)
  type: 'black' | 'orange' | 'red';  // connector type/color
};

// A path segment within a tile (connects two points)
export type PathSegment = {
  from: number;  // index into connections array
  to: number;    // index into connections array
  controlPoints?: { x: number; y: number }[];  // for curved paths
};

// Tile definition
export interface TileDefinition {
  id: string;
  name: string;
  color: 'green' | 'blue' | 'orange';  // pipe color
  connections: ConnectionPoint[];
  paths: PathSegment[];
  decorations?: 'flower' | 'waves' | 'none';
}

// Placed tile in the game
export interface PlacedTile {
  definition: { id: string; name: string };  // minimal tile info
  position: {
    x: number;  // grid x
    y: number;  // grid y (height/layer)
    z: number;  // grid z
  };
  rotation: number;  // 0, 90, 180, 270 degrees
  flipped: boolean;  // flipped horizontally
  orientation: 'flat' | 'vertical-x' | 'vertical-z';  // how tile is placed
}

// Grid cell can hold a tile
export interface GridCell {
  tile: PlacedTile | null;
  x: number;
  y: number;
  z: number;
}
