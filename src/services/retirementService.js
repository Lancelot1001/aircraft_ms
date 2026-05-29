const db = require('../config/db');

/**
 * 部件退役处理（事务场景二）
 * 检查安装状态 → (若已安装则关闭安装记录) → 写入退役记录 → 标记 retired
 * 任一步失败则全部回滚
 */
async function retireComponent({ component_id, operator_id, reason, approval_info, notes }) {
  return db.withTransaction(async (conn) => {
    // 1. 检查部件状态
    const [components] = await conn.execute(
      "SELECT id, component_sn, status FROM Component WHERE id = ?", [component_id]
    );
    if (components.length === 0) {
      throw new Error('部件不存在');
    }
    const comp = components[0];

    if (comp.status === 'retired') {
      throw new Error(`部件 ${comp.component_sn} 已经退役，不可重复执行退役操作`);
    }

    // 2. 校验退役原因
    const validReasons = ['寿命到期', '不可修复损坏', '技术淘汰', '其他'];
    if (!validReasons.includes(reason)) {
      throw new Error(`无效的退役原因: ${reason}`);
    }

    // 3. 校验操作人员
    const [operators] = await conn.execute(
      'SELECT id FROM Operator WHERE id = ?', [operator_id]
    );
    if (operators.length === 0) {
      throw new Error('操作人员不存在');
    }

    // 4. 若部件当前处于 installed 状态，先关闭安装记录
    if (comp.status === 'installed') {
      const [active] = await conn.execute(
        'SELECT id FROM InstallationRecord WHERE component_id = ? AND removed_at IS NULL',
        [component_id]
      );
      if (active.length > 0) {
        await conn.execute(
          `UPDATE InstallationRecord
           SET removed_at = NOW(), removal_reason = '部件退役拆卸'
           WHERE id = ?`,
          [active[0].id]
        );
      }
    }

    // 5. 写入退役记录
    const [result] = await conn.execute(
      `INSERT INTO ScrapOrRetirementRecord (component_id, operator_id, retired_at, reason, approval_info, notes)
       VALUES (?, ?, NOW(), ?, ?, ?)`,
      [component_id, operator_id, reason, approval_info, notes || null]
    );

    // 6. 标记部件为 retired
    await conn.execute(
      "UPDATE Component SET status = 'retired' WHERE id = ?",
      [component_id]
    );

    return {
      scrap_id: result.insertId,
      component_id,
      component_sn: comp.component_sn,
      reason,
      retired_at: new Date()
    };
  });
}

/**
 * 列出所有退役记录
 */
async function listRetirements() {
  const [rows] = await db.query(
    `SELECT srr.id, srr.component_id, c.component_sn, cm.model_name,
            srr.retired_at, srr.reason, srr.approval_info, srr.notes,
            op.name AS operator_name
     FROM ScrapOrRetirementRecord srr
     JOIN Component c ON srr.component_id = c.id
     JOIN ComponentModel cm ON c.model_id = cm.id
     LEFT JOIN Operator op ON srr.operator_id = op.id
     ORDER BY srr.retired_at DESC`
  );
  return rows;
}

/**
 * 获取退役原因分布
 */
async function getRetirementStats() {
  const [rows] = await db.query(
    `SELECT reason, COUNT(*) AS count
     FROM ScrapOrRetirementRecord
     GROUP BY reason
     ORDER BY count DESC`
  );
  return rows;
}

module.exports = {
  retireComponent,
  listRetirements,
  getRetirementStats
};
