import { describe, expect, it, vi } from "vitest";
import type { MarkerTypeSubtype } from "@gamemap/data-contract";
import {
  ATLAS_PAGE_SIZE,
  CIRCULAR_ICON_SCALE,
  COMPACT_SCALE,
  COMPLETED_ALPHA,
  DEFAULT_ICON_SCALE,
  DEFAULT_PIN_THEME,
  FRAGMENT_SCALE,
  PIN_BASE_SIZE,
  PinAtlas,
  SELECTED_SCALE,
  ShelfPacker,
  composePinBitmap,
  countPillWidth,
  pinGeometry,
  pinSignature,
  resolvePinSpec,
  showsCount,
  type AtlasRect,
  type PinCanvas,
  type PinContext2D,
  type PinDrawable,
  type PinSpec,
  type PinTheme,
} from "./pinAtlas.ts";

// ------------------------------------------------------------ fake surfaces ---

interface Op {
  op: string;
  args: readonly unknown[];
}

interface FakeCanvas extends PinCanvas {
  ops: Op[];
}

/**
 * A recording 2D context. The composer is pure drawing code, so the only way to
 * assert on it without a browser is to capture the call sequence — which is also
 * what makes the variant/badge decisions verifiable.
 */
function makeFakeCanvas(width: number, height: number): FakeCanvas {
  const ops: Op[] = [];
  const ctx: PinContext2D = {
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    lineCap: "butt",
    lineJoin: "miter",
    globalAlpha: 1,
    font: "",
    textAlign: "start",
    textBaseline: "alphabetic",
    shadowColor: "",
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    save: () => ops.push({ op: "save", args: [] }),
    restore: () => ops.push({ op: "restore", args: [] }),
    translate: (x, y) => ops.push({ op: "translate", args: [x, y] }),
    scale: (x, y) => ops.push({ op: "scale", args: [x, y] }),
    beginPath: () => ops.push({ op: "beginPath", args: [] }),
    closePath: () => ops.push({ op: "closePath", args: [] }),
    moveTo: (x, y) => ops.push({ op: "moveTo", args: [x, y] }),
    lineTo: (x, y) => ops.push({ op: "lineTo", args: [x, y] }),
    arc: (x, y, r) => ops.push({ op: "arc", args: [x, y, r] }),
    fill: () => ops.push({ op: "fill", args: [ctx.fillStyle] }),
    stroke: () => ops.push({ op: "stroke", args: [ctx.strokeStyle, ctx.lineWidth] }),
    clip: () => ops.push({ op: "clip", args: [] }),
    clearRect: (x, y, w, h) => ops.push({ op: "clearRect", args: [x, y, w, h] }),
    drawImage: (image, dx, dy, dw, dh) =>
      ops.push({ op: "drawImage", args: [image, dx, dy, dw, dh, ctx.globalAlpha] }),
    fillText: (text, x, y) => ops.push({ op: "fillText", args: [text, x, y] }),
  };
  return {
    width,
    height,
    ops,
    getContext: () => ctx,
  };
}

function makeCanvasFactory(): {
  factory: (w: number, h: number) => PinCanvas;
  created: FakeCanvas[];
} {
  const created: FakeCanvas[] = [];
  return {
    factory: (w, h) => {
      const canvas = makeFakeCanvas(w, h);
      created.push(canvas);
      return canvas;
    },
    created,
  };
}

function fakeImage(width = 64, height = 64): PinDrawable {
  return { width, height };
}

// ------------------------------------------------------------------ specs ---

function spec(over: Partial<PinSpec> = {}): PinSpec {
  return {
    variant: "image",
    iconUrl: "https://cdn.example/icons/pal.webp",
    iconScale: DEFAULT_ICON_SCALE,
    completed: false,
    dot: DEFAULT_PIN_THEME.pinDot,
    ring: DEFAULT_PIN_THEME.circularBorder,
    selected: false,
    theme: DEFAULT_PIN_THEME,
    ...over,
  };
}

function subtype(over: Partial<MarkerTypeSubtype> = {}): MarkerTypeSubtype {
  return { id: "s1", name: "chest", ...over };
}

/** `assets.markerIconUrl`-alike: the raw path is observable in the signature. */
const iconUrlOf = (raw: string) => (raw ? `/icons/${raw}.webp` : "");

