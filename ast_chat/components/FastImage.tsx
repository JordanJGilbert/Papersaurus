import React, { useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';

interface FastImageProps {
  src: string;
  alt: string;
  className?: string;
  loading?: 'lazy' | 'eager';
  sizes?: string;
}

const FastImage: React.FC<FastImageProps> = ({
  src,
  alt,
  className = '',
  loading = 'lazy',
  sizes
}) => {
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  if (hasError) {
    return (
      <div className={`bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center ${className}`}>
        <div className="text-center text-gray-500">
          <ImageIcon className="w-8 h-8 mx-auto mb-2" />
          <p className="text-sm">No preview</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {!isLoaded && (
        <div className="absolute inset-0 bg-gray-200" />
      )}
      <img
        src={src}
        alt={alt}
        loading={loading}
        sizes={sizes}
        className={`w-full h-full object-cover transition-opacity duration-150 ${
          isLoaded ? 'opacity-100' : 'opacity-0'
        }`}
        onLoad={() => setIsLoaded(true)}
        onError={() => setHasError(true)}
        decoding="async"
        fetchPriority={loading === 'eager' ? 'high' : 'low'}
      />
    </div>
  );
};

export default FastImage;