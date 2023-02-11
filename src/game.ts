/* Game code for Split */

/// Singleton instance which handles all top-level game logic
class Game {
  /* Puzzle world */
  puzzle_world_transform: Transform;
  puzzle_sets: PuzzleSet[];
  fading_grids: Grid[];
  /* Puzzle overlay */
  overlay: Overlay;

  constructor(puzzle_sets: PuzzleSet[]) {
    // Puzzle world
    this.puzzle_world_transform = Transform.scale(DEFAULT_ZOOM);
    this.puzzle_sets = puzzle_sets;
    this.fading_grids = [];
    // Overlay
    this.overlay = {
      grid: new Grid(puzzle_sets[0].puzzle, "overlay"),
      puzzle_idx: 0,
      tween: new Tween(0, OVERLAY_ANIMATION_TIME, lerp),
      should_close: false,
    };
  }

  update(_time_delta: number): void {
    // Remove any grids which have fully faded
    retain(
      this.fading_grids,
      (grid) => !(is_faded(grid.transform_tween.target) && grid.transform_tween.is_complete()),
    );

    // Trigger adding the solution on the overlay grid to puzzle scene
    if (this.overlay.grid.is_ready_to_be_stashed()) {
      let { grid, puzzle_idx } = this.overlay;
      let solved_grids = this.puzzle_sets[puzzle_idx].solved_grids;
      const pip_group_size = grid.solution!.pip_group_size;
      // Decide where the new grid should go to keep the grids sorted by solution
      let idx_of_solved_grid = 0;
      while (true) {
        if (idx_of_solved_grid === solved_grids.length) break;
        if (solved_grids[idx_of_solved_grid].solution!.pip_group_size >= pip_group_size) {
          break;
        }
        idx_of_solved_grid++;
      }
      // Add the new grid, replacing an existing grid if that grid has the same count
      let i = idx_of_solved_grid;
      if (solved_grids[i] && solved_grids[i].solution!.pip_group_size === pip_group_size) {
        solved_grids[i].transform_tween.animate_to(
          Transform.scale(0).then(this.puzzle_sets[puzzle_idx].grid_transform(i)),
        );
        this.fading_grids.push(solved_grids[i]);
        solved_grids[i] = grid;
      } else {
        solved_grids.splice(idx_of_solved_grid, 0, grid);
      }
      // Animate all the puzzle's grids to their new positions
      for (let i = 0; i < solved_grids.length; i++) {
        solved_grids[i].transform_tween.animate_to(this.puzzle_sets[puzzle_idx].grid_transform(i));
      }
      // Create a new main grid to replace the old one, and immediately start an animation
      this.overlay.grid = new Grid(this.puzzle_sets[puzzle_idx].puzzle, "tiny");
      if (!this.overlay.should_close) {
        this.overlay.grid.transform_tween.animate_to("overlay");
      }
    }

    // If the grid is playing its solve animation, delay any close requests until the animation is
    // complete
    const is_waiting_for_solve_animation = this.overlay.grid.is_correctly_solved() &&
      !this.overlay.grid.is_ready_to_be_stashed();
    if (this.overlay.should_close && !is_waiting_for_solve_animation) {
      this.overlay.tween.animate_to(0);
      this.overlay.should_close = false;
    }
  }

  draw(time_delta: number): void {
    /* BACKGROUND */
    ctx.fillStyle = BG_COLOR.to_canvas_color();
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    /* PUZZLE WORLD */
    let camera_transform = this.camera_transform();
    // Puzzles
    for (let i = 0; i < this.puzzle_sets.length; i++) {
      let puzzle_set = this.puzzle_sets[i];
      let puzzle = puzzle_set.puzzle;
      let num_solutions = puzzle.num_solutions;
      ctx.strokeStyle = "black";
      // Outline
      let rect = camera_transform.transform_rect(puzzle_set.overall_rect());
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
      // Boxes for solved grids
      let grid_rect: Rect = { x: 0, y: 0, w: puzzle.grid_width, h: puzzle.grid_height };
      for (let i = 0; i < num_solutions; i++) {
        let r = puzzle_set.grid_transform(i).then(camera_transform).transform_rect(grid_rect);
        ctx.strokeRect(r.x, r.y, r.w, r.h);
      }
      // Puzzle Number
      ctx.fillStyle = "black";
      ctx.font = `${Math.round(camera_transform.scale * PUZZLE_TEXT_SIZE)}px monospace`;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(`#${i + 1}`, rect.x - camera_transform.scale * 0.1, rect.y + rect.h / 2);
    }
    // Grids
    let grids = [];
    for (const p of this.puzzle_sets) {
      for (const g of p.solved_grids) {
        grids.push(g);
      }
    }

    for (const grid of this.fading_grids) grid.draw(time_delta);
    for (const g of grids) {
      if (!g.transform_tween.is_animating()) {
        g.draw(time_delta);
      }
    }
    // Draw animating grids above normal grids
    for (const g of grids) {
      if (g.transform_tween.is_animating()) {
        g.draw(time_delta);
      }
    }
    this.overlay.grid.draw(time_delta);
  }

