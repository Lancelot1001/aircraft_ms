/**
 * 阶段七：集成测试与非法操作拦截演示验证
 * 运行: node test/run_tests.js
 */

const is = require('../src/services/installationService');
const ms = require('../src/services/maintenanceService');
const rs = require('../src/services/retirementService');
const fl = require('../src/services/flightLogService');
const qs = require('../src/services/queryService');
const db = require('../src/config/db');

let passed = 0, failed = 0, total = 0;
const results = [];

function check(name, ok, detail) {
  total++;
  if (ok) { passed++; results.push({ name, status: 'PASS', detail }); }
  else { failed++; results.push({ name, status: 'FAIL', detail }); }
}

function sum(name) {
  const p = passed, f = failed;
  results.push({ name: '', status: 'SECTION', detail: `${name}: ${p} pass, ${f} fail` });
}

async function test() {

// ============================================================
// 7.1 非法拦截一：退役部件安装
// ============================================================
try {
  await is.installComponent({ component_id:8, aircraft_id:1, operator_id:1, position:'x', install_reason:'t' });
  check('7.1 退役部件安装', false, '应被拒绝但成功了');
} catch(e) {
  check('7.1 退役部件安装', /退役/.test(e.message), e.message);
}

try {
  await is.installComponent({ component_id:6, aircraft_id:1, operator_id:1, position:'x', install_reason:'t' });
  check('7.1 维修中部件安装', false, '应被拒绝但成功了');
} catch(e) {
  check('7.1 维修中部件安装', /维修/.test(e.message), e.message);
}
sum('7.1');

// ============================================================
// 7.2 非法拦截二：重复安装 + UPDATE 覆盖历史
// ============================================================
try {
  await is.installComponent({ component_id:1, aircraft_id:2, operator_id:1, position:'x', install_reason:'t' });
  check('7.2 重复激活安装', false, '应被拒绝但成功了');
} catch(e) {
  check('7.2 重复激活安装', true, e.message.substring(0,60));
}

try {
  await db.query('UPDATE InstallationRecord SET component_id=999 WHERE id=1');
  check('7.2 篡改component_id', false, '应被拒绝但成功了');
} catch(e) {
  check('7.2 篡改component_id', /禁止篡改/.test(e.message), e.message.substring(0,60));
}

try {
  await db.query("UPDATE InstallationRecord SET installed_at='2000-01-01' WHERE id=1");
  check('7.2 篡改installed_at', false, '应被拒绝但成功了');
} catch(e) {
  check('7.2 篡改installed_at', /禁止篡改/.test(e.message), e.message.substring(0,60));
}
sum('7.2');

// ============================================================
// 7.3 非法拦截三：DELETE 核心数据 + 退役后维修
// ============================================================
const deleteTests = [
  ['InstallationRecord', "DELETE FROM InstallationRecord WHERE id=1"],
  ['MaintenanceRecord', "DELETE FROM MaintenanceRecord WHERE id=1"],
  ['FlightLog', "DELETE FROM FlightLog WHERE id=1"],
  ['ScrapOrRetirementRecord', "DELETE FROM ScrapOrRetirementRecord WHERE id=1"],
];
for (const [table, sql] of deleteTests) {
  try { await db.query(sql); check(`7.3 DELETE ${table}`, false, '应被拒绝'); }
  catch(e) { check(`7.3 DELETE ${table}`, /禁止物理删除/.test(e.message), e.message.substring(0,60)); }
}

try {
  await ms.createMaintenance({ component_id:8, operator_id:2, maintenance_type:'routine' });
  check('7.3 退役部件维修', false, '应被拒绝');
} catch(e) {
  check('7.3 退役部件维修', /退役/.test(e.message), e.message.substring(0,60));
}
sum('7.3');

// ============================================================
// 7.4 事务回滚验证
// ============================================================
// 场景：安装不存在的部件（触发回滚）
try {
  await is.installComponent({ component_id:9999, aircraft_id:1, operator_id:1, position:'x', install_reason:'t' });
  check('7.4 安装不存在部件', false, '应失败');
} catch(e) {
  check('7.4 安装不存在部件回滚', /不存在/.test(e.message), e.message.substring(0,60));
}

// 场景：更换事务中旧部件不存在（已有测试覆盖，这里验证安装记录无残留）
const [beforeCount] = await db.query('SELECT COUNT(*) AS cnt FROM InstallationRecord');
const beforeCnt = beforeCount[0].cnt;
try {
  await is.swapComponent({ old_component_id:9999, new_component_id:2, aircraft_id:1, operator_id:1, position:'x', install_reason:'t', removal_reason:'t' });
  check('7.4 更换事务回滚', false, '应失败');
} catch(e) {
  const [afterCount] = await db.query('SELECT COUNT(*) AS cnt FROM InstallationRecord');
  check('7.4 更换事务回滚', afterCount[0].cnt === beforeCnt, `记录数不变: ${beforeCnt}→${afterCount[0].cnt}`);
}
sum('7.4');

// ============================================================
// 7.5 退役事务验证：安装中部件退役
// ============================================================
try {
  // 先安装 ENG-002 到 B-1001
  await is.installComponent({ component_id:2, aircraft_id:1, operator_id:1, position:'右发', install_reason:'退役测试安装' });
  // 验证安装成功
  const [active] = await db.query('SELECT id FROM InstallationRecord WHERE component_id=2 AND removed_at IS NULL');
  check('7.5 安装后存在活跃记录', active.length > 0, `活跃记录数: ${active.length}`);

  // 退役（应自动关闭安装记录）
  await rs.retireComponent({ component_id:2, operator_id:3, reason:'技术淘汰', approval_info:'RT-test' });
  const [stillActive] = await db.query('SELECT id FROM InstallationRecord WHERE component_id=2 AND removed_at IS NULL');
  const [status] = await db.query('SELECT status FROM Component WHERE id=2');
  const [scrap] = await db.query('SELECT id FROM ScrapOrRetirementRecord WHERE component_id=2 ORDER BY id DESC LIMIT 1');

  check('7.5 退役后安装关闭', stillActive.length === 0, `活跃记录: ${stillActive.length}`);
  check('7.5 退役后状态retired', status[0].status === 'retired', `状态: ${status[0].status}`);
  check('7.5 退役记录写入', scrap.length > 0, `退役记录ID: ${scrap[0].id}`);
} catch(e) {
  check('7.5 退役事务验证', false, e.message);
}
sum('7.5');

// ============================================================
// 7.6 端到端生命周期
// ============================================================
try {
  // 1. 入库
  await db.query(`INSERT INTO Component (component_sn, model_id, batch_number, production_date, status, cumulative_hours)
    VALUES ('E2E-001', 1, 'E2E-BATCH', '2026-05-01', 'available', 0)`);
  const [newComp] = await db.query("SELECT id FROM Component WHERE component_sn='E2E-001'");
  const e2eId = newComp[0].id;
  check('7.6 入库', e2eId > 0, `ID: ${e2eId}`);

  // 2. 安装
  await is.installComponent({ component_id:e2eId, aircraft_id:3, operator_id:1, position:'E2E位置', install_reason:'端到端测试' });
  const [installed] = await db.query("SELECT status FROM Component WHERE id=?", [e2eId]);
  check('7.6 安装→installed', installed[0].status === 'installed', installed[0].status);

  // 3. 飞行
  await fl.addFlightLog({ aircraft_id:3, takeoff_time:'2026-05-30 08:00:00', landing_time:'2026-05-30 10:00:00', mission_type:'test' });
  check('7.6 飞行登记', true, 'B-3003 测试飞行');

  // 4. 拆卸
  await is.uninstallComponent({ component_id:e2eId, operator_id:1, removal_reason:'端到端拆卸' });
  const [afterUninstall] = await db.query("SELECT status FROM Component WHERE id=?", [e2eId]);
  check('7.6 拆卸→available', afterUninstall[0].status === 'available', afterUninstall[0].status);

  // 5. 维修
  const m = await ms.createMaintenance({ component_id:e2eId, operator_id:2, maintenance_type:'repair' });
  await ms.completeMaintenance({ id:m.id, maintenance_result:'修复完成' });
  const [afterMaint] = await db.query("SELECT status FROM Component WHERE id=?", [e2eId]);
  check('7.6 维修→fixed', afterMaint[0].status === 'available', afterMaint[0].status);

  // 6. 重新安装
  await is.installComponent({ component_id:e2eId, aircraft_id:3, operator_id:1, position:'E2E位置2', install_reason:'重装测试' });
  check('7.6 重新安装', true, '成功');

  // 7. 退役
  await rs.retireComponent({ component_id:e2eId, operator_id:3, reason:'技术淘汰', approval_info:'E2E-APPROVAL' });
  const [retired] = await db.query("SELECT status FROM Component WHERE id=?", [e2eId]);
  check('7.6 退役→retired', retired[0].status === 'retired', retired[0].status);

  // 8. 追溯
  const trace = await qs.getLifecycleTrace('E2E-001');
  check('7.6 生命周期追溯', trace.installHistory.length >= 2, `安装${trace.installHistory.length}次/维修${trace.maintenanceHistory.length}次`);
} catch(e) {
  check('7.6 端到端流程', false, e.message);
}
sum('7.6');

// ============================================================
// 7.7 数据一致性抽查
// ============================================================
try {
  // 检查一：所有已安装部件的 installation_record 都有对应的活跃记录
  const [orphanInstalled] = await db.query(
    `SELECT c.id, c.component_sn FROM Component c
     WHERE c.status='installed'
     AND NOT EXISTS (SELECT 1 FROM InstallationRecord ir WHERE ir.component_id=c.id AND ir.removed_at IS NULL)`
  );
  check('7.7 installed部件有活跃安装', orphanInstalled.length === 0, `孤立记录: ${orphanInstalled.length}`);

  // 检查二：时间合理性 — 安装时间 < 拆卸时间
  const [timeViolations] = await db.query(
    'SELECT COUNT(*) AS cnt FROM InstallationRecord WHERE removed_at IS NOT NULL AND removed_at < installed_at'
  );
  check('7.7 安装<拆卸', timeViolations[0].cnt === 0, `违规: ${timeViolations[0].cnt}`);

  // 检查三：飞行起降合理性
  const [flightTime] = await db.query(
    'SELECT COUNT(*) AS cnt FROM FlightLog WHERE landing_time <= takeoff_time'
  );
  check('7.7 飞行起<降', flightTime[0].cnt === 0, `违规: ${flightTime[0].cnt}`);

  // 检查四：退役部件无活跃安装
  const [retiredInstalled] = await db.query(
    `SELECT c.id, c.component_sn FROM Component c
     WHERE c.status='retired'
     AND EXISTS (SELECT 1 FROM InstallationRecord ir WHERE ir.component_id=c.id AND ir.removed_at IS NULL)`
  );
  check('7.7 退役部件无活跃安装', retiredInstalled.length === 0, `违规: ${retiredInstalled.length}`);

  // 检查五：安装记录外键完整性
  const [fkCheck] = await db.query(
    `SELECT COUNT(*) AS cnt FROM InstallationRecord ir
     LEFT JOIN Component c ON ir.component_id=c.id
     WHERE c.id IS NULL`
  );
  check('7.7 安装→部件FK完整', fkCheck[0].cnt === 0, `断裂: ${fkCheck[0].cnt}`);
} catch(e) {
  check('7.7 数据一致性', false, e.message);
}
sum('7.7');

// ============================================================
// 汇总
// ============================================================
console.log('\n' + '='.repeat(60));
console.log(`集成测试结果: ${passed}/${total} 通过, ${failed} 失败`);
console.log('='.repeat(60));
results.forEach(r => {
  if (r.status === 'SECTION') console.log(`\n--- ${r.detail} ---`);
  else console.log(`  ${r.status === 'PASS' ? '✓' : '✗'} ${r.name}`);
});
console.log('='.repeat(60) + '\n');

// 生成测试报告 JSON
require('fs').writeFileSync(
  require('path').join(__dirname, '..', 'docs', 'test_results.json'),
  JSON.stringify({ total, passed, failed, results, timestamp: new Date().toISOString() }, null, 2)
);

process.exit(failed ? 1 : 0);
}

test();
