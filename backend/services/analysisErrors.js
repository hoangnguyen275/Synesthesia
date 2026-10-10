function getAnalysisError(error) {
  const status = Number(error.status || error.error?.code);
  const message = typeof error.message === 'string' ? error.message : '';
  if (/Base64|image type|5 MB/.test(message)) {
    return { status: 400, code: 'INVALID_IMAGE', error: message };
  }
  if (message === 'Gemini API key is not configured.') {
    return { status: 503, code: 'GEMINI_NOT_CONFIGURED', error: 'LLM API key is not configured. Set GEMINI_API_KEY in backend/.env and restart the backend.' };
  }
  if (status === 401 || status === 403 || /API_KEY_INVALID|API key not valid|API key expired|API_KEY_SERVICE_BLOCKED/i.test(message)) {
    return { status: 502, code: 'GEMINI_AUTH_FAILED', error: 'LLM rejected the API key or its permissions. Check GEMINI_API_KEY and its API restrictions in the provider dashboard, then restart the backend.' };
  }
  if (status === 429) {
    return { status: 429, code: 'GEMINI_RATE_LIMIT', error: 'LLM quota or rate limit reached. Wait and retry, or check the project quota in the provider dashboard.' };
  }
  if (status === 404) {
    return { status: 502, code: 'GEMINI_MODEL_UNAVAILABLE', error: 'The configured LLM model is unavailable. Check the backend model configuration.' };
  }
  if (status === 400) {
    return { status: 502, code: 'GEMINI_REQUEST_REJECTED', error: 'LLM rejected the image analysis request. Try retaking the photo; the backend terminal contains the rejection reason.' };
  }
  if ([500, 502, 503, 504].includes(status)) {
    return { status: 502, code: 'GEMINI_UNAVAILABLE', error: 'LLM is temporarily unavailable. Please try analyzing the photo again shortly.' };
  }
  if (error.name === 'SyntaxError' || message === 'Gemini returned an empty response.') {
    return { status: 502, code: 'GEMINI_INVALID_RESPONSE', error: 'LLM did not return a usable analysis. Please try analyzing the photo again.' };
  }
  if (error.name === 'AbortError' || error.name === 'TimeoutError' || /fetch failed|ECONNRESET|ETIMEDOUT|ENOTFOUND/i.test(message)) {
    return { status: 502, code: 'GEMINI_CONNECTION_FAILED', error: 'The backend could not connect to LLM. Check the computer’s internet connection and try again.' };
  }
  return { status: 502, code: 'ANALYSIS_FAILED', error: 'Unable to analyze the image or video. Check the backend terminal for the LLM analysis error and try again.' };
}

function safeDiagnostic(error, apiKey) {
  let message = String(error.message || error.name || 'Unknown analysis error');
  if (apiKey) message = message.split(apiKey).join('[REDACTED]');
  return message.replace(/AIza[\w-]+/g, '[REDACTED]')
    .replace(/([?&](?:key|api_key)=)[^&\s"']+/gi, '$1[REDACTED]')
    .replace(/[A-Za-z0-9+/]{100,}={0,2}/g, '[IMAGE DATA REDACTED]').slice(0, 1500);
}

module.exports = { getAnalysisError, safeDiagnostic };