  /* TRANSFORMS */

  camera_transform(): Transform {
    let pure_camera_transform = this
      .puzzle_world_transform
      .then_translate(canvas.width / 2, canvas.height / 2);

    let current_puzzle = this.puzzle_sets[this.overlay.puzzle_idx];
    let pure_overlay_transform = new Transform()
      .then_translate(-current_puzzle.pos.x, -current_puzzle.pos.y)
      .then_scale(DEFAULT_ZOOM)
      .then_translate(canvas.width / 2, PUZZLE_HEADER_HEIGHT / 2);

    let overlay_factor = this.overlay.tween.get();
    return Transform.lerp(pure_camera_transform, pure_overlay_transform, overlay_factor);
  }

  /* INTERACTION */

  on_mouse_move(dx: number, dy: number): void {
    if (this.overlay_fully_on()) {
      this.overlay.grid.on_mouse_move();
    }

    if (!this.overlay_fully_on()) {
      // No overlay grid means we should be interacting with the puzzle world
      if (mouse_button) {
        this.puzzle_world_transform = this.puzzle_world_transform.then_translate(dx, dy);
      }
    }
  }

  on_mouse_down(): void {
    let is_overlay_tweening_in = this.overlay.tween.target === 1;
    if (!this.overlay_fully_off() && is_overlay_tweening_in) {
      // TODO: Don't allow drawing lines while the overlay is tweening in?
      const was_click_registered = this.overlay.grid.on_mouse_down();
      if (!was_click_registered) {
        this.overlay.should_close = true;
      }
    }

    if (this.overlay_fully_off()) {
      // No overlay grid means we should be interacting with the puzzle world
      let { x, y } = this.camera_transform().inv().transform_point(mouse_x, mouse_y);
      for (let i = 0; i < this.puzzle_sets.length; i++) {
        let r = puzzle_sets[i].overall_rect();
        if (x < r.x || x > r.x + r.w) continue;
        if (y < r.y || y > r.y + r.h) continue;
        // Mouse is within this puzzle's rect, so open it as a puzzle
        this.overlay.grid = new Grid(puzzle_sets[i].puzzle, "overlay");
        this.overlay.puzzle_idx = i;
        this.overlay.tween.animate_to(1);
      }
    }
  }

  on_mouse_up(): void {
    if (this.overlay_fully_on()) {
      this.overlay.grid.on_mouse_up();
    }
  }

  on_scroll(delta_y: number): void {
    let desired_scale = this.puzzle_world_transform.scale;
    desired_scale *= Math.pow(ZOOM_FACTOR, -delta_y); // Perform the zoom
    desired_scale = Math.min(Math.max(desired_scale, MIN_ZOOM), MAX_ZOOM); // Clamp the zoom
    // TODO: Zoom around the cursor's location
    this.puzzle_world_transform = this
      .puzzle_world_transform
      .then_scale(desired_scale / this.puzzle_world_transform.scale);
  }

  overlay_fully_on(): boolean {
    return this.overlay.tween.get() > 1 - 1e-6;
  }

  overlay_fully_off(): boolean {
    return this.overlay.tween.get() < 1e-6;
  }
}

type Overlay = {
  grid: Grid;
  puzzle_idx: number;
  tween: Tween<number>;
  // If the user closes the overlay in the time between a puzzle being solved and being added to
  // the solution we register that input but delay it until after solved grid has been added to the
  // puzzle world
  should_close: boolean;
};

/* ===== INIT CODE ===== */