// ============================================================== signatures ===

describe("pinSignature", () => {
  it("is the Leaflet engine's key layout, field for field", () => {
    expect(
      pinSignature(
        spec({
          variant: "circular",
          iconUrl: "/i/a.webp",
          iconScale: 0.9,
          completed: true,
          dot: "#111111",
          ring: "#ff0000",
          selected: true,
          fragmentType: "air",
          count: 7,
        }),
      ),
    ).toBe("circular|/i/a.webp|0.9|1|#111111|#ff0000|1|air|7");
  });

  it("collapses identical specs onto one key (the cache hit)", () => {
    expect(pinSignature(spec())).toBe(pinSignature(spec()));
    // Distinct objects, same appearance.
    expect(pinSignature(spec({ count: 1 }))).toBe(pinSignature(spec({ count: undefined })));
  });

  it("changes when ANY visual field changes", () => {
    const base = pinSignature(spec());
    const mutations: Partial<PinSpec>[] = [
      { variant: "circular" },
      { variant: "pin" },
      { iconUrl: "/other.webp" },
      { iconScale: 0.9 },
      { completed: true },
      { dot: "#ff0000" },
      { ring: "#ff0000" },
      { selected: true },
      { fragmentType: "air" },
      { fragmentType: "water" },
      { count: 2 },
    ];
    const keys = new Set<string>([base]);
    for (const mutation of mutations) {
      const key = pinSignature(spec(mutation));
      expect(key, `mutation ${JSON.stringify(mutation)} must change the key`).not.toBe(base);
      keys.add(key);
    }
    // ...and they are all distinct from each other too.
    expect(keys.size).toBe(mutations.length + 1);
  });

  it("omits the count unless it is > 1 (`showsCount`)", () => {
    expect(showsCount({ count: undefined })).toBe(false);
    expect(showsCount({ count: 1 })).toBe(false);
    expect(showsCount({ count: 2 })).toBe(true);
    expect(pinSignature(spec({ count: 1 })).endsWith("||")).toBe(true);
    expect(pinSignature(spec({ count: 12 })).endsWith("|12")).toBe(true);
  });

  it("excludes the theme, exactly like the Leaflet icon cache", () => {
    const other: PinTheme = { ...DEFAULT_PIN_THEME, completedAccent: "#4fa8ff" };
    expect(pinSignature(spec({ theme: other }))).toBe(pinSignature(spec()));
  });
});

// =========================================================== spec resolution ===

describe("resolvePinSpec — variants", () => {
  it("falls back to the pin dot when the marker has no icon at all", () => {
    const resolved = resolvePinSpec({}, { resolveIconUrl: iconUrlOf });
    expect(resolved.variant).toBe("pin");
    expect(resolved.iconUrl).toBe("");
    expect(resolved.dot).toBe(DEFAULT_PIN_THEME.pinDot);
    expect(resolved.iconScale).toBe(DEFAULT_ICON_SCALE);
  });

  it("prefers the marker's own icon over the subtype's", () => {
    const resolved = resolvePinSpec(
      { icon: "special", subtypeMeta: subtype({ icon: "generic" }) },
      { resolveIconUrl: iconUrlOf },
    );
    expect(resolved.iconUrl).toBe("/icons/special.webp");
    expect(resolved.variant).toBe("image");
  });

  it("composes the circular variant at 0.9 and rings it with a non-black subtype colour", () => {
    const red = resolvePinSpec(
      { subtypeMeta: subtype({ icon: "pal", pinVariant: "circular", color: "#ff0000" }) },
      { resolveIconUrl: iconUrlOf },
    );
    expect(red.variant).toBe("circular");
    expect(red.iconScale).toBe(CIRCULAR_ICON_SCALE);
    expect(red.ring).toBe("#ff0000");

    const black = resolvePinSpec(
      { subtypeMeta: subtype({ icon: "pal", pinVariant: "circular", color: "#000000" }) },
      { resolveIconUrl: iconUrlOf },
    );
    expect(black.ring).toBe(DEFAULT_PIN_THEME.circularBorder);
  });

  it("tints the pin dot with a non-black subtype colour", () => {
    expect(
      resolvePinSpec(
        { subtypeMeta: subtype({ pinVariant: "pin", icon: "x", color: "#abcdef" }) },
        { resolveIconUrl: iconUrlOf },
      ).dot,
    ).toBe("#abcdef");
    expect(
      resolvePinSpec(
        { subtypeMeta: subtype({ pinVariant: "pin", icon: "x", color: "#000000" }) },
        { resolveIconUrl: iconUrlOf },
      ).dot,
    ).toBe(DEFAULT_PIN_THEME.pinDot);
  });

  it("carries the fragment chevron on the image variant only", () => {
    const image = resolvePinSpec(
      { icon: "frag", fragmentType: "air", subtypeMeta: subtype({ name: "fragments" }) },
      { resolveIconUrl: iconUrlOf },
    );
    expect(image.fragmentType).toBe("air");
    // Leaflet's circular/pin branches never pass `fragmentType`.
    const circular = resolvePinSpec(
      { icon: "frag", fragmentType: "air", subtypeMeta: subtype({ pinVariant: "circular" }) },
      { resolveIconUrl: iconUrlOf },
    );
    expect(circular.fragmentType).toBeUndefined();
    const pin = resolvePinSpec(
      { fragmentType: "water" },
      { resolveIconUrl: iconUrlOf },
    );
    expect(pin.fragmentType).toBeUndefined();
  });
});

