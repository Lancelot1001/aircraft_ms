const express = require('express');
const router = express.Router();
const installationService = require('../services/installationService');
const componentService = require('../services/componentService');
const db = require('../config/db');

// 安装记录列表
router.get('/', async (req, res) => {
  try {
    const onlyActive = req.query.active === '1';
    const installations = await installationService.listInstallations(onlyActive);
    res.render('installation/list', { installations, onlyActive, error: null, success: null });
  } catch (err) {
    res.render('installation/list', { installations: [], onlyActive: false, error: err.message, success: null });
  }
});

// 安装表单页面
router.get('/install', async (req, res) => {
  try {
    const components = await componentService.listComponents('available');
    const [aircraft] = await db.query(
      "SELECT id, aircraft_sn, model FROM Aircraft WHERE status = 'active' ORDER BY id"
    );
    const [operators] = await db.query(
      'SELECT id, name, role FROM Operator ORDER BY id'
    );
    res.render('installation/install', {
      components, aircraft, operators,
      error: null, success: null,
      form: {}
    });
  } catch (err) {
    res.render('installation/install', {
      components: [], aircraft: [], operators: [],
      error: err.message, success: null,
      form: {}
    });
  }
});

// 处理安装
router.post('/install', async (req, res) => {
  try {
    const { component_id, aircraft_id, operator_id, position, install_reason } = req.body;
    const result = await installationService.installComponent({
      component_id: parseInt(component_id),
      aircraft_id: parseInt(aircraft_id),
      operator_id: parseInt(operator_id),
      position,
      install_reason
    });

    const components = await componentService.listComponents('available');
    const [aircraft] = await db.query(
      "SELECT id, aircraft_sn, model FROM Aircraft WHERE status = 'active' ORDER BY id"
    );
    const [operators] = await db.query(
      'SELECT id, name, role FROM Operator ORDER BY id'
    );

    res.render('installation/install', {
      components, aircraft, operators,
      error: null,
      success: `安装成功！安装记录 ID: ${result.id}`,
      form: {}
    });
  } catch (err) {
    const components = await componentService.listComponents('available');
    const [aircraft] = await db.query(
      "SELECT id, aircraft_sn, model FROM Aircraft WHERE status = 'active' ORDER BY id"
    );
    const [operators] = await db.query(
      'SELECT id, name, role FROM Operator ORDER BY id'
    );
    res.render('installation/install', {
      components, aircraft, operators,
      error: err.message,
      success: null,
      form: req.body
    });
  }
});

// 拆卸表单页面
router.get('/uninstall', async (req, res) => {
  try {
    const [installed] = await db.query(
      `SELECT c.id, c.component_sn, cm.model_name, a.aircraft_sn, ir.position, ir.installed_at
       FROM Component c
       JOIN ComponentModel cm ON c.model_id = cm.id
       JOIN InstallationRecord ir ON c.id = ir.component_id
       JOIN Aircraft a ON ir.aircraft_id = a.id
       WHERE ir.removed_at IS NULL AND c.status = 'installed'
       ORDER BY c.id`
    );
    const [operators] = await db.query(
      'SELECT id, name, role FROM Operator ORDER BY id'
    );
    res.render('installation/uninstall', {
      installed, operators, error: null, success: null
    });
  } catch (err) {
    res.render('installation/uninstall', {
      installed: [], operators: [], error: err.message, success: null
    });
  }
});

// 处理拆卸
router.post('/uninstall', async (req, res) => {
  try {
    const { component_id, operator_id, removal_reason } = req.body;
    const result = await installationService.uninstallComponent({
      component_id: parseInt(component_id),
      operator_id: parseInt(operator_id),
      removal_reason
    });

    const [installed] = await db.query(
      `SELECT c.id, c.component_sn, cm.model_name, a.aircraft_sn, ir.position, ir.installed_at
       FROM Component c
       JOIN ComponentModel cm ON c.model_id = cm.id
       JOIN InstallationRecord ir ON c.id = ir.component_id
       JOIN Aircraft a ON ir.aircraft_id = a.id
       WHERE ir.removed_at IS NULL AND c.status = 'installed'
       ORDER BY c.id`
    );
    const [operators] = await db.query(
      'SELECT id, name, role FROM Operator ORDER BY id'
    );
    res.render('installation/uninstall', {
      installed, operators,
      error: null,
      success: `部件 ${result.component_sn} 拆卸成功`
    });
  } catch (err) {
    const [installed] = await db.query(
      `SELECT c.id, c.component_sn, cm.model_name, a.aircraft_sn, ir.position, ir.installed_at
       FROM Component c
       JOIN ComponentModel cm ON c.model_id = cm.id
       JOIN InstallationRecord ir ON c.id = ir.component_id
       JOIN Aircraft a ON ir.aircraft_id = a.id
       WHERE ir.removed_at IS NULL AND c.status = 'installed'
       ORDER BY c.id`
    );
    const [operators] = await db.query(
      'SELECT id, name, role FROM Operator ORDER BY id'
    );
    res.render('installation/uninstall', {
      installed, operators, error: err.message, success: null
    });
  }
});

