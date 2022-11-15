/* Game code for Split */

// Colors
const   BG_COLOR = "#030";
const CELL_COLOR = "#070";
const GRID_COLOR = "#000";
const LINE_COLOR = "#fff";
const  PIP_COLOR = "#fff";
// Sizes
const VERTEX_SIZE = 0.3;
const EDGE_WIDTH = 0.15;
const PIP_PATTERN_RADIUS = 0.2;
const PIP_SIZE = 0.1;
// Interaction
const VERTEX_INTERACTION_RADIUS = 0.71;

/// Singleton instance which handles all top-level game logic
class Game {
  constructor(puzzles) {
    this.puzzles = puzzles;
    this.grids = [
      new Grid(puzzles[6], 120, -300, 0),
      new Grid(puzzles[6], 120, 300, 0),
    ];
  }
}

/// An instance of a `Puzzle` on the screen
class Grid {
  constructor(puzzle, scale, x, y) {
    this.puzzle = puzzle;
    this.scale = scale;
    this.position = { x, y };

    // List of vertex indices which make up the line being drawn
    this.line = [];
  }

  /// Returns useful information about the cursor's location
  mouse_state() {
    // Transform mouse coordinates into the puzzle's coord space
    let local_x = (mouse_x - canvas.width  / 2 - this.position.x) / this.scale + this.puzzle.width  / 2;
    let local_y = (mouse_y - canvas.height / 2 - this.position.y) / this.scale + this.puzzle.height / 2;

    // Find the closest vertex
    let nearest_vert_idx = undefined;
    let nearest_vert_distance = VERTEX_INTERACTION_RADIUS;
    for (let v_idx = 0; v_idx < this.puzzle.verts.length; v_idx++) {
      let { x: vert_x, y: vert_y } = this.puzzle.verts[v_idx];
      let dX = local_x - vert_x;
      let dY = local_y - vert_y;
      let dist = Math.sqrt(dX * dX + dY * dY);
      if (dist < nearest_vert_distance) {
        nearest_vert_idx = v_idx;
        nearest_vert_distance = dist;
      }
    }

    return {
      local_x, local_y,
      nearest_vert_idx,
      nearest_vert_distance,
    };
  }

  /// Called when the mouse is clicked (i.e. a line should start being drawn)
  on_mouse_down() {
    let mouse = this.mouse_state();
    if (mouse.nearest_vert_idx !== undefined) {
      this.line = [mouse.nearest_vert_idx];
    }
  }

  /// Called when the mouse moves
  on_mouse_move() {
    let mouse = this.mouse_state();

    let new_vert = mouse.nearest_vert_idx;
    let last_vert = this.line[this.line.length - 1];
    let penultimate_vert = this.line[this.line.length - 2];

    if (this.line.length == 0) return; // No line is being drawn
    if (!mouse_button) return; // User is not dragging
    if (new_vert === undefined) return; // Mouse not close enough to a vert
    if (new_vert === last_vert) return; // Still on last vert
    if (this.puzzle.connecting_edge(last_vert, new_vert) === undefined)
       return; // Verts aren't connected

    if (new_vert === penultimate_vert) {
     this.line.pop(); // Moved backward, 'unwind' the line
    } else {
      this.line.push(new_vert); // Moved forward, 'extend' the line
    }
  }

  draw() {
    let mouse = this.mouse_state();

    ctx.save();
    ctx.translate(this.position.x, this.position.y);
    ctx.scale(this.scale, this.scale);
    ctx.translate(-this.puzzle.width / 2, -this.puzzle.height / 2);

    // Cell
    ctx.fillStyle = CELL_COLOR;
    for (const c of this.puzzle.cells) {
      ctx.beginPath();
      for (const v of c.verts) {
        ctx.lineTo(this.puzzle.verts[v].x, this.puzzle.verts[v].y);
      }
      ctx.fill();
    }
    // Edges
    ctx.lineWidth = EDGE_WIDTH;
    ctx.strokeStyle = GRID_COLOR;
    for (const e of this.puzzle.edges) {
      let v1 = this.puzzle.verts[e.v1];
      let v2 = this.puzzle.verts[e.v2];
      ctx.beginPath();
      ctx.moveTo(v1.x, v1.y);
      ctx.lineTo(v2.x, v2.y);
      ctx.stroke();
    }
    // Vertices
    for (let v_idx = 0; v_idx < this.puzzle.verts.length; v_idx++) {
      const { x, y } = this.puzzle.verts[v_idx];
      ctx.fillStyle = v_idx === mouse.nearest_vert_idx ? LINE_COLOR : GRID_COLOR;
      ctx.fillRect(x - VERTEX_SIZE / 2, y - VERTEX_SIZE / 2, VERTEX_SIZE, VERTEX_SIZE);
    }
    // Line
    ctx.lineWidth = EDGE_WIDTH;
    ctx.strokeStyle = LINE_COLOR;
    ctx.beginPath();
    for (const vert_idx of this.line) {
      let vert = this.puzzle.verts[vert_idx];
      ctx.lineTo(vert.x, vert.y);
    }
    ctx.stroke();

    // Pips
    ctx.fillStyle = PIP_COLOR;
    for (const c of this.puzzle.cells) {
      for (const { x, y } of dice_pattern(c.pips)) {
        let puzzle_x = c.centre.x + x * PIP_PATTERN_RADIUS;
        let puzzle_y = c.centre.y + y * PIP_PATTERN_RADIUS;
        ctx.fillRect(puzzle_x - PIP_SIZE / 2, puzzle_y - PIP_SIZE / 2, PIP_SIZE, PIP_SIZE);
      }
    }

    ctx.restore();
  }
}

