const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // URL do NeonDB
  ssl: { rejectUnauthorized: false }
});

async function conectarNeon() {
    try {
        await pool.query('SELECT NOW()');
        console.log('✅ API conectada ao NeonDB (PostgreSQL)!');
    } catch (error) {
        console.error('❌ Falha na conexão com Neon:', error);
    }
}
conectarNeon();