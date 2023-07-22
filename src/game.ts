/* Game code for Split */

/// Once single instance of this class handles all top-level game logic
class Game {
  /* Puzzle world */
  puzzle_world_transform: Transform;
  puzzle_sets: PuzzleSet[];
  solved_grids: SolvedGrid[];

  last_clicked_puzzle = 0; // Puzzle that was clicked on to open the overlay
  focussed_puzzle_tween: Tween<number>; // Tweens between puzzle numbers
  overlay_tween: BoolTween; // Tweens between false (overlay off) and true (overlay on)

  constructor(puzzle_sets: PuzzleSet[]) {
    // Puzzle world
    this.puzzle_world_transform = Transform.scale(DEFAULT_ZOOM);
    this.puzzle_sets = puzzle_sets;
    this.solved_grids = [];

    this.focussed_puzzle_tween = new Tween<number>(0, PUZZLE_FOCUS_TIME, lerp);
    this.overlay_tween = new BoolTween(false, PUZZLE_FOCUS_TIME);
  }

  update(time_delta: number, mouse: MouseUpdate): void {
    this.handle_mouse_interaction(mouse);

    let puzzle_idx = this.focussed_puzzle();
    if (puzzle_idx !== undefined) {
      let focussed_puzzle_set = this.puzzle_sets[puzzle_idx];
      // Update the currently displayed grid
      let transform = this.unanimated_overlay_grid_transform(focussed_puzzle_set);
      focussed_puzzle_set.overlay_grid.update(time_delta, mouse, transform);
      // If the overlay grid has just been solved, move it to the puzzle world
      if (focussed_puzzle_set.overlay_grid.has_just_become_stashable()) {
        this.stash_overlay_grid(focussed_puzzle_set);
      }
    }

    // Remove any grids which have fully faded
    retain(this.solved_grids, (grid) => !grid.is_fully_faded());
  }

