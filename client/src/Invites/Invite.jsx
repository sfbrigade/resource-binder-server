import { useNavigate, useParams, useSearchParams } from 'react-router';
import { Box, Container, Stack, Title } from '@mantine/core';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Head } from '@unhead/react';

import Api from '../Api';
import { authClient } from '../auth-client';
import RegistrationForm from '../RegistrationForm';

function Invite () {
  const navigate = useNavigate();
  const params = useParams();
  const [searchParams] = useSearchParams();
  const inviteId = params.inviteId ?? searchParams.get('inviteId');

  const { data: invite, error } = useQuery({
    queryKey: ['invite', inviteId],
    enabled: !!inviteId,
    retry: false,
    queryFn: async () => {
      const response = await Api.invites.get(inviteId);
      return response.data;
    },
  });

  const onSubmitMutation = useMutation({
    mutationFn: (values) => authClient.signUp.email({ ...values, name: `${values.firstName} ${values.lastName}`, inviteId }),
    onSuccess: () => navigate('/login', { state: { flash: 'Check your email to verify your account before signing in.' } }),
    onError: () => window.scrollTo(0, 0),
  });

  return (
    <>
      <Head>
        <title>You&apos;re Invited</title>
      </Head>
      <Container>
        <Title mb='md'>You&apos;re Invited</Title>
        <Stack>
          {(!inviteId || error) && <Box>This invitation is invalid or no longer available.</Box>}
          {invite?.acceptedAt && <Box>This invite has already been accepted.</Box>}
          {invite?.revokedAt && <Box>This invite is no longer available.</Box>}
          {invite && invite.acceptedAt === null && invite.revokedAt === null && (
            <RegistrationForm onSubmitMutation={onSubmitMutation} />
          )}
        </Stack>
      </Container>
    </>
  );
}
export default Invite;
