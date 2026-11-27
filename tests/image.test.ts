import { describe, expect, it } from "vitest";
import { detectImageType, toDataUrl } from "../src/core/image.js";

const bytes = (...n: number[]) => new Uint8Array(n);
const text = (s: string) => [...s].map((c) => c.charCodeAt(0));

describe("detectImageType", () => {
  it("detects JPEG", () => expect(detectImageType(bytes(0xff, 0xd8, 0xff, 0xe0, 0))).toBe("jpeg"));
  it("detects PNG", () => expect(detectImageType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0))).toBe("png"));
  it("detects WebP", () => expect(detectImageType(bytes(...text("RIFF"), 1, 2, 3, 4, ...text("WEBP")))).toBe("webp"));
  it("detects HEIC", () => expect(detectImageType(bytes(0, 0, 0, 24, ...text("ftypheic")))).toBe("heic"));
  it("returns null for GIF", () => expect(detectImageType(bytes(...text("GIF89a"), 0, 0, 0, 0, 0, 0))).toBeNull());
  it("returns null for RIFF that is not WebP", () => expect(detectImageType(bytes(...text("RIFF"), 1, 2, 3, 4, ...text("WAVE")))).toBeNull());
  it("returns null for tiny or empty input", () => {
    expect(detectImageType(bytes())).toBeNull();
    expect(detectImageType(bytes(0xff, 0xd8))).toBeNull();
  });
});

describe("toDataUrl", () => {
  it("encodes base64", () => expect(toDataUrl(bytes(...text("hi")), "image/png")).toBe("data:image/png;base64,aGk="));
  it("handles large inputs", () => expect(toDataUrl(new Uint8Array(200_000), "image/jpeg").length).toBeGreaterThan(200_000));
});