  draw(gui: Gui): void {
    /* BACKGROUND */

    ctx.fillStyle = BG_COLOR.to_canvas_color();
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    /* PUZZLE WORLD */

    let camera_transform = this.camera_transform();
    // Puzzles
    for (let i = 0; i < this.puzzle_sets.length; i++) {
      let puzzle_set = this.puzzle_sets[i];
      let rect = camera_transform.transform_rect(puzzle_set.overall_rect());
      // DEBUG: Draw Outline
      // ctx.strokeStyle = "black";
      // ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
      // Puzzle Number
      ctx.fillStyle = "black";
      ctx.font = `${Math.round(camera_transform.scale * PUZZLE_TEXT_SIZE)}px monospace`;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(`#${i + 1}`, rect.min.x - camera_transform.scale * 0.1, rect.centre().y);
      // Grid place-holders
      let faded_color_set: ColorSet = {
        cell_color: Color.lerp(CELL_COLOR, BG_COLOR, PLACEHOLDER_GRID_FADE_AMOUNT),
        grid_color: Color.lerp(GRID_COLOR, BG_COLOR, PLACEHOLDER_GRID_FADE_AMOUNT),
        pip_color: Color.lerp(PIP_COLOR, BG_COLOR, PLACEHOLDER_GRID_FADE_AMOUNT),
      };
      for (let g = 0; g < puzzle_set.puzzle.solutions.length; g++) {
        draw_grid(
          puzzle_set.grid_transform(g).then(camera_transform),
          puzzle_set.puzzle,
          faded_color_set,
          [],
          undefined,
          new BoolTween(false, 1),
        );
      }
    }
    // Grids
    this.draw_solved_grids((g) => !g.is_animating_out_of_overlay());

    /* OVERLAY LAYER */

    // Background fader
    if (this.overlay_factor() > 0) {
      let fade_start_y = canvas.height *
        (OVERLAY_FADE_START * SOLVING_HEADER_HEIGHT + 1 - this.overlay_factor());
      let fade_end_y = canvas.height *
        (OVERLAY_FADE_END * SOLVING_HEADER_HEIGHT + 1 - this.overlay_factor());

      let gradient = ctx.createLinearGradient(0, fade_start_y, 0, fade_end_y);
      gradient.addColorStop(0, BG_COLOR.to_canvas_color_with_alpha(0));
      gradient.addColorStop(0.3, BG_COLOR.to_canvas_color_with_alpha(0.5));
      gradient.addColorStop(1, BG_COLOR.to_canvas_color_with_alpha(1));
      ctx.fillStyle = gradient;
      ctx.fillRect(0, fade_start_y, canvas.width, canvas.height - fade_start_y);
    }

    // Gui buttons
    const NUM_BUTTONS = 3;
    let header_height = canvas.height * SOLVING_HEADER_HEIGHT;
    let button_size = Vec2.splat(
      canvas.height * SOLVING_HEADER_HEIGHT * SOLVING_HEADER_BUTTON_SIZE,
    );
    let button_y = (idx: number) => {
      let factor = this.overlay_tween.staggered_factor(idx, NUM_BUTTONS, OVERLAY_BUTTON_SPREAD);
      return header_height * (factor - 0.5);
    };

    // '<' to go back a puzzle
    let go_prev = gui.normalised_button(
      "overlay_prev",
      Rect.with_centre(new Vec2(header_height * 1.0, button_y(0)), button_size),
      () => {
        ctx.beginPath();
        ctx.moveTo(0.6, 0.2);
        ctx.lineTo(0.2, 0.5);
        ctx.lineTo(0.6, 0.8);
        // TODO: Fade this if we can't go further
        ctx.strokeStyle = "black";
        ctx.lineWidth = 0.1;
        ctx.stroke();
      },
    );
    // '>' to go forward a puzzle
    let go_next = gui.normalised_button(
      "overlay_next",
      Rect.with_centre(new Vec2(canvas.width - header_height * 1.5, button_y(1)), button_size),
      () => {
        ctx.beginPath();
        ctx.moveTo(0.4, 0.2);
        ctx.lineTo(0.8, 0.5);
        ctx.lineTo(0.4, 0.8);
        // TODO: Fade this if we can't go further
        ctx.strokeStyle = "black";
        ctx.lineWidth = 0.1;
        ctx.stroke();
      },
    );
    // 'x' to close overlay
    let should_close = gui.normalised_button(
      "overlay_close",
      Rect.with_centre(new Vec2(canvas.width - header_height * 0.5, button_y(2)), button_size),
      () => {
        ctx.beginPath();
        ctx.moveTo(0.2, 0.2);
        ctx.lineTo(0.8, 0.8);
        ctx.moveTo(0.2, 0.8);
        ctx.lineTo(0.8, 0.2);
        ctx.strokeStyle = "black";
        ctx.lineWidth = 0.1;
        ctx.stroke();
      },
    );
    // Handle next/prev presses
    const current_puzzle = this.focussed_puzzle_tween.target;
    let next_puzzle = current_puzzle;
    if (go_prev) next_puzzle -= 1;
    if (go_next) next_puzzle += 1;
    next_puzzle = clamp(next_puzzle, 0, this.puzzle_sets.length - 1);
    if (next_puzzle !== current_puzzle) {
      this.focussed_puzzle_tween.animate_to(next_puzzle);
    }
    // Handle overlay closing
    if (should_close) {
      // Move the puzzle world camera based on the puzzles we've moved through
      this.puzzle_world_transform = Transform
        .translate(
          Vec2.DOWN.mul((this.last_clicked_puzzle - current_puzzle) * PUZZLE_BOX_MAX_HEIGHT),
        )
        .then(this.puzzle_world_transform);
      this.overlay_tween.animate_to(false);
    }

    // Overlay grid (usually just one, but possibly many if we are animating between puzzles)
    let first_puzzle_on_screen = Math.floor(this.focussed_puzzle_tween.get());
    let last_puzzle_on_screen = Math.ceil(this.focussed_puzzle_tween.get());
    for (let i = first_puzzle_on_screen; i <= last_puzzle_on_screen; i++) {
      let puzzle_set = this.puzzle_sets[i];
      const transform = this.unanimated_overlay_grid_transform(puzzle_set)
        .then_translate(
          new Vec2(
            canvas.width * (i - this.focussed_puzzle_tween.get()), // Animate between puzzles
            canvas.height * (1 - this.overlay_factor()), // Animate overlay from bottom
          ),
        );
      puzzle_set.overlay_grid.draw(transform);
    }

    // Draw animating solved grids above all other layers
    this.draw_solved_grids((g) => g.is_animating_out_of_overlay());
  }

  private draw_solved_grids(predicate: (g: SolvedGrid) => boolean): void {
    for (const g of this.solved_grids) {
      let transform = g.transform_tween.get_with_pre_and_lerp_fn(
        (t) => this.convert_transform(g.puzzle_set, t),
        Transform.lerp,
      );
      if (predicate(g)) {
        g.draw(transform);
      }
    }
  }

