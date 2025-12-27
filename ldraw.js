/** @import { Matrix } from "./matrix.js" */
import { determinant, identity, multiply } from "./matrix.js";

/**
 * @typedef {{
 *   get(fileName: string): Promise<string | undefined>;
 *   set(fileName: string, contents: string): Promise<void>;
 * }} FileContentsCache
 */

export class PartLoader {
  #getPaths;

  /** @type {Map<string, Promise<string | undefined>>} */
  #requestCache;

  /** @type {Map<string, File>} */
  #fileCache;

  /** @type {Map<string, Promise<Part>>} */
  #partCache;

  #fileContentsCache;

  /**
   * @param {(fileName: string, paths: string[]) => Promise<string | undefined>} accessFile
   * @param {FileContentsCache} [fileContentsCache]
   */
  constructor(accessFile, fileContentsCache) {
    this.#getPaths = accessFile;
    this.#fileCache = new Map();
    this.#partCache = new Map();
    this.#requestCache = new Map();
    this.#fileContentsCache = fileContentsCache;
  }

  /**
   * @param {string} fileName
   *
   * @returns {Promise<Part>}
   */
  async load(fileName) {
    const cachedPart = this.#partCache.get(fileName);
    if (cachedPart) {
      return cachedPart;
    }

    const promise = this.#loadPart(fileName);
    this.#partCache.set(fileName, promise);

    try {
      return await promise;
    } catch (error) {
      this.#partCache.delete(fileName);
      throw error;
    }
  }

  /**
   * @param {string} fileName
   *
   * @returns {Promise<Part>}
   */
  async #loadPart(fileName) {
    const file =
      this.#fileCache.get(fileName) ?? (await this.#loadFile(fileName));

    if (!file) {
      throw new Error(`Could not find file for ${fileName}`);
    }

    this.#fileCache.set(fileName, file);

    const subParts = await Promise.all(
      file.subFiles.map((subFile) => this.load(subFile))
    );

    return new Part(file, subParts);
  }

  /**
   * @param {string} fileName
   */
  async #loadFile(fileName) {
    const cachedContents = await this.#fileContentsCache?.get(fileName);

    const contents = cachedContents ?? (await this.#fetch(fileName));

    if (contents == null) {
      return undefined;
    }

    if (!cachedContents) {
      this.#fileContentsCache?.set(fileName, contents);
    }

    return new File(fileName, contents);
  }

  /**
   * @param {string} fileName
   */
  async #fetch(fileName) {
    const cachedRequest = this.#requestCache.get(fileName);

    if (cachedRequest) {
      return cachedRequest;
    }

    const request = this.#getPaths(fileName, PartLoader.#paths(fileName));
    this.#requestCache.set(fileName, request);
    return request;
  }

  /**
   * @param {string} fileName
   */
  static #paths(fileName) {
    let prefixes;

    if (fileName.startsWith("s\\")) {
      prefixes = ["ldraw/parts"];
    } else if (fileName.startsWith("8\\") || fileName.startsWith("48\\")) {
      prefixes = ["ldraw/p"];
    } else {
      prefixes = ["ldraw/parts", "ldraw/p"];
    }

    const options = prefixes.map(
      (d) => `${d}/${fileName.replaceAll("\\", "/")}`
    );

    return options;
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
    this.subParts = new Map(subParts.map((p) => [p.file.name, p]));
  }

  /**
   * @param {Partial<RenderArgs>} [args]
   */
  render(args) {
    const renderArgs = {
      color: args?.color ?? 16,
      transformation: args?.transformation,
      invert: args?.invert ?? false,
    };

    const { lines, optionalLines, triangles } = this.#render(
      renderArgs,
      EmptyRenderResult()
    );

    return {
      lines: new Float32Array(lines),
      optionalLines: new Float32Array(optionalLines),
      triangles: new Float32Array(triangles),
      ...this.#boundingBox(lines, triangles),
    };
  }

  /**
   * @param {RenderArgs} args
   * @param {RenderResult} accumulator
   *
   * @returns {Record<GeometryType, number[]>}
   */
  #render(args, accumulator) {
    const { subFiles } = this.file.render(args, accumulator);

    for (const subFile of subFiles) {
      const subPart = this.subParts.get(subFile.fileName);

      if (!subPart) {
        throw new Error(`Could not find subpart ${subFile}`);
      }

      accumulator.subFiles = [];
      subPart.#render(subFile, accumulator);
    }

    return accumulator;
  }

  /**
   * @param {number[]} lines
   * @param {number[]} triangles
   */
  #boundingBox(lines, triangles) {
    /**
     * @param {{ min: number[], max: number[] }} acc
     * @param {number} point
     * @param {number} index
     */
    function reducer(acc, point, index) {
      // [x, y, z, x, y, z, x, y, z, ...]
      const dimension = index % 3;

      acc.min[dimension] = Math.min(acc.min[dimension], point);
      acc.max[dimension] = Math.max(acc.max[dimension], point);

      return acc;
    }

    const { min, max } = triangles.reduce(
      reducer,
      lines.reduce(reducer, {
        min: [Infinity, Infinity, Infinity],
        max: [-Infinity, -Infinity, -Infinity],
      })
    );

    const zCenter = (min[2] + max[2]) / 2;

    const center = [
      (min[0] + max[0]) / 2,
      (min[1] + max[1]) / 2,
      // Parts are usually centered slightly above the origin,
      // whereas models are slightly below.
      // We should center both visually.
      zCenter < 0 ? zCenter : max[2] / 2,
    ];

    const largestExtent = Math.max(
      max[0] - min[0],
      max[1] - min[1],
      max[2] - min[2]
    );

    return { min, max, largestExtent, center };
  }
}

