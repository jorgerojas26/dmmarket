import React from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import 'bootstrap/dist/css/bootstrap.min.css';
import AuthRoot from './auth/root';
import { installAuthTransport } from './auth/transport';

installAuthTransport();
ReactDOM.render(
    <React.StrictMode>
        <AuthRoot />
    </React.StrictMode>,
    document.getElementById('root'),
);
