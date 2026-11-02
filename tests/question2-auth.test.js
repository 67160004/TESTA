const request = require('supertest');
const jwt = require('jsonwebtoken');
const { app } = require('../server');
const { jwtSecret } = require('../config');

describe('โจทย์ข้อที่ 2: ตรวจสิทธิ์ JWT และการเข้าถึง Role Admin (4 คะแนน)', () => {

  it('2.1 POST /api/auth/login - สร้าง JWT Token สำเร็จเมื่อส่ง username และ role', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ username: 'manager1', role: 'admin' });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body).toHaveProperty('token');

    // ตรวจสอบ payload ใน Token
    const decoded = jwt.verify(res.body.token, jwtSecret);
    expect(decoded.username).toBe('manager1');
    expect(decoded.role).toBe('admin');
  });

  it('2.2 GET /api/admin/dashboard - ปฏิเสธ 401 เมื่อไม่ได้ส่ง Token มาใน Header', async () => {
    const res = await request(app).get('/api/admin/dashboard');

    expect(res.statusCode).toBe(401);
    expect(res.body).toHaveProperty('error');
  });

  it('2.3 GET /api/admin/dashboard - ปฏิเสธ 403 เมื่อ Token เป็น Role ทั่วไป (เช่น customer)', async () => {
    const customerToken = jwt.sign({ username: 'customer1', role: 'customer' }, jwtSecret);

    const res = await request(app)
      .get('/api/admin/dashboard')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.statusCode).toBe(403);
    expect(res.body).toHaveProperty('error');
  });

  it('2.4 GET /api/admin/dashboard - ผ่าน 200 เมื่อส่ง Token ที่มี Role เป็น admin', async () => {
    const adminToken = jwt.sign({ username: 'admin1', role: 'admin' }, jwtSecret);

    const res = await request(app)
      .get('/api/admin/dashboard')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toContain('Admin: admin1');
  });

});
