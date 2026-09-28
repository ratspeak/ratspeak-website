import { getVercelOidcToken } from '@vercel/oidc';
import { createRsnodeBetaHandler } from '../lib/rsnode-beta.js';

// Node's Web Standard handler preserves the shared Request/Response API while
// the official helper resolves Vercel's rotating identity from request context.
export default {
  fetch: createRsnodeBetaHandler({ getOidcToken: () => getVercelOidcToken() })
};
