const express = require('express');
const router = express.Router();
const maintenanceService = require('../services/maintenanceService');
const componentService = require('../services/componentService');
const db = require('../config/db');

// 维修记录列表
router.get('/', async (req, res) => {
  try {
    const filter = req.query.filter || null;
    const maintenances = await maintenanceService.listMaintenances(filter);
    res.render('maintenance/list', { maintenances, filter, error: null, success: null });
  } catch (err) {
    res.render('maintenance/list', { maintenances: [], filter: null, error: err.message, success: null });
  }
});

// 维修登记表单页
router.get('/create', async (req, res) => {
  try {
    // 可维修的部件：available 或 installed（宽松模式）
    const [components] = await db.query(
      "SELECT c.id, c.component_sn, cm.model_name, c.status FROM Component c JOIN ComponentModel cm ON c.model_id = cm.id WHERE c.status IN ('available', 'installed') ORDER BY c.id"
    );
    const [operators] = await db.query(
      'SELECT id, name, role FROM Operator ORDER BY id'
    );
    res.render('maintenance/create', { components, operators, error: null, success: null, form: {} });
  } catch (err) {
    res.render('maintenance/create', { components: [], operators: [], error: err.message, success: null, form: {} });
  }
});

// 处理维修登记
router.post('/create', async (req, res) => {
  try {
    const { component_id, operator_id, maintenance_type, started_at, notes } = req.body;
    const result = await maintenanceService.createMaintenance({
      component_id: parseInt(component_id),
      operator_id: parseInt(operator_id),
      maintenance_type,
      started_at: started_at || undefined,
      notes
    });

    const [components] = await db.query(
      "SELECT c.id, c.component_sn, cm.model_name, c.status FROM Component c JOIN ComponentModel cm ON c.model_id = cm.id WHERE c.status IN ('available', 'installed') ORDER BY c.id"
    );
    const [operators] = await db.query(
      'SELECT id, name, role FROM Operator ORDER BY id'
    );
    res.render('maintenance/create', {
      components, operators,
      error: null,
      success: `维修工单创建成功！工单 ID: ${result.id}，部件 ${result.component_sn} 状态已更新为维修中`,
      form: {}
    });
  } catch (err) {
    const [components] = await db.query(
      "SELECT c.id, c.component_sn, cm.model_name, c.status FROM Component c JOIN ComponentModel cm ON c.model_id = cm.id WHERE c.status IN ('available', 'installed') ORDER BY c.id"
    );
    const [operators] = await db.query(
      'SELECT id, name, role FROM Operator ORDER BY id'
    );
    res.render('maintenance/create', { components, operators, error: err.message, success: null, form: req.body });
  }
});

// 维修完成表单页
router.get('/:id/complete', async (req, res) => {
  try {
    const [records] = await db.query(
      `SELECT mr.*, c.component_sn, cm.model_name, op.name AS operator_name
       FROM MaintenanceRecord mr
       JOIN Component c ON mr.component_id = c.id
       JOIN ComponentModel cm ON c.model_id = cm.id
       LEFT JOIN Operator op ON mr.operator_id = op.id
       WHERE mr.id = ?`,
      [parseInt(req.params.id)]
    );
    if (records.length === 0) {
      throw new Error('维修工单不存在');
    }
    res.render('maintenance/complete', { record: records[0], error: null, success: null });
  } catch (err) {
    res.render('maintenance/complete', { record: null, error: err.message, success: null });
  }
});

// 处理维修完成（事务场景三）
router.post('/:id/complete', async (req, res) => {
  try {
    const { maintenance_result, notes } = req.body;
    const result = await maintenanceService.completeMaintenance({
      id: parseInt(req.params.id),
      maintenance_result,
      notes
    });

    const [records] = await db.query(
      `SELECT mr.*, c.component_sn, cm.model_name, op.name AS operator_name
       FROM MaintenanceRecord mr
       JOIN Component c ON mr.component_id = c.id
       JOIN ComponentModel cm ON c.model_id = cm.id
       LEFT JOIN Operator op ON mr.operator_id = op.id
       WHERE mr.id = ?`,
      [parseInt(req.params.id)]
    );
    res.render('maintenance/complete', {
      record: records[0],
      error: null,
      success: `维修完成！部件 ${result.component_sn} 状态已恢复为 available`
    });
  } catch (err) {
    res.render('maintenance/complete', { record: null, error: err.message, success: null });
  }
});

module.exports = router;
