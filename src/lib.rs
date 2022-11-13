use puzzle::{EdgeIdx, Puzzle};

// mod grid;
mod puzzle;
// mod utils;

#[no_mangle]
pub extern "C" fn add(a: u32, b: u32) -> &'static mut u32 {
    let boks = Box::new(a + b);
    Box::leak(boks)
}

#[no_mangle]
pub extern "C" fn get(v: &'static mut u32) -> u32 {
    web_sys::console::log_1(&"Hello, World!".into());
    *v
}

fn main() {
    print_some_puzzles();
}

fn print_some_puzzles() {
    let _lines = [
        "21|12",
        "21 |12 |   ",
        "21 |12 |  2",
        "21  |12  |  2 |    ",
        "21  |12  |    |   2",
    ];

    let puzzle = Puzzle::from_single_line("21|1 ");
    let line = [1, 7, 2, 5, 11, 10, 3, 8]
        .into_iter()
        .map(EdgeIdx::new)
        .collect();
    let soln = puzzle.solution(line);
    puzzle.print_line(&soln.line);
}
