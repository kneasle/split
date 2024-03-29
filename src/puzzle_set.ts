// A set of puzzle grids which share the same `Puzzle`
class PuzzleSet {
  private unscaled_rect: Rect;
  private grid_scale: number;
  private hover_tween: HoverTween;

  overlay_grid: OverlayGrid;

  puzzle: Puzzle; // The underlying abstract representation of the puzzle

  constructor(pattern: string, x: number, y: number, solutions: number[]) {
    this.puzzle = new Puzzle(pattern, solutions);
    this.hover_tween = new HoverTween(PUZZLE_HOVER_POP_AMOUNT);

    // Compute box and grid scales
    let total_grid_width = (this.puzzle.grid_bbox.width() + 1) * this.puzzle.solutions.length;
    let total_grid_height = this.puzzle.grid_bbox.height() + 1;
    this.grid_scale = Math.min(
      PUZZLE_BOX_MAX_WIDTH / total_grid_width, // scale to fill width
      PUZZLE_BOX_MAX_HEIGHT / total_grid_height, // scale to fill height
    );

    this.unscaled_rect = Rect.with_centre(
      new Vec2(x, y),
      new Vec2(total_grid_width * this.grid_scale, PUZZLE_BOX_MAX_HEIGHT),
    );

    this.overlay_grid = new OverlayGrid(this.puzzle);
  }

  grid_transform(soln_number: number): Transform {
    let centre_x = (soln_number - this.puzzle.solutions.length / 2 + 1 / 2) *
      (this.unscaled_rect.width() / this.puzzle.solutions.length);

    return new Transform()
      .then_scale(this.grid_scale)
      .then_translate(Vec2.RIGHT.mul(centre_x))
      .then_scale(this.hover_tween.scale_factor())
      .then_translate(this.unscaled_rect.centre());
  }

  overall_rect(): Rect {
    return this.unscaled_rect.scale_about_centre(this.hover_tween.scale_factor());
  }

  set_hovered(hovered: boolean): void {
    this.hover_tween.set_hovered(hovered);
  }
}
