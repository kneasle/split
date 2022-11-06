use bevy::prelude::*;
use grid::GridPlugin;

mod grid;
mod puzzle;
mod shape;

fn main() {
    App::new()
        .add_plugins(DefaultPlugins)
        .add_plugin(GridPlugin)
        .run();
}
