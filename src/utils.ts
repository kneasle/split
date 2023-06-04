/* COLOR */

class Color {
  r: number;
  g: number;
  b: number;

  constructor(r: number, g: number, b: number) {
    this.r = r;
    this.g = g;
    this.b = b;
  }

  static from_hex(hex: string): Color {
    // Parse color as a hex string
    let r, g, b, multiplier;
    if (hex.length === 4) {
      r = hex[1];
      g = hex[2];
      b = hex[3];
      multiplier = 0x11;
    } else if (hex.length === 7) {
      r = hex.slice(1, 3);
      g = hex.slice(3, 5);
      b = hex.slice(5, 7);
      multiplier = 1;
    } else {
      throw Error("Colour passed non-hex string");
    }

    return new Color(
      parseInt(r, 16) * multiplier,
      parseInt(g, 16) * multiplier,
      parseInt(b, 16) * multiplier,
    );
  }

  to_canvas_color(): string {
    return `rgb(${Math.round(this.r)}, ${Math.round(this.g)}, ${Math.round(this.b)})`;
  }

  to_canvas_color_with_alpha(alpha: number): string {
    return `rgba(${Math.round(this.r)}, ${Math.round(this.g)}, ${Math.round(this.b)}, ${alpha})`;
  }

  static lerp(c1: Color, c2: Color, t: number): Color {
    let r = lerp(c1.r, c2.r, t);
    let g = lerp(c1.g, c2.g, t);
    let b = lerp(c1.b, c2.b, t);
    return new Color(r, g, b);
  }
}

/* ARRAY MANIPULATION */

function sort_by_key<T>(arr: T[], key: (v: T) => any[]): T[] {
  arr = [...arr];
  arr.sort((a, b) => {
    let vs_a = key(a);
    let vs_b = key(b);
    for (let i = 0; i < Math.min(vs_a.length, vs_b.length); i++) {
      if (vs_a[i] < vs_b[i]) return -1;
      if (vs_a[i] > vs_b[i]) return 1;
      // If they're equal, check the next item in the arrays (i.e. we're doing
      // lexicographic/dictionary sort)
    }
    return 0; // If no elements are different, the arrays must be equal
  });
  return arr;
}

// Removes any items from `arr` which fail `pred`
function retain<T>(arr: T[], pred: (v: T) => boolean): void {
  let idxs_to_remove = [];
  for (let i = 0; i < arr.length; i++) {
    if (!pred(arr[i])) {
      idxs_to_remove.push(i);
    }
  }
  idxs_to_remove.reverse();
  for (const i of idxs_to_remove) {
    arr.splice(i, 1);
  }
}

/* ANIMATION */

class Tween<T> {
  source: T;
  target: T;
  _anim_start: number;
  _duration: number;
  _lerp_fn: (a: T, b: T, t: number) => T;
  random_delay_factor: number;

  constructor(state: T, duration: number, lerp_fn: (a: T, b: T, t: number) => T) {
    this.source = state;
    this.target = state;
    this._duration = duration;
    this._anim_start = Date.now();
    this._lerp_fn = lerp_fn;
    this.random_delay_factor = 0;
  }

  animate_to(target: T): Tween<T> {
    this.source = this.get();
    this.target = target;
    this._anim_start = Date.now() +
      Math.random() * 1000 * this._duration * this.random_delay_factor;

    return this;
  }

  jump_to(target: T): void {
    this.source = target;
    this.target = target;
  }

  get(): T {
    return this.get_with_lerp_fn(this._lerp_fn);
  }

  get_with_lerp_fn<V>(lerp_fn: (a: T, b: T, t: number) => V): V {
    return lerp_fn(this.source, this.target, this.eased_anim_factor());
  }

  is_complete(): boolean {
    return this.uneased_anim_factor() >= 1;
  }

  is_animating(): boolean {
    return 0 < this.uneased_anim_factor() && this.uneased_anim_factor() < 1;
  }

  uneased_anim_factor(): number {
    return uneased_anim_factor(this._anim_start, this._duration);
  }

  eased_anim_factor(): number {
    return eased_anim_factor(this._anim_start, this._duration);
  }
}

class BoolTween {
  private factor_tween: Tween<number>;

