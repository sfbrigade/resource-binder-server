import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';

const MetadataSchema = z.object({
  version: z.string(),
  profile: z.string(),
  openapi_url: z.string(),
  description: z.string(),
  data_guide: z.string()
});

export const HSDS_DATA_GUIDE_URL = 'https://github.com/sfbrigade/resource-binder-server/blob/main/docs/sheltertech-hsds-profile.md';

export function apiMetadata (baseUrl = process.env.BASE_URL || 'http://localhost:3000') {
  return {
    version: '3.2.3',
    profile: HSDS_DATA_GUIDE_URL,
    openapi_url: `${baseUrl}/api/openapi.json`,
    description: 'ShelterTech directory data converted to the Resource Binder HSDS 3.2.3 profile.',
    data_guide: HSDS_DATA_GUIDE_URL
  };
}

export default async function (fastify) {
  const metadata = async () => apiMetadata();

  fastify.get('/', {
    schema: { description: 'Open Referral API metadata.', response: { [StatusCodes.OK]: MetadataSchema } }
  }, metadata);

  fastify.get('/openapi.json', {
    schema: { description: 'OpenAPI description for this server.' }
  }, async () => fastify.swagger());
}
