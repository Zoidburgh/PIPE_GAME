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

// Create puzzle settings panel
const puzzlePanel = document.createElement('div');
puzzlePanel.id = 'puzzle-settings';
puzzlePanel.innerHTML = `
  <h3>Puzzle Generator</h3>
  <div class="setting-row">
    <label>Min tiles:</label>
    <input type="number" id="puzzle-min" value="4" min="2" max="20">
  </div>
  <div class="setting-row">
    <label>Max tiles:</label>
    <input type="number" id="puzzle-max" value="7" min="2" max="20">
  </div>
  <div class="setting-row">
    <label>
      <input type="checkbox" id="puzzle-3d"> Allow 3D
    </label>
  </div>
  <button id="generate-puzzle">Generate Puzzle</button>
  <button id="reveal-solution" style="display:none">Reveal Solution</button>
  <button id="exit-puzzle" style="display:none">Exit Puzzle Mode</button>
  <div id="puzzle-status"></div>
`;
document.body.appendChild(puzzlePanel);

// Wire up puzzle settings
const puzzleMinInput = document.getElementById('puzzle-min') as HTMLInputElement;
const puzzleMaxInput = document.getElementById('puzzle-max') as HTMLInputElement;
const puzzle3DInput = document.getElementById('puzzle-3d') as HTMLInputElement;
const generateBtn = document.getElementById('generate-puzzle')!;
const revealBtn = document.getElementById('reveal-solution')!;
const exitBtn = document.getElementById('exit-puzzle')!;
const puzzleStatus = document.getElementById('puzzle-status')!;

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

// Wire up puzzle panel events
generateBtn.addEventListener('click', () => {
  const min = parseInt(puzzleMinInput.value) || 4;
  const max = parseInt(puzzleMaxInput.value) || 7;
  const allow3D = puzzle3DInput.checked;

  // Validate inputs
  if (min < 2 || max < 2) {
    puzzleStatus.textContent = 'Min 2 tiles required';
    puzzleStatus.className = 'error';
    return;
  }
  if (min > max) {
    puzzleStatus.textContent = 'Min must be ≤ Max';
    puzzleStatus.className = 'error';
    return;
  }

  puzzleStatus.textContent = 'Generating...';
  puzzleStatus.className = '';

  // Use setTimeout to allow UI to update
  setTimeout(() => {
    game.setPuzzleSize(min, max);
    game.setAllow3D(allow3D);
    game.startPuzzle();

    if (game.puzzleMode) {
      puzzleStatus.textContent = `Puzzle ready! ${game.currentPuzzle?.tiles.length} tiles`;
      puzzleStatus.className = 'success';
      generateBtn.style.display = 'none';
      revealBtn.style.display = 'block';
      exitBtn.style.display = 'block';
    } else {
      puzzleStatus.textContent = 'Generation failed, try again';
      puzzleStatus.className = 'error';
    }
  }, 10);
});

revealBtn.addEventListener('click', () => {
  game.revealSolution();
  puzzleStatus.textContent = 'Solution revealed! Press Z to undo';
  puzzleStatus.className = '';
});

exitBtn.addEventListener('click', () => {
  game.exitPuzzleMode();
  puzzleStatus.textContent = '';
  generateBtn.style.display = 'block';
  revealBtn.style.display = 'none';
  exitBtn.style.display = 'none';
});

// Sync puzzle size inputs when they change
puzzleMinInput.addEventListener('change', () => {
  const min = parseInt(puzzleMinInput.value) || 4;
  const max = parseInt(puzzleMaxInput.value) || 7;
  if (min > max) {
    puzzleMaxInput.value = String(min);
  }
});

puzzleMaxInput.addEventListener('change', () => {
  const min = parseInt(puzzleMinInput.value) || 4;
  const max = parseInt(puzzleMaxInput.value) || 7;
  if (max < min) {
    puzzleMinInput.value = String(max);
  }
});

console.log('Pipes game initialized!');
