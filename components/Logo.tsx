import React from 'react';
import { motion } from 'framer-motion';

const Logo: React.FC<{ className?: string }> = ({ className = "" }) => {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="relative w-9 h-9 flex items-center justify-center">
        {/* Artistic Sound Wave Background */}
        <motion.div 
          animate={{ 
            rotate: 360,
            scale: [1, 1.1, 1],
          }}
          transition={{ 
            rotate: { duration: 20, repeat: Infinity, ease: "linear" },
            scale: { duration: 4, repeat: Infinity, ease: "easeInOut" }
          }}
          className="absolute inset-0 bg-gradient-to-br from-accent via-indigo-500 to-purple-600 rounded-xl opacity-20 blur-lg"
        />
        
        {/* The "N" Soundwave Icon */}
        <svg viewBox="0 0 100 100" className="w-full h-full relative z-10 drop-shadow-[0_0_10px_rgba(16,185,129,0.3)]">
          <defs>
            <linearGradient id="logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="var(--color-accent)" />
              <stop offset="100%" stopColor="#6366f1" />
            </linearGradient>
          </defs>
          
          {/* Sound wave lines forming an 'N' shape */}
          <motion.path
            d="M25 75 L25 25 L50 75 L75 25 L75 75"
            fill="none"
            stroke="url(#logo-grad)"
            strokeWidth="8"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 2, ease: "easeInOut" }}
          />
          
          {/* Dynamic wave accents */}
          <motion.path
            d="M15 50 Q25 30 35 50 T55 50 T75 50 T85 50"
            fill="none"
            stroke="url(#logo-grad)"
            strokeWidth="2"
            strokeOpacity="0.5"
            animate={{ 
              d: [
                "M15 50 Q25 30 35 50 T55 50 T75 50 T85 50",
                "M15 50 Q25 70 35 50 T55 50 T75 50 T85 50",
                "M15 50 Q25 30 35 50 T55 50 T75 50 T85 50"
              ]
            }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          />
        </svg>
      </div>
      
      <div className="flex flex-col -space-y-1">
        <h1 className="text-lg font-black italic tracking-tighter serif text-ink">
          Nova
        </h1>
        <span className="text-[7px] font-black uppercase tracking-[0.4em] text-accent/80 mono">
          AI Studio
        </span>
      </div>
    </div>
  );
};

export default Logo;
