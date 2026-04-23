import { GENERATED_TILES, renderTileFromConfig } from '../tiles/TileBuilder';
import {
  createEmptyState,
  shufflePuzzle,
  slideTile,
  checkSolved,
  renderTileWithRotation,
  getValidSlides,
  type SlidingPuzzleState
} from './SlidingPuzzle';

export class SlidingUI {
  private container: HTMLElement;
  private state: SlidingPuzzleState;
  private selectedTileId: string | null = null;
  private placementRotation: number = 0;
  private placementFlipped: boolean = false;
  private undoStack: SlidingPuzzleState[] = [];
  private shuffleMoves: number = 15;

  constructor(container: HTMLElement) {
    this.container = container;
    this.state = createEmptyState(3, 3);
    this.render();
  }

  private render() {
    this.container.innerHTML = '';

    // Create layout
    const layout = document.createElement('div');
    layout.className = 'sliding-layout';

    // Left panel: tile palette
    const palette = this.createPalette();
    layout.appendChild(palette);

    // Center: game grid
    const gameArea = document.createElement('div');
    gameArea.className = 'game-area';

    const controls = this.createControls();
    gameArea.appendChild(controls);

    const grid = this.createGrid();
    gameArea.appendChild(grid);

    const status = this.createStatus();
    gameArea.appendChild(status);

    layout.appendChild(gameArea);

    // Right panel: instructions
    const instructions = this.createInstructions();
    layout.appendChild(instructions);

    this.container.appendChild(layout);
  }

  private createPalette(): HTMLElement {
    const palette = document.createElement('div');
    palette.className = 'tile-palette';

    const header = document.createElement('h3');
    header.textContent = 'Tiles';
    palette.appendChild(header);

    // Grid container for tiles
    const tileGrid = document.createElement('div');
    tileGrid.className = 'tile-grid';

    // Only show tiles with connectors that might work well
    const goodTiles = GENERATED_TILES.filter(t => {
      const connCount = [t.config.top, t.config.right, t.config.bottom, t.config.left]
        .filter(c => c !== null).length;
      return connCount >= 1 && connCount <= 4;
    });

    for (const tile of goodTiles) {
      const option = document.createElement('div');
      option.className = 'tile-option';
      option.title = tile.name;
      if (this.selectedTileId === tile.id) {
        option.classList.add('selected');
      }

      const canvas = renderTileFromConfig(tile.config, 128, false);
      option.appendChild(canvas);

      option.addEventListener('click', () => {
        this.selectedTileId = tile.id;
        this.render();
      });

      tileGrid.appendChild(option);
    }

    palette.appendChild(tileGrid);

    // Rotation and flip controls for placement
    const rotControl = document.createElement('div');
    rotControl.className = 'rotation-control';
    rotControl.innerHTML = `
      <button id="rotate-ccw">↶</button>
      <span>${this.placementRotation}°</span>
      <button id="rotate-cw">↷</button>
      <button id="flip-btn" class="${this.placementFlipped ? 'active' : ''}">⇆ Flip</button>
    `;
    palette.appendChild(rotControl);

    setTimeout(() => {
      document.getElementById('rotate-ccw')?.addEventListener('click', () => {
        this.placementRotation = (this.placementRotation - 90 + 360) % 360;
        this.render();
      });
      document.getElementById('rotate-cw')?.addEventListener('click', () => {
        this.placementRotation = (this.placementRotation + 90) % 360;
        this.render();
      });
      document.getElementById('flip-btn')?.addEventListener('click', () => {
        this.placementFlipped = !this.placementFlipped;
        this.render();
      });
    }, 0);

    return palette;
  }

