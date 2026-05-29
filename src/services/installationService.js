const db = require('../config/db');

/**
 * 部件安装 — 将可用部件安装到飞机指定位置
 * 应用层预检 + 数据库层触发器双重保障
 * 事务包裹：INSERT 安装记录 + UPDATE 部件状态，保证原子性
 */
async function installComponent({ component_id, aircraft_id, operator_id, position, install_reason }) {
  return db.withTransaction(async (conn) => {
    // 1. 预检：部件是否存在且可用
    const [components] = await conn.execute(
      "SELECT id, component_sn, status FROM Component WHERE id = ?", [component_id]
    );
    if (components.length === 0) {
      throw new Error('部件不存在');
    }
    const comp = components[0];

    if (comp.status === 'retired') {
      throw new Error(`部件 ${comp.component_sn} 已退役，不可安装`);
    }
    if (comp.status === 'under_maintenance') {
      throw new Error(`部件 ${comp.component_sn} 正在维修中，不可安装`);
    }

    // 2. 预检：是否已有活跃安装
    const [active] = await conn.execute(
      'SELECT id FROM InstallationRecord WHERE component_id = ? AND removed_at IS NULL',
      [component_id]
    );
    if (active.length > 0) {
      throw new Error(`部件 ${comp.component_sn} 当前已安装在其它位置，请先拆卸`);
    }

    // 3. 检查飞机是否存在
    const [aircraft] = await conn.execute(
      'SELECT id FROM Aircraft WHERE id = ?', [aircraft_id]
    );
    if (aircraft.length === 0) {
      throw new Error('飞机不存在');
    }

    // 4. 检查操作人员是否存在
    const [operators] = await conn.execute(
      'SELECT id FROM Operator WHERE id = ?', [operator_id]
    );
    if (operators.length === 0) {
      throw new Error('操作人员不存在');
    }

    // 5. 插入安装记录（数据库触发器会做最终校验）
    const [result] = await conn.execute(
      `INSERT INTO InstallationRecord (component_id, aircraft_id, operator_id, installed_at, position, install_reason)
       VALUES (?, ?, ?, NOW(), ?, ?)`,
      [component_id, aircraft_id, operator_id, position, install_reason]
    );

    // 6. 更新部件状态为 installed
    await conn.execute(
      "UPDATE Component SET status = 'installed' WHERE id = ?",
      [component_id]
    );

    return { id: result.insertId, component_id, aircraft_id, position, installed_at: new Date() };
  });
}

/**
 * 部件拆卸 — 关闭活跃安装记录，保留历史
 * 事务包裹：UPDATE 安装记录 + UPDATE 部件状态，保证原子性
 */
async function uninstallComponent({ component_id, operator_id, removal_reason }) {
  return db.withTransaction(async (conn) => {
    // 1. 查找活跃安装记录
    const [active] = await conn.execute(
      `SELECT ir.id, ir.component_id, ir.aircraft_id, c.component_sn
       FROM InstallationRecord ir
       JOIN Component c ON ir.component_id = c.id
       WHERE ir.component_id = ? AND ir.removed_at IS NULL`,
      [component_id]
    );
    if (active.length === 0) {
      throw new Error('该部件当前没有活跃安装记录，无需拆卸');
    }

    const record = active[0];

    // 2. 关闭安装记录（设 removed_at）
    await conn.execute(
      `UPDATE InstallationRecord
       SET removed_at = NOW(), removal_reason = ?
       WHERE id = ?`,
      [removal_reason || null, record.id]
    );

    // 3. 更新部件状态为 available
    await conn.execute(
      "UPDATE Component SET status = 'available' WHERE id = ?",
      [component_id]
    );

    return {
      installation_id: record.id,
      component_id,
      aircraft_id: record.aircraft_id,
      component_sn: record.component_sn,
      removed_at: new Date()
    };
  });
}

/**
 * 部件更换（事务场景一）
 * 在一个事务中完成：关旧→验新→装新→更新状态
 * 任一步失败则全部回滚
 */
