type TransformState = "tiny" | "overlay" | { puzzle_idx: number; grid_idx: number; faded: boolean };

function is_faded(s: TransformState): boolean {
  if (typeof s === "object") return s.faded;
  else return false;
}

/// An instance of a `Puzzle` on the screen
class Grid {
  puzzle: Puzzle;
  line: number[];
  is_drawing_line: boolean;
  solution: any; // TODO: Explicit type
  transform_tween: Tween<TransformState>;

  pips: Pip[];
  pip_idxs_per_cell: number[][];

  constructor(puzzle: Puzzle, state: TransformState) {
    this.puzzle = puzzle;
    this.line = []; // List of vertex indices which make up the line being drawn
    this.is_drawing_line = false;
    // For every `Grid`, `solution` is always in one of three states:
    // 1) `this.solution === undefined`: no solution is on the grid; the puzzle is unsolved
    // 2) `this.solution.is_valid === true`: the solution is valid
    // 3) `this.solution.is_valid === false`: the solution is invalid
    this.solution = undefined;

    // State for animating the transform
    this.transform_tween = new Tween<TransformState>(
      state,
      GRID_MOVE_ANIMATION_TIME,
      (_a, b, _t) => b,
    );

    // Create pips, and record which pips belong in which cell (in an unsolved puzzle)
    this.pips = [];
    this.pip_idxs_per_cell = [];
    for (let c = 0; c < this.puzzle.cells.length; c++) {
      const cell = this.puzzle.cells[c];
      const pip_idxs = [];
      for (let p = 0; p < cell.pips; p++) {
        pip_idxs.push(this.pips.length);
        const { x, y } = this.pip_coords(c, p, undefined);
        this.pips.push(new Pip(c, { x, y, color: PIP_COLOR }));
      }
      this.pip_idxs_per_cell.push(pip_idxs);
    }
  }

  on_mouse_down(): boolean {
    const interaction = this.interaction()!;
    if (interaction.vert_distance < VERTEX_INTERACTION_RADIUS) {
      // Mouse is cloes enough to a vertex to start a line
      this.line = [interaction.vert_idx];
      this.is_drawing_line = true;
    } else if (
      interaction.local_x >= 0 && interaction.local_x <= this.puzzle.width &&
      interaction.local_y >= 0 && interaction.local_y <= this.puzzle.height
    ) {
      this.line = []; // Mouse is on the grid but can't start a line
    } else {
      return false; // Mouse is fully off the grid, so don't register the click
    }

    // Remove current solution
    if (this.solution !== undefined) {
      // Animate all pips back to their start locations
      for (const pip of this.pips) {
        pip.state_tween.animate_to(pip.unsolved_state);
      }
    }
    this.solution = undefined;
    return true;
  }

  on_mouse_move() {
    if (!this.is_drawing_line) return; // Mouse moves don't matter if we're not drawing a line

    const interaction = this.interaction()!;

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

  on_mouse_up() {
    if (!this.is_drawing_line) return; // Mouse ups don't matter if we aren't drawing a line

    this.is_drawing_line = false;

    // Check the user's solution
    const is_line_loop = this.line.length > 1 && this.line[0] === this.line[this.line.length - 1];
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
      // TODO: Fancier way to determine where the pips are assigned
      let _this = this;
      const cells_to_add_pips_to = sort_by_key(region.cells, (cell_idx: number) => {
        let cell = _this.puzzle.cells[cell_idx];
        let dx = cell.centre.x - avg_x;
        let dy = cell.centre.y - avg_y;
        let dist = dx * dx + dy * dy;
        return [dist, -(cell.centre.x + cell.centre.y) % 2];
      });

      // Group pips into cells
      let pip_idxs_in_region = region.cells.flatMap((idx: number) => this.pip_idxs_per_cell[idx]);
      for (const cell_idx of cells_to_add_pips_to) {
        // Reserve up to 10 pips to go in this cell
        const num_pips = Math.min(pip_idxs_in_region.length, 10);
        const pip_idxs = pip_idxs_in_region.slice(0, num_pips);
        pip_idxs_in_region = pip_idxs_in_region.slice(num_pips);
        // Animate them to their new positions
        // TODO: Don't move pips which exist in both the solved and unsolved puzzles
        for (let p = 0; p < num_pips; p++) {
          const { x, y } = this.pip_coords(cell_idx, p, num_pips);
          this.pips[pip_idxs[p]].state_tween.animate_to({ x, y, color: this.solution_color() });
        }
      }
    }
  }

