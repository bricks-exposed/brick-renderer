/** @import { Matrix } from "./matrix.js" */
import * as matrix from "./matrix.js";

export class MultiPartDocument {
  /**
   * @param {string} mainFileName
   * @param {string | {files: Map<string, ParsedFile>; subFilesToLoad: Set<string> }} contents
   * @param {File[]} loadedFiles
   *
   * @returns {File}
   */
  static from(mainFileName, contents, loadedFiles = []) {
    const { files } =
      typeof contents === "string"
        ? MultiPartDocument.parse(mainFileName, contents)
        : contents;

    const mainFile = files.get(mainFileName);

    if (!mainFile) {
      throw new Error(`File ${mainFileName} is not present in contents`);
    }

    const allFiles = new Set(files.values().map((f) => f.fileName));

    /** @type {Map<string, string[]>} */
    const allReferences = new Map();

    for (const parsed of files.values()) {
      const interFileReferences = parsed.subFileReferences.filter((f) =>
        allFiles.has(f.fileName)
      );

      allReferences.set(
        parsed.fileName,
        interFileReferences.map((f) => f.fileName)
      );
    }

    const startNodes = [mainFileName];
    const out = [];
    let node;

    while ((node = startNodes.shift())) {
      out.push(node);

      const references = allReferences.get(node) ?? [];

      allReferences.delete(node);

      const remainingReferences = new Set([...allReferences.values()].flat());

      for (const reference of references) {
        if (!remainingReferences.has(reference)) {
          startNodes.push(reference);
        }
      }
    }

    const subFiles = loadedFiles;

    for (const fileName of out.slice(1).reverse()) {
      const parsedFile = files.get(fileName);

      if (!parsedFile) {
        throw new Error("This should never happen");
      }

      subFiles.push(File.from(fileName, parsedFile, subFiles));
    }

    return File.from(mainFileName, mainFile, subFiles);
  }

  /**
   * @param {string} fileName
   * @param {string} contents
   *
   * @returns {{
   *   files: Map<string, ParsedFile>;
   *   subFilesToLoad: Set<string>;
   * }}
   */
  static parse(fileName, contents) {
    const FILE_COMMAND = /^\s*0\s+FILE\s+/m;

    let [initial, mainFileContents, ...blocks] = contents.split(FILE_COMMAND);

    // Single file, not mpd
    if (!mainFileContents) {
      mainFileContents = initial;
    }

    /** @type {Map<string, ParsedFile>} */
    const files = new Map();

    const mainFile = File.parse(fileName, mainFileContents);

    files.set(fileName, mainFile);

    /** @type {Set<string>} */
    const definedSubFiles = new Set();

    /** @type {Set<string>} */
    const subFileReferences = new Set();

    for (const block of blocks) {
      const firstNewline = block.indexOf("\n");
      const [rawFileName, contents] = [
        block.slice(0, firstNewline),
        block.slice(firstNewline + 1),
      ];

      const blockFileName = rawFileName.trim();
      const parsed = File.parse(blockFileName, contents);
      definedSubFiles.add(blockFileName);
      parsed.subFileReferences.forEach((f) =>
        subFileReferences.add(f.fileName)
      );
      files.set(blockFileName, parsed);
    }

    const allSubFiles = new Set(
      [...files.values()].flatMap((f) =>
        f.subFileReferences.map((f) => f.fileName)
      )
    );

    const subFilesToLoad = allSubFiles.difference(definedSubFiles);

    return { files, subFilesToLoad };
  }
}

export class File {
  /**
   * @param {string} name
   * @param {Colors} colors
   * @param {readonly DrawCommand[]} commands
   */
  constructor(name, colors, commands) {
    this.name = name;
    this.colors = colors;
    this.commands = commands;
  }

  /**
   * @param {string} name
   * @param {ParsedFile | string} contents
   * @param {File[]} subFiles
   */
  static from(name, contents, subFiles = []) {
    const parsedFile =
      typeof contents === "string" ? File.parse(name, contents) : contents;

    const subFileMap = new Map(subFiles.map((f) => [f.name, f]));

    const drawSubGeometryCommands = [];

    for (const reference of parsedFile.subFileReferences) {
      const subFile = subFileMap.get(reference.fileName);

      if (!subFile) {
        throw new Error(`Missing required subFile ${reference.fileName}`);
      }

      drawSubGeometryCommands.push(new DrawFile(subFile, reference));
    }

    return new File(name, parsedFile.colors, [
      ...parsedFile.commands,
      ...drawSubGeometryCommands,
    ]);
  }

