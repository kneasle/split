/* Game code for Split */

// Colors
const BG_COLOR = "#030";
const CELL_COLOR = "#070";
const GRID_COLOR = "#000";
const LINE_COLOR = "#fff";
const PIP_COLOR = "#fff";
// Sizes
const VERTEX_SIZE = 0.3;
const EDGE_WIDTH = 0.15;
const PIP_PATTERN_RADIUS = 0.2;
const PIP_SIZE = 0.1;
// Animation
const PIP_ANIMATION_TIME = 0.3; // Seconds
const PIP_ANIMATION_SPREAD = 0.7; // Factor of `PIP_ANIMATION_TIME`
// Interaction
const VERTEX_INTERACTION_RADIUS = 0.71;

/// Singleton instance which handles all top-level game logic
class Game {
  constructor(puzzles) {
    // Puzzles
    this.puzzles = puzzles;
    this.grids = [
      new Grid(puzzles[6], 120, -300, 0),
      new Grid(puzzles[6], 120, 300, 0),
    ];

    this.selected_grid_idx = undefined; // Used to lock interaction to one grid when drawing
  }

  /* INTERACTION */

  frame() {
    this.render();
  }

  render() {
    let interaction = this.interaction();

    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    for (let g_idx = 0; g_idx < this.grids.length; g_idx++) {
      this.grids[g_idx].draw(
        (interaction && interaction.grid_idx === g_idx) ? interaction : undefined,
      );
    }
    ctx.restore();
  }

  /* INTERACTION */

  on_mouse_move() {
    if (this.selected_grid_idx !== undefined) {
      // The user is drawing a line in `this.selected_grid_idx`
      let interaction = this.interaction();
      console.assert(interaction.grid_idx === this.selected_grid_idx);
      this.grids[this.selected_grid_idx].update_line(interaction);
    }
  }

  on_mouse_down() {
    console.assert(!this.is_drawing_line());
    let interaction = this.interaction();
    if (interaction) {
      this.selected_grid_idx = interaction.grid_idx; // Start drawing a line in the interacted grid
      this.selected_grid().begin_drawing_line(interaction);
    }
  }

  on_mouse_up() {
    if (this.is_drawing_line()) {
      this.selected_grid().finish_drawing_line(this.interaction);
      this.selected_grid_idx = undefined; // No line being drawn => no grid selected
    }
  }

  // Find out what the mouse must be interacting with (in this case, the user is defined to be
  // interacting with the nearest vertex to the mouse).
  interaction() {
    let interaction = undefined;

    for (let grid_idx = 0; grid_idx < this.grids.length; grid_idx++) {
      // Skip the non-selected grid when drawing lines
      if (this.is_drawing_line() && this.selected_grid_idx !== grid_idx) {
        continue;
      }

      let grid = this.grids[grid_idx];
      // Transform mouse coordinates into the puzzle's coord space
      let local_x = (mouse_x - canvas.width / 2 - grid.position.x) / grid.scale +
        grid.puzzle.width / 2;
      let local_y = (mouse_y - canvas.height / 2 - grid.position.y) / grid.scale +
        grid.puzzle.height / 2;

      for (let vert_idx = 0; vert_idx < grid.puzzle.verts.length; vert_idx++) {
        let { x: vert_x, y: vert_y } = grid.puzzle.verts[vert_idx];
        let dX = local_x - vert_x;
        let dY = local_y - vert_y;
        let dist = Math.sqrt(dX * dX + dY * dY);
        if (interaction === undefined || dist < interaction.vert_distance) {
          interaction = {
            local_x,
            local_y,
            vert_idx,
            grid_idx,
            vert_distance: dist,
          };
        }
      }
    }

    // Check if mouse is too far away, but only when not drawing lines
    if (
      !this.is_drawing_line() && interaction &&
      interaction.vert_distance > VERTEX_INTERACTION_RADIUS
    ) {
      interaction = undefined;
    }

    return interaction;
  }

  /* UTILS */

  is_drawing_line() {
    return this.selected_grid_idx !== undefined;
  }

  selected_grid() {
    return this.grids[this.selected_grid_idx];
  }
}

/// An instance of a `Puzzle` on the screen
class Grid {
  constructor(puzzle, scale, x, y) {
    this.puzzle = puzzle;
    // Transform
    this.scale = scale;
    this.position = { x, y };
    // List of vertex indices which make up the line being drawn
    this.line = [];

    // Create pips
    this.pips = [];
    for (let c = 0; c < this.puzzle.cells.length; c++) {
      const cell = this.puzzle.cells[c];
      for (let p = 0; p < cell.pips; p++) {
        const unsolved_state = this.puzzle.pip_coords(c, p);
        this.pips.push(new Pip(c, unsolved_state));
      }
    }
  }

