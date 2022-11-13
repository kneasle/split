/* Game code for Split */

const   BG_COLOR = "#030";
const CELL_COLOR = "#070";
const GRID_COLOR = "#000";
const LINE_COLOR = "#fff";
const  PIP_COLOR = "#fff";

const VERTEX_SIZE = 0.3;
const EDGE_WIDTH = 0.15;
const PIP_PATTERN_RADIUS = 0.17;
const PIP_SIZE = 0.1;

class Puzzle {
  constructor(string) {
    // Parse string into a list of pips in each cell
    let pip_lines = string.split("|");
    this.width = pip_lines[0].length;
    this.height = pip_lines.length;
    
    // Create vertices
    this.verts = [];
    for (let y = 0; y < this.height + 1; y++) {
      for (let x = 0; x < this.width + 1; x++) {
        this.verts.push({ x: x, y: y });
      }
    }
    let vert_idx = (x, y) => y * (this.width + 1) + x;

    this.edges = [];
    // Vertical edges
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width + 1; x++) {
        this.edges.push({ v1: vert_idx(x, y), v2: vert_idx(x, y + 1) });
      }
    }
    // Horizontal edges
    for (let y = 0; y < this.height + 1; y++) {
      for (let x = 0; x < this.width; x++) {
        this.edges.push({ v1: vert_idx(x + 1, y), v2: vert_idx(x, y) });
      }
    }
    
    // Cells
    this.cells = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        let tl = vert_idx(x    , y    );
        let tr = vert_idx(x + 1, y    );
        let br = vert_idx(x + 1, y + 1);
        let bl = vert_idx(x    , y + 1);
        this.cells.push({
          verts: [tl, tr, br, bl],
          centre: { x: x + 0.5, y: y + 0.5 },
          pips: parseInt(pip_lines[y][x]) || 0,
        });
      }
    }
  }
  
  draw() {
    ctx.save();
    ctx.scale(150, 150);
    ctx.translate(-this.width / 2, -this.height / 2);

    // Cell
    ctx.fillStyle = CELL_COLOR;
    for (const c of this.cells) {
      ctx.beginPath();
      for (const v of c.verts) {
        ctx.lineTo(this.verts[v].x, this.verts[v].y);
      }
      ctx.fill();
    }
    // Vertices
    ctx.fillStyle = GRID_COLOR;
    for (const v of this.verts) {
      ctx.fillRect(
        v.x - VERTEX_SIZE / 2,
        v.y - VERTEX_SIZE / 2,
        VERTEX_SIZE,
        VERTEX_SIZE
      );
    }
    // Edges
    ctx.lineWidth = EDGE_WIDTH;
    ctx.strokeStyle = GRID_COLOR;
    for (const e of this.edges) {
      let v1 = this.verts[e.v1];
      let v2 = this.verts[e.v2];
      ctx.beginPath();
      ctx.moveTo(v1.x, v1.y);
      ctx.lineTo(v2.x, v2.y);
      ctx.stroke();
    }
    // Pips
    ctx.fillStyle = PIP_COLOR;
    for (const c of this.cells) {
      for (const { x, y } of dice_pattern(c.pips)) {
        let puzzle_x = c.centre.x + x * PIP_PATTERN_RADIUS;
        let puzzle_y = c.centre.y + y * PIP_PATTERN_RADIUS;
        ctx.fillRect(
          puzzle_x - PIP_SIZE / 2,
          puzzle_y - PIP_SIZE / 2,
          PIP_SIZE,
          PIP_SIZE,
        );
      }
    }

    ctx.restore();
  }
}

function render() {
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  puzzle.draw();
  ctx.restore();
}

/// Compute the (normalised) coordinates of the pips on the dice pattern of a given number.
function dice_pattern(num_pips) {
  const pip_pair_patterns = [
    [1, -1], // 2
    [1, 1], // 4
    [1, 0], // 6
    [0, 1], // 8
    [1/3, 1/3], // 10
  ];

  const pip_positions = [];
  // Add pairs of opposite pips for each even-numbered dice patterns
  for (let i = 0; i < (num_pips - 1) / 2; i++) {
    let [x, y] = pip_pair_patterns[i];
    pip_positions.push({ x: x, y: y });
    pip_positions.push({ x: -x, y: -y });
  }
  // Add a pip in the centre for odd-numbered dice patterns
  if (num_pips % 2 == 1)  pip_positions.push({ x: 0, y: 0 });

  return pip_positions;
}

/* ===== STARTUP CODE & RESIZE LOGIC ===== */

const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext('2d');

window.addEventListener("resize", on_resize);

const puzzle = new Puzzle("21 |12 |   ");
console.log(puzzle);

on_resize();
frame();

function frame() {
  render();
  
  // window.requestAnimationFrame(frame);
}

function on_resize() {
  // Set the canvas size according to its new on-screen size
  var rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * window.devicePixelRatio;
  canvas.height = rect.height * window.devicePixelRatio;
}

function request_frame() {
  window.requestAnimationFrame(frame);
}
