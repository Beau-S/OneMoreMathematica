/*
 * keys.js — Mathematica-style keyboard input for the equation editor textarea.
 *
 *   Esc a Esc        → α   (Mathematica aliases; also templates like Esc int Esc)
 *   \alpha + Space   → α   (LaTeX-style names)
 *   Ctrl+-           → subscript   x_{□}
 *   Ctrl+6 / Ctrl+^  → superscript x^(□)
 *   Ctrl+/           → fraction    (□)/(□)
 *   Ctrl+2           → square root Sqrt[□]
 *   Ctrl+Space       → leave the current subscript/superscript/bracket
 *   Tab / Shift+Tab  → next / previous □ placeholder
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EqKeys = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const BOX = '□';
  const MARK = '⋮';

  // Mathematica escape aliases (Esc alias Esc)
  const ALIASES = {
    a: 'α', b: 'β', g: 'γ', d: 'δ', e: 'ϵ', ce: 'ε', z: 'ζ', h: 'η', et: 'η', q: 'θ', th: 'θ', cq: 'ϑ', cth: 'ϑ',
    i: 'ι', k: 'κ', l: 'λ', m: 'μ', n: 'ν', x: 'ξ', om: 'ο', p: 'π', r: 'ρ', s: 'σ', t: 'τ', u: 'υ',
    f: 'ϕ', ph: 'ϕ', j: 'φ', cph: 'φ', c: 'χ', ch: 'χ', y: 'ψ', ps: 'ψ', o: 'ω', w: 'ω',
    G: 'Γ', D: 'Δ', Q: 'Θ', Th: 'Θ', L: 'Λ', X: 'Ξ', P: 'Π', S: 'Σ', U: 'Υ', F: 'Φ', Ph: 'Φ',
    C: 'Χ', Ch: 'Χ', Y: 'Ψ', Ps: 'Ψ', O: 'Ω', W: 'Ω',
    inf: '∞', ee: 'ⅇ', ii: 'ⅈ', dd: 'ⅆ', pd: '∂', del: '∇', hb: 'ℏ', deg: '°', ell: 'ℓ',
    '->': '→', ':>': '⧴', '!=': '≠', '<=': '≤', '>=': '≥', '+-': '±', '-+': '∓', '~~': '≈', '===': '≡',
    el: '∈', '!el': '∉', '*': '×', '.': '·', prop: '∝', '&&': '∧', '||': '∨', '=>': '⇒', '<=>': '⇔',
    un: '∪', inter: '∩', sub: '⊂', sube: '⊆', cross: '⨯', ct: '⊗',
    // templates (□ = placeholder, Tab moves between them)
    int: 'Integrate[□, □]', dint: 'Integrate[□, {□, □, □}]', sum: 'Sum[□, {□, □, □}]',
    prod: 'Product[□, {□, □, □}]', lim: 'Limit[□, □ -> □]', sqrt: 'Sqrt[□]', frac: '(□)/(□)',
    dv: 'D[□, □]', pdv: 'D[□, □]', dv2: 'D[□, {□, 2}]', abs: 'Abs[□]', norm: 'Norm[□]',
    vec: 'OverVector[□]', hat: 'Hat[□]', bar: 'OverBar[□]', dot: 'OverDot[□]', ddot: 'OverDot[□, 2]',
    ket: 'Ket[□]', bra: 'Bra[□]', bk: 'BraKet[□, □]', comm: 'Commutator[□, □]',
    mat: '{{□, □}, {□, □}}', mat3: '{{□, □, □}, {□, □, □}, {□, □, □}}', pw: 'Piecewise[{{□, □}, {□, □}}]',
    exp: 'Exp[□]', ln: 'Log[□]', log: 'Log[□, □]', sin: 'Sin[□]', cos: 'Cos[□]', tan: 'Tan[□]'
  };

  // LaTeX-style names (\name followed by Space or Tab)
  const LATEX = {
    alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ϵ', varepsilon: 'ε', zeta: 'ζ', eta: 'η',
    theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', pi: 'π',
    rho: 'ρ', sigma: 'σ', tau: 'τ', upsilon: 'υ', phi: 'ϕ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
    Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ',
    Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω', infty: '∞', partial: '∂', nabla: '∇', hbar: 'ℏ', ell: 'ℓ',
    to: '→', rightarrow: '→', neq: '≠', ne: '≠', leq: '≤', le: '≤', geq: '≥', ge: '≥', pm: '±', mp: '∓',
    approx: '≈', equiv: '≡', in: '∈', notin: '∉', times: '×', cdot: '·', propto: '∝', land: '∧', lor: '∨',
    Rightarrow: '⇒', implies: '⇒', iff: '⇔', cup: '∪', cap: '∩', subset: '⊂', subseteq: '⊆', otimes: '⊗',
    circ: '°', int: 'Integrate[□, □]', sum: 'Sum[□, {□, □, □}]', prod: 'Product[□, {□, □, □}]',
    sqrt: 'Sqrt[□]', frac: '(□)/(□)', lim: 'Limit[□, □ -> □]', vec: 'OverVector[□]', hat: 'Hat[□]',
    bar: 'OverBar[□]', dot: 'OverDot[□]', ddot: 'OverDot[□, 2]'
  };

  /** Removes an unfinished Esc alias so the converter never sees it */
  function clean(text) {
    const i = text.lastIndexOf(MARK);
    if (i < 0) return text;
    const m = /^[^\s,\[\]{}()]*/.exec(text.slice(i + 1));
    return text.slice(0, i) + text.slice(i + 1 + m[0].length);
  }

  function attach(ta, opts) {
    opts = Object.assign({ onChange() {}, style: () => 'both' }, opts || {});
    let aliasStart = -1;

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
      let i = backward
        ? v.lastIndexOf(BOX, Math.max(0, ta.selectionStart - 1))
        : v.indexOf(BOX, ta.selectionEnd);
      if (i < 0) i = backward ? v.lastIndexOf(BOX) : v.indexOf(BOX);
      if (i >= 0) { ta.setSelectionRange(i, i + 1); return true; }
      return false;
    };

    // Ctrl+Space: move past the closing bracket of the structure the caret is in
    const exitStructure = () => {
      const v = ta.value;
      const pairs = { '{': '}', '(': ')', '[': ']' };
      const stack = [];
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

    const finishAlias = () => {
      const caret = ta.selectionStart;
      const start = ta.value.lastIndexOf(MARK, caret - 1);
      aliasStart = -1;
      if (start < 0) return false;
      const name = ta.value.slice(start + 1, caret);
      const value = ALIASES[name];
      if (value !== undefined) insertAt(start, caret, value, true);
      else { ta.setRangeText(name, start, caret, 'end'); changed(); }
      return true;
    };

    const tryLatex = (trailing) => {
      const caret = ta.selectionStart;
      if (caret !== ta.selectionEnd) return false;
      const m = /\\([A-Za-z]+)$/.exec(ta.value.slice(0, caret));
      if (!m || LATEX[m[1]] === undefined) return false;
      const value = LATEX[m[1]];
      // a symbol keeps the typed space so it doesn't fuse with the next name (πx)
      insertAt(caret - m[0].length, caret, value.includes(BOX) ? value : value + trailing, true);
      return true;
    };

    ta.addEventListener('keydown', e => {
      const style = opts.style();
      const mma = style !== 'latex', latex = style !== 'mathematica';
      const ctrl = e.ctrlKey || e.metaKey;

      if (e.key === 'Escape' && mma && !ctrl && !e.altKey) {
        e.preventDefault();
        if (aliasStart >= 0 && ta.value.lastIndexOf(MARK, ta.selectionStart - 1) >= 0) finishAlias();
        else { ta.setRangeText(MARK, ta.selectionStart, ta.selectionEnd, 'end'); aliasStart = ta.selectionStart; changed(); }
        return;
      }
      if ((e.key === ' ' || e.key === 'Tab') && !ctrl && latex && tryLatex(e.key === ' ' ? ' ' : '')) { e.preventDefault(); return; }

      if (ctrl && !e.altKey) {
        // Ctrl+- (and Ctrl+_): subscript; Ctrl+6 / Ctrl+^: superscript
        if (e.key === '-' || e.key === '_' || e.code === 'Minus' || e.code === 'NumpadSubtract') { e.preventDefault(); wrap('_{', '}'); return; }
        if (e.key === '6' || e.key === '^' || e.code === 'Digit6') { e.preventDefault(); wrap('^(', ')'); return; }
        if (e.key === '/' || e.code === 'Slash') { e.preventDefault(); wrap('(', ')/(' + BOX + ')'); return; }
        if (e.key === '2' || e.code === 'Digit2') { e.preventDefault(); wrap('Sqrt[', ']'); return; }
        if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); exitStructure(); return; }
      }
      if (e.key === 'Tab' && !ctrl && !e.altKey) {
        if (jumpBox(e.shiftKey)) { e.preventDefault(); return; }
        // no placeholder: behave like Ctrl+Space instead of leaving the text box
        e.preventDefault(); exitStructure();
      }
    });

    return { replaceSelection, clean };
  }

  return { attach, clean, ALIASES, LATEX, BOX, MARK };
});
