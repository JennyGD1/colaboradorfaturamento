const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
console.log('🔍 DATABASE_URL existe?', !!process.env.DATABASE_URL);
console.log('🔍 DATABASE_URL prefixo:', process.env.DATABASE_URL?.substring(0, 20) + '...');
const app = express();
const PORT = process.env.PORT || 3001;

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json());

pool.connect()
    .then(client => {
        client.release();
    })
    .catch(err => console.error('❌ Falha na conexão com Neon:', err));

// --- ROTAS ---

app.get('/api/health', async (req, res) => {
    try {
        const result = await pool.query('SELECT NOW()');
        res.json({
            status: 'online',
            timestamp: new Date().toISOString(),
            db: 'connected',
            serverTime: result.rows[0].now
        });
    } catch (error) {
        res.status(500).json({ status: 'offline', error: error.message });
    }
});
app.get('/api/processos', async (req, res) => {
    try {
        
        const { responsavel, tratamento, status, sla, dataRecebimento, numeroProcesso } = req.query;
        let query = `
            SELECT 
                *,
                data_recebimento as "dataRecebimento", 
                numero_processo as "numeroProcesso", 
                valor_capa as "valorCapa",
                valor_glosa as "valorGlosa",
                valor_liberado as "valorLiberado",
                tipo_processo as "tipoProcesso",
                ultima_atualizacao as "ultimaAtualizacao"
            FROM processos 
            WHERE 1=1
        `;
        const values = [];
        let placeholder = 1;

        if (responsavel && responsavel !== '') {
            query += ` AND responsavel = $${placeholder++}`;
            values.push(responsavel);
        }
        if (tratamento && tratamento !== '') {
            query += ` AND tratamento = $${placeholder++}`;
            values.push(tratamento);
        }
        if (status && status !== '') {
            query += ` AND status = $${placeholder++}`;
            values.push(status);
        }
        if (dataRecebimento && dataRecebimento !== '') {
            query += ` AND data_recebimento = $${placeholder++}`;
            values.push(dataRecebimento);
        }
        if (numeroProcesso && numeroProcesso !== '') {
            query += ` AND numero_processo ILIKE $${placeholder++}`;
            values.push(`%${numeroProcesso}%`);
        }
        if (sla && sla !== '') {
            query += ` AND status NOT IN ('CONCLUIDO', 'assinado e tramitado', 'EXCLUIDO')`;
            
            if (sla === 'critico') {
                query += ` AND TO_DATE(data_recebimento, 'DD/MM/YYYY') <= CURRENT_DATE - INTERVAL '30 days'`;
            } else if (sla === 'atencao') {
                query += ` AND TO_DATE(data_recebimento, 'DD/MM/YYYY') BETWEEN CURRENT_DATE - INTERVAL '29 days' AND CURRENT_DATE - INTERVAL '21 days'`;
            }
        }

        query += " ORDER BY ultima_atualizacao DESC";
        
        console.log('📊 Query:', query);
        
        const result = await pool.query(query, values);
        res.json(result.rows);
        
    } catch (error) {
        console.error("❌ Erro ao buscar processos:", error);
        res.status(500).json({ error: 'Erro interno no servidor: ' + error.message });
    }
});

app.put('/api/processos/:nup', async (req, res) => {
    const client = await pool.connect();
    try {
        const { nup } = req.params;
        const { novoStatus, usuarioEmail, usuarioNome, statusAnterior, valorCapa, valorGlosa, valorLiberado } = req.body;

        if (!novoStatus || !usuarioEmail) return res.status(400).json({ error: 'Dados incompletos' });
        await client.query('BEGIN');
        const procResult = await client.query('SELECT id FROM processos WHERE nup = $1', [nup]);
        if (procResult.rows.length === 0) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Processo não encontrado' }); }
        const processoId = procResult.rows[0].id;
        const updates = ['status = $1', 'ultima_atualizacao = NOW()'];
        const values = [novoStatus];
        let paramCounter = 2;
        if (valorCapa !== undefined && valorCapa !== null && valorCapa !== '') { updates.push(`valor_capa = $${paramCounter++}`); values.push(Number(valorCapa)); }
        if (valorGlosa !== undefined && valorGlosa !== null && valorGlosa !== '') { updates.push(`valor_glosa = $${paramCounter++}`); values.push(Number(valorGlosa)); }
        if (valorLiberado !== undefined && valorLiberado !== null && valorLiberado !== '') { updates.push(`valor_liberado = $${paramCounter++}`); values.push(Number(valorLiberado)); }
        values.push(nup);
        await client.query(`UPDATE processos SET ${updates.join(', ')} WHERE nup = $${paramCounter}`, values);
        await client.query(`INSERT INTO historico_status (processo_id, de_status, para_status, usuario, responsavel, data_mudanca) VALUES ($1, $2, $3, $4, $5, NOW())`, [processoId, statusAnterior || 'Sem status', novoStatus, usuarioEmail, usuarioNome]);
        await client.query('COMMIT');
        res.json({ success: true, message: 'Status e valores atualizados!' });
    } catch (error) { await client.query('ROLLBACK'); console.error("Erro atualização:", error); res.status(500).json({ error: 'Erro ao atualizar processo' }); } finally { client.release(); }
});

