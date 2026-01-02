/** @import {Transform} from "./ldraw.js" */
import { Color, Colors, Part } from "./ldraw.js";

/** @satisfies {GPUDepthStencilState} */
const DEPTH_STENCIL = {
  depthWriteEnabled: true,
  depthCompare: "greater",
  format: "depth24plus",
};

export class GpuRenderer {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  to(canvas) {
    return new CanvasRenderer(this, canvas);
  }

  /**
   * @param {Part} part
   */
  load(part) {
    return new PartGeometry(this, part);
  }

  /**
   * @param {GPUDevice} device
   * @param {GPUTextureFormat} format
   * @param {Colors} colors
   */
  constructor(device, format, colors) {
    this.device = device;
    this.format = format;
    this.colors = colors;

    const highestCode = colors.all.reduce(
      (acc, { code }) => Math.max(acc, code),
      0
    );

    const textureWidth = 256;
    const textureHeight = Math.ceil((highestCode + 1) / textureWidth);
    const textureData = new Uint8Array(textureWidth * textureHeight * 4);
    for (const color of colors.all) {
      textureData.set(color.rgba, color.code * 4);
    }

    this.colorTexture = device.createTexture({
      label: "Color map texture",
      format: "rgba8unorm",
      size: { width: textureWidth, height: textureHeight },
      usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
    });
    device.queue.writeTexture(
      { texture: this.colorTexture },
      textureData,
      { bytesPerRow: textureWidth * 4 },
      { width: textureWidth, height: textureHeight }
    );

    this.bindGroupLayout = device.createBindGroupLayout({
      label: "Rotation and color uniform bind group layout",
      entries: [
        {
          binding: 0,
          visibility:
            GPUShaderStage.VERTEX |
            GPUShaderStage.FRAGMENT |
            GPUShaderStage.COMPUTE,
          buffer: { type: "uniform" },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.COMPUTE,
          buffer: { type: "uniform" },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          texture: { sampleType: "float" },
        },
      ],
    });

    const pipelineLayout = device.createPipelineLayout({
      label: "Rotation uniform pipeline layout",
      bindGroupLayouts: [this.bindGroupLayout],
    });

    const edgeShaderModule = device.createShaderModule({
      label: "Edge shader",
      code: EDGE_SHADER,
    });

    this.linePipeline = device.createRenderPipeline({
      label: "Edge pipeline",
      layout: pipelineLayout,
      primitive: { topology: "line-list" },
      depthStencil: DEPTH_STENCIL,
      vertex: {
        module: edgeShaderModule,
        entryPoint: "vertexMain",
        buffers: [
          {
            arrayStride: 3 * 4,
            attributes: [
              {
                format: "float32x3",
                offset: 0,
                shaderLocation: 0,
              },
            ],
          },
        ],
      },
      fragment: {
        module: edgeShaderModule,
        entryPoint: "fragmentMain",
        targets: [{ format }],
      },
    });

    const triangleShaderModule = device.createShaderModule({
      label: "Triangle shader",
      code: TRIANGLE_SHADER,
    });

    /** @satisfies {GPURenderPipelineDescriptor} */
    const trianglePipelineDescriptor = {
      layout: pipelineLayout,
      primitive: { cullMode: "back" },
      depthStencil: {
        ...DEPTH_STENCIL,
        // Push triangles backwards slightly
        // so that edges are rendered above faces
        depthBias: -1,
        depthBiasSlopeScale: -1.0,
      },
      vertex: {
        module: triangleShaderModule,
        entryPoint: "vertexMain",
        buffers: [
          {
            arrayStride: 4 * 4,
            attributes: [
              {
                format: "float32x3",
                offset: 0,
                shaderLocation: 0,
              },
              {
                format: "float32",
                offset: 3 * 4,
                shaderLocation: 1,
              },
            ],
          },
        ],
      },
      fragment: {
        module: triangleShaderModule,
        entryPoint: "fragmentMain",
        targets: [
          {
            format,
            blend: {
              color: {
                operation: "add",
                srcFactor: "one",
                dstFactor: "one-minus-src-alpha",
              },
              alpha: {
                operation: "add",
                srcFactor: "one",
                dstFactor: "one-minus-src-alpha",
              },
            },
          },
        ],
      },
    };

    this.opaqueTrianglePipeline = device.createRenderPipeline({
      ...trianglePipelineDescriptor,
      label: "Opaque triangle render pipeline",
    });

    this.transparentTrianglePipeline = device.createRenderPipeline({
      ...trianglePipelineDescriptor,
      label: "Transparent triangle pipeline",
      depthStencil: {
        ...trianglePipelineDescriptor.depthStencil,

        // Transparent triangles shouldn't block other triangles
        depthWriteEnabled: false,
      },
    });

    const optionalLineShaderModule = device.createShaderModule({
      label: "Optional line shader",
      code: OPTIONAL_LINE_SHADER,
    });

    this.optionalLinePipeline = device.createRenderPipeline({
      label: "Optional line pipeline",
      layout: pipelineLayout,
      primitive: { topology: "line-list" },
      depthStencil: DEPTH_STENCIL,
      vertex: {
        module: optionalLineShaderModule,
        entryPoint: "vertexMain",
        buffers: [
          {
            // Instance buffer: 4 vec3f points (p1, p2, c1, c2) = 12 floats
            arrayStride: 12 * 4,
            stepMode: "instance",
            attributes: [
              {
                format: "float32x3",
                offset: 0,
                shaderLocation: 0, // point 1
              },
              {
                format: "float32x3",
                offset: 12,
                shaderLocation: 1, // point 2
              },
              {
                format: "float32x3",
                offset: 24,
                shaderLocation: 2, // control point 1
              },
              {
                format: "float32x3",
                offset: 36,
                shaderLocation: 3, // control point 2
              },
            ],
          },
        ],
      },
      fragment: {
        module: optionalLineShaderModule,
        entryPoint: "fragmentMain",
        targets: [{ format }],
      },
    });
  }

