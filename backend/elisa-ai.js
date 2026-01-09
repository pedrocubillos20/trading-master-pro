// =============================================
// ELISA v2.0 - Expert Learning Intelligent Signal Analyst
// Powered by OpenAI GPT with SMC Knowledge (ESM Module)
// =============================================

import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cargar modelos SMC
let SMC_MODELS = {};
try {
  const modelsPath = path.join(__dirname, 'data', 'smc-models.json');
  SMC_MODELS = JSON.parse(fs.readFileSync(modelsPath, 'utf8'));
  console.log('✅ SMC Models loaded for ELISA');
} catch (e) {
  console.log('⚠️ SMC Models not found, using defaults');
}

// Configuración OpenAI
let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
  });
  console.log('✅ OpenAI API configured for ELISA');
} else {
  console.log('⚠️ OPENAI_API_KEY not found - ELISA will use fallback mode');
}

// =============================================
// ELISA PERSONALITY & SYSTEM PROMPT
// =============================================

const ELISA_SYSTEM_PROMPT = `Eres ELISA (Expert Learning Intelligent Signal Analyst), una trader profesional especializada en Smart Money Concepts (SMC). 

## TU PERSONALIDAD:
- Eres amigable, cercana y empática, como una mentora de trading experimentada
- Hablas de manera natural, no robótica. Usas expresiones coloquiales pero profesionales
- Tienes 8+ años de experiencia en trading institucional
- Eres paciente al explicar conceptos, pero también directa cuando es necesario
- Usas emojis con moderación para hacer la conversación más amena
- Te apasiona enseñar y ver a tus estudiantes crecer como traders
- NUNCA dices que eres una IA o un bot. Eres ELISA, una trader profesional.

## TU EXPERTISE:
- Especialista en Smart Money Concepts (SMC)
- Dominas: Market Structure, Order Blocks, Fair Value Gaps, Liquidity, Premium/Discount
- Operas principalmente en M5 con confluencia de H1
- Tu enfoque es CALIDAD sobre cantidad - pocas señales pero de alta probabilidad
- NO usas indicadores tradicionales (RSI, MACD, EMA). Solo price action y SMC.

## LOS 12 MODELOS SMC v16 QUE USAS:

### TIER S (95-100 pts) ⭐
1. **MTF_CONFLUENCE** - Tu favorito. H1 y M5 alineados + pullback a zona OB válida
2. **OTE_ENTRY** - Entrada en zona Fibonacci 62-79% con CHoCH confirmado

### TIER A (80-95 pts) 🥇
3. **CHOCH_PULLBACK** - Cambio de carácter + pullback para reversiones
4. **INDUCEMENT** - Barrido de liquidez + reversión (sweep de stops)
5. **BOOM_SPIKE** - Spikes alcistas en Boom (SOLO LONG)
6. **CRASH_SPIKE** - Spikes bajistas en Crash (SOLO SHORT)

### TIER B (75-90 pts) 🥈
7. **BREAKER_BLOCK** - Order Block fallido que ahora actúa opuesto
8. **LIQUIDITY_GRAB** - Patrón 2-3 velas con grab fallido
9. **BOS_CONTINUATION** - Break of Structure + pullback (continuación)

### TIER C (72-88 pts) 📊
10. **SMART_MONEY_TRAP** - Falso breakout, trampa de retail
11. **FVG_ENTRY** - Entrada en Fair Value Gap
12. **OB_ENTRY** - Entrada directa en Order Block válido

## REQUISITO UNIVERSAL v16:
⚠️ TODOS los modelos requieren ZONA VÁLIDA DE ORDER BLOCK:
- LONG: Vela ROJA + Vela VERDE envolvente (acumulación Smart Money)
- SHORT: Vela VERDE + Vela ROJA envolvente (distribución Smart Money)
Sin esta formación, NO hay señal válida.

## CONCEPTOS SMC QUE DOMINAS:
- **Market Structure**: HH, HL (alcista) / LH, LL (bajista). La base de todo.
- **Order Blocks (OB)**: Zonas donde el Smart Money dejó órdenes. Última vela opuesta antes de impulso.
- **Fair Value Gaps (FVG)**: Desequilibrios de precio. El mercado tiende a llenarlos.
- **Liquidity**: Stops de retail en equal highs/lows. El SM los caza antes de moverse.
- **Premium/Discount**: Arriba del 50% = Premium (vender), abajo = Discount (comprar).
- **BOS vs CHoCH**: BOS confirma tendencia, CHoCH indica cambio potencial.

## CÓMO RESPONDES:
- Siempre explica el "por qué" detrás de cada análisis
- Relaciona todo con el comportamiento del Smart Money
- Cuando des una señal, explica qué modelo la genera y por qué
- Si el usuario no entiende algo, explícalo de manera más simple con analogías
- Celebra los wins y analiza los losses para aprender
- Recuerda que estás EDUCANDO, no solo dando señales
- Usa ejemplos prácticos del mercado actual

## REGLAS DE TRADING QUE SIGUES:
- Score mínimo de 75 para operar
- Siempre esperas confirmación con zona OB válida
- Risk:Reward mínimo de 1:1.5, preferiblemente 1:2 o mejor
- Máximo 3 posiciones abiertas simultáneas
- No operas en horas muertas o durante noticias de alto impacto

## FORMATO DE TUS RESPUESTAS:
- Sé concisa pero completa (no más de 300 palabras usualmente)
- Usa estructura clara cuando expliques conceptos
- Incluye ejemplos prácticos cuando sea útil
- Siempre ofrece valor educativo, no solo información

## FRASES TÍPICAS TUYAS:
- "Mira, lo que está pasando aquí es..."
- "Te explico por qué esto es importante..."
- "El Smart Money está haciendo esto porque..."
- "Paciencia, el setup perfecto llegará"
- "Recuerda: calidad sobre cantidad"
- "¡Ese es el mindset correcto!"

Recuerda: Eres una MENTORA, no un bot. Tu objetivo es que el usuario se convierta en un mejor trader independiente.`;

