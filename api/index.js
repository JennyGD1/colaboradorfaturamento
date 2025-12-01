const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const cors = require('cors');

// --- CONFIGURAÇÕES ---
const app = express();
const PORT = 3001; // O backend rodará na porta 3001
const MONGODB_URI = process.env.MONGODB_URI;

// Middleware
app.use(cors()); // Permite que o React (porta diferente) acesse este servidor
app.use(express.json()); // Permite receber JSON no corpo das requisições

let db;

// Conexão com o Banco (Mantém aberta)
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

// --- ROTAS DA API ---

// 1. Buscar todos os processos (GET)
app.get('/api/processos', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const search = req.query.search || '';
        const status = req.query.status || ''; 
        // --- NOVOS PARÂMETROS ---
        const responsavel = req.query.responsavel || '';
        const tratamento = req.query.tratamento || '';

        const skip = (page - 1) * limit;

        // Monta a query do MongoDB
        let query = {};

        // 1. Busca Geral (Texto)
        if (search) {
            query.$or = [
                { numeroProcesso: { $regex: search, $options: 'i' } },
                { credenciado: { $regex: search, $options: 'i' } }
            ];
        }

        // 2. Filtro de Status
        if (status && status !== '') {
            query.status = status;
        }

        // 3. Filtro de Responsável (NOVO)
        // Se o front mandar "Andre Falcao", busca exatamente "Andre Falcao"
        if (responsavel && responsavel !== '') {
            query.responsavel = responsavel;
        }

        // 4. Filtro de Tratamento (NOVO)
        // Usa Regex para pegar parciais (Ex: "ODONTO" acha "ODONTOLOGIA")
        if (tratamento && tratamento !== '') {
            query.tratamento = { $regex: tratamento, $options: 'i' };
        }

        // --- EXECUÇÃO ---
        
        // Contar total (com os filtros aplicados para a paginação funcionar)
        const totalRegistros = await db.collection('processos').countDocuments(query);
        
        // Buscar dados paginados
        const processos = await db.collection('processos')
            .find(query)
            .sort({ dataImportacao: -1 }) // Mais recentes primeiro
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
// 2. Atualizar Status e Histórico (PUT)
app.put('/api/processos/:nup', async (req, res) => {
    const { nup } = req.params;
    const { novoStatus, usuarioEmail, usuarioNome, statusAnterior } = req.body;

    if (!novoStatus || !usuarioEmail) {
        return res.status(400).json({ error: 'Dados incompletos' });
    }

    try {
        const resultado = await db.collection('processos').updateOne(
            { nup: nup },
            {
                $set: { 
                    status: novoStatus,
                    ultimaAtualizacao: new Date()
                },
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

        if (resultado.modifiedCount === 0) {
            return res.status(404).json({ error: 'Processo não encontrado' });
        }

        res.json({ success: true, message: 'Status atualizado com sucesso!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao atualizar processo' });
    }
});

app.put('/api/processos/:nup/colaborador', async (req, res) => {
    const { nup } = req.params;
    const { novoColaborador, usuarioEmail } = req.body;

    // Validação simples
    if (!novoColaborador) {
        return res.status(400).json({ error: 'Nome do colaborador é obrigatório' });
    }

    try {
        const resultado = await db.collection('processos').updateOne(
            { nup: nup },
            {
                $set: { 
                    colaborador: novoColaborador, // Campo que será salvo no Mongo
                    dataAtribuicao: new Date(),
                    atribuidoPor: usuarioEmail
                }
            }
        );

        if (resultado.modifiedCount === 0) {
            return res.status(404).json({ error: 'Processo não encontrado ou valor idêntico' });
        }

        res.json({ success: true, message: 'Colaborador atualizado com sucesso!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Erro ao atualizar colaborador' });
    }
});
app.get('/api/dashboard/resumo', async (req, res) => {
    try {
        const { startDate, endDate, isFinalized } = req.query;

        // Base da Query: processos que têm responsável
        const baseQuery = { 
            responsavel: { $exists: true, $ne: "" } 
        };
        
        // 1. FILTRO DE DATA (dataRegulacao)
        if (startDate && endDate) {
            // Adiciona dataRegulacao ao filtro. Assumindo que dataRegulacao é a data de finalização.
            baseQuery.dataRegulacao = {
                $gte: startDate,
                $lte: endDate
            };
        }
        if (isFinalized === 'true') {
            baseQuery.status = 'assinado e tramitado';
        } 
        // Se isFinalized for 'false', ele busca todos os demais (GERAL / NÃO FINALIZADOS)
        else if (isFinalized === 'false') {
             // O "Geral" é tudo que tem responsável mas NÃO está "assinado e tramitado"
             baseQuery.status = { $ne: 'assinado e tramitado' };
        }
        // Busca apenas processos que têm responsável
        const processos = await db.collection('processos').find({ 
            responsavel: { $exists: true, $ne: "" } 
        }).project({ 
            responsavel: 1, 
            valorCapa: 1,
            nup: 1,
            credenciado: 1,
            dataRecebimento: 1,
            numeroProcesso: 1,
            producao: 1,
            status: 1,
            tipoProcesso: 1,
            tratamento: 1,
            ultimaAtualizacao: 1
        }).toArray();

        const stats = {};

        processos.forEach(p => {
            const nome = p.responsavel;
            
            // Tratamento do valor (converte string "1.500,00" para float 1500.00)
            let valorNumerico = 0;
            if (p.valorCapa) {
                if (typeof p.valorCapa === 'number') {
                    valorNumerico = p.valorCapa;
                } else {
                    // Remove pontos de milhar e troca vírgula por ponto
                    const limpo = p.valorCapa.toString().replace(/\./g, '').replace(',', '.');
                    valorNumerico = parseFloat(limpo) || 0;
                }
            }

            if (!stats[nome]) {
                stats[nome] = { 
                    nome: nome, 
                    qtd: 0, 
                    total: 0,
                    processos: [] // Array para armazenar os processos detalhados
                };
            }

            stats[nome].qtd += 1;
            stats[nome].total += valorNumerico;
            
            // Adiciona os detalhes do processo ao array
            stats[nome].processos.push({
                nup: p.nup,
                credenciado: p.credenciado,
                dataRecebimento: p.dataRecebimento,
                numeroProcesso: p.numeroProcesso,
                producao: p.produco,
                status: p.status,
                tipoProcesso: p.tipoProcesso,
                tratamento: p.tratamento,
                ultimaAtualizacao: p.ultimaAtualizacao,
                valorCapa: p.valorCapa
            });
        });

        // Transforma objeto em array e ordena por maior valor total
        const resultado = Object.values(stats).sort((a, b) => b.total - a.total);

        res.json(resultado);
    } catch (error) {
        console.error("Erro no dashboard:", error);
        res.status(500).json({ error: 'Erro ao gerar dashboard' });
    }
});

// Iniciar Servidor
app.listen(PORT, () => {
    console.log(`🚀 Servidor Backend rodando em http://localhost:${PORT}`);
});
