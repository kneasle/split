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

  static lerp(c1: Color, c2: Color, t: number): Color {
    let r = lerp(c1.r, c2.r, t);
    let g = lerp(c1.g, c2.g, t);
    let b = lerp(c1.b, c2.b, t);
    return new Color(r, g, b);
  }
}

/* ARRAY MANIPULATION */

function sort_by_key<T>(arr: T[], key: (v: T) => any[]) {
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
function retain<T>(arr: T[], pred: (v: T) => boolean) {
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

  animate_to(target: T) {
    this.source = this.get();
    this.target = target;
    this._anim_start = Date.now() +
      Math.random() * 1000 * this._duration * this.random_delay_factor;
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

function eased_anim_factor(start_time: number, duration: number): number {
  let anim_factor = uneased_anim_factor(start_time, duration);
  anim_factor = Math.max(0, Math.min(1, anim_factor)); // Clamp
  anim_factor = ease_in_out(anim_factor); // Easing
  return anim_factor;
}

function uneased_anim_factor(start_time: number, duration: number): number {
  return (Date.now() - start_time) / 1000 / duration;
}

function ease_in_out(x: number): number {
  return (3 - 2 * x) * x * x;
}

/* MATHS */

class Transform {
  dx: number;
  dy: number;
  scale: number;

  constructor(dx: number, dy: number, scale: number) {
    this.dx = dx;
    this.dy = dy;
    this.scale = scale;
  }

  then(other: Transform): Transform {
    return new Transform(
      this.dx + other.dx / this.scale,
      this.dy + other.dy / this.scale,
      this.scale * other.scale,
    );
  }

  then_translate(dx: number, dy: number): Transform {
    return this.then(new Transform(dx, dy, 1));
  }

  inv(): Transform {
    return new Transform(
      -this.dx * this.scale,
      -this.dy * this.scale,
      1 / this.scale,
    );
  }

  transform_point(x: number, y: number): Vec2 {
    return {
      x: (x + this.dx) * this.scale,
      y: (y + this.dy) * this.scale,
    };
  }

  static lerp(a: Transform, b: Transform, t: number): Transform {
    return new Transform(
      lerp(a.dx, b.dx, t),
      lerp(a.dy, b.dy, t),
      lerp(a.scale, b.scale, t),
    );
  }
}

type Vec2 = { x: number; y: number };

function lerp(a: number, b: number, t: number): number {
  return a * (1 - t) + b * t;
}
