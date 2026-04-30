
import React, { useState, useEffect } from 'react';
import { StudyResult } from '../types';
import { FormattedText, FormattedInline } from './StudyOutput';
import { motion, AnimatePresence } from 'motion/react';
import { evaluateUserAnswer } from '../services/geminiService';

interface InteractiveLearningProps {
  result: StudyResult | null;
  archiveId?: string;
  isOpen: boolean;
  onClose: () => void;
  onUpdateHighScores?: (scores: { easy: number; medium: number; hard: number }) => void;
}

type Difficulty = 'easy' | 'medium' | 'hard';
type View = 'selection' | 'quiz' | 'feedback' | 'result';

const InteractiveLearning: React.FC<InteractiveLearningProps> = ({ result, archiveId, isOpen, onClose, onUpdateHighScores }) => {
  const [view, setView] = useState<View>('selection');
  const [step, setStep] = useState(0); 
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [score, setScore] = useState(0);
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [feedback, setFeedback] = useState<{ isCorrect: boolean, feedback: string, correctAnswer: string } | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [sessionResults, setSessionResults] = useState<{ step: number, isCorrect: boolean }[]>([]);
  const [showHint, setShowHint] = useState(false);

  // Persistence: Load progress
  useEffect(() => {
    if (!isOpen || !result) return;
    const totalParagraphs = result.fullSummary.length;
    const sessionId = archiveId || result.title;
    const key = `study_progress_${sessionId}_${difficulty}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        const { step: s, score: sc, sessionResults: sr } = JSON.parse(saved);
        // Only load if it's for the current session and not finished
        if (s > 0 && s <= totalParagraphs) {
          setStep(s);
          setScore(sc);
          setSessionResults(sr);
          setView('quiz');
        }
      } catch (e) {
        console.error("Failed to load progress", e);
      }
    }
  }, [isOpen, result, archiveId, difficulty]);

  // Persistence: Save progress
  useEffect(() => {
    if (!isOpen || !result || view === 'selection' || view === 'result') return;
    const sessionId = archiveId || result.title;
    const key = `study_progress_${sessionId}_${difficulty}`;
    localStorage.setItem(key, JSON.stringify({ step, score, sessionResults }));
  }, [step, score, sessionResults, isOpen, result, archiveId, difficulty, view]);

  const currentParagraph = step > 0 ? result?.fullSummary[step - 1] : null;
  const totalParagraphs = result?.fullSummary.length || 0;
  const sessionId = archiveId || result?.title || '';
  const highScores = result?.interactiveHighScores || { easy: 0, medium: 0, hard: 0 };

  if (!result || !isOpen) return null;

  const isUnlocked = (diff: Difficulty) => {
    if (diff === 'easy') return true;
    if (diff === 'medium') return highScores.easy >= 70; // 70% to unlock
    if (diff === 'hard') return highScores.medium >= 70;
    return false;
  };

  const startSession = (diff: Difficulty) => {
    setDifficulty(diff);
    setStep(1);
    setScore(0);
    setView('quiz');
    setSessionResults([]);
  };

  const handleSubmit = async () => {
    if (!currentAnswer.trim() || isEvaluating) return;
    setIsEvaluating(true);
    
    try {
      const currentParagraph = result.fullSummary[step - 1];
      const evaluation = await evaluateUserAnswer(
        result.title,
        currentParagraph.text,
        currentParagraph.question,
        currentAnswer,
        difficulty
      );
      setFeedback(evaluation);
      if (evaluation.isCorrect) {
        setScore(s => s + 1);
      }
      setSessionResults(prev => [...prev, { step, isCorrect: evaluation.isCorrect }]);
      setView('feedback');
    } catch (e) {
      console.error("Evaluation failed", e);
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleNext = () => {
    setShowHint(false);
    if (step < totalParagraphs) {
      setStep(s => s + 1);
      setCurrentAnswer('');
      setFeedback(null);
      setView('quiz');
    } else {
      // End of session
      const finalPercentage = Math.round((score / totalParagraphs) * 100);
      const newHighScores = { ...highScores };
      if (finalPercentage > newHighScores[difficulty]) {
        newHighScores[difficulty] = finalPercentage;
        onUpdateHighScores?.(newHighScores);
      }
      // Clear progress on completion
      localStorage.removeItem(`study_progress_${sessionId}_${difficulty}`);
      setView('result');
    }
  };

  const getPrompt = () => {
    switch(difficulty) {
      case 'medium': return "Uveď praktický příklad, jak se tento koncept využívá v reálném světě.";
      case 'hard': return "Jak tento koncept souvisí s ostatními částmi učiva? Proč je podle tebe klíčový?";
      default: return "Zkus tento odstavec přepsat vlastními slovy. Co je hlavní myšlenkou? (Stačí krátce a jednoduše)";
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[2000] bg-black/95 backdrop-blur-2xl flex flex-col items-center justify-center p-10 overflow-hidden"
        >
          {/* Header */}
          <div className="absolute top-10 left-10 flex items-center gap-8">
            <div className="flex flex-col">
              <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2">Lekce</p>
              <h3 className="text-white font-black uppercase tracking-tight">{result.title}</h3>
            </div>
            {view !== 'selection' && (
              <>
                <div className="flex flex-col">
                  <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2">Skóre</p>
                  <span className="text-2xl font-black text-white">{score} / {totalParagraphs}</span>
                </div>
                <div className="flex flex-col">
                  <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mb-2">Obtížnost</p>
                  <span className={`text-[10px] font-black uppercase px-3 py-1 rounded-full border ${difficulty === 'hard' ? 'bg-red-500/20 text-red-500 border-red-500/30' : difficulty === 'medium' ? 'bg-amber-500/20 text-amber-500 border-amber-500/30' : 'bg-emerald-500/20 text-emerald-500 border-emerald-500/30'}`}>
                    {difficulty}
                  </span>
                </div>
              </>
            )}
          </div>

          <button 
            onClick={onClose}
            className="absolute top-10 right-10 w-16 h-16 rounded-full bg-white/5 hover:bg-white/10 text-zinc-500 hover:text-white transition-all flex items-center justify-center border border-white/10"
          >
            <i className="fa-solid fa-xmark text-2xl"></i>
          </button>

          <div className="w-full max-w-7xl h-full flex flex-col items-center justify-center relative">
            <AnimatePresence mode="wait">
              {view === 'selection' && (
                <motion.div 
                  key="selection"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="text-center space-y-12"
                >
                  <div className="space-y-4">
                    <p className="text-[10px] font-black uppercase tracking-[0.5em] text-indigo-500">Interaktivní studium</p>
                    <h1 className="text-5xl md:text-7xl font-black uppercase text-white tracking-tighter leading-none logo-font">
                      Vyber si obtížnost
                    </h1>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-5xl mx-auto">
                    {(['easy', 'medium', 'hard'] as Difficulty[]).map((diff) => {
                      const unlocked = isUnlocked(diff);
                      const score = highScores[diff];
                      return (
                        <button
                          key={diff}
                          onClick={() => unlocked && startSession(diff)}
                          className={`group relative p-10 rounded-[3rem] border transition-all flex flex-col items-center gap-6 ${unlocked ? 'bg-white/5 border-white/10 hover:bg-white/10 hover:scale-105' : 'bg-black/40 border-white/5 opacity-50 cursor-not-allowed'}`}
                        >
                          {!unlocked && <i className="fa-solid fa-lock absolute top-6 right-6 text-zinc-600"></i>}
                          <div className={`w-20 h-20 rounded-3xl flex items-center justify-center text-3xl ${diff === 'easy' ? 'bg-emerald-500/20 text-emerald-500' : diff === 'medium' ? 'bg-amber-500/20 text-amber-500' : 'bg-red-500/20 text-red-500'}`}>
                            <i className={`fa-solid ${diff === 'easy' ? 'fa-seedling' : diff === 'medium' ? 'fa-fire' : 'fa-skull'}`}></i>
                          </div>
                          <div className="text-center">
                            <h3 className="text-2xl font-black uppercase text-white">{diff === 'easy' ? 'Začátečník' : diff === 'medium' ? 'Pokročilý' : 'Mistr'}</h3>
                            <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mt-1">
                              {diff === 'easy' ? 'Základní pochopení' : diff === 'medium' ? 'Aplikace v praxi' : 'Hluboké souvislosti'}
                            </p>
                          </div>
                          <div className="w-full pt-6 border-t border-white/5 flex flex-col items-center gap-2">
                            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-600">Nejlepší skóre</p>
                            <span className="text-2xl font-black text-white">{score}%</span>
                            <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                              <div className={`h-full transition-all duration-1000 ${diff === 'easy' ? 'bg-emerald-500' : diff === 'medium' ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${score}%` }}></div>
                            </div>
                          </div>
                          {unlocked && (
                            <div className="mt-4 px-6 py-2 rounded-full bg-white text-black text-[10px] font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
                              Spustit lekci
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </motion.div>
              )}

              {view === 'quiz' && (
                <motion.div 
                  key="quiz"
                  initial={{ opacity: 0, x: 100 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -100 }}
                  className="w-full grid grid-cols-1 lg:grid-cols-2 gap-16 items-center"
                >
                  <div className="space-y-10">
                    <div className="space-y-4">
                      <div className="flex items-center gap-4">
                        <span className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white font-black text-lg shadow-2xl shadow-indigo-600/40">
                          {step}
                        </span>
                        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Krok {step} z {totalParagraphs}</p>
                      </div>
                      <h2 className="text-3xl font-black text-white uppercase tracking-tight leading-tight">
                        <FormattedInline text={currentParagraph?.question || ''} />
                      </h2>
                    </div>
                    
                    <div className={`p-10 rounded-[3rem] bg-white/5 border border-white/10 shadow-2xl relative overflow-hidden transition-all ${showHint ? 'opacity-100' : 'opacity-20 blur-sm grayscale'}`}>
                      <div className="absolute top-0 left-0 w-1.5 h-full bg-indigo-500"></div>
                      <FormattedText 
                        text={currentParagraph?.text || ''} 
                        className="text-xl font-medium leading-relaxed text-zinc-300"
                      />
                      {!showHint && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                          <button 
                            onClick={() => setShowHint(true)}
                            className="px-8 py-4 bg-white text-black rounded-full font-black text-[10px] uppercase tracking-widest shadow-2xl hover:bg-indigo-500 hover:text-white transition-all"
                          >
                            <i className="fa-solid fa-eye mr-2"></i> Zobrazit text (Nápověda)
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-8">
                    <div className="space-y-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Tvá odpověď</p>
                      <textarea 
                        autoFocus
                        value={currentAnswer}
                        onChange={(e) => setCurrentAnswer(e.target.value)}
                        placeholder={getPrompt()}
                        className="w-full h-[300px] bg-zinc-900/50 border border-white/10 rounded-[3rem] p-10 text-xl font-medium text-white placeholder:text-zinc-700 focus:outline-none focus:border-indigo-500/50 transition-all resize-none shadow-inner"
                      />
                    </div>
                    <div className="flex justify-end">
                      <button 
                        onClick={handleSubmit}
                        disabled={currentAnswer.trim().length < 5 || isEvaluating}
                        className="px-12 py-5 bg-indigo-600 text-white rounded-full font-black text-xs uppercase tracking-widest hover:bg-indigo-500 transition-all disabled:opacity-50 flex items-center gap-3"
                      >
                        {isEvaluating ? (
                          <>
                            <i className="fa-solid fa-circle-notch animate-spin"></i>
                            Vyhodnocuji...
                          </>
                        ) : (
                          <>
                            Odeslat odpověď
                            <i className="fa-solid fa-paper-plane"></i>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}

              {view === 'feedback' && feedback && (
                <motion.div 
                  key="feedback"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 1.05 }}
                  className="w-full max-w-4xl space-y-10"
                >
                  <div className={`p-10 rounded-[3rem] border ${feedback.isCorrect ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'} flex items-start gap-8`}>
                    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center text-2xl shrink-0 ${feedback.isCorrect ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>
                      <i className={`fa-solid ${feedback.isCorrect ? 'fa-check' : 'fa-xmark'}`}></i>
                    </div>
                    <div className="space-y-6">
                      <h2 className={`text-3xl font-black uppercase tracking-tight ${feedback.isCorrect ? 'text-emerald-400' : 'text-red-400'}`}>
                        {feedback.isCorrect ? 'Skvělá práce!' : 'Téměř jsi to trefil'}
                      </h2>
                      <div className="prose prose-invert max-w-none">
                        <FormattedText text={feedback.feedback} className="text-xl text-zinc-300 leading-relaxed" />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">Tvá odpověď</p>
                      <div className="p-8 rounded-[2rem] bg-white/5 border border-white/10 text-zinc-400 italic">
                        "{currentAnswer}"
                      </div>
                    </div>
                    <div className="space-y-4">
                      <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400">Ideální odpověď</p>
                      <div className="p-8 rounded-[2rem] bg-indigo-500/10 border border-indigo-500/20 text-white font-medium">
                        {feedback.correctAnswer}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-center pt-6">
                    <button 
                      onClick={handleNext}
                      className="px-16 py-6 bg-white text-black rounded-full font-black text-xs uppercase tracking-[0.3em] hover:bg-indigo-500 hover:text-white transition-all shadow-2xl"
                    >
                      Pokračovat
                    </button>
                  </div>
                </motion.div>
              )}

              {view === 'result' && (
                <motion.div 
                  key="result"
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center space-y-12"
                >
                  <div className="relative inline-block">
                    <div className="w-64 h-64 rounded-full border-8 border-white/5 flex items-center justify-center relative">
                      <svg className="absolute inset-0 w-full h-full -rotate-90">
                        <circle
                          cx="128"
                          cy="128"
                          r="120"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="8"
                          className="text-indigo-500"
                          strokeDasharray={2 * Math.PI * 120}
                          strokeDashoffset={2 * Math.PI * 120 * (1 - score / totalParagraphs)}
                          style={{ transition: 'stroke-dashoffset 2s ease-out' }}
                        />
                      </svg>
                      <div className="text-center">
                        <span className="text-7xl font-black text-white">{Math.round((score / totalParagraphs) * 100)}%</span>
                        <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500 mt-2">Úspěšnost</p>
                      </div>
                    </div>
                    <div className="absolute -top-4 -right-4 w-16 h-16 bg-white text-black rounded-2xl flex items-center justify-center text-2xl shadow-2xl animate-bounce">
                      <i className={`fa-solid ${score / totalParagraphs >= 0.7 ? 'fa-trophy' : 'fa-medal'}`}></i>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h2 className="text-5xl font-black uppercase text-white tracking-tighter">
                      {score / totalParagraphs >= 0.7 ? 'Lekce dokončena!' : 'Zkus to znovu'}
                    </h2>
                    <p className="text-zinc-500 text-sm font-bold uppercase tracking-widest max-w-xl mx-auto leading-relaxed">
                      {score / totalParagraphs >= 0.7 
                        ? `Gratulujeme! Získal jsi ${score} z ${totalParagraphs} bodů a odemkl jsi další úroveň.`
                        : `Získal jsi ${score} z ${totalParagraphs} bodů. Pro odemčení další úrovně potřebuješ alespoň 70%.`}
                    </p>
                  </div>

                  <div className="flex gap-6 justify-center">
                    <button 
                      onClick={() => setView('selection')}
                      className="px-12 py-5 border border-white/10 text-white rounded-full font-black text-xs uppercase tracking-widest hover:bg-white/5 transition-all"
                    >
                      Zpět na výběr
                    </button>
                    <button 
                      onClick={onClose}
                      className="px-12 py-5 bg-white text-black rounded-full font-black text-xs uppercase tracking-widest hover:bg-indigo-500 hover:text-white transition-all shadow-2xl"
                    >
                      Ukončit studium
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default InteractiveLearning;
