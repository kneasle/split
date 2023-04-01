/// An instance of a puzzle grid on the screen
class Grid {
  puzzle: Puzzle;
  pips: Pip[];
  pip_idxs_per_cell: number[][];

  solution: Solution | undefined;
  solvedness: Tween<number>; // 0 <= solvedness <= 1: 0 is unsolved, 1 is solved
  stashable_last_frame: boolean;

  is_drawing_line: boolean;
  line_path: number[];
  ideal_line: LerpedLine;
  displayed_line: LerpedLine;

  transform_tween: Tween<Transform>;

  constructor(puzzle: Puzzle, transform: Transform) {
    this.puzzle = puzzle;

    // For every `Grid`, `solution` is always in one of three states:
    // 1) `this.solution === undefined`: no solution is on the grid; the puzzle is unsolved
    // 2) `this.solution.is_valid === true`: the solution is valid
    // 3) `this.solution.is_valid === false`: the solution is invalid
    this.solution = undefined;
    this.solvedness = new Tween<number>(0, SOLVE_ANIMATION_TIME, lerp);
    this.stashable_last_frame = false;

    this.is_drawing_line = false;
    this.line_path = []; // List of vertex indices which make up the line being drawn
    this.ideal_line = { path: [], disp_length: 0, was_short_line: false };
    this.displayed_line = { path: [], disp_length: 0, was_short_line: false };

    // State for animating the transform
    let zero_scale_transform = Transform.scale(0).then(transform);
    this.transform_tween = new Tween<Transform>(
      zero_scale_transform,
      GRID_MOVE_ANIMATION_TIME,
      Transform.lerp,
    );
    this.transform_tween.animate_to(transform);

    // Create pips, and record which pips belong in which cell (in an unsolved puzzle)
    this.pips = [];
    this.pip_idxs_per_cell = [];
    for (let c = 0; c < this.puzzle.cells.length; c++) {
      const cell = this.puzzle.cells[c];
      const pip_idxs = [];
      for (let p = 0; p < cell.pips; p++) {
        pip_idxs.push(this.pips.length);
        const { x, y } = this.pip_coords(c, p);
        this.pips.push(new Pip(c, { x, y, color: PIP_COLOR }));
      }
      this.pip_idxs_per_cell.push(pip_idxs);
    }
  }

  on_mouse_down(interaction: Interaction): boolean {
    if (interaction.vert_distance < VERTEX_INTERACTION_RADIUS) {
      // Mouse is cloes enough to a vertex to start a line
      this.line_path = [interaction.vert_idx];
      this.is_drawing_line = true;
    } else if (
      interaction.local_pos.x >= 0 && interaction.local_pos.x <= this.puzzle.grid_width &&
      interaction.local_pos.y >= 0 && interaction.local_pos.x <= this.puzzle.grid_height
    ) {
      this.line_path = []; // Mouse is on the grid but can't start a line
    } else {
      return false; // Mouse is fully off the grid, so don't register the click
    }

    // If the grid was clicked, remove current solution
    if (this.solution !== undefined) {
      // Animate all pips back to their start locations
      for (const pip of this.pips) {
        pip.state_tween.animate_to(pip.unsolved_state);
      }
    }
    this.solution = undefined;
    this.solvedness.animate_to(0.0);

    // Reset ideal line
    this.ideal_line = { path: [...this.line_path], disp_length: 0, was_short_line: false };
    return true;
  }

  handle_mouse_move(interaction: Interaction, mouse: MouseUpdate): void {
    if (!this.is_drawing_line) return; // Mouse moves don't matter if we're not drawing a line

    let new_vert = interaction.vert_idx;
    let last_vert = this.line_path[this.line_path.length - 1];
    let penultimate_vert = this.line_path[this.line_path.length - 2];

    if (this.line_path.length == 0) return; // No line is being drawn
    if (!mouse.button_down) return; // User is not dragging
    if (new_vert === undefined) return; // Mouse not close enough to a vert
    if (new_vert === last_vert) return; // Still on last vert
    if (this.puzzle.connecting_edge(last_vert, new_vert) === undefined) {
      return; // Verts aren't connected
    }

    // Don't allow the user to add a line segment twice
    for (let i = 0; i < this.line_path.length - 2; i++) {
      if (this.line_path[i] === last_vert && this.line_path[i + 1] === new_vert) return;
      if (this.line_path[i] === new_vert && this.line_path[i + 1] === last_vert) return;
    }

    if (new_vert === penultimate_vert) {
      this.line_path.pop(); // Moved backward, 'unwind' the line
    } else {
      this.line_path.push(new_vert); // Moved forward, 'extend' the line
    }
  }

