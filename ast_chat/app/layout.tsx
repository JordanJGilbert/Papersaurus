import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import MobileDebugPanel from "@/components/MobileDebugPanel";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "VibeCarding - Create Beautiful Greeting Cards",
  description: "Create personalized, beautiful greeting cards for any occasion. Design custom birthday cards, thank you cards, anniversary cards and more with VibeCarding.",
  keywords: "greeting cards, birthday cards, thank you cards, anniversary cards, custom cards, personalized cards, card maker, card designer",
  authors: [{ name: "VibeCarding" }],
  openGraph: {
    title: "VibeCarding - Create Beautiful Greeting Cards",
    description: "Create personalized, beautiful greeting cards for any occasion. Design custom birthday cards, thank you cards, anniversary cards and more with VibeCarding.",
    url: "https://vibecarding.com",
    siteName: "VibeCarding",
    type: "website",
    images: [
      {
        url: "https://vibecarding.com/og-image.png", // You'll need to add this image
        width: 1200,
        height: 630,
        alt: "VibeCarding - Create Beautiful Greeting Cards",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "VibeCarding - Create Beautiful Greeting Cards",
    description: "Create personalized, beautiful greeting cards for any occasion. Design custom birthday cards, thank you cards, anniversary cards and more with VibeCarding.",
    images: ["https://vibecarding.com/og-image.png"], // You'll need to add this image
    creator: "@vibecarding",
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: "data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>💌</text></svg>",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link 
          href="https://fonts.googleapis.com/css2?family=Caveat:wght@400;500;600;700&family=Patrick+Hand&family=Kalam:wght@300;400;700&family=Architects+Daughter&family=Indie+Flower&family=Permanent+Marker&display=swap" 
          rel="stylesheet" 
        />
      </head>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster />
          <MobileDebugPanel />
        </ThemeProvider>
      </body>
    </html>
  );
} 