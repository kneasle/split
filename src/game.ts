/* Game code for Split */

/// Singleton instance which handles all top-level game logic
class Game {
  /* Puzzle world */
  puzzle_world_transform: Transform;
  puzzle_sets: PuzzleSet[];
  fading_grids: Grid[];

  focussed_puzzle_tween: Tween<number | undefined>;

  constructor(puzzle_sets: PuzzleSet[]) {
    // Puzzle world
    this.puzzle_world_transform = Transform.scale(DEFAULT_ZOOM);
    this.puzzle_sets = puzzle_sets;
    this.fading_grids = [];

    this.focussed_puzzle_tween = new Tween<number | undefined>(
      undefined, // Start with no puzzle in focus
      PUZZLE_FOCUS_TIME,
      (a, b, t) => t >= 1 ? b : a,
    );
  }

  update(_time_delta: number, mouse: MouseUpdate): void {
    this.handle_mouse_interaction(mouse);

    // Remove any grids which have fully faded
    retain(this.fading_grids, (grid) => grid.transform().scale > 0);

    for (const ps of this.puzzle_sets) {
      let needs_sorting = false;
      for (const g of ps.grids) {
        if (g.has_just_become_stashable()) {
          needs_sorting = true;
          // Note that we don't short circuit here because we need 'has_just_become_stashable'
          // to be called every frame.
        }
      }

      if (needs_sorting) {
        // Sort grids by solution number, tie-breaking by solution time
        ps.grids = sort_by_key(ps.grids, (grid) => {
          let is_correct_soln = grid.solution !== undefined && grid.solution.is_correct;
          return is_correct_soln
            ? [grid.solution?.pip_group_size, grid.solution?.time]
            : [Number.MAX_VALUE, 0];
        });
        // Strip out any duplicate solutions and fade them
        // TODO: Handle the case where someone edits a grid that isn't last
        let grids_to_fade = [];
        let grids_to_keep = [];
        for (let g = 0; g < ps.grids.length; g++) {
          if (
            g + 1 < ps.grids.length &&
            ps.grids[g].solution &&
            ps.grids[g + 1].solution &&
            ps.grids[g].solution?.pip_group_size == ps.grids[g + 1].solution?.pip_group_size
          ) {
            // Next grid has the same number and is newer, so we fade this one
            grids_to_fade.push(ps.grids[g]);
          } else {
            // Next grid has different number, so we keep this one
            grids_to_keep.push(ps.grids[g]);
          }
        }

        // Keep all of `grids_to_keep`
        ps.grids = grids_to_keep;
        // Fade the `fading_grids`
        for (const g of grids_to_fade) {
          const zero_scale_transform = Transform.scale(0).then(g.transform_tween.get());
          g.transform_tween.animate_to(zero_scale_transform);
        }
        this.fading_grids.push(...grids_to_fade);
        // Replenish the grids we lost
        for (let s = ps.grids.length; s < ps.puzzle.num_solutions; s++) {
          ps.grids.push(new Grid(ps.puzzle, ps.grid_transform(s)));
        }

        for (let g = 0; g < ps.grids.length; g++) {
          ps.grids[g].transform_tween.animate_to(ps.grid_transform(g));
        }
      }
    }

    // Trigger adding the solution on the overlay grid to puzzle scene
    /*
    if (this.overlay.grid.is_ready_to_be_stashed()) {
      let { grid, puzzle_idx } = this.overlay;
      let solved_grids = this.puzzle_sets[puzzle_idx].grids;
      const pip_group_size = grid.solution!.pip_group_size;
      // Decide where the new grid should go to keep the grids sorted by solution
      let idx_of_solved_grid = 0;
      while (true) {
        if (idx_of_solved_grid === solved_grids.length) break;
        let solution = solved_grids[idx_of_solved_grid].solution;
        if (solution && solution.pip_group_size >= pip_group_size) break;
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
    */

    /*
    // If the grid is playing its solve animation, delay any close requests until the animation is
    // complete
    const is_waiting_for_solve_animation = this.overlay.grid.is_correctly_solved() &&
      !this.overlay.grid.is_ready_to_be_stashed();
    if (this.overlay.should_close && !is_waiting_for_solve_animation) {
      this.overlay.tween.animate_to(0);
      this.overlay.should_close = false;
    }
    */
  }

