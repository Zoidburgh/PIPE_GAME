// Connector positions on each edge: null (none), 'left', 'middle', 'right'
// When looking at the tile with top edge at top:
// - Top edge: left = top-left corner area, right = top-right corner area
// - Right edge: left = top-right corner area, right = bottom-right corner area
// - Bottom edge: left = bottom-right corner area, right = bottom-left corner area
// - Left edge: left = bottom-left corner area, right = top-left corner area

export type ConnectorPos = null | 'left' | 'middle' | 'right';

export interface TileConfig {
  top: ConnectorPos;
  right: ConnectorPos;
  bottom: ConnectorPos;
  left: ConnectorPos;
}

export interface GeneratedTile {
  id: string;
  name: string;
  config: TileConfig;
}

// Get pixel position for a connector on an edge
function getConnectorPosition(
  edge: 'top' | 'right' | 'bottom' | 'left',
  pos: ConnectorPos,
  size: number,
  margin: number
): { x: number; y: number } | null {
  if (pos === null) return null;

  // Corner positions are 18% from center (closer to middle than actual corners)
  const cornerOffset = size * 0.18;
  const mid = size / 2;

  switch (edge) {
    case 'top':
      if (pos === 'left') return { x: mid - cornerOffset, y: margin };
      if (pos === 'middle') return { x: mid, y: margin };
      if (pos === 'right') return { x: mid + cornerOffset, y: margin };
      break;
    case 'right':
      if (pos === 'left') return { x: size - margin, y: mid - cornerOffset };
      if (pos === 'middle') return { x: size - margin, y: mid };
      if (pos === 'right') return { x: size - margin, y: mid + cornerOffset };
      break;
    case 'bottom':
      if (pos === 'left') return { x: mid + cornerOffset, y: size - margin };
      if (pos === 'middle') return { x: mid, y: size - margin };
      if (pos === 'right') return { x: mid - cornerOffset, y: size - margin };
      break;
    case 'left':
      if (pos === 'left') return { x: margin, y: mid + cornerOffset };
      if (pos === 'middle') return { x: margin, y: mid };
      if (pos === 'right') return { x: margin, y: mid - cornerOffset };
      break;
  }
  return null;
}

// Render the bottom face texture - mirrored vertically (flip on X axis)
// so when looking from below, pipes appear in same world position
export function renderTileFlipped(config: TileConfig, size = 128): HTMLCanvasElement {
  const original = renderTileFromConfig(config, size, true);
  const flipped = document.createElement('canvas');
  flipped.width = size;
  flipped.height = size;
  const ctx = flipped.getContext('2d')!;

  // Flip vertically (mirror on X axis) - top becomes bottom
  ctx.translate(0, size);
  ctx.scale(1, -1);
  ctx.drawImage(original, 0, 0);

  return flipped;
}

// Render a tile from config
export function renderTileFromConfig(config: TileConfig, size = 128, transparent = false): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const margin = 8;
  const dotRadius = 7;
  const lineWidth = 8;
  const pipeColor = '#33dd77';
  const dotColor = '#ffff44';  // bright yellow for corner dots
  const middleDotColor = '#ff44ff';  // bright magenta for middle dots
  const bgColor = '#1a1a2e';

  if (transparent) {
    // Transparent background
    ctx.clearRect(0, 0, size, size);
  } else {
    // Solid background for palette preview
    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, size, size);

    // Border
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, size - 2, size - 2);
  }

  // Gather all connector positions with their type (middle or corner)
  const connectors: { x: number; y: number; isMiddle: boolean }[] = [];
  const edges: Array<'top' | 'right' | 'bottom' | 'left'> = ['top', 'right', 'bottom', 'left'];

  for (const edge of edges) {
    const pos = getConnectorPosition(edge, config[edge], size, margin);
    if (pos) connectors.push({ ...pos, isMiddle: config[edge] === 'middle' });
  }

  if (connectors.length === 0) return canvas;

  // Draw connections
  ctx.strokeStyle = pipeColor;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (connectors.length === 1) {
    // Just a dot, no lines
  } else if (connectors.length === 2) {
    // Simple line between two connectors
    ctx.beginPath();
    ctx.moveTo(connectors[0].x, connectors[0].y);
    ctx.lineTo(connectors[1].x, connectors[1].y);
    ctx.stroke();
  } else {
    // Multiple connectors: connect through center
    const centerX = size / 2;
    const centerY = size / 2;

    for (const conn of connectors) {
      ctx.beginPath();
      ctx.moveTo(conn.x, conn.y);
      ctx.lineTo(centerX, centerY);
      ctx.stroke();
    }
  }

  // Draw connector dots - different colors for middle vs corner
  for (const conn of connectors) {
    ctx.beginPath();
    ctx.arc(conn.x, conn.y, dotRadius, 0, Math.PI * 2);
    if (conn.isMiddle) {
      ctx.fillStyle = middleDotColor;  // magenta for middle
      ctx.fill();
      ctx.strokeStyle = '#aa22aa';
    } else {
      ctx.fillStyle = dotColor;  // yellow for corners
      ctx.fill();
      ctx.strokeStyle = '#aa9900';
    }
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  return canvas;
}

// Get canonical form of a tile config (smallest rotation)
function getCanonicalConfig(config: TileConfig): string {
  const edges = [config.top, config.right, config.bottom, config.left];

  // Generate all 4 rotations
  const rotations: string[] = [];
  for (let r = 0; r < 4; r++) {
    const rotated = [
      edges[(0 + r) % 4],
      edges[(1 + r) % 4],
      edges[(2 + r) % 4],
      edges[(3 + r) % 4]
    ];
    rotations.push(rotated.map(p => p || 'x').join('-'));
  }

  // Return the lexicographically smallest rotation as canonical form
  rotations.sort();
  return rotations[0];
}

// Generate all possible tile combinations (without rotational duplicates)
export function generateAllTiles(): GeneratedTile[] {
  const positions: ConnectorPos[] = [null, 'left', 'middle', 'right'];
  const tiles: GeneratedTile[] = [];
  const seen = new Set<string>();

  for (const top of positions) {
    for (const right of positions) {
      for (const bottom of positions) {
        for (const left of positions) {
          const config: TileConfig = { top, right, bottom, left };

          // Count connectors
          const count = [top, right, bottom, left].filter(p => p !== null).length;

          // Skip empty tiles
          if (count === 0) continue;

          // Get canonical form to detect rotational duplicates
          const canonical = getCanonicalConfig(config);

          if (!seen.has(canonical)) {
            seen.add(canonical);

            const name = generateTileName(config, count);
            tiles.push({
              id: `tile_${tiles.length}`,
              name,
              config
            });
          }
        }
      }
    }
  }

  return tiles;
}

function generateTileName(config: TileConfig, count: number): string {
  const parts: string[] = [];
  if (config.top) parts.push(`T-${config.top[0]}`);
  if (config.right) parts.push(`R-${config.right[0]}`);
  if (config.bottom) parts.push(`B-${config.bottom[0]}`);
  if (config.left) parts.push(`L-${config.left[0]}`);
  return `${count}way: ${parts.join(' ')}`;
}

// Export for use in game
export const GENERATED_TILES = generateAllTiles();