// Create puzzle patterns
let _puzzles = [
  // Intro
  { num_solutions: 1, pattern: "11" },
  { num_solutions: 1, pattern: "211" },
  { num_solutions: 1, pattern: "123" },
  { num_solutions: 1, pattern: "21|1." },
  { num_solutions: 1, pattern: "111" },
  { num_solutions: 2, pattern: "2112" },
  { num_solutions: 2, pattern: "11|11" },
  { num_solutions: 1, pattern: "11|1." },
  { num_solutions: 2, pattern: ".1.|1.1|.1." },
  { num_solutions: 3, pattern: "111|111" },
  { num_solutions: 2, pattern: "111|111|111" },
  { num_solutions: 1, pattern: "111|181|111" },

  // Cool set of puzzles
  { num_solutions: 1, pattern: "21|12" },
  { num_solutions: 2, pattern: "21.|12.|..." },
  { num_solutions: 1, pattern: "21.|12.|..2" },
  { num_solutions: 2, pattern: "21..|12..|..2.|...." },
  { num_solutions: 2, pattern: "21..|12..|....|...2" },

  // Cool set of puzzles
  // TODO: Do this whole set as 1+2=3 rather than 1+1=2
  // TODO: Prune this down a bit
  { num_solutions: 1, pattern: "21|12" }, // TODO: This is a duplicate
  { num_solutions: 2, pattern: "2.1|1.2" },
  { num_solutions: 2, pattern: "2.2|1.1" },
  { num_solutions: 2, pattern: "...|2.2|1.1" },
  { num_solutions: 2, pattern: "2.2|...|1.1" },
  { num_solutions: 2, pattern: "..2|.2.|1.1" },
  { num_solutions: 2, pattern: "..2|12.|..1" },
  { num_solutions: 2, pattern: "2.2|1..|..1" },
  { num_solutions: 2, pattern: "22.|1..|..1" },
  { num_solutions: 2, pattern: "222|1..|..1" },
  { num_solutions: 2, pattern: "222|1.1|..." },

  // Cool set of puzzles
  { num_solutions: 1, pattern: ".31|31.|1.." },
  { num_solutions: 2, pattern: "331|31.|1.." },
  { num_solutions: 3, pattern: ".31|31.|1.3" },
  { num_solutions: 2, pattern: ".31|33.|1.1" },

  // Cool set of puzzles
  { num_solutions: 1, pattern: "123|2.1" },
  { num_solutions: 1, pattern: ".2.|1.3|2.1" },
  { num_solutions: 1, pattern: ".1.|2.3|2.1" },

  // Cool set of puzzles
  { num_solutions: 1, pattern: "1.1|2.2|1.1" },
  { num_solutions: 2, pattern: "...|1.1|2.2|1.1" },

  // Cool set of puzzles
  { num_solutions: 1, pattern: "21|21" },
  { num_solutions: 1, pattern: ".21|.21" },
  { num_solutions: 2, pattern: "221|..1" },

  // Cool set of puzzles
  { num_solutions: 1, pattern: ".2.|.2.|.2." },
  { num_solutions: 2, pattern: ".2.|.2.|1.1" },
  { num_solutions: 2, pattern: "1.1|.2.|1.1" },
  { num_solutions: 2, pattern: "1.1|..2|1.1" },
  { num_solutions: 2, pattern: "1.1|1.2|..1" },

  // Cool set of puzzles
  { num_solutions: 2, pattern: "..2|2..|11." },
  { num_solutions: 2, pattern: "..2|...|112" },
  { num_solutions: 2, pattern: "..2|...|112" },
  { num_solutions: 2, pattern: "2.2|...|112" },
  { num_solutions: 2, pattern: "2.2|...|121" },

  // Cool set of puzzles
  { num_solutions: 2, pattern: "313|...|131" },
  { num_solutions: 3, pattern: "113|...|331" },
  { num_solutions: 3, pattern: "111|...|333" },
  { num_solutions: 2, pattern: "131|...|331" },

  // 5,5,5 twizzly puzzles
  // { num_solutions: 1, pattern: "21.|345" },
  { num_solutions: 1, pattern: "23|5.|41" },
  { num_solutions: 1, pattern: "15|.4|23" },
  { num_solutions: 1, pattern: "451|...|2.3" },
  { num_solutions: 1, pattern: ".....|1...4|3.5.2" },
  { num_solutions: 1, pattern: "1..2.|3..4.|5...." },
  { num_solutions: 1, pattern: "1..3|..5.|....|..4.|2..." },
  { num_solutions: 1, pattern: "1...4|2.5.3|.....|....." },
  { num_solutions: 2, pattern: "1...4|2.5.3|..5..|....." },
  // 7,7,7 twizzly puzzles
  { num_solutions: 1, pattern: "321|456" },
  { num_solutions: 1, pattern: "34|16|52" },
  { num_solutions: 1, pattern: "351|...|426" },
  { num_solutions: 1, pattern: "352|...|164" },
  { num_solutions: 1, pattern: "342|...|165" },
  { num_solutions: 1, pattern: "4.1|5..|..6|2.3" },
  { num_solutions: 1, pattern: "1...3|.2...|...4.|5...6" },
  { num_solutions: 1, pattern: "1...3|.4...|...2.|5...6" },
  // 3,3,3 or 5,5,5 extra twizzly puzzles
  // { num_solutions: 1, pattern: "3.|12|21" },
  { num_solutions: 1, pattern: "3.|22|11" },
  { num_solutions: 1, pattern: "...|.31|.22|..1" },
  { num_solutions: 1, pattern: "1...|..31|..22|...." },
  { num_solutions: 1, pattern: "1...|..53|..24|...." },
  { num_solutions: 1, pattern: ".....|..2..|..15.|.....|4...3" },
  { num_solutions: 2, pattern: "....5|..2..|..15.|.....|4...3" },
  // 2+2+2,3+3,6 twizzly puzzles
  { num_solutions: 1, pattern: "222|3.3" },
  { num_solutions: 1, pattern: ".2.|.3.|232" },
  { num_solutions: 1, pattern: "2.2|..3|236" },
  { num_solutions: 1, pattern: "62..|2.3.|.32.|...." },
  { num_solutions: 1, pattern: "62..|2.3.|.32.|...6" },
  { num_solutions: 1, pattern: ".....|..2..|..6..|32.23" },
  { num_solutions: 1, pattern: ".....|.6.3.|....2|...2.|2...3" },
  { num_solutions: 2, pattern: ".....|.6.3.|....2|6..2.|2...3" },

  // Puzzles looking for sets
  { num_solutions: 2, pattern: "1.2|.2.|..1" },
  { num_solutions: 2, pattern: "121|2.2|121" },
  { num_solutions: 2, pattern: ".33|...|114" },
  { num_solutions: 3, pattern: ".1.|1.1|111" },
  { num_solutions: 2, pattern: ".....|12.21" },
  { num_solutions: 2, pattern: "32..|..11|323." },
  { num_solutions: 3, pattern: "1.41|4...|...4|14.1" },
  { num_solutions: 4, pattern: "2..2|.11.|.11.|2..2" },
  { num_solutions: 4, pattern: "4224|2112|2112|4224" },
  { num_solutions: 2, pattern: "2.1.2|.....|1.2.1|.....|2.1.2" },
  { num_solutions: 3, pattern: "2.1.2|.....|1.2.1|...2.|2.1.2" },
  { num_solutions: 3, pattern: "2.1.2|.....|1.2.1|..2..|2.1.2" },
];

