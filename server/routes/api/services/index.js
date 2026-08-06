import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';

import { attributeLinkIds, attributesFor, serviceInclude } from '#lib/hsds-query.js';
import {
  EntitySchema,
  IdParamsSchema,
  PageSchema,
  PaginationQuerySchema,
  pageResponse,
  serializeService
} from '#models/hsds.js';

const QuerySchema = PaginationQuerySchema.extend({
  taxonomy_term_id: z.string().uuid().optional(),
  taxonomy_id: z.string().uuid().optional(),
  organization_id: z.string().uuid().optional(),
  modified_after: z.coerce.date().optional(),
  minimal: z.stringbool().default(false),
  full: z.stringbool().default(false)
});

export default async function (fastify) {
  fastify.get('/', {
    schema: {
      description: 'Paginated list of HSDS services.',
      querystring: QuerySchema,
      response: { [StatusCodes.OK]: PageSchema }
    }
  }, async (request, reply) => {
    const query = request.query;
    const linkIds = await attributeLinkIds(fastify.prisma, 'service', {
      taxonomyId: query.taxonomy_id,
      taxonomyTermId: query.taxonomy_term_id
    });
    const where = {
      ...(query.organization_id ? { organizationId: query.organization_id } : {}),
      ...(query.modified_after ? { lastModified: { gte: query.modified_after } } : {}),
      ...(linkIds ? { id: { in: linkIds } } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { alternateName: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
              { organization: { name: { contains: query.search, mode: 'insensitive' } } }
            ]
          }
        : {})
    };
    const [total, records] = await fastify.prisma.$transaction([
      fastify.prisma.service.count({ where }),
      fastify.prisma.service.findMany({
        where,
        orderBy: [{ lastModified: 'desc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.per_page,
        take: query.per_page,
        include: query.full ? serviceInclude : undefined
      })
    ]);
    reply.setPaginationHeaders(query.page, query.per_page, total);
    const contents = await Promise.all(records.map(async (service) => {
      if (query.minimal) {
        return { id: service.id, last_modified: service.lastModified?.toISOString() };
      }
      const attributes = query.full ? await attributesFor(fastify.prisma, 'service', service.id) : undefined;
      return serializeService(service, { full: query.full, attributes });
    }));
    return pageResponse({ page: query.page, perPage: query.per_page, total, contents });
  });

  fastify.get('/:id', {
    schema: {
      description: 'Fully nested HSDS service.',
      params: IdParamsSchema,
      response: { [StatusCodes.OK]: EntitySchema }
    }
  }, async (request, reply) => {
    const service = await fastify.prisma.service.findUnique({
      where: { id: request.params.id },
      include: serviceInclude
    });
    if (!service) return reply.code(StatusCodes.NOT_FOUND).send();
    const attributes = await attributesFor(fastify.prisma, 'service', service.id);
    return serializeService(service, { full: true, attributes });
  });
}