describe("resolvePinSpec — the compact/fragment scale table", () => {
  const cases: {
    name: string;
    sub: Partial<MarkerTypeSubtype>;
    expected: number;
  }[] = [
    { name: "plain subtype, no iconScale", sub: {}, expected: DEFAULT_ICON_SCALE },
    { name: "subtype iconScale wins", sub: { iconScale: 1.6 }, expected: 1.6 },
    { name: "gathering category is compact", sub: { category: "gathering" }, expected: COMPACT_SCALE },
    {
      name: "gathering category beats an explicit iconScale",
      sub: { category: "gathering", iconScale: 2 },
      expected: COMPACT_SCALE,
    },
    { name: "hiddenCube is compact", sub: { name: "hiddenCube" }, expected: COMPACT_SCALE },
    {
      name: "fragments is larger, despite also being a compact subtype",
      sub: { name: "fragments" },
      expected: FRAGMENT_SCALE,
    },
    {
      name: "fragments wins over the gathering category too",
      sub: { name: "fragments", category: "gathering" },
      expected: FRAGMENT_SCALE,
    },
  ];

  for (const testCase of cases) {
    it(testCase.name, () => {
      const resolved = resolvePinSpec(
        { subtypeMeta: subtype({ icon: "some", ...testCase.sub }) },
        { resolveIconUrl: iconUrlOf },
      );
      expect(resolved.variant).toBe("image");
      expect(resolved.iconScale).toBe(testCase.expected);
    });
  }

  it("uses `iconScale || 1.25` for the pin variant (compact rules are image-only)", () => {
    expect(
      resolvePinSpec(
        { subtypeMeta: subtype({ category: "gathering", iconScale: 2, pinVariant: "pin", icon: "x" }) },
        { resolveIconUrl: iconUrlOf },
      ).iconScale,
    ).toBe(2);
  });
});

describe("resolvePinSpec — icon-swap vs dim/check", () => {
  const cases: {
    name: string;
    completed: boolean;
    sub: Partial<MarkerTypeSubtype>;
    icon?: string;
    expectedIcon: string;
    /** true = generic dim + green check, false = swapped icon (or nothing). */
    expectedCompleted: boolean;
  }[] = [
    {
      name: "completed + iconComplete → swap the icon, NO dim/check",
      completed: true,
      sub: { icon: "frag", iconComplete: "frag_done" },
      expectedIcon: "/icons/frag_done.webp",
      expectedCompleted: false,
    },
    {
      name: "completed without iconComplete → dim + check",
      completed: true,
      sub: { icon: "chest" },
      expectedIcon: "/icons/chest.webp",
      expectedCompleted: true,
    },
    {
      name: "not completed but iconComplete present → normal icon, no treatment",
      completed: false,
      sub: { icon: "frag", iconComplete: "frag_done" },
      expectedIcon: "/icons/frag.webp",
      expectedCompleted: false,
    },
    {
      name: "empty iconComplete is not a swap (it would blank the icon)",
      completed: true,
      sub: { icon: "frag", iconComplete: "" },
      expectedIcon: "/icons/frag.webp",
      expectedCompleted: true,
    },
    {
      name: "swap also wins over the marker's own icon",
      completed: true,
      icon: "override",
      sub: { icon: "frag", iconComplete: "frag_done" },
      expectedIcon: "/icons/frag_done.webp",
      expectedCompleted: false,
    },
  ];

  for (const testCase of cases) {
    it(testCase.name, () => {
      const resolved = resolvePinSpec(
        {
          icon: testCase.icon,
          completed: testCase.completed,
          subtypeMeta: subtype(testCase.sub),
        },
        { resolveIconUrl: iconUrlOf },
      );
      expect(resolved.iconUrl).toBe(testCase.expectedIcon);
      expect(resolved.completed).toBe(testCase.expectedCompleted);
    });
  }
});

