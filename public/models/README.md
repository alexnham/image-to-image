U-2-Netp ONNX weights (Apache-2.0), downloaded 2026-11-18.
Source: https://huggingface.co/BritishWerewolf/U-2-Netp
Original authors: https://github.com/xuebinqin/U-2-Net
Conversion credits: rembg, BritishWerewolf.

320×320 salient-object segmentation, CPU WASM inference entirely in browser.
Input: RGB, ImageNet normalization. Output: soft alpha, resampled to original size.
The user confirms and refines with positive/negative brush taps. No image is sent
outside the app for segmentation. Not calibrated for automatic confirmation;
transparent objects and fine edges require visual checking.
