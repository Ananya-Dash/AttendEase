const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const routes = require('./routes');
const { notFound, errorHandler } = require('./middleware/errorHandler');

const app = express();
const origins = (process.env.FRONTEND_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);

app.use(helmet());
app.use(cors({
  origin: (origin, cb) => (!origin || origins.includes(origin)) ? cb(null, true) : cb(new Error('Origin not allowed')),
  allowedHeaders: ['Authorization', 'Content-Type'],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']
}));
app.use(express.json({ limit: '100kb' }));
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api', routes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
