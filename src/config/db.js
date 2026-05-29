const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: '123456',
  database: 'aircraft_ms',
  charset: 'utf8mb4',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

/**
 * 执行单条 SQL，返回 [rows, fields]
 */
async function query(sql, params = []) {
  const [rows, fields] = await pool.execute(sql, params);
  return [rows, fields];
}

/**
 * 在事务中执行多个操作
 * @param {Function} callback - 接收 connection 参数，返回结果
 */
async function withTransaction(callback) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const result = await callback(conn);
    await conn.commit();
    return result;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

module.exports = { pool, query, withTransaction };
