<template>
  <div class="transcript-editor">
    <div class="editor-header">
      <h2>文字起こし</h2>
      <div class="speaker-list">
        <span v-for="speaker in speakers" :key="speaker.id" class="speaker-tag">
          {{ speaker.prefix }}: {{ speaker.name }}
        </span>
      </div>
    </div>
    
    <div class="editor-content">
      <div 
        v-if="transcript.segments.length === 0" 
        class="empty-state"
      >
        <p>文字起こしデータがありません。音声ファイルをアップロードして「文字起こし開始」をクリックしてください。</p>
        <button @click="addManualSegment" class="btn btn-primary">
          手動で追加
        </button>
      </div>
      
      <div v-else class="segments">
        <div 
          v-for="(segment, index) in transcript.segments" 
          :key="segment.id"
          class="segment"
          :class="{ active: isSegmentActive(segment) }"
        >
          <div class="segment-controls">
            <select 
              :value="segment.speaker" 
              @change="updateSpeaker(index, $event)"
              class="speaker-select"
            >
              <option value="">話者なし</option>
              <option v-for="speaker in speakers" :key="speaker.id" :value="speaker.id">
                {{ speaker.prefix }}: {{ speaker.name }}
              </option>
            </select>
            
            <span class="timestamp">
              {{ formatTime(segment.start) }} - {{ formatTime(segment.end) }}
            </span>
            
            <button @click="playSegment(segment)" class="btn btn-small">
              ▶️
            </button>
            
            <button @click="deleteSegment(index)" class="btn btn-small btn-danger">
              削除
            </button>
          </div>
          
          <textarea
            :value="segment.text"
            @input="updateText(index, $event)"
            @click="seekToSegment(segment)"
            class="segment-text"
            :placeholder="`${getSpeakerPrefix(segment.speaker)}: テキストを入力...`"
            rows="3"
          />
        </div>
      </div>
      
      <div class="editor-actions">
        <button @click="addManualSegment" class="btn btn-secondary">
          セグメントを追加
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import type { Transcript, Speaker, Segment } from '../types';

const props = defineProps<{
  transcript: Transcript
  speakers: Speaker[]
  currentTime: number
}>();

const emit = defineEmits<{
  update: [transcript: Transcript]
  seekTo: [time: number]
}>();

const activeSegmentId = ref<string | null>(null);

const isSegmentActive = (segment: Segment): boolean => {
  return props.currentTime >= segment.start && props.currentTime <= segment.end;
};

const getSpeakerPrefix = (speakerId?: string): string => {
  if (!speakerId) return '';
  const speaker = props.speakers.find(s => s.id === speakerId);
  return speaker ? speaker.prefix : '';
};

const updateSpeaker = (index: number, event: Event) => {
  const select = event.target as HTMLSelectElement;
  const newTranscript = { ...props.transcript };
  newTranscript.segments[index].speaker = select.value || undefined;
  emit('update', newTranscript);
};

const updateText = (index: number, event: Event) => {
  const textarea = event.target as HTMLTextAreaElement;
  const newTranscript = { ...props.transcript };
  newTranscript.segments[index].text = textarea.value;
  emit('update', newTranscript);
};

const deleteSegment = (index: number) => {
  const newTranscript = { ...props.transcript };
  newTranscript.segments.splice(index, 1);
  emit('update', newTranscript);
};

const addManualSegment = () => {
  const newSegment: Segment = {
    id: Date.now().toString(),
    start: props.currentTime,
    end: props.currentTime + 10,
    text: '',
    speaker: props.speakers[0]?.id
  };
  
  const newTranscript = { ...props.transcript };
  newTranscript.segments.push(newSegment);
  newTranscript.segments.sort((a, b) => a.start - b.start);
  emit('update', newTranscript);
};

const playSegment = (segment: Segment) => {
  emit('seekTo', segment.start);
};

const seekToSegment = (segment: Segment) => {
  emit('seekTo', segment.start);
};

const formatTime = (seconds: number): string => {
  if (!seconds || isNaN(seconds)) return '00:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

watch(() => props.currentTime, (time) => {
  const activeSegment = props.transcript.segments.find(seg => 
    time >= seg.start && time <= seg.end
  );
  
  if (activeSegment) {
    activeSegmentId.value = activeSegment.id;
    
    const element = document.querySelector(`.segment.active`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
});
</script>

<style scoped>
.transcript-editor {
  background: white;
  border-radius: 8px;
  padding: 1.5rem;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
  max-height: 600px;
  display: flex;
  flex-direction: column;
}

.editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid #e0e0e0;
}

.editor-header h2 {
  margin: 0;
  font-size: 1.25rem;
}

.speaker-list {
  display: flex;
  gap: 1rem;
}

.speaker-tag {
  padding: 0.25rem 0.75rem;
  background: #ecf0f1;
  border-radius: 4px;
  font-size: 0.875rem;
}

.editor-content {
  flex: 1;
  overflow-y: auto;
}

.empty-state {
  text-align: center;
  padding: 3rem 1rem;
  color: #7f8c8d;
}

.segments {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.segment {
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  padding: 1rem;
  transition: all 0.3s;
}

.segment.active {
  background: #e8f6ff;
  border-color: #3498db;
}

.segment-controls {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 0.5rem;
}

.speaker-select {
  padding: 0.25rem 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.timestamp {
  font-family: monospace;
  font-size: 0.875rem;
  color: #7f8c8d;
}

.segment-text {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  resize: vertical;
  font-family: inherit;
}

.segment-text:focus {
  outline: none;
  border-color: #3498db;
}

.editor-actions {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #e0e0e0;
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

.btn:hover {
  background: #7f8c8d;
}

.btn-primary {
  background: #3498db;
}

.btn-primary:hover {
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
</style>