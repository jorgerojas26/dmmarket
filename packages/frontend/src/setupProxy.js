const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = (app) => {
    const target = process.env.DMMARKET_API_URL;
    if (!target) throw new Error('Falta DMMARKET_API_URL. Inicia el ambiente con bun run dev desde la raíz.');
    app.use('/api', createProxyMiddleware({ target, changeOrigin: true }));
};
