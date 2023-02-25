// A set of puzzle grids which share the same `Puzzle`
class PuzzleSet {
  pos: Vec2;
  grids: Grid[];
  box: PuzzleBox;

  puzzle: Puzzle; // The underlying abstract representation of the puzzle

  constructor(pattern: string, x: number, y: number, num_solutions: number) {
    this.pos = { x, y };
    this.puzzle = new Puzzle(pattern, num_solutions);

    // Compute box and grid scales
    let total_grid_width = (this.puzzle.grid_width + 1) * this.puzzle.num_solutions;
    let total_grid_height = this.puzzle.grid_height + 1;
    let grid_scale = Math.min(
      PUZZLE_BOX_MAX_WIDTH / total_grid_width, // scale to fill width
      PUZZLE_BOX_MAX_HEIGHT / total_grid_height, // scale to fill height
    );
    this.box = {
      width: total_grid_width * grid_scale,
      height: PUZZLE_BOX_MAX_HEIGHT, // Puzzles always take up max height
      grid_scale,
    };

    this.grids = [];
    for (let i = 0; i < this.puzzle.num_solutions; i++) {
      this.grids.push(new Grid(this.puzzle, this.grid_transform(i)));
    }
  }

  grid_transform(soln_number: number): Transform {
    let centre_x = this.pos.x +
      (soln_number - this.puzzle.num_solutions / 2 + 1 / 2) *
        (this.box.width / this.puzzle.num_solutions);
    let centre_y = this.pos.y;
    return new Transform()
      .then_translate(-this.puzzle.grid_width / 2, -this.puzzle.grid_height / 2)
      .then_scale(this.box.grid_scale)
      .then_translate(centre_x, centre_y);
  }

  overall_rect(): Rect {
    let width = this.box.width;
    let height = this.box.height;
    let x = this.pos.x - width / 2;
    let y = this.pos.y - height / 2;
    return { x, y, w: width, h: height };
  }
}

type PuzzleBox = {
  width: number;
  height: number;
  grid_scale: number;
};
