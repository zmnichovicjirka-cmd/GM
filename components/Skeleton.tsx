
import React from 'react';
import { motion } from 'motion/react';

interface SkeletonProps {
  className?: string;
}

export const Skeleton: React.FC<SkeletonProps> = ({ className }) => {
  return (
    <div className={`relative overflow-hidden bg-white/5 rounded-lg ${className}`}>
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"
        animate={{
          x: ['-100%', '100%'],
        }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: "linear",
        }}
      />
    </div>
  );
};

export const CardSkeleton = () => (
  <div className="p-6 rounded-[2rem] bg-white/[0.02] border border-white/5 space-y-4">
    <div className="flex items-center gap-4">
      <Skeleton className="w-12 h-12 rounded-2xl" />
      <div className="space-y-2 flex-1">
        <Skeleton className="w-24 h-3" />
        <Skeleton className="w-16 h-2" />
      </div>
    </div>
    <Skeleton className="w-full h-24 rounded-2xl" />
    <div className="flex gap-2">
      <Skeleton className="w-16 h-6 rounded-full" />
      <Skeleton className="w-16 h-6 rounded-full" />
    </div>
  </div>
);

export const ListSkeleton = () => (
  <div className="space-y-4">
    {[1, 2, 3].map((i) => (
      <div key={i} className="flex items-center gap-4 p-4 rounded-2xl bg-white/[0.02] border border-white/5">
        <Skeleton className="w-10 h-10 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="w-1/3 h-3" />
          <Skeleton className="w-1/4 h-2 opacity-50" />
        </div>
        <Skeleton className="w-8 h-8 rounded-lg" />
      </div>
    ))}
  </div>
);
