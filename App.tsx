import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  SafeAreaView,
  Platform,
  Modal,
  Share,
  Clipboard,
  Image,
  Switch,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';
import * as ImagePicker from 'expo-image-picker';


interface CryptoPurchase {
  id: string;
  coin: string;
  quantity: number;
  pricePaid: number;
  date: string;
  pricePerUnit: number;
  dollarRate: number;
  attachment?: string;
  conversionId?: string;
}

interface CryptoSale {
  id: string;
  coin: string;
  quantity: number;
  priceSold: number;
  date: string;
  pricePerUnit: number;
  dollarRate: number;
  profit: number;
  attachment?: string;
  isExempt?: boolean;
  exchangeType?: 'nacional' | 'internacional';
  taxPaid?: number;
  conversionId?: string;
}

const STORAGE_KEY = '@crypto_purchases';
const SALES_STORAGE_KEY = '@crypto_sales';
const TAX_LOSSES_KEY = '@crypto_tax_losses';
const HIDE_VALUES_KEY = '@hide_values_pref';
const DECL_PERCENT_KEY = '@declaration_percent';
const LAST_BACKUP_KEY = '@last_backup_date';
const RETIRE_SETTINGS_KEY = '@retire_settings';

interface RetireSettings {
  targetYears: number;
  btcCagr: number;
  usdBrlCagr: number;
  aporteMensal: number;
  aporteGrowth: number;
  ipca: number;
  targetBtc: number;
  useDecreasingCagr: boolean;
  withdrawalMonthlyBrl: number;
  bearMarkets: number;       // quantos bear markets no período
  bearDepth: number;         // queda % de cada crash
  bearRecoveryYears: number; // anos para recuperar ao piso anterior
  bearStartYear: number;     // ano calendário do 1º crash (0 = automático)
}

const DEFAULT_RETIRE_SETTINGS: RetireSettings = {
  targetYears: 15,
  btcCagr: 55,
  usdBrlCagr: 7,
  aporteMensal: 0,
  aporteGrowth: 5,
  ipca: 4.5,
  targetBtc: 1,
  useDecreasingCagr: false,
  withdrawalMonthlyBrl: 10000,
  bearMarkets: 0,
  bearDepth: 75,
  bearRecoveryYears: 2,
  bearStartYear: 0,
};

type RetireScenario = 'pessimista' | 'base' | 'otimista' | 'custom';

const SCENARIO_PRESETS: Record<Exclude<RetireScenario, 'custom'>, Partial<RetireSettings>> = {
  pessimista: { btcCagr: 20, useDecreasingCagr: true,  usdBrlCagr: 4, aporteGrowth: 0, ipca: 7,   bearMarkets: 3, bearDepth: 80, bearRecoveryYears: 3, bearStartYear: 0 },
  base:       { btcCagr: 40, useDecreasingCagr: true,  usdBrlCagr: 5, aporteGrowth: 3, ipca: 6,   bearMarkets: 2, bearDepth: 75, bearRecoveryYears: 2, bearStartYear: 0 },
  otimista:   { btcCagr: 60, useDecreasingCagr: false, usdBrlCagr: 8, aporteGrowth: 5, ipca: 4.5, bearMarkets: 1, bearDepth: 70, bearRecoveryYears: 2, bearStartYear: 0 },
};

const COINGECKO_IDS: {[key: string]: string} = {
  'BTC': 'bitcoin', 'ETH': 'ethereum', 'SOL': 'solana', 'BNB': 'binancecoin',
  'XRP': 'ripple', 'ADA': 'cardano', 'DOGE': 'dogecoin', 'DOT': 'polkadot',
  'AVAX': 'avalanche-2', 'MATIC': 'matic-network', 'LINK': 'chainlink',
  'LTC': 'litecoin', 'UNI': 'uniswap', 'ATOM': 'cosmos', 'NEAR': 'near',
  'FTM': 'fantom', 'ALGO': 'algorand', 'VET': 'vechain', 'ICP': 'internet-computer',
  'FIL': 'filecoin', 'SAND': 'the-sandbox', 'MANA': 'decentraland',
  'SHIB': 'shiba-inu', 'TRX': 'tron', 'XLM': 'stellar', 'AAVE': 'aave',
  'GRT': 'the-graph', 'MKR': 'maker', 'ARB': 'arbitrum', 'OP': 'optimism',
  'INJ': 'injective-protocol', 'SUI': 'sui', 'PEPE': 'pepe', 'WIF': 'dogwifcoin',
};

const CHART_COLORS = ['#667eea', '#F7931A', '#627EEA', '#00D2FF', '#E84142', '#14F195', '#9945FF', '#F0B90B', '#FF6B6B', '#4ECDC4'];

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value);
};

const formatCurrencyBRL = (value: number, hide: boolean = false): string => {
  if (hide) return 'R$ ****';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
};

// Formatar preço médio com casas decimais dinâmicas
const formatAveragePrice = (value: number): string => {
  const decimals = value < 0.01 ? 8 : value < 1 ? 6 : value < 100 ? 4 : 2;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
};

const formatDollarHide = (value: number, hide: boolean = false): string => {
  if (hide) return '$ ****';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value);
};

// Formatar preço com casas decimais dinâmicas
const formatPrice = (value: number, hide: boolean = false): string => {
  if (hide) return '$ ****';
  
  // Se valor >= $1, usa 2-4 casas decimais
  if (value >= 1) {
    // Verifica se precisa mostrar mais casas decimais
    const rounded = Math.round(value * 10000) / 10000;
    if (rounded !== Math.round(value * 100) / 100) {
      return `$${value.toFixed(4)}`; // 4 casas decimais
    }
    return formatCurrency(value); // 2 casas decimais padrão
  }
  
  // Se valor < $1, usa 8 casas decimais
  return `$${value.toFixed(8)}`;
};

// Formatar quantidade com casas decimais dinâmicas
const formatQuantity = (value: number): string => {
  // Remove zeros à direita desnecessários
  const formatted = value.toFixed(8);
  return formatted.replace(/\.?0+$/, '');
};

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('pt-BR');
};

