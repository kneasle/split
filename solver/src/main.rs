fn main() {
    let string = "1.1|2.2";
    // let string = "2.1.2|.....|1...1|.....|2.1.2";
    let puzzle = Puzzle::new(string);
    dbg!(&puzzle);
    solve(&puzzle);
}

#[derive(Debug)]
struct Puzzle {
    cells: Vec<usize>,
    width: usize,
    height: usize,

    adjacent_cell_bitmaps: Vec<u64>,
}

impl Puzzle {
    fn new(string: &str) -> Self {
        // Parse puzzle string
        let mut cells = Vec::new();
        let mut width = None;
        for line in string.split('|') {
            // Add pip counts
            for ch in line.chars() {
                match ".123456789".find(ch) {
                    Some(pip_count) => cells.push(pip_count),
                    None => panic!("Invalid char found in {string:?}"),
                };
            }
            // Sanity check that all lines have equal length
            if let Some(length) = width {
                assert_eq!(length, line.len());
            }
            width = Some(line.len());
        }
        let width = width.unwrap();
        let height = cells.len() / width;
        // Compute adjacency bitmaps
        let mut adjacent_cell_bitmaps = Vec::new();
        for cy in 0..height as isize {
            for cx in 0..width as isize {
                let mut bitmap = 0u64;
                for (dx, dy) in [(-1, 0), (1, 0), (0, -1), (0, 1)] {
                    let x = cx + dx;
                    let y = cy + dy;
                    if 0 <= x && x < width as isize && 0 <= y && y < height as isize {
                        let index = y * width as isize + x;
                        bitmap |= 1 << index;
                    }
                }
                adjacent_cell_bitmaps.push(bitmap);
            }
        }

        Self {
            cells,
            width,
            height,

            adjacent_cell_bitmaps,
        }
    }

    fn total_num_pips(&self) -> usize {
        self.cells.iter().sum::<usize>()
    }

    fn print_bitmap(&self, bitmaps: &[(u64, char)]) {
        print_bitmaps(self.width, self.height, bitmaps);
    }
}

fn solve(puzzle: &Puzzle) {
    let _min_solution_value = puzzle.cells.iter().filter(|v| **v > 0).min();

    for cell_idx in 0..1
    /* puzzle.cells.len() */
    {
        PartialSolution::with_initial_inside(puzzle, cell_idx).recursive_solve(0);
    }
}

#[derive(Debug, Clone)]
struct PartialSolution<'p> {
    inside: u64,
    outside: u64,
    expandable_cells: u64,

    region_pip_count: Option<usize>,
    puzzle: &'p Puzzle,
}

impl<'p> PartialSolution<'p> {
    /// Create a `PartialSolution` with one single 'inside' cell at the given `cell_idx`, and with
    /// every cell below that marked as 'outside'.
    fn with_initial_inside(puzzle: &'p Puzzle, cell_idx: usize) -> Self {
        let inside = 1 << cell_idx;
        let outside = inside - 1; // 1s up to the lowest 1 in inside
        Self {
            inside,
            outside,
            expandable_cells: puzzle.adjacent_cell_bitmaps[cell_idx] & !outside,
            region_pip_count: None,
            puzzle,
        }
    }

    fn recursive_solve(&self, depth: usize) {
        println!("Recursively solving puzzle at depth {depth}");
        self.print_assignment_str();
        println!();
        self.puzzle.print_bitmap(&[(self.expandable_cells, '#')]);
        println!();
        println!();

        // if depth >= 3 {
        //     println!("Exceeding depth limit");
        //     return;
        // }

        // TODO: Check this solution for (im)possibility

        match self.cell_to_expand() {
            Some(next_cell) => {
                // Cells left to expand; keep recursing
                for a in [Assignment::Outside, Assignment::Inside] {
                    let mut new_partial = self.clone();
                    new_partial.expand_cell(next_cell, a);
                    new_partial.recursive_solve(depth + 1);
                }
            }
            None => {
                // TODO: Found full solution
                println!("FOUND SOLUTION:");
                self.print_assignment_str();
                println!();
            }
        };
    }

    fn cell_to_expand(&self) -> Option<usize> {
        let lowest_unexpanded_cell = self.expandable_cells.trailing_zeros() as usize;
        if lowest_unexpanded_cell < self.puzzle.cells.len() {
            Some(lowest_unexpanded_cell)
        } else {
            None
        }
    }

    fn expand_cell(&mut self, cell: usize, assignment: Assignment) {
        println!("Expanding cell {cell}");

        // Add the new value to the assignments
        let assigned_bitmap = match assignment {
            Assignment::Outside => &mut self.outside,
            Assignment::Inside => &mut self.inside,
        };
        *assigned_bitmap |= 1 << cell;
        // Update which cells are expandable
        self.expandable_cells &= !(1 << cell); // This cell can't be expanded more
        if assignment == Assignment::Inside {
            // If this cell was inside, then we can continue extending this region
            let new_adjacent_cells = self.puzzle.adjacent_cell_bitmaps[cell];
            let already_assigned_cells = self.inside | self.outside;
            self.expandable_cells |= new_adjacent_cells & !already_assigned_cells;
        }

        assert_eq!(self.inside & self.outside, 0); // No cell can be both inside and outside the line
    }

    fn print_assignment_str(&self) {
        self.puzzle
            .print_bitmap(&[(self.inside, 'I'), (self.outside, 'O')]);
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Assignment {
    Outside,
    Inside,
}

fn print_bitmaps(width: usize, height: usize, bitmaps: &[(u64, char)]) {
    let mut string = String::new();
    'idx_loop: for idx in 0..width * height {
        if idx > 0 && idx % width == 0 {
            string.push('\n');
        }
        for &(bitmap, char) in bitmaps {
            if bitmap & (1 << idx) != 0 {
                string.push(char);
                continue 'idx_loop;
            }
        }
        // If no bitmaps had this value, it's empty
        string.push('-');
    }
    println!("{string}");
}