  /**
   * @param {string} fileName
   * @param {string} contents
   *
   * @returns {ParsedFile}
   */
  static parse(fileName, contents) {
    const commands = [];
    const subFileReferences = [];

    const colors = [];

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
      } else if ((parsed = Color.from(command))) {
        colors.push(parsed);
      } else if ((parsed = DrawGeometry.from(command, invertNext))) {
        invertNext = false;

        commands.push(parsed);
      } else if ((parsed = DrawSubGeometry.from(command, invertNext))) {
        invertNext = false;

        if (parsed instanceof DrawCommand) {
          commands.push(parsed);
        } else {
          subFileReferences.push(parsed);
        }
      }
    }

    return {
      fileName,
      colors: Colors.from(colors),
      commands,
      subFileReferences,
      subFilesToLoad: new Set(subFileReferences.map((f) => f.fileName)),
    };
  }

  /**
   * @param {RenderArgs} [args]
   * @param {RenderResult} [accumulator]
   *
   * @returns {RenderResult}
   */
  render(
    args = {
      transformation: matrix.identity,
      color: Color.CURRENT_COLOR_CODE,
      invert: false,
    },
    accumulator
  ) {
    accumulator ??= {
      lines: [],
      optionalLines: [],
      triangles: [],
      studs: [],
    };

    for (const command of this.commands) {
      command.render(args, accumulator);
    }

    return accumulator;
  }

  /**
   * @returns {PartGeometry}
   */
  geometry() {
    const {
      lines,
      optionalLines: rawOptionalLines,
      triangles,
      studs: rawStuds,
    } = this.render();

    const { viewBox, center } = File.#boundingBox(lines);

    const optionalLines = new Float32Array(rawOptionalLines.length * 2);

    for (let i = 0; i < rawOptionalLines.length; i += DrawOptionalLine.stride) {
      const points = rawOptionalLines.slice(i, i + DrawOptionalLine.stride);
      const index = i * 2;

      // Optional lines are duplicated for the GPU because it needs to render
      // each point considering both points and control points
      optionalLines.set(points, index);
      optionalLines.set(points, index + points.length);
    }

    const studStride = 17; // 16 matrix + 1 color
    const studs = new Float32Array(rawStuds.length * studStride);

    for (let i = 0; i < rawStuds.length; i++) {
      const args = rawStuds[i];
      const index = i * studStride;
      studs.set(args.transformation, index);
      studs[index + 16] = args.color;
    }

    return {
      fileName: this.name,
      lines: new Float32Array(lines),
      optionalLines,
      triangles: new Float32Array(triangles),
      studs: studs,
      viewBox,
      center,
    };
  }

  /**
   * @param {number[]} lines
   *
   * @returns {{ viewBox: number; center: [number, number, number]}}
   */
  static #boundingBox(lines) {
    if (lines.length === 0) {
      return { viewBox: 10, center: [0, 0, 0] };
    }

    let min = [
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
      Number.POSITIVE_INFINITY,
    ];
    let max = [
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
    ];

    for (let i = 0; i < lines.length; i += 4) {
      for (let j = 0; j < 3; j++) {
        min[j] = Math.min(min[j], lines[i + j]);
        max[j] = Math.max(max[j], lines[i + j]);
      }
    }

    const largestExtent = Math.max(
      max[0] - min[0],
      max[1] - min[1],
      max[2] - min[2]
    );

    return {
      viewBox: largestExtent / 2,
      center: [
        (min[0] + max[0]) / 2,
        (min[1] + max[1]) / 2,
        (min[2] + max[2]) / 2,
      ],
    };
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

/** @abstract */
class DrawCommand {
  /**
   * @param {number} color
   * @param {boolean} invert
   */
  constructor(color, invert) {
    this.color = color === Color.CURRENT_COLOR_CODE ? null : color;
    this.invertedByParent = invert;
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
  shouldInvert(invert = false) {
    return invert != this.invertedByParent;
  }
}

/** @abstract */
class DrawSubGeometry extends DrawCommand {
  /**
   * @param {SubFileReference} refererence
   */
  constructor({ color, transformation, invertSelf, parentInvert }) {
    super(color, parentInvert);
    this.transformation = transformation ?? matrix.identity;
    this.invertSelf = invertSelf;
  }

  /**
   * @param {RenderArgs} args
   * @param {RenderResult} accumulator
   *
   * @returns {RenderResult}
   */
  render({ color, transformation, invert }, accumulator) {
    this._renderInternal(
      {
        color: this.color ?? color,
        transformation: matrix.multiply(transformation, this.transformation),
        invert: this.shouldInvert(invert),
      },
      accumulator
    );

    return accumulator;
  }

  /**
   * @abstract @protected
   *
   * @param {RenderArgs} args
   * @param {RenderResult} accumulator
   *
   * @returns {RenderResult}
   */
  _renderInternal(args, accumulator) {
    throw new Error(
      "DrawSubGeometry is abstract. Did you mean to call a subclass?"
    );
  }

