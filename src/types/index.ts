export interface Project {
  id: string;
  name: string;
  created: Date;
  updated: Date;
  audioFiles: AudioFile[];
  transcript: Transcript;
  speakers: Speaker[];
}

export interface AudioFile {
  id: string;
  name: string;
  blob?: Blob; // メモリ上でのみ保持
  arrayBuffer?: ArrayBuffer; // IndexedDB保存用
  url?: string;
  duration: number;
  offset: number;
  volume: number;
  muted: boolean;
}

export interface StoredAudioFile extends Omit<AudioFile, 'blob' | 'url'> {
  // IndexedDBに保存する際はBlobとURLを除外
  arrayBuffer?: ArrayBuffer; // 音声データ本体
}

export interface Transcript {
  segments: Segment[];
}

export interface Segment {
  id: string;
  start: number;
  end: number;
  text: string;
  speaker?: string;
}

export interface Speaker {
  id: string;
  name: string;
  prefix: string;
}

export interface TranscriptionResult {
  text: string;
  segments: Array<{
    start: number;
    end: number;
    text: string;
  }>;
}