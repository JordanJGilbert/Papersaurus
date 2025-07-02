import { useEffect } from 'react';
import { useCardCache } from '../hooks/useCardCache';

/**
 * Component that starts preloading cards as early as possible
 * This runs before the main page even finishes loading
 */
const EarlyCardPreloader = () => {
  const { preloadAllCards } = useCardCache();

  useEffect(() => {
    // Start preloading immediately when this component mounts
    // This happens very early in the page lifecycle
    const startPreload = async () => {
      try {
        await preloadAllCards();
      } catch (error) {
        console.warn('Early preload failed:', error);
      }
    };

    // Start immediately, don't wait
    startPreload();
  }, [preloadAllCards]);

  return null; // This component doesn't render anything
};

export default EarlyCardPreloader;