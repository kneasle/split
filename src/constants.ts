/* 'Compile-time' constants which tune the behaviour of the game */

// Colors
const BG_COLOR = Color.from_hex("#030");
const CELL_COLOR = Color.from_hex("#070");
const GRID_COLOR = Color.from_hex("#000");
const LINE_COLOR = Color.from_hex("#fff");
const PIP_COLOR = Color.from_hex("#fff");
const CORRECT_COLOR = Color.from_hex("#0f0");
const INCORRECT_COLOR = Color.from_hex("#f77");
// Sizes
const VERTEX_SIZE = 0.3;
const EDGE_WIDTH = 0.15;
const PIP_PATTERN_RADIUS = 0.2;
const PIP_SIZE = 0.12;
// Animation
const OVERLAY_ANIMATION_TIME = 0.4; // Seconds
const GRID_MOVE_ANIMATION_TIME = 0.7; // Seconds
const SOLVE_ANIMATION_TIME = 0.3; // Seconds
const PIP_ANIMATION_SPREAD = 0.5; // Factor of `PIP_ANIMATION_TIME`
const LINE_LERP_SPEED_FACTOR = 6000; // Pixels/second per pixel
const MIN_LINE_LERP_SPEED = 3000; // Pixels/second
// Interaction
const VERTEX_INTERACTION_RADIUS = 0.4;
const MIN_LINE_LENGTH_TO_KEEP = 0.4; // Edges; any line shorter than this will get removed after drawing
const LOOP_CLOSE_SNAP_DISTANCE = 0.4; // Edges; distance at which a line will be snapped to complete a loop
// Display
const PUZZLE_BOX_MAX_WIDTH = 4;
const PUZZLE_BOX_MAX_HEIGHT = 1;
const PUZZLE_WORLD_SCALE = 100; // Pixels
const PUZZLE_HEADER_HEIGHT = PUZZLE_WORLD_SCALE * 1.2; // Pixels