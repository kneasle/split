use std::{
    collections::HashSet,
    ops::{Add, AddAssign},
};

use crate::shape::{CellVec, EdgeIdx, Shape};

/// An unsolved [`Puzzle`] grid
#[derive(Debug, Clone)]
pub struct Puzzle {
    pub shape: Shape,
    pub pips_in_each_cell: CellVec<Pips>, // How many pips are in each cell
}

impl Puzzle {
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
