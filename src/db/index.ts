import Dexie from 'dexie';
import type { Project, AudioFile, StoredAudioFile } from '../types';

// IndexedDB用のプロジェクト型（Blobを除外）
export interface StoredProject {
  id: string;
  name: string;
  created: string; // DateをISOStringに
  updated: string; // DateをISOStringに
  audioFiles: StoredAudioFile[];
  transcript: {
    segments: Array<{
      id: string;
      start: number;
      end: number;
      text: string;
      speaker?: string;
    }>;
  };
  speakers: Array<{
    id: string;
    name: string;
    prefix: string;
  }>;
}

export class OralHistoryDB extends Dexie {
  projects!: Dexie.Table<StoredProject>;

  constructor() {
    super('OralHistoryDB');
    this.version(1).stores({
      projects: 'id, name, created, updated'
    });
  }

  async saveProject(project: Project): Promise<void> {
    try {
      // BlobをArrayBufferに変換してから保存
      const audioFilesWithBuffer = await Promise.all(
        project.audioFiles.map(async (file) => {
          let arrayBuffer = file.arrayBuffer;
          
          // Blobがある場合はArrayBufferに変換
          if (file.blob && !arrayBuffer) {
            arrayBuffer = await file.blob.arrayBuffer();
          }
          
          return {
            id: file.id,
            name: file.name,
            arrayBuffer: arrayBuffer,
            duration: file.duration || 0,
            offset: file.offset || 0,
            volume: file.volume || 1,
            muted: file.muted || false
          };
        })
      );
      
      // 完全にプレーンなオブジェクトに変換
      const storedProject: StoredProject = {
        id: project.id,
        name: project.name,
        created: project.created instanceof Date ? project.created.toISOString() : new Date().toISOString(),
        updated: new Date().toISOString(),
        audioFiles: audioFilesWithBuffer,
        transcript: {
          segments: (project.transcript?.segments || []).map(seg => ({
            id: seg.id,
            start: seg.start || 0,
            end: seg.end || 0,
            text: seg.text || '',
            speaker: seg.speaker
          }))
        },
        speakers: (project.speakers || []).map(speaker => ({
          id: speaker.id,
          name: speaker.name,
          prefix: speaker.prefix
        }))
      };
      
      console.log('Saving to IndexedDB:', storedProject);
      await this.projects.put(storedProject);
    } catch (error) {
      console.error('Failed to save project:', error);
      throw error;
    }
  }

  async getProject(id: string): Promise<Project | undefined> {
    const stored = await this.projects.get(id);
    if (!stored) return undefined;
    
    // StoredProjectをProjectに変換（ArrayBufferからBlobを再生成）
    const audioFiles = await Promise.all(
      stored.audioFiles.map(async (file) => {
        let blob: Blob | undefined;
        let url: string | undefined;
        
        // ArrayBufferがある場合はBlobとURLを再生成
        if (file.arrayBuffer) {
          blob = new Blob([file.arrayBuffer], { type: 'audio/mpeg' });
          url = URL.createObjectURL(blob);
        }
        
        return {
          ...file,
          blob,
          url,
          arrayBuffer: file.arrayBuffer
        } as AudioFile;
      })
    );
    
    return {
      id: stored.id,
      name: stored.name,
      created: new Date(stored.created),
      updated: new Date(stored.updated),
      audioFiles,
      transcript: stored.transcript,
      speakers: stored.speakers
    };
  }

  async getAllProjects(): Promise<Project[]> {
    const stored = await this.projects.toArray();
    return Promise.all(
      stored.map(async (s) => {
        const audioFiles = await Promise.all(
          s.audioFiles.map(async (file) => {
            let blob: Blob | undefined;
            let url: string | undefined;
            
            // ArrayBufferがある場合はBlobとURLを再生成
            if (file.arrayBuffer) {
              blob = new Blob([file.arrayBuffer], { type: 'audio/mpeg' });
              url = URL.createObjectURL(blob);
            }
            
            return {
              ...file,
              blob,
              url,
              arrayBuffer: file.arrayBuffer
            } as AudioFile;
          })
        );
        
        return {
          id: s.id,
          name: s.name,
          created: new Date(s.created),
          updated: new Date(s.updated),
          audioFiles,
          transcript: s.transcript,
          speakers: s.speakers
        };
      })
    );
  }

  async deleteProject(id: string): Promise<void> {
    await this.projects.delete(id);
  }
}

export const db = new OralHistoryDB();