  /**
   * @param {GPUBuffer} uniformBuffer
   * @param {GPUBuffer} colorBuffer
   */
  createBindGroup(uniformBuffer, colorBuffer) {
    return this.device.createBindGroup({
      label: "Rotation uniform group",
      layout: this.bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: { buffer: uniformBuffer },
        },
        {
          binding: 1,
          resource: { buffer: colorBuffer },
        },
        {
          binding: 2,
          resource: this.colorTexture.createView(),
        },
      ],
    });
  }

  /**
   * @param {Colors} colors
   */
  static async create(colors) {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error("No appropriate GPUAdapter found.");
    }

    const device = await adapter.requestDevice();

    const format = navigator.gpu.getPreferredCanvasFormat();

    return new GpuRenderer(device, format, colors);
  }
}

class PartGeometry {
  #part;

  #gpu;

  #lines;

  #optionalLines;

  #opaqueTriangles;

  #transparentTriangles;

  /**
   * @param {GpuRenderer} gpu
   * @param {Part} part
   */
  constructor(gpu, part) {
    this.#gpu = gpu;
    this.#part = part;

    const { lines: rawLines, triangles: rawTriangles } = this.#part.render();

    /** @type {number[]} */
    const lines = [];

    /** @type {number[]} */
    const optionalLines = [];

    /** @type {number[]} */
    const opaqueTriangles = [];

    /** @type {number[]} */
    const transparentTriangles = [];

    for (const line of rawLines) {
      const points = line.points.flat();
      if (line.controlPoints) {
        optionalLines.push(...points, ...line.controlPoints.flat());
      } else {
        lines.push(...points);
      }
    }

    for (const { vertices, color: colorCode } of rawTriangles) {
      const color = this.#gpu.colors.for(colorCode);
      const array = color?.opaque ? opaqueTriangles : transparentTriangles;
      for (const vertex of vertices) {
        array.push(...vertex, colorCode ?? -1);
      }
    }

    this.#lines = this.#loadGeometry(
      new Float32Array(lines),
      3,
      gpu.linePipeline
    );

