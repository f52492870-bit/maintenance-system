const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@libsql/client/http');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// الاتصال المباشر الخفيف عبر HTTP
function getDbClient() {
    const url = process.env.TURSO_DATABASE_URL;
    const authToken = process.env.TURSO_AUTH_TOKEN;

    if (!url || !authToken) {
        throw new Error("TURSO_DATABASE_URL or TURSO_AUTH_TOKEN is missing!");
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

// ----------------- APIs التذاكر -----------------

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

// إضافة تذكرة
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

        res.json({ id: Number(result.lastInsertRowid), orderCode });
    } catch (err) {
        console.error("Error creating ticket:", err);
        res.status(500).json({ error: err.message });
    }
});

// ----------------- APIs المخزون -----------------

app.get('/api/inventory', async (req, res) => {
    try {
        const db = getDbClient();
        const result = await db.execute('SELECT * FROM inventory ORDER BY id DESC');
        res.json(result.rows || []);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

if (process.env.NODE_ENV !== 'production') {
    app.listen(3000, () => console.log('Running on port 3000'));
}

module.exports = app;
