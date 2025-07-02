import React from 'react';

interface SkeletonGalleryProps {
  count?: number;
  className?: string;
}

const SkeletonGallery: React.FC<SkeletonGalleryProps> = ({
  count = 12,
  className = ''
}) => {
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          {/* Image skeleton */}
          <div className="aspect-[2/3] bg-gray-200 animate-pulse" />
          
          {/* Content skeleton */}
          <div className="p-4">
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <div className="h-4 bg-gray-200 rounded animate-pulse mb-1" />
                <div className="h-4 bg-gray-200 rounded animate-pulse w-3/4" />
              </div>
              <div className="ml-2 w-6 h-6 bg-gray-200 rounded animate-pulse" />
            </div>
            
            <div className="flex items-center justify-between">
              <div className="h-3 bg-gray-200 rounded animate-pulse w-20" />
              <div className="h-3 bg-gray-200 rounded animate-pulse w-16" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default SkeletonGallery;