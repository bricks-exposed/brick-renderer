import { File } from "./ldraw.js";
import * as matrix from "./matrix.js";

export class Renderer {
  /** @readonly @type {GPUVertexBufferLayout} */
  static #bufferLayout = {
    arrayStride: 3 * 4,
    attributes: [
      {
        format: "float32x3",
        offset: 0,
        shaderLocation: 0,
      },
    ],
  };

  /** @readonly @type {GPUDepthStencilState} */
  static #depthStencil = {
    depthWriteEnabled: true,
    depthCompare: "greater",
    format: "depth24plus",
  };

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {File} file
   */
  static async for(canvas, file) {
    const context = canvas.getContext("webgpu");
    if (!context) {
      throw new Error("Could not get canvas webgpu context");
    }

    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      throw new Error("No appropriate GPUAdapter found.");
    }

    const device = await adapter.requestDevice();

    const format = navigator.gpu.getPreferredCanvasFormat();

    context.configure({ device, format });

    return new Renderer(device, format, context, file);
  }

  /**
   * @param {GPUDevice} device
   * @param {GPUTextureFormat} format
   * @param {GPUCanvasContext} context
   * @param {File} file
   */
  constructor(device, format, context, file) {
    this.device = device;
    this.context = context;

    this.uniformBuffer = device.createBuffer({
      label: "Rotation matrix",
      size: 16 * 4,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    });

    const bindGroupLayout = device.createBindGroupLayout({
      label: "Rotation uniform bind group layout",
      entries: [
        {
          binding: 0,
          visibility:
            GPUShaderStage.VERTEX |
            GPUShaderStage.FRAGMENT |
            GPUShaderStage.COMPUTE,
          buffer: { type: "uniform" },
        },
      ],
    });

    this.bindGroup = device.createBindGroup({
      label: "Rotation uniform group",
      layout: bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: { buffer: this.uniformBuffer },
        },
      ],
    });

    const pipelineLayout = device.createPipelineLayout({
      label: "Rotation uniform pipeline layout",
      bindGroupLayouts: [bindGroupLayout],
    });

    const edgeShaderModule = device.createShaderModule({
      label: "Edge shader",
      code: EDGE_SHADER,
    });

    const edgePipeline = device.createRenderPipeline({
      label: "Edge pipeline",
      layout: pipelineLayout,
      primitive: { topology: "line-list" },
      depthStencil: Renderer.#depthStencil,
      vertex: {
        module: edgeShaderModule,
        entryPoint: "vertexMain",
        buffers: [Renderer.#bufferLayout],
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

    const trianglePipeline = device.createRenderPipeline({
      label: "Triangle pipeline",
      layout: pipelineLayout,
      primitive: { cullMode: "back" },
      depthStencil: {
        ...Renderer.#depthStencil,
        // Push triangles backwards slightly
        // so that edges are rendered above faces
        depthBias: -1,
        depthBiasSlopeScale: -1.0,
      },
      vertex: {
        module: triangleShaderModule,
        entryPoint: "vertexMain",
        buffers: [Renderer.#bufferLayout],
      },
      fragment: {
        module: triangleShaderModule,
        entryPoint: "fragmentMain",
        targets: [{ format }],
      },
    });

    this.egdeRender = {
      ...this.#getRenderDescriptor(new Float32Array(file.edges)),
      pipeline: edgePipeline,
    };
    this.triangleRender = {
      ...this.#getRenderDescriptor(new Float32Array(file.triangles)),
      pipeline: trianglePipeline,
    };
  }

  /**
   * @param {Transform} transform
   */
  render(transform) {
    const transformMatrix = Renderer.#transformMatrix(transform);
    this.device.queue.writeBuffer(this.uniformBuffer, 0, transformMatrix);

    const encoder = this.device.createCommandEncoder();

    const canvasTexture = this.context.getCurrentTexture();
    const canvasTextureView = canvasTexture.createView();
    const depthTexture = this.device.createTexture({
      size: [canvasTexture.width, canvasTexture.height],
      format: Renderer.#depthStencil.format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    const pass = encoder.beginRenderPass({
      label: "Draw it all",
      colorAttachments: [
        {
          view: canvasTextureView,
          loadOp: "clear",
          storeOp: "store",
          clearValue: { r: 0.217, g: 0.427, b: 0.878, a: 1 },
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

    Renderer.#renderThing(this.egdeRender, pass);
    Renderer.#renderThing(this.triangleRender, pass);

    pass.end();

    this.device.queue.submit([encoder.finish()]);
  }

  /**
   *
   * @param {RenderDescriptor} render
   * @param {GPURenderPassEncoder} pass
   */
  static #renderThing(render, pass) {
    if (!render.count) {
      return;
    }

    pass.setPipeline(render.pipeline);
    pass.setVertexBuffer(0, render.vertexBuffer);
    pass.draw(render.count);
  }

  /**
   * @param {Transform} transform
   *
   * @returns {Float32Array<ArrayBuffer>}
   */
  static #transformMatrix(transform) {
    return new Float32Array(
      matrix.transform(
        [
          matrix.orthographic(-1, 1, -1, 1, -10, 10),
          matrix.fromRotationX(transform.rotateX),
          matrix.fromRotationY(transform.rotateY),
          matrix.fromRotationZ(transform.rotateZ),
          matrix.fromScaling(transform.scale),
        ],
        matrix.identity
      )
    );
  }

  /**
   * @param {Float32Array<ArrayBuffer>} vertices
   */
  #getRenderDescriptor(vertices) {
    const vertexBuffer = this.device.createBuffer({
      size: vertices.byteLength,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX,
    });
    this.device.queue.writeBuffer(vertexBuffer, 0, vertices);

    return {
      count: vertices.length / 3,
      vertexBuffer,
    };
  }
}

/**
 * @typedef {{
 *   rotateX: number;
 *   rotateY: number;
 *   rotateZ: number;
 *   scale: number;
 * }} Transform
 */

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

  @vertex
  fn vertexMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    output.position = rotationMatrix * input.position;
    return output;
  }

  @fragment
  fn fragmentMain() -> @location(0) vec4f {
    return vec4(1.0, 1.0, 1.0, 1.0);
  }
  `;

const TRIANGLE_SHADER = `
  struct VertexInput {
    @location(0) position: vec4f,
  }

  struct VertexOutput {
    @builtin(position) position: vec4f,
  }

  @group(0) @binding(0) var<uniform> rotationMatrix: mat4x4f;

  @vertex
  fn vertexMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    output.position = rotationMatrix * input.position;
    return output;
  }

  @fragment
  fn fragmentMain() -> @location(0) vec4f {
    return vec4(0.0, 1.0, 0.0, 1.0);
  }
  `;
