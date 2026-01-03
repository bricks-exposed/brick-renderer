import { WorkerRenderer } from "./worker-renderer.js";

const styleSheet = new CSSStyleSheet();
styleSheet.replaceSync(`
  canvas {
    inline-size: 512px;
    aspect-ratio: 1;
    border-radius: 20px;
    background-color: hsl(227, 70%, 59%);
    background-size: 12.5% 12.5%;
    background-image:
      linear-gradient(to right, #fff2 1px, transparent 1px),
      linear-gradient(to bottom, #fff2 1px, transparent 1px);
    overflow: auto;
  }
`);

export class BrickRenderer extends HTMLElement {
  static #FILE_ATTRIBUTE = "file";

  static observedAttributes = [BrickRenderer.#FILE_ATTRIBUTE];

  /** @type {Promise<WorkerRenderer>} */
  renderer;

  constructor() {
    super();

    this.color = "#e04d4d";
    this.transform = {
      rotateX: 60,
      rotateY: 0,
      rotateZ: 45,
      scale: 0.6,
    };

    const shadow = this.attachShadow({ mode: "open" });
    shadow.adoptedStyleSheets = [styleSheet];

    this.size = 512;

    this.canvas = document.createElement("canvas");
    this.canvas.width = this.size * window.devicePixelRatio;
    this.canvas.height = this.size * window.devicePixelRatio;

    this.canvas.addEventListener("pointermove", (e) => this.orbit(e), {
      passive: true,
    });

    this.renderer = WorkerRenderer.attach(this.canvas);

    this.form = this.createForm();

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
    }

    await this.update();
  }

  /**
   * @param {PointerEvent} event
   */
  async orbit(event) {
    if (!(event.buttons & 1)) {
      return;
    }

    this.transform = {
      ...this.transform,
      rotateZ: (this.transform.rotateZ + event.movementX) % 360,
      rotateX: (this.transform.rotateX - event.movementY) % 360,
    };

    await this.update();
  }

  async update() {
    const renderer = await this.renderer;

    const { rotateX, rotateY, rotateZ } = this.transform;

    renderer.render(this.color, {
      ...this.transform,
      rotateX: (rotateX * Math.PI) / 180,
      rotateY: (rotateY * Math.PI) / 180,
      rotateZ: (rotateZ * Math.PI) / 180,
    });
  }

  /**
   * @param {string} fileName
   */
  async load(fileName) {
    const renderer = await this.renderer;
    await renderer.load(fileName);
  }

  /**
   * @param {HTMLFormElement} form
   */
  inputs(form) {
    const data = new FormData(form);
    const scale = Number.parseFloat(data.get("scale")?.toString() ?? "0");

    const transform = {
      ...this.transform,
      scale,
    };

    const color = data.get("color")?.toString() ?? this.color;
    return { color, transform };
  }

  createForm() {
    const form = document.createElement("form");

    const scale = this.createSlider(
      "Scale",
      "scale",
      "0.6",
      "0.01",
      "2",
      "0.1"
    );

    const colorLabel = document.createElement("label");
    colorLabel.textContent = "Color";
    const colorInput = document.createElement("input");
    colorInput.type = "color";
    colorInput.name = "color";
    colorInput.value = this.color;
    colorLabel.appendChild(colorInput);

    form.append(scale, colorLabel);

    const update = () => {
      const { color, transform } = this.inputs(form);
      this.color = color;
      this.transform = transform;
      this.update();
    };

    form.addEventListener("input", update);
    form.addEventListener("reset", update);

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
  createSlider(labelText, name, value, min, max, step = "1") {
    const label = document.createElement("label");
    label.textContent = labelText;
    const input = document.createElement("input");
    input.type = "range";
    input.name = name;
    input.min = min;
    input.max = max;
    input.step = step;
    input.defaultValue = value;

    label.appendChild(input);

    return label;
  }
}

customElements.define("brick-renderer", BrickRenderer);
