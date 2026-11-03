const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = (app) => {
    const target = process.env.DMMARKET_API_URL;
    if (!target) throw new Error('Falta DMMARKET_API_URL. Inicia el ambiente con bun run dev desde la raíz.');
    const backendHost = new URL(target).host;
    app.use('/api', (req, res, next) => {
        if (req.headers.host === backendHost) {
            return res.status(503).json({ message: 'Backend detenido. Inícialo desde su panel de desarrollo.' });
        }
        next();
    }, createProxyMiddleware({ target, changeOrigin: true }));
};
