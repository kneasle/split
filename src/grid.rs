//! Code for handling an interactive [`Puzzle`] grid as a Bevy plugin

use std::collections::HashSet;

use bevy::prelude::*;

use crate::{puzzle::Puzzle, shape::EdgeIdx};

pub struct GridPlugin;

impl Plugin for GridPlugin {
    fn build(&self, app: &mut App) {
        app.add_startup_system(add_grids).add_system(draw_puzzles);
    }
}

#[derive(Debug, Clone, Component)]
struct Grid {
    puzzle: Puzzle,
    line: HashSet<EdgeIdx>,
    has_printed: bool,
}

fn add_grids(mut commands: Commands) {
    commands.spawn().insert(Grid {
        puzzle: Puzzle::from_single_line("21|1 "),
        line: [1, 7, 2, 5, 11, 10, 3, 8]
            .into_iter()
            .map(EdgeIdx::new)
            .collect(),
        has_printed: false,
    });
}

// TODO: Make this not mutable
fn draw_puzzles(mut query: Query<&mut Grid>) {
    for mut grid in query.iter_mut() {
        if !grid.has_printed {
            let soln = grid.puzzle.solution(grid.line.clone());
            grid.puzzle.print_line(&soln.line);
            dbg!(soln);

            grid.has_printed = true;
        }
    }
}
