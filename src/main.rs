use crate::shape::Shape;

mod shape;

fn main() {
    let shape = Shape::rectangular(2, 2);
    dbg!(shape);
}
