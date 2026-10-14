import test from "node:test";
import assert from "node:assert/strict";
import { privateAddress, sniffImage, safeSvg, imageSize, fetchImage } from "../src/media.mjs";

const png = (w, h) => {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write("IHDR", 12, "latin1"); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
  return b;
};

test("private, loopback, link-local and reserved addresses are refused for image fetches", () => {
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.9", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fc00::1", "fe80::1", "::ffff:10.0.0.1", "224.0.0.1"]) assert.equal(privateAddress(ip), true, ip);
  for (const ip of ["8.8.8.8", "151.101.1.69", "2606:4700::6810:84e5"]) assert.equal(privateAddress(ip), false, ip);
  assert.equal(privateAddress("not-an-ip"), true);
});

test("image type comes from the bytes, not the label", () => {
  assert.equal(sniffImage(png(10, 10)), "png");
  assert.equal(sniffImage(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0])), "jpeg");
  assert.equal(sniffImage(Buffer.from("RIFF\0\0\0\0WEBPVP8 ", "latin1")), "webp");
  assert.equal(sniffImage(Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>')), "svg");
  assert.equal(sniffImage(Buffer.from("<!doctype html><html><body>Not found</body></html>")), null);
  assert.equal(sniffImage(Buffer.from("short")), null);
});

test("SVG with scripts, event handlers or embedded documents is refused", () => {
  assert.equal(safeSvg(Buffer.from('<svg><path d="M0 0h1"/></svg>')), true);
  for (const bad of ['<svg><script>alert(1)</script></svg>', '<svg onload="x()"></svg>', '<svg><a href="javascript:x()"/></svg>', '<svg><foreignObject><iframe/></foreignObject></svg>']) assert.equal(safeSvg(Buffer.from(bad)), false, bad);
});

test("image dimensions are read from headers", () => {
  assert.deepEqual(imageSize(png(256, 128), "png"), { width: 256, height: 128 });
  const gif = Buffer.from("GIF89a\x40\x00\x20\x00", "latin1");
  assert.deepEqual(imageSize(gif, "gif"), { width: 64, height: 32 });
});

test("fetchImage refuses non-https and private targets before any request", async () => {
  await assert.rejects(fetchImage("http://example.com/logo.png"), /https/);
  await assert.rejects(fetchImage("https://127.0.0.1/logo.png"), /Private/);
  await assert.rejects(fetchImage("https://localhost/logo.png"), /Invalid host|private/i);
  await assert.rejects(fetchImage("https://user:pw@example.com/logo.png"), /https/);
});
