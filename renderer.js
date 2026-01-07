/** @import { Matrix } from "./matrix.js" */
/** @import { PartGeometry } from "./ldraw.js"  */
import { Color } from "./ldraw.js";

/** @satisfies {GPUDepthStencilState} */
const DEPTH_STENCIL = {
  depthWriteEnabled: true,
  depthCompare: "greater",
  format: "depth24plus",
};

export class GpuRenderer {
  #linePipeline;

  #optionalLinePipeline;

  #opaqueTrianglePipeline;

  #transparentTrianglePipeline;

  #studOpaqueTrianglePipeline;

  #studTransparentTrianglePipeline;

  #studLinePipeline;

  #studOptionalLinePipeline;

  #bindGroupLayout;

  #colorTexture;

  /**
   * @type {Map<string, PreparedGeometry>}
   */
  #preparedGeometries = new Map();

  /**
   *
   * @param {{
   *   width: number;
   *   height: number;
   *   createView(): GPUTextureView
   * }} target
   */
  prepare(target) {
    const colorBuffer = this.device.createBuffer({
      label: "Default color",
      size: 4 * 4,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    });

    const uniformBuffer = this.device.createBuffer({
      label: "Rotation matrix",
      size: 16 * 4,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.UNIFORM,
    });

    const bindGroup = this.#createBindGroup(uniformBuffer, colorBuffer);

    const depthTexture = this.device.createTexture({
      size: [target.width, target.height],
      format: DEPTH_STENCIL.format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    const device = this.device;

    /**
     * @param {Color} color
     * @param {Matrix} transformMatrix
     * @param {PartGeometry} geometry
     * @param {PartGeometry} stud
     */
    return (color, transformMatrix, geometry, stud) => {
      const { lines, optionalLines, triangles, studs } =
        this.#prepareGeometry(geometry);

      const studGeometry = this.#prepareGeometry(stud);

      device.queue.writeBuffer(
        uniformBuffer,
        0,
        new Float32Array(transformMatrix)
      );

      device.queue.writeBuffer(colorBuffer, 0, new Float32Array(color.rgba));

      const encoder = device.createCommandEncoder();

      const pass = encoder.beginRenderPass({
        label: "Draw it all",
        colorAttachments: [
          {
            view: target.createView(),
            loadOp: "clear",
            storeOp: "store",
            // clearValue: { r: 0.302, g: 0.427, b: 0.878, a: 1 },
          },
        ],
        depthStencilAttachment: {
          view: depthTexture.createView(),
          depthClearValue: 0,
          depthLoadOp: "clear",
          depthStoreOp: "store",
        },
      });

      pass.setBindGroup(0, bindGroup);

      GpuRenderer.#renderGeometryDescriptor(
        pass,
        triangles,
        this.#opaqueTrianglePipeline
      );
      GpuRenderer.#renderGeometryDescriptor(pass, lines, this.#linePipeline);
      GpuRenderer.#renderGeometryDescriptor(
        pass,
        optionalLines,
        this.#optionalLinePipeline
      );

      if (studs.count) {
        if (studGeometry.triangles.count) {
          pass.setPipeline(this.#studOpaqueTrianglePipeline);
          pass.setVertexBuffer(0, studs.buffer);
          pass.setVertexBuffer(1, studGeometry.triangles.buffer);
          pass.draw(studGeometry.triangles.count, studs.count);
        }

        pass.setPipeline(this.#studLinePipeline);
        pass.setVertexBuffer(0, studs.buffer);
        pass.setVertexBuffer(1, studGeometry.lines.buffer);
        pass.draw(studGeometry.lines.count, studs.count);

        if (studGeometry.optionalLines.count) {
          pass.setPipeline(this.#studOptionalLinePipeline);
          pass.setVertexBuffer(0, studs.buffer);
          pass.setVertexBuffer(1, studGeometry.optionalLines.buffer);
          pass.draw(studGeometry.optionalLines.count, studs.count);
        }
      }

      GpuRenderer.#renderGeometryDescriptor(
        pass,
        triangles,
        this.#transparentTrianglePipeline
      );

      if (studs.count && studGeometry.triangles.count) {
        pass.setPipeline(this.#studTransparentTrianglePipeline);
        pass.setVertexBuffer(0, studs.buffer);
        pass.setVertexBuffer(1, studGeometry.triangles.buffer);
        pass.draw(studGeometry.triangles.count, studs.count);
      }

      pass.end();

      device.queue.submit([encoder.finish()]);
    };
  }

  /**
   * @param {PartGeometry} geometry
   *
   * @returns {PreparedGeometry}
   */
  #prepareGeometry(geometry) {
    const cachedGeometry = this.#preparedGeometries.get(geometry.fileName);

    if (cachedGeometry) {
      return cachedGeometry;
    }

    const lines = this.#loadGeometry(geometry.lines, 3);

    const optionalLines = this.#loadGeometry(geometry.optionalLines, 12);

    const triangles = this.#loadGeometry(geometry.triangles, 4);

    const studs = this.#loadGeometry(
      geometry.studs,
      17 // 16 matrix points, 1 color code
    );

    const preparedGeometry = {
      lines,
      optionalLines,
      triangles,
      studs,
    };

    this.#preparedGeometries.set(geometry.fileName, preparedGeometry);

    return preparedGeometry;
  }

  /**
   * @param {GPURenderPassEncoder} pass
   * @param {GeometryRenderDescriptor} geometry
   * @param {GPURenderPipeline} pipeline
   */
  static #renderGeometryDescriptor(pass, geometry, pipeline) {
    if (geometry.count === 0) {
      return;
    }

    pass.setPipeline(pipeline);
    pass.setVertexBuffer(0, geometry.buffer);
    geometry.vertexCount != null
      ? pass.draw(geometry.vertexCount, geometry.count)
      : pass.draw(geometry.count);
  }