app.put('/api/processos/:nup/colaborador', async (req, res) => {
    try {
        const { nup } = req.params;
        const { novoColaborador, usuarioEmail } = req.body;

        if (!novoColaborador) return res.status(400).json({ error: 'Nome obrigatório' });

        const query = `
            UPDATE processos 
            SET 
                responsavel = $1, 
                origem_atualizacao = $2,
                status = CASE 
                    WHEN status = 'CONCLUIDO' THEN status 
                    ELSE 'EM_ANALISE' 
                END,
                ultima_atualizacao = NOW()
            WHERE nup = $3
            RETURNING status
        `;
        
        const result = await pool.query(query, [novoColaborador, `Atribuído por ${usuarioEmail}`, nup]);

        if (result.rowCount === 0) return res.status(404).json({ error: 'Processo não encontrado' });
        
        res.json({ 
            success: true, 
            message: 'Colaborador atualizado!', 
            novoStatus: result.rows[0].status 
        });

    } catch (error) {
        console.error("Erro colaborador:", error);
        res.status(500).json({ error: 'Erro ao atualizar colaborador' });
    }
});

app.get('/api/dashboard/resumo', async (req, res) => {
    try {
        const { startDate, endDate, isFinalized } = req.query;
        
        let whereClauses = ['1=1'];
        const params = [];
        let pIndex = 1;

        if (startDate && endDate) {
            whereClauses.push(`ultima_atualizacao >= $${pIndex} AND ultima_atualizacao <= $${pIndex + 1}`);
            params.push(`${startDate} 00:00:00`, `${endDate} 23:59:59`);
            pIndex += 2;
        }

        if (isFinalized === 'true') {
            whereClauses.push(`status = 'CONCLUIDO'`);
        } else if (isFinalized === 'false') {
            whereClauses.push(`status != 'CONCLUIDO'`);
            whereClauses.push(`status != 'EXCLUIDO'`);
        } else {
            whereClauses.push(`status != 'EXCLUIDO'`);
        }

        const rawQuery = `
            SELECT 
                COALESCE(NULLIF(responsavel, ''), 'Sem Responsável') as responsavel,
                valor_capa as "valorCapa", 
                nup, 
                credenciado,
                data_recebimento as "dataRecebimento", 
                numero_processo as "numeroProcesso", 
                producao,
                status, 
                tipo_processo as "tipoProcesso", 
                tratamento, 
                ultima_atualizacao as "ultimaAtualizacao"
            FROM processos
            WHERE ${whereClauses.join(' AND ')}
        `;
        
        const rawData = await pool.query(rawQuery, params);

        const stats = {};
        rawData.rows.forEach(p => {
            const nome = p.responsavel; 
            
            // --- CÁLCULO CORRIGIDO DO DASHBOARD ---
            let valorRaw = p.valorCapa ? String(p.valorCapa).replace(',', '.') : '0';
            let valorNumerico = parseFloat(valorRaw) || 0;

            if (!stats[nome]) {
                stats[nome] = { nome: nome, qtd: 0, total: 0, processos: [] };
            }
            stats[nome].qtd += 1;
            stats[nome].total += valorNumerico;
            stats[nome].processos.push(p);
        });

        const resultado = Object.values(stats).sort((a, b) => b.total - a.total);
        res.json(resultado);

    } catch (error) {
        console.error("❌ Erro no dashboard:", error);
        res.status(500).json({ error: 'Erro ao gerar dashboard' });
    }
});

app.get('/api/filtros', async (req, res) => {
    try {
        const [respResult, tratResult, statusResult] = await Promise.all([
            pool.query("SELECT DISTINCT responsavel FROM processos WHERE responsavel IS NOT NULL AND responsavel != '' ORDER BY responsavel"),
            pool.query("SELECT DISTINCT tratamento FROM processos WHERE tratamento IS NOT NULL AND tratamento != '' ORDER BY tratamento"),
            pool.query("SELECT DISTINCT status FROM processos WHERE status IS NOT NULL AND status != '' ORDER BY status")
        ]);
        res.json({ responsaveis: respResult.rows.map(r => r.responsavel), tratamentos: tratResult.rows.map(r => r.tratamento), status: statusResult.rows.map(r => r.status) });
    } catch (error) { console.error("Erro ao buscar filtros:", error); res.status(500).json({ error: 'Erro interno ao carregar filtros' }); }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor rodando na porta ${PORT}`);
});