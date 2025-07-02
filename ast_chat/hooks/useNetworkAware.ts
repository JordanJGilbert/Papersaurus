import { useState, useEffect } from 'react';

interface NetworkInfo {
  effectiveType: '2g' | '3g' | '4g' | 'slow-2g' | undefined;
  downlink: number;
  isSlowConnection: boolean;
  isFastConnection: boolean;
}

export const useNetworkAware = (): NetworkInfo => {
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo>({
    effectiveType: undefined,
    downlink: 10, // Default to decent connection
    isSlowConnection: false,
    isFastConnection: true
  });

  useEffect(() => {
    const updateNetworkInfo = () => {
      // @ts-ignore - Network API not in types yet
      const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      
      if (connection) {
        const effectiveType = connection.effectiveType;
        const downlink = connection.downlink || 10;
        
        setNetworkInfo({
          effectiveType,
          downlink,
          isSlowConnection: effectiveType === 'slow-2g' || effectiveType === '2g' || downlink < 1,
          isFastConnection: effectiveType === '4g' && downlink > 2
        });
      }
    };

    updateNetworkInfo();

    // @ts-ignore
    const connection = navigator.connection;
    if (connection) {
      connection.addEventListener('change', updateNetworkInfo);
      return () => connection.removeEventListener('change', updateNetworkInfo);
    }
  }, []);

  return networkInfo;
};