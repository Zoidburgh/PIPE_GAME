import type { TileDefinition, ConnectionPoint } from './types';

const TILE_SIZE = 128;  // pixels
const PIPE_WIDTH = 8;
const CONNECTOR_SIZE = 14;

const COLORS = {
  green: '#22c55e',
  blue: '#3b82f6',
  orange: '#f97316',
  black: '#1a1a1a',
  red: '#ef4444',
};

// Convert normalized coords (-1 to 1) to canvas coords
function toCanvas(x: number, y: number): [number, number] {
  return [
    (x + 1) * TILE_SIZE / 2,
    (1 - y) * TILE_SIZE / 2  // flip y for canvas
  ];
}

// Draw a connector (endpoint) at a position
function drawConnector(ctx: CanvasRenderingContext2D, point: ConnectionPoint) {
  const [cx, cy] = toCanvas(point.x, point.y);
  
  ctx.fillStyle = COLORS[point.type] || COLORS.black;
  ctx.beginPath();
  
  // Draw rounded rectangle connector
  const w = CONNECTOR_SIZE;
  const h = CONNECTOR_SIZE * 0.6;
  ctx.roundRect(cx - w/2, cy - h/2, w, h, 3);
  ctx.fill();
}

// Draw a curved pipe path between two points
function drawPath(
  ctx: CanvasRenderingContext2D, 
  from: ConnectionPoint, 
  to: ConnectionPoint,
  color: string,
  controlPoints?: { x: number; y: number }[]
) {
  const [x1, y1] = toCanvas(from.x, from.y);
  const [x2, y2] = toCanvas(to.x, to.y);
  
  ctx.strokeStyle = color;
  ctx.lineWidth = PIPE_WIDTH;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  
  if (controlPoints && controlPoints.length > 0) {
    // Use bezier curves for smooth paths
    if (controlPoints.length === 1) {
      const [cpx, cpy] = toCanvas(controlPoints[0].x, controlPoints[0].y);
      ctx.quadraticCurveTo(cpx, cpy, x2, y2);
    } else {
      const [cp1x, cp1y] = toCanvas(controlPoints[0].x, controlPoints[0].y);
      const [cp2x, cp2y] = toCanvas(controlPoints[1].x, controlPoints[1].y);
      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, x2, y2);
    }
  } else {
    // Simple curved path
    const midX = (x1 + x2) / 2;
    const midY = (y1 + y2) / 2;
    
    // Add some curve based on positions
    const dx = x2 - x1;
    const dy = y2 - y1;
    const cx = midX - dy * 0.3;
    const cy = midY + dx * 0.3;
    
    ctx.quadraticCurveTo(cx, cy, x2, y2);
  }
  
  ctx.stroke();
}

// Draw a self-loop (connects point to itself)
function drawLoop(
  ctx: CanvasRenderingContext2D,
  point: ConnectionPoint,
  color: string
) {
  const [x, y] = toCanvas(point.x, point.y);
  
  ctx.strokeStyle = color;
  ctx.lineWidth = PIPE_WIDTH;
  ctx.lineCap = 'round';
  
  // Draw a loop that comes back to the same point
  const loopSize = 30;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.bezierCurveTo(
    x - loopSize, y - loopSize,
    x + loopSize, y - loopSize,
    x, y
  );
  ctx.stroke();
}

// Draw decorations (flower, waves)
function drawDecorations(ctx: CanvasRenderingContext2D, type: string, color: string) {
  const center = TILE_SIZE / 2;
  
  if (type === 'flower') {
    ctx.fillStyle = color;
    const petalCount = 5;
    const petalSize = 12;
    const innerRadius = 8;
    
    for (let i = 0; i < petalCount; i++) {
      const angle = (i / petalCount) * Math.PI * 2 - Math.PI / 2;
      const px = center + Math.cos(angle) * innerRadius;
      const py = center + Math.sin(angle) * innerRadius;
      
      ctx.beginPath();
      ctx.ellipse(px, py, petalSize, petalSize * 0.5, angle, 0, Math.PI * 2);
      ctx.fill();
    }
    
    // Center
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(center, center, 6, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === 'waves') {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    
    for (let i = 0; i < 3; i++) {
      const y = center - 15 + i * 15;
      ctx.beginPath();
      ctx.moveTo(center - 20, y);
      ctx.quadraticCurveTo(center - 10, y - 5, center, y);
      ctx.quadraticCurveTo(center + 10, y + 5, center + 20, y);
      ctx.stroke();
    }
  }
}

// Main render function
export function renderTile(tile: TileDefinition): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = TILE_SIZE;
  canvas.height = TILE_SIZE;
  
  const ctx = canvas.getContext('2d')!;
  
  // Clear with transparency
  ctx.clearRect(0, 0, TILE_SIZE, TILE_SIZE);
  
  // Optional: draw tile border for visibility
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  ctx.strokeRect(1, 1, TILE_SIZE - 2, TILE_SIZE - 2);
  
  const pipeColor = COLORS[tile.color];
  
  // Draw paths first
  for (const path of tile.paths) {
    const from = tile.connections[path.from];
    const to = tile.connections[path.to];
    
    if (path.from === path.to) {
      // Self-loop
      drawLoop(ctx, from, pipeColor);
    } else {
      drawPath(ctx, from, to, pipeColor, path.controlPoints);
    }
  }
  
  // Draw decorations
  if (tile.decorations && tile.decorations !== 'none') {
    drawDecorations(ctx, tile.decorations, pipeColor);
  }
  
  // Draw connectors on top
  for (const conn of tile.connections) {
    drawConnector(ctx, conn);
  }
  
  return canvas;
}

// Render all tiles and return a map of id -> canvas
export function renderAllTiles(tiles: TileDefinition[]): Map<string, HTMLCanvasElement> {
  const rendered = new Map<string, HTMLCanvasElement>();
  
  for (const tile of tiles) {
    rendered.set(tile.id, renderTile(tile));
  }
  
  return rendered;
}
