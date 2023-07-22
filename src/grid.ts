class SolvedGrid {
  puzzle_set: PuzzleSet;
  transform_tween: Tween<SolvedGridTransform>;

  solvedness: BoolTween;
  pip_idxs_per_cell_solved: number[][];
  solution_line: number[];
  pip_group_size: number;

  constructor(
    puzzle_set: PuzzleSet,
    start_transform: SolvedGridTransform,
    target_transform?: SolvedGridTransform,
  ) {
    this.puzzle_set = puzzle_set;
    this.transform_tween = new Tween<SolvedGridTransform>(
      start_transform,
      GRID_MOVE_ANIMATION_TIME,
      (a, b, t) => t === 0 ? a : b,
    );
    if (target_transform) this.transform_tween.animate_to(target_transform);

    this.solvedness = new BoolTween(true, SOLVE_ANIMATION_TIME);
    let grid = puzzle_set.overlay_grid;
    this.pip_idxs_per_cell_solved = grid.solution!.pip_idxs_per_cell;
    this.solution_line = grid.line_path;
    this.pip_group_size = grid.solution!.inner.pip_group_size;
  }

  update(mouse: MouseUpdate, transform: Transform): void {
    let expanded_bbox = this.puzzle_set.puzzle.grid_bbox.expand(SOLVED_GRID_HOVER_BORDER);
    let is_hovered = transform.transform_rect(expanded_bbox).contains(mouse.pos);
    this.solvedness.animate_to(is_hovered);
  }

  draw(transform: Transform): void {
    const line = {
      was_short_line: false,
      disp_length: this.solution_line.length - 1, // - 1 because first/last vertices are the same
      path: this.solution_line,
    };
    const solution = {
      is_correct: true,
      pip_idxs_per_cell: this.pip_idxs_per_cell_solved,
    };
    draw_grid(
      transform,
      this.puzzle_set.puzzle,
      DEFAULT_COLOR_SET,
      [line],
      solution,
      this.solvedness,
    );
  }

  is_animating_out_of_overlay(): boolean {
    return this.transform_tween.source === "overlay" &&
      this.transform_tween.uneased_anim_factor() < 1;
  }

  is_fully_faded(): boolean {
    return this.transform_tween.target !== "overlay" &&
      this.transform_tween.target.scale_factor === 0 &&
      this.transform_tween.uneased_anim_factor() >= 1;
  }
}

type SolvedGridTransform = "overlay" | { grid_idx: number; scale_factor: number };

class OverlayGrid {
  puzzle: Puzzle;

  solution: FullSolution | undefined;
  solvedness: BoolTween;
  stashable_last_frame: boolean;

  is_drawing_line: boolean;
  line_path: number[];
  ideal_line: LerpedLine;
  displayed_line: LerpedLine;

  constructor(puzzle: Puzzle) {
    this.puzzle = puzzle;

    // For every `Grid`, `solution` is always in one of three states:
    // 1) `this.solution === undefined`: no solution is on the grid; the puzzle is unsolved
    // 2) `this.solution.is_valid === true`: the solution is valid
    // 3) `this.solution.is_valid === false`: the solution is invalid
    this.solution = undefined;
    this.solvedness = new BoolTween(false, SOLVE_ANIMATION_TIME);
    this.stashable_last_frame = false;

    this.is_drawing_line = false;
    this.line_path = []; // List of vertex indices which make up the line being drawn
    this.ideal_line = { path: [], disp_length: 0, was_short_line: false };
    this.displayed_line = { path: [], disp_length: 0, was_short_line: false };
  }

  update(time_delta: number, mouse: MouseUpdate, transform: Transform): void {
    mouse = transform_mouse_update(mouse, transform.inv());

    if (mouse.button_clicked) this.on_mouse_down(mouse.pos);
    if (mouse.button_released) this.on_mouse_up();
    this.handle_mouse_move(mouse);

    if (this.is_drawing_line) {
      this.update_ideal_line(mouse.pos);
    }
    this.update_display_line(time_delta, transform.scale);
  }

  draw(transform: Transform): void {
    let solution = undefined;
    if (this.solution) {
      solution = {
        is_correct: this.solution.inner.is_correct,
        pip_idxs_per_cell: this.solution.pip_idxs_per_cell,
      };
    }
    draw_grid(
      transform,
      this.puzzle,
      DEFAULT_COLOR_SET,
      [this.displayed_line],
      solution,
      this.solvedness,
    );
  }

  /* ===== MOUSE HANDLING ===== */

