
import React, { useRef, useEffect, useState } from 'react';
import { StudyFile, YouTubeVideo, WebPage } from '../types';
import { preAnalyzeSource } from '../services/geminiService';

interface StudyInputProps {
  text: string;
  setText: (text: string) => void;
  images: string[];
  setImages: React.Dispatch<React.SetStateAction<string[]>>;
  files: StudyFile[];
  setFiles: React.Dispatch<React.SetStateAction<StudyFile[]>>;
  ytVideos: YouTubeVideo[];
  setYtVideos: React.Dispatch<React.SetStateAction<YouTubeVideo[]>>;
  webPages: WebPage[];
  setWebPages: React.Dispatch<React.SetStateAction<WebPage[]>>;
  onGenerate: () => void;
  isLoading: boolean;
  isVerifying?: boolean;
  hasVerifiedInfo?: boolean;
}

const StudyInput: React.FC<StudyInputProps> = ({ 
  text, setText, images, setImages, files, setFiles, ytVideos, setYtVideos, webPages, setWebPages, 
  onGenerate, isLoading, isVerifying, hasVerifiedInfo
}) => {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTranscript, setActiveTranscript] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const uploadToCloudinary = async (base64: string) => {
    try {
      const response = await fetch("/api/upload-base64", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: base64 })
      });
      if (!response.ok) throw new Error("Upload failed");
      const data = await response.json();
      return data.url;
    } catch (error) {
      console.error("Cloudinary upload error:", error);
      return base64; // Fallback to base64
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []) as File[];
    setIsUploading(true);
    let processed = 0;
    selectedFiles.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = reader.result as string;
        const url = await uploadToCloudinary(base64);
        setImages(prev => [...prev, url]);
        processed++;
        if (processed === selectedFiles.length) setIsUploading(false);
      };
      reader.readAsDataURL(file);
    });
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          setIsUploading(true);
          const reader = new FileReader();
          reader.onloadend = async () => {
            const base64 = reader.result as string;
            const url = await uploadToCloudinary(base64);
            setImages(prev => [...prev, url]);
            setIsUploading(false);
          };
          reader.readAsDataURL(file);
        }
      }
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []) as File[];
    for (const file of selectedFiles) {
      if (file.size > 25 * 1024 * 1024) {
         alert(`Soubor ${file.name} je příliš velký (max 25MB).`);
         continue;
      }

      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = (reader.result as string).split(',')[1];
        let mimeType = file.type;
        const isPptx = file.name.toLowerCase().endsWith('.pptx');
        
        if (!mimeType && isPptx) {
          mimeType = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
        } else if (!mimeType && file.name.endsWith('.pdf')) {
          mimeType = 'application/pdf';
        } else if (!mimeType && file.name.endsWith('.txt')) {
          mimeType = 'text/plain';
        }

        const newFile: StudyFile = { 
          name: file.name, 
          mimeType: mimeType || 'application/octet-stream', 
          data: base64, 
          isAnalyzing: true 
        };
        
        setFiles(prev => [...prev, newFile]);
        
        try {
          const res = await preAnalyzeSource('file', newFile);
          setFiles(prev => prev.map(f => (f.name === file.name) ? { ...f, analysis: res.context, isAnalyzing: false } : f));
        } catch (err) {
          console.error("Analysis Error:", err);
          setFiles(prev => prev.map(f => (f.name === file.name) ? { ...f, isAnalyzing: false, analysis: 'Dokument bude zpracován přímo během generování.' } : f));
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = (index: number) => {
    setImages(images.filter((_, i) => i !== index));
  };

  const urlRegex = /(https?:\/\/[^\s]+)/g;
  useEffect(() => {
    const matches = text.match(urlRegex);
    if (matches) {
      let newText = text;
      matches.forEach(url => {
        newText = newText.replace(url, '').trim();
        const isYT = url.includes('youtube.com') || url.includes('youtu.be');
        if (isYT) {
          if (!ytVideos.some(v => v.url === url)) {
            setYtVideos(prev => [...prev, { url, title: null, resolving: true }]);
            preAnalyzeSource('youtube', url).then(res => {
              setYtVideos(prev => prev.map(v => v.url === url ? { ...v, title: res.title, resolving: false, analysis: res.context, transcript: res.transcript } : v));
            });
          }
        } else if (!webPages.some(p => p.url === url)) {
          setWebPages(prev => [...prev, { url, title: null, resolving: true }]);
          preAnalyzeSource('web', url).then(res => {
            setWebPages(prev => prev.map(p => p.url === url ? { ...p, title: res.title, resolving: false, analysis: res.context } : p));
          });
        }
      });
      setText(newText);
    }
  }, [text]);

  return (
    <div className="w-full max-w-4xl mx-auto py-6 px-4">
      {activeTranscript && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-6 animate-fade">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-2xl" onClick={() => setActiveTranscript(null)}></div>
          <div className="relative w-full max-w-2xl glass-panel rounded-2xl p-6 border-white/10 shadow-2xl flex flex-col max-h-[80vh]">
             <div className="flex items-center justify-between mb-4">
               <h3 className="text-lg font-black uppercase tracking-tight text-white">Zdrojový text</h3>
               <button onClick={() => setActiveTranscript(null)} className="w-8 h-8 rounded-full bg-white/5 border border-white/10 text-zinc-500 hover:text-white"><i className="fa-solid fa-xmark"></i></button>
             </div>
             <div className="flex-grow overflow-y-auto no-scrollbar bg-black/20 rounded-xl p-4">
               <p className="text-zinc-300 text-[13px] leading-relaxed whitespace-pre-wrap">{activeTranscript}</p>
             </div>
          </div>
        </div>
      )}

      <div className="relative glass-panel rounded-3xl p-1 transition-all duration-500 bg-zinc-950/40">
        <div className="flex flex-col">
          <textarea
            id="study-input-area"
            className="w-full h-24 md:h-32 bg-transparent border-none rounded-2xl p-6 text-base text-zinc-100 placeholder:text-zinc-600 focus:outline-none focus:ring-0 resize-none"
            placeholder="Co tě dnes naučím? Vlož text, odkaz, PPTX prezentaci nebo sem vlož fotky ze schránky (Ctrl+V)..."
            value={text}
            onChange={(e) => setText(e.target.value)}
            onPaste={handlePaste}
          />
          
          {(images.length > 0 || files.length > 0 || ytVideos.length > 0 || webPages.length > 0) && (
            <div className="flex flex-wrap gap-2 px-6 pb-3 animate-fade">
              {images.map((img, idx) => (
                <div key={idx} className="flex items-center gap-2 px-2 py-1.5 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
                  <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0 shadow-lg border border-white/10">
                    <img src={img} className="w-full h-full object-cover" />
                  </div>
                  <span className="text-[8px] font-black uppercase text-indigo-400">Obrázek {idx + 1}</span>
                  <button onClick={() => removeImage(idx)} className="text-indigo-400 hover:text-white transition-colors"><i className="fa-solid fa-xmark text-[10px]"></i></button>
                </div>
              ))}
              {ytVideos.map((video, idx) => (
                <div key={idx} onClick={() => video.transcript && setActiveTranscript(video.transcript)} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border ${video.transcript ? 'bg-red-600/20 border-red-500/50 cursor-pointer' : 'bg-zinc-900 border-white/5'}`}>
                  <i className="fa-brands fa-youtube text-red-500 text-xs"></i>
                  <span className="text-[8px] font-black uppercase text-zinc-400 truncate max-w-[100px]">{video.title || 'Video'}</span>
                  <button onClick={(e) => { e.stopPropagation(); setYtVideos(ytVideos.filter(v => v.url !== video.url)); }} className="text-zinc-600"><i className="fa-solid fa-xmark text-[10px]"></i></button>
                </div>
              ))}
              {files.map((file, idx) => (
                <div key={idx} className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all ${file.isAnalyzing ? 'bg-indigo-500/10 border-indigo-500/30 animate-pulse ring-1 ring-indigo-500/20' : 'bg-zinc-900 border-white/5'}`}>
                  <i className={`fa-solid ${file.name.toLowerCase().endsWith('.pptx') ? 'fa-file-powerpoint text-orange-500' : 'fa-file text-zinc-500'} text-xs`}></i>
                  <div className="flex flex-col">
                    <span className="text-[8px] font-black uppercase text-zinc-400 truncate max-w-[100px]">{file.name}</span>
                    {file.isAnalyzing && <span className="text-[6px] font-black uppercase text-indigo-400 tracking-tighter">Analyzuji...</span>}
                  </div>
                  {!file.isAnalyzing && <button onClick={() => setFiles(files.filter((_, i) => i !== idx))} className="text-zinc-600 ml-1"><i className="fa-solid fa-xmark text-[10px]"></i></button>}
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between p-2.5 bg-zinc-950/60 rounded-2xl m-1.5 border border-white/10 gap-3">
            <div className="flex items-center gap-2">
              <button onClick={() => imageInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 transition-all text-[10px] font-black uppercase tracking-widest text-zinc-300 border border-white/5"><i className="fa-solid fa-camera text-indigo-500"></i><span className="hidden sm:inline">Fotky</span></button>
              <input type="file" ref={imageInputRef} className="hidden" accept="image/*" multiple onChange={handleImageChange} />
              
              <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 transition-all text-[10px] font-black uppercase tracking-widest text-zinc-300 border border-white/5"><i className="fa-solid fa-file-arrow-up text-indigo-500"></i><span className="hidden sm:inline">Soubory</span></button>
              <input type="file" ref={fileInputRef} className="hidden" accept=".pdf,.txt,.pptx" multiple onChange={handleFileChange} />
            </div>
            
            <button
              id="study-generate-btn"
              onClick={onGenerate}
              disabled={isLoading || isUploading || (!text && images.length === 0 && files.length === 0 && ytVideos.length === 0 && webPages.length === 0)}
              className="px-8 py-3 rounded-xl btn-gradient text-white font-black text-[10px] uppercase tracking-widest active:scale-95 disabled:opacity-30 disabled:pointer-events-none transition-all"
            >
              {(isLoading || isUploading) ? <i className="fa-solid fa-circle-notch fa-spin text-xs"></i> : <i className="fa-solid fa-sparkles mr-2 text-xs"></i>} 
              {isUploading ? 'Nahrávám...' : (isLoading ? (isVerifying ? 'Ověřuji...' : 'Zpracovávám...') : (hasVerifiedInfo ? 'Znovu ověřit' : 'Pokračovat'))}
            </button>
          </div>
        </div>
      </div>

    </div>
  );
};

export default StudyInput;
