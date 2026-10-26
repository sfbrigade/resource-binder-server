import { useEffect, useState } from 'react';
import { Alert, Button, Checkbox, Fieldset, Stack, Text } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import Api from '../Api';

function UserRoleForm ({ user }) {
  const queryClient = useQueryClient();
  const [isAdmin, setIsAdmin] = useState(user.isAdmin);

  useEffect(() => setIsAdmin(user.isAdmin), [user.id, user.isAdmin]);

  const mutation = useMutation({
    mutationFn: () => Api.users.setRole(user.id, isAdmin ? 'admin' : 'user'),
    onSuccess: async (response) => {
      await queryClient.cancelQueries({ queryKey: ['users'] });
      queryClient.setQueryData(['users', user.id], response);
      await queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });

  function onSubmit (event) {
    event.preventDefault();
    mutation.mutate();
  }

  return (
    <form onSubmit={onSubmit}>
      <Fieldset legend='Administrator access' disabled={mutation.isPending}>
        <Stack>
          <Text>Email verification: {user.emailVerified ? 'Verified' : 'Pending'}</Text>
          {!user.emailVerified && <Alert>This user must verify their email before becoming an administrator.</Alert>}
          {mutation.error && <Alert color='red'>{mutation.error._form || 'Unable to update administrator access. Please try again.'}</Alert>}
          {mutation.isSuccess && <Alert>Administrator access has been updated.</Alert>}
          <Checkbox
            label='Is an Administrator?'
            checked={isAdmin}
            disabled={!user.emailVerified && !user.isAdmin}
            onChange={(event) => {
              setIsAdmin(event.currentTarget.checked);
              mutation.reset();
            }}
          />
          <Button type='submit' disabled={isAdmin === user.isAdmin || (isAdmin && !user.emailVerified)}>
            Save administrator access
          </Button>
        </Stack>
      </Fieldset>
    </form>
  );
}

export default UserRoleForm;
