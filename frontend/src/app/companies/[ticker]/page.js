import { TICKER_LIST } from '@/lib/demoData';
import CompanyPage from './CompanyPage';

export function generateStaticParams() {
  return TICKER_LIST.map(ticker => ({ ticker }));
}

export default async function Page({ params }) {
  const { ticker } = await params;
  return <CompanyPage ticker={ticker} />;
}
