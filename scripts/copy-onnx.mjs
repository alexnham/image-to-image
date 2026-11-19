import { mkdir, copyFile } from "node:fs/promises";
const destination = new URL("../public/onnx/", import.meta.url);
await mkdir(destination, { recursive: true });
for (const name of [
  "ort-wasm-simd-threaded.mjs",
  "ort-wasm-simd-threaded.wasm",
])
  await copyFile(
    new URL(`../node_modules/onnxruntime-web/dist/${name}`, import.meta.url),
    new URL(name, destination),
  );
console.log("Local ONNX runtime assets ready.");
