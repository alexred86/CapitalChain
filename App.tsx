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
}

const STORAGE_KEY = '@crypto_purchases';
const SALES_STORAGE_KEY = '@crypto_sales';
const TAX_LOSSES_KEY = '@crypto_tax_losses';

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
  const [screen, setScreen] = useState<'home' | 'add' | 'sell' | 'history' | 'taxes'>('home');
  const [purchases, setPurchases] = useState<CryptoPurchase[]>([]);
  const [sales, setSales] = useState<CryptoSale[]>([]);
  const [taxLosses, setTaxLosses] = useState<{[year: string]: number}>({});
  const [expandedYears, setExpandedYears] = useState<{[year: string]: boolean}>({});
  const [taxViewMode, setTaxViewMode] = useState<'years' | 'months'>('years');
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
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [showTaxCalculator, setShowTaxCalculator] = useState(false);
  const [calcCoin, setCalcCoin] = useState('');
  const [calcQuantity, setCalcQuantity] = useState('');
  const [calcSellPrice, setCalcSellPrice] = useState('');
  const [currentDollarRate, setCurrentDollarRate] = useState<number | null>(null);

  useEffect(() => {
    checkBiometricSupport();
    loadData();
    fetchDollarRate(); // Buscar cotação do dólar ao iniciar
  }, []);

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
      const today = new Date();
      const dateStr = today.toISOString().split('T')[0].replace(/-/g, '');
      const response = await fetch(
        `https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarDia(dataCotacao=@dataCotacao)?@dataCotacao='${dateStr}'&$format=json`
      );
      const data = await response.json();
      if (data.value && data.value.length > 0) {
        const rate = data.value[0].cotacaoVenda;
        setCurrentDollarRate(rate);
        setDollarRate(rate.toFixed(2).replace('.', ','));
        setSellDollarRate(rate.toFixed(2).replace('.', ','));
        return rate;
      }
    } catch (error) {
      console.error('Erro ao buscar cotação:', error);
    }
    return null;
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
      // Exportar relatório RF como texto compartilhável (expo-print removido por incompatibilidade)
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
      const coinPatrimony = new Map<string, { quantity: number; averageCost: number }>();
      
      // Processar compras até a data alvo
      purchases.forEach((p) => {
        const purchaseDate = new Date(p.date);
        if (purchaseDate <= targetDate) {
          const existing = coinPatrimony.get(p.coin) || { quantity: 0, averageCost: 0 };
          const newQuantity = existing.quantity + p.quantity;
          
          if (newQuantity > 0) {
            const newAverageCost = ((existing.averageCost * existing.quantity) + (p.pricePaid * p.dollarRate)) / newQuantity;
            coinPatrimony.set(p.coin, { quantity: newQuantity, averageCost: newAverageCost });
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
        .filter(s => s.coin === coinUpper)
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

      const newSale: CryptoSale = {
        id: Date.now().toString(),
        coin: coinUpper,
        quantity: qty,
        priceSold: price,
        date: sellDate.toISOString(),
        pricePerUnit: price / qty,
        dollarRate: dRate,
        profit: profit,
        ...(sellAttachment && { attachment: sellAttachment }),
      };

      const updated = [...sales, newSale];
      await saveSales(updated);
      setSales(updated);

      // Atualizar prejuízos fiscais após nova venda
      const tempTaxData = calculateTaxReport();
      if (tempTaxData.newTaxLosses && Object.keys(tempTaxData.newTaxLosses).length > 0) {
        await saveTaxLosses(tempTaxData.newTaxLosses);
      }

      Alert.alert(
        'Sucesso!',
        `Venda registrada!\n${profit >= 0 ? 'Lucro' : 'Prejuízo'}: ${formatCurrency(Math.abs(profit))}`
      );

      setSellCoin('');
      setSellQuantity('');
      setSellPrice('');
      setSellDollarRate('');
      setSellDate(new Date());
      setSellAttachment(null);
      setScreen('home');
    } catch (error) {
      Alert.alert('Erro', 'Não foi possível registrar a venda');
      console.error(error);
    }
  };

  const handleDelete = async (id: string) => {
    Alert.alert('Confirmar', 'Deseja excluir esta compra?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Excluir',
        style: 'destructive',
        onPress: async () => {
          try {
            const updated = purchases.filter((p) => p.id !== id);
            await savePurchases(updated);
            setPurchases(updated);
            
            // Recalcular impostos após deletar compra
            const tempTaxData = calculateTaxReport();
            if (tempTaxData.newTaxLosses && Object.keys(tempTaxData.newTaxLosses).length > 0) {
              await saveTaxLosses(tempTaxData.newTaxLosses);
            }
            
            Alert.alert('Sucesso', 'Compra excluída!');
          } catch (error) {
            Alert.alert('Erro', 'Não foi possível excluir');
          }
        },
      },
    ]);
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
        version: '1.0',
        exportDate: new Date().toISOString(),
        purchases: purchases,
        sales: sales,
      };
      
      const backupString = JSON.stringify(backup, null, 2);
      setBackupData(backupString);
      setShowBackupModal(true);
    } catch (error) {
      console.error('Erro ao exportar backup:', error);
      Alert.alert('Erro', 'Não foi possível gerar o backup');
    }
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
        await Share.share({
          message: `💾 Backup CapitalChain\n\nData: ${new Date().toLocaleDateString()}\n${purchases.length} compras e ${sales.length} vendas\n\n${backupData}`,
          title: 'Backup CapitalChain'
        });
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

      Alert.alert(
        'Confirmar Importação',
        `Isso irá importar:\n• ${backup.purchases.length} compra(s)\n• ${backup.sales.length} venda(s)\n\nDeseja mesclar com dados existentes ou substituir tudo?`,
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
        onPress={() => setHideValues(!hideValues)}
      >
        <Text style={styles.hideButtonText}>{hideValues ? '👁' : '👁️'}</Text>
      </TouchableOpacity>
    </View>
  );

  const renderTabBar = () => (
    <View style={styles.tabBar}>
      <TouchableOpacity style={styles.tab} onPress={() => setScreen('home')}>
        <Text style={screen === 'home' ? styles.tabTextActive : styles.tabText}>
          🏠{'\n'}Início
        </Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.tab} onPress={() => setScreen('add')}>
        <Text style={screen === 'add' ? styles.tabTextActive : styles.tabText}>
          ➕{'\n'}Comprar
        </Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.tab} onPress={() => setScreen('sell')}>
        <Text style={screen === 'sell' ? styles.tabTextActive : styles.tabText}>
          💱{'\n'}Vender
        </Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.tab} onPress={() => setScreen('history')}>
        <Text style={screen === 'history' ? styles.tabTextActive : styles.tabText}>
          📋{'\n'}Histórico
        </Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.tab} onPress={() => setScreen('taxes')}>
        <Text style={screen === 'taxes' ? styles.tabTextActive : styles.tabText}>
          💼{'\n'}Impostos
        </Text>
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

    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>CapitalChain</Text>
            <View style={styles.totalCard}>
              <Text style={styles.totalLabel}>Total Investido</Text>
              <Text style={styles.totalValue}>{hideValues ? '$ ****' : formatCurrency(totalInvested)}</Text>
            </View>
          </View>
          <TouchableOpacity 
            style={styles.hideButton} 
            onPress={() => setHideValues(!hideValues)}
          >
            <Text style={styles.hideButtonText}>{hideValues ? '👁' : '👁️'}</Text>
          </TouchableOpacity>
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
          
          <TouchableOpacity style={styles.backupButton} onPress={exportBackup}>
            <Text style={styles.backupButtonText}>💾 Backup/Restaurar Dados</Text>
          </TouchableOpacity>
          
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

    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Vender Cripto</Text>
        </View>

        <ScrollView style={styles.content}>
          {availableCoins.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyText}>Nenhuma criptomoeda disponível</Text>
              <Text style={styles.emptySubtext}>
                Compre criptomoedas primeiro para poder vender
              </Text>
            </View>
          ) : (
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
                <Text style={styles.saveButtonText}>✅ Registrar Venda</Text>
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
      </SafeAreaView>
    );
  }

  // TAXES
  if (screen === 'taxes') {
    const taxData = calculateTaxReport();
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth() + 1; // 1-12
    const isDeclarationPeriod = currentMonth >= 1 && currentMonth <= 4;
    
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
                        {/* Bens e Direitos */}
                        <View style={styles.detailSection}>
                          <Text style={styles.detailSectionTitle}>🏠 Bens e Direitos (31/12)</Text>
                          <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>Ano Anterior ({parseInt(year.year) - 1}):</Text>
                            <Text style={styles.detailValue}>{formatCurrency(year.patrimonyStart)}</Text>
                          </View>
                          <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>Ano Atual ({year.year}):</Text>
                            <Text style={styles.detailValue}>{formatCurrency(year.patrimonyEnd)}</Text>
                          </View>
                          <View style={styles.detailRow}>
                            <Text style={styles.detailLabelBold}>Variação:</Text>
                            <Text style={[
                              styles.detailValueBold,
                              (year.patrimonyEnd - year.patrimonyStart) >= 0 ? styles.profit : styles.loss
                            ]}>
                              {formatCurrency(year.patrimonyEnd - year.patrimonyStart)}
                            </Text>
                          </View>
                          
                          {/* Ativos detalhados */}
                          {year.patrimonyEndAssets && year.patrimonyEndAssets.length > 0 && (
                            <View style={styles.assetsDetail}>
                              <Text style={styles.assetsDetailTitle}>Criptoativos em 31/12/{year.year}:</Text>
                              {year.patrimonyEndAssets.map((asset: any, idx: number) => (
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
                                    year.patrimonyEndAssets.forEach((asset: any) => {
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
                                          const prevValue = prev ? prev.totalCost : 0;
                                          fullText += `${asset.coin} — (Código ${code})\n`;
                                          fullText += `Situação em 31/12/${prevYear}: ${formatCurrency(prevValue)}\n`;
                                          fullText += `Situação em 31/12/${year.year}: ${formatCurrency(asset.totalCost)}\n`;
                                          fullText += `Aquisição de ${formatQuantity(asset.quantity)} ${asset.coin} realizada ao longo de ${year.year} em corretora internacional, utilizando USDT e recursos próprios. Valores convertidos para BRL conforme cotação do dólar da data de aquisição (R$ 5,33), incluindo taxas de rede e saque. Ativos mantidos em custódia própria (carteira digital).\n\n`;
                                        });
                                      } else if (code === '08.03') {
                                        const totalValue = assets.reduce((sum, a) => sum + a.totalCost, 0);
                                        const totalPrevValue = assets.reduce((sum, a) => {
                                          const prev = year.patrimonyStartAssets?.find((p: any) => p.coin === a.coin);
                                          return sum + (prev ? prev.totalCost : 0);
                                        }, 0);
                                        const coinList = assets.map(a => a.coin).join(', ');
                                        fullText += `Stablecoins — (Código ${code})\n`;
                                        fullText += `Situação em 31/12/${prevYear}: ${formatCurrency(totalPrevValue)}\n`;
                                        fullText += `Situação em 31/12/${year.year}: ${formatCurrency(totalValue)}\n`;
                                        fullText += `Conjunto de stablecoins (${coinList}) adquiridas em corretoras internacionais com recursos próprios e mantidas em custódia própria (carteira digital). Valores convertidos para BRL conforme cotação do dólar (R$ 5,33) das datas de aquisição, já incluindo taxas de rede e saque.\n\n`;
                                      } else if (code === '08.02') {
                                        const bigAssets = assets.filter(a => a.totalCost >= 5000);
                                        const smallAssets = assets.filter(a => a.totalCost < 5000);
                                        
                                        bigAssets.forEach((asset) => {
                                          const prev = year.patrimonyStartAssets?.find((p: any) => p.coin === asset.coin);
                                          const prevValue = prev ? prev.totalCost : 0;
                                          fullText += `${asset.coin} — (Código ${code})\n`;
                                          fullText += `Situação em 31/12/${prevYear}: ${formatCurrency(prevValue)}\n`;
                                          fullText += `Situação em 31/12/${year.year}: ${formatCurrency(asset.totalCost)}\n`;
                                          fullText += `Aquisição de ${formatQuantity(asset.quantity)} ${asset.coin} realizada ao longo de ${year.year} em corretora internacional, utilizando USDT e recursos próprios. Valores convertidos para BRL conforme cotação do dólar da data de aquisição (R$ 5,33), incluindo taxas de rede e saque. Ativos mantidos em custódia própria (carteira digital).\n\n`;
                                        });
                                        
                                        if (smallAssets.length > 0) {
                                          const totalValue = smallAssets.reduce((sum, a) => sum + a.totalCost, 0);
                                          const totalPrevValue = smallAssets.reduce((sum, a) => {
                                            const prev = year.patrimonyStartAssets?.find((p: any) => p.coin === a.coin);
                                            return sum + (prev ? prev.totalCost : 0);
                                          }, 0);
                                          const coinList = smallAssets.map(a => a.coin).join(', ');
                                          fullText += `Outras moedas digitais com custo < R$ 5.000 (CONSOLIDADAS) — (Código ${code})\n`;
                                          fullText += `Situação em 31/12/${prevYear}: ${formatCurrency(totalPrevValue)}\n`;
                                          fullText += `Situação em 31/12/${year.year}: ${formatCurrency(totalValue)}\n`;
                                          fullText += `Conjunto de criptoativos classificados como "outras moedas digitais", adquiridos em corretoras internacionais com recursos próprios e mantidos em custódia própria. Inclui: ${coinList}. Todos os ativos possuem custo individual inferior a R$ 5.000. Valores convertidos para BRL conforme cotação do dólar (R$ 5,33) das datas de aquisição, já incluindo taxas de rede e saque.\n\n`;
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
                                year.patrimonyEndAssets.forEach((asset: any) => {
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
                                      const prevValue = prevYearAsset ? prevYearAsset.totalCost : 0;
                                      
                                      renderItems.push(
                                        <View key={`${code}-${idx}`} style={styles.assetItem}>
                                          <Text style={[styles.assetCoin, { color: '#667eea' }]}>
                                            {asset.coin} — (Código {code})
                                          </Text>
                                          <Text style={styles.assetQuantity}>
                                            Situação em 31/12/{prevYear}: {formatCurrency(prevValue)}
                                          </Text>
                                          <Text style={styles.assetCost}>
                                            Situação em 31/12/{year.year}: {formatCurrency(asset.totalCost)}
                                          </Text>
                                          <Text style={styles.declarationReason}>
                                            Aquisição de {formatQuantity(asset.quantity)} {asset.coin} realizada ao longo de {year.year} em corretora internacional, utilizando USDT e recursos próprios. Valores convertidos para BRL conforme cotação do dólar da data de aquisição (R$ 5,33), incluindo taxas de rede e saque. Ativos mantidos em custódia própria (carteira digital).
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
                                      return sum + (prev ? prev.totalCost : 0);
                                    }, 0);
                                    const coinList = assets.map(a => a.coin).join(', ');
                                    
                                    renderItems.push(
                                      <View key={`${code}-consolidated`} style={styles.assetItem}>
                                        <Text style={[styles.assetCoin, { color: '#667eea' }]}>
                                          Stablecoins — (Código {code})
                                        </Text>
                                        <Text style={styles.assetQuantity}>
                                          Situação em 31/12/{prevYear}: {formatCurrency(totalPrevValue)}
                                        </Text>
                                        <Text style={styles.assetCost}>
                                          Situação em 31/12/{year.year}: {formatCurrency(totalValue)}
                                        </Text>
                                        <Text style={styles.declarationReason}>
                                          Conjunto de stablecoins ({coinList}) adquiridas em corretoras internacionais com recursos próprios e mantidas em custódia própria (carteira digital). Valores convertidos para BRL conforme cotação do dólar (R$ 5,33) das datas de aquisição, já incluindo taxas de rede e saque.
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
                                      const prevValue = prevYearAsset ? prevYearAsset.totalCost : 0;
                                      
                                      renderItems.push(
                                        <View key={`${code}-big-${idx}`} style={styles.assetItem}>
                                          <Text style={[styles.assetCoin, { color: '#667eea' }]}>
                                            {asset.coin} — (Código {code})
                                          </Text>
                                          <Text style={styles.assetQuantity}>
                                            Situação em 31/12/{prevYear}: {formatCurrency(prevValue)}
                                          </Text>
                                          <Text style={styles.assetCost}>
                                            Situação em 31/12/{year.year}: {formatCurrency(asset.totalCost)}
                                          </Text>
                                          <Text style={styles.declarationReason}>
                                            Aquisição de {formatQuantity(asset.quantity)} {asset.coin} realizada ao longo de {year.year} em corretora internacional, utilizando USDT e recursos próprios. Valores convertidos para BRL conforme cotação do dólar da data de aquisição (R$ 5,33), incluindo taxas de rede e saque. Ativos mantidos em custódia própria (carteira digital).
                                          </Text>
                                        </View>
                                      );
                                    });
                                    
                                    // Consolidar pequenas
                                    if (smallAssets.length > 0) {
                                      const totalValue = smallAssets.reduce((sum, a) => sum + a.totalCost, 0);
                                      const totalPrevValue = smallAssets.reduce((sum, a) => {
                                        const prev = year.patrimonyStartAssets?.find((p: any) => p.coin === a.coin);
                                        return sum + (prev ? prev.totalCost : 0);
                                      }, 0);
                                      const coinList = smallAssets.map(a => a.coin).join(', ');
                                      
                                      renderItems.push(
                                        <View key={`${code}-small-consolidated`} style={styles.assetItem}>
                                          <Text style={[styles.assetCoin, { color: '#667eea' }]}>
                                            Outras moedas digitais com custo {'<'} R$ 5.000 (CONSOLIDADAS) — (Código {code})
                                          </Text>
                                          <Text style={styles.assetQuantity}>
                                            Situação em 31/12/{prevYear}: {formatCurrency(totalPrevValue)}
                                          </Text>
                                          <Text style={styles.assetCost}>
                                            Situação em 31/12/{year.year}: {formatCurrency(totalValue)}
                                          </Text>
                                          <Text style={styles.declarationReason}>
                                            Conjunto de criptoativos classificados como "outras moedas digitais", adquiridos em corretoras internacionais com recursos próprios e mantidos em custódia própria. Inclui: {coinList}. Todos os ativos possuem custo individual inferior a R$ 5.000. Valores convertidos para BRL conforme cotação do dólar (R$ 5,33) das datas de aquisição, já incluindo taxas de rede e saque.
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

      <ScrollView style={styles.list}>
        {/* Compras */}
        {(transactionType === 'all' || transactionType === 'purchases') && (
          <View>
            {sortedPurchases.length > 0 && transactionType === 'all' && (
              <Text style={styles.transactionTypeHeader}>🛒 COMPRAS</Text>
            )}
            {sortedPurchases.map((item) => (
              <View key={`purchase-${item.id}`} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderLeft}>
                    <Text style={styles.transactionType}>🛒 COMPRA</Text>
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
              <View key={`sale-${item.id}`} style={[styles.card, styles.saleCard]}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderLeft}>
                    <Text style={styles.transactionTypeSale}>💱 VENDA</Text>
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
                
                {item.attachment && (
                  <TouchableOpacity 
                    style={styles.viewAttachmentButton}
                    onPress={() => viewAttachment(item.attachment!)}
                  >
                    <Text style={styles.viewAttachmentButtonText}>📷 Ver Comprovante</Text>
                  </TouchableOpacity>
                )}
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
  content: {
    flex: 1,
    padding: 18,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
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
    marginTop: 16,
    gap: 12,
  },
  editButton: {
    flex: 1,
    backgroundColor: '#007AFF',
    padding: 14,
    borderRadius: 12,
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
    padding: 14,
    borderRadius: 12,
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
    borderTopWidth: 0,
    paddingTop: 12,
    paddingBottom: 28,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  tabText: {
    fontSize: 11,
    color: '#8E8E93',
    textAlign: 'center',
    fontWeight: '500',
    marginTop: 4,
  },
  tabTextActive: {
    fontSize: 11,
    color: '#667eea',
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 4,
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
    gap: 12,
    marginTop: 8,
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
    gap: 12,
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
    gap: 12,
    marginVertical: 18,
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
    marginBottom: 18,
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
    padding: 18,
    marginBottom: 18,
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
    padding: 18,
    marginTop: 14,
    marginBottom: 6,
  },
  detailSection: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 14,
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
    fontSize: 14,
    color: '#636366',
    marginBottom: 6,
    lineHeight: 20,
    fontWeight: '500',
  },
  assetsDetail: {
    marginTop: 14,
    padding: 14,
    backgroundColor: '#F8F9FD',
    borderRadius: 12,
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
    padding: 14,
    borderRadius: 10,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#667eea',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
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
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  copyButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
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
    gap: 12,
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
    marginTop: 16,
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
});





