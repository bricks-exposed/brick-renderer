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
  }
`);

export class BrickRenderer extends HTMLElement {
  static #FILE_ATTRIBUTE = "file";

  static observedAttributes = [BrickRenderer.#FILE_ATTRIBUTE];

  /** @type {Promise<WorkerRenderer>} */
  renderer;

  constructor() {
    super();

    const shadow = this.attachShadow({ mode: "open" });
    shadow.adoptedStyleSheets = [styleSheet];

    const size = 512;

    this.canvas = document.createElement("canvas");
    this.canvas.width = size * window.devicePixelRatio;
    this.canvas.height = size * window.devicePixelRatio;

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

  async update() {
    const { color, transform } = BrickRenderer.inputs(this.form);

    const renderer = await this.renderer;

    renderer.render(color, transform);
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
   * @param {string} fileName
   */
  async load(fileName) {
    const renderer = await this.renderer;
    await renderer.load(fileName);
  }

  /**
   * @param {HTMLFormElement} form
   */
  static inputs(form) {
    const data = new FormData(form);

    const rotateX = Number.parseFloat(data.get("rotateX")?.toString() ?? "0");
    const rotateY = Number.parseFloat(data.get("rotateY")?.toString() ?? "0");
    const rotateZ = Number.parseFloat(data.get("rotateZ")?.toString() ?? "0");
    const scale = Number.parseFloat(data.get("scale")?.toString() ?? "0");

    const transform = {
      rotateX: (rotateX * Math.PI) / 180,
      rotateY: (rotateY * Math.PI) / 180,
      rotateZ: (rotateZ * Math.PI) / 180,
      scale,
    };

    const color = data.get("color")?.toString() ?? "#e04d4d";
    return { color, transform };
  }

  createForm() {
    const form = document.createElement("form");

    const rotateX = this.createSlider(
      "Rotate X",
      "rotateX",
      "60",
      "-180",
      "180"
    );

    const rotateY = this.createSlider(
      "Rotate Y",
      "rotateY",
      "0",
      "-180",
      "180"
    );

    const rotateZ = this.createSlider(
      "Rotate Z",
      "rotateZ",
      "45",
      "-180",
      "180"
    );

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
    colorInput.value = "#e04d4d";
    colorLabel.appendChild(colorInput);

    form.append(rotateX, rotateY, rotateZ, scale, colorLabel);

    const update = () => this.update();

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
