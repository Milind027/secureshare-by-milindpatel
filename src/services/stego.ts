// ============================================================
// SecureShare Steganography Service — PNG and WAV LSB embedding
// ============================================================

/**
 * Check if a cover PNG image has enough capacity for the payload.
 */
export async function checkPngCapacity(
  coverImageBytes: Uint8Array,
  payloadBytes: number
): Promise<{ fits: boolean; coverPixels: number; needed: number }> {
  const bitmap = await createImageBitmap(new Blob([coverImageBytes as BlobPart]));
  const coverPixels = bitmap.width * bitmap.height;
  const needed = (payloadBytes * 8) + 32; // 32 bits for length header
  return { fits: needed <= coverPixels, coverPixels, needed };
}

/**
 * Embed payload into a PNG image using LSB of the R channel.
 * Format: first 32 pixels encode payload length, remaining pixels encode payload bits.
 */
export async function embedInPng(
  coverImageBytes: Uint8Array,
  payload: Uint8Array
): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(new Blob([coverImageBytes as BlobPart]));
  const { width, height } = bitmap;

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels = imageData.data; // RGBA

  const totalPixels = width * height;
  const neededPixels = (payload.length * 8) + 32;
  if (neededPixels > totalPixels) {
    throw new Error(`Cover image too small: need ${neededPixels} pixels, have ${totalPixels}`);
  }

  let pixelIdx = 0;

  // Write payload length as 32-bit big-endian in LSB of R channel
  for (let bit = 31; bit >= 0; bit--) {
    const rgbaIdx = pixelIdx * 4; // R channel
    const bitVal = (payload.length >>> bit) & 1;
    pixels[rgbaIdx] = (pixels[rgbaIdx] & 0xFE) | bitVal;
    pixelIdx++;
  }

  // Write payload bits into LSB of R channel
  for (let i = 0; i < payload.length; i++) {
    for (let bit = 7; bit >= 0; bit--) {
      const rgbaIdx = pixelIdx * 4;
      const bitVal = (payload[i] >>> bit) & 1;
      pixels[rgbaIdx] = (pixels[rgbaIdx] & 0xFE) | bitVal;
      pixelIdx++;
    }
  }

  ctx.putImageData(imageData, 0, 0);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return new Uint8Array(await blob.arrayBuffer());
}

/**
 * Extract payload from a PNG image with LSB steganography.
 */
export async function extractFromPng(
  stegoImageBytes: Uint8Array
): Promise<Uint8Array> {
  const bitmap = await createImageBitmap(new Blob([stegoImageBytes as BlobPart]));
  const { width, height } = bitmap;

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, width, height);
  const pixels = imageData.data;

  let pixelIdx = 0;

  // Read payload length from first 32 pixels
  let payloadLength = 0;
  for (let bit = 31; bit >= 0; bit--) {
    const rgbaIdx = pixelIdx * 4;
    payloadLength |= (pixels[rgbaIdx] & 1) << bit;
    pixelIdx++;
  }

  if (payloadLength <= 0 || payloadLength > (width * height - 32) / 8) {
    throw new Error('Invalid steganography payload length');
  }

  // Read payload bits
  const payload = new Uint8Array(payloadLength);
  for (let i = 0; i < payloadLength; i++) {
    let byte = 0;
    for (let bit = 7; bit >= 0; bit--) {
      const rgbaIdx = pixelIdx * 4;
      byte |= (pixels[rgbaIdx] & 1) << bit;
      pixelIdx++;
    }
    payload[i] = byte;
  }

  return payload;
}

/**
 * Embed payload into a WAV file using LSB of audio samples.
 */
export async function embedInWav(
  coverWavBytes: Uint8Array,
  payload: Uint8Array
): Promise<Uint8Array> {
  const result = new Uint8Array(coverWavBytes);
  const dataView = new DataView(result.buffer, result.byteOffset, result.byteLength);

  // Find the 'data' chunk
  let dataOffset = 12; // Skip RIFF header
  while (dataOffset < result.length - 8) {
    const chunkId = String.fromCharCode(result[dataOffset], result[dataOffset + 1], result[dataOffset + 2], result[dataOffset + 3]);
    const chunkSize = dataView.getUint32(dataOffset + 4, true);
    if (chunkId === 'data') {
      dataOffset += 8; // Move past chunk header
      break;
    }
    dataOffset += 8 + chunkSize;
  }

  const totalSamples = result.length - dataOffset;
  const neededSamples = (payload.length * 8) + 32;
  if (neededSamples > totalSamples) {
    throw new Error(`Cover WAV too small: need ${neededSamples} samples, have ${totalSamples}`);
  }

  let sampleIdx = dataOffset;

  // Write payload length as 32-bit in LSB of samples
  for (let bit = 31; bit >= 0; bit--) {
    const bitVal = (payload.length >>> bit) & 1;
    result[sampleIdx] = (result[sampleIdx] & 0xFE) | bitVal;
    sampleIdx++;
  }

  // Write payload bits into LSB of samples
  for (let i = 0; i < payload.length; i++) {
    for (let bit = 7; bit >= 0; bit--) {
      const bitVal = (payload[i] >>> bit) & 1;
      result[sampleIdx] = (result[sampleIdx] & 0xFE) | bitVal;
      sampleIdx++;
    }
  }

  return result;
}

/**
 * Extract payload from a WAV file with LSB steganography.
 */
export async function extractFromWav(
  stegoWavBytes: Uint8Array
): Promise<Uint8Array> {
  const dataView = new DataView(stegoWavBytes.buffer, stegoWavBytes.byteOffset, stegoWavBytes.byteLength);

  // Find 'data' chunk
  let dataOffset = 12;
  while (dataOffset < stegoWavBytes.length - 8) {
    const chunkId = String.fromCharCode(stegoWavBytes[dataOffset], stegoWavBytes[dataOffset + 1], stegoWavBytes[dataOffset + 2], stegoWavBytes[dataOffset + 3]);
    const chunkSize = dataView.getUint32(dataOffset + 4, true);
    if (chunkId === 'data') {
      dataOffset += 8;
      break;
    }
    dataOffset += 8 + chunkSize;
  }

  let sampleIdx = dataOffset;

  // Read length
  let payloadLength = 0;
  for (let bit = 31; bit >= 0; bit--) {
    payloadLength |= (stegoWavBytes[sampleIdx] & 1) << bit;
    sampleIdx++;
  }

  if (payloadLength <= 0 || payloadLength > (stegoWavBytes.length - dataOffset - 32) / 8) {
    throw new Error('Invalid steganography payload length');
  }

  const payload = new Uint8Array(payloadLength);
  for (let i = 0; i < payloadLength; i++) {
    let byte = 0;
    for (let bit = 7; bit >= 0; bit--) {
      byte |= (stegoWavBytes[sampleIdx] & 1) << bit;
      sampleIdx++;
    }
    payload[i] = byte;
  }

  return payload;
}

/** Detect if bytes are a PNG file */
export function isPng(bytes: Uint8Array): boolean {
  return bytes.length >= 8 &&
    bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4E && bytes[3] === 0x47;
}

/** Detect if bytes are a WAV file */
export function isWav(bytes: Uint8Array): boolean {
  return bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x41 && bytes[10] === 0x56 && bytes[11] === 0x45;
}
