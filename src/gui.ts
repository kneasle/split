/* Utilities for rendering simple GUIs */

// Values for the `Gui` which are preserved between frames
class GuiMemory {
  button_hover_tweens = new Map<string, HoverTween>();
}

class Gui {
  private readonly mouse: MouseUpdate;
  private readonly memory: GuiMemory;

  constructor(memory: GuiMemory, mouse: MouseUpdate) {
    this.mouse = mouse;
    this.memory = memory;
  }

  // Draws a button on the screen at the desired `Rect`.  Returns `true` if this button was clicked.
  // The `draw` function is called while the canvas's transform matrix is set such that the contents
  // of the button are at `(0, 0)` to `(rect.width(), rect.height())`.
  button(id: string, rect: Rect, draw: () => void): boolean {
    // Get hover tween
    let hover_tween = this.memory.button_hover_tweens.get(id);
    if (hover_tween === undefined) {
      hover_tween = new HoverTween(BUTTON_HOVER_POP_AMOUNT);
      this.memory.button_hover_tweens.set(id, hover_tween);
    }
    // Use this to implement hover pop
    let is_hovered = rect.contains(this.mouse.pos);
    hover_tween.set_hovered(is_hovered);

    // Draw (debug) outline
    if (DEBUG_SHOW_GUI_OUTLINES) {
      let final_rect = rect.scale_about_centre(hover_tween.scale_factor());
      ctx.strokeStyle = "black";
      ctx.lineWidth = 1;
      ctx.strokeRect(final_rect.min.x, final_rect.min.y, final_rect.width(), final_rect.height());
    }

    // Draw button contents
    ctx.save();
    ctx.translate(rect.centre().x, rect.centre().y);
    ctx.scale(hover_tween.scale_factor(), hover_tween.scale_factor());
    ctx.translate(-rect.size().x / 2, -rect.size().y / 2);
    draw();
    ctx.restore();

    return this.mouse.button_clicked && is_hovered; // Was button clicked?
  }

  // Identical to `button`, except that the `draw` function recieves the canvas renderer such that
  // the contents of the button go from `(0, 0)` to `(1, 1)`
  normalised_button(id: string, rect: Rect, draw: () => void): boolean {
    return this.button(id, rect, () => {
      ctx.scale(rect.width(), rect.height());
      draw();
    });
  }
}
