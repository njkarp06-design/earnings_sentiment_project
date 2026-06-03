import './globals.css';
import { Inter, JetBrains_Mono } from 'next/font/google';
import Navbar from '@/components/Navbar';
import { PortfolioProvider } from '@/context/PortfolioContext';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
  weight: ['400', '500', '600'],
});

export const metadata = {
  title: 'EarningsSentiment',
  description: 'CEO confidence scoring from earnings calls — correlated against stock returns',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable}`}>
      <body className="min-h-screen bg-[#080d1a] text-slate-100 antialiased font-sans">
        <PortfolioProvider>
          <Navbar />
          <main className="max-w-6xl mx-auto px-4 py-8">
            {children}
          </main>
        </PortfolioProvider>
      </body>
    </html>
  );
}
