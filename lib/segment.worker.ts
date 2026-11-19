import * as ort from "onnxruntime-web/wasm";
ort.env.wasm.numThreads = 1;
ort.env.wasm.wasmPaths = "/onnx/";
let session: ort.InferenceSession | undefined;
self.onmessage = async (event: MessageEvent<{ url: string }>) => {
  try {
    self.postMessage({
      type: "progress",
      message: "Loading product detector…",
    });
    session ??= await ort.InferenceSession.create("/models/u2netp.onnx", {
      executionProviders: ["wasm"],
    });
    const response = await fetch(event.data.url);
    if (!response.ok) throw new Error("Photo unavailable");
    const image = await createImageBitmap(await response.blob());
    const canvas = new OffscreenCanvas(320, 320),
      ctx = canvas.getContext("2d")!;
    ctx.drawImage(image, 0, 0, 320, 320);
    image.close();
    const data = ctx.getImageData(0, 0, 320, 320).data,
      input = new Float32Array(3 * 320 * 320);
    const mean = [0.485, 0.456, 0.406],
      std = [0.229, 0.224, 0.225];
    for (let i = 0; i < 320 * 320; i++)
      for (let c = 0; c < 3; c++)
        input[c * 320 * 320 + i] = (data[i * 4 + c] / 255 - mean[c]) / std[c];
    self.postMessage({ type: "progress", message: "Finding your product…" });
    const output = await session.run({
      [session.inputNames[0]]: new ort.Tensor(
        "float32",
        input,
        [1, 3, 320, 320],
      ),
    });
    const values = output[session.outputNames[0]].data as Float32Array;
    let lo = Infinity,
      hi = -Infinity;
    for (const v of values) {
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    const mask = new Uint8ClampedArray(320 * 320);
    for (let i = 0; i < mask.length; i++)
      mask[i] = ((values[i] - lo) / Math.max(0.00001, hi - lo)) * 255;
    self.postMessage({ type: "done", width: 320, height: 320, mask });
  } catch (error) {
    console.error(
      "Product detection failed",
      error instanceof Error ? error.message : "Unknown error",
    );
    self.postMessage({
      type: "error",
      message:
        "Automatic detection couldn't run on this device. Paint over your product to select it.",
    });
  }
};
