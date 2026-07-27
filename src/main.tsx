import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { HotelDataProvider } from './context/HotelContext.tsx';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HotelDataProvider>
      <App />
    </HotelDataProvider>
  </StrictMode>,
);
