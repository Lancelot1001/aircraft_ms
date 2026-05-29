const express = require('express');
const router = express.Router();
const db = require('../config/db');

// 首页：系统概览仪表盘
router.get('/', async (req, res) => {
  try {
    const [componentCount] = await db.query('SELECT COUNT(*) AS cnt FROM Component');
    const [aircraftCount] = await db.query('SELECT COUNT(*) AS cnt FROM Aircraft');
    const [activeInstall] = await db.query('SELECT COUNT(*) AS cnt FROM InstallationRecord WHERE removed_at IS NULL');
    const [maintenanceCount] = await db.query('SELECT COUNT(*) AS cnt FROM MaintenanceRecord');
    const [totalFlights] = await db.query('SELECT COUNT(*) AS cnt FROM FlightLog');

    // 部件状态分布
    const [statusDist] = await db.query(
      'SELECT status, COUNT(*) AS cnt FROM Component GROUP BY status ORDER BY FIELD(status, "installed","available","under_maintenance","retired")'
    );

    // 类别分布
    const [categoryDist] = await db.query(
      'SELECT cm.category, COUNT(*) AS cnt FROM Component c JOIN ComponentModel cm ON c.model_id = cm.id GROUP BY cm.category ORDER BY cnt DESC'
    );

    // 最近飞行
    const [recentFlights] = await db.query(
      'SELECT fl.*, a.aircraft_sn FROM FlightLog fl JOIN Aircraft a ON fl.aircraft_id = a.id ORDER BY fl.takeoff_time DESC LIMIT 8'
    );

    // 飞机安装概况
    const [aircraftOverview] = await db.query(
      `SELECT a.aircraft_sn, a.model, COUNT(DISTINCT ir.component_id) AS parts
       FROM Aircraft a
       LEFT JOIN InstallationRecord ir ON ir.aircraft_id = a.id AND ir.removed_at IS NULL
       GROUP BY a.id, a.aircraft_sn, a.model`
    );

    res.render('index', {
      stats: {
        components: componentCount[0].cnt,
        aircraft: aircraftCount[0].cnt,
        activeInstalls: activeInstall[0].cnt,
        maintenances: maintenanceCount[0].cnt,
        totalFlights: totalFlights[0].cnt
      },
      statusDist,
      categoryDist,
      recentFlights,
      aircraftOverview
    });
  } catch (err) {
    res.render('index', { stats: {}, statusDist: [], categoryDist: [], recentFlights: [], aircraftOverview: [], error: err.message });
  }
});

module.exports = router;
