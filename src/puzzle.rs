use std::{
    collections::HashSet,
    iter::Sum,
    ops::{Add, AddAssign},
};

use bevy::{
    math::{UVec2, Vec2}, // TODO: Depend directly on glam if we split crates?
    prelude::Component,
};

use itertools::Itertools;

/// A `Puzzle` grid, with no associated solution
#[derive(Debug, Clone, Component)] // TODO: Not `Component`?
pub struct Puzzle {
    pub verts: VertVec<Vec2>,
    pub edges: EdgeVec<(VertIdx, VertIdx)>,
    pub cells: CellVec<Cell>,

    pub square_size: UVec2,
}

/// A `Cell` into which [`Pip`]s can be added
#[derive(Debug, Clone)]
pub struct Cell {
    pub verts: Vec<VertIdx>, // Going clockwise
    pub neighbours: Vec<(EdgeIdx, CellIdx)>,
    pub pips: Pips,
}

/// A (possibly incorrect) attempt to solve a [`Puzzle`]
#[derive(Debug, Clone)]
pub struct Solution {
    pub line: HashSet<EdgeIdx>,
    pub regions: Vec<(Vec<CellIdx>, Pips)>,
    pub pip_count: Option<Pips>,
}

impl Puzzle {
    /// Load a puzzle from a string.  The index of the first '|' indicates the width, and every
    /// other character represents a cell.  All lines are expected to be delimited by '|'s.
    ///
    /// For example, `" 2 |1 1|212"` generates a grid like:
    /// ```text
    /// +   +   +   +
    ///       2
    /// +   +   +   +
    ///   1       1
    /// +   +   +   +
    ///   2   1   2
    /// +   +   +   +
    /// ```
    // TODO: Don't panic on invalid input
    pub fn from_single_line(line: &str) -> Self {
        let rows = line.split("|").collect_vec();
        let width = rows[0].len();
        let height = rows.len();
        assert!(rows.iter().all(|r| r.len() == width)); // Check all rows have same lengths

        // Read pip counts
        let mut pips_in_each_cell = Vec::new();
        for row in rows {
            for cell_char in row.chars() {
                match cell_char {
                    '0'..='9' => pips_in_each_cell.push(Pips(cell_char as usize - '0' as usize)),
                    ' ' => pips_in_each_cell.push(Pips(0)),
                    c => panic!("Unknown char '{c}'"),
                };
            }
        }
        assert_eq!(pips_in_each_cell.len(), width * height);

        Self::rectangular(width, height, pips_in_each_cell)
    }

    /// Make a new `Puzzle` of a rectangular grid of the given size
    fn rectangular(width: usize, height: usize, pips: impl IntoIterator<Item = Pips>) -> Self {
        let mut pip_iter = pips.into_iter();

        // Converters for coords => indices
        let get_vert_idx = |x: usize, y: usize| VertIdx::new(y * (width + 1) + x);
        let cell_idx = |x: usize, y: usize| CellIdx::new(y * width + x);

        // Create vertices
        let mut verts = VertVec::new();
        for y in 0..height + 1 {
            for x in 0..width + 1 {
                verts.push(Vec2::new(x as f32, (height - y) as f32));
            }
        }
        // Create edges
        let mut edges = EdgeVec::new();
        for y in 0..height {
            for x in 0..width + 1 {
                edges.push((get_vert_idx(x, y), get_vert_idx(x, y + 1))); // Vertical
            }
        }
        for y in 0..height + 1 {
            for x in 0..width {
                edges.push((get_vert_idx(x, y), get_vert_idx(x + 1, y))); // Horizontal
            }
        }
        let get_edge_idx_between = |v1: VertIdx, v2: VertIdx| {
            EdgeIdx::new(
                edges
                    .iter()
                    .position(|verts| *verts == (v1, v2) || *verts == (v2, v1))
                    .unwrap(),
            )
        };
        // Create cells
        let mut cells = CellVec::new();
        for y in 0..height {
            for x in 0..width {
                let tl = get_vert_idx(x, y);
                let tr = get_vert_idx(x + 1, y);
                let br = get_vert_idx(x + 1, y + 1);
                let bl = get_vert_idx(x, y + 1);
                // Compute cell neighbours
                let mut neighbours = Vec::new();
                for (v1, v2, dx, dy) in [
                    (tl, tr, 0, -1),
                    (tr, br, 1, 0),
                    (br, bl, 0, 1),
                    (bl, tl, -1, 0),
                ] {
                    // Test if the cell over this edge is actually in the puzzle
                    let neighbour_x = x as isize + dx;
                    let neighbour_y = y as isize + dy;
                    if (0..width as isize).contains(&neighbour_x)
                        && (0..height as isize).contains(&neighbour_y)
                    {
                        neighbours.push((
                            get_edge_idx_between(v1, v2),
                            cell_idx(neighbour_x as usize, neighbour_y as usize),
                        ));
                    }
                }
                // Build cell
                cells.push(Cell {
                    verts: vec![tl, tr, br, bl],
                    neighbours,
                    pips: pip_iter.next().unwrap(),
                });
            }
        }

        Puzzle {
            verts,
            edges,
            cells,

            square_size: UVec2::new(width as u32, height as u32),
        }
    }

