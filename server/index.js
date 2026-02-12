const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config(); 

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
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const search = req.query.search || '';
        const status = req.query.status || '';
        const responsavel = req.query.responsavel || '';
        const tratamento = req.query.tratamento || '';
        const producao = req.query.producao || '';
        
        const offset = (page - 1) * limit;
        
        const params = [];
        let whereClauses = ['1=1'];
        let paramIndex = 1;

        if (search) {
            whereClauses.push(`(numero_processo ILIKE $${paramIndex} OR credenciado ILIKE $${paramIndex})`);
            params.push(`%${search}%`);
            paramIndex++;
        }
        if (status) {
            whereClauses.push(`status = $${paramIndex}`);
            params.push(status);
            paramIndex++;
        }
        if (responsavel) {
            whereClauses.push(`responsavel ILIKE $${paramIndex}`);
            params.push(`%${responsavel}%`);
            paramIndex++;
        }
        if (tratamento) {
            whereClauses.push(`tratamento ILIKE $${paramIndex}`);
            params.push(`%${tratamento}%`);
            paramIndex++;
        }
        if (producao) {
            whereClauses.push(`producao ILIKE $${paramIndex}`);
            params.push(`%${producao}%`);
            paramIndex++;
        }

        const whereSql = whereClauses.join(' AND ');

        const countQuery = `SELECT COUNT(*) FROM processos WHERE ${whereSql}`;
        const countResult = await pool.query(countQuery, params);
        const totalRegistros = parseInt(countResult.rows[0].count);

        const dataQuery = `
            SELECT 
                id,
                id as "_id", 
                nup,
                numero_processo as "numeroProcesso",
                credenciado,
                data_recebimento as "dataRecebimento",
                status,
                valor_capa as "valorCapa",
                valor_glosa as "valorGlosa",
                valor_liberado as "valorLiberado",
                responsavel,
                tratamento,
                producao,
                tipo_processo as "tipoProcesso",
                ultima_atualizacao as "ultimaAtualizacao",
                (
                    SELECT json_agg(json_build_object(
                        'de', h.de_status,
                        'para', h.para_status,
                        'usuario', h.usuario,
                        'responsavel', h.responsavel,
                        'data', h.data_mudanca
                    ))
                    FROM historico_status h
                    WHERE h.processo_id = processos.id
                ) as "historicoStatus"
            FROM processos
            WHERE ${whereSql}
            ORDER BY id ASC (NULLIF(data_recebimento, ''), 'DD/MM/YYYY') ASC NULLS LAST
            LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
        `;

        const dataParams = [...params, limit, offset];
        const { rows } = await pool.query(dataQuery, dataParams);

        const processosFormatados = rows.map(p => ({
            ...p,
            historicoStatus: p.historicoStatus || [],
            valorCapa: parseFloat(p.valorCapa || 0),
            valorGlosa: parseFloat(p.valorGlosa || 0),
            valorLiberado: parseFloat(p.valorLiberado || 0)
        }));

        res.json({
            data: processosFormatados,
            meta: {
                total: totalRegistros,
                page: page,
                limit: limit,
                totalPages: Math.ceil(totalRegistros / limit)
            }
        });

    } catch (error) {
        console.error("Erro na busca:", error);
        res.status(500).json({ error: 'Erro interno ao buscar processos' });
    }
});

app.put('/api/processos/:nup', async (req, res) => {
    const client = await pool.connect();
    
    try {
        const { nup } = req.params;
        const { 
            novoStatus, 
            usuarioEmail, 
            usuarioNome, 
            statusAnterior,
            valorCapa,      
            valorGlosa,     
            valorLiberado   
        } = req.body;

        if (!novoStatus || !usuarioEmail) return res.status(400).json({ error: 'Dados incompletos' });

        await client.query('BEGIN');

        const procResult = await client.query('SELECT id FROM processos WHERE nup = $1', [nup]);
        if (procResult.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Processo não encontrado' });
        }
        const processoId = procResult.rows[0].id;

        const updates = ['status = $1', 'ultima_atualizacao = NOW()'];
        const values = [novoStatus];
        let paramCounter = 2;

        if (valorCapa !== undefined && valorCapa !== null && valorCapa !== '') {
            updates.push(`valor_capa = $${paramCounter++}`);
            values.push(Number(valorCapa));
        }
        if (valorGlosa !== undefined && valorGlosa !== null && valorGlosa !== '') {
            updates.push(`valor_glosa = $${paramCounter++}`);
            values.push(Number(valorGlosa));
        }
        if (valorLiberado !== undefined && valorLiberado !== null && valorLiberado !== '') {
            updates.push(`valor_liberado = $${paramCounter++}`);
            values.push(Number(valorLiberado));
        }

        values.push(nup);
        const updateQuery = `
            UPDATE processos 
            SET ${updates.join(', ')} 
            WHERE nup = $${paramCounter}
        `;
        
        await client.query(updateQuery, values);

        const insertHistoryQuery = `
            INSERT INTO historico_status 
            (processo_id, de_status, para_status, usuario, responsavel, data_mudanca)
            VALUES ($1, $2, $3, $4, $5, NOW())
        `;
        await client.query(insertHistoryQuery, [
            processoId, 
            statusAnterior || 'Sem status', 
            novoStatus, 
            usuarioEmail, 
            usuarioNome
        ]);

        await client.query('COMMIT');
        res.json({ success: true, message: 'Status e valores atualizados!' });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Erro atualização:", error);
        res.status(500).json({ error: 'Erro ao atualizar processo' });
    } finally {
        client.release();
    }
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

        // Filtro de Data
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

        const query = `
            SELECT 
                COALESCE(NULLIF(responsavel, ''), 'Sem Responsável') as nome,
                COUNT(*) as qtd,
                SUM(CAST(valor_capa AS DECIMAL)) as total
            FROM processos
            WHERE ${whereClauses.join(' AND ')}
            GROUP BY COALESCE(NULLIF(responsavel, ''), 'Sem Responsável')
            ORDER BY total DESC
        `;

        const { rows } = await pool.query(query, params);

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
            let valorRaw = p.valorCapa ? p.valorCapa.toString().replace('.', '').replace(',', '.') : '0';
            if (typeof p.valorCapa === 'number') valorRaw = p.valorCapa;
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

        res.json({
            responsaveis: respResult.rows.map(r => r.responsavel),
            tratamentos: tratResult.rows.map(r => r.tratamento),
            status: statusResult.rows.map(r => r.status)
        });
    } catch (error) {
        console.error("Erro ao buscar filtros:", error);
        res.status(500).json({ error: 'Erro interno ao carregar filtros' });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor rodando na porta ${PORT}`);
});