  /**
   * @param {Float32Array<ArrayBuffer>} data
   * @param {number} itemSize
   */
  #loadGeometry(data, itemSize) {
    const buffer = this.device.createBuffer({
      size: data.byteLength,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.VERTEX,
    });

    this.device.queue.writeBuffer(buffer, 0, data);

    return { buffer, count: data.length / itemSize };
  }

  /**
   * @param {GPUDevice} device
   * @param {GPUTextureFormat} format
   * @param {readonly { code: number; rgba: number[] }[]} colors
   */
  constructor(device, format, colors) {
    this.device = device;
    this.format = format;

    const highestCode = colors.reduce(
      (acc, { code }) => Math.max(acc, code),
      0
    );

    const textureWidth = 256;
    const textureHeight = Math.ceil((highestCode + 1) / textureWidth);
    const textureData = new Uint8Array(textureWidth * textureHeight * 4);
    for (const color of colors) {
      textureData.set(color.rgba, color.code * 4);
    }

    this.#colorTexture = device.createTexture({
      label: "Color map texture",
      format: "rgba8unorm",
      size: { width: textureWidth, height: textureHeight },
      usage: GPUTextureUsage.COPY_DST | GPUTextureUsage.TEXTURE_BINDING,
    });
    device.queue.writeTexture(
      { texture: this.#colorTexture },
      textureData,
      { bytesPerRow: textureWidth * 4 },
      { width: textureWidth, height: textureHeight }
    );

    this.#bindGroupLayout = device.createBindGroupLayout({
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
      bindGroupLayouts: [this.#bindGroupLayout],
    });

    const edgeFragmentShaderModule = device.createShaderModule({
      label: "Edge fragment shader",
      code: EDGE_FRAGMENT_SHADER,
    });

    const edgeShaderModule = device.createShaderModule({
      label: "Edge shader",
      code: EDGE_SHADER,
    });

    /** @satisfies {GPURenderPipelineDescriptor} */
    const linePipelineDescriptor = {
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
        module: edgeFragmentShaderModule,
        entryPoint: "fragmentMain",
        targets: [{ format }],
      },
    };

    this.#linePipeline = device.createRenderPipeline(linePipelineDescriptor);

    const triangleColorFragmentShader = device.createShaderModule({
      label: "Triangle color fragment shader",
      code: COLOR_FRAGMENT_SHADER,
    });

    const triangleShaderModule = device.createShaderModule({
      label: "Triangle shader",
      code: TRIANGLE_SHADER,
    });

    /** @type {GPUColorTargetState} */
    const transparencyTarget = {
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
    };

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
        module: triangleColorFragmentShader,
        entryPoint: "fragmentMain",
        targets: [transparencyTarget],
      },
    };

    this.#opaqueTrianglePipeline = device.createRenderPipeline({
      ...trianglePipelineDescriptor,
      label: "Opaque triangle render pipeline",
      fragment: {
        ...trianglePipelineDescriptor.fragment,
        constants: {
          transparent: 0,
        },
      },
    });

    this.#transparentTrianglePipeline = device.createRenderPipeline({
      ...trianglePipelineDescriptor,
      label: "Transparent triangle pipeline",
      depthStencil: {
        ...trianglePipelineDescriptor.depthStencil,

        // Transparent triangles shouldn't block other triangles
        depthWriteEnabled: false,
      },
      fragment: {
        ...trianglePipelineDescriptor.fragment,
        constants: {
          transparent: 1,
        },
      },
    });

    /** @satisfies {GPUVertexBufferLayout} */
    const studInstanceBuffers = {
      arrayStride: 17 * 4,
      stepMode: "instance",
      attributes: [
        // 4 matrix columns
        {
          format: "float32x4",
          offset: 0,
          shaderLocation: 0,
        },
        {
          format: "float32x4",
          offset: 16,
          shaderLocation: 1,
        },
        {
          format: "float32x4",
          offset: 32,
          shaderLocation: 2,
        },
        {
          format: "float32x4",
          offset: 48,
          shaderLocation: 3,
        },
        // Color code (unused for lines)
        {
          format: "float32",
          offset: 64,
          shaderLocation: 4,
        },
      ],
    };

    /**
     * @param {{ buffers: GPUVertexBufferLayout[]}} vertex
     */
    function offsetBuffersForStuds(vertex) {
      return vertex.buffers.map((b) => ({
        ...b,
        attributes: [...b.attributes].map((a) => ({
          ...a,
          shaderLocation:
            a.shaderLocation + studInstanceBuffers.attributes.length,
        })),
      }));
    }

    const studTriangleShaderModule = device.createShaderModule({
      label: "Stud shader",
      code: STUD_TRIANGLE_SHADER,
    });

    /** @satisfies {GPURenderPipelineDescriptor} */
    const studTrianglePipelineDescriptor = {
      ...trianglePipelineDescriptor,
      vertex: {
        module: studTriangleShaderModule,
        entryPoint: "vertexMain",
        buffers: [
          studInstanceBuffers,
          ...offsetBuffersForStuds(trianglePipelineDescriptor.vertex),
        ],
      },
    };

    this.#studOpaqueTrianglePipeline = device.createRenderPipeline({
      ...studTrianglePipelineDescriptor,
      label: "Stud opaque triangle pipeline",
      fragment: {
        ...studTrianglePipelineDescriptor.fragment,
        constants: {
          transparent: 0,
        },
      },
    });

    this.#studTransparentTrianglePipeline = device.createRenderPipeline({
      ...studTrianglePipelineDescriptor,
      label: "Stud transparent triangle pipeline",
      depthStencil: {
        ...studTrianglePipelineDescriptor.depthStencil,

        // Stud triangles shouldn't block other triangles
        depthWriteEnabled: false,
      },
      fragment: {
        ...studTrianglePipelineDescriptor.fragment,
        constants: {
          transparent: 1,
        },
      },
    });

    const studLineShaderModule = device.createShaderModule({
      label: "Stud shader",
      code: STUD_LINE_SHADER,
    });

    this.#studLinePipeline = device.createRenderPipeline({
      ...linePipelineDescriptor,
      label: "Stud line pipeline",
      vertex: {
        module: studLineShaderModule,
        entryPoint: "vertexMain",
        buffers: [
          studInstanceBuffers,
          ...offsetBuffersForStuds(linePipelineDescriptor.vertex),
        ],
      },
    });

    const optionalLineFragmentShaderModule = device.createShaderModule({
      label: "Optional line fragment shader",
      code: OPTIONAL_LINE_FRAGMENT_SHADER,
    });

    const optionalLineShaderModule = device.createShaderModule({
      label: "Optional line shader",
      code: OPTIONAL_LINE_SHADER,
    });

    const studOptionalLineShaderModule = device.createShaderModule({
      label: "Stud optional line shader",
      code: STUD_OPTIONAL_LINE_SHADER,
    });

    /** @satisfies {GPURenderPipelineDescriptor} */
    const optionalLinePipelineDescriptor = {
      label: "Optional line pipeline",
      layout: pipelineLayout,
      primitive: { topology: "line-list" },
      depthStencil: DEPTH_STENCIL,
      vertex: {
        module: optionalLineShaderModule,
        entryPoint: "vertexMain",
        buffers: [
          {
            // (p1, p2, c1, c2) = 12 floats
            arrayStride: 12 * 4,
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
        module: optionalLineFragmentShaderModule,
        entryPoint: "fragmentMain",
        targets: [{ format }],
      },
    };

    this.#optionalLinePipeline = device.createRenderPipeline(
      optionalLinePipelineDescriptor
    );

    this.#studOptionalLinePipeline = device.createRenderPipeline({
      ...optionalLinePipelineDescriptor,
      label: "Stud optional line pipeline",
      vertex: {
        module: studOptionalLineShaderModule,
        entryPoint: "vertexMain",
        buffers: [
          studInstanceBuffers,
          ...offsetBuffersForStuds(optionalLinePipelineDescriptor.vertex),
        ],
      },
    });
  }

  /**
   * @param {GPUBuffer} uniformBuffer
   * @param {GPUBuffer} colorBuffer
   */
  #createBindGroup(uniformBuffer, colorBuffer) {
    return this.device.createBindGroup({
      label: "Rotation uniform group",
      layout: this.#bindGroupLayout,
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
          resource: this.#colorTexture.createView(),
        },
      ],
    });
  }

  /**
   * @param {readonly  { code: number; rgba: number[] }[]} colors
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

/**
 * @typedef {{
 *   count: number;
 *   buffer: GPUBuffer;
 *   vertexCount?: number | undefined;
 * }} GeometryRenderDescriptor
 *
 * @typedef {Record<
 *   | "lines"
 *   | "optionalLines"
 *   | "triangles"
 *   | "studs",
 * GeometryRenderDescriptor>} PreparedGeometry
 */

