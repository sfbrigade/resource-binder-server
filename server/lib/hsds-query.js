export const locationInclude = {
  addresses: true,
  contacts: { include: { phones: { include: { languages: true } } } },
  phones: { include: { languages: true } },
  schedules: true,
  languages: true,
  accessibility: true
};

export const serviceInclude = {
  organization: true,
  program: true,
  serviceAtLocations: {
    include: {
      location: { include: locationInclude },
      contacts: { include: { phones: { include: { languages: true } } } },
      phones: { include: { languages: true } },
      schedules: true,
      serviceAreas: true
    }
  },
  phones: { include: { languages: true } },
  contacts: { include: { phones: { include: { languages: true } } } },
  schedules: true,
  serviceAreas: true,
  funding: true,
  languages: true,
  requiredDocuments: true,
  costOptions: true,
  capacities: { include: { unit: true } },
  additionalUrls: true
};

export const organizationInclude = {
  funding: true,
  contacts: { include: { phones: { include: { languages: true } } } },
  phones: { include: { languages: true } },
  locations: { include: locationInclude },
  programs: true,
  identifiers: true,
  additionalWebsites: true,
  services: true
};

export async function attributesForMany (prisma, linkEntity, linkIds) {
  const ids = [...new Set(linkIds.filter(Boolean))];
  const grouped = new Map(ids.map((id) => [id, []]));
  if (!ids.length) return grouped;
  const attributes = await prisma.attribute.findMany({
    where: { linkEntity, linkId: { in: ids } },
    include: { taxonomyTerm: { include: { taxonomyDetail: true } } },
    orderBy: { id: 'asc' }
  });
  for (const attribute of attributes) {
    grouped.get(attribute.linkId)?.push(attribute);
  }
  return grouped;
}

export async function attributesFor (prisma, linkEntity, linkId) {
  return (await attributesForMany(prisma, linkEntity, [linkId])).get(linkId) ?? [];
}

export function taxonomyTermParentWhere ({ topOnly = false, parentId } = {}) {
  if (topOnly && parentId) {
    return { AND: [{ parentId: null }, { parentId }] };
  }
  if (topOnly) return { parentId: null };
  if (parentId) return { parentId };
  return {};
}

export async function attributeLinkIds (prisma, linkEntity, { taxonomyId, taxonomyTermId }) {
  if (!taxonomyId && !taxonomyTermId) return undefined;
  const attributes = await prisma.attribute.findMany({
    where: {
      linkEntity,
      ...(taxonomyTermId ? { taxonomyTermId } : {}),
      ...(taxonomyId ? { taxonomyTerm: { taxonomyId } } : {})
    },
    select: { linkId: true }
  });
  return [...new Set(attributes.map(({ linkId }) => linkId))];
}
