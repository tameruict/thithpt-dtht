import { loadComposeData } from './actions';
import ComposeWorkspace from './ComposeWorkspace';

export const dynamic = 'force-dynamic';

export default async function ComposePage() {
  const data = await loadComposeData();
  return <ComposeWorkspace initialData={data} />;
}
