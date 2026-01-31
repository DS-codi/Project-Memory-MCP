import React from 'react';
import { cn } from '../../utils/cn';

interface SkeletonProps {
  className?: string;
  variant?: 'text' | 'circular' | 'rectangular' | 'rounded';
  width?: string | number;
  height?: string | number;
  animation?: 'pulse' | 'wave' | 'none';
}

export function Skeleton({
  className,
  variant = 'text',
  width,
  height,
  animation = 'pulse',
}: SkeletonProps) {
  const baseStyles = 'bg-gray-200 dark:bg-gray-700';
  
  const variantStyles = {
    text: 'rounded h-4',
    circular: 'rounded-full',
    rectangular: '',
    rounded: 'rounded-md',
  };

  const animationStyles = {
    pulse: 'animate-pulse',
    wave: 'animate-shimmer bg-gradient-to-r from-gray-200 via-gray-100 to-gray-200 dark:from-gray-700 dark:via-gray-600 dark:to-gray-700 bg-[length:200%_100%]',
    none: '',
  };

  const style: React.CSSProperties = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
  };

  return (
    <div
      className={cn(
        baseStyles,
        variantStyles[variant],
        animationStyles[animation],
        className
      )}
      style={style}
      aria-hidden="true"
    />
  );
}

// Pre-built skeleton patterns for common use cases

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={cn('border border-gray-200 dark:border-gray-700 rounded-lg p-4', className)}>
      <div className="flex items-center gap-3 mb-4">
        <Skeleton variant="circular" width={40} height={40} />
        <div className="flex-1">
          <Skeleton width="60%" height={16} className="mb-2" />
          <Skeleton width="40%" height={12} />
        </div>
      </div>
      <Skeleton height={12} className="mb-2" />
      <Skeleton height={12} className="mb-2" />
      <Skeleton width="80%" height={12} />
    </div>
  );
}

export function SkeletonList({ count = 3, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('space-y-3', className)}>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg">
          <Skeleton variant="circular" width={32} height={32} />
          <div className="flex-1">
            <Skeleton width="50%" height={14} className="mb-1" />
            <Skeleton width="30%" height={10} />
          </div>
          <Skeleton width={60} height={24} variant="rounded" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5, columns = 4, className }: { rows?: number; columns?: number; className?: string }) {
  return (
    <div className={cn('border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden', className)}>
      {/* Header */}
      <div className="flex gap-4 p-4 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        {Array.from({ length: columns }).map((_, index) => (
          <Skeleton key={index} width={`${100 / columns}%`} height={16} />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-4 p-4 border-b last:border-b-0 border-gray-100 dark:border-gray-800">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton key={colIndex} width={`${100 / columns}%`} height={14} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonEditor({ className }: { className?: string }) {
  return (
    <div className={cn('border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden', className)}>
      {/* Toolbar */}
      <div className="flex items-center gap-2 p-3 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <Skeleton width={24} height={24} variant="rounded" />
        <Skeleton width={24} height={24} variant="rounded" />
        <Skeleton width={24} height={24} variant="rounded" />
        <div className="flex-1" />
        <Skeleton width={80} height={28} variant="rounded" />
      </div>
      {/* Editor content */}
      <div className="p-4 space-y-3">
        <Skeleton width="70%" height={14} />
        <Skeleton width="100%" height={14} />
        <Skeleton width="85%" height={14} />
        <Skeleton width="60%" height={14} />
        <div className="h-4" />
        <Skeleton width="90%" height={14} />
        <Skeleton width="100%" height={14} />
        <Skeleton width="75%" height={14} />
        <Skeleton width="40%" height={14} />
      </div>
    </div>
  );
}

export function SkeletonPlanCard({ className }: { className?: string }) {
  return (
    <div className={cn('border border-gray-200 dark:border-gray-700 rounded-lg p-4', className)}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <Skeleton width="60%" height={18} className="mb-2" />
          <Skeleton width="40%" height={12} />
        </div>
        <Skeleton width={60} height={24} variant="rounded" />
      </div>
      {/* Progress bar */}
      <div className="mb-3">
        <div className="flex justify-between mb-1">
          <Skeleton width={80} height={10} />
          <Skeleton width={30} height={10} />
        </div>
        <Skeleton height={8} variant="rounded" />
      </div>
      {/* Steps preview */}
      <div className="space-y-2">
        <Skeleton width="80%" height={12} />
        <Skeleton width="70%" height={12} />
        <Skeleton width="60%" height={12} />
      </div>
    </div>
  );
}

export function SkeletonStats({ className }: { className?: string }) {
  return (
    <div className={cn('grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4', className)}>
      {Array.from({ length: 4 }).map((_, index) => (
        <div key={index} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <Skeleton width={80} height={12} />
            <Skeleton variant="circular" width={20} height={20} />
          </div>
          <Skeleton width={60} height={28} className="mb-1" />
          <Skeleton width="100%" height={4} variant="rounded" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonTimeline({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('relative', className)}>
      {/* Vertical line */}
      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700" />
      
      {/* Timeline items */}
      <div className="space-y-6">
        {Array.from({ length: count }).map((_, index) => (
          <div key={index} className="flex gap-4">
            <Skeleton variant="circular" width={32} height={32} className="relative z-10 flex-shrink-0" />
            <div className="flex-1 pt-1">
              <Skeleton width="50%" height={14} className="mb-2" />
              <Skeleton width="80%" height={12} className="mb-1" />
              <Skeleton width="30%" height={10} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default Skeleton;