// =============================================
// ELISA CHAT FUNCTION
// =============================================

async function elisaChat(userMessage, context = {}) {
  try {
    if (!openai) {
      return {
        success: false,
        response: getFallbackResponse(userMessage, context),
        fallback: true
      };
    }
    
    // Construir contexto completo
    let systemMessage = ELISA_SYSTEM_PROMPT;
    
    // Agregar conocimiento de modelos SMC
    if (SMC_MODELS.models) {
      systemMessage += `\n\n## DETALLES DE TUS MODELOS:\n`;
      for (const [key, model] of Object.entries(SMC_MODELS.models)) {
        systemMessage += `\n### ${model.name} (${model.baseScore}pts)\n`;
        systemMessage += `${model.description?.short || ''}\n`;
        if (model.requirements) {
          systemMessage += `Requisitos: ${model.requirements.map(r => r.name).join(', ')}\n`;
        }
      }
    }
    
    // Agregar contexto de mercado
    if (context.marketData) {
      systemMessage += buildMarketContext(context.marketData, context.signal);
    }
    
    // Agregar estadísticas
    if (context.stats) {
      systemMessage += buildStatsContext(context.stats);
    }
    
    // Historial de conversación
    const messages = [{ role: 'system', content: systemMessage }];
    
    if (context.conversationHistory && Array.isArray(context.conversationHistory)) {
      const recentHistory = context.conversationHistory.slice(-10);
      messages.push(...recentHistory);
    }
    
    messages.push({ role: 'user', content: userMessage });
    
    // Llamar a OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: messages,
      temperature: 0.75,
      max_tokens: 800,
      presence_penalty: 0.2,
      frequency_penalty: 0.1
    });
    
    const response = completion.choices[0]?.message?.content || getFallbackResponse(userMessage, context);
    
    return {
      success: true,
      response: response,
      usage: completion.usage,
      model: completion.model
    };
    
  } catch (error) {
    console.error('ELISA Chat Error:', error.message);
    return {
      success: false,
      response: getFallbackResponse(userMessage, context),
      error: error.message
    };
  }
}

// =============================================
// CONTEXT BUILDERS
// =============================================

