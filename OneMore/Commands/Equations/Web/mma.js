/*
 * mma.js — Mathematica-syntax parser with LaTeX, Mathematica, SymPy, NumPy and MATLAB emitters.
 * No dependencies. Works in the browser (window.MMA) and in Node (require).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.MMA = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ------------------------------------------------------------------
  // Character tables
  // ------------------------------------------------------------------
  const GREEK = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota', 'kappa', 'lambda', 'mu',
    'nu', 'xi', 'omicron', 'pi', 'rho', 'sigma', 'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega'];
  const GREEK_LO = 'αβγδεζηθικλμνξοπρστυφχψω';
  const GREEK_UP = 'ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ';
  const GREEK_SET = new Set(GREEK);
  const VAR_GREEK = new Set(['varepsilon', 'vartheta', 'varphi', 'varrho', 'varsigma', 'varpi', 'varkappa']);
  const TEX_CAPS = new Set(['Gamma', 'Delta', 'Theta', 'Lambda', 'Xi', 'Pi', 'Sigma', 'Upsilon', 'Phi', 'Psi', 'Omega']);
  const CAP_LATIN = { Alpha: 'A', Beta: 'B', Epsilon: 'E', Zeta: 'Z', Eta: 'H', Iota: 'I', Kappa: 'K', Mu: 'M', Nu: 'N', Omicron: 'O', Rho: 'P', Tau: 'T', Chi: 'X' };

  const UNI_TEX = {};   // unicode char -> TeX
  const UNI_NAME = {};  // unicode char -> ascii identifier (for code)
  const NAMED = {};     // Mathematica \[Name] -> unicode char
  GREEK.forEach((n, i) => {
    const cap = n[0].toUpperCase() + n.slice(1);
    UNI_TEX[GREEK_LO[i]] = n === 'omicron' ? 'o' : '\\' + n;
    UNI_TEX[GREEK_UP[i]] = TEX_CAPS.has(cap) ? '\\' + cap : '\\mathrm{' + CAP_LATIN[cap] + '}';
    UNI_NAME[GREEK_LO[i]] = n;
    UNI_NAME[GREEK_UP[i]] = cap;
    NAMED[cap] = GREEK_LO[i];
    NAMED['Capital' + cap] = GREEK_UP[i];
  });
  Object.assign(UNI_TEX, {
    'ε': '\\varepsilon', 'ϵ': '\\epsilon', 'φ': '\\varphi', 'ϕ': '\\phi', 'ϑ': '\\vartheta', 'ϱ': '\\varrho',
    'ς': '\\varsigma', 'ϖ': '\\varpi', 'ϰ': '\\varkappa', '∂': '\\partial', '∇': '\\nabla', 'ℏ': '\\hbar',
    'ℓ': '\\ell', 'ⅆ': '\\mathrm{d}', 'Å': '\\text{Å}', 'µ': '\\mu', '…': '\\ldots', '□': '\\square'
  });
  Object.assign(UNI_NAME, { 'ϵ': 'epsilon', 'ϕ': 'phi', 'ϑ': 'theta', 'ϱ': 'rho', 'ς': 'sigma', 'ϖ': 'pi', 'ϰ': 'kappa',
    '∂': 'partial', '∇': 'nabla', 'ℏ': 'hbar', 'ℓ': 'ell', 'ⅆ': 'd', 'Å': 'angstrom', 'µ': 'mu', '…': 'ellipsis', '□': 'box' });
  Object.assign(NAMED, {
    Epsilon: 'ϵ', CurlyEpsilon: 'ε', Phi: 'ϕ', CurlyPhi: 'φ', CurlyTheta: 'ϑ', CurlyRho: 'ϱ', FinalSigma: 'ς',
    CurlyPi: 'ϖ', CurlyKappa: 'ϰ', HBar: 'ℏ', Infinity: '∞', PartialD: '∂', Del: '∇', Degree: '°', Ellipsis: '…',
    ScriptL: 'ℓ', Micro: 'µ', Angstrom: 'Å', ImaginaryI: 'ⅈ', ImaginaryJ: 'ⅈ', ExponentialE: 'ⅇ', DifferentialD: 'ⅆ',
    DoubleStruckCapitalR: 'ℝ', DoubleStruckCapitalC: 'ℂ', DoubleStruckCapitalZ: 'ℤ', DoubleStruckCapitalQ: 'ℚ',
    DoubleStruckCapitalN: 'ℕ', Element: '∈', NotElement: '∉', Rule: '→', RuleDelayed: '⧴', LessEqual: '≤',
    GreaterEqual: '≥', NotEqual: '≠', Times: '×', Cross: '⨯', CenterDot: '·', Divide: '÷', PlusMinus: '±',
    MinusPlus: '∓', TildeTilde: '≈', Proportional: '∝', Implies: '⇒', Equivalent: '⇔', And: '∧', Or: '∨', Not: '¬',
    Union: '∪', Intersection: '∩', Subset: '⊂', SubsetEqual: '⊆', Congruent: '≡', CircleTimes: '⊗', LongEqual: '=='
  });
  // single characters that canonicalise to Mathematica symbols
  const CANON = { 'π': 'Pi', '∞': 'Infinity', 'ⅈ': 'I', 'ⅇ': 'E', '°': 'Degree', 'ℝ': 'Reals', 'ℂ': 'Complexes',
    'ℤ': 'Integers', 'ℚ': 'Rationals', 'ℕ': 'NonNegativeIntegers', 'ħ': 'ℏ' };
  const REV_NAMED = {};
  Object.keys(NAMED).forEach(k => { if (!(NAMED[k] in REV_NAMED)) REV_NAMED[NAMED[k]] = k; });

  const OPCHARS = '→⧴≤≥≠×⨯·÷±∓≈∝⇒⇔∧∨¬∪∩⊂⊆≡⊗∈∉';
  const SINGLE_ID = new Set([...'∞∂∇°ℏħℓℝℂℤℕℚⅈⅇⅆÅµ…□']);
  const OPS = ['===', '=!=', '//.', ':=', '->', ':>', '==', '!=', '<=', '>=', '&&', '||', '/.', '//', '@@', '/@',
    '+', '-', '*', '/', '^', '=', '<', '>', '!', "'", '.', ',', ';', '&', '@', '(', ')', '{', '}', '[', ']', ...OPCHARS];

  const isGreekChar = c => /[Ͱ-Ͽ]/.test(c);
  const isIdStart = c => /[A-Za-z$]/.test(c) || isGreekChar(c) || SINGLE_ID.has(c);
  const isIdPart = c => /[A-Za-z0-9$]/.test(c) || isGreekChar(c);

  class MmaError extends Error {
    constructor(msg, pos) { super(msg); this.pos = pos; }
  }
  class Unsupported extends Error {}

  // ------------------------------------------------------------------
  // Tokenizer
  // ------------------------------------------------------------------
  function tokenize(src) {
    src = src.replace(/\\\[([A-Za-z]+)\]/g, (m, n, off) => {
      if (!(n in NAMED)) throw new MmaError('Unknown named character \\[' + n + ']', off);
      return NAMED[n];
    });
    const toks = [];
    let i = 0, sp = false;
    while (i < src.length) {
      const c = src[i];
      if (/\s/.test(c)) { sp = true; i++; continue; }
      if (src.startsWith('(*', i)) {
        const j = src.indexOf('*)', i + 2);
        i = j < 0 ? src.length : j + 2; sp = true; continue;
      }
      const start = i;
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
        const m = /^(\d*\.?\d*)(?:`[\d.]*)?(?:(?:\*\^|[eE])([+-]?\d+))?/.exec(src.slice(i));
        toks.push({ t: 'num', v: m[1], e: m[2] || null, sp, pos: start });
        i += m[0].length;
      } else if (isIdStart(c)) {
        let j = i + 1;
        if (!SINGLE_ID.has(c)) while (j < src.length && isIdPart(src[j])) j++;
        let name = src.slice(i, j);
        let pat = null, sub = null, label = null;
        const subm = src[j] === '_' ? /^_([0-9]+|[a-z\u0370-\u03FF][A-Za-z0-9\u0370-\u03FF]*)/.exec(src.slice(j)) : null;
        if (src[j] === '_' && src[j + 1] === '{') {
          const close = src.indexOf('}', j);
          if (close < 0) throw new MmaError('Missing "}" in subscript label', j);
          label = src.slice(j + 2, close).trim();
          j = close + 1;
        }
        else if (subm) { sub = subm[1]; j += subm[0].length; }
        else if (src[j] === '_') {
          let k = j + 1;
          while (src[k] === '_') k++;
          if (src[k] === '.') k++;
          while (k < src.length && /[A-Za-z0-9$]/.test(src[k])) k++;
          pat = src.slice(j, k); j = k;
        }
        name = CANON[name] || name;
        toks.push({ t: 'id', v: name, pat, sub, label, sp, pos: start });
        i = j;
      } else if (c === '#') {
        let j = i + 1;
        while (/[0-9]/.test(src[j] || '')) j++;
        toks.push({ t: 'id', v: src.slice(i, j), sp, pos: start });
        i = j;
      } else if (c === '"') {
        let j = i + 1, s = '';
        while (j < src.length && src[j] !== '"') {
          if (src[j] === '\\' && j + 1 < src.length) { s += src[j + 1]; j += 2; } else s += src[j++];
        }
        if (j >= src.length) throw new MmaError('Unterminated string', i);
        toks.push({ t: 'str', v: s, sp, pos: start });
        i = j + 1;
      } else {
        const op = OPS.find(o => src.startsWith(o, i));
        if (!op) throw new MmaError('Unexpected character "' + c + '"', i);
        toks.push({ t: 'op', v: op, sp, pos: start });
        i += op.length;
      }
      sp = false;
    }
    return toks;
  }

  // ------------------------------------------------------------------
  // AST helpers
  // ------------------------------------------------------------------
  const S = n => ({ k: 'sym', n });
  const Num = (v, e = null) => ({ k: 'num', v, e });
  const C = (h, ...a) => ({ k: 'call', h: typeof h === 'string' ? S(h) : h, a });
  const head = n => (n && n.k === 'call' && n.h.k === 'sym') ? n.h.n : null;
  const isNegNum = n => n.k === 'num' && n.v.startsWith('-');
  const isInt = n => n.k === 'num' && /^-?\d+$/.test(n.v) && !n.e;

  function neg(x) {
    if (x.k === 'num' && !isNegNum(x) && !x.paren) return Num('-' + x.v, x.e);
    if (head(x) === 'Minus') return x.a[0];
    return C('Minus', x);
  }
  function flat(name, a, b) {
    const left = head(a) === name && !a.paren ? a.a : [a];
    return C(name, ...left, b);
  }

  // ------------------------------------------------------------------
  // Parser (Pratt)
  // ------------------------------------------------------------------
  const TIMES_BP = 400;
  const INFIX = {
    ';': [10], '=': [40, 'Set', 'R'], ':=': [40, 'SetDelayed', 'R'], '//': [70], '&': [90],
    '/.': [110, 'ReplaceAll'], '//.': [110, 'ReplaceRepeated'],
    '->': [120, 'Rule', 'R'], '→': [120, 'Rule', 'R'], ':>': [120, 'RuleDelayed', 'R'], '⧴': [120, 'RuleDelayed', 'R'],
    '⇒': [200, 'Implies', 'R'], '⇔': [205, 'Equivalent', 'F'],
    '||': [215, 'Or', 'F'], '∨': [215, 'Or', 'F'], '&&': [216, 'And', 'F'], '∧': [216, 'And', 'F'],
    '∈': [250, 'Element'], '∉': [250, 'NotElement'], '⊂': [250, 'Subset'], '⊆': [250, 'SubsetEqual'],
    '==': [290, 'Equal', 'F'], '!=': [290, 'Unequal'], '≠': [290, 'Unequal'], '<': [290, 'Less'], '>': [290, 'Greater'],
    '<=': [290, 'LessEqual'], '≤': [290, 'LessEqual'], '>=': [290, 'GreaterEqual'], '≥': [290, 'GreaterEqual'],
    '===': [290, 'SameQ'], '=!=': [290, 'UnsameQ'], '≈': [290, 'TildeTilde'], '∝': [290, 'Proportional'], '≡': [290, 'Congruent'],
    '∪': [300, 'Union', 'F'], '∩': [305, 'Intersection', 'F'],
    '+': [310], '-': [310], '±': [310, 'PlusMinus'], '∓': [310, 'MinusPlus'],
    '⊗': [397, 'CircleTimes', 'F'], '⨯': [398, 'Cross', 'F'],
    '*': [400], '×': [400], '/': [400], '÷': [400],
    '.': [490, 'Dot', 'F'], '·': [490, 'Dot', 'F'],
    '^': [590, 'Power', 'R'], '!': [610], '/@': [620, 'Map', 'R'], '@@': [620, 'Apply', 'R'],
    '@': [640], "'": [670], '[': [1000]
  };

  class Parser {
    constructor(toks) { this.toks = toks; this.i = 0; }
    peek(k = 0) { return this.toks[this.i + k]; }
    next() { return this.toks[this.i++]; }
    atEnd() { return this.i >= this.toks.length; }
    isOp(t, v) { return t && t.t === 'op' && t.v === v; }
    peekOp(v) { return this.isOp(this.peek(), v); }
    expectOp(v) {
      const t = this.next();
      if (!this.isOp(t, v)) throw new MmaError(t ? `Expected "${v}" but found "${t.v}"` : `Missing "${v}"`, t ? t.pos : -1);
    }
    lbp(t) { return t.t === 'op' && INFIX[t.v] ? INFIX[t.v][0] : 0; }
    startsExpr(t) { return t.t === 'num' || t.t === 'id' || t.t === 'str' || (t.t === 'op' && (t.v === '(' || t.v === '{')); }

    parse() {
      if (!this.toks.length) return null;
      const e = this.expr(0);
      if (!this.atEnd()) { const t = this.peek(); throw new MmaError(`Unexpected "${t.v}"`, t.pos); }
      return e;
    }
    expr(rbp) {
      const t = this.next();
      if (!t) throw new MmaError('Unexpected end of input', -1);
      let left = this.nud(t);
      for (;;) {
        const n = this.peek();
        if (!n) break;
        const bp = this.lbp(n);
        if (bp > rbp) { this.next(); left = this.led(n, left); continue; }
        if (bp === 0 && this.startsExpr(n) && TIMES_BP > rbp) { left = flat('Times', left, this.expr(TIMES_BP)); continue; }
        break;
      }
      return left;
    }
    args(close) {
      const out = [];
      if (this.peekOp(close)) { this.next(); return out; }
      for (;;) {
        out.push(this.expr(0));
        if (this.peekOp(',')) { this.next(); continue; }
        this.expectOp(close);
        return out;
      }
    }
    nud(t) {
      if (t.t === 'num') return Num(t.v, t.e);
      if (t.t === 'id') {
        const s = S(t.v);
        if (t.pat != null) s.pat = t.pat;
        if (t.label != null) {
          const parts = t.label.split(',').map(x => x.trim());
          if (parts.every(x => /^([ijklmn]+|[0-9]+)$/.test(x)))
            return C('Subscript', s, ...parts.map(x => /^[0-9]/.test(x) ? Num(x) : S(x)));
          return C('Subscript', s, { k: 'str', v: t.label.replace(/"/g, '') });
        }
        if (t.sub != null) return C('Subscript', s, /^[0-9]/.test(t.sub) ? Num(t.sub) : S(CANON[t.sub] || t.sub));
        return s;
      }
      if (t.t === 'str') return { k: 'str', v: t.v };
      switch (t.v) {
        case '(': { const e = this.expr(0); this.expectOp(')'); return Object.assign({}, e, { paren: true }); }
        case '{': return C('List', ...this.args('}'));
        case '-': return neg(this.expr(480));
        case '+': return this.expr(480);
        case '!': case '¬': return C('Not', this.expr(230));
        case '±': return C('PlusMinus', this.expr(480));
        case '∓': return C('MinusPlus', this.expr(480));
      }
      throw new MmaError(`Unexpected "${t.v}"`, t.pos);
    }
    led(t, left) {
      switch (t.v) {
        case ';': {
          const parts = head(left) === 'CompoundExpression' && !left.paren ? left.a.slice() : [left];
          const n = this.peek();
          if (!n || (n.t === 'op' && [')', ']', '}', ','].includes(n.v))) parts.push(S('Null'));
          else parts.push(this.expr(10));
          return C('CompoundExpression', ...parts);
        }
        case '//': return { k: 'call', h: this.expr(70), a: [left] };
        case '&': return C('Function', left);
        case '+': return flat('Plus', left, this.expr(310));
        case '-': return flat('Plus', left, neg(this.expr(310)));
        case '*': case '×': return flat('Times', left, this.expr(400));
        case '/': case '÷': return C('Divide', left, this.expr(400));
        case '!': return C('Factorial', left);
        case "'": {
          let n = 1;
          while (this.peekOp("'")) { this.next(); n++; }
          return { k: 'call', h: C('Derivative', Num(String(n))), a: [left] };
        }
        case '@': return { k: 'call', h: left, a: [this.expr(639)] };
        case '[': {
          if (this.peekOp('[') && !this.peek().sp) {
            this.next();
            const idx = this.args(']');
            this.expectOp(']');
            return C('Part', left, ...idx);
          }
          return { k: 'call', h: left, a: this.args(']') };
        }
        default: {
          const [bp, name, assoc] = INFIX[t.v];
          const rhs = this.expr(assoc === 'R' ? bp - 1 : bp);
          return assoc === 'F' ? flat(name, left, rhs) : C(name, left, rhs);
        }
      }
    }
  }

  function parse(src) {
    return new Parser(tokenize(src)).parse();
  }

  // Shared helpers -------------------------------------------------------
  function negForm(t) {
    if (isNegNum(t)) return Num(t.v.slice(1), t.e);
    const h = head(t);
    if (h === 'Minus') return t.a[0];
    if (h === 'Times') {
      const f = t.a[0];
      if (isNegNum(f)) {
        const abs = Num(f.v.slice(1), f.e);
        const rest = t.a.slice(1);
        if (abs.v === '1' && !abs.e) return rest.length === 1 ? rest[0] : C('Times', ...rest);
        return C('Times', abs, ...rest);
      }
      if (head(f) === 'Minus') return C('Times', f.a[0], ...t.a.slice(1));
    }
    if (h === 'Divide') { const ng = negForm(t.a[0]); if (ng) return C('Divide', ng, t.a[1]); }
    return null;
  }

  // Free symbols (variables, not function heads or known constants)
  const CONSTANTS = new Set(['Pi', 'E', 'I', 'Infinity', 'ComplexInfinity', 'Degree', 'EulerGamma', 'GoldenRatio',
    'Catalan', 'True', 'False', 'Null', 'Reals', 'Complexes', 'Integers', 'Rationals', 'NonNegativeIntegers',
    'PositiveReals', 'Indeterminate', 'Automatic', 'All', 'None', 'Direction']);
  function freeSymbols(n, out = new Set()) {
    if (!n) return out;
    if (n.k === 'sym') { if (!CONSTANTS.has(n.n) && n.n[0] !== '#') out.add(n.n); }
    else if (n.k === 'call') {
      if (n.h.k !== 'sym') freeSymbols(n.h, out);
      n.a.forEach(x => freeSymbols(x, out));
    }
    return out;
  }

  // ------------------------------------------------------------------
  // LaTeX emitter
  // ------------------------------------------------------------------
  const SYM_TEX = {
    Pi: '\\pi', E: 'e', I: 'i', Infinity: '\\infty', ComplexInfinity: '\\tilde{\\infty}', Degree: '{}^{\\circ}',
    EulerGamma: '\\gamma', GoldenRatio: '\\phi', Catalan: 'G', True: '\\mathrm{True}', False: '\\mathrm{False}',
    Null: '', Reals: '\\mathbb{R}', Complexes: '\\mathbb{C}', Integers: '\\mathbb{Z}', Rationals: '\\mathbb{Q}',
    NonNegativeIntegers: '\\mathbb{N}', PositiveReals: '\\mathbb{R}^{+}', Indeterminate: '\\text{Indeterminate}',
    HBar: '\\hbar', hbar: '\\hbar', ell: '\\ell', nabla: '\\nabla', partial: '\\partial'
  };
  const OPNAME = {
    Sin: '\\sin', Cos: '\\cos', Tan: '\\tan', Cot: '\\cot', Sec: '\\sec', Csc: '\\csc',
    Sinh: '\\sinh', Cosh: '\\cosh', Tanh: '\\tanh', Coth: '\\coth', Sech: '\\operatorname{sech}', Csch: '\\operatorname{csch}',
    ArcSin: '\\arcsin', ArcCos: '\\arccos', ArcTan: '\\arctan', ArcCot: '\\operatorname{arccot}',
    ArcSec: '\\operatorname{arcsec}', ArcCsc: '\\operatorname{arccsc}', ArcSinh: '\\operatorname{arsinh}',
    ArcCosh: '\\operatorname{arcosh}', ArcTanh: '\\operatorname{artanh}', ArcCoth: '\\operatorname{arcoth}',
    Log: '\\ln', Log10: '\\log_{10}', Log2: '\\log_{2}', Det: '\\det', Tr: '\\operatorname{tr}', Arg: '\\arg',
    Re: '\\operatorname{Re}', Im: '\\operatorname{Im}', Sign: '\\operatorname{sgn}', Max: '\\max', Min: '\\min',
    GCD: '\\gcd', LCM: '\\operatorname{lcm}', Erf: '\\operatorname{erf}', Erfc: '\\operatorname{erfc}',
    Sinc: '\\operatorname{sinc}', Round: '\\operatorname{round}', Gamma: '\\Gamma', Zeta: '\\zeta', Beta: '\\mathrm{B}',
    LogGamma: '\\ln\\Gamma', PolyGamma: '\\psi', MatrixRank: '\\operatorname{rank}', Exp_: '\\exp'
  };
  // operators that may drop parentheses around a simple argument: \sin x
  const PAREN_OPT = new Set(['Sin', 'Cos', 'Tan', 'Cot', 'Sec', 'Csc', 'Sinh', 'Cosh', 'Tanh', 'Coth', 'Sech', 'Csch',
    'ArcSin', 'ArcCos', 'ArcTan', 'ArcCot', 'ArcSec', 'ArcCsc', 'ArcSinh', 'ArcCosh', 'ArcTanh', 'ArcCoth',
    'Log', 'Log10', 'Log2', 'Det', 'Tr', 'Arg']);
  const BIN = {
    Equal: ['=', 290], Unequal: ['\\neq', 290], Less: ['<', 290], Greater: ['>', 290], LessEqual: ['\\leq', 290],
    GreaterEqual: ['\\geq', 290], SameQ: ['\\equiv', 290], UnsameQ: ['\\not\\equiv', 290], TildeTilde: ['\\approx', 290],
    Proportional: ['\\propto', 290], Congruent: ['\\equiv', 290],
    Rule: ['\\to', 120, 'R'], RuleDelayed: [':\\to', 120, 'R'], Set: ['=', 40, 'R'], SetDelayed: [':=', 40, 'R'],
    And: ['\\land', 216], Or: ['\\lor', 215], Implies: ['\\Rightarrow', 200, 'R'], Equivalent: ['\\Leftrightarrow', 205],
    Element: ['\\in', 250], NotElement: ['\\notin', 250], Subset: ['\\subset', 250], SubsetEqual: ['\\subseteq', 250],
    Union: ['\\cup', 300], Intersection: ['\\cap', 305], Dot: ['\\cdot', 490], Cross: ['\\times', 398],
    CircleTimes: ['\\otimes', 397], PlusMinus: ['\\pm', 310], MinusPlus: ['\\mp', 310], ReplaceRepeated: ['/\\!/.', 110]
  };
  const SUBFN = { BesselJ: 'J', BesselY: 'Y', BesselI: 'I', BesselK: 'K', SphericalBesselJ: 'j', SphericalBesselY: 'y',
    HermiteH: 'H', ChebyshevT: 'T', ChebyshevU: 'U', LegendreQ: 'Q', HankelH1: 'H^{(1)}', HankelH2: 'H^{(2)}' };
  const HOLD = new Set(['Hold', 'HoldForm', 'Defer', 'Unevaluated', 'Inactivate', 'TraditionalForm', 'StandardForm',
    'TeXForm', 'InputForm', 'Activate', 'N', 'Evaluate']);
  const SCRIPTED = new Set(['Subscript', 'Superscript', 'Subsuperscript', 'Power', 'Conjugate', 'Transpose',
    'ConjugateTranspose', 'Inverse', 'Dagger', 'Part', 'Exp']);
  const UNITS_TEX = { Meters: 'm', Seconds: 's', Kilograms: 'kg', Grams: 'g', Newtons: 'N', Joules: 'J', Volts: 'V',
    Amperes: 'A', Ohms: '\\Omega', Watts: 'W', Hertz: 'Hz', Kelvins: 'K', Teslas: 'T', Pascals: 'Pa', Coulombs: 'C',
    Farads: 'F', Henries: 'H', Electronvolts: 'eV', Centimeters: 'cm', Millimeters: 'mm', Kilometers: 'km',
    Nanometers: 'nm', Micrometers: '\\mu m', Milliseconds: 'ms', Microseconds: '\\mu s', Liters: 'L', Moles: 'mol' };

  function texEscape(s) {
    return s.replace(/\\/g, '\\backslash ').replace(/([{}$&#^_%~])/g, '\\$1');
  }
  function isSimpleBase(b) {
    return [...b].length === 1 || GREEK_SET.has(b) || TEX_CAPS.has(b);
  }
  function baseTeX(b, iso) {
    const acc = /^(.+?)(ddot|dot|hat|bar|vec|tilde)$/.exec(b);
    if (acc && isSimpleBase(acc[1])) {
      if (iso && acc[2] === 'vec') return `\\boldsymbol{${baseTeX(acc[1], iso)}}`;
      return `\\${acc[2]}{${baseTeX(acc[1], iso)}}`;
    }
    if (GREEK_SET.has(b) || VAR_GREEK.has(b)) return b === 'omicron' ? 'o' : '\\' + b;
    if (TEX_CAPS.has(b)) return '\\' + b;
    if (SYM_TEX[b] !== undefined) return SYM_TEX[b];
    const chars = [...b];
    if (chars.length === 1) return UNI_TEX[b] !== undefined ? UNI_TEX[b] : b;
    if (chars.every(c => UNI_TEX[c])) return chars.map(c => UNI_TEX[c]).join(' ');
    // a leading Greek letter followed by a name reads as a product-like prefix: ΔV, δx
    if (UNI_TEX[chars[0]] && isGreekChar(chars[0])) return UNI_TEX[chars[0]] + ' ' + baseTeX(chars.slice(1).join(''), iso);
    return '\\mathit{' + chars.map(c => UNI_TEX[c] ? '{' + UNI_TEX[c] + '}' : (c === '$' ? '\\$' : c)).join('') + '}';
  }
  function symTeX(n, iso) {
    if (iso && (n === 'E' || n === 'I')) return n === 'E' ? '\\mathrm{e}' : '\\mathrm{i}';
    if (SYM_TEX[n] !== undefined) return SYM_TEX[n];
    if (n[0] === '#') return '\\#' + n.slice(1);
    const m = /^(.*?[^0-9])([0-9]+)$/.exec(n);
    if (m) return baseTeX(m[1], iso) + '_{' + m[2] + '}';
    return baseTeX(n, iso);
  }

  const TEX_DEFAULTS = { mult: 'space', frac: 'frac', deriv: 'auto', diff: 'roman', matrix: 'pmatrix', notation: 'iso' };

  class TeX {
    constructor(opts) { this.o = Object.assign({}, TEX_DEFAULTS, opts || {}); }
    get D() { return this.o.diff === 'italic' ? 'd' : '\\mathrm{d}'; }
    get iso() { return this.o.notation !== 'classic'; }
    get eTeX() { return this.iso ? '\\mathrm{e}' : 'e'; }

    prec(n) {
      if (n.k === 'num') return isNegNum(n) ? 480 : (n.e ? 400 : 1000);
      if (n.k !== 'call') return 1000;
      const h = head(n);
      if (!h) return 1000;
      if (BIN[h] && n.a.length > 1) return BIN[h][1];
      switch (h) {
        case 'Plus': return 310;
        case 'Minus': return 480;
        case 'Times': return 400;
        case 'Divide': return this.o.frac === 'inline' ? 400 : (negForm(n.a[0]) ? 480 : 1000);
        case 'PlusMinus': case 'MinusPlus': case 'Grad': case 'Div': case 'Curl': case 'Laplacian': return 480;
        case 'Power': case 'Exp': case 'Superscript': case 'Conjugate': case 'Transpose': case 'ConjugateTranspose':
        case 'Inverse': case 'Dagger': case 'Factorial': return 590;
        case 'Integrate': case 'NIntegrate': case 'Sum': case 'NSum': case 'Product': case 'Limit': return 395;
        case 'D': case 'Dt': return n.a[0] && n.a[0].k === 'sym' ? 1000 : 395;
        case 'Mod': return 400;
        case 'Not': return 230;
        case 'CompoundExpression': return 10;
        case 'Function': return 90;
        case 'ReplaceAll': return 1000;
      }
      if (PAREN_OPT.has(h) && n.a.length === 1 && this.simpleArg(n.a[0])) return 480;
      return 1000;
    }
    tex(n, min = 0, ctx) {
      const s = this.raw(n, ctx);
      return this.prec(n) < min ? `\\left(${s}\\right)` : s;
    }
    simpleArg(x) {
      return x.k === 'sym' || (x.k === 'num' && !isNegNum(x) && !x.e) || head(x) === 'Subscript';
    }
    argList(a) { return `\\left(${a.map(x => this.tex(x)).join(', ')}\\right)`; }
    scriptBase(x) {
      if (x.k === 'sym' && (x.n === 'E' || x.n === 'I')) return x.n;
      const s = this.tex(x, 1000);
      return SCRIPTED.has(head(x)) ? `{${s}}` : s;
    }
    fnName(name) {
      if (OPNAME[name]) return OPNAME[name];
      if (SYM_TEX[name] !== undefined) return SYM_TEX[name];
      const first = name[0];
      if ([...name].length === 1 || GREEK_SET.has(name) || TEX_CAPS.has(name) || /^[a-z]/.test(first) ||
          isGreekChar(first) || /\d$/.test(name)) return symTeX(name, this.iso);
      return `\\operatorname{${name}}`;
    }
    opApply(h, args, forceParen) {
      const op = OPNAME[h];
      if (args.length === 1 && PAREN_OPT.has(h) && !forceParen && this.simpleArg(args[0])) return `${op} ${this.tex(args[0])}`;
      return op + this.argList(args);
    }

    raw(n, ctx = {}) {
      if (!n) return '';
      if (n.k === 'num') return n.e ? `${n.v} \\times 10^{${n.e}}` : n.v;
      if (n.k === 'sym') return symTeX(n.n, this.iso);
      if (n.k === 'str') return `\\text{${texEscape(n.v)}}`;
      // head is itself an expression
      if (n.h.k !== 'sym') {
        const hh = head(n.h);
        if (hh === 'Derivative') return this.derivHead(n.h.a, n.a[0]);
        if ((hh === 'Inactive' || HOLD.has(hh)) && n.h.a.length === 1) return this.raw({ k: 'call', h: n.h.a[0], a: n.a }, ctx);
        return this.tex(n.h, 1000) + this.argList(n.a);
      }
      const h = n.h.n, a = n.a;
      if (BIN[h] && a.length > 1) return this.binary(h, a);
      const fn = this['f_' + h];
      if (fn) { const r = fn.call(this, a, n, ctx); if (r != null) return r; }
      if (HOLD.has(h) && a.length >= 1) return this.tex(a[0]);
      if (SUBFN[h] && a.length === 2) return `${SUBFN[h]}_{${this.tex(a[0])}}${this.argList([a[1]])}`;
      if (OPNAME[h]) return this.opApply(h, a, ctx.forceParen);
      return this.fnName(h) + this.argList(a);
    }
    binary(h, a) {
      const [op, p, assoc] = BIN[h];
      if (assoc === 'R') return `${this.tex(a[0], p + 1)} ${op} ${this.tex(a[1], p)}`;
      return a.map((x, i) => this.tex(x, i === 0 ? p : p + 1)).join(` ${op} `);
    }
    derivHead(orders, f) {
      const fs = this.tex(f, 1000);
      if (orders.length === 1) {
        const o = orders[0];
        if (isInt(o) && +o.v <= 3) return fs + "'".repeat(+o.v);
        return `${fs}^{(${this.tex(o)})}`;
      }
      return `${fs}^{(${orders.map(o => this.tex(o)).join(',')})}`;
    }

    // ---- arithmetic
    f_Plus(a) {
      let out = this.tex(a[0], 310);
      for (let i = 1; i < a.length; i++) {
        const ng = negForm(a[i]);
        out += ng ? ' - ' + this.tex(ng, 311) : ' + ' + this.tex(a[i], 311);
      }
      return out;
    }
    f_Minus(a) {
      const x = a[0], h = head(x);
      return '-' + this.tex(x, h === 'Times' || h === 'Divide' ? 400 : 480);
    }
    f_Times(a) {
      let f = a.slice(), sign = '';
      const first = f[0];
      if (isNegNum(first)) {
        sign = '-';
        const v = first.v.slice(1);
        if (v === '1' && !first.e && f.length > 1) f.shift(); else f[0] = Num(v, first.e);
      } else if (head(first) === 'Minus') { sign = '-'; f[0] = first.a[0]; }
      const parts = f.map((x, i) => {
        const last = i === f.length - 1;
        if (i > 0 && negForm(x)) return `\\left(${this.raw(x)}\\right)`;
        const p = this.prec(x);
        if (p === 395 && last) return this.raw(x);
        const h = head(x);
        if (!last && h && PAREN_OPT.has(h)) return this.raw(x, { forceParen: true });
        return this.tex(x, 400);
      });
      let out = parts[0];
      for (let i = 1; i < parts.length; i++) out += this.sep(f[i - 1], f[i], parts[i]) + parts[i];
      return sign + out;
    }
    sep(prev, x, s) {
      if (this.o.mult === 'cdot') return ' \\cdot ';
      if (this.o.mult === 'times') return ' \\times ';
      if (/^[0-9.]/.test(s) || s[0] === '-') return ' \\cdot ';
      if (x.k === 'sym' && x.n === 'Degree') return '';
      if (prev.k === 'num' && prev.e) return ' \\, ';
      return ' ';
    }
    f_Divide(a) {
      if (this.o.frac === 'inline') return `${this.tex(a[0], 400)}/${this.tex(a[1], 401)}`;
      const ng = negForm(a[0]);
      if (ng) return `-\\frac{${this.tex(ng)}}{${this.tex(a[1])}}`;
      return `\\frac{${this.tex(a[0])}}{${this.tex(a[1])}}`;
    }
    f_Rational(a) { return a.length === 2 ? this.f_Divide(a) : null; }
    f_Power(a) {
      if (a.length !== 2) return null;
      const [b, e] = a, hb = head(b);
      if (isHalf(e)) return `\\sqrt{${this.tex(b)}}`;
      if (b.k === 'sym' && b.n === 'E') return `${this.eTeX}^{${this.tex(e)}}`;
      if (hb && PAREN_OPT.has(hb) && b.a.length === 1 && ((e.k === 'num' && !isNegNum(e)) || e.k === 'sym')) {
        const arg = b.a[0];
        const op = OPNAME[hb];
        return this.simpleArg(arg) ? `${op}^{${this.tex(e)}} ${this.tex(arg)}` : `${op}^{${this.tex(e)}}${this.argList([arg])}`;
      }
      let bs;
      if (hb === 'Divide' || hb === 'Rational') bs = `\\left(${this.raw(b)}\\right)`;
      else if (hb === 'Subscript' || hb === 'Part') bs = this.raw(b);
      else bs = this.tex(b, 591);
      return `${bs}^{${this.tex(e)}}`;
    }
    f_Sqrt(a) { return a.length === 1 ? `\\sqrt{${this.tex(a[0])}}` : null; }
    f_CubeRoot(a) { return `\\sqrt[3]{${this.tex(a[0])}}`; }
    f_Surd(a) { return a.length === 2 ? `\\sqrt[${this.tex(a[1])}]{${this.tex(a[0])}}` : null; }
    f_Exp(a) { return a.length === 1 ? `${this.eTeX}^{${this.tex(a[0])}}` : null; }
    f_Log(a) {
      if (a.length !== 2) return null;
      const [b, x] = a;
      return this.simpleArg(x) ? `\\log_{${this.tex(b)}} ${this.tex(x)}` : `\\log_{${this.tex(b)}}${this.argList([x])}`;
    }
    f_Abs(a) { return `\\left|${this.tex(a[0])}\\right|`; }
    f_Norm(a) { return `\\left\\lVert ${this.tex(a[0])}\\right\\rVert` + (a[1] ? `_{${this.tex(a[1])}}` : ''); }
    f_Floor(a) { return `\\left\\lfloor ${this.tex(a[0])}\\right\\rfloor`; }
    f_Ceiling(a) { return `\\left\\lceil ${this.tex(a[0])}\\right\\rceil`; }
    f_Factorial(a) { return this.tex(a[0], 1000) + '!'; }
    f_Factorial2(a) { return this.tex(a[0], 1000) + '!!'; }
    f_Binomial(a) { return a.length === 2 ? `\\binom{${this.tex(a[0])}}{${this.tex(a[1])}}` : null; }
    f_Mod(a) { return a.length === 2 ? `${this.tex(a[0], 400)} \\bmod ${this.tex(a[1], 401)}` : null; }
    f_Not(a) { return `\\neg ${this.tex(a[0], 231)}`; }
    f_PlusMinus(a) { return a.length === 1 ? `\\pm ${this.tex(a[0], 480)}` : null; }
    f_MinusPlus(a) { return a.length === 1 ? `\\mp ${this.tex(a[0], 480)}` : null; }
    f_Power_(a) { return null; }

    // ---- postfix decorations
    post(a, s) { return this.scriptBase(a[0]) + s; }
    f_Conjugate(a) { return this.post(a, '^{*}'); }
    f_Transpose(a) { return this.post(a, this.iso ? '^{\\mathrm{T}}' : '^{\\mathsf{T}}'); }
    f_ConjugateTranspose(a) { return this.post(a, '^{\\dagger}'); }
    f_Dagger(a) { return this.post(a, '^{\\dagger}'); }
    f_Inverse(a) { return this.post(a, '^{-1}'); }
    f_Subscript(a) { return `${this.scriptBase(a[0])}_{${this.subscripts(a.slice(1))}}`; }
    // ISO 80000-2: running indices and quantities are italic; descriptive labels are upright
    subscripts(subs) {
      if (!this.iso) return subs.map(x => x.k === 'str' ? `\\text{${texEscape(x.v)}}` : this.tex(x)).join(',');
      const upright = x => x.k === 'str' ||
        (x.k === 'sym' && [...x.n].length > 1 && !GREEK_SET.has(x.n) && !VAR_GREEK.has(x.n) && !TEX_CAPS.has(x.n) &&
          SYM_TEX[x.n] === undefined && !/[0-9]$/.test(x.n) && !/(ddot|dot|hat|bar|vec|tilde)$/.test(x.n) &&
          !/^[ijklmn]+$/.test(x.n));
      if (subs.every(upright)) return `\\mathrm{${subs.map(x => texEscape(x.k === 'str' ? x.v : x.n)).join(',')}}`;
      return subs.map(x => upright(x) ? `\\mathrm{${texEscape(x.k === 'str' ? x.v : x.n)}}` : this.tex(x)).join(',');
    }
    f_Superscript(a) { return `${this.scriptBase(a[0])}^{${this.tex(a[1])}}`; }
    f_Subsuperscript(a) { return `${this.scriptBase(a[0])}_{${this.tex(a[1])}}^{${this.tex(a[2])}}`; }
    f_Part(a) { return `${this.scriptBase(a[0])}_{${a.slice(1).map(x => this.tex(x)).join(',')}}`; }
    accent(a, short, long) {
      const s = this.tex(a[0]);
      const one = a[0].k === 'sym' && [...symTeX(a[0].n).replace(/^\\[a-zA-Z]+$/, 'x')].length === 1;
      return `\\${one || !long ? short : long}{${s}}`;
    }
    f_OverHat(a) { return this.accent(a, 'hat', 'widehat'); }
    f_Hat(a) { return this.accent(a, 'hat', 'widehat'); }
    f_OverBar(a) { return this.accent(a, 'bar', 'overline'); }
    f_Bar(a) { return this.accent(a, 'bar', 'overline'); }
    f_OverVector(a) { return this.iso ? `\\boldsymbol{${this.tex(a[0])}}` : this.accent(a, 'vec', 'overrightarrow'); }
    f_Vec(a) { return this.f_OverVector(a); }
    f_Log10(a) { return this.iso && a.length === 1 ? this.namedOp('\\lg', a[0]) : null; }
    f_Log2(a) { return this.iso && a.length === 1 ? this.namedOp('\\operatorname{lb}', a[0]) : null; }
    namedOp(op, x) { return this.simpleArg(x) ? `${op} ${this.tex(x)}` : op + this.argList([x]); }
    f_OverTilde(a) { return this.accent(a, 'tilde', 'widetilde'); }
    f_UnderBar(a) { return `\\underline{${this.tex(a[0])}}`; }
    f_OverDot(a) {
      const k = a[1] && isInt(a[1]) ? +a[1].v : 1;
      return `\\${['dot', 'ddot', 'dddot', 'ddddot'][Math.min(k, 4) - 1]}{${this.tex(a[0])}}`;
    }
    f_Overscript(a) { return `\\overset{${this.tex(a[1])}}{${this.tex(a[0])}}`; }
    f_Underscript(a) { return `\\underset{${this.tex(a[1])}}{${this.tex(a[0])}}`; }

    // ---- lists & matrices
    isMatrix(n) {
      if (head(n) !== 'List' || !n.a.length) return false;
      const w = n.a[0].k === 'call' && head(n.a[0]) === 'List' ? n.a[0].a.length : -1;
      return w > 0 && n.a.every(r => head(r) === 'List' && r.a.length === w);
    }
    matrix(rows) {
      const env = this.o.matrix;
      return `\\begin{${env}} ${rows.map(r => r.map(x => this.tex(x)).join(' & ')).join(' \\\\ ')} \\end{${env}}`;
    }
    f_Det(a) {
      if (a.length === 1 && this.isMatrix(a[0])) {
        const env = this.o.matrix; this.o.matrix = 'vmatrix';
        const r = this.matrix(a[0].a.map(r => r.a)); this.o.matrix = env; return r;
      }
      return null;
    }
    f_List(a, n) {
      if (this.isMatrix(n)) return this.matrix(a.map(r => r.a));
      return `\\left\\{${a.map(x => this.tex(x)).join(', ')}\\right\\}`;
    }
    f_MatrixForm(a) {
      const x = a[0];
      if (this.isMatrix(x)) return this.matrix(x.a.map(r => r.a));
      if (head(x) === 'List') return this.matrix(x.a.map(e => [e]));
      return this.tex(x);
    }

    // ---- calculus
    f_Integrate(a) {
      if (a.length < 2) return null;
      const [f, ...specs] = a;
      const ps = specs.map(s => head(s) === 'List' && s.a.length >= 3 ? { v: s.a[0], lo: s.a[1], hi: s.a[2] }
        : { v: head(s) === 'List' ? s.a[0] : s });
      const ints = ps.map(p => p.lo ? `\\int_{${this.tex(p.lo)}}^{${this.tex(p.hi)}}` : '\\int').join(' ');
      const ds = ps.slice().reverse().map(p => `\\,${this.D} ${this.tex(p.v, 1000)}`).join('');
      return `${ints} ${this.tex(f, 400)}${ds}`;
    }
    f_NIntegrate(a) { return this.f_Integrate(a); }
    derivSpecs(specs) {
      const vars = [];
      specs.forEach(s => {
        let v = s, k = Num('1');
        if (head(s) === 'List' && s.a.length === 2) { v = s.a[0]; k = s.a[1]; }
        const key = this.tex(v);
        const prev = vars[vars.length - 1];
        if (prev && prev.key === key && isInt(prev.k) && isInt(k)) prev.k = Num(String(+prev.k.v + +k.v));
        else vars.push({ v, k, key });
      });
      return vars;
    }
    f_D(a, n, ctx, forceD) {
      if (a.length < 2) return null;
      const [f, ...specs] = a;
      const vars = this.derivSpecs(specs);
      const names = new Set(vars.map(v => v.key));
      let partial;
      if (forceD) partial = false;
      else if (this.o.deriv === 'partial') partial = true;
      else if (this.o.deriv === 'd') partial = false;
      else {
        const vs = new Set(vars.filter(v => v.v.k === 'sym').map(v => v.v.n));
        const others = [...freeSymbols(f)].filter(s => !vs.has(s) && !(f.k === 'sym' && f.n === s));
        partial = names.size > 1 || others.length > 0;
      }
      const ds = partial ? '\\partial' : this.D;
      const allInt = vars.every(v => isInt(v.k));
      const order = allInt ? String(vars.reduce((s, v) => s + +v.k.v, 0)) : vars.map(v => this.tex(v.k)).join('+');
      const num = ds + (order !== '1' ? `^{${order}}` : '');
      const den = vars.map(v => `${ds} ${this.tex(v.v, 1000)}${(isInt(v.k) && v.k.v === '1') ? '' : `^{${this.tex(v.k)}}`}`).join('\\,');
      if (f.k === 'sym') return `\\frac{${num} ${this.tex(f)}}{${den}}`;
      return `\\frac{${num}}{${den}} ${this.tex(f, 1000)}`;
    }
    f_Dt(a, n, ctx) { return this.f_D(a, n, ctx, true); }
    bigOp(sym, a) {
      if (a.length < 2) return null;
      const [f, ...specs] = a;
      let pre = '';
      specs.forEach(s => {
        let sub;
        if (head(s) === 'List') {
          const v = this.tex(s.a[0]);
          if (s.a.length === 1) sub = `_{${v}}`;
          else if (s.a.length === 2) sub = head(s.a[1]) === 'List' ? `_{${v} \\in ${this.tex(s.a[1])}}` : `_{${v}=1}^{${this.tex(s.a[1])}}`;
          else sub = `_{${v}=${this.tex(s.a[1])}}^{${this.tex(s.a[2])}}`;
        } else sub = `_{${this.tex(s)}}`;
        pre += `${sym}${sub} `;
      });
      return pre + this.tex(f, 400);
    }
    f_Sum(a) { return this.bigOp('\\sum', a); }
    f_NSum(a) { return this.bigOp('\\sum', a); }
    f_Product(a) { return this.bigOp('\\prod', a); }
    f_Limit(a) {
      if (a.length < 2 || head(a[1]) !== 'Rule') return null;
      const [f, r, ...opts] = a;
      let dir = '';
      opts.forEach(o => {
        if (head(o) === 'Rule' && o.a[0].k === 'sym' && o.a[0].n === 'Direction') {
          const d = o.a[1];
          const v = d.k === 'str' ? d.v : (d.k === 'num' ? d.v : '');
          if (v === 'FromAbove' || v === '-1' || v === 'FromRight') dir = '^{+}';
          if (v === 'FromBelow' || v === '1' || v === 'FromLeft') dir = '^{-}';
        }
      });
      return `\\lim_{${this.tex(r.a[0])} \\to ${this.tex(r.a[1])}${dir}} ${this.tex(f, 400)}`;
    }
    f_Piecewise(a) {
      if (head(a[0]) !== 'List') return null;
      const rows = a[0].a.map(p => head(p) === 'List' && p.a.length === 2 ? `${this.tex(p.a[0])} & ${this.tex(p.a[1])}` : this.tex(p));
      if (a[1]) rows.push(`${this.tex(a[1])} & \\text{otherwise}`);
      return `\\begin{cases} ${rows.join(' \\\\ ')} \\end{cases}`;
    }
    f_ReplaceAll(a) {
      if (a.length !== 2) return null;
      const r = head(a[1]) === 'List' ? a[1].a.map(x => this.tex(x)).join(', ') : this.tex(a[1]);
      return `\\left. ${this.tex(a[0])} \\right|_{${r}}`;
    }
    f_Grad(a) { return `\\nabla ${this.tex(a[0], 480)}`; }
    f_Div(a) { return `\\nabla \\cdot ${this.tex(a[0], 480)}`; }
    f_Curl(a) { return `\\nabla \\times ${this.tex(a[0], 480)}`; }
    f_Laplacian(a) { return `\\nabla^{2} ${this.tex(a[0], 480)}`; }

    // ---- physics & special functions
    f_Ket(a) { return `\\left|${a.map(x => this.tex(x)).join(', ')}\\right\\rangle`; }
    f_Bra(a) { return `\\left\\langle ${a.map(x => this.tex(x)).join(', ')}\\right|`; }
    f_BraKet(a) { return `\\left\\langle ${a.map(x => this.tex(x)).join(' \\middle| ')}\\right\\rangle`; }
    f_Commutator(a) { return `\\left[${this.tex(a[0])}, ${this.tex(a[1])}\\right]`; }
    f_AntiCommutator(a) { return `\\left\\{${this.tex(a[0])}, ${this.tex(a[1])}\\right\\}`; }
    f_KroneckerDelta(a) {
      const parts = a.map(x => this.tex(x));
      return `\\delta_{${parts.every(p => p.length === 1) ? parts.join('') : parts.join(',')}}`;
    }
    f_LeviCivita(a) { return `\\varepsilon_{${a.map(x => this.tex(x)).join('')}}`; }
    f_DiracDelta(a) { return '\\delta' + this.argList(a); }
    f_HeavisideTheta(a) { return '\\Theta' + this.argList(a); }
    f_UnitStep(a) { return '\\Theta' + this.argList(a); }
    f_LegendreP(a) {
      if (a.length === 2) return `P_{${this.tex(a[0])}}${this.argList([a[1]])}`;
      if (a.length === 3) return `P_{${this.tex(a[0])}}^{${this.tex(a[1])}}${this.argList([a[2]])}`;
      return null;
    }
    f_LaguerreL(a) {
      if (a.length === 2) return `L_{${this.tex(a[0])}}${this.argList([a[1]])}`;
      if (a.length === 3) return `L_{${this.tex(a[0])}}^{(${this.tex(a[1])})}${this.argList([a[2]])}`;
      return null;
    }
    f_SphericalHarmonicY(a) {
      return a.length === 4 ? `Y_{${this.tex(a[0])}}^{${this.tex(a[1])}}${this.argList(a.slice(2))}` : null;
    }
    f_Quantity(a) {
      const unit = u => {
        if (u.k === 'str') return UNITS_TEX[u.v] ? `\\mathrm{${UNITS_TEX[u.v]}}` : `\\text{${texEscape(u.v)}}`;
        const h = head(u);
        if (h === 'Times') return u.a.map(unit).join('\\,');
        if (h === 'Divide') return `${unit(u.a[0])}/${unit(u.a[1])}`;
        if (h === 'Power') return `${unit(u.a[0])}^{${this.tex(u.a[1])}}`;
        return this.tex(u);
      };
      if (a.length === 1) return unit(a[0]);
      return `${this.tex(a[0], 400)}\\,${unit(a[1])}`;
    }
    f_CompoundExpression(a) {
      const parts = a.filter(x => !(x.k === 'sym' && x.n === 'Null')).map(x => this.tex(x, 11));
      return parts.join(';\\quad ');
    }
    f_Function(a) { return `${this.tex(a[0], 91)}\\,\\&`; }
    f_Inactive(a) { return null; }
  }
  function isHalf(e) {
    const h = head(e);
    return (h === 'Divide' || h === 'Rational') && isInt(e.a[0]) && e.a[0].v === '1' && isInt(e.a[1]) && e.a[1].v === '2';
  }

  // ------------------------------------------------------------------
  // Mathematica (normalized InputForm) emitter
  // ------------------------------------------------------------------
  const MM_BIN = {
    Equal: ['==', 290], Unequal: ['!=', 290], Less: ['<', 290], Greater: ['>', 290], LessEqual: ['<=', 290],
    GreaterEqual: ['>=', 290], SameQ: ['===', 290], UnsameQ: ['=!=', 290], Rule: ['->', 120, 'R'],
    RuleDelayed: [':>', 120, 'R'], Set: ['=', 40, 'R'], SetDelayed: [':=', 40, 'R'], And: ['&&', 216], Or: ['||', 215],
    Dot: ['.', 490], ReplaceAll: ['/.', 110], ReplaceRepeated: ['//.', 110], Map: ['/@', 620, 'R'], Apply: ['@@', 620, 'R']
  };
  function mmSym(n) {
    let s = '';
    for (const ch of n.n) s += (/[\x00-\x7f]/.test(ch) ? ch : (REV_NAMED[ch] ? `\\[${REV_NAMED[ch]}]` : ch));
    return s + (n.pat || '');
  }
  function mmPrec(n) {
    if (n.k === 'num') return isNegNum(n) ? 480 : 1000;
    const h = head(n);
    if (!h) return 1000;
    if (MM_BIN[h] && n.a.length > 1) return MM_BIN[h][1];
    return { Plus: 310, Minus: 480, Times: 400, Divide: 400, Power: 590, Not: 230, Factorial: 610,
      CompoundExpression: 10, Function: 90 }[h] || 1000;
  }
  function mm(n, min = 0) {
    const s = mmRaw(n);
    return mmPrec(n) < min ? `(${s})` : s;
  }
  function mmRaw(n) {
    if (n.k === 'num') return n.v + (n.e ? '*^' + n.e : '');
    if (n.k === 'sym') return mmSym(n);
    if (n.k === 'str') return JSON.stringify(n.v);
    if (n.h.k !== 'sym') {
      if (head(n.h) === 'Derivative' && n.h.a.length === 1 && isInt(n.h.a[0]) && n.a.length === 1)
        return mm(n.a[0], 1000) + "'".repeat(+n.h.a[0].v);
      return mm(n.h, 1000) + '[' + n.a.map(x => mm(x)).join(', ') + ']';
    }
    const h = n.h.n, a = n.a;
    if (MM_BIN[h] && a.length > 1) {
      const [op, p, assoc] = MM_BIN[h];
      if (assoc === 'R') return `${mm(a[0], p + 1)} ${op} ${mm(a[1], p)}`;
      return a.map((x, i) => mm(x, i ? p + 1 : p)).join(op === '.' ? '.' : ` ${op} `);
    }
    switch (h) {
      case 'Plus': {
        let out = mm(a[0], 310);
        for (let i = 1; i < a.length; i++) {
          const ng = negForm(a[i]);
          out += ng ? ' - ' + mm(ng, 311) : ' + ' + mm(a[i], 311);
        }
        return out;
      }
      case 'Minus': return '-' + mm(a[0], head(a[0]) === 'Times' ? 400 : 480);
      case 'Times': {
        let f = a.slice(), sign = '';
        if (isNegNum(f[0]) && f[0].v === '-1' && !f[0].e && f.length > 1) { sign = '-'; f.shift(); }
        return sign + f.map((x, i) => mm(x, i === 0 ? 400 : 401)).join('*');
      }
      case 'Divide': return `${mm(a[0], 400)}/${mm(a[1], 401)}`;
      case 'Power': return `${mm(a[0], 591)}^${mm(a[1], 590)}`;
      case 'Not': return '!' + mm(a[0], 231);
      case 'Factorial': return mm(a[0], 611) + '!';
      case 'List': return '{' + a.map(x => mm(x)).join(', ') + '}';
      case 'Part': return `${mm(a[0], 1000)}[[${a.slice(1).map(x => mm(x)).join(', ')}]]`;
      case 'CompoundExpression':
        return a.map((x, i) => (x.k === 'sym' && x.n === 'Null' && i === a.length - 1) ? '' : mm(x, 11)).join('; ').replace(/; $/, ';');
      case 'Function': return mm(a[0], 91) + ' &';
    }
    return h + '[' + a.map(x => mm(x)).join(', ') + ']';
  }

  // ------------------------------------------------------------------
  // Code emitters (SymPy / NumPy / MATLAB)
  // ------------------------------------------------------------------
  const PY_RESERVED = new Set(['lambda', 'in', 'is', 'if', 'for', 'as', 'and', 'or', 'not', 'def', 'del', 'class',
    'from', 'global', 'import', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield', 'else', 'elif', 'except',
    'finally', 'nonlocal', 'assert', 'break', 'continue', 'None', 'True', 'False', 'async', 'await']);
  function identName(name, dialect) {
    let s = '';
    for (const ch of name) {
      if (/[A-Za-z0-9_]/.test(ch)) s += ch;
      else if (ch === '$') s += '_';
      else if (ch === '#') s += 'slot';
      else if (UNI_NAME[ch]) s += (s && !s.endsWith('_') && /[A-Za-z]/.test(s[s.length - 1]) ? '_' : '') + UNI_NAME[ch];
      else s += '_';
    }
    if (/^[0-9]/.test(s)) s = '_' + s;
    if (dialect !== 'matlab' && PY_RESERVED.has(s)) s = s === 'lambda' ? 'lamda' : s + '_';
    return s || '_';
  }
  // A symbol-like node: plain symbol, Subscript[x, i], OverDot[x] ... -> identifier
  function symbolLike(n) {
    if (n.k === 'sym') return n.n;
    const h = head(n);
    const acc = { OverDot: 'dot', OverHat: 'hat', Hat: 'hat', OverBar: 'bar', Bar: 'bar', OverVector: 'vec', Vec: 'vec', OverTilde: 'tilde' };
    if (acc[h] && n.a.length >= 1 && n.a[0].k === 'sym') {
      const k = h === 'OverDot' && n.a[1] && isInt(n.a[1]) && n.a[1].v === '2' ? 'ddot' : acc[h];
      return n.a[0].n + k;
    }
    if (h === 'Subscript' && n.a.length >= 2 && n.a[0].k === 'sym' &&
        n.a.slice(1).every(x => x.k === 'sym' || x.k === 'str' || (isInt(x) && !isNegNum(x)))) {
      const parts = n.a.slice(1).map(x => x.k === 'str' ? x.v.split(/[^A-Za-z0-9\u0370-\u03FF]+/).filter(Boolean).join('_') : (x.k === 'sym' ? x.n : x.v));
      const sep = n.a.slice(1).some(x => x.k === 'str') ? '_' : '';
      return n.a[0].n + '_' + parts.join(sep);
    }
    return null;
  }

  const PY_PREC = { or: 1, and: 2, not: 3, cmp: 4, add: 6, mul: 7, unary: 8, pow: 9, atom: 10 };

  class CodeGen {
    constructor(dialect) {
      this.d = dialect;
      this.syms = new Map();   // var name -> symbol name
      this.funcs = new Map();  // name -> arity example args
      this.defined = new Set();
      this.imports = new Set();
      this.notes = [];
      this.boundOnly = new Set();
    }
    note(s) { if (!this.notes.includes(s)) this.notes.push(s); }
    // f[args] where f is a user function
    applyFn(f, args) {
      const argStr = args.map(x => this.c(x)).join(', ');
      if (f.k !== 'sym') return `${this.c(f, 10)}(${argStr})`;
      const name = identName(f.n, this.d.name);
      if (!this.defined.has(name) && !this.funcs.has(name)) this.funcs.set(name, args);
      return `${name}(${argStr})`;
    }
    // generate code with v bound (lambda / comprehension variable) so it doesn't become a free parameter
    bound(v, fn) {
      const name = v.k === 'sym' ? identName(v.n, this.d.name) : null;
      const had = name && this.syms.has(name);
      const out = fn();
      if (name && !had) this.boundOnly.add(name);
      return out;
    }
    label(x) { return x.k === 'sym' ? identName(x.n, this.d.name) : mm(x).replace(/'/g, "\\'"); }
    wrap(r, min) { return r.p < min ? `(${r.s})` : r.s; }
    atom(s) { return { s, p: PY_PREC.atom }; }
    c(n, min = 0) { return this.wrap(this.gen(n), min); }
    useSym(name) {
      const v = identName(name, this.d.name);
      if (!this.defined.has(v)) this.syms.set(v, this.d.name === 'sympy' ? (name === 'λ' || name === 'lambda' ? 'lambda' : v) : v);
      return v;
    }

    gen(n) {
      if (n.k === 'num') return this.d.num(n, this);
      if (n.k === 'str') return this.atom(this.d.name === 'matlab' ? `'${n.v.replace(/'/g, "''")}'` : JSON.stringify(n.v));
      if (n.k === 'sym') {
        const k = this.d.consts[n.n];
        if (k !== undefined) return typeof k === 'string' ? this.atom(k) : k;
        return this.atom(this.useSym(n.n));
      }
      const sl = symbolLike(n);
      if (sl) return this.atom(this.useSym(sl));
      if (n.h.k !== 'sym') {
        // f'[x]  ==  Derivative[1][f][x]
        if (n.h.k === 'call' && head(n.h.h) === 'Derivative') return this.d.derivative(n.h.h.a, n.h.a[0], n.a, this);
        // bare f' (no arguments)
        if (head(n.h) === 'Derivative') throw new Unsupported("a derivative without arguments (write f'[x])");
        if ((head(n.h) === 'Inactive' || HOLD.has(head(n.h))) && n.h.a.length === 1) return this.gen({ k: 'call', h: n.h.a[0], a: n.a });
        return this.atom(`${this.c(n.h, PY_PREC.atom)}(${n.a.map(x => this.c(x)).join(', ')})`);
      }
      const h = n.h.n, a = n.a;
      if (HOLD.has(h) && a.length >= 1 && h !== 'N') return this.gen(a[0]);
      if (h === 'MatrixForm' || h === 'TraditionalForm') return this.gen(a[0]);
      const special = this.d.special[h];
      if (special) { const r = special.call(this.d, a, this, n); if (r) return r; }
      const common = this['g_' + h];
      if (common) { const r = common.call(this, a, n); if (r) return r; }
      const fn = this.d.fns[h];
      if (fn) {
        if (typeof fn === 'function') return fn(a, this);
        if (fn.imp) this.imports.add(fn.imp);
        return this.atom(`${fn.name || fn}(${a.map(x => this.c(x)).join(', ')})`);
      }
      // unknown head -> user function
      if (this.d.symbolicOnly && this.d.symbolicOnly.has(h)) throw new Unsupported(`symbolic operations like ${h}`);
      if (/^[A-Z]/.test(h) && h.length > 1 && !this.defined.has(identName(h, this.d.name)))
        this.note(`${h} has no ${this.d.label} equivalent here; left as an undefined function.`);
      return this.atom(this.applyFn(n.h, a));
    }

    // ---- shared arithmetic
    g_Plus(a) {
      let out = this.c(a[0], PY_PREC.add);
      for (let i = 1; i < a.length; i++) {
        const ng = negForm(a[i]);
        out += ng ? ' - ' + this.c(ng, PY_PREC.add + 1) : ' + ' + this.c(a[i], PY_PREC.add + 1);
      }
      return { s: out, p: PY_PREC.add };
    }
    g_Minus(a) { return { s: '-' + this.c(a[0], PY_PREC.unary), p: PY_PREC.unary }; }
    g_Times(a) {
      let f = a.slice(), sign = '';
      if (isNegNum(f[0]) && f[0].v === '-1' && !f[0].e && f.length > 1) { sign = '-'; f.shift(); }
      const s = f.map((x, i) => this.c(x, i === 0 ? PY_PREC.mul : PY_PREC.mul + 1)).join(this.d.mul);
      return sign ? { s: sign + (f.length > 1 ? s : this.c(f[0], PY_PREC.unary)), p: PY_PREC.unary } : { s, p: PY_PREC.mul };
    }
    g_Divide(a) {
      if (this.d.rational && isInt(a[0]) && isInt(a[1])) return this.atom(`Rational(${a[0].v}, ${a[1].v})`);
      return { s: `${this.c(a[0], PY_PREC.mul)}${this.d.div}${this.c(a[1], PY_PREC.mul + 1)}`, p: PY_PREC.mul };
    }
    g_Rational(a) { return this.g_Divide(a); }
    g_Power(a) {
      if (a.length !== 2) return null;
      if (a[0].k === 'sym' && a[0].n === 'E') return this.atom(`${this.d.exp}(${this.c(a[1])})`);
      if (isHalf(a[1])) return this.atom(`${this.d.sqrt}(${this.c(a[0])})`);
      return { s: `${this.c(a[0], PY_PREC.pow + 1)}${this.d.pow}${this.c(a[1], PY_PREC.unary)}`, p: PY_PREC.pow };
    }
    cmp(op, a) {
      const parts = [];
      for (let i = 0; i < a.length - 1; i++) parts.push(`${this.c(a[i], PY_PREC.cmp + 1)} ${op} ${this.c(a[i + 1], PY_PREC.cmp + 1)}`);
      return parts.length === 1 ? { s: parts[0], p: PY_PREC.cmp } : this.d.andAll(parts, this);
    }
    g_Less(a) { return this.cmp('<', a); }
    g_Greater(a) { return this.cmp('>', a); }
    g_LessEqual(a) { return this.cmp('<=', a); }
    g_GreaterEqual(a) { return this.cmp('>=', a); }
    g_TildeTilde(a, n) { this.note('≈ written as an equality.'); return this.gen(C('Equal', ...a)); }
    g_List(a, n) { return this.atom(this.d.list(n, this)); }
    g_CompoundExpression(a) { return this.atom(a.filter(x => !(x.k === 'sym' && x.n === 'Null')).map(x => this.c(x)).join('; ')); }
    g_N(a) { return this.d.name === 'sympy' ? this.atom(`N(${this.c(a[0])})`) : this.gen(a[0]); }
    g_PlusMinus(a) {
      if (a.length === 2) return this.atom(`(${this.c(a[0], PY_PREC.add)} + ${this.c(a[1], PY_PREC.add + 1)}, ${this.c(a[0], PY_PREC.add)} - ${this.c(a[1], PY_PREC.add + 1)})`.replace(/^\(/, this.d.name === 'matlab' ? '[' : '(').replace(/\)$/, this.d.name === 'matlab' ? ']' : ')'));
      return null;
    }
    g_Part(a) {
      const idx = a.slice(1).map(i => this.d.oneBased ? this.c(i) : (isInt(i) ? String(+i.v - 1) : `${this.c(i, PY_PREC.add)} - 1`));
      return this.atom(this.d.oneBased ? `${this.c(a[0], PY_PREC.atom)}(${idx.join(', ')})` : `${this.c(a[0], PY_PREC.atom)}[${idx.join(', ')}]`);
    }
    // vector calculus with explicit coordinates
    coords(n) { return n && head(n) === 'List' ? n.a : null; }
    g_Grad(a) {
      const v = this.coords(a[1]);
      if (!v) return null;
      return this.atom(this.d.vector(v.map(x => this.d.diffExpr(a[0], [[x, null]], this)), this));
    }
    g_Div(a) {
      const v = this.coords(a[1]);
      if (!v || head(a[0]) !== 'List') return null;
      return { s: a[0].a.map((f, i) => this.d.diffExpr(f, [[v[i], null]], this)).join(' + '), p: PY_PREC.add };
    }
    g_Laplacian(a) {
      const v = this.coords(a[1]);
      if (!v) return null;
      return { s: v.map(x => this.d.diffExpr(a[0], [[x, Num('2')]], this)).join(' + '), p: PY_PREC.add };
    }
    g_Curl(a) {
      const v = this.coords(a[1]);
      if (!v || v.length !== 3 || head(a[0]) !== 'List' || a[0].a.length !== 3) return null;
      const [F1, F2, F3] = a[0].a, [x, y, z] = v;
      const d = (f, q) => this.d.diffExpr(f, [[q, null]], this);
      return this.atom(this.d.vector([`${d(F3, y)} - ${d(F2, z)}`, `${d(F1, z)} - ${d(F3, x)}`, `${d(F2, x)} - ${d(F1, y)}`], this));
    }
  }

  function pyNum(n) {
    let v = n.v;
    if (v.endsWith('.')) v += '0';
    if (v.startsWith('.')) v = '0' + v;
    if (v.startsWith('-.')) v = '-0' + v.slice(1);
    return v + (n.e ? 'e' + n.e : '');
  }
  function iterSpec(s, cg) {
    if (head(s) === 'List') {
      if (s.a.length === 2) return { v: s.a[0], lo: Num('1'), hi: s.a[1] };
      if (s.a.length >= 3) return { v: s.a[0], lo: s.a[1], hi: s.a[2] };
      return { v: s.a[0] };
    }
    return { v: s };
  }
  function limitDir(opts) {
    let dir = null;
    opts.forEach(o => {
      if (head(o) === 'Rule' && o.a[0].k === 'sym' && o.a[0].n === 'Direction') {
        const d = o.a[1], v = d.k === 'str' ? d.v : d.v;
        if (v === 'FromAbove' || v === '-1' || v === 'FromRight') dir = '+';
        if (v === 'FromBelow' || v === '1' || v === 'FromLeft') dir = '-';
      }
    });
    return dir;
  }

  // ---------------- SymPy ----------------
  const SYMPY = {
    name: 'sympy', label: 'SymPy', mul: '*', div: '/', pow: '**', exp: 'exp', sqrt: 'sqrt', rational: true,
    consts: { Pi: 'pi', E: 'E', I: 'I', Infinity: 'oo', ComplexInfinity: 'zoo', EulerGamma: 'EulerGamma',
      GoldenRatio: 'GoldenRatio', Catalan: 'Catalan', True: 'True', False: 'False', Null: 'None',
      Degree: { s: 'pi/180', p: 7 }, Reals: 'S.Reals', Complexes: 'S.Complexes', Integers: 'S.Integers',
      Rationals: 'S.Rationals', NonNegativeIntegers: 'S.Naturals0', Indeterminate: 'nan' },
    num: n => ({ s: pyNum(n), p: isNegNum(n) ? 8 : 10 }),
    fns: {
      Sin: 'sin', Cos: 'cos', Tan: 'tan', Cot: 'cot', Sec: 'sec', Csc: 'csc', Sinh: 'sinh', Cosh: 'cosh', Tanh: 'tanh',
      Coth: 'coth', Sech: 'sech', Csch: 'csch', ArcSin: 'asin', ArcCos: 'acos', ArcCot: 'acot', ArcSec: 'asec',
      ArcCsc: 'acsc', ArcSinh: 'asinh', ArcCosh: 'acosh', ArcTanh: 'atanh', ArcCoth: 'acoth', Exp: 'exp', Sqrt: 'sqrt',
      CubeRoot: 'cbrt', Abs: 'Abs', Sign: 'sign', Re: 're', Im: 'im', Arg: 'arg', Conjugate: 'conjugate',
      Floor: 'floor', Ceiling: 'ceiling', Factorial: 'factorial', Factorial2: 'factorial2', Binomial: 'binomial',
      Gamma: 'gamma', Beta: 'beta', Zeta: 'zeta', Erf: 'erf', Erfc: 'erfc', Max: 'Max', Min: 'Min', Mod: 'Mod',
      GCD: 'gcd', LCM: 'lcm', BesselJ: 'besselj', BesselY: 'bessely', BesselI: 'besseli', BesselK: 'besselk',
      SphericalBesselJ: 'jn', SphericalBesselY: 'yn', HermiteH: 'hermite', ChebyshevT: 'chebyshevt',
      ChebyshevU: 'chebyshevu', SphericalHarmonicY: 'Ynm', DiracDelta: 'DiracDelta', HeavisideTheta: 'Heaviside',
      UnitStep: 'Heaviside', KroneckerDelta: 'KroneckerDelta', Simplify: 'simplify', FullSimplify: 'simplify',
      Expand: 'expand', Factor: 'factor', Together: 'together', Apart: 'apart', TrigExpand: 'expand_trig',
      TrigReduce: 'trigsimp', Solve: 'solve', Sinc: 'sinc', LogGamma: 'loggamma', PolyGamma: 'polygamma',
      Not: 'Not', Surd: 'real_root', Equivalent: 'Equivalent', Implies: 'Implies'
    },
    andAll: (parts) => ({ s: `And(${parts.join(', ')})`, p: 10 }),
    list(n, cg, asMatrix) {
      if (head(n.a[0]) === 'List' && n.a.every(r => head(r) === 'List')) return `Matrix([${n.a.map(r => '[' + r.a.map(x => cg.c(x)).join(', ') + ']').join(', ')}])`;
      const items = n.a.map(x => cg.c(x)).join(', ');
      return asMatrix ? `Matrix([${items}])` : `[${items}]`;
    },
    vector: (items) => `Matrix([${items.join(', ')}])`,
    mat(n, cg) { return head(n) === 'List' ? this.list(n, cg, true) : cg.c(n, 10); },
    diffExpr(f, vars, cg) {
      return `diff(${cg.c(f)}, ${vars.map(([v, k]) => cg.c(v) + (k && !(isInt(k) && k.v === '1') ? ', ' + cg.c(k) : '')).join(', ')})`;
    },
    derivative(orders, f, args, cg) {
      const fx = cg.applyFn(f, args);
      const vs = [];
      orders.forEach((o, i) => { if (!(isInt(o) && o.v === '0')) vs.push(cg.c(args[i]) + (isInt(o) && o.v === '1' ? '' : ', ' + cg.c(o))); });
      return cg.atom(`diff(${fx}, ${vs.join(', ')})`);
    },
    special: {
      Log(a, cg) { return cg.atom(a.length === 2 ? `log(${cg.c(a[1])}, ${cg.c(a[0])})` : `log(${cg.c(a[0])})`); },
      Log10(a, cg) { return cg.atom(`log(${cg.c(a[0])}, 10)`); },
      Log2(a, cg) { return cg.atom(`log(${cg.c(a[0])}, 2)`); },
      ArcTan(a, cg) { return cg.atom(a.length === 2 ? `atan2(${cg.c(a[1])}, ${cg.c(a[0])})` : `atan(${cg.c(a[0])})`); },
      LegendreP(a, cg) { return cg.atom(a.length === 3 ? `assoc_legendre(${a.map(x => cg.c(x)).join(', ')})` : `legendre(${a.map(x => cg.c(x)).join(', ')})`); },
      LaguerreL(a, cg) { return cg.atom(a.length === 3 ? `assoc_laguerre(${a.map(x => cg.c(x)).join(', ')})` : `laguerre(${a.map(x => cg.c(x)).join(', ')})`); },
      Integrate(a, cg) {
        if (a.length < 2) return null;
        const specs = a.slice(1).reverse().map(s => {
          const it = head(s) === 'List' && s.a.length >= 3 ? s.a : null;
          return it ? `(${cg.c(it[0])}, ${cg.c(it[1])}, ${cg.c(it[2])})` : cg.c(head(s) === 'List' ? s.a[0] : s);
        });
        return cg.atom(`integrate(${cg.c(a[0])}, ${specs.join(', ')})`);
      },
      NIntegrate(a, cg) { const r = this.special.Integrate.call(this, a, cg); return r && cg.atom(r.s + '.evalf()'); },
      D(a, cg) {
        if (a.length < 2) return null;
        return cg.atom(this.diffExpr(a[0], a.slice(1).map(s => head(s) === 'List' && s.a.length === 2 ? [s.a[0], s.a[1]] : [s, null]), cg));
      },
      Dt(a, cg) { return this.special.D.call(this, a, cg); },
      Sum(a, cg) { return this.bigop('summation', a, cg); },
      NSum(a, cg) { const r = this.bigop('summation', a, cg); return r && cg.atom(r.s + '.evalf()'); },
      Product(a, cg) { return this.bigop('product', a, cg); },
      Limit(a, cg) {
        if (head(a[1]) !== 'Rule') return null;
        const dir = limitDir(a.slice(2));
        return cg.atom(`limit(${cg.c(a[0])}, ${cg.c(a[1].a[0])}, ${cg.c(a[1].a[1])}${dir ? `, dir='${dir}'` : ''})`);
      },
      Piecewise(a, cg) {
        if (head(a[0]) !== 'List') return null;
        const rows = a[0].a.map(p => `(${cg.c(p.a[0])}, ${cg.c(p.a[1])})`);
        rows.push(`(${a[1] ? cg.c(a[1]) : '0'}, True)`);
        return cg.atom(`Piecewise(${rows.join(', ')})`);
      },
      Equal(a, cg) {
        if (a.length === 2) return cg.atom(`Eq(${cg.c(a[0])}, ${cg.c(a[1])})`);
        return cg.atom(`And(${a.slice(1).map((x, i) => `Eq(${cg.c(a[i])}, ${cg.c(x)})`).join(', ')})`);
      },
      Unequal(a, cg) { return cg.atom(`Ne(${cg.c(a[0])}, ${cg.c(a[1])})`); },
      And(a, cg) { return cg.atom(`And(${a.map(x => cg.c(x)).join(', ')})`); },
      Or(a, cg) { return cg.atom(`Or(${a.map(x => cg.c(x)).join(', ')})`); },
      Element(a, cg) { return cg.atom(`Contains(${cg.c(a[0])}, ${cg.c(a[1])})`); },
      Rule(a, cg) { return cg.atom(`(${cg.c(a[0])}, ${cg.c(a[1])})`); },
      ReplaceAll(a, cg) {
        const rules = head(a[1]) === 'List' ? a[1].a : [a[1]];
        const d = rules.filter(r => head(r) === 'Rule' || head(r) === 'RuleDelayed').map(r => `${cg.c(r.a[0])}: ${cg.c(r.a[1])}`);
        return cg.atom(`${cg.c(a[0], 10)}.subs({${d.join(', ')}})`);
      },
      Dot(a, cg) {
        const flatVec = x => head(x) === 'List' && !x.a.some(e => head(e) === 'List');
        if (a.every(flatVec)) return cg.atom(a.map((x, i) => i ? `.dot(${this.mat(x, cg)})` : this.mat(x, cg)).join(''));
        return { s: a.map(x => head(x) === 'List' ? this.mat(x, cg) : cg.c(x, 8)).join('*'), p: 7 };
      },
      Cross(a, cg) { return cg.atom(a.map((x, i) => i ? `.cross(${this.mat(x, cg)})` : this.mat(x, cg)).join('')); },
      Transpose(a, cg) { return cg.atom(this.mat(a[0], cg) + '.T'); },
      ConjugateTranspose(a, cg) { return cg.atom(this.mat(a[0], cg) + '.H'); },
      Dagger(a, cg) { cg.imports.add('from sympy.physics.quantum import Dagger'); return cg.atom(`Dagger(${cg.c(a[0])})`); },
      Inverse(a, cg) { return cg.atom(this.mat(a[0], cg) + '.inv()'); },
      Det(a, cg) { return cg.atom(this.mat(a[0], cg) + '.det()'); },
      Tr(a, cg) { return cg.atom(this.mat(a[0], cg) + '.trace()'); },
      Norm(a, cg) { return cg.atom(this.mat(a[0], cg) + '.norm(' + (a[1] ? cg.c(a[1]) : '') + ')'); },
      Ket(a, cg) { cg.imports.add('from sympy.physics.quantum import Ket'); return cg.atom(`Ket(${a.map(x => `'${cg.label(x)}'`).join(', ')})`); },
      Bra(a, cg) { cg.imports.add('from sympy.physics.quantum import Bra'); return cg.atom(`Bra(${a.map(x => `'${cg.label(x)}'`).join(', ')})`); },
      BraKet(a, cg) {
        if (a.length !== 2) return null;
        cg.imports.add('from sympy.physics.quantum import Bra, Ket, InnerProduct');
        return cg.atom(`InnerProduct(Bra('${cg.label(a[0])}'), Ket('${cg.label(a[1])}'))`);
      },
      Commutator(a, cg) { cg.imports.add('from sympy.physics.quantum import Commutator'); cg.note('Commutator operands should be non-commutative: symbols(..., commutative=False).'); return cg.atom(`Commutator(${cg.c(a[0])}, ${cg.c(a[1])})`); },
      AntiCommutator(a, cg) { cg.imports.add('from sympy.physics.quantum import AntiCommutator'); return cg.atom(`AntiCommutator(${cg.c(a[0])}, ${cg.c(a[1])})`); },
      Quantity(a, cg) {
        cg.imports.add('from sympy.physics import units as u');
        const unit = x => {
          if (x.k === 'str') { const m = PY_UNITS[x.v]; if (!m) cg.note(`Unknown unit "${x.v}".`); return m ? 'u.' + m : `u.${x.v.toLowerCase()}`; }
          const h = head(x);
          if (h === 'Times') return x.a.map(unit).join('*');
          if (h === 'Divide') return `${unit(x.a[0])}/${unit(x.a[1])}`;
          if (h === 'Power') return `${unit(x.a[0])}**${cg.c(x.a[1], 10)}`;
          return cg.c(x);
        };
        return a.length === 1 ? cg.atom(unit(a[0])) : { s: `${cg.c(a[0], 7)}*${unit(a[1])}`, p: 7 };
      },
      Series(a, cg) {
        const s = a[1];
        if (head(s) !== 'List' || s.a.length !== 3) return null;
        return cg.atom(`series(${cg.c(a[0])}, ${cg.c(s.a[0])}, ${cg.c(s.a[1])}, ${isInt(s.a[2]) ? +s.a[2].v + 1 : cg.c(s.a[2]) + ' + 1'})`);
      },
      DSolve(a, cg) { return cg.atom(`dsolve(${a.slice(0, 2).map(x => cg.c(x)).join(', ')})`); },
      Function(a, cg) { return cg.atom(`Lambda(slot, ${cg.c(a[0])})`); }
    },
    bigop(fn, a, cg) {
      if (a.length < 2) return null;
      const specs = a.slice(1).reverse().map(s => {
        const it = iterSpec(s);
        return it.hi ? `(${cg.c(it.v)}, ${cg.c(it.lo)}, ${cg.c(it.hi)})` : null;
      });
      if (specs.includes(null)) return null;
      return cg.atom(`${fn}(${cg.c(a[0])}, ${specs.join(', ')})`);
    }
  };
  const PY_UNITS = { Meters: 'meter', Seconds: 'second', Kilograms: 'kilogram', Grams: 'gram', Newtons: 'newton',
    Joules: 'joule', Volts: 'volt', Amperes: 'ampere', Ohms: 'ohm', Watts: 'watt', Hertz: 'hertz', Kelvins: 'kelvin',
    Teslas: 'tesla', Pascals: 'pascal', Coulombs: 'coulomb', Farads: 'farad', Henries: 'henry',
    Electronvolts: 'electronvolt', Centimeters: 'centimeter', Millimeters: 'millimeter', Kilometers: 'kilometer',
    Nanometers: 'nanometer', Micrometers: 'micrometer', Milliseconds: 'millisecond', Microseconds: 'microsecond',
    Liters: 'liter', Moles: 'mole' };

  // ---------------- NumPy / SciPy ----------------
  const NP = (name, imp) => ({ name, imp });
  const NUMPY = {
    name: 'numpy', label: 'NumPy', mul: '*', div: '/', pow: '**', exp: 'np.exp', sqrt: 'np.sqrt',
    consts: { Pi: 'np.pi', E: 'np.e', I: '1j', Infinity: 'np.inf', EulerGamma: 'np.euler_gamma',
      GoldenRatio: { s: '(1 + np.sqrt(5))/2', p: 7 }, True: 'True', False: 'False', Null: 'None',
      Degree: { s: 'np.pi/180', p: 7 }, Indeterminate: 'np.nan' },
    num: n => ({ s: pyNum(n), p: isNegNum(n) ? 8 : 10 }),
    fns: {
      Sin: 'np.sin', Cos: 'np.cos', Tan: 'np.tan', Sinh: 'np.sinh', Cosh: 'np.cosh', Tanh: 'np.tanh',
      ArcSin: 'np.arcsin', ArcCos: 'np.arccos', ArcSinh: 'np.arcsinh', ArcCosh: 'np.arccosh', ArcTanh: 'np.arctanh',
      Exp: 'np.exp', Sqrt: 'np.sqrt', CubeRoot: 'np.cbrt', Abs: 'np.abs', Sign: 'np.sign', Re: 'np.real',
      Im: 'np.imag', Arg: 'np.angle', Conjugate: 'np.conj', Floor: 'np.floor', Ceiling: 'np.ceil', Round: 'np.round',
      Mod: 'np.mod', GCD: 'np.gcd', LCM: 'np.lcm', Log10: 'np.log10', Log2: 'np.log2',
      Factorial: NP('sp.factorial', 'import scipy.special as sp'), Binomial: NP('sp.comb', 'import scipy.special as sp'),
      Gamma: NP('sp.gamma', 'import scipy.special as sp'), Beta: NP('sp.beta', 'import scipy.special as sp'),
      Zeta: NP('sp.zeta', 'import scipy.special as sp'), Erf: NP('sp.erf', 'import scipy.special as sp'),
      Erfc: NP('sp.erfc', 'import scipy.special as sp'), BesselJ: NP('sp.jv', 'import scipy.special as sp'),
      BesselY: NP('sp.yv', 'import scipy.special as sp'), BesselI: NP('sp.iv', 'import scipy.special as sp'),
      BesselK: NP('sp.kv', 'import scipy.special as sp'), SphericalBesselJ: NP('sp.spherical_jn', 'import scipy.special as sp'),
      SphericalBesselY: NP('sp.spherical_yn', 'import scipy.special as sp'), HermiteH: NP('sp.eval_hermite', 'import scipy.special as sp'),
      LaguerreL: NP('sp.eval_laguerre', 'import scipy.special as sp'), ChebyshevT: NP('sp.eval_chebyt', 'import scipy.special as sp'),
      ChebyshevU: NP('sp.eval_chebyu', 'import scipy.special as sp'),
      SphericalHarmonicY: NP('sp.sph_harm_y', 'import scipy.special as sp'),
      Det: 'np.linalg.det', Inverse: 'np.linalg.inv', Tr: 'np.trace', Norm: 'np.linalg.norm', Transpose: 'np.transpose',
      Cross: 'np.cross', Not: 'np.logical_not'
    },
    andAll: (parts) => ({ s: parts.map(p => `(${p})`).join(' & '), p: 5 }),
    list(n) { return null; },
    vector: (items) => `np.array([${items.join(', ')}])`,
    symbolicOnly: new Set(['Simplify', 'FullSimplify', 'Expand', 'Factor', 'Together', 'Apart', 'Solve', 'DSolve',
      'Series', 'TrigExpand', 'TrigReduce', 'Collect']),
    diffExpr() { throw new Unsupported('derivatives'); },
    derivative() { throw new Unsupported('derivatives'); },
    special: {
      Log(a, cg) { return cg.atom(a.length === 2 ? `np.log(${cg.c(a[1])})/np.log(${cg.c(a[0])})` : `np.log(${cg.c(a[0])})`); },
      ArcTan(a, cg) { return cg.atom(a.length === 2 ? `np.arctan2(${cg.c(a[1])}, ${cg.c(a[0])})` : `np.arctan(${cg.c(a[0])})`); },
      Sinc(a, cg) { return cg.atom(`np.sinc(${cg.c(a[0], 7)}/np.pi)`); },
      HeavisideTheta(a, cg) { return cg.atom(`np.heaviside(${cg.c(a[0])}, 0.5)`); },
      UnitStep(a, cg) { return cg.atom(`np.heaviside(${cg.c(a[0])}, 1.0)`); },
      Max(a, cg) { return cg.atom(a.length === 2 ? `np.maximum(${cg.c(a[0])}, ${cg.c(a[1])})` : `np.max([${a.map(x => cg.c(x)).join(', ')}])`); },
      Min(a, cg) { return cg.atom(a.length === 2 ? `np.minimum(${cg.c(a[0])}, ${cg.c(a[1])})` : `np.min([${a.map(x => cg.c(x)).join(', ')}])`); },
      LegendreP(a, cg) {
        cg.imports.add('import scipy.special as sp');
        return cg.atom(a.length === 3 ? `sp.lpmv(${cg.c(a[1])}, ${cg.c(a[0])}, ${cg.c(a[2])})` : `sp.eval_legendre(${cg.c(a[0])}, ${cg.c(a[1])})`);
      },
      SphericalHarmonicY(a, cg) {
        cg.imports.add('import scipy.special as sp');
        cg.note('sp.sph_harm_y needs SciPy >= 1.15 (argument order matches Mathematica: l, m, polar, azimuth).');
        return cg.atom(`sp.sph_harm_y(${a.map(x => cg.c(x)).join(', ')})`);
      },
      Integrate(a, cg) {
        const specs = a.slice(1).map(s => head(s) === 'List' && s.a.length >= 3 ? s.a : null);
        if (!specs.length || specs.includes(null)) throw new Unsupported('indefinite integrals');
        if (specs.length === 1) {
          cg.imports.add('from scipy.integrate import quad');
          const [v, lo, hi] = specs[0];
          const body = cg.bound(v, () => cg.c(a[0]));
          return cg.atom(`quad(lambda ${cg.c(v)}: ${body}, ${cg.c(lo)}, ${cg.c(hi)})[0]`);
        }
        if (specs.length === 2) {
          cg.imports.add('from scipy.integrate import dblquad');
          const [[x, xa, xb], [y, ya, yb]] = specs;
          const body = cg.bound(x, () => cg.bound(y, () => cg.c(a[0])));
          const ylo = cg.bound(x, () => cg.c(ya)), yhi = cg.bound(x, () => cg.c(yb));
          return cg.atom(`dblquad(lambda ${cg.c(y)}, ${cg.c(x)}: ${body}, ${cg.c(xa)}, ${cg.c(xb)}, lambda ${cg.c(x)}: ${ylo}, lambda ${cg.c(x)}: ${yhi})[0]`);
        }
        throw new Unsupported('integrals over more than two variables');
      },
      NIntegrate(a, cg) { return this.special.Integrate.call(this, a, cg); },
      D() { throw new Unsupported('derivatives'); },
      Dt() { throw new Unsupported('derivatives'); },
      Limit() { throw new Unsupported('limits'); },
      Sum(a, cg) { return this.bigop('sum', a, cg); },
      NSum(a, cg) { return this.bigop('sum', a, cg); },
      Product(a, cg) { return this.bigop('np.prod', a, cg); },
      Piecewise(a, cg) {
        const rows = a[0].a;
        return cg.atom(`np.select([${rows.map(p => cg.c(p.a[1])).join(', ')}], [${rows.map(p => cg.c(p.a[0])).join(', ')}], default=${a[1] ? cg.c(a[1]) : '0'})`);
      },
      Equal(a, cg) { return cg.cmp('==', a); },
      Unequal(a, cg) { return cg.cmp('!=', a); },
      And(a, cg) { return { s: a.map(x => cg.c(x, 6)).join(' & '), p: 5 }; },
      Or(a, cg) { return { s: a.map(x => cg.c(x, 6)).join(' | '), p: 5 }; },
      Dot(a, cg) { return { s: a.map(x => cg.c(x, 8)).join(' @ '), p: 7 }; },
      ConjugateTranspose(a, cg) { return cg.atom(`np.conj(${cg.c(a[0])}).T`); },
      Rule() { throw new Unsupported('rules'); },
      ReplaceAll() { throw new Unsupported('replacement rules'); },
      DiracDelta() { throw new Unsupported('DiracDelta'); },
      Ket() { throw new Unsupported('bra-ket notation'); },
      Bra() { throw new Unsupported('bra-ket notation'); },
      BraKet() { throw new Unsupported('bra-ket notation'); },
      KroneckerDelta(a, cg) { return cg.atom(`float(${cg.c(a[0])} == ${cg.c(a[1])})`); },
      Element() { throw new Unsupported('domain conditions (Element)'); },
      Commutator(a, cg) { return cg.atom(`(${cg.c(a[0], 8)} @ ${cg.c(a[1], 8)} - ${cg.c(a[1], 8)} @ ${cg.c(a[0], 8)})`); },
      AntiCommutator(a, cg) { return cg.atom(`(${cg.c(a[0], 8)} @ ${cg.c(a[1], 8)} + ${cg.c(a[1], 8)} @ ${cg.c(a[0], 8)})`); },
      Quantity(a, cg) { if (a.length === 2) { cg.note('Units dropped: ' + mm(a[1])); return cg.gen(a[0]); } throw new Unsupported('units'); }
    },
    bigop(fn, a, cg) {
      if (a.length !== 2) throw new Unsupported('multiple iterators');
      const it = iterSpec(a[1]);
      if (!it.hi || (it.hi.k === 'sym' && it.hi.n === 'Infinity')) throw new Unsupported('infinite or open sums/products');
      const fbody = cg.bound(it.v, () => cg.c(a[0]));
      const body = `${fbody} for ${cg.c(it.v)} in range(${cg.c(it.lo)}, ${cg.c(it.hi, 6)} + 1)`;
      return cg.atom(fn === 'sum' ? `sum(${body})` : `np.prod([${body}])`);
    }
  };
  NUMPY.list = function (n, cg) {
    if (head(n.a[0]) === 'List' && n.a.every(r => head(r) === 'List')) return `np.array([${n.a.map(r => '[' + r.a.map(x => cg.c(x)).join(', ') + ']').join(', ')}])`;
    return `np.array([${n.a.map(x => cg.c(x)).join(', ')}])`;
  };

  // ---------------- MATLAB (Symbolic Math Toolbox, elementwise ops) ----------------
  const MATLAB = {
    name: 'matlab', label: 'MATLAB', mul: '.*', div: './', pow: '.^', exp: 'exp', sqrt: 'sqrt', oneBased: true,
    consts: { Pi: 'pi', E: 'exp(1)', I: '1i', Infinity: 'Inf', EulerGamma: 'eulergamma', True: 'true', False: 'false',
      GoldenRatio: { s: '(1 + sqrt(5))/2', p: 7 }, Degree: { s: 'pi/180', p: 7 }, Indeterminate: 'NaN', Null: '[]' },
    num: n => ({ s: pyNum(n), p: isNegNum(n) ? 8 : 10 }),
    fns: {
      Sin: 'sin', Cos: 'cos', Tan: 'tan', Cot: 'cot', Sec: 'sec', Csc: 'csc', Sinh: 'sinh', Cosh: 'cosh', Tanh: 'tanh',
      Coth: 'coth', Sech: 'sech', Csch: 'csch', ArcSin: 'asin', ArcCos: 'acos', ArcCot: 'acot', ArcSec: 'asec',
      ArcCsc: 'acsc', ArcSinh: 'asinh', ArcCosh: 'acosh', ArcTanh: 'atanh', Exp: 'exp', Sqrt: 'sqrt', CubeRoot: 'nthroot',
      Abs: 'abs', Sign: 'sign', Re: 'real', Im: 'imag', Arg: 'angle', Conjugate: 'conj', Floor: 'floor', Ceiling: 'ceil',
      Round: 'round', Max: 'max', Min: 'min', Mod: 'mod', GCD: 'gcd', LCM: 'lcm', Log10: 'log10', Log2: 'log2',
      Factorial: 'factorial', Binomial: 'nchoosek', Gamma: 'gamma', Beta: 'beta', Zeta: 'zeta', Erf: 'erf', Erfc: 'erfc',
      BesselJ: 'besselj', BesselY: 'bessely', BesselI: 'besseli', BesselK: 'besselk', HermiteH: 'hermiteH',
      LaguerreL: 'laguerreL', ChebyshevT: 'chebyshevT', ChebyshevU: 'chebyshevU', LegendreP: 'legendreP',
      SphericalHarmonicY: 'harmonicY', DiracDelta: 'dirac', HeavisideTheta: 'heaviside', UnitStep: 'heaviside',
      KroneckerDelta: 'kroneckerDelta', Simplify: 'simplify', FullSimplify: 'simplify', Expand: 'expand',
      Factor: 'factor', Solve: 'solve', DSolve: 'dsolve', Det: 'det', Inverse: 'inv', Tr: 'trace', Norm: 'norm',
      Dot: 'dot', Cross: 'cross', Not: '~', Surd: 'nthroot', N: 'double'
    },
    andAll: (parts) => ({ s: parts.map(p => `(${p})`).join(' & '), p: 2 }),
    list(n, cg) {
      if (head(n.a[0]) === 'List' && n.a.every(r => head(r) === 'List')) return `[${n.a.map(r => r.a.map(x => cg.c(x)).join(', ')).join('; ')}]`;
      return `[${n.a.map(x => cg.c(x)).join(', ')}]`;
    },
    vector: (items) => `[${items.join('; ')}]`,
    diffExpr(f, vars, cg) {
      return vars.reduce((acc, [v, k]) => `diff(${acc}, ${cg.c(v)}${k && !(isInt(k) && k.v === '1') ? ', ' + cg.c(k) : ''})`, cg.c(f));
    },
    derivative(orders, f, args, cg) {
      const fx = cg.applyFn(f, args);
      let s = fx;
      orders.forEach((o, i) => { if (!(isInt(o) && o.v === '0')) s = `diff(${s}, ${cg.c(args[i])}${isInt(o) && o.v === '1' ? '' : ', ' + cg.c(o)})`; });
      return cg.atom(s);
    },
    special: {
      Log(a, cg) { return cg.atom(a.length === 2 ? `log(${cg.c(a[1])})./log(${cg.c(a[0])})` : `log(${cg.c(a[0])})`); },
      ArcTan(a, cg) { return cg.atom(a.length === 2 ? `atan2(${cg.c(a[1])}, ${cg.c(a[0])})` : `atan(${cg.c(a[0])})`); },
      CubeRoot(a, cg) { return cg.atom(`nthroot(${cg.c(a[0])}, 3)`); },
      Sinc(a, cg) { return cg.atom(`sin(${cg.c(a[0])})./${cg.c(a[0], 10)}`); },
      Integrate(a, cg) {
        if (a.length < 2) return null;
        let s = cg.c(a[0]);
        a.slice(1).reverse().forEach(sp => {
          s = head(sp) === 'List' && sp.a.length >= 3
            ? `int(${s}, ${cg.c(sp.a[0])}, ${cg.c(sp.a[1])}, ${cg.c(sp.a[2])})`
            : `int(${s}, ${cg.c(head(sp) === 'List' ? sp.a[0] : sp)})`;
        });
        return cg.atom(s);
      },
      NIntegrate(a, cg) { const r = this.special.Integrate.call(this, a, cg); return r && cg.atom(`double(${r.s})`); },
      D(a, cg) {
        if (a.length < 2) return null;
        return cg.atom(this.diffExpr(a[0], a.slice(1).map(s => head(s) === 'List' && s.a.length === 2 ? [s.a[0], s.a[1]] : [s, null]), cg));
      },
      Dt(a, cg) { return this.special.D.call(this, a, cg); },
      Sum(a, cg) { return this.bigop('symsum', a, cg); },
      NSum(a, cg) { return this.bigop('symsum', a, cg); },
      Product(a, cg) { return this.bigop('symprod', a, cg); },
      Limit(a, cg) {
        if (head(a[1]) !== 'Rule') return null;
        const dir = limitDir(a.slice(2));
        return cg.atom(`limit(${cg.c(a[0])}, ${cg.c(a[1].a[0])}, ${cg.c(a[1].a[1])}${dir ? (dir === '+' ? ", 'right'" : ", 'left'") : ''})`);
      },
      Piecewise(a, cg) {
        const parts = [];
        a[0].a.forEach(p => parts.push(cg.c(p.a[1]), cg.c(p.a[0])));
        parts.push(a[1] ? cg.c(a[1]) : '0');
        return cg.atom(`piecewise(${parts.join(', ')})`);
      },
      Equal(a, cg) { return cg.cmp('==', a); },
      Unequal(a, cg) { return cg.cmp('~=', a); },
      And(a, cg) { return { s: a.map(x => cg.c(x, 3)).join(' & '), p: 2 }; },
      Or(a, cg) { return { s: a.map(x => cg.c(x, 2)).join(' | '), p: 1 }; },
      Not(a, cg) { return { s: '~' + cg.c(a[0], 8), p: 8 }; },
      Transpose(a, cg) { return cg.atom(cg.c(a[0], 10) + ".'"); },
      ConjugateTranspose(a, cg) { return cg.atom(cg.c(a[0], 10) + "'"); },
      Dagger(a, cg) { return cg.atom(cg.c(a[0], 10) + "'"); },
      ReplaceAll(a, cg) {
        const rules = head(a[1]) === 'List' ? a[1].a : [a[1]];
        return cg.atom(`subs(${cg.c(a[0])}, {${rules.map(r => cg.c(r.a[0])).join(', ')}}, {${rules.map(r => cg.c(r.a[1])).join(', ')}})`);
      },
      Rule() { throw new Unsupported('rules'); },
      Ket() { throw new Unsupported('bra-ket notation'); },
      Bra() { throw new Unsupported('bra-ket notation'); },
      BraKet() { throw new Unsupported('bra-ket notation'); },
      Element(a, cg) {
        const dom = { Reals: 'real', Integers: 'integer', Rationals: 'rational', PositiveReals: 'positive' }[a[1].k === 'sym' ? a[1].n : ''];
        if (!dom) throw new Unsupported('this Element domain');
        return cg.atom(`in(${cg.c(a[0])}, '${dom}')`);
      },
      Commutator(a, cg) { return cg.atom(`(${cg.c(a[0], 8)}*${cg.c(a[1], 8)} - ${cg.c(a[1], 8)}*${cg.c(a[0], 8)})`); },
      AntiCommutator(a, cg) { return cg.atom(`(${cg.c(a[0], 8)}*${cg.c(a[1], 8)} + ${cg.c(a[1], 8)}*${cg.c(a[0], 8)})`); },
      Quantity(a, cg) { if (a.length === 2) { cg.note('Units dropped: ' + mm(a[1])); return cg.gen(a[0]); } throw new Unsupported('units'); }
    },
    bigop(fn, a, cg) {
      if (a.length < 2) return null;
      let s = cg.c(a[0]);
      a.slice(1).reverse().forEach(sp => {
        const it = iterSpec(sp);
        if (!it.hi) throw new Unsupported('sums without bounds');
        s = `${fn}(${s}, ${cg.c(it.v)}, ${cg.c(it.lo)}, ${cg.c(it.hi)})`;
      });
      return cg.atom(s);
    }
  };

  // ---- statement-level assembly ----
  function statements(ast) {
    if (head(ast) === 'CompoundExpression') return ast.a.filter(x => !(x.k === 'sym' && x.n === 'Null'));
    return [ast];
  }
  function isDefinition(st) {
    const h = head(st);
    return (h === 'Set' || h === 'SetDelayed') && st.a.length === 2;
  }
  function defTarget(st) {
    const lhs = st.a[0];
    if (lhs.k === 'sym' || symbolLike(lhs)) return { kind: 'var', name: symbolLike(lhs) || lhs.n };
    if (lhs.k === 'call' && lhs.h.k === 'sym') return { kind: 'fn', name: lhs.h.n, params: lhs.a.map(p => p.k === 'sym' ? p.n : (symbolLike(p) || 'arg')) };
    return null;
  }

  function toCode(ast, dialect) {
    const d = { sympy: SYMPY, numpy: NUMPY, matlab: MATLAB }[dialect];
    const cg = new CodeGen(d);
    const sts = statements(ast);
    const py = dialect !== 'matlab';
    const cm = py ? '#' : '%';
    const end = py ? '' : ';';
    const lines = [];
    let exprCount = 0;
    const exprStmts = sts.filter(s => !isDefinition(s)).length;
    // pre-register definitions so their names aren't declared as symbols/functions
    sts.forEach(st => { if (isDefinition(st)) { const t = defTarget(st); if (t) cg.defined.add(identName(t.name, dialect)); } });
    try {
      sts.forEach(st => {
        if (isDefinition(st)) {
          const t = defTarget(st);
          if (!t) throw new Unsupported('this kind of assignment');
          const name = identName(t.name, dialect);
          if (t.kind === 'var') { lines.push(`${name} = ${cg.c(st.a[1])}${end}`); return; }
          const params = t.params.map(p => identName(p, dialect));
          const body = cg.c(st.a[1]);
          if (py) lines.push(`def ${name}(${params.join(', ')}):`, `    return ${body}`, '');
          else lines.push(`${name} = @(${params.join(', ')}) ${body};`);
          return;
        }
        exprCount++;
        const lhs = exprStmts > 1 ? `expr${exprCount}` : 'expr';
        if (dialect === 'numpy') {
          const body = cg.c(st);
          lines.push({ numpyExpr: true, lhs, body });
        } else lines.push(`${lhs} = ${cg.c(st)}${end}`);
      });
    } catch (e) {
      if (e instanceof Unsupported) {
        return `${cm} ${d.label} can't express ${e.message} directly.\n${cm} Use the ${dialect === 'numpy' ? 'SymPy tab (then sympy.lambdify for a numeric function)' : 'SymPy or Mathematica output'} instead.`;
      }
      throw e;
    }
    // prelude
    const out = [];
    const syms = [...cg.syms.keys()].filter(v => !cg.defined.has(v) && !(dialect === 'numpy' && cg.boundOnly.has(v))).sort();
    const funcs = [...cg.funcs.keys()].filter(f => !cg.defined.has(f) && !cg.syms.has(f)).sort();
    if (dialect === 'sympy') {
      out.push('from sympy import *');
      [...cg.imports].sort().forEach(i => out.push(i));
      if (syms.length) {
        const names = syms.map(v => cg.syms.get(v));
        out.push(`${syms.join(', ')} = symbols('${names.join(' ')}')`);
      }
      funcs.forEach(f => out.push(`${f} = Function('${f}')`));
      out.push('');
      out.push(...lines);
    } else if (dialect === 'numpy') {
      out.push('import numpy as np');
      [...cg.imports].sort().forEach(i => out.push(i));
      out.push('');
      lines.forEach(l => {
        if (typeof l === 'string') { out.push(l); return; }
        if (syms.length) out.push(`def ${l.lhs}(${syms.join(', ')}):`, `    return ${l.body}`);
        else out.push(`${l.lhs} = ${l.body}`);
      });
      if (funcs.length) cg.note(`Define ${funcs.join(', ')} before calling.`);
    } else {
      if (syms.length) out.push(`syms ${syms.join(' ')}`);
      funcs.forEach(f => {
        const args = cg.funcs.get(f);
        const vars = args && args.every(x => x.k === 'sym') ? args.map(x => identName(x.n, 'matlab')) : null;
        if (vars) out.push(`syms ${f}(${vars.join(', ')})`);
        else cg.note(`Define ${f} before use.`);
      });
      if (syms.length || funcs.length) out.push('');
      out.push(...lines);
    }
    while (out.length && out[out.length - 1] === '') out.pop();
    if (cg.notes.length) out.push('', ...cg.notes.map(n => `${cm} Note: ${n}`));
    return out.join('\n');
  }

  // ------------------------------------------------------------------
  // Public API
  // ------------------------------------------------------------------
  function toTeX(ast, opts) { return ast ? new TeX(opts).tex(ast) : ''; }
  function toMathematica(ast) { return ast ? mm(ast) : ''; }

  function convert(src, opts) {
    const ast = parse(src);
    if (!ast) return { ast: null, tex: '', mathematica: '', sympy: '', numpy: '', matlab: '', markdown: '' };
    const tex = toTeX(ast, opts);
    const mathematica = toMathematica(ast);
    const safe = f => { try { return f(); } catch (e) { return '# Could not convert: ' + e.message; } };
    return {
      ast, tex, mathematica,
      sympy: safe(() => toCode(ast, 'sympy')),
      numpy: safe(() => toCode(ast, 'numpy')),
      matlab: safe(() => toCode(ast, 'matlab')),
      markdown: `$$\n${tex}\n$$\n\nMathematica: \`${mathematica}\``
    };
  }

  return { parse, tokenize, toTeX, toMathematica, toCode, convert, MmaError, NAMED };
});
