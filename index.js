import { Device } from "./device.js";
import { initialize } from "./initialize.js";
import { LineType, processFile, commandVertices } from "./ldraw.js";
import * as matrix from "./matrix.js";

const stud = `
  0 Circle 1.0
  0 Name: 8\\4-4edge.dat
  0 Author: Philippe Hurbain [Philo]
  0 !LDRAW_ORG 8_Primitive UPDATE 2016-01
  0 !LICENSE Licensed under CC BY 4.0 : see CAreadme.txt

  0 BFC CERTIFY CCW

  0 !HISTORY 2016-12-31 [PTadmin] Official Update 2016-01


  2 24 1 0 0 0.7071 0 0.7071
  2 24 0.7071 0 0.7071 0 0 1
  2 24 0 0 1 -0.7071 0 0.7071
  2 24 -0.7071 0 0.7071 -1 0 0
  2 24 -1 0 0 -0.7071 0 -0.7071
  2 24 -0.7071 0 -0.7071 0 0 -1
  2 24 0 0 -1 0.7071 0 -0.7071
  2 24 0.7071 0 -0.7071 1 0 0
  0 // Build by Primitive Generator 2
  `;

const box4t = `
  0 Box with 4 Adjacent Faces and All Edges
  0 Name: box4t.dat
  0 Author: Tore Eriksson [Tore_Eriksson]
  0 !LDRAW_ORG Primitive UPDATE 2003-02
  0 !LICENSE Licensed under CC BY 4.0 : see CAreadme.txt

  0 BFC CERTIFY CCW

  0 !HISTORY 1997-09-29 [PTadmin] Official Update 1997-15
  0 !HISTORY 2002-08-31 [izanette] Modified with WINDZ for BFC compliance
  0 !HISTORY 2003-08-01 [PTadmin] Official Update 2003-02
  0 !HISTORY 2007-06-24 [PTadmin] Header formatted for Contributor Agreement
  0 !HISTORY 2008-07-01 [PTadmin] Official Update 2008-01


  2 24 1 1 1 -1 1 1
  2 24 -1 1 1 -1 1 -1
  2 24 -1 1 -1 1 1 -1
  2 24 1 1 -1 1 1 1
  2 24 1 0 1 -1 0 1
  2 24 -1 0 1 -1 0 -1
  2 24 -1 0 -1 1 0 -1
  2 24 1 0 -1 1 0 1
  2 24 1 0 1 1 1 1
  2 24 -1 0 1 -1 1 1
  2 24 1 0 -1 1 1 -1
  2 24 -1 0 -1 -1 1 -1
  4 16 1 1 1 1 1 -1 -1 1 -1 -1 1 1
  4 16 1 1 1 -1 1 1 -1 0 1 1 0 1
  4 16 -1 1 1 -1 1 -1 -1 0 -1 -1 0 1
  0 // 4 16 -1 1 -1 -1 0 -1 1 0 -1 1 1 -1
  4 16 1 1 -1 1 1 1 1 0 1 1 0 -1
  0
  `;

const disc = `
0 Disc 1.0
0 Name: 4-4disc.dat
0 Author: James Jessiman
0 !LDRAW_ORG Primitive UPDATE 2002-02
0 !LICENSE Licensed under CC BY 4.0 : see CAreadme.txt

0 BFC CERTIFY CCW

0 !HISTORY 1998-12-15 [PTadmin] Official Update 1998-10
0 !HISTORY 2002-03-23 [sbliss] Added BFC statement
0 !HISTORY 2002-04-25 [PTadmin] Official Update 2002-02
0 !HISTORY 2007-06-24 [PTadmin] Header formatted for Contributor Agreement
0 !HISTORY 2008-07-01 [PTadmin] Official Update 2008-01


3 16 0 0 0 1 0 0 0.9239 0 0.3827
3 16 0 0 0 0.9239 0 0.3827 0.7071 0 0.7071
3 16 0 0 0 0.7071 0 0.7071 0.3827 0 0.9239
3 16 0 0 0 0.3827 0 0.9239 0 0 1
3 16 0 0 0 0 0 1 -0.3827 0 0.9239
3 16 0 0 0 -0.3827 0 0.9239 -0.7071 0 0.7071
3 16 0 0 0 -0.7071 0 0.7071 -0.9239 0 0.3827
3 16 0 0 0 -0.9239 0 0.3827 -1 0 -0
3 16 0 0 0 -1 0 -0 -0.9239 0 -0.3827
3 16 0 0 0 -0.9239 0 -0.3827 -0.7071 0 -0.7071
3 16 0 0 0 -0.7071 0 -0.7071 -0.3827 0 -0.9239
3 16 0 0 0 -0.3827 0 -0.9239 0 0 -1
3 16 0 0 0 0 0 -1 0.3827 0 -0.9239
3 16 0 0 0 0.3827 0 -0.9239 0.7071 0 -0.7071
3 16 0 0 0 0.7071 0 -0.7071 0.9239 0 -0.3827
3 16 0 0 0 0.9239 0 -0.3827 1 0 0
0`;

