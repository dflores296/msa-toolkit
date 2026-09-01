/* ============================================================================
 * mls.js - Intervalo de confianza MLS (Modified Large Sample) para la razon
 *          de varianzas del estudio Gage R&R cruzado.
 *
 * QUE IMPLEMENTA
 *
 * El intervalo de la razon  sigma2_parte / sigma2_total  por el metodo MLS,
 * con la aproximacion de Satterthwaite como alternativa cuando la cuadratica
 * del MLS no tiene solucion real. De esa razon se deriva, por la regla
 * publicada, la razon del sistema de medicion:
 *
 *     LI( gage/total ) = 1 - LS( parte/total )
 *     LS( gage/total ) = 1 - LI( parte/total )
 *
 * y de ahi el %Contribution y el %StudyVariation (%GRR).
 *
 * FUENTE
 *
 * Minitab, "Metodos y formulas para las relaciones de la varianza en los
 * intervalos de confianza en Estudio R&R cruzado del sistema de medicion",
 * seccion "Intervalo de confianza para la relacion de la varianza de la parte
 * y la varianza total" (variantes "Con operador y termino de interaccion" y
 * "Sin termino de interaccion"), y "Metodos y formulas para los componentes de
 * la varianza en los intervalos de confianza", seccion "Notacion comun y
 * reglas". El metodo procede de Burdick & Graybill (1992) y de Burdick, Borror
 * & Montgomery (2005).
 *
 * Las formulas se transcribieron de esas paginas; no se reconstruyeron. La
 * transcripcion y su verificacion estan en docs/mls-transcripcion.md, que
 * anota tambien las siete erratas detectadas en la fuente y los tres puntos en
 * los que esta implementacion se aparta de lo impreso, con el algebra que lo
 * justifica. Los tres, en resumen:
 *
 *   1. El multiplicador de la razon parte/total es I (numero de partes), no J
 *      (operadores) como dice el texto. Comprobado: solo con I la raiz doble
 *      del caso sin incertidumbre reproduce la razon puntual. Con J, no.
 *   2. El coeficiente c vale (IJ - I - J) con interaccion y (IJK - I - J) sin
 *      ella. La tabla publica solo el primero.
 *   3. C del limite superior usa (2 + H13), la forma simetrica de C del limite
 *      inferior (2 + G13). La variante sin interaccion lo imprime como
 *      2(1 + H13), que no es lo mismo.
 *
 * LA CONSTANTE NO PUBLICADA: H*
 *
 * El limite SUPERIOR de la razon parte/total usa terminos (2 - k*H*_qr) donde
 * H*_qr no esta definido en ninguna de las dos paginas de notacion de Minitab.
 * Se implementa como estrategia seleccionable (`hStar`), con su eleccion por
 * omision justificada por cobertura simulada en tests/mls-cobertura.js.
 *
 * DONDE CAE ESE HUECO, que importa para leer los resultados:
 *
 *     %GRR superior = 100*raiz( 1 - LI(parte/total) )   <- solo G, sin H*
 *     %GRR inferior = 100*raiz( 1 - LS(parte/total) )   <- depende de H*
 *
 * El limite que decide si un gage se rechaza es el SUPERIOR del %GRR, y sale
 * del limite INFERIOR de parte/total, que esta enteramente publicado. El hueco
 * afecta solo al limite inferior del %GRR, que es informativo.
 *
 * ALCANCE: modelo cruzado, con y sin termino de interaccion. El modelo anidado
 * NO esta cubierto: Minitab lo documenta en paginas propias que no se han
 * transcrito. Para el anidado esta funcion devuelve null.
 *
 * Depende de MSAStats (chi2Inv, fInv). Sin DOM.
 * ==========================================================================*/