  /* TRANSFORMS */

  camera_transform(): Transform {
    let unfocussed_transform = this.puzzle_world_transform
      .then_translate(new Vec2(canvas.width / 2, canvas.height / 2));

    const scale = SOLVING_PUZZLE_LINE_HEIGHT * SOLVING_HEADER_HEIGHT * canvas.height /
      PUZZLE_BOX_MAX_HEIGHT; // Scale to fill height
    let focussed_transform = Transform
      .translate(Vec2.UP.mul(this.focussed_puzzle_tween.get()))
      .then_scale(scale)
      .then_translate(new Vec2(canvas.width / 2, canvas.height * SOLVING_HEADER_HEIGHT / 2));

    return Transform.lerp(unfocussed_transform, focussed_transform, this.overlay_tween.factor());
  }

  /* INTERACTION */

  handle_mouse_interaction(mouse: MouseUpdate): void {
    if (this.is_overlay_fully_off()) {
      /* Handle this input as an interaction with the puzzle menu */

      // Mouse movement when clicking will pan the camera
      if (mouse.button_down) {
        this.puzzle_world_transform = this.puzzle_world_transform.then_translate(mouse.delta);
      }

      // Scrolling zooms the puzzle window
      let desired_scale = this.puzzle_world_transform.scale;
      desired_scale *= Math.pow(ZOOM_FACTOR, -mouse.scroll_delta); // Change the zoom
      desired_scale = Math.min(Math.max(desired_scale, MIN_ZOOM), MAX_ZOOM); // Clamp the zoom
      // TODO: Zoom around the cursor's location
      this.puzzle_world_transform = this
        .puzzle_world_transform
        .then_scale(desired_scale / this.puzzle_world_transform.scale);

      // Clicking will focus the puzzle currently under the cursor
      if (mouse.button_clicked) {
        let puzzle_under_cursor = this.puzzle_under_cursor(mouse);
        if (puzzle_under_cursor !== undefined) {
          this.focussed_puzzle_tween.jump_to(puzzle_under_cursor);
          this.last_clicked_puzzle = puzzle_under_cursor;
          this.overlay_tween.animate_to(true);
        }
      }
    }

    // Always handle puzzle refocussing (this is written so that, when editing a puzzle, all
    // puzzles will be marked as not hovered)
    let puzzle_under_cursor = this.puzzle_under_cursor(mouse);
    for (let i = 0; i < this.puzzle_sets.length; i++) {
      this.puzzle_sets[i].set_hovered(this.is_overlay_fully_off() && i === puzzle_under_cursor);
    }
  }

  /* HELPER FUNCTIONS */

  stash_overlay_grid(puzzle_set: PuzzleSet): void {
    const solution = puzzle_set.overlay_grid.solution!;
    const pip_group_size = solution.inner.pip_group_size;
    // Fade any existing grid(s) with this solution size (there should only be one)
    for (const g of this.solved_grids) {
      if (g.puzzle_set === puzzle_set && g.pip_group_size === pip_group_size) {
        let curr_transform = g.transform_tween.get();
        if (curr_transform !== "overlay") {
          g.transform_tween.animate_to({ grid_idx: curr_transform.grid_idx, scale_factor: 0 });
        }
      }
    }
    // Animate the existing grid to this new position
    let grid_idx = puzzle_set.puzzle.solutions.findIndex((x) => x === pip_group_size);
    let solved_grid = new SolvedGrid(puzzle_set, "overlay", { grid_idx, scale_factor: 1 });
    this.solved_grids.push(solved_grid);
    // Create a new main grid to replace the old one
    puzzle_set.overlay_grid = new OverlayGrid(puzzle_set.puzzle);
  }

  // TODO: Move this into `SolvedGrid`
  convert_transform(puzzle_set: PuzzleSet, t: SolvedGridTransform): Transform {
    if (t === "overlay") {
      return this.unanimated_overlay_grid_transform(puzzle_set);
    } else {
      return Transform
        .scale(t.scale_factor)
        .then(puzzle_set.grid_transform(t.grid_idx))
        .then(this.camera_transform());
    }
  }

  is_overlay_fully_on(): boolean {
    return this.overlay_factor() === 1.0;
  }

