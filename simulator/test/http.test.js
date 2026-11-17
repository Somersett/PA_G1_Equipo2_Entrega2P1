import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError, errorHandler, isDatabaseUnavailable } from '../src/http.js';

function fakeResponse() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    set(name, value) {
      this.headers[name] = value;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

const request = { method: 'POST', originalUrl: '/members' };

test('los errores de conexión con PostgreSQL se reconocen como base de datos no disponible', () => {
  assert.equal(isDatabaseUnavailable(Object.assign(new Error('connect ECONNREFUSED 172.18.0.2:5432'), { code: 'ECONNREFUSED' })), true);
  assert.equal(isDatabaseUnavailable(new Error('timeout exceeded when trying to connect')), true);
  assert.equal(isDatabaseUnavailable(new Error('Connection terminated unexpectedly')), true);
  assert.equal(isDatabaseUnavailable(Object.assign(new Error('terminating connection due to administrator command'), { code: '57P01' })), true);
  assert.equal(isDatabaseUnavailable(Object.assign(new Error('connection failure'), { code: '08006' })), true);
  assert.equal(isDatabaseUnavailable(Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' })), true);
});

test('una violación de restricción o un bug no se confunden con una caída de la base', () => {
  assert.equal(isDatabaseUnavailable(Object.assign(new Error('duplicate key'), { code: '23505' })), false);
  assert.equal(isDatabaseUnavailable(new TypeError("Cannot read properties of undefined (reading 'id')")), false);
  assert.equal(isDatabaseUnavailable(null), false);
});

test('con la base caída se responde 503 DATABASE_UNAVAILABLE, no 500', () => {
  const res = fakeResponse();
  errorHandler(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' }), request, res);
  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, 'DATABASE_UNAVAILABLE');
  assert.equal(res.headers['Retry-After'], '5');
});

test('los rechazos del dominio conservan su código y estado', () => {
  const res = fakeResponse();
  errorHandler(new ApiError(409, 'DOCUMENT_ALREADY_REGISTERED', 'Ya existe.'), request, res);
  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, { code: 'DOCUMENT_ALREADY_REGISTERED', message: 'Ya existe.' });
});
