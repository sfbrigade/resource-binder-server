import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';

import { locationInclude } from '#lib/hsds-query.js';
import {
  EntitySchema,
  IdParamsSchema,
  PageSchema,
  PaginationQuerySchema,
  pageResponse,
  serializeServiceAtLocation
} from '#models/hsds.js';

const QuerySchema = PaginationQuerySchema.extend({
  organization_id: z.string().uuid().optional(),
  modified_after: z.coerce.date().optional(),
  full: z.stringbool().default(false)
});

const detailInclude = {
  service: true,
  location: { include: locationInclude },
  contacts: { include: { phones: { include: { languages: true } } } },
  phones: { include: { languages: true } },
  schedules: true,
  serviceAreas: true
};

export default async function (fastify) {
  fastify.get('/', {
    schema: {
      description: 'Paginated list of HSDS service-at-location records.',
      querystring: QuerySchema,
      response: { [StatusCodes.OK]: PageSchema }
    }
  }, async (request, reply) => {
    const query = request.query;
    const where = {
      ...(query.organization_id || query.modified_after
        ? {
            service: {
              ...(query.organization_id ? { organizationId: query.organization_id } : {}),
              ...(query.modified_after ? { lastModified: { gte: query.modified_after } } : {})
            }
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { description: { contains: query.search, mode: 'insensitive' } },
              { service: { name: { contains: query.search, mode: 'insensitive' } } },
              { location: { name: { contains: query.search, mode: 'insensitive' } } }
            ]
          }
        : {})
    };
    const [total, records] = await fastify.prisma.$transaction([
      fastify.prisma.serviceAtLocation.count({ where }),
      fastify.prisma.serviceAtLocation.findMany({
        where,
        include: query.full ? detailInclude : undefined,
        orderBy: { id: 'asc' },
        skip: (query.page - 1) * query.per_page,
        take: query.per_page
      })
    ]);
    reply.setPaginationHeaders(query.page, query.per_page, total);
    return pageResponse({
      page: query.page,
      perPage: query.per_page,
      total,
      contents: records.map((record) => serializeServiceAtLocation(record, { full: query.full }))
    });
  });

  fastify.get('/:id', {
    schema: {
      description: 'Fully nested HSDS service-at-location record.',
      params: IdParamsSchema,
      response: { [StatusCodes.OK]: EntitySchema }
    }
  }, async (request, reply) => {
    const record = await fastify.prisma.serviceAtLocation.findUnique({
      where: { id: request.params.id },
      include: detailInclude
    });
    if (!record) return reply.code(StatusCodes.NOT_FOUND).send();
    return serializeServiceAtLocation(record);
  });
}