const cylinder = `
0 Cylinder 1.0
0 Name: 4-4cyli.dat
0 Author: James Jessiman
0 !LDRAW_ORG Primitive UPDATE 2005-01
0 !LICENSE Licensed under CC BY 4.0 : see CAreadme.txt

0 BFC CERTIFY CCW

0 !HISTORY 1998-12-15 [PTadmin] Official Update 1998-10
0 !HISTORY 2002-03-23 [sbliss] Added BFC statement; merged headers from files in distributions LDraw 0.27 and Complete.
0 !HISTORY 2002-04-25 [PTadmin] Official Update 2002-02
0 !HISTORY 2004-12-14 [guyvivan] BFC CCW
0 !HISTORY 2005-12-28 [PTadmin] Official Update 2005-01
0 !HISTORY 2007-06-24 [PTadmin] Header formatted for Contributor Agreement
0 !HISTORY 2008-07-01 [PTadmin] Official Update 2008-01


4 16 1 1 0 0.9239 1 0.3827 0.9239 0 0.3827 1 0 0
5 24 1 0 0 1 1 0 0.9239 0 0.3827 0.9239 0 -0.3827
4 16 0.9239 1 0.3827 0.7071 1 0.7071 0.7071 0 0.7071 0.9239 0 0.3827
5 24 0.9239 0 0.3827 0.9239 1 0.3827 0.7071 0 0.7071 1 0 0
4 16 0.7071 1 0.7071 0.3827 1 0.9239 0.3827 0 0.9239 0.7071 0 0.7071
5 24 0.7071 0 0.7071 0.7071 1 0.7071 0.3827 0 0.9239 0.9239 0 0.3827
4 16 0.3827 1 0.9239 0 1 1 0 0 1 0.3827 0 0.9239
5 24 0.3827 0 0.9239 0.3827 1 0.9239 0 0 1 0.7071 0 0.7071
4 16 0 1 1 -0.3827 1 0.9239 -0.3827 0 0.9239 0 0 1
5 24 0 0 1 0 1 1 -0.3827 0 0.9239 0.3827 0 0.9239
4 16 -0.3827 1 0.9239 -0.7071 1 0.7071 -0.7071 0 0.7071 -0.3827 0 0.9239
5 24 -0.3827 0 0.9239 -0.3827 1 0.9239 -0.7071 0 0.7071 0 0 1
4 16 -0.7071 1 0.7071 -0.9239 1 0.3827 -0.9239 0 0.3827 -0.7071 0 0.7071
5 24 -0.7071 0 0.7071 -0.7071 1 0.7071 -0.9239 0 0.3827 -0.3827 0 0.9239
4 16 -0.9239 1 0.3827 -1 1 0 -1 0 0 -0.9239 0 0.3827
5 24 -0.9239 0 0.3827 -0.9239 1 0.3827 -1 0 0 -0.7071 0 0.7071
4 16 -1 1 0 -0.9239 1 -0.3827 -0.9239 0 -0.3827 -1 0 0
5 24 -1 0 0 -1 1 0 -0.9239 0 -0.3827 -0.9239 0 0.3827
4 16 -0.9239 1 -0.3827 -0.7071 1 -0.7071 -0.7071 0 -0.7071 -0.9239 0 -0.3827
5 24 -0.9239 0 -0.3827 -0.9239 1 -0.3827 -0.7071 0 -0.7071 -1 0 0
4 16 -0.7071 1 -0.7071 -0.3827 1 -0.9239 -0.3827 0 -0.9239 -0.7071 0 -0.7071
5 24 -0.7071 0 -0.7071 -0.7071 1 -0.7071 -0.3827 0 -0.9239 -0.9239 0 -0.3827
4 16 -0.3827 1 -0.9239 0 1 -1 0 0 -1 -0.3827 0 -0.9239
5 24 -0.3827 0 -0.9239 -0.3827 1 -0.9239 0 0 -1 -0.7071 0 -0.7071
4 16 0 1 -1 0.3827 1 -0.9239 0.3827 0 -0.9239 0 0 -1
5 24 0 0 -1 0 1 -1 0.3827 0 -0.9239 -0.3827 0 -0.9239
4 16 0.3827 1 -0.9239 0.7071 1 -0.7071 0.7071 0 -0.7071 0.3827 0 -0.9239
5 24 0.3827 0 -0.9239 0.3827 1 -0.9239 0.7071 0 -0.7071 0 0 -1
4 16 0.7071 1 -0.7071 0.9239 1 -0.3827 0.9239 0 -0.3827 0.7071 0 -0.7071
5 24 0.7071 0 -0.7071 0.7071 1 -0.7071 0.9239 0 -0.3827 0.3827 0 -0.9239
4 16 0.9239 1 -0.3827 1 1 0 1 0 0 0.9239 0 -0.3827
5 24 0.9239 0 -0.3827 0.9239 1 -0.3827 1 0 0 0.7071 0 -0.7071
0
`;

