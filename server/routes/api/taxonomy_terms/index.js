import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';

import { attributesFor } from '#lib/hsds-query.js';
import {
  EntitySchema,
  IdParamsSchema,
  PageSchema,
  PaginationQuerySchema,
  pageResponse,
  serializeTaxonomyTerm
} from '#models/hsds.js';

const QuerySchema = PaginationQuerySchema.extend({
  taxonomy_id: z.string().uuid().optional(),
  parent_id: z.string().uuid().optional(),
  top_only: z.stringbool().default(false)
});

export default async function (fastify) {
  fastify.get('/', {
    schema: {
      description: 'Paginated list of HSDS taxonomy terms.',
      querystring: QuerySchema,
      response: { [StatusCodes.OK]: PageSchema }
    }
  }, async (request, reply) => {
    const query = request.query;
    const where = {
      ...(query.taxonomy_id ? { taxonomyId: query.taxonomy_id } : {}),
      ...(query.parent_id ? { parentId: query.parent_id } : {}),
      ...(query.top_only ? { parentId: null } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
              { code: { contains: query.search, mode: 'insensitive' } }
            ]
          }
        : {})
    };
    const [total, records] = await fastify.prisma.$transaction([
      fastify.prisma.taxonomyTerm.count({ where }),
      fastify.prisma.taxonomyTerm.findMany({
        where,
        include: { taxonomyDetail: true },
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.per_page,
        take: query.per_page
      })
    ]);
    reply.setPaginationHeaders(query.page, query.per_page, total);
    return pageResponse({
      page: query.page,
      perPage: query.per_page,
      total,
      contents: records.map(serializeTaxonomyTerm)
    });
  });

  fastify.get('/:id', {
    schema: {
      description: 'HSDS taxonomy term by id.',
      params: IdParamsSchema,
      response: { [StatusCodes.OK]: EntitySchema }
    }
  }, async (request, reply) => {
    const term = await fastify.prisma.taxonomyTerm.findUnique({
      where: { id: request.params.id },
      include: { taxonomyDetail: true }
    });
    if (!term) return reply.code(StatusCodes.NOT_FOUND).send();
    const attributes = await attributesFor(fastify.prisma, 'taxonomy_term', term.id);
    return serializeTaxonomyTerm(term, { attributes });
  });
}
