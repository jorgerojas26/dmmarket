import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import App from './App';
import 'bootstrap/dist/css/bootstrap.min.css';
import { ShowNoesProvider } from 'context/show_noe';
import { BrowserRouter } from 'react-router-dom';
import { CurrencyRateProvider } from './context/currency_rate';
import { SWRConfig } from 'hooks/swr-wrapper';
import { swrConfig, fetcher } from 'swr-config';

ReactDOM.render(
    <React.StrictMode>
        <SWRConfig value={{ ...swrConfig, fetcher }}>
            <BrowserRouter>
                <CurrencyRateProvider>
                    <ShowNoesProvider>
                        <App />
                    </ShowNoesProvider>
                </CurrencyRateProvider>
            </BrowserRouter>
        </SWRConfig>
    </React.StrictMode>,
    document.getElementById('root'),
);
