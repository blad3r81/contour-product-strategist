import { route } from '../server/routes.js';

export default function handler(req, res) {
  return route(new URL(req.url, 'http://localhost').pathname.split('/').at(-1), req, res);
}
