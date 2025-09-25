"use client";

import React, { Suspense } from "react";
import dynamic from "next/dynamic";
import { LoaderCircle } from "lucide-react";

const SinglePageCardCreator = dynamic(() => import("@/components/SinglePageCardCreator"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center min-h-screen">
      <LoaderCircle className="w-8 h-8 animate-spin text-purple-600" />
    </div>
  ),
});

export default function HomePage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <LoaderCircle className="w-8 h-8 animate-spin text-purple-600" />
      </div>
    }>
      <SinglePageCardCreator />
    </Suspense>
  );
}