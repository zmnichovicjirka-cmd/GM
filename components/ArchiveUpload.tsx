
import React, { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { StudyFile } from '../types';

interface ArchiveUploadProps {
  onClose: () => void;
  onUpload: (text: string, files: StudyFile[], images: string[], isRaw?: boolean) => void;
  isUploading: boolean;
}

const ArchiveUpload: React.FC<ArchiveUploadProps> = ({ onClose, onUpload, isUploading }) => {
  const [text, setText] = useState('');
  const [files, setFiles] = useState<StudyFile[]>([]);
  const [images, setImages] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    for (const file of selected) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const fullDataUrl = event.target?.result as string;
        setFiles(prev => [...prev, {
          name: file.name,
          mimeType: file.type,
          data: fullDataUrl
        }]);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(e.target.files || []);
    for (const file of selected) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setImages(prev => [...prev, event.target?.result as string]);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = Array.from(e.dataTransfer.files);
    
    for (const file of dropped) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        if (file.type.startsWith('image/')) {
          setImages(prev => [...prev, result]);
        } else {
          const fullDataUrl = result;
          setFiles(prev => [...prev, {
            name: file.name,
            mimeType: file.type,
            data: fullDataUrl
          }]);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="fixed inset-0 z-[5000] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="relative w-full max-w-2xl bg-zinc-900 border border-white/10 rounded-[3.5rem] overflow-hidden shadow-2xl flex flex-col"
      >
        {/* Header */}
        <div className="p-10 border-b border-white/5 bg-zinc-950/40 flex justify-between items-center">
          <div>
            <h3 className="text-2xl font-black uppercase tracking-widest text-white">Nahrát do archivu</h3>
            <p className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest mt-2">Přidej prezentace, obrázky nebo poznámky</p>
          </div>
          <button 
            onClick={onClose}
            className="w-12 h-12 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/5 flex items-center justify-center text-white transition-all shadow-xl"
          >
            <i className="fa-solid fa-xmark"></i>
          </button>
        </div>

        {/* Form Content */}
        <div className="p-10 space-y-10 overflow-y-auto no-scrollbar max-h-[70vh]">
          {/* Text Input */}
          <div className="space-y-4">
            <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-2">Název nebo poznámka k obsahu</label>
            <input 
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="O čem jsou nahrávané materiály?"
              className="w-full bg-black/40 border border-white/5 rounded-2xl px-6 py-4 text-white text-sm font-bold focus:outline-none focus:border-indigo-500/50 transition-all"
            />
          </div>

          {/* Drag & Drop Area */}
          <div 
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`relative p-12 border-2 border-dashed rounded-[2.5rem] transition-all flex flex-col items-center justify-center text-center gap-6
              ${isDragging ? 'border-indigo-500 bg-indigo-500/10 scale-[0.98]' : 'border-white/10 bg-black/20 hover:border-white/20'}
            `}
          >
            <div className="w-20 h-20 rounded-3xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 group">
              <i className={`fa-solid fa-cloud-arrow-up text-3xl transition-transform ${isDragging ? 'animate-bounce' : 'group-hoverScale-110'}`}></i>
            </div>
            
            <div className="space-y-2">
              <h4 className="text-lg font-black uppercase text-white tracking-tight leading-tight">Přetáhni soubory sem</h4>
              <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest leading-relaxed">Podporujeme obrázky, PDF, PPTX a další</p>
            </div>

            <div className="flex gap-3">
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-white hover:bg-white/10 transition-all"
              >
                Vybrat soubor
              </button>
              <button 
                onClick={() => imageInputRef.current?.click()}
                className="px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-[10px] font-black uppercase tracking-widest text-white hover:bg-white/10 transition-all"
              >
                Vybrat fotku
              </button>
            </div>

            <input type="file" multiple ref={fileInputRef} onChange={handleFileSelect} className="hidden" />
            <input type="file" multiple accept="image/*" ref={imageInputRef} onChange={handleImageSelect} className="hidden" />
          </div>

          {/* Selected Preview */}
          {(files.length > 0 || images.length > 0) && (
            <div className="space-y-6 animate-fade">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-500 ml-2">Vybrané položky ({files.length + images.length})</h4>
              <div className="grid grid-cols-2 gap-4">
                {images.map((img, idx) => (
                  <div key={idx} className="relative aspect-video rounded-2xl overflow-hidden bg-black/40 group">
                    <img src={img} className="w-full h-full object-cover opacity-60" />
                    <button 
                      onClick={() => setImages(prev => prev.filter((_, i) => i !== idx))}
                      className="absolute top-2 right-2 w-8 h-8 rounded-lg bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <i className="fa-solid fa-xmark"></i>
                    </button>
                  </div>
                ))}
                {files.map((file, idx) => (
                  <div key={idx} className="relative p-4 rounded-xl bg-black/40 border border-white/5 flex items-center gap-4 group">
                    <div className="w-10 h-10 rounded-lg bg-indigo-600/20 flex items-center justify-center text-indigo-400">
                      <i className="fa-solid fa-file-lines"></i>
                    </div>
                    <div className="flex-grow overflow-hidden">
                      <p className="text-[10px] font-black text-white uppercase tracking-tight truncate">{file.name}</p>
                      <p className="text-[8px] font-bold text-zinc-600 uppercase tracking-widest truncate">{file.mimeType}</p>
                    </div>
                    <button 
                      onClick={() => setFiles(prev => prev.filter((_, i) => i !== idx))}
                      className="w-8 h-8 rounded-lg bg-black/40 text-red-400 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <i className="fa-solid fa-trash-can"></i>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-10 bg-zinc-950/50 border-t border-white/5 flex flex-col sm:flex-row gap-4">
          <button 
            disabled={isUploading || (files.length === 0 && images.length === 0 && !text)}
            onClick={() => onUpload(text, files, images, true)}
            className="flex-grow py-6 bg-white/5 hover:bg-white/10 border border-white/10 rounded-[2rem] text-[11px] font-black uppercase tracking-[0.2em] text-white transition-all flex items-center justify-center gap-4"
          >
             <span>Jen uložit soubory</span>
          </button>
          <button 
            disabled={isUploading || (files.length === 0 && images.length === 0 && !text)}
            onClick={() => onUpload(text, files, images)}
            className="flex-grow py-6 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:grayscale rounded-[2rem] text-[11px] font-black uppercase tracking-[0.4em] text-white shadow-2xl shadow-indigo-500/20 transition-all flex items-center justify-center gap-4"
          >
            {isUploading ? (
              <>
                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
                <span>Analyzuji a ukládám...</span>
              </>
            ) : (
              <span>Uložit do archivu</span>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default ArchiveUpload;