  on_mouse_up(): void {
    if (!this.is_drawing_line) return; // Mouse ups don't matter if we aren't drawing a line

    this.is_drawing_line = false;

    // Check the user's solution
    const is_line_loop = this.line_path.length > 1 &&
      this.line_path[0] === this.line_path[this.line_path.length - 1] &&
      this.ideal_line.disp_length === this.ideal_line.path.length - 1;
    if (!is_line_loop) {
      if (this.ideal_line.disp_length < MIN_LINE_LENGTH_TO_KEEP) {
        this.ideal_line = { path: [], disp_length: 0, was_short_line: true };
      }
      return; // Can't solve the puzzle if the line doesn't form a loop
    }
    this.solution = this.puzzle.get_solution(this.line_path);
    this.solvedness.animate_to(1.0);

    // Decide where to move the pips
    for (const region of this.solution.regions) {
      if (region.pips === 0) continue;
      // Compute the centre of the region
      let { centroid: region_centre, symmetry_line_directions } = this.region_symmetry(region);
      // Sort cells by their distance from the centre of the region.  This is the order that we'll
      // add the pips
      // TODO: Fancier way to determine where the pips are assigned:
      //        - Try to make overall pattern symmetric
      let _this = this;
      const cells_to_add_pips_to = sort_by_key(region.cells, (cell_idx: number) => {
        let cell_centre = _this.puzzle.cells[cell_idx].centre;
        let distances_to_symmetry_lines = symmetry_line_directions
          .map((dir) => cell_centre.distance_to_line(region_centre, dir));
        let puzzle_centre = Vec2.ZERO;
        return [
          Math.min(...distances_to_symmetry_lines),
          Vec2.distance_between(cell_centre, region_centre),
          Vec2.distance_between(cell_centre, puzzle_centre),
          -Math.abs(Math.ceil(cell_centre.x) + Math.ceil(cell_centre.y)) % 2, // Checkerboard
        ];
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

  private region_symmetry(
    region: Region,
  ): { centroid: Vec2; symmetry_line_directions: Vec2[] } {
    // Compute region centroid
    let total = Vec2.ZERO;
    for (const c of region.cells) {
      let cell = this.puzzle.cells[c];
      total = total.add(cell.centre);
    }
    let centroid = total.div(region.cells.length);

    // Find the line of symmetry (if it exists)
    let lines = [
      new Vec2(1, 1), // Diagonal top-left <-> bottom-right
      new Vec2(1, -1), // Diagonal top-right <-> bottom-left
      new Vec2(0, 1), // Horizontal
      new Vec2(1, 0), // Vertical
    ];
    let symmetry_line_directions = lines.filter((direction) => {
      // A line of symmetry is valid if every cell gets reflected to another existing cell
      for (const c of region.cells) {
        let reflected_centre = this.puzzle.cells[c].centre.reflect_in_line(centroid, direction);
        let found_reflected_cell = false;
        for (const c1 of region.cells) {
          if (Vec2.distance_between(this.puzzle.cells[c1].centre, reflected_centre) < 0.00001) {
            found_reflected_cell = true;
            break;
          }
        }
        if (!found_reflected_cell) {
          return false; // Cell has no reflection, so not a line of symmetry
        }
      }
      return true;
    });

    return { centroid, symmetry_line_directions };
  }

  draw(time_delta: number, interaction: Interaction | undefined): void {
    const line_color = Color.lerp(LINE_COLOR, this.solution_color(), this.solvedness.get())
      .to_canvas_color();

    // Update canvas's transformation matrix to the puzzle's local space
    ctx.save();
    this.transform().apply_to_canvas(ctx);

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
      if (this.line_path.length <= 1) {
        should_be_line_colored = interaction &&
          v_idx === interaction.vert_idx &&
          (this.is_drawing_line || interaction.vert_distance <= VERTEX_INTERACTION_RADIUS);
      } else {
        let start_vert = this.line_path[0];
        let end_vert = this.line_path[this.line_path.length - 1];
        should_be_line_colored = v_idx === start_vert && start_vert !== end_vert;
      }

      const { x, y } = this.puzzle.verts[v_idx];
      ctx.fillStyle = should_be_line_colored ? line_color : GRID_COLOR.to_canvas_color();
      ctx.fillRect(x - VERTEX_SIZE / 2, y - VERTEX_SIZE / 2, VERTEX_SIZE, VERTEX_SIZE);
    }

    // Line
    if (this.is_drawing_line) {
      this.update_ideal_line(interaction!); // interactions are always defined when drawing a line
    }
    this.update_display_line(time_delta);
    let line = this.displayed_line;

    ctx.lineWidth = EDGE_WIDTH;
    ctx.strokeStyle = line_color;
    // TODO: I wonder if this looks too much like The Witness...
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    // Draw all full edges in the displayed line
    for (let i = 0; i < line.disp_length; i++) {
      let vert = this.puzzle.verts[line.path[i]];
      ctx.lineTo(vert.x, vert.y);
    }
    // Interpolate the final, possibly partial segment
    if (line.path.length >= 2 && line.disp_length < line.path.length) {
      let vert1 = this.puzzle.verts[line.path[Math.floor(line.disp_length)]];
      let vert2 = this.puzzle.verts[line.path[Math.ceil(line.disp_length)]];
      let lerp_factor = line.disp_length % 1;
      ctx.lineTo(
        lerp(vert1.x, vert2.x, lerp_factor),
        lerp(vert1.y, vert2.y, lerp_factor),
      );
    }
    // For loops, draw the first line segment twice to avoid a sharp corner at the first vertex
    if (
      line.disp_length > 1 && line.disp_length > line.path.length - 0.01 &&
      line.path[0] === line.path[line.path.length - 1]
    ) {
      let vert = this.puzzle.verts[line.path[1]];
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

  update_ideal_line(interaction: Interaction) {
    // Firstly, get the closest edge intersection to mouse, and flip the vertices if necessary
    let edge_data = this.puzzle.nearest_edge_point_extending_line(
      interaction.local_pos,
      this.line_path,
    );
    let { v1, v2 } = this.puzzle.edges[edge_data.edge_idx];
    let lerp_factor = edge_data.lambda;
    // If needed, reverse the edge so that `v1` is equal the last vertex in `this.line_path`
    let last_vert_in_path = this.line_path[this.line_path.length - 1];
    if (v1 === last_vert_in_path) {
      // No swap required
    } else if (v2 === last_vert_in_path) {
      [v1, v2] = [v2, v1];
      lerp_factor = 1 - lerp_factor; // Switch lerp direction too
    } else {
      // Closest edge is fully disconnected.  This only happens if the user moves their mouse
      // extremely fast, and in that case the line bugs out anyway.  So just don't bother updating
      // the line.
      return;
    }
    console.assert(v1 === last_vert_in_path);

    // Now, build a `LerpedLine` which represents the 'ideal' line - i.e. one which finishes as
    // close as possible to the user's cursor.  We also make sure the path always finishes with the
    // edge that the user is drawing over (even if that makes this path contain one more vertex
    // than `this.line_path`).
    let ideal_line_path = [...this.line_path];
    if (this.line_path.length >= 2 && v2 === this.line_path[this.line_path.length - 2]) {
      // Nothing to do, as the user is already drawing the last edge in the path
    } else {
      // User is drawing off the end of the path (i.e. they're less than half way down a new edge),
      // so add the new vertex so the new final line segment can be lerped.
      ideal_line_path.push(v2);
      lerp_factor = 1 - lerp_factor;
    }
    this.ideal_line = {
      path: ideal_line_path,
      disp_length: ideal_line_path.length - 1 - lerp_factor,
      was_short_line: false,
    };

    // If the line is close to becoming a loop, snap the line to close the loop.
    let path_len = this.ideal_line.path.length;
    // Case 1: Line is slightly too short
    if (
      path_len > 1 && this.ideal_line.path[path_len - 1] === this.ideal_line.path[0] && // Is a loop
      this.ideal_line.disp_length % 1 > 1 - LOOP_CLOSE_SNAP_DISTANCE // Is close enough to vertex
    ) {
      this.ideal_line.disp_length = Math.ceil(this.ideal_line.disp_length);
    }
    // Case 2: Line is slightly too long
    if (
      path_len > 2 && this.ideal_line.path[path_len - 2] === this.ideal_line.path[0] && // Is a loop
      this.ideal_line.disp_length % 1 < LOOP_CLOSE_SNAP_DISTANCE // Is close enough to vertex
    ) {
      this.ideal_line.disp_length = Math.floor(this.ideal_line.disp_length);
      this.ideal_line.path.pop();
      console.assert(this.ideal_line.disp_length === this.ideal_line.path.length - 1);
    }
  }

  update_display_line(time_delta: number): void {
    // Work out where we need to be animating to (this tells us whether to extend or contract the
    // line)
    let common_prefix_length = 0;
    while (
      common_prefix_length < this.ideal_line.path.length &&
      common_prefix_length < this.displayed_line.path.length &&
      this.ideal_line.path[common_prefix_length] === this.displayed_line.path[common_prefix_length]
    ) {
      common_prefix_length++;
    }
    let length_to_animate_to = (common_prefix_length === this.displayed_line.path.length)
      ? this.ideal_line.disp_length
      : common_prefix_length - 1;

    // Decide how fast to render the lines
    let lerp_speed_factor = LINE_LERP_SPEED_FACTOR;
    let min_speed = MIN_LINE_LERP_SPEED;
    let max_speed = Infinity;
    if (common_prefix_length <= 1) {
      lerp_speed_factor = this.is_drawing_line ? 1500 : 1000;
      max_speed = this.is_drawing_line ? 20000 : 10000;
      if (this.ideal_line.was_short_line) {
        lerp_speed_factor = 200;
        min_speed = 50;
      }
    }
    let distance_to_travel = Math.abs(this.displayed_line.disp_length - length_to_animate_to) +
      Math.abs(this.ideal_line.disp_length - length_to_animate_to);
    let speed = Math.min(Math.max(lerp_speed_factor * distance_to_travel, min_speed), max_speed);
    speed /= this.transform().scale;

    // Update length
    if (length_to_animate_to < this.displayed_line.disp_length) {
      this.displayed_line.disp_length = Math.max(
        length_to_animate_to,
        this.displayed_line.disp_length - time_delta * speed,
      );
    } else {
      this.displayed_line.disp_length = Math.min(
        length_to_animate_to,
        this.displayed_line.disp_length + time_delta * speed,
      );
    }

    // Update path so that the `disp_length + 1 <= path.length < disp_length + 2`
    while (this.displayed_line.disp_length + 1 > this.displayed_line.path.length) {
      if (this.displayed_line.path.length === this.ideal_line.path.length) {
        this.displayed_line.disp_length = this.ideal_line.path.length - 1;
      } else {
        this.displayed_line.path.push(this.ideal_line.path[this.displayed_line.path.length]);
      }
    }
    while (this.displayed_line.path.length >= this.displayed_line.disp_length + 2) {
      this.displayed_line.path.pop();
    }
  }

  transform(): Transform {
    return this.transform_tween.get().then(game.camera_transform());
  }

  pip_coords(cell_idx: number, pip_idx: number, num_pips?: number): Vec2 {
    const cell = this.puzzle.cells[cell_idx];
    const pattern_coord = dice_pattern(num_pips || cell.pips)[pip_idx];
    return cell.centre.add(pattern_coord.mul(PIP_PATTERN_RADIUS));
  }

  has_just_become_stashable(): boolean {
    let just_been_stashed = !this.stashable_last_frame && this.is_stashable();
    this.stashable_last_frame = this.is_stashable();
    return just_been_stashed;
  }

  is_stashable(): boolean {
    return this.is_correctly_solved() &&
      // TODO: Add extra factor for other animations
      uneased_anim_factor(this.solution!.time, SOLVE_ANIMATION_TIME) >= 2.0;
  }

  is_correctly_solved(): boolean {
    return this.solution !== undefined && this.solution.is_correct;
  }

  solution_color(): Color {
    return this.is_correctly_solved() ? CORRECT_COLOR : INCORRECT_COLOR;
  }
}

type LerpedLine = {
  path: number[];
  disp_length: number;
  was_short_line: boolean;
};

type Interaction = {
  puzzle_idx: number;
  grid_idx: number;

  local_pos: Vec2;
  vert_idx: number;
  vert_distance: number;
};

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
function dice_pattern(num_pips: number): Vec2[] {
  const pip_pair_patterns = [
    new Vec2(1, -1), // added for 2
    new Vec2(1, 1), //  added for 4
    new Vec2(1, 0), //  added for 6
    new Vec2(0, 1), //  added for 8
    new Vec2(1 / 3, 1 / 3), // added for 10
  ];

  const pip_positions = [];
  // Add pairs of opposite pips for each even-numbered dice patterns
  for (let i = 0; i < (num_pips - 1) / 2; i++) {
    pip_positions.push(pip_pair_patterns[i]);
    pip_positions.push(pip_pair_patterns[i].neg());
  }
  // Add a pip in the centre for odd-numbered dice patterns
  if (num_pips % 2 == 1) pip_positions.push(Vec2.ZERO);

  return pip_positions;
}