export default function App() {
  const [screen, setScreen] = useState<'home' | 'add' | 'sell' | 'history' | 'taxes' | 'more' | 'charts' | 'retire'>('home');
  const [purchases, setPurchases] = useState<CryptoPurchase[]>([]);
  const [sales, setSales] = useState<CryptoSale[]>([]);
  const [taxLosses, setTaxLosses] = useState<{[year: string]: number}>({});
  const [expandedYears, setExpandedYears] = useState<{[year: string]: boolean}>({});
  const [taxViewMode, setTaxViewMode] = useState<'years' | 'months'>('years');
  const [declarationPercent, setDeclarationPercent] = useState<Record<string, number>>({});
  const [coin, setCoin] = useState('');
  const [quantity, setQuantity] = useState('');
  const [pricePaid, setPricePaid] = useState('');
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [filterCoin, setFilterCoin] = useState<string>('');
  const [filterStartDate, setFilterStartDate] = useState<string>('');
  const [filterEndDate, setFilterEndDate] = useState<string>('');
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  const [tempStartDate, setTempStartDate] = useState(new Date());
  const [tempEndDate, setTempEndDate] = useState(new Date());
  const [purchaseDate, setPurchaseDate] = useState<Date>(new Date());
  const [showPurchaseDatePicker, setShowPurchaseDatePicker] = useState(false);
  const [tempPurchaseDate, setTempPurchaseDate] = useState(new Date());
  const [dollarRate, setDollarRate] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isBiometricSupported, setIsBiometricSupported] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportData, setExportData] = useState('');
  const [sellCoin, setSellCoin] = useState('');
  const [sellQuantity, setSellQuantity] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [sellDollarRate, setSellDollarRate] = useState('');
  const [sellDate, setSellDate] = useState<Date>(new Date());
  const [showSellDatePicker, setShowSellDatePicker] = useState(false);
  const [tempSellDate, setTempSellDate] = useState(new Date());
  const [transactionType, setTransactionType] = useState<'all' | 'purchases' | 'sales'>('all');
  const [showBackupModal, setShowBackupModal] = useState(false);
  const [backupData, setBackupData] = useState('');
  const [importData, setImportData] = useState('');
  const [backupMode, setBackupMode] = useState<'menu' | 'generate' | 'restore'>('menu'); // Novo estado
  const [hideValues, setHideValues] = useState(false); // Ocultar valores
  const [purchaseAttachment, setPurchaseAttachment] = useState<string | null>(null);
  const [sellAttachment, setSellAttachment] = useState<string | null>(null);
  const [viewingAttachment, setViewingAttachment] = useState<string | null>(null);
  const [showAttachmentModal, setShowAttachmentModal] = useState(false);
  
  // Novos estados v22
  const [editingSaleId, setEditingSaleId] = useState<string | null>(null);
  const [sellIsExempt, setSellIsExempt] = useState(false);
  // Conversor Stablecoin → Cripto
  const [sellScreenMode, setSellScreenMode] = useState<'sell' | 'convert'>('sell');
  const [convertFromCoin, setConvertFromCoin] = useState('');
  const [convertFromAmount, setConvertFromAmount] = useState('');
  const [convertToCoin, setConvertToCoin] = useState('');
  const [convertToAmount, setConvertToAmount] = useState('');
  const [convertDollarRate, setConvertDollarRate] = useState('');
  const [convertDate, setConvertDate] = useState<Date>(new Date());
  const [showConvertDatePicker, setShowConvertDatePicker] = useState(false);
  const [tempConvertDate, setTempConvertDate] = useState(new Date());
  const [sellExchangeType, setSellExchangeType] = useState<'nacional' | 'internacional'>('internacional');
  const [sellTaxPaid, setSellTaxPaid] = useState('');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [showTaxCalculator, setShowTaxCalculator] = useState(false);
  const [calcCoin, setCalcCoin] = useState('');
  const [calcQuantity, setCalcQuantity] = useState('');
  const [calcSellPrice, setCalcSellPrice] = useState('');
  const [currentDollarRate, setCurrentDollarRate] = useState<number | null>(null);
  const [currentBtcPrice, setCurrentBtcPrice] = useState<number | null>(null);
  const [currentPrices, setCurrentPrices] = useState<{[coin: string]: number}>({});
  const [retireSettings, setRetireSettings] = useState<RetireSettings>(DEFAULT_RETIRE_SETTINGS);
  const [showRetireConfig, setShowRetireConfig] = useState(false);
  const [retireScenario, setRetireScenario] = useState<RetireScenario>('custom');

  useEffect(() => {
    checkBiometricSupport();
    loadData();
    fetchDollarRate();
    fetchBtcPrice();
    loadRetireSettings();
  }, []);

  useEffect(() => {
    if (purchases.length > 0) {
      const coins = [...new Set(purchases.map(p => p.coin.toUpperCase()))];
      fetchCoinPrices(coins);
    }
  }, [purchases]);

  useEffect(() => {
    if (isAuthenticated) {
      checkBackupReminder();
    }
  }, [isAuthenticated]);

  const checkBiometricSupport = async () => {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    setIsBiometricSupported(compatible);
  };

  const handleAuthentication = async () => {
    try {
      const hasEnrolled = await LocalAuthentication.isEnrolledAsync();
      
      if (!hasEnrolled) {
        Alert.alert(
          'Biometria não configurada',
          'Configure sua digital ou PIN no dispositivo para usar esta função.',
          [{ text: 'OK', onPress: () => setIsAuthenticated(true) }]
        );
        return;
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Autentique-se para acessar o CapitalChain',
        fallbackLabel: 'Usar PIN',
        cancelLabel: 'Cancelar',
      });

      if (result.success) {
        setIsAuthenticated(true);
      } else {
        Alert.alert(
          'Autenticação falhou',
          'Tente novamente',
          [{ text: 'Tentar novamente', onPress: handleAuthentication }]
        );
      }
    } catch (error) {
      console.error('Erro na autenticação:', error);
      Alert.alert('Erro', 'Não foi possível autenticar. Acessando sem segurança...');
      setIsAuthenticated(true);
    }
  };

  const loadData = async () => {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEY);
      if (data) {
        setPurchases(JSON.parse(data));
      }
      const salesData = await AsyncStorage.getItem(SALES_STORAGE_KEY);
      if (salesData) {
        setSales(JSON.parse(salesData));
      }
      const lossesData = await AsyncStorage.getItem(TAX_LOSSES_KEY);
      if (lossesData) {
        setTaxLosses(JSON.parse(lossesData));
      }
      const hideValData = await AsyncStorage.getItem(HIDE_VALUES_KEY);
      if (hideValData !== null) {
        setHideValues(JSON.parse(hideValData));
      }
      const declPctData = await AsyncStorage.getItem(DECL_PERCENT_KEY);
      if (declPctData) {
        setDeclarationPercent(JSON.parse(declPctData));
      }
    } catch (error) {
      console.error('Erro ao carregar:', error);
    } finally {
      setLoading(false);
    }
  };

  const savePurchases = async (data: CryptoPurchase[]) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('Erro ao salvar:', error);
    }
  };

  const saveSales = async (data: CryptoSale[]) => {
    try {
      await AsyncStorage.setItem(SALES_STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('Erro ao salvar:', error);
    }
  };

  const saveTaxLosses = async (losses: {[year: string]: number}) => {
    try {
      await AsyncStorage.setItem(TAX_LOSSES_KEY, JSON.stringify(losses));
      setTaxLosses(losses);
    } catch (error) {
      console.error('Erro ao salvar prejuízos:', error);
    }
  };

  const toggleHideValues = async () => {
    const newValue = !hideValues;
    setHideValues(newValue);
    await AsyncStorage.setItem(HIDE_VALUES_KEY, JSON.stringify(newValue));
  };

  const markBackupDone = async () => {
    await AsyncStorage.setItem(LAST_BACKUP_KEY, new Date().toISOString());
  };

  const checkBackupReminder = async () => {
    try {
      const lastBackup = await AsyncStorage.getItem(LAST_BACKUP_KEY);
      if (!lastBackup) {
        Alert.alert(
          '💾 Backup recomendado',
          'Você ainda não fez nenhum backup dos seus dados. Recomendamos fazer um agora para não correr o risco de perder tudo.',
          [
            { text: 'Depois', style: 'cancel' },
            { text: 'Fazer backup', onPress: () => { exportBackup(); } }
          ]
        );
        return;
      }
      const daysDiff = Math.floor((Date.now() - new Date(lastBackup).getTime()) / (1000 * 60 * 60 * 24));
      if (daysDiff >= 7) {
        Alert.alert(
          '💾 Backup desatualizado',
          `Seu último backup foi há ${daysDiff} dia${daysDiff === 1 ? '' : 's'}. Recomendamos atualizar para não perder seus dados.`,
          [
            { text: 'Depois', style: 'cancel' },
            { text: 'Fazer backup', onPress: () => { exportBackup(); } }
          ]
        );
      }
    } catch (error) {
      console.error('Erro ao verificar backup:', error);
    }
  };

  const promptBackupAfterChange = () => {
    setTimeout(() => {
      Alert.alert(
        '💾 Atualizar backup?',
        'Seus dados foram alterados. Deseja atualizar o backup agora?',
        [
          { text: 'Agora não', style: 'cancel' },
          { text: 'Fazer backup', onPress: () => { exportBackup(); } }
        ]
      );
    }, 600);
  };

  // Determina o código da Receita Federal para cada cripto
  const getCryptoCode = (coin: string): string => {
    const coinUpper = coin.toUpperCase();
    
    // 08.01 - Bitcoin
    if (coinUpper === 'BTC' || coinUpper === 'BITCOIN') {
      return '08.01';
    }
    
    // 08.03 - Stablecoins
    const stablecoins = ['USDT', 'USDC', 'BUSD', 'DAI', 'TUSD', 'USDP', 'GUSD', 'PYUSD'];
    if (stablecoins.includes(coinUpper)) {
      return '08.03';
    }
    
    // 08.02 - Outras moedas digitais
    return '08.02';
  };

  const getCryptoDescription = (coin: string): string => {
    const code = getCryptoCode(coin);
    const coinUpper = coin.toUpperCase();
    
    if (code === '08.01') {
      return 'Bitcoin';
    } else if (code === '08.03') {
      return 'Stablecoins';
    } else {
      return 'Outras moedas digitais';
    }
  };

  // Buscar cotação atual do dólar (Banco Central)
  const fetchDollarRate = async () => {
    try {
      for (let daysBack = 0; daysBack <= 5; daysBack++) {
        const date = new Date();
        date.setDate(date.getDate() - daysBack);
        const mm = String(date.getMonth() + 1).padStart(2, '0');
        const dd = String(date.getDate()).padStart(2, '0');
        const yyyy = date.getFullYear();
        const dateStr = `${mm}-${dd}-${yyyy}`;
        const response = await fetch(
          `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao='${dateStr}'&$format=json`
        );
        const data = await response.json();
        if (data.value && data.value.length > 0) {
          const rate = data.value[0].cotacaoVenda;
          setCurrentDollarRate(rate);
          setDollarRate(rate.toFixed(2).replace('.', ','));
          setSellDollarRate(rate.toFixed(2).replace('.', ','));
          setConvertDollarRate(rate.toFixed(2).replace('.', ','));
          return rate;
        }
      }
    } catch (error) {
      console.error('Erro ao buscar cotação:', error);
    }
    return null;
  };

  const fetchBtcPrice = async () => {
    try {
      const response = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd'
      );
      const data = await response.json();
      if (data?.bitcoin?.usd) {
        setCurrentBtcPrice(data.bitcoin.usd);
      }
    } catch (error) {
      console.error('Erro ao buscar preço do BTC:', error);
    }
  };

  const fetchCoinPrices = async (coins: string[]) => {
    try {
      const ids = coins.map(c => COINGECKO_IDS[c]).filter(Boolean).join(',');
      if (!ids) return;
      const response = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`
      );
      const data = await response.json();
      const priceMap: {[coin: string]: number} = {};
      coins.forEach(coin => {
        const id = COINGECKO_IDS[coin];
        if (id && data[id]?.usd) priceMap[coin] = data[id].usd;
      });
      setCurrentPrices(priceMap);
    } catch (e) {
      console.error('Erro ao buscar preços:', e);
    }
  };

  const loadRetireSettings = async () => {
    try {
      const saved = await AsyncStorage.getItem(RETIRE_SETTINGS_KEY);
      if (saved) setRetireSettings({ ...DEFAULT_RETIRE_SETTINGS, ...JSON.parse(saved) });
    } catch (e) {}
  };

  const updateRetireSetting = async <K extends keyof RetireSettings>(key: K, value: RetireSettings[K]) => {
    setRetireScenario('custom');
    setRetireSettings(prev => {
      const next = { ...prev, [key]: value };
      AsyncStorage.setItem(RETIRE_SETTINGS_KEY, JSON.stringify(next));
      return next;
    });
  };

  const applyScenario = (scenario: Exclude<RetireScenario, 'custom'>) => {
    const preset = SCENARIO_PRESETS[scenario];
    const next = { ...retireSettings, ...preset };
    setRetireSettings(next);
    setRetireScenario(scenario);
    AsyncStorage.setItem(RETIRE_SETTINGS_KEY, JSON.stringify(next));
  };

  // Calculadora de Imposto Pré-Venda
  const calculateTaxBeforeSale = () => {
    if (!calcCoin.trim() || !calcQuantity || !calcSellPrice) {
      Alert.alert('Erro', 'Preencha todos os campos');
      return;
    }

    const coinUpper = calcCoin.trim().toUpperCase();
    const qty = parseFloat(calcQuantity.replace(',', '.'));
    const sellPrice = parseFloat(calcSellPrice.replace(',', '.'));

    // Buscar compras da moeda
    const coinPurchases = purchases.filter(p => p.coin === coinUpper);
    if (coinPurchases.length === 0) {
      Alert.alert('Aviso', `Você não possui ${coinUpper} registrado`);
      return;
    }

    const totalBought = coinPurchases.reduce((sum, p) => sum + p.quantity, 0);
    if (qty > totalBought) {
      Alert.alert('Erro', `Você só tem ${formatQuantity(totalBought)} ${coinUpper}`);
      return;
    }

    // Calcular preço médio de compra
    const avgCost = coinPurchases.reduce((sum, p) => sum + p.pricePaid, 0) / totalBought;
    const profit = sellPrice - (avgCost * qty);
    
    // Imposto 15% sobre lucro
    const tax = profit > 0 ? profit * 0.15 : 0;
    const netProfit = profit - tax;

    Alert.alert(
      '💰 Simulação de Venda',
      `Moeda: ${coinUpper}\n` +
      `Quantidade: ${formatQuantity(qty)}\n` +
      `Preço de Venda: ${formatCurrency(sellPrice)}\n\n` +
      `Custo Médio: ${formatCurrency(avgCost * qty)}\n` +
      `${profit >= 0 ? 'Lucro' : 'Prejuízo'}: ${formatCurrency(Math.abs(profit))}\n\n` +
      `Imposto (15%): ${formatCurrency(tax)}\n` +
      `${profit >= 0 ? 'Lucro Líquido' : 'Prejuízo Total'}: ${formatCurrency(netProfit)}`,
      [{ text: 'OK' }]
    );
  };

  const pickImageFromGallery = async (type: 'purchase' | 'sale') => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    
    if (permissionResult.granted === false) {
      Alert.alert('Permissão necessária', 'É necessário permitir acesso à galeria de fotos');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.7,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      const base64Image = `data:image/jpeg;base64,${result.assets[0].base64}`;
      if (type === 'purchase') {
        setPurchaseAttachment(base64Image);
      } else {
        setSellAttachment(base64Image);
      }
    }
  };

  // Exportar Relatório RF para PDF
  const exportRFReportToPDF = async () => {
    try {
      // Exportar relatório RF como texto compartilhável
      const taxData = calculateTaxReport();
      let report = '📋 RELATÓRIO RECEITA FEDERAL\n';
      report += '================================\n';
      report += 'Gerado em: ' + new Date().toLocaleDateString('pt-BR') + '\n\n';
      
      if (taxData.fiscalYears && taxData.fiscalYears.length > 0) {
        taxData.fiscalYears.forEach((year: any) => {
          report += `📅 ANO ${year.year}\n`;
          report += `Patrimônio 31/12: ${formatCurrency(year.patrimonyEnd)}\n`;
          report += `Resultado: ${formatCurrency(year.netResult)}\n`;
          report += `Imposto (15%): ${formatCurrency(year.taxDue)}\n\n`;
        });
      } else {
        report += '📊 BENS E DIREITOS\n';
        taxData.patrimonyAssets.forEach((asset: any) => {
          report += `${asset.coin}: ${formatQuantity(asset.quantity)} | Custo: ${formatCurrency(asset.totalCost)}\n`;
        });
        report += `\nTotal: ${formatCurrency(taxData.totalPatrimony)}\n`;
      }
      
      await Share.share({
        message: report,
        title: 'Relatório Receita Federal - CapitalChain'
      });
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível exportar o relatório');
    }
  };
  const takePicture = async (type: 'purchase' | 'sale') => {
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
    
    if (permissionResult.granted === false) {
      Alert.alert('Permissão necessária', 'É necessário permitir acesso à câmera');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.7,
      base64: true,
    });

    if (!result.canceled && result.assets[0].base64) {
      const base64Image = `data:image/jpeg;base64,${result.assets[0].base64}`;
      if (type === 'purchase') {
        setPurchaseAttachment(base64Image);
      } else {
        setSellAttachment(base64Image);
      }
    }
  };

  const removeAttachment = (type: 'purchase' | 'sale') => {
    if (type === 'purchase') {
      setPurchaseAttachment(null);
    } else {
      setSellAttachment(null);
    }
  };

  const viewAttachment = (attachment: string) => {
    setViewingAttachment(attachment);
    setShowAttachmentModal(true);
  };

  const getUniqueCoins = () => {
    const coins = new Set(purchases.map(p => p.coin));
    return Array.from(coins).sort();
  };

  const applyFilters = (purchasesList: CryptoPurchase[]) => {
    let filtered = [...purchasesList];

    // Filtrar por moeda
    if (filterCoin) {
      filtered = filtered.filter(p => p.coin === filterCoin);
    }

    // Filtrar por período (comparando apenas as datas, sem horas)
    if (filterStartDate) {
      const startDate = new Date(filterStartDate);
      startDate.setHours(0, 0, 0, 0);
      filtered = filtered.filter(p => {
        const purchaseDate = new Date(p.date);
        purchaseDate.setHours(0, 0, 0, 0);
        return purchaseDate >= startDate;
      });
    }
    if (filterEndDate) {
      const endDate = new Date(filterEndDate);
      endDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter(p => {
        const purchaseDate = new Date(p.date);
        return purchaseDate <= endDate;
      });
    }

    return filtered;
  };

  const applySalesFilters = (salesList: CryptoSale[]) => {
    let filtered = [...salesList];

    // Filtrar por moeda
    if (filterCoin) {
      filtered = filtered.filter(s => s.coin === filterCoin);
    }

    // Filtrar por período
    if (filterStartDate) {
      const startDate = new Date(filterStartDate);
      startDate.setHours(0, 0, 0, 0);
      filtered = filtered.filter(s => {
        const saleDate = new Date(s.date);
        saleDate.setHours(0, 0, 0, 0);
        return saleDate >= startDate;
      });
    }
    if (filterEndDate) {
      const endDate = new Date(filterEndDate);
      endDate.setHours(23, 59, 59, 999);
      filtered = filtered.filter(s => {
        const saleDate = new Date(s.date);
        return saleDate <= endDate;
      });
    }

    return filtered;
  };

  const clearFilters = () => {
    setFilterCoin('');
    setFilterStartDate('');
    setFilterEndDate('');
    setTransactionType('all');
  };

  const handleStartDateConfirm = () => {
    const formattedDate = tempStartDate.toISOString().split('T')[0];
    setFilterStartDate(formattedDate);
    setShowStartDatePicker(false);
  };

  const handleEndDateConfirm = () => {
    const formattedDate = tempEndDate.toISOString().split('T')[0];
    setFilterEndDate(formattedDate);
    setShowEndDatePicker(false);
  };

  const handlePurchaseDateConfirm = () => {
    setPurchaseDate(tempPurchaseDate);
    setShowPurchaseDatePicker(false);
  };

  const handleSellDateConfirm = () => {
    setSellDate(tempSellDate);
    setShowSellDatePicker(false);
  };

  const handleConvertDateConfirm = () => {
    setConvertDate(tempConvertDate);
    setShowConvertDatePicker(false);
  };

  const renderDatePicker = (visible: boolean, date: Date, onDateChange: (date: Date) => void, onConfirm: () => void, onCancel: () => void) => {
    if (!visible) return null;

    const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 50 }, (_, i) => currentYear - i); // Últimos 50 anos
    const months = monthNames.map((name, index) => ({ name, value: index }));
    const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    return (
      <Modal transparent visible={visible} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.datePickerContainer}>
            <Text style={styles.datePickerTitle}>📅 Selecione a Data</Text>
            
            <View style={styles.dateSelectorsRow}>
              {/* Seletor de Dia */}
              <View style={styles.dateSelectorColumn}>
                <Text style={styles.dateSelectorLabel}>Dia</Text>
                <ScrollView style={styles.dateScrollView} showsVerticalScrollIndicator={true}>
                  {days.map((day) => (
                    <TouchableOpacity
                      key={day}
                      style={[
                        styles.dateOption,
                        day === date.getDate() && styles.dateOptionSelected,
                      ]}
                      onPress={() => {
                        const newDate = new Date(date);
                        newDate.setDate(day);
                        onDateChange(newDate);
                      }}
                    >
                      <Text style={[
                        styles.dateOptionText,
                        day === date.getDate() && styles.dateOptionTextSelected,
                      ]}>
                        {day}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Seletor de Mês */}
              <View style={styles.dateSelectorColumn}>
                <Text style={styles.dateSelectorLabel}>Mês</Text>
                <ScrollView style={styles.dateScrollView} showsVerticalScrollIndicator={true}>
                  {months.map((month) => (
                    <TouchableOpacity
                      key={month.value}
                      style={[
                        styles.dateOption,
                        month.value === date.getMonth() && styles.dateOptionSelected,
                      ]}
                      onPress={() => {
                        const newDate = new Date(date);
                        newDate.setMonth(month.value);
                        // Ajustar dia se necessário
                        const maxDay = new Date(newDate.getFullYear(), month.value + 1, 0).getDate();
                        if (newDate.getDate() > maxDay) {
                          newDate.setDate(maxDay);
                        }
                        onDateChange(newDate);
                      }}
                    >
                      <Text style={[
                        styles.dateOptionText,
                        month.value === date.getMonth() && styles.dateOptionTextSelected,
                      ]}>
                        {month.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* Seletor de Ano */}
              <View style={styles.dateSelectorColumn}>
                <Text style={styles.dateSelectorLabel}>Ano</Text>
                <ScrollView style={styles.dateScrollView} showsVerticalScrollIndicator={true}>
                  {years.map((year) => (
                    <TouchableOpacity
                      key={year}
                      style={[
                        styles.dateOption,
                        year === date.getFullYear() && styles.dateOptionSelected,
                      ]}
                      onPress={() => {
                        const newDate = new Date(date);
                        newDate.setFullYear(year);
                        // Ajustar dia se necessário (ex: 29 de fev em ano não bissexto)
                        const maxDay = new Date(year, newDate.getMonth() + 1, 0).getDate();
                        if (newDate.getDate() > maxDay) {
                          newDate.setDate(maxDay);
                        }
                        onDateChange(newDate);
                      }}
                    >
                      <Text style={[
                        styles.dateOptionText,
                        year === date.getFullYear() && styles.dateOptionTextSelected,
                      ]}>
                        {year}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>

            <View style={styles.datePickerPreview}>
              <Text style={styles.datePickerPreviewText}>
                📅 {date.getDate()} de {monthNames[date.getMonth()]} de {date.getFullYear()}
              </Text>
            </View>

            <View style={styles.datePickerButtons}>
              <TouchableOpacity style={styles.datePickerCancelButton} onPress={onCancel}>
                <Text style={styles.datePickerCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.datePickerConfirmButton} onPress={onConfirm}>
                <Text style={styles.datePickerConfirmText}>Confirmar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    );
  };



  const STABLECOINS = ['USDT', 'USDC', 'BUSD', 'DAI', 'TUSD', 'USDD', 'USDP', 'GUSD', 'FDUSD', 'PYUSD', 'USDB', 'USDE', 'UST', 'FRAX'];

  const isStablecoin = (coin: string): boolean => {
    const upper = coin.toUpperCase();
    return STABLECOINS.includes(upper) || upper.startsWith('USD') || upper.endsWith('USD');
  };

  const calculateSummary = () => {
    const coinMap = new Map();

    purchases.forEach((p) => {
      const existing = coinMap.get(p.coin) || { 
        totalBought: 0, 
        totalSold: 0, 
        invested: 0, 
        count: 0, 
        totalDollarCost: 0,
        totalProfit: 0,
      };
      coinMap.set(p.coin, {
        totalBought: existing.totalBought + p.quantity,
        totalSold: existing.totalSold,
        invested: existing.invested + p.pricePaid,
        count: existing.count + 1,
        totalDollarCost: existing.totalDollarCost + (p.pricePaid * p.dollarRate),
        totalProfit: existing.totalProfit,
      });
    });

    sales.forEach((s) => {
      const existing = coinMap.get(s.coin);
      if (existing) {
        coinMap.set(s.coin, {
          ...existing,
          totalSold: existing.totalSold + s.quantity,
          totalProfit: existing.totalProfit + s.profit,
        });
      }
    });

    const summary: any[] = [];
    coinMap.forEach((data, coinName) => {
      const available = data.totalBought - data.totalSold;
      if (available > 0 || data.totalSold > 0) {
        summary.push({
          coin: coinName,
          totalQuantity: data.totalBought,
          available: available,
          sold: data.totalSold,
          totalInvested: data.invested,
          averagePrice: data.invested / data.totalBought,
          count: data.count,
          averageDollarRate: data.totalDollarCost / data.invested,
          totalProfit: data.totalProfit,
        });
      }
    });

    return summary.sort((a, b) => b.totalInvested - a.totalInvested);
  };

  const calculateFilteredSummary = (filteredList: CryptoPurchase[]) => {
    const coinMap = new Map();

    filteredList.forEach((p) => {
      const existing = coinMap.get(p.coin) || { total: 0, invested: 0, count: 0, totalDollarCost: 0 };
      coinMap.set(p.coin, {
        total: existing.total + p.quantity,
        invested: existing.invested + p.pricePaid,
        count: existing.count + 1,
        totalDollarCost: existing.totalDollarCost + (p.pricePaid * p.dollarRate),
      });
    });

    const summary: any[] = [];
    coinMap.forEach((data, coinName) => {
      summary.push({
        coin: coinName,
        totalQuantity: data.total,
        totalInvested: data.invested,
        averagePrice: data.invested / data.total,
        count: data.count,
        totalDollarCost: data.totalDollarCost,
        averageDollarRate: data.totalDollarCost / data.invested,
      });
    });

    return summary.sort((a, b) => b.totalInvested - a.totalInvested);
  };

  const calculateFilteredSalesSummary = (filteredSalesList: CryptoSale[]) => {
    const coinMap = new Map();

    filteredSalesList.forEach((s) => {
      const existing = coinMap.get(s.coin) || { totalSold: 0, revenue: 0, count: 0, totalProfit: 0, totalDollarRevenue: 0 };
      coinMap.set(s.coin, {
        totalSold: existing.totalSold + s.quantity,
        revenue: existing.revenue + s.priceSold,
        count: existing.count + 1,
        totalProfit: existing.totalProfit + s.profit,
        totalDollarRevenue: existing.totalDollarRevenue + (s.priceSold * s.dollarRate),
      });
    });

    const summary: any[] = [];
    coinMap.forEach((data, coinName) => {
      summary.push({
        coin: coinName,
        totalSold: data.totalSold,
        revenue: data.revenue,
        averageSalePrice: data.revenue / data.totalSold,
        count: data.count,
        totalProfit: data.totalProfit,
        totalDollarRevenue: data.totalDollarRevenue,
        averageDollarRate: data.totalDollarRevenue / data.revenue,
      });
    });

    return summary.sort((a, b) => b.revenue - a.revenue);
  };

  const calculateTaxReport = () => {
    // Nova regra 2026: Exchanges internacionais - 15% sobre qualquer ganho, sem isenção
    const monthlyData = new Map<string, { sales: number; cost: number; profit: number; transactions: CryptoSale[] }>();
    
    sales.forEach((sale) => {
      const date = new Date(sale.date);
      const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      
      const existing = monthlyData.get(monthKey) || { sales: 0, cost: 0, profit: 0, transactions: [] };
      const saleBRL = sale.priceSold * sale.dollarRate;
      const costBRL = (sale.priceSold - sale.profit) * sale.dollarRate;
      
      // Vendas isentas (corretora nacional < R$35k) nao entram no calculo de imposto
      if (sale.isExempt) {
        monthlyData.set(monthKey, {
          ...existing,
          transactions: [...existing.transactions, sale],
        });
        return;
      }
      
      monthlyData.set(monthKey, {
        sales: existing.sales + saleBRL,
        cost: existing.cost + costBRL,
        profit: existing.profit + (sale.profit * sale.dollarRate),
        transactions: [...existing.transactions, sale],
      });
    });

    // Calcular impostos mensais
    const taxMonths: any[] = [];
    let yearlyProfit = 0; // Para compensação de perdas dentro do ano
    let yearlyLoss = 0;
    
    monthlyData.forEach((data, monthKey) => {
      const [year, month] = monthKey.split('-');
      
      // Nova regra 2026: SEM isenção de R$ 35k para exchanges internacionais
      // 15% sobre QUALQUER ganho de capital
      const isTaxable = data.profit > 0; // Qualquer lucro é tributável
      const taxRate = 0.15;
      const taxDue = data.profit > 0 ? data.profit * taxRate : 0;
      
      // Acumular lucros e perdas do ano para compensação
      if (data.profit > 0) {
        yearlyProfit += data.profit;
      } else {
        yearlyLoss += Math.abs(data.profit);
      }
      
      // Vencimento do DARF é último dia do mês seguinte
      const dueDate = new Date(parseInt(year), parseInt(month) + 1, 0); // Último dia do mês seguinte
      
      taxMonths.push({
        year,
        month,
        monthName: ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 
                    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'][parseInt(month) - 1],
        sales: data.sales,
        cost: data.cost,
        profit: data.profit,
        isTaxable,
        taxDue,
        dueDate: dueDate.toLocaleDateString('pt-BR'),
        isPending: taxDue > 0,
      });
    });

    // FUNÇÃO: Calcular patrimônio em uma data específica
    const calculatePatrimonyAtDate = (targetDate: Date) => {
      const coinPatrimony = new Map<string, { quantity: number; averageCost: number; weightedDollarRate: number }>();
      
      // Processar compras até a data alvo
      purchases.forEach((p) => {
        const purchaseDate = new Date(p.date);
        if (purchaseDate <= targetDate) {
          const existing = coinPatrimony.get(p.coin) || { quantity: 0, averageCost: 0, weightedDollarRate: 0 };
          const newQuantity = existing.quantity + p.quantity;
          
          if (newQuantity > 0) {
            const newAverageCost = ((existing.averageCost * existing.quantity) + (p.pricePaid * p.dollarRate)) / newQuantity;
            const newWeightedDollarRate = existing.quantity === 0
              ? p.dollarRate
              : ((existing.weightedDollarRate * existing.quantity) + (p.dollarRate * p.quantity)) / newQuantity;
            coinPatrimony.set(p.coin, { quantity: newQuantity, averageCost: newAverageCost, weightedDollarRate: newWeightedDollarRate });
          }
        }
      });

      // Processar vendas até a data alvo
      sales.forEach((s) => {
        const saleDate = new Date(s.date);
        if (saleDate <= targetDate) {
          const existing = coinPatrimony.get(s.coin);
          if (existing) {
            coinPatrimony.set(s.coin, {
              ...existing,
              quantity: existing.quantity - s.quantity,
            });
          }
        }
      });

      // Compilar ativos
      const assets: any[] = [];
      let total = 0;
      
      coinPatrimony.forEach((data, coinName) => {
        if (data.quantity > 0) {
          const totalCost = data.quantity * data.averageCost;
          total += totalCost;
          assets.push({
            coin: coinName,
            quantity: data.quantity,
            averageCost: data.averageCost,
            totalCost,
            averageDollarRate: data.weightedDollarRate || 0,
          });
        }
      });

      return { total, assets: assets.sort((a, b) => b.totalCost - a.totalCost) };
    };

    // Calcular patrimônio em 31/12 (usando custo médio)
    const coinPatrimony = new Map<string, { quantity: number; averageCost: number }>();
    
    purchases.forEach((p) => {
      const existing = coinPatrimony.get(p.coin) || { quantity: 0, averageCost: 0 };
      const newQuantity = existing.quantity + p.quantity;
      
      if (newQuantity > 0) {
        const newAverageCost = ((existing.averageCost * existing.quantity) + (p.pricePaid * p.dollarRate)) / newQuantity;
        
        coinPatrimony.set(p.coin, {
          quantity: newQuantity,
          averageCost: newAverageCost,
        });
      }
    });

    sales.forEach((s) => {
      const existing = coinPatrimony.get(s.coin);
      if (existing) {
        coinPatrimony.set(s.coin, {
          ...existing,
          quantity: existing.quantity - s.quantity,
        });
      }
    });

    const patrimonyAssets: any[] = [];
    let totalPatrimony = 0;
    
    coinPatrimony.forEach((data, coinName) => {
      if (data.quantity > 0) {
        const totalCost = data.quantity * data.averageCost;
        totalPatrimony += totalCost;
        
        patrimonyAssets.push({
          coin: coinName,
          quantity: data.quantity,
          averageCost: data.averageCost,
          totalCost,
        });
      }
    });

    // Compensação de perdas dentro do ano
    const netProfit = yearlyProfit - yearlyLoss;
    const compensatedTax = netProfit > 0 ? netProfit * 0.15 : 0;

    // NOVO: Agrupar dados por ano fiscal com patrimônio e compensação interanual
    const yearlyData = new Map<string, any>();
    taxMonths.forEach(month => {
      if (!yearlyData.has(month.year)) {
        yearlyData.set(month.year, {
          year: month.year,
          months: [],
          totalProfit: 0,
          totalLoss: 0,
        });
      }
      const yearData = yearlyData.get(month.year)!;
      yearData.months.push(month);
      if (month.profit > 0) {
        yearData.totalProfit += month.profit;
      } else {
        yearData.totalLoss += Math.abs(month.profit);
      }
    });

    // CORREÇÃO: Incluir também anos onde há COMPRAS (mesmo sem vendas)
    // Isso garante que a aba Impostos mostre o patrimônio mesmo sem vendas registradas
    purchases.forEach(p => {
      const purchaseYear = new Date(p.date).getFullYear().toString();
      if (!yearlyData.has(purchaseYear)) {
        yearlyData.set(purchaseYear, {
          year: purchaseYear,
          months: [],
          totalProfit: 0,
          totalLoss: 0,
        });
      }
    });

    // Ordenar anos para processar sequencialmente
    const sortedYears = Array.from(yearlyData.keys()).sort();
    const newTaxLosses: {[year: string]: number} = {};
    
    const fiscalYears = sortedYears.map((yearKey, index) => {
      const year = yearlyData.get(yearKey)!;
      
      // Calcular patrimônio em 31/12 do ano anterior e do ano atual
      const startDate = new Date(parseInt(year.year) - 1, 11, 31, 23, 59, 59);
      const endDate = new Date(parseInt(year.year), 11, 31, 23, 59, 59);
      
      const patrimonyStart = calculatePatrimonyAtDate(startDate);
      const patrimonyEnd = calculatePatrimonyAtDate(endDate);
      
      // COMPENSAÇÃO INTERANUAL
      // Buscar prejuízos acumulados de anos anteriores
      let accumulatedLoss = 0;
      for (let i = 0; i < index; i++) {
        const prevYear = sortedYears[i];
        accumulatedLoss += taxLosses[prevYear] || 0;
      }
      
      // Calcular resultado líquido do ano
      const netResult = year.totalProfit - year.totalLoss;
      
      // Aplicar compensação de prejuízos acumulados
      const netResultWithCompensation = netResult - accumulatedLoss;
      
      // Imposto após compensação (15% sobre o que sobrar após compensar prejuízos)
      const taxAfterCompensation = netResultWithCompensation > 0 ? netResultWithCompensation * 0.15 : 0;
      
      // Prejuízo a carregar para anos futuros
      let lossToCarry = 0;
      if (netResult < 0) {
        // Teve prejuízo no ano - carregar tudo
        lossToCarry = Math.abs(netResult);
      } else if (netResultWithCompensation < 0) {
        // Teve lucro mas não foi suficiente para cobrir prejuízos anteriores
        lossToCarry = Math.abs(netResultWithCompensation);
      }
      
      // Armazenar prejuízo para próximos anos (mas não salvar agora - evita loop)
      if (lossToCarry > 0) {
        newTaxLosses[year.year] = lossToCarry;
      }
      
      return {
        ...year,
        patrimonyStart: patrimonyStart.total,
        patrimonyEnd: patrimonyEnd.total,
        patrimonyStartAssets: patrimonyStart.assets,
        patrimonyEndAssets: patrimonyEnd.assets,
        netResult,
        accumulatedLoss, // Prejuízos de anos anteriores
        netResultWithCompensation, // Resultado após compensar prejuízos
        taxAfterCompensation, // Imposto após compensação
        taxDue: taxAfterCompensation, // Usar imposto compensado
        lossToCarry, // Prejuízo para carregar adiante
        needsDeclaration: patrimonyEnd.total > 5000 || year.months.length > 0,
      };
    });

    return {
      fiscalYears: fiscalYears.sort((a, b) => b.year.localeCompare(a.year)),
      newTaxLosses, // Retornar prejuízos calculados para salvar externamente
      taxMonths: taxMonths.sort((a, b) => `${a.year}-${a.month}`.localeCompare(`${b.year}-${b.month}`)),
      patrimonyAssets: patrimonyAssets.sort((a, b) => b.totalCost - a.totalCost),
      totalPatrimony,
      needsDeclaration: totalPatrimony > 5000 || sales.length > 0,
      pendingDARFs: taxMonths.filter(m => m.isPending),
      yearlyProfit,
      yearlyLoss,
      netProfit,
      compensatedTax, // Imposto total após compensação de perdas
    };
  };

  const handleAddPurchase = async () => {
    try {
      if (!coin.trim()) {
        Alert.alert('Erro', 'Digite o nome da criptomoeda');
        return;
      }

      const qty = parseFloat(quantity.replace(',', '.'));
      const price = parseFloat(pricePaid.replace(',', '.'));
      const dRate = parseFloat(dollarRate.replace(',', '.'));

      if (isNaN(qty) || qty <= 0) {
        Alert.alert('Erro', 'Digite uma quantidade válida');
        return;
      }

      if (isNaN(price) || price <= 0) {
        Alert.alert('Erro', 'Digite um valor válido');
        return;
      }

      if (isNaN(dRate) || dRate <= 0) {
        Alert.alert('Erro', 'Digite uma cotação do dólar válida');
        return;
      }

      if (editingId) {
        // Editar compra existente
        const updated = purchases.map(p => 
          p.id === editingId
            ? {
                ...p,
                coin: coin.trim().toUpperCase(),
                quantity: qty,
                pricePaid: price,
                pricePerUnit: price / qty,
                date: purchaseDate.toISOString(),
                dollarRate: dRate,
                attachment: purchaseAttachment || p.attachment,
              }
            : p
        );
        await savePurchases(updated);
        setPurchases(updated);
        
        // Recalcular impostos após editar compra
        const tempTaxData = calculateTaxReport();
        if (tempTaxData.newTaxLosses && Object.keys(tempTaxData.newTaxLosses).length > 0) {
          await saveTaxLosses(tempTaxData.newTaxLosses);
        }
        
        Alert.alert('Sucesso!', 'Compra atualizada com sucesso!');
        promptBackupAfterChange();
      } else {
        // Adicionar nova compra
        const newPurchase: CryptoPurchase = {
          id: Date.now().toString(),
          coin: coin.trim().toUpperCase(),
          quantity: qty,
          pricePaid: price,
          date: purchaseDate.toISOString(),
          pricePerUnit: price / qty,
          dollarRate: dRate,
          ...(purchaseAttachment && { attachment: purchaseAttachment }),
        };
        const updated = [...purchases, newPurchase];
        await savePurchases(updated);
        setPurchases(updated);
        
        // Recalcular impostos após adicionar compra
        const tempTaxData = calculateTaxReport();
        if (tempTaxData.newTaxLosses && Object.keys(tempTaxData.newTaxLosses).length > 0) {
          await saveTaxLosses(tempTaxData.newTaxLosses);
        }
        
        Alert.alert('Sucesso!', 'Compra registrada com sucesso!');
        promptBackupAfterChange();
      }

      setCoin('');
      setQuantity('');
      setPricePaid('');
      setDollarRate('');
      setPurchaseDate(new Date());
      setPurchaseAttachment(null);
      setEditingId(null);
      setScreen('home');
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível salvar a compra');
      console.error(error);
    }
  };

  const handleEdit = (purchase: CryptoPurchase) => {
    if (purchase.conversionId) {
      Alert.alert(
        '🔄 Conversão',
        'Este registro faz parte de uma conversão automática e não pode ser editado individualmente.\n\nExclua a conversão e registre novamente para alterar os valores.',
        [{ text: 'Entendido' }]
      );
      return;
    }
    setCoin(purchase.coin);
    setQuantity(purchase.quantity.toString());
    setPricePaid(purchase.pricePaid.toString());
    setDollarRate(purchase.dollarRate.toString());
    setPurchaseDate(new Date(purchase.date));
    setPurchaseAttachment(purchase.attachment || null);
    setEditingId(purchase.id);
    setScreen('add');
  };

  const handleSellCrypto = async () => {
    try {
      if (!sellCoin.trim()) {
        Alert.alert('Erro', 'Digite o nome da criptomoeda');
        return;
      }

      const qty = parseFloat(sellQuantity.replace(',', '.'));
      const price = parseFloat(sellPrice.replace(',', '.'));
      const dRate = parseFloat(sellDollarRate.replace(',', '.'));

      if (isNaN(qty) || qty <= 0) {
        Alert.alert('Erro', 'Digite uma quantidade válida');
        return;
      }

      if (isNaN(price) || price <= 0) {
        Alert.alert('Erro', 'Digite um valor válido');
        return;
      }

      if (isNaN(dRate) || dRate <= 0) {
        Alert.alert('Erro', 'Digite uma cotação do dólar válida');
        return;
      }

      // Verificar se tem quantidade disponível
      const coinUpper = sellCoin.trim().toUpperCase();
      const totalBought = purchases
        .filter(p => p.coin === coinUpper)
        .reduce((sum, p) => sum + p.quantity, 0);
      const totalSold = sales
        .filter(s => s.coin === coinUpper && s.id !== editingSaleId)
        .reduce((sum, s) => sum + s.quantity, 0);
      const available = totalBought - totalSold;

      if (qty > available) {
        Alert.alert(
          'Quantidade Insuficiente',
          `Você só tem ${formatQuantity(available)} ${coinUpper} disponível para vender.`
        );
        return;
      }

      // Calcular preço médio de compra
      const avgPurchasePrice = purchases
        .filter(p => p.coin === coinUpper)
        .reduce((sum, p) => sum + p.pricePaid, 0) / totalBought;
      
      const profit = price - (avgPurchasePrice * qty);
      const tPaid = sellTaxPaid ? parseFloat(sellTaxPaid.replace(',', '.')) : undefined;

      if (editingSaleId) {
        // Editar venda existente
        const updated = sales.map(s =>
          s.id === editingSaleId
            ? {
                ...s,
                coin: coinUpper,
                quantity: qty,
                priceSold: price,
                date: sellDate.toISOString(),
                pricePerUnit: price / qty,
                dollarRate: dRate,
                profit: profit,
                isExempt: sellIsExempt,
                exchangeType: sellExchangeType,
                ...(tPaid !== undefined && !isNaN(tPaid) && { taxPaid: tPaid }),
                ...(sellAttachment && { attachment: sellAttachment }),
              }
            : s
        );
        await saveSales(updated);
        setSales(updated);

        const tempTaxData = calculateTaxReport();
        if (tempTaxData.newTaxLosses && Object.keys(tempTaxData.newTaxLosses).length > 0) {
          await saveTaxLosses(tempTaxData.newTaxLosses);
        }

        Alert.alert('Sucesso!', 'Venda atualizada com sucesso!');
        promptBackupAfterChange();
      } else {
        // Nova venda
        const newSale: CryptoSale = {
          id: Date.now().toString(),
          coin: coinUpper,
          quantity: qty,
          priceSold: price,
          date: sellDate.toISOString(),
          pricePerUnit: price / qty,
          dollarRate: dRate,
          profit: profit,
          isExempt: sellIsExempt,
          exchangeType: sellExchangeType,
          ...(tPaid !== undefined && !isNaN(tPaid) && { taxPaid: tPaid }),
          ...(sellAttachment && { attachment: sellAttachment }),
        };

        const updated = [...sales, newSale];
        await saveSales(updated);
        setSales(updated);

        const tempTaxData = calculateTaxReport();
        if (tempTaxData.newTaxLosses && Object.keys(tempTaxData.newTaxLosses).length > 0) {
          await saveTaxLosses(tempTaxData.newTaxLosses);
        }

        Alert.alert(
          'Sucesso!',
          `Venda registrada!\n${profit >= 0 ? 'Lucro' : 'Prejuízo'}: ${formatCurrency(Math.abs(profit))}`
        );
        promptBackupAfterChange();
      }

      setSellCoin('');
      setSellQuantity('');
      setSellPrice('');
      setSellDollarRate('');
      setSellDate(new Date());
      setSellAttachment(null);
      setSellIsExempt(false);
      setSellExchangeType('internacional');
      setSellTaxPaid('');
      setEditingSaleId(null);
      setScreen('home');
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível registrar a venda');
      console.error(error);
    }
  };

  const handleDelete = async (id: string) => {
    const purchase = purchases.find(p => p.id === id);
    const isConversion = !!purchase?.conversionId;
    const convId = purchase?.conversionId;

    Alert.alert(
      'Confirmar',
      isConversion
        ? `Esta compra faz parte de uma conversão.\nAo excluir, a venda vinculada da stablecoin também será removida e o saldo retorna ao portfólio.\n\nConfirmar exclusão completa?`
        : 'Deseja excluir esta compra?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              const updatedPurchases = purchases.filter((p) => p.id !== id);
              await savePurchases(updatedPurchases);
              setPurchases(updatedPurchases);

              let updatedSales = sales;
              if (isConversion && convId) {
                updatedSales = sales.filter(s => s.conversionId !== convId);
                await saveSales(updatedSales);
                setSales(updatedSales);
              }

              const tempTaxData = calculateTaxReport();
              if (tempTaxData.newTaxLosses && Object.keys(tempTaxData.newTaxLosses).length > 0) {
                await saveTaxLosses(tempTaxData.newTaxLosses);
              }

              Alert.alert('Sucesso', isConversion ? 'Conversão excluída! Stablecoin retornou ao portfólio.' : 'Compra excluída!');
              promptBackupAfterChange();
            } catch (error) {
              Alert.alert('Erro', 'Não foi possível excluir');
            }
          },
        },
      ]
    );
  };

  const handleEditSale = (sale: CryptoSale) => {
    if (sale.conversionId) {
      Alert.alert(
        '🔄 Conversão',
        'Este registro faz parte de uma conversão automática e não pode ser editado individualmente.\n\nExclua a conversão e registre novamente para alterar os valores.',
        [{ text: 'Entendido' }]
      );
      return;
    }
    setSellCoin(sale.coin);
    setSellQuantity(sale.quantity.toString());
    setSellPrice(sale.priceSold.toString());
    setSellDollarRate(sale.dollarRate.toString());
    setSellDate(new Date(sale.date));
    setSellAttachment(sale.attachment || null);
    setSellIsExempt(sale.isExempt || false);
    setSellExchangeType((sale.exchangeType as 'nacional' | 'internacional') || 'internacional');
    setSellTaxPaid(sale.taxPaid?.toString() || '');
    setEditingSaleId(sale.id);
    setScreen('sell');
  };

  const handleDeleteSale = async (id: string) => {
    const sale = sales.find(s => s.id === id);
    const isConversion = !!sale?.conversionId;
    const convId = sale?.conversionId;

    Alert.alert(
      'Confirmar',
      isConversion
        ? `Esta venda faz parte de uma conversão.\nAo excluir, a compra da cripto vinculada também será removida e a stablecoin retorna ao portfólio.\n\nConfirmar exclusão completa?`
        : 'Deseja excluir esta venda?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Excluir',
          style: 'destructive',
          onPress: async () => {
            try {
              const updatedSales = sales.filter((s) => s.id !== id);
              await saveSales(updatedSales);
              setSales(updatedSales);

              let updatedPurchases = purchases;
              if (isConversion && convId) {
                updatedPurchases = purchases.filter(p => p.conversionId !== convId);
                await savePurchases(updatedPurchases);
                setPurchases(updatedPurchases);
              }

              const tempTaxData = calculateTaxReport();
              if (tempTaxData.newTaxLosses && Object.keys(tempTaxData.newTaxLosses).length > 0) {
                await saveTaxLosses(tempTaxData.newTaxLosses);
              }

              Alert.alert('Sucesso', isConversion ? 'Conversão excluída! Stablecoin retornou ao portfólio.' : 'Venda excluída!');
              promptBackupAfterChange();
            } catch (error) {
              Alert.alert('Erro', 'Não foi possível excluir');
            }
          },
        },
      ]
    );
  };

  const handleConvert = async () => {
    try {
      const fromCoin = convertFromCoin.trim().toUpperCase();
      const toCoin = convertToCoin.trim().toUpperCase();
      const fromAmt = parseFloat(convertFromAmount.replace(',', '.'));
      const toAmt = parseFloat(convertToAmount.replace(',', '.'));
      const dRate = parseFloat(convertDollarRate.replace(',', '.'));

      if (!fromCoin) { Alert.alert('Erro', 'Informe a stablecoin de origem'); return; }
      if (!toCoin) { Alert.alert('Erro', 'Informe a cripto a receber'); return; }
      if (isNaN(fromAmt) || fromAmt <= 0) { Alert.alert('Erro', 'Informe a quantidade de stablecoin a converter'); return; }
      if (isNaN(toAmt) || toAmt <= 0) { Alert.alert('Erro', 'Informe a quantidade de cripto recebida'); return; }
      if (isNaN(dRate) || dRate <= 0) { Alert.alert('Erro', 'Informe a cotação do dólar'); return; }

      // Verificar saldo disponível da stablecoin
      const totalBoughtFrom = purchases.filter(p => p.coin === fromCoin).reduce((sum, p) => sum + p.quantity, 0);
      const totalSoldFrom = sales.filter(s => s.coin === fromCoin).reduce((sum, s) => sum + s.quantity, 0);
      const availableFrom = totalBoughtFrom - totalSoldFrom;

      if (fromAmt > availableFrom + 0.00000001) {
        Alert.alert(
          'Saldo Insuficiente',
          `Você tem apenas ${formatQuantity(availableFrom)} ${fromCoin} disponível para converter.`
        );
        return;
      }

      // Calcular custo médio da stablecoin (para profit da "venda")
      const totalPricePaid = purchases.filter(p => p.coin === fromCoin).reduce((sum, p) => sum + p.pricePaid, 0);
      const avgPricePerUnit = totalBoughtFrom > 0 ? totalPricePaid / totalBoughtFrom : 1;
      const profitOnStable = fromAmt - (avgPricePerUnit * fromAmt); // ≈ 0 para stablecoins

      const timestamp = Date.now().toString();
      const convId = `conv_${timestamp}`;

      // Venda da stablecoin (sai do portfólio)
      const stablecoinSale: CryptoSale = {
        id: timestamp + '_stab',
        coin: fromCoin,
        quantity: fromAmt,
        priceSold: fromAmt,
        date: convertDate.toISOString(),
        pricePerUnit: 1,
        dollarRate: dRate,
        profit: profitOnStable,
        isExempt: false,
        exchangeType: 'internacional',
        conversionId: convId,
      };

      // Compra da nova cripto (entra no portfólio com custo = valor em USD)
      const cryptoPurchase: CryptoPurchase = {
        id: timestamp + '_cryp',
        coin: toCoin,
        quantity: toAmt,
        pricePaid: fromAmt,
        date: convertDate.toISOString(),
        pricePerUnit: fromAmt / toAmt,
        dollarRate: dRate,
        conversionId: convId,
      };

      const updatedSales = [...sales, stablecoinSale];
      const updatedPurchases = [...purchases, cryptoPurchase];

      await saveSales(updatedSales);
      await savePurchases(updatedPurchases);
      setSales(updatedSales);
      setPurchases(updatedPurchases);

      Alert.alert(
        '✅ Conversão Registrada!',
        `${formatQuantity(fromAmt)} ${fromCoin} → ${formatQuantity(toAmt)} ${toCoin}
` +
        `Custo base: $${fromAmt.toFixed(2)} (R$ ${(fromAmt * dRate).toFixed(2)})
` +
        `Preço unitário: $${(fromAmt / toAmt).toFixed(6)} por ${toCoin}`
      );

      setConvertFromCoin('');
      setConvertFromAmount('');
      setConvertToCoin('');
      setConvertToAmount('');
      setConvertDate(new Date());
      setScreen('home');
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível registrar a conversão');
      console.error(error);
    }
  };

  const exportToExcel = () => {
    try {
      const filteredPurchases = applyFilters(purchases);
      const filteredSales = applySalesFilters(sales);
      const purchaseSummary = calculateFilteredSummary(filteredPurchases);
      const salesSummary = calculateFilteredSalesSummary(filteredSales);
      
      // Criar conteúdo formatado
      let content = '📊 RELATÓRIO DE CRIPTOMOEDAS\n';
      content += '='.repeat(50) + '\n\n';
      
      // Informações do filtro
      content += '🔍 FILTROS APLICADOS:\n';
      content += `Tipo: ${transactionType === 'all' ? 'Compras e Vendas' : transactionType === 'purchases' ? 'Apenas Compras' : 'Apenas Vendas'}\n`;
      content += `Moeda: ${filterCoin || 'Todas'}\n`;
      content += `Data Inicial: ${filterStartDate ? formatDate(filterStartDate) : 'Sem filtro'}\n`;
      content += `Data Final: ${filterEndDate ? formatDate(filterEndDate) : 'Sem filtro'}\n`;
      content += `Total de Compras: ${filteredPurchases.length}\n`;
      content += `Total de Vendas: ${filteredSales.length}\n\n`;
      
      // Resumo de Compras
      if ((transactionType === 'all' || transactionType === 'purchases') && purchaseSummary.length > 0) {
        content += '📈 RESUMO DE COMPRAS:\n';
        content += '-'.repeat(50) + '\n';
        purchaseSummary.forEach(item => {
          content += `\n${item.coin}\n`;
          content += `  Quantidade Comprada: ${formatQuantity(item.totalQuantity)}\n`;
          content += `  Preço Médio: ${formatPrice(item.averagePrice)}\n`;
          content += `  Investido (USD): ${formatCurrency(item.totalInvested)}\n`;
          content += `  Custo em Reais: R$ ${item.totalDollarCost.toFixed(2)}\n`;
          content += `  Dólar Médio: R$ ${item.averageDollarRate.toFixed(2)}\n`;
          content += `  Compras: ${item.count}\n`;
        });
        
        const totalInvested = purchaseSummary.reduce((sum, s) => sum + s.totalInvested, 0);
        const totalCostBRL = purchaseSummary.reduce((sum, s) => sum + s.totalDollarCost, 0);
        content += '\n' + '-'.repeat(50) + '\n';
        content += `TOTAL COMPRAS (USD): ${formatCurrency(totalInvested)}\n`;
        content += `TOTAL COMPRAS (R$): R$ ${totalCostBRL.toFixed(2)}\n\n`;
      }
      
      // Resumo de Vendas
      if ((transactionType === 'all' || transactionType === 'sales') && salesSummary.length > 0) {
        content += '📉 RESUMO DE VENDAS:\n';
        content += '-'.repeat(50) + '\n';
        salesSummary.forEach(item => {
          content += `\n${item.coin}\n`;
          content += `  Quantidade Vendida: ${formatQuantity(item.totalSold)}\n`;
          content += `  Preço Médio de Venda: ${formatPrice(item.averageSalePrice)}\n`;
          content += `  Receita (USD): ${formatCurrency(item.revenue)}\n`;
          content += `  Receita em Reais: R$ ${item.totalDollarRevenue.toFixed(2)}\n`;
          content += `  Dólar Médio: R$ ${item.averageDollarRate.toFixed(2)}\n`;
          content += `  ${item.totalProfit >= 0 ? 'Lucro' : 'Prejuízo'}: ${formatCurrency(Math.abs(item.totalProfit))}\n`;
          content += `  Vendas: ${item.count}\n`;
        });
        
        const totalRevenue = salesSummary.reduce((sum, s) => sum + s.revenue, 0);
        const totalRevenueBRL = salesSummary.reduce((sum, s) => sum + s.totalDollarRevenue, 0);
        const totalProfit = salesSummary.reduce((sum, s) => sum + s.totalProfit, 0);
        content += '\n' + '-'.repeat(50) + '\n';
        content += `TOTAL VENDAS (USD): ${formatCurrency(totalRevenue)}\n`;
        content += `TOTAL VENDAS (R$): R$ ${totalRevenueBRL.toFixed(2)}\n`;
        content += `${totalProfit >= 0 ? 'LUCRO' : 'PREJUÍZO'} TOTAL: ${formatCurrency(Math.abs(totalProfit))}\n\n`;
      }
      
      // Compras detalhadas
      if ((transactionType === 'all' || transactionType === 'purchases') && filteredPurchases.length > 0) {
        content += '📋 COMPRAS DETALHADAS:\n';
        content += '-'.repeat(50) + '\n';
        const sortedPurchases = [...filteredPurchases].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        sortedPurchases.forEach((purchase, index) => {
          content += `\n${index + 1}. ${formatDate(purchase.date)} - ${purchase.coin}\n`;
          content += `   Quantidade: ${purchase.quantity}\n`;
          content += `   Valor Pago: ${formatCurrency(purchase.pricePaid)}\n`;
          content += `   Preço Unit.: ${formatPrice(purchase.pricePerUnit)}\n`;
          content += `   Dólar: R$ ${purchase.dollarRate.toFixed(2)}\n`;
          content += `   Custo R$: R$ ${(purchase.pricePaid * purchase.dollarRate).toFixed(2)}\n`;
        });
        content += '\n';
      }
      
      // Vendas detalhadas
      if ((transactionType === 'all' || transactionType === 'sales') && filteredSales.length > 0) {
        content += '📋 VENDAS DETALHADAS:\n';
        content += '-'.repeat(50) + '\n';
        const sortedSales = [...filteredSales].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        sortedSales.forEach((sale, index) => {
          content += `\n${index + 1}. ${formatDate(sale.date)} - ${sale.coin}\n`;
          content += `   Quantidade: ${sale.quantity}\n`;
          content += `   Valor Recebido: ${formatCurrency(sale.priceSold)}\n`;
          content += `   Preço Unit.: ${formatPrice(sale.pricePerUnit)}\n`;
          content += `   Dólar: R$ ${sale.dollarRate.toFixed(2)}\n`;
          content += `   Receita R$: R$ ${(sale.priceSold * sale.dollarRate).toFixed(2)}\n`;
          content += `   ${sale.profit >= 0 ? 'Lucro' : 'Prejuízo'}: ${formatCurrency(Math.abs(sale.profit))}\n`;
        });
        content += '\n';
      }
      
      content += '='.repeat(50) + '\n';
      content += 'Fim do Relatório';
      
      setExportData(content);
      setShowExportModal(true);
    } catch (error) {
      console.error('Erro ao exportar:', error);
      Alert.alert('Erro', 'Não foi possível gerar o relatório');
    }
  };

  const exportBackup = () => {
    try {
      const backup = {
        version: '1.1',
        exportDate: new Date().toISOString(),
        purchases: purchases,
        sales: sales,
        taxLosses: taxLosses,
        declarationPercent: declarationPercent,
      };
      
      const backupString = JSON.stringify(backup, null, 2);
      setBackupData(backupString);
      setBackupMode('generate');
      setShowBackupModal(true);
    } catch (error) {
      console.error('Erro ao exportar backup:', error);
      Alert.alert('Erro', 'Não foi possível gerar o backup');
    }
  };

  const openBackupMenu = () => {
    setBackupData('');
    setImportData('');
    setBackupMode('menu');
    setShowBackupModal(true);
  };

  const copyBackupToClipboard = () => {
    if (backupData) {
      Clipboard.setString(backupData);
      Alert.alert('? Copiado!', 'O backup foi copiado para a área de transferência. Cole em um local seguro (WhatsApp, Email, Drive, etc.)');
    }
  };

  const shareBackup = async () => {
    try {
      if (backupData) {
        const result = await Share.share({
          message: `💾 Backup CapitalChain\n\nData: ${new Date().toLocaleDateString()}\n${purchases.length} compras e ${sales.length} vendas\n\n${backupData}`,
          title: 'Backup CapitalChain'
        });
        if (result.action === Share.sharedAction) {
          await markBackupDone();
        }
      }
    } catch (error) {
      console.error('Erro ao compartilhar:', error);
      Alert.alert('Erro', 'Não foi possível compartilhar o backup');
    }
  };

  const importBackup = async () => {
    try {
      if (!importData.trim()) {
        Alert.alert('Erro', 'Cole os dados do backup no campo acima');
        return;
      }

      const backup = JSON.parse(importData);
      
      if (!backup.purchases || !backup.sales) {
        Alert.alert('Erro', 'Formato de backup inválido');
        return;
      }

      const extrasMsg = [
        backup.taxLosses && Object.keys(backup.taxLosses).length > 0 ? '• Prejuízos fiscais acumulados' : '',
        backup.declarationPercent && Object.keys(backup.declarationPercent).length > 0 ? '• Percentuais de declaração' : '',
      ].filter(Boolean).join('\n');

      Alert.alert(
        'Confirmar Importação',
        `Isso irá importar:\n• ${backup.purchases.length} compra(s)\n• ${backup.sales.length} venda(s)${extrasMsg ? '\n' + extrasMsg : ''}\n\nDeseja mesclar com dados existentes ou substituir tudo?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Mesclar',
            onPress: async () => {
              const mergedPurchases = [...purchases, ...backup.purchases];
              const mergedSales = [...sales, ...backup.sales];
              
              await savePurchases(mergedPurchases);
              await saveSales(mergedSales);
              
              setPurchases(mergedPurchases);
              setSales(mergedSales);
              
              if (backup.taxLosses) {
                const mergedLosses = { ...taxLosses, ...backup.taxLosses };
                await saveTaxLosses(mergedLosses);
                setTaxLosses(mergedLosses);
              }
              if (backup.declarationPercent) {
                const mergedPct = { ...declarationPercent, ...backup.declarationPercent };
                await AsyncStorage.setItem(DECL_PERCENT_KEY, JSON.stringify(mergedPct));
                setDeclarationPercent(mergedPct);
              }
              
              setShowBackupModal(false);
              setImportData('');
              
              Alert.alert('Sucesso!', 'Dados importados e mesclados com sucesso!');
            }
          },
          {
            text: 'Substituir',
            style: 'destructive',
            onPress: async () => {
              await savePurchases(backup.purchases);
              await saveSales(backup.sales);
              
              setPurchases(backup.purchases);
              setSales(backup.sales);
              
              if (backup.taxLosses) {
                await saveTaxLosses(backup.taxLosses);
                setTaxLosses(backup.taxLosses);
              }
              if (backup.declarationPercent) {
                await AsyncStorage.setItem(DECL_PERCENT_KEY, JSON.stringify(backup.declarationPercent));
                setDeclarationPercent(backup.declarationPercent);
              }
              
              setShowBackupModal(false);
              setImportData('');
              
              Alert.alert('Sucesso!', 'Dados substituídos com sucesso!');
            }
          }
        ]
      );
    } catch (error) {
      console.error('Erro ao importar:', error);
      Alert.alert('Erro', 'Formato de backup inválido. Verifique se copiou corretamente.');
    }
  };

  const renderHeader = () => (
    <View style={styles.header}>
      <Text style={styles.headerTitle}>CapitalChain</Text>
      <TouchableOpacity 
        style={styles.hideButton} 
        onPress={toggleHideValues}
      >
        <Text style={styles.hideButtonText}>{hideValues ? '👁' : '👁️'}</Text>
      </TouchableOpacity>
    </View>
  );

  const renderTabBar = () => (
    <View style={styles.tabBar}>
      <TouchableOpacity style={[styles.tab, screen === 'home' && styles.tabActive]} onPress={() => setScreen('home')}>
        <Text style={styles.tabIcon}>🏠</Text>
        <Text style={screen === 'home' ? styles.tabTextActive : styles.tabText}>Início</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.tab, screen === 'add' && styles.tabActive]} onPress={() => setScreen('add')}>
        <Text style={styles.tabIcon}>➕</Text>
        <Text style={screen === 'add' ? styles.tabTextActive : styles.tabText}>Comprar</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.tab, screen === 'sell' && styles.tabActive]} onPress={() => setScreen('sell')}>
        <Text style={styles.tabIcon}>💱</Text>
        <Text style={screen === 'sell' ? styles.tabTextActive : styles.tabText}>Vender</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.tab, screen === 'history' && styles.tabActive]} onPress={() => setScreen('history')}>
        <Text style={styles.tabIcon}>📋</Text>
        <Text style={screen === 'history' ? styles.tabTextActive : styles.tabText}>Histórico</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.tab, screen === 'charts' && styles.tabActive]} onPress={() => setScreen('charts')}>
        <Text style={styles.tabIcon}>📊</Text>
        <Text style={screen === 'charts' ? styles.tabTextActive : styles.tabText}>Gráficos</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.tab, (screen === 'more' || screen === 'taxes' || screen === 'retire') && styles.tabActive]} onPress={() => setScreen('more')}>
        <Text style={styles.tabIcon}>⚙️</Text>
        <Text style={(screen === 'more' || screen === 'taxes' || screen === 'retire') ? styles.tabTextActive : styles.tabText}>Mais</Text>
      </TouchableOpacity>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centered}>
          <Text>Carregando...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={styles.authContainer}>
        <View style={styles.authContent}>
          <Text style={styles.authIcon}>🔒</Text>
          <Text style={styles.authTitle}>CapitalChain</Text>
          <Text style={styles.authSubtitle}>Seus dados estão protegidos</Text>
          
          <TouchableOpacity 
            style={styles.authButton} 
            onPress={handleAuthentication}
          >
            <Text style={styles.authButtonIcon}>🔑</Text>
            <Text style={styles.authButtonText}>
              {isBiometricSupported ? 'Desbloquear com Biometria' : 'Desbloquear'}
            </Text>
          </TouchableOpacity>
          
          <Text style={styles.authHint}>
            {isBiometricSupported 
              ? 'Use sua digital ou PIN para acessar'
              : 'Use o PIN do dispositivo para acessar'}
          </Text>
          
          <View style={styles.developerCredit}>
            <Text style={styles.developerText}>Desenvolvido por</Text>
            <Text style={styles.developerName}>@Alexred</Text>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // HOME
  if (screen === 'home') {
    const summary = calculateSummary();
    const totalInvested = summary.reduce((sum, s) => sum + s.totalInvested, 0);
    const totalProfit = summary.reduce((sum, s) => sum + s.totalProfit, 0);
    const totalBRL = currentDollarRate ? totalInvested * currentDollarRate : null;

    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.homeHeader}>
          <View style={styles.homeHeaderTop}>
            <Text style={styles.homeHeaderTitle}>⚡ CapitalChain</Text>
            <TouchableOpacity style={styles.hideButton} onPress={toggleHideValues}>
              <Text style={styles.hideButtonText}>{hideValues ? '👁' : '👁️'}</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.homeHeaderMetrics}>
            <View style={styles.homeMetricCard}>
              <Text style={styles.homeMetricLabel}>Total Investido</Text>
              <Text style={styles.homeMetricValue}>{hideValues ? '$ ****' : formatCurrency(totalInvested)}</Text>
            </View>
            <View style={[styles.homeMetricCard, totalProfit >= 0 ? styles.homeMetricCardProfit : styles.homeMetricCardLoss]}>
              <Text style={styles.homeMetricLabel}>{totalProfit >= 0 ? 'Lucro Realiz.' : 'Prejuízo Realiz.'}</Text>
              <Text style={[styles.homeMetricValue, totalProfit >= 0 ? styles.homeMetricProfit : styles.homeMetricLoss]}>
                {hideValues ? '$ ****' : `${totalProfit >= 0 ? '+' : '-'} ${formatCurrency(Math.abs(totalProfit))}`}
              </Text>
            </View>
            <View style={styles.homeMetricCard}>
              <Text style={styles.homeMetricLabel}>Equiv. BRL</Text>
              <Text style={styles.homeMetricValue}>
                {hideValues ? 'R$ ****' : totalBRL ? formatCurrencyBRL(totalBRL) : 'R$ —'}
              </Text>
            </View>
            <View style={styles.homeMetricCard}>
              <Text style={styles.homeMetricLabel}>Cotação USD</Text>
              <Text style={styles.homeMetricValue}>
                {currentDollarRate ? `R$ ${currentDollarRate.toFixed(2).replace('.', ',')}` : 'R$ —'}
              </Text>
            </View>
            <View style={[styles.homeMetricCard, styles.homeMetricCardBtc]}>
              <Text style={styles.homeMetricLabel}>₿ Bitcoin (BTC)</Text>
              <Text style={[styles.homeMetricValue, styles.homeMetricBtc]}>
                {currentBtcPrice ? formatCurrency(currentBtcPrice) : '$ —'}
              </Text>
            </View>
          </View>
        </View>

        <ScrollView style={styles.content}>
          {summary.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>Nenhuma compra registrada</Text>
              <Text style={styles.emptySubtext}>
                Toque em "Adicionar" para começar
              </Text>
            </View>
          ) : (
            summary.map((item) => (
              <View key={item.coin} style={styles.card}>
                <Text style={styles.coinName}>{item.coin}</Text>
                <View style={styles.row}>
                  <Text style={styles.label}>Disponível:</Text>
                  <Text style={[styles.value, styles.availableQuantity]}>{formatQuantity(item.available)}</Text>
                </View>
                {item.sold > 0 && (
                  <View style={styles.row}>
                    <Text style={styles.label}>Vendido:</Text>
                    <Text style={styles.value}>{formatQuantity(item.sold)}</Text>
                  </View>
                )}
                <View style={styles.row}>
                  <Text style={styles.label}>Investido:</Text>
                  <Text style={styles.value}>{hideValues ? '$ ****' : formatCurrency(item.totalInvested)}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.label}>Preço Médio:</Text>
                  <Text style={styles.value}>{hideValues ? '$ ****' : formatPrice(item.averagePrice)}</Text>
                </View>
                {item.totalProfit !== 0 && (
                  <View style={styles.row}>
                    <Text style={styles.label}>{item.totalProfit >= 0 ? 'Lucro:' : 'Prejuízo:'}</Text>
                    <Text style={[styles.value, item.totalProfit >= 0 ? styles.profit : styles.loss]}>
                      {hideValues ? '$ ****' : formatCurrency(Math.abs(item.totalProfit))}
                    </Text>
                  </View>
                )}
                <Text style={styles.purchaseCount}>{item.count} compra(s)</Text>
              </View>
            ))
          )}
          
          <View style={styles.homeFooter}>
            <Text style={styles.footerText}>
              ⚡ Desenvolvido por <Text style={styles.footerName}>@Alexred</Text>
            </Text>
          </View>
        </ScrollView>

        {renderTabBar()}
        
        {renderDatePicker(
          showStartDatePicker,
          tempStartDate,
          setTempStartDate,
          handleStartDateConfirm,
          () => setShowStartDatePicker(false)
        )}
        
        {renderDatePicker(
          showEndDatePicker,
          tempEndDate,
          setTempEndDate,
          handleEndDateConfirm,
          () => setShowEndDatePicker(false)
        )}
        
        {renderDatePicker(
          showPurchaseDatePicker,
          tempPurchaseDate,
          setTempPurchaseDate,
          handlePurchaseDateConfirm,
          () => setShowPurchaseDatePicker(false)
        )}
      </SafeAreaView>
    );
  }

  // ADD
  if (screen === 'add') {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{editingId ? 'Editar Compra' : 'Nova Compra'}</Text>
        </View>

        <ScrollView style={styles.content}>
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Criptomoeda *</Text>
            <TextInput
              style={styles.input}
              placeholder="Ex: BTC, ETH, SOL..."
              value={coin}
              onChangeText={setCoin}
              autoCapitalize="characters"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Quantidade *</Text>
            <TextInput
              style={styles.input}
              placeholder="0.00000000"
              value={quantity}
              onChangeText={setQuantity}
              keyboardType="decimal-pad"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Valor Total Pago (USD) *</Text>
            <TextInput
              style={styles.input}
              placeholder="0.00"
              value={pricePaid}
              onChangeText={setPricePaid}
              keyboardType="decimal-pad"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Cotação do Dólar (R$) *</Text>
            <TextInput
              style={styles.input}
              placeholder="5.00"
              value={dollarRate}
              onChangeText={setDollarRate}
              keyboardType="decimal-pad"
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Data da Compra *</Text>
            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => {
                setTempPurchaseDate(purchaseDate);
                setShowPurchaseDatePicker(true);
              }}
            >
              <Text style={styles.dateButtonText}>
                {purchaseDate ? `📅 ${formatDate(purchaseDate.toISOString())}` : '📅 Selecionar Data'}
              </Text>
            </TouchableOpacity>
          </View>

          {quantity && pricePaid && dollarRate && (
            <View style={styles.infoBox}>
              <Text style={styles.infoText}>
                Preço por unidade: $ {(parseFloat(pricePaid.replace(',', '.')) / parseFloat(quantity.replace(',', '.'))).toFixed(2)}
              </Text>
              <Text style={styles.infoText}>
                Custo em reais: R$ {(parseFloat(pricePaid.replace(',', '.')) * parseFloat(dollarRate.replace(',', '.'))).toFixed(2)}
              </Text>
            </View>
          )}

          <View style={styles.attachmentSection}>
            <Text style={styles.attachmentLabel}>📎 Comprovante (opcional)</Text>
            <Text style={styles.attachmentHint}>
              Anexe prints de depósito, compra na exchange, etc.
            </Text>
            
            {purchaseAttachment ? (
              <View style={styles.attachmentPreview}>
                <TouchableOpacity onPress={() => viewAttachment(purchaseAttachment)}>
                  <View style={styles.attachmentCard}>
                    <Text style={styles.attachmentIcon}>📄</Text>
                    <Text style={styles.attachmentText}>Comprovante anexado</Text>
                  </View>
                </TouchableOpacity>
                <View style={styles.attachmentButtons}>
                  <TouchableOpacity
                    style={styles.attachmentButtonSmall}
                    onPress={() => viewAttachment(purchaseAttachment)}
                  >
                    <Text style={styles.attachmentButtonText}>👁️ Ver</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.attachmentButtonSmall, styles.attachmentButtonRemove]}
                    onPress={() => removeAttachment('purchase')}
                  >
                    <Text style={styles.attachmentButtonText}>🗑️ Remover</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.attachmentButtons}>
                <TouchableOpacity
                  style={styles.attachmentButton}
                  onPress={() => takePicture('purchase')}
                >
                  <Text style={styles.attachmentButtonText}>📷 Tirar Foto</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.attachmentButton}
                  onPress={() => pickImageFromGallery('purchase')}
                >
                  <Text style={styles.attachmentButtonText}>🖼️ Galeria</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          <TouchableOpacity style={styles.saveButton} onPress={handleAddPurchase}>
            <Text style={styles.saveButtonText}>{editingId ? '✅ Atualizar Compra' : '💾 Salvar Compra'}</Text>
          </TouchableOpacity>

          {editingId && (
            <TouchableOpacity 
              style={styles.cancelEditButton} 
              onPress={() => {
                setCoin('');
                setQuantity('');
                setPricePaid('');
                setDollarRate('');
                setPurchaseDate(new Date());
                setEditingId(null);
                setScreen('history');
              }}
            >
              <Text style={styles.cancelEditButtonText}>Cancelar Edição</Text>
            </TouchableOpacity>
          )}
        </ScrollView>

        {renderTabBar()}
        
        {renderDatePicker(
          showStartDatePicker,
          tempStartDate,
          setTempStartDate,
          handleStartDateConfirm,
          () => setShowStartDatePicker(false)
        )}
        
        {renderDatePicker(
          showEndDatePicker,
          tempEndDate,
          setTempEndDate,
          handleEndDateConfirm,
          () => setShowEndDatePicker(false)
        )}
        
        {renderDatePicker(
          showPurchaseDatePicker,
          tempPurchaseDate,
          setTempPurchaseDate,
          handlePurchaseDateConfirm,
          () => setShowPurchaseDatePicker(false)
        )}
      </SafeAreaView>
    );
  }

  // SELL
  if (screen === 'sell') {
    const summary = calculateSummary();
    const availableCoins = summary.filter(s => s.available > 0);
    const availableStablecoins = summary.filter(s => s.available > 0 && isStablecoin(s.coin));
    const activeMode = editingSaleId ? 'sell' : sellScreenMode;

    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{editingSaleId ? 'Editar Venda' : activeMode === 'convert' ? '🔄 Converter' : 'Vender Cripto'}</Text>
        </View>

        <ScrollView style={styles.content}>

          {/* Seletor de Modo — cards grandes e visuais */}
          {!editingSaleId && (
            <View style={styles.modeSelectorContainer}>
              <TouchableOpacity
                style={[styles.modeSelectorCard, activeMode === 'sell' && styles.modeSelectorCardActiveSell]}
                onPress={() => setSellScreenMode('sell')}
                activeOpacity={0.85}
              >
                <Text style={styles.modeSelectorIcon}>💱</Text>
                <Text style={[styles.modeSelectorTitle, activeMode === 'sell' && styles.modeSelectorTitleActive]}>Vender</Text>
                <Text style={[styles.modeSelectorDesc, activeMode === 'sell' && styles.modeSelectorDescActive]}>Converter cripto em dinheiro</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeSelectorCard, activeMode === 'convert' && styles.modeSelectorCardActiveConvert]}
                onPress={() => setSellScreenMode('convert')}
                activeOpacity={0.85}
              >
                <Text style={styles.modeSelectorIcon}>🔄</Text>
                <Text style={[styles.modeSelectorTitle, activeMode === 'convert' && styles.modeSelectorTitleActive]}>Converter</Text>
                <Text style={[styles.modeSelectorDesc, activeMode === 'convert' && styles.modeSelectorDescActive]}>Trocar stablecoin por cripto</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* MODO VENDER */}
          {activeMode === 'sell' && availableCoins.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>Nenhuma criptomoeda disponível</Text>
              <Text style={styles.emptySubtext}>
                Compre criptomoedas primeiro para poder vender
              </Text>
            </View>
          )}
          {activeMode === 'sell' && availableCoins.length > 0 && (
            <>
              <View style={styles.availableCoinsCard}>
                <Text style={styles.availableTitle}>📊 Disponível para Venda:</Text>
                {availableCoins.map(item => (
                  <TouchableOpacity 
                    key={item.coin}
                    style={styles.availableCoinItem}
                    onPress={() => setSellCoin(item.coin)}
                  >
                    <Text style={styles.availableCoinName}>{item.coin}</Text>
                    <Text style={styles.availableCoinQty}>{formatQuantity(item.available)}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Criptomoeda *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ex: BTC, ETH, SOL..."
                  value={sellCoin}
                  onChangeText={setSellCoin}
                  autoCapitalize="characters"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Quantidade a Vender *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0.00000000"
                  value={sellQuantity}
                  onChangeText={setSellQuantity}
                  keyboardType="decimal-pad"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Valor Total Recebido (USD) *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0.00"
                  value={sellPrice}
                  onChangeText={setSellPrice}
                  keyboardType="decimal-pad"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Cotação do Dólar (R$) *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="5.00"
                  value={sellDollarRate}
                  onChangeText={setSellDollarRate}
                  keyboardType="decimal-pad"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Data da Venda *</Text>
                <TouchableOpacity
                  style={styles.dateButton}
                  onPress={() => {
                    setTempSellDate(sellDate);
                    setShowSellDatePicker(true);
                  }}
                >
                  <Text style={styles.dateButtonText}>
                    {sellDate ? `📅 ${formatDate(sellDate.toISOString())}` : '📅 Selecionar Data'}
                  </Text>
                </TouchableOpacity>
              </View>

              {sellQuantity && sellPrice && sellDollarRate && (
                <View style={styles.infoBox}>
                  <Text style={styles.infoText}>
                    Preço por unidade: $ {(parseFloat(sellPrice.replace(',', '.')) / parseFloat(sellQuantity.replace(',', '.'))).toFixed(2)}
                  </Text>
                  <Text style={styles.infoText}>
                    Valor em reais: R$ {(parseFloat(sellPrice.replace(',', '.')) * parseFloat(sellDollarRate.replace(',', '.'))).toFixed(2)}
                  </Text>
                </View>
              )}

              {/* Tipo de Corretora */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Tipo de Corretora</Text>
                <View style={styles.viewModeToggle}>
                  <TouchableOpacity
                    style={[styles.toggleButton, sellExchangeType === 'internacional' && styles.toggleButtonActive]}
                    onPress={() => { setSellExchangeType('internacional'); setSellIsExempt(false); }}
                  >
                    <Text style={[styles.toggleButtonText, sellExchangeType === 'internacional' && styles.toggleButtonTextActive]}>
                      🌐 Internacional
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.toggleButton, sellExchangeType === 'nacional' && styles.toggleButtonActive]}
                    onPress={() => setSellExchangeType('nacional')}
                  >
                    <Text style={[styles.toggleButtonText, sellExchangeType === 'nacional' && styles.toggleButtonTextActive]}>
                      🇧🇷 Nacional
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Isenção fiscal (apenas para corretora nacional) */}
              {sellExchangeType === 'nacional' && (
                <View style={styles.switchRow}>
                  <View style={styles.switchInfo}>
                    <Text style={styles.switchLabel}>Isento de Imposto</Text>
                    <Text style={styles.switchHint}>Vendas nacionais {'<'} R$ 35.000 no mês</Text>
                  </View>
                  <Switch
                    value={sellIsExempt}
                    onValueChange={setSellIsExempt}
                    trackColor={{ false: '#E8EAED', true: '#667eea' }}
                    thumbColor={sellIsExempt ? '#fff' : '#f4f3f4'}
                  />
                </View>
              )}

              {/* Imposto pago via DARF (quando não isento) */}
              {!sellIsExempt && (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>Imposto Pago via DARF (R$) (opcional)</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="0.00"
                    value={sellTaxPaid}
                    onChangeText={setSellTaxPaid}
                    keyboardType="decimal-pad"
                  />
                </View>
              )}

              <View style={styles.attachmentSection}>
                <Text style={styles.attachmentLabel}>📎 Comprovante (opcional)</Text>
                <Text style={styles.attachmentHint}>
                  Anexe prints de venda, recebimento, etc.
                </Text>
                
                {sellAttachment ? (
                  <View style={styles.attachmentPreview}>
                    <TouchableOpacity onPress={() => viewAttachment(sellAttachment)}>
                      <View style={styles.attachmentCard}>
                        <Text style={styles.attachmentIcon}>📄</Text>
                        <Text style={styles.attachmentText}>Comprovante anexado</Text>
                      </View>
                    </TouchableOpacity>
                    <View style={styles.attachmentButtons}>
                      <TouchableOpacity
                        style={styles.attachmentButtonSmall}
                        onPress={() => viewAttachment(sellAttachment)}
                      >
                        <Text style={styles.attachmentButtonText}>👁️ Ver</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.attachmentButtonSmall, styles.attachmentButtonRemove]}
                        onPress={() => removeAttachment('sale')}
                      >
                        <Text style={styles.attachmentButtonText}>🗑️ Remover</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View style={styles.attachmentButtons}>
                    <TouchableOpacity
                      style={styles.attachmentButton}
                      onPress={() => takePicture('sale')}
                    >
                      <Text style={styles.attachmentButtonText}>📷 Tirar Foto</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.attachmentButton}
                      onPress={() => pickImageFromGallery('sale')}
                    >
                      <Text style={styles.attachmentButtonText}>🖼️ Galeria</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              <TouchableOpacity style={styles.sellButton} onPress={handleSellCrypto}>
                <Text style={styles.saveButtonText}>{editingSaleId ? '✅ Atualizar Venda' : '✅ Registrar Venda'}</Text>
              </TouchableOpacity>

              {editingSaleId && (
                <TouchableOpacity
                  style={styles.cancelEditButton}
                  onPress={() => {
                    setSellCoin('');
                    setSellQuantity('');
                    setSellPrice('');
                    setSellDollarRate('');
                    setSellDate(new Date());
                    setSellAttachment(null);
                    setSellIsExempt(false);
                    setSellExchangeType('internacional');
                    setSellTaxPaid('');
                    setEditingSaleId(null);
                    setScreen('history');
                  }}
                >
                  <Text style={styles.cancelEditButtonText}>Cancelar Edição</Text>
                </TouchableOpacity>
              )}
            </>
          )}

          {/* MODO CONVERTER */}
          {activeMode === 'convert' && availableStablecoins.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>Nenhuma stablecoin disponível</Text>
              <Text style={styles.emptySubtext}>
                Compre USDT, USDC ou outra stablecoin primeiro para poder converter
              </Text>
            </View>
          )}

          {activeMode === 'convert' && availableStablecoins.length > 0 && (
            <>
              <View style={styles.infoBox}>
                <Text style={[styles.infoText, { fontWeight: '700', color: '#667eea' }]}>
                  💡 Stablecoin → Cripto
                </Text>
                <Text style={styles.infoText}>
                  A stablecoin sai do portfólio como uma venda e a cripto entra como compra. O custo de aquisição da cripto será o valor em USD convertido.
                </Text>
              </View>

              <View style={styles.availableCoinsCard}>
                <Text style={styles.availableTitle}>💵 Stablecoins Disponíveis:</Text>
                {availableStablecoins.map(item => (
                  <TouchableOpacity
                    key={item.coin}
                    style={styles.availableCoinItem}
                    onPress={() => setConvertFromCoin(item.coin)}
                  >
                    <Text style={styles.availableCoinName}>{item.coin}</Text>
                    <Text style={styles.availableCoinQty}>{formatQuantity(item.available)} disponível</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Stablecoin de Origem *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ex: USDT, USDC..."
                  value={convertFromCoin}
                  onChangeText={(t) => setConvertFromCoin(t.toUpperCase())}
                  autoCapitalize="characters"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Quantidade a Converter (USD) *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0.00"
                  value={convertFromAmount}
                  onChangeText={setConvertFromAmount}
                  keyboardType="decimal-pad"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Cripto a Receber *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Ex: BTC, ETH, SOL..."
                  value={convertToCoin}
                  onChangeText={(t) => setConvertToCoin(t.toUpperCase())}
                  autoCapitalize="characters"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Quantidade Recebida *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="0.00000000"
                  value={convertToAmount}
                  onChangeText={setConvertToAmount}
                  keyboardType="decimal-pad"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Cotação do Dólar (R$) *</Text>
                <TextInput
                  style={styles.input}
                  placeholder="5.00"
                  value={convertDollarRate}
                  onChangeText={setConvertDollarRate}
                  keyboardType="decimal-pad"
                />
              </View>

              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Data da Conversão *</Text>
                <TouchableOpacity
                  style={styles.dateButton}
                  onPress={() => {
                    setTempConvertDate(convertDate);
                    setShowConvertDatePicker(true);
                  }}
                >
                  <Text style={styles.dateButtonText}>
                    📅 {formatDate(convertDate.toISOString())}
                  </Text>
                </TouchableOpacity>
              </View>

              {convertFromAmount && convertToAmount && convertDollarRate && (
                <View style={styles.infoBox}>
                  <Text style={styles.infoText}>
                    Preço unitário da cripto: ${' '}
                    {(parseFloat(convertFromAmount.replace(',', '.')) / parseFloat(convertToAmount.replace(',', '.'))).toFixed(6)} por {convertToCoin || '…'}
                  </Text>
                  <Text style={styles.infoText}>
                    Custo total em reais: R$ {(parseFloat(convertFromAmount.replace(',', '.')) * parseFloat(convertDollarRate.replace(',', '.'))).toFixed(2)}
                  </Text>
                </View>
              )}

              <TouchableOpacity style={styles.sellButton} onPress={handleConvert}>
                <Text style={styles.saveButtonText}>🔄 Registrar Conversão</Text>
              </TouchableOpacity>
            </>
          )}

        </ScrollView>

        {renderTabBar()}
        
        {renderDatePicker(
          showStartDatePicker,
          tempStartDate,
          setTempStartDate,
          handleStartDateConfirm,
          () => setShowStartDatePicker(false)
        )}
        
        {renderDatePicker(
          showEndDatePicker,
          tempEndDate,
          setTempEndDate,
          handleEndDateConfirm,
          () => setShowEndDatePicker(false)
        )}
        
        {renderDatePicker(
          showPurchaseDatePicker,
          tempPurchaseDate,
          setTempPurchaseDate,
          handlePurchaseDateConfirm,
          () => setShowPurchaseDatePicker(false)
        )}
        
        {renderDatePicker(
          showSellDatePicker,
          tempSellDate,
          setTempSellDate,
          handleSellDateConfirm,
          () => setShowSellDatePicker(false)
        )}

        {renderDatePicker(
          showConvertDatePicker,
          tempConvertDate,
          setTempConvertDate,
          handleConvertDateConfirm,
          () => setShowConvertDatePicker(false)
        )}
      </SafeAreaView>
    );
  }

  // TAXES
  if (screen === 'charts') {
    const btcPurchases = purchases.filter(p => p.coin.toUpperCase() === 'BTC').sort((a, b) => a.date.localeCompare(b.date));
    const btcPrice = currentPrices['BTC'] ?? null;

    const totalBTC = btcPurchases.reduce((s, p) => s + p.quantity, 0);
    const totalInvestedBTC = btcPurchases.reduce((s, p) => s + p.pricePaid, 0);
    const avgPrice = totalBTC > 0 ? totalInvestedBTC / totalBTC : 0;
    const currentValue = btcPrice != null ? totalBTC * btcPrice : null;
    const unrealizedPnL = currentValue != null ? currentValue - totalInvestedBTC : null;
    const unrealizedPct = avgPrice > 0 && btcPrice != null ? ((btcPrice - avgPrice) / avgPrice * 100) : null;
    const totalValueBRL = currentValue != null && currentDollarRate != null ? currentValue * currentDollarRate : null;

    // Dados mensais de BTC
    const monthlyData = (() => {
      const map = new Map<string, { usd: number; btc: number }>();
      btcPurchases.forEach(p => {
        const key = p.date.substring(0, 7);
        const prev = map.get(key) || { usd: 0, btc: 0 };
        map.set(key, { usd: prev.usd + p.pricePaid, btc: prev.btc + p.quantity });
      });
      let cumBTC = 0; let cumUSD = 0;
      return Array.from(map.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([key, val]) => {
          cumBTC += val.btc; cumUSD += val.usd;
          return { key, usd: val.usd, btc: val.btc, cumBTC, cumUSD, avgPrice: cumUSD / cumBTC };
        });
    })();

    // Compras individuais para o gráfico DCA
    const dcaItems = btcPurchases.slice(-20); // últimas 20 compras
    const dcaMaxPrice = btcPrice != null
      ? Math.max(...dcaItems.map(p => p.pricePerUnit), btcPrice)
      : Math.max(...dcaItems.map(p => p.pricePerUnit), 0);

    const isGain = unrealizedPct != null && unrealizedPct >= 0;
    const BAR_H = 110;

    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.btcChartsHeader}>
          <Text style={styles.btcChartsHeaderTitle}>₿ Bitcoin</Text>
          {btcPrice != null && (
            <Text style={styles.btcChartsHeaderPrice}>{formatCurrency(btcPrice)}</Text>
          )}
        </View>

        <ScrollView style={styles.content}>

          {btcPurchases.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={{ fontSize: 48 }}>₿</Text>
              <Text style={styles.emptyText}>Nenhuma compra de BTC</Text>
              <Text style={styles.emptySubtext}>Adicione suas compras de Bitcoin para ver os gráficos</Text>
            </View>
          ) : (
            <>
              {/* Card resumo */}
              <View style={styles.btcSummaryCard}>
                <View style={styles.btcSummaryRow}>
                  <View style={styles.btcSummaryItem}>
                    <Text style={styles.btcSummaryLabel}>Total BTC</Text>
                    <Text style={styles.btcSummaryValue}>{hideValues ? '****' : totalBTC.toFixed(8)}</Text>
                  </View>
                  <View style={styles.btcSummaryItem}>
                    <Text style={styles.btcSummaryLabel}>Preço Médio DCA</Text>
                    <Text style={styles.btcSummaryValue}>{hideValues ? '****' : formatCurrency(avgPrice)}</Text>
                  </View>
                </View>
                <View style={styles.btcSummaryRow}>
                  <View style={styles.btcSummaryItem}>
                    <Text style={styles.btcSummaryLabel}>Total Investido</Text>
                    <Text style={styles.btcSummaryValue}>{hideValues ? '****' : formatCurrency(totalInvestedBTC)}</Text>
                  </View>
                  <View style={styles.btcSummaryItem}>
                    <Text style={styles.btcSummaryLabel}>Valor Atual</Text>
                    <Text style={[styles.btcSummaryValue, { color: '#F7931A' }]}>
                      {hideValues ? '****' : currentValue != null ? formatCurrency(currentValue) : '—'}
                    </Text>
                  </View>
                </View>
                {unrealizedPnL != null && (
                  <View style={[styles.btcPnLBanner, isGain ? styles.btcPnLGain : styles.btcPnLLoss]}>
                    <Text style={styles.btcPnLLabel}>{isGain ? '📈 Lucro Não Realizado' : '📉 Prejuízo Não Realizado'}</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <Text style={styles.btcPnLValue}>
                        {hideValues ? '****' : `${isGain ? '+' : ''}${formatCurrency(unrealizedPnL)}`}
                      </Text>
                      <Text style={styles.btcPnLPct}>
                        {unrealizedPct != null ? `${isGain ? '+' : ''}${unrealizedPct.toFixed(1)}%` : ''}
                      </Text>
                    </View>
                    {totalValueBRL != null && (
                      <Text style={styles.btcPnLBrl}>
                        {hideValues ? '****' : `≈ ${formatCurrencyBRL(totalValueBRL)} (carteira total)`}
                      </Text>
                    )}
                  </View>
                )}
              </View>

              {/* Preço médio DCA vs atual */}
              <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>📊 DCA vs Preço Atual</Text>
                <Text style={styles.chartSubtitle}>Seu preço médio comparado ao mercado</Text>
                {btcPrice != null ? (
                  <View style={styles.dcaCompareContainer}>
                    {/* Barra DCA */}
                    <View style={styles.dcaBarRow}>
                      <Text style={styles.dcaBarLabel}>Seu DCA</Text>
                      <View style={styles.dcaBarTrack}>
                        <View style={[styles.dcaBarFill, {
                          width: `${Math.round((avgPrice / Math.max(avgPrice, btcPrice)) * 100)}%`,
                          backgroundColor: '#667eea',
                        }]} />
                      </View>
                      <Text style={styles.dcaBarValue}>{hideValues ? '****' : formatCurrency(avgPrice)}</Text>
                    </View>
                    {/* Barra preço atual */}
                    <View style={styles.dcaBarRow}>
                      <Text style={styles.dcaBarLabel}>Atual</Text>
                      <View style={styles.dcaBarTrack}>
                        <View style={[styles.dcaBarFill, {
                          width: `${Math.round((btcPrice / Math.max(avgPrice, btcPrice)) * 100)}%`,
                          backgroundColor: '#F7931A',
                        }]} />
                      </View>
                      <Text style={[styles.dcaBarValue, { color: '#F7931A' }]}>{formatCurrency(btcPrice)}</Text>
                    </View>
                    <View style={[styles.dcaGapBadge, isGain ? { backgroundColor: 'rgba(52,199,89,0.12)' } : { backgroundColor: 'rgba(255,59,48,0.12)' }]}>
                      <Text style={[styles.dcaGapText, { color: isGain ? '#34C759' : '#FF3B30' }]}>
                        {isGain ? '✅ Comprando abaixo do mercado em ' : '⚠️ Mercado abaixo do seu DCA em '}
                        <Text style={{ fontWeight: '800' }}>{Math.abs(unrealizedPct ?? 0).toFixed(1)}%</Text>
                      </Text>
                    </View>
                  </View>
                ) : (
                  <Text style={styles.chartEmpty}>Cotação BTC não disponível</Text>
                )}
              </View>

              {/* Acumulação de sats */}
              {monthlyData.length > 0 && (
                <View style={styles.chartCard}>
                  <Text style={styles.chartTitle}>₿ Acumulação de Sats por Mês</Text>
                  <Text style={styles.chartSubtitle}>BTC acumulado ao longo do tempo</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={[styles.barChart, { height: BAR_H + 56 }]}>
                      {monthlyData.map(({ key, cumBTC }) => {
                        const maxBTC = monthlyData[monthlyData.length - 1].cumBTC;
                        const [y, m] = key.split('-');
                        return (
                          <View key={key} style={[styles.barItem, { height: BAR_H + 56, width: 56 }]}>
                            <Text style={styles.barTopLabel}>
                              {hideValues ? '...' : cumBTC >= 1 ? `${cumBTC.toFixed(3)}` : `${(cumBTC * 1000).toFixed(1)}m`}
                            </Text>
                            <View style={{ flex: 1, justifyContent: 'flex-end' }}>
                              <View style={[styles.barFill, {
                                height: (cumBTC / maxBTC) * BAR_H,
                                backgroundColor: '#F7931A',
                                borderTopLeftRadius: 6,
                                borderTopRightRadius: 6,
                              }]} />
                            </View>
                            <Text style={styles.barBottomLabel}>{m}/{y.substring(2)}</Text>
                          </View>
                        );
                      })}
                    </View>
                  </ScrollView>
                </View>
              )}

              {/* USD investido por mês + preço médio corrente */}
              {monthlyData.length > 0 && (
                <View style={styles.chartCard}>
                  <Text style={styles.chartTitle}>📈 USD Investido por Mês</Text>
                  <Text style={styles.chartSubtitle}>Quanto você aportou e seu DCA acumulado</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={[styles.barChart, { height: BAR_H + 56 }]}>
                      {(() => {
                        const maxUSD = Math.max(...monthlyData.map(d => d.usd));
                        return monthlyData.map(({ key, usd, avgPrice: runAvg }) => {
                          const [y, m] = key.split('-');
                          return (
                            <View key={key} style={[styles.barItem, { height: BAR_H + 56, width: 60 }]}>
                              <Text style={[styles.barTopLabel, { color: '#667eea' }]}>
                                {hideValues ? '...' : usd >= 1000 ? `$${(usd / 1000).toFixed(1)}k` : `$${usd.toFixed(0)}`}
                              </Text>
                              <View style={{ flex: 1, justifyContent: 'flex-end' }}>
                                <View style={[styles.barFill, {
                                  height: (usd / maxUSD) * BAR_H,
                                  backgroundColor: '#667eea',
                                  borderTopLeftRadius: 6,
                                  borderTopRightRadius: 6,
                                }]} />
                              </View>
                              <Text style={[styles.barBottomLabel, { color: '#F7931A', fontWeight: '600' }]}>
                                {hideValues ? '...' : runAvg >= 1000 ? `$${(runAvg / 1000).toFixed(0)}k` : `$${runAvg.toFixed(0)}`}
                              </Text>
                              <Text style={styles.barBottomLabel}>{m}/{y.substring(2)}</Text>
                            </View>
                          );
                        });
                      })()}
                    </View>
                  </ScrollView>
                  <View style={styles.chartLegend}>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: '#667eea' }]} />
                      <Text style={styles.legendText}>USD aportado</Text>
                    </View>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: '#F7931A' }]} />
                      <Text style={styles.legendText}>DCA acumulado</Text>
                    </View>
                  </View>
                </View>
              )}

              {/* DCA de cada compra */}
              {dcaItems.length > 0 && (
                <View style={styles.chartCard}>
                  <Text style={styles.chartTitle}>🎯 Histórico de Compras DCA</Text>
                  <Text style={styles.chartSubtitle}>
                    Preço de cada compra vs preço atual{btcPurchases.length > 20 ? ` (últimas ${dcaItems.length})` : ''}
                  </Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                    <View style={[styles.barChart, { height: BAR_H + 56 }]}>
                      {dcaItems.map((p, i) => {
                        const h = (p.pricePerUnit / dcaMaxPrice) * BAR_H;
                        const aboveAvg = btcPrice != null && p.pricePerUnit < btcPrice;
                        const [, m, d] = p.date.substring(0, 10).split('-');
                        return (
                          <View key={p.id} style={[styles.barItem, { height: BAR_H + 56, width: 52 }]}>
                            <View style={{ flex: 1, justifyContent: 'flex-end', position: 'relative' }}>
                              <View style={[styles.barFill, {
                                height: h,
                                backgroundColor: aboveAvg ? '#34C759' : '#FF3B30',
                                borderTopLeftRadius: 5,
                                borderTopRightRadius: 5,
                              }]} />
                            </View>
                            <Text style={styles.barBottomLabel}>{d}/{m}</Text>
                            <Text style={[styles.barBottomLabel, { fontSize: 8 }]}>
                              {hideValues ? '...' : p.pricePerUnit >= 1000 ? `$${(p.pricePerUnit / 1000).toFixed(0)}k` : `$${p.pricePerUnit.toFixed(0)}`}
                            </Text>
                          </View>
                        );
                      })}
                      {btcPrice != null && (
                        <View style={{ position: 'absolute', top: BAR_H - (btcPrice / dcaMaxPrice) * BAR_H, left: 0, right: 0, height: 1.5, backgroundColor: '#F7931A', opacity: 0.7 }} />
                      )}
                    </View>
                  </ScrollView>
                  <View style={styles.chartLegend}>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: '#34C759' }]} />
                      <Text style={styles.legendText}>Compra abaixo do preço atual</Text>
                    </View>
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: '#FF3B30' }]} />
                      <Text style={styles.legendText}>Compra acima do preço atual</Text>
                    </View>
                  </View>
                </View>
              )}

              {/* Número de compras e aporte médio */}
              <View style={styles.chartCard}>
                <Text style={styles.chartTitle}>📋 Estatísticas do DCA</Text>
                <View style={styles.statsGrid}>
                  <View style={styles.statsItem}>
                    <Text style={styles.statsLabel}>Nº de compras</Text>
                    <Text style={styles.statsValue}>{btcPurchases.length}</Text>
                  </View>
                  <View style={styles.statsItem}>
                    <Text style={styles.statsLabel}>Aporte médio</Text>
                    <Text style={styles.statsValue}>{hideValues ? '****' : formatCurrency(totalInvestedBTC / btcPurchases.length)}</Text>
                  </View>
                  <View style={styles.statsItem}>
                    <Text style={styles.statsLabel}>Menor preço pago</Text>
                    <Text style={styles.statsValue}>{hideValues ? '****' : formatCurrency(Math.min(...btcPurchases.map(p => p.pricePerUnit)))}</Text>
                  </View>
                  <View style={styles.statsItem}>
                    <Text style={styles.statsLabel}>Maior preço pago</Text>
                    <Text style={styles.statsValue}>{hideValues ? '****' : formatCurrency(Math.max(...btcPurchases.map(p => p.pricePerUnit)))}</Text>
                  </View>
                  <View style={styles.statsItem}>
                    <Text style={styles.statsLabel}>1ª compra</Text>
                    <Text style={styles.statsValue}>{formatDate(btcPurchases[0].date)}</Text>
                  </View>
                  <View style={styles.statsItem}>
                    <Text style={styles.statsLabel}>Última compra</Text>
                    <Text style={styles.statsValue}>{formatDate(btcPurchases[btcPurchases.length - 1].date)}</Text>
                  </View>
                </View>
              </View>

            </>
          )}

        </ScrollView>
        {renderTabBar()}
      </SafeAreaView>
    );
  }

  if (screen === 'retire') {
    const btcPurchases = purchases.filter(p => p.coin.toUpperCase() === 'BTC').sort((a, b) => a.date.localeCompare(b.date));
    const existingBTC = btcPurchases.reduce((s, p) => s + p.quantity, 0);
    const totalInvestedUSD = btcPurchases.reduce((s, p) => s + p.pricePaid, 0);
    const avgCostUSD = existingBTC > 0 ? totalInvestedUSD / existingBTC : 0;
    const btcPriceNow = currentBtcPrice ?? 85000;
    const dollarRateNow = currentDollarRate ?? 5.8;

    const autoAporteBRL = (() => {
      if (btcPurchases.length < 2) return 0;
      const first = new Date(btcPurchases[0].date);
      const last = new Date(btcPurchases[btcPurchases.length - 1].date);
      const months = Math.max(1, (last.getFullYear() - first.getFullYear()) * 12 + (last.getMonth() - first.getMonth()));
      return btcPurchases.reduce((s, p) => s + p.pricePaid * p.dollarRate, 0) / months;
    })();
    const effectiveAporte = retireSettings.aporteMensal > 0 ? retireSettings.aporteMensal : autoAporteBRL;

    const monthsSinceFirst = (() => {
      if (btcPurchases.length === 0) return 1;
      const first = new Date(btcPurchases[0].date);
      const now = new Date();
      return Math.max(1, (now.getFullYear() - first.getFullYear()) * 12 + (now.getMonth() - first.getMonth()));
    })();
    const actualMonthlyBTC = monthsSinceFirst > 0 ? existingBTC / monthsSinceFirst : 0;
    const btcNeeded = Math.max(0, retireSettings.targetBtc - existingBTC);
    const requiredMonthlyBTC = retireSettings.targetYears > 0 ? btcNeeded / (retireSettings.targetYears * 12) : 0;
    const onTrackPct = existingBTC >= retireSettings.targetBtc ? 200
      : requiredMonthlyBTC > 0 ? Math.min(200, (actualMonthlyBTC / requiredMonthlyBTC) * 100) : 0;

    const getYearCagr = (y: number): number => {
      const base = retireSettings.btcCagr / 100;
      if (!retireSettings.useDecreasingCagr) return base;
      if (y <= 4) return base;
      if (y <= 8) return base * 0.65;
      if (y <= 12) return base * 0.40;
      return base * 0.25;
    };

    const currentYear = new Date().getFullYear();
    const bsy = retireSettings.bearStartYear;
    // crashNow = bear iniciou no ano atual (preço de entrada já crashado)
    const crashNow = retireSettings.bearMarkets > 0 && bsy > 0 && bsy <= currentYear;
    // Preço de entrada da simulação: se crash agora, já aplica a queda
    const simStartPrice = crashNow
      ? btcPriceNow * (1 - retireSettings.bearDepth / 100)
      : btcPriceNow;

    // Alvo de recuperação para crash atual: preço normal ao fim da recuperação
    const crashNowRecoveryTarget = (() => {
      if (!crashNow) return 0;
      let t = btcPriceNow; // preço pré-crash como referência
      for (let i = 1; i <= retireSettings.bearRecoveryYears; i++) t *= (1 + getYearCagr(i));
      return t;
    })();

    // Calcula os anos-simulação dos crashes (y=1 → 2027, etc.)
    const bearYearSet = new Set<number>();
    // spacing mínimo = bearRecoveryYears + 1 para evitar sobreposição crash/recuperação
    const bearSpacing = retireSettings.bearMarkets > 0
      ? Math.max(retireSettings.bearRecoveryYears + 1, Math.round(retireSettings.targetYears / retireSettings.bearMarkets))
      : 0;
    if (retireSettings.bearMarkets > 0) {
      if (bsy === 0) {
        // automático: distribui uniformemente com spacing seguro
        for (let k = 1; k <= retireSettings.bearMarkets; k++) {
          const y = bearSpacing * k;
          const safeY = Math.max(1, Math.min(retireSettings.targetYears - retireSettings.bearRecoveryYears, y));
          bearYearSet.add(safeY);
        }
      } else if (crashNow) {
        // crash atual: 1º crash já acontecendo (y=0), próximos a partir de bearSpacing
        for (let k = 1; k < retireSettings.bearMarkets; k++) {
          const y = bearSpacing * k;
          if (y <= retireSettings.targetYears - retireSettings.bearRecoveryYears)
            bearYearSet.add(y);
        }
      } else {
        // ano futuro específico: distribui a partir do 1º crash com spacing seguro
        const y1 = bsy - currentYear;
        const safeY1 = Math.max(1, Math.min(retireSettings.targetYears - retireSettings.bearRecoveryYears, y1));
        bearYearSet.add(safeY1);
        for (let k = 1; k < retireSettings.bearMarkets; k++) {
          const y = safeY1 + bearSpacing * k;
          if (y <= retireSettings.targetYears - retireSettings.bearRecoveryYears)
            bearYearSet.add(y);
        }
      }
    }
    // total de crashes efetivamente simulados (crashNow = 1 implícito fora do set)
    const simulatedBears = retireSettings.bearMarkets > 0
      ? bearYearSet.size + (crashNow ? 1 : 0)
      : 0;

    const runSim = (withBears: boolean) => {
      const rows: any[] = [];
      let cumBTC = existingBTC;
      // Se crash agora, simulação começa do preço já crashado
      let pricePrev = withBears && crashNow ? simStartPrice : btcPriceNow;
      let totalCostUSD = existingBTC * avgCostUSD;
      // Se crash agora, anos 1..bearRecoveryYears já são recuperação
      let inRecovery = withBears && crashNow ? retireSettings.bearRecoveryYears : 0;
      let crashPrice = withBears && crashNow ? simStartPrice : 0;
      let recoveryEndPrice = withBears && crashNow ? crashNowRecoveryTarget : 0;

      for (let y = 1; y <= retireSettings.targetYears; y++) {
        const cagr = getYearCagr(y);
        const normalPrice = pricePrev * (1 + cagr);
        let btcPrice: number;
        let isBear = false;
        let isRecovery = false;

        if (withBears && bearYearSet.has(y)) {
          // Ano de crash futuro
          btcPrice = pricePrev * (1 - retireSettings.bearDepth / 100);
          isBear = true;
          inRecovery = retireSettings.bearRecoveryYears;
          crashPrice = btcPrice;
          let target = normalPrice;
          for (let i = 1; i <= retireSettings.bearRecoveryYears; i++) target *= (1 + getYearCagr(y + i));
          recoveryEndPrice = target;
        } else if (withBears && inRecovery > 0) {
          // Ano de recuperação (inclui crash atual)
          isRecovery = true;
          const stepsDone = retireSettings.bearRecoveryYears - inRecovery + 1;
          btcPrice = crashPrice * Math.pow(Math.max(1, recoveryEndPrice / crashPrice), stepsDone / retireSettings.bearRecoveryYears);
          inRecovery--;
        } else {
          btcPrice = normalPrice;
        }

        const usdBrl = dollarRateNow * Math.pow(1 + retireSettings.usdBrlCagr / 100, y);
        const monthlyBRL = effectiveAporte * Math.pow(1 + retireSettings.aporteGrowth / 100, y - 1);
        const avgYearPrice = Math.sqrt(pricePrev * btcPrice);
        const btcBought = monthlyBRL * 12 / (avgYearPrice * usdBrl);
        totalCostUSD += btcBought * avgYearPrice;
        cumBTC += btcBought;
        const runningAvgCostUSD = cumBTC > 0 ? totalCostUSD / cumBTC : 0;
        const portfolioBRL = cumBTC * btcPrice * usdBrl;
        const realBRL = portfolioBRL / Math.pow(1 + retireSettings.ipca / 100, y);
        const profitBRL = Math.max(0, (btcPrice - runningAvgCostUSD) * usdBrl) * cumBTC;
        const taxBRL = profitBRL * 0.15;
        const netBRL = portfolioBRL - taxBRL;
        rows.push({ year: currentYear + y, btcPrice, usdBrl, monthlyBRL, btcBought, cumBTC, portfolioBRL, realBRL, taxBRL, netBRL, cagr: cagr * 100, avgCost: runningAvgCostUSD, isBear, isRecovery });
        pricePrev = btcPrice;
      }
      return rows;
    };

    const simRows = runSim(true);
    const simRowsNoBear = retireSettings.bearMarkets > 0 ? runSim(false) : simRows;

    const final = simRows[simRows.length - 1];
    const wBRL = retireSettings.withdrawalMonthlyBrl;
    const profitFrac = final ? Math.max(0, (final.btcPrice - avgCostUSD)) * final.usdBrl / (final.btcPrice * final.usdBrl) : 0;
    const irOnWithdrawal = wBRL > 35000 ? wBRL * profitFrac * 0.15 : 0;
    const yearsOfIncome = final ? Math.round(final.portfolioBRL / (wBRL * 12)) : 0;
    const yearsOfIncomeNet = final ? Math.round(final.portfolioBRL / ((wBRL + irOnWithdrawal) * 12)) : 0;

    const onTrackLabel = existingBTC >= retireSettings.targetBtc ? 'Meta já atingida! 🏆'
      : onTrackPct >= 100 ? 'No trilho!'
      : onTrackPct >= 75 ? 'Quase lá'
      : onTrackPct >= 50 ? 'Atenção'
      : 'Abaixo da meta';
    const onTrackColor = onTrackPct >= 100 ? '#34C759' : onTrackPct >= 75 ? '#FFD60A' : onTrackPct >= 50 ? '#FF9500' : '#FF3B30';
    const onTrackEmoji = onTrackPct >= 100 ? '✅' : onTrackPct >= 75 ? '🟡' : onTrackPct >= 50 ? '🟠' : '🔴';
    const chartRows = simRows.filter((_, i) => i % Math.max(1, Math.floor(simRows.length / 12)) === 0 || i === simRows.length - 1);
    const maxPortfolio = Math.max(...simRows.map(r => r.portfolioBRL));
    const BAR_H_R = 100;

    const numInput = (label: string, key: keyof RetireSettings, suffix: string, hint?: string) => (
      <View style={styles.retireInputRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.retireInputLabel}>{label}</Text>
          {hint && <Text style={styles.retireInputHint}>{hint}</Text>}
        </View>
        <View style={styles.retireInputWrap}>
          <TextInput
            style={styles.retireInput}
            value={String(retireSettings[key])}
            onChangeText={t => { const n = parseFloat(t.replace(',', '.')); if (!isNaN(n) && n >= 0) updateRetireSetting(key, n as any); }}
            keyboardType="decimal-pad"
            selectTextOnFocus
          />
          <Text style={styles.retireInputSuffix}>{suffix}</Text>
        </View>
      </View>
    );

    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.retireHeader}>
          <TouchableOpacity onPress={() => setScreen('more')}>
            <Text style={styles.retireHeaderBack}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.retireHeaderTitle}>🎯 Simulador de Aposentadoria</Text>
          <View style={{ width: 32 }} />
        </View>

        <ScrollView style={styles.content}>

          {/* ON-TRACK INDICATOR */}
          <View style={[styles.retireTrackCard, { borderColor: onTrackColor }]}>
            <View style={styles.retireTrackTop}>
              <Text style={styles.retireTrackEmoji}>{onTrackEmoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.retireTrackLabel, { color: onTrackColor }]}>{onTrackLabel}</Text>
                <Text style={styles.retireTrackSub}>{hideValues ? '****' : existingBTC.toFixed(6)} BTC de {retireSettings.targetBtc} BTC em {retireSettings.targetYears} anos</Text>
              </View>
              <Text style={[styles.retireTrackPct, { color: onTrackColor }]}>{Math.min(200, onTrackPct).toFixed(0)}%</Text>
            </View>
            <View style={styles.retireTrackBarBg}>
              <View style={[styles.retireTrackBarFill, { width: `${Math.min(100, onTrackPct)}%`, backgroundColor: onTrackColor }]} />
            </View>
            <View style={styles.retireTrackStats}>
              <Text style={styles.retireTrackStatText}>⚡ Acum. médio: <Text style={{ fontWeight: '700' }}>{hideValues ? '****' : (actualMonthlyBTC * 1000000).toFixed(1)} sats/mês</Text></Text>
              <Text style={styles.retireTrackStatText}>🎯 Necessário: <Text style={{ fontWeight: '700' }}>{(requiredMonthlyBTC * 1000000).toFixed(1)} sats/mês</Text></Text>
            </View>
          </View>

          {/* SELETOR DE CENÁRIO */}
          <View style={styles.retireScenarioRow}>
            {(['pessimista', 'base', 'otimista', 'custom'] as RetireScenario[]).map(sc => {
              const labels: Record<RetireScenario, string> = {
                pessimista: '🔴 Pessimista',
                base:       '🟡 Base',
                otimista:   '🟢 Otimista',
                custom:     '⚙️ Custom',
              };
              const colors: Record<RetireScenario, string> = {
                pessimista: '#FF3B30',
                base:       '#FF9500',
                otimista:   '#34C759',
                custom:     '#667eea',
              };
              const active = retireScenario === sc;
              return (
                <TouchableOpacity
                  key={sc}
                  style={[styles.retireScenarioBtn, active && { backgroundColor: colors[sc], borderColor: colors[sc] }]}
                  onPress={() => { if (sc !== 'custom') applyScenario(sc as any); else setShowRetireConfig(true); }}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.retireScenarioBtnText, active && { color: '#fff' }]}>
                    {labels[sc]}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* RESUMO DO CENÁRIO ATIVO */}
          <View style={styles.retireScenarioSummary}>
            <Text style={styles.retireScenarioSummaryItem}>📈 CAGR: <Text style={{ fontWeight: '800' }}>{retireSettings.btcCagr}%{retireSettings.useDecreasingCagr ? ' ↓' : ''}</Text></Text>
            <Text style={styles.retireScenarioSummaryItem}>💵 USD/BRL: <Text style={{ fontWeight: '800' }}>{retireSettings.usdBrlCagr}%</Text></Text>
            <Text style={styles.retireScenarioSummaryItem}>💰 Aporte: <Text style={{ fontWeight: '800' }}>R${effectiveAporte.toFixed(0)}{retireSettings.aporteGrowth > 0 ? `+${retireSettings.aporteGrowth}%` : ' fixo'}</Text></Text>
            <Text style={styles.retireScenarioSummaryItem}>🔥 IPCA: <Text style={{ fontWeight: '800' }}>{retireSettings.ipca}%</Text></Text>
            <Text style={styles.retireScenarioSummaryItem}>📉 Bears: <Text style={{ fontWeight: '800', color: retireSettings.bearMarkets > 0 ? '#FF3B30' : '#34C759' }}>{retireSettings.bearMarkets === 0 ? 'nenhum' : `${retireSettings.bearMarkets}x -${retireSettings.bearDepth}%`}</Text></Text>
            <Text style={styles.retireScenarioSummaryItem}>📈 Recup.: <Text style={{ fontWeight: '800' }}>{retireSettings.bearRecoveryYears} anos{retireSettings.bearStartYear > 0 ? ` (a partir de ${retireSettings.bearStartYear <= new Date().getFullYear() ? 'agora' : retireSettings.bearStartYear})` : ''}</Text></Text>
          </View>

          {/* CONFIGURAÇÕES */}
          <TouchableOpacity style={styles.retireConfigHeader} onPress={() => setShowRetireConfig(!showRetireConfig)} activeOpacity={0.8}>
            <Text style={styles.retireConfigHeaderText}>⚙️ Configurações da Simulação</Text>
            <Text style={styles.retireConfigHeaderChevron}>{showRetireConfig ? '⌃' : '⌄'}</Text>
          </TouchableOpacity>

          {showRetireConfig && (
            <View style={styles.retireConfigCard}>
              <Text style={styles.retireConfigSection}>Objetivo</Text>
              {numInput('🎯 Meta de BTC', 'targetBtc', 'BTC', 'Quanto BTC quer ter no total')}
              {numInput('📅 Prazo', 'targetYears', 'anos', 'Anos até a aposentadoria')}

              <Text style={styles.retireConfigSection}>Bitcoin</Text>
              {numInput('📈 CAGR do BTC', 'btcCagr', '% a.a.', 'Histórico: ~100%; conservador: 30%')}
              <View style={styles.retireInputRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.retireInputLabel}>CAGR decrescente por halving</Text>
                  <Text style={styles.retireInputHint}>Mais realista para prazos longos</Text>
                </View>
                <TouchableOpacity
                  style={[styles.retireToggle, retireSettings.useDecreasingCagr && styles.retireToggleOn]}
                  onPress={() => updateRetireSetting('useDecreasingCagr', !retireSettings.useDecreasingCagr)}
                >
                  <Text style={styles.retireToggleText}>{retireSettings.useDecreasingCagr ? 'ON' : 'OFF'}</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.retireConfigSection}>Aportes</Text>
              {numInput('💰 Aporte mensal', 'aporteMensal', 'R$', `Auto: R$ ${autoAporteBRL.toFixed(0)}/mês do histórico — 0 = usar auto`)}
              {numInput('📈 Crescimento anual', 'aporteGrowth', '% a.a.', retireSettings.aporteGrowth === 0 ? '0% = aporte fixo (sem aumento). Para parar aportes, set acima como 1.' : 'Aumento % do aporte por ano (reajuste salarial)')}

              <Text style={styles.retireConfigSection}>Macro</Text>
              {numInput('💵 CAGR USD/BRL', 'usdBrlCagr', '% a.a.', 'Desvalorização histórica: ~7% a.a.')}
              {numInput('🔥 IPCA', 'ipca', '% a.a.', 'Inflação brasileira (IPCA hist: 4,5%)')}

              <Text style={styles.retireConfigSection}>Simulação de Renda</Text>
              {numInput('🏠 Renda mensal desejada', 'withdrawalMonthlyBrl', 'R$/mês', 'Quanto quer sacar por mês na aposentadoria')}

              <Text style={styles.retireConfigSection}>📉 Bear Markets</Text>
              {numInput('📉 Nº de bears', 'bearMarkets', 'crashes', 'Histórico: ~1 por ciclo de 4 anos | 0 = sem crashes')}
              {numInput('⬇️ Queda por crash', 'bearDepth', '%', 'BTC 2022: -77% | 2018: -84% | 2015: -86%')}
              {numInput('📈 Duração da recuperação', 'bearRecoveryYears', 'anos', 'Anos até voltar ao preço anterior ao crash')}
              {numInput('📅 Ano do 1º crash', 'bearStartYear', '', `0 = automático | ${new Date().getFullYear()} = crash agora | ex: ${new Date().getFullYear() + 2} = daqui 2 anos`)}
            </View>
          )}

          {/* RESULTADO FINAL */}
          {final && (
            <View style={styles.retireResultCard}>
              <Text style={styles.retireResultTitle}>Resultado em {retireSettings.targetYears} anos ({final.year})</Text>
              <View style={styles.retireResultGrid}>
                <View style={styles.retireResultItem}>
                  <Text style={styles.retireResultLabel}>Total BTC</Text>
                  <Text style={[styles.retireResultValue, { color: '#F7931A' }]}>{hideValues ? '****' : final.cumBTC.toFixed(4)}</Text>
                  <Text style={styles.retireResultSub}>BTC</Text>
                </View>
                <View style={styles.retireResultItem}>
                  <Text style={styles.retireResultLabel}>Patrimônio Bruto</Text>
                  <Text style={styles.retireResultValue}>{hideValues ? '****' : final.portfolioBRL >= 1e9 ? `R$ ${(final.portfolioBRL / 1e9).toFixed(2)} bi` : `R$ ${(final.portfolioBRL / 1e6).toFixed(1)} mi`}</Text>
                  <Text style={styles.retireResultSub}>nominal</Text>
                </View>
                <View style={styles.retireResultItem}>
                  <Text style={styles.retireResultLabel}>Valor Real</Text>
                  <Text style={[styles.retireResultValue, { color: '#667eea' }]}>{hideValues ? '****' : final.realBRL >= 1e9 ? `R$ ${(final.realBRL / 1e9).toFixed(2)} bi` : `R$ ${(final.realBRL / 1e6).toFixed(1)} mi`}</Text>
                  <Text style={styles.retireResultSub}>desc. inflação</Text>
                </View>
                <View style={styles.retireResultItem}>
                  <Text style={styles.retireResultLabel}>Líquido (c/ IR)</Text>
                  <Text style={[styles.retireResultValue, { color: '#34C759' }]}>{hideValues ? '****' : final.netBRL >= 1e9 ? `R$ ${(final.netBRL / 1e9).toFixed(2)} bi` : `R$ ${(final.netBRL / 1e6).toFixed(1)} mi`}</Text>
                  <Text style={styles.retireResultSub}>após 15% IR</Text>
                </View>
              </View>
              <View style={styles.retireBtcPrice}>
                <Text style={styles.retireBtcPriceLabel}>Preço projetado do BTC em {final.year}:</Text>
                <Text style={styles.retireBtcPriceValue}>{formatCurrency(final.btcPrice)}</Text>
              </View>
            </View>
          )}

          {/* CARD DE IMPACTO DOS BEAR MARKETS */}
          {retireSettings.bearMarkets > 0 && final && simRowsNoBear.length > 0 && (() => {
            const finalNoBear = simRowsNoBear[simRowsNoBear.length - 1];
            const worstRow = simRows.reduce((min, r) => r.portfolioBRL < min.portfolioBRL ? r : min, simRows[0]);
            const btcExtra = final.cumBTC - finalNoBear.cumBTC;
            const portfolioDiff = final.portfolioBRL - finalNoBear.portfolioBRL;
            const monthsUnder = simRows.filter(r => r.btcPrice < r.avgCost * (currentDollarRate ?? 5.8)).length;
            return (
              <View style={[styles.chartCard, { borderLeftWidth: 3, borderLeftColor: '#FF3B30' }]}>
                <Text style={styles.chartTitle}>📉 Impacto dos Bear Markets</Text>
                <Text style={styles.chartSubtitle}>
                  {simulatedBears} de {retireSettings.bearMarkets} crash{retireSettings.bearMarkets > 1 ? 'es' : ''} de -{retireSettings.bearDepth}% com recup. de {retireSettings.bearRecoveryYears}a{simulatedBears < retireSettings.bearMarkets ? `  ⚠️ ${retireSettings.bearMarkets - simulatedBears} fora do horizonte` : ''}
                </Text>
                <View style={styles.retireWithdrawGrid}>
                  <View style={styles.retireWithdrawItem}>
                    <Text style={styles.retireWithdrawLabel}>🟥 Pior patrimônio</Text>
                    <Text style={[styles.retireWithdrawValue, { color: '#FF3B30' }]}>
                      {hideValues ? '****' : worstRow.portfolioBRL >= 1e6 ? `R$ ${(worstRow.portfolioBRL / 1e6).toFixed(1)}M` : `R$ ${(worstRow.portfolioBRL / 1000).toFixed(0)}k`}
                    </Text>
                    <Text style={{ fontSize: 10, color: '#8E8E93' }}>em {worstRow.year}</Text>
                  </View>
                  <View style={styles.retireWithdrawItem}>
                    <Text style={styles.retireWithdrawLabel}>⬇️ vs sem bears</Text>
                    <Text style={[styles.retireWithdrawValue, { color: portfolioDiff >= 0 ? '#34C759' : '#FF3B30' }]}>
                      {hideValues ? '****' : `${portfolioDiff >= 0 ? '+' : ''}${portfolioDiff >= 1e6 || portfolioDiff <= -1e6 ? `R$${(portfolioDiff / 1e6).toFixed(1)}M` : `R$${(portfolioDiff / 1000).toFixed(0)}k`}`}
                    </Text>
                    <Text style={{ fontSize: 10, color: '#8E8E93' }}>patrimônio final</Text>
                  </View>
                  <View style={styles.retireWithdrawItem}>
                    <Text style={styles.retireWithdrawLabel}>⚡ BTC extra (DCA)</Text>
                    <Text style={[styles.retireWithdrawValue, { color: btcExtra >= 0 ? '#34C759' : '#FF3B30' }]}>
                      {hideValues ? '****' : `${btcExtra >= 0 ? '+' : ''}${(btcExtra * 1e8 / 1e6).toFixed(2)}M sats`}
                    </Text>
                    <Text style={{ fontSize: 10, color: '#8E8E93' }}>acum. extra nos crashes</Text>
                  </View>
                  <View style={styles.retireWithdrawItem}>
                    <Text style={styles.retireWithdrawLabel}>🟥 Anos no negativo</Text>
                    <Text style={[styles.retireWithdrawValue, { color: monthsUnder > 0 ? '#FF9500' : '#34C759' }]}>
                      {monthsUnder} {monthsUnder === 1 ? 'ano' : 'anos'}
                    </Text>
                    <Text style={{ fontSize: 10, color: '#8E8E93' }}>BTC abaixo do custo médio</Text>
                  </View>
                </View>
                {btcExtra > 0 && (
                  <View style={[styles.retireWithdrawBanner, { backgroundColor: 'rgba(52,199,89,0.08)', borderColor: 'rgba(52,199,89,0.2)' }]}>
                    <Text style={styles.retireWithdrawBannerText}>
                      💡 DCA durante quedas comprou <Text style={{ fontWeight: '800', color: '#34C759' }}>{(btcExtra * 1e8).toFixed(0)} sats extras</Text> vs sem crash — o bear market trabalhou a seu favor!
                    </Text>
                  </View>
                )}
                {btcExtra <= 0 && (
                  <View style={[styles.retireWithdrawBanner, { backgroundColor: 'rgba(255,59,48,0.08)', borderColor: 'rgba(255,59,48,0.2)' }]}>
                    <Text style={styles.retireWithdrawBannerText}>
                      ⚠️ Neste cenário a recuperação é lenta demais para compensar a perda de tempo de valorização.
                    </Text>
                  </View>
                )}
              </View>
            );
          })()}

          {/* GRÁFICO DE EVOLUÇÃO */}
          {simRows.length > 0 && (
            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>📈 Evolução do Patrimônio</Text>
              <Text style={styles.chartSubtitle}>Valor bruto em BRL — 📉 crash • 🟠 recuperação • 🟣 normal</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={[styles.barChart, { height: BAR_H_R + 60 }]}>
                  {simRows.map(r => {
                    const barColor = r.isBear ? '#FF3B30' : r.isRecovery ? '#FF9500' : '#F7931A';
                    return (
                      <View key={r.year} style={[styles.barItem, { height: BAR_H_R + 60, width: 52 }]}>
                        <Text style={[styles.barTopLabel, { color: barColor, fontSize: 8 }]}>
                          {r.portfolioBRL >= 1e9 ? `${(r.portfolioBRL / 1e9).toFixed(1)}bi` : `${(r.portfolioBRL / 1e6).toFixed(0)}M`}
                        </Text>
                        <View style={{ flex: 1, justifyContent: 'flex-end', gap: 1 }}>
                          <View style={[styles.barFill, { height: (r.portfolioBRL / maxPortfolio) * BAR_H_R, backgroundColor: barColor, borderTopLeftRadius: 5, borderTopRightRadius: 5 }]} />
                        </View>
                        <Text style={[styles.barBottomLabel, r.isBear && { color: '#FF3B30', fontWeight: '700' }]}>
                          {r.isBear ? '📉' : r.isRecovery ? '🟠' : ''}{String(r.year).substring(2)}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </ScrollView>
            </View>
          )}

          {/* TABELA ANUAL */}
          {simRows.length > 0 && (
            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>📅 Projeção Ano a Ano</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator>
                <View>
                  <View style={styles.retireTableHeader}>
                    {['Ano', 'BTC/mês', 'Total BTC', 'Valor BRL', 'Real (IPCA)', 'Líq. IR'].map(h => (
                      <Text key={h} style={styles.retireTableHead}>{h}</Text>
                    ))}
                  </View>
                  {simRows.map(r => (
                    <View key={r.year} style={[styles.retireTableRow, r.isBear && { backgroundColor: 'rgba(255,59,48,0.06)' }, r.isRecovery && { backgroundColor: 'rgba(255,149,0,0.06)' }]}>
                      <Text style={[styles.retireTableCell, { fontWeight: r.isBear ? '800' : '500' }]}>
                        {r.isBear ? '📉' : r.isRecovery ? '🟠' : ''}{r.year}
                      </Text>
                      <Text style={styles.retireTableCell}>{(r.btcBought / 12 * 1e6).toFixed(0)} sats</Text>
                      <Text style={styles.retireTableCell}>{hideValues ? '***' : r.cumBTC.toFixed(4)}</Text>
                      <Text style={[styles.retireTableCell, { color: r.isBear ? '#FF3B30' : '#F7931A' }]}>{hideValues ? '***' : r.portfolioBRL >= 1e6 ? `${(r.portfolioBRL / 1e6).toFixed(1)}M` : `${(r.portfolioBRL / 1000).toFixed(0)}k`}</Text>
                      <Text style={[styles.retireTableCell, { color: '#667eea' }]}>{hideValues ? '***' : r.realBRL >= 1e6 ? `${(r.realBRL / 1e6).toFixed(1)}M` : `${(r.realBRL / 1000).toFixed(0)}k`}</Text>
                      <Text style={[styles.retireTableCell, { color: '#34C759' }]}>{hideValues ? '***' : r.netBRL >= 1e6 ? `${(r.netBRL / 1e6).toFixed(1)}M` : `${(r.netBRL / 1000).toFixed(0)}k`}</Text>
                    </View>
                  ))}
                </View>
              </ScrollView>
              <Text style={styles.retireTableNote}>📉 crash • 🟠 recuperação • IR = 15% s/ lucro | valores em R$</Text>
            </View>
          )}

          {/* SIMULADOR DE RENDA */}
          {final && (
            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>🏠 Simulador de Renda na Aposentadoria</Text>
              <Text style={styles.chartSubtitle}>Com base no patrimônio em {final.year}</Text>
              <View style={styles.retireWithdrawGrid}>
                <View style={styles.retireWithdrawItem}>
                  <Text style={styles.retireWithdrawLabel}>Renda desejada</Text>
                  <Text style={styles.retireWithdrawValue}>{hideValues ? 'R$ ****' : formatCurrencyBRL(wBRL)}/mês</Text>
                </View>
                <View style={styles.retireWithdrawItem}>
                  <Text style={styles.retireWithdrawLabel}>0% IR (lat. ≤ R$35k/mês)</Text>
                  <Text style={[styles.retireWithdrawValue, { color: '#34C759' }]}>{yearsOfIncome} anos de renda</Text>
                </View>
                <View style={styles.retireWithdrawItem}>
                  <Text style={styles.retireWithdrawLabel}>IR estimado (se {'>'} R$35k)</Text>
                  <Text style={[styles.retireWithdrawValue, { color: '#FF3B30' }]}>{hideValues ? 'R$ ****' : formatCurrencyBRL(irOnWithdrawal)}/mês</Text>
                </View>
                <View style={styles.retireWithdrawItem}>
                  <Text style={styles.retireWithdrawLabel}>Renda líquida real</Text>
                  <Text style={[styles.retireWithdrawValue, { color: '#667eea' }]}>{hideValues ? 'R$ ****' : formatCurrencyBRL(wBRL - irOnWithdrawal)}/mês</Text>
                </View>
              </View>
              <View style={styles.retireWithdrawBanner}>
                <Text style={styles.retireWithdrawBannerText}>
                  💡 Estratégia isenta: sacar até R$ 35.000/mês por bolsa nacional = <Text style={{ fontWeight: '800', color: '#34C759' }}>0% de IR</Text>
                </Text>
              </View>
              <Text style={styles.retireDisclaimer}>⚠️ Simulação educacional. Não é garantia de retorno. Consulte um assessor financeiro.</Text>
            </View>
          )}

        </ScrollView>
        {renderTabBar()}
      </SafeAreaView>
    );
  }

  if (screen === 'taxes') {
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1; // 1-12
    const isDeclarationPeriod = currentMonth >= 1 && currentMonth <= 4;
    const taxData = calculateTaxReport();
    
    const allClear = taxData.pendingDARFs.length === 0 && (!taxData.needsDeclaration || !isDeclarationPeriod);

    const toggleYear = (year: string) => {
      setExpandedYears(prev => ({
        ...prev,
        [year]: !prev[year]
      }));
    };

    const exportTaxReport = () => {
      let report = '💼 RELATÓRIO DE IMPOSTOS - CRIPTOMOEDAS 2026\n\n';
      
      report += '---------------------------------------\n';
      report += '📋 NOVA LEI 2026 - EXCHANGES INTERNACIONAIS\n';
      report += '---------------------------------------\n';
      report += '• 15% sobre QUALQUER ganho de capital\n';
      report += '• SEM isenção de R$ 35.000\n';
      report += '• Compensação de perdas INTERANUAL (indefinida)\n\n';
      
      if (taxData.fiscalYears && taxData.fiscalYears.length > 0) {
        report += '---------------------------------------\n';
        report += 'DECLARAÇÃO POR ANO FISCAL\n';
        report += '---------------------------------------\n\n';
        
        taxData.fiscalYears.forEach(year => {
          report += `\n📅 ANO FISCAL ${year.year}\n`;
          report += `${'-'.repeat(39)}\n\n`;
          
          report += '🏠 BENS E DIREITOS (31/12):\n';
          report += `   Ano Anterior: ${formatCurrency(year.patrimonyStart)}\n`;
          report += `   Ano Atual: ${formatCurrency(year.patrimonyEnd)}\n`;
          report += `   Variação: ${formatCurrency(year.patrimonyEnd - year.patrimonyStart)}\n\n`;
          
          report += '💰 GANHOS DE CAPITAL:\n';
          report += `   Ganhos: ${formatCurrency(year.totalProfit)}\n`;
          report += `   Perdas: ${formatCurrency(year.totalLoss)}\n`;
          report += `   Resultado Bruto: ${formatCurrency(year.netResult)}\n\n`;
          
          if (year.accumulatedLoss > 0) {
            report += '⚖️ COMPENSAÇÃO:\n';
            report += `   Prejuízos de anos anteriores: ${formatCurrency(year.accumulatedLoss)}\n`;
            report += `   Resultado após compensação: ${formatCurrency(year.netResultWithCompensation)}\n\n`;
          }
          
          report += '💼 IMPOSTO:\n';
          report += `   Base de cálculo: ${formatCurrency(Math.max(0, year.netResultWithCompensation))}\n`;
          report += `   Imposto devido (15%): ${formatCurrency(year.taxDue)}\n\n`;
          
          if (year.lossToCarry > 0) {
            report += `📉 Prejuízo a compensar nos próximos anos: ${formatCurrency(year.lossToCarry)}\n\n`;
          }
          
          if (year.needsDeclaration) {
            report += '? DECLARAÇÃO OBRIGATÓRIA\n';
            if (year.patrimonyEnd > 5000) {
              report += '   Motivo: Patrimônio > R$ 5.000\n';
            }
            if (year.months.length > 0) {
              report += '   Motivo: Houve operações no ano\n';
            }
            report += '\n';
          }
          
          report += `${'-'.repeat(39)}\n`;
        });
      }
      
      report += '\n---------------------------------------\n';
      report += 'Relatório gerado em: ' + new Date().toLocaleDateString('pt-BR') + '\n';
      report += 'CapitalChain - Gestor de Criptomoedas\n';
      
      return report;
    };

    const shareReport = async () => {
      try {
        await Share.share({
          message: exportTaxReport(),
          title: 'Relatório de Impostos - Criptomoedas'
        });
      } catch (error) {
        Alert.alert('Erro', 'Não foi possível compartilhar o relatório');
      }
    };

    const copyReport = async () => {
      await Clipboard.setString(exportTaxReport());
      Alert.alert('? Copiado!', 'Relatório copiado para a área de transferência');
    };

    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>💼 Impostos</Text>
          <Text style={styles.subtitle}>Declaração por Ano Fiscal</Text>
        </View>

        <ScrollView style={styles.content}>
          {/* Toggle entre visualização anual e mensal */}
          <View style={styles.viewModeToggle}>
            <TouchableOpacity
              style={[styles.toggleButton, taxViewMode === 'years' && styles.toggleButtonActive]}
              onPress={() => setTaxViewMode('years')}
            >
              <Text style={[styles.toggleButtonText, taxViewMode === 'years' && styles.toggleButtonTextActive]}>
                📅 Por Ano Fiscal
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleButton, taxViewMode === 'months' && styles.toggleButtonActive]}
              onPress={() => setTaxViewMode('months')}
            >
              <Text style={[styles.toggleButtonText, taxViewMode === 'months' && styles.toggleButtonTextActive]}>
                📆 Por Mês
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.taxCardBlue}>
            <Text style={styles.taxCardTitle}>📋 Nova Lei 2026 - Exchanges Internacionais</Text>
            <Text style={styles.taxCardText}>
              • 15% sobre QUALQUER ganho de capital{"\n"}
              • SEM isenção de R$ 35.000{"\n"}
              • Compensação de perdas INTERANUAL (indefinida)
            </Text>
          </View>

          {/* VISUALIZAÇÃO POR ANO FISCAL */}
          {taxViewMode === 'years' && taxData.fiscalYears && taxData.fiscalYears.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>📊 Declaração por Ano Fiscal</Text>
              <Text style={styles.sectionSubtitle}>
                Toque em cada ano para ver os detalhes
              </Text>
              
              {taxData.fiscalYears.map((year, index) => {
                const isExpanded = expandedYears[year.year];
                const hasProfit = year.netResultWithCompensation > 0;
                const hasLoss = year.netResult < 0;
                const hadCompensation = year.accumulatedLoss > 0;
                const decPct = (declarationPercent[year.year] ?? 100) / 100;
                const prevYearKey = String(parseInt(year.year) - 1);
                const prevDecPct = (declarationPercent[prevYearKey] ?? 100) / 100;
                // Por ativo: sem compras no ano → herda % do ano anterior; com compras → usa % do ano atual
                const declAdjAssets = (year.patrimonyEndAssets || []).map((a: any) => {
                  const hadPurchasesThisYear = purchases.some(
                    (p: CryptoPurchase) => p.coin === a.coin && new Date(p.date).getFullYear().toString() === year.year
                  );
                  const assetPct = hadPurchasesThisYear ? decPct : prevDecPct;
                  return {
                    ...a,
                    quantity: a.quantity * assetPct,
                    totalCost: a.totalCost * assetPct,
                    _assetPct: assetPct,
                    _hadPurchasesThisYear: hadPurchasesThisYear,
                  };
                });
                const totalDeclPatrimony = declAdjAssets.reduce((sum: number, a: any) => sum + a.totalCost, 0);
                
                return (
                  <View key={year.year}>
                    <TouchableOpacity
                      style={[
                        styles.fiscalYearCard,
                        year.taxDue > 0 && styles.fiscalYearCardTax,
                        hasLoss && styles.fiscalYearCardLoss,
                      ]}
                      onPress={() => toggleYear(year.year)}
                    >
                      <View style={styles.fiscalYearHeader}>
                        <View style={styles.fiscalYearTitleRow}>
                          <Text style={styles.fiscalYearTitle}>
                            📅 Ano Fiscal {year.year}
                          </Text>
                          <Text style={styles.fiscalYearToggle}>
                            {isExpanded ? '▼' : '▶'}
                          </Text>
                        </View>
                        
                        <View style={styles.fiscalYearSummary}>
                          <View style={styles.fiscalYearSummaryRow}>
                            <Text style={styles.fiscalYearLabel}>Patrimônio 31/12:</Text>
                            <Text style={styles.fiscalYearValue}>
                              {formatCurrency(year.patrimonyEnd)}
                            </Text>
                          </View>
                          
                          <View style={styles.fiscalYearSummaryRow}>
                            <Text style={styles.fiscalYearLabel}>Resultado:</Text>
                            <Text style={[
                              styles.fiscalYearValueHighlight,
                              year.netResult >= 0 ? styles.profit : styles.loss
                            ]}>
                              {formatCurrency(year.netResult)}
                            </Text>
                          </View>
                          
                          {hadCompensation && (
                            <View style={styles.fiscalYearSummaryRow}>
                              <Text style={styles.fiscalYearLabel}>Após compensação:</Text>
                              <Text style={[
                                styles.fiscalYearValueHighlight,
                                year.netResultWithCompensation >= 0 ? styles.profit : styles.loss
                              ]}>
                                {formatCurrency(year.netResultWithCompensation)}
                              </Text>
                            </View>
                          )}
                          
                          <View style={styles.fiscalYearSummaryRow}>
                            <Text style={styles.fiscalYearLabelBold}>Imposto devido:</Text>
                            <Text style={styles.fiscalYearTaxDue}>
                              {formatCurrency(year.taxDue)}
                            </Text>
                          </View>
                        </View>
                      </View>
                    </TouchableOpacity>
                    
                    {/* DETALHES DO ANO (EXPANDIDO) */}
                    {isExpanded && (
                      <View style={styles.fiscalYearDetails}>

                        {/* ── Seletor de % a Declarar ── */}
                        {(() => {
                          const pct = declarationPercent[year.year] ?? 100;
                          return (
                            <View style={styles.declPercentBox}>
                              <View style={styles.declPercentHeader}>
                                <Text style={styles.declPercentTitle}>📊 % a Declarar</Text>
                                <View style={[styles.declPercentBadge, pct < 100 && styles.declPercentBadgePartial]}>
                                  <Text style={[styles.declPercentBadgeText, pct < 100 && styles.declPercentBadgeTextPartial]}>
                                    {pct}%
                                  </Text>
                                </View>
                              </View>
                              <Text style={styles.declPercentSubtitle}>
                                Ajusta quantidades e valores em Bens e Direitos. Preço médio, ganhos e impostos não mudam.
                              </Text>
                              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
                                {[10,20,30,40,50,60,70,80,90,100].map(step => (
                                  <TouchableOpacity
                                    key={step}
                                    style={[styles.declPercentBtn, pct === step && styles.declPercentBtnActive]}
                                    onPress={async () => {
                                      const updated = { ...declarationPercent, [year.year]: step };
                                      setDeclarationPercent(updated);
                                      await AsyncStorage.setItem(DECL_PERCENT_KEY, JSON.stringify(updated));
                                    }}
                                  >
                                    <Text style={[styles.declPercentBtnText, pct === step && styles.declPercentBtnTextActive]}>
                                      {step}%
                                    </Text>
                                  </TouchableOpacity>
                                ))}
                              </ScrollView>
                              {pct < 100 && (
                                <Text style={styles.declPercentWarning}>
                                  ⚠️ Declarando {pct}% (novos aportes) → Patrimônio declarado total: {formatCurrency(totalDeclPatrimony)}
                                </Text>
                              )}
                            </View>
                          );
                        })()}

                        {/* Bens e Direitos */}
                        <View style={styles.detailSection}>
                          <Text style={styles.detailSectionTitle}>🏠 Bens e Direitos (31/12)</Text>
                          <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>Ano Anterior ({parseInt(year.year) - 1}){prevDecPct < 1 ? ` (${Math.round(prevDecPct * 100)}%)` : ''}:</Text>
                            <Text style={styles.detailValue}>{formatCurrency(year.patrimonyStart * prevDecPct)}</Text>
                          </View>
                          <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>Ano Atual ({year.year}){decPct < 1 ? ` (${Math.round(decPct * 100)}%)` : ''}{declAdjAssets.some((a: any) => a._assetPct !== decPct) ? ' ⚠️misto' : ''}:</Text>
                            <Text style={styles.detailValue}>{formatCurrency(totalDeclPatrimony)}</Text>
                          </View>
                          <View style={styles.detailRow}>
                            <Text style={styles.detailLabelBold}>Variação:</Text>
                            <Text style={[
                              styles.detailValueBold,
                              (totalDeclPatrimony - year.patrimonyStart * prevDecPct) >= 0 ? styles.profit : styles.loss
                            ]}>
                              {formatCurrency(totalDeclPatrimony - year.patrimonyStart * prevDecPct)}
                            </Text>
                          </View>
                          
                          {/* Ativos detalhados */}
                          {year.patrimonyEndAssets && year.patrimonyEndAssets.length > 0 && (
                            <View style={styles.assetsDetail}>
                              <Text style={styles.assetsDetailTitle}>Criptoativos em 31/12/{year.year}:</Text>
                              {declAdjAssets.map((asset: any, idx: number) => (
                                <View key={idx} style={styles.assetItem}>
                                  <Text style={styles.assetCoin}>{asset.coin}</Text>
                                  <Text style={styles.assetQuantity}>
                                    Qtd: {formatQuantity(asset.quantity)}
                                  </Text>
                                  <Text style={styles.assetCost}>
                                    Custo médio: {formatAveragePrice(asset.averageCost)}
                                  </Text>
                                  <Text style={styles.assetTotal}>
                                    Total: {formatCurrency(asset.totalCost)}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          )}

                          {/* BENS E DIREITOS - FORMATO RECEITA FEDERAL */}
                          {year.patrimonyEndAssets && year.patrimonyEndAssets.length > 0 && (
                            <View style={styles.assetsDetail}>
                              <View style={styles.rfHeaderRow}>
                                <Text style={styles.assetsDetailTitle}>
                                  📋 BENS E DIREITOS (Formato Receita Federal)
                                </Text>
                                <TouchableOpacity
                                  style={styles.copyButton}
                                  onPress={async () => {
                                    // Gerar texto completo para copiar
                                    const prevYear = parseInt(year.year) - 1;
                                    const groupedByCode: Record<string, any[]> = {};
                                    declAdjAssets.forEach((asset: any) => {
                                      const code = getCryptoCode(asset.coin);
                                      if (!groupedByCode[code]) groupedByCode[code] = [];
                                      groupedByCode[code].push(asset);
                                    });
                                    
                                    let fullText = `BENS E DIREITOS - ANO ${year.year}\n\n`;
                                    
                                    Object.keys(groupedByCode).sort().forEach((code) => {
                                      const assets = groupedByCode[code];
                                      
                                      if (code === '08.01') {
                                        assets.forEach((asset) => {
                                          const prev = year.patrimonyStartAssets?.find((p: any) => p.coin === asset.coin);
                                          const prevValue = prev ? prev.totalCost * prevDecPct : 0;
                                          fullText += `${asset.coin}\nGrupo 08 – Criptoativos – Código 01\n`;
                                          fullText += `Situação em 31/12/${prevYear}: ${formatCurrency(prevValue)}\n`;
                                          const boughtInYear = purchases.filter(p => p.coin === asset.coin && new Date(p.date).getFullYear().toString() === year.year).reduce((sum, p) => sum + p.quantity, 0) * decPct;
                                          fullText += `Situação em 31/12/${year.year}: ${formatCurrency(asset.totalCost)}\n`;
                                          fullText += boughtInYear > 0
                                            ? `Adquirido no exercício de ${year.year}: ${formatQuantity(boughtInYear)} ${asset.coin}. Saldo acumulado em 31/12/${year.year}: ${formatQuantity(asset.quantity)} ${asset.coin}. Custo de aquisição total em corretora internacional utilizando USDT e recursos próprios. Valores convertidos para BRL conforme cotação do dólar na data de cada aquisição (média R$ ${asset.averageDollarRate.toFixed(2).replace('.', ',')}), já incluindo taxas de rede e saque. Ativo mantido em custódia própria (carteira digital / autocustódia).\n\n`
                                            : `Saldo de exercícios anteriores. Saldo em 31/12/${year.year}: ${formatQuantity(asset.quantity)} ${asset.coin}. Ativo mantido em custódia própria (carteira digital / autocustódia).\n\n`;
                                        });
                                      } else if (code === '08.03') {
                                        const totalValue = assets.reduce((sum, a) => sum + a.totalCost, 0);
                                        const totalPrevValue = assets.reduce((sum, a) => {
                                          const prev = year.patrimonyStartAssets?.find((p: any) => p.coin === a.coin);
                                          return sum + (prev ? prev.totalCost * prevDecPct : 0);
                                        }, 0);
                                        const coinList = assets.map(a => a.coin).join(', ');
                                        const avgRateStable = totalValue > 0 ? assets.reduce((s: number, a: any) => s + a.totalCost * (a.averageDollarRate || 0), 0) / totalValue : 0;
                                        fullText += `Stablecoins (${coinList})\nGrupo 08 – Criptoativos – Código 03\n`;
                                        fullText += `Situação em 31/12/${prevYear}: ${formatCurrency(totalPrevValue)}\n`;
                                        fullText += `Situação em 31/12/${year.year}: ${formatCurrency(totalValue)}\n`;
                                        fullText += `Conjunto de stablecoins (${coinList}) adquiridas em corretoras internacionais com recursos próprios e mantidas em custódia própria (carteira digital). Custo de aquisição convertido para BRL conforme cotação do dólar (média R$ ${avgRateStable.toFixed(2).replace('.', ',')}) nas datas de aquisição, já incluindo taxas de rede e saque.\n\n`;
                                      } else if (code === '08.02') {
                                        const bigAssets = assets.filter(a => a.totalCost >= 5000);
                                        const smallAssets = assets.filter(a => a.totalCost < 5000);
                                        
                                        bigAssets.forEach((asset) => {
                                          const prev = year.patrimonyStartAssets?.find((p: any) => p.coin === asset.coin);
                                          const prevValue = prev ? prev.totalCost * prevDecPct : 0;
                                          const boughtInYear = purchases.filter(p => p.coin === asset.coin && new Date(p.date).getFullYear().toString() === year.year).reduce((sum, p) => sum + p.quantity, 0) * decPct;
                                          fullText += `${asset.coin}\nGrupo 08 – Criptoativos – Código 02\n`;
                                          fullText += `Situação em 31/12/${prevYear}: ${formatCurrency(prevValue)}\n`;
                                          fullText += `Situação em 31/12/${year.year}: ${formatCurrency(asset.totalCost)}\n`;
                                          fullText += boughtInYear > 0
                                            ? `Adquirido no exercício de ${year.year}: ${formatQuantity(boughtInYear)} ${asset.coin}. Saldo acumulado em 31/12/${year.year}: ${formatQuantity(asset.quantity)} ${asset.coin}. Custo de aquisição total em corretora internacional utilizando USDT e recursos próprios. Valores convertidos para BRL conforme cotação do dólar na data de cada aquisição (média R$ ${asset.averageDollarRate.toFixed(2).replace('.', ',')}), já incluindo taxas de rede e saque. Ativo mantido em custódia própria (carteira digital / autocustódia).\n\n`
                                            : `Saldo de exercícios anteriores. Saldo em 31/12/${year.year}: ${formatQuantity(asset.quantity)} ${asset.coin}. Ativo mantido em custódia própria (carteira digital / autocustódia).\n\n`;
                                        });
                                        
                                        if (smallAssets.length > 0) {
                                          const totalValue = smallAssets.reduce((sum, a) => sum + a.totalCost, 0);
                                          const totalPrevValue = smallAssets.reduce((sum, a) => {
                                            const prev = year.patrimonyStartAssets?.find((p: any) => p.coin === a.coin);
                                            return sum + (prev ? prev.totalCost * prevDecPct : 0);
                                          }, 0);
                                          const coinList = smallAssets.map(a => a.coin).join(', ');
                                          const avgRateSmall = totalValue > 0 ? smallAssets.reduce((s: number, a: any) => s + a.totalCost * (a.averageDollarRate || 0), 0) / totalValue : 0;
                                          fullText += `Outras moedas digitais (consolidadas)\nGrupo 08 – Criptoativos – Código 02\n`;
                                          fullText += `Situação em 31/12/${prevYear}: ${formatCurrency(totalPrevValue)}\n`;
                                          fullText += `Situação em 31/12/${year.year}: ${formatCurrency(totalValue)}\n`;
                                          fullText += `Conjunto de criptoativos classificados como "outras moedas digitais", cada um com custo individual de aquisição inferior a R$ 5.000,00. Adquiridos em corretoras internacionais com recursos próprios e mantidos em custódia própria. Inclui: ${coinList}. Valores convertidos para BRL conforme cotação do dólar (média R$ ${avgRateSmall.toFixed(2).replace(".", ",")}) nas datas de aquisição, já incluindo taxas de rede e saque.\n\n`;
                                        }
                                      }
                                    });
                                    
                                    await Clipboard.setString(fullText);
                                    Alert.alert('? Copiado!', 'Relatório de Bens e Direitos copiado para a área de transferência');
                                  }}
                                >
                                  <Text style={styles.copyButtonText}>📋 Copiar</Text>
                                </TouchableOpacity>
                              </View>
                              {(() => {
                                const prevYear = parseInt(year.year) - 1;
                                
                                // Agrupar ativos por código RF
                                const groupedByCode: Record<string, any[]> = {};
                                declAdjAssets.forEach((asset: any) => {
                                  const code = getCryptoCode(asset.coin);
                                  if (!groupedByCode[code]) {
                                    groupedByCode[code] = [];
                                  }
                                  groupedByCode[code].push(asset);
                                });
                                
                                const renderItems: JSX.Element[] = [];
                                
                                // Processar cada código
                                Object.keys(groupedByCode).sort().forEach((code) => {
                                  const assets = groupedByCode[code];
                                  
                                  // REGRA 1: Bitcoin (08.01) - SEMPRE individual
                                  if (code === '08.01') {
                                    assets.forEach((asset, idx) => {
                                      const prevYearAsset = year.patrimonyStartAssets?.find((p: any) => p.coin === asset.coin);
                                      const prevValue = prevYearAsset ? prevYearAsset.totalCost * prevDecPct : 0;
                                      
                                      renderItems.push(
                                        <View key={`${code}-${idx}`} style={styles.assetItem}>
                                          <Text style={[styles.assetCoin, { color: '#667eea' }]}>
                                            {asset.coin}
                                          </Text>
                                          <Text style={[styles.assetCoin, { color: '#888', fontSize: 12 }]}>
                                            {'Grupo 08 – Criptoativos – Código 01'}
                                          </Text>
                                          <Text style={styles.assetQuantity}>
                                            Situação em 31/12/{prevYear}: {formatCurrency(prevValue)}
                                          </Text>
                                          <Text style={styles.assetCost}>
                                            Situação em 31/12/{year.year}: {formatCurrency(asset.totalCost)}
                                          </Text>
                                          <Text style={styles.declarationReason}>
                                            {(() => {
                                              const boughtInYear = purchases.filter(p => p.coin === asset.coin && new Date(p.date).getFullYear().toString() === year.year).reduce((sum, p) => sum + p.quantity, 0) * decPct;
                                              return boughtInYear > 0
                                                ? `Adquirido no exercício de ${year.year}: ${formatQuantity(boughtInYear)} ${asset.coin}. Saldo acumulado em 31/12/${year.year}: ${formatQuantity(asset.quantity)} ${asset.coin}. Custo de aquisição total em corretora internacional utilizando USDT e recursos próprios. Valores convertidos para BRL conforme cotação do dólar na data de cada aquisição (média R$ ${asset.averageDollarRate.toFixed(2).replace('.', ',')}), já incluindo taxas de rede e saque. Ativo mantido em custódia própria (carteira digital / autocustódia).`
                                                : `Saldo de exercícios anteriores. Saldo em 31/12/${year.year}: ${formatQuantity(asset.quantity)} ${asset.coin}. Ativo mantido em custódia própria (carteira digital / autocustódia).`;
                                            })()}
                                          </Text>
                                        </View>
                                      );
                                    });
                                  }
                                  
                                  // REGRA 2: Stablecoins (08.03) - SEMPRE consolidadas em campo único
                                  else if (code === '08.03') {
                                    const totalValue = assets.reduce((sum, a) => sum + a.totalCost, 0);
                                    const totalPrevValue = assets.reduce((sum, a) => {
                                      const prev = year.patrimonyStartAssets?.find((p: any) => p.coin === a.coin);
                                      return sum + (prev ? prev.totalCost * prevDecPct : 0);
                                    }, 0);
                                    const coinList = assets.map(a => a.coin).join(', ');
                                    
                                    const avgRateStable = totalValue > 0 ? assets.reduce((s: number, a: any) => s + a.totalCost * (a.averageDollarRate || 0), 0) / totalValue : 0;
                                    renderItems.push(
                                      <View key={`${code}-consolidated`} style={styles.assetItem}>
                                        <Text style={[styles.assetCoin, { color: '#667eea' }]}>
                                          {'Stablecoins ('}{coinList}{')'}
                                        </Text>
                                        <Text style={[styles.assetCoin, { color: '#888', fontSize: 12 }]}>
                                          {'Grupo 08 – Criptoativos – Código 03'}
                                        </Text>
                                        <Text style={styles.assetQuantity}>
                                          Situação em 31/12/{prevYear}: {formatCurrency(totalPrevValue)}
                                        </Text>
                                        <Text style={styles.assetCost}>
                                          Situação em 31/12/{year.year}: {formatCurrency(totalValue)}
                                        </Text>
                                        <Text style={styles.declarationReason}>
                                          Conjunto de stablecoins ({coinList}) adquiridas em corretoras internacionais com recursos próprios e mantidas em custódia própria (carteira digital). Custo de aquisição convertido para BRL conforme cotação do dólar (média R$ {avgRateStable.toFixed(2).replace('.', ',')}) nas datas de aquisição, já incluindo taxas de rede e saque.
                                        </Text>
                                      </View>
                                    );
                                  }
                                  
                                  // REGRA 3: Outras moedas digitais (08.02)
                                  // - Se individual >= 5K: campo separado
                                  // - Se individual < 5K: consolidar todas juntas
                                  else if (code === '08.02') {
                                    const bigAssets = assets.filter(a => a.totalCost >= 5000);
                                    const smallAssets = assets.filter(a => a.totalCost < 5000);
                                    
                                    // Mostrar grandes individualmente
                                    bigAssets.forEach((asset, idx) => {
                                      const prevYearAsset = year.patrimonyStartAssets?.find((p: any) => p.coin === asset.coin);
                                      const prevValue = prevYearAsset ? prevYearAsset.totalCost * prevDecPct : 0;
                                      
                                      renderItems.push(
                                        <View key={`${code}-big-${idx}`} style={styles.assetItem}>
                                          <Text style={[styles.assetCoin, { color: '#667eea' }]}>
                                            {asset.coin}
                                          </Text>
                                          <Text style={[styles.assetCoin, { color: '#888', fontSize: 12 }]}>
                                            {'Grupo 08 – Criptoativos – Código 02'}
                                          </Text>
                                          <Text style={styles.assetQuantity}>
                                            Situação em 31/12/{prevYear}: {formatCurrency(prevValue)}
                                          </Text>
                                          <Text style={styles.assetCost}>
                                            Situação em 31/12/{year.year}: {formatCurrency(asset.totalCost)}
                                          </Text>
                                          <Text style={styles.declarationReason}>
                                            {(() => {
                                              const boughtInYear = purchases.filter(p => p.coin === asset.coin && new Date(p.date).getFullYear().toString() === year.year).reduce((sum, p) => sum + p.quantity, 0) * decPct;
                                              return boughtInYear > 0
                                                ? `Adquirido no exercício de ${year.year}: ${formatQuantity(boughtInYear)} ${asset.coin}. Saldo acumulado em 31/12/${year.year}: ${formatQuantity(asset.quantity)} ${asset.coin}. Custo de aquisição total em corretora internacional utilizando USDT e recursos próprios. Valores convertidos para BRL conforme cotação do dólar na data de cada aquisição (média R$ ${asset.averageDollarRate.toFixed(2).replace('.', ',')}), já incluindo taxas de rede e saque. Ativo mantido em custódia própria (carteira digital / autocustódia).`
                                                : `Saldo de exercícios anteriores. Saldo em 31/12/${year.year}: ${formatQuantity(asset.quantity)} ${asset.coin}. Ativo mantido em custódia própria (carteira digital / autocustódia).`;
                                            })()}
                                          </Text>
                                        </View>
                                      );
                                    });
                                    
                                    // Consolidar pequenas
                                    if (smallAssets.length > 0) {
                                      const totalValue = smallAssets.reduce((sum, a) => sum + a.totalCost, 0);
                                      const totalPrevValue = smallAssets.reduce((sum, a) => {
                                        const prev = year.patrimonyStartAssets?.find((p: any) => p.coin === a.coin);
                                        return sum + (prev ? prev.totalCost * prevDecPct : 0);
                                      }, 0);
                                      const coinList = smallAssets.map(a => a.coin).join(', ');
                                      
                                      const avgRateSmall = totalValue > 0 ? smallAssets.reduce((s: number, a: any) => s + a.totalCost * (a.averageDollarRate || 0), 0) / totalValue : 0;
                                      renderItems.push(
                                        <View key={`${code}-small-consolidated`} style={styles.assetItem}>
                                          <Text style={[styles.assetCoin, { color: '#667eea' }]}>
                                            {'Outras moedas digitais (consolidadas)'}
                                          </Text>
                                          <Text style={[styles.assetCoin, { color: '#888', fontSize: 12 }]}>
                                            {'Grupo 08 – Criptoativos – Código 02'}
                                          </Text>
                                          <Text style={styles.assetQuantity}>
                                            Situação em 31/12/{prevYear}: {formatCurrency(totalPrevValue)}
                                          </Text>
                                          <Text style={styles.assetCost}>
                                            Situação em 31/12/{year.year}: {formatCurrency(totalValue)}
                                          </Text>
                                          <Text style={styles.declarationReason}>
                                            Conjunto de criptoativos classificados como "outras moedas digitais", cada um com custo individual de aquisição inferior a R$ 5.000,00. Adquiridos em corretoras internacionais com recursos próprios e mantidos em custódia própria. Inclui: {coinList}. Valores convertidos para BRL conforme cotação do dólar (média R$ {avgRateSmall.toFixed(2).replace(".", ",")}) nas datas de aquisição, já incluindo taxas de rede e saque.
                                          </Text>
                                        </View>
                                      );
                                    }
                                  }
                                });
                                
                                return renderItems;
                              })()}
                            </View>
                          )}
                        </View>
                        
                        {/* Ganhos de Capital */}
                        <View style={styles.detailSection}>
                          <Text style={styles.detailSectionTitle}>💰 Ganhos de Capital</Text>
                          <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>Ganhos:</Text>
                            <Text style={[styles.detailValue, styles.profit]}>
                              {formatCurrency(year.totalProfit)}
                            </Text>
                          </View>
                          <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>Perdas:</Text>
                            <Text style={[styles.detailValue, styles.loss]}>
                              {formatCurrency(year.totalLoss)}
                            </Text>
                          </View>
                          <View style={styles.detailRow}>
                            <Text style={styles.detailLabelBold}>Resultado Bruto:</Text>
                            <Text style={[
                              styles.detailValueBold,
                              year.netResult >= 0 ? styles.profit : styles.loss
                            ]}>
                              {formatCurrency(year.netResult)}
                            </Text>
                          </View>
                        </View>
                        
                        {/* Ganhos de Capital - Formato Receita Federal */}
                        {(() => {
                          const yearSales = sales.filter(s => new Date(s.date).getFullYear().toString() === year.year);
                          if (yearSales.length === 0) return null;
                          const totalTaxPaidYear = yearSales.reduce((sum, s) => sum + (s.taxPaid || 0), 0);
                          return (
                            <View style={styles.detailSection}>
                              <View style={styles.rfHeaderRow}>
                                <Text style={styles.detailSectionTitle}>📋 Operações de Venda — Declaração IR</Text>
                                <TouchableOpacity
                                  style={styles.copyButton}
                                  onPress={async () => {
                                    const exemptSales = yearSales.filter(s => s.isExempt);
                                    const taxableNational = yearSales.filter(s => s.exchangeType === 'nacional' && !s.isExempt);
                                    const international = yearSales.filter(s => s.exchangeType !== 'nacional');
                                    let text = `DECLARAÇÃO IR - VENDAS DE CRIPTOMOEDAS - ANO ${year.year}\n`;
                                    text += '='.repeat(50) + '\n\n';

                                    if (exemptSales.length > 0) {
                                      text += '── RENDIMENTOS ISENTOS (Exchange Nacional — somatório mensal de vendas < R$ 35.000) ──\n';
                                      text += 'Ficha: Rendimentos Isentos e Não Tributáveis → Código 26\n\n';
                                      exemptSales.forEach((s, i) => {
                                        const valueBRL = s.priceSold * s.dollarRate;
                                        const gainBRL = s.profit * s.dollarRate;
                                        const costBRL = (s.priceSold - s.profit) * s.dollarRate;
                                        text += `${i+1}. ${new Date(s.date).toLocaleDateString('pt-BR')} — ${s.coin}\n`;
                                        text += `   Beneficiário: [Seu nome/CPF]\n`;
                                        text += `   Descrição: Ganho de capital na alienação de ${formatQuantity(s.quantity)} ${s.coin} em exchange nacional (corretora regulada no Brasil) em ${new Date(s.date).toLocaleDateString('pt-BR')}. O somatório de todas as alienações de criptoativos realizadas no mês foi inferior a R$ 35.000,00 — condição que garante a isenção do imposto de renda sobre o ganho de capital, nos termos do art. 22, § 1º da Lei 9.250/1995, aplicável a ativos virtuais conforme Lei 14.478/2022 e IN RFB 1.888/2019. Valor recebido: R$ ${valueBRL.toFixed(2).replace('.', ',')}. Custo de aquisição: R$ ${costBRL.toFixed(2).replace('.', ',')}. Lucro: R$ ${gainBRL.toFixed(2).replace('.', ',')}.\n\n`;
                                      });
                                      const totalExemptGain = exemptSales.reduce((sum, s) => sum + (s.profit * s.dollarRate), 0);
                                      text += `   → Valor total a lançar no campo "Valor": R$ ${totalExemptGain.toFixed(2).replace('.', ',')}\n\n`;
                                    }

                                    if (taxableNational.length > 0) {
                                      text += '── GANHOS DE CAPITAL TRIBUTÁVEIS (Exchange Nacional) ──\n';
                                      text += 'Programa GCAP → importar no IRPF\n\n';
                                      taxableNational.forEach((s, i) => {
                                        const valueBRL = s.priceSold * s.dollarRate;
                                        const costBRL = (s.priceSold - s.profit) * s.dollarRate;
                                        const gainBRL = s.profit * s.dollarRate;
                                        text += `${i+1}. ${new Date(s.date).toLocaleDateString('pt-BR')} — ${s.coin}\n`;
                                        text += `   Tipo de bem: Moeda virtual\n`;
                                        text += `   Data alienação: ${new Date(s.date).toLocaleDateString('pt-BR')}\n`;
                                        text += `   Valor de alienação: R$ ${valueBRL.toFixed(2).replace('.', ',')}\n`;
                                        text += `   Custo de aquisição: R$ ${costBRL.toFixed(2).replace('.', ',')}\n`;
                                        text += `   Ganho de capital: R$ ${gainBRL.toFixed(2).replace('.', ',')}\n`;
                                        text += `   Discriminação: Alienação de ${formatQuantity(s.quantity)} ${s.coin} em exchange nacional em ${new Date(s.date).toLocaleDateString('pt-BR')}. Valor de venda: R$ ${valueBRL.toFixed(2).replace('.', ',')}. Custo médio de aquisição: R$ ${costBRL.toFixed(2).replace('.', ',')}.\n`;
                                        if (s.taxPaid && s.taxPaid > 0) text += `   Imposto pago (DARF): R$ ${s.taxPaid.toFixed(2).replace('.', ',')}\n`;
                                        text += '\n';
                                      });
                                    }

                                    if (international.length > 0) {
                                      text += '── GANHOS DE CAPITAL (Exchange Internacional — 15%) ──\n';
                                      text += 'Programa GCAP → importar no IRPF\n\n';
                                      international.forEach((s, i) => {
                                        const valueBRL = s.priceSold * s.dollarRate;
                                        const costBRL = (s.priceSold - s.profit) * s.dollarRate;
                                        const gainBRL = s.profit * s.dollarRate;
                                        text += `${i+1}. ${new Date(s.date).toLocaleDateString('pt-BR')} — ${s.coin}\n`;
                                        text += `   Tipo de bem: Moeda virtual\n`;
                                        text += `   Data alienação: ${new Date(s.date).toLocaleDateString('pt-BR')}\n`;
                                        text += `   Valor de alienação: R$ ${valueBRL.toFixed(2).replace('.', ',')}\n`;
                                        text += `   Custo de aquisição: R$ ${costBRL.toFixed(2).replace('.', ',')}\n`;
                                        text += `   Ganho de capital: R$ ${gainBRL.toFixed(2).replace('.', ',')}\n`;
                                        text += `   Discriminação: Alienação de ${formatQuantity(s.quantity)} ${s.coin} em exchange internacional em ${new Date(s.date).toLocaleDateString('pt-BR')}. Cotação USD/BRL utilizada: R$ ${s.dollarRate.toFixed(2).replace('.', ',')}. Valor recebido: R$ ${valueBRL.toFixed(2).replace('.', ',')}. Custo médio: R$ ${costBRL.toFixed(2).replace('.', ',')}.\n`;
                                        if (s.taxPaid && s.taxPaid > 0) text += `   Imposto pago (DARF): R$ ${s.taxPaid.toFixed(2).replace('.', ',')}\n`;
                                        text += '\n';
                                      });
                                    }

                                    if (totalTaxPaidYear > 0) {
                                      text += `Total de DARF pago no ano: R$ ${totalTaxPaidYear.toFixed(2).replace('.', ',')}\n`;
                                    }
                                    await Clipboard.setString(text);
                                    Alert.alert('✅ Copiado!', 'Relatório de vendas copiado — inclui Isentos, GCAP Nacional e GCAP Internacional.');
                                  }}
                                >
                                  <Text style={styles.copyButtonText}>📋 Copiar</Text>
                                </TouchableOpacity>
                              </View>

                              {/* Grupo: Isentos (Nacional < 35k) */}
                              {(() => {
                                const exemptSales = yearSales.filter(s => s.isExempt);
                                if (exemptSales.length === 0) return null;
                                const totalExemptGain = exemptSales.reduce((sum, s) => sum + (s.profit * s.dollarRate), 0);
                                return (
                                  <View style={styles.irSaleGroup}>
                                    <View style={styles.irSaleGroupHeader}>
                                      <Text style={styles.irSaleGroupLabel}>🟢 RENDIMENTOS ISENTOS</Text>
                                      <Text style={styles.irSaleGroupSub}>Ficha: Rendimentos Isentos → Código 26</Text>
                                    </View>
                                    {exemptSales.map((s, idx) => {
                                      const valueBRL = s.priceSold * s.dollarRate;
                                      const costBRL = (s.priceSold - s.profit) * s.dollarRate;
                                      const gainBRL = s.profit * s.dollarRate;
                                      return (
                                        <View key={idx} style={[styles.assetItem, { borderLeftWidth: 3, borderLeftColor: '#34C759' }]}>
                                          <Text style={[styles.assetCoin, { color: '#1C1C1E' }]}>
                                            {new Date(s.date).toLocaleDateString('pt-BR')} — {s.coin}  ✅ Isento
                                          </Text>
                                          <Text style={styles.assetQuantity}>🇧🇷 Nacional · Qtd: {formatQuantity(s.quantity)}</Text>
                                          <Text style={styles.assetCost}>Valor recebido: R$ {valueBRL.toFixed(2)}</Text>
                                          <Text style={styles.assetCost}>Custo de aquisição: R$ {costBRL.toFixed(2)}</Text>
                                          <Text style={[styles.assetTotal, { color: '#34C759' }]}>Ganho: R$ {gainBRL.toFixed(2)}</Text>
                                          <View style={styles.irInstructionBox}>
                                            <Text style={styles.irInstructionTitle}>📝 Como lançar no IRPF:</Text>
                                            <Text style={styles.irInstructionText}>Ficha: Rendimentos Isentos e Não Tributáveis</Text>
                                            <Text style={styles.irInstructionText}>Código: 26 — Outros</Text>
                                            <Text style={styles.irInstructionText}>Valor: R$ {gainBRL.toFixed(2).replace('.', ',')}</Text>
                                            <Text style={styles.irInstructionText}>Descrição: Ganho de capital na alienação de {formatQuantity(s.quantity)} {s.coin} em exchange nacional (corretora regulada no Brasil) em {new Date(s.date).toLocaleDateString('pt-BR')}. Somatório de todas as alienações de criptoativos no mês inferior a R$ 35.000,00 — isento nos termos do art. 22, § 1º da Lei 9.250/1995, aplicável a ativos virtuais conforme Lei 14.478/2022 e IN RFB 1.888/2019.</Text>
                                          </View>
                                        </View>
                                      );
                                    })}
                                    <View style={[styles.detailRow, { marginTop: 8 }]}>
                                      <Text style={styles.detailLabelBold}>Total isentos a lançar:</Text>
                                      <Text style={[styles.detailValueBold, { color: '#34C759' }]}>R$ {totalExemptGain.toFixed(2)}</Text>
                                    </View>
                                  </View>
                                );
                              })()}

                              {/* Grupo: Tributáveis Nacional (GCAP) */}
                              {(() => {
                                const taxableNat = yearSales.filter(s => s.exchangeType === 'nacional' && !s.isExempt);
                                if (taxableNat.length === 0) return null;
                                const totalTaxNat = taxableNat.reduce((sum, s) => sum + (s.taxPaid || 0), 0);
                                return (
                                  <View style={styles.irSaleGroup}>
                                    <View style={[styles.irSaleGroupHeader, { backgroundColor: '#FFF3E0' }]}>
                                      <Text style={[styles.irSaleGroupLabel, { color: '#E65100' }]}>🟠 GANHOS DE CAPITAL — NACIONAL (GCAP)</Text>
                                      <Text style={styles.irSaleGroupSub}>Programa GCAP → importar no IRPF</Text>
                                    </View>
                                    {taxableNat.map((s, idx) => {
                                      const valueBRL = s.priceSold * s.dollarRate;
                                      const costBRL = (s.priceSold - s.profit) * s.dollarRate;
                                      const gainBRL = s.profit * s.dollarRate;
                                      return (
                                        <View key={idx} style={[styles.assetItem, { borderLeftWidth: 3, borderLeftColor: '#FF9800' }]}>
                                          <Text style={[styles.assetCoin, { color: '#1C1C1E' }]}>
                                            {new Date(s.date).toLocaleDateString('pt-BR')} — {s.coin}
                                          </Text>
                                          <Text style={styles.assetQuantity}>🇧🇷 Nacional · Qtd: {formatQuantity(s.quantity)}</Text>
                                          <Text style={styles.assetCost}>Valor de alienação: R$ {valueBRL.toFixed(2)}</Text>
                                          <Text style={styles.assetCost}>Custo de aquisição: R$ {costBRL.toFixed(2)}</Text>
                                          <Text style={[styles.assetTotal, { color: gainBRL >= 0 ? '#FF9800' : '#FF3B30' }]}>
                                            {gainBRL >= 0 ? 'Ganho' : 'Perda'}: R$ {Math.abs(gainBRL).toFixed(2)}
                                          </Text>
                                          {s.taxPaid !== undefined && s.taxPaid > 0 && (
                                            <Text style={[styles.assetTotal, { color: '#667eea' }]}>DARF pago: R$ {s.taxPaid.toFixed(2)}</Text>
                                          )}
                                          <View style={styles.irInstructionBox}>
                                            <Text style={styles.irInstructionTitle}>📝 Campos no GCAP:</Text>
                                            <Text style={styles.irInstructionText}>Tipo de bem: Moeda virtual</Text>
                                            <Text style={styles.irInstructionText}>Data de alienação: {new Date(s.date).toLocaleDateString('pt-BR')}</Text>
                                            <Text style={styles.irInstructionText}>Valor de alienação: R$ {valueBRL.toFixed(2).replace('.', ',')}</Text>
                                            <Text style={styles.irInstructionText}>Custo de aquisição: R$ {costBRL.toFixed(2).replace('.', ',')}</Text>
                                            <Text style={styles.irInstructionText}>Discriminação: Alienação de {formatQuantity(s.quantity)} {s.coin} em exchange nacional em {new Date(s.date).toLocaleDateString('pt-BR')}. Valor recebido: R$ {valueBRL.toFixed(2).replace('.', ',')}. Custo médio: R$ {costBRL.toFixed(2).replace('.', ',')}.</Text>
                                          </View>
                                        </View>
                                      );
                                    })}
                                    {totalTaxNat > 0 && (
                                      <View style={[styles.detailRow, { marginTop: 8 }]}>
                                        <Text style={styles.detailLabelBold}>Total DARF pago (nacional):</Text>
                                        <Text style={[styles.detailValueBold, { color: '#667eea' }]}>R$ {totalTaxNat.toFixed(2)}</Text>
                                      </View>
                                    )}
                                  </View>
                                );
                              })()}

                              {/* Grupo: Internacional */}
                              {(() => {
                                const intlSales = yearSales.filter(s => s.exchangeType !== 'nacional');
                                if (intlSales.length === 0) return null;
                                const totalTaxIntl = intlSales.reduce((sum, s) => sum + (s.taxPaid || 0), 0);
                                return (
                                  <View style={styles.irSaleGroup}>
                                    <View style={[styles.irSaleGroupHeader, { backgroundColor: '#EDE7F6' }]}>
                                      <Text style={[styles.irSaleGroupLabel, { color: '#4527A0' }]}>🟣 GANHOS DE CAPITAL — INTERNACIONAL (GCAP 15%)</Text>
                                      <Text style={styles.irSaleGroupSub}>Programa GCAP → importar no IRPF</Text>
                                    </View>
                                    {intlSales.map((s, idx) => {
                                      const valueBRL = s.priceSold * s.dollarRate;
                                      const costBRL = (s.priceSold - s.profit) * s.dollarRate;
                                      const gainBRL = s.profit * s.dollarRate;
                                      return (
                                        <View key={idx} style={[styles.assetItem, { borderLeftWidth: 3, borderLeftColor: '#667eea' }]}>
                                          <Text style={[styles.assetCoin, { color: '#1C1C1E' }]}>
                                            {new Date(s.date).toLocaleDateString('pt-BR')} — {s.coin}
                                          </Text>
                                          <Text style={styles.assetQuantity}>🌐 Internacional · Qtd: {formatQuantity(s.quantity)}</Text>
                                          <Text style={styles.assetCost}>Valor de alienação: R$ {valueBRL.toFixed(2)}</Text>
                                          <Text style={styles.assetCost}>Custo de aquisição: R$ {costBRL.toFixed(2)}</Text>
                                          <Text style={[styles.assetTotal, { color: gainBRL >= 0 ? '#667eea' : '#FF3B30' }]}>
                                            {gainBRL >= 0 ? 'Ganho' : 'Perda'}: R$ {Math.abs(gainBRL).toFixed(2)}
                                          </Text>
                                          {s.taxPaid !== undefined && s.taxPaid > 0 && (
                                            <Text style={[styles.assetTotal, { color: '#667eea' }]}>DARF pago: R$ {s.taxPaid.toFixed(2)}</Text>
                                          )}
                                          <View style={styles.irInstructionBox}>
                                            <Text style={styles.irInstructionTitle}>📝 Campos no GCAP:</Text>
                                            <Text style={styles.irInstructionText}>Tipo de bem: Moeda virtual</Text>
                                            <Text style={styles.irInstructionText}>Data de alienação: {new Date(s.date).toLocaleDateString('pt-BR')}</Text>
                                            <Text style={styles.irInstructionText}>Valor de alienação: R$ {valueBRL.toFixed(2).replace('.', ',')}</Text>
                                            <Text style={styles.irInstructionText}>Custo de aquisição: R$ {costBRL.toFixed(2).replace('.', ',')}</Text>
                                            <Text style={styles.irInstructionText}>Discriminação: Alienação de {formatQuantity(s.quantity)} {s.coin} em exchange internacional em {new Date(s.date).toLocaleDateString('pt-BR')}. Cotação USD/BRL: R$ {s.dollarRate.toFixed(2).replace('.', ',')}. Valor recebido: R$ {valueBRL.toFixed(2).replace('.', ',')}. Custo médio: R$ {costBRL.toFixed(2).replace('.', ',')}.</Text>
                                          </View>
                                        </View>
                                      );
                                    })}
                                    {totalTaxIntl > 0 && (
                                      <View style={[styles.detailRow, { marginTop: 8 }]}>
                                        <Text style={styles.detailLabelBold}>Total DARF pago (internacional):</Text>
                                        <Text style={[styles.detailValueBold, { color: '#667eea' }]}>R$ {totalTaxIntl.toFixed(2)}</Text>
                                      </View>
                                    )}
                                  </View>
                                );
                              })()}

                              {totalTaxPaidYear > 0 && (
                                <View style={styles.detailRow}>
                                  <Text style={styles.detailLabelBold}>Total DARF pago no ano:</Text>
                                  <Text style={[styles.detailValueBold, { color: '#667eea' }]}>
                                    R$ {totalTaxPaidYear.toFixed(2)}
                                  </Text>
                                </View>
                              )}
                            </View>
                          );
                        })()}

                        {/* Compensação de Prejuízos */}
                        {hadCompensation && (
                          <View style={[styles.detailSection, styles.compensationSection]}>
                            <Text style={styles.detailSectionTitle}>⚖️ Compensação de Prejuízos</Text>
                            <View style={styles.detailRow}>
                              <Text style={styles.detailLabel}>Prejuízos de anos anteriores:</Text>
                              <Text style={[styles.detailValue, styles.loss]}>
                                {formatCurrency(year.accumulatedLoss)}
                              </Text>
                            </View>
                            <View style={styles.detailRow}>
                              <Text style={styles.detailLabelBold}>Resultado após compensação:</Text>
                              <Text style={[
                                styles.detailValueBold,
                                year.netResultWithCompensation >= 0 ? styles.profit : styles.loss
                              ]}>
                                {formatCurrency(year.netResultWithCompensation)}
                              </Text>
                            </View>
                          </View>
                        )}
                        
                        {/* Imposto */}
                        <View style={[styles.detailSection, styles.taxSection]}>
                          <Text style={styles.detailSectionTitle}>💰 Imposto sobre Ganhos de Capital</Text>
                          <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>Base de cálculo (15%):</Text>
                            <Text style={styles.detailValue}>
                              {formatCurrency(Math.max(0, year.netResultWithCompensation))}
                            </Text>
                          </View>
                          <View style={styles.detailRow}>
                            <Text style={styles.detailLabelBold}>Imposto Devido:</Text>
                            <Text style={styles.taxDueBig}>
                              {formatCurrency(year.taxDue)}
                            </Text>
                          </View>
                        </View>
                        
                        {/* Prejuízo a Compensar */}
                        {year.lossToCarry > 0 && (
                          <View style={[styles.detailSection, styles.lossCarrySection]}>
                            <Text style={styles.detailSectionTitle}>📉 Prejuízo para Anos Futuros</Text>
                            <Text style={styles.lossCarryText}>
                              Este prejuízo pode ser usado para compensar ganhos em anos futuros (sem prazo limite):
                            </Text>
                            <Text style={styles.lossCarryAmount}>
                              {formatCurrency(year.lossToCarry)}
                            </Text>
                          </View>
                        )}
                        
                        {/* Declaração */}
                        {year.needsDeclaration && (
                          <View style={[styles.detailSection, styles.declarationSection]}>
                            <Text style={styles.detailSectionTitle}>? Declaração Obrigatória</Text>
                            {year.patrimonyEnd > 5000 && (
                              <Text style={styles.declarationReason}>
                                • Patrimônio em 31/12 superior a R$ 5.000
                              </Text>
                            )}
                            {year.months.length > 0 && (
                              <Text style={styles.declarationReason}>
                                • Houve {year.months.length} operação(ões) no ano
                              </Text>
                            )}
                          </View>
                        )}
                        
                        {/* Detalhamento Mensal */}
                        {year.months && year.months.length > 0 && (
                          <View style={styles.detailSection}>
                            <Text style={styles.detailSectionTitle}>📆 Detalhamento Mensal</Text>
                            {year.months.map((month: any, idx: number) => {
                              const monthName = new Date(parseInt(month.year), parseInt(month.month) - 1)
                                .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
                              
                              return (
                                <View key={idx} style={styles.monthDetailCard}>
                                  <Text style={styles.monthDetailName}>{monthName}</Text>
                                  <View style={styles.monthDetailRow}>
                                    <Text style={styles.monthDetailLabel}>Vendas:</Text>
                                    <Text style={styles.monthDetailValue}>{formatCurrency(month.sales)}</Text>
                                  </View>
                                  <View style={styles.monthDetailRow}>
                                    <Text style={styles.monthDetailLabel}>Custo:</Text>
                                    <Text style={styles.monthDetailValue}>{formatCurrency(month.cost)}</Text>
                                  </View>
                                  <View style={styles.monthDetailRow}>
                                    <Text style={styles.monthDetailLabel}>Resultado:</Text>
                                    <Text style={[
                                      styles.monthDetailValue,
                                      month.profit >= 0 ? styles.profit : styles.loss
                                    ]}>
                                      {formatCurrency(month.profit)}
                                    </Text>
                                  </View>
                                </View>
                              );
                            })}
                          </View>
                        )}

                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          )}

          {/* VISUALIZAÇÃO POR MÊS (ORIGINAL) */}
          {taxViewMode === 'months' && (
            <View>
              {taxData.netProfit > 0 && (
                <View style={styles.taxCardOrange}>
                  <Text style={styles.taxCardTitle}>📊 Resultado Anual</Text>
                  <Text style={styles.taxCardText}>
                    Lucro: {formatCurrency(taxData.yearlyProfit)}{"\n"}
                    Prejuízo: {formatCurrency(taxData.yearlyLoss)}{"\n"}
                    Lucro Líquido: {formatCurrency(taxData.netProfit)}{"\n"}
                    {"\n"}
                    <Text style={{ fontWeight: 'bold', fontSize: 16 }}>
                      Imposto Total: {formatCurrency(taxData.compensatedTax)}
                    </Text>
                  </Text>
                </View>
              )}

              {allClear ? (
                <View style={styles.taxCardGreen}>
                  <Text style={styles.taxCardTitle}>? Tudo em ordem!</Text>
                  <Text style={styles.taxCardText}>
                    Você não possui DARFs pendentes no momento.
                  </Text>
                  {!taxData.needsDeclaration && (
                    <Text style={styles.taxCardText}>
                      Seu patrimônio está abaixo de R$ 5.000 e você não realizou vendas, portanto não é necessário declarar.
                    </Text>
                  )}
                  {taxData.needsDeclaration && !isDeclarationPeriod && (
                    <Text style={styles.taxCardText}>
                      Você precisará declarar na próxima temporada (jan-abr).
                    </Text>
                  )}
                </View>
              ) : (
                <View>
                  {taxData.pendingDARFs.length > 0 && (
                    <View style={styles.taxCardRed}>
                      <Text style={styles.taxCardTitle}>⚠️ DARFs Pendentes</Text>
                      <Text style={styles.taxCardText}>
                        Você possui {taxData.pendingDARFs.length} DARF(s) a pagar:
                      </Text>
                      {taxData.pendingDARFs.map((month, index) => {
                        const [year, monthNum] = month.monthKey.split('-');
                        const monthName = new Date(parseInt(year), parseInt(monthNum) - 1)
                          .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
                        
                        return (
                          <View key={index} style={styles.darfItem}>
                            <Text style={styles.darfMonth}>📅 {monthName}</Text>
                            <Text style={styles.darfAmount}>Imposto: {formatCurrency(month.taxDue)}</Text>
                            <Text style={styles.darfDue}>
                              Vencimento: {new Date(month.dueDate).toLocaleDateString('pt-BR')}
                            </Text>
                            <Text style={styles.darfProfit}>
                              Lucro: {formatCurrency(month.totalProfit)} | Vendas: {formatCurrency(month.totalSales)}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  )}

                  {taxData.needsDeclaration && isDeclarationPeriod && (
                    <View style={styles.taxCardYellow}>
                      <Text style={styles.taxCardTitle}>📅 Período de Declaração</Text>
                      <Text style={styles.taxCardText}>
                        Estamos no período de declaração do IR (janeiro a abril).
                      </Text>
                      <Text style={styles.taxCardText}>
                        Seu patrimônio em 31/12: {formatCurrency(taxData.totalPatrimony)}
                      </Text>
                      {taxData.totalPatrimony > 5000 && (
                        <Text style={styles.taxCardText}>
                          ⚠️ Obrigatório declarar (patrimônio {'>'} R$ 5.000)
                        </Text>
                      )}
                      {sales.length > 0 && (
                        <Text style={styles.taxCardText}>
                          ⚠️ Obrigatório declarar (houve vendas no ano)
                        </Text>
                      )}
                    </View>
                  )}
                </View>
              )}

              {taxData.taxMonths.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>📊 Vendas Mensais</Text>
                  {taxData.taxMonths.map((month, index) => {
                    const monthName = new Date(parseInt(month.year), parseInt(month.month) - 1)
                      .toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
                    
                    return (
                      <View key={index} style={month.isTaxable ? styles.taxMonthCardTaxable : styles.taxMonthCard}>
                        <Text style={styles.taxMonthTitle}>{monthName}</Text>
                        <View style={styles.taxMonthDetails}>
                          <Text style={styles.taxMonthLabel}>Vendas:</Text>
                          <Text style={styles.taxMonthValue}>{formatCurrency(month.sales)}</Text>
                        </View>
                        <View style={styles.taxMonthDetails}>
                          <Text style={styles.taxMonthLabel}>Custo:</Text>
                          <Text style={styles.taxMonthValue}>{formatCurrency(month.cost)}</Text>
                        </View>
                        <View style={styles.taxMonthDetails}>
                          <Text style={styles.taxMonthLabel}>Lucro:</Text>
                          <Text style={[styles.taxMonthValue, month.profit > 0 ? styles.profitPositive : styles.profitNegative]}>
                            {formatCurrency(month.profit)}
                          </Text>
                        </View>
                        {month.profit > 0 ? (
                          <View style={styles.taxDueContainer}>
                            <Text style={styles.taxDueLabel}>💼 Imposto devido (15%):</Text>
                            <Text style={styles.taxDueAmount}>{formatCurrency(month.taxDue)}</Text>
                            <Text style={styles.taxDueDate}>
                              Venc: {month.dueDate}
                            </Text>
                          </View>
                        ) : month.profit < 0 ? (
                          <Text style={styles.taxExempt}>📉 Prejuízo pode compensar lucros no ano</Text>
                        ) : (
                          <Text style={styles.taxExempt}>✓ Sem lucro ou prejuízo</Text>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}

              {taxData.patrimonyAssets.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>🏠 Bens e Direitos (31/12)</Text>
                  <View style={styles.patrimonyCard}>
                    <Text style={styles.patrimonyTotal}>
                      Total: {formatCurrency(taxData.totalPatrimony)}
                    </Text>
                    {taxData.patrimonyAssets.map((asset, index) => (
                      <View key={index} style={styles.patrimonyItem}>
                        <Text style={styles.patrimonyCode}>Código 81 - Criptoativo</Text>
                        <Text style={styles.patrimonyCoin}>{asset.coin}</Text>
                        <Text style={styles.patrimonyQuantity}>
                          Quantidade: {formatQuantity(asset.quantity)}
                        </Text>
                        <Text style={styles.patrimonyCost}>
                          Custo médio: {formatAveragePrice(asset.averageCost)}
                        </Text>
                        <Text style={styles.patrimonyValue}>
                          Valor: {formatCurrency(asset.totalCost)}
                        </Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>
          )}

          {/* Exportar Relatório */}
          {(taxData.fiscalYears?.length > 0 || taxData.taxMonths.length > 0 || taxData.patrimonyAssets.length > 0) && (
            <View style={styles.exportSection}>
              <Text style={styles.exportTitle}>📤 Exportar Relatório</Text>
              <TouchableOpacity style={styles.exportButton} onPress={shareReport}>
                <Text style={styles.exportButtonText}>📤 Compartilhar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.exportButton} onPress={copyReport}>
                <Text style={styles.exportButtonText}>📋 Copiar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.exportButton} onPress={exportRFReportToPDF}>
                <Text style={styles.exportButtonText}>📄 Exportar PDF</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Ferramentas */}
          <View style={styles.exportSection}>
            <Text style={styles.exportTitle}>🛠️ Ferramentas</Text>
            <TouchableOpacity 
              style={styles.exportButton} 
              onPress={() => setShowTaxCalculator(true)}
            >
              <Text style={styles.exportButtonText}>🧮 Calculadora de Imposto</Text>
            </TouchableOpacity>
            
            <View style={styles.darkModeToggle}>
              <Text style={styles.darkModeText}>🌙 Modo Escuro</Text>
              <Switch
                value={isDarkMode}
                onValueChange={setIsDarkMode}
                trackColor={{ false: '#E8EAED', true: '#3498db' }}
                thumbColor={isDarkMode ? '#fff' : '#f4f3f4'}
              />
            </View>
          </View>

          <View style={styles.taxInfo}>
            <Text style={styles.taxInfoTitle}>📊 Informações Importantes</Text>
            <Text style={styles.taxInfoText}>
              • Exchanges Internacionais: 15% sobre QUALQUER ganho
            </Text>
            <Text style={styles.taxInfoText}>
              • Prejuízos podem ser compensados indefinidamente
            </Text>
            <Text style={styles.taxInfoText}>
            </Text>
            <Text style={styles.taxInfoText}>
              • Acima desse valor: 15% sobre o lucro
            </Text>
            <Text style={styles.taxInfoText}>
              • DARF vence no último dia do mês seguinte à venda
            </Text>
            <Text style={styles.taxInfoText}>
              • Declaração obrigatória se patrimônio {'>'} R$ 5.000 em 31/12
            </Text>
            <Text style={styles.taxInfoText}>
              • Mesmo com patrimônio baixo, declarar se houve vendas
            </Text>
            <Text style={styles.taxInfoText}>
              • Código IR: 81 - Criptoativo
            </Text>
          </View>
        </ScrollView>

        {renderTabBar()}
      </SafeAreaView>
    );
  }

  // HISTORY
  const filteredPurchases = applyFilters(purchases);
  const filteredSales = applySalesFilters(sales);
  const sortedPurchases = [...filteredPurchases].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  const sortedSales = [...filteredSales].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );
  const uniqueCoins = getUniqueCoins();
  const purchaseSummary = calculateFilteredSummary(filteredPurchases);
  const salesSummary = calculateFilteredSalesSummary(filteredSales);
  const hasActiveFilters = filterCoin || filterStartDate || filterEndDate || transactionType !== 'all';

  return (
    <SafeAreaView style={styles.container}>
      {screen === 'more' ? (
        <>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>⚙️ Mais</Text>
          </View>
          <ScrollView style={styles.content}>
            <TouchableOpacity style={styles.moreCard} onPress={() => setScreen('retire')} activeOpacity={0.85}>
              <Text style={styles.moreCardIcon}>🎯</Text>
              <View style={styles.moreCardText}>
                <Text style={styles.moreCardTitle}>Simulador de Aposentadoria</Text>
                <Text style={styles.moreCardDesc}>Projete seu patrimônio em Bitcoin</Text>
              </View>
              <Text style={styles.moreCardChevron}>›</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.moreCard} onPress={() => setScreen('taxes')} activeOpacity={0.85}>
              <Text style={styles.moreCardIcon}>💼</Text>
              <View style={styles.moreCardText}>
                <Text style={styles.moreCardTitle}>Impostos</Text>
                <Text style={styles.moreCardDesc}>Declaração IR, Bens e Direitos, GCAP</Text>
              </View>
              <Text style={styles.moreCardChevron}>›</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.moreCard} onPress={() => setShowTaxCalculator(true)} activeOpacity={0.85}>
              <Text style={styles.moreCardIcon}>🧮</Text>
              <View style={styles.moreCardText}>
                <Text style={styles.moreCardTitle}>Calculadora de Imposto</Text>
                <Text style={styles.moreCardDesc}>Simule o imposto antes de vender</Text>
              </View>
              <Text style={styles.moreCardChevron}>›</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.moreCard} onPress={openBackupMenu} activeOpacity={0.85}>
              <Text style={styles.moreCardIcon}>💾</Text>
              <View style={styles.moreCardText}>
                <Text style={styles.moreCardTitle}>Backup / Restaurar</Text>
                <Text style={styles.moreCardDesc}>Salve ou recupere todos os seus dados</Text>
              </View>
              <Text style={styles.moreCardChevron}>›</Text>
            </TouchableOpacity>
            <View style={styles.homeFooter}>
              <Text style={styles.footerText}>
                ⚡ Desenvolvido por <Text style={styles.footerName}>@Alexred</Text>
              </Text>
            </View>
          </ScrollView>
        </>
      ) : (
        <>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Histórico</Text>
            <Text style={styles.subtitle}>
              {transactionType === 'purchases' ? `${filteredPurchases.length} de ${purchases.length} compra(s)` :
               transactionType === 'sales' ? `${filteredSales.length} de ${sales.length} venda(s)` :
               `${filteredPurchases.length} compra(s) | ${filteredSales.length} venda(s)`}
            </Text>
          </View>

          {/* Filtros */}
          <View style={styles.filterContainer}>
        <Text style={styles.filterTitle}>🔍 Filtros</Text>
        
        <View style={styles.filterRow}>
          <View style={styles.filterItem}>
            <Text style={styles.filterLabel}>Tipo:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.coinFilterScroll}>
              <TouchableOpacity
                style={[styles.coinFilterButton, transactionType === 'all' && styles.coinFilterButtonActive]}
                onPress={() => setTransactionType('all')}
              >
                <Text style={[styles.coinFilterText, transactionType === 'all' && styles.coinFilterTextActive]}>Todas</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.coinFilterButton, transactionType === 'purchases' && styles.coinFilterButtonActive]}
                onPress={() => setTransactionType('purchases')}
              >
                <Text style={[styles.coinFilterText, transactionType === 'purchases' && styles.coinFilterTextActive]}>Compras</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.coinFilterButton, transactionType === 'sales' && styles.coinFilterButtonActive]}
                onPress={() => setTransactionType('sales')}
              >
                <Text style={[styles.coinFilterText, transactionType === 'sales' && styles.coinFilterTextActive]}>Vendas</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
        
        <View style={styles.filterRow}>
          <View style={styles.filterItem}>
            <Text style={styles.filterLabel}>Moeda:</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.coinFilterScroll}>
              <TouchableOpacity
                style={[styles.coinFilterButton, !filterCoin && styles.coinFilterButtonActive]}
                onPress={() => setFilterCoin('')}
              >
                <Text style={[styles.coinFilterText, !filterCoin && styles.coinFilterTextActive]}>Todas</Text>
              </TouchableOpacity>
              {uniqueCoins.map(coin => (
                <TouchableOpacity
                  key={coin}
                  style={[styles.coinFilterButton, filterCoin === coin && styles.coinFilterButtonActive]}
                  onPress={() => setFilterCoin(coin)}
                >
                  <Text style={[styles.coinFilterText, filterCoin === coin && styles.coinFilterTextActive]}>{coin}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>

        <View style={styles.filterRow}>
          <View style={[styles.filterItem, { flex: 1 }]}>
            <Text style={styles.filterLabel}>Data Inicial:</Text>
            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => {
                if (filterStartDate) {
                  setTempStartDate(new Date(filterStartDate));
                } else {
                  setTempStartDate(new Date());
                }
                setShowStartDatePicker(true);
              }}
            >
              <Text style={styles.dateButtonText}>
                {filterStartDate ? formatDate(filterStartDate) : '📅 Selecionar'}
              </Text>
            </TouchableOpacity>
          </View>
          <View style={[styles.filterItem, { flex: 1, marginLeft: 10 }]}>
            <Text style={styles.filterLabel}>Data Final:</Text>
            <TouchableOpacity
              style={styles.dateButton}
              onPress={() => {
                if (filterEndDate) {
                  setTempEndDate(new Date(filterEndDate));
                } else {
                  setTempEndDate(new Date());
                }
                setShowEndDatePicker(true);
              }}
            >
              <Text style={styles.dateButtonText}>
                {filterEndDate ? formatDate(filterEndDate) : '📅 Selecionar'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {(filterCoin || filterStartDate || filterEndDate) && (
          <View style={styles.filterActionsContainer}>
            <TouchableOpacity style={styles.clearFilterButton} onPress={clearFilters}>
              <Text style={styles.clearFilterText}>🗑️ Limpar Filtros</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.exportButton} onPress={exportToExcel}>
              <Text style={styles.exportButtonText}>📊 Exportar Excel</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <ScrollView style={styles.list} keyboardShouldPersistTaps="handled" nestedScrollEnabled={true}>
        {/* Resumo do Período Filtrado */}
        {hasActiveFilters && (
          <View style={styles.summaryContainer}>
            <Text style={styles.summaryTitle}>📊 Resumo do Período</Text>
          
            {/* Resumo de Compras */}
            {(transactionType === 'all' || transactionType === 'purchases') && purchaseSummary.length > 0 && (
              <View>
                <Text style={styles.summarySubtitle}>📊 Compras</Text>
                {purchaseSummary.map((item) => (
                  <View key={`purchase-${item.coin}`} style={styles.summaryCard}>
                    <View style={styles.summaryHeader}>
                      <Text style={styles.summaryCoinName}>{item.coin}</Text>
                      <Text style={styles.summaryCount}>{item.count} compra(s)</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Quantidade:</Text>
                      <Text style={styles.summaryValue}>{formatQuantity(item.totalQuantity)}</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Preço Médio:</Text>
                      <Text style={styles.summaryValueHighlight}>{formatCurrency(item.averagePrice)}</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Investido:</Text>
                      <Text style={styles.summaryValue}>{formatCurrency(item.totalInvested)}</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          
            {/* Resumo de Vendas */}
            {(transactionType === 'all' || transactionType === 'sales') && salesSummary.length > 0 && (
              <View>
                <Text style={styles.summarySubtitle}>📊 Vendas</Text>
                {salesSummary.map((item) => (
                  <View key={`sale-${item.coin}`} style={[styles.summaryCard, styles.salesSummaryCard]}>
                    <View style={styles.summaryHeader}>
                      <Text style={styles.summaryCoinName}>{item.coin}</Text>
                      <Text style={styles.summaryCount}>{item.count} venda(s)</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Quantidade:</Text>
                      <Text style={styles.summaryValue}>{formatQuantity(item.totalSold)}</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Preço Médio:</Text>
                      <Text style={styles.summaryValueHighlight}>{formatCurrency(item.averageSalePrice)}</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>Receita:</Text>
                      <Text style={styles.summaryValue}>{formatCurrency(item.revenue)}</Text>
                    </View>
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>{item.totalProfit >= 0 ? 'Lucro:' : 'Prejuízo:'}</Text>
                      <Text style={[styles.summaryValueHighlight, item.totalProfit >= 0 ? styles.profit : styles.loss]}>
                        {formatCurrency(Math.abs(item.totalProfit))}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {/* Compras */}
        {(transactionType === 'all' || transactionType === 'purchases') && (
          <View>
            {sortedPurchases.length > 0 && transactionType === 'all' && (
              <Text style={styles.transactionTypeHeader}>🛒 COMPRAS</Text>
            )}
            {sortedPurchases.map((item) => (
              <View key={`purchase-${item.id}`} style={[styles.card, item.conversionId ? styles.conversionCard : undefined]}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderLeft}>
                    <Text style={styles.transactionType}>{item.conversionId ? '🔄 CONVERSÃO' : '🛒 COMPRA'}</Text>
                    <Text style={styles.coinName}>{item.coin}</Text>
                  </View>
                  <View style={{alignItems: 'flex-end'}}>
                    <Text style={styles.date}>{formatDate(item.date)}</Text>
                    {item.attachment && (
                      <Text style={styles.attachmentBadge}>📎</Text>
                    )}
                  </View>
                </View>
                <View style={styles.row}>
                  <Text style={styles.label}>Quantidade:</Text>
                  <Text style={styles.value}>{formatQuantity(item.quantity)}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.label}>Valor Pago:</Text>
                  <Text style={styles.value}>{formatCurrency(item.pricePaid)}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.label}>Preço Unitário:</Text>
                  <Text style={styles.value}>{formatPrice(item.pricePerUnit)}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.label}>Cotação Dólar:</Text>
                  <Text style={styles.value}>R$ {item.dollarRate.toFixed(2)}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.label}>Custo em Reais:</Text>
                  <Text style={styles.value}>R$ {(item.pricePaid * item.dollarRate).toFixed(2)}</Text>
                </View>
                
                {item.attachment && (
                  <TouchableOpacity 
                    style={styles.viewAttachmentButton}
                    onPress={() => viewAttachment(item.attachment!)}
                  >
                    <Text style={styles.viewAttachmentButtonText}>📷 Ver Comprovante</Text>
                  </TouchableOpacity>
                )}
                
                <View style={styles.actionButtons}>
                  <TouchableOpacity 
                    style={styles.editButton} 
                    onPress={() => handleEdit(item)}
                  >
                    <Text style={styles.editButtonText}>✏️ Editar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity 
                    style={styles.deleteButton} 
                    onPress={() => handleDelete(item.id)}
                  >
                    <Text style={styles.deleteButtonText}>🗑️ Excluir</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
            {sortedPurchases.length === 0 && transactionType === 'purchases' && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>Nenhuma compra encontrada</Text>
              </View>
            )}
          </View>
        )}
        
        {/* Vendas */}
        {(transactionType === 'all' || transactionType === 'sales') && (
          <View>
            {sortedSales.length > 0 && transactionType === 'all' && (
              <Text style={styles.transactionTypeHeader}>💱 VENDAS</Text>
            )}
            {sortedSales.map((item) => (
              <View key={`sale-${item.id}`} style={[styles.card, item.conversionId ? styles.conversionCard : styles.saleCard]}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderLeft}>
                    <Text style={item.conversionId ? styles.transactionType : styles.transactionTypeSale}>{item.conversionId ? '🔄 CONVERSÃO' : '💱 VENDA'}</Text>
                    <Text style={styles.coinName}>{item.coin}</Text>
                  </View>
                  <View style={{alignItems: 'flex-end'}}>
                    <Text style={styles.date}>{formatDate(item.date)}</Text>
                    {item.attachment && (
                      <Text style={styles.attachmentBadge}>📎</Text>
                    )}
                  </View>
                </View>
                <View style={styles.row}>
                  <Text style={styles.label}>Quantidade:</Text>
                  <Text style={styles.value}>{formatQuantity(item.quantity)}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.label}>Valor Recebido:</Text>
                  <Text style={styles.value}>{formatCurrency(item.priceSold)}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.label}>Preço Unitário:</Text>
                  <Text style={styles.value}>{formatPrice(item.pricePerUnit)}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.label}>Cotação Dólar:</Text>
                  <Text style={styles.value}>R$ {item.dollarRate.toFixed(2)}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.label}>Receita em Reais:</Text>
                  <Text style={styles.value}>R$ {(item.priceSold * item.dollarRate).toFixed(2)}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.label}>{item.profit >= 0 ? 'Lucro:' : 'Prejuízo:'}</Text>
                  <Text style={[styles.value, item.profit >= 0 ? styles.profit : styles.loss]}>
                    {formatCurrency(Math.abs(item.profit))}
                  </Text>
                </View>

                {item.exchangeType && (
                  <View style={styles.row}>
                    <Text style={styles.label}>Corretora:</Text>
                    <Text style={styles.value}>
                      {item.exchangeType === 'nacional' ? '🇧🇷 Nacional' : '🌐 Internacional'}
                      {item.isExempt ? ' ✅ Isento' : ''}
                    </Text>
                  </View>
                )}

                {item.taxPaid !== undefined && item.taxPaid > 0 && (
                  <View style={styles.row}>
                    <Text style={styles.label}>Imposto Pago:</Text>
                    <Text style={[styles.value, { color: '#667eea' }]}>
                      R$ {item.taxPaid.toFixed(2)}
                    </Text>
                  </View>
                )}
                
                {item.attachment && (
                  <TouchableOpacity 
                    style={styles.viewAttachmentButton}
                    onPress={() => viewAttachment(item.attachment!)}
                  >
                    <Text style={styles.viewAttachmentButtonText}>📷 Ver Comprovante</Text>
                  </TouchableOpacity>
                )}

                <View style={styles.actionButtons}>
                  <TouchableOpacity
                    style={styles.editButton}
                    onPress={() => handleEditSale(item)}
                  >
                    <Text style={styles.editButtonText}>✏️ Editar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.deleteButton}
                    onPress={() => handleDeleteSale(item.id)}
                  >
                    <Text style={styles.deleteButtonText}>🗑️ Excluir</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
            {sortedSales.length === 0 && transactionType === 'sales' && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyText}>Nenhuma venda encontrada</Text>
              </View>
            )}
          </View>
        )}
        
        {sortedPurchases.length === 0 && sortedSales.length === 0 && transactionType === 'all' && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>Nenhuma transação no histórico</Text>
          </View>
        )}
      </ScrollView>

      {renderTabBar()}
      
      {renderDatePicker(
        showStartDatePicker,
        tempStartDate,
        setTempStartDate,
        handleStartDateConfirm,
        () => setShowStartDatePicker(false)
      )}
      
      {renderDatePicker(
        showEndDatePicker,
        tempEndDate,
        setTempEndDate,
        handleEndDateConfirm,
        () => setShowEndDatePicker(false)
      )}
      
      {renderDatePicker(
        showPurchaseDatePicker,
        tempPurchaseDate,
        setTempPurchaseDate,
        handlePurchaseDateConfirm,
        () => setShowPurchaseDatePicker(false)
      )}
        </>
      )}

      {/* Modal de Exportação */}
      <Modal transparent visible={showExportModal} animationType="slide">
        <View style={styles.exportModalOverlay}>
          <View style={styles.exportModalContainer}>
            <View style={styles.exportModalHeader}>
              <Text style={styles.exportModalTitle}>📊 Relatório Gerado</Text>
              <TouchableOpacity onPress={() => setShowExportModal(false)}>
                <Text style={styles.exportModalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.exportModalContent}>
              <Text style={styles.exportModalText}>{exportData}</Text>
            </ScrollView>
            
            <View style={styles.exportModalFooter}>
              <Text style={styles.exportModalHint}>
                💡 Copie o texto acima e cole no Excel, Google Sheets ou Word
              </Text>
              <TouchableOpacity 
                style={styles.exportModalButton} 
                onPress={() => setShowExportModal(false)}
              >
                <Text style={styles.exportModalButtonText}>Fechar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal de Backup/Restauração */}
      <Modal transparent visible={showBackupModal} animationType="slide">
        <View style={styles.exportModalOverlay}>
          <View style={styles.exportModalContainer}>
            <View style={styles.exportModalHeader}>
              <Text style={styles.exportModalTitle}>
                {backupMode === 'menu' && '💾 Backup e Restauração'}
                {backupMode === 'generate' && '💾 Gerar Backup'}
                {backupMode === 'restore' && '📥 Restaurar Backup'}
              </Text>
              <TouchableOpacity onPress={() => {
                setShowBackupModal(false);
                setBackupData('');
                setImportData('');
                setBackupMode('menu');
              }}>
                <Text style={styles.exportModalClose}>✕</Text>
              </TouchableOpacity>
            </View>
            
            <ScrollView style={styles.exportModalContent}>
              {backupMode === 'menu' && (
                <View>
                  <Text style={styles.backupMenuDescription}>
                    Escolha uma opção abaixo:
                  </Text>
                  
                  <TouchableOpacity 
                    style={styles.backupMenuButton} 
                    onPress={() => setBackupMode('generate')}
                  >
                    <Text style={styles.backupMenuIcon}>💾</Text>
                    <View style={styles.backupMenuTextContainer}>
                      <Text style={styles.backupMenuTitle}>Gerar Backup</Text>
                      <Text style={styles.backupMenuSubtitle}>
                        Salvar uma cópia de todos os seus dados
                      </Text>
                    </View>
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={styles.backupMenuButton} 
                    onPress={() => setBackupMode('restore')}
                  >
                    <Text style={styles.backupMenuIcon}>💾</Text>
                    <View style={styles.backupMenuTextContainer}>
                      <Text style={styles.backupMenuTitle}>Restaurar Backup</Text>
                      <Text style={styles.backupMenuSubtitle}>
                        Importar dados de um backup anterior
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>
              )}

              {backupMode === 'generate' && (
                <View>
                  {backupData ? (
                    <View>
                      <Text style={styles.backupSectionTitle}>✅ Backup Gerado com Sucesso!</Text>
                      <Text style={styles.backupInfo}>
                        {purchases.length} compra(s) e {sales.length} venda(s)
                      </Text>
                      <Text style={styles.backupWarning}>
                        ⚠️ IMPORTANTE: Este backup só existe nesta tela! Você precisa salvá-lo em um local seguro AGORA.
                      </Text>
                      <Text style={styles.backupHint}>
                        Use os botões abaixo para copiar ou compartilhar:
                      </Text>
                      
                      <View style={styles.backupActionsRow}>
                        <TouchableOpacity 
                          style={styles.backupShareButton} 
                          onPress={copyBackupToClipboard}
                        >
                          <Text style={styles.backupShareButtonText}>📋 Copiar</Text>
                        </TouchableOpacity>
                        
                        <TouchableOpacity 
                          style={styles.backupShareButton} 
                          onPress={shareBackup}
                        >
                          <Text style={styles.backupShareButtonText}>📤 Compartilhar</Text>
                        </TouchableOpacity>
                      </View>

                      <Text style={styles.backupCodeLabel}>Código do Backup:</Text>
                      <ScrollView style={styles.backupCodeContainer} nestedScrollEnabled={true}>
                        <Text style={styles.exportModalText}>{backupData}</Text>
                      </ScrollView>
                      
                      <Text style={styles.backupSaveHint}>
                        💡 Sugestões: Envie por WhatsApp para você mesmo, salve no Google Drive, ou envie por email.
                      </Text>
                    </View>
                  ) : (
                    <View>
                      <Text style={styles.backupInfo}>
                        Seus dados: {purchases.length} compra(s) e {sales.length} venda(s)
                      </Text>
                      <Text style={styles.backupHint}>
                        O backup será gerado em formato JSON. Você poderá copiar e salvar onde quiser.
                      </Text>
                      <TouchableOpacity 
                        style={styles.backupActionButton} 
                        onPress={exportBackup}
                      >
                        <Text style={styles.backupActionButtonText}>💾 Gerar Código do Backup</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}

              {backupMode === 'restore' && (
                <View>
                  <Text style={styles.backupHint}>
                    Cole abaixo o código do backup que você salvou anteriormente:
                  </Text>
                  <TextInput
                    style={styles.backupInput}
                    value={importData}
                    onChangeText={setImportData}
                    placeholder="Cole aqui o código do backup..."
                    placeholderTextColor="#999"
                    multiline
                    numberOfLines={10}
                  />
                  <TouchableOpacity 
                    style={[styles.backupActionButton, !importData.trim() && styles.backupActionButtonDisabled]} 
                    onPress={importBackup}
                    disabled={!importData.trim()}
                  >
                    <Text style={styles.backupActionButtonText}>📥 Importar Dados</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
            
            <View style={styles.exportModalFooter}>
              {backupMode !== 'menu' && (
                <TouchableOpacity 
                  style={styles.backupBackButton} 
                  onPress={() => {
                    setBackupMode('menu');
                    setBackupData('');
                    setImportData('');
                  }}
                >
                  <Text style={styles.backupBackButtonText}>← Voltar</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity 
                style={styles.exportModalButton} 
                onPress={() => {
                  setShowBackupModal(false);
                  setBackupData('');
                  setImportData('');
                  setBackupMode('menu');
                }}
              >
                <Text style={styles.exportModalButtonText}>Fechar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Modal para visualizar imagem */}
      <Modal transparent visible={showAttachmentModal} animationType="fade">
        <View style={styles.attachmentModalContainer}>
          <View style={styles.attachmentModalContent}>
            <TouchableOpacity 
              style={styles.attachmentModalClose}
              onPress={() => {
                setShowAttachmentModal(false);
                setViewingAttachment(null);
              }}
            >
              <Text style={styles.attachmentModalCloseText}>✕</Text>
            </TouchableOpacity>
            
            {viewingAttachment && (
              <Image 
                source={{ uri: viewingAttachment }} 
                style={styles.attachmentModalImage}
                resizeMode="contain"
              />
            )}
            
            <Text style={styles.attachmentModalTitle}>📎 Comprovante</Text>
          </View>
        </View>
      </Modal>

      {/* Modal da Calculadora de Imposto */}
      <Modal transparent visible={showTaxCalculator} animationType="slide">
        <View style={styles.calculatorModal}>
          <View style={[styles.calculatorContent, isDarkMode && styles.darkCalculatorContent]}>
            <Text style={[styles.calculatorTitle, isDarkMode && styles.darkCalculatorTitle]}>
              🧮 Calculadora de Imposto
            </Text>
            
            <TextInput
              style={[styles.calculatorInput, isDarkMode && styles.darkCalculatorInput]}
              placeholder="Moeda (ex: BTC, ETH)"
              value={calcCoin}
              onChangeText={setCalcCoin}
              autoCapitalize="characters"
              placeholderTextColor={isDarkMode ? '#AEAEB2' : '#8E8E93'}
            />
            
            <TextInput
              style={[styles.calculatorInput, isDarkMode && styles.darkCalculatorInput]}
              placeholder="Quantidade"
              value={calcQuantity}
              onChangeText={setCalcQuantity}
              keyboardType="decimal-pad"
              placeholderTextColor={isDarkMode ? '#AEAEB2' : '#8E8E93'}
            />
            
            <TextInput
              style={[styles.calculatorInput, isDarkMode && styles.darkCalculatorInput]}
              placeholder="Preço de Venda (R$)"
              value={calcSellPrice}
              onChangeText={setCalcSellPrice}
              keyboardType="decimal-pad"
              placeholderTextColor={isDarkMode ? '#AEAEB2' : '#8E8E93'}
            />
            
            <View style={styles.calculatorButtons}>
              <TouchableOpacity
                style={[styles.calculatorButton, styles.calculatorButtonCancel]}
                onPress={() => {
                  setShowTaxCalculator(false);
                  setCalcCoin('');
                  setCalcQuantity('');
                  setCalcSellPrice('');
                }}
              >
                <Text style={styles.calculatorButtonText}>Cancelar</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.calculatorButton}
                onPress={calculateTaxBeforeSale}
              >
                <Text style={styles.calculatorButtonText}>Calcular</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FD',
  },
  authContainer: {
    flex: 1,
    backgroundColor: '#667eea',
  },
  authContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  authIcon: {
    fontSize: 90,
    marginBottom: 25,
  },
  authTitle: {
    fontSize: 36,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  authSubtitle: {
    fontSize: 17,
    color: '#fff',
    opacity: 0.95,
    marginBottom: 50,
    fontWeight: '300',
  },
  authButton: {
    backgroundColor: '#fff',
    paddingVertical: 20,
    paddingHorizontal: 50,
    borderRadius: 30,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  authButtonIcon: {
    fontSize: 26,
  },
  authButtonText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#667eea',
  },
  authHint: {
    fontSize: 13,
    color: '#fff',
    opacity: 0.75,
    marginTop: 25,
    textAlign: 'center',
    fontWeight: '300',
  },
  developerCredit: {
    position: 'absolute',
    bottom: 35,
    alignItems: 'center',
  },
  developerText: {
    fontSize: 12,
    color: '#fff',
    opacity: 0.7,
    fontWeight: '300',
  },
  developerName: {
    fontSize: 14,
    color: '#fff',
    fontWeight: '600',
    marginTop: 6,
  },
  homeFooter: {
    marginTop: 30,
    marginBottom: 20,
    padding: 18,
    backgroundColor: '#fff',
    borderRadius: 16,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  footerText: {
    fontSize: 13,
    color: '#8E8E93',
    fontWeight: '400',
  },
  footerName: {
    fontWeight: '700',
    color: '#667eea',
  },
  availableQuantity: {
    color: '#34C759',
    fontWeight: '700',
  },
  profit: {
    color: '#34C759',
    fontWeight: '700',
  },
  loss: {
    color: '#FF3B30',
    fontWeight: '700',
  },
  availableCoinsCard: {
    backgroundColor: '#E8F5E9',
    borderRadius: 16,
    padding: 18,
    marginBottom: 20,
    borderLeftWidth: 5,
    borderLeftColor: '#34C759',
    elevation: 3,
    shadowColor: '#34C759',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  availableTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1B5E20',
    marginBottom: 14,
    letterSpacing: 0.3,
  },
  availableCoinItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#fff',
    borderRadius: 10,
    marginBottom: 10,
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
  },
  availableCoinName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  availableCoinQty: {
    fontSize: 15,
    color: '#34C759',
    fontWeight: '600',
  },
  sellButton: {
    backgroundColor: '#34C759',
    padding: 20,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 30,
    elevation: 4,
    shadowColor: '#34C759',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    backgroundColor: '#667eea',
    padding: 24,
    paddingTop: Platform.OS === 'ios' ? 50 : 45,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    elevation: 6,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  hideButton: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 5,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  hideButtonText: {
    fontSize: 28,
  },
  subtitle: {
    fontSize: 15,
    color: '#fff',
    opacity: 0.95,
    fontWeight: '400',
  },
  totalCard: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    padding: 18,
    borderRadius: 16,
    marginTop: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  totalLabel: {
    color: '#fff',
    fontSize: 14,
    opacity: 0.9,
    fontWeight: '500',
  },
  totalValue: {
    color: '#fff',
    fontSize: 32,
    fontWeight: '800',
    marginTop: 6,
    letterSpacing: 0.5,
  },
  homeHeader: {
    backgroundColor: '#667eea',
    paddingTop: 18,
    paddingBottom: 20,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 10,
  },
  homeHeaderTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  homeHeaderTitle: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  homeHeaderMetrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  homeMetricCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  homeMetricCardProfit: {
    backgroundColor: 'rgba(52,199,89,0.22)',
    borderColor: 'rgba(52,199,89,0.4)',
  },
  homeMetricCardLoss: {
    backgroundColor: 'rgba(255,59,48,0.22)',
    borderColor: 'rgba(255,59,48,0.4)',
  },
  homeMetricLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  homeMetricValue: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  homeMetricProfit: {
    color: '#A3F0B5',
  },
  homeMetricLoss: {
    color: '#FFB3AE',
  },
  homeMetricCardBtc: {
    backgroundColor: 'rgba(255,159,10,0.22)',
    borderColor: 'rgba(255,159,10,0.45)',
    width: '100%',
    flex: 0,
  },
  homeMetricBtc: {
    color: '#FFD580',
  },
  content: {
    flex: 1,
    padding: 18,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 20,
    marginBottom: 20,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: '#F1F3F6',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingBottom: 14,
    borderBottomWidth: 1.5,
    borderBottomColor: '#F1F3F6',
  },
  coinName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1C1C1E',
    marginBottom: 4,
    letterSpacing: 0.3,
  },
  date: {
    fontSize: 13,
    color: '#8E8E93',
    fontWeight: '500',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    color: '#8E8E93',
    fontWeight: '500',
  },
  value: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  purchaseCount: {
    fontSize: 12,
    color: '#AEAEB2',
    marginTop: 8,
    fontWeight: '500',
  },
  deleteHint: {
    fontSize: 11,
    color: '#AEAEB2',
    textAlign: 'center',
    marginTop: 12,
    fontStyle: 'italic',
    fontWeight: '400',
  },
  inputGroup: {
    marginBottom: 22,
  },
  inputLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 10,
    letterSpacing: 0.2,
  },
  input: {
    backgroundColor: '#F8F9FD',
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    borderWidth: 1.5,
    borderColor: '#E8EAED',
    color: '#1C1C1E',
    fontWeight: '500',
  },
  infoBox: {
    backgroundColor: '#F0F4FF',
    padding: 16,
    borderRadius: 14,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#667eea',
  },
  infoText: {
    fontSize: 14,
    color: '#5568D3',
    fontWeight: '600',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  saveButton: {
    backgroundColor: '#667eea',
    padding: 20,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 30,
    elevation: 4,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  cancelEditButton: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 30,
    borderWidth: 2,
    borderColor: '#667eea',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  cancelEditButtonText: {
    color: '#667eea',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  actionButtons: {
    flexDirection: 'row',
    marginTop: 20,
    gap: 14,
  },
  editButton: {
    flex: 1,
    backgroundColor: '#007AFF',
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  editButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  deleteButton: {
    flex: 1,
    backgroundColor: '#FF3B30',
    padding: 16,
    borderRadius: 14,
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#FF3B30',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#F1F3F6',
    paddingTop: 6,
    paddingBottom: 32,
    paddingHorizontal: 2,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 6,
    paddingHorizontal: 2,
    alignItems: 'center',
    borderRadius: 12,
    marginHorizontal: 1,
  },
  tabActive: {
    backgroundColor: '#EEF1FD',
  },
  tabIcon: {
    fontSize: 20,
    marginBottom: 2,
  },
  tabText: {
    fontSize: 9,
    color: '#8E8E93',
    textAlign: 'center',
    fontWeight: '500',
  },
  tabTextActive: {
    fontSize: 9,
    color: '#667eea',
    fontWeight: '700',
    textAlign: 'center',
  },
  emptyState: {
    padding: 50,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 18,
    color: '#8E8E93',
    textAlign: 'center',
    fontWeight: '600',
    marginTop: 12,
  },
  emptySubtext: {
    fontSize: 15,
    color: '#AEAEB2',
    marginTop: 8,
    textAlign: 'center',
    fontWeight: '400',
  },
  list: {
    flex: 1,
    padding: 18,
    paddingBottom: 110,
  },
  filterContainer: {
    backgroundColor: '#fff',
    padding: 18,
    borderBottomWidth: 0,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  filterTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1C1C1E',
    marginBottom: 14,
    letterSpacing: 0.3,
  },
  filterRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  filterItem: {
    marginBottom: 8,
  },
  filterLabel: {
    fontSize: 13,
    color: '#8E8E93',
    marginBottom: 8,
    fontWeight: '600',
  },
  filterInput: {
    backgroundColor: '#F8F9FD',
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    borderWidth: 1.5,
    borderColor: '#E8EAED',
    color: '#1C1C1E',
    fontWeight: '500',
  },
  coinFilterScroll: {
    flexDirection: 'row',
  },
  coinFilterButton: {
    backgroundColor: '#F8F9FD',
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 20,
    marginRight: 10,
    borderWidth: 1.5,
    borderColor: '#E8EAED',
  },
  coinFilterButtonActive: {
    backgroundColor: '#667eea',
    borderColor: '#667eea',
  },
  coinFilterText: {
    fontSize: 13,
    color: '#8E8E93',
    fontWeight: '700',
  },
  coinFilterTextActive: {
    color: '#fff',
  },
  filterActionsContainer: {
    flexDirection: 'row',
    gap: 16,
    marginTop: 14,
  },
  clearFilterButton: {
    flex: 1,
    backgroundColor: '#FF9500',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#FF9500',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  clearFilterText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  exportButton: {
    flex: 1,
    backgroundColor: '#34C759',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#34C759',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  exportButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  summaryContainer: {
    backgroundColor: '#fff',
    padding: 18,
    borderBottomWidth: 0,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  summaryTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#667eea',
    marginBottom: 16,
    letterSpacing: 0.3,
  },
  summaryCard: {
    backgroundColor: '#F8F9FD',
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderLeftWidth: 5,
    borderLeftColor: '#667eea',
    elevation: 2,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1.5,
    borderBottomColor: '#E8EAED',
  },
  summaryCoinName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1C1C1E',
    letterSpacing: 0.3,
  },
  summaryCount: {
    fontSize: 11,
    color: '#667eea',
    backgroundColor: '#F0F4FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    fontWeight: '700',
    overflow: 'hidden',
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#8E8E93',
    fontWeight: '500',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  summaryValueHighlight: {
    fontSize: 14,
    fontWeight: '800',
    color: '#667eea',
  },
  dateButton: {
    backgroundColor: '#F8F9FD',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#E8EAED',
    alignItems: 'center',
  },
  dateButtonText: {
    fontSize: 15,
    color: '#1C1C1E',
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  datePickerContainer: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    width: '90%',
    maxWidth: 420,
    maxHeight: '80%',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
  },
  datePickerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1C1C1E',
    textAlign: 'center',
    marginBottom: 24,
    letterSpacing: 0.3,
  },
  dateSelectorsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 18,
    height: 300,
  },
  dateSelectorColumn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#E8EAED',
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#F8F9FD',
  },
  dateSelectorLabel: {
    fontSize: 14,
    fontWeight: '800',
    color: '#667eea',
    textAlign: 'center',
    padding: 12,
    backgroundColor: '#F0F4FF',
    borderBottomWidth: 1.5,
    borderBottomColor: '#E8EAED',
  },
  dateScrollView: {
    flex: 1,
    backgroundColor: '#fff',
  },
  dateOption: {
    padding: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F3F6',
    alignItems: 'center',
  },
  dateOptionSelected: {
    backgroundColor: '#667eea',
  },
  dateOptionText: {
    fontSize: 15,
    color: '#1C1C1E',
    fontWeight: '600',
  },
  dateOptionTextSelected: {
    color: '#fff',
    fontWeight: '800',
  },
  datePickerPreview: {
    backgroundColor: '#F0F4FF',
    padding: 18,
    borderRadius: 14,
    marginBottom: 18,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E0E7FF',
  },
  datePickerPreviewText: {
    fontSize: 17,
    fontWeight: '800',
    color: '#667eea',
    letterSpacing: 0.3,
  },
  datePickerButtons: {
    flexDirection: 'row',
    gap: 16,
  },
  datePickerCancelButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E8EAED',
    alignItems: 'center',
    backgroundColor: '#F8F9FD',
  },
  datePickerCancelText: {
    color: '#8E8E93',
    fontSize: 16,
    fontWeight: '700',
  },
  datePickerConfirmButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#667eea',
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  datePickerConfirmText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
  },
  exportModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  exportModalContainer: {
    backgroundColor: '#fff',
    borderRadius: 20,
    width: '100%',
    maxHeight: '85%',
    overflow: 'hidden',
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.4,
    shadowRadius: 15,
  },
  exportModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 22,
    backgroundColor: '#667eea',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  exportModalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.3,
  },
  exportModalClose: {
    fontSize: 26,
    color: '#fff',
    fontWeight: '800',
  },
  exportModalContent: {
    maxHeight: 420,
    padding: 22,
  },
  exportModalText: {
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    color: '#1C1C1E',
    lineHeight: 20,
    fontWeight: '500',
  },
  exportModalFooter: {
    padding: 22,
    borderTopWidth: 1.5,
    borderTopColor: '#E8EAED',
  },
  exportModalHint: {
    fontSize: 13,
    color: '#8E8E93',
    textAlign: 'center',
    marginBottom: 18,
    fontWeight: '500',
  },
  exportModalButton: {
    backgroundColor: '#667eea',
    padding: 18,
    borderRadius: 14,
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  exportModalButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
  },
  moreCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    borderRadius: 16,
    padding: 18,
    marginHorizontal: 20,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 3,
  },
  moreCardIcon: {
    fontSize: 32,
    marginRight: 16,
  },
  moreCardText: {
    flex: 1,
  },
  moreCardTitle: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 3,
  },
  moreCardDesc: {
    color: '#8E8E93',
    fontSize: 13,
  },
  moreCardChevron: {
    color: '#636366',
    fontSize: 26,
    fontWeight: '300',
    marginLeft: 8,
  },
  backupButton: {
    backgroundColor: '#FF9500',
    padding: 20,
    borderRadius: 16,
    marginTop: 24,
    marginBottom: 12,
    marginHorizontal: 20,
    alignItems: 'center',
    shadowColor: '#FF9500',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 5,
  },
  backupButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
  },
  backupSectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1C1C1E',
    marginBottom: 12,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  backupInfo: {
    fontSize: 15,
    color: '#8E8E93',
    marginBottom: 18,
    textAlign: 'center',
    fontWeight: '500',
  },
  backupHint: {
    fontSize: 13,
    color: '#8E8E93',
    marginBottom: 12,
    fontStyle: 'italic',
    fontWeight: '400',
  },
  backupActionButton: {
    backgroundColor: '#667eea',
    padding: 18,
    borderRadius: 14,
    alignItems: 'center',
    marginVertical: 12,
    elevation: 3,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  backupActionButtonDisabled: {
    backgroundColor: '#D1D1D6',
  },
  backupActionButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
  },
  backupSeparator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 25,
  },
  separatorLine: {
    flex: 1,
    height: 1.5,
    backgroundColor: '#E8EAED',
  },
  separatorText: {
    marginHorizontal: 18,
    fontSize: 15,
    color: '#AEAEB2',
    fontWeight: '700',
  },
  backupInput: {
    backgroundColor: '#F8F9FD',
    borderWidth: 1.5,
    borderColor: '#E8EAED',
    borderRadius: 14,
    padding: 16,
    fontSize: 13,
    color: '#1C1C1E',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    minHeight: 160,
    textAlignVertical: 'top',
    marginBottom: 18,
    fontWeight: '500',
  },
  backupMenuDescription: {
    fontSize: 16,
    color: '#8E8E93',
    textAlign: 'center',
    marginBottom: 24,
    fontWeight: '500',
  },
  backupMenuButton: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 22,
    marginBottom: 18,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#667eea',
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  backupMenuIcon: {
    fontSize: 44,
    marginRight: 18,
  },
  backupMenuTextContainer: {
    flex: 1,
  },
  backupMenuTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#667eea',
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  backupMenuSubtitle: {
    fontSize: 15,
    color: '#8E8E93',
    fontWeight: '500',
  },
  backupBackButton: {
    flex: 1,
    padding: 16,
    borderRadius: 14,
    backgroundColor: '#F8F9FD',
    alignItems: 'center',
    marginRight: 12,
    borderWidth: 1.5,
    borderColor: '#E8EAED',
  },
  backupBackButtonText: {
    color: '#8E8E93',
    fontSize: 16,
    fontWeight: '700',
  },
  backupWarning: {
    backgroundColor: '#FFF8E1',
    borderLeftWidth: 5,
    borderLeftColor: '#FF9500',
    padding: 16,
    borderRadius: 14,
    marginVertical: 18,
    fontSize: 15,
    color: '#B76E00',
    fontWeight: '700',
  },
  backupActionsRow: {
    flexDirection: 'row',
    gap: 16,
    marginVertical: 20,
  },
  backupShareButton: {
    flex: 1,
    backgroundColor: '#667eea',
    padding: 18,
    borderRadius: 14,
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  backupShareButtonText: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '800',
  },
  backupCodeLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: '#8E8E93',
    marginBottom: 12,
    letterSpacing: 0.2,
  },
  backupCodeContainer: {
    maxHeight: 220,
    backgroundColor: '#F8F9FD',
    borderWidth: 1.5,
    borderColor: '#E8EAED',
    borderRadius: 14,
    padding: 14,
    marginBottom: 18,
  },
  backupSaveHint: {
    fontSize: 14,
    color: '#1B5E20',
    fontStyle: 'italic',
    textAlign: 'center',
    backgroundColor: '#E8F5E9',
    padding: 14,
    borderRadius: 14,
    fontWeight: '600',
  },
  transactionTypeHeader: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#666',
    marginTop: 15,
    marginBottom: 10,
    paddingHorizontal: 5,
  },
  cardHeaderLeft: {
    flexDirection: 'column',
    gap: 5,
  },
  transactionType: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#6200ea',
    backgroundColor: '#e8eaf6',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  transactionTypeSale: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#4caf50',
    backgroundColor: '#e8f5e9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  saleCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#4caf50',
  },
  salesSummaryCard: {
    borderLeftColor: '#4caf50',
  },
  summarySubtitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 10,
    marginBottom: 8,
  },
  // Tax styles
  taxCardGreen: {
    backgroundColor: '#e8f5e9',
    borderLeftWidth: 4,
    borderLeftColor: '#4caf50',
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
  },
  taxCardBlue: {
    backgroundColor: '#e3f2fd',
    borderLeftWidth: 4,
    borderLeftColor: '#2196f3',
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
  },
  taxCardOrange: {
    backgroundColor: '#fff3e0',
    borderLeftWidth: 4,
    borderLeftColor: '#ff9800',
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
  },
  taxCardRed: {
    backgroundColor: '#ffebee',
    borderLeftWidth: 4,
    borderLeftColor: '#f44336',
    padding: 15,
    borderRadius: 8,
    marginBottom: 15,
  },
  taxCardYellow: {
    backgroundColor: '#FFF8E1',
    borderLeftWidth: 5,
    borderLeftColor: '#FFCC00',
    padding: 18,
    borderRadius: 16,
    marginBottom: 18,
    elevation: 2,
    shadowColor: '#FFCC00',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  taxCardTitle: {
    fontSize: 19,
    fontWeight: '800',
    color: '#1C1C1E',
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  taxCardText: {
    fontSize: 15,
    color: '#636366',
    marginBottom: 6,
    lineHeight: 22,
    fontWeight: '500',
  },
  darfItem: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 14,
    marginTop: 12,
    borderWidth: 2,
    borderColor: '#FF3B30',
    elevation: 2,
    shadowColor: '#FF3B30',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  darfMonth: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1C1C1E',
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  darfAmount: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FF3B30',
    marginBottom: 4,
    letterSpacing: 0.3,
  },
  darfDue: {
    fontSize: 15,
    color: '#8E8E93',
    marginBottom: 4,
    fontWeight: '600',
  },
  darfProfit: {
    fontSize: 13,
    color: '#AEAEB2',
    fontWeight: '500',
  },
  taxMonthCard: {
    backgroundColor: '#fff',
    padding: 18,
    borderRadius: 16,
    marginBottom: 14,
    borderLeftWidth: 5,
    borderLeftColor: '#34C759',
    elevation: 3,
    shadowColor: '#34C759',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  taxMonthCardTaxable: {
    backgroundColor: '#fff',
    padding: 18,
    borderRadius: 16,
    marginBottom: 14,
    borderLeftWidth: 5,
    borderLeftColor: '#FF3B30',
    elevation: 3,
    shadowColor: '#FF3B30',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  taxMonthTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1C1C1E',
    marginBottom: 12,
    textTransform: 'capitalize',
    letterSpacing: 0.3,
  },
  taxMonthDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  taxMonthLabel: {
    fontSize: 15,
    color: '#8E8E93',
    fontWeight: '500',
  },
  taxMonthValue: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1C1C1E',
  },
  profitPositive: {
    color: '#34C759',
  },
  profitNegative: {
    color: '#FF3B30',
  },
  taxDueContainer: {
    backgroundColor: '#FFEBEE',
    padding: 14,
    borderRadius: 12,
    marginTop: 12,
    borderWidth: 1.5,
    borderColor: '#FF3B30',
  },
  taxDueLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FF3B30',
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  taxDueAmount: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FF3B30',
    marginBottom: 4,
    letterSpacing: 0.3,
  },
  taxDueDate: {
    fontSize: 13,
    color: '#8E8E93',
    fontWeight: '600',
  },
  taxExempt: {
    fontSize: 15,
    color: '#34C759',
    fontWeight: '800',
    marginTop: 12,
  },
  patrimonyCard: {
    backgroundColor: '#fff',
    padding: 18,
    borderRadius: 16,
    borderLeftWidth: 5,
    borderLeftColor: '#667eea',
    elevation: 3,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  patrimonyTotal: {
    fontSize: 22,
    fontWeight: '800',
    color: '#667eea',
    marginBottom: 18,
    paddingBottom: 14,
    borderBottomWidth: 1.5,
    borderBottomColor: '#E8EAED',
    letterSpacing: 0.3,
  },
  patrimonyItem: {
    backgroundColor: '#F8F9FD',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E8EAED',
  },
  patrimonyCode: {
    fontSize: 13,
    color: '#667eea',
    fontWeight: '800',
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  patrimonyCoin: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1C1C1E',
    marginBottom: 6,
    letterSpacing: 0.2,
  },
  patrimonyQuantity: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 4,
    fontWeight: '500',
  },
  patrimonyCost: {
    fontSize: 14,
    color: '#8E8E93',
    marginBottom: 4,
    fontWeight: '500',
  },
  patrimonyValue: {
    fontSize: 16,
    fontWeight: '800',
    color: '#34C759',
    letterSpacing: 0.2,
  },
  exportSection: {
    backgroundColor: '#fff',
    padding: 18,
    borderRadius: 16,
    marginTop: 12,
    marginBottom: 18,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  section: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 16,
    marginTop: 16,
    marginBottom: 24,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#667eea',
    marginBottom: 14,
    letterSpacing: 0.3,
  },
  exportTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1C1C1E',
    marginBottom: 12,
    letterSpacing: 0.2,
  },
  taxInfo: {
    backgroundColor: '#E3F2FD',
    padding: 18,
    borderRadius: 16,
    marginTop: 12,
    marginBottom: 24,
    borderLeftWidth: 5,
    borderLeftColor: '#007AFF',
    elevation: 2,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  taxInfoTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0055CC',
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  taxInfoText: {
    fontSize: 14,
    color: '#636366',
    marginBottom: 6,
    lineHeight: 20,
    fontWeight: '500',
  },
  viewModeToggle: {
    flexDirection: 'row',
    backgroundColor: '#F8F9FD',
    borderRadius: 12,
    padding: 4,
    marginBottom: 24,
    borderWidth: 1.5,
    borderColor: '#E8EAED',
  },
  toggleButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  toggleButtonActive: {
    backgroundColor: '#667eea',
    elevation: 2,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  toggleButtonText: {
    fontSize: 14,
    color: '#8E8E93',
    fontWeight: '700',
  },
  toggleButtonTextActive: {
    color: '#fff',
  },
  modeSelectorContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  modeSelectorCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 18,
    paddingVertical: 22,
    paddingHorizontal: 12,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E8EAED',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  modeSelectorCardActiveSell: {
    borderColor: '#667eea',
    backgroundColor: '#667eea',
    elevation: 6,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
  },
  modeSelectorCardActiveConvert: {
    borderColor: '#34C759',
    backgroundColor: '#34C759',
    elevation: 6,
    shadowColor: '#34C759',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
  },
  modeSelectorIcon: {
    fontSize: 34,
    marginBottom: 10,
  },
  modeSelectorTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1C1C1E',
    marginBottom: 5,
    letterSpacing: 0.2,
  },
  modeSelectorTitleActive: {
    color: '#fff',
  },
  modeSelectorDesc: {
    fontSize: 12,
    color: '#8E8E93',
    textAlign: 'center',
    fontWeight: '500',
    lineHeight: 16,
  },
  modeSelectorDescActive: {
    color: 'rgba(255,255,255,0.88)',
  },
  sectionSubtitle: {
    fontSize: 15,
    color: '#AEAEB2',
    marginBottom: 18,
    fontStyle: 'italic',
    fontWeight: '500',
  },
  fiscalYearCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 20,
    marginBottom: 22,
    borderWidth: 2,
    borderColor: '#E8EAED',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
  },
  fiscalYearCardTax: {
    borderColor: '#FF9500',
    backgroundColor: '#FFF8E1',
  },
  fiscalYearCardLoss: {
    borderColor: '#FF3B30',
    backgroundColor: '#FFEBEE',
  },
  fiscalYearHeader: {
    marginBottom: 0,
  },
  fiscalYearTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  fiscalYearTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#667eea',
    letterSpacing: 0.3,
  },
  fiscalYearToggle: {
    fontSize: 20,
    color: '#667eea',
  },
  fiscalYearSummary: {
    gap: 10,
  },
  fiscalYearSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fiscalYearLabel: {
    fontSize: 15,
    color: '#8E8E93',
    fontWeight: '500',
  },
  fiscalYearLabelBold: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1C1C1E',
    letterSpacing: 0.2,
  },
  fiscalYearValue: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  fiscalYearValueHighlight: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  fiscalYearTaxDue: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FF3B30',
    letterSpacing: 0.3,
  },
  fiscalYearDetails: {
    backgroundColor: '#F8F9FD',
    borderRadius: 14,
    padding: 20,
    marginTop: 18,
    marginBottom: 10,
  },
  detailSection: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 18,
    marginBottom: 18,
  },
  compensationSection: {
    backgroundColor: '#FFF3E0',
    borderLeftWidth: 5,
    borderLeftColor: '#FF9500',
  },
  taxSection: {
    backgroundColor: '#FFEBEE',
    borderLeftWidth: 5,
    borderLeftColor: '#FF3B30',
  },
  lossCarrySection: {
    backgroundColor: '#E8F5E9',
    borderLeftWidth: 5,
    borderLeftColor: '#34C759',
  },
  declarationSection: {
    backgroundColor: '#E3F2FD',
    borderLeftWidth: 5,
    borderLeftColor: '#007AFF',
  },
  detailSectionTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1C1C1E',
    marginBottom: 12,
    letterSpacing: 0.3,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  detailLabel: {
    fontSize: 14,
    color: '#8E8E93',
    flex: 1,
    fontWeight: '500',
  },
  detailLabelBold: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1C1C1E',
    flex: 1,
    letterSpacing: 0.2,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1C1C1E',
    textAlign: 'right',
  },
  detailValueBold: {
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'right',
    letterSpacing: 0.2,
  },
  taxDueBig: {
    fontSize: 22,
    fontWeight: '800',
    color: '#FF3B30',
    textAlign: 'right',
    letterSpacing: 0.3,
  },
  lossCarryText: {
    fontSize: 14,
    color: '#636366',
    marginBottom: 10,
    lineHeight: 20,
    fontWeight: '500',
  },
  lossCarryAmount: {
    fontSize: 20,
    fontWeight: '800',
    color: '#34C759',
    letterSpacing: 0.3,
  },
  declarationReason: {
    fontSize: 13,
    color: '#636366',
    marginTop: 8,
    marginBottom: 2,
    lineHeight: 21,
    fontWeight: '400',
  },
  assetsDetail: {
    marginTop: 18,
    padding: 16,
    backgroundColor: '#F8F9FD',
    borderRadius: 14,
  },
  assetsDetailTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#667eea',
    marginBottom: 10,
    letterSpacing: 0.2,
  },
  assetItem: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 14,
    borderLeftWidth: 4,
    borderLeftColor: '#667eea',
    elevation: 2,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  assetCoin: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1C1C1E',
    marginBottom: 5,
    letterSpacing: 0.2,
  },
  assetQuantity: {
    fontSize: 13,
    color: '#8E8E93',
    marginBottom: 3,
    fontWeight: '500',
  },
  assetCost: {
    fontSize: 13,
    color: '#8E8E93',
    marginBottom: 3,
    fontWeight: '500',
  },
  assetTotal: {
    fontSize: 14,
    fontWeight: '800',
    color: '#34C759',
    letterSpacing: 0.2,
  },
  declarationReasonAlt: {
    fontSize: 13,
    color: '#666',
    fontStyle: 'italic',
    marginTop: 6,
    lineHeight: 18,
  },
  rfHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  copyButton: {
    backgroundColor: '#667eea',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  copyButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  monthDetailCard: {
    backgroundColor: '#F8F9FD',
    padding: 14,
    borderRadius: 10,
    marginBottom: 10,
  },
  monthDetailName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#667eea',
    marginBottom: 8,
    textTransform: 'capitalize',
    letterSpacing: 0.2,
  },
  monthDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  monthDetailLabel: {
    fontSize: 13,
    color: '#8E8E93',
    fontWeight: '500',
  },
  monthDetailValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  attachmentSection: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 18,
    marginBottom: 18,
    borderWidth: 1.5,
    borderColor: '#E8EAED',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  attachmentLabel: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1C1C1E',
    marginBottom: 6,
    letterSpacing: 0.3,
  },
  attachmentHint: {
    fontSize: 13,
    color: '#AEAEB2',
    marginBottom: 18,
    fontWeight: '500',
  },
  attachmentButtons: {
    flexDirection: 'row',
    gap: 16,
    justifyContent: 'center',
  },
  attachmentButton: {
    flex: 1,
    backgroundColor: '#667eea',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  attachmentButtonSmall: {
    flex: 1,
    backgroundColor: '#667eea',
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#667eea',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  attachmentButtonRemove: {
    backgroundColor: '#FF3B30',
    shadowColor: '#FF3B30',
  },
  attachmentButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '800',
  },
  attachmentPreview: {
    gap: 12,
  },
  attachmentCard: {
    backgroundColor: '#E8F5E9',
    padding: 18,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#34C759',
  },
  attachmentIcon: {
    fontSize: 44,
    marginBottom: 6,
  },
  attachmentText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#34C759',
    letterSpacing: 0.2,
  },
  attachmentBadge: {
    fontSize: 18,
    marginTop: 4,
  },
  viewAttachmentButton: {
    backgroundColor: '#E3F2FD',
    padding: 14,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 12,
    borderWidth: 1.5,
    borderColor: '#007AFF',
    elevation: 1,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  viewAttachmentButtonText: {
    color: '#007AFF',
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  attachmentModalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  attachmentModalContent: {
    width: '100%',
    height: '90%',
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
  },
  attachmentModalClose: {
    position: 'absolute',
    top: 14,
    right: 14,
    backgroundColor: '#FF3B30',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    elevation: 5,
    shadowColor: '#FF3B30',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
  attachmentModalCloseText: {
    fontSize: 26,
    color: '#fff',
    fontWeight: '800',
  },
  attachmentModalImage: {
    width: '100%',
    height: '85%',
    borderRadius: 16,
  },
  attachmentModalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1C1C1E',
    marginTop: 16,
    letterSpacing: 0.3,
  },
  // Estilos do Modo Escuro
  darkContainer: {
    flex: 1,
    backgroundColor: '#1C1C1E',
  },
  darkCard: {
    backgroundColor: '#2C2C2E',
    borderColor: '#3A3A3C',
  },
  darkText: {
    color: '#FFFFFF',
  },
  darkSubtext: {
    color: '#AEAEB2',
  },
  // Estilos da Calculadora
  calculatorModal: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  calculatorContent: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    width: '90%',
    maxWidth: 400,
  },
  calculatorTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#1C1C1E',
    marginBottom: 20,
    textAlign: 'center',
  },
  calculatorInput: {
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    fontSize: 16,
    borderWidth: 1.5,
    borderColor: '#E8EAED',
  },
  calculatorButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    gap: 12,
  },
  calculatorButton: {
    flex: 1,
    backgroundColor: '#3498db',
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 6,
    alignItems: 'center',
  },
  calculatorButtonCancel: {
    backgroundColor: '#95a5a6',
  },
  calculatorButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  // Estilos Modo Escuro - Calculadora
  darkCalculatorContent: {
    backgroundColor: '#2C2C2E',
  },
  darkCalculatorTitle: {
    color: '#FFFFFF',
  },
  darkCalculatorInput: {
    backgroundColor: '#3A3A3C',
    borderColor: '#48484A',
    color: '#FFFFFF',
  },

  // Dark Mode Toggle
  darkModeToggle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
  },
  darkModeText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1C1C1E',
  },
  conversionCard: {
    borderLeftWidth: 4,
    borderLeftColor: '#667eea',
    backgroundColor: '#F5F6FF',
  },
  declPercentBox: {
    backgroundColor: '#F0F4FF',
    borderRadius: 14,
    padding: 16,
    marginBottom: 18,
    borderWidth: 1.5,
    borderColor: '#C7D2FE',
  },
  declPercentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  declPercentTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#4338CA',
  },
  declPercentBadge: {
    backgroundColor: '#E0E7FF',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
  },
  declPercentBadgePartial: {
    backgroundColor: '#FEF3C7',
  },
  declPercentBadgeText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#4338CA',
  },
  declPercentBadgeTextPartial: {
    color: '#92400E',
  },
  declPercentSubtitle: {
    fontSize: 11,
    color: '#6366F1',
    lineHeight: 16,
  },
  declPercentBtn: {
    backgroundColor: '#fff',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1.5,
    borderColor: '#C7D2FE',
  },
  declPercentBtnActive: {
    backgroundColor: '#4338CA',
    borderColor: '#4338CA',
  },
  declPercentBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#4338CA',
  },
  declPercentBtnTextActive: {
    color: '#fff',
  },
  declPercentWarning: {
    marginTop: 10,
    fontSize: 12,
    color: '#92400E',
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    padding: 8,
    fontWeight: '600',
  },

  irSaleGroup: {
    marginBottom: 16,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E8EAED',
  },
  irSaleGroupHeader: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  irSaleGroupLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#2E7D32',
    letterSpacing: 0.3,
  },
  irSaleGroupSub: {
    fontSize: 11,
    color: '#555',
    marginTop: 2,
    fontStyle: 'italic',
  },
  irInstructionBox: {
    marginTop: 10,
    backgroundColor: '#F8F9FD',
    borderRadius: 8,
    padding: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#667eea',
  },
  irInstructionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#667eea',
    marginBottom: 5,
  },
  irInstructionText: {
    fontSize: 12,
    color: '#3C3C43',
    lineHeight: 18,
    marginBottom: 2,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8F9FD',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: '#E8EAED',
  },
  switchInfo: {
    flex: 1,
    marginRight: 12,
  },
  switchLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 2,
  },
  switchHint: {
    fontSize: 12,
    color: '#8E8E93',
    fontWeight: '500',
  },
  retireHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1C1C1E',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  retireHeaderBack: {
    color: '#fff',
    fontSize: 32,
    lineHeight: 36,
    width: 32,
    textAlign: 'center',
  },
  retireHeaderTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    flex: 1,
    textAlign: 'center',
  },
  retireTrackCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
    borderWidth: 2,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  retireTrackTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  retireTrackEmoji: { fontSize: 32 },
  retireTrackLabel: { fontSize: 18, fontWeight: '800' },
  retireTrackSub: { fontSize: 12, color: '#8E8E93', marginTop: 2 },
  retireTrackPct: { fontSize: 24, fontWeight: '800' },
  retireTrackBarBg: {
    height: 12,
    backgroundColor: '#F1F3F6',
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 12,
  },
  retireTrackBarFill: { height: 12, borderRadius: 6 },
  retireTrackStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  retireTrackStatText: { fontSize: 12, color: '#3C3C43' },
  retireConfigHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1C1C1E',
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 14,
    marginBottom: 6,
  },
  retireConfigHeaderText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  retireConfigHeaderChevron: { color: '#8E8E93', fontSize: 20 },
  retireConfigCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#F1F3F6',
  },
  retireConfigSection: {
    fontSize: 11,
    fontWeight: '700',
    color: '#667eea',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: 14,
    marginBottom: 8,
  },
  retireInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F3F6',
    gap: 12,
  },
  retireInputLabel: { fontSize: 14, color: '#1C1C1E', fontWeight: '500' },
  retireInputHint: { fontSize: 11, color: '#8E8E93', marginTop: 2 },
  retireInputWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  retireInput: {
    backgroundColor: '#F1F3F6',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 15,
    fontWeight: '700',
    color: '#1C1C1E',
    minWidth: 72,
    textAlign: 'right',
  },
  retireInputSuffix: { fontSize: 13, color: '#8E8E93', fontWeight: '500' },
  retireToggle: {
    backgroundColor: '#F1F3F6',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  retireToggleOn: { backgroundColor: '#667eea' },
  retireToggleText: { fontSize: 13, fontWeight: '700', color: '#1C1C1E' },
  retireResultCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 18,
    padding: 18,
    marginBottom: 14,
  },
  retireResultTitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 14,
    textAlign: 'center',
  },
  retireResultGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  retireResultItem: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
  },
  retireResultLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 6,
    textAlign: 'center',
  },
  retireResultValue: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
  },
  retireResultSub: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 10,
    marginTop: 2,
  },
  retireBtcPrice: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(247,147,26,0.15)',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(247,147,26,0.3)',
  },
  retireBtcPriceLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  retireBtcPriceValue: { color: '#F7931A', fontSize: 14, fontWeight: '800' },
  retireTableHeader: {
    flexDirection: 'row',
    backgroundColor: '#F1F3F6',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  retireTableHead: {
    width: 84,
    fontSize: 11,
    fontWeight: '700',
    color: '#8E8E93',
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  retireTableRow: {
    flexDirection: 'row',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F3F6',
  },
  retireTableCell: {
    width: 84,
    fontSize: 12,
    color: '#1C1C1E',
    fontWeight: '500',
    textAlign: 'center',
  },
  retireTableNote: {
    fontSize: 11,
    color: '#8E8E93',
    textAlign: 'center',
    marginTop: 10,
    fontStyle: 'italic',
  },
  retireWithdrawGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 14,
  },
  retireWithdrawItem: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#F8F9FD',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#F1F3F6',
  },
  retireWithdrawLabel: {
    fontSize: 11,
    color: '#8E8E93',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 6,
  },
  retireWithdrawValue: {
    fontSize: 15,
    color: '#1C1C1E',
    fontWeight: '700',
  },
  retireWithdrawBanner: {
    backgroundColor: 'rgba(52,199,89,0.1)',
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: 'rgba(52,199,89,0.25)',
    marginBottom: 12,
  },
  retireWithdrawBannerText: {
    fontSize: 13,
    color: '#3C3C43',
    lineHeight: 19,
  },
  retireDisclaimer: {
    fontSize: 11,
    color: '#8E8E93',
    textAlign: 'center',
    fontStyle: 'italic',
    lineHeight: 16,
  },
  retireScenarioRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
    flexWrap: 'wrap',
  },
  retireScenarioBtn: {
    flex: 1,
    minWidth: '20%',
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E5E5EA',
    paddingVertical: 9,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retireScenarioBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#3C3C43',
    textAlign: 'center',
  },
  retireScenarioSummary: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    backgroundColor: '#F1F3F6',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 12,
  },
  retireScenarioSummaryItem: {
    fontSize: 12,
    color: '#8E8E93',
    fontWeight: '400',
    minWidth: '40%',
    flex: 1,
  },
  btcChartsHeader: {
    backgroundColor: '#F7931A',
    paddingTop: 16,
    paddingBottom: 16,
    paddingHorizontal: 22,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#F7931A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  btcChartsHeaderTitle: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  btcChartsHeaderPrice: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  btcSummaryCard: {
    backgroundColor: '#1C1C1E',
    borderRadius: 18,
    padding: 18,
    marginBottom: 18,
  },
  btcSummaryRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
  },
  btcSummaryItem: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    padding: 12,
  },
  btcSummaryLabel: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  btcSummaryValue: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  btcPnLBanner: {
    borderRadius: 12,
    padding: 14,
    marginTop: 4,
  },
  btcPnLGain: {
    backgroundColor: 'rgba(52,199,89,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(52,199,89,0.3)',
  },
  btcPnLLoss: {
    backgroundColor: 'rgba(255,59,48,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,59,48,0.3)',
  },
  btcPnLLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 6,
  },
  btcPnLValue: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
  },
  btcPnLPct: {
    color: '#34C759',
    fontSize: 16,
    fontWeight: '700',
  },
  btcPnLBrl: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    marginTop: 6,
  },
  dcaCompareContainer: {
    marginTop: 8,
  },
  dcaBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  dcaBarLabel: {
    width: 52,
    fontSize: 12,
    color: '#8E8E93',
    fontWeight: '600',
  },
  dcaBarTrack: {
    flex: 1,
    height: 14,
    backgroundColor: '#F1F3F6',
    borderRadius: 7,
    overflow: 'hidden',
  },
  dcaBarFill: {
    height: 14,
    borderRadius: 7,
  },
  dcaBarValue: {
    width: 80,
    fontSize: 12,
    color: '#1C1C1E',
    fontWeight: '700',
    textAlign: 'right',
  },
  dcaGapBadge: {
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  dcaGapText: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 8,
  },
  statsItem: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#F8F9FD',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#F1F3F6',
  },
  statsLabel: {
    fontSize: 11,
    color: '#8E8E93',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  statsValue: {
    fontSize: 14,
    color: '#1C1C1E',
    fontWeight: '700',
  },
  chartCard: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 18,
    marginBottom: 18,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: '#F1F3F6',
  },
  chartTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1C1C1E',
    marginBottom: 4,
  },
  chartSubtitle: {
    fontSize: 12,
    color: '#8E8E93',
    marginBottom: 14,
  },
  chartEmpty: {
    color: '#8E8E93',
    textAlign: 'center',
    paddingVertical: 20,
    fontStyle: 'italic',
  },
  stackedBar: {
    flexDirection: 'row',
    height: 20,
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 14,
    marginTop: 10,
  },
  stackedBarSegment: {
    height: '100%',
  },
  chartLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendText: {
    fontSize: 13,
    color: '#3C3C43',
    fontWeight: '600',
  },
  legendPct: {
    fontSize: 12,
    color: '#8E8E93',
  },
  perfRow: {
    marginBottom: 14,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F3F6',
  },
  perfHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  perfCoin: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1C1C1E',
  },
  perfPriceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  perfPriceLabel: {
    fontSize: 12,
    color: '#8E8E93',
  },
  perfPriceVal: {
    fontWeight: '600',
    color: '#1C1C1E',
  },
  perfBarTrack: {
    height: 8,
    backgroundColor: '#F1F3F6',
    borderRadius: 4,
    overflow: 'hidden',
  },
  perfBarFill: {
    height: 8,
    borderRadius: 4,
  },
  perfPct: {
    fontSize: 15,
    fontWeight: '800',
  },
  perfGain: {
    color: '#34C759',
  },
  perfLoss: {
    color: '#FF3B30',
  },
  perfNoData: {
    fontSize: 12,
    color: '#8E8E93',
    fontStyle: 'italic',
  },
  barChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingVertical: 4,
    gap: 6,
  },
  barItem: {
    width: 50,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  barTopLabel: {
    fontSize: 9,
    color: '#8E8E93',
    textAlign: 'center',
    marginBottom: 3,
  },
  barFill: {
    width: 32,
    borderRadius: 4,
    minHeight: 4,
  },
  barBottomLabel: {
    fontSize: 9,
    color: '#8E8E93',
    textAlign: 'center',
    marginTop: 4,
  },
});





