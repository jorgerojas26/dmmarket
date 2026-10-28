import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import App from './App';
import 'bootstrap/dist/css/bootstrap.min.css';
import { ReportSettingsProvider } from 'context/report_settings';
import { ShowNoesProvider } from 'context/show_noe';
import { SidebarProvider } from 'context/sidebar';
import { SWRConfig } from 'hooks/swr-wrapper';
import { BrowserRouter } from 'react-router-dom';
import { fetcher, swrConfig } from 'swr-config';
import { CurrencyRateProvider } from './context/currency_rate';

ReactDOM.render(
    <React.StrictMode>
        <SWRConfig value={{ ...swrConfig, fetcher }}>
            <BrowserRouter>
                <CurrencyRateProvider>
                    <ShowNoesProvider>
                        <SidebarProvider>
                            <ReportSettingsProvider>
                                <App />
                            </ReportSettingsProvider>
                        </SidebarProvider>
                    </ShowNoesProvider>
                </CurrencyRateProvider>
            </BrowserRouter>
        </SWRConfig>
    </React.StrictMode>,
    document.getElementById('root'),
);