/**
 * @param {HTMLCanvasElement} canvas
 * @param {{ rotateX: number, rotateY: number, rotateZ: number, scale: number }} transforms
 */
export async function run(canvas, transforms) {
  const file = disc;

  const { device: gpuDevice, format, canvasTexture } = await initialize(canvas);

  const canvasTextureView = canvasTexture.createView();

  const depthTexture = gpuDevice.createTexture({
    size: [canvasTexture.width, canvasTexture.height],
    format: "depth24plus",
    usage: GPUTextureUsage.RENDER_ATTACHMENT,
  });

  /** @type {GPUDepthStencilState} */
  const depthStencil = {
    depthWriteEnabled: true,
    depthCompare: "greater",
    format: "depth24plus",
  };

  const device = new Device(gpuDevice);

  const commands = processFile(file);

  const rotateMatrix = new Float32Array(
    matrix.transform(
      [
        matrix.orthographic(-1, 1, -1, 1, -10, 10),
        matrix.fromRotationX(transforms.rotateX),
        matrix.fromRotationY(transforms.rotateY),
        matrix.fromRotationZ(transforms.rotateZ),
        matrix.fromScaling(transforms.scale),
      ],
      matrix.identity
    )
  );

  const uniformBuffer = device.uniformBufferWith(
    "Rotation matrix",
    rotateMatrix
  );

  const bindGroupLayout = gpuDevice.createBindGroupLayout({
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

  const pipelineLayout = gpuDevice.createPipelineLayout({
    label: "Rotation uniform pipeline layout",
    bindGroupLayouts: [bindGroupLayout],
  });

  const bindGroup = gpuDevice.createBindGroup({
    label: "Rotation uniform group",
    layout: bindGroupLayout,
    entries: [
      {
        binding: 0,
        resource: { buffer: uniformBuffer },
      },
    ],
  });

  const lineCommands = commands
    .filter((c) => c.type === LineType.DrawLine)
    .flatMap(commandVertices)
    .filter((v) => v != null);

  const edgeVertices = new Float32Array(lineCommands);
  const edgeVertexBuffer = device.vertexBufferWith(
    "Edge vertices",
    edgeVertices
  );

  /** @type {GPUVertexBufferLayout} */
  const edgeVertexBufferLayout = {
    arrayStride: 12,
    attributes: [
      {
        format: "float32x3",
        offset: 0,
        shaderLocation: 0,
      },
    ],
  };

  const edgeShaderModule = gpuDevice.createShaderModule({
    label: "Edge shader",
    code: `
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
  `,
  });

  const edgePipeline = gpuDevice.createRenderPipeline({
    label: "Edge pipeline",
    layout: pipelineLayout,
    primitive: { topology: "line-list" },
    depthStencil,
    vertex: {
      module: edgeShaderModule,
      entryPoint: "vertexMain",
      buffers: [edgeVertexBufferLayout],
    },
    fragment: {
      module: edgeShaderModule,
      entryPoint: "fragmentMain",
      targets: [{ format }],
    },
  });

  const quadCommands = commands
    .filter(
      (c) =>
        c.type === LineType.DrawQuadrilateral ||
        c.type === LineType.DrawTriangle
    )
    .flatMap(commandVertices)
    .filter((v) => v != null);
  const quadVertices = new Float32Array(quadCommands);
  const quadVertexBuffer = device.vertexBufferWith(
    "Quad vertices",
    quadVertices
  );

  /** @type {GPUVertexBufferLayout} */
  const quadVertexBufferLayout = {
    arrayStride: 12,
    attributes: [
      {
        format: "float32x3",
        offset: 0,
        shaderLocation: 0,
      },
    ],
  };

  const quadShaderModule = gpuDevice.createShaderModule({
    label: "Quad shader",
    code: `
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
  `,
  });

  const quadPipeline = gpuDevice.createRenderPipeline({
    label: "Quad pipeline",
    layout: pipelineLayout,
    primitive: { cullMode: "back" },
    depthStencil,
    vertex: {
      module: quadShaderModule,
      entryPoint: "vertexMain",
      buffers: [quadVertexBufferLayout],
    },
    fragment: {
      module: quadShaderModule,
      entryPoint: "fragmentMain",
      targets: [{ format }],
    },
  });

  function draw() {
    const encoder = gpuDevice.createCommandEncoder();

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

    pass.setBindGroup(0, bindGroup);

    if (edgeVertices.length >= 3) {
      pass.setPipeline(edgePipeline);
      pass.setVertexBuffer(0, edgeVertexBuffer);
      pass.draw(edgeVertices.length / 3);
    }

    if (quadVertices.length >= 3) {
      pass.setPipeline(quadPipeline);
      pass.setVertexBuffer(0, quadVertexBuffer);
      pass.draw(quadVertices.length / 3);
    }

    pass.end();

    gpuDevice.queue.submit([encoder.finish()]);
  }

  draw();
}