  /**
   * @param {string} command
   * @param {boolean} parentInvert
   *
   * @returns {SubFileReference | DrawStud | undefined}
   */
  static from(command, parentInvert) {
    const [type, unparsedColor, ...tokens] = command.split(/\s+/);

    if (type !== LineType.DrawFile.toString()) {
      return undefined;
    }

    const color = Number(unparsedColor);

    const fileName = command.match(/^(\S+\s+){14}(?<fileName>.*)/)?.groups
      ?.fileName;

    if (!fileName) {
      throw new Error(
        `Missing filename for draw file (type 1) command: ${command}`
      );
    }

    const [x, y, z, a, b, c, d, e, f, g, h, i] = tokens.map(Number.parseFloat);

    const invertSelf = matrix.determinant(a, b, c, d, e, f, g, h, i) < 0;

    /**
     * Map an LDraw matrix (where -y is out of the page)
     * to a GPU matrix (where -z is out of the page).
     *
     * @type {Matrix}
     */
    const transformation = [a, g, d, 0, c, i, f, 0, b, h, e, 0, x, z, y, 1];

    const reference = {
      fileName,
      color,
      transformation,
      invertSelf,
      parentInvert,
    };

    return fileName === "stud.dat" ? new DrawStud(reference) : reference;
  }

  /**
   * @param {boolean} invert
   */
  shouldInvert(invert = false) {
    return super.shouldInvert(invert) !== this.invertSelf;
  }
}

class DrawFile extends DrawSubGeometry {
  /**
   * @param {File} file
   * @param {SubFileReference} reference
   */
  constructor(file, reference) {
    super(reference);
    this.file = file;
  }

  /**
   * @protected
   *
   * @param {RenderArgs} args
   * @param {RenderResult} accumulator
   *
   * @returns {RenderResult}
   */
  _renderInternal(args, accumulator) {
    return this.file.render(args, accumulator);
  }
}

class DrawStud extends DrawSubGeometry {
  /**
   * @param {SubFileReference} reference
   */
  constructor(reference) {
    super(reference);
  }

  /**
   * @protected
   *
   * @param {RenderArgs} args
   * @param {RenderResult} accumulator
   *
   * @returns {RenderResult}
   */
  _renderInternal(args, accumulator) {
    accumulator.studs.push(args);
    return accumulator;
  }
}

class DrawGeometry extends DrawCommand {
  /** @type {keyof Geometry} */
  type = "triangles";

  /**
   * @param {number} color
   * @param {Coordinate[]} coordinates
   * @param {boolean} invert
   */
  constructor(color, coordinates, invert) {
    super(color, invert);

    this.coordinates = coordinates;
    this.invertedCoordinates = coordinates.toReversed();
  }

  /**
   * @param {RenderArgs} args
   * @param {RenderResult} accumulator
   *
   * @returns {RenderResult}
   */
  render({ color, transformation, invert }, accumulator) {
    const geometry = accumulator[this.type];

    const startingIndex = geometry.length;
    const stride = 4; // (x y z c)
    geometry.length += this.coordinates.length * stride;

    const array = this.shouldInvert(invert)
      ? this.invertedCoordinates
      : this.coordinates;

    const [a, b, c, , d, e, f, , g, h, ii, , tx, ty, tz] = transformation;

    for (let i = 0; i < this.coordinates.length; i++) {
      const index = startingIndex + i * stride;

      const x = array[i][0];
      const y = array[i][1];
      const z = array[i][2];

      geometry[index] = a * x + d * y + g * z + tx;
      geometry[index + 1] = b * x + e * y + h * z + ty;
      geometry[index + 2] = c * x + f * y + ii * z + tz;

      geometry[index + 3] = this.color ?? color;
    }

    return accumulator;
  }

  /**
   * @param {string} command
   * @param {boolean} invert
   */
  static from(command, invert) {
    const tokens = command.split(/\s+/);

    const type = Number(tokens[0]);

    const subclass = CommandMap[type];

    if (!subclass) {
      return undefined;
    }

    const [_type, color, ...points] = command
      .split(/\s+/)
      .map(Number.parseFloat);

    /** @type {Coordinate[]} */
    const coordinates = [];
    for (let i = 0; i < points.length; i += 3) {
      coordinates.push([points[i], points[i + 2], points[i + 1]]);
    }

    return new subclass(color, coordinates, invert);
  }
}

class DrawQuadrilateral extends DrawGeometry {
  /**
   * @param {number} color
   * @param {Coordinate[]} coordinates
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
  /** @readonly */
  type = "lines";

  shouldInvert() {
    // Never invert lines
    return false;
  }
}

class DrawOptionalLine extends DrawGeometry {
  /** @readonly */
  type = "optionalLines";