  begin_drawing_line(interaction) {
    if (interaction.vert_idx !== undefined) {
      this.line = [interaction.vert_idx];
      // Animate all pips back to their start locations
      for (const pip of this.pips) {
        pip.animate_to(pip.unsolved_state);
      }
    }
  }

  update_line(interaction) {
    let new_vert = interaction.vert_idx;
    let last_vert = this.line[this.line.length - 1];
    let penultimate_vert = this.line[this.line.length - 2];

    if (this.line.length == 0) return; // No line is being drawn
    if (!mouse_button) return; // User is not dragging
    if (new_vert === undefined) return; // Mouse not close enough to a vert
    if (new_vert === last_vert) return; // Still on last vert
    if (this.puzzle.connecting_edge(last_vert, new_vert) === undefined) {
      return; // Verts aren't connected
    }

    if (new_vert === penultimate_vert) {
      this.line.pop(); // Moved backward, 'unwind' the line
    } else {
      this.line.push(new_vert); // Moved forward, 'extend' the line
    }
  }

  finish_drawing_line(interaction) {
    const is_line_loop = this.line.length > 1 &&
      this.line[0] === this.line[this.line.length - 1];
    if (is_line_loop) {
      // Check the solvedness of the puzzle
      // Animate all pips to their solved positions
      for (const pip of this.pips) {
        pip.animate_to({ x: 0, y: 0 });
      }
    }
  }

  draw(interaction) {
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
      ctx.fillStyle = (interaction && v_idx === interaction.vert_idx) ? LINE_COLOR : GRID_COLOR;
      ctx.fillRect(
        x - VERTEX_SIZE / 2,
        y - VERTEX_SIZE / 2,
        VERTEX_SIZE,
        VERTEX_SIZE,
      );
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
    for (const pip of this.pips) {
      const { x, y } = pip.current_state();
      ctx.fillRect(x - PIP_SIZE / 2, y - PIP_SIZE / 2, PIP_SIZE, PIP_SIZE);
    }

    ctx.restore();
  }
}

class Pip {
  constructor(source_cell_idx, unsolved_state) {
    // Location of the pip in the unsolved puzzle
    this.source_cell_idx = source_cell_idx;
    this.unsolved_state = unsolved_state;

    // Start the pips animating from unsolved to unsolved
    this.anim_source = unsolved_state;
    this.anim_target = unsolved_state;
    this.anim_start_time = Date.now();
  }

  animate_to(target_state) {
    this.anim_source = this.current_state();
    this.anim_target = target_state;
    this.anim_start_time = Date.now() +
      Math.random() * 1000 * PIP_ANIMATION_SPREAD * PIP_ANIMATION_TIME;
  }

