
import React, { useState, useEffect } from 'react';
import { UserProfile } from '../types';
import { auth, db } from '../firebase';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { systemLog } from '../services/logService';
import { motion, AnimatePresence } from 'motion/react';
import { verifyAccessCode, saveUserApiConfig } from '../services/dbService';

interface LoginPageProps {
  onLogin: (profile: UserProfile) => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<'login' | 'onboarding' | 'subjects'>('login');
  const [formData, setFormData] = useState({
    name: '',
    yearOfBirth: '',
    grade: '9',
    level: 'elementary' as 'elementary' | 'high' | 'none',
    geminiKey: '',
    cloudinaryCloudName: '',
    cloudinaryUploadPreset: '',
    cloudinaryApiKey: '',
    cloudinaryApiSecret: '',
    accessCode: '',
    selectedSubjects: [] as string[]
  });
  const [tempUser, setTempUser] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    if (isLoading) return;
    setIsLoading(true);
    setError(null);
    const provider = new GoogleAuthProvider();
    
    try {
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      // Check if profile exists
      const userRef = doc(db, 'users', user.uid);
      const snap = await getDoc(userRef);
      
      if (snap.exists()) {
        const data = snap.data();
        onLogin({
          uid: user.uid,
          email: user.email || '',
          isLoggedIn: true,
          role: data.role || 'student',
          displayName: data.displayName,
          grade: data.grade,
          yearOfBirth: data.yearOfBirth
        });
      } else {
        // Go to onboarding
        setTempUser(user);
        setStep('onboarding');
      }
    } catch (error: any) {
      console.error("Login error:", error);
      setError("Přihlášení se nezdařilo. Zkuste to prosím znovu.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCompleteOnboarding = async () => {
    if (!tempUser) return;
    setIsLoading(true);
    setError(null);

    try {
      // 1. Verify Access Code if provided
      let ownerId = null;
      if (formData.accessCode) {
        const codeData = await verifyAccessCode(formData.accessCode);
        if (!codeData) {
          setError("Tento přístupový kód neexistuje.");
          setIsLoading(false);
          return;
        }
      }

      // 2. Create User Profile
      const userRef = doc(db, 'users', tempUser.uid);
      const profileData = {
        uid: tempUser.uid,
        email: tempUser.email || '',
        displayName: formData.name || tempUser.displayName || tempUser.email?.split('@')[0],
        yearOfBirth: parseInt(formData.yearOfBirth) || 0,
        grade: parseInt(formData.grade),
        level: formData.level,
        accessCode: formData.accessCode || null,
        role: 'student',
        createdAt: serverTimestamp(),
        status: 'online',
        onboardingCompleted: true,
        selectedInitialSubjects: formData.selectedSubjects
      };

      await setDoc(userRef, profileData);

      // 3. Save API Keys if provided
      if (formData.geminiKey || formData.cloudinaryCloudName) {
        await saveUserApiConfig({
          key: formData.geminiKey,
          cloudinaryCloudName: formData.cloudinaryCloudName,
          cloudinaryUploadPreset: formData.cloudinaryUploadPreset,
          cloudinaryApiKey: formData.cloudinaryApiKey,
          cloudinaryApiSecret: formData.cloudinaryApiSecret
        });
      }

      onLogin({
        uid: tempUser.uid,
        email: tempUser.email || '',
        isLoggedIn: true,
        role: 'student',
        displayName: profileData.displayName,
        grade: profileData.grade,
        yearOfBirth: profileData.yearOfBirth
      });
      
      systemLog(`Nový uživatel zaregistrován: ${tempUser.email}`);
    } catch (e: any) {
      console.error("Onboarding error:", e);
      setError("Chyba při ukládání profilu.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex bg-black overflow-hidden font-sans">
      {/* Left Side: Universe */}
      <div className="hidden lg:block lg:w-3/5 relative overflow-hidden">
        <div 
          className="absolute inset-0 bg-cover bg-center animate-pulse-slow"
          style={{ 
            backgroundImage: 'url("https://images.unsplash.com/photo-1464802686167-b939a6910659?q=80&w=2000&auto=format&fit=crop")',
            filter: 'brightness(0.6) contrast(1.2)'
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-black/20 to-black" />
        
        {/* Animated stars/nebula effect overlay */}
        <div className="absolute inset-0 z-10 opacity-30">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/20 rounded-full blur-[120px] animate-float" />
          <div className="absolute bottom-1/4 right-1/4 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[150px] animate-float-delayed" />
        </div>

        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-20 text-center">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 1 }}
          >
            <h1 className="text-8xl font-black text-white uppercase tracking-tighter leading-none mb-6">
              Gymni<br/><span className="text-indigo-500 italic">Mate</span>
            </h1>
            <p className="text-xl text-indigo-200/60 font-medium tracking-[0.3em] uppercase max-w-md mx-auto">
              Váš osobní učební vesmír
            </p>
          </motion.div>
        </div>
      </div>

      {/* Right Side: Login Form */}
      <div className="w-full lg:w-2/5 h-full flex flex-col justify-center items-center p-8 lg:p-20 relative bg-[#050505]">
        <div className="w-full max-w-sm space-y-12">
          <div className="space-y-4">
            <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-2xl shadow-white/10">
              <i className="fa-solid fa-atom text-black text-xl"></i>
            </div>
            {step === 'login' ? (
              <>
                <h2 className="text-4xl font-black text-white uppercase tracking-tight">Vítejte zpět</h2>
                <p className="text-zinc-500 font-medium">Pokračujte ve svém studiu a objevujte nové světy znalostí.</p>
              </>
            ) : (
              <>
                <h2 className="text-4xl font-black text-white uppercase tracking-tight">Nastavení</h2>
                <p className="text-zinc-500 font-medium">Pojďme personalizovat váš učební zážitek.</p>
              </>
            )}
          </div>

          <AnimatePresence mode="wait">
            {step === 'login' ? (
              <motion.div 
                key="login-step"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                <button 
                  onClick={handleGoogleLogin}
                  disabled={isLoading}
                  className="w-full group relative flex items-center justify-center gap-4 py-6 px-4 bg-white hover:bg-zinc-200 rounded-3xl transition-all duration-300 shadow-2xl disabled:opacity-50 overflow-hidden"
                >
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-indigo-500/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                  {isLoading ? (
                    <i className="fa-solid fa-circle-notch animate-spin text-black"></i>
                  ) : (
                    <i className="fa-brands fa-google text-black text-xl"></i>
                  )}
                  <span className="text-black font-black uppercase text-sm tracking-[0.2em]">Přihlásit se přes Google</span>
                </button>

                {error && <p className="text-red-500 text-xs font-bold uppercase tracking-widest text-center">{error}</p>}
                
                <div className="pt-20 text-center">
                  <p className="text-[10px] text-zinc-700 uppercase font-black tracking-[0.3em]">AI-Powered Education Platform</p>
                </div>
              </motion.div>
            ) : step === 'onboarding' ? (
              <motion.div 
                key="onboarding-step"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-zinc-500 uppercase font-black tracking-widest px-2">Celé jméno</label>
                    <input 
                      type="text" 
                      placeholder="Jan Novák"
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-white placeholder:text-zinc-700 focus:outline-none focus:border-indigo-500/50 transition-colors"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-zinc-500 uppercase font-black tracking-widest px-2">Rok narození</label>
                    <input 
                      type="number" 
                      placeholder="2010"
                      value={formData.yearOfBirth}
                      onChange={(e) => setFormData({...formData, yearOfBirth: e.target.value})}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 px-5 text-white placeholder:text-zinc-700 focus:outline-none focus:border-indigo-500/50 transition-colors"
                    />
                  </div>
                </div>

                <div className="space-y-6">
                  <div className="space-y-2">
                    <p className="text-[10px] text-zinc-500 uppercase font-black tracking-widest px-2">Tvůj Ročník</p>
                    <div className="space-y-4 bg-white/[0.02] border border-white/5 rounded-2xl p-4">
                      <div className="flex bg-black/40 p-1 rounded-xl border border-white/5">
                        <button onClick={() => setFormData({...formData, level: 'elementary', grade: '1'})} className={`flex-grow py-2 rounded-lg text-[10px] font-black tracking-widest transition-all ${formData.level === 'elementary' ? 'bg-indigo-600 text-white' : 'text-zinc-600'}`}>ZŠ</button>
                        <button onClick={() => setFormData({...formData, level: 'high', grade: '11'})} className={`flex-grow py-2 rounded-lg text-[10px] font-black tracking-widest transition-all ${formData.level === 'high' ? 'bg-indigo-600 text-white' : 'text-zinc-600'}`}>SŠ</button>
                      </div>
                      <div className="grid grid-cols-5 gap-1.5">
                        {(formData.level === 'elementary' ? [1,2,3,4,5,6,7,8,9] : [1,2,3,4]).map(g => {
                          const val = formData.level === 'elementary' ? g.toString() : (g + 10).toString();
                          return (
                            <button 
                              key={g} 
                              onClick={() => setFormData({...formData, grade: val})}
                              className={`h-8 rounded-lg text-[10px] font-black transition-all ${formData.grade === val ? 'bg-white text-black' : 'bg-white/5 text-zinc-600'}`}
                            >
                              {g}.
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6 bg-white/[0.02] border border-white/5 rounded-[2rem] p-6 mt-4">
                   <div className="flex items-center gap-2 mb-2">
                     <i className="fa-solid fa-key text-[10px] text-indigo-500"></i>
                     <span className="text-[10px] text-zinc-500 uppercase font-black tracking-widest">Klíče nebo Kód</span>
                   </div>

                   <p className="text-[9px] text-zinc-600 uppercase font-bold tracking-tight mb-4">
                     Vyplňte vlastní Gemini API pro plnou kontrolu,<br/>nebo zadejte sdílený kód od učitele/kamaráda.
                   </p>

                   <input 
                    type="password" 
                    placeholder="Váš Gemini API Klíč"
                    value={formData.geminiKey}
                    onChange={(e) => setFormData({...formData, geminiKey: e.target.value})}
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-3.5 px-5 text-white placeholder:text-zinc-800 text-sm focus:outline-none focus:border-indigo-500/30 transition-colors"
                  />

                  <div className="flex items-center gap-4">
                    <div className="h-px flex-1 bg-white/5"></div>
                    <span className="text-[9px] text-zinc-700 font-black uppercase">NebO</span>
                    <div className="h-px flex-1 bg-white/5"></div>
                  </div>

                  <input 
                    type="text" 
                    placeholder="Kód (např. GYMI-XXXX-XXXX)"
                    value={formData.accessCode}
                    onChange={(e) => setFormData({...formData, accessCode: e.target.value.toUpperCase()})}
                    className="w-full bg-indigo-500/10 border border-indigo-500/20 rounded-xl py-3.5 px-5 text-indigo-300 placeholder:text-indigo-900/50 text-sm font-mono focus:outline-none focus:border-indigo-500/50 transition-colors"
                  />
                </div>
              </div>

              <button 
                  onClick={() => setStep('subjects')}
                  disabled={isLoading || !formData.name}
                  className="w-full py-5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase text-xs tracking-[0.2em] rounded-2xl transition-all shadow-xl shadow-indigo-500/20 disabled:opacity-30 flex items-center justify-center gap-3"
                >
                  Pokračovat na výběr předmětů
                </button>

                {error && <p className="text-red-500 text-[10px] font-bold uppercase tracking-widest text-center">{error}</p>}
              </motion.div>
            ) : (
              <motion.div 
                key="subjects-step"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="flex items-center justify-between">
                   <h3 className="text-xl font-black text-white uppercase tracking-tight">Co se chceš <span className="text-indigo-500">naučit?</span></h3>
                   <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Krok 2/2</span>
                </div>
                
                <div className="grid grid-cols-2 gap-3 max-h-[400px] overflow-y-auto no-scrollbar pr-2">
                  {[
                    { id: 'math', name: 'Matematika', icon: 'fa-calculator', color: 'bg-blue-500' },
                    { id: 'phys', name: 'Fyzika', icon: 'fa-atom', color: 'bg-cyan-500' },
                    { id: 'chem', name: 'Chemie', icon: 'fa-flask-vial', color: 'bg-emerald-500' },
                    { id: 'bio', name: 'Biologie', icon: 'fa-dna', color: 'bg-green-500' },
                    { id: 'en', name: 'Angličtina', icon: 'fa-language', color: 'bg-indigo-500' },
                    { id: 'de', name: 'Němčina', icon: 'fa-kaaba', color: 'bg-yellow-600' },
                    { id: 'es', name: 'Španělština', icon: 'fa-bullhorn', color: 'bg-orange-600' },
                    { id: 'hist', name: 'Dějepis', icon: 'fa-landmark', color: 'bg-amber-600' },
                    { id: 'info', name: 'Informatika', icon: 'fa-microchip', color: 'bg-purple-500' },
                    { id: 'geo', name: 'Zeměpis', icon: 'fa-earth-europe', color: 'bg-orange-500' },
                    { id: 'lit', name: 'Čeština', icon: 'fa-book', color: 'bg-red-500' },
                    { id: 'soc', name: 'ZSV', icon: 'fa-users', color: 'bg-teal-500' },
                  ].map(s => {
                    const isSelected = formData.selectedSubjects.includes(s.id);
                    return (
                      <button 
                        key={s.id}
                        onClick={() => {
                          const next = isSelected 
                             ? formData.selectedSubjects.filter(i => i !== s.id)
                             : [...formData.selectedSubjects, s.id];
                          setFormData({...formData, selectedSubjects: next});
                        }}
                        className={`group p-4 rounded-2xl border transition-all text-left flex flex-col gap-3 relative overflow-hidden ${isSelected ? 'bg-white/10 border-indigo-500/50 shadow-lg' : 'bg-white/5 border-white/5 hover:border-white/10'}`}
                      >
                         <div className={`w-8 h-8 rounded-lg ${s.color} flex items-center justify-center text-white shadow-sm transition-transform duration-500 ${isSelected ? 'scale-110' : 'group-hover:scale-110'}`}>
                           <i className={`fa-solid ${s.icon} text-xs`}></i>
                         </div>
                         <span className={`text-[10px] font-black uppercase tracking-widest ${isSelected ? 'text-white' : 'text-zinc-500 group-hover:text-zinc-300'}`}>{s.name}</span>
                         {isSelected && (
                           <div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-indigo-500 flex items-center justify-center">
                              <i className="fa-solid fa-check text-[8px] text-white"></i>
                           </div>
                         )}
                      </button>
                    );
                  })}
                </div>

                <div className="flex gap-4">
                  <button 
                    onClick={() => setStep('onboarding')}
                    className="px-6 py-5 bg-white/5 text-zinc-500 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:text-white transition-all"
                  >
                    Zpět
                  </button>
                  <button 
                    onClick={handleCompleteOnboarding}
                    disabled={isLoading || formData.selectedSubjects.length === 0}
                    className="flex-grow py-5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-black uppercase text-xs tracking-[0.2em] rounded-2xl transition-all shadow-xl shadow-indigo-500/20 disabled:opacity-30 flex items-center justify-center gap-3"
                  >
                    {isLoading ? <i className="fa-solid fa-circle-notch animate-spin"></i> : <i className="fa-solid fa-rocket"></i>}
                    Spustit vesmír
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
