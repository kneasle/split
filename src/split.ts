/* Game code for Split */

class Color {
  r: number;
  g: number;
  b: number;

  constructor(r: number, g: number, b: number) {
    this.r = r;
    this.g = g;
    this.b = b;
  }

  static from_hex(hex: string): Color {
    // Parse color as a hex string
    let r, g, b, multiplier;
    if (hex.length === 4) {
      r = hex[1];
      g = hex[2];
      b = hex[3];
      multiplier = 0x11;
    } else if (hex.length === 7) {
      r = hex.slice(1, 3);
      g = hex.slice(3, 5);
      b = hex.slice(5, 7);
      multiplier = 1;
    } else {
      throw Error("Colour passed non-hex string")
    }

    return new Color(
      parseInt(r, 16) * multiplier,
      parseInt(g, 16) * multiplier,
      parseInt(b, 16) * multiplier,
    );
  }

  to_canvas_color(): string {
    return `rgb(${Math.round(this.r)}, ${Math.round(this.g)}, ${Math.round(this.b)})`;
  }

  static lerp(c1: Color, c2: Color, t: number): Color {
    let r = lerp(c1.r, c2.r, t);
    let g = lerp(c1.g, c2.g, t);
    let b = lerp(c1.b, c2.b, t);
    return new Color(r, g, b);
  }
}

// Colors
const BG_COLOR = Color.from_hex("#030");
const CELL_COLOR = Color.from_hex("#070");
const GRID_COLOR = Color.from_hex("#000");
const LINE_COLOR = Color.from_hex("#fff");
const PIP_COLOR = Color.from_hex("#fff");
const CORRECT_COLOR = Color.from_hex("#0f0");
const INCORRECT_COLOR = Color.from_hex("#f77");
// Sizes
const VERTEX_SIZE = 0.3;
const EDGE_WIDTH = 0.15;
const PIP_PATTERN_RADIUS = 0.2;
const PIP_SIZE = 0.12;
// Animation
const GRID_ENTRY_ANIMATION_TIME = 0.7; // Seconds
const SOLVE_ANIMATION_TIME = 0.3; // Seconds
const PIP_ANIMATION_SPREAD = 0.5; // Factor of `PIP_ANIMATION_TIME`
// Interaction
const VERTEX_INTERACTION_RADIUS = 0.4;
// Display
const PUZZLE_WORLD_SCALE = 100; // Pixels
const SOLVED_GRIDS_BORDER = 0.1; // Factor of `HEADER_HEIGHT`

/// Singleton instance which handles all top-level game logic
class Game {
  puzzles: Puzzle[];
  solved_grids: Grid[];
  fading_grids: Grid[]; // TODO: Put this in solved_grids?
  overlay: Grid | undefined;
  puzzle_idx: number; // TODO: Put this in overlay?

  constructor(puzzles: Puzzle[]) {
    // Puzzle world
    this.puzzles = puzzles;
    this.solved_grids = [];
    this.fading_grids = [];
    // Overlay
    this.overlay = undefined;
    this.puzzle_idx = 0;
  }

  update(_time_delta: number) {
    // Remove any solved grids which have fully faded
    retain(
      this.solved_grids,
      (grid) =>
        grid.animation.target_state.faded === true &&
        Date.now() - grid.animation.start_time <= GRID_ENTRY_ANIMATION_TIME * 1000,
    );

    // Trigger adding the solution on the overlay grid to puzzle scene
    if (this.overlay && this.overlay.is_ready_to_be_stashed()) {
      let solved_grids = this.puzzles[this.puzzle_idx].solved_grids;
      const pip_group_size = this.overlay.solution.pip_group_size;
      // Decide where the new grid should go to keep the grids sorted by solution
      let idx_of_solved_grid = 0;
      while (true) {
        if (idx_of_solved_grid === solved_grids.length) break;
        if (solved_grids[idx_of_solved_grid].solution.pip_group_size >= pip_group_size) {
          break;
        }
        idx_of_solved_grid++;
      }
      // Add the new grid, replacing an existing grid if that grid has the same count
      let i = idx_of_solved_grid;
      if (solved_grids[i] && solved_grids[i].solution.pip_group_size === pip_group_size) {
        solved_grids[i].animate_to({ puzzle: this.puzzle_idx, grid_idx: i, faded: true });
        this.fading_grids.push(solved_grids[i]);
        solved_grids[i] = this.overlay;
      } else {
        solved_grids.splice(idx_of_solved_grid, 0, this.overlay);
      }
      // Animate all the puzzle's grids to their new positions
      for (let i = 0; i < solved_grids.length; i++) {
        solved_grids[i].animate_to({ puzzle: this.puzzle_idx, grid_idx: i, faded: false });
      }
      // Create a new main grid to replace the old one
      // this.create_new_main_grid(); // TODO: 
    }
  }

  draw() {
    /* BACKGROUND */
    ctx.fillStyle = BG_COLOR.to_canvas_color();
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    /* PUZZLE WORLD */
    let { scale } = this.current_transform();
    // Puzzles
    for (let i = 0; i < this.puzzles.length; i++) {
      let puzzle = this.puzzles[i];
      let num_solutions = puzzle.num_solutions;
      ctx.strokeStyle = "black";
      // Outline
      let min = this.transform_point(puzzle.x - num_solutions / 2, puzzle.y - 1 / 2);
      ctx.strokeRect(min.x, min.y, num_solutions * scale, scale);
      // Boxes for solved grids
      for (let i = 0; i < num_solutions; i++) {
        let min = this.transform_point(
          puzzle.x - num_solutions / 2 + i + SOLVED_GRIDS_BORDER,
          puzzle.y - 1 / 2 + SOLVED_GRIDS_BORDER,
        );
        let size = (1 - SOLVED_GRIDS_BORDER * 2) * scale;
        ctx.strokeRect(min.x, min.y, size, size);
      }
      // Puzzle Number
      ctx.fillStyle = "black";
      ctx.font = "50px monospace";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(`#${i + 1}`, min.x - 10, min.y + 0.5 * scale);
    }
    // Grids
    for (const grid of this.fading_grids) grid.draw();
    for (const grid of this.solved_grids) grid.draw();
  }

