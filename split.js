/* Game code for Split */

// Colors
const BG_COLOR = "#030";
const CELL_COLOR = "#070";
const GRID_COLOR = "#000";
const LINE_COLOR = "#fff";
const PIP_COLOR = "#fff";
const CORRECT_COLOR = "#0f0";
const INCORRECT_COLOR = "#f77";
// Sizes
const VERTEX_SIZE = 0.3;
const EDGE_WIDTH = 0.15;
const PIP_PATTERN_RADIUS = 0.2;
const PIP_SIZE = 0.12;
// Animation
const SOLVE_ANIMATION_TIME = 0.3; // Seconds
const PIP_ANIMATION_SPREAD = 0.7; // Factor of `PIP_ANIMATION_TIME`
// Interaction
const VERTEX_INTERACTION_RADIUS = 0.71;

/// Singleton instance which handles all top-level game logic
class Game {
  constructor(puzzles) {
    // Puzzles
    this.puzzles = puzzles;
    this.puzzle_idx = 0;
    this.grids = [];
    this.reload_grids();

    this.selected_grid_idx = undefined; // Used to lock interaction to one grid when drawing
  }

  render() {
    let interaction = this.interaction();

    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    for (let g_idx = 0; g_idx < this.grids.length; g_idx++) {
      this.grids[g_idx].draw(
        (interaction && interaction.grid_idx === g_idx) ? interaction : undefined,
      );
    }
    ctx.restore();
  }

  reload_grids() {
    this.grids = [];
    for (let i = 0; i < this.current_puzzle().num_solutions; i++) {
      this.grids.push(new Grid(this.current_puzzle()));
    }
    this.arrange_grids();
  }

  // Arrange the grids as best we can into the window, choosing the splitting pattern which
  // maximises the size of the grids
  arrange_grids() {
    const num_grids = this.grids.length;
    if (num_grids === 0) return; // No point arranging no grids

    // Decide the possible ways to arrange the grids
    let arrangements = this.grid_arrangements(num_grids);

    // Get the size of the puzzles, including 0.5 cells of padding on every side
    const puzzle = this.grids[0].puzzle;
    const puzzle_width = puzzle.width + 1;
    const puzzle_height = puzzle.height + 1;

    // Decide which arrangement maximises the grid size
    let best_arrangement = undefined;
    let best_arrangement_scale = 0;
    for (const arrangement of arrangements) {
      // Calculate the scale of the smallest grid
      let scale = Infinity;
      for (const { w, h } of arrangement) {
        scale = Math.min(scale, w / puzzle_width, h / puzzle_height);
      }
      if (scale > best_arrangement_scale) {
        best_arrangement = arrangement;
        best_arrangement_scale = scale;
      }
    }

    // Lay each grid in the centre of its corresponding rectangle
    for (let i = 0; i < num_grids; i++) {
      let grid_rect = best_arrangement[i];
      this.grids[i].position.x = grid_rect.x + grid_rect.w / 2;
      this.grids[i].position.y = grid_rect.y + grid_rect.h / 2;
      this.grids[i].scale = best_arrangement_scale;
    }
  }

