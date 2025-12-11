const express = require('express');
const { MongoClient } = require('mongodb');
const cors = require('cors');

// --- CONFIGURAÇÕES ---
const app = express();
const PORT = process.env.PORT || 3001; 
const MONGODB_URI = process.env.MONGODB_URI;

// --- CONFIGURAÇÃO DE CORS (ATUALIZADA) ---
// Usando origin: '*' liberamos acesso de QUALQUER lugar temporariamente.
// Isso resolve problemas de URLs de preview da Vercel ou variações (www).
app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.use(express.json());

let db;

// --- CONEXÃO MONGO ---
async function conectarMongo() {
    try {
        const client = new MongoClient(MONGODB_URI);
        await client.connect();
        db = client.db('guias_db');
        console.log('✅ API conectada ao MongoDB!');
    } catch (error) {
        console.error('❌ Falha na conexão com Mongo:', error);
    }
}
conectarMongo();


app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'online', 
        timestamp: new Date().toISOString(),
        db: db ? 'connected' : 'disconnected'
    });
});

app.put('/api/processos/:nup', async (req, res) => {
    if (!db) return res.status(503).json({ error: 'Banco de dados iniciando...' });

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

    try {
        const updateFields = {
            status: novoStatus,
            ultimaAtualizacao: new Date()
        };


        if (valorCapa !== undefined && valorCapa !== null) updateFields.valorCapa = Number(valorCapa);
        if (valorGlosa !== undefined && valorGlosa !== null) updateFields.valorGlosa = Number(valorGlosa);
        if (valorLiberado !== undefined && valorLiberado !== null) updateFields.valorLiberado = Number(valorLiberado);

        const resultado = await db.collection('processos').updateOne(
            { nup: nup },
            {
                $set: updateFields,
                $push: {
                    historicoStatus: {
                        de: statusAnterior || 'Sem status',
                        para: novoStatus,
                        usuario: usuarioEmail,
                        responsavel: usuarioNome,
                        data: new Date()
                    }
                }
            }
        );
        if (resultado.modifiedCount === 0) return res.status(404).json({ error: 'Processo não encontrado' });
        res.json({ success: true, message: 'Status e valores atualizados!' });
    } catch (error) {
        console.error("Erro atualização:", error);
        res.status(500).json({ error: 'Erro ao atualizar processo' });
    }
});

app.put('/api/processos/:nup', async (req, res) => {
    if (!db) return res.status(503).json({ error: 'Banco de dados iniciando...' });

    const { nup } = req.params;
    const { novoStatus, usuarioEmail, usuarioNome, statusAnterior } = req.body;

    if (!novoStatus || !usuarioEmail) return res.status(400).json({ error: 'Dados incompletos' });

    try {
        const resultado = await db.collection('processos').updateOne(
            { nup: nup },
            {
                $set: { status: novoStatus, ultimaAtualizacao: new Date() },
                $push: {
                    historicoStatus: {
                        de: statusAnterior || 'Sem status',
                        para: novoStatus,
                        usuario: usuarioEmail,
                        responsavel: usuarioNome,
                        data: new Date()
                    }
                }
            }
        );
        if (resultado.modifiedCount === 0) return res.status(404).json({ error: 'Processo não encontrado' });
        res.json({ success: true, message: 'Status atualizado!' });
    } catch (error) {
        console.error("Erro atualização:", error);
        res.status(500).json({ error: 'Erro ao atualizar processo' });
    }
});

app.put('/api/processos/:nup/colaborador', async (req, res) => {
    if (!db) return res.status(503).json({ error: 'Banco de dados iniciando...' });

    const { nup } = req.params;
    const { novoColaborador, usuarioEmail } = req.body;

    if (!novoColaborador) return res.status(400).json({ error: 'Nome obrigatório' });

    try {
        const resultado = await db.collection('processos').updateOne(
            { nup: nup },
            {
                $set: { 
                    colaborador: novoColaborador,
                    dataAtribuicao: new Date(),
                    atribuidoPor: usuarioEmail
                }
            }
        );
        if (resultado.modifiedCount === 0) return res.status(404).json({ error: 'Processo não encontrado' });
        res.json({ success: true, message: 'Colaborador atualizado!' });
    } catch (error) {
        console.error("Erro colaborador:", error);
        res.status(500).json({ error: 'Erro ao atualizar colaborador' });
    }
});

app.get('/api/dashboard/resumo', async (req, res) => {
    try {
        if (!db) return res.status(503).json({ error: 'Banco de dados iniciando...' });

        const { startDate, endDate, isFinalized } = req.query;
        const baseQuery = { responsavel: { $exists: true, $ne: "" } };
        
        if (startDate && endDate) {
            baseQuery.dataRegulacao = { $gte: startDate, $lte: endDate };
        }
        if (isFinalized === 'true') {
            baseQuery.status = 'assinado e tramitado';
        } else if (isFinalized === 'false') {
             baseQuery.status = { $ne: 'assinado e tramitado' };
        }

        const processos = await db.collection('processos').find(baseQuery).project({ 
            responsavel: 1, valorCapa: 1, nup: 1, credenciado: 1,
            dataRecebimento: 1, numeroProcesso: 1, producao: 1,
            status: 1, tipoProcesso: 1, tratamento: 1, ultimaAtualizacao: 1
        }).toArray();

        const stats = {};
        processos.forEach(p => {
            const nome = p.responsavel;
            let valorNumerico = 0;
            if (p.valorCapa) {
                if (typeof p.valorCapa === 'number') {
                    valorNumerico = p.valorCapa;
                } else {
                    const limpo = p.valorCapa.toString().replace(/\./g, '').replace(',', '.');
                    valorNumerico = parseFloat(limpo) || 0;
                }
            }

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
        console.error("Erro dashboard:", error);
        res.status(500).json({ error: 'Erro ao gerar dashboard' });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor rodando na porta ${PORT}`);
});
