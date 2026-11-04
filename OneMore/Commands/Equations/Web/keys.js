/*
 * keys.js — keyboard input for the equation editor textarea (Mathematica-style).
 *
 * Shortcut initiators are configurable (see DEFAULTS):
 *   alias key   Esc a Esc → α      Mathematica aliases and templates (Esc, `, ; or off)
 *   name prefix \alpha → α         LaTeX names, converted when the next non-letter is typed
 *   bare names  alpha → α          no initiator; whole Greek/symbol names convert at a word end
 *
 * Structure keys:
 *   Ctrl+-  subscript _{□}     Ctrl+6  superscript ^(□)     Ctrl+/  fraction     Ctrl+2  root
 *   Space or → leaves a sub/superscript (Ctrl+Space leaves any bracket)   Tab / Shift+Tab  next / previous □
 *   An open alias closes with the alias key again or with Tab.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./mma.js'));
  else root.EqKeys = factory(root.MMA);
})(typeof self !== 'undefined' ? self : this, function (MMA) {
  'use strict';

  const BOX = '□';
  const MARK = '⋮';

  const DEFAULTS = { aliasKey: 'Escape', namePrefix: '\\', bareNames: false, spaceExits: true };

  // ---- Mathematica escape aliases (Esc alias Esc) ----------------------------------------
  // Greek follows Mathematica: Esc a Esc = α, Esc f Esc = ϕ, Esc j Esc = φ, Esc ce Esc = ε ...
  const GREEK_ALIASES = {
    a: 'α', b: 'β', g: 'γ', d: 'δ', e: 'ϵ', ce: 'ε', z: 'ζ', h: 'η', et: 'η', q: 'θ', th: 'θ', cq: 'ϑ', cth: 'ϑ',
    i: 'ι', k: 'κ', ck: 'ϰ', l: 'λ', m: 'μ', n: 'ν', x: 'ξ', om: 'ο', p: 'π', cp: 'ϖ', r: 'ρ', cr: 'ϱ',
    s: 'σ', fs: 'ς', t: 'τ', u: 'υ', f: 'ϕ', ph: 'ϕ', j: 'φ', cph: 'φ', c: 'χ', ch: 'χ', y: 'ψ', ps: 'ψ',
    o: 'ω', w: 'ω',
    A: 'Α', B: 'Β', G: 'Γ', D: 'Δ', E: 'Ε', Z: 'Ζ', H: 'Η', Et: 'Η', Q: 'Θ', Th: 'Θ', I: 'Ι', K: 'Κ',
    L: 'Λ', M: 'Μ', N: 'Ν', X: 'Ξ', Om: 'Ο', P: 'Π', R: 'Ρ', S: 'Σ', T: 'Τ', U: 'Υ', F: 'Φ', Ph: 'Φ',
    C: 'Χ', Ch: 'Χ', Y: 'Ψ', Ps: 'Ψ', O: 'Ω', W: 'Ω'
  };
  const SYMBOL_ALIASES = {
    // letterlike
    inf: '∞', ee: 'ⅇ', ii: 'ⅈ', jj: 'ⅉ', dd: 'ⅆ', pd: '∂', del: '∇', hb: 'ℏ', deg: '°', scl: 'ℓ', ell: 'ℓ',
    Ang: 'Å', mi: 'µ', al: 'ℵ', wp: '℘', dsR: 'ℝ', dsC: 'ℂ', dsZ: 'ℤ', dsQ: 'ℚ', dsN: 'ℕ',
    es: '∅', '...': '…', dg: '†', "'": '′', ang: '∠',
    // operators
    '*': '×', '.': '·', div: '÷', '+-': '±', '-+': '∓', 'c+': '⊕', 'c*': '⊗', sqrt: '√', '@': '∘',
    sum: '∑', prod: '∏', int: '∫', cint: '∮',
    // relations
    '!=': '≠', '<=': '≤', '>=': '≥', '<<': '≪', '>>': '≫', '~': '∼', '~~': '≈', '~=': '≅', '===': '≡',
    prop: '∝', perp: '⊥', par: '∥',
    // arrows
    '->': '→', ':>': '⧴', '<-': '←', '<->': '↔', '=>': '⇒', '<=>': '⇔',
    // logic and sets
    '&&': '∧', '||': '∨', '!': '¬', fa: '∀', ex: '∃', '!ex': '∄', el: '∈', '!el': '∉',
    un: '∪', inter: '∩', sub: '⊂', sup: '⊃', sube: '⊆', supe: '⊇', '\\': '∖'
  };
  // templates (□ = placeholder; Tab moves between them)
  const TEMPLATES = {
    intt: 'Integrate[□, □]', dintt: 'Integrate[□, {□, □, □}]', sumt: 'Sum[□, {□, □, □}]',
    prodt: 'Product[□, {□, □, □}]', limt: 'Limit[□, □ -> □]', sqrtt: 'Sqrt[□]', frac: '(□)/(□)',
    dv: 'D[□, □]', dv2: 'D[□, {□, 2}]', abs: 'Abs[□]', norm: 'Norm[□]',
    // accents apply to the letter before, like \tilde: C Esc tilde Esc → C̃
    tilde: '\u0303', hat: '\u0302', bar: '\u0304', dot: '\u0307', ddot: '\u0308', vec: '\u20D7',
    ket: 'Ket[□]', bra: 'Bra[□]', bk: 'BraKet[□, □]', comm: 'Commutator[□, □]',
    mat: '{{□, □}, {□, □}}', mat3: '{{□, □, □}, {□, □, □}, {□, □, □}}', pw: 'Piecewise[{{□, □}, {□, □}}]',
    exp: 'Exp[□]', ln: 'Log[□]', log: 'Log[□, □]', sin: 'Sin[□]', cos: 'Cos[□]', tan: 'Tan[□]',
    sub2: '_{□}', sup2: '^(□)'
  };
  const ALIASES = Object.assign({}, GREEK_ALIASES, SYMBOL_ALIASES, TEMPLATES);

  // ---- LaTeX-style names (\name) ----------------------------------------------------------
  const TEX_NAMES = (MMA && MMA.TEX_NAMES) || {};
  const LATEX = Object.assign({}, TEX_NAMES, {
    // accents go after their base, as in Word and OneNote: C\tilde → C̃
    tilde: '\u0303', hat: '\u0302', bar: '\u0304', dot: '\u0307', ddot: '\u0308', vec: '\u20D7',
    int: 'Integrate[□, □]', iint: 'Integrate[□, {□, □, □}]', sum: 'Sum[□, {□, □, □}]', prod: 'Product[□, {□, □, □}]',
    sqrt: 'Sqrt[□]', frac: '(□)/(□)', lim: 'Limit[□, □ -> □]', abs: 'Abs[□]', norm: 'Norm[□]',
    ket: 'Ket[□]', bra: 'Bra[□]', braket: 'BraKet[□, □]', dv: 'D[□, □]', pdv: 'D[□, □]', mat: '{{□, □}, {□, □}}'
  });

  // ---- bare names (no initiator): only names that are never ordinary variables -------------
  const BARE = {};
  Object.keys(TEX_NAMES).forEach(k => {
    if (/^(var)?[a-z]+$/i.test(k) && (MMA && MMA.GREEK_NAMES || []).includes(k.replace(/^var/, '').toLowerCase())) BARE[k] = TEX_NAMES[k];
  });
  Object.assign(BARE, { infinity: '∞', infty: '∞', hbar: 'ℏ', nabla: '∇', partial: '∂' });

  /** Removes an unfinished alias so the converter never sees it */
  function clean(text) {
    text = text.replace(/\\[A-Za-z]*$/, '');
    const i = text.lastIndexOf(MARK);
    if (i < 0) return text;
    const m = /^[^\s,\[\]{}()]*/.exec(text.slice(i + 1));
    return text.slice(0, i) + text.slice(i + 1 + m[0].length);
  }

  function attach(ta, opts) {
    opts = Object.assign({ onChange() {}, config: () => DEFAULTS }, opts || {});

    const changed = () => opts.onChange();
    const insertAt = (start, end, text, selectFirstBox) => {
      ta.setRangeText(text, start, end, 'end');
      const boxAt = selectFirstBox ? text.indexOf(BOX) : -1;
      if (boxAt >= 0) ta.setSelectionRange(start + boxAt, start + boxAt + 1);
      changed();
    };
    const replaceSelection = (text) => insertAt(ta.selectionStart, ta.selectionEnd, text, true);

    // wrap the selection (or a placeholder) in a structure
    const wrap = (before, after) => {
      const s = ta.selectionStart, e = ta.selectionEnd;
      const inner = s === e ? BOX : ta.value.slice(s, e);
      ta.setRangeText(before + inner + after, s, e, 'end');
      if (inner === BOX) ta.setSelectionRange(s + before.length, s + before.length + 1);
      else {
        const end = s + before.length + inner.length + after.length;
        const box = ta.value.indexOf(BOX, s + before.length + inner.length);
        if (box >= 0 && box < end) ta.setSelectionRange(box, box + 1); else ta.setSelectionRange(end, end);
      }
      changed();
    };

    const jumpBox = (backward) => {
      const v = ta.value;
      let i = backward ? v.lastIndexOf(BOX, Math.max(0, ta.selectionStart - 1)) : v.indexOf(BOX, ta.selectionEnd);
      if (i < 0) i = backward ? v.lastIndexOf(BOX) : v.indexOf(BOX);
      if (i >= 0) { ta.setSelectionRange(i, i + 1); return true; }
      return false;
    };

    // Ctrl+Space: move past the closing bracket of the structure the caret is in
    const exitStructure = () => {
      const v = ta.value, pairs = { '{': '}', '(': ')', '[': ']' }, stack = [];
      for (let i = ta.selectionEnd; i < v.length; i++) {
        const c = v[i];
        if (pairs[c]) stack.push(pairs[c]);
        else if (c === '}' || c === ')' || c === ']') {
          if (stack.length) stack.pop();
          else { ta.setSelectionRange(i + 1, i + 1); return; }
        }
      }
      ta.setSelectionRange(v.length, v.length);
    };

    const openAlias = () => {
      const caret = ta.selectionStart;
      const open = ta.value.lastIndexOf(MARK, caret - 1);
      return open >= 0 && !/\s/.test(ta.value.slice(open + 1, caret));
    };

    // innermost unclosed bracket before the caret, if it opens a sub/superscript: _{ or ^(
    const scriptCloser = () => {
      const v = ta.value, close = { '{': '}', '(': ')', '[': ']' };
      let depth = 0;
      for (let i = ta.selectionStart - 1; i >= 0; i--) {
        const c = v[i];
        if (c === '}' || c === ')' || c === ']') depth++;
        else if (close[c]) {
          if (depth) { depth--; continue; }
          return (c === '{' && v[i - 1] === '_') || (c === '(' && v[i - 1] === '^') ? close[c] : null;
        }
      }
      return null;
    };

    // alias key pressed: open an alias, or close and resolve the open one
    const aliasKey = (literal) => {
      const caret = ta.selectionStart;
      const open = ta.value.lastIndexOf(MARK, caret - 1);
      const between = open >= 0 ? ta.value.slice(open + 1, caret) : null;
      if (open >= 0 && !/[\s]/.test(between)) {
        if (between === '' && literal) { insertAt(open, caret, literal, false); return; } // doubled key types it
        const value = ALIASES[between];
        if (value !== undefined) insertAt(open, caret, value, true);
        else { ta.setRangeText(between, open, caret, 'end'); changed(); }
        return;
      }
      ta.setRangeText(MARK, ta.selectionStart, ta.selectionEnd, 'end');
      changed();
    };

    // \name or bare name before the caret, completed by a non-letter
    const completeName = (cfg, trigger) => {
      const caret = ta.selectionStart;
      if (caret !== ta.selectionEnd) return false;
      const before = ta.value.slice(0, caret);
      if (cfg.namePrefix === '\\') {
        const m = /\\([A-Za-z]+)$/.exec(before);
        if (m && LATEX[m[1]] !== undefined) {
          const v = LATEX[m[1]];
          insertAt(caret - m[0].length, caret, v, v.includes(BOX));
          return true;
        }
      }
      if (cfg.bareNames && trigger !== '[') {
        const m = /(^|[^A-Za-z0-9\\$#])([A-Za-z]+)$/.exec(before);
        if (m && BARE[m[2]] !== undefined) {
          insertAt(caret - m[2].length, caret, BARE[m[2]], false);
          return true;
        }
      }
      return false;
    };

    ta.addEventListener('keydown', e => {
      const cfg = Object.assign({}, DEFAULTS, opts.config());
      const ctrl = e.ctrlKey || e.metaKey;

      // alias initiator: Esc, or a printable character such as ` or ;
      if (cfg.aliasKey && cfg.aliasKey !== 'off' && !ctrl && !e.altKey && e.key === cfg.aliasKey) {
        e.preventDefault();
        aliasKey(cfg.aliasKey.length === 1 ? cfg.aliasKey : null);
        return;
      }

      // Tab also closes an open alias
      if (e.key === 'Tab' && !ctrl && !e.altKey && cfg.aliasKey !== 'off' && openAlias()) {
        e.preventDefault();
        aliasKey(null);
        return;
      }

      // a non-letter ends a \name or bare name; the key itself still types normally
      const ender = !ctrl && !e.altKey && (e.key === 'Tab' || e.key === 'Enter' || (e.key.length === 1 && !/[A-Za-z]/.test(e.key)));
      const completed = ender && completeName(cfg, e.key);
      if (completed && e.key === 'Tab') { e.preventDefault(); return; }

      // Space leaves a subscript or superscript (MathLive-style) instead of typing a space
      if (e.key === ' ' && !ctrl && !e.altKey && !e.shiftKey && cfg.spaceExits && !openAlias() && scriptCloser()) {
        e.preventDefault();
        exitStructure();
        return;
      }
      if (completed) return;

      if (ctrl && !e.altKey) {
        // finish a pending \name first, so \rho then Ctrl+- gives ρ_{□}
        if (['-', '_', '6', '^', '/', '2', ' '].includes(e.key) || ['Minus', 'Digit6', 'Slash', 'Digit2', 'Space'].includes(e.code)) completeName(cfg, '_');
        if (e.key === '-' || e.key === '_' || e.code === 'Minus' || e.code === 'NumpadSubtract') { e.preventDefault(); wrap('_{', '}'); return; }
        if (e.key === '6' || e.key === '^' || e.code === 'Digit6') { e.preventDefault(); wrap('^(', ')'); return; }
        if (e.key === '/' || e.code === 'Slash') { e.preventDefault(); wrap('(', ')/(' + BOX + ')'); return; }
        if (e.key === '2' || e.code === 'Digit2') { e.preventDefault(); wrap('Sqrt[', ']'); return; }
        if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); exitStructure(); return; }
      }
      if (e.key === 'Tab' && !ctrl && !e.altKey) {
        e.preventDefault();
        if (!jumpBox(e.shiftKey)) exitStructure();
      }
    });

    return { replaceSelection, clean };
  }

  /** Every shortcut, for the searchable symbol list: [display, text, how-to-type] */
  function catalog(cfg) {
    cfg = Object.assign({}, DEFAULTS, cfg || {});
    const keyName = cfg.aliasKey === 'Escape' ? 'Esc' : cfg.aliasKey;
    const rows = [];
    const seen = new Map();
    const add = (value, how) => {
      const shown = value.includes(BOX) ? value.replace(/□/g, '·').replace(/\[.*$/, '[…]') : value;
      if (!seen.has(value)) { const r = [shown, value, []]; seen.set(value, r); rows.push(r); }
      seen.get(value)[2].push(how);
    };
    if (cfg.aliasKey !== 'off') Object.keys(ALIASES).forEach(k => add(ALIASES[k], `${keyName}${k}${keyName}`));
    if (cfg.namePrefix === '\\') Object.keys(LATEX).forEach(k => add(LATEX[k], '\\' + k));
    if (cfg.bareNames) Object.keys(BARE).forEach(k => add(BARE[k], k));
    return rows;
  }

  return { attach, clean, catalog, ALIASES, LATEX, BARE, DEFAULTS, BOX, MARK };
});
