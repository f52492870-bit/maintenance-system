const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@libsql/client');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// إنشاء العميل المباشر بدون ميزات الـ Migration الضامنة للأخطاء
function getDbClient() {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;

    if (!url || !authToken) {
        throw new Error("المتغيرات البيئية غير مكتملة في Vercel");
    }

    return createClient({ url, authToken });
}

function generateOrderCode() {
    const d = new Date();
    const dateStr = d.getFullYear().toString() +
                    String(d.getMonth() + 1).padStart(2, '0') +
                    String(d.getDate()).padStart(2, '0');
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    return `ORD-${dateStr}-${randomNum}`;
}

// ----------------- APIs التذاكر والأجهزة -----------------

// جلب التذاكر
app.get('/api/tickets', async (req, res) => {
    try {
        const db = getDbClient();
        const result = await db.execute("SELECT * FROM tickets WHERE status != 'إنهاء واختفاء' ORDER BY id DESC");
        res.json(result.rows || []);
    } catch (err) {
        console.error("Error fetching tickets:", err);
        res.status(500).json({ error: err.message });
    }
});

// جلب تذكرة واحدة
app.get('/api/tickets/:id', async (req, res) => {
    try {
        const db = getDbClient();
        const result = await db.execute({
            sql: 'SELECT * FROM tickets WHERE id = ? OR orderCode = ?',
            args: [req.params.id, req.params.id]
        });
        res.json(result.rows[0] || {});
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// إنشاء تذكرة جديدة
app.post('/api/tickets', async (req, res) => {
    try {
        const db = getDbClient();

        const { 
            customerName = '', 
            phone = '', 
            deviceType = '', 
            deviceSerial = 'غير محدد', 
            problem = '', 
            estimatedHours = 2, 
            repairCost = 0, 
            partCost = 0 
        } = req.body;

        const orderCode = generateOrderCode();
        const rCost = Number(repairCost) || 0;
        const pCost = Number(partCost) || 0;
        const totalCost = rCost + pCost;

        const result = await db.execute({
            sql: `INSERT INTO tickets (
                orderCode, customerName, phone, deviceType, deviceSerial, problem, estimatedHours, repairCost, partCost, totalCost
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
                String(orderCode), 
                String(customerName), 
                String(phone), 
                String(deviceType), 
                String(deviceSerial || 'غير محدد'), 
                String(problem), 
                Number(estimatedHours) || 2, 
                rCost, 
                pCost, 
                totalCost
            ]
        });

        res.json({ 
            id: Number(result.lastInsertRowid), 
            orderCode 
        });
    } catch (err) {
        console.error("Error creating ticket:", err);
        res.status(500).json({ error: err.message });
    }
});

// تحديث تذكرة
app.put('/api/tickets/:id', async (req, res) => {
    try {
        const db = getDbClient();
        const { status = 'قيد الانتظار', estimatedHours = 0, techNotes = '', repairCost = 0, partCost = 0 } = req.body;
        const rCost = Number(repairCost) || 0;
        const pCost = Number(partCost) || 0;
        const totalCost = rCost + pCost;

        const result = await db.execute({
            sql: `UPDATE tickets SET status = ?, estimatedHours = ?, techNotes = ?, repairCost = ?, partCost = ?, totalCost = ? WHERE id = ?`,
            args: [
                String(status), 
                Number(estimatedHours) || 0, 
                String(techNotes || ''), 
                rCost, 
                pCost, 
                totalCost, 
                req.params.id
            ]
        });

        res.json({ updated: Number(result.rowsAffected) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ----------------- APIs المخزون -----------------

// جلب المخزون
app.get('/api/inventory', async (req, res) => {
    try {
        const db = getDbClient();
        const result = await db.execute('SELECT * FROM inventory ORDER BY id DESC');
        res.json(result.rows || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// إضافة صنف للمخزون
app.post('/api/inventory', async (req, res) => {
    try {
        const db = getDbClient();
        const { name = '', quantity = 0, price = 0 } = req.body;

        const result = await db.execute({
            sql: 'INSERT INTO inventory (name, quantity, price) VALUES (?, ?, ?)',
            args: [String(name), Number(quantity) || 0, Number(price) || 0]
        });

        res.json({ id: Number(result.lastInsertRowid), name, quantity, price });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// تعديل صنف
app.put('/api/inventory/:id', async (req, res) => {
    try {
        const db = getDbClient();
        const { name = '', quantity = 0, price = 0 } = req.body;

        const result = await db.execute({
            sql: 'UPDATE inventory SET name = ?, quantity = ?, price = ? WHERE id = ?',
            args: [String(name), Number(quantity) || 0, Number(price) || 0, req.params.id]
        });

        res.json({ updated: Number(result.rowsAffected) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// حذف صنف
app.delete('/api/inventory/:id', async (req, res) => {
    try {
        const db = getDbClient();
        const result = await db.execute({
            sql: 'DELETE FROM inventory WHERE id = ?',
            args: [req.params.id]
        });

        res.json({ deleted: Number(result.rowsAffected) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => console.log(`السيرفر يعمل على: http://localhost:${PORT}`));
}

module.exports = app;
