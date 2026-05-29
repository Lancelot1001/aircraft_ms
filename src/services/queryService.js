const db = require('../config/db');

/**
 * 功能七：生命周期追溯 — 给定部件编号输出完整生命周期
 * 包含：基本属性、安装历史、维修记录、退役情况、当前状态
 */
async function getLifecycleTrace(componentIdOrSn) {
  const dbPool = db;

  // 确定是 ID 还是编号
  const isId = /^\d+$/.test(String(componentIdOrSn));
  const whereClause = isId ? 'c.id = ?' : 'c.component_sn = ?';

  // 1. 部件基本信息
  const [compRows] = await dbPool.query(
    `SELECT c.id, c.component_sn, cm.model_name, cm.category,
            c.batch_number, c.production_date, cm.design_life_hours,
            cm.maintenance_interval_hours, c.cumulative_hours, c.status, c.notes
     FROM Component c
     JOIN ComponentModel cm ON c.model_id = cm.id
     WHERE ${whereClause}`,
    [componentIdOrSn]
  );
  if (compRows.length === 0) return null;
  const component = compRows[0];

  // 2. 安装历史（含飞机信息）
  const [installHistory] = await dbPool.query(
    `SELECT ir.id, ir.installed_at, ir.removed_at, ir.position,
            ir.install_reason, ir.removal_reason,
            a.aircraft_sn, a.model AS aircraft_model,
            op.name AS operator_name
     FROM InstallationRecord ir
     JOIN Aircraft a ON ir.aircraft_id = a.id
     LEFT JOIN Operator op ON ir.operator_id = op.id
     WHERE ir.component_id = ?
     ORDER BY ir.installed_at ASC`,
    [component.id]
  );

  // 3. 维修记录
  const [maintenanceHistory] = await dbPool.query(
    `SELECT mr.id, mr.maintenance_type, mr.started_at, mr.completed_at,
            mr.maintenance_result, mr.notes,
            op.name AS operator_name
     FROM MaintenanceRecord mr
     LEFT JOIN Operator op ON mr.operator_id = op.id
     WHERE mr.component_id = ?
     ORDER BY mr.started_at ASC`,
    [component.id]
  );

  // 4. 退役记录
  const [retirement] = await dbPool.query(
    `SELECT srr.id, srr.retired_at, srr.reason, srr.approval_info, srr.notes,
            op.name AS operator_name
     FROM ScrapOrRetirementRecord srr
     LEFT JOIN Operator op ON srr.operator_id = op.id
     WHERE srr.component_id = ?
     LIMIT 1`,
    [component.id]
  );

  return {
    component,
    installHistory,
    maintenanceHistory,
    retirement: retirement[0] || null
  };
}

/**
 * 复杂查询一：某型号部件平均维修间隔（MTBM）
 * 统计各部件型号的两次维修之间的平均时间（天）
 */
async function getMTBMStats() {
  const [rows] = await db.query(
    `WITH maintenance_gaps AS (
       SELECT
         cm.model_name, cm.category,
         mr.component_id,
         DATEDIFF(
           LEAD(mr.started_at) OVER (PARTITION BY mr.component_id ORDER BY mr.started_at),
           mr.started_at
         ) AS gap_days
       FROM MaintenanceRecord mr
       JOIN Component c ON mr.component_id = c.id
       JOIN ComponentModel cm ON c.model_id = cm.id
     )
     SELECT model_name, category,
            ROUND(AVG(gap_days), 1) AS avg_mtbm_days,
            COUNT(*) AS sample_count
     FROM maintenance_gaps
     WHERE gap_days IS NOT NULL AND gap_days > 0
     GROUP BY model_name, category
     ORDER BY avg_mtbm_days DESC`
  );
  return rows;
}

/**
 * 复杂查询二：飞机部件更换频率排行
 * 统计各飞机上部件更换次数（更换 = 同一飞机上同一位置有新安装记录替换旧记录）
 */
async function getAircraftSwapRanking() {
  const [rows] = await db.query(
    `SELECT a.aircraft_sn, a.model AS aircraft_model,
            COUNT(DISTINCT ir.id) AS total_replacements,
            COUNT(DISTINCT ir.aircraft_id) AS unique_positions
     FROM InstallationRecord ir
     JOIN Aircraft a ON ir.aircraft_id = a.id
     WHERE ir.removal_reason LIKE '%更换%'
        OR ir.install_reason LIKE '%更换%'
     GROUP BY a.id, a.aircraft_sn, a.model
     ORDER BY total_replacements DESC`
  );
  return rows;
}

/**
 * 复杂查询三：退役原因分布统计
 */
async function getRetirementReasonStats() {
  const [rows] = await db.query(
    `SELECT reason, COUNT(*) AS count,
            ROUND(COUNT(*) * 100.0 / (SELECT COUNT(*) FROM ScrapOrRetirementRecord), 1) AS percentage
     FROM ScrapOrRetirementRecord
     GROUP BY reason
     ORDER BY count DESC`
  );
  return rows;
}

/**
 * 仪表盘：当前各飞机部件安装概况
 */
async function getDashboardOverview() {
  const [rows] = await db.query(
    `SELECT a.aircraft_sn, a.model AS aircraft_model, a.status AS aircraft_status,
            COUNT(DISTINCT ir.component_id) AS installed_parts,
            GROUP_CONCAT(CONCAT(c.component_sn, '(', cm.model_name, ':', ir.position, ')') SEPARATOR '; ') AS parts_detail
     FROM Aircraft a
     LEFT JOIN InstallationRecord ir ON ir.aircraft_id = a.id AND ir.removed_at IS NULL
     LEFT JOIN Component c ON ir.component_id = c.id
     LEFT JOIN ComponentModel cm ON c.model_id = cm.id
     GROUP BY a.id, a.aircraft_sn, a.model, a.status
     ORDER BY installed_parts DESC`
  );
  return rows;
}

/**
 * 按状态统计部件数量
 */
async function getComponentStatusStats() {
  const [rows] = await db.query(
    `SELECT status, COUNT(*) AS count
     FROM Component
     GROUP BY status
     ORDER BY FIELD(status, 'installed', 'available', 'under_maintenance', 'retired')`
  );
  return rows;
}

module.exports = {
  getLifecycleTrace,
  getMTBMStats,
  getAircraftSwapRanking,
  getRetirementReasonStats,
  getDashboardOverview,
  getComponentStatusStats
};
