"use client";

export async function captureElementToPng(element: HTMLElement, filename: string) {
  const mod = await import("html-to-image");
  const dataUrl = await mod.toPng(element, {
    cacheBust: true,
    pixelRatio: 2,
    backgroundColor: "#ffffff",
  });
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  link.click();
}
