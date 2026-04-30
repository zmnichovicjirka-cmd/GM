
import React, { useState, useEffect } from 'react';
import { DbConfig, UserProfile, UserApiKey } from '../types';
import { testDbConnection, ORACLE_SERVER_URL, saveUserApiKey, fetchUserApiKeyData } from '../services/dbService';

interface SettingsModalProps {
  config: DbConfig;
  userProfile: UserProfile;
  onUpdateProfile: (updates: Partial<UserProfile>) => void;
  onSave: (config: DbConfig) => void;
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ config, userProfile, onUpdateProfile, onSave, onClose }) => {
  const [testStatus, setTestStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [errorDetails, setErrorDetails] = useState<{message: string, engine: string, code?: string, full?: string} | null>(null);
  
  const [apiKey, setApiKey] = useState('');
  const [emailToShare, setEmailToShare] = useState('');
  const [sharedEmails, setSharedEmails] = useState<string[]>([]);
  const [isSavingKey, setIsSavingKey] = useState(false);

  useEffect(() => {
    const loadKey = async () => {
      const data = await fetchUserApiKeyData();
      if (data) {
        setApiKey(data.key || '');
        setSharedEmails(data.sharedWith || []);
      }
    };
    loadKey();
  }, []);

  const handleSaveKey = async () => {
    setIsSavingKey(true);
    await saveUserApiKey(apiKey, sharedEmails);
    setIsSavingKey(false);
  };

  const addEmail = () => {
    if (emailToShare && !sharedEmails.includes(emailToShare)) {
      setSharedEmails([...sharedEmails, emailToShare]);
      setEmailToShare('');
    }
  };

  const removeEmail = (email: string) => {
    setSharedEmails(sharedEmails.filter(e => e !== email));
  };

  const handleTest = async () => {
    setTestStatus('loading');
    setErrorDetails(null);
    try {
      const result: any = await testDbConnection(config);
      if (result.status === 'online') {
        setTestStatus('success');
      } else {
        setTestStatus('error');
        setErrorDetails({
          message: result.error,
          engine: result.engine,
          code: result.code,
          full: result.fullError
        });
      }
    } catch (e: any) {
      setTestStatus('error');
      setErrorDetails({ message: e.message, engine: "UI Logic Catch" });
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/60 shadow-[inset_0_0_100px_rgba(0,0,0,0.5)]" onClick={onClose}></div>
      <div className="relative w-full max-w-sm glass-panel rounded-[2rem] p-6 animate-fade shadow-[0_30px_100px_rgba(0,0,0,0.5)] border-white/10 overflow-y-auto max-h-[90vh] no-scrollbar">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-black uppercase tracking-[0.3em] text-white">Nastavení</h2>
            <div className={`mt-1 flex items-center gap-2`}>
               <div className={`w-1 h-1 rounded-full ${testStatus === 'success' ? 'bg-emerald-500' : 'bg-zinc-600 animate-pulse'}`}></div>
               <p className="text-[7px] text-zinc-500 font-bold uppercase tracking-[0.2em]">Systém: {testStatus.toUpperCase()}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-white/5 text-zinc-600 flex items-center justify-center border border-white/5 transition-all text-xs"><i className="fa-solid fa-xmark"></i></button>
        </div>

        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5">
            <h3 className="text-[7px] font-black uppercase tracking-[0.4em] text-indigo-400/80 mb-3">Síťová Diagnostika</h3>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div className="space-y-0.5">
                <p className="text-[6px] font-black uppercase text-zinc-600 tracking-widest">Instance</p>
                <p className="text-[9px] font-mono text-zinc-400 truncate">neural-v4-prod</p>
              </div>
              <div className="space-y-0.5 text-right">
                <p className="text-[6px] font-black uppercase text-zinc-600 tracking-widest">Lokalita</p>
                <p className="text-[9px] font-mono text-zinc-400">EU-WEST</p>
              </div>
            </div>
            <button onClick={handleTest} disabled={testStatus === 'loading'} className="w-full py-2.5 rounded-lg bg-indigo-600/5 border border-indigo-500/10 hover:bg-indigo-600 hover:text-white text-[8px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 transition-all disabled:opacity-50">
              {testStatus === 'loading' ? <i className="fa-solid fa-circle-notch fa-spin"></i> : <i className="fa-solid fa-plug-circle-bolt"></i>}
              Verifikovat spojení
            </button>
          </div>

          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-3">
             <h3 className="text-[7px] font-black uppercase tracking-[0.4em] text-violet-400/80">Gemini Cloud API</h3>
             <div className="space-y-2">
               <p className="text-[7px] text-zinc-500 font-bold uppercase tracking-widest">Tvůj API klíč (Gemini 1.5+)</p>
               <input 
                 type="password"
                 value={apiKey}
                 onChange={(e) => setApiKey(e.target.value)}
                 className="w-full bg-black/40 border border-white/5 rounded-lg px-3 py-2 text-[10px] font-mono text-zinc-300 focus:border-violet-500 outline-none transition-all placeholder:text-zinc-700"
                 placeholder="Uveď svůj API klíč pro vlastní kvóty..."
               />
               
               <div className="pt-1">
                 <p className="text-[7px] text-zinc-500 font-bold uppercase tracking-widest mb-2">Sdílet přístup (E-mail)</p>
                 <div className="flex gap-2 mb-2">
                   <input 
                     type="email"
                     value={emailToShare}
                     onChange={(e) => setEmailToShare(e.target.value)}
                     className="flex-1 bg-black/40 border border-white/5 rounded-lg px-3 py-2 text-[10px] text-zinc-300 outline-none"
                     placeholder="email@prikladu.cz"
                   />
                   <button onClick={addEmail} className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-white flex items-center justify-center transition-all">
                     <i className="fa-solid fa-plus text-[10px]"></i>
                   </button>
                 </div>
                 
                 {sharedEmails.length > 0 && (
                   <div className="flex flex-wrap gap-1 mb-2">
                     {sharedEmails.map(email => (
                       <div key={email} className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-violet-600/10 border border-violet-500/20 text-[6px] font-bold text-violet-400 uppercase tracking-widest">
                         {email}
                         <button onClick={() => removeEmail(email)} className="hover:text-white transition-all"><i className="fa-solid fa-xmark"></i></button>
                       </div>
                     ))}
                   </div>
                 )}
               </div>

               <button 
                 onClick={handleSaveKey} 
                 disabled={isSavingKey}
                 className="w-full py-2 rounded-lg bg-violet-600/10 border border-violet-500/20 hover:bg-violet-600 hover:text-white text-[8px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 transition-all"
               >
                 {isSavingKey ? <i className="fa-solid fa-circle-notch fa-spin"></i> : <i className="fa-solid fa-cloud-arrow-up"></i>}
                 Aktualizovat Klíč & Přístupy
               </button>
             </div>
          </div>

          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-3">
            <h3 className="text-[7px] font-black uppercase tracking-[0.4em] text-indigo-400/80">Jazykové Nastavení</h3>
            <div className="flex items-center justify-between gap-3">
              <p className="text-[8px] text-zinc-500 font-bold uppercase tracking-widest">Komunikace AI</p>
              <div className="flex gap-1 bg-black/40 p-0.5 rounded-lg border border-white/5 shrink-0">
                <button 
                  onClick={() => onUpdateProfile({ language: 'cs' })}
                  className={`px-3 py-1.5 rounded-md text-[7px] font-black uppercase tracking-widest transition-all ${userProfile.language !== 'en' ? 'bg-indigo-600 text-white shadow-lg' : 'text-zinc-600 hover:text-zinc-400'}`}
                >
                  CZ
                </button>
                <button 
                  onClick={() => onUpdateProfile({ language: 'en' })}
                  className={`px-3 py-1.5 rounded-md text-[7px] font-black uppercase tracking-widest transition-all ${userProfile.language === 'en' ? 'bg-indigo-600 text-white shadow-lg' : 'text-zinc-600 hover:text-zinc-400'}`}
                >
                  EN
                </button>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 space-y-3">
            <h3 className="text-[7px] font-black uppercase tracking-[0.4em] text-red-400/80">Maintenance</h3>
            <div className="flex items-center justify-between gap-3">
              <p className="text-[8px] text-zinc-500 font-bold uppercase tracking-widest">Cache prohlížeče</p>
              <button 
                onClick={() => {
                  localStorage.removeItem('gymni_mate_archive');
                  localStorage.removeItem('gymni_last_lesson');
                  window.location.reload();
                }}
                className="px-3 py-1.5 rounded-md border border-red-500/20 text-red-500/80 text-[7px] font-black uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all shrink-0"
              >
                Flush Data
              </button>
            </div>
          </div>

          {testStatus === 'success' && (
            <div className="p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-lg flex items-center gap-2 animate-fade">
              <div className="w-5 h-5 rounded-md bg-emerald-500 text-white flex items-center justify-center shadow-lg shadow-emerald-500/20"><i className="fa-solid fa-check text-[8px]"></i></div>
              <div className="text-emerald-500/80 text-[7px] font-black uppercase tracking-[0.4em]">Neural Link Established</div>
            </div>
          )}

          {testStatus === 'error' && errorDetails && (
            <div className="p-4 bg-red-500/5 border border-red-500/10 rounded-xl space-y-2 animate-fade">
              <div className="flex items-center gap-2">
                <i className="fa-solid fa-triangle-exclamation text-red-500 text-[10px]"></i>
                <h4 className="text-[7px] font-black uppercase tracking-widest text-red-500">{errorDetails.engine}</h4>
              </div>
              <p className="text-zinc-500 text-[8px] font-bold leading-tight">{errorDetails.message}</p>
            </div>
          )}
        </div>

        <div className="pt-6 border-t border-white/5 mt-6">
           <button onClick={onClose} className="w-full py-3 rounded-lg btn-gradient font-black uppercase text-[8px] tracking-[0.4em] shadow-[0_10px_30px_rgba(79,70,229,0.2)]">Uložit Konfiguraci</button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