// ================================================================= geometry ===

describe("pinGeometry", () => {
  it("keeps the Leaflet content sizes and badge offsets", () => {
    const image = pinGeometry(spec({ iconScale: DEFAULT_ICON_SCALE }));
    expect(image.contentSize).toBe(PIN_BASE_SIZE * DEFAULT_ICON_SCALE);
    // badgeOffset = 40/2 - 50/2 + 3 → the badge hangs 2px outside the 40px box.
    expect(image.badgeOffset).toBe(-2);
    expect(image.hitSize).toBe(50);

    const pin = pinGeometry(spec({ variant: "pin", iconScale: DEFAULT_ICON_SCALE }));
    expect(pin.contentSize).toBe(30);
    expect(pin.badgeOffset).toBe(8);
    // The content is smaller than the 40px box, so the box is the hit target.
    expect(pin.hitSize).toBe(PIN_BASE_SIZE);
  });

  it("never clips the content", () => {
    for (const iconScale of [0.9, 1, 1.1, 1.25, 2]) {
      const geometry = pinGeometry(spec({ iconScale }));
      expect(geometry.size).toBeGreaterThanOrEqual(geometry.contentSize);
      expect(geometry.size).toBeGreaterThanOrEqual(PIN_BASE_SIZE);
    }
  });

  it("grows the hit rect by exactly the selection scale", () => {
    const plain = pinGeometry(spec());
    const selected = pinGeometry(spec({ selected: true }));
    expect(selected.hitSize).toBeCloseTo(plain.hitSize * SELECTED_SCALE, 10);
    // ...and pads the bitmap further for the baked drop-shadow.
    expect(selected.size).toBeGreaterThan(plain.size * SELECTED_SCALE);
  });

  it("reserves room for the count pill's overhang", () => {
    // The pill hangs off the CONTENT's corner, so it only pushes the bitmap out
    // once the content fills the 40px box (image variant at 1.25 → 50px).
    const plain = pinGeometry(spec({ iconScale: DEFAULT_ICON_SCALE }));
    const badged = pinGeometry(spec({ iconScale: DEFAULT_ICON_SCALE, count: 12 }));
    expect(badged.size).toBeGreaterThan(plain.size);
    // The 30px pin's badge still fits inside the 40px box, so nothing grows.
    expect(pinGeometry(spec({ variant: "pin", count: 12 })).size).toBe(
      pinGeometry(spec({ variant: "pin" })).size,
    );
    // A wider pill needs more room than a narrow one.
    expect(countPillWidth(999)).toBeGreaterThan(countPillWidth(2));
    // A single digit sits right at the CSS `min-width: 14px` floor.
    expect(countPillWidth(2)).toBeCloseTo(14, 0);
    expect(countPillWidth(2)).toBeGreaterThanOrEqual(14);
  });

  it("produces an even bitmap edge so the anchor lands on a pixel centre", () => {
    for (const iconScale of [0.9, 1.1, 1.25]) {
      expect(pinGeometry(spec({ iconScale })).size % 2).toBe(0);
    }
  });
});

// ============================================================= shelf packer ===