    /// Get the [`Solution`] defined by the given `line`.
    pub fn solution(&self, line: HashSet<EdgeIdx>) -> Solution {
        let regions = self.regions(&line);
        let pip_count = self.solution_number(&regions);
        Solution {
            line,
            regions,
            pip_count,
        }
    }

    /// Divide the cells into regions who's borders are the given `line`.
    fn regions(&self, line: &HashSet<EdgeIdx>) -> Vec<(Vec<CellIdx>, Pips)> {
        let mut regions = Vec::new();

        let mut regionless_cells: HashSet<CellIdx> =
            (0..self.cells.len()).map(CellIdx::new).collect();
        // Repeatedly find cells that aren't already in a region ...
        while let Some(region_starting_cell) = regionless_cells.iter().next().copied() {
            let mut cells_in_region = Vec::new();
            let mut total_pips = Pips::ZERO;
            // ... and run BFS starting from the `region_starting_cell`
            let mut frontier = vec![region_starting_cell];
            while let Some(cell_idx) = frontier.pop() {
                let is_cell_new = regionless_cells.remove(&cell_idx);
                if is_cell_new {
                    // Add cell to this region
                    cells_in_region.push(cell_idx);
                    total_pips += self.cells[cell_idx].pips;
                    // Add this cell's neighbours to the frontier
                    for (edge, neighbour) in &self.cells[cell_idx].neighbours {
                        if !line.contains(edge) {
                            frontier.push(*neighbour);
                        }
                    }
                }
            }
            regions.push((cells_in_region, total_pips));
        }
        regions
    }

    /// If the puzzle is correctly solved, return `Some(p)` so that every region contains either
    /// 0 or `p` pips.  If the puzzle isn't correctly solved, return `None`.
    fn solution_number(&self, regions: &[(Vec<CellIdx>, Pips)]) -> Option<Pips> {
        let mut non_zero_pip_counts = regions
            .iter()
            .map(|(_, pips)| *pips)
            .filter(|pips| *pips > Pips::ZERO);
        let first_count = non_zero_pip_counts.next().unwrap_or(Pips::ZERO);
        for pip_count in non_zero_pip_counts {
            if pip_count != first_count {
                return None; // Some region had a different pip count to the others
            }
        }
        Some(first_count) // If all non-zero regions have the same count, the puzzle is solved
    }

    /// Prints a picture of the given `line` running through this `Puzzle`.
    // TODO: Make this not upside-down
    pub fn print_line(&self, line: &HashSet<EdgeIdx>) {
        let width = self.square_size.x as usize;
        let height = self.square_size.y as usize;
        let num_horizontal_edges = width * (height + 1);
        let num_vertical_edges = (width + 1) * height;

        let mut pips_iter = self.cells.iter().map(|cell| cell.pips.0);
        let mut vertical_edges = (0..num_vertical_edges).map(EdgeIdx::new);
        let mut horizontal_edges =
            (0..num_horizontal_edges).map(|i| EdgeIdx::new(i + num_vertical_edges));

        for y in 0..height + 1 {
            // Print line of horizontal edges
            for _ in 0..width {
                print!("+");
                match line.contains(&horizontal_edges.next().unwrap()) {
                    true => print!("---"),
                    false => print!("   "),
                }
            }
            println!("+");
            // Print line of vertical edges and each cell's pip count
            let mut next_vertical_edge_char = || -> char {
                match line.contains(&vertical_edges.next().unwrap()) {
                    true => '|',
                    false => ' ',
                }
            };
            if y < height {
                for _ in 0..width {
                    print!("{} ", next_vertical_edge_char());
                    match pips_iter.next().unwrap() {
                        0 => print!("  "),
                        num_pips => print!("{num_pips} "),
                    }
                }
                println!("{}", next_vertical_edge_char());
            }
        }
    }
}

/// Number of 'dice' pips in some region (usually a cell)
#[derive(Debug, Clone, Copy, PartialOrd, Ord, PartialEq, Eq, Hash)]
pub struct Pips(pub usize);

impl Pips {
    pub const ZERO: Self = Pips(0);
}

impl Add for Pips {
    type Output = Self;

    fn add(self, rhs: Self) -> Self::Output {
        Self(self.0 + rhs.0)
    }
}

impl AddAssign for Pips {
    fn add_assign(&mut self, rhs: Self) {
        self.0 += rhs.0;
    }
}

impl Sum for Pips {
    fn sum<I: Iterator<Item = Self>>(iter: I) -> Self {
        let mut total = Self::ZERO;
        for p in iter {
            total += p;
        }
        total
    }
}

index_vec::define_index_type! { pub struct VertIdx = usize; }
index_vec::define_index_type! { pub struct EdgeIdx = usize; }
index_vec::define_index_type! { pub struct CellIdx = usize; }
pub type VertVec<T> = index_vec::IndexVec<VertIdx, T>;
pub type EdgeVec<T> = index_vec::IndexVec<EdgeIdx, T>;
pub type CellVec<T> = index_vec::IndexVec<CellIdx, T>;
