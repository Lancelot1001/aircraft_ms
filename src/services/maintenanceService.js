const db = require('../config/db');

/**
 * 维修登记 — 为部件创建维修工单
 * 宽松模式：部件状态为 installed 或 available 均可送修
 * 事务包裹：若部件已安装则先关安装记录 → 创维修工单 → 更新状态
 * 数据库触发器会拒绝退役部件的维修
 */
async function createMaintenance({ component_id, operator_id, maintenance_type, started_at, notes }) {
  return db.withTransaction(async (conn) => {
    // 1. 校验部件存在且非退役
    const [components] = await conn.execute(
      "SELECT id, component_sn, status FROM Component WHERE id = ?", [component_id]
    );
    if (components.length === 0) {
      throw new Error('部件不存在');
    }
    const comp = components[0];

    if (comp.status === 'retired') {
      throw new Error(`部件 ${comp.component_sn} 已退役，不可创建维修记录`);
    }

    // 2. 校验维修类型
    const validTypes = ['routine', 'repair', 'overhaul', 'inspection'];
    if (!validTypes.includes(maintenance_type)) {
      throw new Error(`无效的维修类型: ${maintenance_type}，有效类型: ${validTypes.join(', ')}`);
    }

    // 3. 校验操作人员
    const [operators] = await conn.execute(
      'SELECT id FROM Operator WHERE id = ?', [operator_id]
    );
    if (operators.length === 0) {
      throw new Error('操作人员不存在');
    }

    // 4. 若部件当前处于 installed 状态，先关闭安装记录再送修
    if (comp.status === 'installed') {
      const [active] = await conn.execute(
        'SELECT id FROM InstallationRecord WHERE component_id = ? AND removed_at IS NULL',
        [component_id]
      );
      if (active.length > 0) {
        await conn.execute(
          `UPDATE InstallationRecord
           SET removed_at = NOW(), removal_reason = '送修拆卸'
           WHERE id = ?`,
          [active[0].id]
        );
      }
    }

    // 5. 创建维修工单（若未指定 started_at 则使用数据库 NOW()）
    const sql = started_at
      ? `INSERT INTO MaintenanceRecord (component_id, operator_id, maintenance_type, started_at, notes)
         VALUES (?, ?, ?, ?, ?)`
      : `INSERT INTO MaintenanceRecord (component_id, operator_id, maintenance_type, started_at, notes)
         VALUES (?, ?, ?, NOW(), ?)`;
    const params = started_at
      ? [component_id, operator_id, maintenance_type, started_at, notes || null]
      : [component_id, operator_id, maintenance_type, notes || null];

    const [result] = await conn.execute(sql, params);

    // 6. 更新部件状态为维修中
    await conn.execute(
      "UPDATE Component SET status = 'under_maintenance' WHERE id = ?",
      [component_id]
    );

    return {
      id: result.insertId,
      component_id,
      component_sn: comp.component_sn,
      maintenance_type,
      started_at: started_at || new Date()
    };
  });
}

/**
 * 维修完成（事务场景三）
 * 更新维修结果 → 更新结束时间 → 调整部件状态为 available
 * 任一步失败则全部回滚
 */
async function completeMaintenance({ id, maintenance_result, notes }) {
  return db.withTransaction(async (conn) => {
    // 1. 查找维修工单
    const [records] = await conn.execute(
      `SELECT mr.id, mr.component_id, mr.completed_at, c.component_sn
       FROM MaintenanceRecord mr
       JOIN Component c ON mr.component_id = c.id
       WHERE mr.id = ?`,
      [id]
    );
    if (records.length === 0) {
      throw new Error('维修工单不存在');
    }

    const record = records[0];
    if (record.completed_at) {
      throw new Error('该维修工单已完成，不可重复操作');
    }

    // 2. 校验维修结果
    const validResults = ['修复完成', '需更换', '报废', '待观察'];
    if (maintenance_result && !validResults.includes(maintenance_result)) {
      throw new Error(`无效的维修结论: ${maintenance_result}，有效结论: ${validResults.join(', ')}`);
    }

    // 3. 更新维修记录
    await conn.execute(
      `UPDATE MaintenanceRecord
       SET completed_at = NOW(), maintenance_result = ?, notes = IFNULL(?, notes)
       WHERE id = ?`,
      [maintenance_result, notes || null, id]
    );

    // 4. 根据维修结果更新部件状态
    //    修复完成 → available（可重新安装）
    //    需更换/报废/待观察 → available（等待后续处理）
    await conn.execute(
      "UPDATE Component SET status = 'available' WHERE id = ?",
      [record.component_id]
    );

    return {
      id,
      component_id: record.component_id,
      component_sn: record.component_sn,
      maintenance_result,
      completed_at: new Date()
    };
  });
}

/**
 * 列出所有维修记录
 */
async function listMaintenances(statusFilter = null) {
  let sql = `
    SELECT mr.id, mr.component_id, c.component_sn, cm.model_name,
           mr.maintenance_type, mr.started_at, mr.completed_at,
           mr.maintenance_result, mr.notes,
           op.name AS operator_name
    FROM MaintenanceRecord mr
    JOIN Component c ON mr.component_id = c.id
    JOIN ComponentModel cm ON c.model_id = cm.id
    LEFT JOIN Operator op ON mr.operator_id = op.id
  `;
  const params = [];

  if (statusFilter === 'active') {
    sql += ' WHERE mr.completed_at IS NULL';
  } else if (statusFilter === 'completed') {
    sql += ' WHERE mr.completed_at IS NOT NULL';
  }

  sql += ' ORDER BY mr.started_at DESC';

  const [rows] = await db.query(sql, params);
  return rows;
}

/**
 * 获取某部件的维修历史
 */
async function getComponentMaintenanceHistory(component_id) {
  const [rows] = await db.query(
    `SELECT mr.*, op.name AS operator_name
     FROM MaintenanceRecord mr
     LEFT JOIN Operator op ON mr.operator_id = op.id
     WHERE mr.component_id = ?
     ORDER BY mr.started_at DESC`,
    [component_id]
  );
  return rows;
}

module.exports = {
  createMaintenance,
  completeMaintenance,
  listMaintenances,
  getComponentMaintenanceHistory
};
