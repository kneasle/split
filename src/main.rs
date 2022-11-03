use shape::EdgeIdx;

use crate::{
    puzzle::{Pips, Puzzle},
    shape::Shape,
};

mod puzzle;
mod shape;

fn main() {
    let shape = Shape::rectangular(2, 2);
    let puzzle = Puzzle {
        shape,
        pips_in_each_cell: vec![Pips(2), Pips(1), Pips(1), Pips(0)].into(),
    };

    let line = [1, 7, 2, 5, 11, 10, 3, 8];
    puzzle.print_line(&line.into_iter().map(EdgeIdx::new).collect());
}
