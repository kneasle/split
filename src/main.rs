use three_d::*;

fn main() {
    // Init window
    let window = Window::new(WindowSettings {
        title: "Split game".to_string(),
        ..Default::default()
    })
    .unwrap();
    let context = window.gl();
    let scale_factor = window.device_pixel_ratio();
    let (width, height) = window.size();

    // Build some example geometry
    let mut circle = Gm::new(
        Circle::new(
            &context,
            vec2(500.0, 500.0) * scale_factor,
            200.0 * scale_factor,
        ),
        ColorMaterial {
            color: Srgba::BLUE,
            ..Default::default()
        },
    );

    // Game's main loop
    window.render_loop(move |frame_input| {
        for event in frame_input.events.iter() {
            match event {
                Event::MouseMotion {
                    button, position, ..
                } => {
                    if *button == Some(MouseButton::Left) {
                        circle.set_center(*position);
                    }
                }
                _ => (),
            }
        }

        frame_input
            .screen()
            .clear(ClearState::color_and_depth(0.8, 0.8, 0.8, 1.0, 1.0))
            .render(&Camera::new_2d(frame_input.viewport), [&circle], &[]);

        FrameOutput::default()
    });
}
