use bevy::prelude::*;
use puzzle::{EdgeIdx, Puzzle};

mod grid;
mod puzzle;
mod utils;

fn main() {
    App::new()
        .add_plugins(DefaultPlugins)
        .add_startup_system(init)
        .add_startup_system(print_some_puzzles)
        .add_startup_system(grid::add_grid)
        .add_system(grid::update_cursor_tag)
        .run();
}

fn init(mut commands: Commands) {
    commands.spawn_bundle(Camera2dBundle::default());
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
