const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const workOrderRoutes = require('./routes/workOrderRoutes');
const complexityRoutes = require('./routes/complexityRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const kbRoutes = require('./routes/kbRoutes');
const coderDashboardRoutes = require('./routes/coderDashboardRoutes');
const pmDashboardRoutes = require('./routes/pmDashboardRoutes');
const machineModelRoutes = require('./routes/machineModelRoutes');
const { errorHandler, notFound } = require('./middleware/errorHandler');

const app = express();

app.use(cors());
app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'API is running', data: { time: new Date().toISOString() } });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/work-orders', workOrderRoutes);
app.use('/api/complexity-levels', complexityRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/kb', kbRoutes);
app.use('/api/coder-dashboard', coderDashboardRoutes);
app.use('/api/pm-dashboard', pmDashboardRoutes);
app.use('/api/machine-models', machineModelRoutes);

// 404 + centralized error handling
app.use(notFound);
app.use(errorHandler);

module.exports = app;