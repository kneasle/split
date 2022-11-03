use std::ops::{Add, AddAssign};

use crate::shape::{CellVec, EdgeIdx, Shape};

/// An unsolved [`Puzzle`] grid
#[derive(Debug, Clone)]
pub struct Puzzle {
    pub shape: Shape,
    pub pips_in_each_cell: CellVec<Pips>, // How many pips are in each cell
}

impl Puzzle {
    pub fn draw_square(&self) {
        let width = self.shape.square_size.x as usize;
        let height = self.shape.square_size.y as usize;

        let mut boundary_line = "+".to_owned();
        for _ in 0..width {
            boundary_line.push_str("---+");
        }

        let mut pips_iter = self.pips_in_each_cell.iter().map(|pips| pips.0);

        println!("{}", boundary_line);
        for _ in 0..height {
            for _ in 0..width {
                let num_pips = pips_iter.next().unwrap();
                if num_pips == 0 {
                    print!("|   ");
                } else {
                    print!("| {} ", num_pips);
                }
            }
            println!("|");
            println!("{}", boundary_line);
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