  grid_arrangements(num_grids) {
    let vertical = [];
    let horizontal = [];
    for (let i = 0; i < num_grids; i++) {
      horizontal.push({ x: i / num_grids, y: 0, w: 1 / num_grids, h: 1 });
      vertical.push({ x: 0, y: i / num_grids, w: 1, h: 1 / num_grids });
    }
    // Arrangements has type `[[NormalizedRect; num_grids]]`
    let arrangements = [vertical, horizontal];
    // Add a compound two-tier arrangement for three or four grids:
    //             A B           A B
    //              C     or     C D
    if (num_grids === 3 || num_grids === 4) {
      // Top row ...
      let compound_arrangement = [
        { x: 0, y: 0, w: 0.5, h: 0.5 },
        { x: 0.5, y: 0, w: 0.5, h: 0.5 },
      ];
      // Second row
      if (num_grids === 3) {
        compound_arrangement.push({ x: 0, y: 0.5, w: 1, h: 0.5 });
      } else {
        compound_arrangement.push({ x: 0, y: 0.5, w: 0.5, h: 0.5 });
        compound_arrangement.push({ x: 0.5, y: 0.5, w: 0.5, h: 0.5 });
      }
      arrangements.push(compound_arrangement);
    }

    // Convert 'relative' coordinates (i.e. from `0..1`) to 'absolute' coordinates
    // (i.e. from '0..canvas.size')
    let absolute_arrangements = arrangements.map((rects) =>
      rects.map(({ x, y, w, h }) => ({
        x: x * canvas.width,
        y: y * canvas.height,
        w: w * canvas.width,
        h: h * canvas.height,
      }))
    );
    return absolute_arrangements;
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
      let local_x = (mouse_x - grid.position.x) / grid.scale + grid.puzzle.width / 2;
      let local_y = (mouse_y - grid.position.y) / grid.scale + grid.puzzle.height / 2;

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

  current_puzzle() {
    return this.puzzles[this.puzzle_idx];
  }
}

/// An instance of a `Puzzle` on the screen
class Grid {
  constructor(puzzle) {
    this.puzzle = puzzle;
    // Transform (this is set before the first frame by `Game.arrange_grids`)
    this.scale = 100;
    this.position = { x: 0, y: 0 };
    // List of vertex indices which make up the line being drawn
    this.line = [];
    // For every `Grid`, `solution` is always in one of three states:
    // 1) `this.solution === undefined`: no solution is on the grid; the puzzle is unsolved
    // 2) `this.solution.is_valid === true`: the solution is valid
    // 3) `this.solution.is_valid === false`: the solution is invalid
    this.solution = undefined;

    // Create pips, and record which pips belong in which cell (in an unsolved puzzle)
    this.pips = [];
    this.pip_idxs_per_cell = [];
    for (let c = 0; c < this.puzzle.cells.length; c++) {
      const cell = this.puzzle.cells[c];
      const pip_idxs = [];
      for (let p = 0; p < cell.pips; p++) {
        const unsolved_state = this.pip_coords(c, p);
        unsolved_state.color = PIP_COLOR;
        pip_idxs.push(this.pips.length);
        this.pips.push(new Pip(c, unsolved_state));
      }
      this.pip_idxs_per_cell.push(pip_idxs);
    }
  }

