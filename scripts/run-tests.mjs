import { rm, mkdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import esbuild from "esbuild";

const outdir = ".tmp-tests";
const testFiles = [
	"tests/taskMakerFieldCleaner.test.ts",
	"tests/taskPriorityService.test.ts",
];
const bundledTests = [];

await rm(outdir, { recursive: true, force: true });
await mkdir(outdir, { recursive: true });

for (const entryPoint of testFiles) {
	const outfile = `${outdir}/${entryPoint.split("/").pop().replace(/\.ts$/, ".cjs")}`;
	bundledTests.push(outfile);
	await esbuild.build({
		entryPoints: [entryPoint],
		bundle: true,
		platform: "node",
		format: "cjs",
		target: "node20",
		outfile,
		external: ["obsidian"],
		logLevel: "silent",
	});
}

const result = spawnSync("node", ["--test", ...bundledTests], { stdio: "inherit" });
process.exit(result.status ?? 1);