  private createControls(): HTMLElement {
    const controls = document.createElement('div');
    controls.className = 'controls';

    // Grid size selector
    const sizeControl = document.createElement('div');
    sizeControl.className = 'size-control';
    sizeControl.innerHTML = `
      <label>Rows: </label>
      <select id="grid-rows">
        <option value="2" ${this.state.rows === 2 ? 'selected' : ''}>2</option>
        <option value="3" ${this.state.rows === 3 ? 'selected' : ''}>3</option>
        <option value="4" ${this.state.rows === 4 ? 'selected' : ''}>4</option>
        <option value="5" ${this.state.rows === 5 ? 'selected' : ''}>5</option>
      </select>
      <label>Cols: </label>
      <select id="grid-cols">
        <option value="2" ${this.state.cols === 2 ? 'selected' : ''}>2</option>
        <option value="3" ${this.state.cols === 3 ? 'selected' : ''}>3</option>
        <option value="4" ${this.state.cols === 4 ? 'selected' : ''}>4</option>
        <option value="5" ${this.state.cols === 5 ? 'selected' : ''}>5</option>
      </select>
    `;
    controls.appendChild(sizeControl);

    // Mode indicator
    const modeIndicator = document.createElement('span');
    modeIndicator.className = `mode-indicator ${this.state.mode}`;
    modeIndicator.textContent = this.state.mode === 'edit' ? '✏️ Edit Mode' : '🎮 Play Mode';
    controls.appendChild(modeIndicator);

    // Buttons
    const buttons = document.createElement('div');
    buttons.className = 'button-row';

    if (this.state.mode === 'edit') {
      buttons.innerHTML = `
        <button id="clear-btn">Clear</button>
        <label>Moves: <input type="number" id="shuffle-moves" value="${this.shuffleMoves}" min="1" max="100" style="width:50px"></label>
        <button id="shuffle-btn" class="primary">Shuffle & Play</button>
      `;
    } else {
      buttons.innerHTML = `
        <button id="undo-btn" ${this.undoStack.length === 0 ? 'disabled' : ''}>Undo (${this.undoStack.length})</button>
        <button id="reset-btn">Reset Puzzle</button>
        <button id="edit-btn">Back to Edit</button>
      `;
    }
    controls.appendChild(buttons);

    // Move counter in play mode
    if (this.state.mode === 'play') {
      const moveCounter = document.createElement('span');
      moveCounter.className = 'move-counter';
      const isOver = this.state.moveCount > this.state.optimalMoves;
      moveCounter.classList.toggle('over-optimal', isOver);
      moveCounter.textContent = `Moves: ${this.state.moveCount} / ${this.state.optimalMoves}`;
      controls.appendChild(moveCounter);
    }

    // Wire up events
    setTimeout(() => {
      document.getElementById('grid-rows')?.addEventListener('change', (e) => {
        const rows = parseInt((e.target as HTMLSelectElement).value);
        this.state = createEmptyState(rows, this.state.cols);
        this.undoStack = [];
        this.render();
      });

      document.getElementById('grid-cols')?.addEventListener('change', (e) => {
        const cols = parseInt((e.target as HTMLSelectElement).value);
        this.state = createEmptyState(this.state.rows, cols);
        this.undoStack = [];
        this.render();
      });

      document.getElementById('clear-btn')?.addEventListener('click', () => {
        this.state = createEmptyState(this.state.rows, this.state.cols);
        this.undoStack = [];
        this.render();
      });

      document.getElementById('shuffle-moves')?.addEventListener('change', (e) => {
        this.shuffleMoves = parseInt((e.target as HTMLInputElement).value) || 15;
      });

      document.getElementById('shuffle-btn')?.addEventListener('click', () => {
        // Count non-empty tiles
        let tileCount = 0;
        for (const row of this.state.grid) {
          for (const tile of row) {
            if (tile) tileCount++;
          }
        }
        if (tileCount < 2) {
          alert('Place at least 2 tiles before shuffling!');
          return;
        }
        // Read shuffle moves from input
        const movesInput = document.getElementById('shuffle-moves') as HTMLInputElement;
        if (movesInput) {
          this.shuffleMoves = parseInt(movesInput.value) || 15;
        }
        this.state = shufflePuzzle(this.state, this.shuffleMoves);
        this.undoStack = [];
        this.render();
      });

      document.getElementById('undo-btn')?.addEventListener('click', () => {
        if (this.undoStack.length > 0) {
          this.state = this.undoStack.pop()!;
          this.render();
        }
      });

      document.getElementById('reset-btn')?.addEventListener('click', () => {
        if (this.state.solvedState) {
          this.state = {
            ...this.state,
            grid: this.state.solvedState.map(row => row.map(t => t ? { ...t } : null)),
            moveCount: 0,
            mode: 'play'
          };
          // Find empty position
          for (let row = 0; row < this.state.rows; row++) {
            for (let col = 0; col < this.state.cols; col++) {
              if (!this.state.grid[row][col]) {
                this.state.emptyPos = { row, col };
              }
            }
          }
          // Re-shuffle with same move count
          this.state = shufflePuzzle(this.state, this.shuffleMoves);
          this.undoStack = [];
          this.render();
        }
      });

      document.getElementById('edit-btn')?.addEventListener('click', () => {
        if (this.state.solvedState) {
          this.state = {
            ...this.state,
            grid: this.state.solvedState.map(row => row.map(t => t ? { ...t } : null)),
            mode: 'edit',
            moveCount: 0
          };
          // Find empty position
          for (let row = 0; row < this.state.rows; row++) {
            for (let col = 0; col < this.state.cols; col++) {
              if (!this.state.grid[row][col]) {
                this.state.emptyPos = { row, col };
              }
            }
          }
        }
        this.state.mode = 'edit';
        this.undoStack = [];
        this.render();
      });
    }, 0);

    return controls;
  }

