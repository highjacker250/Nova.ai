import React, { useState, useMemo } from 'react';
import { Artifact } from '../types';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Search, Download, Image as ImageIcon, Video, Calendar, Trash2 } from 'lucide-react';

interface GalleryViewProps {
  artifacts: Artifact[];
  onBack: () => void;
}

const GalleryView: React.FC<GalleryViewProps> = ({ artifacts, onBack }) => {
  const [searchQuery, setSearchQuery] = useState('');

  const filtered = useMemo(() => {
    return artifacts.filter(a => 
      a.prompt.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [artifacts, searchQuery]);

  return (
    <div className="h-full w-full bg-[#050505] flex flex-col overflow-hidden">
      <header className="px-12 py-10 border-b border-white/5 flex items-center justify-between bg-black/40 backdrop-blur-xl z-10">
        <div className="flex items-center gap-8">
          <button 
            onClick={onBack} 
            className="p-4 rounded-2xl glass glass-hover text-slate-500 hover:text-white transition-all"
          >
            <ArrowLeft className="w-6 h-6" />
          </button>
          <div>
            <h1 className="text-4xl font-black italic tracking-tighter serif text-gradient">Neural Artifacts</h1>
            <p className="text-[9px] text-slate-500 font-black uppercase tracking-[0.3em] mt-1 mono">{filtered.length} SYNTHESIZED</p>
          </div>
        </div>
        
        <div className="relative w-full max-w-md group">
          <Search className="absolute left-6 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-600 group-focus-within:text-accent transition-colors" />
          <input 
            type="text" 
            placeholder="Search neural patterns..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full glass rounded-[2rem] py-5 pl-16 pr-8 text-sm text-white focus:outline-none focus:border-accent/50 transition-all font-medium"
          />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-12 custom-scrollbar">
        <AnimatePresence mode="popLayout">
          {artifacts.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="h-full flex flex-col items-center justify-center space-y-6"
            >
              <div className="w-24 h-24 rounded-full glass flex items-center justify-center">
                <ImageIcon className="w-10 h-10 text-slate-800" />
              </div>
              <p className="text-slate-600 italic text-2xl serif">Neural vault is currently empty.</p>
            </motion.div>
          ) : filtered.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="h-full flex flex-col items-center justify-center"
            >
              <p className="text-slate-600 italic text-2xl serif">No matching patterns found.</p>
            </motion.div>
          ) : (
            <motion.div 
              layout
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-10"
            >
              {filtered.map((art, index) => (
                <motion.article 
                  key={art.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="group relative rounded-[2.5rem] overflow-hidden glass border-white/5 hover:border-accent/40 transition-all aspect-[4/5] flex flex-col"
                >
                  <div className="flex-1 overflow-hidden bg-slate-900 relative">
                    {art.type === 'image' ? (
                      <img 
                        src={art.url} 
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" 
                        alt={art.prompt}
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <video 
                        src={art.url} 
                        className="w-full h-full object-cover" 
                        loop 
                        muted 
                        onMouseOver={e => e.currentTarget.play()} 
                        onMouseOut={e => e.currentTarget.pause()} 
                      />
                    )}
                    
                    <div className="absolute top-6 right-6 flex flex-col gap-3 opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">
                      <button 
                        onClick={() => {
                          const link = document.createElement('a'); link.href = art.url; link.download = `priya-${art.type}-${art.id}`; link.click();
                        }}
                        className="p-4 glass glass-hover text-white rounded-2xl shadow-xl"
                      >
                        <Download className="w-5 h-5" />
                      </button>
                    </div>

                    <div className="absolute top-6 left-6">
                      <div className="px-4 py-2 glass rounded-xl flex items-center gap-2">
                        {art.type === 'image' ? <ImageIcon className="w-3 h-3 text-accent" /> : <Video className="w-3 h-3 text-accent" />}
                        <span className="text-[8px] font-black uppercase tracking-widest mono">{art.type}</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-8 space-y-4 bg-black/20 backdrop-blur-md">
                    <p className="text-sm font-medium text-slate-300 line-clamp-2 leading-relaxed italic serif">
                      "{art.prompt}"
                    </p>
                    <div className="flex items-center justify-between pt-2 border-t border-white/5">
                      <div className="flex items-center gap-2 text-slate-500">
                        <Calendar className="w-3 h-3" />
                        <span className="text-[9px] font-black uppercase tracking-widest mono">
                          {new Date(art.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                      <button className="text-slate-700 hover:text-red-500 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </motion.article>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
};

export default GalleryView;