    this.#optionalLines = this.#loadGeometry(
      new Float32Array(optionalLines),
      12,
      gpu.optionalLinePipeline
    );

    this.#opaqueTriangles = this.#loadGeometry(
      new Float32Array(opaqueTriangles),
      4,
      gpu.opaqueTrianglePipeline
    );

    this.#transparentTriangles = this.#loadGeometry(
      new Float32Array(transparentTriangles),
      4,
      gpu.transparentTrianglePipeline
    );
  }

  /**
   * @param {GPURenderPassEncoder} pass
   */
  render(pass) {
    this.#render(pass, this.#opaqueTriangles);
    this.#render(pass, this.#lines);
    this.#renderOptionalLines(pass);
    this.#render(pass, this.#transparentTriangles);
  }

  /**
   * @param {Transform} transform
   */
  transformMatrix(transform) {
    return this.#part.transformMatrix(transform);
  }

  /**
   *
   * @param {Float32Array<ArrayBuffer>} data
   * @param {number} itemSize
   * @param {GPURenderPipeline} pipeline
   * @returns
   */
  #loadGeometry(data, itemSize, pipeline) {
    const buffer = this.#gpu.device.createBuffer({
      size: data.byteLength,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX,
    });
    this.#gpu.device.queue.writeBuffer(buffer, 0, data);

    return { buffer, pipeline, count: data.length / itemSize };
  }

  /**
   * @param {GPURenderPassEncoder} pass
   */
  #renderOptionalLines(pass) {
    if (this.#optionalLines.count === 0) {
      return;
    }

    pass.setPipeline(this.#optionalLines.pipeline);
    pass.setVertexBuffer(0, this.#optionalLines.buffer);
    pass.draw(2, this.#optionalLines.count);
  }

  /**
   * @param {GPURenderPassEncoder} pass
   * @param {{ pipeline: GPURenderPipeline, buffer: GPUBuffer, count: number }} geometry
   */
  #render(pass, geometry) {
    if (geometry.count === 0) {
      return;
    }

    pass.setPipeline(geometry.pipeline);
    pass.setVertexBuffer(0, geometry.buffer);
    pass.draw(geometry.count);
  }
}

class CanvasRenderer {
  /**
   * @param {GpuRenderer} gpu
   * @param {HTMLCanvasElement} canvas
   */
  constructor(gpu, canvas) {
    this.gpu = gpu;

    // Smoother lines on high resolution displays
    const devicePixelRatio = window.devicePixelRatio;
    canvas.width = canvas.clientWidth * devicePixelRatio;
    canvas.height = canvas.clientHeight * devicePixelRatio;

    this.context = this.#getContext(canvas);

    this.context.configure({
      device: gpu.device,
      format: gpu.format,
      alphaMode: "premultiplied",
    });

    this.colorBuffer = this.gpu.device.createBuffer({
      label: "Default color",
      size: 4 * 4,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    });

    this.uniformBuffer = this.gpu.device.createBuffer({
      label: "Rotation matrix",
      size: 16 * 4,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    });

    this.bindGroup = this.gpu.createBindGroup(
      this.uniformBuffer,
      this.colorBuffer
    );
  }