  constructor(state: boolean, duration: number) {
    this.factor_tween = new Tween(state ? 1 : 0, duration, lerp);
  }

  animate_to(state: boolean): BoolTween {
    let new_factor = state ? 1 : 0;
    if (this.factor_tween.target !== new_factor) {
      this.factor_tween.animate_to(new_factor);
    }
    return this;
  }

  factor(): number {
    return this.factor_tween.get();
  }
}

class HoverTween {
  private pop_amount: number;

  private bool_tween: BoolTween;
  private bounce_start_time: number;

  constructor(pop_amount: number, duration = HOVER_POP_TIME) {
    this.pop_amount = pop_amount;

    this.bool_tween = new BoolTween(false, duration);
    this.bounce_start_time = 0;
  }

  set_hovered(hovered: boolean): void {
    if (hovered && this.bool_tween.factor() === 0.0) {
      // If we're starting a hover, then reset the bounce time
      this.bounce_start_time = Date.now();
    }
    this.bool_tween.animate_to(hovered);
  }

  scale_factor(): number {
    let bounce = Math.cos(
      (Date.now() - this.bounce_start_time) / (1000 * HOVER_POP_BOUNCE_TIME) * Math.PI * 2,
    ) * HOVER_POP_BOUNCE_AMOUNT;
    return lerp(1, this.pop_amount + bounce, this.bool_tween.factor());
  }
}

function eased_anim_factor(start_time: number, duration: number): number {
  let anim_factor = uneased_anim_factor(start_time, duration);
  anim_factor = clamp01(anim_factor); // Clamp
  anim_factor = ease_in_out(anim_factor); // Easing
  return anim_factor;
}

function uneased_anim_factor(start_time: number, duration: number): number {
  return (Date.now() - start_time) / 1000 / duration;
}

function ease_in_out(x: number, tension = 1.5): number {
  x = clamp01(x);

  // Performs the 'ease in' half of the animation, takes 0 <= x <= 0.5 and outputs a new value
  // 0 <= y <= 0.5.  This computes (2x)^(2^tension) / 2 - i.e. if 0 <= x <= 1, this would just
  // compute x^(2^tension).
  let ease_in = (x: number) => Math.pow(x * 2, Math.pow(2, tension)) * 0.5;

  if (x <= 0.5) {
    return ease_in(x);
  } else {
    return 1 - ease_in(1 - x);
  }
}

function lerp(a: number, b: number, t: number): number {
  return a * (1 - t) + b * t;
}

function clamp01(x: number): number {
  return clamp(x, 0, 1);
}

function clamp(x: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, x));
}

/* MATHS */

class Transform {
  scale: number;
  translation: Vec2;

  constructor() {
    this.scale = 1;
    this.translation = Vec2.ZERO;
  }

  static scale(scale: number): Transform {
    return new Transform().then_scale(scale);
  }

  static translate(delta: Vec2): Transform {
    return new Transform().then_translate(delta);
  }

  then(other: Transform): Transform {
    return this.then_scale(other.scale).then_translate(other.translation);
  }

  then_scale(scale: number): Transform {
    let tr = new Transform();
    tr.scale = this.scale * scale;
    tr.translation = this.translation.mul(scale);
    return tr;
  }

  then_translate(delta: Vec2): Transform {
    let tr = new Transform();
    tr.scale = this.scale;
    tr.translation = this.translation.add(delta);
    return tr;
  }

  inv(): Transform {
    return Transform.translate(this.translation.neg()).then_scale(1 / this.scale);
  }

  transform_point(p: Vec2): Vec2 {
    return p.mul(this.scale).add(this.translation);
  }

  transform_rect(rect: Rect): Rect {
    return new Rect(this.transform_point(rect.min), this.transform_point(rect.max));
  }

  apply_to_canvas(ctx: CanvasRenderingContext2D) {
    ctx.translate(this.translation.x, this.translation.y);
    ctx.scale(this.scale, this.scale);
  }

  static lerp(a: Transform, b: Transform, t: number): Transform {
    let tr = new Transform();
    tr.scale = lerp(a.scale, b.scale, t);
    tr.translation = Vec2.lerp(a.translation, b.translation, t);
    return tr;
  }
}

class Vec2 {
  readonly x: number;
  readonly y: number;

