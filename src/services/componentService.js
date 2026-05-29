const db = require('../config/db');

/**
 * 部件入库 — 录入新部件实例
 * 自动验证：部件编号不重复、部件型号存在
 */
async function addComponent({ component_sn, model_id, batch_number, production_date, notes }) {
  // 1. 检查部件型号是否存在
  const [models] = await db.query(
    'SELECT id FROM ComponentModel WHERE id = ?', [model_id]
  );
  if (models.length === 0) {
    throw new Error('部件型号不存在');
  }

  // 2. 检查部件编号是否重复（利用 UNIQUE 约束双重保险）
  const [existing] = await db.query(
    'SELECT id FROM Component WHERE component_sn = ?', [component_sn]
  );
  if (existing.length > 0) {
    throw new Error(`部件编号 "${component_sn}" 已存在，请勿重复录入`);
  }

  // 3. 插入新部件
  const [result] = await db.query(
    `INSERT INTO Component (component_sn, model_id, batch_number, production_date, status, cumulative_hours, notes)
     VALUES (?, ?, ?, ?, 'available', 0, ?)`,
    [component_sn, model_id, batch_number, production_date, notes || null]
  );

  return {
    id: result.insertId,
    component_sn,
    model_id,
    batch_number,
    production_date,
    status: 'available',
    cumulative_hours: 0
  };
}

/**
 * 列出所有部件（含型号信息）
 */
async function listComponents(statusFilter = null) {
  let sql = `
    SELECT c.id, c.component_sn, cm.model_name, cm.category,
           c.batch_number, c.production_date, c.status, c.cumulative_hours, c.notes
    FROM Component c
    JOIN ComponentModel cm ON c.model_id = cm.id
  `;
  const params = [];

  if (statusFilter) {
    sql += ' WHERE c.status = ?';
    params.push(statusFilter);
  }

  sql += ' ORDER BY c.id';
  const [rows] = await db.query(sql, params);
  return rows;
}

/**
 * 查询单个部件详情
 */
async function getComponentById(id) {
  const [rows] = await db.query(
    `SELECT c.*, cm.model_name, cm.category, cm.design_life_hours
     FROM Component c
     JOIN ComponentModel cm ON c.model_id = cm.id
     WHERE c.id = ?`, [id]
  );
  return rows[0] || null;
}

/**
 * 获取所有部件型号（供下拉列表使用）
 */
async function listModels() {
  const [rows] = await db.query(
    'SELECT id, model_name, category FROM ComponentModel ORDER BY id'
  );
  return rows;
}

module.exports = {
  addComponent,
  listComponents,
  getComponentById,
  listModels
};
