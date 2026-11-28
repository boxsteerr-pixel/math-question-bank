import {normalizeMathInput} from './formatMath.js';

// All coefficients are reduced BigInt fractions. Limits bound both memory and CPU.
const MAX_TERMS = 160;
const MAX_STEPS = 12000;
const MAX_BITS = 1024;
const abs = n => n < 0n ? -n : n;
function gcdInt(a, b) {
  a = abs(a); b = abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}
function frac(n, d = 1n) {
  if (!d) throw Error('zero_denominator');
  if (d < 0n) { n = -n; d = -d; }
  const g = gcdInt(n, d);
  n /= g; d /= g;
  if (abs(n).toString(2).length > MAX_BITS || d.toString(2).length > MAX_BITS) throw Error('complexity');
  return [n, d];
}
const addR = (a, b) => frac(a[0] * b[1] + b[0] * a[1], a[1] * b[1]);
const mulR = (a, b) => frac(a[0] * b[0], a[1] * b[1]);
const divR = (a, b) => frac(a[0] * b[1], a[1] * b[0]);
const negR = a => [-a[0], a[1]];
const zero = () => new Map();
const constant = n => n[0] ? new Map([['', n]]) : zero();
const one = () => constant([1n, 1n]);
const variables = key => key ? key.split('*').map(part => {
  const [name, exponent] = part.split('^');
  return [name, exponent === undefined ? 1 : Number(exponent)];
}) : [];
function monomial(entries) {
  return [...entries].filter(([, n]) => n).sort(([a], [b]) => a.localeCompare(b))
    .map(([name, n]) => n === 1 ? name : name + '^' + n).join('*');
}
function combineKeys(a, b) {
  const entries = new Map(variables(a));
  for (const [name, n] of variables(b)) entries.set(name, (entries.get(name) || 0) + n);
  if ([...entries.values()].some(n => n > 32)) throw Error('complexity');
  return monomial(entries);
}
function addP(a, b) {
  const out = new Map(a);
  for (const [key, coefficient] of b) {
    const sum = addR(out.get(key) || [0n, 1n], coefficient);
    if (sum[0]) out.set(key, sum); else out.delete(key);
  }
  if (out.size > MAX_TERMS) throw Error('complexity');
  return out;
}
const negP = p => new Map([...p].map(([key, value]) => [key, negR(value)]));
function mulP(a, b, budget) {
  const out = zero();
  for (const [ka, va] of a) for (const [kb, vb] of b) {
    if (++budget.steps > MAX_STEPS) throw Error('complexity');
    const key = combineKeys(ka, kb);
    const value = addR(out.get(key) || [0n, 1n], mulR(va, vb));
    if (value[0]) out.set(key, value); else out.delete(key);
    if (out.size > MAX_TERMS) throw Error('complexity');
  }
  return out;
}
function powP(p, n, budget) {
  let result = one();
  while (n--) result = mulP(result, p, budget);
  return result;
}
function divideMonomial(a, b) {
  const entries = new Map(variables(a));
  for (const [name, power] of variables(b)) {
    const remaining = (entries.get(name) || 0) - power;
    if (remaining < 0) return null;
    entries.set(name, remaining);
  }
  return monomial(entries);
}
function leading(p) {
  return [...p].sort(([a], [b]) => {
    const degree = k => variables(k).reduce((total, [, n]) => total + n, 0);
    const difference = degree(b) - degree(a);
    if (difference) return difference;
    const left = new Map(variables(a)), right = new Map(variables(b));
    for (const name of [...new Set([...left.keys(), ...right.keys()])].sort()) {
      const power = (right.get(name) || 0) - (left.get(name) || 0);
      if (power) return power;
    }
    return 0;
  })[0];
}
function divideP(dividend, divisor, budget) {
  if (!divisor.size) throw Error('zero_denominator');
  let current = new Map(dividend);
  let rest = zero();
  let quotient = zero();
  const [dk, dc] = leading(divisor);
  while (current.size) {
    if (++budget.steps > MAX_STEPS) throw Error('complexity');
    const [key, coefficient] = leading(current);
    const quotientKey = divideMonomial(key, dk);
    if (quotientKey === null) {
      rest.set(key, coefficient); current.delete(key);
    } else {
      const term = new Map([[quotientKey, divR(coefficient, dc)]]);
      quotient = addP(quotient, term);
      current = addP(current, negP(mulP(term, divisor, budget)));
    }
  }
  return {quotient, rest};
}
const remainder = (dividend, divisor, budget) => divideP(dividend, divisor, budget).rest;
const scalar = p => !p.size || p.size === 1 && p.has('');
function rational(n, d = one(), domain = []) {
  if (!d.size) throw Error('zero_denominator');
  return {n, d, domain};
}
function combine(a, b, operator, budget) {
  const domain = [...a.domain, ...b.domain];
  if (operator === '+' || operator === '-') {
    const left = mulP(a.n, b.d, budget), right = mulP(b.n, a.d, budget);
    return rational(addP(left, operator === '+' ? right : negP(right)), mulP(a.d, b.d, budget), domain);
  }
  if (operator === '*') return rational(mulP(a.n, b.n, budget), mulP(a.d, b.d, budget), domain);
  if (!b.n.size) throw Error('divide_by_zero');
  return rational(mulP(a.n, b.d, budget), mulP(a.d, b.n, budget), [...domain, b.n]);
}

