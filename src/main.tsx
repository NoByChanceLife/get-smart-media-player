import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { initializeProviderTransport } from './services/providerTransport';

void initializeProviderTransport().finally(() => {
  createRoot(document.getElementById('root')!).render(<App />);
});
