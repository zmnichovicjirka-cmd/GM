
import React from 'react';
import { motion } from 'motion/react';

const LoadingScreen: React.FC = () => {
  return (
    <div className="fixed inset-0 bg-[#050505] flex items-center justify-center z-[1000] overflow-hidden">
      {/* Background Ambience */}
      <div className="absolute inset-0">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-indigo-600/5 rounded-full blur-[120px] animate-pulse" />
      </div>

      <div className="relative z-10 flex flex-col items-center">
        <div className="flex items-center gap-8">
          {/* Avatar Area */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            className="relative"
          >
            <div className="w-24 h-24 rounded-[2.5rem] bg-indigo-500/10 border-2 border-indigo-500/30 overflow-hidden shadow-2xl shadow-indigo-500/20 relative group">
              <div className="absolute inset-0 bg-gradient-to-tr from-indigo-500/20 to-transparent" />
              <img 
                src="https://images.unsplash.com/photo-1614850523296-d8c1af93d400?q=80&w=200&auto=format&fit=crop" 
                alt="Avatar"
                className="w-full h-full object-cover mix-blend-overlay opacity-80"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <i className="fa-solid fa-atom text-indigo-400 text-3xl animate-spin-slow"></i>
              </div>
            </div>
            
            {/* Spinning Rings around avatar */}
            <div className="absolute -inset-4 border border-indigo-500/10 rounded-[3rem] animate-spin-slow" />
            <div className="absolute -inset-8 border border-white/5 rounded-[4rem] animate-reverse-spin-slow opacity-50" />
          </motion.div>

          {/* Loading Info */}
          <div className="space-y-4">
            <div className="flex flex-col">
              <h2 className="text-3xl font-black text-white uppercase tracking-tighter leading-none mb-1">
                Gymni<span className="text-indigo-500">Mate</span>
              </h2>
              <div className="flex items-center gap-3">
                <div className="flex gap-1">
                  {[0, 1, 2].map((i) => (
                    <motion.div
                      key={i}
                      animate={{ opacity: [0.2, 1, 0.2] }}
                      transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }}
                      className="w-1 h-1 bg-indigo-500 rounded-full"
                    />
                  ))}
                </div>
                <p className="text-[9px] text-zinc-500 font-extrabold uppercase tracking-[0.4em]">Neural Link Init</p>
              </div>
            </div>
            
            {/* Progress Bar Mini */}
            <div className="w-32 h-1 bg-white/5 rounded-full overflow-hidden">
              <motion.div 
                className="h-full bg-indigo-500"
                animate={{ x: ['-100%', '100%'] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              />
            </div>
          </div>
        </div>

        <motion.p 
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.3 }}
          className="absolute bottom-20 text-[7px] text-zinc-700 font-mono uppercase tracking-[0.5em]"
        >
          Connecting to remote synapses...
        </motion.p>
      </div>
    </div>
  );
};

export default LoadingScreen;
