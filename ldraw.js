export class File {
  /**
   * @param {string} contents
   */
  constructor(contents) {
    const drawCommands = contents
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map(DrawCommand.try)
      .filter((c) => c != null);

    this.edges = new Float32Array(
      drawCommands.filter((c) => c.isEdge).flatMap((c) => c.gpuVertices)
    );

    this.triangles = new Float32Array(
      drawCommands.filter((c) => !c.isEdge).flatMap((c) => c.gpuVertices)
    );
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
