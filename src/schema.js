'use strict';

// A deliberately small JSON Schema validator: exactly the keywords the verb schemas use, so
// there is no library whose defaults could quietly accept an extra field. `description` is an
// annotation and is ignored. Any other keyword in a schema is a programming error.
const KEYWORDS = new Set([
  'type',
  'properties',
  'required',
  'additionalProperties',
  'items',
  'enum',
  'minimum',
  'pattern',
  'description',
]);

// Field names that would let a caller set money or status. Refused like any unknown field, with
// a message that says where those values really come from.
const MONEY_OR_STATUS = /price|cost|total|discount|markup|margin|rate|amount|status|tax/i;

function describeType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (Number.isInteger(value)) return 'integer';
  return typeof value;
}

function typeMatches(type, value) {
  switch (type) {
    case 'object':
      return value !== null && typeof value === 'object' && !Array.isArray(value);
    case 'array':
      return Array.isArray(value);
    case 'string':
      return typeof value === 'string';
    case 'integer':
      return Number.isInteger(value);
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'boolean':
      return typeof value === 'boolean';
    default:
      throw new Error(`schema uses unsupported type "${type}"`);
  }
}

function unknownFieldMessage(path, verb) {
  const field = path.split(/[.[]/).pop().replace(/]$/, '');
  const base = `"${path}" is not a field of ${verb}; nothing was changed.`;
  if (MONEY_OR_STATUS.test(field)) {
    return `${base} Prices, totals and discounts come only from the owner's price list, and a draft's status changes only when the owner taps a button on screen.`;
  }
  return `${base} Send only the fields the tool describes.`;
}

const join = (path, key) => (path ? `${path}.${key}` : key);
const label = (path) => path || '(arguments)';

// Returns the first violation as { path, message }, or null when the value is valid. Paths name
// the field the caller actually wrote: "unit_price", "lines[0].price".
function check(schema, value, path, verb) {
  for (const key of Object.keys(schema)) {
    if (!KEYWORDS.has(key)) throw new Error(`schema for ${verb} uses unsupported keyword "${key}"`);
  }
  const at = label(path);
  if (schema.type && !typeMatches(schema.type, value)) {
    const want = schema.type === 'integer' ? 'a whole number' : `${schema.type === 'object' || schema.type === 'array' ? 'an' : 'a'} ${schema.type}`;
    return { path: at, message: `"${at}" must be ${want}, not ${describeType(value)}.` };
  }
  if (schema.enum && !schema.enum.includes(value)) {
    return { path: at, message: `"${at}" must be one of ${schema.enum.map((v) => JSON.stringify(v)).join(', ')}.` };
  }
  if (schema.minimum !== undefined && typeof value === 'number' && value < schema.minimum) {
    return { path: at, message: `"${at}" must be at least ${schema.minimum}.` };
  }
  if (schema.pattern !== undefined && typeof value === 'string' && !new RegExp(schema.pattern).test(value)) {
    return { path: at, message: `"${at}" is empty or not in the expected form.` };
  }
  if (schema.type === 'object') {
    const props = schema.properties || {};
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(props, key)) {
          const field = join(path, key);
          return { path: field, message: unknownFieldMessage(field, verb) };
        }
      }
    }
    for (const key of schema.required || []) {
      if (value[key] === undefined) {
        const field = join(path, key);
        return { path: field, message: `"${field}" is required.` };
      }
    }
    for (const [key, sub] of Object.entries(props)) {
      if (value[key] === undefined) continue;
      const found = check(sub, value[key], join(path, key), verb);
      if (found) return found;
    }
  }
  if (schema.type === 'array' && schema.items) {
    for (let i = 0; i < value.length; i += 1) {
      const found = check(schema.items, value[i], `${path}[${i}]`, verb);
      if (found) return found;
    }
  }
  return null;
}

function validate(schema, value, verb) {
  return check(schema, value, '', verb);
}

// Every object level of a schema, for the test that walks them all.
function objectLevels(schema, path = '') {
  const out = [];
  if (schema.type === 'object') {
    out.push({ path: path || '(root)', schema });
    for (const [key, sub] of Object.entries(schema.properties || {})) out.push(...objectLevels(sub, `${path}.${key}`));
  }
  if (schema.type === 'array' && schema.items) out.push(...objectLevels(schema.items, `${path}[]`));
  return out;
}

module.exports = { validate, objectLevels, KEYWORDS };