  private createGrid(): HTMLElement {
    const gridContainer = document.createElement('div');
    gridContainer.className = 'grid-container';

    const grid = document.createElement('div');
    grid.className = 'sliding-grid';
    grid.style.gridTemplateColumns = `repeat(${this.state.cols}, 160px)`;
    grid.style.gridTemplateRows = `repeat(${this.state.rows}, 160px)`;

    const validSlides = this.state.mode === 'play' ? getValidSlides(this.state) : [];

    for (let row = 0; row < this.state.rows; row++) {
      for (let col = 0; col < this.state.cols; col++) {
        const cell = document.createElement('div');
        cell.className = 'grid-cell';
        cell.dataset.row = String(row);
        cell.dataset.col = String(col);

        const tile = this.state.grid[row][col];
        const isValidSlide = validSlides.some(v => v.row === row && v.col === col);

        if (tile) {
          const canvas = renderTileWithRotation(tile.tileId, tile.rotation, 152, tile.flipped);
          cell.appendChild(canvas);

          if (isValidSlide) {
            cell.classList.add('can-slide');
          }
        } else {
          cell.classList.add('empty');
        }

        // Click handler
        cell.addEventListener('click', (e) => this.handleCellClick(row, col, e.shiftKey));

        // Right-click to remove in edit mode
        cell.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          if (this.state.mode === 'edit' && tile) {
            this.state.grid[row][col] = null;
            this.render();
          }
        });

        grid.appendChild(cell);
      }
    }

    gridContainer.appendChild(grid);
    return gridContainer;
  }

  private handleCellClick(row: number, col: number, shiftKey: boolean = false) {
    if (this.state.mode === 'edit') {
      // Edit mode: place, rotate, or flip tile
      const existing = this.state.grid[row][col];
      if (existing) {
        if (shiftKey) {
          // Shift+click: flip existing tile
          existing.flipped = !existing.flipped;
        } else {
          // Click: rotate existing tile
          existing.rotation = (existing.rotation + 90) % 360;
        }
      } else if (this.selectedTileId) {
        // Place new tile
        this.state.grid[row][col] = {
          tileId: this.selectedTileId,
          rotation: this.placementRotation,
          flipped: this.placementFlipped
        };
        // Update empty position if we filled it
        if (row === this.state.emptyPos.row && col === this.state.emptyPos.col) {
          // Find a new empty space or mark none
          let foundEmpty = false;
          for (let r = 0; r < this.state.rows && !foundEmpty; r++) {
            for (let c = 0; c < this.state.cols && !foundEmpty; c++) {
              if (!this.state.grid[r][c]) {
                this.state.emptyPos = { row: r, col: c };
                foundEmpty = true;
              }
            }
          }
        }
      }
      this.render();
    } else {
      // Play mode: slide tile
      const newState = slideTile(this.state, row, col);
      if (newState) {
        this.undoStack.push(this.state);
        this.state = newState;
        this.render();

        // Check for win
        const result = checkSolved(this.state);
        if (result.solved) {
          setTimeout(() => {
            alert(`🎉 Solved in ${this.state.moveCount} moves!`);
          }, 100);
        }
      }
    }
  }

  private createStatus(): HTMLElement {
    const status = document.createElement('div');
    status.className = 'status';

    if (this.state.mode === 'edit') {
      const result = checkSolved(this.state);
      if (result.solved) {
        status.innerHTML = '<span class="success">✓ All connections valid - Ready to shuffle!</span>';
      } else if (result.errors.length > 0) {
        status.innerHTML = `<span class="warning">⚠ ${result.errors.length} connection issues</span>`;
      } else {
        status.innerHTML = '<span class="info">Place tiles to create a connected puzzle</span>';
      }
    } else {
      const result = checkSolved(this.state);
      if (result.solved) {
        status.innerHTML = '<span class="success">🎉 SOLVED!</span>';
      } else {
        status.innerHTML = `<span class="info">${result.errors.length} connections to fix</span>`;
      }
    }

    return status;
  }

  private createInstructions(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'instructions';

    if (this.state.mode === 'edit') {
      panel.innerHTML = `
        <h3>Edit Mode</h3>
        <p><strong>Click empty cell:</strong> Place tile</p>
        <p><strong>Click tile:</strong> Rotate 90°</p>
        <p><strong>Shift+click tile:</strong> Flip</p>
        <p><strong>Right-click tile:</strong> Remove</p>
        <hr>
        <p>Create a connected pipe network, then click <strong>Shuffle & Play</strong></p>
        <p>Leave one cell empty for sliding!</p>
      `;
    } else {
      panel.innerHTML = `
        <h3>Play Mode</h3>
        <p><strong>Click highlighted tile:</strong> Slide into empty space</p>
        <p>Every slide rotates the tile 90° clockwise</p>
        <hr>
        <p><strong>Goal:</strong> Solve in ${this.state.optimalMoves} moves or less!</p>
        <p>Green = on track</p>
        <p>Red = over optimal, consider undo</p>
      `;
    }

    return panel;
  }
}
