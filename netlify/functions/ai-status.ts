import { handleAiStatus } from '../../server/aiHandlers.ts';

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

export const handler = async (event: { httpMethod?: string }) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: JSON_HEADERS, body: '' };
  }
  const result = handleAiStatus();
  return {
    statusCode: result.status,
    headers: JSON_HEADERS,
    body: JSON.stringify(result.data),
  };
};