  draw(time_delta: number, mouse: MouseUpdate): void {
    /* BACKGROUND */
    ctx.fillStyle = BG_COLOR.to_canvas_color();
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    /* PUZZLE WORLD */
    let camera_transform = this.camera_transform();
    // Puzzles
    for (let i = 0; i < this.puzzle_sets.length; i++) {
      let puzzle_set = this.puzzle_sets[i];
      ctx.strokeStyle = "black";
      // Outline
      let rect = camera_transform.transform_rect(puzzle_set.overall_rect());
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
      // Puzzle Number
      ctx.fillStyle = "black";
      ctx.font = `${Math.round(camera_transform.scale * PUZZLE_TEXT_SIZE)}px monospace`;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(`#${i + 1}`, rect.x - camera_transform.scale * 0.1, rect.y + rect.h / 2);
    }
    // Grids
    let interaction = this.interaction(mouse);
    for (const grid of this.fading_grids) {
      grid.draw(time_delta, undefined);
    }
    for (let p = 0; p < this.puzzle_sets.length; p++) {
      let puzzle = this.puzzle_sets[p];
      for (let g = 0; g < puzzle.grids.length; g++) {
        let grid_interaction = undefined;
        if (interaction && interaction.puzzle_idx === p && interaction.grid_idx === g) {
          grid_interaction = interaction;
        }
        puzzle.grids[g].draw(time_delta, grid_interaction);
      }
    }
  }

  /* TRANSFORMS */

  camera_transform(): Transform {
    let focus_transform = (puzzle_idx: number | undefined): Transform => {
      if (puzzle_idx === undefined) return this.puzzle_world_transform;

      let puzzle = this.puzzle_sets[puzzle_idx];
      let scale = Math.min(
        (1 - FOCUS_BORDER_HORIZONTAL * 2) * canvas.width / puzzle.width, // Scale to fill width
        (1 - FOCUS_BORDER_VERTICAL * 2) * canvas.height / puzzle.height, // Scale to fill height
      );
      return Transform.translate(Vec2.UP.mul(puzzle_idx)).then_scale(scale);
    };

    return this.focussed_puzzle_tween.get_with_lerp_fn((a, b, t) =>
      Transform
        .lerp(focus_transform(a), focus_transform(b), t)
        .then_translate(new Vec2(canvas.width / 2, canvas.height / 2))
    );
  }

  /* INTERACTION */

  handle_mouse_interaction(mouse: MouseUpdate): void {
    this.handle_mouse_move(mouse);
    this.handle_mouse_scroll(mouse);
    if (mouse.button_clicked) this.on_mouse_down(mouse);
    if (mouse.button_released) this.on_mouse_up(mouse);
  }

  handle_mouse_move(mouse: MouseUpdate): void {
    if (this.is_fully_unfocussed()) {
      // If no puzzle is focussed, mouse movement can only be used to pan the camera
      if (mouse.button_down) {
        this.puzzle_world_transform = this.puzzle_world_transform.then_translate(mouse.delta);
      }
    }
    let interaction = this.interaction(mouse);
    if (interaction) {
      // If any puzzle is focussed, the grids should handle the mouse movement
      this.interaction_grid(interaction).handle_mouse_move(interaction, mouse);
    }
  }

  handle_mouse_scroll(mouse: MouseUpdate): void {
    if (!this.is_fully_unfocussed()) return;

    let desired_scale = this.puzzle_world_transform.scale;
    desired_scale *= Math.pow(ZOOM_FACTOR, -mouse.scroll_delta); // Perform the zoom
    desired_scale = Math.min(Math.max(desired_scale, MIN_ZOOM), MAX_ZOOM); // Clamp the zoom
    // TODO: Zoom around the cursor's location
    this.puzzle_world_transform = this
      .puzzle_world_transform
      .then_scale(desired_scale / this.puzzle_world_transform.scale);
  }

  on_mouse_down(mouse: MouseUpdate): void {
    // TODO: If a puzzle will capture this click, don't use it to change the puzzle
    let focussed_puzzle = this.focussed_puzzle();
    let puzzle_under_cursor = this.puzzle_under_cursor(mouse);
    if (focussed_puzzle !== undefined && puzzle_under_cursor === focussed_puzzle) {
      // The click should be forwarded to the puzzle
      let interaction = this.interaction(mouse)!;
      this.interaction_grid(interaction).on_mouse_down(interaction);
    } else {
      // If no puzzle captures this input, interpret the click as a refocus
      this.refocus_to_puzzle_under_cursor(mouse);
    }
  }

  on_mouse_up(mouse: MouseUpdate): void {
    let interaction = this.interaction(mouse);
    if (interaction) {
      this.interaction_grid(interaction).on_mouse_up();
    }
  }

  refocus_to_puzzle_under_cursor(mouse: MouseUpdate): void {
    if (this.focussed_puzzle_tween.is_animating()) return; // Don't refocus puzzles while animating

    // If we click on a puzzle, focus on it
    let puzzle_under_cursor = this.puzzle_under_cursor(mouse);
    if (puzzle_under_cursor === undefined) {
      // If the click wasn't on any puzzles, then lose focus on the current puzzle
      this.focussed_puzzle_tween.animate_to(undefined);
    } else {
      let focussed_puzzle = this.focussed_puzzle_tween.get();
      if (focussed_puzzle !== undefined) {
        // If we're moving from one puzzle to another, then move the camera as well so that, when
        // the user finally unfocusses, camera won't zoom back across the map to see it
        this.puzzle_world_transform = Transform
          .translate(Vec2.DOWN.mul(focussed_puzzle - puzzle_under_cursor))
          .then(this.puzzle_world_transform);
      }
      // Mouse is within this puzzle's rect, so open it as a puzzle
      this.focussed_puzzle_tween.animate_to(puzzle_under_cursor);
    }
  }

