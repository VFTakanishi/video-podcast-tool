const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const dataRoot = process.env.DATA_ROOT
  ? path.resolve(process.env.DATA_ROOT)
  : path.join(ROOT, "data");
const targetDefaultDir = path.join(dataRoot, "default-assets");
const seedDefaultDir = path.join(ROOT, "default-assets");

function copyMissingSeedAssets() {
  if (!fs.existsSync(seedDefaultDir)) {
    return;
  }

  fs.mkdirSync(targetDefaultDir, { recursive: true });
  for (const entry of fs.readdirSync(seedDefaultDir, { withFileTypes: true })) {
    if (!entry.isFile()) {
      continue;
    }

    const source = path.join(seedDefaultDir, entry.name);
    const target = path.join(targetDefaultDir, entry.name);
    if (!fs.existsSync(target)) {
      fs.copyFileSync(source, target);
    }
  }
}

copyMissingSeedAssets();
require(path.join(ROOT, "web", "server.js"));