function rectsOverlap(a: AtlasRect, b: AtlasRect): boolean {
  if (a.page !== b.page) return false;
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

describe("ShelfPacker", () => {
  it("never overlaps two rects and stays inside its pages", () => {
    const packer = new ShelfPacker(128, 1);
    const rects: AtlasRect[] = [];
    // A mix of sizes, deliberately not divisors of the page size.
    for (let i = 0; i < 60; i++) {
      const size = 12 + (i % 7) * 5;
      const rect = packer.add(size, size);
      expect(rect).not.toBeNull();
      rects.push(rect as AtlasRect);
    }
    for (const rect of rects) {
      expect(rect.x).toBeGreaterThanOrEqual(0);
      expect(rect.y).toBeGreaterThanOrEqual(0);
      expect(rect.x + rect.w).toBeLessThanOrEqual(128);
      expect(rect.y + rect.h).toBeLessThanOrEqual(128);
    }
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        expect(rectsOverlap(rects[i], rects[j]), `${i} overlaps ${j}`).toBe(false);
      }
    }
  });

  it("fills a shelf left to right, then starts the next one", () => {
    const packer = new ShelfPacker(64, 0);
    expect(packer.add(32, 32)).toEqual({ page: 0, x: 0, y: 0, w: 32, h: 32 });
    expect(packer.add(32, 32)).toEqual({ page: 0, x: 32, y: 0, w: 32, h: 32 });
    expect(packer.add(32, 32)).toEqual({ page: 0, x: 0, y: 32, w: 32, h: 32 });
    expect(packer.add(32, 32)).toEqual({ page: 0, x: 32, y: 32, w: 32, h: 32 });
    expect(packer.pageCount).toBe(1);
  });

  it("grows by adding a page when the current one is full", () => {
    const packer = new ShelfPacker(64, 0);
    for (let i = 0; i < 4; i++) packer.add(32, 32);
    expect(packer.pageCount).toBe(1);
    expect(packer.add(32, 32)).toEqual({ page: 1, x: 0, y: 0, w: 32, h: 32 });
    expect(packer.pageCount).toBe(2);
  });

  it("accounts for the padding gutter", () => {
    const packer = new ShelfPacker(64, 1);
    expect(packer.add(30, 30)).toEqual({ page: 0, x: 0, y: 0, w: 30, h: 30 });
    expect(packer.add(30, 30)).toEqual({ page: 0, x: 31, y: 0, w: 30, h: 30 });
    // 31 + 30 + 30 > 64 → next shelf, one gutter row below.
    expect(packer.add(30, 30)).toEqual({ page: 0, x: 0, y: 31, w: 30, h: 30 });
  });

  it("reports no pages before the first insert and rejects the impossible", () => {
    const packer = new ShelfPacker(64, 0);
    expect(packer.pageCount).toBe(0);
    expect(packer.add(65, 10)).toBeNull();
    expect(packer.add(10, 65)).toBeNull();
    expect(packer.add(0, 10)).toBeNull();
    expect(packer.add(Number.NaN, 10)).toBeNull();
    expect(packer.pageCount).toBe(0);
  });

  it("rounds fractional sizes up so a device-pixel rect can never be short", () => {
    const packer = new ShelfPacker(64, 0);
    expect(packer.add(10.2, 10.2)).toEqual({ page: 0, x: 0, y: 0, w: 11, h: 11 });
  });
});

// ================================================================ composing ===

/**
 * `composePinBitmap` creates its canvases in a fixed order: the OUTPUT canvas
 * first, then the content scratch, then (only when selected) the shadow-lifted
 * scratch. Content assertions therefore read `created[1]`.
 */
function contentOps(created: FakeCanvas[]): Op[] {
  return created[1].ops;
}

function opsMatching(ops: Op[], op: string): Op[] {
  return ops.filter((entry) => entry.op === op);
}

