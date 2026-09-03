const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const db = new sqlite3.Database('./database.db', (err) => {
    if (err) console.error('خطأ في الاتصال بقاعدة البيانات:', err.message);
    else console.log('تم الاتصال بقاعدة البيانات SQLite بنجاح.');
});

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS tickets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        orderCode TEXT,
        customerName TEXT,
        phone TEXT,
        deviceType TEXT,
        deviceSerial TEXT,
        problem TEXT,
        status TEXT DEFAULT 'قيد الانتظار',
        estimatedHours INTEGER DEFAULT 2,
        techNotes TEXT DEFAULT '',
        repairCost REAL DEFAULT 0,
        partCost REAL DEFAULT 0,
        totalCost REAL DEFAULT 0,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS inventory (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        quantity INTEGER,
        price REAL
    )`);
});

function generateOrderCode() {
    const d = new Date();
    const dateStr = d.getFullYear().toString() +
                    String(d.getMonth() + 1).padStart(2, '0') +
                    String(d.getDate()).padStart(2, '0');
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    return `ORD-${dateStr}-${randomNum}`;
}

// جلب الأجهزة التي لم تُحدد حالتها بـ "إنهاء واختفاء" فقط
app.get('/api/tickets', (req, res) => {
    db.all("SELECT * FROM tickets WHERE status != 'إنهاء واختفاء' ORDER BY id DESC", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.get('/api/tickets/:id', (req, res) => {
    db.get('SELECT * FROM tickets WHERE id = ? OR orderCode = ?', [req.params.id, req.params.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row || {});
    });
});

app.post('/api/tickets', (req, res) => {
    const { customerName, phone, deviceType, deviceSerial, problem, estimatedHours, repairCost, partCost } = req.body;
    const orderCode = generateOrderCode();
    const rCost = Number(repairCost) || 0;
    const pCost = Number(partCost) || 0;
    const totalCost = rCost + pCost;

    db.run(
        `INSERT INTO tickets (orderCode, customerName, phone, deviceType, deviceSerial, problem, estimatedHours, repairCost, partCost, totalCost) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [orderCode, customerName, phone, deviceType, deviceSerial || 'غير محدد', problem, Number(estimatedHours) || 2, rCost, pCost, totalCost],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID, orderCode });
        }
    );
});

app.put('/api/tickets/:id', (req, res) => {
    const { status, estimatedHours, techNotes, repairCost, partCost } = req.body;
    const rCost = Number(repairCost) || 0;
    const pCost = Number(partCost) || 0;
    const totalCost = rCost + pCost;

    db.run(
        `UPDATE tickets SET status = ?, estimatedHours = ?, techNotes = ?, repairCost = ?, partCost = ?, totalCost = ? WHERE id = ?`,
        [status, Number(estimatedHours) || 0, techNotes || '', rCost, pCost, totalCost, req.params.id],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ updated: this.changes });
        }
    );
});

// APIs المخزون
app.get('/api/inventory', (req, res) => {
    db.all('SELECT * FROM inventory ORDER BY id DESC', [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/inventory', (req, res) => {
    const { name, quantity, price } = req.body;
    db.run(`INSERT INTO inventory (name, quantity, price) VALUES (?, ?, ?)`, [name, Number(quantity), Number(price)], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID, name, quantity, price });
    });
});

app.put('/api/inventory/:id', (req, res) => {
    const { name, quantity, price } = req.body;
    db.run(
        `UPDATE inventory SET name = ?, quantity = ?, price = ? WHERE id = ?`,
        [name, Number(quantity), Number(price), req.params.id],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ updated: this.changes });
        }
    );
});

app.delete('/api/inventory/:id', (req, res) => {
    db.run(`DELETE FROM inventory WHERE id = ?`, [req.params.id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ deleted: this.changes });
    });
});

// app.listen(PORT, () => {
//     console.log(`السيرفر يعمل بنجاح على: http://localhost:${PORT}`);
// });