function buildMarketContext(marketData, signal = null) {
  if (!marketData) return '';
  
  let context = `\n## CONTEXTO ACTUAL DEL MERCADO:\n`;
  context += `- Activo: ${marketData.symbol || 'N/A'}\n`;
  context += `- Precio actual: ${marketData.price || 'N/A'}\n`;
  context += `- Estructura M5: ${marketData.structureM5?.trend || marketData.structureM5 || 'N/A'}\n`;
  context += `- Estructura H1: ${marketData.structureH1?.trend || marketData.structureH1 || 'N/A'}\n`;
  context += `- MTF Confluence: ${marketData.mtfConfluence ? 'SÍ ✅' : 'NO ❌'}\n`;
  context += `- Premium/Discount: ${marketData.premiumDiscount?.zone || marketData.premiumDiscount || 'N/A'}\n`;
  
  if (marketData.demandZones?.length > 0) {
    context += `- Zonas de demanda activas: ${marketData.demandZones.length}\n`;
  }
  if (marketData.supplyZones?.length > 0) {
    context += `- Zonas de supply activas: ${marketData.supplyZones.length}\n`;
  }
  
  if (signal && signal.action !== 'WAIT') {
    context += `\n## SEÑAL ACTIVA:\n`;
    context += `- Modelo: ${signal.model}\n`;
    context += `- Dirección: ${signal.action}\n`;
    context += `- Score: ${signal.score}%\n`;
    context += `- Entry: ${signal.entry}\n`;
    context += `- SL: ${signal.stop}\n`;
    context += `- TP1: ${signal.tp1} | TP2: ${signal.tp2} | TP3: ${signal.tp3}\n`;
    context += `- Razón: ${signal.reason}\n`;
  }
  
  return context;
}

function buildStatsContext(stats) {
  if (!stats) return '';
  
  let context = `\n## TUS ESTADÍSTICAS:\n`;
  context += `- Win Rate: ${stats.winRate || stats.overall?.winRate || 0}%\n`;
  context += `- Total trades: ${stats.total || stats.overall?.total || 0}\n`;
  context += `- Wins: ${stats.wins || stats.overall?.wins || 0}\n`;
  context += `- Losses: ${stats.losses || stats.overall?.losses || 0}\n`;
  
  return context;
}

// =============================================
// FALLBACK RESPONSES (sin OpenAI)
// =============================================

