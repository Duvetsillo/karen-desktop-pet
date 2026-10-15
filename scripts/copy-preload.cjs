const fs = require("node:fs");
fs.copyFileSync("electron/preload.cjs", "dist-electron/electron/preload.cjs");
