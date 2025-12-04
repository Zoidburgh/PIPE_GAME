import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Grid } from '../board/Grid';
import type { PlacedTile } from '../tiles/types';
import { GENERATED_TILES, renderTileFromConfig, renderTileFlipped } from '../tiles/TileBuilder';
import type { GeneratedTile } from '../tiles/TileBuilder';
import { checkWinCondition, getTileConnectors, validateConnections } from './ConnectionValidator';
import { generatePuzzleWithSolution } from '../puzzle';
import type { Puzzle, Solution } from '../puzzle/types';

export class Game {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  grid: Grid;

  selectedTileType: GeneratedTile | null = null;
  currentRotation = 0;
  currentFlipped = false;
  placementHeight = 0;
  currentOrientation: 'flat' | 'vertical-x' | 'vertical-z' = 'flat';

  previewMesh: THREE.Mesh | null = null;
  previewTime = 0;
  hoverPosition: { x: number; y: number; z: number } | null = null;

  tileTextures: Map<string, THREE.CanvasTexture> = new Map();
  tileMeshes: Map<string, THREE.Mesh> = new Map();

  // Undo history
  undoStack: Array<{
    action: 'place' | 'delete';
    tile: PlacedTile;
    meshKey: string;
  } | {
    action: 'reveal';
    previousTiles: PlacedTile[];
    previousRemaining: Map<string, number>;
  }> = [];

  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  // WASD camera control
  keys: { [key: string]: boolean } = {};
  cameraMode: 'orbit' | 'free' = 'orbit';

  // Win state tracking
  openConnectorMarkers: THREE.Mesh[] = [];

  // Puzzle mode
  puzzleMode = false;
  currentPuzzle: Puzzle | null = null;
  currentSolution: Solution | null = null;
  puzzleTilesRemaining: Map<string, number> = new Map();  // tileId -> count remaining
  
