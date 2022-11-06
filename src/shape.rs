use bevy::math::{UVec2, Vec2}; // TODO: Depend directly on glam if we split crates?

/// The `Shape` of a puzzle.  This stores the positions and connections of the
/// edges/vertices/cells
#[derive(Debug, Clone)]
pub struct Shape {
    pub verts: VertVec<Vec2>,
    pub edges: EdgeVec<(VertIdx, VertIdx)>,
    pub cells: CellVec<Cell>,

    pub square_size: UVec2,
}

/// A `Cell` into which [`Pip`]s can be added
#[derive(Debug, Clone)]
pub struct Cell {
    pub verts: Vec<VertIdx>, // Going clockwise
    pub neighbours: Vec<(EdgeIdx, CellIdx)>,
}

impl Shape {
    /// Make a new `Shape` of a rectangular grid of the given size
    pub fn rectangular(width: usize, height: usize) -> Self {
        // Converters for coords => indices
        let get_vert_idx = |x: usize, y: usize| VertIdx::new(y * (width + 1) + x);
        let cell_idx = |x: usize, y: usize| CellIdx::new(y * width + x);

        // Create vertices
        let mut verts = VertVec::new();
        for y in 0..height + 1 {
            for x in 0..width + 1 {
                verts.push(Vec2::new(x as f32, y as f32));
            }
        }
        // Create edges
        let mut edges = EdgeVec::new();
        for y in 0..height {
            for x in 0..width + 1 {
                edges.push((get_vert_idx(x, y), get_vert_idx(x, y + 1))); // Vertical
            }
        }
        for y in 0..height + 1 {
            for x in 0..width {
                edges.push((get_vert_idx(x, y), get_vert_idx(x + 1, y))); // Horizontal
            }
        }
        let get_edge_idx_between = |v1: VertIdx, v2: VertIdx| {
            EdgeIdx::new(
                edges
                    .iter()
                    .position(|verts| *verts == (v1, v2) || *verts == (v2, v1))
                    .unwrap(),
            )
        };
        // Create cells
        let mut cells = CellVec::new();
        for y in 0..height {
            for x in 0..width {
                let tl = get_vert_idx(x, y);
                let tr = get_vert_idx(x + 1, y);
                let br = get_vert_idx(x + 1, y + 1);
                let bl = get_vert_idx(x, y + 1);
                // Compute cell neighbours
                let mut neighbours = Vec::new();
                for (v1, v2, dx, dy) in [
                    (tl, tr, 0, -1),
                    (tr, br, 1, 0),
                    (br, bl, 0, 1),
                    (bl, tl, -1, 0),
                ] {
                    // Test if the cell over this edge is actually in the puzzle
                    let neighbour_x = x as isize + dx;
                    let neighbour_y = y as isize + dy;
                    if (0..width as isize).contains(&neighbour_x)
                        && (0..height as isize).contains(&neighbour_y)
                    {
                        neighbours.push((
                            get_edge_idx_between(v1, v2),
                            cell_idx(neighbour_x as usize, neighbour_y as usize),
                        ));
                    }
                }
                // Build cell
                cells.push(Cell {
                    verts: vec![tl, tr, br, bl],
                    neighbours,
                });
            }
        }

        Shape {
            verts,
            edges,
            cells,

            square_size: UVec2::new(width as u32, height as u32),
        }
    }
}

index_vec::define_index_type! { pub struct VertIdx = usize; }
index_vec::define_index_type! { pub struct EdgeIdx = usize; }
index_vec::define_index_type! { pub struct CellIdx = usize; }
pub type VertVec<T> = index_vec::IndexVec<VertIdx, T>;
pub type EdgeVec<T> = index_vec::IndexVec<EdgeIdx, T>;
pub type CellVec<T> = index_vec::IndexVec<CellIdx, T>;
