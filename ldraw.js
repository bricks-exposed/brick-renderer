export class File {
  /**
   * @type {(fileName: string) => string}
   */
  static getFileContents;

  /**
   * @readonly
   * @type {readonly File[]}
   */
  files;

  /**
   * @readonly
   * @type {number[]}
   */
  edges;

  /**
   * @readonly
   * @type {number[]}
   */
  triangles;

  /**
   * @param {string} contents
   */
  constructor(contents) {
    const commands = contents
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    this.files = File.tryAll(commands);

    const drawCommands = DrawCommand.tryAll(commands);

    const ownEdges = drawCommands
      .filter((c) => c.isEdge)
      .flatMap((c) => c.gpuVertices);
    const subfileEdges = this.files.flatMap((f) => f.edges);

    this.edges = [...ownEdges, ...subfileEdges];

    const ownTriangles = drawCommands
      .filter((c) => !c.isEdge)
      .flatMap((c) => c.gpuVertices);
    const subfileTriangles = this.files.flatMap((f) => f.triangles);
    this.triangles = [...ownTriangles, ...subfileTriangles];
  }

  /**
   * @param {string[]} commands
   */
  static tryAll(commands) {
    return commands.map(File.from).filter((c) => c != null);
  }

  /**
   * @param {string} command
   */
  static from(command) {
    let [
      type,
      color,
      x,
      y,
      z,
      a,
      b,
      c,
      d,
      e,
      f,
      g,
      h,
      i,
      fileStart,
      ...fileRest
    ] = command.split(/\s/);

    if (Number.parseInt(type, 10) !== LineType.DrawFile) {
      return null;
    }

    const fileEnd = fileRest.at(fileRest.length - 1);

    const fileName = fileEnd
      ? new RegExp(`/.*\s(${fileStart}.*${fileEnd})$`).exec(command)?.[1]
      : fileStart;

    if (!fileName) {
      throw new Error(
        `Missing filename for draw file (type 1) command: ${command}`
      );
    }

    return new File(File.getFileContents(fileName));
  }
}

export const LineType = Object.freeze({
  Meta: 0,
  Comment: 0,
  DrawFile: 1,
  DrawLine: 2,
  DrawTriangle: 3,
  DrawQuadrilateral: 4,
  DrawOptionalLine: 5,
});

class DrawCommand {
  get gpuVertices() {
    return this.coordinatesInGpuSpace.flat();
  }

  /**
   * @param {number} color
   * @param {number[][]} coordinates
   */
  constructor(color, coordinates) {
    this.color = color;
    this.isEdge = color === 24; // Special edge color
    this.coordinates = coordinates;

    /*
     * Map an LDraw Coordinate (where -y is out of the page)
     * to a GPU Coordinate (where -z is out of the page).
     */
    this.coordinatesInGpuSpace = this.coordinates.map(([x, y, z]) => [x, z, y]);
  }

  /**
   * @param {string[]} commands
   */
  static tryAll(commands) {
    return commands.map(DrawCommand.try).filter((c) => c != null);
  }

  /**
   * @param {string} command
   */
  static try(command) {
    try {
      return DrawCommand.from(command);
    } catch {
      return null;
    }
  }

  /**
   * @param {string} command
   */
  static from(command) {
    const [type, color, ...points] = command.split(/\s/).map(Number.parseFloat);

    const coordinates = [];
    for (let i = 0; i < points.length; i += 3) {
      coordinates.push([points[i], points[i + 1], points[i + 2]]);
    }

    switch (type) {
      case LineType.DrawLine:
      case LineType.DrawTriangle:
        return new DrawCommand(color, coordinates);
      case LineType.DrawQuadrilateral:
        return new DrawQuadrilateral(color, coordinates);
      default:
        throw new Error(`Draw command type invalid: ${command}`);
    }
  }
}

class DrawQuadrilateral extends DrawCommand {
  get gpuVertices() {
    /*
     * Convert LDraw's quadrilateral vertexes
     * to a vertex list that can draw triangles
     * instead of squares.
     *
     * 1 --> 2
     * | \ a |
     * |  \  |
     * | b \ |
     * 4 <-- 3
     */
    const [one, two, three, four] = this.coordinatesInGpuSpace;
    return [one, two, three, three, four, one].flat();
  }
}
