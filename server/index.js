const express = require('express');
const { MongoClient } = require('mongodb');
const cors = require('cors');

// --- CONFIGURAÇÕES ---
const app = express();
// O Render define a porta automaticamente na variável process.env.PORT
const PORT = process.env.PORT || 3001; 
const MONGODB_URI = process.env.MONGODB_URI;

// --- CONFIGURAÇÃO DE CORS ---
// Permite que o seu frontend no Vercel converse com este backend
const allowedOrigins = [
  'http://localhost:5173',
  'https://colaboradorfaturamento.vercel.app' // Seu frontend no Vercel
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) === -1) {
      return callback(null, true); // Em desenvolvimento/teste, permitimos. Em prod, pode restringir.
    }
    return callback(null, true);
  },
  credentials: true
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

// --- ROTAS ---

app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'online', 
    timestamp: new Date().toISOString(),
    db: db ? 'connected' : 'disconnected'
  });
});

app.get('/api/processos', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const search = req.query.search || '';
        const status = req.query.status || ''; 
        const responsavel = req.query.responsavel || '';
        const tratamento = req.query.tratamento || '';

        const skip = (page - 1) * limit;
        let query = {};

        if (search) {
            query.$or = [
                { numeroProcesso: { $regex: search, $options: 'i' } },
                { credenciado: { $regex: search, $options: 'i' } }
            ];
        }
        if (status) query.status = status;
        if (responsavel) query.responsavel = responsavel;
        if (tratamento) query.tratamento = { $regex: tratamento, $options: 'i' };

        const totalRegistros = await db.collection('processos').countDocuments(query);
        const processos = await db.collection('processos')
            .find(query)
            .sort({ dataImportacao: -1 })
            .skip(skip)
            .limit(limit)
            .toArray();

        res.json({
            data: processos,
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
        res.status(500).json({ error: 'Erro ao atualizar processo' });
    }
});

app.put('/api/processos/:nup/colaborador', async (req, res) => {
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
        res.status(500).json({ error: 'Erro ao atualizar colaborador' });
    }
});

app.get('/api/dashboard/resumo', async (req, res) => {
    try {
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
        res.status(500).json({ error: 'Erro ao gerar dashboard' });
    }
});

// O Render exige que escutemos em '0.0.0.0'
app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor rodando na porta ${PORT}`);
});
