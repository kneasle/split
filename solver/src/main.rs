use std::time::Instant;

fn main() {
    // let string = "1.1|2.2";
    let string = "1.41|4...|...4|14.1";
    // let string = "2.1.2|.....|1...1|.....|2.1.2";
    SolvingContext::new(&Puzzle::new(string)).solve();
}

#[derive(Debug)]
struct Puzzle {
    pip_count_per_cell: Vec<usize>,
    width: usize,
    height: usize,

    adjacent_cell_bitmaps: Vec<u64>,
}

impl Puzzle {
    fn new(string: &str) -> Self {
        // Parse puzzle string
        let mut pip_count_per_cell = Vec::new();
        let mut width = None;
        for line in string.split('|') {
            // Add pip counts
            for ch in line.chars() {
                match ".123456789".find(ch) {
                    Some(pip_count) => pip_count_per_cell.push(pip_count),
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
        let height = pip_count_per_cell.len() / width;
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
            pip_count_per_cell,
            width,
            height,

            adjacent_cell_bitmaps,
        }
    }

    fn total_num_pips(&self) -> usize {
        self.pip_count_per_cell.iter().sum::<usize>()
    }

    fn print_bitmap(&self, bitmaps: &[(u64, char)]) {
        print_bitmaps(self.width, self.height, bitmaps);
    }
}

#[derive(Debug)]
struct SolvingContext<'data> {
    puzzle: &'data Puzzle,
    num_solutions: usize,

    /// Bitmap: There's a `1` and bit index `i` iff we are still looking a solution which splits
    /// the pips into regions of size `i`.
    possible_solutions: u32,
}

impl<'data> SolvingContext<'data> {
    fn new(puzzle: &'data Puzzle) -> Self {
        // Create a bitmap for which possible solutions are valid
        let most_pips_in_cell = *puzzle
            .pip_count_per_cell
            .iter()
            .filter(|v| **v > 0)
            .max()
            .unwrap();
        let mut possible_solutions = 0;
        for i in most_pips_in_cell..=puzzle.total_num_pips() / 2 {
            if puzzle.total_num_pips() % i == 0 {
                possible_solutions |= 1 << i;
            }
        }

        Self {
            puzzle,
            possible_solutions,
            num_solutions: 0,
        }
    }

    fn solve(&mut self) {
        let start = Instant::now();
        for cell_idx in 0..self.puzzle.pip_count_per_cell.len() {
            PartialSolution::with_initial_inside(self, cell_idx).recursive_solve(self, 0);
        }
        println!(
            "{} solutions found in {:?}",
            self.num_solutions,
            start.elapsed()
        );
    }

    fn biggest_required_pip_count(&self) -> usize {
        31 - self.possible_solutions.leading_zeros() as usize
    }
}

#[derive(Debug, Clone)]
struct PartialSolution {
    inside: u64,
    outside: u64,
    expandable_cells: u64,

    pips_in_current_region: usize,
}

impl PartialSolution {
    /// Create a `PartialSolution` with one single 'inside' cell at the given `cell_idx`, and with
    /// every cell below that marked as 'outside'.
    fn with_initial_inside(ctx: &SolvingContext, cell_idx: usize) -> Self {
        let inside = 1 << cell_idx;
        let outside = inside - 1; // 1s up to the lowest 1 in inside
        Self {
            inside,
            outside,
            expandable_cells: ctx.puzzle.adjacent_cell_bitmaps[cell_idx] & !outside,
            pips_in_current_region: ctx.puzzle.pip_count_per_cell[cell_idx],
        }
    }

    fn recursive_solve(&self, ctx: &mut SolvingContext, depth: usize) {
        // println!("Recursively solving puzzle at depth {depth}");
        // self.print_assignment_str(ctx);
        // println!();
        // ctx.puzzle.print_bitmap(&[(self.expandable_cells, '#')]);
        // println!();
        // println!();

        match self.cell_to_expand(ctx) {
            Some(next_cell) => {
                // Cells left to expand; keep recursing.
                //
                // We expand inside first so that we find the solutions by largest pip count first.
                // We only care about generating one solution per pip count, so if we can quickly
                // generate the largest pip count, we can very quickly lower the upper bound on
                // remaining pip size.
                for a in [Assignment::Inside, Assignment::Outside] {
                    let mut new_partial = self.clone();
                    if new_partial.assign_cell(ctx, next_cell, a) {
                        new_partial.recursive_solve(ctx, depth + 1);
                    }
                }
            }
            None => {
                if self.pips_in_current_region == 0
                    || ctx.puzzle.total_num_pips() % self.pips_in_current_region != 0
                {
                    return;
                }
                println!("FOUND SOLUTION OF {}:", self.pips_in_current_region);
                self.print_assignment_str(ctx);
                println!();
                // TODO: Add a twist and continue searching
                ctx.num_solutions += 1;
                if ctx.num_solutions > 10 {
                    panic!();
                }
            }
        };
    }

    fn cell_to_expand(&self, ctx: &SolvingContext) -> Option<usize> {
        let lowest_unexpanded_cell = self.expandable_cells.trailing_zeros() as usize;
        if lowest_unexpanded_cell < ctx.puzzle.pip_count_per_cell.len() {
            Some(lowest_unexpanded_cell)
        } else {
            None
        }
    }

    #[must_use]
    fn assign_cell(
        &mut self,
        ctx: &SolvingContext,
        cell_idx: usize,
        assignment: Assignment,
    ) -> bool {
        // println!("Expanding cell {cell_idx} with {assignment:?}");

        // Add the new value to the assignments
        let assigned_bitmap = match assignment {
            Assignment::Outside => &mut self.outside,
            Assignment::Inside => &mut self.inside,
        };
        *assigned_bitmap |= 1 << cell_idx;
        // Update which cells are expandable
        self.expandable_cells &= !(1 << cell_idx); // This cell can't be expanded more
        if assignment == Assignment::Inside {
            self.pips_in_current_region += ctx.puzzle.pip_count_per_cell[cell_idx];
            // println!(
            //     "{} (biggest possible) vs {} (in region)",
            //     ctx.biggest_required_pip_count(),
            //     self.pips_in_current_region
            // );
            if self.pips_in_current_region > ctx.biggest_required_pip_count() {
                // This region includes so many pips that it can't provide a new solution
                // println!("Rejecting solution because it exceeds maximum count");
                return false;
            }
            // If this cell was inside, then we should now have more expandable cells
            let new_adjacent_cells = ctx.puzzle.adjacent_cell_bitmaps[cell_idx];
            let already_assigned_cells = self.inside | self.outside;
            self.expandable_cells |= new_adjacent_cells & !already_assigned_cells;
        }

        assert_eq!(self.inside & self.outside, 0); // No cell can be both inside and outside the line

        true
    }

    fn print_assignment_str(&self, ctx: &SolvingContext) {
        ctx.puzzle
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
