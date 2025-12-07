import './style.css';
import { Game } from './game/Game';
import { GENERATED_TILES, renderTileFromConfig } from './tiles/TileBuilder';
import { solve, enumeratePositions } from './puzzle/solver';
import { randomInventory, boundsForInventory, generatePuzzle, generatePuzzles, generateShape, generateShapePuzzle, findFittingTiles, buildNetwork, buildPuzzle, fillShape, buildCubePuzzle, buildGridPuzzle, buildBox, buildLargeBox, testTwoTiles } from './puzzle/generator';

// Create main app container
const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = '';

// Create UI overlay
const ui = document.createElement('div');
ui.id = 'ui';
ui.innerHTML = `
  <div id="tile-palette"></div>
  <div id="controls">
    <h3>Controls</h3>
    <p><kbd>WASD</kbd> Move camera</p>
    <p><kbd>Q</kbd>/<kbd>E</kbd> Camera down/up</p>
    <p><kbd>Arrows</kbd> Rotate view</p>
    <p><kbd>R</kbd> Rotate tile</p>
    <p><kbd>V</kbd> Toggle vertical/flat</p>
    <p><kbd>F</kbd> Flip tile</p>
    <p><kbd>1</kbd>/<kbd>2</kbd> Height down/up</p>
    <p><kbd>Z</kbd> Undo</p>
    <p><kbd>X</kbd> Delete tile</p>
    <p><kbd>P</kbd> Debug info</p>
    <p><kbd>Esc</kbd> Deselect</p>
    <p>Left click to place</p>
    <p>Right drag to orbit</p>
  </div>
`;
document.body.appendChild(ui);

// Create info panel
const info = document.createElement('div');
info.id = 'info';
info.innerHTML = 'Tile: <span>None</span><br>Rotation: <span>0 deg</span><br>Height: <span>0</span>';
document.body.appendChild(info);

// Create win status display
const winStatus = document.createElement('div');
winStatus.id = 'win-status';
winStatus.innerHTML = 'Place some tiles!';
document.body.appendChild(winStatus);

// Initialize game
const game = new Game(app);

// Expose globally for console access
(window as unknown as { game: Game }).game = game;
(window as unknown as { solve: typeof solve }).solve = solve;
(window as unknown as { enumeratePositions: typeof enumeratePositions }).enumeratePositions = enumeratePositions;
(window as unknown as { GENERATED_TILES: typeof GENERATED_TILES }).GENERATED_TILES = GENERATED_TILES;
// Generator functions
(window as unknown as { randomInventory: typeof randomInventory }).randomInventory = randomInventory;
(window as unknown as { boundsForInventory: typeof boundsForInventory }).boundsForInventory = boundsForInventory;
(window as unknown as { generatePuzzle: typeof generatePuzzle }).generatePuzzle = generatePuzzle;
(window as unknown as { generatePuzzles: typeof generatePuzzles }).generatePuzzles = generatePuzzles;
(window as unknown as { generateShape: typeof generateShape }).generateShape = generateShape;
(window as unknown as { generateShapePuzzle: typeof generateShapePuzzle }).generateShapePuzzle = generateShapePuzzle;
(window as unknown as { findFittingTiles: typeof findFittingTiles }).findFittingTiles = findFittingTiles;
(window as unknown as { buildNetwork: typeof buildNetwork }).buildNetwork = buildNetwork;
(window as unknown as { buildPuzzle: typeof buildPuzzle }).buildPuzzle = buildPuzzle;
(window as unknown as { fillShape: typeof fillShape }).fillShape = fillShape;
(window as unknown as { buildCubePuzzle: typeof buildCubePuzzle }).buildCubePuzzle = buildCubePuzzle;
(window as unknown as { buildGridPuzzle: typeof buildGridPuzzle }).buildGridPuzzle = buildGridPuzzle;
(window as unknown as { buildBox: typeof buildBox }).buildBox = buildBox;
(window as unknown as { buildLargeBox: typeof buildLargeBox }).buildLargeBox = buildLargeBox;
(window as unknown as { testTwoTiles: typeof testTwoTiles }).testTwoTiles = testTwoTiles;

// Create tile palette
const palette = document.getElementById('tile-palette')!;

for (const tile of GENERATED_TILES) {
  const option = document.createElement('div');
  option.className = 'tile-option';
  option.setAttribute('data-tile-id', tile.id);
  option.title = tile.name;

  // Render tile preview
  const canvas = renderTileFromConfig(tile.config);
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  option.appendChild(canvas);

  option.addEventListener('click', () => {
    game.selectTile(tile.id);
  });

  palette.appendChild(option);
}

// Select first tile by default
if (GENERATED_TILES.length > 0) {
  game.selectTile(GENERATED_TILES[0].id);
}

console.log('Pipes game initialized!');