async function swapComponent({
  old_component_id,
  new_component_id,
  aircraft_id,
  operator_id,
  position,
  install_reason,
  removal_reason
}) {
  return db.withTransaction(async (conn) => {
    // --- 步骤 0：基本校验 ---
    if (old_component_id === new_component_id) {
      throw new Error('新旧部件相同，更换操作无意义');
    }

    // 校验飞机存在
    const [aircraftCheck] = await conn.execute(
      'SELECT id FROM Aircraft WHERE id = ?', [aircraft_id]
    );
    if (aircraftCheck.length === 0) {
      throw new Error('目标飞机不存在');
    }

    // 校验操作人员存在
    const [operatorCheck] = await conn.execute(
      'SELECT id FROM Operator WHERE id = ?', [operator_id]
    );
    if (operatorCheck.length === 0) {
      throw new Error('操作人员不存在');
    }

    // --- 步骤 1：关闭旧部件安装记录 ---
    const [oldActive] = await conn.execute(
      'SELECT id, component_id FROM InstallationRecord WHERE component_id = ? AND removed_at IS NULL',
      [old_component_id]
    );
    if (oldActive.length === 0) {
      throw new Error('旧部件当前没有活跃安装记录，无法执行更换');
    }

    await conn.execute(
      'UPDATE InstallationRecord SET removed_at = NOW(), removal_reason = ? WHERE id = ?',
      [removal_reason || '部件更换拆卸', oldActive[0].id]
    );

    // 更新旧部件状态
    await conn.execute(
      "UPDATE Component SET status = 'available' WHERE id = ?",
      [old_component_id]
    );

    // --- 步骤 2：检查新部件可用性 ---
    const [newComps] = await conn.execute(
      "SELECT id, component_sn, status FROM Component WHERE id = ?",
      [new_component_id]
    );
    if (newComps.length === 0) {
      throw new Error('新部件不存在');
    }
    if (newComps[0].status === 'retired') {
      throw new Error('新部件已退役，不可安装');
    }
    if (newComps[0].status === 'under_maintenance') {
      throw new Error('新部件正在维修中，不可安装');
    }

    // 检查新部件是否已有活跃安装
    const [newActive] = await conn.execute(
      'SELECT id FROM InstallationRecord WHERE component_id = ? AND removed_at IS NULL',
      [new_component_id]
    );
    if (newActive.length > 0) {
      throw new Error('新部件当前已安装在其它位置，请先拆卸');
    }

    // --- 步骤 3：插入新部件安装记录 ---
    const [insertResult] = await conn.execute(
      `INSERT INTO InstallationRecord (component_id, aircraft_id, operator_id, installed_at, position, install_reason)
       VALUES (?, ?, ?, NOW(), ?, ?)`,
      [new_component_id, aircraft_id, operator_id, position, install_reason]
    );

    // --- 步骤 4：更新新部件状态 ---
    await conn.execute(
      "UPDATE Component SET status = 'installed' WHERE id = ?",
      [new_component_id]
    );

    return {
      old_installation_id: oldActive[0].id,
      new_installation_id: insertResult.insertId,
      old_component_id,
      new_component_id,
      aircraft_id
    };
  });
}

/**
 * 列出所有安装记录（含部件和飞机信息）
 */
async function listInstallations(activeOnly = false) {
  let sql = `
    SELECT ir.id, ir.component_id, c.component_sn, cm.model_name,
           ir.aircraft_id, a.aircraft_sn AS aircraft_sn_val, a.model AS aircraft_model,
           ir.position, ir.installed_at, ir.removed_at,
           ir.install_reason, ir.removal_reason,
           op.name AS operator_name
    FROM InstallationRecord ir
    JOIN Component c ON ir.component_id = c.id
    JOIN ComponentModel cm ON c.model_id = cm.id
    JOIN Aircraft a ON ir.aircraft_id = a.id
    LEFT JOIN Operator op ON ir.operator_id = op.id
  `;

  if (activeOnly) {
    sql += ' WHERE ir.removed_at IS NULL';
  }

  sql += ' ORDER BY ir.installed_at DESC';

  const [rows] = await db.query(sql);
  return rows;
}

/**
 * 获取某部件的安装历史
 */
async function getComponentInstallHistory(component_id) {
  const [rows] = await db.query(
    `SELECT ir.*, a.aircraft_sn, a.model AS aircraft_model, op.name AS operator_name
     FROM InstallationRecord ir
     JOIN Aircraft a ON ir.aircraft_id = a.id
     LEFT JOIN Operator op ON ir.operator_id = op.id
     WHERE ir.component_id = ?
     ORDER BY ir.installed_at DESC`,
    [component_id]
  );
  return rows;
}

module.exports = {
  installComponent,
  uninstallComponent,
  swapComponent,
  listInstallations,
  getComponentInstallHistory
};
