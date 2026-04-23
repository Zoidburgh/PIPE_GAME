import * as THREE from 'three';
import type { PlacedTile, GridCell } from '../tiles/types';

export class Grid {
  // Separate storage for flat tiles and edge tiles
  flatTiles: Map<string, PlacedTile> = new Map();
  edgeTilesX: Map<string, PlacedTile> = new Map();  // vertical tiles on X edges
  edgeTilesZ: Map<string, PlacedTile> = new Map();  // vertical tiles on Z edges

  cells: Map<string, GridCell> = new Map();
  gridSize = { x: 10, y: 5, z: 10 };  // grid dimensions
  cellSize = 2;  // each square is 2 units
  tileSize = 1;  // 1 tile = 1 square
  
  // Helper mesh for visualizing the grid
  gridHelper: THREE.Group;
  placedTileMeshes: Map<string, THREE.Mesh> = new Map();
  
  constructor() {
    this.gridHelper = this.createGridHelper();
  }
  
  private getCellKey(x: number, y: number, z: number): string {
    return `${x},${y},${z}`;
  }
  
  private createGridHelper(): THREE.Group {
    const group = new THREE.Group();
    
    // Base grid plane
    const gridHelper = new THREE.GridHelper(
      this.gridSize.x * this.cellSize,
      this.gridSize.x,
      0x444444,
      0x222222
    );
    gridHelper.position.y = 0.01;  // slightly above ground
    group.add(gridHelper);
    
    // Ground plane for raycasting
    const groundGeom = new THREE.PlaneGeometry(
      this.gridSize.x * this.cellSize,
      this.gridSize.z * this.cellSize
    );
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a2e,
      transparent: true,
      opacity: 0.5,
    });
    const ground = new THREE.Mesh(groundGeom, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.name = 'ground';
    ground.receiveShadow = true;
    group.add(ground);
    
    return group;
  }
  
  // Convert world position to grid coordinates
  worldToGrid(worldPos: THREE.Vector3): { x: number; y: number; z: number } {
    return {
      x: Math.floor(worldPos.x / this.cellSize + this.gridSize.x / 2),
      y: Math.floor(worldPos.y / this.cellSize),
      z: Math.floor(worldPos.z / this.cellSize + this.gridSize.z / 2),
    };
  }
  
  // Convert grid coordinates to world position (center of cell)
  gridToWorld(gridX: number, gridY: number, gridZ: number): THREE.Vector3 {
    return new THREE.Vector3(
      (gridX - this.gridSize.x / 2 + 0.5) * this.cellSize,
      gridY * this.cellSize + this.cellSize / 2,
      (gridZ - this.gridSize.z / 2 + 0.5) * this.cellSize
    );
  }
  
  // Check if a cell is empty
  isCellEmpty(x: number, y: number, z: number): boolean {
    const key = this.getCellKey(x, y, z);
    const cell = this.cells.get(key);
    return !cell || cell.tile === null;
  }
  
  // Check if position is within grid bounds
  isInBounds(x: number, y: number, z: number): boolean {
    return (
      x >= 0 && x < this.gridSize.x &&
      y >= 0 && y < this.gridSize.y &&
      z >= 0 && z < this.gridSize.z
    );
  }
  
  // Check if tile can be placed based on orientation
  canPlaceTile(x: number, y: number, z: number, orientation: 'flat' | 'vertical-x' | 'vertical-z' = 'flat'): boolean {
    if (!this.isInBounds(x, y, z)) return false;

    const key = this.getCellKey(x, y, z);

    // Check the appropriate storage based on orientation
    // Flat tiles and edge tiles use separate storage, so they can coexist
    if (orientation === 'flat') {
      if (this.flatTiles.has(key)) return false;
    } else if (orientation === 'vertical-x') {
      if (this.edgeTilesX.has(key)) return false;
    } else if (orientation === 'vertical-z') {
      if (this.edgeTilesZ.has(key)) return false;
    }

    // Ground level always valid
    if (y === 0) return true;

    // For flat tiles above ground, need at least 2 vertical tile supports
    if (orientation === 'flat') {
      return this.hasVerticalSupport(x, y, z);
    }

    // Vertical tiles need a flat tile below them at y-1 level
    if (orientation === 'vertical-x' || orientation === 'vertical-z') {
      const belowKey = this.getCellKey(x, y - 1, z);
      return this.flatTiles.has(belowKey);
    }

    return true;
  }

  // Check if a flat tile at (x, y, z) has at least 2 vertical supports
  // Supports can be on corners or opposite edges from the layer below
  private hasVerticalSupport(x: number, y: number, z: number): boolean {
    let supportCount = 0;

    // Check vertical-x tiles on left edge (x-1) and right edge (x) at y-1 level
    // Left edge: vertical-x at (x-1, y-1, z)
    const leftKey = this.getCellKey(x - 1, y - 1, z);
    if (this.edgeTilesX.has(leftKey)) supportCount++;

    // Right edge: vertical-x at (x, y-1, z)
    const rightKey = this.getCellKey(x, y - 1, z);
    if (this.edgeTilesX.has(rightKey)) supportCount++;

    // Check vertical-z tiles on front edge (z-1) and back edge (z) at y-1 level
    // Front edge: vertical-z at (x, y-1, z-1)
    const frontKey = this.getCellKey(x, y - 1, z - 1);
    if (this.edgeTilesZ.has(frontKey)) supportCount++;

    // Back edge: vertical-z at (x, y-1, z)
    const backKey = this.getCellKey(x, y - 1, z);
    if (this.edgeTilesZ.has(backKey)) supportCount++;

    return supportCount >= 2;
  }

  // Place a tile
  placeTile(tile: PlacedTile): boolean {
    const { x, y, z } = tile.position;
    const orientation = tile.orientation;

    if (!this.canPlaceTile(x, y, z, orientation)) {
      return false;
    }

    const key = this.getCellKey(x, y, z);

    // Store in the appropriate map based on orientation
    if (orientation === 'flat') {
      this.flatTiles.set(key, tile);
    } else if (orientation === 'vertical-x') {
      this.edgeTilesX.set(key, tile);
    } else if (orientation === 'vertical-z') {
      this.edgeTilesZ.set(key, tile);
    }

    return true;
  }
  
  // Remove a tile
  removeTile(x: number, y: number, z: number): PlacedTile | null {
    const key = this.getCellKey(x, y, z);
    const cell = this.cells.get(key);
    
    if (cell && cell.tile) {
      const tile = cell.tile;
      cell.tile = null;
      return tile;
    }
    
    return null;
  }
  
  // Get tile at position
  getTile(x: number, y: number, z: number): PlacedTile | null {
    const key = this.getCellKey(x, y, z);
    const cell = this.cells.get(key);
    return cell?.tile || null;
  }
  
  // Get all placed tiles
  getAllTiles(): PlacedTile[] {
    const tiles: PlacedTile[] = [];
    for (const cell of this.cells.values()) {
      if (cell.tile) {
        tiles.push(cell.tile);
      }
    }
    return tiles;
  }
}