  // Find out what the mouse must be interacting with (in this case, the user is defined to be
  // interacting with the nearest vertex to the mouse).
  interaction(mouse: MouseUpdate): Interaction | undefined {
    // Get the focussed set of puzzle grids (early returning if no puzzle is focussed)
    let focussed_puzzle = this.focussed_puzzle();
    if (focussed_puzzle === undefined) return undefined;
    let focussed_puzzle_grids = this.puzzle_sets[focussed_puzzle].grids;

    // Check if a grid is having a line drawn.  If so, we should always interact with it, however
    // far away the mouse is.
    let grid_being_drawn = undefined;
    for (let grid_idx = 0; grid_idx < focussed_puzzle_grids.length; grid_idx++) {
      if (focussed_puzzle_grids[grid_idx].is_drawing_line) {
        grid_being_drawn = grid_idx;
        break;
      }
    }

    // For each grid ...
    let interaction = undefined;
    for (let grid_idx = 0; grid_idx < focussed_puzzle_grids.length; grid_idx++) {
      // If a grid is being drawn, only allow interaction with that grid
      if (grid_being_drawn !== undefined && grid_being_drawn !== grid_idx) continue;

      let grid = focussed_puzzle_grids[grid_idx];
      // ... for each vertex in that grid ...
      let local_mouse = grid.transform().inv().transform_point(mouse.pos);
      for (let vert_idx = 0; vert_idx < grid.puzzle.verts.length; vert_idx++) {
        let { x: vert_x, y: vert_y } = grid.puzzle.verts[vert_idx];
        let dX = local_mouse.x - vert_x;
        let dY = local_mouse.y - vert_y;
        let dist = Math.sqrt(dX * dX + dY * dY);
        // ... if this is the new closest vertex, update the interaction
        if (interaction === undefined || dist < interaction.vert_distance) {
          interaction = {
            puzzle_idx: focussed_puzzle,
            grid_idx,

            local_pos: local_mouse,
            vert_idx,
            vert_distance: dist,
          };
        }
      }
    }

    return interaction;
  }

  /* HELPER FUNCTIONS */

  interaction_grid(interaction: Interaction): Grid {
    return this.puzzle_sets[interaction.puzzle_idx].grids[interaction.grid_idx];
  }

  is_fully_unfocussed(): boolean {
    return this.focussed_puzzle_tween.get() === undefined;
  }

  focussed_puzzle(): number | undefined {
    return this.focussed_puzzle_tween.get_with_lerp_fn((a, b, t) => t >= 0.999 ? b : a);
  }

  puzzle_under_cursor(mouse: MouseUpdate): number | undefined {
    let { x, y } = this.camera_transform().inv().transform_point(mouse.pos);
    for (let i = 0; i < this.puzzle_sets.length; i++) {
      let r = puzzle_sets[i].overall_rect();
      if (x < r.x || x > r.x + r.w) continue;
      if (y < r.y || y > r.y + r.h) continue;
      return i; // Puzzle is under the cursor
    }
    return undefined;
  }
}

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
  { num_solutions: 1, pattern: "811|111|111" },
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
  { num_solutions: 2, pattern: "2.2|.2.|1.1" },

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
  { num_solutions: 1, pattern: "253|...|4.1" },
  { num_solutions: 1, pattern: ".....|2...3|4.5.1" },
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
  { num_solutions: 1, pattern: ".....|...3.|....2|..2..|2...3" },
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

class MouseEventHandler {
  // TODO: Handle the case where a user clicks and unclicks in the same frame?

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

type MouseState = { pos: Vec2; button: boolean };
type MouseUpdate = {
  readonly pos: Vec2;
  readonly delta: Vec2;

  readonly button_down: boolean;
  readonly button_clicked: boolean;
  readonly button_released: boolean;

  readonly scroll_delta: number;
};

// We start the mouse miles off the screen so that vertices close to the top-left corner of the
// screen can't be erroneously selected before the user moves their mouse into the window.
let mouse_event_handler = new MouseEventHandler();

/* START GAMELOOP */

on_resize();
let last_frame_time = Date.now();
function frame(): void {
  let mouse_update = mouse_event_handler.begin_frame();
  let time_delta = (Date.now() - last_frame_time) / 1000;
  last_frame_time = Date.now();

  game.update(time_delta, mouse_update);
  game.draw(time_delta, mouse_update);
  window.requestAnimationFrame(frame);
}
frame();
