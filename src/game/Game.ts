import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Grid } from '../board/Grid';
import type { PlacedTile } from '../tiles/types';
import { GENERATED_TILES, renderTileFromConfig, renderTileFlipped } from '../tiles/TileBuilder';
import type { GeneratedTile } from '../tiles/TileBuilder';

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
  hoverPosition: { x: number; y: number; z: number } | null = null;
  
  tileTextures: Map<string, THREE.CanvasTexture> = new Map();
  tileMeshes: Map<string, THREE.Mesh> = new Map();

  // Undo history
  undoStack: Array<{
    action: 'place' | 'delete';
    tile: PlacedTile;
    meshKey: string;
  }> = [];
  
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  // WASD camera control
  keys: { [key: string]: boolean } = {};
  cameraMode: 'orbit' | 'free' = 'orbit';
  
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

    const texture = this.tileTextures.get(this.selectedTileType.id);
    const flippedTexture = this.tileTextures.get(this.selectedTileType.id + '_flipped');
    if (!texture || !flippedTexture) return;

    // Tile fills one cell (with small gap)
    const tileSize = this.grid.cellSize * 0.95;
    const tileThickness = 0.15;
    const geometry = new THREE.BoxGeometry(tileSize, tileThickness, tileSize);

    // Preview top face with red tint
    const topMaterial = new THREE.MeshStandardMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.1,
      opacity: canPlace ? 0.9 : 0.5,
      color: canPlace ? 0xff8888 : 0xff4444,
      emissive: canPlace ? 0x441111 : 0x220000,
      emissiveIntensity: 0.5,
    });

    // Preview bottom face (mirrored) with red tint
    const bottomMaterial = new THREE.MeshStandardMaterial({
      map: flippedTexture,
      transparent: true,
      alphaTest: 0.1,
      opacity: canPlace ? 0.9 : 0.5,
      color: canPlace ? 0xff8888 : 0xff4444,
      emissive: canPlace ? 0x441111 : 0x220000,
      emissiveIntensity: 0.5,
    });

    const sideMaterial = new THREE.MeshStandardMaterial({
      transparent: true,
      opacity: 0,
    });

    const materials = [
      sideMaterial, sideMaterial,
      topMaterial, bottomMaterial,
      sideMaterial, sideMaterial,
    ];

    this.previewMesh = new THREE.Mesh(geometry, materials);

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
    const tileThickness = 0.15;

    switch (orientation) {
      case 'flat':
        mesh.rotation.set(0, rotRad, 0);
        mesh.position.y = this.placementHeight * this.grid.cellSize + tileThickness / 2;
        break;
      case 'vertical-x':
        // Standing on the +X edge, rotating around Z axis (the tile's local Y when tilted)
        mesh.rotation.order = 'ZYX';
        mesh.rotation.set(0, 0, Math.PI / 2);
        mesh.rotateY(rotRad);  // rotate on tile's local axis
        mesh.position.x += halfCell;
        mesh.position.y = this.placementHeight * this.grid.cellSize + halfCell;
        break;
      case 'vertical-z':
        // Standing on the +Z edge, rotating around X axis (the tile's local Y when tilted)
        mesh.rotation.order = 'XYZ';
        mesh.rotation.set(Math.PI / 2, 0, 0);
        mesh.rotateY(rotRad);  // rotate on tile's local axis
        mesh.position.z += halfCell;
        mesh.position.y = this.placementHeight * this.grid.cellSize + halfCell;
        break;
    }
  }

  private onClick(_event: MouseEvent) {
    if (!this.selectedTileType || !this.hoverPosition) return;

    const { x, y, z } = this.hoverPosition;

    if (!this.grid.canPlaceTile(x, y, z, this.currentOrientation)) return;

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
    }
  }

  private createTileMesh(tile: PlacedTile): string {
    const texture = this.tileTextures.get(tile.definition.id);
    const flippedTexture = this.tileTextures.get(tile.definition.id + '_flipped');
    const key = tile.position.x + ',' + tile.position.y + ',' + tile.position.z + ',' + tile.orientation;
    if (!texture || !flippedTexture) return key;

    // Tile fills one cell (with small gap)
    const tileSize = this.grid.cellSize * 0.95;
    const tileThickness = 0.15;
    const geometry = new THREE.BoxGeometry(tileSize, tileThickness, tileSize);

    // Top face material
    const topMaterial = new THREE.MeshStandardMaterial({
      map: texture,
      transparent: true,
      alphaTest: 0.1,
    });

    // Bottom face material (mirrored)
    const bottomMaterial = new THREE.MeshStandardMaterial({
      map: flippedTexture,
      transparent: true,
      alphaTest: 0.1,
    });

    // Transparent/invisible sides
    const sideMaterial = new THREE.MeshStandardMaterial({
      transparent: true,
      opacity: 0,
    });

    // Box faces: +X, -X, +Y (top), -Y (bottom), +Z, -Z
    const materials = [
      sideMaterial, sideMaterial,  // left/right sides (invisible)
      topMaterial, bottomMaterial,  // top and bottom (pipe textures)
      sideMaterial, sideMaterial,  // front/back sides (invisible)
    ];

    const mesh = new THREE.Mesh(geometry, materials);

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
    const tileThickness = 0.15;

    switch (tile.orientation) {
      case 'flat':
        mesh.rotation.set(0, rotRad, 0);
        mesh.position.y = tile.position.y * this.grid.cellSize + tileThickness / 2;
        break;
      case 'vertical-x':
        // Standing on the +X edge, rotating on tile's local axis
        mesh.rotation.order = 'ZYX';
        mesh.rotation.set(0, 0, Math.PI / 2);
        mesh.rotateY(rotRad);
        mesh.position.x += halfCell;
        mesh.position.y = tile.position.y * this.grid.cellSize + halfCell;
        break;
      case 'vertical-z':
        // Standing on the +Z edge, rotating on tile's local axis
        mesh.rotation.order = 'XYZ';
        mesh.rotation.set(Math.PI / 2, 0, 0);
        mesh.rotateY(rotRad);
        mesh.position.z += halfCell;
        mesh.position.y = tile.position.y * this.grid.cellSize + halfCell;
        break;
    }
  }
  
  private onKeyDown(event: KeyboardEvent) {
    const key = event.key.toLowerCase();

    // Track WASD keys
    if (['w', 'a', 's', 'd'].includes(key)) {
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
      case 'q':
        this.placementHeight = Math.max(0, this.placementHeight - 1);
        this.updateHoverPosition();
        this.updateInfoDisplay();
        break;
      case 'e':
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
    }
  }

  private onKeyUp(event: KeyboardEvent) {
    const key = event.key.toLowerCase();
    if (['w', 'a', 's', 'd'].includes(key)) {
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
    } else if (lastAction.action === 'delete') {
      // Undo a deletion - restore the tile
      this.grid.placeTile(lastAction.tile);
      this.createTileMesh(lastAction.tile);
    }
    this.updatePreview();
  }

  private deleteAtHover() {
    if (!this.hoverPosition) return;

    const { x, y, z } = this.hoverPosition;

    // Delete tile matching current orientation only
    const key = x + ',' + y + ',' + z + ',' + this.currentOrientation;
    const tile = this.getTileByKey(x, y, z, this.currentOrientation);

    if (tile) {
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
      this.updatePreview();
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
  
  private updateCamera() {
    const speed = 0.3;

    // Get camera's forward and right vectors (on XZ plane)
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    forward.y = 0;
    forward.normalize();

    const right = new THREE.Vector3();
    right.crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();

    // Move camera and target together
    const movement = new THREE.Vector3();

    if (this.keys['w']) movement.add(forward.clone().multiplyScalar(speed));
    if (this.keys['s']) movement.add(forward.clone().multiplyScalar(-speed));
    if (this.keys['a']) movement.add(right.clone().multiplyScalar(-speed));
    if (this.keys['d']) movement.add(right.clone().multiplyScalar(speed));

    if (movement.length() > 0) {
      this.camera.position.add(movement);
      this.controls.target.add(movement);
    }
  }

  private animate = () => {
    requestAnimationFrame(this.animate);
    this.updateCamera();
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };
}
