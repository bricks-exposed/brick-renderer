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
      color: args?.color ?? null,
      transformation: args?.transformation,
      invert: args?.invert ?? false,
    };

    const { lines, optionalLines, opaqueTriangles, transparentTriangles } =
      this.#render(renderArgs, EmptyRenderResult());

    return {
      lines: new Float32Array(lines),
      optionalLines: new Float32Array(optionalLines),
      opaqueTriangles: new Float32Array(opaqueTriangles),
      transparentTriangles: new Float32Array(transparentTriangles),
      ...this.#boundingBox(lines, opaqueTriangles, transparentTriangles),
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
   * @param {number[]} opaqueTriangles
   * @param {number[]} transparentTriangles
   */
  #boundingBox(lines, opaqueTriangles, transparentTriangles) {
    /**
     * @param {{ min: number[], max: number[] }} acc
     * @param {number} point
     * @param {number} dimension
     */
    function reducer(acc, point, dimension) {
      acc.min[dimension] = Math.min(acc.min[dimension], point);
      acc.max[dimension] = Math.max(acc.max[dimension], point);

      return acc;
    }

    /**
     * @param {{ min: number[], max: number[] }} acc
     * @param {number} point
     * @param {number} index
     */
    function opaqueTriangleReducer(acc, point, index) {
      // [x, y, z, r, g, b, x, y, z, r, g, b, x, y, z, r, g, b, ...]
      const dimension = index % 6;

      if (dimension >= 3) {
        return acc;
      }

      return reducer(acc, point, dimension);
    }

    /**
     * @param {{ min: number[], max: number[] }} acc
     * @param {number} point
     * @param {number} index
     */
    function transparentTriangleReducer(acc, point, index) {
      // [x, y, z, r, g, b, a, x, y, z, r, g, b, a, x, y, z, r, g, b, a, ...]
      const dimension = index % 7;

      if (dimension >= 3) {
        return acc;
      }

      return reducer(acc, point, dimension);
    }

    /**
     * @param {{ min: number[], max: number[] }} acc
     * @param {number} point
     * @param {number} index
     */
    function lineReducer(acc, point, index) {
      // [x, y, z, x, y, z, x, y, z, ...]
      const dimension = index % 3;

      return reducer(acc, point, dimension);
    }

    const {
      min,
      max,
    } = //opaqueTriangles.reduce(
      // opaqueTriangleReducer,
      // transparentTriangles.reduce(
      //   transparentTriangleReducer,
      lines.reduce(lineReducer, {
        min: [Infinity, Infinity, Infinity],
        max: [-Infinity, -Infinity, -Infinity],
      });
    // )
    // );

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
 * @typedef {"lines" | "optionalLines" | "opaqueTriangles" | "transparentTriangles"} GeometryType
 */

/** @typedef {Record<GeometryType, number[]>} Geometry */

/**
 * @typedef {{
 *   color: Color | null;
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
  opaqueTriangles: [],
  transparentTriangles: [],
  subFiles: [],
});

/**
 * @typedef {{
 *   invert: boolean;
 *   colors: Colors;
 * }} Context
 */

export class File {
  /**
   * @param {string} name
   * @param {string} contents
   * @param {Colors} colors
   */
  constructor(name, contents, colors) {
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
      } else if (
        (parsed = DrawCommand.from(command, {
          invert: invertNext,
          colors,
        }))
      ) {
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
   * @param {Color | null} color
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
   * @param {Color | null} color
   * @param {Matrix | undefined} transformation
   * @param {boolean} invert
   * @param {Readonly<Context>} context
   */
  constructor(fileName, color, transformation, invert, context) {
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
  render({ color, transformation, invert }, accumulator) {
    accumulator ??= EmptyRenderResult();
    accumulator.subFiles.push({
      fileName: this.fileName,
      color: this.color ?? color,
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
    const [_type, colorCode, ...tokens] = command.split(/\s+/);

    const color = context.colors.for(colorCode);

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
      color,
      [a, b, c, x, d, e, f, y, g, h, i, z, 0, 0, 0, 1],
      inverted,
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
  /**
   * @param {Color | null} color
   * @param {number[][]} coordinates
   * @param {Readonly<Context>} context
   */
  constructor(color, coordinates, context) {
    super(color, context);
    this.coordinates = coordinates;
    this.invertedCoordinates = coordinates.toReversed();
  }

  /**
   * @param {string} command
   * @param {Readonly<Context>} context
   */
  static from(command, context) {
    const [_type, colorCode, ...points] = command
      .split(/\s+/)
      .map(Number.parseFloat);

    const color = context.colors.for(colorCode);

    const coordinates = [];
    for (let i = 0; i < points.length; i += 3) {
      coordinates.push([points[i], points[i + 1], points[i + 2]]);
    }

    return new this(color, coordinates, context);
  }
}

class DrawTriangle extends DrawGeometry {
  /**
   * @param {RenderArgs} args
   * @param {RenderResult} [accumulator]
   *
   * @returns {RenderResult}
   */
  render({ color, transformation, invert }, accumulator) {
    accumulator ??= EmptyRenderResult();

    const [r, g, b, a] = this.rgba(color);

    const transparent = a !== 255;

    const geometry = transparent
      ? accumulator.transparentTriangles
      : accumulator.opaqueTriangles;

    const coordinates = this.shouldInvert(invert)
      ? this.invertedCoordinates
      : this.coordinates;

    // Extend geometry array once instead of multiple pushes
    const startIndex = geometry.length;
    const pointCount = coordinates.length;
    const stride = 7;
    geometry.length = startIndex + pointCount * stride;

    for (let i = 0; i < pointCount; i++) {
      const [x, y, z] = coordinates[i];
      const outOffset = startIndex + i * stride;

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

      geometry[outOffset + 3] = r;
      geometry[outOffset + 4] = g;
      geometry[outOffset + 5] = b;
      geometry[outOffset + 6] = a;
    }

    return accumulator;
  }

  /**
   * @param {Color | null} color
   */
  rgba(color) {
    return this.color?.rgba ?? color?.rgba ?? Color.UNSPECIFIED_RGBA;
  }
}

class DrawQuadrilateral extends DrawTriangle {
  /**
   * @param {Color} color
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

  /**
   * @param {Color | null} color
   * @param {number[][]} coordinates
   * @param {Readonly<Context>} context
   */
  constructor(color, coordinates, context) {
    super(null, coordinates, context);
  }

  /**
   * @param {RenderArgs} args
   * @param {RenderResult} [accumulator]
   *
   * @returns {RenderResult}
   */
  render({ transformation }, accumulator) {
    accumulator ??= EmptyRenderResult();
    const geometry = accumulator[this.type];

    const coordinates = this.coordinates;

    // Extend geometry array once instead of multiple pushes
    const startIndex = geometry.length;
    const pointCount = coordinates.length;
    const stride = 3;
    geometry.length = startIndex + pointCount * stride;

    for (let i = 0; i < pointCount; i++) {
      const [x, y, z] = coordinates[i];
      const outOffset = startIndex + i * stride;

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

export class Configuration {
  /**
   * @param {Colors} colors
   */
  constructor(colors) {
    this.colors = colors;
  }

  /**
   * @param {string} contents
   */
  static from(contents) {
    const commands = contents.split("\n").filter((l) => !!l.trim());

    const colors = commands.map(Color.from).filter((c) => c != null);

    return new this(new Colors(colors));
  }
}

export class Colors {
  #colors;

  /**
   * @param {readonly Color[]} colors
   */
  constructor(colors) {
    this.#colors = new Map(colors.map((c) => [c.code, c]));
  }

  /**
   * @param {number | string} code
   */
  for(code) {
    code = typeof code === "number" ? code : Number.parseInt(code, 10);

    if (code === Color.CURRENT_COLOR || code === Color.EDGE_COLOR) {
      return null;
    }

    const color = this.#colors.get(code);

    if (!color) {
      throw new Error(`No color defined for code ${code}`);
    }

    return color;
  }
}

export class Color {
  static CURRENT_COLOR = 16;

  static EDGE_COLOR = 24;

  static DEFAULT = new Color("DEFAULT_COLOR", -1, "#1B2A34", "#2B4354");

  static UNSPECIFIED_RGBA = [-1, -1, -1, 0];

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
    const r = Number.parseInt(value.slice(1, 3), 16);
    const g = Number.parseInt(value.slice(3, 5), 16);
    const b = Number.parseInt(value.slice(5, 7), 16);
    const a = value.length === 9 ? Number.parseInt(value.slice(7), 16) : 255;
    this.rgba = [r, g, b, a];
  }

  /**
   * @param {string} hex
   */
  static custom(hex) {
    return new Color("Custom", -1, hex, hex);
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
      type,
      metaCommand,
      name,
      _CODE,
      code,
      _VALUE,
      value,
      _EDGE,
      edge,
      ...optional
    ] = command.split(/\s+/);

    if (type !== "0" || metaCommand !== "!COLOUR") {
      return undefined;
    }

    const alphaParam = optional.findIndex((p) => p.toLowerCase() === "alpha");

    if (alphaParam !== -1) {
      const alpha = Number.parseInt(optional[alphaParam + 1], 10);
      const alphaHex = alpha.toString(16);
      value += alphaHex;
      edge += alphaHex;
    }

    return new Color(
      name.replaceAll("_", " "),
      Number.parseInt(code, 10),
      value,
      edge
    );
  }
}
