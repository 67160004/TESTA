const request = require('supertest');
const { app } = require('../server');
const { pool } = require('../db');

describe('โจทย์ข้อที่ 1: จัดการเมนู และสร้างออเดอร์ด้วย Transaction (6 คะแนน)', () => {

  afterAll(async () => {
    await pool.end();
  });

  it('1.1 GET /api/menus - ดึงเมนูทั้งหมด และกรองเฉพาะที่พร้อมขาย (available=true)', async () => {
    // ดึงทั้งหมด
    const resAll = await request(app).get('/api/menus');
    expect(resAll.statusCode).toBe(200);
    expect(resAll.body.success).toBe(true);
    expect(resAll.body.data.length).toBe(22);

    // กรองเฉพาะ available=true
    const resAvail = await request(app).get('/api/menus?available=true');
    expect(resAvail.statusCode).toBe(200);
    expect(resAvail.body.data.every(m => m.available === 1 || m.available === true)).toBe(true);
  });

  it('1.2 POST /api/orders - สร้างออเดอร์สำเร็จ บันทึกทั้งตาราง orders และ order_items', async () => {
    const payload = {
      customer_name: 'สมชาย ทดสอบ',
      items: [
        { menu_item_id: 1, quantity: 2 },
        { menu_item_id: 2, quantity: 1 }
      ]
    };

    const res = await request(app).post('/api/orders').send(payload);

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty('order_id');

    // ตรวจสอบในฐานข้อมูลว่าถูกบันทึกจริง
    const [orderRows] = await pool.query('SELECT * FROM orders WHERE id = ?', [res.body.order_id]);
    expect(orderRows.length).toBe(1);
    expect(orderRows[0].customer_name).toBe('สมชาย ทดสอบ');

    const [itemRows] = await pool.query('SELECT * FROM order_items WHERE order_id = ?', [res.body.order_id]);
    expect(itemRows.length).toBe(2);
  });

  it('1.3 POST /api/orders - ปฏิเสธ 400 เมื่อข้อมูลไม่ครบ (Rollback ป้องกันบันทึกผิดพลาด)', async () => {
    const res = await request(app)
      .post('/api/orders')
      .send({ customer_name: 'ทดสอบข้อมูลไม่ครบ', items: [] });

    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

});
