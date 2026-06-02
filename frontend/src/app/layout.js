import './globals.css';
import Navbar from '@/components/Navbar';
import { PortfolioProvider } from '@/context/PortfolioContext';

export const metadata = {
  title: 'EarningsSentiment',
  description: 'CEO confidence scoring from earnings calls — correlated against stock returns',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-900 text-slate-100 antialiased">
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
