import { handleCultureRequest } from '../src/server.js';

export default async function handler(req, res) {
  return handleCultureRequest(req, res);
}
