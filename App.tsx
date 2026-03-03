import React, { useState, useCallback, useEffect } from 'react';
import { Artifact, UserProfile, VoiceType, AppMode, Memory, AppView, AspectRatio, ImageSize } from './types';
import AssistantView from './components/AssistantView';
import GalleryView from './components/GalleryView';

const App: React.FC = () => {
  const [activeView, setActiveView] = useState<AppView>(AppView.ASSISTANT);
  const [artifacts, setArtifacts] = useState<Artifact[]>(() => {
    const saved = localStorage.getItem('nova_artifacts');
    return saved ? JSON.parse(saved) : [];
  });
  const [voice, setVoice] = useState<VoiceType>(() => {
    const saved = localStorage.getItem('nova_voice');
    return (saved as VoiceType) || 'Zephyr';
  });
  const [mode, setMode] = useState<AppMode>('Deep');
  
  // Creation Preferences Persistence
  const [imageSize, setImageSize] = useState<ImageSize>(() => {
    const saved = localStorage.getItem('nova_image_size');
    return (saved as ImageSize) || '1K';
  });
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>(() => {
    const saved = localStorage.getItem('nova_aspect_ratio');
    return (saved as AspectRatio) || '1:1';
  });

  const [memories, setMemories] = useState<Memory[]>(() => {
    const saved = localStorage.getItem('nova_memories');
    return saved ? JSON.parse(saved) : [];
  });
  const [profile, setProfile] = useState<UserProfile>(() => {
    const saved = localStorage.getItem('nova_profile');
    return saved ? JSON.parse(saved) : { 
      name: 'Explorer', 
      username: 'user_nova',
      email: 'nova@user.ai',
      language: 'English',
      theme: 'dark',
      avatar: '' 
    };
  });

  // Synchronize theme with document class for Tailwind
  useEffect(() => {
    if (profile.theme === 'light') {
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
    }
  }, [profile.theme]);

  // Persistence Effects
  useEffect(() => {
    localStorage.setItem('nova_memories', JSON.stringify(memories));
  }, [memories]);

  useEffect(() => {
    localStorage.setItem('nova_profile', JSON.stringify(profile));
  }, [profile]);

  useEffect(() => {
    localStorage.setItem('nova_voice', voice);
  }, [voice]);

  useEffect(() => {
    localStorage.setItem('nova_artifacts', JSON.stringify(artifacts));
  }, [artifacts]);

  useEffect(() => {
    localStorage.setItem('nova_image_size', imageSize);
  }, [imageSize]);

  useEffect(() => {
    localStorage.setItem('nova_aspect_ratio', aspectRatio);
  }, [aspectRatio]);

  const handleArtifactGenerated = useCallback((url: string, prompt: string, type: 'image' | 'video') => {
    const newArtifact: Artifact = {
      id: Math.random().toString(36).substring(7),
      url,
      prompt,
      type,
      timestamp: Date.now(),
    };
    setArtifacts(prev => [newArtifact, ...prev]);
  }, []);

  const handleUpdateMemory = useCallback((action: 'add' | 'delete' | 'edit', content: string, id?: string) => {
    if (action === 'add') {
      const newMemory: Memory = {
        id: Math.random().toString(36).substring(7),
        content,
        timestamp: Date.now()
      };
      setMemories(prev => [newMemory, ...prev]);
    } else if (action === 'delete') {
      setMemories(prev => prev.filter(m => id ? m.id !== id : m.content !== content));
    } else if (action === 'edit' && id) {
      setMemories(prev => prev.map(m => m.id === id ? { ...m, content, timestamp: Date.now() } : m));
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setProfile(prev => ({
      ...prev,
      theme: prev.theme === 'dark' ? 'light' : 'dark'
    }));
  }, []);

  return (
    <div className="h-screen w-full bg-bg text-ink font-sans selection:bg-accent/30 overflow-hidden">
      <main className="h-full w-full">
        {activeView === AppView.ASSISTANT && (
          <AssistantView 
            onArtifactGenerated={handleArtifactGenerated} 
            voiceType={voice} 
            onVoiceChange={setVoice}
            mode={mode} 
            onModeChange={setMode}
            memories={memories}
            onUpdateMemory={handleUpdateMemory}
            profile={profile}
            onProfileChange={setProfile}
            onViewGallery={() => setActiveView(AppView.GALLERY)}
            onToggleTheme={toggleTheme}
            imageSize={imageSize}
            onImageSizeChange={setImageSize}
            aspectRatio={aspectRatio}
            onAspectRatioChange={setAspectRatio}
          />
        )}
        {activeView === AppView.GALLERY && (
          <GalleryView 
            artifacts={artifacts} 
            onBack={() => setActiveView(AppView.ASSISTANT)} 
          />
        )}
      </main>
    </div>
  );
};

export default App;