const express = require('express');
const path = require('path');
const app = express();

// 视图引擎
const expressLayouts = require('express-ejs-layouts');
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('layout', 'layout');
app.use(expressLayouts);

// 中间件
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// 路由
const indexRoutes = require('./routes/index');
const aircraftRoutes = require('./routes/aircraft');
const componentRoutes = require('./routes/component');
const installationRoutes = require('./routes/installation');
const maintenanceRoutes = require('./routes/maintenance');
const retirementRoutes = require('./routes/retirement');
const flightLogRoutes = require('./routes/flightLog');
const queryRoutes = require('./routes/query');

app.use('/', indexRoutes);
app.use('/aircraft', aircraftRoutes);
app.use('/components', componentRoutes);
app.use('/installations', installationRoutes);
app.use('/maintenance', maintenanceRoutes);
app.use('/retirements', retirementRoutes);
app.use('/flightlogs', flightLogRoutes);
app.use('/query', queryRoutes);

// 404
app.use((req, res) => {
  res.status(404).render('404', { url: req.originalUrl });
});

// 全局错误处理
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).render('error', {
    message: process.env.NODE_ENV === 'production'
      ? '服务器内部错误'
      : err.message
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`航空部件管理系统已启动: http://localhost:${PORT}`);
});

module.exports = app;
