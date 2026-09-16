import { StatusCodes } from 'http-status-codes';

import {
  EntitySchema,
  IdParamsSchema,
  PageSchema,
  PaginationQuerySchema,
  pageResponse,
  serializeTaxonomy
} from '#models/hsds.js';

export default async function (fastify) {
  fastify.get('/', {
    schema: {
      description: 'Paginated list of HSDS taxonomies.',
      querystring: PaginationQuerySchema,
      response: { [StatusCodes.OK]: PageSchema }
    }
  }, async (request, reply) => {
    const query = request.query;
    const where = query.search
      ? {
          OR: [
            { name: { contains: query.search, mode: 'insensitive' } },
            { description: { contains: query.search, mode: 'insensitive' } }
          ]
        }
      : {};
    const [total, records] = await fastify.prisma.$transaction([
      fastify.prisma.taxonomy.count({ where }),
      fastify.prisma.taxonomy.findMany({
        where,
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
      contents: records.map(serializeTaxonomy)
    });
  });

  fastify.get('/:id', {
    schema: {
      description: 'HSDS taxonomy by id.',
      params: IdParamsSchema,
      response: { [StatusCodes.OK]: EntitySchema }
    }
  }, async (request, reply) => {
    const taxonomy = await fastify.prisma.taxonomy.findUnique({ where: { id: request.params.id } });
    if (!taxonomy) return reply.code(StatusCodes.NOT_FOUND).send();
    return serializeTaxonomy(taxonomy);
  });
}
