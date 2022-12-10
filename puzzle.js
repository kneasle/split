/* Abstract representations of puzzles */

/// Abstract representation of a `Puzzle`, without any attached lines or solution
class Puzzle {
  constructor(string, num_solutions) {
    this.num_solutions = num_solutions;

    // Parse string into a list of pips in each cell
    let pip_lines = string.split("|");
    this.width = pip_lines[0].length;
    this.height = pip_lines.length;

    // Create vertices
    this.verts = [];
    for (let y = 0; y < this.height + 1; y++) {
      for (let x = 0; x < this.width + 1; x++) {
        this.verts.push({ x, y });
      }
    }
    let vert_idx = (x, y) => y * (this.width + 1) + x;

    this.edges = [];
    // Vertical edges
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width + 1; x++) {
        this.edges.push({ v1: vert_idx(x, y), v2: vert_idx(x, y + 1) });
      }
    }
    // Horizontal edges
    for (let y = 0; y < this.height + 1; y++) {
      for (let x = 0; x < this.width; x++) {
        this.edges.push({ v1: vert_idx(x + 1, y), v2: vert_idx(x, y) });
      }
    }

    // Cells
    this.cells = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
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
          if (new_x < 0 || new_x >= this.width || new_y < 0 || new_y >= this.height) continue;
          let cell_idx = new_y * this.width + new_x;
          // Determine the edge which lies between this cell and its neighbour
          const edge_idx = this.connecting_edge(v1, v2);
          console.assert(edge_idx !== undefined);
          // Add edge
          neighbours.push({ edge_idx, cell_idx });
        }

        this.cells.push({
          verts: [tl, tr, br, bl],
          centre: { x: x + 0.5, y: y + 0.5 },
          pips: parseInt(pip_lines[y][x]) || 0,
          neighbours,
        });
      }
    }
  }

  get_solution(line) {
    console.assert(line[0] === line[line.length - 1]); // Check that line forms a loop
    // Determine which edges are in the line
    let is_edge_in_line = [];
    for (const _ of this.edges) is_edge_in_line.push(false);
    for (let i = 0; i < line.length - 1; i++) {
      const edge_idx = this.connecting_edge(line[i], line[i + 1]);
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
      let pips_in_region = 0;
      let frontier = [region_start_cell];
      while (frontier.length > 0) {
        let next_cell_idx = frontier.pop();
        let next_cell = this.cells[next_cell_idx];
        if (is_cell_in_region[next_cell_idx]) continue; // Cell has already been explored
        // Add cell to this region
        is_cell_in_region[next_cell_idx] = true;
        cells_in_region.push(next_cell_idx);
        pips_in_region += next_cell.pips;
        // Add cell's neighbours to the frontier
        for (const { edge_idx, cell_idx } of next_cell.neighbours) {
          if (is_edge_in_line[edge_idx]) continue; // Can't connect region over line
          frontier.push(cell_idx);
        }
      }
      // Once BFS has fully explored the region, add this region as complete
      regions.push({ pips: pips_in_region, cells: cells_in_region });
    }

    // Use the pip counts to check if the regions actually make a valid solution
    const pip_counts = regions.map((r) => r.pips).filter((pips) => pips > 0);
    const pip_group_size = pip_counts[0];
    const is_correct = pip_counts.length > 1 && pip_counts.every((p) => p == pip_group_size);

    // Package the solution and return
    return { is_correct, pip_group_size, regions };
  }

  // Find the nearest point to `(p_x, p_y)` on any edge in the puzzle
  nearest_edge(p_x, p_y) {
    let nearest = undefined;
    for (let e = 0; e < this.edges.length; e++) {
      let { v1, v2 } = this.edges[e];
      let s_x = this.verts[v1].x;
      let s_y = this.verts[v1].y;
      let d_x = this.verts[v2].x - s_x;
      let d_y = this.verts[v2].y - s_y;
      let d_dot_p_minus_s = d_x * (p_x - s_x) + d_y * (p_y - s_y);
      let d_dot_d = d_x * d_x + d_y * d_y;
      let lambda = d_dot_p_minus_s / d_dot_d;
      lambda = Math.max(0, Math.min(1, lambda)); // Clamp to the line
      // Compute point
      let nearest_x = s_x + lambda * d_x;
      let nearest_y = s_y + lambda * d_y;
      // Compute distance
      let dist_x = p_x - nearest_x;
      let dist_y = p_y - nearest_y;
      let dist = Math.sqrt(dist_x * dist_x + dist_y * dist_y);
      if (nearest === undefined || dist < nearest.distance) {
        nearest = {
          edge_idx: e,
          lambda,
          x: nearest_x,
          y: nearest_y,
          distance: dist,
        };
      }
    }
    return nearest;
  }

  connecting_edge(vert_1, vert_2) {
    for (let i = 0; i < this.edges.length; i++) {
      const { v1, v2 } = this.edges[i];
      if (vert_1 === v1 && vert_2 === v2) return i;
      if (vert_1 === v2 && vert_2 === v1) return i;
    }
    return undefined;
  }
}
