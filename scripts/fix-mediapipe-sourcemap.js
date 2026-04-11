const fs = require("fs");
const path = require("path");

const pkgDir = path.join(__dirname, "..", "node_modules", "@mediapipe", "tasks-vision");
const sourceMapPath = path.join(pkgDir, "vision_bundle.mjs.map");
const expectedMapPath = path.join(pkgDir, "vision_bundle_mjs.js.map");

try {
  if (!fs.existsSync(sourceMapPath)) {
    process.exit(0);
  }

  if (!fs.existsSync(expectedMapPath)) {
    fs.copyFileSync(sourceMapPath, expectedMapPath);
    console.log("[postinstall] Patched @mediapipe/tasks-vision source map filename.");
  }
} catch (error) {
  console.warn("[postinstall] Could not patch @mediapipe/tasks-vision source map:", error?.message || error);
}