  begin_drawing_line(interaction) {
    if (interaction.vert_idx !== undefined) {
      this.line = [interaction.vert_idx];
      if (this.solution !== undefined) {
        // Animate all pips back to their start locations
        for (const pip of this.pips) {
          pip.animate_to(pip.unsolved_state);
        }
      }
      this.solution = undefined;
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

    // Don't allow the user to add a line segment twice
    for (let i = 0; i < this.line.length - 2; i++) {
      if (this.line[i] === last_vert && this.line[i + 1] === new_vert) return;
      if (this.line[i] === new_vert && this.line[i + 1] === last_vert) return;
    }

    if (new_vert === penultimate_vert) {
      this.line.pop(); // Moved backward, 'unwind' the line
    } else {
      this.line.push(new_vert); // Moved forward, 'extend' the line
    }
  }

  finish_drawing_line(_interaction) {
    // Check the user's solution
    const is_line_loop = this.line.length > 1 &&
      this.line[0] === this.line[this.line.length - 1];
    if (!is_line_loop) return; // Don't solve the puzzle if the line doesn't form a loop
    this.solution = this.puzzle.get_solution(this.line);
    this.solution.time = Date.now();

    // Decide where to move the pips
    for (const region of this.solution.regions) {
      if (region.pips === 0) continue;
      // Compute the centre of the region
      let total_x = 0;
      let total_y = 0;
      for (const c of region.cells) {
        let cell = this.puzzle.cells[c];
        total_x += cell.centre.x;
        total_y += cell.centre.y;
      }
      let avg_x = total_x / region.cells.length;
      let avg_y = total_y / region.cells.length;
      // Sort cells by their distance from the centre of the region.  This is the order that we'll
      // add the pips
      let _this = this;
      function cell_dist(cell_idx) {
        let cell = _this.puzzle.cells[cell_idx];
        let dx = cell.centre.x - avg_x;
        let dy = cell.centre.y - avg_y;
        return dx * dx + dy * dy;
      }
      const cells_to_add_pips_to = region.cells.sort((c1, c2) => cell_dist(c1) - cell_dist(c2));

      // Group pips into cells
      let pip_idxs_in_region = region.cells.flatMap((idx) => this.pip_idxs_per_cell[idx]);
      for (const cell_idx of cells_to_add_pips_to) {
        // Reserve up to 10 pips to go in this cell
        const num_pips = Math.min(pip_idxs_in_region.length, 10);
        const pip_idxs = pip_idxs_in_region.slice(0, num_pips);
        pip_idxs_in_region = pip_idxs_in_region.slice(num_pips);
        // Animate them to their new positions
        // TODO: Don't move pips that are are in the same place in both solved and unsolved puzzles
        for (let p = 0; p < num_pips; p++) {
          const { x, y } = this.pip_coords(cell_idx, p, num_pips);
          this.pips[pip_idxs[p]].animate_to({ x, y, color: this.solution_color() });
        }
      }
    }
  }

  draw(interaction) {
    ctx.save();
    ctx.translate(this.position.x, this.position.y);
    ctx.scale(this.scale, this.scale);
    ctx.translate(-this.puzzle.width / 2, -this.puzzle.height / 2);

    // Handle solution animation (mainly colours)
    const solution_anim_factor = this.solution
      ? get_anim_factor(this.solution.time, SOLVE_ANIMATION_TIME)
      : 0;
    const line_color = to_canvas_color(
      lerp_color(LINE_COLOR, this.solution_color(), solution_anim_factor),
    );

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
      // Decide if the vertex should be line coloured
      let should_be_line_colored;
      if (this.line.length <= 1) {
        should_be_line_colored = interaction && v_idx === interaction.vert_idx;
      } else {
        let start_vert = this.line[0];
        let end_vert = this.line[this.line.length - 1];
        if (start_vert === end_vert) {
          should_be_line_colored = false;
        } else {
          // Make the start and end of the line
          should_be_line_colored = v_idx === start_vert || v_idx === end_vert;
        }
      }

      const { x, y } = this.puzzle.verts[v_idx];
      ctx.fillStyle = should_be_line_colored ? line_color : GRID_COLOR;
      ctx.fillRect(x - VERTEX_SIZE / 2, y - VERTEX_SIZE / 2, VERTEX_SIZE, VERTEX_SIZE);
    }

    // Line
    // TODO: Smooth line drawing
    ctx.lineWidth = EDGE_WIDTH;
    ctx.strokeStyle = line_color;
    ctx.beginPath();
    for (const vert_idx of this.line) {
      let vert = this.puzzle.verts[vert_idx];
      ctx.lineTo(vert.x, vert.y);
    }
    // HACK: For loops, draw the first line segment twice to avoid a discontinuity at the first
    // vertex
    if (this.line.length > 1 && this.line[0] === this.line[this.line.length - 1]) {
      let vert = this.puzzle.verts[this.line[1]];
      ctx.lineTo(vert.x, vert.y);
    }
    ctx.stroke();

    // Pips
    for (const pip of this.pips) {
      const { x, y, color } = pip.current_state();
      ctx.fillStyle = to_canvas_color(color);
      ctx.fillRect(x - PIP_SIZE / 2, y - PIP_SIZE / 2, PIP_SIZE, PIP_SIZE);
    }

    ctx.restore();
  }

  pip_coords(cell_idx, pip_idx, num_pips) {
    const cell = this.puzzle.cells[cell_idx];
    const { x, y } = dice_pattern(num_pips || cell.pips)[pip_idx];
    return {
      x: cell.centre.x + x * PIP_PATTERN_RADIUS,
      y: cell.centre.y + y * PIP_PATTERN_RADIUS,
    };
  }

  solution_color() {
    const is_correct = this.solution && this.solution.is_correct;
    return is_correct ? CORRECT_COLOR : INCORRECT_COLOR;
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
      Math.random() * 1000 * PIP_ANIMATION_SPREAD * SOLVE_ANIMATION_TIME;
  }