/// Abstract representation of a `Puzzle`, without any attached lines or solution
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
        this.verts.push({ x, y });
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

  connecting_edge(vert_1, vert_2) {
    for (let i = 0; i < this.edges.length; i++) {
      const { v1, v2 } = this.edges[i];
      if (vert_1 == v1 && vert_2 == v2) return i;
      if (vert_1 == v2 && vert_2 == v1) return i;
    }
    return undefined;
  }
}

function render() {
  ctx.fillStyle = BG_COLOR;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  for (const g of game.grids) {
    g.draw();
  }
  ctx.restore();
}

/// Compute the (normalised) coordinates of the pips on the dice pattern of a given number.
function dice_pattern(num_pips) {
  const pip_pair_patterns = [
    [1, -1],    // 2
    [1, 1],     // 4
    [1, 0],     // 6
    [0, 1],     // 8
    [1/3, 1/3], // 10
  ];

  const pip_positions = [];
  // Add pairs of opposite pips for each even-numbered dice patterns
  for (let i = 0; i < (num_pips - 1) / 2; i++) {
    let [x, y] = pip_pair_patterns[i];
    pip_positions.push({ x:  x, y:  y });
    pip_positions.push({ x: -x, y: -y });
  }
  // Add a pip in the centre for odd-numbered dice patterns
  if (num_pips % 2 == 1) pip_positions.push({ x: 0, y: 0 });

  return pip_positions;
}

/* ===== BOILERPLATE CODE FOR BROWSER INTERFACING ===== */

const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext('2d');

// Create puzzle patterns
const puzzles = [
  // Intro
  "11",
  "112",
  "123",
  "21|1 ",
  "11|11",
  " 1 |1 1| 1 ",
  "11|11|11",
  "111|111|111",
  
  /* Cool set of puzzles */
  "21|12",
  "21 |12 |   ",
  "21 |12 |  2",
  "21  |12  |  2 |    ",
  "21  |12  |    |   2",

  /* Misc puzzles */
  " 1 |1 1|111",
  "111|181|111",
  "4224|2112|2112|4224",
].map((p) => new Puzzle(p));
const game = new Game(puzzles);

function frame() {
  render();
  
  // window.requestAnimationFrame(frame);
}

window.addEventListener("resize", on_resize);
function on_resize() {
  // Set the canvas size according to its new on-screen size
  var rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * window.devicePixelRatio;
  canvas.height = rect.height * window.devicePixelRatio;
  render(); // TODO: Remove this once we have an animation loop
}

/* MOUSE HANDLING */

let mouse_x = 0;
let mouse_y = 0;
let mouse_button = false;

window.addEventListener("mousemove", (evt) => {
  // TODO: Split fast mouse moves into multiple `mouse_down` events
  update_mouse(evt);
  for (const g of game.grids) {
    g.on_mouse_move();
  }
  frame();
});
window.addEventListener("mousedown", (evt) => {
  update_mouse(evt);
  for (const g of game.grids) {
    g.on_mouse_down();
  }
  frame();
});
window.addEventListener("mouseup", (evt) => {
  update_mouse(evt);
  frame();
});

function update_mouse(evt) {
  mouse_x = evt.clientX * window.devicePixelRatio;
  mouse_y = evt.clientY * window.devicePixelRatio;
  mouse_button = evt.buttons != 0;
};

/* INIT GAME ON STARTUP */

on_resize();
frame();
