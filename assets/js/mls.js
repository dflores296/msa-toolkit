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
   * S1..S4 son los cuadrados medios: MSParte, MSOperador, MSParte*Operador y
   * MSReplicas. Sin termino de interaccion, S3 es el MS de error y S4 vale 0,
   * igual que d: con eso los diez terminos de la variante con interaccion se
   * reducen exactamente a los seis de la variante sin interaccion, que es como
   * Minitab las imprime. No hay dos caminos de codigo porque no hay dos
   * formulas: hay una con un termino apagado.
   * --------------------------------------------------------------------- */
  function quadLower(s, co, k) {
    var s1 = s[1], s2 = s[2], s3 = s[3], s4 = s[4];
    var a = co.a, b = co.b, c = co.c, d = co.d;
    var G = k.G, H = k.H;
    var A =
      a * a * (1 - G[1] * G[1]) * s1 * s1 +
      b * b * (1 - H[2] * H[2]) * s2 * s2 +
      c * c * (1 - H[3] * H[3]) * s3 * s3 +
      d * d * (1 - (H[4] === undefined ? 0 : H[4] * H[4])) * s4 * s4 +
      a * b * (2 + k.Gqr(1, 2)) * s1 * s2 +
      a * c * (2 + k.Gqr(1, 3)) * s1 * s3 +
      (d ? a * d * (2 + k.Gqr(1, 4)) * s1 * s4 : 0) +
      2 * b * c * s2 * s3 + 2 * b * d * s2 * s4 + 2 * c * d * s3 * s4;
    var B =
      -2 * a * (1 - G[1] * G[1]) * s1 * s1 +
      2 * c * (1 - H[3] * H[3]) * s3 * s3 -
      b * (2 + k.Gqr(1, 2)) * s1 * s2 +
      a * (2 + k.Gqr(1, 3)) * s1 * s3 -
      c * (2 + k.Gqr(1, 3)) * s1 * s3 -
      (d ? d * (2 + k.Gqr(1, 4)) * s1 * s4 : 0) +
      2 * b * s2 * s3 + 2 * d * s3 * s4;
    var C =
      (1 - G[1] * G[1]) * s1 * s1 +
      (1 - H[3] * H[3]) * s3 * s3 -
      (2 + k.Gqr(1, 3)) * s1 * s3;
    return { A: A, B: B, C: C };
  }

  function quadUpper(s, co, k, hStarFn, half) {
    var s1 = s[1], s2 = s[2], s3 = s[3], s4 = s[4];
    var a = co.a, b = co.b, c = co.c, d = co.d;
    var G = k.G, H = k.H;
    /* `half` es el 0.5 que la variante con interaccion antepone a H*. La
       variante sin interaccion lo imprime sin el; se respeta cada una. */
    function w(q, r) { return 2 - half * hStarFn(k, q, r); }
    var A =
      a * a * (1 - H[1] * H[1]) * s1 * s1 +
      b * b * (1 - G[2] * G[2]) * s2 * s2 +
      c * c * (1 - G[3] * G[3]) * s3 * s3 +
      d * d * (1 - (G[4] === undefined ? 0 : G[4] * G[4])) * s4 * s4 +
      a * b * (2 + k.Hqr(1, 2)) * s1 * s2 +
      a * c * (2 + k.Hqr(1, 3)) * s1 * s3 +
      (d ? a * d * (2 + k.Hqr(1, 4)) * s1 * s4 : 0) +
      b * c * w(2, 3) * s2 * s3 +
      (d ? b * d * w(2, 4) * s2 * s4 : 0) +
      (d ? c * d * w(3, 4) * s3 * s4 : 0);
    var B =
      -2 * a * (1 - H[1] * H[1]) * s1 * s1 +
      2 * c * (1 - G[3] * G[3]) * s3 * s3 -
      b * (2 + k.Hqr(1, 2)) * s1 * s2 +
      a * (2 + k.Hqr(1, 3)) * s1 * s3 -
      c * (2 + k.Hqr(1, 3)) * s1 * s3 -
      (d ? d * (2 + k.Hqr(1, 4)) * s1 * s4 : 0) +
      b * w(2, 3) * s2 * s3 +
      (d ? d * w(3, 4) * s3 * s4 : 0);
    /* (2 + H13), simetrico de (2 + G13) del limite inferior. La pagina sin
       interaccion lo imprime como 2(1 + H13); ver errata 3 en la cabecera. */
    var C =
      (1 - H[1] * H[1]) * s1 * s1 +
      (1 - G[3] * G[3]) * s3 * s3 -
      (2 + k.Hqr(1, 3)) * s1 * s3;
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
   * Control de coherencia (esta en las pruebas): si todos los cuantiles valen
   * 1, el parentesis colapsa a (g1/g2 - 1) y L queda en (g1-g2)/g3, que es la
   * razon puntual parte/total. Sin multiplicador: aqui no lo lleva.
   * --------------------------------------------------------------------- */
  function satterthwaite(s, co, df, ah) {
    var st = stats();
    var g1 = co.a * s[1];
    var g2 = co.a * s[3];
    var g3 = co.a * s[1] + co.b * s[2] + co.c * s[3] + co.d * s[4];
    var m1 = df[1], m2 = df[3];
    var den = (co.a * s[1]) * (co.a * s[1]) / df[1] +
              (co.b * s[2]) * (co.b * s[2]) / df[2] +
              (co.c * s[3]) * (co.c * s[3]) / df[3] +
              (co.d ? (co.d * s[4]) * (co.d * s[4]) / df[4] : 0);
    if (!(den > 0) || !(g2 > 0) || !(g3 > 0)) return null;
    var m3 = g3 * g3 / den;
    var R = g1 / g2;
    if (!(R > 0) || !isFinite(R)) return null;

    function bound(p) {
      var F13 = st.fInv(p, m1, m3);
      var F12 = st.fInv(p, m1, m2);
      var X = st.chi2Inv(p, m1) / m1;
      if (!isFinite(F13) || !(F13 > 0)) return null;
      return (g2 / (g3 * F13)) * (R - X + F12 * (X - F12) / R);
    }
    var lo = bound(1 - ah), hi = bound(ah);
    if (lo === null || hi === null || !isFinite(lo) || !isFinite(hi)) return null;
    return { lo: Math.min(lo, hi), hi: Math.max(lo, hi) };
  }

  function clamp01(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }

  /* ------------------------------------------------------------------------
   * partTotal(ms, df, dims, options)
   *
   *   ms   { 1: MSParte, 2: MSOperador, 3: MSParte*Operador o MSError,
   *          4: MSReplicas (ausente sin interaccion) }
   *   df   los grados de libertad de cada uno, con las mismas claves
   *   dims { I: partes, J: operadores, K: replicas }
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

    var withInter = ms[4] !== undefined && ms[4] !== null && df[4] > 0;
    var s = { 1: ms[1], 2: ms[2], 3: ms[3], 4: withInter ? ms[4] : 0 };
    for (var q = 1; q <= 3; q++) {
      if (!isFinite(s[q]) || s[q] < 0) return null;
      if (!(df[q] > 0)) return null;
    }

    /* a, b, c, d publicados al pie de la pagina de relaciones. `c` es un
       coeficiente de la combinacion lineal, NO unos grados de libertad: sin
       interaccion vale IJK-I-J mientras que df[3] vale IJK-I-J+1. */
    var co = {
      a: I,
      b: J,
      c: withInter ? (I * J - I - J) : (I * J * K - I - J),
      d: withInter ? I * J * (K - 1) : 0
    };

    var conf = options.conf === undefined ? 0.95 : options.conf;
    var alpha = 1 - conf;
    var ah = options.oneSided ? alpha : alpha / 2;

    var k = makeConstants(withInter ? { 1: df[1], 2: df[2], 3: df[3], 4: df[4] }
                                    : { 1: df[1], 2: df[2], 3: df[3] }, ah);
    var hStarName = options.hStar || DEFAULT_H_STAR;
    var hStarFn = H_STAR[hStarName] || H_STAR[DEFAULT_H_STAR];
    var half = withInter ? 0.5 : 1;

    /* El multiplicador es I, el numero de partes. Ver errata 1 en la cabecera. */
    var mult = I;

    var rl = solve(quadLower(s, co, k), -1);
    var ru = solve(quadUpper(s, co, k, hStarFn, half), +1);

    var out, method;
    if (rl !== null && ru !== null) {
      out = { lo: mult * rl, hi: mult * ru };
      method = 'MLS';
    } else {
      out = satterthwaite(s, co, df, ah);
      method = 'Satterthwaite';
      if (!out) return null;
    }
    if (!isFinite(out.lo) || !isFinite(out.hi)) return null;

    var lo = clamp01(Math.min(out.lo, out.hi));
    var hi = clamp01(Math.max(out.lo, out.hi));
    return {
      lo: lo, hi: hi,
      method: method,
      withInteraction: withInter,
      hStar: hStarName,
      truncated: (out.lo < 0 || out.hi > 1)
    };
  }

  /* ------------------------------------------------------------------------
   * gageTotal(...) - la razon del sistema de medicion, derivada de la anterior
   *
   * Regla publicada por Minitab. El mapeo 1 - x es decreciente, asi que
   * INTERCAMBIA los papeles de los limites; la pagina es-mx los escribe sin
   * intercambiar, lo que devuelve un intervalo invertido. Aqui se intercambian.
   * ----------------------------------------------------------------------*/
  function gageTotal(ms, df, dims, options) {
    var p = partTotal(ms, df, dims, options);
    if (!p) return null;
    return {
      lo: clamp01(1 - p.hi),
      hi: clamp01(1 - p.lo),
      method: p.method,
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
    _quadLower: quadLower,
    _quadUpper: quadUpper,
    _solve: solve,
    _satterthwaite: satterthwaite
  };
})(typeof window !== 'undefined' ? window : globalThis);
