import { apply, determinant, identity, multiply } from "./matrix.js";

export class PartLoader {
  /** @type {(fileName: string) => Promise<string | undefined>} */
  #accessFile;

  /** @type {Map<string, Promise<string | undefined>>} */
  #requestCache;

  /** @type {Map<string, File>} */
  #fileCache;

  /** @type {Map<string, Promise<Part>>} */
  #partCache;

  /**
   * @param {(fileName: string) => Promise<string | undefined>} accessFile
   */
  constructor(accessFile) {
    this.#accessFile = accessFile;
    this.#fileCache = new Map();
    this.#partCache = new Map();
    this.#requestCache = new Map();
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
    const contents = await this.#fetch(fileName);

    if (contents == null) {
      return undefined;
    }

    return new File(fileName, contents);
  }

  /**
   * @param {string} fileName
   */
  async #fetch(fileName) {
    let prefixes;

    if (fileName.startsWith("s\\")) {
      prefixes = ["ldraw/parts"];
    } else if (fileName.startsWith("8\\")) {
      prefixes = ["ldraw/p"];
    } else {
      prefixes = ["ldraw/parts", "ldraw/p"];
    }

    const options = prefixes.map(
      (d) => `${d}/${fileName.replaceAll("\\", "/")}`
    );

    const responses = await Promise.allSettled(
      options.map((path) => {
        const cachedRequest = this.#requestCache.get(path);

        if (cachedRequest) {
          return cachedRequest;
        }
        const request = this.#accessFile(path);
        this.#requestCache.set(path, request);
        return request;
      })
    );

    const contents = responses
      .filter((r) => r.status === "fulfilled")
      .find((f) => f.value != null)?.value;

    return contents ?? undefined;
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
   * @param {RenderResult} [accumulator]
   *
   * @returns {Record<GeometryType, Float32Array<ArrayBuffer>>}
   */
  render(args, accumulator) {
    const renderArgs = {
      color: args?.color ?? 16,
      transformation: args?.transformation,
      invert: args?.invert ?? false,
    };

    accumulator ??= EmptyRenderResult();

    const { subFiles } = this.file.render(renderArgs, accumulator);

    for (const subFile of subFiles) {
      const subPart = this.subParts.get(subFile.fileName);

      if (!subPart) {
        throw new Error(`Could not find subpart ${subFile}`);
      }

      subPart.render(subFile, { ...accumulator, subFiles: [] });
    }

    return {
      lines: new Float32Array(accumulator.lines),
      optionalLines: new Float32Array(accumulator.optionalLines),
      triangles: new Float32Array(accumulator.triangles),
    };
  }
}

/**
 * @typedef {"lines" | "optionalLines" | "triangles"} GeometryType
 */

/** @typedef {Record<GeometryType, number[]>} Geometry */

/**
 * @typedef {{
 *   color: number;
 *   transformation: import("./matrix.js").Matrix | undefined;
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

    const commands = contents
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    this.commands = [...File.getCommands(commands)];
    this.subFiles = this.commands
      .filter((c) => c instanceof DrawFile)
      .map((c) => c.fileName);
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

  /**
   * @param {string[]} commands
   */
  static *getCommands(commands) {
    const BFC_INVERTNEXT = /^0\s*BFC\s*INVERTNEXT/;

    let invertNext = false;
    let parsed;

    for (const command of commands) {
      if (BFC_INVERTNEXT.test(command)) {
        invertNext = true;
      } else if ((parsed = DrawCommand.from(command, invertNext))) {
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
  }

  /**
   * @param {RenderArgs} args
   * @param {RenderResult} [accumulator]
   *
   * @returns {RenderResult}
   */
  render({ transformation, invert }, accumulator) {
    accumulator ??= EmptyRenderResult();

    const transformer = apply.bind(null, transformation);
    const transformed = this.coordinates.map(transformer);

    if (this.shouldInvert(invert)) {
      transformed.reverse();
    }

    /*
     * Map an LDraw Coordinate (where -y is out of the page)
     * to a GPU Coordinate (where -z is out of the page).
     */
    const data = transformed.map(([x, y, z]) => [x, z, y]).flat();

    accumulator[this.type].push(...data);

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
