import './style.css';
import { Game } from './game/Game';
import { GENERATED_TILES, renderTileFromConfig } from './tiles/TileBuilder';

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
    <p><kbd>R</kbd> Rotate tile</p>
    <p><kbd>V</kbd> Toggle vertical/flat</p>
    <p><kbd>F</kbd> Flip tile</p>
    <p><kbd>Q</kbd>/<kbd>E</kbd> Height down/up</p>
    <p><kbd>Z</kbd> Undo</p>
    <p><kbd>X</kbd> Delete tile</p>
    <p><kbd>Esc</kbd> Deselect</p>
    <p>Left click to place tile</p>
    <p>Right drag to orbit camera</p>
  </div>
`;
document.body.appendChild(ui);

// Create info panel
const info = document.createElement('div');
info.id = 'info';
info.innerHTML = 'Tile: <span>None</span><br>Rotation: <span>0 deg</span><br>Height: <span>0</span>';
document.body.appendChild(info);

// Initialize game
const game = new Game(app);

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
