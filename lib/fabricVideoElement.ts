'use client';

import { FabricImage } from 'fabric';

export type FabricVideoResult = {
  fabricObj: FabricImage;
  videoEl: HTMLVideoElement;
};

export function createFabricVideo(
  url: string,
  opts: { left: number; top: number; scaleX: number; scaleY: number },
): Promise<FabricVideoResult> {
  return new Promise((resolve, reject) => {
    const videoEl = document.createElement('video');
    videoEl.muted = true;
    videoEl.loop = true;
    videoEl.playsInline = true;
    videoEl.preload = 'auto';

    const timeout = setTimeout(() => {
      reject(new Error(`Video load timeout: ${url}`));
    }, 15000);

    videoEl.addEventListener('loadeddata', () => {
      clearTimeout(timeout);
      const w = videoEl.videoWidth || 640;
      const h = videoEl.videoHeight || 360;
      videoEl.width = w;
      videoEl.height = h;
      const fabricObj = new FabricImage(videoEl, {
        left: opts.left,
        top: opts.top,
        width: w,
        height: h,
        scaleX: opts.scaleX,
        scaleY: opts.scaleY,
        objectCaching: false,
      });
      resolve({ fabricObj, videoEl });
    }, { once: true });

    videoEl.addEventListener('error', () => {
      clearTimeout(timeout);
      reject(new Error(`Failed to load video: ${url}`));
    }, { once: true });

    videoEl.src = url;
    videoEl.load();
  });
}

export function createFabricImage(
  url: string,
  opts: { left: number; top: number; scaleX: number; scaleY: number },
): Promise<FabricImage> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    const timeout = setTimeout(() => {
      reject(new Error(`Image load timeout: ${url}`));
    }, 15000);

    img.onload = () => {
      clearTimeout(timeout);
      const fabricObj = new FabricImage(img, {
        left: opts.left,
        top: opts.top,
        width: img.naturalWidth || 100,
        height: img.naturalHeight || 100,
        scaleX: opts.scaleX,
        scaleY: opts.scaleY,
        objectCaching: false,
      });
      resolve(fabricObj);
    };

    img.onerror = () => {
      clearTimeout(timeout);
      reject(new Error(`Failed to load image: ${url}`));
    };

    img.src = url;
  });
}