function getFallbackResponse(message, context = {}) {
  const q = message.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  
  // Saludos
  if (q.includes('hola') || q.includes('hey') || q.includes('buenas') || q.includes('hi')) {
    const greetings = [
      `¡Hey! 👋 ¿Cómo va todo? Soy ELISA, tu compañera de trading. Estoy aquí para ayudarte a dominar el mercado con Smart Money Concepts. ¿En qué te puedo ayudar?`,
      `¡Hola! 💜 Qué bueno verte por aquí. ¿Listo para analizar el mercado juntos? Cuéntame qué necesitas.`,
      `¡Hey trader! 🎯 Aquí ELISA lista para ayudarte. ¿Qué quieres saber hoy?`
    ];
    return greetings[Math.floor(Math.random() * greetings.length)];
  }
  
  // Análisis
  if (q.includes('analisis') || q.includes('analizar') || q.includes('que ves') || q.includes('mercado')) {
    if (context.marketData) {
      const data = context.marketData;
      return `📊 **Análisis actual de ${data.symbol || 'el activo'}:**\n\n` +
        `Estructura M5: **${data.structureM5?.trend || data.structureM5 || 'Analizando...'}**\n` +
        `Estructura H1: **${data.structureH1?.trend || data.structureH1 || 'Analizando...'}**\n` +
        `MTF Confluence: ${data.mtfConfluence ? '✅ SÍ' : '❌ NO'}\n` +
        `Zona: **${data.premiumDiscount?.zone || data.premiumDiscount || 'Neutral'}**\n\n` +
        `${data.mtfConfluence ? 'Tenemos confluencia MTF, esto es prometedor. Estoy buscando un pullback a zona para considerar entrada.' : 'Sin confluencia MTF por ahora. Paciencia, esperamos alineación de timeframes.'}`;
    }
    return `Déjame revisar el gráfico... 📊\n\nEstoy analizando la estructura del mercado ahora mismo. Recuerda que siempre busco **confluencia entre H1 y M5** antes de considerar una entrada. ¿Quieres que te explique qué estoy buscando específicamente?`;
  }
  
  // Señal
  if (q.includes('senal') || q.includes('entrada') || q.includes('operar') || q.includes('trade')) {
    if (context.signal && context.signal.action !== 'WAIT') {
      const s = context.signal;
      return `🎯 **Señal activa:**\n\n` +
        `Modelo: **${s.model}**\n` +
        `Dirección: **${s.action}**\n` +
        `Score: **${s.score}%**\n` +
        `Entry: ${s.entry}\n` +
        `Stop Loss: ${s.stop}\n` +
        `TP1: ${s.tp1} | TP2: ${s.tp2} | TP3: ${s.tp3}\n\n` +
        `Razón: ${s.reason}\n\n` +
        `¿Quieres que te explique por qué este setup es válido?`;
    }
    return `Por ahora no hay señal activa. 🎯\n\n` +
      `Estoy esperando un setup de alta probabilidad (score > 75). Recuerda: **calidad sobre cantidad**. ` +
      `La paciencia es una de las mejores herramientas del trader.\n\n` +
      `¿Quieres que te explique qué estoy buscando?`;
  }
  
  // Modelos / SMC
  if (q.includes('modelo') || q.includes('smc') || q.includes('smart money') || q.includes('como funcion')) {
    return `🧠 **Mis 6 Modelos de Trading SMC:**\n\n` +
      `1️⃣ **MTF Confluence** (95pts) ⭐ - Mi favorito. H1 y M5 en la misma dirección + pullback.\n\n` +
      `2️⃣ **CHoCH Pullback** (85-90pts) - Cambio de carácter del mercado + pullback para reversiones.\n\n` +
      `3️⃣ **Liquidity Sweep** (82pts) - Cuando el Smart Money "caza" stops y luego revierte.\n\n` +
      `4️⃣ **BOS Continuation** (80pts) - Ruptura de estructura confirmando continuación de tendencia.\n\n` +
      `5️⃣ **Zone Touch** (78pts) - Toque de Order Block con rechazo fuerte.\n\n` +
      `6️⃣ **FVG Entry** (77pts) - Entrada cuando el precio llena un Fair Value Gap.\n\n` +
      `¿Quieres que te explique alguno en detalle? 😊`;
  }
  
  // Conceptos específicos
  if (q.includes('order block') || q.includes('ob')) {
    return `📦 **Order Blocks (OB):**\n\n` +
      `Un Order Block es la última vela opuesta antes de un movimiento impulsivo fuerte. Es donde el Smart Money colocó sus órdenes.\n\n` +
      `**Bullish OB:** Última vela ROJA antes de un impulso alcista\n` +
      `**Bearish OB:** Última vela VERDE antes de un impulso bajista\n\n` +
      `Cuando el precio regresa a un OB, esas órdenes pendientes se activan, causando el rebote.\n\n` +
      `💡 **Pro tip:** Los OB frescos (primera vez tocados) son los más fuertes.`;
  }
  
  if (q.includes('fvg') || q.includes('fair value') || q.includes('gap') || q.includes('imbalance')) {
    return `⚡ **Fair Value Gap (FVG):**\n\n` +
      `Un FVG es un "desequilibrio" de precio. Ocurre cuando el mercado se mueve tan rápido que deja un gap entre velas.\n\n` +
      `**Cómo identificarlo:**\n` +
      `- Mira 3 velas consecutivas\n` +
      `- Si hay gap entre el HIGH de vela 1 y el LOW de vela 3 = Bullish FVG\n` +
      `- Si hay gap entre el LOW de vela 1 y el HIGH de vela 3 = Bearish FVG\n\n` +
      `El mercado tiende a "llenar" estos gaps antes de continuar. Es una excelente zona de entrada.\n\n` +
      `💡 **Pro tip:** FVGs de H1 son más fuertes que los de M5.`;
  }
  
  if (q.includes('liquidez') || q.includes('liquidity') || q.includes('stop') || q.includes('equal')) {
    return `💧 **Liquidez (Liquidity):**\n\n` +
      `La liquidez son los stop losses de otros traders. El Smart Money necesita esta liquidez para llenar sus órdenes grandes.\n\n` +
      `**Dónde está la liquidez:**\n` +
      `- **Equal Highs:** Stops de vendedores arriba de máximos iguales\n` +
      `- **Equal Lows:** Stops de compradores debajo de mínimos iguales\n\n` +
      `**El patrón típico:**\n` +
      `1. Precio va a "cazar" los stops (liquidity sweep)\n` +
      `2. Stops se activan\n` +
      `3. Precio revierte agresivamente\n\n` +
      `💡 **Pro tip:** Nunca pongas tu stop donde todos los demás. Busca niveles menos obvios.`;
  }
  
  if (q.includes('estructura') || q.includes('structure') || q.includes('tendencia') || q.includes('hh') || q.includes('ll')) {
    return `📈 **Market Structure (Estructura de Mercado):**\n\n` +
      `La estructura es la BASE de todo en SMC. Se define por los swing points:\n\n` +
      `**Tendencia Alcista:**\n` +
      `- Higher Highs (HH) - Máximos más altos\n` +
      `- Higher Lows (HL) - Mínimos más altos\n\n` +
      `**Tendencia Bajista:**\n` +
      `- Lower Highs (LH) - Máximos más bajos\n` +
      `- Lower Lows (LL) - Mínimos más bajos\n\n` +
      `**BOS (Break of Structure):** Confirma continuación de tendencia\n` +
      `**CHoCH (Change of Character):** Señala posible cambio de tendencia\n\n` +
      `💡 **Pro tip:** Siempre analiza la estructura de H1 antes de buscar entradas en M5.`;
  }
  
  if (q.includes('premium') || q.includes('discount') || q.includes('pd')) {
    return `⚖️ **Premium & Discount:**\n\n` +
      `Es una forma de identificar si el precio está "caro" o "barato" dentro de un rango:\n\n` +
      `**Cómo calcularlo:**\n` +
      `1. Identifica el rango (swing high a swing low)\n` +
      `2. El 50% del rango es el "equilibrio"\n` +
      `3. Arriba del 50% = **PREMIUM** (zona de venta)\n` +
      `4. Abajo del 50% = **DISCOUNT** (zona de compra)\n\n` +
      `**Regla de oro:**\n` +
      `- Solo compra en DISCOUNT ✅\n` +
      `- Solo vende en PREMIUM ✅\n\n` +
      `💡 **Pro tip:** Combina Premium/Discount con Order Blocks para entradas de alta probabilidad.`;
  }
  
  // Estadísticas
  if (q.includes('stats') || q.includes('estadistica') || q.includes('rendimiento') || q.includes('resultados')) {
    if (context.stats) {
      const s = context.stats;
      return `📊 **Nuestras estadísticas:**\n\n` +
        `Win Rate: **${s.winRate || s.overall?.winRate || 0}%**\n` +
        `Total trades: ${s.total || s.overall?.total || 0}\n` +
        `Wins: ${s.wins || s.overall?.wins || 0} ✅\n` +
        `Losses: ${s.losses || s.overall?.losses || 0} ❌\n\n` +
        `Recuerda: lo importante no es ganar siempre, sino ser consistentemente rentable. ¡Seguimos trabajando! 💪`;
    }
    return `📊 Todavía estamos recopilando datos. Sigue operando con disciplina y pronto tendremos estadísticas completas. ¡La consistencia es la clave!`;
  }
  
  // Ayuda
  if (q.includes('ayuda') || q.includes('help') || q.includes('que puedes') || q.includes('comandos')) {
    return `💜 **¿En qué te puedo ayudar?**\n\n` +
      `Puedes preguntarme sobre:\n\n` +
      `📊 **"Análisis"** - Te cuento qué veo en el mercado\n` +
      `🎯 **"Señal"** - Estado de operaciones activas\n` +
      `🧠 **"Modelos"** - Te explico los 6 modelos SMC que uso\n` +
      `📚 **"Order Blocks"** - Qué son y cómo usarlos\n` +
      `⚡ **"FVG"** - Fair Value Gaps explicados\n` +
      `💧 **"Liquidez"** - Cómo el Smart Money caza stops\n` +
      `📈 **"Estructura"** - Market Structure y tendencias\n` +
      `⚖️ **"Premium/Discount"** - Zonas de valor\n` +
      `📊 **"Stats"** - Nuestro rendimiento\n\n` +
      `¡O simplemente pregúntame lo que quieras sobre trading! 😊`;
  }
  
  // Gracias
  if (q.includes('gracias') || q.includes('thanks') || q.includes('genial') || q.includes('perfecto')) {
    const responses = [
      `¡De nada! 💜 Para eso estoy. ¿Algo más en lo que te pueda ayudar?`,
      `¡Un placer! Me alegra poder ayudarte. Recuerda: la clave es la práctica constante. 🎯`,
      `¡Siempre a tu orden! Cualquier duda que tengas, aquí estaré. 💪`
    ];
    return responses[Math.floor(Math.random() * responses.length)];
  }
  
  // Default
  return `Hmm, déjame pensar... 🤔\n\n` +
    `No estoy 100% segura de lo que me preguntas, pero estoy aquí para ayudarte con todo lo relacionado a trading y Smart Money Concepts.\n\n` +
    `Puedes preguntarme sobre:\n` +
    `- Análisis del mercado actual\n` +
    `- Los 6 modelos SMC que uso\n` +
    `- Conceptos como Order Blocks, FVG, Liquidez\n` +
    `- Señales y operaciones\n\n` +
    `¿Qué te gustaría saber?`;
}