  current_state() {
    const anim_factor = get_anim_factor(this.anim_start_time, SOLVE_ANIMATION_TIME);
    return {
      x: lerp(this.anim_source.x, this.anim_target.x, anim_factor),
      y: lerp(this.anim_source.y, this.anim_target.y, anim_factor),
      color: lerp_color(this.anim_source.color, this.anim_target.color, anim_factor),
    };
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
  { num_solutions: 1, pattern: "11" },
  { num_solutions: 1, pattern: "112" },
  { num_solutions: 1, pattern: "123" },
  { num_solutions: 1, pattern: "21|1 " },
  { num_solutions: 2, pattern: "11|11" },
  { num_solutions: 1, pattern: "11|1 " },
  { num_solutions: 2, pattern: " 1 |1 1| 1 " },
  { num_solutions: 3, pattern: "11|11|11" },
  { num_solutions: 2, pattern: "111|111|111" },

  // Cool set of puzzles
  { num_solutions: 1, pattern: "21|12" },
  { num_solutions: 2, pattern: "21 |12 |   " },
  { num_solutions: 1, pattern: "21 |12 |  2" },
  { num_solutions: 2, pattern: "21  |12  |  2 |    " },
  { num_solutions: 2, pattern: "21  |12  |    |   2" },

  // Cool set of puzzles
  // TODO: Do this whole set as 1+2=3 rather than 1+1=2
  // TODO: Prune this down a bit
  { num_solutions: 1, pattern: "21|12" }, // TODO: This is a duplicate
  { num_solutions: 2, pattern: "2 1|1 2" },
  { num_solutions: 2, pattern: "2 2|1 1" },
  { num_solutions: 2, pattern: "   |2 2|1 1" },
  { num_solutions: 2, pattern: "2 2|   |1 1" },
  { num_solutions: 2, pattern: "  2| 2 |1 1" },
  { num_solutions: 2, pattern: "  2|12 |  1" },
  { num_solutions: 2, pattern: "2 2|1  |  1" },
  { num_solutions: 2, pattern: "22 |1  |  1" },
  { num_solutions: 2, pattern: "222|1  |  1" },
  { num_solutions: 2, pattern: "222|1 1|   " },

  // Cool set of puzzles
  { num_solutions: 1, pattern: " 31|31 |1  " },
  { num_solutions: 2, pattern: "331|31 |1  " },
  { num_solutions: 3, pattern: " 31|31 |1 3" },
  { num_solutions: 2, pattern: " 31|33 |1 1" },

  // Cool set of puzzles
  { num_solutions: 1, pattern: "123|2 1" },
  { num_solutions: 1, pattern: " 2 |1 3|2 1" },
  { num_solutions: 1, pattern: " 1 |2 3|2 1" },

  // Cool set of puzzles
  { num_solutions: 1, pattern: "1 1|2 2|1 1" },
  { num_solutions: 2, pattern: "   |1 1|2 2|1 1" },

  // Cool set of puzzles
  { num_solutions: 1, pattern: "21|21" },
  { num_solutions: 1, pattern: " 21| 21" },
  { num_solutions: 2, pattern: "221|  1" },

  // Cool set of puzzles
  { num_solutions: 1, pattern: " 2 | 2 | 2 " },
  { num_solutions: 2, pattern: " 2 | 2 |1 1" },
  { num_solutions: 2, pattern: "1 1| 2 |1 1" },
  { num_solutions: 2, pattern: "1 1|  2|1 1" },
  { num_solutions: 2, pattern: "1 1|1 2|  1" },

  // Cool set of puzzles
  { num_solutions: 2, pattern: "  2|2  |11 " },
  { num_solutions: 2, pattern: "  2|   |112" },
  { num_solutions: 2, pattern: "  2|   |112" },
  { num_solutions: 2, pattern: "2 2|   |112" },
  { num_solutions: 2, pattern: "2 2|   |121" },

  // Cool set of puzzles
  { num_solutions: 2, pattern: "313|   |131" },
  { num_solutions: 3, pattern: "113|   |331" },
  { num_solutions: 3, pattern: "111|   |333" },
  { num_solutions: 2, pattern: "131|   |331" },

  // Twizzly puzzles
  { num_solutions: 1, pattern: "1  3|  5 |    |  4 |2   " }, // TODO: Rotate?
  { num_solutions: 1, pattern: "1   3| 2   |   4 |5   6" },
  { num_solutions: 1, pattern: "1   3| 4   |   2 |5   6" },

  // Puzzles looking for sets
  { num_solutions: 2, pattern: "1 2| 2 |  1" },

  // Misc puzzles
  { num_solutions: 1, pattern: "1 2 |3 4 |    " },
  { num_solutions: 1, pattern: "1 2|34 |   " },
  { num_solutions: 2, pattern: "121|2 2|121" },
  { num_solutions: 2, pattern: " 33|   |114" },
  { num_solutions: 3, pattern: " 1 |1 1|111" },
  { num_solutions: 2, pattern: "     |12 21" },
  { num_solutions: 1, pattern: "111|181|111" },
  { num_solutions: 3, pattern: "1 41|4   |   4|14 1" },
  { num_solutions: 4, pattern: "2  2| 11 | 11 |2  2" },
  { num_solutions: 3, pattern: "4224|2112|2112|4224" },
  { num_solutions: 1, pattern: "2 1 2|     |1 2 1|    |2 1 2" },
  { num_solutions: 2, pattern: "2 1 2|     |1 2 1|  2 |2 1 2" },
].map(({ pattern, num_solutions }) => new Puzzle(pattern, num_solutions));
console.log(`${puzzles.length} puzzles.`);
const game = new Game(puzzles);

window.addEventListener("resize", on_resize);
function on_resize() {
  // Set the canvas size according to its new on-screen size
  var rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * window.devicePixelRatio;
  canvas.height = rect.height * window.devicePixelRatio;
  game.arrange_grids();
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
window.addEventListener("keydown", (evt) => {
  let changed_puzzle = false;
  if (evt.key === "h") {
    game.puzzle_idx--;
    changed_puzzle = true;
  }
  if (evt.key === "l") {
    game.puzzle_idx++;
    changed_puzzle = true;
  }

  if (changed_puzzle) {
    game.reload_grids();
  }
});

function update_mouse(evt) {
  mouse_x = evt.clientX * window.devicePixelRatio;
  mouse_y = evt.clientY * window.devicePixelRatio;
  mouse_button = evt.buttons != 0;
}

/* UTILS */

function get_anim_factor(start_time, anim_time) {
  let anim_factor = (Date.now() - start_time) / 1000 / anim_time;
  anim_factor = Math.max(0, Math.min(1, anim_factor)); // Clamp
  anim_factor = ease_in_out(anim_factor); // Easing
  return anim_factor;
}

function ease_in_out(x) {
  return (3 - 2 * x) * x * x;
}

function lerp(a, b, t) {
  return a * (1 - t) + b * t;
}

function lerp_color(c1, c2, t) {
  let { r: r1, g: g1, b: b1 } = parse_color(c1);
  let { r: r2, g: g2, b: b2 } = parse_color(c2);
  let r = lerp(r1, r2, t);
  let g = lerp(g1, g2, t);
  let b = lerp(b1, b2, t);
  return { r, g, b };
}

function parse_color(color) {
  if (typeof color === "object") return color;

  // Parse color as a hex string
  let r, g, b, multiplier;
  if (color.length === 4) {
    r = color[1];
    g = color[2];
    b = color[3];
    multiplier = 0x11;
  }
  if (color.length === 6) {
    r = color.slice(1, 3);
    g = color.slice(3, 5);
    b = color.slice(5, 7);
    multiplier = 1;
  }
  return {
    r: parseInt(r, 16) * multiplier,
    g: parseInt(g, 16) * multiplier,
    b: parseInt(b, 16) * multiplier,
  };
}

function to_canvas_color(color) {
  return `rgb(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)})`;
}

/* START GAMELOOP */

on_resize();
function frame() {
  game.render();
  window.requestAnimationFrame(frame);
}
frame();
