export enum AppView {
  ASSISTANT = 'assistant',
  GALLERY = 'gallery'
}

export type AppMode = 'Fast' | 'Deep' | 'Explore' | 'Build';

export type VoiceType = 'Puck' | 'Charon' | 'Kore' | 'Fenrir' | 'Zephyr' | 'Custom';

export interface UserProfile {
  name: string;
  username: string;
  email: string;
  language: string;
  theme: 'light' | 'dark';
  avatar: string;
}

export interface Memory {
  id: string;
  content: string;
  timestamp: number;
}

export interface Artifact {
  id: string;
  url: string;
  type: 'image' | 'video';
  prompt: string;
  timestamp: number;
}

export type AspectRatio = '1:1' | '3:4' | '4:3' | '9:16' | '16:9';
export type ImageSize = '1K' | '2K' | '4K';

export interface Message {
  role: 'user' | 'model';
  text: string;
  type: 'text' | 'image' | 'video' | 'voice';
  imageUrl?: string;
  videoUrl?: string;
  thinking?: string;
  groundingUrls?: string[];
  timestamp: number;
  status?: 'sent' | 'delivered' | 'read';
}