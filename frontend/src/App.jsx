import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  Activity, LogOut, FileText, History, CheckCircle, AlertCircle,
  Search, Clock, User, Save, X, ChevronDown, ChevronLeft, ChevronRight,
  Stethoscope, LayoutGrid, List, DollarSign, BarChart3,
  Calendar 
} from 'lucide-react';
import './App.css'; 

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const isFirebaseConfigValid = 
  import.meta.env.VITE_FIREBASE_API_KEY &&
  import.meta.env.VITE_FIREBASE_AUTH_DOMAIN &&
  import.meta.env.VITE_FIREBASE_PROJECT_ID;

if (!isFirebaseConfigValid) {
  console.error('Configuração do Firebase incompleta.');
}

const app = isFirebaseConfigValid ? initializeApp(firebaseConfig) : null;
const auth = app ? getAuth(app) : null;

const API_URL = import.meta.env.VITE_API_URL;
const ITEMS_PER_PAGE = 20;

const envAdmins = import.meta.env.VITE_ADMIN_EMAILS || '';
const ADMIN_EMAILS = envAdmins.split(',').map(email => email.trim().toLowerCase());

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [firebaseError, setFirebaseError] = useState('');
  const [totalAnalisadoHoje, setTotalAnalisadoHoje] = useState(0);
  
  const [currentView, setCurrentView] = useState('lista');

  const [processos, setProcessos] = useState([]);
  const [dashboardData, setDashboardData] = useState([]);

  const [listaResponsaveis, setListaResponsaveis] = useState([]);
  const [listaTratamentos, setListaTratamentos] = useState([]);
  const [listaStatus, setListaStatus] = useState([]);
  
  const [filtro, setFiltro] = useState('');
  const [filtroResponsavel, setFiltroResponsavel] = useState(''); 
  const [filtroTratamento, setFiltroTratamento] = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [filtroProducao, setFiltroProducao] = useState('');
  const [filtroDataRecebimento, setFiltroDataRecebimento] = useState('');
  
  const [dashboardStartDate, setDashboardStartDate] = useState(() => {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  });
  const [dashboardEndDate, setDashboardEndDate] = useState(new Date().toISOString().split('T')[0]);
  const [filtroFinalizado, setFiltroFinalizado] = useState('true'); 
  

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalRegistros, setTotalRegistros] = useState(0);

  const [opcoesColaboradores, setOpcoesColaboradores] = useState([]); 

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedProcesso, setSelectedProcesso] = useState(null);
  
  const [modalColaboradorOpen, setModalColaboradorOpen] = useState(false);
  const [selectedColaborador, setSelectedColaborador] = useState(null);
  const [processosColaborador, setProcessosColaborador] = useState([]);

  const [novoColaborador, setNovoColaborador] = useState(''); 
  const [erroLogin, setErroLogin] = useState('');

  const [inputValorCapa, setInputValorCapa] = useState('');
  const [inputValorGlosa, setInputValorGlosa] = useState('');
  const [inputValorLiberado, setInputValorLiberado] = useState('');

  const getStatusClass = (s) => s ? 'status-' + s.toLowerCase().replace(/ /g, '-').normalize('NFD').replace(/[\u0300-\u036f]/g, "") : 'status-default';
  const formatCurrency = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

  const carregarFiltrosDoBanco = useCallback(async () => {
    try {
        const response = await axios.get(`${API_URL}/api/filtros`);
        setListaResponsaveis(response.data.responsaveis || []);
        setListaTratamentos(response.data.tratamentos || []);
        setListaStatus(response.data.status || []);
        setOpcoesColaboradores(response.data.responsaveis || []);
    } catch (error) {
        console.error("Erro ao carregar filtros dinâmicos:", error);
    }
  }, []);

  const aplicarMascaraMoeda = (valor) => {
      if (valor === null || valor === undefined || valor === '') return '';
      const apenasNumeros = valor.toString().replace(/\D/g, '');
      if (apenasNumeros === '') return '';
      
      const valorFloat = parseInt(apenasNumeros, 10) / 100;
      
      return new Intl.NumberFormat('pt-BR', {
          style: 'currency',
          currency: 'BRL'
      }).format(valorFloat);
  };
  const desmascararMoeda = (valorFormatado) => {
      if (!valorFormatado) return null;
      const apenasNumeros = valorFormatado.toString().replace(/\D/g, '');
      if (apenasNumeros === '') return null;
      return parseFloat(apenasNumeros) / 100;
  };
  useEffect(() => {
    if (!auth) {
      setFirebaseError('Configuração do Firebase não encontrada.');
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        if (!currentUser.email || (!currentUser.email.endsWith('@maida.health') && !currentUser.email.includes('gmail'))) {
           setErroLogin('Acesso restrito a e-mails corporativos (@maida.health).');
           signOut(auth);
           return;
        }
        setUser(currentUser);
        carregarFiltrosDoBanco();
      } else {
        setUser(null); 
        setProcessos([]);
      }
      setLoading(false);
    });
    
    return () => unsubscribe();
  }, [carregarFiltrosDoBanco]);

  useEffect(() => {
    if (selectedProcesso) {
        setInputValorCapa(selectedProcesso.valorCapa ? formatCurrency(selectedProcesso.valorCapa) : '');
        setInputValorGlosa(selectedProcesso.valorGlosa ? formatCurrency(selectedProcesso.valorGlosa) : '');
        setInputValorLiberado(selectedProcesso.valorLiberado ? formatCurrency(selectedProcesso.valorLiberado) : '');
    }
  }, [selectedProcesso]);

  const calcularDiasCorridos = (dataString) => {
    if (!dataString) return 0;

    const dataLimpa = dataString.replace(/-/g, '/').split('T')[0];
    const partes = dataLimpa.split('/');

    if (partes.length !== 3) return 0;

    const mesesExtenso = {
        'JAN': 0, 'FEV': 1, 'MAR': 2, 'ABR': 3, 'MAI': 4, 'JUN': 5,
        'JUL': 6, 'AGO': 7, 'SET': 8, 'OUT': 9, 'NOV': 10, 'DEZ': 11
    };

    let dia, mes, ano;

    const segundoItem = partes[1].toUpperCase();
    if (mesesExtenso[segundoItem] !== undefined) {
        dia = parseInt(partes[0]);
        mes = mesesExtenso[segundoItem];
        ano = parseInt(partes[2]);
    } else {
        if (partes[0].length === 4) { 
            ano = parseInt(partes[0]);
            mes = parseInt(partes[1]) - 1; 
            dia = parseInt(partes[2]);
        } else { 
            dia = parseInt(partes[0]);
            mes = parseInt(partes[1]) - 1;
            ano = parseInt(partes[2]);
        }
    }

    const dataRecebimento = new Date(ano, mes, dia);
    const hoje = new Date();
    
    dataRecebimento.setHours(0,0,0,0);
    hoje.setHours(0,0,0,0);

    if (isNaN(dataRecebimento.getTime())) return 0;

    const diffTempo = hoje - dataRecebimento;
    let diffDias = Math.ceil(diffTempo / (1000 * 60 * 60 * 24));
    
    return diffDias >= 0 ? diffDias : 0;
  };


  const buscarProcessos = useCallback(async (page = 1, searchTerm = '', respTerm = '', tratTerm = '', statusTerm = '', prodTerm = '', recTerm = '') => {
    try {
        setLoading(true);
        
        const params = { 
            responsavel: respTerm, 
            tratamento: tratTerm, 
            status: statusTerm,
            numeroProcesso: searchTerm
        };

        if (recTerm) {
            const [year, month, day] = recTerm.split('-');
            const meses = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
            params.dataRecebimento = `${day}-${meses[parseInt(month, 10) - 1]}-${year}`;
        }

        const response = await axios.get(`${API_URL}/api/processos`, { params });
        
        let dados = response.data;
        
        
        const start = (page - 1) * ITEMS_PER_PAGE;
        const end = start + ITEMS_PER_PAGE;
        
        setProcessos(dados.slice(start, end));
        setTotalRegistros(dados.length);
        setTotalPages(Math.ceil(dados.length / ITEMS_PER_PAGE));
        setCurrentPage(page);
        
    } catch (error) {
        console.error("❌ Erro busca:", error);
        setErroLogin("Erro de conexão com o servidor.");
    } finally {
        setLoading(false);
    }
}, []);

  const carregarDashboard = async () => {
    try {
        setLoading(true);
        
        const response = await axios.get(`${API_URL}/api/dashboard/resumo`, {
             params: {
                 startDate: dashboardStartDate,
                 endDate: dashboardEndDate,
                 isFinalized: filtroFinalizado
             }
        });

        const hoje = new Date().toISOString().split('T')[0];
        const responseHoje = await axios.get(`${API_URL}/api/dashboard/resumo`, {
             params: {
                 startDate: hoje,
                 endDate: hoje,
                 isFinalized: filtroFinalizado 
             }
        });

        const dadosCorrigidos = response.data.map(colaborador => {
            const totalReal = (colaborador.processos || []).reduce((acc, proc) => {
                const valorLimpo = proc.valorCapa ? parseFloat(String(proc.valorCapa).replace(',', '.')) : 0;
                return acc + (isNaN(valorLimpo) ? 0 : valorLimpo);
            }, 0);
            return { ...colaborador, total: totalReal };
        });
        
        let sumHoje = 0;
        responseHoje.data.forEach(colaborador => {
            const totalColab = (colaborador.processos || []).reduce((acc, proc) => {
                const valorLimpo = proc.valorCapa ? parseFloat(String(proc.valorCapa).replace(',', '.')) : 0;
                return acc + (isNaN(valorLimpo) ? 0 : valorLimpo);
            }, 0);
            sumHoje += totalColab;
        });

        setDashboardData(dadosCorrigidos);
        setTotalAnalisadoHoje(sumHoje); 

    } catch (error) {
        console.error("Erro dashboard:", error);
        setErroLogin("Erro de conexão com o servidor.");
    } finally {
        setLoading(false);
    }
  };

  const abrirDetalhesColaborador = async (colaborador) => {
    setSelectedColaborador(colaborador);
    setModalColaboradorOpen(true);
    setProcessosColaborador(colaborador.processos || []);
  };

  useEffect(() => {
    if (user) {
        if (currentView === 'lista') {
            buscarProcessos(currentPage, filtro, filtroResponsavel, filtroTratamento, filtroStatus, filtroProducao, filtroDataRecebimento);
        } else {
            carregarDashboard();
        }
    }
  }, [
      currentPage, 
      filtroResponsavel, 
      filtroTratamento, 
      filtroStatus, 
      filtroProducao,
      filtroDataRecebimento,
      user, 
      currentView, 
      dashboardStartDate, 
      dashboardEndDate, 
      filtroFinalizado, 
      buscarProcessos 
  ]);
  
  useEffect(() => {
    if (!user || currentView !== 'lista') return;
    const t = setTimeout(() => { 
        setCurrentPage(1); 
        buscarProcessos(1, filtro, filtroResponsavel, filtroTratamento, filtroStatus, filtroProducao, filtroDataRecebimento); 
    }, 500);
    return () => clearTimeout(t);
  }, [filtro, user, buscarProcessos, currentView, filtroResponsavel, filtroTratamento, filtroStatus, filtroProducao, filtroDataRecebimento]);

  const mudarPagina = (n) => { if (n >= 1 && n <= totalPages) setCurrentPage(n); };

  const handleLogin = async () => {
    if (!auth) return;
    const provider = new GoogleAuthProvider();
    try { 
      await signInWithPopup(auth, provider);
    } catch (e) { 
      console.error("Erro Auth:", e);
      setErroLogin('Erro Login Google: ' + e.message); 
    }
  };

  const alterarStatus = async (novoStatus) => {
    if (!selectedProcesso || !user) return;
    const statusAntigo = selectedProcesso.status || '';
    
    if (statusAntigo === 'assinado e tramitado' && novoStatus !== 'assinado e tramitado') {
        alert("Processos com status 'assinado e tramitado' não podem ser alterados.");
        return;
    }

    let payloadFinanceiro = {
        valorCapa: desmascararMoeda(inputValorCapa),
        valorGlosa: desmascararMoeda(inputValorGlosa) || 0,
        valorLiberado: desmascararMoeda(inputValorLiberado)
    };

    if (novoStatus === 'assinado e tramitado') {
        if (!inputValorCapa || !inputValorLiberado) {
            alert("Para finalizar, é obrigatório preencher 'Valor Capa' e 'Valor Liberado'.");
            return;
        }
        payloadFinanceiro.valorGlosa = inputValorGlosa || 0;
    }
    
    const processoAtualizado = { 
        ...selectedProcesso, 
        status: novoStatus, 
        ...payloadFinanceiro,
        historicoStatus: [
            ...(selectedProcesso.historicoStatus || []), 
            { de: statusAntigo, para: novoStatus, usuario: user.email, responsavel: user.displayName, data: new Date().toISOString() }
        ] 
    };
    
    setSelectedProcesso(processoAtualizado);
    setProcessos(prev => prev.map(p => p.nup === selectedProcesso.nup ? processoAtualizado : p));

    try {
      await axios.put(`${API_URL}/api/processos/${selectedProcesso.nup}`, { 
          novoStatus, 
          statusAnterior: statusAntigo, 
          usuarioEmail: user.email, 
          usuarioNome: user.displayName,
          ...payloadFinanceiro
      });
      carregarFiltrosDoBanco();
      if (currentView === 'dashboard') carregarDashboard(); 
    } catch (e) { 
        alert("Erro ao salvar."); 
        buscarProcessos(currentPage, filtro, filtroResponsavel, filtroTratamento, filtroStatus); 
    }
  };

  const salvarValoresFinanceiros = async () => {
    if (!selectedProcesso || !user) return;

    const statusAtual = selectedProcesso.status || 'EM_ANALISE';

    const payloadFinanceiro = {
        valorCapa: desmascararMoeda(inputValorCapa),
        valorGlosa: desmascararMoeda(inputValorGlosa) || 0,
        valorLiberado: desmascararMoeda(inputValorLiberado)
    };

    const processoAtualizado = { 
        ...selectedProcesso, 
        ...payloadFinanceiro 
    };

    setSelectedProcesso(processoAtualizado);
    setProcessos(prev => prev.map(p => p.nup === selectedProcesso.nup ? processoAtualizado : p));

    try {
        await axios.put(`${API_URL}/api/processos/${selectedProcesso.nup}`, { 
            novoStatus: statusAtual, 
            statusAnterior: statusAtual, 
            usuarioEmail: user.email, 
            usuarioNome: user.displayName,
            ...payloadFinanceiro
        });
        
        alert("Valores financeiros atualizados com sucesso!");
        carregarFiltrosDoBanco();
        if (currentView === 'dashboard') carregarDashboard(); 
    } catch (e) { 
        console.error("Erro ao salvar valores:", e);
        alert("Erro ao salvar os valores."); 
        buscarProcessos(currentPage, filtro, filtroResponsavel, filtroTratamento, filtroStatus); 
    }
  };

  const salvarColaborador = async () => {
    if (!selectedProcesso || !user) return;
    
    if (novoColaborador && !opcoesColaboradores.includes(novoColaborador)) {
        setOpcoesColaboradores(p => [...p, novoColaborador].sort());
        setListaResponsaveis(p => [...p, novoColaborador].sort());
    }
    
    const novoStatusCalculado = selectedProcesso.status === 'CONCLUIDO' 
        ? 'CONCLUIDO' 
        : 'EM_ANALISE';

    const processoAtualizado = { 
        ...selectedProcesso, 
        responsavel: novoColaborador,
        status: novoStatusCalculado
    };

    setSelectedProcesso(processoAtualizado);
    setProcessos(prev => prev.map(p => p.nup === selectedProcesso.nup ? processoAtualizado : p));

    try {
        await axios.put(`${API_URL}/api/processos/${selectedProcesso.nup}/colaborador`, {
            novoColaborador, 
            usuarioEmail: user.email 
        });
        alert("Colaborador atualizado!");
    } catch (e) { 
        alert("Erro ao salvar."); 
        buscarProcessos(currentPage, filtro, filtroResponsavel, filtroTratamento, filtroStatus); 
    }
  };

  const assumirProcesso = async () => {
    if (!selectedProcesso || !user) return;
    
    const nomeUsuario = user.displayName || user.email; 
    
    const novoStatusCalculado = selectedProcesso.status === 'CONCLUIDO' 
        ? 'CONCLUIDO' 
        : 'EM_ANALISE';

    const processoAtualizado = { 
        ...selectedProcesso, 
        responsavel: nomeUsuario,
        status: novoStatusCalculado 
    };
    
    setSelectedProcesso(processoAtualizado);
    setProcessos(prev => prev.map(p => p.nup === selectedProcesso.nup ? processoAtualizado : p));

    if (!listaResponsaveis.includes(nomeUsuario)) {
        setListaResponsaveis(p => [...p, nomeUsuario].sort());
    }

    try {
        await axios.put(`${API_URL}/api/processos/${selectedProcesso.nup}/colaborador`, {
            novoColaborador: nomeUsuario, 
            usuarioEmail: user.email 
        });
    } catch (e) { 
        alert("Erro ao salvar."); 
        buscarProcessos(currentPage, filtro, filtroResponsavel, filtroTratamento, filtroStatus); 
    }
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
            {auth ? 'Entrar com Google (Popup)' : 'Configuração Incompleta'}
          </button>
          
          {!auth && (
            <div style={{ marginTop: '15px', fontSize: '0.8rem', color: '#666' }}>
               Configure as variáveis de ambiente no arquivo .env ou no Vercel
            </div>
          )}
        </div>
      </div>
    );
  }
  
  const getSlaStyle = (dias) => {
    if (dias > 30) {
      return { bg: '#fee2e2', color: '#dc2626', border: '#fca5a5', label: 'Crítico' }; 
    }
    if (dias > 20) {
      return { bg: '#fef9c3', color: '#b45309', border: '#fde047', label: 'Atenção' }; 
    }
    return { bg: '#dbeafe', color: '#1e40af', border: '#93c5fd', label: 'No prazo' }; 
  };

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
                {user && (
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
        
        {currentView === 'lista' && (
            <>
                <div className="filters-bar" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center' }}>
  
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', gap: '15px' }}>
                        
                        {/* Esquerda: Título */}
                        <div style={{ textAlign: 'left' }}>
                            <h2 style={{ fontSize: '1.5rem', margin: '0 0 5px 0' }}>Processos</h2>
                            <p style={{ color: '#666', margin: 0 }}>Total: {totalRegistros} registros</p>
                        </div>

                        {/* Direita: Filtros de Data*/}
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            
                            {/* Filtro 1: Produção */}
                            <div style={{ position: 'relative', minWidth: '150px' }}>
                                <input 
                                    type="month" 
                                    className="search-input" 
                                    value={filtroProducao ? filtroProducao.split('/').reverse().join('-') : ''} 
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        const newVal = val ? val.split('-').reverse().join('/') : '';
                                        setFiltroProducao(newVal);
                                    }} 
                                    style={{ width: '100%' }} 
                                    title="Filtrar por Competência (Produção)"
                                />
                            </div>

                            {/* Filtro 2: Data Recebimento */}
                            <div style={{ position: 'relative', minWidth: '160px' }}>
                                <input 
                                    type="date" 
                                    className="search-input" 
                                    value={filtroDataRecebimento} 
                                    onChange={(e) => { setCurrentPage(1); setFiltroDataRecebimento(e.target.value); }} 
                                    style={{ width: '100%', color: filtroDataRecebimento ? '#000' : '#666' }} 
                                    title="Filtrar por Data de Recebimento"
                                />
                            </div>

                        </div>
                    </div>

                    {/* Linha de Baixo: Filtros de Seleção */}
                    <div style={{display: 'flex', gap: '10px', flexWrap: 'nowrap', width: '100%', marginTop: '15px'}}>
                        <div style={{ flex: 1, position: 'relative' }}>
                            <select className="search-input" value={filtroStatus} onChange={(e) => { setCurrentPage(1); setFiltroStatus(e.target.value); }} style={{width: '100%'}}>
                                <option value="">Status: Todos</option>
                                {listaStatus.map(status => <option key={status} value={status}>{status}</option>)}
                            </select>
                        </div>
                        <div style={{ flex: 1, position: 'relative' }}>
                            <select className="search-input" value={filtroResponsavel} onChange={(e) => { setCurrentPage(1); setFiltroResponsavel(e.target.value); }} style={{width: '100%'}}>
                                <option value="">Resp: Todos</option>
                                {listaResponsaveis.map(nome => <option key={nome} value={nome}>{nome}</option>)}
                            </select>
                        </div>
                        <div style={{ flex: 1, position: 'relative' }}>
                            <select className="search-input" value={filtroTratamento} onChange={(e) => { setCurrentPage(1); setFiltroTratamento(e.target.value); }} style={{width: '100%'}}>
                                <option value="">Tratamento: Todos</option>
                                {listaTratamentos.map(trat => <option key={trat} value={trat}>{trat}</option>)}
                            </select>
                        </div>
                        <div style={{ flex: 1.5, position: 'relative' }}>
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
                        const diasCorridos = calcularDiasCorridos(processo.dataRecebimento);
                        const slaStyle = getSlaStyle(diasCorridos);
                        const isConcluido = processo.status === 'CONCLUIDO' || processo.status === 'assinado e tramitado';
                        return (
                          <div key={processo._id || Math.random()} className="module-card" onClick={() => { setSelectedProcesso(processo); setModalOpen(true); }}>
                            <div className="card-header" style={{ marginBottom: '10px' }}>
                              <span className={`status-badge ${getStatusClass(processo.status)}`}>{processo.status || 'NOVO'}</span>
                              <span style={{ fontSize: '0.8rem', color: '#999', display: 'flex', alignItems: 'center', gap: '4px' }}><Clock size={12} /> {processo.dataRecebimento}</span>
                            </div>
                            {!isConcluido && processo.dataRecebimento && (
                                <div style={{
                                    marginBottom: '10px',
                                    padding: '4px 8px',
                                    borderRadius: '6px',
                                    fontSize: '0.75rem',
                                    fontWeight: 'bold',
                                    display: 'flex',
                                    alignItems: 'center',
                                    width: 'fit-content',
                                    justifyContent: 'space-between',
                                    gap: '10px',
                                    backgroundColor: slaStyle.bg,
                                    color: slaStyle.color,
                                    border: `1px solid ${slaStyle.border}`
                                }}>
                                    <span style={{display: 'flex', alignItems: 'center', gap: '4px'}}>
                                        <Calendar size={12} /> {diasCorridos === 0 ? 'Hoje' : `${diasCorridos} dias`}
                                    </span>
                                    {diasCorridos > 30 && <AlertCircle size={12} />} 
                                </div>
                                )}
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
                              <div>
                                  <small style={{display:'block', color:'#999'}}>Valor</small> 
                                  <strong>{processo.valorCapa && !isNaN(processo.valorCapa) ? formatCurrency(processo.valorCapa) : 'R$ 0,00'}</strong>
                              </div>
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
        
        
        {currentView === 'dashboard' && user && (
            <div className="dashboard-container" style={{ marginTop: '-25px' }}>
                
                {/* Header do Dashboard: Título na Esquerda + Barra de Meta na Direita */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', flexWrap: 'wrap', gap: '15px' }}>
                    <h2 className="text-2xl font-bold flex items-center gap-2" style={{ margin: 0 }}>
                        <BarChart3 className="text-blue-600" />
                        Produtividade da Equipe
                    </h2>

                    {/* COMPONENTE DA BARRA DE META DIÁRIA */}
                    {(() => {
                        const META_DIARIA = 2000000; // 2 milhões
                        const porcentagem = Math.min((totalAnalisadoHoje / META_DIARIA) * 100, 100).toFixed(1);
                        const bateuMeta = totalAnalisadoHoje >= META_DIARIA;
                        const faltam = bateuMeta ? 0 : META_DIARIA - totalAnalisadoHoje;

                        return (
                            <div style={{ width: '320px', background: '#fff', padding: '12px 16px', borderRadius: '10px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '8px', color: '#334155', fontWeight: 'bold' }}>
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        {/* Ícone de Alvo SVG */}
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
                                        </svg>
                                        Meta Diária (2 Milhões)
                                    </span>
                                    <span style={{ color: bateuMeta ? '#16a34a' : '#2563eb' }}>{porcentagem}%</span>
                                </div>
                                
                                {/* Linha cinza de fundo */}
                                <div style={{ width: '100%', height: '10px', background: '#e2e8f0', borderRadius: '5px', overflow: 'hidden' }}>
                                    {/* Linha colorida que preenche */}
                                    <div style={{ 
                                        width: `${porcentagem}%`, 
                                        height: '100%', 
                                        background: bateuMeta ? '#22c55e' : 'linear-gradient(90deg, #3b82f6, #60a5fa)', 
                                        transition: 'width 1s ease-in-out' 
                                    }}></div>
                                </div>
                                
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginTop: '8px', color: '#64748b' }}>
                                    <span>Hoje: <strong style={{color: '#333'}}>{formatCurrency(totalAnalisadoHoje)}</strong></span>
                                    {!bateuMeta && <span>Faltam: {formatCurrency(faltam)}</span>}
                                </div>
                                
                                {/* Mensagem de Parabéns! */}
                                {bateuMeta && (
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: '#15803d', fontSize: '0.8rem', fontWeight: 'bold', textAlign: 'center', marginTop: '6px', background: '#dcfce7', padding: '6px', borderRadius: '4px' }}>
                                        {/* Ícone de Troféu SVG */}
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
                                        </svg>
                                        Parabéns! Meta atingida!
                                    </div>
                                )}
                            </div>
                        );
                    })()}
                </div>

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

      {/* MODALS CODE (Permanecem inalterados) */}
      {modalOpen && selectedProcesso && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Processo <span style={{color: '#999', fontSize: '0.8em'}}>#{selectedProcesso.nup}</span></h2>
              <button onClick={() => setModalOpen(false)} className="btn-close"><X size={24} /></button>
            </div>
            <div className="modal-body">
              {/* Conteúdo do Modal igual ao anterior... */}
               <div style={{marginBottom: '20px', padding: '15px', background: '#f0f9ff', borderRadius: '8px', border: '1px solid #bae6fd'}}>
                  <div style={{display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', color: '#0369a1', fontWeight: 600}}>
                      <User size={18} /> Responsável pelo Processo
                  </div>

                  {(!selectedProcesso.responsavel || selectedProcesso.responsavel === '') ? (
                      <button 
                          onClick={assumirProcesso}
                          className="btn-save"
                          style={{
                              width: '100%', 
                              justifyContent: 'center', 
                              backgroundColor: '#0284c7', 
                              color: 'white',
                              padding: '10px',
                              fontSize: '1rem'
                          }}
                      >
                          ✋ Assumir este Processo
                      </button>
                  ) : (
                      <div style={{fontSize: '1.1rem', fontWeight: 'bold', color: '#333', padding: '5px 0'}}>
                          {selectedProcesso.responsavel}
                      </div>
                  )}

                  {isAdmin && (
                      <div style={{marginTop: '15px', paddingTop: '10px', borderTop: '1px dashed #cbd5e1'}}>
                          <small style={{display: 'block', marginBottom: '5px', color: '#64748b'}}>Admin: Trocar responsável</small>
                          <div className="admin-controls">
                              <div style={{flex: 1, position: 'relative'}}>
                                  <input list="lista-colaboradores" type="text" className="input-admin" placeholder="Selecione..." value={novoColaborador} onChange={(e) => setNovoColaborador(e.target.value)} style={{ width: '100%' }} />
                                  <datalist id="lista-colaboradores">{opcoesColaboradores.map((nome, index) => <option key={index} value={nome} />)}</datalist>
                              </div>
                              <button onClick={salvarColaborador} className="btn-save" style={{backgroundColor: '#64748b'}}><Save size={16} /> Salvar</button>
                          </div>
                      </div>
                  )}
              </div>

              <div style={{marginBottom: '20px', padding: '10px', background: '#f9fafb', borderRadius: '8px', border: '1px solid #eee'}}>
                  <small style={{color: '#999', display: 'block', marginBottom: '4px'}}>PROCEDIMENTO</small>
                  <div style={{fontWeight: 600, color: '#374151'}}>{selectedProcesso.tratamento || 'Não informado'}</div>
              </div>

              <div className="financial-inputs" style={{ marginBottom: '20px', padding: '15px', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: '8px' }}>
                  <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: '#b45309', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <DollarSign size={16}/> Valores do Fechamento
                  </h4>
                  <button 
                          onClick={salvarValoresFinanceiros}
                          disabled={selectedProcesso.status === 'assinado e tramitado'}
                          style={{ 
                              backgroundColor: selectedProcesso.status === 'assinado e tramitado' ? '#d1d5db' : '#d97706', 
                              color: 'white', 
                              padding: '6px 12px', 
                              fontSize: '0.8rem', 
                              borderRadius: '6px', 
                              border: 'none', 
                              cursor: selectedProcesso.status === 'assinado e tramitado' ? 'not-allowed' : 'pointer', 
                              display: 'flex', 
                              alignItems: 'center', 
                              gap: '6px',
                              fontWeight: '600'
                          }}
                          title="Salvar apenas os valores preenchidos"
                      >
                          <Save size={14} /> Salvar Valores
                      </button>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                      <div>
                          <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#666' }}>V. Capa *</label>
                          <input 
                              type="text" 
                              className="input-admin"
                              style={{ width: '100%', padding: '6px' }}
                              value={inputValorCapa}
                              onChange={(e) => setInputValorCapa(aplicarMascaraMoeda(e.target.value))}
                              disabled={selectedProcesso.status === 'assinado e tramitado'}
                              placeholder="R$ 0,00"
                          />
                      </div>
                      <div>
                          <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#666' }}>V. Glosa</label>
                          <input 
                              type="text" 
                              className="input-admin"
                              style={{ width: '100%', padding: '6px' }}
                              value={inputValorGlosa}
                              onChange={(e) => setInputValorGlosa(aplicarMascaraMoeda(e.target.value))}
                              disabled={selectedProcesso.status === 'assinado e tramitado'}
                              placeholder="R$ 0,00"
                          />
                      </div>
                      <div>
                          <label style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#666' }}>V. Liberado *</label>
                          <input 
                              type="text" 
                              className="input-admin"
                              style={{ width: '100%', padding: '6px' }}
                              value={inputValorLiberado}
                              onChange={(e) => setInputValorLiberado(aplicarMascaraMoeda(e.target.value))}
                              disabled={selectedProcesso.status === 'assinado e tramitado'}
                              placeholder="R$ 0,00"
                          />
                      </div>
                  </div>
              </div>

              <div className="section-subtitle"><Activity size={16} /> Status</div>
              <div className="status-grid">
                {listaStatus.map(status => {
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