  is_overlay_fully_off(): boolean {
    return this.overlay_factor() === 0.0;
  }

  /// Returns the factor by which the puzzle overlay should be applied.  This inclusively ranges
  /// from 0 (the overlay is fully off) to 1 (the overlay is fully on).
  overlay_factor(): number {
    return this.overlay_tween.factor();
  }

  unanimated_overlay_grid_transform(puzzle_set: PuzzleSet): Transform {
    let header_height = canvas.height * SOLVING_HEADER_HEIGHT; // Convert from ratio to pixels
    let scale = Math.min(
      canvas.width / (puzzle_set.puzzle.grid_width + 1),
      (canvas.height - header_height) / (puzzle_set.puzzle.grid_height + 1),
    );
    let y_coord = lerp(header_height, canvas.height, 0.5);
    return Transform.scale(scale).then_translate(new Vec2(canvas.width / 2, y_coord));
  }

  focussed_puzzle(): number | undefined {
    if (!this.is_overlay_fully_on()) return undefined; // Overlay off => no puzzle focussed

    let puzzle_idx = this.focussed_puzzle_tween.get();
    return (puzzle_idx % 1 === 0) ? puzzle_idx : undefined;
  }

  puzzle_under_cursor(mouse: MouseUpdate): number | undefined {
    let local_mouse_pos = this.camera_transform().inv().transform_point(mouse.pos);
    for (let i = 0; i < this.puzzle_sets.length; i++) {
      if (puzzle_sets[i].overall_rect().contains(local_mouse_pos)) {
        return i;
      }
    }
    return undefined;
  }
}

/* ===== INIT CODE ===== */

