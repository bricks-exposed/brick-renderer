import { apply, determinant, multiply } from "./matrix.js";

/**
 * Caches file instances by their name
 *
 * @type {Map<string, File>}
 */
const FileCache = new Map();

const LineType = Object.freeze({
  Meta: 0,
  Comment: 0,
  DrawFile: 1,
  DrawLine: 2,
  DrawTriangle: 3,
  DrawQuadrilateral: 4,
  DrawOptionalLine: 5,
});

export class File {
  /**
   * @type {(fileName: string) => string}
   */
  static getFileContents;

  /**
   * @param {string} fileName
   */
  static for(fileName) {
    const contents = File.getFileContents(fileName);

    return new File(fileName, contents);
  }

  /**
   * @param {string} name
   * @param {string} contents
   */
  constructor(name, contents) {
    this.name = name;

    const commands = contents
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    this.drawCommands = DrawCommand.fromAll(commands);

    this.subFiles = [...File.#getSubfiles(commands)];
  }

  /**
   * @param {import("./matrix.js").Matrix | undefined} [transformation]
   * @param {boolean} [invert] Whether to draw the file as inverted
   * @param {string} [parentFileName] For debugging
   *
   * @returns {{ edges: number[]; triangles: number[] }}
   */
  render(transformation, invert = false, parentFileName) {
    const edges = [];
    const triangles = [];

    // Rendering a subfile applies both the rotation/scaling defined in this file
    // as well as any translation done to this file.
    for (const subFile of this.subFiles) {
      const withParent = multiply(subFile.transformation, transformation);

      const subfileDraws = subFile.file.render(
        withParent,
        subFile.inverted != invert,
        this.name
      );

      edges.push(...subfileDraws.edges);
      triangles.push(...subfileDraws.triangles);
    }

    for (const command of this.drawCommands) {
      const vertices = command.transform(transformation, invert);
      if (command.isEdge) {
        edges.push(...vertices);
      } else {
        triangles.push(...vertices);
      }
    }

    return { edges, triangles };
  }

  /**
   * @param {string[]} commands
   */
  static *#getSubfiles(commands) {
    const BFC_INVERTNEXT = /^0\s*BFC\s*INVERTNEXT/;
    const FILE = /^1\s/;

    let invertNext = false;

    for (const command of commands) {
      if (BFC_INVERTNEXT.test(command)) {
        invertNext = true;
      } else if (FILE.test(command)) {
        const parsed = File.#parse(command);

        parsed.inverted = parsed.inverted !== invertNext;

        invertNext = false;

        yield parsed;
      }
    }
  }

  /**
   * @param {string} command
   *
   * @returns {{
   *   file: File;
   *   transformation: import("./matrix.js").Matrix;
   *   inverted: boolean;
   * }}
   */
  static #parse(command) {
    const [_type, color, ...tokens] = command.split(/\s/);

    const [fileStart, ...fileRest] = tokens.splice(12);

    const fileEnd = fileRest.at(fileRest.length - 1);

    const fileName = fileEnd
      ? new RegExp(`/.*\s(${fileStart}.*${fileEnd})$`).exec(command)?.[1]
      : fileStart;

    if (!fileName) {
      throw new Error(
        `Missing filename for draw file (type 1) command: ${command}`
      );
    }

    let file;
    if (!(file = FileCache.get(fileName))) {
      file = File.for(fileName);
      FileCache.set(fileName, file);
    }

    const [x, y, z, ...abcdefghi] = tokens.map(Number.parseFloat);

    const inverted = determinant(abcdefghi) < 0;

    const [a, b, c, d, e, f, g, h, i] = abcdefghi;

    return {
      file,
      transformation: [a, b, c, x, d, e, f, y, g, h, i, z, 0, 0, 0, 1],
      inverted,
    };
  }
}

class DrawCommand {
  /**
   * @param {import("./matrix.js").Matrix | undefined} transformation
   * @param {boolean} invert
   */
  transform(transformation, invert) {
    const transformer = apply.bind(null, transformation);
    const transformed = this.coordinates.map(transformer);
    if (invert) {
      transformed.reverse();
    }

    /*
     * Map an LDraw Coordinate (where -y is out of the page)
     * to a GPU Coordinate (where -z is out of the page).
     */
    return transformed.map(([x, y, z]) => [x, z, y]).flat();
  }

  /**
   * @param {number} color
   * @param {number[][]} coordinates
   */
  constructor(color, coordinates) {
    this.color = color;
    this.isEdge = color === 24; // Special edge color
    this.coordinates = coordinates;
  }

  /**
   * @param {string[]} commands
   */
  static fromAll(commands) {
    return commands.map(DrawCommand.from).filter((c) => c != null);
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

    const constructor = DrawCommandMap[type];

    return constructor ? new constructor(color, coordinates) : null;
  }
}

class DrawQuadrilateral extends DrawCommand {
  /**
   * @param {number} color
   * @param {number[][]} coordinates
   */
  constructor(color, coordinates) {
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
    const [one, two, three, four] = coordinates;
    super(color, [one, two, three, three, four, one]);
  }
}

/** @type {Record<number, typeof DrawCommand>} */
const DrawCommandMap = {
  [LineType.DrawLine]: DrawCommand,
  [LineType.DrawTriangle]: DrawCommand,
  [LineType.DrawQuadrilateral]: DrawQuadrilateral,
};
