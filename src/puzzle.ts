/* Abstract representations of puzzles */

/// Abstract representation of a `Puzzle`, without any attached lines or solution
class Puzzle {
  verts: Vec2[];
  edges: { v1: number; v2: number }[];
  cells: Cell[];

  total_num_pips: number;
  solutions: number[];
  grid_width: number;
  grid_height: number;

  constructor(pattern: string, solutions: number[]) {
    /* Values used by the rest of the game */
    this.solutions = solutions;

    // Parse string into a list of pips in each cell
    let pip_lines = pattern.split("|");
    let width = pip_lines[0].length;
    let height = pip_lines.length;

    // Create vertices
    this.verts = [];
    for (let y = 0; y < height + 1; y++) {
      for (let x = 0; x < width + 1; x++) {
        this.verts.push(new Vec2(x, y));
      }
    }
    let vert_idx = (x: number, y: number) => y * (width + 1) + x;

    this.edges = [];
    // Vertical edges
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width + 1; x++) {
        this.edges.push({ v1: vert_idx(x, y), v2: vert_idx(x, y + 1) });
      }
    }
    // Horizontal edges
    for (let y = 0; y < height + 1; y++) {
      for (let x = 0; x < width; x++) {
        this.edges.push({ v1: vert_idx(x + 1, y), v2: vert_idx(x, y) });
      }
    }

    // Cells
    this.cells = [];
    this.total_num_pips = 0;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        // Get the vertices surrounding this cell
        const tl = vert_idx(x, y);
        const tr = vert_idx(x + 1, y);
        const br = vert_idx(x + 1, y + 1);
        const bl = vert_idx(x, y + 1);
        // Get the cells which neighbour this one as well as the corresponding edges
        const possible_neighbours = [
          { v1: tl, v2: tr, dx: 0, dy: -1 }, // top
          { v1: tr, v2: br, dx: 1, dy: 0 }, // right
          { v1: br, v2: bl, dx: 0, dy: 1 }, // bottom
          { v1: bl, v2: tl, dx: -1, dy: 0 }, // left
        ];
        const neighbours = [];
        for (const { v1, v2, dx, dy } of possible_neighbours) {
          let new_x = x + dx;
          let new_y = y + dy;
          // Neighbour is only valid if the opposite cell is actually in the grid
          if (new_x < 0 || new_x >= width || new_y < 0 || new_y >= height) continue;
          // Add neighbour
          let cell_idx = new_y * width + new_x;
          const edge_idx = this.connecting_edge(v1, v2)!;
          neighbours.push({ edge_idx, cell_idx });
        }

        let num_pips = parseInt(pip_lines[y][x]) || 0;
        this.total_num_pips += num_pips;
        this.cells.push({
          verts: [tl, tr, br, bl],
          centre: new Vec2(x + 0.5, y + 0.5),
          num_pips,
          neighbours,
        });
      }
    }

    // Check that the solutions look vaguely sane
    let min_pip_count = Infinity;
    let total_pip_count = 0;
    for (const { num_pips } of this.cells) {
      min_pip_count = Math.min(min_pip_count, num_pips);
      total_pip_count += num_pips;
    }
    for (const s of this.solutions) {
      if (total_pip_count % s !== 0) {
        console.warn(
          `Solution ${s} of "${pattern}" doesn't divide the total of ${total_pip_count}`,
        );
      }
      if (s < min_pip_count) {
        console.warn(`Solution ${s} of "${pattern}" is smaller than the min pip count`);
      }
    }

    // Find the bbox of the puzzle
    let min = new Vec2(Infinity, Infinity);
    let max = new Vec2(-Infinity, -Infinity);
    for (const v of this.verts) {
      min = Vec2.min(min, v);
      max = Vec2.max(max, v);
    }
    let rect_centre = Vec2.lerp(min, max, 0.5);

    // Translate puzzle so the centre of the bounding box is at (0, 0)
    for (let v = 0; v < this.verts.length; v++) {
      this.verts[v] = this.verts[v].sub(rect_centre);
    }
    for (const c of this.cells) {
      c.centre = c.centre.sub(rect_centre);
    }
    // Store width and height of this puzzle's bounding box
    this.grid_width = max.x - min.x;
    this.grid_height = max.y - min.y;
  }

  get_solution(line: number[]): Solution {
    console.assert(line[0] === line[line.length - 1]); // Check that line forms a loop
    // Determine which edges are in the line
    let is_edge_in_line = [];
    for (const _ of this.edges) is_edge_in_line.push(false);
    for (let i = 0; i < line.length - 1; i++) {
      const edge_idx = this.connecting_edge(line[i], line[i + 1])!;
      is_edge_in_line[edge_idx] = true;
    }

    // Use the line to split the cells into regions (i.e. strongly connected components of the
    // (dual of the) cell graph where edges under the line are removed)
    let is_cell_in_region = [];
    for (const _ of this.cells) is_cell_in_region.push(false);
    let regions = [];
    while (true) {
      // Find a cell which isn't yet in a region
      let region_start_cell = undefined;
      for (let i = 0; i < this.cells.length; i++) {
        if (!is_cell_in_region[i]) {
          region_start_cell = i;
          break;
        }
      }
      // If no such cell exists, all cells are in regions and we're done
      if (region_start_cell === undefined) break;
      // Take this new cell and explore its entire region using DFS
      let cells_in_region = [];
      let num_pips_in_region = 0;
      let frontier = [region_start_cell];
      while (frontier.length > 0) {
        let next_cell_idx = frontier.pop()!;
        let next_cell = this.cells[next_cell_idx];
        if (is_cell_in_region[next_cell_idx]) continue; // Cell has already been explored
        // Add cell to this region
        is_cell_in_region[next_cell_idx] = true;
        cells_in_region.push(next_cell_idx);
        num_pips_in_region += next_cell.num_pips;
        // Add cell's neighbours to the frontier
        for (const { edge_idx, cell_idx } of next_cell.neighbours) {
          if (is_edge_in_line[edge_idx]) continue; // Can't connect region over line
          frontier.push(cell_idx);
        }
      }
      // Once BFS has fully explored the region, add this region as complete
      regions.push({ num_pips: num_pips_in_region, cells: cells_in_region });
    }

    // Use the pip counts to check if the regions actually make a valid solution
    const pip_counts = regions.map((r) => r.num_pips).filter((pips) => pips > 0);
    const pip_group_size = pip_counts[0];
    const is_correct = pip_counts.length > 1 && pip_counts.every((p) => p == pip_group_size);

    // Package the solution and return
    return { is_correct, pip_group_size, regions };
  }

  // Find the nearest point to `(p_x, p_y)` on any edge in the puzzle, *excluding* those already on
  // the given `line`.
  nearest_edge_point_extending_line(p: Vec2, line: number[]): NearestEdge {
    let nearest = undefined;
    for (let edge_idx = 0; edge_idx < this.edges.length; edge_idx++) {
      let { v1, v2 } = this.edges[edge_idx];

      // Test if this edge is extending the line but not already on it
      let is_extending_line = line.length === 0 ||
        v1 === line[line.length - 1] ||
        v2 === line[line.length - 1];
      let is_on_line = false;
      for (let i = 0; i < line.length - 2; i++) {
        if (
          (line[i] === v1 && line[i + 1] === v2) ||
          (line[i] === v2 && line[i + 1] === v1)
        ) {
          is_on_line = true;
          break;
        }
      }
      if (is_on_line || !is_extending_line) {
        continue;
      }

      // If this edge is a valid extension/contraction of the line, then it is a candidate for
      // being the closest edge to the point.

      // Find nearest point on line
      let s = this.verts[v1];
      let d = this.verts[v2].sub(s);
      let d_dot_p_minus_s = d.dot(p.sub(s));
      let lambda = d_dot_p_minus_s / d.square_length();
      lambda = Math.max(0, Math.min(1, lambda)); // Clamp to the line
      let nearest_point = s.add(d.mul(lambda));
      // Compute distance
      let distance = p.sub(nearest_point).length();
      if (nearest === undefined || distance < nearest.distance) {
        nearest = {
          edge_idx,
          lambda,
          point: nearest_point,
          distance,
        };
      }
    }
    return nearest!;
  }

  nearest_vertex(point: Vec2): NearestVert {
    let nearest_vert = undefined;

    for (let vert_idx = 0; vert_idx < this.verts.length; vert_idx++) {
      let { x: vert_x, y: vert_y } = this.verts[vert_idx];
      let dX = point.x - vert_x;
      let dY = point.y - vert_y;
      let distance = Math.sqrt(dX * dX + dY * dY);
      // ... if this is the new closest vertex, update the interaction
      if (nearest_vert === undefined || distance < nearest_vert.distance) {
        nearest_vert = { point, vert_idx, distance };
      }
    }

    return nearest_vert!; // This is only 'undefined' if puzzle has no vertices
  }

  connecting_edge(vert_1: number, vert_2: number): number | undefined {
    for (let i = 0; i < this.edges.length; i++) {
      const { v1, v2 } = this.edges[i];
      if (vert_1 === v1 && vert_2 === v2) return i;
      if (vert_1 === v2 && vert_2 === v1) return i;
    }
    return undefined;
  }
}

type Cell = {
  verts: number[];
  centre: Vec2;
  num_pips: number;
  neighbours: { edge_idx: number; cell_idx: number }[];
};

type Solution = {
  is_correct: boolean;
  pip_group_size: number;
  regions: Region[];
};

type Region = { num_pips: number; cells: number[] };

type NearestEdge = {
  edge_idx: number;
  lambda: number;
  point: Vec2;
  distance: number;
};

type NearestVert = {
  point: Vec2;
  vert_idx: number;
  distance: number;
};
