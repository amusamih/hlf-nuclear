const path = require("node:path");
const esbuild = require("esbuild");

const workspaceRoot = __dirname;

esbuild
  .build({
    absWorkingDir: workspaceRoot,
    entryPoints: [path.join(workspaceRoot, "src", "index.ts")],
    bundle: true,
    platform: "node",
    target: "node18",
    format: "cjs",
    outfile: path.join(workspaceRoot, "dist", "index.js"),
    external: ["fabric-contract-api", "fabric-shim"],
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