const EDGE_FRAGMENT_SHADER = `
  @fragment
  fn fragmentMain() -> @location(0) vec4f {
    return vec4(0.0, 0.0, 0.0, 1.0);
  }
  `;

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
  `;

const OPTIONAL_LINE_FUNCTION = `
  struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) @interpolate(flat) shouldDiscard: f32,
  }

  fn shouldShowLine(
    projection: mat4x4f,
    input: VertexInput,
    vertexIndex: u32
  ) -> VertexOutput {
    let p1 = projection * input.p1;
    let p2 = projection * input.p2;
    let c1 = projection * input.c1;
    let c2 = projection * input.c2;

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
`;

const OPTIONAL_LINE_SHADER = `
  struct VertexInput {
    @location(0) p1: vec4f,
    @location(1) p2: vec4f,
    @location(2) c1: vec4f,
    @location(3) c2: vec4f,
  }

  @group(0) @binding(0) var<uniform> rotationMatrix: mat4x4f;

  @vertex
  fn vertexMain(
    input: VertexInput,
    @builtin(vertex_index) vertexIndex: u32
  ) -> VertexOutput {
    return shouldShowLine(rotationMatrix, input, vertexIndex);
  }

  ${OPTIONAL_LINE_FUNCTION}`;

const COLOR_FRAGMENT_SHADER = `
  override transparent: bool = false;

  @group(0) @binding(1) var<uniform> defaultColor: vec4f;

  @group(0) @binding(2) var colorTexture: texture_2d<f32>;

  struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) color: f32,
  }

  @fragment
  fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
    let colorIndex = i32(input.color);

    var color: vec4f;

    // 16 is LDraw's "current color"
    if (colorIndex == 16) {
      color = defaultColor / 255;
    } else {
      let x = colorIndex % 256;
      let y = colorIndex / 256;
      color = textureLoad(colorTexture, vec2i(x, y), 0);
    }

    let alpha = color.w;
    if (transparent && alpha == 1) {
      discard;
    }

    if (!transparent && alpha < 1) {
      discard;
    }

    return color * color.w;
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

  @vertex
  fn vertexMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;

    output.position = rotationMatrix * input.position;
    output.color = input.color;
    return output;
  }
  `;

const STUD_LINE_SHADER = `
  struct InstanceInput {
    @location(0) column1: vec4f,
    @location(1) column2: vec4f,
    @location(2) column3: vec4f,
    @location(3) column4: vec4f,
    @location(4) color: f32,
  }

  struct VertexOutput {
    @builtin(position) position: vec4f,
  }

  @group(0) @binding(0) var<uniform> rotationMatrix: mat4x4f;

  @group(0) @binding(1) var<uniform> defaultColor: vec4f;

  @vertex
  fn vertexMain(
    @location(5) position: vec4f,
    instance: InstanceInput
  ) -> VertexOutput {
    let instanceMatrix = mat4x4f(
      instance.column1,
      instance.column2,
      instance.column3,
      instance.column4
    );

    var output: VertexOutput;
    output.position = rotationMatrix * instanceMatrix * position;
    return output;
  }
  `;

// dot((ci - p1) x (p2 - p1), view) > 0

const STUD_OPTIONAL_LINE_SHADER = `
  struct InstanceInput {
    @location(0) column1: vec4f,
    @location(1) column2: vec4f,
    @location(2) column3: vec4f,
    @location(3) column4: vec4f,
    @location(4) color: f32,
  }

  struct VertexInput {
    @location(5) p1: vec4f,
    @location(6) p2: vec4f,
    @location(7) c1: vec4f,
    @location(8) c2: vec4f,
  }

  @group(0) @binding(0) var<uniform> rotationMatrix: mat4x4f;

  @vertex
  fn vertexMain(
    instance: InstanceInput,
    vertex: VertexInput,
    @builtin(vertex_index) vertexIndex: u32
  ) -> VertexOutput {
    let instanceMatrix = mat4x4f(
      instance.column1,
      instance.column2,
      instance.column3,
      instance.column4
    );
    let projection = rotationMatrix * instanceMatrix;

    return shouldShowLine(projection, vertex, vertexIndex);
  }

  ${OPTIONAL_LINE_FUNCTION}`;

const OPTIONAL_LINE_FRAGMENT_SHADER = `
  struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) @interpolate(flat) shouldDiscard: f32,
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

const STUD_TRIANGLE_SHADER = `
  struct InstanceInput {
    @location(0) column1: vec4f,
    @location(1) column2: vec4f,
    @location(2) column3: vec4f,
    @location(3) column4: vec4f,
    @location(4) color: f32,
  }

  struct VertexOutput {
    @builtin(position) position: vec4f,
    @location(0) color: f32,
  }

  @group(0) @binding(0) var<uniform> rotationMatrix: mat4x4f;

  @vertex
  fn vertexMain(
    @location(5) position: vec4f,
    @location(6) color: f32,
    instance: InstanceInput
  ) -> VertexOutput {
    let instanceMatrix = mat4x4f(
      instance.column1,
      instance.column2,
      instance.column3,
      instance.column4
    );

    var output: VertexOutput;
    output.position = rotationMatrix * instanceMatrix * position;
    output.color = select(color, instance.color, color == 16.0);
    return output;
  }
  `;
