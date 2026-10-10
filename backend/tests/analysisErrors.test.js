const { test } = require('node:test');
const assert = require('node:assert/strict');
const { getAnalysisError, safeDiagnostic } = require('../services/analysisErrors');

test('analysis errors distinguish configuration, permissions, quota, and service outages', () => {
  assert.equal(getAnalysisError(new Error('Gemini API key is not configured.')).code, 'GEMINI_NOT_CONFIGURED');
  assert.equal(getAnalysisError({ status: 400, message: 'API_KEY_INVALID: API key not valid' }).code, 'GEMINI_AUTH_FAILED');
  assert.equal(getAnalysisError({ status: 403 }).code, 'GEMINI_AUTH_FAILED');
  assert.equal(getAnalysisError({ status: '429' }).status, 429);
  assert.equal(getAnalysisError({ status: 404 }).code, 'GEMINI_MODEL_UNAVAILABLE');
  assert.equal(getAnalysisError({ status: 503 }).code, 'GEMINI_UNAVAILABLE');
  assert.equal(getAnalysisError({ status: 400, message: 'Unable to process input image' }).code, 'GEMINI_REQUEST_REJECTED');
});

test('image validation, unusable output and network failures have actionable errors', () => {
  assert.equal(getAnalysisError(new Error('Image exceeds the 5 MB limit.')).status, 400);
  assert.equal(getAnalysisError(new SyntaxError('Invalid JSON')).code, 'GEMINI_INVALID_RESPONSE');
  assert.equal(getAnalysisError(new Error('Gemini returned an empty response.')).code, 'GEMINI_INVALID_RESPONSE');
  assert.equal(getAnalysisError(new Error('fetch failed')).code, 'GEMINI_CONNECTION_FAILED');
});

test('backend diagnostics redact API keys and long image data', () => {
  const message = 'secret-key https://example.com?key=secret-key ' + 'a'.repeat(200);
  const result = safeDiagnostic({ message }, 'secret-key');
  assert.ok(!result.includes('secret-key'));
  assert.ok(!result.includes('a'.repeat(200)));
  assert.ok(result.includes('[REDACTED]'));
});
