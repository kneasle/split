/* Game code for Split */

/* ===== STARTUP CODE ===== */

const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext('2d');

window.addEventListener("resize", on_resize);

on_resize();
frame();

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillRect(100, 100, 200, 200);
}

/* ===== WINDOW RESIZE LOGIC ===== */

function frame() {
  render();
  
  // window.requestAnimationFrame(frame);
}

function on_resize() {
  // Set the canvas size according to its new on-screen size
  var rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * window.devicePixelRatio;
  canvas.height = rect.height * window.devicePixelRatio;
}

function request_frame() {
  window.requestAnimationFrame(frame);
}
