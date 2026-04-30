
import React, { useState } from 'react';
import { UserProfile } from '../types';
import { auth } from '../firebase';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { systemLog } from '../services/logService';

interface LoginModalProps {
  onLogin: (profile: UserProfile) => void;
  onClose: () => void;
}

const LoginModal: React.FC<LoginModalProps> = ({ onLogin, onClose }) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleGoogleLogin = async () => {
    if (isLoading) return; // Prevent multiple clicks which cause "INTERNAL ASSERTION FAILED: Pending promise was never set"
    
    setIsLoading(true);
    const provider = new GoogleAuthProvider();
    
    try {
      // Small timeout to ensure browser focus isn't lost during state transition
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      onLogin({
        uid: user.uid,
        email: user.email || '',
        isLoggedIn: true,
        role: 'student' // Default role
      });
      systemLog(`Přihlášen uživatel: ${user.email}`);
      onClose();
    } catch (error: any) {
      if (error.code === 'auth/popup-closed-by-user') {
        console.warn("Login cancelled by user (popup closed)");
        systemLog("Přihlášení zrušeno uživatelem.");
      } else {
        console.error("Login error:", error);
        systemLog(`Chyba přihlášení: ${error.message}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-xl" onClick={onClose}></div>
      <div className="relative w-full max-w-md glass-panel rounded-[3rem] p-12 animate-fade shadow-2xl border-white/10">
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl shadow-indigo-500/20">
            <i className="fa-solid fa-lock text-white text-2xl"></i>
          </div>
          <h2 className="text-2xl font-black uppercase tracking-widest text-white">Přihlášení</h2>
          <p className="text-zinc-500 text-xs font-bold mt-2 uppercase tracking-widest">Vítejte v Gymni Mate</p>
        </div>

        <div className="space-y-6">
          <button 
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="w-full py-5 rounded-2xl bg-white text-black font-black uppercase text-xs tracking-[0.2em] mt-6 shadow-xl flex items-center justify-center gap-4 hover:bg-zinc-200 transition-all disabled:opacity-50"
          >
            {isLoading ? (
              <i className="fa-solid fa-circle-notch animate-spin"></i>
            ) : (
              <i className="fa-brands fa-google text-lg"></i>
            )}
            Přihlásit se přes Google
          </button>
          
          <p className="text-[10px] text-zinc-600 text-center uppercase font-black tracking-widest">
            Bezpečné přihlášení přes Google účet
          </p>
        </div>
        
        <button onClick={onClose} className="absolute top-8 right-8 text-zinc-500 hover:text-white transition-colors">
          <i className="fa-solid fa-xmark text-xl"></i>
        </button>
      </div>
    </div>
  );
};

export default LoginModal;
