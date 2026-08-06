import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';

const MetadataSchema = z.object({
  version: z.string(),
  profile: z.string(),
  openapi_url: z.string()
});

export default async function (fastify) {
  const metadata = async () => {
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    return {
      version: '3.2.3',
      profile: 'https://openreferral.org/',
      openapi_url: `${baseUrl}/api/openapi.json`
    };
  };

  fastify.get('', {
    schema: { description: 'Open Referral API metadata.', response: { [StatusCodes.OK]: MetadataSchema } }
  }, metadata);
  fastify.get('/', {
    schema: { hide: true, response: { [StatusCodes.OK]: MetadataSchema } }
  }, metadata);

  fastify.get('/openapi.json', {
    schema: { description: 'OpenAPI description for this server.' }
  }, async () => fastify.swagger());
}
