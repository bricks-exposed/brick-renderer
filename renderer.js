import { Color, Part } from "./ldraw.js";
import * as matrix from "./matrix.js";

export class Renderer {
  /** @readonly @type {GPUVertexBufferLayout} */
  static #optionalLineBufferLayout = {
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
  };

  /** @readonly @type {GPUDepthStencilState} */
  static #depthStencil = {
    depthWriteEnabled: true,
    depthCompare: "greater",
    format: "depth24plus",
  };

  /**
   * @param {HTMLCanvasElement} canvas
   * @param {Part} part
   */
  static async for(canvas, part) {
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

    context.configure({ device, format, alphaMode: "premultiplied" });

    return new Renderer(device, format, context, part);
  }

  /**
   * @param {GPUDevice} device
   * @param {GPUTextureFormat} format
   * @param {GPUCanvasContext} context
   * @param {Part} part
   */
  constructor(device, format, context, part) {
    this.device = device;
    this.context = context;

    this.colorBuffer = device.createBuffer({
      label: "Default color",
      size: 4 * 4,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    });

    this.uniformBuffer = device.createBuffer({
      label: "Rotation matrix",
      size: 16 * 4,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    });

    const bindGroupLayout = device.createBindGroupLayout({
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
        {
          binding: 1,
          resource: { buffer: this.colorBuffer },
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
        ...Renderer.#depthStencil,
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
            arrayStride: 7 * 4,
            attributes: [
              {
                format: "float32x3",
                offset: 0,
                shaderLocation: 0,
              },
              {
                format: "float32x4",
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

    const opaqueTriangePipeline = device.createRenderPipeline({
      ...trianglePipelineDescriptor,
      label: "Opaque triangle render pipeline",
    });

    const transparentTriangePipeline = device.createRenderPipeline({
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

    const optionalLinePipeline = device.createRenderPipeline({
      label: "Optional line pipeline",
      layout: pipelineLayout,
      primitive: { topology: "line-list" },
      depthStencil: Renderer.#depthStencil,
      vertex: {
        module: optionalLineShaderModule,
        entryPoint: "vertexMain",
        buffers: [Renderer.#optionalLineBufferLayout],
      },
      fragment: {
        module: optionalLineShaderModule,
        entryPoint: "fragmentMain",
        targets: [{ format }],
      },
    });

    const {
      lines,
      optionalLines,
      opaqueTriangles,
      transparentTriangles,
      largestExtent,
      center,
    } = part.render();

    this.viewBox = largestExtent / 2;
    this.center = center;

    const edgeVertexBuffer = this.device.createBuffer({
      size: lines.byteLength,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX,
    });
    this.device.queue.writeBuffer(edgeVertexBuffer, 0, lines);
    this.edgeRender = {
      count: lines.length / 3,
      vertexBuffer: edgeVertexBuffer,
      pipeline: edgePipeline,
    };

    const opaqueTriangleVertexBuffer = this.device.createBuffer({
      size: opaqueTriangles.byteLength,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX,
    });
    this.device.queue.writeBuffer(
      opaqueTriangleVertexBuffer,
      0,
      opaqueTriangles
    );
    this.opaqueTriangleRender = {
      count: opaqueTriangles.length / 7,
      vertexBuffer: opaqueTriangleVertexBuffer,
      pipeline: opaqueTriangePipeline,
    };

    const transparentTriangleVertexBuffer = this.device.createBuffer({
      size: transparentTriangles.byteLength,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX,
    });
    this.device.queue.writeBuffer(
      transparentTriangleVertexBuffer,
      0,
      transparentTriangles
    );
    this.transparentTriangleRender = {
      count: transparentTriangles.length / 7,
      vertexBuffer: transparentTriangleVertexBuffer,
      pipeline: transparentTriangePipeline,
    };

    this.optionalLineRender = {
      count: optionalLines.length / 12, // 4 points × 3 coords = 12 per line
      vertexBuffer: this.device.createBuffer({
        size: optionalLines.byteLength,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX,
      }),
      pipeline: optionalLinePipeline,
    };

    this.device.queue.writeBuffer(
      this.optionalLineRender.vertexBuffer,
      0,
      optionalLines
    );
  }

  /**
   * @param {Color} color
   * @param {Transform} transform
   */
  render(color, transform) {
    const transformMatrix = this.#transformMatrix(transform);
    this.device.queue.writeBuffer(this.uniformBuffer, 0, transformMatrix);

    this.device.queue.writeBuffer(
      this.colorBuffer,
      0,
      new Float32Array(color.rgba)
    );

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

    if (this.opaqueTriangleRender.count > 0) {
      pass.setPipeline(this.opaqueTriangleRender.pipeline);
      pass.setVertexBuffer(0, this.opaqueTriangleRender.vertexBuffer);
      pass.draw(this.opaqueTriangleRender.count);
    }

    pass.setPipeline(this.edgeRender.pipeline);
    pass.setVertexBuffer(0, this.edgeRender.vertexBuffer);
    pass.draw(this.edgeRender.count);

    // Render optional lines
    pass.setPipeline(this.optionalLineRender.pipeline);
    pass.setVertexBuffer(0, this.optionalLineRender.vertexBuffer);
    pass.draw(2, this.optionalLineRender.count);

    if (this.transparentTriangleRender.count > 0) {
      pass.setPipeline(this.transparentTriangleRender.pipeline);
      pass.setVertexBuffer(0, this.transparentTriangleRender.vertexBuffer);
      pass.draw(this.transparentTriangleRender.count);
    }

    pass.end();

    this.device.queue.submit([encoder.finish()]);
  }

  /**
   * @param {Transform} transform
   *
   * @returns {Float32Array<ArrayBuffer>}
   */
  #transformMatrix(transform) {
    return new Float32Array(
      matrix.transform(
        [
          matrix.orthographic(
            -this.viewBox,
            this.viewBox,
            -this.viewBox,
            this.viewBox,
            -(this.viewBox * 2),
            this.viewBox * 2
          ),
          matrix.fromRotationX(transform.rotateX),
          matrix.fromRotationY(transform.rotateY),
          matrix.fromRotationZ(transform.rotateZ),
          matrix.fromScaling(transform.scale),
          matrix.fromTranslation(
            -this.center[0],
            -this.center[1],
            -this.center[2]
          ),
        ],
        matrix.identity
      )
    );
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
    @location(1) color: vec4f,
  }

  struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) color: vec4f,
  }

  @group(0) @binding(0) var<uniform> rotationMatrix: mat4x4f;

  @group(0) @binding(1) var<uniform> defaultColor: vec4f;

  @vertex
  fn vertexMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    output.position = rotationMatrix * input.position;
    output.color = input.color;
    return output;
  }

  @fragment
  fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
    var color = select(
      input.color,
      defaultColor,
      all(input.color.xyz == vec3(-1.0, -1.0, -1.0)))
      / 255;

    return color * color.w;
  }
  `;
