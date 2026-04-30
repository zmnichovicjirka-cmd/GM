
import React, { useState, useEffect } from 'react';
import { subscribeToLogs } from '../services/logService';

const SystemLog: React.FC = () => {
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    return subscribeToLogs((msg) => {
      setLogs(prev => [...prev.slice(-4), msg]);
      setTimeout(() => {
        setLogs(prev => prev.filter(l => l !== msg));
      }, 4000);
    });
  }, []);

  if (logs.length === 0) return null;

  return (
    <div className="fixed bottom-6 left-24 z-[100] flex flex-col gap-2 pointer-events-none">
      {logs.map((log, i) => (
        <div 
          key={i} 
          className="px-4 py-2 bg-zinc-900/80 backdrop-blur-md border border-white/5 rounded-xl text-[10px] font-medium text-zinc-400 flex items-center gap-3 animate-fade-up shadow-2xl"
        >
          <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></div>
          <span className="opacity-70 uppercase tracking-widest">{log}</span>
        </div>
      ))}
    </div>
  );
};

export default SystemLog;
