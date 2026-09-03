const express = require("express");
const { Pool } = require("pg");
const cors = require("cors");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ملفات الواجهة
app.use(express.static(path.join(__dirname, "public")));

// ===============================
// DATABASE
// ===============================

if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not configured");
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    },
    connectionTimeoutMillis: 10000
});

// ===============================
// DATABASE INITIALIZATION
// ===============================

let databaseReady = false;
let databaseInitPromise = null;

async function initDatabase() {
    if (databaseReady) {
        return;
    }

    if (databaseInitPromise) {
        return databaseInitPromise;
    }

    databaseInitPromise = (async () => {
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
                    quantity INTEGER DEFAULT 0,
                    price REAL DEFAULT 0
                )
            `);

            databaseReady = true;

            console.log("Database initialized successfully");
        } catch (error) {
            console.error("Database initialization error:", error);
            throw error;
        }
    })();

    return databaseInitPromise;
}

// ===============================
// HEALTH CHECK
// ===============================

app.get("/api/test", async (req, res) => {
    try {
        await initDatabase();

        res.json({
            success: true,
            message: "Workshop server is working"
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            error: "Database connection failed"
        });
    }
});


// ===============================
// HOME
// ===============================

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});


// ===============================
// ORDER CODE
// ===============================

function generateOrderCode() {
    const d = new Date();

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");

    const randomNum = Math.floor(1000 + Math.random() * 9000);

    return ORD-${year}${month}${day}-${randomNum};
}


// ===============================
// TICKETS
// ===============================

// GET ALL TICKETS
app.get("/api/tickets", async (req, res) => {
    try {
        await initDatabase();

        const result = await pool.query(`
            SELECT *
            FROM tickets
            WHERE status != 'إنهاء واختفاء'
            ORDER BY id DESC
        `);

        res.json(result.rows);
    } catch (error) {
        console.error("GET /api/tickets error:", error);

        res.status(500).json({
            error: error.message
        });
    }
});


// GET ONE TICKET
app.get("/api/tickets/:id", async (req, res) => {
    try {
        await initDatabase();

        const value = req.params.id;

        const result = await pool.query(
            `
            SELECT *
            FROM tickets
            WHERE id::text = $1
               OR "orderCode" = $1
            LIMIT 1
            `,
            [value]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: "Ticket not found"
            });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error("GET /api/tickets/:id error:", error);

        res.status(500).json({
            error: error.message
        });
    }
});


// CREATE TICKET
app.post("/api/tickets", async (req, res) => {
    try {
        await initDatabase();

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

        if (!customerName || !phone || !deviceType || !problem) {
            return res.status(400).json({
                error: "الاسم ورقم الهاتف ونوع الجهاز والعطل مطلوبة"
            });
        }

        const orderCode = generateOrderCode();

        const hours = Number(estimatedHours) || 2;
        const rCost = Number(repairCost) || 0;
        const pCost = Number(partCost) || 0;
        const totalCost = rCost + pCost;

        const result = await pool.query(
            `
            INSERT INTO tickets (
                "orderCode",
                "customerName",
                phone,
                "deviceType",
                "deviceSerial",
                problem,
                status,
                "estimatedHours",
                "techNotes",
                "repairCost",
                "partCost",
                "totalCost"
            )
            VALUES (
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                $7,
                $8,
                $9,
                $10,
                $11,
                $12
            )
            RETURNING *
            `,
            [
                orderCode,
                customerName,
                phone,
                deviceType,
                deviceSerial || "غير محدد",
                problem,
                "قيد الانتظار",
                hours,
                "",
                rCost,
                pCost,
                totalCost
            ]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error("POST /api/tickets error:", error);

        res.status(500).json({
            error: error.message
        });
    }
});


// UPDATE TICKET
app.put("/api/tickets/:id", async (req, res) => {
    try {
        await initDatabase();

        const {
            status,
            estimatedHours,
            techNotes,
            repairCost,
            partCost,
            totalCost
        } = req.body;

        const rCost = Number(repairCost) || 0;
        const pCost = Number(partCost) || 0;

        const calculatedTotal =
            totalCost !== undefined
                ? Number(totalCost) || 0
                : rCost + pCost;

        const result = await pool.query(
            `
            UPDATE tickets
            SET
                status = COALESCE($1, status),
                "estimatedHours" = COALESCE($2, "estimatedHours"),
                "techNotes" = COALESCE($3, "techNotes"),
                "repairCost" = COALESCE($4, "repairCost"),
                "partCost" = COALESCE($5, "partCost"),
                "totalCost" = COALESCE($6, "totalCost")
            WHERE id = $7
            RETURNING *
            `,
            [
                status ?? null,
                estimatedHours !== undefined
                    ? Number(estimatedHours)
                    : null,
                techNotes ?? null,
                repairCost !== undefined
                    ? rCost
                    : null,
                partCost !== undefined
                    ? pCost
                    : null,
                calculatedTotal,
                req.params.id
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: "Ticket not found"
            });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error("PUT /api/tickets/:id error:", error);

        res.status(500).json({
            error: error.message
        });
    }
});


// ===============================
// INVENTORY
// ===============================

// GET INVENTORY
app.get("/api/inventory", async (req, res) => {
    try {
        await initDatabase();

        const result = await pool.query(`
            SELECT *
            FROM inventory
            ORDER BY id DESC
        `);

        res.json(result.rows);
    } catch (error) {
        console.error("GET /api/inventory error:", error);

        res.status(500).json({
            error: error.message
        });
    }
});


// ADD INVENTORY ITEM
app.post("/api/inventory", async (req, res) => {
    try {
        await initDatabase();

        const {
            name,
            quantity,
            price
        } = req.body;

        if (!name) {
            return res.status(400).json({
                error: "اسم القطعة مطلوب"
            });
        }

        const result = await pool.query(
            `
            INSERT INTO inventory (
                name,
                quantity,
                price
            )
            VALUES ($1, $2, $3)
            RETURNING *
            `,
            [
                name,
                Number(quantity) || 0,
                Number(price) || 0
            ]
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error("POST /api/inventory error:", error);

        res.status(500).json({
            error: error.message
        });
    }
});


// UPDATE INVENTORY ITEM
app.put("/api/inventory/:id", async (req, res) => {
    try {
        await initDatabase();

        const {
            name,
            quantity,
            price
        } = req.body;

        const result = await pool.query(
            `
            UPDATE inventory
            SET
                name = $1,
                quantity = $2,
                price = $3
            WHERE id = $4
            RETURNING *
            `,
            [
                name,
                Number(quantity) || 0,
                Number(price) || 0,
                req.params.id
            ]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: "Item not found"
            });
        }

        res.json(result.rows[0]);
    } catch (error) {
        console.error("PUT /api/inventory/:id error:", error);

        res.status(500).json({
            error: error.message
        });
    }
});


// DELETE INVENTORY ITEM
app.delete("/api/inventory/:id", async (req, res) => {
    try {
        await initDatabase();

        const result = await pool.query(
            `
            DELETE FROM inventory
            WHERE id = $1
            RETURNING *
            `,
            [req.params.id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                error: "Item not found"
            });
        }

        res.json({
            success: true,
            deleted: result.rows[0]
        });
    } catch (error) {
        console.error("DELETE /api/inventory/:id error:", error);

        res.status(500).json({
            error: error.message
        });
    }
});


// ===============================
// ERROR HANDLER
// ===============================

app.use((error, req, res, next) => {
    console.error("Unhandled error:", error);

    res.status(500).json({
        error: "Internal server error"
    });
});


// ===============================
// VERCEL
// ===============================

module.exports = app;


// ===============================
// LOCAL DEVELOPMENT
// ===============================

if (require.main === module) {
    const PORT = process.env.PORT || 3000;

    app.listen(PORT, () => {
        console.log(Server running on port ${PORT});
    });
}


