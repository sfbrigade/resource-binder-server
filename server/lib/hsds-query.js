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

export async function attributesFor (prisma, linkEntity, linkId) {
  return prisma.attribute.findMany({
    where: { linkEntity, linkId },
    include: { taxonomyTerm: { include: { taxonomyDetail: true } } },
    orderBy: { id: 'asc' }
  });
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