// Create puzzle patterns
let _puzzles = [
  // Intro
  { solutions: [1], pattern: "11" },
  { solutions: [2], pattern: "211" },
  { solutions: [3], pattern: "123" },
  { solutions: [2], pattern: "21|1." },
  { solutions: [1], pattern: "111" },
  { solutions: [2, 3], pattern: "2112" },
  { solutions: [1, 2], pattern: "11|11" },
  { solutions: [1], pattern: "11|1." },
  { solutions: [1, 2], pattern: ".1.|1.1|.1." },
  { solutions: [1, 2, 3], pattern: "111|111" },
  { solutions: [1, 3], pattern: "111|111|111" },
  { solutions: [8], pattern: "111|181|111" },
  { solutions: [8], pattern: "811|111|111" },
  { solutions: [7], pattern: "711|111|117" },

  // Cool set of puzzles
  { solutions: [3], pattern: "21|12" },
  { solutions: [2, 3], pattern: "21.|12.|..." },
  { solutions: [4], pattern: "21.|12.|..2" },
  { solutions: [2, 4], pattern: "21..|12..|..2.|...." },
  { solutions: [2, 4], pattern: "21..|12..|....|...2" },

  // Cool set of puzzles
  // TODO: Do this whole set as 1+2=3 rather than 1+1=2
  // TODO: Prune this down a bit
  { solutions: [3], pattern: "21|12" }, // TODO: This is a duplicate
  { solutions: [2, 3], pattern: "2.1|1.2" },
  { solutions: [2, 3], pattern: "2.2|1.1" },
  { solutions: [2, 3], pattern: "...|2.2|1.1" },
  { solutions: [2, 3], pattern: "2.2|...|1.1" },
  { solutions: [2, 3], pattern: "..2|.2.|1.1" },
  { solutions: [2, 3], pattern: "..2|12.|..1" },
  { solutions: [2, 3], pattern: "2.2|1..|..1" },
  { solutions: [2, 3], pattern: "22.|1..|..1" },
  { solutions: [2, 4], pattern: "222|1..|..1" },
  { solutions: [2, 4], pattern: "222|1.1|..." },

  // Cool set of puzzles
  { solutions: [3], pattern: ".31|31.|1.." },
  { solutions: [3, 6], pattern: "331|31.|1.." },
  { solutions: [3, 4, 6], pattern: ".31|31.|1.3" },
  { solutions: [4, 6], pattern: ".31|33.|1.1" },

  // Cool set of puzzles
  { solutions: [3], pattern: "123|2.1" },
  { solutions: [3], pattern: ".2.|1.3|2.1" },
  { solutions: [3], pattern: ".1.|2.3|2.1" },

  // Cool set of puzzles
  { solutions: [4], pattern: "1.1|2.2|1.1" },
  { solutions: [2, 4], pattern: "...|1.1|2.2|1.1" },

  // Cool set of puzzles
  { solutions: [3], pattern: "21|21" },
  { solutions: [3], pattern: ".21|.21" },
  { solutions: [2, 3], pattern: "221|..1" },

  // Cool set of puzzles
  { solutions: [2], pattern: ".2.|.2.|.2." },
  { solutions: [2, 3], pattern: ".2.|.2.|1.1" },
  { solutions: [2, 3], pattern: "1.1|.2.|1.1" },
  { solutions: [2, 3], pattern: "1.1|..2|1.1" },
  { solutions: [2, 3], pattern: "1.1|1.2|..1" },

  // Cool set of puzzles
  { solutions: [2, 3], pattern: "..2|2..|11." },
  { solutions: [2, 3], pattern: "..2|...|112" },
  { solutions: [2, 3], pattern: "..2|...|112" },
  { solutions: [2, 4], pattern: "2.2|...|112" },
  { solutions: [2, 4], pattern: "2.2|...|121" },

  // Cool set of puzzles
  { solutions: [3, 4], pattern: "313|...|131" },
  { solutions: [4, 6], pattern: "113|...|331" },
  { solutions: [3, 4, 6], pattern: "111|...|333" },
  { solutions: [4, 6], pattern: "131|...|331" },

  // 5,5,5 twizzly puzzles
  // { solutions: 1, pattern: "21.|345" },
  { solutions: [5], pattern: "23|5.|41" },
  { solutions: [5], pattern: "15|.4|23" },
  { solutions: [5], pattern: "253|...|4.1" },
  { solutions: [5], pattern: ".....|1...3|4.5.2" },
  { solutions: [5], pattern: ".....|2...3|4.5.1" },
  { solutions: [5], pattern: "1..2.|3..4.|5...." },
  { solutions: [5], pattern: "1..3|..5.|....|..4.|2..." },
  { solutions: [5], pattern: "1...4|2.5.3|.....|....." },
  { solutions: [5, 10], pattern: "1...4|2.5.3|..5..|....." },
  // 7,7,7 twizzly puzzles
  { solutions: [7], pattern: "321|456" },
  { solutions: [7], pattern: "34|16|52" },
  { solutions: [7], pattern: "351|...|426" },
  { solutions: [7], pattern: "352|...|164" },
  { solutions: [7], pattern: "342|...|165" },
  { solutions: [7], pattern: "4.1|5..|..6|2.3" },
  { solutions: [7], pattern: "1...3|.2...|...4.|5...6" },
  { solutions: [7], pattern: "1...3|.4...|...2.|5...6" },
  // 3,3,3 or 5,5,5 extra twizzly puzzles
  // { solutions: 1, pattern: "3.|12|21" },
  { solutions: [3], pattern: "3.|22|11" },
  { solutions: [3], pattern: "...|.31|.22|..1" },
  { solutions: [3], pattern: "1...|..31|..22|...." },
  { solutions: [5], pattern: "1...|..53|..24|...." },
  { solutions: [5], pattern: ".....|..2..|..15.|.....|4...3" },
  { solutions: [5, 10], pattern: "....5|..2..|..15.|.....|4...3" },
  // 2+2+2,3+3,6 twizzly puzzles
  { solutions: [6], pattern: "222|3.3" },
  { solutions: [6], pattern: ".2.|.3.|232" },
  { solutions: [6, 9], pattern: "2.2|..3|236" },
  { solutions: [6, 9], pattern: "62..|2.3.|.32.|...." },
  { solutions: [6, 12], pattern: "62..|2.3.|.32.|...6" },
  { solutions: [6, 9], pattern: ".....|..2..|..6..|32.23" },
  { solutions: [6], pattern: ".....|...3.|....2|..2..|2...3" },
  { solutions: [6, 9], pattern: ".....|.6.3.|....2|...2.|2...3" },
  { solutions: [6, 12], pattern: ".....|.6.3.|....2|6..2.|2...3" },

  // Puzzles looking for sets
  { solutions: [2, 3], pattern: "1.2|.2.|..1" },
  { solutions: [4, 6], pattern: "121|2.2|121" },
  { solutions: [4, 6], pattern: ".33|...|114" },
  { solutions: [1, 2, 3], pattern: ".1.|1.1|111" }, // Good mirrored one
  { solutions: [2, 3], pattern: ".....|12.21" },
  { solutions: [3, 5], pattern: "32..|..11|323." },
  { solutions: [4, 5], pattern: "1.41|4...|...4|14.1" },
  { solutions: [2, 3, 4, 6], pattern: "2..2|.11.|.11.|2..2" },
  { solutions: [4, 6, 9, 12, 18], pattern: "4224|2112|2112|4224" },
  { solutions: [2, 7], pattern: "2.1.2|.....|1.2.1|.....|2.1.2" },
  { solutions: [2, 4, 8], pattern: "2.1.2|.....|1.2.1|...2.|2.1.2" },
  { solutions: [2, 4, 8], pattern: "2.1.2|.....|1.2.1|..2..|2.1.2" },
];

