import { CanvasRenderer } from "./canvas-renderer.js";
import { Color } from "./ldraw.js";
import { Model } from "./model.js";

const styleSheet = new CSSStyleSheet();
styleSheet.replaceSync(`
  :host {
    position: relative;
    display: inline-block;

    --canvas-size: 512px;

    --canvas-radius: 30px;
    --canvas-padding: 0.125lh;
    --button-radius: calc(var(--canvas-radius) - var(--canvas-padding));

    line-height: calc(var(--canvas-size) / 8);
  }

  canvas {
    inline-size: var(--canvas-size);
    aspect-ratio: 1;
    border-radius: 30px;
    background-color: hsl(227, 70%, 59%);
    background-size: 12.5% 12.5%;
    background-image:
      linear-gradient(to right, #fff2 1px, transparent 1px),
      linear-gradient(to bottom, #fff2 1px, transparent 1px);
  }

  form {
    position: absolute;
    inset-block-end: 0;
    inset-inline-start: 0;
    inset-inline-end: 0;
    padding: var(--canvas-padding);

    display: flex;
    align-items: start;
    justify-content: space-between;
  }

  button[type="reset"] {
    font: inherit;
    background: #fff5;
    user-select: none;
    appearance: none;
    border: none;
    padding: 0.125lh;
    color: white;
    border-radius: 200px;
    backdrop-filter: blur(5px);

    display: flex;
    align-items: start;
    justify-content: center;

    block-size: 0.75lh;
    inline-size: 1.75lh;

    svg {
      block-size: 100%;
      aspect-ratio: 1;
    }
  }

  input[type="range"] {
    appearance: none;

    margin: 0;

    font: inherit;

    cursor: pointer;
    background: #fff5;
    border-radius: var(--button-radius);
    backdrop-filter: blur(5px);

    box-sizing: border-box;
    inline-size: 5.75lh;
    block-size: 0.75lh;

    padding: 0.125lh;

    &::-webkit-slider-thumb {
      appearance: none;
      padding: 0;
      margin: 0;
      border-radius: calc(var(--button-radius) - 5px);
      block-size: 0.5lh;
      aspect-ratio: 1;
      background: #ffffff;
    }

    &::-moz-range-thumb {
      appearance: none;
      box-shadow: none;
      border: none;
      padding: 0;
      margin: 0;
      border-radius: calc(var(--button-radius) - 5px);
      block-size: 0.5lh;
      inline-size: 0.5lh;
      background: #ffffff;
    }
  }
`);

await CanvasRenderer.initialize();

export class BrickRenderer extends HTMLElement {
  static #FILE_ATTRIBUTE = "file";

  static #COLOR_ATTRIBUTE = "color";

  static observedAttributes = [
    BrickRenderer.#FILE_ATTRIBUTE,
    BrickRenderer.#COLOR_ATTRIBUTE,
  ];

  static #INITIAL_COLOR = "#e04d4d";

  constructor() {
    super();

    this.color =
      this.getAttribute(BrickRenderer.#COLOR_ATTRIBUTE) ??
      BrickRenderer.#INITIAL_COLOR;

    const shadow = this.attachShadow({ mode: "open" });
    shadow.adoptedStyleSheets = [styleSheet];

    this.size = 512;

    this.canvas = document.createElement("canvas");
    this.canvas.width = this.size * window.devicePixelRatio;
    this.canvas.height = this.size * window.devicePixelRatio;

    this.stopOrbiting = () => {
      window.removeEventListener("pointermove", this.orbit);
    };

    /**
     * @param {PointerEvent} e
     */
    this.startOrbiting = (e) => {
      window.addEventListener("pointerup", this.stopOrbiting, {
        passive: true,
      });
      window.addEventListener("pointermove", this.orbit, { passive: true });
    };

    this.canvas.addEventListener("pointerdown", this.startOrbiting, {
      passive: true,
    });

    this.renderer = new CanvasRenderer(this.canvas);

    this.form = this.#createForm();

    shadow.append(this.canvas, this.form);

    this.file = this.getAttribute(BrickRenderer.#FILE_ATTRIBUTE);
  }

  async connectedCallback() {
    if (!this.file) {
      return;
    }

    await this.load(this.file);
    this.update();
  }

  disconnectedCallback() {
    this.canvas.removeEventListener("pointerdown", this.startOrbiting);
    window.removeEventListener("pointermove", this.orbit);
    window.removeEventListener("pointerup", this.stopOrbiting);
  }

  /**
   * @param {string} name
   * @param {string} _oldValue
   * @param {string} newValue
   */
  async attributeChangedCallback(name, _oldValue, newValue) {
    if (!this.isConnected) {
      return;
    }

    switch (name) {
      case BrickRenderer.#FILE_ATTRIBUTE: {
        await this.load(newValue);
        break;
      }
      case BrickRenderer.#COLOR_ATTRIBUTE: {
        this.color = newValue;
        break;
      }
    }

    this.update();
  }

  /** @type {(event: PointerEvent) => void} */
  orbit = (event) => {
    if (!(event.buttons & 1)) {
      return;
    }

    this.model?.transformation.rotateBy({
      z: event.movementX,
      x: -event.movementY,
    });

    this.update();
  };

  update() {
    if (!this.model) {
      return;
    }

    this.renderer.render(this.model);
  }

  reset() {
    this.model?.transformation.reset();
    this.update();
  }

  /**
   * @param {string} fileName
   */
  async load(fileName) {
    this.model = await Model.for(fileName, Color.custom(this.color));
  }

  #createForm() {
    const form = document.createElement("form");

    const scale = this.#createSlider("Scale", "scale", "60", "10", "200", "1");

    const reset = document.createElement("button");
    reset.ariaLabel = "Reset";
    reset.type = "reset";

    const icon = this.#resetSvg();

    reset.appendChild(icon);

    form.append(scale, reset);
    form.addEventListener("reset", () => this.reset());

    return form;
  }

  /**
   * @param {string} labelText
   * @param {string} name
   * @param {string} value
   * @param {string} min
   * @param {string} max
   * @param {string} step
   */
  #createSlider(labelText, name, value, min, max, step = "1") {
    const label = document.createElement("label");
    label.ariaLabel = labelText;
    const input = document.createElement("input");
    input.type = "range";
    input.name = name;
    input.step = step;
    input.min = min;
    input.max = max;
    input.defaultValue = value;

    const update = () => {
      this.model?.transformation.scale(Number.parseFloat(input.value) / 100);

      this.update();
    };

    input.addEventListener("input", update, { passive: true });

    label.appendChild(input);

    return label;
  }

  #resetSvg() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 60 60");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("fill", "currentColor");
    path.setAttribute(
      "d",
      `
      M 8,33 A 22,22 0 1,0 30,13 h -4 l 10,-10 h -5 l -11,11 h 1.75 v -1 a 2,2 0 0,0 0,4 v -1 h -1.75 l 11,11 h 5 l -10,-10 h 4 A 18,18 0 1,1 12,33 a 2,2 0 1,0 -4,0 z
    `
    );

    svg.appendChild(path);

    return svg;
  }
}

customElements.define("brick-renderer", BrickRenderer);
