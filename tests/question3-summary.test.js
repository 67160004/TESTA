const request = require('supertest');
const { app } = require('../server');
const { pool } = require('../db');

describe('โจทย์ข้อที่ 3: สรุปยอดออเดอร์ (SQL JOIN) และการอัปเดตสถานะ (5 คะแนน)', () => {

  afterAll(async () => {
    await pool.end();
  });

  it('3.1 GET /api/orders/:id/summary - คำนวณราคารวม (grand_total) และ JOIN เมนูถูกต้อง', async () => {
    // ออเดอร์ id = 1 ใน seed: ข้าวผัดกุ้ง (60 x 2 = 120) + ชาเย็น (25 x 2 = 50) => รวม 170
    const res = await request(app).get('/api/orders/1/summary');

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.order.id).toBe(1);
    expect(res.body.order.customer_name).toBe('สมชาย');
    expect(res.body.order.items.length).toBe(2);
    expect(Number(res.body.order.grand_total)).toBe(170.00);
  });

  it('3.2 PATCH /api/orders/:id/status - อัปเดตสถานะออเดอร์สำเร็จ', async () => {
    const res = await request(app)
      .patch('/api/orders/2/status')
      .send({ status: 'delivered' });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.status).toBe('delivered');

    // ตรวจสอบใน DB จริง
    const [rows] = await pool.query('SELECT status FROM orders WHERE id = 2');
    expect(rows[0].status).toBe('delivered');
  });

  it('3.3 PATCH /api/orders/:id/status - ปฏิเสธ 400 เมื่อระบุสถานะที่ไม่ถูกต้อง', async () => {
    const res = await request(app)
      .patch('/api/orders/2/status')
      .send({ status: 'wrong_status' });

    expect(res.statusCode).toBe(400);
    expect(res.body).toHaveProperty('error');
  });

});
