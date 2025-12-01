import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithRedirect, // NOVO: Usado para evitar problemas de pop-up (COOP)
  getRedirectResult, // NOVO: Usado para capturar o resultado após o redirecionamento
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  Activity, LogOut, FileText, History, CheckCircle, AlertCircle,
  Search, Clock, User, Save, X, ChevronDown, ChevronLeft, ChevronRight,
  Stethoscope, LayoutGrid, List, DollarSign, BarChart3
} from 'lucide-react';

import './App.css'; 

// --- CONFIGURAÇÃO FIREBASE ---
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};
// --- VERIFICAÇÃO E INICIALIZAÇÃO ---
const isFirebaseConfigValid = 
  import.meta.env.VITE_FIREBASE_API_KEY &&
  import.meta.env.VITE_FIREBASE_AUTH_DOMAIN &&
  import.meta.env.VITE_FIREBASE_PROJECT_ID;

if (!isFirebaseConfigValid) {
  console.error('❌ Configuração do Firebase incompleta. Verifique o arquivo .env');
}

// Inicializa o Firebase apenas se a configuração for válida
const app = isFirebaseConfigValid ? initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;

// CORREÇÃO: API_URL agora aponta para o caminho relativo '/api' no Vercel.
// Isso só funcionará se você tiver criado o api/index.js e o vercel.json.
const API_URL = import.meta.env.VITE_API_BASE_URL || '/api';
const ITEMS_PER_PAGE = 20;

const ADMIN_EMAILS = [
  'rossyneide@maida.health',
  'jennifer.batista@maida.health',
  'lucas@maida.health'
];

const LISTA_COLABORADORES_PADRAO = [
  'ANA', 'Andre Falcao', 'Andressa', 'Deise', 'Eduarda', 
  'Giselly', 'Luziane', 'Marcia', 'Naila', 'Tamera', 'Paulo', 'Karen'
];

const LISTA_TRATAMENTOS = [
  "ANESTESIOLOGIA", "ATENDIMENTO MEDICO NA REDE CREDENCIADA", "EMERGENCIA/URGENCIA",
  "HEMODINAMICA", "INTERNAÇÃO DOMICILIAR - JUDICIAL", "INTERNAMENTO", "LEITO DIA", "ODONTO"
];

