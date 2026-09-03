const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// الاتصال بقاعدة البيانات PostgreSQL
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// إنشاء الجداول
async function initDatabase() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tickets (
                id SERIAL PRIMARY KEY,
                "orderCode" TEXT,
                "customerName" TEXT,
                phone TEXT,
                "deviceType" TEXT,
                "deviceSerial" TEXT,
                problem TEXT,
                status TEXT DEFAULT 'قيد الانتظار',
                "estimatedHours" INTEGER DEFAULT 2,
                "techNotes" TEXT DEFAULT '',
                "repairCost" REAL DEFAULT 0,
                "partCost" REAL DEFAULT 0,
                "totalCost" REAL DEFAULT 0,
                "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS inventory (
                id SERIAL PRIMARY KEY,
                name TEXT,
                quantity INTEGER,
                price REAL
            )
        `);

        console.log('تم الاتصال بقاعدة بيانات PostgreSQL وإنشاء الجداول بنجاح.');
    } catch (err) {
        console.error('خطأ في إنشاء قاعدة البيانات:', err.message);
    }
}

initDatabase();

function generateOrderCode() {
    const d = new Date();

    const dateStr =
        d.getFullYear().toString() +
        String(d.getMonth() + 1).padStart(2, '0') +
        String(d.getDate()).padStart(2, '0');

    const randomNum = Math.floor(1000 + Math.random() * 9000);

    return ORD-${dateStr}-${randomNum};
}


// ==================== TICKETS ====================

// جلب الأجهزة التي لم تُنهَ واختفِ
app.get('/api/tickets', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT * FROM tickets
            WHERE status != 'إنهاء واختفاء'
            ORDER BY id DESC
        `);

        res.json(result.rows);
    } catch (err) {
        console.error('خطأ في جلب التذاكر:', err);
        res.status(500).json({ error: err.message });
    }
});


// جلب تذكرة برقم ID أو Order Code
app.get('/api/tickets/:id', async (req, res) => {
    try {
        const result = await pool.query(
            `SELECT * FROM tickets
             WHERE id::text = $1 OR "orderCode" = $1`,
            [req.params.id]
        );

        res.json(result.rows[0] || {});
    } catch (err) {
        console.error('خطأ في جلب التذكرة:', err);
        res.status(500).json({ error: err.message });
    }
});


// إضافة تذكرة
app.post('/api/tickets', async (req, res) => {
    try {
        const {
            customerName,
            phone,
            deviceType,
            deviceSerial,
            problem,
            estimatedHours,
            repairCost,
            partCost
        } = req.body;

        const orderCode = generateOrderCode();

        const rCost = Number(repairCost) || 0;
        const pCost = Number(partCost) || 0;
        const totalCost = rCost + pCost;

        const result = await pool.query(
            `INSERT INTO tickets
            (
                "orderCode",
                "customerName",
                phone,
                "deviceType",
                "deviceSerial",
                problem,
                "estimatedHours",
                "repairCost",
                "partCost",
                "totalCost"
            )
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
            RETURNING id`,
            [
                orderCode,
                customerName,
                phone,
                deviceType,
                deviceSerial || 'غير محدد',
                problem,
                Number(estimatedHours) || 2,
                rCost,
                pCost,
                totalCost
            ]
        );

        res.json({
            id: result.rows[0].id,
            orderCode
        });

    } catch (err) {
        console.error('خطأ في إضافة التذكرة:', err);
        res.status(500).json({ error: err.message });
    }
});


// تعديل تذكرة
app.put('/api/tickets/:id', async (req, res) => {
    try {
        const {
            status,
            estimatedHours,
            techNotes,
            repairCost,
            partCost
        } = req.body;

        const rCost = Number(repairCost) || 0;
        const pCost = Number(partCost) || 0;
        const totalCost = rCost + pCost;

        const result = await pool.query(
            `UPDATE tickets
             SET
                status = $1,
                "estimatedHours" = $2,
                "techNotes" = $3,
                "repairCost" = $4,
                "partCost" = $5,
                "totalCost" = $6
             WHERE id = $7`,
            [
                status,
                Number(estimatedHours) || 0,
                techNotes || '',
                rCost,
                pCost,
                totalCost,
                req.params.id
            ]
        );

        res.json({
            updated: result.rowCount
        });

    } catch (err) {
        console.error('خطأ في تعديل التذكرة:', err);
        res.status(500).json({ error: err.message });
    }
});


// ==================== INVENTORY ====================

// جلب المخزون
app.get('/api/inventory', async (req, res) => {
    try {
        const result = await pool.query(
            SELECT * FROM inventory ORDER BY id DESC
        );

        res.json(result.rows);
    } catch (err) {
        console.error('خطأ في جلب المخزون:', err);
        res.status(500).json({ error: err.message });
    }
});


// إضافة منتج
app.post('/api/inventory', async (req, res) => {
    try {
        const { name, quantity, price } = req.body;

        const result = await pool.query(
            `INSERT INTO inventory
             (name, quantity, price)
             VALUES ($1, $2, $3)
             RETURNING id`,
            [
                name,
                Number(quantity),
                Number(price)
            ]
        );

        res.json({
            id: result.rows[0].id,
            name,
            quantity,
            price
        });

    } catch (err) {
        console.error('خطأ في إضافة المنتج:', err);
        res.status(500).json({ error: err.message });
    }
});


// تعديل منتج
app.put('/api/inventory/:id', async (req, res) => {
    try {
        const { name, quantity, price } = req.body;

        const result = await pool.query(
            `UPDATE inventory
             SET
                name = $1,
                quantity = $2,
                price = $3
             WHERE id = $4`,
            [
                name,
                Number(quantity),
                Number(price),
                req.params.id
            ]
        );

        res.json({
            updated: result.rowCount
        });

    } catch (err) {
        console.error('خطأ في تعديل المنتج:', err);
        res.status(500).json({ error: err.message });
    }
});


// حذف منتج
app.delete('/api/inventory/:id', async (req, res) => {
    try {
        const result = await pool.query(
            DELETE FROM inventory WHERE id = $1,
            [req.params.id]
        );

        res.json({
            deleted: result.rowCount
        });

    } catch (err) {
        console.error('خطأ في حذف المنتج:', err);
        res.status(500).json({ error: err.message });
    }
});


// تصدير التطبيق لـ Vercel
module.exports = app;


// تشغيل محلي فقط
if (require.main === module) {
    const PORT = process.env.PORT || 3000;

    app.listen(PORT, () => {
        console.log(السيرفر يعمل على http://localhost:${PORT});
    });
}

