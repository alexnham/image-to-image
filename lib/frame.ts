import type { Layers } from "./engine/engine";
export function frame(
  width: number,
  height: number,
  layers: Pick<Layers, "crop" | "rotation">,
) {
  const rotation = layers.rotation ?? 0,
    rotatedWidth = rotation % 180 ? height : width,
    rotatedHeight = rotation % 180 ? width : height;
  let cropWidth = rotatedWidth,
    cropHeight = rotatedHeight;
  if (layers.crop === "square")
    cropWidth = cropHeight = Math.min(rotatedWidth, rotatedHeight);
  if (layers.crop === "portrait") {
    const units = Math.floor(Math.min(rotatedWidth / 4, rotatedHeight / 5));
    cropWidth = units
      ? units * 4
      : Math.max(1, Math.min(rotatedWidth, Math.floor(rotatedHeight * 0.8)));
    cropHeight = units
      ? units * 5
      : Math.max(1, Math.min(rotatedHeight, Math.floor(cropWidth / 0.8)));
  }
  const left = Math.floor((rotatedWidth - cropWidth) / 2),
    top = Math.floor((rotatedHeight - cropHeight) / 2);
  return {
    width: cropWidth,
    height: cropHeight,
    outputWidth: layers.crop === "portrait" && cropWidth < 4 ? 4 : cropWidth,
    outputHeight: layers.crop === "portrait" && cropHeight < 5 ? 5 : cropHeight,
    left,
    top,
    toView(x: number, y: number) {
      const [rx, ry] =
        rotation === 90
          ? [(1 - y) * height, x * width]
          : rotation === 180
            ? [(1 - x) * width, (1 - y) * height]
            : rotation === 270
              ? [y * height, (1 - x) * width]
              : [x * width, y * height];
      return { x: (rx - left) / cropWidth, y: (ry - top) / cropHeight };
    },
    fromView(x: number, y: number) {
      const rx = x * cropWidth + left,
        ry = y * cropHeight + top;
      const [ox, oy] =
        rotation === 90
          ? [ry / width, 1 - rx / height]
          : rotation === 180
            ? [1 - rx / width, 1 - ry / height]
            : rotation === 270
              ? [1 - ry / width, rx / height]
              : [rx / width, ry / height];
      return { x: ox, y: oy };
    },
  };
}