// 更换表单页面
router.get('/swap', async (req, res) => {
  try {
    const [installed] = await db.query(
      `SELECT c.id, c.component_sn, cm.model_name, a.aircraft_sn, ir.position, ir.installed_at
       FROM Component c
       JOIN ComponentModel cm ON c.model_id = cm.id
       JOIN InstallationRecord ir ON c.id = ir.component_id
       JOIN Aircraft a ON ir.aircraft_id = a.id
       WHERE ir.removed_at IS NULL AND c.status = 'installed'
       ORDER BY c.id`
    );
    const available = await componentService.listComponents('available');
    const [operators] = await db.query(
      'SELECT id, name, role FROM Operator ORDER BY id'
    );
    const [aircraft] = await db.query(
      "SELECT id, aircraft_sn, model FROM Aircraft WHERE status = 'active' ORDER BY id"
    );
    res.render('installation/swap', {
      installed, available, operators, aircraft, error: null, success: null
    });
  } catch (err) {
    res.render('installation/swap', {
      installed: [], available: [], operators: [], aircraft: [],
      error: err.message, success: null
    });
  }
});

// 处理更换（事务场景一）
router.post('/swap', async (req, res) => {
  try {
    const { old_component_id, new_component_id, aircraft_id, operator_id, position, install_reason, removal_reason } = req.body;

    // 路由层快速校验：新旧部件不能相同
    if (old_component_id === new_component_id) {
      throw new Error('新旧部件不能相同，更换操作无意义');
    }

    const result = await installationService.swapComponent({
      old_component_id: parseInt(old_component_id),
      new_component_id: parseInt(new_component_id),
      aircraft_id: parseInt(aircraft_id),
      operator_id: parseInt(operator_id),
      position,
      install_reason,
      removal_reason
    });

    const [installed] = await db.query(
      `SELECT c.id, c.component_sn, cm.model_name, a.aircraft_sn, ir.position, ir.installed_at
       FROM Component c
       JOIN ComponentModel cm ON c.model_id = cm.id
       JOIN InstallationRecord ir ON c.id = ir.component_id
       JOIN Aircraft a ON ir.aircraft_id = a.id
       WHERE ir.removed_at IS NULL AND c.status = 'installed'
       ORDER BY c.id`
    );
    const available = await componentService.listComponents('available');
    const [operators] = await db.query(
      'SELECT id, name, role FROM Operator ORDER BY id'
    );
    const [aircraft] = await db.query(
      "SELECT id, aircraft_sn, model FROM Aircraft WHERE status = 'active' ORDER BY id"
    );

    res.render('installation/swap', {
      installed, available, operators, aircraft,
      error: null,
      success: `更换成功！旧部件已拆卸，新部件已安装（新安装记录 ID: ${result.new_installation_id}）`
    });
  } catch (err) {
    const [installed] = await db.query(
      `SELECT c.id, c.component_sn, cm.model_name, a.aircraft_sn, ir.position, ir.installed_at
       FROM Component c
       JOIN ComponentModel cm ON c.model_id = cm.id
       JOIN InstallationRecord ir ON c.id = ir.component_id
       JOIN Aircraft a ON ir.aircraft_id = a.id
       WHERE ir.removed_at IS NULL AND c.status = 'installed'
       ORDER BY c.id`
    );
    const available = await componentService.listComponents('available');
    const [operators] = await db.query(
      'SELECT id, name, role FROM Operator ORDER BY id'
    );
    const [aircraft] = await db.query(
      "SELECT id, aircraft_sn, model FROM Aircraft WHERE status = 'active' ORDER BY id"
    );
    res.render('installation/swap', {
      installed, available, operators, aircraft,
      error: err.message, success: null
    });
  }
});

module.exports = router;
