const { Client } = require("pg");

const url = process.env.PG_URL;
const c = new Client({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 20000,
});

c.connect()
  .then(() => c.query('SELECT count(*)::int AS n FROM "Product"'))
  .then((r) => {
    console.log("连接成功，Product 行数:", r.rows[0].n);
    return c.query('SELECT count(*)::int AS n FROM "Sku"');
  })
  .then((r) => {
    console.log("Sku 行数:", r.rows[0].n);
    return c.end();
  })
  .catch((e) => {
    console.log("失败:", e.message);
    process.exit(1);
  });
