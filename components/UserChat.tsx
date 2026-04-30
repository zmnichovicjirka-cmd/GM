
import React, { useState, useEffect, useRef } from 'react';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  serverTimestamp, 
  getDocs,
  limit,
  or,
  and
} from 'firebase/firestore';
import { db } from '../firebase';
import { UserProfile } from '../types';
import { FormattedText } from './StudyOutput';
import { handleFirestoreError, OperationType } from '../services/dbService';

interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  text: string;
  timestamp: any;
}

interface UserChatProps {
  currentUser: UserProfile;
}

const UserChat: React.FC<UserChatProps> = ({ currentUser }) => {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Fetch all users
  useEffect(() => {
    const q = query(collection(db, 'users'), limit(50));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const usersList = snapshot.docs
        .map(doc => doc.data() as UserProfile)
        .filter(u => u.uid !== currentUser.uid);
      setUsers(usersList);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });
    return () => unsubscribe();
  }, [currentUser.uid]);

  // Fetch messages for selected user
  useEffect(() => {
    if (!selectedUser) return;

    const q = query(
      collection(db, 'messages'),
      or(
        and(where('senderId', '==', currentUser.uid), where('receiverId', '==', selectedUser.uid)),
        and(where('senderId', '==', selectedUser.uid), where('receiverId', '==', currentUser.uid))
      ),
      orderBy('timestamp', 'asc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const msgs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Message[];
      
      setMessages(msgs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'messages');
    });

    return () => unsubscribe();
  }, [selectedUser, currentUser.uid]);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || !selectedUser) return;
    const text = input;
    setInput('');

    const messagesPath = 'messages';
    try {
      await addDoc(collection(db, messagesPath), {
        senderId: currentUser.uid,
        receiverId: selectedUser.uid,
        text,
        timestamp: serverTimestamp()
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, messagesPath);
      console.error("Error sending message:", error);
    }
  };

  const filteredUsers = users.filter(u => 
    (u.displayName || u.email).toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex h-full gap-6 animate-fade">
      {/* Sidebar - Users List */}
      <div className="w-80 flex flex-col glass-panel rounded-[3rem] border-white/5 overflow-hidden shadow-2xl">
        <div className="p-8 border-b border-white/5 bg-zinc-950/20">
          <h2 className="text-xl font-black uppercase tracking-widest text-white mb-6">Uživatelé</h2>
          <div className="relative">
            <i className="fa-solid fa-magnifying-glass absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600 text-xs"></i>
            <input 
              type="text" 
              placeholder="Hledat uživatele..." 
              className="w-full bg-zinc-900/50 border border-white/5 rounded-2xl py-3 pl-10 pr-4 text-[10px] font-black uppercase tracking-widest text-zinc-300 placeholder:text-zinc-700 focus:outline-none focus:border-indigo-500/50 transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
        
        <div className="flex-grow overflow-y-auto no-scrollbar py-4 px-2">
          {filteredUsers.map(u => (
            <button 
              key={u.uid} 
              onClick={() => setSelectedUser(u)}
              className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all duration-300 group ${selectedUser?.uid === u.uid ? 'bg-indigo-600/10 border border-indigo-500/20 shadow-lg' : 'hover:bg-white/5 border border-transparent'}`}
            >
              <div className="relative shrink-0">
                <div className={`w-12 h-12 rounded-xl bg-zinc-800 flex items-center justify-center text-white shadow-lg group-hover:scale-105 transition-transform overflow-hidden`}>
                  {u.photoURL ? (
                    <img src={u.photoURL} alt={u.displayName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  ) : (
                    <i className={`fa-solid fa-user text-base text-zinc-500`}></i>
                  )}
                </div>
                <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-[#020617] ${u.status === 'online' ? 'bg-emerald-500' : u.status === 'away' ? 'bg-amber-500' : 'bg-zinc-600'}`}></div>
              </div>
              <div className="text-left overflow-hidden">
                <div className="font-black text-[11px] uppercase tracking-tight text-white truncate">{u.displayName || u.email.split('@')[0]}</div>
                <div className="text-[9px] text-zinc-500 font-bold uppercase tracking-widest truncate">{u.role}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-grow glass-panel rounded-[3.5rem] flex flex-col overflow-hidden border-white/5 shadow-[0_50px_100px_rgba(0,0,0,0.5)] bg-zinc-950/20">
        {selectedUser ? (
          <>
            {/* Chat Header */}
            <div className="p-8 border-b border-white/5 bg-zinc-950/40 flex items-center justify-between backdrop-blur-3xl">
              <div className="flex items-center gap-5">
                <div className={`w-14 h-14 rounded-2xl bg-zinc-800 flex items-center justify-center text-white shadow-2xl relative overflow-hidden`}>
                   {selectedUser.photoURL ? (
                     <img src={selectedUser.photoURL} alt={selectedUser.displayName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                   ) : (
                     <i className={`fa-solid fa-user text-xl text-zinc-500`}></i>
                   )}
                   {selectedUser.status === 'online' && <span className="absolute -top-1 -right-1 w-4 h-4 bg-emerald-500 rounded-full border-2 border-zinc-950 animate-pulse"></span>}
                </div>
                <div>
                  <h3 className="font-black uppercase tracking-widest text-sm text-white">{selectedUser.displayName || selectedUser.email.split('@')[0]}</h3>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[9px] text-indigo-400 font-black uppercase tracking-widest">{selectedUser.role}</span>
                    <span className="w-1 h-1 rounded-full bg-zinc-700"></span>
                    <span className="text-[8px] font-black uppercase tracking-widest text-zinc-500">{selectedUser.status === 'online' ? 'Právě aktivní' : 'Offline'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Messages Content */}
            <div className="flex-grow overflow-y-auto p-8 space-y-6 no-scrollbar bg-black/5">
              <div className="flex flex-col gap-8">
                {messages.map((m, i) => (
                  <div key={m.id || i} className={`flex ${m.senderId === currentUser.uid ? 'justify-end' : 'justify-start'} items-end gap-3 animate-fade`}>
                    {m.senderId !== currentUser.uid && (
                      <div className={`w-8 h-8 rounded-lg bg-zinc-800 flex items-center justify-center text-white text-[10px] shrink-0 mb-1 overflow-hidden`}>
                        {selectedUser.photoURL ? (
                          <img src={selectedUser.photoURL} alt={selectedUser.displayName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <i className={`fa-solid fa-user`}></i>
                        )}
                      </div>
                    )}
                    <div className="flex flex-col gap-1.5 max-w-[75%]">
                      <div className={`p-6 rounded-[2.2rem] shadow-xl ${m.senderId === currentUser.uid ? 'bg-indigo-600 text-white rounded-br-none' : 'bg-zinc-900 text-zinc-300 rounded-bl-none border border-white/10'}`}>
                        <p className="text-sm font-bold leading-relaxed">{m.text}</p>
                      </div>
                      <span className={`text-[8px] font-black uppercase tracking-widest text-zinc-600 px-4 ${m.senderId === currentUser.uid ? 'text-right' : 'text-left'}`}>
                        {m.timestamp?.toDate().toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div ref={scrollRef} />
            </div>

            {/* Chat Input */}
            <div className="p-8 bg-zinc-950/60 border-t border-white/5 flex gap-4 backdrop-blur-3xl items-center">
              <div className="flex-grow relative">
                <input 
                  className="w-full bg-zinc-900/50 border border-white/10 p-5 pr-14 rounded-2xl text-sm text-white focus:outline-none focus:border-indigo-500/50 transition-all placeholder:text-zinc-700" 
                  placeholder="Napište zprávu..."
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSend()}
                />
                <button onClick={handleSend} className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white hover:bg-indigo-500 shadow-xl transition-all active:scale-90">
                  <i className="fa-solid fa-arrow-up text-xs"></i>
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center px-20 gap-8 opacity-20 animate-fade">
            <div className={`w-24 h-24 rounded-[2.5rem] bg-zinc-800 flex items-center justify-center text-white text-4xl shadow-2xl`}>
              <i className={`fa-solid fa-comments`}></i>
            </div>
            <div className="space-y-4">
              <p className="text-xl font-black uppercase tracking-[0.3em]">Vyberte uživatele</p>
              <p className="text-xs font-bold leading-relaxed max-w-sm mx-auto uppercase tracking-widest">Začněte konverzaci s kýmkoliv z komunity GYMNI MATE.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserChat;
