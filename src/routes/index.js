const express = require('express');
const router = express.Router();
const db = require('../config/db');

// 首页：系统概览仪表盘
router.get('/', async (req, res) => {
  try {
    const [componentCount] = await db.query('SELECT COUNT(*) AS cnt FROM Component');
    const [aircraftCount] = await db.query('SELECT COUNT(*) AS cnt FROM Aircraft');
    const [activeInstall] = await db.query(
      'SELECT COUNT(*) AS cnt FROM InstallationRecord WHERE removed_at IS NULL'
    );
    const [maintenanceCount] = await db.query('SELECT COUNT(*) AS cnt FROM MaintenanceRecord');
    const [recentFlights] = await db.query(
      'SELECT fl.*, a.aircraft_sn FROM FlightLog fl JOIN Aircraft a ON fl.aircraft_id = a.id ORDER BY fl.takeoff_time DESC LIMIT 5'
    );

    res.render('index', {
      stats: {
        components: componentCount[0].cnt,
        aircraft: aircraftCount[0].cnt,
        activeInstalls: activeInstall[0].cnt,
        maintenances: maintenanceCount[0].cnt
      },
      recentFlights
    });
  } catch (err) {
    res.render('index', { stats: {}, recentFlights: [], error: err.message });
  }
});

module.exports = router;
