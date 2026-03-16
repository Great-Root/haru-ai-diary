export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

export function pcm16ToFloat32(chunk: Uint8Array): Float32Array {
  const float32Array = new Float32Array(chunk.length / 2);
  const dataView = new DataView(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  for (let i = 0; i < chunk.length / 2; i++) {
    const int16 = dataView.getInt16(i * 2, true);
    float32Array[i] = int16 / 32768;
  }
  return float32Array;
}
