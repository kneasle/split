//! Code for handling an interactive [`Puzzle`] grid as a Bevy plugin

use bevy::{
    prelude::*,
    sprite::{MaterialMesh2dBundle, Mesh2dHandle},
};

use crate::{
    puzzle::{CellIdx, Pips, Puzzle},
    utils::vec2_to_3,
};

const VERTEX_SIZE: f32 = 0.3;
const EDGE_WIDTH: f32 = 0.15;
const PIP_SIZE: f32 = 0.1;
const PIP_PATTERN_RADIUS: f32 = 0.17;

const PIP_Z: f32 = 1.0;

#[derive(Debug, Bundle)]
struct Grid {
    puzzle: Puzzle,
    #[bundle]
    transform: SpatialBundle,
}

#[derive(Debug, Component)]
struct Pip {
    source_cell: CellIdx,
    source_idx: usize,
}

pub fn add_grid(
    mut commands: Commands,
    mut meshes: ResMut<Assets<Mesh>>,
    mut materials: ResMut<Assets<ColorMaterial>>,
) {
    let quad_mesh: Mesh2dHandle = meshes
        .add(Mesh::from(bevy::prelude::shape::Quad::default()))
        .into();
    let black_material = materials.add(ColorMaterial::from(Color::BLACK));
    let pip_material = materials.add(ColorMaterial::from(Color::WHITE));

    let puzzle = Puzzle::from_single_line("21|1 ");

    commands
        .spawn_bundle(Grid {
            puzzle: puzzle.clone(),
            transform: SpatialBundle {
                transform: Transform::default().with_scale(Vec3::new(128.0, 128.0, 1.0)),
                ..Default::default()
            },
        })
        .with_children(|parent| {
            // Add a transform to all contents so the puzzle ends up centred
            parent
                .spawn_bundle(SpatialBundle {
                    transform: Transform::default()
                        .with_translation(vec2_to_3(puzzle.square_size.as_vec2() / -2.0)),
                    ..Default::default()
                })
                // Then add the puzzle's contents, which inherit the centering
                .with_children(|parent| {
                    build_puzzle_children(puzzle, parent, quad_mesh, black_material, pip_material);
                });
        });
}

/// Build child entities for all pieces of the given [`Puzzle`]
fn build_puzzle_children(
    puzzle: Puzzle,
    parent: &mut ChildBuilder,
    quad_mesh: Mesh2dHandle,
    black_material: Handle<ColorMaterial>,
    pip_material: Handle<ColorMaterial>,
) {
    // Vertices
    for v in &puzzle.verts {
        parent.spawn_bundle(MaterialMesh2dBundle {
            mesh: quad_mesh.clone(),
            transform: Transform::default()
                .with_translation(vec2_to_3(*v))
                .with_scale(Vec3::splat(VERTEX_SIZE)),
            material: black_material.clone(),
            ..default()
        });
    }
    // Edges
    for (v1, v2) in &puzzle.edges {
        let v1 = vec2_to_3(puzzle.verts[*v1]);
        let v2 = vec2_to_3(puzzle.verts[*v2]);
        parent.spawn_bundle(MaterialMesh2dBundle {
            mesh: quad_mesh.clone(),
            transform: Transform::default()
                .with_translation((v1 + v2) / 2.0)
                .with_rotation(Quat::from_rotation_arc(Vec3::Y, v2 - v1))
                .with_scale(Vec3::new(EDGE_WIDTH, (v1 - v2).length(), 1.0)),
            material: black_material.clone(),
            ..default()
        });
    }
    // Pips
    for (cell_idx, cell) in puzzle.cells.iter_enumerated() {
        for pip_idx in 0..cell.pips.0 {
            let pip = Pip {
                source_cell: cell_idx,
                source_idx: pip_idx,
            };
            parent
                .spawn_bundle(MaterialMesh2dBundle {
                    mesh: quad_mesh.clone(),
                    transform: Transform::default()
                        .with_translation(pip_coord(&puzzle, &pip))
                        .with_scale(Vec3::splat(PIP_SIZE)),
                    material: pip_material.clone(),
                    ..default()
                })
                .insert(pip);
        }
    }
    // Cursor tag
    parent
        .spawn_bundle(MaterialMesh2dBundle {
            mesh: quad_mesh.clone(),
            transform: Transform::default().with_scale(Vec3::splat(PIP_SIZE)),
            material: pip_material.clone(),
            ..default()
        })
        .insert(CursorTag);
}

fn pip_coord(puzzle: &Puzzle, pip: &Pip) -> Vec3 {
    let cell = &puzzle.cells[pip.source_cell];
    let sum = cell.verts.iter().map(|v| &puzzle.verts[*v]).sum::<Vec2>();
    let cell_centre = vec2_to_3(sum) / cell.verts.len() as f32;

    let patterns = pip_pattern(cell.pips);

    cell_centre + vec2_to_3(patterns[pip.source_idx]) * PIP_PATTERN_RADIUS + Vec3::Z * PIP_Z
}

/// Creates the pattern of pips, as would be found on a dice.
fn pip_pattern(num_pips: Pips) -> Vec<Vec2> {
    let num_pips = num_pips.0;
    assert!(num_pips <= 10);

    let mut pips = Vec::new();

    // Add pairs of pips, each on opposite sides of the centre
    let pair_directions = [
        (1.0, 1.0),
        (1.0, -1.0),
        (1.0, 0.0),
        (0.0, 1.0),
        (0.33333, -0.3333),
    ];
    let num_pairs = (num_pips / 2).min(4);
    for &(pair_x, pair_y) in &pair_directions[..num_pairs] {
        let pair_direction = Vec2::new(pair_x, pair_y);
        pips.push(pair_direction);
        pips.push(-pair_direction);
    }
    // Add the centre pip for odd numbers
    if num_pips % 2 == 1 {
        pips.push(Vec2::ZERO);
    }

    pips
}

#[derive(Component)]
pub struct CursorTag;

pub fn update_cursor_tag(
    cursor_tag: Query<(&mut Transform, &GlobalTransform), With<CursorTag>>,
    mut cursor_evt: EventReader<CursorMoved>,
) {
    for ev in cursor_evt.iter() {
        let pos3 = vec2_to_3(ev.position);
        println!("Cursor @ ({}, {})", pos3.x, pos3.y);
        for (transform, global_transform) in cursor_tag.iter() {
            let a = global_transform.affine().inverse().transform_point3(pos3);
            println!("{:?}", a);
        }
    }
}
