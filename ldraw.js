import { apply, determinant, multiply } from "./matrix.js";

export class PartLoader {
  /**
   * @param {(fileName: string) => Promise<string | undefined>} getFile
   * @param {Map<string, File>} [fileCache]
   * @param {Map<string, Part>} [partCache]
   */
  constructor(getFile, fileCache = new Map(), partCache = new Map()) {
    this.getFile = getFile;
    this.fileCache = fileCache;
    this.partCache = partCache;
  }

  /**
   * @param {string} fileName
   *
   * @returns {Promise<Part>}
   */
  async load(fileName) {
    const cachedPart = this.partCache.get(fileName);
    if (cachedPart) {
      return cachedPart;
    }

    const file =
      this.fileCache.get(fileName) ?? (await this.#loadFile(fileName));

    if (!file) {
      throw new Error(`Could not find file for ${fileName}`);
    }

    this.fileCache.set(fileName, file);

    const subParts = await Promise.all(
      file.subFiles.map((subFile) => this.load(subFile.fileName))
    );

    const part = new Part(file, subParts);

    this.partCache.set(fileName, part);

    return part;
  }

  /**
   * @param {string} fileName
   */
  async #loadFile(fileName) {
    const contents = await this.getFile(fileName);

    if (contents == null) {
      return undefined;
    }

    return new File(fileName, contents);
  }
}

export class Part {
  /**
   *
   * @param {File} file
   * @param {Part[]} subParts
   */
  constructor(file, subParts) {
    this.file = file;
    this.subParts = new Map(subParts.map((part) => [part.file.name, part]));
  }

  /**
   * @param {import("./matrix.js").Matrix} [transformation]
   * @param {boolean} [invert] Whether to draw the file as inverted
   *
   * @returns {{ edges: number[]; triangles: number[] }}
   */
  render(transformation, invert = false) {
    const { edges, triangles, subFiles } = this.file.render(
      transformation,
      invert
    );

    // Rendering a subfile applies both the rotation/scaling defined in this file
    // as well as any translation done to this file.
    for (const subFile of subFiles) {
      const subPart = this.subParts.get(subFile.fileName);

      if (!subPart) {
        throw new Error(`Could not find subpart ${subFile.fileName}`);
      }

      const subPartRender = subPart.render(
        subFile.transformation,
        subFile.inverted
      );

      edges.push(...subPartRender.edges);
      triangles.push(...subPartRender.triangles);
    }

    return { edges, triangles };
  }
}

class File {
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
   */
  render(transformation, invert = false) {
    const edges = [];
    const triangles = [];

    for (const command of this.drawCommands) {
      const vertices = command.transform(transformation, invert);
      if (command.isEdge) {
        edges.push(...vertices);
      } else {
        triangles.push(...vertices);
      }
    }

    return {
      edges,
      triangles,
      subFiles: this.subFiles.map((subFile) => ({
        fileName: subFile.fileName,
        color: subFile.color,
        ...subFile.transform(transformation, invert),
      })),
    };
  }

  /**
   * @param {string[]} commands
   */
  static *#getSubfiles(commands) {
    const BFC_INVERTNEXT = /^0\s*BFC\s*INVERTNEXT/;

    let invertNext = false;
    let parsed;

    for (const command of commands) {
      if (BFC_INVERTNEXT.test(command)) {
        invertNext = true;
      } else if ((parsed = DrawFile.from(command, invertNext))) {
        invertNext = false;

        yield parsed;
      }
    }
  }
}

const LineType = Object.freeze({
  Meta: 0,
  Comment: 0,
  DrawFile: 1,
  DrawLine: 2,
  DrawTriangle: 3,
  DrawQuadrilateral: 4,
  DrawOptionalLine: 5,
});

class DrawFile {
  /**
   *
   * @param {string} fileName
   * @param {number} color
   * @param {import("./matrix.js").Matrix} transformation
   * @param {boolean} inverted
   */
  constructor(fileName, color, transformation, inverted) {
    this.fileName = fileName;
    this.color = color;
    this.transformation = transformation;
    this.inverted = inverted;
  }

  /**
   * @param {import("./matrix.js").Matrix | undefined} transformation
   * @param {boolean} invert
   */
  transform(transformation, invert) {
    return {
      transformation: multiply(this.transformation, transformation),
      inverted: this.inverted != invert,
    };
  }

  /**
   * @param {string} command
   * @param {boolean} parentInvert
   */
  static from(command, parentInvert) {
    const [type, color, ...tokens] = command.split(/\s/);

    if (type !== LineType.DrawFile.toString()) {
      return null;
    }

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

    const [x, y, z, ...abcdefghi] = tokens.map(Number.parseFloat);

    const inverted = determinant(abcdefghi) < 0;

    const [a, b, c, d, e, f, g, h, i] = abcdefghi;

    /** @type {import("./matrix.js").Matrix} */
    const transformation = [a, b, c, x, d, e, f, y, g, h, i, z, 0, 0, 0, 1];

    return new DrawFile(
      fileName,
      Number.parseInt(color),
      transformation,
      inverted !== parentInvert
    );
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
