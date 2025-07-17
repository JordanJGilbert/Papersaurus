"use client";

import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export default function QRDinoPage() {
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');

  useEffect(() => {
    // Generate QR code for vibecarding.com
    QRCode.toDataURL('https://vibecarding.com', {
      width: 300,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      }
    })
    .then(url => {
      setQrCodeUrl(url);
    })
    .catch(err => {
      console.error('Error generating QR code:', err);
    });
  }, []);

  return (
    <div className="min-h-screen bg-white p-4">
      <div className="max-w-3xl mx-auto w-full">
        {/* Large Dinosaur Image */}
        <div className="flex justify-center mb-3">
          <img 
            src="/dino-card.jpg" 
            alt="VibeCarding Mascot" 
            className="w-64 h-64 object-contain"
          />
        </div>
        
        {/* Title */}
        <div className="text-center mb-4">
          <h1 className="text-4xl font-bold text-gray-900 mb-1">VibeCarding</h1>
          <p className="text-xl text-gray-600">Create personalized greeting cards with AI!</p>
        </div>
        
        {/* QR Code Box */}
        <div className="bg-gray-100 rounded-lg p-4 mb-4">
          <div className="flex flex-col items-center">
            {qrCodeUrl && (
              <div className="bg-white p-2 rounded-lg mb-3">
                <img src={qrCodeUrl} alt="VibeCarding QR Code" className="w-48 h-48" />
              </div>
            )}
            
            <div className="text-center">
              <p className="text-xl font-bold mb-1 text-gray-700">Scan or Visit:</p>
              <p className="text-2xl font-mono text-blue-600 font-bold">vibecarding.com</p>
            </div>
          </div>
        </div>
        
        {/* Features Box - Centered */}
        <div className="bg-gray-100 rounded-lg p-3">
          <p className="text-lg font-bold text-center mb-2 text-gray-800">✨ Create amazing cards in minutes!</p>
          <div className="grid grid-cols-2 gap-2 text-base max-w-lg mx-auto">
            <div className="flex items-center justify-center gap-1">
              <span className="text-lg">🎂</span>
              <span className="font-semibold text-gray-700">Birthday Cards</span>
            </div>
            <div className="flex items-center justify-center gap-1">
              <span className="text-lg">💝</span>
              <span className="font-semibold text-gray-700">Thank You Cards</span>
            </div>
            <div className="flex items-center justify-center gap-1">
              <span className="text-lg">💑</span>
              <span className="font-semibold text-gray-700">Anniversary Cards</span>
            </div>
            <div className="flex items-center justify-center gap-1">
              <span className="text-lg">🎉</span>
              <span className="font-semibold text-gray-700">& Many More!</span>
            </div>
          </div>
        </div>
      </div>

      {/* Print button */}
      <div className="fixed bottom-4 right-4 print:hidden">
        <button
          onClick={() => window.print()}
          className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-6 rounded-lg shadow-lg"
        >
          Print
        </button>
      </div>

      {/* Print styles */}
      <style jsx>{`
        @media print {
          @page {
            margin: 0.5in;
          }
          body {
            print-color-adjust: exact;
            -webkit-print-color-adjust: exact;
          }
        }
      `}</style>
    </div>
  );
}