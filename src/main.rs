use shape::EdgeIdx;

use crate::puzzle::Puzzle;

mod puzzle;
mod shape;

fn main() {
    let puzzle = Puzzle::from_single_line("21|1 ");
    let line = [1, 7, 2, 5, 11, 10, 3, 8]
        .into_iter()
        .map(EdgeIdx::new)
        .collect();

    let soln = puzzle.solution(line);
    puzzle.print_line(&soln.line);
    dbg!(soln);
}
