"use client";

import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export default function QRCompactPage() {
  const [qrCodeUrl, setQrCodeUrl] = useState<string>('');

  useEffect(() => {
    // Generate QR code for vibecarding.com
    QRCode.toDataURL('https://vibecarding.com', {
      width: 250,
      margin: 1,
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
    <div className="min-h-screen bg-white p-6 flex items-center justify-center">
      <div className="text-center max-w-md">
        {/* Logo/Title with Dinosaur */}
        <div className="flex items-center justify-center gap-3 mb-4">
          <img 
            src="/dino-card.jpg" 
            alt="VibeCarding Mascot" 
            className="w-20 h-20 object-contain"
          />
          <h1 className="text-3xl font-bold text-gray-900">VibeCarding</h1>
        </div>
        
        {/* QR Code */}
        {qrCodeUrl && (
          <div className="flex justify-center mb-4">
            <div className="border-4 border-gray-900 p-3 bg-white inline-block">
              <img src={qrCodeUrl} alt="VibeCarding QR Code" className="w-48 h-48" />
            </div>
          </div>
        )}
        
        {/* URL */}
        <p className="text-xl font-semibold mb-4">vibecarding.com</p>
        
        {/* Brief Description */}
        <div className="space-y-3 text-left">
          <p className="text-lg font-semibold text-gray-900">Create AI-Powered Greeting Cards in Minutes!</p>
          
          <div className="text-base text-gray-700 space-y-2">
            <p>✨ Choose from Birthday, Thank You, Anniversary & more</p>
            <p>🎨 Pick your style: Funny, Heartfelt, Professional</p>
            <p>📸 Add photos to personalize your card</p>
            <p>🎯 Get 5 unique AI-generated designs</p>
            <p>🖨️ Print-ready 10×7 inch professional cards</p>
            <p>📧 Delivered to your email as PDF</p>
          </div>
          
          <div className="pt-3 border-t">
            <p className="text-sm text-gray-600 italic">
              Scan the QR code or visit vibecarding.com to start creating your personalized greeting card!
            </p>
          </div>
        </div>
      </div>

      {/* Print button */}
      <div className="fixed bottom-4 right-4 print:hidden">
        <button
          onClick={() => window.print()}
          className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-6 rounded-lg shadow-lg"
        >
          Print
        </button>
      </div>

      {/* Print styles */}
      <style jsx>{`
        @media print {
          @page {
            margin: 0.5in;
            size: 5in 7in; /* Half letter size for compact printing */
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