  constructor(container: HTMLElement) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a1a);
    
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.camera.position.set(10, 15, 20);

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 0.5;
    this.controls.maxDistance = 100;
    // Use right mouse button for orbit, not left
    this.controls.mouseButtons = {
      LEFT: null as unknown as THREE.MOUSE,
      MIDDLE: THREE.MOUSE.DOLLY,
      RIGHT: THREE.MOUSE.ROTATE
    };
    
    this.grid = new Grid();
    this.scene.add(this.grid.gridHelper);
    
    this.setupLighting();
    this.generateTileTextures();
    this.setupEvents();
    this.animate();
  }
  
  private setupLighting() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambient);
    
    const dirLight = new THREE.DirectionalLight(0xffffff, 1);
    dirLight.position.set(5, 10, 5);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    this.scene.add(dirLight);
    
    const fillLight = new THREE.DirectionalLight(0x4488ff, 0.3);
    fillLight.position.set(-5, 5, -5);
    this.scene.add(fillLight);
  }
  
  private generateTileTextures() {
    for (const tile of GENERATED_TILES) {
      // Generate transparent texture for 3D tiles (top face)
      const canvas = renderTileFromConfig(tile.config, 128, true);
      const texture = new THREE.CanvasTexture(canvas);
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      this.tileTextures.set(tile.id, texture);

      // Generate flipped texture for bottom face
      const flippedCanvas = renderTileFlipped(tile.config, 128);
      const flippedTexture = new THREE.CanvasTexture(flippedCanvas);
      flippedTexture.minFilter = THREE.LinearFilter;
      flippedTexture.magFilter = THREE.LinearFilter;
      this.tileTextures.set(tile.id + '_flipped', flippedTexture);

      // Also generate opaque version for palette (stored with _palette suffix)
      const paletteCanvas = renderTileFromConfig(tile.config, 128, false);
      const paletteTexture = new THREE.CanvasTexture(paletteCanvas);
      paletteTexture.minFilter = THREE.LinearFilter;
      paletteTexture.magFilter = THREE.LinearFilter;
      this.tileTextures.set(tile.id + '_palette', paletteTexture);
    }
  }
  
  private setupEvents() {
    window.addEventListener('resize', () => this.onResize());
    this.renderer.domElement.addEventListener('mousemove', (e) => this.onMouseMove(e));
    this.renderer.domElement.addEventListener('click', (e) => this.onClick(e));
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));
  }
  
  private onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }
  
  private onMouseMove(event: MouseEvent) {
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    this.updateHoverPosition();
  }
  
  private updateHoverPosition() {
    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    const planeY = this.placementHeight * this.grid.cellSize;
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -planeY);
    const intersection = new THREE.Vector3();
    
    if (this.raycaster.ray.intersectPlane(plane, intersection)) {
      const gridPos = this.grid.worldToGrid(intersection);
      gridPos.y = this.placementHeight;
      
      if (this.grid.isInBounds(gridPos.x, gridPos.y, gridPos.z)) {
        this.hoverPosition = gridPos;
        this.updatePreview();
        return;
      }
    }
    
    this.hoverPosition = null;
    this.updatePreview();
  }
  
  private updatePreview() {
    if (this.previewMesh) {
      this.scene.remove(this.previewMesh);
      this.previewMesh = null;
    }

    if (!this.selectedTileType || !this.hoverPosition) return;

    const canPlace = this.grid.canPlaceTile(
      this.hoverPosition.x,
      this.hoverPosition.y,
      this.hoverPosition.z,
      this.currentOrientation
    );

    // If flipped, swap which texture goes on top vs bottom
    const topTexId = this.currentFlipped ? this.selectedTileType.id + '_flipped' : this.selectedTileType.id;
    const bottomTexId = this.currentFlipped ? this.selectedTileType.id : this.selectedTileType.id + '_flipped';
    const topTexture = this.tileTextures.get(topTexId);
    const bottomTexture = this.tileTextures.get(bottomTexId);
    if (!topTexture || !bottomTexture) return;

    // Tile fills one cell (with small gap) - flat plane
    const tileSize = this.grid.cellSize * 0.95;
    const geometry = new THREE.PlaneGeometry(tileSize, tileSize);

    // Preview material - flash red if invalid placement
    const material = new THREE.MeshStandardMaterial({
      map: topTexture,
      transparent: true,
      alphaTest: 0.1,
      opacity: 0.7,
      side: THREE.DoubleSide,
      color: canPlace ? 0xffffff : 0xff4444,
      emissive: canPlace ? 0x000000 : 0x440000,
    });

    this.previewMesh = new THREE.Mesh(geometry, material);
    // Store canPlace state on mesh for animation
    (this.previewMesh as any).canPlace = canPlace;
    this.previewMesh.rotation.x = -Math.PI / 2; // Rotate to lie flat

    const worldPos = this.grid.gridToWorld(
      this.hoverPosition.x,
      this.hoverPosition.y,
      this.hoverPosition.z
    );
    this.previewMesh.position.copy(worldPos);

    // Apply position and rotation based on orientation
    this.applyTileTransform(this.previewMesh, this.currentOrientation, this.currentRotation);

    this.scene.add(this.previewMesh);
  }

  private applyTileTransform(mesh: THREE.Mesh, orientation: string, rotation: number) {
    const rotRad = (rotation * Math.PI) / 180;
    const halfCell = this.grid.cellSize / 2;

    // PlaneGeometry faces +Z by default
    // Reset rotation order to default
    mesh.rotation.order = 'XYZ';

    switch (orientation) {
      case 'flat':
        // Lie flat on XZ plane, then rotate around Y axis
        mesh.rotation.set(-Math.PI / 2, 0, 0);
        mesh.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), rotRad);
        mesh.position.y = this.placementHeight * this.grid.cellSize + 0.01;
        break;
      case 'vertical-x':
        // Standing vertical on the +X edge (plane faces -X into cell)
        mesh.rotation.set(0, -Math.PI / 2, 0);
        mesh.rotateOnAxis(new THREE.Vector3(0, 0, 1), rotRad);
        mesh.position.x += halfCell;
        mesh.position.y = this.placementHeight * this.grid.cellSize + halfCell;
        break;
      case 'vertical-z':
        // Standing vertical on the +Z edge (plane faces -Z into cell)
        mesh.rotation.set(0, Math.PI, 0);
        mesh.rotateOnAxis(new THREE.Vector3(0, 0, 1), rotRad);
        mesh.position.z += halfCell;
        mesh.position.y = this.placementHeight * this.grid.cellSize + halfCell;
        break;
    }
  }

  private onClick(_event: MouseEvent) {
    if (!this.selectedTileType || !this.hoverPosition) return;

    const { x, y, z } = this.hoverPosition;

    if (!this.grid.canPlaceTile(x, y, z, this.currentOrientation)) return;

    // In puzzle mode, check if we have tiles remaining
    if (this.puzzleMode && !this.canPlacePuzzleTile(this.selectedTileType.id)) {
      console.log('No more of this tile available!');
      return;
    }

    const placedTile: PlacedTile = {
      definition: this.selectedTileType,
      position: { x, y, z },
      rotation: this.currentRotation,
      flipped: this.currentFlipped,
      orientation: this.currentOrientation,
    };

    if (this.grid.placeTile(placedTile)) {
      const meshKey = this.createTileMesh(placedTile);
      // Add to undo stack
      this.undoStack.push({
        action: 'place',
        tile: placedTile,
        meshKey
      });

      // Track puzzle tile usage
      this.onPuzzleTilePlaced(this.selectedTileType.id);

      this.checkWinState();
    }
  }

  private createTileMesh(tile: PlacedTile): string {
    // If flipped, swap which texture goes on top vs bottom
    const topTexId = tile.flipped ? tile.definition.id + '_flipped' : tile.definition.id;
    const bottomTexId = tile.flipped ? tile.definition.id : tile.definition.id + '_flipped';
    const topTexture = this.tileTextures.get(topTexId);
    const bottomTexture = this.tileTextures.get(bottomTexId);
    const key = tile.position.x + ',' + tile.position.y + ',' + tile.position.z + ',' + tile.orientation;
    if (!topTexture || !bottomTexture) return key;

    // Tile fills one cell (with small gap) - flat plane
    const tileSize = this.grid.cellSize * 0.95;
    const geometry = new THREE.PlaneGeometry(tileSize, tileSize);

    // Double-sided material
    const material = new THREE.MeshStandardMaterial({
      map: topTexture,
      transparent: true,
      alphaTest: 0.1,
      side: THREE.DoubleSide,
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2; // Rotate to lie flat

    const worldPos = this.grid.gridToWorld(tile.position.x, tile.position.y, tile.position.z);
    mesh.position.copy(worldPos);

    // Apply orientation transform
    this.applyTileMeshTransform(mesh, tile);

    mesh.castShadow = true;
    mesh.receiveShadow = true;

    this.tileMeshes.set(key, mesh);
    this.scene.add(mesh);
    return key;
  }

  private applyTileMeshTransform(mesh: THREE.Mesh, tile: PlacedTile) {
    const rotRad = (tile.rotation * Math.PI) / 180;
    const halfCell = this.grid.cellSize / 2;

    // PlaneGeometry faces +Z by default
    // Reset rotation order to default
    mesh.rotation.order = 'XYZ';

    switch (tile.orientation) {
      case 'flat':
        // Lie flat on XZ plane, then rotate around Y axis
        mesh.rotation.set(-Math.PI / 2, 0, 0);
        mesh.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), rotRad);
        mesh.position.y = tile.position.y * this.grid.cellSize + 0.01;
        break;
      case 'vertical-x':
        // Standing vertical on the +X edge (plane faces -X into cell)
        mesh.rotation.set(0, -Math.PI / 2, 0);
        mesh.rotateOnAxis(new THREE.Vector3(0, 0, 1), rotRad);
        mesh.position.x += halfCell;
        mesh.position.y = tile.position.y * this.grid.cellSize + halfCell;
        break;
      case 'vertical-z':
        // Standing vertical on the +Z edge (plane faces -Z into cell)
        mesh.rotation.set(0, Math.PI, 0);
        mesh.rotateOnAxis(new THREE.Vector3(0, 0, 1), rotRad);
        mesh.position.z += halfCell;
        mesh.position.y = tile.position.y * this.grid.cellSize + halfCell;
        break;
    }
  }
  
  private onKeyDown(event: KeyboardEvent) {
    const key = event.key.toLowerCase();

    // Track WASD, Q/E, and arrow keys
    if (['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
      this.keys[key] = true;
      return;
    }

    switch (key) {
      case 'r':
        this.currentRotation = (this.currentRotation + 90) % 360;
        this.updatePreview();
        this.updateInfoDisplay();
        break;
      case 'f':
        this.currentFlipped = !this.currentFlipped;
        this.updatePreview();
        this.updateInfoDisplay();
        break;
      case 'v':
        // Cycle through orientations: flat -> vertical-x -> vertical-z -> flat
        this.cycleOrientation();
        this.updatePreview();
        this.updateInfoDisplay();
        break;
      case '1':
        this.placementHeight = Math.max(0, this.placementHeight - 1);
        this.updateHoverPosition();
        this.updateInfoDisplay();
        break;
      case '2':
        this.placementHeight = Math.min(this.grid.gridSize.y - 1, this.placementHeight + 1);
        this.updateHoverPosition();
        this.updateInfoDisplay();
        break;
      case 'escape':
        this.selectedTileType = null;
        this.updatePreview();
        this.updatePaletteSelection();
        break;
      case 'z':
        this.undo();
        break;
      case 'x':
        this.deleteAtHover();
        break;
      case 'p':
        this.debugBoardState();
        break;
      case 'g':
        this.testPuzzleGeneration();
        break;
      case 'm':
        this.togglePuzzleMode();
        break;
      case 'h':
        this.revealSolution();
        break;
    }
  }

  private onKeyUp(event: KeyboardEvent) {
    const key = event.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'q', 'e', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) {
      this.keys[key] = false;
    }
  }

  private undo() {
    const lastAction = this.undoStack.pop();
    if (!lastAction) return;

    if (lastAction.action === 'place') {
      // Undo a placement - remove the tile
      this.removeTileFromGrid(lastAction.tile);
      this.removeTileMesh(lastAction.meshKey);
      // Restore puzzle tile
      this.onPuzzleTileRemoved(lastAction.tile.definition.id);
    } else if (lastAction.action === 'delete') {
      // Undo a deletion - restore the tile
      this.grid.placeTile(lastAction.tile);
      this.createTileMesh(lastAction.tile);
      // Use puzzle tile
      this.onPuzzleTilePlaced(lastAction.tile.definition.id);
    } else if (lastAction.action === 'reveal') {
      // Undo reveal - restore previous state
      this.clearBoardKeepFixed();
      // Restore previous tiles
      for (const tile of lastAction.previousTiles) {
        this.grid.placeTile(tile);
        this.createTileMesh(tile);
      }
      // Restore remaining counts
      this.puzzleTilesRemaining = new Map(lastAction.previousRemaining);
      this.updatePuzzlePalette();
    }
    this.updatePreview();
    this.checkWinState();
  }

  private deleteAtHover() {
    if (!this.hoverPosition) return;

    const { x, y, z } = this.hoverPosition;

    // Delete tile matching current orientation only
    const key = x + ',' + y + ',' + z + ',' + this.currentOrientation;
    const tile = this.getTileByKey(x, y, z, this.currentOrientation);

    if (tile) {
      // In puzzle mode, don't allow deleting fixed tiles
      if (this.puzzleMode && this.currentPuzzle) {
        const isFixed = this.currentPuzzle.fixedPlacements.some(
          p => p.cell.x === x && p.cell.y === y && p.cell.z === z && p.orientation === this.currentOrientation
        );
        if (isFixed) {
          console.log('Cannot delete fixed hint tile!');
          return;
        }
      }

      // Remove from grid
      this.removeTileFromGrid(tile);
      // Remove mesh
      this.removeTileMesh(key);
      // Add to undo stack
      this.undoStack.push({
        action: 'delete',
        tile: tile,
        meshKey: key
      });
      // Restore puzzle tile
      this.onPuzzleTileRemoved(tile.definition.id);
      this.updatePreview();
      this.checkWinState();
    }
  }

  private getTileByKey(x: number, y: number, z: number, orientation: 'flat' | 'vertical-x' | 'vertical-z'): PlacedTile | null {
    const key = x + ',' + y + ',' + z;
    if (orientation === 'flat') {
      return this.grid.flatTiles.get(key) || null;
    } else if (orientation === 'vertical-x') {
      return this.grid.edgeTilesX.get(key) || null;
    } else if (orientation === 'vertical-z') {
      return this.grid.edgeTilesZ.get(key) || null;
    }
    return null;
  }

  private removeTileFromGrid(tile: PlacedTile) {
    const key = tile.position.x + ',' + tile.position.y + ',' + tile.position.z;
    if (tile.orientation === 'flat') {
      this.grid.flatTiles.delete(key);
    } else if (tile.orientation === 'vertical-x') {
      this.grid.edgeTilesX.delete(key);
    } else if (tile.orientation === 'vertical-z') {
      this.grid.edgeTilesZ.delete(key);
    }
  }

  private removeTileMesh(meshKey: string) {
    const mesh = this.tileMeshes.get(meshKey);
    if (mesh) {
      this.scene.remove(mesh);
      this.tileMeshes.delete(meshKey);
    }
  }

  private cycleOrientation() {
    const orientations: Array<'flat' | 'vertical-x' | 'vertical-z'> = ['flat', 'vertical-x', 'vertical-z'];
    const currentIndex = orientations.indexOf(this.currentOrientation);
    this.currentOrientation = orientations[(currentIndex + 1) % orientations.length];
  }

  selectTile(tileId: string) {
    const tile = GENERATED_TILES.find(t => t.id === tileId);
    if (tile) {
      this.selectedTileType = tile;
      this.updatePaletteSelection();
      this.updateInfoDisplay();
    }
  }
  
  private updatePaletteSelection() {
    document.querySelectorAll('.tile-option').forEach(el => {
      el.classList.remove('selected');
      if (this.selectedTileType && el.getAttribute('data-tile-id') === this.selectedTileType.id) {
        el.classList.add('selected');
      }
    });
  }
  
  private updateInfoDisplay() {
    const infoEl = document.getElementById('info');
    if (infoEl) {
      const tileName = this.selectedTileType?.name || 'None';
      const flippedText = this.currentFlipped ? 'Yes' : 'No';
      const orientationText = this.currentOrientation === 'flat' ? 'Flat' :
        this.currentOrientation === 'vertical-x' ? 'Vertical (X)' : 'Vertical (Z)';
      infoEl.innerHTML =
        'Tile: <span>' + tileName + '</span><br>' +
        'Rotation: <span>' + this.currentRotation + ' deg</span><br>' +
        'Orientation: <span>' + orientationText + '</span><br>' +
        'Height: <span>' + this.placementHeight + '</span><br>' +
        'Flipped: <span>' + flippedText + '</span>';
    }
  }
  
  private checkWinState() {
    // Clear old markers
    for (const marker of this.openConnectorMarkers) {
      this.scene.remove(marker);
    }
    this.openConnectorMarkers = [];

    const result = checkWinCondition(
      this.grid.flatTiles,
      this.grid.edgeTilesX,
      this.grid.edgeTilesZ
    );

    // Update status display
    const statusEl = document.getElementById('win-status');
    if (statusEl) {
      statusEl.textContent = result.message;
      statusEl.classList.remove('won', 'open');
      if (result.won) {
        statusEl.classList.add('won');
      } else if (result.openConnectors.length > 0) {
        statusEl.classList.add('open');
      }
    }

    // Show markers at open connectors
    for (const conn of result.openConnectors) {
      const geometry = new THREE.SphereGeometry(0.05, 8, 8);
      const material = new THREE.MeshStandardMaterial({
        color: 0xff4444,
        emissive: 0x441111,
        emissiveIntensity: 0.5
      });
      const marker = new THREE.Mesh(geometry, material);
      marker.position.set(
        (conn.wx - this.grid.gridSize.x / 2) * this.grid.cellSize,
        conn.wy * this.grid.cellSize + 0.1,
        (conn.wz - this.grid.gridSize.z / 2) * this.grid.cellSize
      );
      this.scene.add(marker);
      this.openConnectorMarkers.push(marker);
    }

    if (result.won) {
      console.log('YOU WIN!');
    }
  }

  private debugBoardState() {
    const allTiles = [
      ...this.grid.flatTiles.values(),
      ...this.grid.edgeTilesX.values(),
      ...this.grid.edgeTilesZ.values()
    ];

    const output: string[] = [];
    output.push('=== BOARD STATE DEBUG ===');
    output.push(`Total tiles: ${allTiles.length}`);
    output.push('');

    // List all tiles with their properties
    output.push('--- PLACED TILES ---');
    for (const tile of allTiles) {
      output.push(`Tile: ${tile.definition.name}`);
      output.push(`  Position: (${tile.position.x}, ${tile.position.y}, ${tile.position.z})`);
      output.push(`  Orientation: ${tile.orientation}`);
      output.push(`  Rotation: ${tile.rotation}°`);
      output.push(`  Flipped: ${tile.flipped}`);
      const tileConfig = GENERATED_TILES.find(t => t.id === tile.definition.id)?.config;
      output.push(`  Config: T=${tileConfig?.top || 'null'} R=${tileConfig?.right || 'null'} B=${tileConfig?.bottom || 'null'} L=${tileConfig?.left || 'null'}`);

      // Get connectors for this tile
      const connectors = getTileConnectors(tile);
      output.push(`  Connectors (${connectors.length}):`);
      for (const conn of connectors) {
        output.push(`    Edge ${conn.edge} (${conn.pos}): world pos (${conn.wx.toFixed(3)}, ${conn.wy.toFixed(3)}, ${conn.wz.toFixed(3)})`);
      }
      output.push('');
    }

    // Validation results
    output.push('--- CONNECTION VALIDATION ---');
    const validation = validateConnections(allTiles);
    output.push(`Valid: ${validation.valid}`);
    output.push(`Connected pairs: ${validation.connectedPairs.length}`);
    for (const [a, b] of validation.connectedPairs) {
      output.push(`  Pair: Tile at (${a.tile.position.x},${a.tile.position.y},${a.tile.position.z}) ${a.edge}-${a.pos} <-> Tile at (${b.tile.position.x},${b.tile.position.y},${b.tile.position.z}) ${b.edge}-${b.pos}`);
      output.push(`    World pos: (${a.wx.toFixed(3)}, ${a.wy.toFixed(3)}, ${a.wz.toFixed(3)})`);
    }

    output.push(`Open connectors: ${validation.openConnectors.length}`);
    for (const conn of validation.openConnectors) {
      output.push(`  Tile at (${conn.tile.position.x},${conn.tile.position.y},${conn.tile.position.z}) ${conn.tile.orientation} ${conn.edge}-${conn.pos}: world (${conn.wx.toFixed(3)}, ${conn.wy.toFixed(3)}, ${conn.wz.toFixed(3)})`);
    }

    const text = output.join('\n');
    console.log(text);

    // Copy to clipboard
    navigator.clipboard.writeText(text).then(() => {
      console.log('Debug info copied to clipboard!');
    }).catch(err => {
      console.error('Failed to copy to clipboard:', err);
    });
  }

  private testPuzzleGeneration() {
    console.log('=== PUZZLE GENERATION ===');

    const result = generatePuzzleWithSolution({
      size: { min: 3, max: 6 },
      mode: 'arrange',
      allow3D: false
    });

    if (!result) {
      console.log('Failed to generate puzzle');
      return;
    }

    const { puzzle, solution } = result;
    console.log('Generated puzzle:');
    console.log(`  Mode: ${puzzle.mode}`);
    console.log(`  Tiles: ${puzzle.tiles.map((t: { tileId: string; count: number }) => `${t.count}x ${t.tileId}`).join(', ')}`);
    console.log(`  Fixed placements: ${puzzle.fixedPlacements.length}`);
    console.log(`  Solution placements: ${solution.placements.length}`);
    const bounds = puzzle.gridBounds;
    console.log(`  Grid: (${bounds.min.x},${bounds.min.y},${bounds.min.z}) to (${bounds.max.x},${bounds.max.y},${bounds.max.z})`);
  }

  private togglePuzzleMode() {
    if (this.puzzleMode) {
      this.exitPuzzleMode();
    } else {
      this.enterPuzzleMode();
    }
  }

  setPuzzleSize(min: number, max: number) {
    this.puzzleSize = { min, max };
    console.log(`Puzzle size set to ${min}-${max} tiles`);
  }

  setAllow3D(allow: boolean) {
    this.allow3D = allow;
    console.log(`3D puzzles ${allow ? 'enabled' : 'disabled'}`);
  }

  startPuzzle() {
    if (this.puzzleMode) {
      this.exitPuzzleMode();
    }
    this.enterPuzzleMode();
  }

  puzzleSize: { min: number; max: number } = { min: 4, max: 7 };
  allow3D = false;

  private enterPuzzleMode() {
    // Generate a puzzle with solution
    const result = generatePuzzleWithSolution({
      size: this.puzzleSize,
      mode: 'arrange',
      allow3D: this.allow3D
    });

    if (!result) {
      console.log('Failed to generate puzzle');
      return;
    }

    const { puzzle, solution } = result;

    this.puzzleMode = true;
    this.currentPuzzle = puzzle;
    this.currentSolution = solution;

    // Clear the board
    this.clearBoard();

    // Initialize remaining tiles
    this.puzzleTilesRemaining.clear();
    for (const spec of puzzle.tiles) {
      this.puzzleTilesRemaining.set(spec.tileId, spec.count);
    }

    // Place fixed tiles (hint) and subtract from remaining
    for (const placement of puzzle.fixedPlacements) {
      const tile = GENERATED_TILES.find(t => t.id === placement.tileId);
      if (tile) {
        const placedTile: PlacedTile = {
          definition: tile,
          position: placement.cell,
          rotation: placement.rotation,
          flipped: placement.flipped,
          orientation: placement.orientation
        };
        this.grid.placeTile(placedTile);
        this.createTileMesh(placedTile);

        // Subtract the fixed tile from remaining count
        const remaining = this.puzzleTilesRemaining.get(placement.tileId) ?? 0;
        this.puzzleTilesRemaining.set(placement.tileId, Math.max(0, remaining - 1));
      }
    }

    // Update palette to show only puzzle tiles
    this.updatePuzzlePalette();

    // Update UI
    this.checkWinState();
    console.log('=== PUZZLE MODE STARTED ===');
    console.log(`Place ${puzzle.tiles.reduce((sum, t) => sum + t.count, 0)} tiles to solve!`);
  }

  exitPuzzleMode() {
    this.puzzleMode = false;
    this.currentPuzzle = null;
    this.currentSolution = null;
    this.puzzleTilesRemaining.clear();

    // Restore full palette
    this.restoreFullPalette();

    console.log('=== PUZZLE MODE ENDED ===');
  }

  private clearBoard() {
    // Remove all tile meshes
    for (const mesh of this.tileMeshes.values()) {
      this.scene.remove(mesh);
    }
    this.tileMeshes.clear();

    // Clear grid
    this.grid.flatTiles.clear();
    this.grid.edgeTilesX.clear();
    this.grid.edgeTilesZ.clear();

    // Clear undo stack
    this.undoStack = [];

    // Clear markers
    for (const marker of this.openConnectorMarkers) {
      this.scene.remove(marker);
    }
    this.openConnectorMarkers = [];
  }

  private clearBoardKeepFixed() {
    // Remove all tile meshes except fixed placements
    const fixedKeys = new Set<string>();
    if (this.currentPuzzle) {
      for (const p of this.currentPuzzle.fixedPlacements) {
        fixedKeys.add(`${p.cell.x},${p.cell.y},${p.cell.z},${p.orientation}`);
      }
    }

    // Remove non-fixed meshes
    for (const [key, mesh] of this.tileMeshes.entries()) {
      if (!fixedKeys.has(key)) {
        this.scene.remove(mesh);
        this.tileMeshes.delete(key);
      }
    }

    // Clear grid tiles except fixed
    for (const [key] of this.grid.flatTiles) {
      if (!fixedKeys.has(key + ',flat')) {
        this.grid.flatTiles.delete(key);
      }
    }
    for (const [key] of this.grid.edgeTilesX) {
      if (!fixedKeys.has(key + ',vertical-x')) {
        this.grid.edgeTilesX.delete(key);
      }
    }
    for (const [key] of this.grid.edgeTilesZ) {
      if (!fixedKeys.has(key + ',vertical-z')) {
        this.grid.edgeTilesZ.delete(key);
      }
    }

    // Clear markers
    for (const marker of this.openConnectorMarkers) {
      this.scene.remove(marker);
    }
    this.openConnectorMarkers = [];
  }

  revealSolution() {
    if (!this.puzzleMode || !this.currentSolution || !this.currentPuzzle) {
      console.log('No puzzle to reveal!');
      return;
    }

    // Save current state for undo
    const previousTiles: PlacedTile[] = [];
    const fixedKeys = new Set<string>();
    for (const p of this.currentPuzzle.fixedPlacements) {
      fixedKeys.add(`${p.cell.x},${p.cell.y},${p.cell.z},${p.orientation}`);
    }

    // Collect all non-fixed placed tiles
    for (const [key, tile] of this.grid.flatTiles) {
      if (!fixedKeys.has(key + ',flat')) {
        previousTiles.push(tile);
      }
    }
    for (const [key, tile] of this.grid.edgeTilesX) {
      if (!fixedKeys.has(key + ',vertical-x')) {
        previousTiles.push(tile);
      }
    }
    for (const [key, tile] of this.grid.edgeTilesZ) {
      if (!fixedKeys.has(key + ',vertical-z')) {
        previousTiles.push(tile);
      }
    }

    // Push reveal action to undo stack
    this.undoStack.push({
      action: 'reveal',
      previousTiles,
      previousRemaining: new Map(this.puzzleTilesRemaining)
    });

    // Clear board except fixed tiles
    this.clearBoardKeepFixed();

    // Place all tiles from solution
    for (const placement of this.currentSolution.placements) {
      // Skip fixed placements (already on board)
      const key = `${placement.cell.x},${placement.cell.y},${placement.cell.z},${placement.orientation}`;
      if (fixedKeys.has(key)) continue;

      const tile = GENERATED_TILES.find(t => t.id === placement.tileId);
      if (tile) {
        const placedTile: PlacedTile = {
          definition: tile,
          position: placement.cell,
          rotation: placement.rotation,
          flipped: placement.flipped,
          orientation: placement.orientation
        };
        this.grid.placeTile(placedTile);
        this.createTileMesh(placedTile);
      }
    }

    // Set remaining to 0 for all tiles
    for (const spec of this.currentPuzzle.tiles) {
      this.puzzleTilesRemaining.set(spec.tileId, 0);
    }
    this.updatePuzzlePalette();

    this.checkWinState();
    console.log('Solution revealed! Press Z to undo.');
  }

  private updatePuzzlePalette() {
    const palette = document.getElementById('tile-palette');
    if (!palette || !this.currentPuzzle) return;

    // Hide all tiles first
    palette.querySelectorAll('.tile-option').forEach(el => {
      (el as HTMLElement).style.display = 'none';
      el.classList.remove('puzzle-tile');
    });

    // Show and update tiles in the puzzle
    for (const spec of this.currentPuzzle.tiles) {
      const el = palette.querySelector(`[data-tile-id="${spec.tileId}"]`) as HTMLElement;
      if (el) {
        el.style.display = 'block';
        el.classList.add('puzzle-tile');
        // Add count badge
        let badge = el.querySelector('.tile-count') as HTMLElement;
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'tile-count';
          el.appendChild(badge);
        }
        const remaining = this.puzzleTilesRemaining.get(spec.tileId) ?? 0;
        badge.textContent = remaining.toString();
        badge.style.display = remaining > 0 ? 'block' : 'none';
      }
    }

    // Select first available tile
    const firstAvailable = this.currentPuzzle.tiles.find(
      spec => (this.puzzleTilesRemaining.get(spec.tileId) ?? 0) > 0
    );
    if (firstAvailable) {
      this.selectTile(firstAvailable.tileId);
    }
  }

  private restoreFullPalette() {
    const palette = document.getElementById('tile-palette');
    if (!palette) return;

    // Show all tiles
    palette.querySelectorAll('.tile-option').forEach(el => {
      (el as HTMLElement).style.display = 'block';
      el.classList.remove('puzzle-tile');
      // Remove count badges
      const badge = el.querySelector('.tile-count');
      if (badge) badge.remove();
    });

    // Select first tile
    if (GENERATED_TILES.length > 0) {
      this.selectTile(GENERATED_TILES[0].id);
    }
  }

  // Override to check puzzle tile availability
  canPlacePuzzleTile(tileId: string): boolean {
    if (!this.puzzleMode) return true;
    const remaining = this.puzzleTilesRemaining.get(tileId) ?? 0;
    return remaining > 0;
  }

  // Called after placing a tile in puzzle mode
  onPuzzleTilePlaced(tileId: string) {
    if (!this.puzzleMode) return;

    const remaining = (this.puzzleTilesRemaining.get(tileId) ?? 1) - 1;
    this.puzzleTilesRemaining.set(tileId, remaining);

    // Update palette badge
    const el = document.querySelector(`[data-tile-id="${tileId}"] .tile-count`) as HTMLElement;
    if (el) {
      el.textContent = remaining.toString();
      el.style.display = remaining > 0 ? 'block' : 'none';
    }

    // If no more of this tile, select next available
    if (remaining <= 0) {
      const nextAvailable = [...this.puzzleTilesRemaining.entries()].find(([_, count]) => count > 0);
      if (nextAvailable) {
        this.selectTile(nextAvailable[0]);
      }
    }

    this.checkPuzzleComplete();
  }

  // Called after removing a tile in puzzle mode
  onPuzzleTileRemoved(tileId: string) {
    if (!this.puzzleMode) return;

    const remaining = (this.puzzleTilesRemaining.get(tileId) ?? 0) + 1;
    this.puzzleTilesRemaining.set(tileId, remaining);

    // Update palette badge
    const el = document.querySelector(`[data-tile-id="${tileId}"] .tile-count`) as HTMLElement;
    if (el) {
      el.textContent = remaining.toString();
      el.style.display = 'block';
    }
  }

  private checkPuzzleComplete() {
    if (!this.puzzleMode) return;

    // Check if all tiles placed
    const allPlaced = [...this.puzzleTilesRemaining.values()].every(count => count === 0);
    if (!allPlaced) return;

    // Check if connections are valid
    this.checkWinState();
  }

  private updateCamera() {
    const moveSpeed = 0.3;
    const rotateSpeed = 0.02;

    // Get camera's forward and right vectors (on XZ plane)
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3();
    right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    // WASD: Move camera and target together
    const movement = new THREE.Vector3();

    if (this.keys['w']) movement.add(forward.clone().multiplyScalar(moveSpeed));
    if (this.keys['s']) movement.add(forward.clone().multiplyScalar(-moveSpeed));
    if (this.keys['a']) movement.add(right.clone().multiplyScalar(-moveSpeed));
    if (this.keys['d']) movement.add(right.clone().multiplyScalar(moveSpeed));

    // Q/E: Move camera up/down
    if (this.keys['q']) movement.y -= moveSpeed;
    if (this.keys['e']) movement.y += moveSpeed;

    if (movement.length() > 0) {
      this.camera.position.add(movement);
      this.controls.target.add(movement);
    }

    // Arrow keys: Rotate view (orbit target around camera position)
    const toTarget = this.controls.target.clone().sub(this.camera.position);
    const distance = toTarget.length();

    // Left/Right arrows: rotate horizontally
    if (this.keys['arrowleft'] || this.keys['arrowright']) {
      const angle = this.keys['arrowleft'] ? rotateSpeed : -rotateSpeed;
      toTarget.applyAxisAngle(new THREE.Vector3(0, 1, 0), angle);
      this.controls.target.copy(this.camera.position).add(toTarget);
    }

    // Up/Down arrows: rotate vertically (pitch)
    if (this.keys['arrowup'] || this.keys['arrowdown']) {
      const angle = this.keys['arrowup'] ? rotateSpeed : -rotateSpeed;
      // Rotate around the right vector
      const currentPitch = Math.asin(toTarget.y / distance);
      const newPitch = Math.max(-Math.PI / 2.5, Math.min(Math.PI / 2.5, currentPitch + angle));

      // Only apply if within bounds
      if (Math.abs(newPitch - currentPitch) > 0.001) {
        toTarget.applyAxisAngle(right, angle);
        this.controls.target.copy(this.camera.position).add(toTarget);
      }
    }
  }

  private animate = () => {
    requestAnimationFrame(this.animate);
    this.updateCamera();
    this.controls.update();

    // Flash preview mesh
    if (this.previewMesh) {
      this.previewTime += 0.05;
      const material = this.previewMesh.material as THREE.MeshStandardMaterial;
      const canPlace = (this.previewMesh as any).canPlace;

      if (canPlace) {
        // Valid: gentle opacity flash
        const flash = 0.5 + Math.sin(this.previewTime * 2) * 0.3;
        material.opacity = flash;
      } else {
        // Invalid: flash red more aggressively
        const flash = 0.5 + Math.sin(this.previewTime * 4) * 0.4;
        material.opacity = flash;
        const redIntensity = 0.5 + Math.sin(this.previewTime * 4) * 0.5;
        material.emissive.setRGB(redIntensity * 0.3, 0, 0);
      }
    }

    this.renderer.render(this.scene, this.camera);
  };
}