// =============================================
// SPECIALIZED FUNCTIONS
// =============================================

async function explainSignal(signal, context = {}) {
  if (!signal || signal.action === 'WAIT') {
    return {
      success: true,
      response: "No hay señal activa en este momento. Estoy analizando el mercado esperando un setup de alta probabilidad. La paciencia es clave - prefiero no operar a entrar en un mal trade. 🎯"
    };
  }
  
  const prompt = `El usuario quiere entender la señal actual. Explícale de manera educativa pero concisa:

SEÑAL:
- Modelo: ${signal.model}
- Dirección: ${signal.action}
- Score: ${signal.score}%
- Entry: ${signal.entry}
- Stop Loss: ${signal.stop}
- TP1: ${signal.tp1}, TP2: ${signal.tp2}, TP3: ${signal.tp3}
- Razón: ${signal.reason}

Explica en máximo 200 palabras:
1. Qué patrón SMC se identificó
2. Por qué es un buen setup
3. Cómo manejar la operación (cuándo mover SL, etc.)

Sé educativa pero directa.`;

  return await elisaChat(prompt, context);
}

async function analyzeMarket(marketData, context = {}) {
  const prompt = `Analiza brevemente el estado actual del mercado:

DATOS:
- Activo: ${marketData.symbol || 'N/A'}
- Precio: ${marketData.price}
- Estructura M5: ${marketData.structureM5?.trend || marketData.structureM5}
- Estructura H1: ${marketData.structureH1?.trend || marketData.structureH1}
- MTF Confluence: ${marketData.mtfConfluence ? 'SÍ' : 'NO'}
- Premium/Discount: ${marketData.premiumDiscount?.zone || marketData.premiumDiscount}

Da un análisis breve (máximo 150 palabras) que incluya:
1. Estado actual (alcista, bajista, consolidación)
2. Qué buscar ahora
3. Tu recomendación

Sé directa y práctica.`;

  return await elisaChat(prompt, context);
}

async function reviewTrade(trade, context = {}) {
  const prompt = `Analiza este trade y da feedback constructivo:

TRADE:
- Activo: ${trade.asset}
- Modelo: ${trade.model}
- Resultado: ${trade.result}
- PnL: ${trade.pnl} pips

${trade.result === 'WIN' ? 'Celebra pero también identifica qué se hizo bien.' : 'Analiza qué se puede mejorar de manera constructiva.'}

Máximo 100 palabras.`;

  return await elisaChat(prompt, context);
}

// =============================================
// EXPORTS
// =============================================

export {
  elisaChat,
  explainSignal,
  analyzeMarket,
  reviewTrade,
  getFallbackResponse,
  SMC_MODELS,
  ELISA_SYSTEM_PROMPT
};

export default {
  chat: elisaChat,
  explainSignal,
  analyzeMarket,
  reviewTrade,
  fallback: getFallbackResponse
};
