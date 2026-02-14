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
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';

interface CryptoPurchase {
  id: string;
  coin: string;
  quantity: number;
  pricePaid: number;
  date: string;
  pricePerUnit: number;
  dollarRate: number;
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
}

const STORAGE_KEY = '@crypto_purchases';
const SALES_STORAGE_KEY = '@crypto_sales';

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value);
};

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  return date.toLocaleDateString('pt-BR');
};

export default function App() {
  const [screen, setScreen] = useState<'home' | 'add' | 'sell' | 'history'>('home');
  const [purchases, setPurchases] = useState<CryptoPurchase[]>([]);
  const [sales, setSales] = useState<CryptoSale[]>([]);
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

  useEffect(() => {
    checkBiometricSupport();
    loadData();
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

    const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    const firstDay = new Date(date.getFullYear(), date.getMonth(), 1).getDay();
    const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    
    const days = [];
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(i);
    }

    return (
      <Modal transparent visible={visible} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.datePickerContainer}>
            <View style={styles.datePickerHeader}>
              <TouchableOpacity onPress={() => {
                const newDate = new Date(date);
                newDate.setMonth(date.getMonth() - 1);
                onDateChange(newDate);
              }}>
                <Text style={styles.datePickerNav}>◀</Text>
              </TouchableOpacity>
              <Text style={styles.datePickerTitle}>{monthNames[date.getMonth()]} {date.getFullYear()}</Text>
              <TouchableOpacity onPress={() => {
                const newDate = new Date(date);
                newDate.setMonth(date.getMonth() + 1);
                onDateChange(newDate);
              }}>
                <Text style={styles.datePickerNav}>▶</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.calendarGrid}>
              {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((day, i) => (
                <Text key={i} style={styles.weekDay}>{day}</Text>
              ))}
              {days.map((day, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.calendarDay,
                    day === date.getDate() && styles.calendarDaySelected,
                    !day && styles.calendarDayEmpty,
                  ]}
                  onPress={() => {
                    if (day) {
                      const newDate = new Date(date);
                      newDate.setDate(day);
                      onDateChange(newDate);
                    }
                  }}
                  disabled={!day}
                >
                  <Text style={[
                    styles.calendarDayText,
                    day === date.getDate() && styles.calendarDayTextSelected,
                  ]}>
                    {day || ''}
                  </Text>
                </TouchableOpacity>
              ))}
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
              }
            : p
        );
        await savePurchases(updated);
        setPurchases(updated);
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
        };
        const updated = [...purchases, newPurchase];
        await savePurchases(updated);
        setPurchases(updated);
        Alert.alert('Sucesso!', 'Compra registrada com sucesso!');
      }

      setCoin('');
      setQuantity('');
      setPricePaid('');
      setDollarRate('');
      setPurchaseDate(new Date());
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
          `Você só tem ${available.toFixed(8)} ${coinUpper} disponível para vender.`
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
      };

      const updated = [...sales, newSale];
      await saveSales(updated);
      setSales(updated);

      Alert.alert(
        'Sucesso!',
        `Venda registrada!\n${profit >= 0 ? 'Lucro' : 'Prejuízo'}: ${formatCurrency(Math.abs(profit))}`
      );

      setSellCoin('');
      setSellQuantity('');
      setSellPrice('');
      setSellDollarRate('');
      setSellDate(new Date());
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
        content += '💰 RESUMO DE COMPRAS:\n';
        content += '-'.repeat(50) + '\n';
        purchaseSummary.forEach(item => {
          content += `\n${item.coin}\n`;
          content += `  Quantidade Comprada: ${item.totalQuantity.toFixed(8)}\n`;
          content += `  Preço Médio: ${formatCurrency(item.averagePrice)}\n`;
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
        content += '💸 RESUMO DE VENDAS:\n';
        content += '-'.repeat(50) + '\n';
        salesSummary.forEach(item => {
          content += `\n${item.coin}\n`;
          content += `  Quantidade Vendida: ${item.totalSold.toFixed(8)}\n`;
          content += `  Preço Médio de Venda: ${formatCurrency(item.averageSalePrice)}\n`;
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
        content += '📝 COMPRAS DETALHADAS:\n';
        content += '-'.repeat(50) + '\n';
        const sortedPurchases = [...filteredPurchases].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        sortedPurchases.forEach((purchase, index) => {
          content += `\n${index + 1}. ${formatDate(purchase.date)} - ${purchase.coin}\n`;
          content += `   Quantidade: ${purchase.quantity}\n`;
          content += `   Valor Pago: ${formatCurrency(purchase.pricePaid)}\n`;
          content += `   Preço Unit.: ${formatCurrency(purchase.pricePerUnit)}\n`;
          content += `   Dólar: R$ ${purchase.dollarRate.toFixed(2)}\n`;
          content += `   Custo R$: R$ ${(purchase.pricePaid * purchase.dollarRate).toFixed(2)}\n`;
        });
        content += '\n';
      }
      
      // Vendas detalhadas
      if ((transactionType === 'all' || transactionType === 'sales') && filteredSales.length > 0) {
        content += '💰 VENDAS DETALHADAS:\n';
        content += '-'.repeat(50) + '\n';
        const sortedSales = [...filteredSales].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        sortedSales.forEach((sale, index) => {
          content += `\n${index + 1}. ${formatDate(sale.date)} - ${sale.coin}\n`;
          content += `   Quantidade: ${sale.quantity}\n`;
          content += `   Valor Recebido: ${formatCurrency(sale.priceSold)}\n`;
          content += `   Preço Unit.: ${formatCurrency(sale.pricePerUnit)}\n`;
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
          💸{'\n'}Vender
        </Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.tab} onPress={() => setScreen('history')}>
        <Text style={screen === 'history' ? styles.tabTextActive : styles.tabText}>
          📋{'\n'}Histórico
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
            <Text style={styles.authButtonIcon}>👆</Text>
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
          <Text style={styles.headerTitle}>CapitalChain</Text>
          <View style={styles.totalCard}>
            <Text style={styles.totalLabel}>Total Investido</Text>
            <Text style={styles.totalValue}>{formatCurrency(totalInvested)}</Text>
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
                  <Text style={[styles.value, styles.availableQuantity]}>{item.available.toFixed(8)}</Text>
                </View>
                {item.sold > 0 && (
                  <View style={styles.row}>
                    <Text style={styles.label}>Vendido:</Text>
                    <Text style={styles.value}>{item.sold.toFixed(8)}</Text>
                  </View>
                )}
                <View style={styles.row}>
                  <Text style={styles.label}>Investido:</Text>
                  <Text style={styles.value}>{formatCurrency(item.totalInvested)}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.label}>Preço Médio:</Text>
                  <Text style={styles.value}>{formatCurrency(item.averagePrice)}</Text>
                </View>
                {item.totalProfit !== 0 && (
                  <View style={styles.row}>
                    <Text style={styles.label}>{item.totalProfit >= 0 ? 'Lucro:' : 'Prejuízo:'}</Text>
                    <Text style={[styles.value, item.totalProfit >= 0 ? styles.profit : styles.loss]}>
                      {formatCurrency(Math.abs(item.totalProfit))}
                    </Text>
                  </View>
                )}
                <Text style={styles.purchaseCount}>{item.count} compra(s)</Text>
              </View>
            ))
          )}
          
          <View style={styles.homeFooter}>
            <Text style={styles.footerText}>
              👨‍💻 Desenvolvido por <Text style={styles.footerName}>@Alexred</Text>
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

          <TouchableOpacity style={styles.saveButton} onPress={handleAddPurchase}>
            <Text style={styles.saveButtonText}>{editingId ? '✏️ Atualizar Compra' : '💾 Salvar Compra'}</Text>
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
                <Text style={styles.availableTitle}>💼 Disponível para Venda:</Text>
                {availableCoins.map(item => (
                  <TouchableOpacity 
                    key={item.coin}
                    style={styles.availableCoinItem}
                    onPress={() => setSellCoin(item.coin)}
                  >
                    <Text style={styles.availableCoinName}>{item.coin}</Text>
                    <Text style={styles.availableCoinQty}>{item.available.toFixed(8)}</Text>
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

              <TouchableOpacity style={styles.sellButton} onPress={handleSellCrypto}>
                <Text style={styles.saveButtonText}>💸 Registrar Venda</Text>
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
              <Text style={styles.summarySubtitle}>💰 Compras</Text>
              {purchaseSummary.map((item) => (
                <View key={`purchase-${item.coin}`} style={styles.summaryCard}>
                  <View style={styles.summaryHeader}>
                    <Text style={styles.summaryCoinName}>{item.coin}</Text>
                    <Text style={styles.summaryCount}>{item.count} compra(s)</Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Quantidade:</Text>
                    <Text style={styles.summaryValue}>{item.totalQuantity.toFixed(8)}</Text>
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
              <Text style={styles.summarySubtitle}>💸 Vendas</Text>
              {salesSummary.map((item) => (
                <View key={`sale-${item.coin}`} style={[styles.summaryCard, styles.salesSummaryCard]}>
                  <View style={styles.summaryHeader}>
                    <Text style={styles.summaryCoinName}>{item.coin}</Text>
                    <Text style={styles.summaryCount}>{item.count} venda(s)</Text>
                  </View>
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Quantidade:</Text>
                    <Text style={styles.summaryValue}>{item.totalSold.toFixed(8)}</Text>
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
              <Text style={styles.transactionTypeHeader}>💰 COMPRAS</Text>
            )}
            {sortedPurchases.map((item) => (
              <View key={`purchase-${item.id}`} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderLeft}>
                    <Text style={styles.transactionType}>💰 COMPRA</Text>
                    <Text style={styles.coinName}>{item.coin}</Text>
                  </View>
                  <Text style={styles.date}>{formatDate(item.date)}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.label}>Quantidade:</Text>
                  <Text style={styles.value}>{item.quantity}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.label}>Valor Pago:</Text>
                  <Text style={styles.value}>{formatCurrency(item.pricePaid)}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.label}>Preço Unitário:</Text>
                  <Text style={styles.value}>{formatCurrency(item.pricePerUnit)}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.label}>Cotação Dólar:</Text>
                  <Text style={styles.value}>R$ {item.dollarRate.toFixed(2)}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.label}>Custo em Reais:</Text>
                  <Text style={styles.value}>R$ {(item.pricePaid * item.dollarRate).toFixed(2)}</Text>
                </View>
                
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
              <Text style={styles.transactionTypeHeader}>💸 VENDAS</Text>
            )}
            {sortedSales.map((item) => (
              <View key={`sale-${item.id}`} style={[styles.card, styles.saleCard]}>
                <View style={styles.cardHeader}>
                  <View style={styles.cardHeaderLeft}>
                    <Text style={styles.transactionTypeSale}>💸 VENDA</Text>
                    <Text style={styles.coinName}>{item.coin}</Text>
                  </View>
                  <Text style={styles.date}>{formatDate(item.date)}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.label}>Quantidade:</Text>
                  <Text style={styles.value}>{item.quantity}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.label}>Valor Recebido:</Text>
                  <Text style={styles.value}>{formatCurrency(item.priceSold)}</Text>
                </View>
                <View style={styles.row}>
                  <Text style={styles.label}>Preço Unitário:</Text>
                  <Text style={styles.value}>{formatCurrency(item.pricePerUnit)}</Text>
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
                📝 Copie o texto acima e cole no Excel, Google Sheets ou Word
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  authContainer: {
    flex: 1,
    backgroundColor: '#6200ea',
  },
  authContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  authIcon: {
    fontSize: 80,
    marginBottom: 30,
  },
  authTitle: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 10,
  },
  authSubtitle: {
    fontSize: 16,
    color: '#fff',
    opacity: 0.9,
    marginBottom: 50,
  },
  authButton: {
    backgroundColor: '#fff',
    paddingVertical: 18,
    paddingHorizontal: 40,
    borderRadius: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
  },
  authButtonIcon: {
    fontSize: 24,
  },
  authButtonText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#6200ea',
  },
  authHint: {
    fontSize: 12,
    color: '#fff',
    opacity: 0.7,
    marginTop: 20,
    textAlign: 'center',
  },
  developerCredit: {
    position: 'absolute',
    bottom: 30,
    alignItems: 'center',
  },
  developerText: {
    fontSize: 11,
    color: '#fff',
    opacity: 0.6,
  },
  developerName: {
    fontSize: 13,
    color: '#fff',
    fontWeight: 'bold',
    marginTop: 5,
  },
  homeFooter: {
    marginTop: 30,
    marginBottom: 20,
    padding: 15,
    backgroundColor: '#e8eaf6',
    borderRadius: 8,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#666',
  },
  footerName: {
    fontWeight: 'bold',
    color: '#6200ea',
  },
  developerCredit: {
    position: 'absolute',
    bottom: 30,
    alignItems: 'center',
  },
  developerText: {
    fontSize: 11,
    color: '#fff',
    opacity: 0.6,
  },
  developerName: {
    fontSize: 13,
    color: '#fff',
    fontWeight: 'bold',
    marginTop: 5,
  },
  homeFooter: {
    marginTop: 30,
    marginBottom: 20,
    padding: 15,
    backgroundColor: '#e8eaf6',
    borderRadius: 8,
    alignItems: 'center',
  },
  footerText: {
    fontSize: 12,
    color: '#666',
  },
  footerName: {
    fontWeight: 'bold',
    color: '#6200ea',
  },
  availableQuantity: {
    color: '#4caf50',
    fontWeight: 'bold',
  },
  profit: {
    color: '#4caf50',
    fontWeight: 'bold',
  },
  loss: {
    color: '#f44336',
    fontWeight: 'bold',
  },
  availableCoinsCard: {
    backgroundColor: '#e8f5e9',
    borderRadius: 12,
    padding: 15,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#4caf50',
  },
  availableTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2e7d32',
    marginBottom: 10,
  },
  availableCoinItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 8,
  },
  availableCoinName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  availableCoinQty: {
    fontSize: 14,
    color: '#4caf50',
    fontWeight: '600',
  },
  sellButton: {
    backgroundColor: '#4caf50',
    padding: 18,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 30,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    backgroundColor: '#6200ea',
    padding: 20,
    paddingTop: Platform.OS === 'ios' ? 20 : 40,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.9,
  },
  totalCard: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    padding: 15,
    borderRadius: 10,
    marginTop: 10,
  },
  totalLabel: {
    color: '#fff',
    fontSize: 14,
  },
  totalValue: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 5,
  },
  content: {
    flex: 1,
    padding: 15,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 15,
    marginBottom: 15,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  coinName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  date: {
    fontSize: 14,
    color: '#666',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 5,
  },
  label: {
    fontSize: 14,
    color: '#666',
  },
  value: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  purchaseCount: {
    fontSize: 12,
    color: '#999',
    marginTop: 5,
  },
  deleteHint: {
    fontSize: 11,
    color: '#999',
    textAlign: 'center',
    marginTop: 10,
    fontStyle: 'italic',
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 15,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  infoBox: {
    backgroundColor: '#e8eaf6',
    padding: 15,
    borderRadius: 8,
    marginBottom: 20,
  },
  infoText: {
    fontSize: 14,
    color: '#5c6bc0',
    fontWeight: '600',
    textAlign: 'center',
  },
  saveButton: {
    backgroundColor: '#6200ea',
    padding: 18,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 30,
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  cancelEditButton: {
    backgroundColor: '#fff',
    padding: 18,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 30,
    borderWidth: 1,
    borderColor: '#6200ea',
  },
  cancelEditButtonText: {
    color: '#6200ea',
    fontSize: 16,
    fontWeight: 'bold',
  },
  actionButtons: {
    flexDirection: 'row',
    marginTop: 15,
    gap: 10,
  },
  editButton: {
    flex: 1,
    backgroundColor: '#2196F3',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  editButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  deleteButton: {
    flex: 1,
    backgroundColor: '#f44336',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#ddd',
    paddingTop: 10,
    paddingBottom: 25,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  tabText: {
    fontSize: 11,
    color: '#999',
    textAlign: 'center',
  },
  tabTextActive: {
    fontSize: 11,
    color: '#6200ea',
    fontWeight: 'bold',
    textAlign: 'center',
  },
  emptyState: {
    padding: 40,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#999',
    marginTop: 10,
    textAlign: 'center',
  },
  list: {
    padding: 15,
    paddingBottom: 100,
  },
  filterContainer: {
    backgroundColor: '#fff',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  filterTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
  },
  filterRow: {
    flexDirection: 'row',
    marginBottom: 10,
  },
  filterItem: {
    marginBottom: 5,
  },
  filterLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 5,
  },
  filterInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
    padding: 10,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  coinFilterScroll: {
    flexDirection: 'row',
  },
  coinFilterButton: {
    backgroundColor: '#f5f5f5',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 20,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  coinFilterButtonActive: {
    backgroundColor: '#6200ea',
    borderColor: '#6200ea',
  },
  coinFilterText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
  coinFilterTextActive: {
    color: '#fff',
  },
  filterActionsContainer: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 5,
  },
  clearFilterButton: {
    flex: 1,
    backgroundColor: '#ff9800',
    padding: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  clearFilterText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  exportButton: {
    flex: 1,
    backgroundColor: '#4caf50',
    padding: 10,
    borderRadius: 6,
    alignItems: 'center',
  },
  exportButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  summaryContainer: {
    backgroundColor: '#fff',
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#6200ea',
    marginBottom: 12,
  },
  summaryCard: {
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderLeftColor: '#6200ea',
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  summaryCoinName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  summaryCount: {
    fontSize: 11,
    color: '#666',
    backgroundColor: '#e8eaf6',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  summaryLabel: {
    fontSize: 13,
    color: '#666',
  },
  summaryValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
  },
  summaryValueHighlight: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#6200ea',
  },
  dateButton: {
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
    padding: 12,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  dateButtonText: {
    fontSize: 14,
    color: '#333',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  datePickerContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 20,
    width: '90%',
    maxWidth: 400,
  },
  datePickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  datePickerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  datePickerNav: {
    fontSize: 24,
    color: '#6200ea',
    fontWeight: 'bold',
    padding: 10,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 20,
  },
  weekDay: {
    width: '14.28%',
    textAlign: 'center',
    fontSize: 12,
    fontWeight: 'bold',
    color: '#666',
    marginBottom: 10,
  },
  calendarDay: {
    width: '14.28%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
  },
  calendarDayEmpty: {
    backgroundColor: 'transparent',
  },
  calendarDaySelected: {
    backgroundColor: '#6200ea',
  },
  calendarDayText: {
    fontSize: 14,
    color: '#333',
  },
  calendarDayTextSelected: {
    color: '#fff',
    fontWeight: 'bold',
  },
  datePickerButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  datePickerCancelButton: {
    flex: 1,
    padding: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  datePickerCancelText: {
    color: '#666',
    fontSize: 16,
    fontWeight: 'bold',
  },
  datePickerConfirmButton: {
    flex: 1,
    padding: 15,
    borderRadius: 8,
    backgroundColor: '#6200ea',
    alignItems: 'center',
  },
  datePickerConfirmText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  exportModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  exportModalContainer: {
    backgroundColor: '#fff',
    borderRadius: 12,
    width: '100%',
    maxHeight: '80%',
    overflow: 'hidden',
  },
  exportModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    backgroundColor: '#6200ea',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  exportModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  exportModalClose: {
    fontSize: 24,
    color: '#fff',
    fontWeight: 'bold',
  },
  exportModalContent: {
    maxHeight: 400,
    padding: 20,
  },
  exportModalText: {
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    color: '#333',
    lineHeight: 18,
  },
  exportModalFooter: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: '#ddd',
  },
  exportModalHint: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    marginBottom: 15,
  },
  exportModalButton: {
    backgroundColor: '#6200ea',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  exportModalButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
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
});