let total_solns_required = 0;
_puzzles.forEach((p) => total_solns_required += p.num_solutions);
console.log(`${_puzzles.length} puzzles, totalling ${total_solns_required} solutions`);

let idx = 0;
let puzzle_sets: PuzzleSet[] = _puzzles.map(
  ({ pattern, num_solutions }) => new PuzzleSet(pattern, 0, idx++, num_solutions),
);
const game = new Game(puzzle_sets);

const canvas = document.getElementById("game-canvas") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;

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
window.addEventListener("wheel", (evt) => {
  if (evt.deltaMode === WheelEvent.DOM_DELTA_PIXEL) {
    game.on_scroll(evt.deltaY);
  } else if (evt.deltaMode === WheelEvent.DOM_DELTA_LINE) {
    game.on_scroll(evt.deltaY / 120);
  }
  // DOM_DELTA_PAGE signals are ignored
});

function update_mouse(evt: MouseEvent): { dx: number; dy: number } {
  let new_mouse_x = evt.clientX * window.devicePixelRatio;
  let new_mouse_y = evt.clientY * window.devicePixelRatio;
  let dx = new_mouse_x - mouse_x;
  let dy = new_mouse_y - mouse_y;
  mouse_x = new_mouse_x;
  mouse_y = new_mouse_y;
  mouse_button = evt.buttons != 0;
  return { dx, dy };
}

/* START GAMELOOP */

on_resize();
let last_frame_time = Date.now();
function frame(): void {
  let time_delta = (Date.now() - last_frame_time) / 1000;
  last_frame_time = Date.now();
  game.update(time_delta);
  game.draw(time_delta);
  window.requestAnimationFrame(frame);
}
frame();
