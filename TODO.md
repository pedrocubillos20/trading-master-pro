# Trading Master Pro - Ajustes SMC v17.0

## ✅ Plan Aprobado
- [ ] Fix syntax error Railway (illegal continue line 2821)
- [ ] Reduce a 6 modelos SMC principales
- [ ] Desactivar Boom/Crash completamente
- [ ] Sincronizar lógica operativa paso a paso
- [ ] Reglas estrictas por modelo
- [ ] Zonas/puntos correctos (OB solo cuerpo, swings precisos)
- [ ] SL/Entry/TP lógicos (reducir amplitud)
- [ ] Fix bugs en análisis (pullback detection, MTF confluence)

## 📋 Modelos SMC a Mantener (Top 6)
1. MTF_CONFLUENCE (H1+M15+M5 alineados + OB)
2. CHOCH_PULLBACK (CHoCH + pullback a structure OB)
3. OB_REJECTION (Rechazo fuerte en OB con wick >50%)
4. LIQUIDITY_GRAB (Sweep + reversión con H1 confirm)
5. FVG_ENTRY (FVG + MTF confluence)
6. OTE_ENTRY (Fib 62-79% en pullback H1)

## 🔧 Pasos de Implementación
1. [ ] **Fix Syntax** → Leer/edit index.js línea 2821+
2. [ ] **Disable Boom/Crash** → Remove assets + special logic
3. [ ] **6 Modelos** → Comment lesser models in SMC.analyze()
4. [ ] **Tight SL/TP** → SL=OB wick ±0.2*avgRange, TP multipliers 1.2/2/3.5
5. [ ] **Sync Logic** → Enforce H1→M15→M5/M1 flow
6. [ ] **Test Local** → node backend/index.js + browser localhost:3001
7. [ ] **Railway Redeploy**

## 📊 Reglas Nuevas por Modelo
- **Todos**: MIN_SCORE=88, require H1 alignment, OB touch required
- **SL**: Siempre en wick del OB ±0.2*avgRange (max 1.5*avgRange)
- **TP**: 1:1.2 / 1:2 / 1:3.5 (reducido de 1.5/2.5/4)
- **Entry**: Dentro OB o max 0.3*avgRange fuera

**Próximo paso:** Fix syntax error → editar backend/index.js
