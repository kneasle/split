// A set of puzzle grids which share the same `Puzzle`
class PuzzleSet {
  pos: Vec2;
  private width: number;
  private height: number;
  private grid_scale: number;
  private hover_tween: BoolTween; // Used to 'pop' the puzzle under the cursor
  private hover_bounce_start_time: number;

  grids: Grid[];
  overlay_grid: Grid;

  puzzle: Puzzle; // The underlying abstract representation of the puzzle

  constructor(pattern: string, x: number, y: number, num_solutions: number) {
    this.pos = new Vec2(x, y);
    this.puzzle = new Puzzle(pattern, num_solutions);
    this.hover_tween = new BoolTween(false, HOVER_POP_TIME);
    this.hover_bounce_start_time = Date.now();

    // Compute box and grid scales
    let total_grid_width = (this.puzzle.grid_width + 1) * this.puzzle.num_solutions;
    let total_grid_height = this.puzzle.grid_height + 1;
    let grid_scale = Math.min(
      PUZZLE_BOX_MAX_WIDTH / total_grid_width, // scale to fill width
      PUZZLE_BOX_MAX_HEIGHT / total_grid_height, // scale to fill height
    );

    this.width = total_grid_width * grid_scale;
    this.height = PUZZLE_BOX_MAX_HEIGHT; // Puzzles always take up max height
    this.grid_scale = grid_scale;

    this.grids = [];
    for (let i = 0; i < this.puzzle.num_solutions; i++) {
      this.grids.push(new Grid(this.puzzle));
    }
    this.overlay_grid = new Grid(this.puzzle);
  }

  grid_transform(soln_number: number): Transform {
    let centre_x = (soln_number - this.puzzle.num_solutions / 2 + 1 / 2) *
      (this.width / this.puzzle.num_solutions);

    return new Transform()
      .then_scale(this.grid_scale)
      .then_translate(Vec2.RIGHT.mul(centre_x))
      .then_scale(this.scale_factor())
      .then_translate(this.pos);
  }

  overall_rect(): Rect {
    let width = this.width * this.scale_factor();
    let height = this.height * this.scale_factor();
    let x = this.pos.x - width / 2;
    let y = this.pos.y - height / 2;
    return { x, y, w: width, h: height };
  }

  set_hovered(hovered: boolean): void {
    if (hovered && this.hover_tween.factor() === 0.0) {
      // If we're starting a hover, then reset the bounce time
      this.hover_bounce_start_time = Date.now();
    }
    this.hover_tween.animate_to(hovered);
  }

  scale_factor(): number {
    let bounce = Math.cos(
      (Date.now() - this.hover_bounce_start_time) / (1000 * HOVER_POP_VARIATION_TIME) * Math.PI * 2,
    ) * HOVER_POP_VARIATION_AMOUNT;
    return lerp(1, HOVER_POP_AMOUNT + bounce, this.hover_tween.factor());
  }
}
