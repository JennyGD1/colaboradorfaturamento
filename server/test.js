const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const { Pool } = require('pg');

console.log('=== TESTE DE CONEXÃO ===');
console.log('DATABASE_URL:', process.env.DATABASE_URL ? '✅ Carregada' : '❌ Não carregada');
console.log('String:', process.env.DATABASE_URL?.substring(0, 50) + '...');

if (!process.env.DATABASE_URL) {
    console.log('❌ .env não carregado! Verifique:');
    console.log('1. Arquivo .env existe na pasta server');
    console.log('2. Conteúdo: DATABASE_URL=postgresql://...');
    console.log('3. Encoding UTF-8 sem BOM');
    process.exit(1);
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 5000
});

pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('❌ Erro de conexão:', err.message);
        console.error('Código:', err.code);
    } else {
        console.log('✅ Conexão OK!');
        console.log('📅 Hora no banco:', res.rows[0].now);
    }
    pool.end();
});