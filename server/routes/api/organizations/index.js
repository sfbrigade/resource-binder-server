import { StatusCodes } from 'http-status-codes';
import { z } from 'zod';

import { attributeLinkIds, attributesFor, attributesForMany, organizationInclude, serviceInclude } from '#lib/hsds-query.js';
import {
  EntitySchema,
  IdParamsSchema,
  PageSchema,
  PaginationQuerySchema,
  pageResponse,
  serializeOrganization
} from '#models/hsds.js';

const QuerySchema = PaginationQuerySchema.extend({
  taxonomy_term_id: z.string().uuid().optional(),
  taxonomy_id: z.string().uuid().optional(),
  full: z.stringbool().default(false),
  full_service: z.stringbool().default(false)
});

async function serviceAttributesFor (prisma, organizations, fullService) {
  if (!fullService) return undefined;
  const serviceIds = organizations.flatMap((organization) => organization.services?.map(({ id }) => id) ?? []);
  return attributesForMany(prisma, 'service', serviceIds);
}

export default async function (fastify) {
  fastify.get('/', {
    schema: {
      description: 'Paginated list of HSDS organizations.',
      querystring: QuerySchema,
      response: { [StatusCodes.OK]: PageSchema }
    }
  }, async (request, reply) => {
    const query = request.query;
    const full = query.full || query.full_service;
    const linkIds = await attributeLinkIds(fastify.prisma, 'organization', {
      taxonomyId: query.taxonomy_id,
      taxonomyTermId: query.taxonomy_term_id
    });
    const where = {
      ...(linkIds ? { id: { in: linkIds } } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { alternateName: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } }
            ]
          }
        : {})
    };
    const include = full
      ? { ...organizationInclude, services: query.full_service ? { include: serviceInclude } : true }
      : undefined;
    const [total, records] = await fastify.prisma.$transaction([
      fastify.prisma.organization.count({ where }),
      fastify.prisma.organization.findMany({
        where,
        include,
        orderBy: [{ name: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.per_page,
        take: query.per_page
      })
    ]);
    const attributesByOrg = full
      ? await attributesForMany(fastify.prisma, 'organization', records.map(({ id }) => id))
      : undefined;
    const serviceAttributes = await serviceAttributesFor(fastify.prisma, records, query.full_service);
    reply.setPaginationHeaders(query.page, query.per_page, total);
    return pageResponse({
      page: query.page,
      perPage: query.per_page,
      total,
      contents: records.map((organization) => serializeOrganization(organization, {
        full,
        fullService: query.full_service,
        attributes: attributesByOrg?.get(organization.id),
        serviceAttributes
      }))
    });
  });

  fastify.get('/:id', {
    schema: {
      description: 'Fully nested HSDS organization.',
      params: IdParamsSchema,
      querystring: z.object({ full_service: z.stringbool().default(false) }),
      response: { [StatusCodes.OK]: EntitySchema }
    }
  }, async (request, reply) => {
    const organization = await fastify.prisma.organization.findUnique({
      where: { id: request.params.id },
      include: {
        ...organizationInclude,
        services: request.query.full_service ? { include: serviceInclude } : true
      }
    });
    if (!organization) return reply.code(StatusCodes.NOT_FOUND).send();
    const attributes = await attributesFor(fastify.prisma, 'organization', organization.id);
    const serviceAttributes = await serviceAttributesFor(fastify.prisma, [organization], request.query.full_service);
    return serializeOrganization(organization, {
      full: true,
      fullService: request.query.full_service,
      attributes,
      serviceAttributes
    });
  });
}