  on_mouse_down(local_mouse_pos: Vec2): boolean {
    let nearestVert = this.puzzle.nearest_vertex(local_mouse_pos);

    if (nearestVert.distance < VERTEX_INTERACTION_RADIUS) {
      // Mouse is close enough to a vertex to start a line
      this.line_path = [nearestVert.vert_idx];
      this.is_drawing_line = true;
    } else if (
      local_mouse_pos.x >= 0 && local_mouse_pos.x <= this.puzzle.grid_bbox.width() &&
      local_mouse_pos.y >= 0 && local_mouse_pos.y <= this.puzzle.grid_bbox.height()
    ) {
      this.line_path = []; // Mouse is on the grid but can't start a line
    } else {
      return false; // Mouse is fully off the grid, so don't register the click
    }

    // If the grid was clicked, remove current solution
    this.solvedness.animate_to(false);

    // Reset ideal line
    this.ideal_line = { path: [...this.line_path], disp_length: 0, was_short_line: false };
    return true;
  }

  handle_mouse_move(mouse: MouseUpdate): void {
    if (!this.is_drawing_line) return; // Mouse moves don't matter if we're not drawing a line

    let new_vert = this.puzzle.nearest_vertex(mouse.pos).vert_idx;
    let last_vert = this.line_path[this.line_path.length - 1];
    let penultimate_vert = this.line_path[this.line_path.length - 2];

    if (this.line_path.length == 0) return; // No line is being drawn
    if (!mouse.button_down) return; // User is not dragging
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
    let solution = this.puzzle.get_solution(this.line_path);
    this.solvedness.animate_to(true);

    // Decide where to move the pips
    let pip_idxs_per_cell: number[][] = this.puzzle.cells.map((_) => []);
    for (const region of solution.regions) {
      if (region.num_pips === 0) continue;
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
      let pip_idxs_in_region = region.cells.flatMap((idx) => this.puzzle.pip_idxs_per_cell[idx]);
      for (const cell_idx of cells_to_add_pips_to) {
        // Reserve up to 10 pips to go in this cell
        const num_pips_in_cell = Math.min(pip_idxs_in_region.length, 10);
        const pip_idxs_in_cell = pip_idxs_in_region.slice(0, num_pips_in_cell);
        pip_idxs_in_region = pip_idxs_in_region.slice(num_pips_in_cell);
        // Animate them to their new positions
        // TODO: Don't move pips which exist in both the solved and unsolved puzzles
        for (let p = 0; p < num_pips_in_cell; p++) {
          pip_idxs_per_cell[cell_idx].push(pip_idxs_in_cell[p]);
        }
      }
    }

    this.solution = {
      time: Date.now(),
      inner: solution,
      pip_idxs_per_cell,
    };
  }

  /* ===== LINE HANDLING ===== */

  update_ideal_line(local_mouse_pos: Vec2) {
    // Firstly, get the closest edge intersection to mouse, and flip the vertices if necessary
    let edge_data = this.puzzle.nearest_edge_point_extending_line(local_mouse_pos, this.line_path);
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

  update_display_line(time_delta: number, grid_scale: number): void {
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
    speed /= grid_scale;

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

  /* ===== PIP POSITIONING ===== */

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

    // Find the lines of symmetry (if they exists)
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
          return false; // Cell has no reflection, so this is not a line of symmetry
        }
      }
      return true;
    });

    return { centroid, symmetry_line_directions };
  }

  /* ===== HELPERS ===== */

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
    return this.solution !== undefined && this.solution.inner.is_correct;
  }

  solution_color(): Color {
    return this.is_correctly_solved() ? CORRECT_COLOR : INCORRECT_COLOR;
  }
}

