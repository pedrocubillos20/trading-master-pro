// =============================================
// TRADING MASTER PRO - DERIV API SERVICE
// Conexión WebSocket con Deriv para datos en tiempo real
// =============================================

import WebSocket from 'ws';
import EventEmitter from 'events';

const DERIV_WS_URL = 'wss://ws.derivws.com/websockets/v3';

// Índices Sintéticos disponibles
export const SYNTHETIC_INDICES = {
  'R_10': { name: 'Volatility 10 Index', symbol: 'R_10', pip: 0.001 },
  'R_25': { name: 'Volatility 25 Index', symbol: 'R_25', pip: 0.001 },
  'R_50': { name: 'Volatility 50 Index', symbol: 'R_50', pip: 0.0001 },
  'R_75': { name: 'Volatility 75 Index', symbol: 'R_75', pip: 0.0001 },
  'R_100': { name: 'Volatility 100 Index', symbol: 'R_100', pip: 0.01 },
  '1HZ10V': { name: 'Volatility 10 (1s)', symbol: '1HZ10V', pip: 0.001 },
  '1HZ25V': { name: 'Volatility 25 (1s)', symbol: '1HZ25V', pip: 0.001 },
  '1HZ50V': { name: 'Volatility 50 (1s)', symbol: '1HZ50V', pip: 0.0001 },
  '1HZ75V': { name: 'Volatility 75 (1s)', symbol: '1HZ75V', pip: 0.0001 },
  '1HZ100V': { name: 'Volatility 100 (1s)', symbol: '1HZ100V', pip: 0.01 },
  'stpRNG': { name: 'Step Index', symbol: 'stpRNG', pip: 0.1 },
  'BOOM500': { name: 'Boom 500 Index', symbol: 'BOOM500', pip: 0.01 },
  'BOOM1000': { name: 'Boom 1000 Index', symbol: 'BOOM1000', pip: 0.01 },
  'CRASH500': { name: 'Crash 500 Index', symbol: 'CRASH500', pip: 0.01 },
  'CRASH1000': { name: 'Crash 1000 Index', symbol: 'CRASH1000', pip: 0.01 },
  'JD10': { name: 'Jump 10 Index', symbol: 'JD10', pip: 0.01 },
  'JD25': { name: 'Jump 25 Index', symbol: 'JD25', pip: 0.01 },
  'JD50': { name: 'Jump 50 Index', symbol: 'JD50', pip: 0.01 },
  'JD75': { name: 'Jump 75 Index', symbol: 'JD75', pip: 0.01 },
  'JD100': { name: 'Jump 100 Index', symbol: 'JD100', pip: 0.01 },
};

export const TIMEFRAMES = {
  M1: 60,
  M5: 300,
  M15: 900,
  M30: 1800,
  H1: 3600,
  H4: 14400,
  D1: 86400,
};

