import React from 'react';

interface HandwrittenMessageOverlayProps {
  message: string;
  style?: 'caveat' | 'patrick' | 'kalam' | 'architect' | 'indie' | 'marker';
  inkColor?: 'blue' | 'black' | 'dark-blue';
  fontSize?: 'small' | 'medium' | 'large';
}

export default function HandwrittenMessageOverlay({
  message,
  style = 'caveat',
  inkColor = 'blue',
  fontSize = 'medium'
}: HandwrittenMessageOverlayProps) {
  // Font family mapping
  const fontFamilies = {
    caveat: "'Caveat', cursive",
    patrick: "'Patrick Hand', cursive",
    kalam: "'Kalam', cursive",
    architect: "'Architects Daughter', cursive",
    indie: "'Indie Flower', cursive",
    marker: "'Permanent Marker', cursive"
  };

  // Color mapping
  const inkColors = {
    blue: '#1a237e',
    'dark-blue': '#0d47a1',
    black: '#1a1a1a'
  };

  // Font size mapping
  const fontSizes = {
    small: { size: '24px', lineHeight: '1.6' },
    medium: { size: '28px', lineHeight: '1.5' },
    large: { size: '32px', lineHeight: '1.4' }
  };

  const selectedFont = fontFamilies[style];
  const selectedColor = inkColors[inkColor];
  const selectedSize = fontSizes[fontSize];

  // Calculate slight rotation for natural handwriting effect
  const rotation = style === 'caveat' ? -1 : style === 'architect' ? 0.5 : -0.3;

  return (
    <div 
      className="absolute inset-0 flex items-center justify-center p-8 pointer-events-none"
      style={{
        transform: `rotate(${rotation}deg)`,
      }}
    >
      <div 
        className="text-center max-w-full"
        style={{
          fontFamily: selectedFont,
          fontSize: selectedSize.size,
          lineHeight: selectedSize.lineHeight,
          color: selectedColor,
          opacity: 0.9,
          letterSpacing: '0.02em',
          wordSpacing: '0.1em',
          textShadow: inkColor === 'black' ? '0.5px 0.5px 0 rgba(0,0,0,0.2)' : '0.5px 0.5px 0 rgba(26,35,126,0.2)',
          // Make text slightly bolder for pen effect
          fontWeight: style === 'marker' ? 700 : 500,
          // Add slight blur for realistic ink effect
          filter: 'contrast(1.1)',
          // Feature settings for better handwriting appearance
          fontFeatureSettings: "'liga' on, 'calt' on",
        }}
      >
        {message.split('\n').map((line, index) => (
          <div key={index}>{line}</div>
        ))}
      </div>
    </div>
  );
}