describe("composePinBitmap", () => {
  it("sizes the bitmap in device pixels", () => {
    const { factory, created } = makeCanvasFactory();
    const geometry = pinGeometry(spec({ variant: "pin" }));
    composePinBitmap({ spec: spec({ variant: "pin" }), createCanvas: factory, devicePixelRatio: 2 });
    expect(created[0].width).toBe(geometry.size * 2);
    expect(created[0].height).toBe(geometry.size * 2);
  });

  it("draws the pin variant as disc + hairline + dot", () => {
    const { factory, created } = makeCanvasFactory();
    composePinBitmap({
      spec: spec({ variant: "pin", dot: "#abcdef" }),
      createCanvas: factory,
    });
    const ops = contentOps(created);
    // 30px disc, 31px hairline ring, 22px dot.
    expect(opsMatching(ops, "arc").map((op) => op.args[2])).toEqual([15, 15.5, 11]);
    const fills = opsMatching(ops, "fill");
    expect(fills[0].args[0]).toBe(DEFAULT_PIN_THEME.pinDiscBg);
    expect(fills[1].args[0]).toBe("#abcdef");
    expect(opsMatching(ops, "stroke")[0].args).toEqual([DEFAULT_PIN_THEME.pinBorder, 1]);
  });

  it("fits the image variant with `object-fit: contain`", () => {
    const { factory, created } = makeCanvasFactory();
    const iconSpec = spec({ iconScale: 1 }); // 40px content box
    composePinBitmap({ spec: iconSpec, createCanvas: factory, image: fakeImage(100, 50) });
    const draws = opsMatching(contentOps(created), "drawImage");
    // 100×50 contained in 40×40 → 40×20, centred.
    expect(draws[0].args.slice(1, 5)).toEqual([-20, -10, 40, 20]);
  });

  it("crops the circular variant with `object-fit: cover` inside a clip", () => {
    const { factory, created } = makeCanvasFactory();
    const circular = spec({ variant: "circular", iconScale: 1, ring: "#ff0000" });
    composePinBitmap({ spec: circular, createCanvas: factory, image: fakeImage(100, 50) });
    const ops = contentOps(created);
    expect(ops.some((op) => op.op === "clip")).toBe(true);
    const draws = opsMatching(ops, "drawImage");
    // cover: scale by the LARGER ratio (40/50) → 80×40, overflow cropped.
    expect(draws[0].args.slice(1, 5)).toEqual([-40, -20, 80, 40]);
    const strokes = opsMatching(ops, "stroke");
    expect(strokes[strokes.length - 1].args).toEqual(["#ff0000", 1.5]);
  });

  it("paints the circular ring and backing while the image is still loading", () => {
    const { factory, created } = makeCanvasFactory();
    composePinBitmap({
      spec: spec({ variant: "circular", iconScale: 1 }),
      createCanvas: factory,
      image: null,
    });
    const ops = contentOps(created);
    expect(ops.some((op) => op.op === "fill")).toBe(true);
    expect(ops.some((op) => op.op === "stroke")).toBe(true);
    // Nothing to draw for the portrait itself yet.
    expect(opsMatching(ops, "drawImage")).toHaveLength(0);
  });

  it("falls back to the pin dot when the icon failed to load", () => {
    const { factory, created } = makeCanvasFactory();
    composePinBitmap({
      spec: spec({ iconScale: 1 }),
      createCanvas: factory,
      image: null,
      imageFailed: true,
    });
    expect(opsMatching(contentOps(created), "arc").map((op) => op.args[2])).toEqual([15, 15.5, 11]);
  });

  it("blits the finished group at alpha 0.4 when completed", () => {
    const { factory, created } = makeCanvasFactory();
    composePinBitmap({
      spec: spec({ completed: true, iconScale: 1 }),
      createCanvas: factory,
      image: fakeImage(40, 40),
    });
    // The output canvas receives exactly one draw: the whole group, dimmed.
    const outputDraws = opsMatching(created[0].ops, "drawImage");
    expect(outputDraws).toHaveLength(1);
    expect(outputDraws[0].args[5]).toBe(COMPLETED_ALPHA);
  });

  it("draws the green check for the generic completion treatment", () => {
    const { factory, created } = makeCanvasFactory();
    composePinBitmap({
      spec: spec({ completed: true, iconScale: 1 }),
      createCanvas: factory,
      image: fakeImage(40, 40),
    });
    const strokes = opsMatching(contentOps(created), "stroke");
    expect(strokes.some((op) => op.args[0] === DEFAULT_PIN_THEME.completedAccent)).toBe(true);
    // CheckCircle = circle + tick, drawn at lucide's 24-unit stroke width.
    expect(strokes.some((op) => op.args[1] === 3.5)).toBe(true);
  });

  it("draws a chevron for air/water fragments and nothing for ground", () => {
    const shapeOf = (fragmentType: "air" | "water" | "ground") => {
      const { factory, created } = makeCanvasFactory();
      composePinBitmap({
        spec: spec({ fragmentType, iconScale: 1 }),
        createCanvas: factory,
        image: fakeImage(40, 40),
      });
      const ops = contentOps(created);
      const first = ops.findIndex((op) => op.op === "moveTo");
      if (first < 0) return null;
      return [ops[first], ops[first + 1], ops[first + 2]].map((op) => op.args);
    };
    // lucide ChevronUp "m18 15-6-6-6 6" / ChevronDown "m6 9 6 6 6-6" in a 24 box.
    expect(shapeOf("air")).toEqual([
      [18, 15],
      [12, 9],
      [6, 15],
    ]);
    expect(shapeOf("water")).toEqual([
      [6, 9],
      [12, 15],
      [18, 9],
    ]);
    expect(shapeOf("ground")).toBeNull();
  });

  it("draws the count pill only above 1", () => {
    const textOf = (count: number | undefined) => {
      const { factory, created } = makeCanvasFactory();
      composePinBitmap({ spec: spec({ variant: "pin", count }), createCanvas: factory });
      return opsMatching(contentOps(created), "fillText").map((op) => op.args[0]);
    };
    expect(textOf(undefined)).toEqual([]);
    expect(textOf(1)).toEqual([]);
    expect(textOf(23)).toEqual(["23"]);
  });

  it("bakes two drop-shadow passes for the selected pin", () => {
    const { factory, created } = makeCanvasFactory();
    composePinBitmap({
      spec: spec({ variant: "pin", selected: true }),
      createCanvas: factory,
      devicePixelRatio: 1,
    });
    // content canvas + lifted canvas + output canvas
    expect(created).toHaveLength(3);
    const lifted = created[2];
    const scales = lifted.ops.filter((op) => op.op === "scale");
    expect(scales.some((op) => op.args[0] === SELECTED_SCALE)).toBe(true);
    // Two shadow passes plus the un-shadowed copy on top.
    expect(lifted.ops.filter((op) => op.op === "drawImage")).toHaveLength(3);
  });

  it("skips the lift entirely when not selected", () => {
    const { factory, created } = makeCanvasFactory();
    composePinBitmap({ spec: spec({ variant: "pin" }), createCanvas: factory });
    expect(created).toHaveLength(2);
  });
});