export function parseRational(input) {
  const source = normalizeMathInput(input).replace(/[·⋅]/g, '*').replace(/\s+/g, '');
  if (!source || source.length > 180) throw Error('length');
  if (/[^0-9a-zA-Z.+\-*/^()]/.test(source)) throw Error('character');
  const tokens = source.match(/(?:\d+(?:\.\d+)?|[a-zA-Z]|[+\-*/^()])/g) || [];
  if (tokens.join('') !== source || tokens.length > 150) throw Error('syntax');
  const budget = {steps: 0};
  let position = 0, depth = 0;
  const peek = () => tokens[position];
  function expression() {
    let result = product();
    while (peek() === '+' || peek() === '-') {
      const operator = tokens[position++];
      result = combine(result, product(), operator, budget);
    }
    return result;
  }
  function product() {
    let result = unary();
    let afterDivision = false;
    while (peek() === '*' || peek() === '/' || /^(?:[a-zA-Z]|\d|\()$/.test(peek() || '')) {
      const explicit = peek() === '*' || peek() === '/';
      const operator = explicit ? tokens[position++] : '*';
      if (!explicit && afterDivision) throw Error('ambiguous_division');
      result = combine(result, unary(), operator, budget);
      afterDivision = operator === '/';
    }
    return result;
  }
  function unary() {
    if (peek() === '+' || peek() === '-') {
      const op = tokens[position++];
      const value = unary();
      return op === '-' ? rational(negP(value.n), value.d, value.domain) : value;
    }
    let result;
    const token = tokens[position++];
    if (token === '(') {
      if (++depth > 20) throw Error('depth');
      result = expression();
      if (tokens[position++] !== ')') throw Error('bracket');
      depth--;
    } else if (/^\d/.test(token || '')) {
      const [whole, decimal = ''] = token.split('.');
      result = rational(constant(frac(BigInt(whole + decimal), 10n ** BigInt(decimal.length))));
    } else if (/^[a-zA-Z]$/.test(token || '')) {
      result = rational(new Map([[token.toLowerCase(), [1n, 1n]]]));
    } else throw Error('syntax');
    if (peek() === '^') {
      position++;
      let wrapped = false;
      if (peek() === '(') { wrapped = true; position++; }
      let sign = 1;
      if (peek() === '+' || peek() === '-') sign = tokens[position++] === '-' ? -1 : 1;
      const exponent = tokens[position++];
      if (!/^\d+$/.test(exponent || '') || Number(exponent) > 8) throw Error('exponent');
      if (wrapped && tokens[position++] !== ')') throw Error('bracket');
      const n = sign * Number(exponent);
      if (n < 0 && !result.n.size) throw Error('divide_by_zero');
      const domain = n < 0 ? [...result.domain, result.n] : result.domain;
      result = n < 0
        ? rational(powP(result.d, -n, budget), powP(result.n, -n, budget), domain)
        : rational(powP(result.n, n, budget), powP(result.d, n, budget), domain);
    }
    return result;
  }
  const result = expression();
  if (position !== tokens.length) throw Error('syntax');
  return result;
}

function sameRational(a, b, budget) {
  return !addP(mulP(a.n, b.d, budget), negP(mulP(b.n, a.d, budget))).size;
}
function domainSafe(original, student, budget) {
  const constraints = original.domain.filter(p => !scalar(p));
  for (const restriction of student.domain.filter(p => !scalar(p))) {
    let remaining = restriction;
    for (const originalConstraint of constraints) {
      // Repeated division proves every algebraic factor is already excluded.
      let product = one();
      for (let i = 0; i < 8; i++) product = mulP(product, originalConstraint, budget);
      if (!remainder(product, remaining, budget).size) { remaining = one(); break; }
    }
    if (!scalar(remaining)) {
      let product = one();
      for (const constraint of constraints) product = mulP(product, constraint, budget);
      product = powP(product, 8, budget);
      if (remainder(product, remaining, budget).size) return false;
    }
  }
  return true;
}
function simplest(value, input, budget) {
  if (value.domain.length > 1 || /\^\s*\(?\s*-/.test(input)) return null;
  const numeric = normalizeMathInput(input).replace(/\s/g, '').match(/^\(?([+-]?\d+)\)?\/\(?([+-]?\d+)\)?$/);
  if (numeric && gcdInt(BigInt(numeric[1]), BigInt(numeric[2])) > 1n) return false;
  const coefficients = [...value.n.values(), ...value.d.values()];
  if (coefficients.every(([, denominator]) => denominator === 1n) &&
      coefficients.reduce((factor, [numerator]) => gcdInt(factor, numerator), 0n) > 1n) return false;
  if (!value.n.size) return scalar(value.d) ? true : false;
  if (scalar(value.d)) return true;
  const names = new Set([...value.n.keys(), ...value.d.keys()].flatMap(k => variables(k).map(([name]) => name)));
  if (names.size > 1) {
    // A common monomial is conclusive; other multivariate factors need review.
    for (const name of names) {
      const has = p => [...p.keys()].every(k => variables(k).some(([v, power]) => v === name && power > 0));
      if (has(value.n) && has(value.d)) return false;
    }
    return null;
  }
  let a = value.n, b = value.d;
  while (b.size) [a, b] = [b, remainder(a, b, budget)];
  return scalar(a);
}

export function scoreRational(question, input) {
  try {
    if (question.answerConstraint != null && question.answerConstraint !== 'simplest_fraction') {
      return {correct:false, manualCheck:true, reason:'unsupported_answer_constraint'};
    }
    const budget = {steps: 0};
    const student = parseRational(input);
    const expected = parseRational(question.answer);
    const original = parseRational(question.originalExpression || question.answer);
    if (!sameRational(student, expected, budget)) return {correct: false, reason: 'not_equivalent'};
    if (!domainSafe(original, student, budget)) return {correct: false, manualCheck: true, reason: 'domain_unproved'};
    if (question.answerConstraint === 'simplest_fraction') {
      const simple = simplest(student, input, budget);
      if (simple === null) return {correct: false, manualCheck: true, reason: 'simplest_unproved'};
      if (!simple) return {correct: false, reason: 'not_simplest'};
    }
    return {correct: true};
  } catch (error) {
    return {correct: false, manualCheck: true, reason: error.message || 'syntax'};
  }
}

function exactNumber(input) {
  const result = parseRational(input);
  if (!scalar(result.n) || !scalar(result.d)) throw Error('not_numeric');
  const value = divR(result.n.get('') || [0n, 1n], result.d.get(''));
  return value[0] + '/' + value[1];
}

function evaluatePolynomial(poly, variable, value) {
  let sum = [0n, 1n];
  for (const [key, coefficient] of poly) {
    let term = coefficient;
    for (const [name, exponent] of variables(key)) {
      if (name !== variable) throw Error('parameter_equation');
      for (let i = 0; i < exponent; i++) term = mulR(term, value);
    }
    sum = addR(sum, term);
  }
  return sum;
}

function equationAccepts(question, encoded) {
  const [numerator, denominator] = encoded.split('/').map(BigInt);
  const value = frac(numerator, denominator);
  for (const side of [question.equationLeft, question.equationRight]) {
    const parsed = parseRational(side);
    if (parsed.domain.some(poly => !evaluatePolynomial(poly, question.conditionVariable, value)[0]) ||
        !evaluatePolynomial(parsed.d, question.conditionVariable, value)[0]) return false;
  }
  const left = parseRational(question.equationLeft), right = parseRational(question.equationRight);
  const budget = {steps:0};
  const difference = addP(mulP(left.n, right.d, budget), negP(mulP(right.n, left.d, budget)));
  return !evaluatePolynomial(difference, question.conditionVariable, value)[0];
}

function equationComplete(question, expected) {
  const left = parseRational(question.equationLeft), right = parseRational(question.equationRight);
  const budget = {steps:0};
  const difference = addP(mulP(left.n, right.d, budget), negP(mulP(right.n, left.d, budget)));
  if (!difference.size) return false;
  const names = new Set([...difference.keys()].flatMap(key => variables(key).map(([name]) => name)));
  if ([...names].some(name => name !== question.conditionVariable)) return false;
  const factors = [...left.domain, ...right.domain, left.d, right.d].filter(p => !scalar(p));
  for (const encoded of expected) {
    const [numerator, denominator] = encoded.split('/').map(BigInt);
    const root = constant(frac(-numerator, denominator));
    factors.push(addP(new Map([[question.conditionVariable,[1n,1n]]]), root));
  }
  let remaining = difference;
  for (const factor of factors) {
    while (!scalar(remaining)) {
      let a = remaining, b = factor;
      while (b.size) [a, b] = [b, remainder(a, b, budget)];
      if (scalar(a)) break;
      const division = divideP(remaining, a, budget);
      if (division.rest.size) throw Error('complexity');
      remaining = division.quotient;
    }
  }
  return scalar(remaining);
}

export function scoreConditions(question, input) {
  try {
    const variable = question.conditionVariable;
    if (!/^[a-z]$/.test(variable) || !Array.isArray(question.conditionValues)) throw Error('invalid_policy');
    let text = normalizeMathInput(input).replace(/\s+/g, '').replace(/[，、;]/g, ',');
    const exclude = question.answerType === 'rational_conditions';
    if (!exclude && /^(无解|空集|∅|\(\))$/.test(text)) text = '';
    if (exclude) {
      text = text.replaceAll('不等于', '≠').replaceAll('!=', '≠');
      const parts = text.split(/,|且|并且/).filter(Boolean);
      if (!parts.length || parts.some(part => !part.startsWith(variable + '≠'))) throw Error('condition_syntax');
      text = parts.map(part => part.slice(2)).join(',');
    } else {
      text = text.replace(/^\((.*)\)$/, '$1').replace(new RegExp(variable + '=', 'g'), '');
    }
    const values = text ? text.split(',').map(exactNumber) : [];
    const expected = question.conditionValues.map(exactNumber);
    if (question.answerType === 'rational_solutions') {
      if (typeof question.equationLeft !== 'string' || typeof question.equationRight !== 'string') throw Error('missing_equation');
      if (expected.some(value => !equationAccepts(question, value))) throw Error('invalid_solution_policy');
      if (!equationComplete(question, expected)) throw Error('solution_completeness_unproved');
      if (values.some(value => !equationAccepts(question, value))) return {correct:false, reason:'extraneous_solution'};
    }
    const unique = new Set(values), required = new Set(expected);
    return {correct: unique.size === required.size && [...unique].every(value => required.has(value))};
  } catch (error) {
    return {correct: false, manualCheck: true, reason: error.message || 'condition_syntax'};
  }
}
