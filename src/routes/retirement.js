const express = require('express');
const router = express.Router();
const retirementService = require('../services/retirementService');
const db = require('../config/db');

// 退役记录列表
router.get('/', async (req, res) => {
  try {
    const retirements = await retirementService.listRetirements();
    const stats = await retirementService.getRetirementStats();
    res.render('retirement/list', { retirements, stats, error: null, success: null });
  } catch (err) {
    res.render('retirement/list', { retirements: [], stats: [], error: err.message, success: null });
  }
});

// 退役处理表单页
router.get('/retire', async (req, res) => {
  try {
    // 所有非退役部件均可退役
    const [components] = await db.query(
      "SELECT c.id, c.component_sn, cm.model_name, c.status FROM Component c JOIN ComponentModel cm ON c.model_id = cm.id WHERE c.status != 'retired' ORDER BY c.id"
    );
    const [operators] = await db.query(
      "SELECT id, name, role FROM Operator WHERE role = 'approver' OR role = 'engineer' ORDER BY id"
    );
    res.render('retirement/retire', { components, operators, error: null, success: null, form: {} });
  } catch (err) {
    res.render('retirement/retire', { components: [], operators: [], error: err.message, success: null, form: {} });
  }
});

// 处理退役（事务场景二）
router.post('/retire', async (req, res) => {
  try {
    const { component_id, operator_id, reason, approval_info, notes } = req.body;
    const result = await retirementService.retireComponent({
      component_id: parseInt(component_id),
      operator_id: parseInt(operator_id),
      reason,
      approval_info,
      notes
    });

    const [components] = await db.query(
      "SELECT c.id, c.component_sn, cm.model_name, c.status FROM Component c JOIN ComponentModel cm ON c.model_id = cm.id WHERE c.status != 'retired' ORDER BY c.id"
    );
    const [operators] = await db.query(
      "SELECT id, name, role FROM Operator WHERE role = 'approver' OR role = 'engineer' ORDER BY id"
    );
    res.render('retirement/retire', {
      components, operators,
      error: null,
      success: `退役处理完成！部件 ${result.component_sn} 已标记为退役（退役 ID: ${result.scrap_id}）`,
      form: {}
    });
  } catch (err) {
    const [components] = await db.query(
      "SELECT c.id, c.component_sn, cm.model_name, c.status FROM Component c JOIN ComponentModel cm ON c.model_id = cm.id WHERE c.status != 'retired' ORDER BY c.id"
    );
    const [operators] = await db.query(
      "SELECT id, name, role FROM Operator WHERE role = 'approver' OR role = 'engineer' ORDER BY id"
    );
    res.render('retirement/retire', { components, operators, error: err.message, success: null, form: req.body });
  }
});

module.exports = router;
