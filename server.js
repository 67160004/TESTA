const express = require('express');
const jwt = require('jsonwebtoken');
const { pool } = require('./db');
const { jwtSecret, port } = require('./config');

const app = express();
app.use(express.json());

// ==========================================
// Middleware สำหรับตรวจสิทธิ์ (JWT & Roles)
// ==========================================
function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'ไม่พบ Token (Unauthorized)' });
  }

  jwt.verify(token, jwtSecret, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Token ไม่ถูกต้องหรือหมดอายุ (Forbidden)' });
    }
    req.user = user;
    next();
  });
}

function requireAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') {
    return next();
  }
  return res.status(403).json({ error: 'เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่เข้าถึงได้' });
}

// ==========================================
// ข้อ 2: JWT Authentication
// ==========================================
app.post('/api/auth/login', (req, res) => {
  const { username, role } = req.body;

  if (!username || !role) {
    return res.status(400).json({ error: 'ต้องการ username และ role' });
  }

  const token = jwt.sign({ username, role }, jwtSecret, { expiresIn: '1h' });
  return res.status(200).json({
    success: true,
    token,
  });
});

// Endpoint ตัวอย่างสำหรับทดสอบการเข้าถึงเฉพาะ Admin
app.get('/api/admin/dashboard', verifyToken, requireAdmin, (req, res) => {
  return res.status(200).json({
    message: `ยินดีต้อนรับ Admin: ${req.user.username}`,
  });
});

// ==========================================
// ข้อ 1: Menus & Order Creation (Transaction)
// ==========================================
// 1. GET /api/menus
app.get('/api/menus', async (req, res) => {
  try {
    const { available } = req.query;
    let sql = 'SELECT * FROM menu_items';
    const params = [];

    if (available !== undefined) {
      sql += ' WHERE available = ?';
      params.push(available === 'true' || available === '1' ? 1 : 0);
    }

    const [rows] = await pool.query(sql, params);
    return res.status(200).json({ success: true, data: rows });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// 2. POST /api/orders (Transaction)
app.post('/api/orders', async (req, res) => {
  const { customer_name, items } = req.body;

  if (!customer_name || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'ข้อมูลไม่ครบถ้วน (ต้องการ customer_name และ items)' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [orderResult] = await conn.query(
      'INSERT INTO orders (customer_name, status) VALUES (?, ?)',
      [customer_name, 'pending']
    );
    const orderId = orderResult.insertId;

    for (const item of items) {
      if (!item.menu_item_id || !item.quantity || item.quantity <= 0) {
        throw new Error('รายการอาหารหรือจำนวนไม่ถูกต้อง');
      }

      await conn.query(
        'INSERT INTO order_items (order_id, menu_item_id, quantity) VALUES (?, ?, ?)',
        [orderId, item.menu_item_id, item.quantity]
      );
    }

    await conn.commit();
    return res.status(201).json({
      success: true,
      message: 'สร้างออเดอร์สำเร็จ',
      order_id: orderId,
    });
  } catch (error) {
    await conn.rollback();
    console.error(error);
    return res.status(500).json({ error: error.message || 'ไม่สามารถสร้างออเดอร์ได้' });
  } finally {
    conn.release();
  }
});

// ==========================================
// ข้อ 3: Order Summary & Status Update
// ==========================================
// 1. GET /api/orders/:id/summary
app.get('/api/orders/:id/summary', async (req, res) => {
  const orderId = req.params.id;

  try {
    const [orderRows] = await pool.query('SELECT * FROM orders WHERE id = ?', [orderId]);
    if (orderRows.length === 0) {
      return res.status(404).json({ error: 'ไม่พบเลขออเดอร์นี้' });
    }
    const order = orderRows[0];

    const queryItems = `
      SELECT 
        oi.id AS order_item_id,
        m.name AS menu_name,
        m.price,
        oi.quantity,
        (m.price * oi.quantity) AS item_total
      FROM order_items oi
      JOIN menu_items m ON oi.menu_item_id = m.id
      WHERE oi.order_id = ?
    `;
    const [items] = await pool.query(queryItems, [orderId]);
    const grandTotal = items.reduce((sum, item) => sum + Number(item.item_total), 0);

    return res.status(200).json({
      success: true,
      order: {
        id: order.id,
        customer_name: order.customer_name,
        status: order.status,
        created_at: order.created_at,
        items,
        grand_total: grandTotal,
      },
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูล' });
  }
});

// 2. PATCH /api/orders/:id/status
app.patch('/api/orders/:id/status', async (req, res) => {
  const orderId = req.params.id;
  const { status } = req.body;
  const validStatuses = ['pending', 'preparing', 'delivered', 'cancelled'];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({
      error: `สถานะไม่ถูกต้อง (ต้องเป็นค่าใดค่าหนึ่งใน: ${validStatuses.join(', ')})`,
    });
  }

  try {
    const [result] = await pool.query('UPDATE orders SET status = ? WHERE id = ?', [
      status,
      orderId,
    ]);

    if (result.matchedRows === 0) {
      return res.status(404).json({ error: 'ไม่พบเลขออเดอร์นี้' });
    }

    return res.status(200).json({
      success: true,
      message: 'อัปเดตสถานะเรียบร้อยแล้ว',
      order_id: orderId,
      status,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'ไม่สามารถอัปเดตสถานะได้' });
  }
});

// ถ้าไม่ได้ถูก require มาจาก test ค่อย start server
if (process.env.NODE_ENV !== 'test') {
  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
}

module.exports = { app, verifyToken, requireAdmin };