(function (global) {
  'use strict';

  var S = null;
  function stats() {
    if (!S) S = global.MSAStats;
    return S;
  }

  /* --- Constantes G y H de Burdick-Graybill ------------------------------
   *
   * Verbatim de la seccion "Notacion" de Minitab:
   *
   *   H_q  = n_q / chi2_{alfa/2}(n_q) - 1
   *   G_q  = 1 - n_q / chi2_{1-alfa/2}(n_q)
   *   H_qr = ( [1 - F_{alfa/2}(n_q,n_r)]^2 - H_q^2 F^2_{alfa/2} - G_r^2 )
   *          / F_{alfa/2}(n_q,n_r)
   *   G_qr = ( [F_{1-alfa/2}(n_q,n_r) - 1]^2 - G_q^2 F^2_{1-alfa/2} - H_r^2 )
   *          / F_{1-alfa/2}(n_q,n_r)
   *
   * chi2_p y F_p son el PERCENTIL p*100. Con esa convencion G_q cae en (0,1) y
   * H_q es >= 0; si en algun momento salen fuera de ese rango, la cola de la
   * chi2 o de la F esta invertida. Se comprueba en las pruebas.
   *
   * Para limites unilaterales se reemplaza alfa/2 por alfa, que es lo que hace
   * el parametro `ah` (alfa "de media cola").
   * --------------------------------------------------------------------- */
  function makeConstants(df, ah) {
    var st = stats();
    var G = {}, H = {}, Gqr = {}, Hqr = {};

    Object.keys(df).forEach(function (q) {
      var n = df[q];
      if (!(n > 0)) return;
      G[q] = 1 - n / st.chi2Inv(1 - ah, n);
      H[q] = n / st.chi2Inv(ah, n) - 1;
    });

    function gqr(q, r) {
      var key = q + ',' + r;
      if (Gqr[key] === undefined) {
        var F = st.fInv(1 - ah, df[q], df[r]);
        Gqr[key] = ((F - 1) * (F - 1) - G[q] * G[q] * F * F - H[r] * H[r]) / F;
      }
      return Gqr[key];
    }
    function hqr(q, r) {
      var key = q + ',' + r;
      if (Hqr[key] === undefined) {
        var F = st.fInv(ah, df[q], df[r]);
        Hqr[key] = ((1 - F) * (1 - F) - H[q] * H[q] * F * F - G[r] * G[r]) / F;
      }
      return Hqr[key];
    }
    return { G: G, H: H, Gqr: gqr, Hqr: hqr };
  }

  /* --- H*: la constante que Minitab usa y no define ----------------------
   *
   * Aparece solo en el limite superior, y solo en los terminos cruzados que no
   * tocan el indice 1. Tres candidatos plausibles; la eleccion por omision se
   * decide por cobertura medida, no por parecido tipografico.
   *
   *   'zero'    H* = 0. El termino degenera en el mismo 2 pelado que lleva el
   *             limite inferior. Es la lectura conservadora: no inventa una
   *             correccion que no se sabe cual es. Ademas vuelve irrelevante
   *             el otro punto dudoso de la fuente (el 0.5 que aparece en una
   *             variante y no en la otra).
   *   'hqr'     H* = H_qr, la constante cruzada que si esta definida.
   *   'product' H* = H_q * H_r.
   * --------------------------------------------------------------------- */
  var H_STAR = {
    zero:    function () { return 0; },
    hqr:     function (k, q, r) { return k.Hqr(q, r); },
    product: function (k, q, r) { return k.H[q] * k.H[r]; }
  };
  var DEFAULT_H_STAR = 'zero';

  /* --- Las cuadraticas ---------------------------------------------------
   *
   * UNA SOLA FORMULA PARA LOS DOS MODELOS
   *
   * Minitab publica el cruzado y el anidado en paginas distintas, con los
   * indices barajados: en el cruzado el pivote es S1 (MSParte) y en el anidado
   * es S2 (MSPieza(Operador)). Escritas termino a termino parecen dos formulas.
   * No lo son: son la misma plantilla con otro reparto de papeles. Se comprobo
   * sobre las dos transcripciones, termino a termino, antes de unificarlas.
   *
   * La plantilla. Con  W = suma de c_q * S_q^2  y  D = S_p^2 - S_m^2, donde
   * `p` es el cuadrado medio que aporta la varianza de pieza y `m` el que se le
   * resta:
   *
   *   A = suma_q  c_q^2 (1 - X_q^2) S_q^4  +  suma_{q<r}  c_q c_r K(q,r) S_q^2 S_r^2
   *   B = -2 c_p (1 - X_p^2) S_p^4 + 2 c_m (1 - X_m^2) S_m^4
   *       - suma_{r != m}  c_r K(p,r) S_p^2 S_r^2
   *       + (c_p - c_m) K(p,m) S_p^2 S_m^2
   *       + suma_{r != p}  c_r K(m,r) S_m^2 S_r^2
   *   C = (1 - X_p^2) S_p^4 + (1 - X_m^2) S_m^4 - K(p,m) S_p^2 S_m^2
   *
   * donde X_q es G_q para el pivote y H_q para los demas en el limite inferior,
   * y al reves en el superior; y el peso cruzado K(q,r) vale:
   *
   *   - si el par toca al pivote:  (2 + G_pr)  abajo,  (2 + H_pr)  arriba
   *     con el PIVOTE PRIMERO en el subindice: la pagina escribe G_12 en el
   *     cruzado y G_21 en el anidado, y G_qr no es simetrico.
   *   - si no lo toca:  2 abajo,  (2 - half * H*_qr) arriba.
   *
   * En B no aparecen los pares que no tocan ni a `p` ni a `m`. Verificado
   * contra las dos transcripciones: en el cruzado falta justo el par (2,4), y
   * en el anidado no falta ninguno porque solo hay tres terminos.
   *
   * El limite sin incertidumbre es el control de que la plantilla esta bien:
   * con G y H a cero queda A = W^2, B = -2DW, C = D^2, raiz doble D/W, y
   * multiplicador * D/W tiene que dar la razon puntual. Se prueba en
   * tests/tests-mls.js para los dos modelos.
   * --------------------------------------------------------------------- */

  /** Peso del termino cruzado del par (q, r). */
  function crossWeight(spec, k, lower, hStarFn, q, r) {
    var p = spec.p;
    if (q === p || r === p) {
      var other = (q === p) ? r : q;
      return 2 + (lower ? k.Gqr(p, other) : k.Hqr(p, other));
    }
    if (lower) return 2;
    return 2 - spec.half * hStarFn(k, Math.min(q, r), Math.max(q, r));
  }

  function quadratic(s, spec, k, lower, hStarFn) {
    var c = spec.c, idx = spec.idx, p = spec.p, m = spec.m;
    /* X_q: el pivote lleva G abajo y H arriba; los demas al reves. */
    function X(q) {
      var g = (q === p) === lower;
      var v = g ? k.G[q] : k.H[q];
      return v === undefined ? 0 : v;
    }
    function diag(q) { var x = X(q); return 1 - x * x; }
    function w(q, r) { return crossWeight(spec, k, lower, hStarFn, q, r); }

    var A = 0, B = 0, i, j, q, r;
    for (i = 0; i < idx.length; i++) {
      q = idx[i];
      A += c[q] * c[q] * diag(q) * s[q] * s[q];
      for (j = i + 1; j < idx.length; j++) {
        r = idx[j];
        A += c[q] * c[r] * w(q, r) * s[q] * s[r];
      }
    }

    B = -2 * c[p] * diag(p) * s[p] * s[p] + 2 * c[m] * diag(m) * s[m] * s[m];
    for (i = 0; i < idx.length; i++) {
      r = idx[i];
      if (r !== p && r !== m) {
        B += -c[r] * w(p, r) * s[p] * s[r] + c[r] * w(m, r) * s[m] * s[r];
      }
    }
    B += (c[p] - c[m]) * w(p, m) * s[p] * s[m];

    var C = diag(p) * s[p] * s[p] + diag(m) * s[m] * s[m] - w(p, m) * s[p] * s[m];
    return { A: A, B: B, C: C };
  }

  /** Resuelve A x^2 + B x + C = 0 y devuelve la rama pedida:
   *
   *      solve(q, -1) = (-B - raiz(B^2 - 4AC)) / 2A      <- limite inferior
   *      solve(q, +1) = (-B + raiz(B^2 - 4AC)) / 2A      <- limite superior
   *
   *  null si no hay solucion real, que es exactamente el disparador de la
   *  alternativa de Satterthwaite.
   *
   *  POR QUE LA FORMULA Y NO "LA SOLUCION MAS PEQUENYA"
   *
   *  El texto de Minitab describe los limites como "J veces la solucion mas
   *  pequenya" y "mas grande", pero ademas imprime las dos formulas cerradas.
   *  Las dos descripciones coinciden solo si A > 0. Y A se vuelve NEGATIVA en
   *  cuanto hay pocos operadores: con J = 3 son 2 grados de libertad, H_2 pasa
   *  de 38 y el termino b^2(1 - H_2^2)S_2^4 domina y arrastra A por debajo de
   *  cero. Ahi las dos lecturas divergen, y mucho. Medido sobre el conjunto
   *  AIAG de 10x3x3, contra el GPQ como tercero independiente:
   *
   *      min/max          %GRR [ 0.0, 100.0]   <- inservible
   *      formula impresa  %GRR [14.7,  81.4]
   *      GPQ              %GRR [14.9,  81.7]
   *
   *  La formula impresa reproduce al GPQ hasta la decima; la lectura literal
   *  de "la mas pequenya" colapsa contra los topes de truncamiento. Se
   *  implementa la formula. El texto describe el caso A > 0 y no generaliza.
   */
  function solve(q, sign) {
    if (!(Math.abs(q.A) > 0) || !isFinite(q.A)) return null;
    var disc = q.B * q.B - 4 * q.A * q.C;
    if (!(disc >= 0) || !isFinite(disc)) return null;
    var x = (-q.B + sign * Math.sqrt(disc)) / (2 * q.A);
    return isFinite(x) ? x : null;
  }

  /* --- Aproximacion de Satterthwaite (el "segundo metodo") ---------------
   *
   *   L = g2 / (g3 * F_{1-ah}(m1,m3)) *
   *       ( g1/g2 - X/m1 + F_{1-ah}(m1,m2) * [X/m1 - F_{1-ah}(m1,m2)] / (g1/g2) )
   *
   * con X = chi2_{1-ah}(m1); U es lo mismo con ah en los tres cuantiles.
   *
   * Tambien es la misma para los dos modelos, con los papeles repartidos por
   * el mismo `spec`: g1 y g2 se construyen sobre el par (p, m) que forma el
   * numerador, y g3 es la combinacion lineal entera, que vale el multiplicador
   * por la varianza total.
   *
   * Control de coherencia (esta en las pruebas): si todos los cuantiles valen
   * 1, el parentesis colapsa a (g1/g2 - 1) y L queda en (g1-g2)/g3, que es la
   * razon puntual parte/total. Sin multiplicador: aqui no lo lleva.
   * --------------------------------------------------------------------- */
  function satterthwaite(s, spec, df, ah) {
    var st = stats();
    var c = spec.c, idx = spec.idx, p = spec.p, m = spec.m;
    var g1 = spec.mult * s[p];
    var g2 = spec.mult * s[m];
    var g3 = 0, den = 0;
    for (var i = 0; i < idx.length; i++) {
      var q = idx[i], term = c[q] * s[q];
      g3 += term;
      if (!(df[q] > 0)) return null;
      den += term * term / df[q];
    }
    if (!(den > 0) || !(g2 > 0) || !(g3 > 0)) return null;
    var m1 = df[p], m2 = df[m], m3 = g3 * g3 / den;
    var R = g1 / g2;
    if (!(R > 0) || !isFinite(R)) return null;

    function bound(pr) {
      var F13 = st.fInv(pr, m1, m3);
      var F12 = st.fInv(pr, m1, m2);
      var X = st.chi2Inv(pr, m1) / m1;
      if (!isFinite(F13) || !(F13 > 0)) return null;
      return (g2 / (g3 * F13)) * (R - X + F12 * (X - F12) / R);
    }
    var lo = bound(1 - ah), hi = bound(ah);
    if (lo === null || hi === null || !isFinite(lo) || !isFinite(hi)) return null;
    return { lo: Math.min(lo, hi), hi: Math.max(lo, hi) };
  }

  function clamp01(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }

  /* --- El reparto de papeles de cada modelo ------------------------------
   *
   * `idx` son los indices S_q que participan, `c` sus coeficientes, `p` y `m`
   * los del numerador (razon proporcional a S_p^2 - S_m^2), `mult` el factor
   * que convierte la raiz en la razon, y `half` el 0.5 que la variante cruzada
   * con interaccion antepone a H*.
   *
   * En los tres casos el multiplicador es I y los coeficientes son los de la
   * combinacion lineal que vale (multiplicador x varianza total). Los del
   * cruzado estan publicados al pie de la pagina de relaciones; los del
   * anidado NO -esa pagina solo publica I, J y K-, y se derivan del gamma_3
   * impreso en su propio "segundo metodo". Ver docs/mls-transcripcion.md.
   * --------------------------------------------------------------------- */
  function specFor(model, dims, hasFour) {
    var I = dims.I, J = dims.J, K = dims.K;
    if (model === 'nested') {
      /* S1 = MSOperador, S2 = MSPieza(Operador), S3 = MSRepetibilidad.
         El pivote es S2: la varianza de pieza sale de S2 - S3.
         gamma_3 = S1^2 + (I-1)S2^2 + I(K-1)S3^2 = I*K*sigma2_total. La pagina
         lo imprime como (IK - 1)S3^2; con ese coeficiente no da la varianza
         total. Ver errata 10. */
      return { idx: [1, 2, 3], c: { 1: 1, 2: I - 1, 3: I * (K - 1) },
               p: 2, m: 3, mult: I, half: 1 };
    }
    if (hasFour) {
      /* Cruzado con interaccion. S1 = MSParte, S2 = MSOperador,
         S3 = MSParte*Operador, S4 = MSReplicas. */
      return { idx: [1, 2, 3, 4],
               c: { 1: I, 2: J, 3: I * J - I - J, 4: I * J * (K - 1) },
               p: 1, m: 3, mult: I, half: 0.5 };
    }
    /* Cruzado sin interaccion: S3 pasa a ser el MS de error y `c` cambia de
       valor. La tabla de Minitab publica solo el valor con interaccion. Ojo:
       `c` es un coeficiente, no unos grados de libertad -aqui df[3] vale
       IJK-I-J+1, que es otro numero-. */
    return { idx: [1, 2, 3], c: { 1: I, 2: J, 3: I * J * K - I - J },
             p: 1, m: 3, mult: I, half: 1 };
  }

  /* ------------------------------------------------------------------------
   * partTotal(ms, df, dims, options)
   *
   *   ms   cruzado: { 1: MSParte, 2: MSOperador, 3: MSParte*Operador o MSError,
   *                   4: MSReplicas (ausente sin interaccion) }
   *        anidado: { 1: MSOperador, 2: MSPieza(Operador), 3: MSRepetibilidad }
   *   df   los grados de libertad de cada uno, con las mismas claves
   *   dims { I: partes -en el anidado, por operador-, J: operadores,
   *          K: replicas }
   *   options.model  'crossed' (por omision) o 'nested'
   *
   * Devuelve { lo, hi, method, ... } con la razon parte/total truncada a
   * [0,1], o null si el estudio no admite el metodo.
   * ----------------------------------------------------------------------*/
  function partTotal(ms, df, dims, options) {
    options = options || {};
    var st = stats();
    if (!st || !st.chi2Inv || !st.fInv) return null;

    var I = dims.I, J = dims.J, K = dims.K;
    if (!(I > 1) || !(J > 1) || !(K > 1)) return null;

    var model = options.model === 'nested' ? 'nested' : 'crossed';
    var hasFour = model === 'crossed' &&
                  ms[4] !== undefined && ms[4] !== null && df[4] > 0;
    var spec = specFor(model, dims, hasFour);

    var s = {}, dfs = {};
    for (var i = 0; i < spec.idx.length; i++) {
      var q = spec.idx[i];
      if (!isFinite(ms[q]) || ms[q] < 0 || !(df[q] > 0)) return null;
      s[q] = ms[q];
      dfs[q] = df[q];
    }

    var conf = options.conf === undefined ? 0.95 : options.conf;
    var alpha = 1 - conf;
    var ah = options.oneSided ? alpha : alpha / 2;

    var k = makeConstants(dfs, ah);
    var hStarName = options.hStar || DEFAULT_H_STAR;
    var hStarFn = H_STAR[hStarName] || H_STAR[DEFAULT_H_STAR];

    var rl = solve(quadratic(s, spec, k, true, hStarFn), -1);
    var ru = solve(quadratic(s, spec, k, false, hStarFn), +1);

    var out, method;
    if (rl !== null && ru !== null) {
      out = { lo: spec.mult * rl, hi: spec.mult * ru };
      method = 'MLS';
    } else {
      out = satterthwaite(s, spec, dfs, ah);
      method = 'Satterthwaite';
      if (!out) return null;
    }
    if (!isFinite(out.lo) || !isFinite(out.hi)) return null;

    var lo = clamp01(Math.min(out.lo, out.hi));
    var hi = clamp01(Math.max(out.lo, out.hi));
    return {
      lo: lo, hi: hi,
      method: method,
      model: model,
      withInteraction: hasFour,
      hStar: hStarName,
      truncated: (out.lo < 0 || out.hi > 1)
    };
  }

  /* ------------------------------------------------------------------------
   * gageTotal(...) - la razon del sistema de medicion, derivada de la anterior
   *
   * Regla publicada por Minitab, la misma en el cruzado y en el anidado. El
   * mapeo 1 - x es decreciente, asi que INTERCAMBIA los papeles de los
   * limites; la pagina es-mx los escribe sin intercambiar, lo que devuelve un
   * intervalo invertido. Aqui se intercambian.
   * ----------------------------------------------------------------------*/
  function gageTotal(ms, df, dims, options) {
    var p = partTotal(ms, df, dims, options);
    if (!p) return null;
    return {
      lo: clamp01(1 - p.hi),
      hi: clamp01(1 - p.lo),
      method: p.method,
      model: p.model,
      withInteraction: p.withInteraction,
      hStar: p.hStar,
      truncated: p.truncated,
      partTotal: { lo: p.lo, hi: p.hi }
    };
  }

  global.MSAMls = {
    partTotal: partTotal,
    gageTotal: gageTotal,
    DEFAULT_H_STAR: DEFAULT_H_STAR,
    H_STAR_MODES: Object.keys(H_STAR),
    _constants: makeConstants,
    _spec: specFor,
    _quadratic: quadratic,
    _solve: solve,
    _satterthwaite: satterthwaite
  };
})(typeof window !== 'undefined' ? window : globalThis);