  static stride = 4 * 4; // x y z c * 2 points * 2 control

  shouldInvert() {
    // Never invert lines
    return false;
  }
}

/** @type {Record<number, { new(color: number, coordinates: Coordinate[], invert: boolean): DrawGeometry}>} */
const CommandMap = {
  [LineType.DrawLine]: DrawLine,
  [LineType.DrawOptionalLine]: DrawOptionalLine,
  [LineType.DrawTriangle]: DrawGeometry,
  [LineType.DrawQuadrilateral]: DrawQuadrilateral,
};

export class Colors {
  #colors;

  /**
   * @param {readonly Color[]} colors
   */
  constructor(colors) {
    this.all = colors;
    this.#colors = new Map(colors.map((c) => [c.code, c]));
  }

  /**
   *
   * @param {readonly {
   *   code: number;
   *   rgba: Rgba;
   * }[]} colors
   */
  static from(colors) {
    return new Colors(
      colors.map(({ code, rgba }) => new Color(code.toString(), code, rgba))
    );
  }

  /**
   * @param {Colors} colors
   */
  combine(colors) {
    return new Colors([...this.all, ...colors.all]);
  }

  /**
   * @param {Color} color
   */
  newWith(color) {
    return new Colors([...this.all, color]);
  }

  /**
   * @param {number | string} code
   */
  for(code) {
    code = Number(code);

    if (code === Color.CURRENT_COLOR_CODE) {
      return Color.CURRENT_COLOR;
    }

    if (code === Color.EDGE_COLOR_CODE) {
      return Color.EDGE_COLOR;
    }

    const color = this.#colors.get(code);

    if (!color) {
      throw new Error(`No color defined for code ${code}`);
    }

    return color;
  }
}

export class Color {
  static CURRENT_COLOR_CODE = 16;

  static CURRENT_COLOR = new Color(
    "Current color",
    this.CURRENT_COLOR_CODE,
    [0, 0, 0, 0]
  );

  static EDGE_COLOR_CODE = 24;

  static EDGE_COLOR = new Color(
    "Current color",
    this.EDGE_COLOR_CODE,
    [0, 0, 0, 0]
  );

  static DEFAULT = new Color("DEFAULT_COLOR", -1, "#1B2A34");

  /** @readonly @type {Rgba} */
  rgba;

  /**
   * @param {string} name
   * @param {number} code
   * @param {string | Rgba} value
   */
  constructor(name, code, value) {
    this.name = name;
    this.code = code;

    if (typeof value === "string") {
      const r = Number.parseInt(value.slice(1, 3), 16);
      const g = Number.parseInt(value.slice(3, 5), 16);
      const b = Number.parseInt(value.slice(5, 7), 16);
      const a =
        value.length === 9
          ? // I find the configured alpha values a little too transparent
            Number.parseInt(value.slice(7), 16) + 50
          : 255;
      this.rgba = [r, g, b, Math.min(a, 255)];
    } else {
      this.rgba = value;
    }
    this.opaque = this.rgba[3] === 255;
  }

  /**
   * @param {string} hex
   */
  static custom(hex) {
    return new Color("Custom", -1, hex);
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
      value
    );
  }
}

/**
 * @typedef {{
 *   fileName: string;
 *   color: number;
 *   transformation: Matrix;
 *   invertSelf: boolean;
 *   parentInvert: boolean;
 * }} SubFileReference
 */

/**
 * @typedef {{
 *   fileName: string;
 *   colors: Colors;
 *   commands: readonly DrawCommand[];
 *   subFileReferences: readonly SubFileReference[];
 *   subFilesToLoad: Set<string>;
 * }} ParsedFile
 */

/** @typedef {[number, number, number]} Coordinate */

/** @typedef {[Coordinate, Coordinate, Coordinate]} Triangle */

/** @typedef {[number, number, number, number]} Rgba */

/**
 * @typedef {{
 *   points: [Coordinate, Coordinate];
 *   controlPoints?: [Coordinate, Coordinate] | undefined;
 * }} RenderLine
 */

/**
 * @typedef {{
 *   lines: number[];
 *   optionalLines: number[];
 *   triangles: number[];
 * }} Geometry
 */

/**
 * @typedef {{
 *   color: number;
 *   transformation: Matrix;
 *   invert: boolean;
 * }} RenderArgs
 */

/** @typedef {Geometry & { studs: RenderArgs[] }} RenderResult */

/**
 * @typedef {{
 *   fileName: string;
 *   lines: Float32Array<ArrayBuffer>;
 *   optionalLines: Float32Array<ArrayBuffer>;
 *   triangles: Float32Array<ArrayBuffer>;
 *   studs: Float32Array<ArrayBuffer>;
 *   viewBox: number,
 *   center: [number, number, number],
 * }} PartGeometry
 */
