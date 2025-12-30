/** @import { Matrix } from "./matrix.js" */
import { determinant, identity, multiply } from "./matrix.js";

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

    const center = [
      (min[0] + max[0]) / 2,
      (min[1] + max[1]) / 2,
      (min[2] + max[2]) / 2,
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

/**
 * @typedef {{
 *   invert: boolean;
 * }} Context
 */

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
      } else if ((parsed = DrawCommand.from(command, { invert: invertNext }))) {
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
   * @param {Readonly<Context>} context
   */
  static from(command, context) {
    const [type] = command.split(/\s+/);
    const parsedType = Number.parseInt(type, 10);

    const constructor = CommandMap[parsedType];

    if (!constructor) {
      return null;
    }

    return constructor.from(command, context);
  }
}

/** @abstract */
class DrawCommand extends Command {
  /**
   * @param {number} color
   * @param {Readonly<Context>} context
   */
  constructor(color, context) {
    super();
    this.color = color;
    this.context = context;
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
    return invert != this.context.invert;
  }
}

class DrawFile extends DrawCommand {
  /**
   * @param {string} fileName
   * @param {RenderArgs} args
   * @param {Readonly<Context>} context
   */
  constructor(fileName, { color, transformation, invert }, context) {
    super(color, context);
    this.transformation = transformation ?? identity;
    this.invert = invert;
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
   * @param {Context} context
   */
  static from(command, context) {
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

    return new DrawFile(
      fileName,
      {
        color: Number.parseInt(color),
        transformation: [a, b, c, x, d, e, f, y, g, h, i, z, 0, 0, 0, 1],
        invert: inverted,
      },
      context
    );
  }

  /**
   * @param {boolean} invert
   */
  shouldInvert(invert) {
    return super.shouldInvert(invert) !== this.invert;
  }
}

class DrawGeometry extends DrawCommand {
  /** @readonly @type {GeometryType} */
  type = "triangles";

  /**
   * @param {number} color
   * @param {number[][]} coordinates
   * @param {Readonly<Context>} context
   */
  constructor(color, coordinates, context) {
    super(color, context);
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
   * @param {Readonly<Context>} context
   */
  static from(command, context) {
    const [_type, color, ...points] = command
      .split(/\s+/)
      .map(Number.parseFloat);

    const coordinates = [];
    for (let i = 0; i < points.length; i += 3) {
      coordinates.push([points[i], points[i + 1], points[i + 2]]);
    }

    return new this(color, coordinates, context);
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
   * @param {Readonly<Context>} context
   */
  constructor(color, coordinates, context) {
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
    super(color, [one, two, three, three, four, one], context);
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

/** @type {Record<number, { from(command: string, context: Readonly<Context>): DrawCommand}>} */
const CommandMap = {
  [LineType.DrawFile]: DrawFile,
  [LineType.DrawLine]: DrawLine,
  [LineType.DrawTriangle]: DrawTriangle,
  [LineType.DrawQuadrilateral]: DrawQuadrilateral,
  [LineType.DrawOptionalLine]: DrawOptionalLine,
};

export class Color {
  /**
   * @param {string} name
   * @param {number} code
   * @param {string} value
   * @param {string} edge
   */
  constructor(name, code, value, edge) {
    this.name = name;
    this.code = code;
    this.value = value;
    this.edge = edge;
  }

  /**
   * @param {string} command
   */
  static from(command) {
    /*
     * 0 !COLOUR <name>
     * CODE <c, number>
     * VALUE <v, hex>
     * EDGE <e, hex>
     * [ALPHA <a, 0-255>]
     * [LUMINANCE <l>]
     * [CHROME | PEARLESCENT | RUBBER | MATTE_METALLIC | METAL | MATERIAL <params>]
     */
    let [
      _type,
      _COLOUR,
      name,
      _CODE,
      code,
      _VALUE,
      value,
      _EDGE,
      edge,
      ...optional
    ] = command.split(/\s+/);

    const alphaParam = optional.findIndex((p) => p.toLowerCase() === "alpha");

    if (alphaParam !== -1) {
      const alpha = Number.parseInt(optional[alphaParam + 1], 10);
      const alphaHex = alpha.toString(16);
      value += alphaHex;
      edge += alphaHex;
    }

    return new Color(name, Number.parseInt(code, 10), value, edge);
  }
}
