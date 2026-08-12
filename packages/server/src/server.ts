import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerArtifactCardApp } from './apps/card.js';
import { registerInscriptionApp } from './apps/inscription.js';
import { registerAdvancedSearch } from './tools/advanced_search.js';
import { registerCqpQuery } from './tools/cqp_query.js';
import { registerGetBibliography } from './tools/get_bibliography.js';
import { registerGetInscription } from './tools/get_inscription.js';
import { registerGetMetadata } from './tools/get_metadata.js';
import { registerResearchPaperPrompt } from './prompts/research_paper.js';
import { registerPing } from './tools/ping.js';
import { registerSearchEntity } from './tools/search_entity.js';

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'cdli-mcp',
    version: '0.1.0',
  });

  registerPing(server);
  registerAdvancedSearch(server);
  registerGetMetadata(server);
  registerGetInscription(server);
  registerGetBibliography(server);
  registerSearchEntity(server);
  registerCqpQuery(server);
  registerInscriptionApp(server);
  registerArtifactCardApp(server);
  registerResearchPaperPrompt(server);

  return server;
}