  /* TRANSFORMS */

  current_transform() {
    // TODO: Lerp the state when doing ease in/out for the overlay
    return {
      camera_x,
      camera_y,
      scale: PUZZLE_WORLD_SCALE,
      post_x: canvas.width / 2,
      post_y: canvas.height / 2,
    };
  }

  transform_point(x: number, y: number) {
    let t = this.current_transform();
    return {
      x: (x - t.camera_x) * t.scale + t.post_x,
      y: (y - t.camera_y) * t.scale + t.post_y,
    };
  }

  /* INTERACTION */

  on_mouse_move(dx: number, dy: number) {
    if (this.overlay) {
      this.overlay.on_mouse_move();
    } else {
      // No overlay grid means we should be interacting with the puzzle world
      if (mouse_button) {
        let { scale } = this.current_transform();
        camera_x -= dx / scale;
        camera_y -= dy / scale;
      }
    }
  }

  on_mouse_down() {
    if (this.overlay) {
      this.overlay.on_mouse_down();
    } else {
      // No overlay grid means we should be interacting with the puzzle world
    }
  }

  on_mouse_up() {
    if (this.overlay) {
      this.overlay.on_mouse_up();
    } else {
      // No overlay grid means we should be interacting with the puzzle world
    }
  }
}

/* ===== BOILERPLATE CODE FOR BROWSER INTERFACING ===== */

const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

// Create puzzle patterns
let _puzzles = [
  // Intro
  { num_solutions: 1, pattern: "11" },
  { num_solutions: 1, pattern: "211" },
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
];
let idx = 0;
let puzzles: Puzzle[] = _puzzles.map(({ pattern, num_solutions }) => new Puzzle(pattern, 0, idx++, num_solutions));
console.log(`${puzzles.length} puzzles.`);
const game = new Game(puzzles);

window.addEventListener("resize", on_resize);
function on_resize() {
  // Set the canvas size according to its new on-screen size
  var rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * window.devicePixelRatio;
  canvas.height = rect.height * window.devicePixelRatio;
}

// Camera coordinates within the world containing the puzzle grids
let camera_x = 0;
let camera_y = 0;

/* MOUSE HANDLING */

// We start the mouse miles off the screen so that vertices close to the top-left corner of the
// screen can't be erroneously selected before the user moves their mouse into the window.
let mouse_x = -10000;
let mouse_y = -10000;
let mouse_button = false;

window.addEventListener("mousemove", (evt) => {
  // TODO: Split fast mouse moves into multiple smaller `mouse_move` events
  let { dx, dy } = update_mouse(evt);
  game.on_mouse_move(dx, dy);
});
window.addEventListener("mousedown", (evt) => {
  update_mouse(evt);
  game.on_mouse_down();
});
window.addEventListener("mouseup", (evt) => {
  update_mouse(evt);
  game.on_mouse_up();
});

function update_mouse(evt: MouseEvent): { dx: number, dy: number } {
  let new_mouse_x = evt.clientX * window.devicePixelRatio;
  let new_mouse_y = evt.clientY * window.devicePixelRatio;
  let dx = new_mouse_x - mouse_x;
  let dy = new_mouse_y - mouse_y;
  mouse_x = new_mouse_x;
  mouse_y = new_mouse_y;
  mouse_button = evt.buttons != 0;
  return { dx, dy };
}

/* UTILS */

function sort_by_key<T>(arr: T[], key: (v: T) => any[]) {
  arr = [...arr];
  arr.sort((a, b) => {
    let vs_a = key(a);
    let vs_b = key(b);
    for (let i = 0; i < Math.min(vs_a.length, vs_b.length); i++) {
      if (vs_a[i] < vs_b[i]) return -1;
      if (vs_a[i] > vs_b[i]) return 1;
      // If they're equal, check the next item in the arrays (i.e. we're doing
      // lexicographic/dictionary sort)
    }
    return 0; // If no elements are different, the arrays must be equal
  });
  return arr;
}

// Removes any items from `arr` which fail `pred`
function retain<T>(arr: T[], pred: (v: T) => boolean) {
  let idxs_to_remove = [];
  for (let i = 0; i < arr.length; i++) {
    if (!pred(arr[i])) {
      idxs_to_remove.push(i);
    }
  }
  idxs_to_remove.reverse();
  for (const i of idxs_to_remove) {
    arr.splice(i, 1);
  }
}

function get_uneased_anim_factor(start_time: number, anim_time: number): number {
  return (Date.now() - start_time) / 1000 / anim_time;
}

function get_anim_factor(start_time: number, anim_time: number): number {
  let anim_factor = get_uneased_anim_factor(start_time, anim_time);
  anim_factor = Math.max(0, Math.min(1, anim_factor)); // Clamp
  anim_factor = ease_in_out(anim_factor); // Easing
  return anim_factor;
}

function ease_in_out(x: number): number {
  return (3 - 2 * x) * x * x;
}

function lerp(a: number, b: number, t: number): number {
  return a * (1 - t) + b * t;
}

/* START GAMELOOP */

on_resize();
let last_frame_time = Date.now();
function frame() {
  let time_delta = (Date.now() - last_frame_time) / 1000;
  last_frame_time = Date.now();
  game.update(time_delta);
  game.draw();
  window.requestAnimationFrame(frame);
}
frame();
