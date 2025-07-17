"use client";

import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

export default function QRInstructionsPage() {
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
    <div className="min-h-screen bg-white p-8 max-w-3xl mx-auto">
      {/* Main container with print-friendly styling */}
      <div className="print:p-0">
        {/* Header with Dinosaur */}
        <div className="text-center mb-6">
          <div className="flex justify-center mb-4">
            <img 
              src="/dino-card.jpg" 
              alt="VibeCarding Mascot" 
              className="w-32 h-32 object-contain"
            />
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">VibeCarding</h1>
          <p className="text-lg text-gray-600">AI-Powered Greeting Card Creator</p>
        </div>

        {/* QR Code Section */}
        <div className="flex flex-col items-center mb-8">
          {qrCodeUrl && (
            <div className="border-4 border-gray-900 p-4 bg-white">
              <img src={qrCodeUrl} alt="VibeCarding QR Code" className="w-64 h-64" />
            </div>
          )}
          <p className="mt-4 text-lg font-semibold">Scan to visit vibecarding.com</p>
        </div>

        {/* Instructions */}
        <div className="space-y-6 text-gray-800">
          <section>
            <h2 className="text-2xl font-bold mb-3 text-gray-900">How to Create Your Card:</h2>
            <ol className="list-decimal list-inside space-y-3 text-lg">
              <li className="ml-4">
                <span className="font-semibold">Choose Your Card Type</span>
                <p className="ml-6 text-gray-600">Select from Birthday, Thank You, Anniversary, and more</p>
              </li>
              <li className="ml-4">
                <span className="font-semibold">Pick a Tone</span>
                <p className="ml-6 text-gray-600">Funny, Heartfelt, Professional, or Romantic</p>
              </li>
              <li className="ml-4">
                <span className="font-semibold">Add Personal Details (Optional)</span>
                <p className="ml-6 text-gray-600">Upload a photo, add names, or describe what makes them special</p>
              </li>
              <li className="ml-4">
                <span className="font-semibold">Enter Your Email</span>
                <p className="ml-6 text-gray-600">We'll send your finished card here</p>
              </li>
              <li className="ml-4">
                <span className="font-semibold">Choose Your Favorite Design</span>
                <p className="ml-6 text-gray-600">Pick from 5 AI-generated draft options</p>
              </li>
              <li className="ml-4">
                <span className="font-semibold">Generate & Print!</span>
                <p className="ml-6 text-gray-600">Your high-quality card will be ready in minutes</p>
              </li>
            </ol>
          </section>

          <section className="border-t pt-6">
            <h2 className="text-2xl font-bold mb-3 text-gray-900">Features:</h2>
            <ul className="list-disc list-inside space-y-2 text-lg">
              <li className="ml-4">AI-powered personalized messages</li>
              <li className="ml-4">Multiple artistic styles to choose from</li>
              <li className="ml-4">High-quality print-ready cards</li>
              <li className="ml-4">Upload photos to include loved ones</li>
              <li className="ml-4">Professional 10×7 inch format</li>
              <li className="ml-4">Email delivery with PDF attachment</li>
            </ul>
          </section>

          <section className="border-t pt-6">
            <h2 className="text-2xl font-bold mb-3 text-gray-900">Quick Tips:</h2>
            <ul className="list-disc list-inside space-y-2 text-lg">
              <li className="ml-4">The more details you provide, the more personalized your card</li>
              <li className="ml-4">Try different tones to see various creative styles</li>
              <li className="ml-4">Upload clear photos for best results</li>
              <li className="ml-4">Each draft shows a different artistic interpretation</li>
            </ul>
          </section>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-6 border-t text-center text-gray-600">
          <p className="text-lg">Create beautiful, personalized greeting cards in minutes!</p>
          <p className="text-xl font-bold mt-2 text-gray-900">vibecarding.com</p>
        </div>
      </div>

      {/* Print button */}
      <div className="mt-8 text-center print:hidden">
        <button
          onClick={() => window.print()}
          className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-8 rounded-lg text-lg shadow-lg"
        >
          Print This Page
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