  current_state() {
    let anim_factor = (Date.now() - this.anim_start_time) / 1000 /
      PIP_ANIMATION_TIME;
    anim_factor = Math.max(0, Math.min(1, anim_factor)); // Clamp
    anim_factor = ease_in_out(anim_factor); // Easing
    return {
      x: lerp(this.anim_source.x, this.anim_target.x, anim_factor),
      y: lerp(this.anim_source.y, this.anim_target.y, anim_factor),
    };
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
        let tl = vert_idx(x, y);
        let tr = vert_idx(x + 1, y);
        let br = vert_idx(x + 1, y + 1);
        let bl = vert_idx(x, y + 1);
        this.cells.push({
          verts: [tl, tr, br, bl],
          centre: { x: x + 0.5, y: y + 0.5 },
          pips: parseInt(pip_lines[y][x]) || 0,
        });
      }
    }
  }

  pip_coords(cell_idx, pip_idx) {
    const cell = this.cells[cell_idx];
    const { x, y } = dice_pattern(cell.pips)[pip_idx];
    return {
      x: cell.centre.x + x * PIP_PATTERN_RADIUS,
      y: cell.centre.y + y * PIP_PATTERN_RADIUS,
    };
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

/// Compute the (normalised) coordinates of the pips on the dice pattern of a given number.
function dice_pattern(num_pips) {
  const pip_pair_patterns = [
    [1, -1], // 2
    [1, 1], // 4
    [1, 0], // 6
    [0, 1], // 8
    [1 / 3, 1 / 3], // 10
  ];

  const pip_positions = [];
  // Add pairs of opposite pips for each even-numbered dice patterns
  for (let i = 0; i < (num_pips - 1) / 2; i++) {
    let [x, y] = pip_pair_patterns[i];
    pip_positions.push({ x: x, y: y });
    pip_positions.push({ x: -x, y: -y });
  }
  // Add a pip in the centre for odd-numbered dice patterns
  if (num_pips % 2 == 1) pip_positions.push({ x: 0, y: 0 });

  return pip_positions;
}

/* ===== BOILERPLATE CODE FOR BROWSER INTERFACING ===== */

const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");

// Create puzzle patterns
const puzzles = [
  // Intro
  "11",
  "112",
  "123",
  "21|1 ",
  "11|11",
  "11|1 ",
  " 1 |1 1| 1 ",
  "11|11|11",
  "111|111|111",

  // Cool set of puzzles
  "21|12",
  "21 |12 |   ",
  "21 |12 |  2",
  "21  |12  |  2 |    ",
  "21  |12  |    |   2",

  // Cool set of puzzles
  // TODO: Do this whole set as 1+2=3 rather than 1+1=2
  // TODO: Prune this down a bit
  "2 1|1 2",
  "2 2|1 1",
  "   |2 2|1 1",
  "2 2|   |1 1",
  "  2| 2 |1 1",
  "  2|12 |  1",
  "2 2|1  |  1",
  "22 |1  |  1",
  "222|1  |  1",
  "222|1 1|   ",

  // Cool set of puzzles
  " 31|31 |1  ",
  "331|31 |1  ",
  " 31|31 |1 3",
  " 31|33 |1 1",

  // Cool set of puzzles
  "123|2 1",
  " 2 |1 3|2 1",
  " 1 |2 3|2 1",

  // Cool set of puzzles
  "1 1|2 2|1 1",
  "   |1 1|2 2|1 1",

  // Cool set of puzzles
  "21|21",
  " 21| 21",
  "221|  1",

  // Cool set of puzzles
  " 2 | 2 | 2 ",
  " 2 | 2 |1 1",
  "1 1| 2 |1 1",
  "1 1|  2|1 1",
  "1 1|1 2|  1",

  // Cool set of puzzles
  "  2|2  |11 ",
  "  2|   |112",
  "  2|   |112",
  "2 2|   |112",
  "2 2|   |121",

  // Cool set of puzzles
  "313|   |131",
  "113|   |331",
  "131|   |331",
  "111|   |333",

  // Twizzly puzzles
  "1  3|  5 |    |  4 |2   ", // TODO: Rotate?
  "1   3| 2   |   4 |5   6",
  "1   3| 4   |   2 |5   6",

  // Puzzles looking for sets
  "1 2| 2 |  1",

  // Misc puzzles
  "1 2 |3 4 |    ",
  "1 2|34 |   ",
  "121|2 2|121",
  " 33|   |114",
  " 1 |1 1|111",
  "    |12 21",
  "111|181|111",
  "1 41|4   |   4|14 1",
  "2  2| 11 | 11 |2  2",
  "4224|2112|2112|4224",
  "2 1 2|     |1 2 1|    |2 1 2",
].map((p) => new Puzzle(p));
console.log(`${puzzles.length} puzzles.`);
const game = new Game(puzzles);

window.addEventListener("resize", on_resize);
function on_resize() {
  // Set the canvas size according to its new on-screen size
  var rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * window.devicePixelRatio;
  canvas.height = rect.height * window.devicePixelRatio;
}

/* MOUSE HANDLING */

// We start the mouse miles off the screen so that vertices close to the top-left corner of the
// screen can't be erroneously selected before the user moves their mouse into the window.
let mouse_x = -10000;
let mouse_y = -10000;
let mouse_button = false;

window.addEventListener("mousemove", (evt) => {
  // TODO: Split fast mouse moves into multiple `mouse_down` events
  update_mouse(evt);
  game.on_mouse_move();
});
window.addEventListener("mousedown", (evt) => {
  update_mouse(evt);
  game.on_mouse_down();
});
window.addEventListener("mouseup", (evt) => {
  update_mouse(evt);
  game.on_mouse_up();
});

function update_mouse(evt) {
  mouse_x = evt.clientX * window.devicePixelRatio;
  mouse_y = evt.clientY * window.devicePixelRatio;
  mouse_button = evt.buttons != 0;
}

/* START GAMELOOP */

on_resize();
function frame() {
  game.frame();
  window.requestAnimationFrame(frame);
}
frame();

/* UTILS */

function ease_in_out(x) {
  return (3 - 2 * x) * x * x;
}

function lerp(a, b, t) {
  return a * (1 - t) + b * t;
}