/**
 * @typedef {"lines" | "optionalLines" | "triangles"} GeometryType
 */

/** @typedef {Record<GeometryType, number[]>} Geometry */

/**
 * @typedef {{
 *   color: number;
 *   transformation: Matrix | undefined;
 *   invert: boolean;
 * }} RenderArgs
 */

/**
 * @typedef {{
 *   fileName: string;
 * } & RenderArgs} SubfileRenderArgs
 */

/** @typedef {Geometry & { subFiles: SubfileRenderArgs[]}} RenderResult */

const EmptyRenderResult = () => ({
  lines: [],
  optionalLines: [],
  triangles: [],
  subFiles: [],
});

export class File {
  /**
   * @param {string} name
   * @param {string} contents
   */
  constructor(name, contents) {
    this.name = name;

    this.commands = [];
    this.subFiles = [];

    const BFC_INVERTNEXT = /^0\s+BFC\s+INVERTNEXT/;

    let invertNext = false;
    for (const line of contents.split("\n")) {
      const command = line.trim();

      if (!command) {
        continue;
      }

      let parsed;
      if (BFC_INVERTNEXT.test(command)) {
        invertNext = true;
      } else if ((parsed = DrawCommand.from(command, invertNext))) {
        invertNext = false;

        this.commands.push(parsed);

        if (parsed instanceof DrawFile) {
          this.subFiles.push(parsed.fileName);
        }
      }
    }
  }

