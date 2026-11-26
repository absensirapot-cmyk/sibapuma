import { handleRefineQuestion } from '../../server/aiHandlers.ts';

const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const handler = async (event: { httpMethod?: string; body?: string | null }) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: JSON_HEADERS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: JSON_HEADERS,
      body: JSON.stringify({ error: 'Method tidak diizinkan. Gunakan POST.' }),
    };
  }
  try {
    const body = event.body ? JSON.parse(event.body) : {};
    const result = await handleRefineQuestion(body);
    return {
      statusCode: result.status,
      headers: JSON_HEADERS,
      body: JSON.stringify(result.data),
    };
  } catch (err: any) {
    return {
      statusCode: 400,
      headers: JSON_HEADERS,
      body: JSON.stringify({ error: err?.message || 'Payload JSON tidak valid.' }),
    };
  }
};