class DerivAPIService extends EventEmitter {
  constructor(appId) {
    super();
    this.appId = appId;
    this.ws = null;
    this.isConnected = false;
    this.subscriptions = new Map();
    this.candleData = new Map();
    this.tickData = new Map();
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.pingInterval = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const url = `${DERIV_WS_URL}?app_id=${this.appId}`;
      console.log('🔌 Conectando a Deriv API...');
      this.ws = new WebSocket(url);

      this.ws.on('open', () => {
        console.log('✅ Conectado a Deriv API');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.startPing();
        this.emit('connected');
        resolve(true);
      });

      this.ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(message);
        } catch (e) {
          console.error('Error parsing message:', e);
        }
      });

      this.ws.on('close', () => {
        console.log('❌ Desconectado de Deriv API');
        this.isConnected = false;
        this.stopPing();
        this.emit('disconnected');
        this.attemptReconnect();
      });

      this.ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.emit('error', error);
        reject(error);
      });
    });
  }

  startPing() {
    this.pingInterval = setInterval(() => {
      if (this.isConnected) this.send({ ping: 1 });
    }, 30000);
  }

  stopPing() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  attemptReconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`🔄 Reconectando... intento ${this.reconnectAttempts}`);
      setTimeout(() => this.connect(), 5000);
    }
  }

  send(data) {
    if (this.ws && this.isConnected) {
      this.ws.send(JSON.stringify(data));
    }
  }

  handleMessage(message) {
    if (message.ping) { this.send({ pong: 1 }); return; }
    if (message.error) { this.emit('api_error', message.error); return; }
    if (message.tick) this.handleTick(message.tick);
    if (message.ohlc) this.handleOHLC(message.ohlc);
    if (message.candles) this.handleCandleHistory(message);
    if (message.active_symbols) this.emit('active_symbols', message.active_symbols);
  }

  handleTick(tick) {
    const symbol = tick.symbol;
    if (!this.tickData.has(symbol)) this.tickData.set(symbol, []);
    const ticks = this.tickData.get(symbol);
    ticks.push({ time: tick.epoch, price: parseFloat(tick.quote) });
    if (ticks.length > 1000) ticks.shift();
    this.emit('tick', { symbol, tick: ticks[ticks.length - 1], ticks });
  }

  handleOHLC(ohlc) {
    const key = `${ohlc.symbol}_${ohlc.granularity}`;
    if (!this.candleData.has(key)) this.candleData.set(key, []);
    const candles = this.candleData.get(key);
    const newCandle = {
      time: ohlc.open_time,
      open: parseFloat(ohlc.open),
      high: parseFloat(ohlc.high),
      low: parseFloat(ohlc.low),
      close: parseFloat(ohlc.close),
    };
    if (candles.length > 0 && candles[candles.length - 1].time === newCandle.time) {
      candles[candles.length - 1] = newCandle;
    } else {
      candles.push(newCandle);
    }
    if (candles.length > 500) candles.shift();
    this.emit('candle', { symbol: ohlc.symbol, timeframe: ohlc.granularity, candle: newCandle, candles });
  }

  handleCandleHistory(message) {
    const candles = message.candles;
    if (!candles || candles.length === 0) return;
    const symbol = message.echo_req?.ticks_history;
    const granularity = message.echo_req?.granularity;
    const key = `${symbol}_${granularity}`;
    const formattedCandles = candles.map(c => ({
      time: c.epoch, open: parseFloat(c.open), high: parseFloat(c.high),
      low: parseFloat(c.low), close: parseFloat(c.close),
    }));
    this.candleData.set(key, formattedCandles);
    this.emit('candle_history', { symbol, timeframe: granularity, candles: formattedCandles });
  }

  getActiveSymbols(productType = 'synthetic_index') {
    this.send({ active_symbols: 'brief', product_type: productType });
  }

  subscribeTicks(symbol) {
    const key = `tick_${symbol}`;
    if (this.subscriptions.has(key)) return;
    this.send({ ticks: symbol, subscribe: 1 });
    this.subscriptions.set(key, { type: 'tick', symbol });
    console.log(`📈 Suscrito a ticks de ${symbol}`);
  }

  subscribeCandles(symbol, granularity = 60) {
    const key = `candle_${symbol}_${granularity}`;
    if (this.subscriptions.has(key)) return;
    this.send({
      ticks_history: symbol, adjust_start_time: 1, count: 200,
      end: 'latest', granularity, style: 'candles', subscribe: 1,
    });
    this.subscriptions.set(key, { type: 'candle', symbol, granularity });
    console.log(`📊 Suscrito a velas ${granularity}s de ${symbol}`);
  }

  async getCandleHistory(symbol, granularity = 60, count = 200) {
    return new Promise((resolve) => {
      const handler = (data) => {
        if (data.symbol === symbol && data.timeframe === granularity) {
          this.removeListener('candle_history', handler);
          resolve(data.candles);
        }
      };
      this.on('candle_history', handler);
      this.send({ ticks_history: symbol, adjust_start_time: 1, count, end: 'latest', granularity, style: 'candles' });
      setTimeout(() => { this.removeListener('candle_history', handler); resolve([]); }, 10000);
    });
  }

  getCandles(symbol, granularity) {
    return this.candleData.get(`${symbol}_${granularity}`) || [];
  }

  getTicks(symbol) {
    return this.tickData.get(symbol) || [];
  }

  unsubscribeAll() {
    this.send({ forget_all: 'ticks' });
    this.send({ forget_all: 'candles' });
    this.subscriptions.clear();
  }

  disconnect() {
    this.unsubscribeAll();
    this.stopPing();
    if (this.ws) this.ws.close();
  }
}

export default DerivAPIService;