const LISTA_STATUS = [
  'pendente auditoria', 'para análise', 'em análise', 'Assinado analista',
  'assinado gestor', 'assinado e tramitado', 'auditoria odonto',
  'pendente prestador', 'pendente cliente', 'arquivado'
];

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [firebaseError, setFirebaseError] = useState('');
  
  // Controle de Visualização
  const [currentView, setCurrentView] = useState('lista');

  // Dados
  const [processos, setProcessos] = useState([]);
  const [dashboardData, setDashboardData] = useState([]);

  // Filtros de Lista
  const [filtro, setFiltro] = useState('');
  const [filtroResponsavel, setFiltroResponsavel] = useState(''); 
  const [filtroTratamento, setFiltroTratamento] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  
  // Filtros de DASHBOARD (Novas regras)
  const [dashboardStartDate, setDashboardStartDate] = useState(() => {
    const today = new Date();
    // Inicia no primeiro dia do mês atual
    return new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  });
  const [dashboardEndDate, setDashboardEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [filtroFinalizado, setFiltroFinalizado] = useState('true'); // SEMPRE INICIA EM FINALIZADOS
  
  // Paginação
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRegistros, setTotalRegistros] = useState(0);

  const [opcoesColaboradores, setOpcoesColaboradores] = useState(LISTA_COLABORADORES_PADRAO);

  // Modais
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedProcesso, setSelectedProcesso] = useState(null);
  
  // Modal de Detalhes do Colaborador (Dashboard)
  const [modalColaboradorOpen, setModalColaboradorOpen] = useState(false);
  const [selectedColaborador, setSelectedColaborador] = useState(null);
  const [processosColaborador, setProcessosColaborador] = useState([]);

  const [novoColaborador, setNovoColaborador] = useState(''); 
  const [erroLogin, setErroLogin] = useState('');


  // --- FUNÇÕES DE UTILIDADE ---
  const getStatusClass = (s) => s ? 'status-' + s.toLowerCase().replace(/ /g, '-').normalize('NFD').replace(/[\u0300-\u036f]/g, "") : 'status-default';
  const formatCurrency = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);


  // --- AUTH (Monitora Mudanças de Estado) ---
  useEffect(() => {
    if (!auth) {
      setFirebaseError('Configuração do Firebase não encontrada. Verifique o arquivo .env');
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        // Regra de domínio de email
        if (!currentUser.email || (!currentUser.email.endsWith('@maida.health') && !currentUser.email.includes('gmail'))) {
           setErroLogin('Acesso restrito a e-mails corporativos.');
           signOut(auth);
           return;
        }
        setUser(currentUser);
      } else {
        setUser(null); 
        setProcessos([]);
      }
      setLoading(false);
    });
    
    return () => unsubscribe();
  }, []);
  
  // --- AUTH (Captura o Resultado do Redirecionamento) ---
  useEffect(() => {
    if (!auth) return;

    const handleRedirectResult = async () => {
        try {
            // Tenta obter o resultado após o redirecionamento do Google
            const result = await getRedirectResult(auth);
            
            if (result) {
                // Autenticação bem-sucedida. O onAuthStateChanged (acima) cuidará de setar o user.
                console.log("Login bem-sucedido via Redirect.");
            }
        } catch (error) {
            // Lida com erros após o redirecionamento
            console.error("Erro no Redirect Result:", error);
            setErroLogin(`Erro ao autenticar: ${error.message}`);
        }
    };

    // Só chama se o auth estiver pronto.
    if (auth) {
        handleRedirectResult();
    }
  }, [auth]);

  // --- BUSCA LISTA PRINCIPAL (Função useCallback para otimização) ---
  const buscarProcessos = useCallback(async (page = 1, searchTerm = '', respTerm = '', tratTerm = '', statusTerm = '') => {
    try {
      setLoading(true);
      const response = await axios.get(`${API_URL}/processos`, {
        params: { page, limit: ITEMS_PER_PAGE, search: searchTerm, responsavel: respTerm, tratamento: tratTerm, status: statusTerm }
      });
      setProcessos(response.data.data || []);
      setTotalPages(response.data.meta?.totalPages || 1);
      setTotalRegistros(response.data.meta?.total || 0);
      setCurrentPage(response.data.meta?.page || 1);
    } catch (error) {
      console.error("Erro busca:", error);
      // Erro mais comum é ERR_NETWORK (Backend não está no ar ou URL API incorreta)
      setErroLogin("Erro de conexão com o servidor. Verifique se a API está no ar.");
    } finally {
      setLoading(false);
    }
  }, []);

  // --- BUSCA DADOS DASHBOARD (Função carregarDashboard) ---
  const carregarDashboard = async () => {
    try {
        setLoading(true);
        const response = await axios.get(`${API_URL}/dashboard/resumo`, {
             params: {
                 startDate: dashboardStartDate,
                 endDate: dashboardEndDate,
                 isFinalized: filtroFinalizado
             }
        });
        setDashboardData(response.data);
    } catch (error) {
        console.error("Erro dashboard:", error);
        setErroLogin("Erro de conexão com o servidor. Verifique se a API está no ar.");
    } finally {
        setLoading(false);
    }
  };


  // --- DETALHES COLABORADOR (MODAL) ---
  const abrirDetalhesColaborador = async (colaborador) => {
    setSelectedColaborador(colaborador);
    setModalColaboradorOpen(true);
    // Usa os processos que já vieram no dashboard
    setProcessosColaborador(colaborador.processos || []);
  };


  // Efeito de Atualização Principal (Lista e Dashboard)
  useEffect(() => {
    if (user) {
        if (currentView === 'lista') {
            // Chama a busca com todos os filtros de lista
            buscarProcessos(currentPage, filtro, filtroResponsavel, filtroTratamento, filtroStatus);
        } else {
            // Recarrega o dashboard sempre que um filtro de data ou status do dashboard mudar
            carregarDashboard();
        }
    }
  }, [
      currentPage, filtroResponsavel, filtroTratamento, filtroStatus, 
      user, currentView, dashboardStartDate, dashboardEndDate, filtroFinalizado, buscarProcessos 
  ]); 


  // Debounce Filtro Texto (Lista)
  useEffect(() => {
    if (!user || currentView !== 'lista') return;
    const t = setTimeout(() => { setCurrentPage(1); buscarProcessos(1, filtro, filtroResponsavel, filtroTratamento, filtroStatus); }, 500);
    return () => clearTimeout(t);
  }, [filtro, user, buscarProcessos, currentView, filtroResponsavel, filtroTratamento, filtroStatus]);


  // --- AÇÕES ---
  const mudarPagina = (n) => { if (n >= 1 && n <= totalPages) setCurrentPage(n); };

  const handleLogin = async () => {
    if (!auth) return;
    const provider = new GoogleAuthProvider();
    try { 
      // *** CORREÇÃO AQUI: Usa Redirecionamento ***
      await signInWithRedirect(auth, provider); 
    } catch (e) { 
      setErroLogin('Erro Login Google'); 
    }
  };

  const alterarStatus = async (novoStatus) => {
    if (!selectedProcesso || !user) return;
    const statusAntigo = selectedProcesso.status || '';
    
    // Regra: Não permitir alteração se já estiver 'assinado e tramitado'
    if (statusAntigo === 'assinado e tramitado' && novoStatus !== 'assinado e tramitado') {
        alert("Processos com status 'assinado e tramitado' não podem ser alterados.");
        return;
    }
    
    // Otimista
    const processoAtualizado = { ...selectedProcesso, status: novoStatus, historicoStatus: [...(selectedProcesso.historicoStatus || []), { de: statusAntigo, para: novoStatus, usuario: user.email, responsavel: user.displayName, data: new Date().toISOString() }] };
    setSelectedProcesso(processoAtualizado);
    setProcessos(prev => prev.map(p => p.nup === selectedProcesso.nup ? processoAtualizado : p));

    try {
      await axios.put(`${API_URL}/processos/${selectedProcesso.nup}`, { novoStatus, statusAnterior: statusAntigo, usuarioEmail: user.email, usuarioNome: user.displayName });
      // Se estiver no dashboard, recarrega para refletir a mudança no filtro
      if (currentView === 'dashboard') carregarDashboard(); 
    } catch (e) { 
        alert("Erro ao salvar."); 
        buscarProcessos(currentPage, filtro, filtroResponsavel, filtroTratamento, filtroStatus); 
    }
  };

  const salvarColaborador = async () => {
    if (!selectedProcesso || !user) return;
    if (novoColaborador && !opcoesColaboradores.includes(novoColaborador)) setOpcoesColaboradores(p => [...p, novoColaborador].sort());
    
    const processoAtualizado = { ...selectedProcesso, responsavel: novoColaborador };
    setSelectedProcesso(processoAtualizado);
    setProcessos(prev => prev.map(p => p.nup === selectedProcesso.nup ? processoAtualizado : p));

    try {
        await axios.put(`${API_URL}/processos/${selectedProcesso.nup}/colaborador`, { novoColaborador, usuarioEmail: user.email });
        alert("Colaborador atualizado!");
    } catch (e) { alert("Erro ao salvar."); buscarProcessos(currentPage, filtro, filtroResponsavel, filtroTratamento, filtroStatus); }
  };


  if (loading && processos.length === 0 && dashboardData.length === 0 && !user) {
      return (
        <div className="login-page">
          <Activity className="animate-spin" size={40} color="#0070ff" />
          {firebaseError && (
            <div style={{ marginTop: '20px', color: '#dc2626', textAlign: 'center' }}>
              <AlertCircle size={20} />
              <p>{firebaseError}</p>
            </div>
          )}
        </div>
      );
    }
  if (!user) {
    return (
      <div className="login-page"> 
        <div className="login-card"> 
          <div className="login-icon-area"><FileText size={40} /></div>
          <h1 className="login-title">Portal Faturamento</h1>
          <p className="login-subtitle">Acesso Restrito</p>
          
          {firebaseError && (
            <div className="login-error">
              <AlertCircle size={16} /> 
              Erro de configuração: {firebaseError}
            </div>
          )}
          
          {erroLogin && (
            <div className="login-error">
              <AlertCircle size={16} /> 
              {erroLogin}
            </div>
          )}
          
          <button 
            onClick={handleLogin} 
            className="btn-login-google"
            disabled={!auth}
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt="Google" />
            {auth ? 'Entrar com Google' : 'Configuração Incompleta'}
          </button>
          
          {!auth && (
            <div style={{ marginTop: '15px', fontSize: '0.8rem', color: '#666' }}>
              ⚠️ Configure as variáveis de ambiente no arquivo .env
            </div>
          )}
        </div>
      </div>
    );
  }

  const isAdmin = ADMIN_EMAILS.includes(user.email);

  return (
    <div className="app-container">
      <header>
        <div className="container header-content">
            <div className="logo-text">
                <CheckCircle size={28} color="#ffcc00" />
                <span>Fatura<span style={{ color: '#ffcc00' }}>Maida</span></span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                {/* MENU DE NAVEGAÇÃO (SÓ ADMIN VÊ O DASHBOARD) */}
                {isAdmin && (
                    <div className="nav-buttons">
                        <button 
                            className={`nav-btn ${currentView === 'lista' ? 'active' : ''}`}
                            onClick={() => setCurrentView('lista')}
                        >
                            <List size={18} /> Lista
                        </button>
                        <button 
                            className={`nav-btn ${currentView === 'dashboard' ? 'active' : ''}`}
                            onClick={() => setCurrentView('dashboard')}
                        >
                            <LayoutGrid size={18} /> Dashboard
                        </button>
                    </div>
                )}
                
                {user && (
                    <div style={{ textAlign: 'right', fontSize: '0.9rem' }}>
                      <strong>{user.displayName}</strong>
                      <div style={{ fontSize: '0.8rem', opacity: 0.8 }}>{user.email}</div>
                    </div>
                )}
                <button onClick={() => signOut(auth)} className="btn-logout" title="Sair"><LogOut size={20} /></button>
            </div>
        </div>
      </header>

      <main className="container">
        
        {/* --- VIEW: LISTA DE PROCESSOS (CONTEÚDO RESTAURADO) --- */}
        {currentView === 'lista' && (
            <>
                <div className="filters-bar">
                  <div style={{ flex: 1 }}>
                    <h2 style={{ fontSize: '1.5rem', marginBottom: '5px' }}>Processos</h2>
                    <p style={{ color: '#666' }}>Total: {totalRegistros} registros</p>
                  </div>

                  <div style={{display: 'flex', gap: '10px', flexWrap: 'wrap'}}>
                    
                    {/* Filtro de Status */}
                    <div style={{ position: 'relative', minWidth: '180px' }}>
                        <select 
                            className="search-input" 
                            value={filtroStatus} 
                            onChange={(e) => { setCurrentPage(1); setFiltroStatus(e.target.value); }} 
                            style={{width: '100%'}}
                        >
                            <option value="">Status: Todos</option>
                            {LISTA_STATUS.map(status => <option key={status} value={status}>{status}</option>)}
                        </select>
                        <ChevronDown size={16} style={{ position: 'absolute', right: '12px', top: '14px', color: '#999', pointerEvents: 'none' }} />
                    </div>

                    <div style={{ position: 'relative', minWidth: '180px' }}>
                        <select className="search-input" value={filtroResponsavel} onChange={(e) => { setCurrentPage(1); setFiltroResponsavel(e.target.value); }} style={{width: '100%'}}>
                            <option value="">Resp: Todos</option>
                            {opcoesColaboradores.map(nome => <option key={nome} value={nome}>{nome}</option>)}
                        </select>
                        <ChevronDown size={16} style={{ position: 'absolute', right: '12px', top: '14px', color: '#999', pointerEvents: 'none' }} />
                    </div>
                    <div style={{ position: 'relative', minWidth: '200px' }}>
                        <select className="search-input" value={filtroTratamento} onChange={(e) => { setCurrentPage(1); setFiltroTratamento(e.target.value); }} style={{width: '100%'}}>
                            <option value="">Tratamento: Todos</option>
                            {LISTA_TRATAMENTOS.map(trat => <option key={trat} value={trat}>{trat}</option>)}
                        </select>
                        <ChevronDown size={16} style={{ position: 'absolute', right: '12px', top: '14px', color: '#999', pointerEvents: 'none' }} />
                    </div>
                    <div style={{ position: 'relative', minWidth: '250px' }}>
                        <input type="text" placeholder="Busca por Nº Processo" className="search-input" value={filtro} onChange={(e) => setFiltro(e.target.value)} style={{ width: '100%', paddingLeft: '40px' }} />
                        <Search size={18} style={{ position: 'absolute', left: '12px', top: '12px', color: '#999' }} />
                    </div>
                  </div>
                </div>

                {loading && processos.length === 0 ? (
                    <div style={{textAlign: 'center', padding: '40px'}}><Activity className="animate-spin" size={40} color="#ffcc00" style={{margin: '0 auto'}}/><p>Carregando...</p></div>
                ) : (
                <>
                    <div className="modules-grid">
                      {processos.map((processo) => {
                        const nomeResponsavel = processo.responsavel || processo.colaborador;
                        return (
                          <div key={processo._id || Math.random()} className="module-card" onClick={() => { setSelectedProcesso(processo); setModalOpen(true); }}>
                            <div className="card-header" style={{ marginBottom: '10px' }}>
                              <span className={`status-badge ${getStatusClass(processo.status)}`}>{processo.status || 'NOVO'}</span>
                              <span style={{ fontSize: '0.8rem', color: '#999', display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={12} /> {processo.dataRecebimento}</span>
                            </div>
                            {nomeResponsavel ? (
                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', backgroundColor: '#eff6ff', color: '#1d4ed8', padding: '4px 10px', borderRadius: '6px', fontSize: '0.85rem', fontWeight: '600', marginBottom: '8px', border: '1px solid #dbeafe' }}>
                                    <User size={14} /> {nomeResponsavel}
                                </div>
                            ) : <div style={{ fontSize: '0.8rem', color: '#999', marginBottom: '8px', fontStyle: 'italic' }}>Sem responsável</div>}
                            <h3 className="card-title" style={{ marginBottom: '5px', color: '#333' }}>{processo.credenciado}</h3>
                            {processo.tratamento && (
                                <div style={{ fontSize: '0.85rem', color: '#4b5563', marginBottom: '15px', display: 'flex', alignItems: 'flex-start', gap: '6px' }}>
                                    <Stethoscope size={14} style={{marginTop: '2px', flexShrink: 0, color: '#ffcc00'}} />
                                    <span style={{fontWeight: 500, textTransform: 'uppercase'}}>{processo.tratamento}</span>
                                </div>
                            )}
                            <div className="card-info" style={{ marginTop: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', borderTop: '1px solid #f0f0f0', paddingTop: '10px' }}>
                              <div><small style={{display:'block', color:'#999'}}>Processo</small> <strong>{processo.numeroProcesso}</strong></div>
                              <div><small style={{display:'block', color:'#999'}}>Valor</small> <strong>R$ {processo.valorCapa}</strong></div>
                            </div>
                          </div>
                        )})}
                    </div>
                    {processos.length > 0 && (
                        <div className="pagination-container">
                            <button className="btn-pagination" onClick={() => mudarPagina(currentPage - 1)} disabled={currentPage === 1 || loading}><ChevronLeft size={20} /> Anterior</button>
                            <span className="pagination-info">Página <strong>{currentPage}</strong> de <strong>{totalPages}</strong></span>
                            <button className="btn-pagination" onClick={() => mudarPagina(currentPage + 1)} disabled={currentPage === totalPages || loading}>Próxima <ChevronRight size={20} /></button>
                        </div>
                    )}
                </>
                )}
            </>
        )}
        {/* --- VIEW: DASHBOARD ADMIN --- */}
        {currentView === 'dashboard' && isAdmin && (
            <div className="dashboard-container">
                <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
                    <BarChart3 className="text-blue-600" />
                    Produtividade da Equipe
                </h2>

                {/* BARRA DE FILTROS DO DASHBOARD (Regras Novas: Data e Finalizados) */}
                <div className="filters-bar" style={{marginBottom: '20px', padding: '15px', borderRadius: '8px', background: '#f7f9fc'}}>
                    <div style={{ display: 'flex', gap: '15px', alignItems: 'flex-end' }}>
                         <div style={{ position: 'relative', minWidth: '180px' }}>
                            <label className="filter-label" style={{display:'block', fontSize:'0.8em', color:'#666'}}>Status</label>
                            <select 
                                className="search-input" 
                                value={filtroFinalizado} 
                                onChange={(e) => setFiltroFinalizado(e.target.value)}
                            >
                                <option value="true">Finalizados (Assinado e Tramitado)</option>
                                <option value="false">Em Aberto (Geral)</option>
                            </select>
                        </div>
                        
                         <div style={{ minWidth: '160px' }}>
                            <label className="filter-label" style={{display:'block', fontSize:'0.8em', color:'#666'}}>Data Início</label>
                            <input 
                                type="date" 
                                value={dashboardStartDate} 
                                onChange={(e) => setDashboardStartDate(e.target.value)}
                                className="search-input"
                            />
                        </div>
                         <div style={{ minWidth: '160px' }}>
                            <label className="filter-label" style={{display:'block', fontSize:'0.8em', color:'#666'}}>Data Fim</label>
                            <input 
                                type="date" 
                                value={dashboardEndDate} 
                                onChange={(e) => setDashboardEndDate(e.target.value)}
                                className="search-input"
                            />
                        </div>
                    </div>
                </div>

                {loading ? <div className="text-center p-10"><Activity className="animate-spin inline text-yellow-500"/></div> : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                        {dashboardData.map((dado, idx) => (
                            <div 
                                key={idx} 
                                className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md transition-all cursor-pointer group"
                                onClick={() => abrirDetalhesColaborador(dado)}
                            >
                                <div className="flex items-center gap-3 mb-4">
                                    <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-lg group-hover:bg-blue-600 group-hover:text-white transition-colors">
                                        {dado.nome.charAt(0)}
                                    </div>
                                    <div>
                                        <h3 className="font-bold text-gray-800">{dado.nome}</h3>
                                        <span className="text-xs text-gray-500">Colaborador</span>
                                    </div>
                                </div>
                                <div className="space-y-3">
                                    <div className="flex justify-between items-center bg-gray-50 p-3 rounded-lg">
                                        <span className="text-sm text-gray-500 flex items-center gap-1"><FileText size={14}/> Qtd</span>
                                        <span className="font-bold text-gray-800 text-lg">{dado.qtd}</span>
                                    </div>
                                    <div className="flex justify-between items-center bg-green-50 p-3 rounded-lg">
                                        <span className="text-sm text-green-700 flex items-center gap-1"><DollarSign size={14}/> Total</span>
                                        <span className="font-bold text-green-700">{formatCurrency(dado.total)}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        )}

      </main>

      {/* --- MODAL DETALHES DO PROCESSO (Edição) --- */}
      {modalOpen && selectedProcesso && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Processo <span style={{color: '#999', fontSize: '0.8em'}}>#{selectedProcesso.nup}</span></h2>
              <button onClick={() => setModalOpen(false)} className="btn-close"><X size={24} /></button>
            </div>
            <div className="modal-body">
              {isAdmin && (
                <div className="admin-section">
                    <div className="admin-title"><User size={16} /> Responsável (Admin)</div>
                    <div className="admin-controls">
                        <div style={{flex: 1, position: 'relative'}}>
                            <input list="lista-colaboradores" type="text" className="input-admin" placeholder="Selecione..." value={novoColaborador} onChange={(e) => setNovoColaborador(e.target.value)} style={{ width: '100%' }} />
                            <ChevronDown size={14} style={{position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#999'}} />
                            <datalist id="lista-colaboradores">{opcoesColaboradores.map((nome, index) => <option key={index} value={nome} />)}</datalist>
                        </div>
                        <button onClick={salvarColaborador} className="btn-save"><Save size={16} /> Salvar</button>
                    </div>
                </div>
              )}
              <div style={{marginBottom: '20px', padding: '10px', background: '#f9fafb', borderRadius: '8px', border: '1px solid #eee'}}>
                  <small style={{color: '#999', display: 'block', marginBottom: '4px'}}>PROCEDIMENTO</small>
                  <div style={{fontWeight: 600, color: '#374151'}}>{selectedProcesso.tratamento || 'Não informado'}</div>
              </div>
              <div className="section-subtitle"><Activity size={16} /> Status</div>
              <div className="status-grid">
                {LISTA_STATUS.map(status => {
                  // Regra de Bloqueio: Se o status atual é "assinado e tramitado", bloqueia se for diferente do status atual.
                  const isFinalizado = selectedProcesso.status === 'assinado e tramitado';
                  const isCurrent = status === selectedProcesso.status;
                  const isDisabled = isFinalizado && !isCurrent; 

                  return (
                    <button 
                      key={status} 
                      onClick={() => alterarStatus(status)} 
                      disabled={isDisabled} 
                      className={`btn-status-option ${isCurrent ? 'active' : ''} ${isDisabled ? 'disabled' : ''}`}
                    >
                      {status}
                    </button>
                  );
                })}
              </div>
              <div className="section-subtitle"><History size={16} /> Histórico</div>
              <div className="timeline">
                {selectedProcesso.historicoStatus && [...selectedProcesso.historicoStatus].reverse().map((hist, idx) => (
                  <div key={idx} className="timeline-item">
                    <div className="timeline-dot"></div>
                    <div className="timeline-content">
                      <span style={{fontWeight: 600, textTransform: 'capitalize'}}>{hist.para}</span>
                      <span className="timeline-date">{new Date(hist.data).toLocaleString('pt-BR')}</span>
                    </div>
                    <p style={{fontSize: '0.85em', color: '#666', marginTop: '4px'}}>Por: {hist.responsavel}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL DETALHES DO COLABORADOR (NOVO) --- */}
      {modalColaboradorOpen && selectedColaborador && (
        <div className="modal-overlay">
            <div className="modal-content" style={{maxWidth: '1000px'}}>
                <div className="modal-header bg-blue-600 text-white" style={{background: 'linear-gradient(135deg, #2563eb, #1e40af)', color: 'white'}}>
                    <div>
                        <h2 style={{color: 'white', marginBottom: '2px'}}>{selectedColaborador.nome}</h2>
                        <div style={{fontSize: '0.9em', opacity: 0.9}}>
                            {selectedColaborador.qtd} Processos • Total: {formatCurrency(selectedColaborador.total)}
                        </div>
                    </div>
                    <button onClick={() => setModalColaboradorOpen(false)} className="btn-close" style={{color: 'white'}}><X size={24} /></button>
                </div>
                <div className="modal-body p-0">
                    <div style={{maxHeight: '60vh', overflowY: 'auto'}}>
                        <table style={{width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem'}}>
                            <thead style={{background: '#f8f9fa', position: 'sticky', top: 0}}>
                                <tr>
                                    <th style={{padding: '12px 8px', textAlign: 'left', borderBottom: '1px solid #ddd'}}>NUP</th>
                                    <th style={{padding: '12px 8px', textAlign: 'left', borderBottom: '1px solid #ddd'}}>Credenciado</th>
                                    <th style={{padding: '12px 8px', textAlign: 'left', borderBottom: '1px solid #ddd'}}>Data Receb.</th>
                                    <th style={{padding: '12px 8px', textAlign: 'left', borderBottom: '1px solid #ddd'}}>Nº Processo</th>
                                    <th style={{padding: '12px 8px', textAlign: 'left', borderBottom: '1px solid #ddd'}}>Produção</th>
                                    <th style={{padding: '12px 8px', textAlign: 'left', borderBottom: '1px solid #ddd'}}>Status</th>
                                    <th style={{padding: '12px 8px', textAlign: 'left', borderBottom: '1px solid #ddd'}}>Tipo</th>
                                    <th style={{padding: '12px 8px', textAlign: 'left', borderBottom: '1px solid #ddd'}}>Tratamento</th>
                                    <th style={{padding: '12px 8px', textAlign: 'left', borderBottom: '1px solid #ddd'}}>Última Atual.</th>
                                    <th style={{padding: '12px 8px', textAlign: 'left', borderBottom: '1px solid #ddd'}}>Valor</th>
                                </tr>
                            </thead>
                            <tbody>
                                {processosColaborador.map(proc => (
                                    <tr key={proc._id || proc.nup} style={{borderBottom: '1px solid #eee'}}>
                                        <td style={{padding: '10px 8px', fontWeight: 'bold', color: '#555'}}>{proc.nup}</td>
                                        <td style={{padding: '10px 8px'}}>{proc.credenciado}</td>
                                        <td style={{padding: '10px 8px'}}>{proc.dataRecebimento}</td>
                                        <td style={{padding: '10px 8px'}}>{proc.numeroProcesso}</td>
                                        <td style={{padding: '10px 8px'}}>{proc.producao}</td>
                                        <td style={{padding: '10px 8px'}}>
                                            <span className={`status-badge ${getStatusClass(proc.status)}`}>{proc.status || 'NOVO'}</span>
                                        </td>
                                        <td style={{padding: '10px 8px'}}>{proc.tipoProcesso}</td>
                                        <td style={{padding: '10px 8px'}}>{proc.tratamento}</td>
                                        <td style={{padding: '10px 8px'}}>
                                            {proc.ultimaAtualizacao ? new Date(proc.ultimaAtualizacao).toLocaleDateString('pt-BR') : '-'}
                                        </td>
                                        <td style={{padding: '10px 8px', fontWeight: '600'}}>R$ {proc.valorCapa}</td>
                                    </tr>
                                ))}
                                {processosColaborador.length === 0 && (
                                    <tr><td colSpan="10" style={{padding: '20px', textAlign: 'center', color: '#999'}}>Nenhum processo listado.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    )}

    </div>
  );
}
