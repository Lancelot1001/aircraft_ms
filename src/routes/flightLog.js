const express = require('express');
const router = express.Router();
const flightLogService = require('../services/flightLogService');

// 飞行日志列表
router.get('/', async (req, res) => {
  try {
    const aircraftId = req.query.aircraft_id || null;
    const logs = await flightLogService.listFlightLogs(aircraftId);
    const aircraftList = await flightLogService.listAircraft();
    res.render('flightlog/list', { logs, aircraftList, selectedAircraft: aircraftId, error: null, success: null });
  } catch (err) {
    res.render('flightlog/list', { logs: [], aircraftList: [], selectedAircraft: null, error: err.message, success: null });
  }
});

// 飞行日志登记表单
router.get('/add', async (req, res) => {
  try {
    const aircraftList = await flightLogService.listAircraft();
    res.render('flightlog/add', { aircraftList, error: null, success: null, form: {} });
  } catch (err) {
    res.render('flightlog/add', { aircraftList: [], error: err.message, success: null, form: {} });
  }
});

// 处理飞行日志登记
router.post('/add', async (req, res) => {
  try {
    const { aircraft_id, takeoff_time, landing_time, flight_duration, mission_type, notes } = req.body;
    const result = await flightLogService.addFlightLog({
      aircraft_id: parseInt(aircraft_id),
      takeoff_time,
      landing_time,
      flight_duration,
      mission_type,
      notes
    });
    const aircraftList = await flightLogService.listAircraft();
    res.render('flightlog/add', {
      aircraftList,
      error: null,
      success: `飞行日志登记成功！ID: ${result.id}，时长 ${result.flight_duration}h`,
      form: {}
    });
  } catch (err) {
    const aircraftList = await flightLogService.listAircraft();
    res.render('flightlog/add', { aircraftList, error: err.message, success: null, form: req.body });
  }
});

// 飞行-部件关联查询页面
router.get('/parts', async (req, res) => {
  try {
    const aircraftList = await flightLogService.listAircraft();
    const { aircraft_id, start_time, end_time } = req.query;

    let parts = [];
    let selectedAircraft = null;
    if (aircraft_id && start_time && end_time) {
      parts = await flightLogService.getComponentsOnAircraftDuring(
        parseInt(aircraft_id), start_time, end_time
      );
      selectedAircraft = aircraft_id;
    }

    res.render('flightlog/parts', {
      aircraftList, parts, selectedAircraft,
      start_time: start_time || '',
      end_time: end_time || '',
      error: null
    });
  } catch (err) {
    res.render('flightlog/parts', {
      aircraftList: [], parts: [], selectedAircraft: null,
      start_time: '', end_time: '', error: err.message
    });
  }
});

// 部件飞行统计查询页面
router.get('/stats', async (req, res) => {
  try {
    const { component_id } = req.query;
    let stats = null;
    if (component_id) {
      stats = await flightLogService.getComponentFlightStats(parseInt(component_id));
    }
    // 获取已安装过的部件列表供选择
    const db = require('../config/db');
    const [components] = await db.query(
      `SELECT DISTINCT c.id, c.component_sn, cm.model_name
       FROM Component c
       JOIN ComponentModel cm ON c.model_id = cm.id
       JOIN InstallationRecord ir ON ir.component_id = c.id
       ORDER BY c.component_sn`
    );
    res.render('flightlog/stats', { components, stats, selectedId: component_id, error: null });
  } catch (err) {
    res.render('flightlog/stats', { components: [], stats: null, selectedId: null, error: err.message });
  }
});

module.exports = router;