  static readonly ZERO: Vec2 = new Vec2(0, 0);
  static readonly ONE: Vec2 = new Vec2(1, 1);
  static readonly X: Vec2 = new Vec2(1, 0);
  static readonly Y: Vec2 = new Vec2(0, 1);

  static readonly UP: Vec2 = new Vec2(0, -1);
  static readonly DOWN: Vec2 = new Vec2(0, 1);
  static readonly LEFT: Vec2 = new Vec2(-1, 0);
  static readonly RIGHT: Vec2 = new Vec2(1, 0);

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }

  static splat(v: number): Vec2 {
    return new Vec2(v, v);
  }

  /* BASIC ARITHMETIC */

  add(other: Vec2): Vec2 {
    return new Vec2(this.x + other.x, this.y + other.y);
  }

  sub(other: Vec2): Vec2 {
    return new Vec2(this.x - other.x, this.y - other.y);
  }

  mul(factor: number): Vec2 {
    return new Vec2(this.x * factor, this.y * factor);
  }

  div(factor: number): Vec2 {
    return new Vec2(this.x / factor, this.y / factor);
  }

  neg(): Vec2 {
    return new Vec2(-this.x, -this.y);
  }

  dot(other: Vec2): number {
    return this.x * other.x + this.y * other.y;
  }

  length(): number {
    return Math.sqrt(this.square_length());
  }

  square_length(): number {
    return this.dot(this);
  }

  /* GEOMETRIC OPERATIONS */

  nearest_point_on_line(p: Vec2, direction: Vec2): Vec2 {
    // (this - p).project_onto_line() + p
    return this.sub(p).project_onto(direction).add(p);
  }

  distance_to_line(p: Vec2, direction: Vec2): number {
    return Vec2.distance_between(this, this.nearest_point_on_line(p, direction));
  }

  reflect_in_line(p: Vec2, direction: Vec2): Vec2 {
    // p + (this - p).reflect_over(direction)
    return p.add(this.sub(p).reflect_over(direction));
  }

  reflect_over(direction: Vec2): Vec2 {
    // this.project_onto(direction) * 2 - this
    return this.project_onto(direction).mul(2).sub(this);
  }

  project_onto(direction: Vec2): Vec2 {
    return direction.mul(this.projection_lambda_onto(direction));
  }

  projection_lambda_onto(direction: Vec2): number {
    return this.dot(direction) / direction.square_length();
  }

  /* FANCY ARITHMETIC */

  static distance_between(a: Vec2, b: Vec2): number {
    return a.sub(b).length();
  }

  static min(a: Vec2, b: Vec2): Vec2 {
    return new Vec2(Math.min(a.x, b.x), Math.min(a.y, b.y));
  }

  static max(a: Vec2, b: Vec2): Vec2 {
    return new Vec2(Math.max(a.x, b.x), Math.max(a.y, b.y));
  }

  static lerp(a: Vec2, b: Vec2, t: number): Vec2 {
    return new Vec2(lerp(a.x, b.x, t), lerp(a.y, b.y, t));
  }
}

class Rect {
  readonly min: Vec2;
  readonly max: Vec2;

  /* CONSTRUCTORS */

  constructor(min: Vec2, max: Vec2) {
    this.min = min;
    this.max = max;
  }

  static with_centre(centre: Vec2, size: Vec2): Rect {
    let half_size = size.div(2);
    return new Rect(centre.sub(half_size), centre.add(half_size));
  }

  /* GETTERS */

  size(): Vec2 {
    return this.max.sub(this.min);
  }

  width(): number {
    return this.max.x - this.min.x;
  }

  height(): number {
    return this.max.y - this.min.y;
  }

  centre(): Vec2 {
    return Vec2.lerp(this.min, this.max, 0.5);
  }

  /* OPERATIONS */

  scale_about_centre(factor: number): Rect {
    return Rect.with_centre(this.centre(), this.size().mul(factor));
  }

  /* INTERSECTION TESTS */

  contains(p: Vec2): boolean {
    let is_within_x = this.min.x <= p.x && p.x <= this.max.x;
    let is_within_y = this.min.y <= p.y && p.y <= this.max.y;
    return is_within_x && is_within_y;
  }
}