  /**
   * @param {HTMLCanvasElement} canvas
   */
  #getContext(canvas) {
    const context = canvas.getContext("webgpu");
    if (!context) {
      throw new Error("Could not get canvas webgpu context");
    }
    return context;
  }

  /**
   * @param {PartGeometry | Part} geometry
   */
  load(geometry) {
    this.geometry =
      geometry instanceof PartGeometry
        ? geometry
        : new PartGeometry(this.gpu, geometry);
  }

  /**
   * @param {Color} color
   * @param {Transform} transform
   */
  render(color, transform) {
    if (!this.geometry) {
      throw new Error("Need to load a part first!");
    }

    const device = this.gpu.device;

    const transformMatrix = this.geometry.transformMatrix(transform);

    device.queue.writeBuffer(
      this.uniformBuffer,
      0,
      new Float32Array(transformMatrix)
    );

    device.queue.writeBuffer(this.colorBuffer, 0, new Float32Array(color.rgba));

    const encoder = device.createCommandEncoder();

    const canvasTexture = this.context.getCurrentTexture();
    const canvasTextureView = canvasTexture.createView();
    const depthTexture = device.createTexture({
      size: [canvasTexture.width, canvasTexture.height],
      format: DEPTH_STENCIL.format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    const pass = encoder.beginRenderPass({
      label: "Draw it all",
      colorAttachments: [
        {
          view: canvasTextureView,
          loadOp: "clear",
          storeOp: "store",
          // clearValue: { r: 0.302, g: 0.427, b: 0.878, a: 1 },
        },
      ],
      depthStencilAttachment: {
        view: depthTexture,
        depthClearValue: 0,
        depthLoadOp: "clear",
        depthStoreOp: "store",
      },
    });

    pass.setBindGroup(0, this.bindGroup);

    this.geometry.render(pass);

    pass.end();

    device.queue.submit([encoder.finish()]);
  }
}

/**
 * @typedef {{
 *   count: number;
 *   vertexBuffer: GPUBuffer;
 *   pipeline: GPURenderPipeline;
 * }} RenderDescriptor
 */

const EDGE_SHADER = `
  struct VertexInput {
    @location(0) position: vec4f,
  }

  struct VertexOutput {
    @builtin(position) position: vec4f,
  }

  @group(0) @binding(0) var<uniform> rotationMatrix: mat4x4f;

  @group(0) @binding(1) var<uniform> defaultColor: vec4f;

  @vertex
  fn vertexMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    output.position = rotationMatrix * input.position;
    return output;
  }

  @fragment
  fn fragmentMain() -> @location(0) vec4f {
    return vec4(0.0, 0.0, 0.0, 1.0);
  }
  `;

// dot((ci - p1) x (p2 - p1), view) > 0

const OPTIONAL_LINE_SHADER = `
  struct VertexInput {
    @location(0) p1: vec4f,
    @location(1) p2: vec4f,
    @location(2) c1: vec4f,
    @location(3) c2: vec4f,
  }

  struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) @interpolate(flat) shouldDiscard: f32,
  }

  @group(0) @binding(0) var<uniform> rotationMatrix: mat4x4f;

  @vertex
  fn vertexMain(
    input: VertexInput,
    @builtin(vertex_index) vertexIndex: u32
  ) -> VertexOutput {
    let p1 = rotationMatrix * input.p1;
    let p2 = rotationMatrix * input.p2;
    let c1 = rotationMatrix * input.c1;
    let c2 = rotationMatrix * input.c2;

    let edge = (p2 - p1).xyz;
    let toC1 = (c1 - p1).xyz;
    let toC2 = (c2 - p1).xyz;

    // A vector pointing at the camera — hardcoded for now.
    let viewNormal = vec3f(0.0, 0.0, 1.0);

    // The cross product gives us a vector perpendicular
    // to both the edge and the control points.
    // The dot product then gets us the magnitude along
    // the camera's vector.
    let cross1 = dot(cross(edge, toC1), viewNormal);
    let cross2 = dot(cross(edge, toC2), viewNormal);

    // Only render an optional line if the control
    // points are on either side. If one point is
    // "behind" the edge from the camera's perspective
    // and the other is in "front", then their magnitudes
    // will have different signs and their product will
    // be negative.
    let shouldShow = cross1 * cross2 < 0.0;

    // We need to render two points to make a line,
    // so every pass we flip betwen the first point and the second.
    let endpointIndex = vertexIndex & 1u;
    let point = select(p1, p2, endpointIndex == 1u);

    var output: VertexOutput;
    output.position = point;
    output.shouldDiscard = select(1.0, 0.0, shouldShow);
    return output;
  }

  @fragment
  fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
    // Discard fragments where the line shouldn't be drawn
    if (input.shouldDiscard < 0.5) {
      discard;
    }
    return vec4f(0.0, 0.0, 0.0, 1.0);
  }
`;

const TRIANGLE_SHADER = `
  struct VertexInput {
    @location(0) position: vec4f,
    @location(1) color: f32,
  }

  struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) color: f32,
  }

  @group(0) @binding(0) var<uniform> rotationMatrix: mat4x4f;

  @group(0) @binding(1) var<uniform> defaultColor: vec4f;

  @group(0) @binding(2) var colorTexture: texture_2d<f32>;

  @vertex
  fn vertexMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    output.position = rotationMatrix * input.position;
    output.color = input.color;
    return output;
  }

  @fragment
  fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
    let colorIndex = i32(input.color);

    var color: vec4f;

    if (colorIndex == -1) {
      color = defaultColor / 255;
    } else {
      let x = colorIndex % 256;
      let y = colorIndex / 256;
      color = textureLoad(colorTexture, vec2i(x, y), 0);
    }

    return color * color.w;
  }
  `;
