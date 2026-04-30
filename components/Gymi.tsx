import React from 'react';
import { motion, Variants, AnimatePresence } from 'motion/react';
import { UserCircle } from 'lucide-react';

export type GymiPose = 
  | 'idle' 
  | 'happy' 
  | 'thinking' 
  | 'pointing' 
  | 'surprised' 
  | 'waving' 
  | 'SPEAKING' 
  | 'THINKING' 
  | 'WAITING' 
  | 'FRIENDLY' 
  | 'SHOCKED' 
  | 'EXPLAIN' 
  | 'INTENSE' 
  | 'HAPPY' 
  | 'LAUGHING' 
  | 'CASUAL';

interface GymiProps {
  pose?: GymiPose;
  className?: string;
  size?: number;
  avatarURL?: string;
  avatarPoses?: { [poseName: string]: string };
  instant?: boolean;
}

const Gymi: React.FC<GymiProps> = ({ 
  pose = 'idle', 
  className = '', 
  size = 100,
  avatarURL,
  avatarPoses,
  instant = false
}) => {
  // Map GymiPose to generated avatar poses
  const getAvatarUrl = () => {
    let poseKey = 'WAITING'; // Default mapping for idle
    
    switch (pose) {
      case 'happy':
      case 'HAPPY':
        poseKey = 'HAPPY';
        break;
      case 'LAUGHING':
        poseKey = 'LAUGHING';
        break;
      case 'thinking':
      case 'THINKING':
        poseKey = 'THINKING';
        break;
      case 'INTENSE':
        poseKey = 'INTENSE';
        break;
      case 'pointing':
      case 'SPEAKING':
      case 'EXPLAIN':
        poseKey = 'SPEAKING';
        break;
      case 'surprised':
      case 'SHOCKED':
        poseKey = 'SHOCKED';
        break;
      case 'waving':
      case 'FRIENDLY':
        poseKey = 'FRIENDLY';
        break;
      case 'CASUAL':
        poseKey = 'CASUAL';
        break;
      case 'WAITING':
      case 'idle':
        poseKey = 'WAITING';
        break;
      default:
        poseKey = 'WAITING';
        break;
    }

    return avatarPoses?.[poseKey] || avatarURL;
  };

  const [isLoading, setIsLoading] = React.useState(true);
  const currentAvatar = getAvatarUrl();

  const variants: Variants = {
    idle: { y: 0 },
    happy: { y: 0, scale: 1 },
    thinking: { rotate: 0 },
    pointing: { x: 0 },
    surprised: { scale: 1 },
    waving: { rotate: 0 }
  };

  if (currentAvatar) {
    return (
      <motion.div
        className={`relative flex items-center justify-center ${className} rounded-[2rem] overflow-hidden bg-transparent`}
        variants={variants}
        animate={pose}
        style={{ width: size, height: size }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={currentAvatar}
            initial={instant ? undefined : { opacity: 0 }}
            animate={instant ? undefined : { opacity: 1 }}
            exit={instant ? undefined : { opacity: 0 }}
            transition={instant ? { duration: 0 } : { duration: 0.3 }}
            className="w-full h-full relative bg-transparent"
          >
            <motion.img
              src={currentAvatar.startsWith('http') || currentAvatar.startsWith('/') ? currentAvatar : `data:image/png;base64,${currentAvatar}`}
              alt="Assistant Avatar"
              className={`w-full h-full object-cover bg-transparent ${!instant ? 'transition-opacity duration-300' : ''} ${isLoading ? 'opacity-0' : 'opacity-100'}`}
              referrerPolicy="no-referrer"
              onLoad={() => setIsLoading(false)}
              initial={instant ? false : { scale: 0.9 }}
              animate={instant ? { scale: 1 } : { scale: 1 }}
              transition={instant ? { duration: 0 } : { duration: 0.3 }}
            />
          </motion.div>
        </AnimatePresence>
      </motion.div>
    );
  }

  return (
    <motion.div
      className={`relative flex items-center justify-center ${className} bg-white/5 border border-white/10 rounded-[2.5rem] overflow-hidden`}
      variants={variants}
      animate={pose}
      style={{ width: size, height: size }}
    >
      <i className="fa-solid fa-robot text-white/20 text-4xl"></i>
    </motion.div>
  );
};

export default Gymi;
