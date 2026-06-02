const express = require('express');
const router = express.Router();
const db = require('../config/db');

// 飞机列表 — 展示每架飞机及其在位部件
router.get('/', async (req, res) => {
  try {
    // 获取所有飞机
    const [aircraft] = await db.query(
      "SELECT id, aircraft_sn, model, status FROM Aircraft ORDER BY id"
    );

    // 获取每架飞机的在位部件
    const aircraftWithParts = await Promise.all(aircraft.map(async (a) => {
      const [parts] = await db.query(
        `SELECT c.id, c.component_sn, cm.model_name, cm.category,
                ir.installed_at, ir.position
         FROM InstallationRecord ir
         JOIN Component c ON ir.component_id = c.id
         JOIN ComponentModel cm ON c.model_id = cm.id
         WHERE ir.aircraft_id = ? AND ir.removed_at IS NULL
         ORDER BY c.component_sn`,
        [a.id]
      );
      return { ...a, parts };
    }));

    res.render('aircraft/list', { aircraft: aircraftWithParts, error: null, success: null });
  } catch (err) {
    res.render('aircraft/list', { aircraft: [], error: err.message, success: null });
  }
});

module.exports = router;
