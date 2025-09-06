<template>
  <div class="audio-manager">
    <div class="file-upload">
      <input 
        type="file" 
        multiple 
        accept=".mp3"
        @change="handleFileUpload"
        ref="fileInput"
        style="display: none"
      />
      <button @click="$refs.fileInput.click()" class="btn btn-secondary">
        MP3ファイルを追加
      </button>
      <button 
        @click="startSimpleTranscription" 
        class="btn btn-primary"
        :disabled="audioFiles.length === 0 || isTranscribing"
      >
        {{ isTranscribing ? '文字起こし中...' : '簡易文字起こし' }}
      </button>
      <button 
        @click="autoSyncFiles" 
        class="btn btn-secondary"
        :disabled="!canAutoSync"
      >
        {{ isSyncing ? '同期中...' : '自動同期' }}
      </button>
      <select v-model="syncMethod" class="sync-method-select">
        <option value="correlation">相互相関法</option>
        <option value="timestamp">タイムスタンプ</option>
        <option value="manual">手動調整のみ</option>
      </select>
    </div>
    
    <div v-if="syncResult" class="sync-info">
      <span>同期手法: {{ syncMethodNames[syncResult.method] }}</span>
      <span v-if="syncResult.confidence">信頼度: {{ (syncResult.confidence * 100).toFixed(1) }}%</span>
    </div>

    <div class="audio-list">
      <div v-for="(file, index) in audioFiles" :key="file.id" class="audio-item">
        <div class="audio-info">
          <span class="file-name">{{ file.name }}</span>
          <span class="duration">{{ formatTime(file.duration) }}</span>
        </div>
        
        <div class="audio-controls">
          <!-- 位置合わせ完了トグル -->
          <label class="fix-toggle" v-if="index > 0">
            <input 
              type="checkbox"
              :checked="file.isFixed"
              @change="toggleFixed(index)"
            />
            <span>{{ file.isFixed ? '🔒' : '🔓' }} 位置固定</span>
          </label>
          
          <!-- オフセット調整UI -->
          <div class="offset-control" :class="{ disabled: file.isFixed || index === 0 }">
            <label>オフセット:</label>
            <input 
              type="number"
              :value="index === 0 ? 0 : file.offset"
              @input="updateOffsetDirect(index, $event)"
              :disabled="file.isFixed || index === 0"
              step="0.01"
              class="offset-input"
            />
            <span>秒</span>
            
            <!-- 微調整ボタン -->
            <div class="offset-buttons" v-if="index > 0 && !file.isFixed">
              <button @click="adjustOffset(index, -1)" class="btn btn-tiny">◀ -1s</button>
              <button @click="adjustOffset(index, -0.1)" class="btn btn-tiny">◀ -0.1s</button>
              <button @click="adjustOffset(index, -0.01)" class="btn btn-tiny">◀ -0.01s</button>
              <span class="separator">|</span>
              <button @click="adjustOffset(index, 0.01)" class="btn btn-tiny">▶ +0.01s</button>
              <button @click="adjustOffset(index, 0.1)" class="btn btn-tiny">▶ +0.1s</button>
              <button @click="adjustOffset(index, 1)" class="btn btn-tiny">▶ +1s</button>
            </div>
          </div>
          
          <label>
            音量:
            <input 
              type="range" 
              :min="0" 
              :max="100" 
              :value="file.volume * 100"
              @input="updateVolume(index, $event)"
              class="volume-slider"
            />
          </label>
          
          <button 
            @click="toggleMute(index)"
            class="btn btn-small"
            :class="{ muted: file.muted }"
          >
            {{ file.muted ? '🔇' : '🔊' }}
          </button>
          
          <button @click="removeFile(index)" class="btn btn-small btn-danger">
            削除
          </button>
        </div>
        
        <!-- 波形表示エリア -->
        <div class="waveform-container">
          <div :id="`waveform-${file.id}`" class="waveform"></div>
          <div v-if="index > 0" class="waveform-sync-controls">
            <button @click="showWaveformComparison(index)" class="btn btn-tiny" :disabled="file.isFixed">
              🔍 波形比較
            </button>
          </div>
        </div>
        
        <audio 
          :ref="el => audioRefs[index] = el"
          :src="file.url"
          @loadedmetadata="handleMetadata(index, $event)"
          @timeupdate="handleTimeUpdate"
        />
      </div>
    </div>

    <div v-if="audioFiles.length > 0" class="playback-controls">
      <button @click="seekBackward" class="btn btn-small">⏪</button>
      <button @click="togglePlayPause" class="btn btn-primary">
        {{ isPlaying ? '⏸️' : '▶️' }}
      </button>
      <button @click="seekForward" class="btn btn-small">⏩</button>
      
      <span class="time-display">
        {{ formatTime(currentTime) }} / {{ formatTime(maxDuration) }}
      </span>
      
      <label>
        速度:
        <select v-model="playbackRate" @change="updatePlaybackRate">
          <option value="0.5">0.5x</option>
          <option value="0.75">0.75x</option>
          <option value="1">1.0x</option>
          <option value="1.25">1.25x</option>
          <option value="1.5">1.5x</option>
          <option value="2">2.0x</option>
        </select>
      </label>
      
      <input 
        type="range"
        :min="0"
        :max="maxDuration"
        :value="currentTime"
        @input="seek"
        class="seek-bar"
      />
    </div>
    
    <div v-if="transcriptionStatus" class="transcription-status">
      {{ transcriptionStatus }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import type { AudioFile, Segment } from '../types';
import { findBestOffset, loadAudioBuffer } from '../utils/audioSync';
import WaveSurfer from 'wavesurfer.js';

const props = defineProps<{
  audioFiles: AudioFile[]
}>();

const emit = defineEmits<{
  update: [files: AudioFile[]]
  timeUpdate: [time: number]
  addSegment: [segment: Segment]
}>();

const audioRefs = ref<(HTMLAudioElement | null)[]>([]);
const isPlaying = ref(false);
const currentTime = ref(0);
const playbackRate = ref('1');
const isTranscribing = ref(false);
const isSyncing = ref(false);
const syncMethod = ref('correlation');
const syncResult = ref<{ method: string; confidence?: number } | null>(null);
const transcriptionStatus = ref('');
const waveforms = ref<Map<string, any>>(new Map());
const showingComparison = ref<string | null>(null);

const syncMethodNames: Record<string, string> = {
  correlation: '相互相関法',
  timestamp: 'タイムスタンプベース',
  manual: '手動調整'
};

const maxDuration = computed(() => {
  return Math.max(...props.audioFiles.map(f => f.duration + f.offset), 0);
});

const canAutoSync = computed(() => {
  if (props.audioFiles.length < 2 || isSyncing.value) return false;
  // 先頭以外の全ファイルがFIX済みなら自動同期不可
  const nonFirstFiles = props.audioFiles.slice(1);
  return !nonFirstFiles.every(f => f.isFixed);
});

const handleFileUpload = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  if (!input.files) return;
  
  const newFiles: AudioFile[] = [];
  for (const file of Array.from(input.files)) {
    if (file.type !== 'audio/mpeg') continue;
    
    const audioFile: AudioFile = {
      id: `file_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: file.name,
      blob: file, // メモリ上でのみ保持
      arrayBuffer: undefined, // 保存時に変換
      url: URL.createObjectURL(file),
      duration: 0,
      offset: 0,
      volume: 1,
      muted: false,
      isFixed: false
    };
    newFiles.push(audioFile);
  }
  
  emit('update', [...props.audioFiles, ...newFiles]);
  
  // 波形を初期化
  await nextTick();
  newFiles.forEach(file => {
    initWaveform(file);
  });
};

const handleMetadata = (index: number, event: Event) => {
  const audio = event.target as HTMLAudioElement;
  const files = [...props.audioFiles];
  files[index].duration = audio.duration;
  emit('update', files);
};

const updateOffset = (index: number, event: Event) => {
  const input = event.target as HTMLInputElement;
  const files = [...props.audioFiles];
  files[index].offset = parseFloat(input.value);
  emit('update', files);
};

const updateOffsetDirect = (index: number, event: Event) => {
  if (index === 0) return; // 最初のファイルは基準なので変更不可
  const input = event.target as HTMLInputElement;
  const files = [...props.audioFiles];
  files[index].offset = parseFloat(input.value) || 0;
  emit('update', files);
};

const adjustOffset = (index: number, delta: number) => {
  if (index === 0) return;
  const files = [...props.audioFiles];
  files[index].offset = Math.round((files[index].offset + delta) * 100) / 100; // 0.01秒単位に丸め
  emit('update', files);
};

const toggleFixed = (index: number) => {
  const files = [...props.audioFiles];
  files[index].isFixed = !files[index].isFixed;
  emit('update', files);
};

const updateVolume = (index: number, event: Event) => {
  const input = event.target as HTMLInputElement;
  const files = [...props.audioFiles];
  files[index].volume = parseFloat(input.value) / 100;
  emit('update', files);
  
  if (audioRefs.value[index]) {
    audioRefs.value[index]!.volume = files[index].volume;
  }
};

const toggleMute = (index: number) => {
  const files = [...props.audioFiles];
  files[index].muted = !files[index].muted;
  emit('update', files);
  
  if (audioRefs.value[index]) {
    audioRefs.value[index]!.muted = files[index].muted;
  }
};

const removeFile = (index: number) => {
  const files = [...props.audioFiles];
  const fileId = files[index].id;
  
  // 波形を破棄
  if (waveforms.value.has(fileId)) {
    waveforms.value.get(fileId).destroy();
    waveforms.value.delete(fileId);
  }
  
  URL.revokeObjectURL(files[index].url!);
  files.splice(index, 1);
  emit('update', files);
};

const togglePlayPause = () => {
  if (isPlaying.value) {
    pauseAll();
  } else {
    playAll();
  }
};

const playAll = () => {
  audioRefs.value.forEach((audio, index) => {
    if (!audio) return;
    const file = props.audioFiles[index];
    audio.currentTime = Math.max(0, currentTime.value - file.offset);
    audio.volume = file.volume;
    audio.muted = file.muted;
    audio.playbackRate = parseFloat(playbackRate.value);
    if (audio.currentTime < audio.duration) {
      audio.play();
    }
  });
  isPlaying.value = true;
};

const pauseAll = () => {
  audioRefs.value.forEach(audio => {
    if (audio) audio.pause();
  });
  isPlaying.value = false;
};

const seek = (event: Event) => {
  const input = event.target as HTMLInputElement;
  currentTime.value = parseFloat(input.value);
  
  audioRefs.value.forEach((audio, index) => {
    if (!audio) return;
    const file = props.audioFiles[index];
    audio.currentTime = Math.max(0, currentTime.value - file.offset);
  });
};

const seekForward = () => {
  currentTime.value = Math.min(maxDuration.value, currentTime.value + 5);
  seek({ target: { value: currentTime.value.toString() } } as any);
};

const seekBackward = () => {
  currentTime.value = Math.max(0, currentTime.value - 5);
  seek({ target: { value: currentTime.value.toString() } } as any);
};

const updatePlaybackRate = () => {
  audioRefs.value.forEach(audio => {
    if (audio) audio.playbackRate = parseFloat(playbackRate.value);
  });
};

const handleTimeUpdate = () => {
  if (audioRefs.value.length === 0) return;
  
  const firstAudio = audioRefs.value[0];
  if (firstAudio) {
    currentTime.value = firstAudio.currentTime + (props.audioFiles[0]?.offset || 0);
    emit('timeUpdate', currentTime.value);
  }
};

const startSimpleTranscription = async () => {
  if (props.audioFiles.length === 0) return;
  
  isTranscribing.value = true;
  transcriptionStatus.value = '音声認識を準備中...';
  
  try {
    // プレースホルダーセグメントを作成
    const dummySegments: Segment[] = [
      {
        id: Date.now().toString() + '_1',
        start: 0,
        end: 10,
        text: '[ここに文字起こしテキストを入力してください]',
        speaker: '1'
      },
      {
        id: Date.now().toString() + '_2',
        start: 10,
        end: 20,
        text: '[音声を聞きながら手動で文字起こしをしてください]',
        speaker: '2'
      },
      {
        id: Date.now().toString() + '_3',
        start: 20,
        end: 30,
        text: '[Web Speech APIの制限により、マイク入力が必要です]',
        speaker: '1'
      }
    ];
    
    // セグメントを追加
    dummySegments.forEach(segment => {
      emit('addSegment', segment);
    });
    
    transcriptionStatus.value = '手動文字起こし用のテンプレートを作成しました。音声を聞きながら編集してください。';
    
    // マイクからの音声認識を試みる（オプション）
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const confirmMic = confirm('マイクを使用してリアルタイム文字起こしを行いますか？\n（音声ファイルを再生しながらスピーカーの音をマイクで拾います）');
      
      if (confirmMic) {
        await startMicrophoneTranscription();
      }
    }
    
  } catch (error) {
    console.error('Transcription error:', error);
    transcriptionStatus.value = 'エラーが発生しました。手動で文字起こしを行ってください。';
  } finally {
    isTranscribing.value = false;
    setTimeout(() => {
      transcriptionStatus.value = '';
    }, 5000);
  }
};

const startMicrophoneTranscription = async () => {
  const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
  
  if (!SpeechRecognition) {
    transcriptionStatus.value = 'ブラウザが音声認識をサポートしていません';
    return;
  }
  
  const recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  
  // 複数の言語を試す
  const languages = ['ja-JP', 'ja', 'en-US', 'en'];
  let currentLangIndex = 0;
  
  recognition.lang = languages[currentLangIndex];
  
  recognition.onresult = (event: any) => {
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) {
        const segment: Segment = {
          id: Date.now().toString(),
          start: currentTime.value,
          end: currentTime.value + 5,
          text: event.results[i][0].transcript,
          speaker: '1'
        };
        emit('addSegment', segment);
        transcriptionStatus.value = `認識: ${event.results[i][0].transcript}`;
      }
    }
  };
  
  recognition.onerror = (event: any) => {
    console.log('Recognition error:', event.error);
    
    if (event.error === 'language-not-supported' && currentLangIndex < languages.length - 1) {
      currentLangIndex++;
      recognition.lang = languages[currentLangIndex];
      transcriptionStatus.value = `言語を切り替え中: ${languages[currentLangIndex]}`;
      recognition.start();
    } else {
      transcriptionStatus.value = `音声認識エラー: ${event.error}`;
    }
  };
  
  recognition.onend = () => {
    transcriptionStatus.value = 'マイクからの音声認識を終了しました';
  };
  
  // 音声を再生してからマイク録音を開始
  pauseAll();
  currentTime.value = 0;
  playAll();
  
  transcriptionStatus.value = 'マイクから音声を認識中...（スピーカーの音をマイクに近づけてください）';
  recognition.start();
  
  // 30秒後に停止
  setTimeout(() => {
    recognition.stop();
    pauseAll();
  }, 30000);
};

const autoSyncFiles = async () => {
  if (props.audioFiles.length < 2) return;
  
  isSyncing.value = true;
  syncResult.value = null;
  
  try {
    const files = [...props.audioFiles];
    let totalConfidence = 0;
    let successCount = 0;
    
    if (syncMethod.value === 'correlation') {
      // 相互相関法
      const referenceBuffer = await loadAudioBuffer(props.audioFiles[0].blob);
      const newOffsets: number[] = [0];
      
      for (let i = 1; i < props.audioFiles.length; i++) {
        // FIX済みファイルはスキップ
        if (files[i].isFixed) {
          newOffsets.push(files[i].offset);
          console.log(`File ${i}: Skipped (Fixed)`);
          continue;
        }
        
        const targetBuffer = await loadAudioBuffer(props.audioFiles[i].blob);
        const result = await findBestOffset(referenceBuffer, targetBuffer);
        newOffsets.push(result.offset);
        totalConfidence += result.confidence;
        successCount++;
        
        console.log(`File ${i}: Offset=${result.offset.toFixed(2)}s, Confidence=${(result.confidence * 100).toFixed(1)}%`);
      }
      
      files.forEach((file, index) => {
        if (!file.isFixed) {
          file.offset = Math.round(newOffsets[index] * 100) / 100; // 0.01秒単位に修正
        }
      });
      
      syncResult.value = {
        method: 'correlation',
        confidence: successCount > 0 ? totalConfidence / successCount : 0
      };
      
    } else if (syncMethod.value === 'timestamp') {
      // タイムスタンプベース（簡易実装）
      alert('タイムスタンプベースの同期は未実装です。相互相関法をご利用ください。');
      return;
      
    } else {
      // 手動調整のみ
      syncResult.value = { method: 'manual' };
      alert('手動で各ファイルのオフセットを調整してください。');
      return;
    }
    
    emit('update', files);
    alert(`自動同期が完了しました（${syncMethodNames[syncMethod.value]}）。必要に応じて手動で微調整してください。`);
  } catch (error) {
    console.error('Auto-sync error:', error);
    alert('自動同期に失敗しました。手動で調整してください。');
  } finally {
    isSyncing.value = false;
  }
};

const formatTime = (seconds: number): string => {
  if (!seconds || isNaN(seconds)) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const initWaveform = async (file: AudioFile) => {
  if (!file.url) return;
  
  await nextTick();
  
  const container = document.querySelector(`#waveform-${file.id}`);
  if (!container) return;
  
  try {
    const wavesurfer = WaveSurfer.create({
      container: container as HTMLElement,
      waveColor: '#4CAF50',
      progressColor: '#2196F3',
      cursorColor: '#FF5722',
      height: 60,
      normalize: true,
      backend: 'WebAudio',
      interact: false, // 波形自体はクリック不可
      barWidth: 2,
      barGap: 1
    });
    
    await wavesurfer.load(file.url);
    waveforms.value.set(file.id, wavesurfer);
    
    // 再生位置を同期
    wavesurfer.on('ready', () => {
      updateWaveformPosition(file.id);
    });
  } catch (error) {
    console.error('Failed to initialize waveform:', error);
  }
};

const updateWaveformPosition = (fileId: string) => {
  const wavesurfer = waveforms.value.get(fileId);
  if (!wavesurfer) return;
  
  const file = props.audioFiles.find(f => f.id === fileId);
  if (!file) return;
  
  const audioIndex = props.audioFiles.indexOf(file);
  const audio = audioRefs.value[audioIndex];
  if (!audio) return;
  
  // 現在の再生位置を波形に反映
  const progress = audio.currentTime / audio.duration;
  if (!isNaN(progress)) {
    wavesurfer.seekTo(progress);
  }
};

const showWaveformComparison = (index: number) => {
  const targetFile = props.audioFiles[index];
  const referenceFile = props.audioFiles[0];
  
  if (showingComparison.value === targetFile.id) {
    showingComparison.value = null;
    // 波形を再作成して元の色に戻す
    recreateWaveform(referenceFile);
    recreateWaveform(targetFile);
    return;
  }
  
  showingComparison.value = targetFile.id;
  
  // 波形を再作成して色を変更
  recreateWaveform(referenceFile, '#FF9800', '#FF5722');
  recreateWaveform(targetFile, '#2196F3', '#1976D2');
  
  // 3秒後に元に戻す
  setTimeout(() => {
    if (showingComparison.value === targetFile.id) {
      recreateWaveform(referenceFile);
      recreateWaveform(targetFile);
      showingComparison.value = null;
    }
  }, 3000);
};

const recreateWaveform = async (file: AudioFile, waveColor: string = '#4CAF50', progressColor: string = '#2196F3') => {
  if (!file.url) return;
  
  // 既存の波形を破棄
  if (waveforms.value.has(file.id)) {
    waveforms.value.get(file.id).destroy();
    waveforms.value.delete(file.id);
  }
  
  await nextTick();
  
  const container = document.querySelector(`#waveform-${file.id}`);
  if (!container) return;
  
  try {
    const wavesurfer = WaveSurfer.create({
      container: container as HTMLElement,
      waveColor: waveColor,
      progressColor: progressColor,
      cursorColor: '#FF5722',
      height: 60,
      normalize: true,
      backend: 'WebAudio',
      interact: false,
      barWidth: 2,
      barGap: 1
    });
    
    await wavesurfer.load(file.url);
    waveforms.value.set(file.id, wavesurfer);
    
    // 現在の再生位置を反映
    const audioIndex = props.audioFiles.indexOf(file);
    const audio = audioRefs.value[audioIndex];
    if (audio) {
      const progress = audio.currentTime / audio.duration;
      if (!isNaN(progress)) {
        wavesurfer.seekTo(progress);
      }
    }
  } catch (error) {
    console.error('Failed to recreate waveform:', error);
  }
};

const seekToTime = (time: number) => {
  currentTime.value = time;
  seek({ target: { value: time.toString() } } as any);
  if (isPlaying.value) {
    pauseAll();
    setTimeout(() => playAll(), 100);
  }
};

// 再生位置が更新されたら波形も更新
watch(() => currentTime.value, () => {
  props.audioFiles.forEach(file => {
    updateWaveformPosition(file.id);
  });
});

// ファイルリストが変更されたら波形を初期化
watch(() => props.audioFiles, async (newFiles, oldFiles) => {
  // 新しく追加されたファイルの波形を初期化
  for (const file of newFiles) {
    if (!waveforms.value.has(file.id) && file.url) {
      await initWaveform(file);
    }
  }
  
  // 削除されたファイルの波形を破棄
  if (oldFiles) {
    for (const oldFile of oldFiles) {
      if (!newFiles.find(f => f.id === oldFile.id)) {
        if (waveforms.value.has(oldFile.id)) {
          waveforms.value.get(oldFile.id).destroy();
          waveforms.value.delete(oldFile.id);
        }
      }
    }
  }
}, { deep: true });

onMounted(async () => {
  // 既存のファイルの波形を初期化
  for (const file of props.audioFiles) {
    await initWaveform(file);
  }
});

onUnmounted(() => {
  // すべての波形を破棄
  waveforms.value.forEach(wavesurfer => {
    wavesurfer.destroy();
  });
  waveforms.value.clear();
});

defineExpose({
  seekToTime
});
</script>

<style scoped>
.audio-manager {
  background: white;
  border-radius: 8px;
  padding: 1.5rem;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.file-upload {
  margin-bottom: 1.5rem;
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.audio-list {
  margin-bottom: 1.5rem;
}

.audio-item {
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  padding: 1rem;
  margin-bottom: 1rem;
}

.audio-info {
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.5rem;
  font-weight: bold;
}

.audio-controls {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.audio-controls label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.offset-slider,
.volume-slider {
  width: 100px;
}

.playback-controls {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1rem;
  background: #f5f5f5;
  border-radius: 4px;
}

.seek-bar {
  flex: 1;
}

.time-display {
  font-family: monospace;
}

.transcription-status {
  margin-top: 1rem;
  padding: 0.75rem;
  background: #e3f2fd;
  border: 1px solid #90caf9;
  border-radius: 4px;
  color: #1976d2;
  font-size: 0.875rem;
}

.btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  background: #95a5a6;
  color: white;
  transition: background 0.3s;
}

.btn:hover:not(:disabled) {
  background: #7f8c8d;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: #3498db;
}

.btn-primary:hover:not(:disabled) {
  background: #2980b9;
}

.btn-secondary {
  background: #27ae60;
}

.btn-secondary:hover {
  background: #229954;
}

.btn-danger {
  background: #e74c3c;
}

.btn-danger:hover {
  background: #c0392b;
}

.btn-small {
  padding: 0.25rem 0.5rem;
  font-size: 0.875rem;
}

.muted {
  opacity: 0.5;
}

.sync-method-select {
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: white;
}

.sync-info {
  padding: 0.5rem 1rem;
  background: #d4edda;
  border: 1px solid #c3e6cb;
  border-radius: 4px;
  margin-bottom: 1rem;
  display: flex;
  gap: 2rem;
  font-size: 0.875rem;
  color: #155724;
}

.fix-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.5rem;
  background: #f0f0f0;
  border-radius: 4px;
}

.fix-toggle input[type="checkbox"] {
  cursor: pointer;
}

.offset-control {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.offset-control.disabled {
  opacity: 0.5;
}

.offset-input {
  width: 80px;
  padding: 0.25rem 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-family: monospace;
}

.offset-buttons {
  display: flex;
  gap: 0.25rem;
  align-items: center;
}

.btn-tiny {
  padding: 0.2rem 0.4rem;
  font-size: 0.75rem;
}

.separator {
  margin: 0 0.25rem;
  color: #999;
}

.waveform-container {
  margin-top: 1rem;
  padding: 0.5rem;
  background: #f9f9f9;
  border-radius: 4px;
}

.waveform {
  width: 100%;
  margin-bottom: 0.5rem;
}

.waveform-sync-controls {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}
</style>