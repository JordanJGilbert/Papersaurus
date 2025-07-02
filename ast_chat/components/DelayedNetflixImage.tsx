import React, { useState, useEffect } from 'react';
import NetflixStyleImage from './NetflixStyleImage';
import { Image as ImageIcon } from 'lucide-react';
import { useNetworkAware } from '../hooks/useNetworkAware';

interface DelayedNetflixImageProps {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
  loadDelay?: number;
  onLoad?: () => void;
}

const DelayedNetflixImage: React.FC<DelayedNetflixImageProps> = ({
  src,
  alt,
  className = '',
  priority = false,
  loadDelay = 0,
  onLoad
}) => {
  const [shouldLoad, setShouldLoad] = useState(priority || loadDelay === 0);
  const { isSlowConnection } = useNetworkAware();

  useEffect(() => {
    if (!shouldLoad && loadDelay > 0) {
      // Netflix-style: Increase delay on slow connections
      const adjustedDelay = isSlowConnection ? loadDelay * 2 : loadDelay;
      
      const timer = setTimeout(() => {
        setShouldLoad(true);
      }, adjustedDelay);

      return () => clearTimeout(timer);
    }
  }, [shouldLoad, loadDelay, isSlowConnection]);

  if (!shouldLoad) {
    return (
      <div className={`bg-gradient-to-br from-gray-100 to-gray-200 animate-pulse flex items-center justify-center ${className}`}>
        <div className="text-center text-gray-400">
          <div className="w-8 h-8 bg-gray-300 rounded-full mx-auto mb-2 animate-pulse"></div>
          <div className="w-12 h-2 bg-gray-300 rounded mx-auto animate-pulse"></div>
        </div>
      </div>
    );
  }

  return (
    <NetflixStyleImage
      src={src}
      alt={alt}
      className={className}
      priority={priority}
      onLoad={onLoad}
    />
  );
};

export default DelayedNetflixImage;