use std::{
    collections::HashSet,
    iter::Sum,
    ops::{Add, AddAssign},
};

use itertools::Itertools;

use crate::shape::{CellIdx, CellVec, EdgeIdx, Shape};

/// A `Puzzle` grid, with no associated solution
#[derive(Debug, Clone)]
pub struct Puzzle {
    pub shape: Shape,
    pub pips_in_each_cell: CellVec<Pips>, // How many pips are in each cell
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
    // TODO: Don't panic
    pub fn from_single_line(line: &str) -> Self {
        let rows = line.split("|").collect_vec();
        let width = rows[0].len();
        let height = rows.len();
        assert!(rows.iter().all(|r| r.len() == width)); // Check all rows have same lengths

        // Read pip counts
        let mut pips_in_each_cell = CellVec::new();
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

        let shape = Shape::rectangular(width, height);
        Puzzle {
            shape,
            pips_in_each_cell,
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
            (0..self.shape.cells.len()).map(CellIdx::new).collect();
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
                    total_pips += self.pips_in_each_cell[cell_idx];
                    // Add this cell's neighbours to the frontier
                    for (edge, neighbour) in &self.shape.cells[cell_idx].neighbours {
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
    pub fn print_line(&self, line: &HashSet<EdgeIdx>) {
        let width = self.shape.square_size.x as usize;
        let height = self.shape.square_size.y as usize;
        let num_horizontal_edges = width * (height + 1);
        let num_vertical_edges = (width + 1) * height;

        let mut pips_iter = self.pips_in_each_cell.iter().map(|pips| pips.0);
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
