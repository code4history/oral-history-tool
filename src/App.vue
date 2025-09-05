<template>
  <div class="app">
    <header class="header">
      <h1>オーラルヒストリー文字起こしツール</h1>
      <div class="actions">
        <button @click="createNewProject" class="btn btn-primary">新規プロジェクト</button>
        <button @click="exportText" class="btn" :disabled="!currentProject">エクスポート</button>
      </div>
    </header>

    <main class="main-content">
      <AudioManager 
        v-if="currentProject"
        ref="audioManagerRef"
        :audioFiles="currentProject.audioFiles"
        @update="updateAudioFiles"
        @timeUpdate="handleTimeUpdate"
        @addSegment="handleAddSegment"
      />
      
      <TranscriptEditor
        v-if="currentProject"
        :transcript="currentProject.transcript"
        :speakers="currentProject.speakers"
        :currentTime="currentTime"
        @update="updateTranscript"
        @seekTo="handleSeekTo"
      />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import AudioManager from './components/AudioManager.vue';
import TranscriptEditor from './components/TranscriptEditor.vue';
import { db } from './db';
import type { Project, AudioFile, Transcript, Segment } from './types';

const currentProject = ref<Project | null>(null);
const currentTime = ref(0);
const audioManagerRef = ref<InstanceType<typeof AudioManager> | null>(null);

const createNewProject = async () => {
  const projectId = Date.now().toString();
  const newProject: Project = {
    id: projectId,
    name: `プロジェクト ${new Date().toLocaleDateString()}`,
    created: new Date(),
    updated: new Date(),
    audioFiles: [],
    transcript: { segments: [] },
    speakers: [
      { id: '1', name: 'インタビュアー', prefix: 'I' },
      { id: '2', name: '回答者', prefix: 'R' }
    ]
  };
  
  await db.saveProject(newProject);
  currentProject.value = newProject;
};

const updateAudioFiles = async (files: AudioFile[]) => {
  if (!currentProject.value) return;
  currentProject.value.audioFiles = files;
  await db.saveProject(currentProject.value);
};

const updateTranscript = async (transcript: Transcript) => {
  if (!currentProject.value) return;
  currentProject.value.transcript = transcript;
  await db.saveProject(currentProject.value);
};

const handleTimeUpdate = (time: number) => {
  currentTime.value = time;
};

const handleSeekTo = (time: number) => {
  if (audioManagerRef.value) {
    (audioManagerRef.value as any).seekToTime(time);
  }
};

const handleAddSegment = (segment: Segment) => {
  if (!currentProject.value) return;
  currentProject.value.transcript.segments.push(segment);
  currentProject.value.transcript.segments.sort((a, b) => a.start - b.start);
  updateTranscript(currentProject.value.transcript);
};

const exportText = () => {
  if (!currentProject.value) return;
  
  const text = currentProject.value.transcript.segments
    .map(seg => {
      const speaker = currentProject.value?.speakers.find(s => s.id === seg.speaker);
      const prefix = speaker ? `${speaker.prefix}: ` : '';
      return `${prefix}${seg.text}`;
    })
    .join('\n\n');
  
  const blob = new Blob([text], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${currentProject.value.name}.txt`;
  a.click();
  URL.revokeObjectURL(url);
};

onMounted(async () => {
  try {
    const projects = await db.getAllProjects();
    if (projects.length > 0) {
      currentProject.value = projects[0];
      console.log('Loaded project:', currentProject.value.name);
      console.log('Audio files:', currentProject.value.audioFiles.length);
    }
  } catch (error) {
    console.error('Failed to load projects:', error);
  }
});
</script>

<style>
.app {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.header {
  background: #2c3e50;
  color: white;
  padding: 1rem 2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header h1 {
  margin: 0;
  font-size: 1.5rem;
}

.actions {
  display: flex;
  gap: 1rem;
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

.btn-primary:hover {
  background: #2980b9;
}

.main-content {
  flex: 1;
  padding: 2rem;
  display: flex;
  flex-direction: column;
  gap: 2rem;
}
</style>