// ================================================================== atlas ===

describe("PinAtlas", () => {
  function makeAtlas(over: { loadImage?: (url: string) => Promise<PinDrawable> } = {}) {
    const { factory, created } = makeCanvasFactory();
    const onUpdate = vi.fn();
    const atlas = new PinAtlas({
      createCanvas: factory,
      loadImage: over.loadImage ?? (() => Promise.resolve(fakeImage())),
      devicePixelRatio: 1,
      pageSize: 128,
      onUpdate,
    });
    return { atlas, created, onUpdate };
  }

  it("returns the same entry for the same signature (no second compose)", () => {
    const { atlas } = makeAtlas();
    const first = atlas.get(spec({ variant: "pin" }));
    const second = atlas.get(spec({ variant: "pin" }));
    expect(first).not.toBeNull();
    expect(second).toBe(first);
    expect(atlas.entryCount).toBe(1);
  });

  it("packs distinct appearances into UV rects that match their device size", () => {
    const { atlas } = makeAtlas();
    const entry = atlas.get(spec({ variant: "pin" }));
    expect(entry).not.toBeNull();
    const width = ((entry as { u1: number; u0: number }).u1 - (entry as { u0: number }).u0) * 128;
    expect(width).toBeCloseTo(pinGeometry(spec({ variant: "pin" })).size, 6);
  });

  it("scales the packed rect with the device pixel ratio", () => {
    const { factory } = makeCanvasFactory();
    const atlas = new PinAtlas({
      createCanvas: factory,
      loadImage: () => Promise.resolve(fakeImage()),
      devicePixelRatio: 2,
      pageSize: 512,
    });
    const entry = atlas.get(spec({ variant: "pin" }));
    expect(entry).not.toBeNull();
    const logical = pinGeometry(spec({ variant: "pin" })).size;
    // The sprite is still LOGICAL pixels; only the bitmap doubled.
    expect((entry as { size: number }).size).toBe(logical);
    expect(((entry as { u1: number }).u1 - (entry as { u0: number }).u0) * 512).toBeCloseTo(
      logical * 2,
      6,
    );
  });

  it("adds a page when the current one is full", () => {
    const { atlas } = makeAtlas();
    let maxPage = 0;
    // 128px pages, ~46px pins → 2 per row, 2 rows ≈ 4 per page.
    for (let i = 0; i < 12; i++) {
      const entry = atlas.get(spec({ variant: "pin", dot: `#00000${i}` }));
      expect(entry).not.toBeNull();
      maxPage = Math.max(maxPage, (entry as { page: number }).page);
    }
    expect(maxPage).toBeGreaterThan(0);
    expect(atlas.pageCount).toBe(maxPage + 1);
    expect(atlas.pageTexture(0)).not.toBeNull();
    expect(atlas.pageTexture(maxPage + 1)).toBeNull();
  });

  it("configures page textures for the renderer's y-down contract", () => {
    const { atlas } = makeAtlas();
    atlas.get(spec({ variant: "pin" }));
    const texture = atlas.pageTexture(0);
    expect(texture).not.toBeNull();
    expect(texture?.flipY).toBe(false);
    expect(texture?.generateMipmaps).toBe(false);
  });

  it("recomposes an entry in place when its icon arrives, then notifies", async () => {
    let resolveImage: ((image: PinDrawable) => void) | null = null;
    const { atlas, onUpdate } = makeAtlas({
      loadImage: () =>
        new Promise<PinDrawable>((resolve) => {
          resolveImage = resolve;
        }),
    });
    const before = atlas.get(spec({ iconScale: 1 }));
    expect(before).not.toBeNull();
    onUpdate.mockClear();
    expect(resolveImage).not.toBeNull();
    (resolveImage as unknown as (image: PinDrawable) => void)(fakeImage(40, 40));
    await Promise.resolve();
    await Promise.resolve();
    expect(onUpdate).toHaveBeenCalled();
    // Same rect, same size: the layer needs a repaint, never a rebuild.
    expect(atlas.get(spec({ iconScale: 1 }))).toBe(before);
  });

  it("shares one load between every entry that wants the same icon", async () => {
    const loadImage = vi.fn(() => Promise.resolve(fakeImage(40, 40)));
    const { factory } = makeCanvasFactory();
    const atlas = new PinAtlas({
      createCanvas: factory,
      loadImage,
      devicePixelRatio: 1,
      pageSize: 512,
    });
    atlas.get(spec({ iconScale: 1 }));
    atlas.get(spec({ iconScale: 1, selected: true }));
    atlas.get(spec({ iconScale: 1, completed: true }));
    await Promise.resolve();
    expect(loadImage).toHaveBeenCalledTimes(1);
  });

  it("survives a failed icon load", async () => {
    const { atlas, onUpdate } = makeAtlas({
      loadImage: () => Promise.reject(new Error("404")),
    });
    const entry = atlas.get(spec({ iconScale: 1 }));
    expect(entry).not.toBeNull();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(onUpdate).toHaveBeenCalled();
    expect(atlas.get(spec({ iconScale: 1 }))).toBe(entry);
  });

  it("refuses a bitmap that cannot fit a page instead of throwing", () => {
    const { factory } = makeCanvasFactory();
    const atlas = new PinAtlas({
      createCanvas: factory,
      loadImage: () => Promise.resolve(fakeImage()),
      devicePixelRatio: 1,
      pageSize: 8,
    });
    expect(atlas.get(spec({ variant: "pin" }))).toBeNull();
  });

  it("stops handing out entries once disposed", () => {
    const { atlas } = makeAtlas();
    atlas.get(spec({ variant: "pin" }));
    atlas.dispose();
    expect(atlas.isDisposed).toBe(true);
    expect(atlas.pageCount).toBe(0);
    expect(atlas.get(spec({ variant: "pin" }))).toBeNull();
  });

  it("defaults its page size to the 2048² safe maximum", () => {
    expect(ATLAS_PAGE_SIZE).toBe(2048);
  });
});
