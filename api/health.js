import { handleHealthRequest } from '../src/server.js';

export default async function handler(req, res) {
  return handleHealthRequest(req, res);
}
