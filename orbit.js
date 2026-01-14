/** @import { Transformation } from "./transformation.js" */

/**
 * @param {Element} target
 * @param {Transformation | undefined} transformation
 * @param {() => void} callback
 */
export function orbitControls(target, transformation, callback) {
  function startOrbiting() {
    window.addEventListener("pointerup", stopOrbiting, {
      passive: true,
    });

    window.addEventListener("pointermove", orbit, { passive: true });
  }

  function stopOrbiting() {
    window.removeEventListener("pointermove", orbit);
  }

  target.addEventListener("pointerdown", startOrbiting, {
    passive: true,
  });

  /**
   * @param {PointerEvent} event
   */
  function orbit(event) {
    if (!(event.buttons & 1)) {
      return;
    }

    const scaling = 512 / target.clientWidth;

    transformation?.orbit(
      -event.movementY * scaling,
      -event.movementX * scaling
    );

    callback();
  }

  return function () {
    target.removeEventListener("pointerdown", startOrbiting);
    window.removeEventListener("pointermove", orbit);
    window.removeEventListener("pointerup", stopOrbiting);
  };
}