function draw_grid(
  transform: Transform,
  puzzle: Puzzle,
  color_set: ColorSet,
  lines: LerpedLine[],
  solution: { is_correct: boolean; pip_idxs_per_cell: number[][] } | undefined,
  solvedness: BoolTween,
): void {
  // Occlusion cull grids which are off the screen
  let rect = transform.transform_rect(puzzle.grid_bbox);
  let screen_rect = new Rect(Vec2.ZERO, new Vec2(canvas.width, canvas.height));
  if (!screen_rect.expand(100).overlaps_with(rect)) {
    return;
  }

  let color_lerped_with_solution = (color: Color) => {
    let is_correct = solution && solution.is_correct;
    return Color.lerp(color, is_correct ? CORRECT_COLOR : INCORRECT_COLOR, solvedness.factor())
      .to_canvas_color();
  };

  // Update canvas's transformation matrix to the puzzle's local space
  ctx.save();
  transform.apply_to_canvas(ctx);

  // Cell
  ctx.fillStyle = color_set.cell_color.to_canvas_color();
  for (const c of puzzle.cells) {
    ctx.beginPath();
    for (const v of c.verts) {
      ctx.lineTo(puzzle.verts[v].x, puzzle.verts[v].y);
    }
    ctx.fill();
  }

  // Edges
  ctx.lineWidth = EDGE_WIDTH;
  ctx.strokeStyle = color_set.grid_color.to_canvas_color();
  for (const e of puzzle.edges) {
    let v1 = puzzle.verts[e.v1];
    let v2 = puzzle.verts[e.v2];
    ctx.beginPath();
    ctx.moveTo(v1.x, v1.y);
    ctx.lineTo(v2.x, v2.y);
    ctx.stroke();
  }

  // Vertices
  ctx.fillStyle = color_set.grid_color.to_canvas_color();
  for (let v_idx = 0; v_idx < puzzle.verts.length; v_idx++) {
    const { x, y } = puzzle.verts[v_idx];
    ctx.fillRect(x - VERTEX_SIZE / 2, y - VERTEX_SIZE / 2, VERTEX_SIZE, VERTEX_SIZE);
  }

  // Line
  ctx.lineWidth = EDGE_WIDTH;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const line of lines) {
    ctx.strokeStyle = color_lerped_with_solution(LINE_COLOR);
    ctx.beginPath();
    // Draw all full edges in the displayed line
    for (let i = 0; i < line.disp_length; i++) {
      let vert = puzzle.verts[line.path[i]];
      ctx.lineTo(vert.x, vert.y);
    }
    // Interpolate the final, possibly partial segment
    if (line.path.length >= 2 && line.disp_length < line.path.length) {
      let vert1 = puzzle.verts[line.path[Math.floor(line.disp_length)]];
      let vert2 = puzzle.verts[line.path[Math.ceil(line.disp_length)]];
      let lerp_factor = line.disp_length % 1;
      ctx.lineTo(
        lerp(vert1.x, vert2.x, lerp_factor),
        lerp(vert1.y, vert2.y, lerp_factor),
      );
    }
    const is_loop = line.disp_length > 1 &&
      line.disp_length > line.path.length - 1.01 &&
      line.path[0] === line.path[line.path.length - 1];
    // For loops, draw the first line segment twice to avoid a sharp corner at the first vertex
    if (is_loop) {
      let vert = puzzle.verts[line.path[1]];
      ctx.lineTo(vert.x, vert.y);
    }
    ctx.stroke();
    // Draw the first vertex for non-loops
    if (!is_loop && line.path.length > 0) {
      const { x, y } = puzzle.verts[line.path[0]];
      ctx.fillStyle = color_lerped_with_solution(LINE_COLOR);
      ctx.fillRect(x - VERTEX_SIZE / 2, y - VERTEX_SIZE / 2, VERTEX_SIZE, VERTEX_SIZE);
    }
  }

  // Determine pip coords (including solve animations)
  let num_pips = puzzle.total_num_pips;
  let pip_coords = all_pip_coords(puzzle);
  if (solution !== undefined) {
    let solved_pip_coords = all_pip_coords(puzzle, solution.pip_idxs_per_cell);
    for (let i = 0; i < num_pips; i++) {
      // Lerp all the pips
      let factor = solvedness.staggered_factor(i, num_pips, PIP_ANIMATION_SPREAD);
      pip_coords[i] = Vec2.lerp(pip_coords[i], solved_pip_coords[i], factor);
    }
  }
  // Draw these pips
  ctx.fillStyle = color_lerped_with_solution(color_set.pip_color);
  for (const { x, y } of pip_coords) {
    ctx.fillRect(x - PIP_SIZE / 2, y - PIP_SIZE / 2, PIP_SIZE, PIP_SIZE);
  }

  ctx.restore();
}

type ColorSet = {
  cell_color: Color;
  grid_color: Color;
  pip_color: Color;
};

const DEFAULT_COLOR_SET: ColorSet = {
  cell_color: CELL_COLOR,
  grid_color: GRID_COLOR,
  pip_color: PIP_COLOR,
};

function all_pip_coords(puzzle: Puzzle, pip_idxs_per_cell?: number[][]): Vec2[] {
  pip_idxs_per_cell ||= puzzle.pip_idxs_per_cell;

  let all_pip_coords = [];
  for (let i = 0; i < puzzle.total_num_pips; i++) all_pip_coords.push(Vec2.ZERO);

  for (let c = 0; c < puzzle.cells.length; c++) {
    let pip_idxs = pip_idxs_per_cell[c];
    for (let p = 0; p < pip_idxs.length; p++) {
      all_pip_coords[pip_idxs[p]] = pip_coords(puzzle, c, p, pip_idxs.length);
    }
  }
  return all_pip_coords;
}

function pip_coords(puzzle: Puzzle, cell_idx: number, pip_idx: number, num_pips: number): Vec2 {
  const cell = puzzle.cells[cell_idx];
  const pattern_coord = dice_pattern(num_pips)[pip_idx];
  return cell.centre.add(pattern_coord.mul(PIP_PATTERN_RADIUS));
}

type LerpedLine = {
  path: number[];
  disp_length: number;
  was_short_line: boolean;
};

type MousePos = {
  local_pos: Vec2;
  vert_idx: number;
  vert_distance: number;
};

type FullSolution = {
  time: number;
  inner: Solution;
  pip_idxs_per_cell: number[][];
};

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
