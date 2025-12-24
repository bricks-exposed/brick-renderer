import { Device } from "./device.js";
import { initialize } from "./initialize.js";
import { LineType, processFile } from "./src/ldraw.js";

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

/**
 * @param {HTMLCanvasElement} canvas
 */
export async function run(canvas) {
  const file = stud;

  const { device: gpuDevice, textureView, format } = await initialize(canvas);

  const device = new Device(gpuDevice);

  const commands = processFile(file);

  const lineCommands = commands.filter((c) => c.type === LineType.DrawLine);

  const edgeVertices = new Float32Array(
    lineCommands.flatMap((c) => c.points.flatMap(([x, y, z]) => [x, z, -y]))
  );
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
    @location(0) position: vec3f,
  }

  struct VertexOutput {
    @builtin(position) pos: vec4f,
  }

  @vertex
  fn vertexMain(input: VertexInput) -> VertexOutput {
    var output: VertexOutput;
    output.pos = vec4f(input.position, 1);
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
    layout: "auto",
    primitive: { topology: "line-list" },
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

  function draw() {
    const encoder = gpuDevice.createCommandEncoder();

    const pass = encoder.beginRenderPass({
      label: "Draw it all",
      colorAttachments: [
        {
          view: textureView,
          loadOp: "clear",
          storeOp: "store",
          clearValue: { r: 0.217, g: 0.427, b: 0.878, a: 1 },
        },
      ],
    });

    if (edgeVertices.length >= 3) {
      pass.setPipeline(edgePipeline);
      pass.setVertexBuffer(0, edgeVertexBuffer);
      pass.draw(edgeVertices.length / 3);
    }

    pass.end();

    gpuDevice.queue.submit([encoder.finish()]);
  }

  draw();
}