  draw() {
    const interaction = this.interaction();

    // Update canvas's transformation matrix to the puzzle's local space
    let transform = this.current_transform();
    ctx.save();
    ctx.translate(transform.dx, transform.dy);
    ctx.scale(transform.scale, transform.scale);
    ctx.translate(-this.puzzle.width / 2, -this.puzzle.height / 2);

    // Handle solution animation (mainly colours)
    const line_color = Color.lerp(LINE_COLOR, this.solution_color(), this.solution_anim_factor())
      .to_canvas_color();

    // Cell
    ctx.fillStyle = CELL_COLOR.to_canvas_color();
    for (const c of this.puzzle.cells) {
      ctx.beginPath();
      for (const v of c.verts) {
        ctx.lineTo(this.puzzle.verts[v].x, this.puzzle.verts[v].y);
      }
      ctx.fill();
    }

    // Edges
    ctx.lineWidth = EDGE_WIDTH;
    ctx.strokeStyle = GRID_COLOR.to_canvas_color();
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
        let _interaction = interaction!;
        should_be_line_colored = v_idx === _interaction.vert_idx &&
          _interaction.vert_distance <= VERTEX_INTERACTION_RADIUS;
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
      ctx.fillStyle = should_be_line_colored ? line_color : GRID_COLOR.to_canvas_color();
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
    // HACK: For loops, draw the first line segment twice to avoid a sharp corner at the first
    // vertex
    if (this.line.length > 1 && this.line[0] === this.line[this.line.length - 1]) {
      let vert = this.puzzle.verts[this.line[1]];
      ctx.lineTo(vert.x, vert.y);
    }
    ctx.stroke();

    // Pips
    for (const pip of this.pips) {
      const { x, y, color } = pip.state_tween.get();
      ctx.fillStyle = color.to_canvas_color();
      ctx.fillRect(x - PIP_SIZE / 2, y - PIP_SIZE / 2, PIP_SIZE, PIP_SIZE);
    }

    ctx.restore();
  }

  // Find out what the mouse must be interacting with (in this case, the user is defined to be
  // interacting with the nearest vertex to the mouse).
  interaction() {
    // Transform mouse coordinates into the puzzle's coord space
    let transform = this.current_transform();
    let local_x = (mouse_x - transform.dx) / transform.scale + this.puzzle.width / 2;
    let local_y = (mouse_y - transform.dy) / transform.scale + this.puzzle.height / 2;

    let interaction = undefined;
    for (let vert_idx = 0; vert_idx < this.puzzle.verts.length; vert_idx++) {
      let { x: vert_x, y: vert_y } = this.puzzle.verts[vert_idx];
      let dX = local_x - vert_x;
      let dY = local_y - vert_y;
      let dist = Math.sqrt(dX * dX + dY * dY);
      if (interaction === undefined || dist < interaction.vert_distance) {
        interaction = {
          local_x,
          local_y,
          vert_idx,
          vert_distance: dist,
        };
      }
    }
    return interaction;
  }

  current_transform(): Transform {
    return this.transform_tween.get_with_lerp_fn(
      (a, b, t) => Transform.lerp(this.transform(a), this.transform(b), t),
    );
  }

  transform(state: TransformState): Transform {
    // Get the rectangle in which the puzzle has to fit
    let rect = {
      x: 0,
      y: PUZZLE_WORLD_SCALE,
      w: canvas.width,
      h: canvas.height - PUZZLE_WORLD_SCALE,
    };
    let scale_multiplier;
    if (state === "overlay") {
      scale_multiplier = game.overlay.tween.get();
    } else if (state === "tiny") {
      scale_multiplier = 0;
    } else {
      let { x, y } = game.camera_transform().transform_point(
        this.puzzle.pos.x + state.grid_idx - this.puzzle.num_solutions / 2,
        this.puzzle.pos.y - 0.5,
      );
      rect = { x, y, w: PUZZLE_WORLD_SCALE, h: PUZZLE_WORLD_SCALE };
      scale_multiplier = state.faded ? 0 : 1;
    }

    // Scale the puzzle to fill the given `rect`, with 0.5 cells of padding on every side
    const puzzle_width = this.puzzle.width + 0.5 * 2;
    const puzzle_height = this.puzzle.height + 0.5 * 2;
    let scale_to_fill = Math.min(rect.w / puzzle_width, rect.h / puzzle_height);
    return new Transform(
      rect.x + rect.w / 2,
      rect.y + rect.h / 2,
      scale_to_fill * scale_multiplier,
    );
  }

  pip_coords(cell_idx: number, pip_idx: number, num_pips: number | undefined) {
    const cell = this.puzzle.cells[cell_idx];
    const { x, y } = dice_pattern(num_pips || cell.pips)[pip_idx];
    return {
      x: cell.centre.x + x * PIP_PATTERN_RADIUS,
      y: cell.centre.y + y * PIP_PATTERN_RADIUS,
    };
  }

  is_ready_to_be_stashed() {
    return this.is_correctly_solved() &&
      // TODO: Add extra factor for other animations
      uneased_anim_factor(this.solution.time, SOLVE_ANIMATION_TIME) >= 2.0;
  }

  solution_anim_factor() {
    return this.solution ? eased_anim_factor(this.solution.time, SOLVE_ANIMATION_TIME) : 0;
  }

  is_correctly_solved() {
    return this.solution && this.solution.is_correct;
  }

  solution_color() {
    return this.is_correctly_solved() ? CORRECT_COLOR : INCORRECT_COLOR;
  }
}

class Pip {
  source_cell_idx: number;
  unsolved_state: PipState;
  state_tween: Tween<PipState>;

  constructor(source_cell_idx: number, unsolved_state: PipState) {
    // Location of the pip in the unsolved puzzle
    this.source_cell_idx = source_cell_idx;
    this.unsolved_state = unsolved_state;

    // Start the pips animating from unsolved to unsolved
    this.state_tween = new Tween(unsolved_state, SOLVE_ANIMATION_TIME, lerp_pip_state);
    this.state_tween.random_delay_factor = PIP_ANIMATION_SPREAD;
  }
}

type PipState = { x: number; y: number; color: Color };

function lerp_pip_state(a: PipState, b: PipState, t: number): PipState {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
    color: Color.lerp(a.color, b.color, t),
  };
}

/// Compute the (normalised) coordinates of the pips on the dice pattern of a given number.
function dice_pattern(num_pips: number): { x: number; y: number }[] {
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
