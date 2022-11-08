use bevy::prelude::*;

pub fn vec2_to_3(v: Vec2) -> Vec3 {
    Vec3::new(v.x, v.y, 0.0)
}