let total_solns_required = 0;
_puzzles.forEach((p) => total_solns_required += p.solutions.length);
console.log(`${_puzzles.length} puzzles, totalling ${total_solns_required} solutions`);

let idx = 0;
let puzzle_sets: PuzzleSet[] = _puzzles.map(
  ({ pattern, solutions }) => new PuzzleSet(pattern, 0, idx++, solutions),
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

class MouseEventHandler {
  // TODO: Handle the case where a user clicks and unclicks in the same frame?

  // We start the mouse miles off the screen so that vertices close to the top-left corner of the
  // screen can't be erroneously selected before the user moves their mouse into the window.
  private current_state: MouseState = {
    pos: new Vec2(-10000, -10000),
    button: false,
  };
  private state_at_last_frame: MouseState = {
    pos: new Vec2(-10000, -10000),
    button: false,
  };

  private scroll_delta_since_last_frame = 0;
  private has_mouse_moved_yet = false;

  constructor() {
    window.addEventListener("mousemove", (evt) => {
      this.update_mouse(evt);
      // Make sure that the first mouse movement has a delta of zero (rather than ~14k pixels)
      if (!this.has_mouse_moved_yet) {
        this.state_at_last_frame.pos = this.current_state.pos;
        this.has_mouse_moved_yet = true;
      }
    });
    window.addEventListener("mousedown", (evt) => this.update_mouse(evt));
    window.addEventListener("mouseup", (evt) => this.update_mouse(evt));
    window.addEventListener("wheel", (evt) => {
      if (evt.deltaMode === WheelEvent.DOM_DELTA_PIXEL) {
        this.scroll_delta_since_last_frame += evt.deltaY;
      } else if (evt.deltaMode === WheelEvent.DOM_DELTA_LINE) {
        this.scroll_delta_since_last_frame += evt.deltaY * 20;
      }
      // DOM_DELTA_PAGE signals are ignored
    });
  }

  begin_frame(): MouseUpdate {
    let update = {
      pos: this.current_state.pos,
      delta: this.current_state.pos.sub(this.state_at_last_frame.pos),

      button_down: this.current_state.button,
      button_clicked: !this.state_at_last_frame.button && this.current_state.button,
      button_released: this.state_at_last_frame.button && !this.current_state.button,

      scroll_delta: this.scroll_delta_since_last_frame,
    };
    // Clear all the deltas since last frame.  Any mouse events should accumulate and be handled
    // in the next frame.
    this.state_at_last_frame = { ...this.current_state };
    this.scroll_delta_since_last_frame = 0;
    return update;
  }

  private update_mouse(evt: MouseEvent): void {
    this.current_state.pos = new Vec2(
      evt.clientX * window.devicePixelRatio,
      evt.clientY * window.devicePixelRatio,
    );
    this.current_state.button = evt.buttons != 0;
  }
}

type MouseState = {
  pos: Vec2;
  button: boolean;
};

type MouseUpdate = {
  readonly pos: Vec2;
  readonly delta: Vec2;

  readonly button_down: boolean;
  readonly button_clicked: boolean;
  readonly button_released: boolean;

  readonly scroll_delta: number;
};

let mouse_event_handler = new MouseEventHandler();
let gui_memory = new GuiMemory();

/* START GAMELOOP */

on_resize();
let last_frame_time = Date.now();
function frame(): void {
  let mouse_update = mouse_event_handler.begin_frame();
  let time_delta = (Date.now() - last_frame_time) / 1000;
  last_frame_time = Date.now();

  game.update(time_delta, mouse_update);
  game.draw(new Gui(gui_memory, mouse_update));
  window.requestAnimationFrame(frame);
}
frame();
