export interface AudioSyncResult {
  offset: number;
  confidence: number;
}

export async function findBestOffset(
  audioBuffer1: AudioBuffer,
  audioBuffer2: AudioBuffer,
  maxOffset: number = 30,
  sampleStep: number = 0.01
): Promise<AudioSyncResult> {
  const sampleRate = audioBuffer1.sampleRate;
  const data1 = audioBuffer1.getChannelData(0);
  const data2 = audioBuffer2.getChannelData(0);
  
  // ダウンサンプリングして計算を高速化
  const downsampleFactor = 100;
  const downsampledData1 = downsample(data1, downsampleFactor);
  const downsampledData2 = downsample(data2, downsampleFactor);
  
  let bestOffset = 0;
  let maxCorrelation = -Infinity;
  
  // -maxOffset から +maxOffset 秒の範囲で相関を計算
  const offsetSamples = Math.floor(maxOffset * sampleRate / downsampleFactor);
  const step = Math.floor(sampleStep * sampleRate / downsampleFactor);
  
  for (let offset = -offsetSamples; offset <= offsetSamples; offset += step) {
    const correlation = calculateCorrelation(
      downsampledData1,
      downsampledData2,
      offset
    );
    
    if (correlation > maxCorrelation) {
      maxCorrelation = correlation;
      bestOffset = offset * downsampleFactor / sampleRate;
    }
  }
  
  return {
    offset: bestOffset,
    confidence: Math.min(maxCorrelation / 1000, 1) // 正規化
  };
}

function downsample(data: Float32Array, factor: number): Float32Array {
  const newLength = Math.floor(data.length / factor);
  const result = new Float32Array(newLength);
  
  for (let i = 0; i < newLength; i++) {
    let sum = 0;
    for (let j = 0; j < factor; j++) {
      sum += Math.abs(data[i * factor + j] || 0);
    }
    result[i] = sum / factor;
  }
  
  return result;
}

function calculateCorrelation(
  data1: Float32Array,
  data2: Float32Array,
  offset: number
): number {
  const length = Math.min(data1.length, data2.length) - Math.abs(offset);
  const sampleLength = Math.min(length, 10000); // 最大10000サンプル
  
  let sum = 0;
  const start1 = offset > 0 ? 0 : -offset;
  const start2 = offset > 0 ? offset : 0;
  
  for (let i = 0; i < sampleLength; i++) {
    const val1 = data1[start1 + i] || 0;
    const val2 = data2[start2 + i] || 0;
    sum += val1 * val2;
  }
  
  return sum / sampleLength;
}

export async function loadAudioBuffer(blob: Blob | undefined): Promise<AudioBuffer> {
  if (!blob) {
    throw new Error('Audio blob is not available');
  }
  const audioContext = new AudioContext();
  const arrayBuffer = await blob.arrayBuffer();
  return await audioContext.decodeAudioData(arrayBuffer);
}