  /**
   * @param {RenderArgs} args
   * @param {RenderResult} [accumulator]
   *
   * @returns {RenderResult}
   */
  render(args, accumulator) {
    accumulator ??= EmptyRenderResult();

    for (const command of this.commands) {
      command.render(args, accumulator);
    }

    return accumulator;
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

class Command {
  /**
   * @param {string} command
   * @param {boolean} invert
   */
  static from(command, invert) {
    const [type] = command.split(/\s+/);
    const parsedType = Number.parseInt(type, 10);

    const constructor = CommandMap[parsedType];

    if (!constructor) {
      return null;
    }

    return constructor.from(command, invert);
  }
}

/** @abstract */
class DrawCommand extends Command {
  /**
   * @param {number} color
   * @param {boolean} invert
   */
  constructor(color, invert) {
    super();
    this.color = color;
    this.invert = invert;
  }

  /**
   * @abstract
   *
   * @param {RenderArgs} args
   * @param {RenderResult} [accumulator]
   *
   * @returns {RenderResult}
   */
  render(args, accumulator) {
    throw new Error("Not implemented");
  }

  /**
   * @param {boolean} invert
   */
  shouldInvert(invert) {
    return invert != this.invert;
  }
}

class DrawFile extends DrawCommand {
  /**
   * @param {string} fileName
   * @param {RenderArgs} args
   */
  constructor(fileName, { color, transformation, invert }) {
    super(color, invert);
    this.transformation = transformation ?? identity;
    this.fileName = fileName;
  }

  /**
   * @param {RenderArgs} invert
   * @param {RenderResult} [accumulator]
   *
   * @returns {RenderResult}
   */
  render({ transformation, invert }, accumulator) {
    accumulator ??= EmptyRenderResult();
    accumulator.subFiles.push({
      fileName: this.fileName,
      color: this.color,
      transformation: multiply(this.transformation, transformation),
      invert: this.shouldInvert(invert),
    });

    return accumulator;
  }

  /**
   * @param {string} command
   * @param {boolean} parentInvert
   */
  static from(command, parentInvert) {
    const [_type, color, ...tokens] = command.split(/\s+/);

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

    return new DrawFile(fileName, {
      color: Number.parseInt(color),
      transformation: [a, b, c, x, d, e, f, y, g, h, i, z, 0, 0, 0, 1],
      invert: inverted !== parentInvert,
    });
  }
}

class DrawGeometry extends DrawCommand {
  /** @readonly @type {GeometryType} */
  type = "triangles";

  /**
   * @param {number} color
   * @param {number[][]} coordinates
   * @param {boolean} invert
   */
  constructor(color, coordinates, invert) {
    super(color, invert);
    this.coordinates = coordinates;
    this.invertedCoordinates = coordinates.toReversed();
  }

  /**
   * @param {RenderArgs} args
   * @param {RenderResult} [accumulator]
   *
   * @returns {RenderResult}
   */
  render({ transformation, invert }, accumulator) {
    accumulator ??= EmptyRenderResult();

    const coordinates = this.shouldInvert(invert)
      ? this.invertedCoordinates
      : this.coordinates;

    // Extend geometry array once instead of multiple pushes
    const geometry = accumulator[this.type];
    const startIndex = geometry.length;
    const pointCount = coordinates.length;
    geometry.length = startIndex + pointCount * 3;

    for (let i = 0; i < pointCount; i++) {
      const [x, y, z] = coordinates[i];
      const outOffset = startIndex + i * 3;

      let transformedX = x;
      let transformedY = y;
      let transformedZ = z;

      if (transformation) {
        const [a, b, c, tx, d, e, f, ty, g, h, ii, tz] = transformation;
        transformedX = a * x + b * y + c * z + tx;
        transformedY = d * x + e * y + f * z + ty;
        transformedZ = g * x + h * y + ii * z + tz;
      }

      /*
       * Map an LDraw Coordinate (where -y is out of the page)
       * to a GPU Coordinate (where -z is out of the page).
       */
      geometry[outOffset] = transformedX;
      geometry[outOffset + 1] = transformedZ;
      geometry[outOffset + 2] = transformedY;
    }

    return accumulator;
  }

  /**
   * @param {string} command
   * @param {boolean} invert
   */
  static from(command, invert) {
    const [_type, color, ...points] = command
      .split(/\s+/)
      .map(Number.parseFloat);

    const coordinates = [];
    for (let i = 0; i < points.length; i += 3) {
      coordinates.push([points[i], points[i + 1], points[i + 2]]);
    }

    return new this(color, coordinates, invert);
  }
}

class DrawTriangle extends DrawGeometry {
  /** @type {GeometryType} */
  type = "triangles";
}

class DrawQuadrilateral extends DrawTriangle {
  /**
   * @param {number} color
   * @param {number[][]} coordinates
   * @param {boolean} invert
   */
  constructor(color, coordinates, invert) {
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
    super(color, [one, two, three, three, four, one], invert);
  }
}

class DrawLine extends DrawGeometry {
  /** @type {GeometryType} */
  type = "lines";

  shouldInvert() {
    // Never invert lines
    return false;
  }
}

class DrawOptionalLine extends DrawLine {
  /** @type {GeometryType} */
  type = "optionalLines";
}

/** @type {Record<number, { from(command: string, invert: boolean): DrawCommand}>} */
const CommandMap = {
  [LineType.DrawFile]: DrawFile,
  [LineType.DrawLine]: DrawLine,
  [LineType.DrawTriangle]: DrawTriangle,
  [LineType.DrawQuadrilateral]: DrawQuadrilateral,
  [LineType.DrawOptionalLine]: DrawOptionalLine,
};
