const db = require('../config/db');

/**
 * 飞行日志登记
 * 若未提供 flight_duration，自动根据起降时间计算小时差
 */
async function addFlightLog({ aircraft_id, takeoff_time, landing_time, flight_duration, mission_type, notes }) {
  // 1. 校验飞机存在
  const [aircraft] = await db.query(
    'SELECT id, aircraft_sn FROM Aircraft WHERE id = ?', [aircraft_id]
  );
  if (aircraft.length === 0) {
    throw new Error('飞机不存在');
  }

  // 2. 校验时间合理性
  const takeoff = new Date(takeoff_time);
  const landing = new Date(landing_time);
  if (landing <= takeoff) {
    throw new Error('降落时间必须晚于起飞时间');
  }

  // 3. 若未提供飞行时长，自动计算
  if (!flight_duration || parseFloat(flight_duration) <= 0) {
    flight_duration = ((landing - takeoff) / (1000 * 60 * 60)).toFixed(2);
  }

  // 4. 校验任务类型
  const validTypes = ['passenger', 'cargo', 'test', 'training', 'patrol'];
  if (!validTypes.includes(mission_type)) {
    throw new Error(`无效的任务类型: ${mission_type}`);
  }

  // 5. 插入飞行日志
  const [result] = await db.query(
    `INSERT INTO FlightLog (aircraft_id, takeoff_time, landing_time, flight_duration, mission_type, notes)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [aircraft_id, takeoff_time, landing_time, flight_duration, mission_type, notes || null]
  );

  return {
    id: result.insertId,
    aircraft_id,
    aircraft_sn: aircraft[0].aircraft_sn,
    takeoff_time,
    landing_time,
    flight_duration: parseFloat(flight_duration),
    mission_type
  };
}

/**
 * 列出飞行日志（可按飞机筛选）
 */
async function listFlightLogs(aircraft_id = null) {
  let sql = `
    SELECT fl.*, a.aircraft_sn, a.model AS aircraft_model
    FROM FlightLog fl
    JOIN Aircraft a ON fl.aircraft_id = a.id
  `;
  const params = [];
  if (aircraft_id) {
    sql += ' WHERE fl.aircraft_id = ?';
    params.push(aircraft_id);
  }
  sql += ' ORDER BY fl.takeoff_time DESC LIMIT 100';
  const [rows] = await db.query(sql, params);
  return rows;
}

/**
 * 查询某段时间内某飞机上安装了哪些部件
 * 核心逻辑：飞行时间区间与安装时间区间交集判断
 *   flight.takeoff_time < COALESCE(install.removed_at, '9999-12-31')
 *   AND flight.landing_time > install.installed_at
 *
 * 若未指定起止时间，默认查询当前仍在安装中的部件
 */
async function getComponentsOnAircraftDuring(aircraft_id, start_time = null, end_time = null) {
  let sql = `
    SELECT DISTINCT c.id, c.component_sn, cm.model_name, cm.category,
           ir.installed_at, ir.removed_at, ir.position
    FROM InstallationRecord ir
    JOIN Component c ON ir.component_id = c.id
    JOIN ComponentModel cm ON c.model_id = cm.id
    WHERE ir.aircraft_id = ?
  `;
  const params = [aircraft_id];

  if (start_time && end_time) {
    // 飞行时间区间 [start, end] 与安装时间区间 [installed_at, removed_at) 有交集
    sql += `
      AND ir.installed_at < ?
      AND (ir.removed_at IS NULL OR ir.removed_at > ?)
    `;
    params.push(end_time, start_time);
  } else {
    // 默认：当前仍在安装中的部件
    sql += ' AND ir.removed_at IS NULL';
  }

  sql += ' ORDER BY c.component_sn';
  const [rows] = await db.query(sql, params);
  return rows;
}

/**
 * 部件飞行统计
 * 统计某部件在其所有安装期间内经历的飞行次数和累计飞行时长
 */
async function getComponentFlightStats(component_id) {
  const [rows] = await db.query(
    `SELECT
       c.id, c.component_sn, cm.model_name,
       COUNT(DISTINCT fl.id) AS total_flights,
       COALESCE(SUM(fl.flight_duration), 0) AS total_flight_hours,
       COUNT(DISTINCT ir.id) AS total_installations
     FROM Component c
     JOIN ComponentModel cm ON c.model_id = cm.id
     LEFT JOIN InstallationRecord ir ON ir.component_id = c.id
     LEFT JOIN FlightLog fl ON fl.aircraft_id = ir.aircraft_id
       AND fl.takeoff_time >= ir.installed_at
       AND fl.takeoff_time < COALESCE(ir.removed_at, '9999-12-31 23:59:59')
     WHERE c.id = ?
     GROUP BY c.id, c.component_sn, cm.model_name`,
    [component_id]
  );
  return rows[0] || null;
}

/**
 * 列出所有飞机（供下拉列表用）
 */
async function listAircraft() {
  const [rows] = await db.query(
    "SELECT id, aircraft_sn, model FROM Aircraft WHERE status = 'active' ORDER BY id"
  );
  return rows;
}

module.exports = {
  addFlightLog,
  listFlightLogs,
  getComponentsOnAircraftDuring,
  getComponentFlightStats,
  listAircraft
};
